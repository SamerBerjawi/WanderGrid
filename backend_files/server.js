
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const FLIGHT_CACHE_TTL_MS = 5 * 60 * 1000;
const API_CACHE_TTL_MS = Number(process.env.API_CACHE_TTL_MS || 5_000);
const GLOBAL_DATA_REFRESH_MS = Number(process.env.GLOBAL_DATA_REFRESH_MS || 7 * 24 * 60 * 60 * 1000);
const GEOCODE_CACHE_TTL_MS = Number(process.env.GEOCODE_CACHE_TTL_MS || 30 * 24 * 60 * 60 * 1000);
const EXTERNAL_FETCH_TIMEOUT_MS = Number(process.env.EXTERNAL_FETCH_TIMEOUT_MS || 4_000);
const VALID_TABLES = new Set(['users', 'trips', 'events', 'entitlements', 'configs', 'flights']);
const WRITE_RETRY_SQLSTATES = new Set(['40001', '40P01']);
const flightCache = new Map();
const apiCache = new Map();
const jobs = new Map();
let dbReady = false;
let globalDataRefreshTimer = null;

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'wandergrid-dev-secret-change-me';
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

const base64UrlEncode = (value) => Buffer.from(value).toString('base64url');
const base64UrlDecode = (value) => Buffer.from(value, 'base64url').toString('utf8');
const stripSensitiveUserFields = (user = {}) => {
    const safeUser = { ...user };
    delete safeUser.password;
    return safeUser;
};

const signToken = (user) => {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        sub: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        iat: now,
        exp: now + TOKEN_TTL_SECONDS
    };
    const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
    const signature = crypto.createHmac('sha256', JWT_SECRET).update(unsigned).digest('base64url');
    return `${unsigned}.${signature}`;
};

const verifyToken = (token) => {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    const unsigned = `${header}.${payload}`;
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(unsigned).digest('base64url');
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
        return null;
    }
    const decoded = JSON.parse(base64UrlDecode(payload));
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded;
};

const requireAuth = (req, res, next) => {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    try {
        const session = verifyToken(token);
        if (!session) return res.status(401).json({ error: 'Authentication required' });
        req.user = session;
        next();
    } catch (err) {
        console.warn('Token verification failed:', err.message);
        return res.status(401).json({ error: 'Invalid or expired session' });
    }
};


// Global memory caches as robust fail-safe fallbacks
const memoryAirports = new Map();
const memoryCarriers = new Map();

// Database Connection
// A single process-wide Pool is reused for all requests. This avoids opening a
// fresh TCP connection per query and gives PostgreSQL backpressure controls.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 20),
  min: Number(process.env.PG_POOL_MIN || 0),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30_000),
  connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 5_000),
  statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS || 15_000),
  query_timeout: Number(process.env.PG_QUERY_TIMEOUT_MS || 20_000),
  application_name: process.env.PG_APPLICATION_NAME || 'wandergrid-api',
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

const assertValidTable = (table) => {
  if (!VALID_TABLES.has(table)) {
    const err = new Error(`Invalid resource table: ${table}`);
    err.status = 500;
    throw err;
  }
  return table;
};

const invalidateCache = (table) => {
  for (const key of apiCache.keys()) {
    if (key === table || key.startsWith(`${table}:`) || key === 'settings') {
      apiCache.delete(key);
    }
  }
};

const getCached = (key) => {
  const cached = apiCache.get(key);
  if (!cached || cached.expiresAt < Date.now()) {
    apiCache.delete(key);
    return null;
  }
  return cached.value;
};

const setCached = (key, value) => {
  if (API_CACHE_TTL_MS > 0) {
    apiCache.set(key, { value, expiresAt: Date.now() + API_CACHE_TTL_MS });
  }
};

const fetchTextWithTimeout = async (url, timeoutMs = EXTERNAL_FETCH_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      const err = new Error(`External fetch failed with ${response.status}`);
      err.status = response.status;
      throw err;
    }
    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
};

const fetchJsonWithTimeout = async (url, options = {}, timeoutMs = EXTERNAL_FETCH_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      const err = new Error(`External fetch failed with ${response.status}`);
      err.status = response.status;
      throw err;
    }
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
};

const createJob = (type, handler) => {
  const id = crypto.randomUUID();
  const job = { id, type, status: 'queued', progress: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  jobs.set(id, job);

  setImmediate(async () => {
    const update = (patch) => {
      Object.assign(job, patch, { updatedAt: new Date().toISOString() });
      jobs.set(id, job);
    };
    try {
      update({ status: 'processing', progress: 5 });
      const result = await handler(update);
      update({ status: 'complete', progress: 100, result });
    } catch (err) {
      update({ status: 'failed', error: err.message || 'Job failed' });
      console.error(`Background job ${type}/${id} failed:`, err);
    }
  });

  return job;
};

const sendError = (res, err, fallbackMessage = 'Internal server error') => {
  const status = err.status || (err.code === '23505' ? 409 : err.code === '23514' || err.code === '22P02' ? 400 : 500);
  const message = status >= 500 ? fallbackMessage : err.message;
  console.error(message, err);
  res.status(status).json({ error: message, code: err.code });
};

const withTransaction = async (work, { retries = 1 } = {}) => {
  let attempt = 0;
  while (true) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (rollbackErr) { console.error('Rollback failed:', rollbackErr); }
      if (attempt < retries && WRITE_RETRY_SQLSTATES.has(err.code)) {
        attempt += 1;
        await new Promise(resolve => setTimeout(resolve, 50 * attempt));
        continue;
      }
      throw err;
    } finally {
      client.release();
    }
  }
};

const normalizeResource = (resource, id) => {
  if (!resource || typeof resource !== 'object' || Array.isArray(resource)) {
    const err = new Error('Request body must be a JSON object');
    err.status = 400;
    throw err;
  }
  const resourceId = String(id || resource.id || '').trim();
  if (!resourceId) {
    const err = new Error('ID is required');
    err.status = 400;
    throw err;
  }
  return { ...resource, id: resourceId };
};

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'client_build')));

// Initialize Database Schema with automatic retry mechanism
const initDb = async (retries = 10, delayMs = 3000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Connecting to database (attempt ${attempt}/${retries})...`);
      const client = await pool.connect();
      try {
        // We use a generic structure where 'data' contains the JSON object
        // and 'id' is extracted for easier lookups.
        const tables = ['users', 'trips', 'events', 'entitlements', 'configs', 'flights'];
        
        for (const table of tables) {
          await client.query(`
            CREATE TABLE IF NOT EXISTS ${table} (
              id TEXT PRIMARY KEY,
              data JSONB NOT NULL,
              CONSTRAINT ${table}_id_not_blank CHECK (length(trim(id)) > 0),
              CONSTRAINT ${table}_data_is_object CHECK (jsonb_typeof(data) = 'object')
            );
          `);
          await client.query(`CREATE INDEX IF NOT EXISTS idx_${table}_data_gin ON ${table} USING GIN (data jsonb_path_ops)`);
        }

        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users (LOWER(data->>'email')) WHERE data ? 'email'`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_trips_status ON trips ((data->>'status'))`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_trips_start_date ON trips ((data->>'startDate'))`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_trips_end_date ON trips ((data->>'endDate'))`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_trips_privacy ON trips ((data->>'privacy'))`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_flights_departure_date ON flights ((data->>'departureDate'))`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_flights_provider_identifier ON flights ((data->>'provider'), (data->>'identifier'))`);

        await client.query(`
            CREATE TABLE IF NOT EXISTS geocode_cache (
              query TEXT PRIMARY KEY,
              result JSONB NOT NULL,
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              CONSTRAINT geocode_cache_query_not_blank CHECK (length(trim(query)) > 0),
              CONSTRAINT geocode_cache_result_is_object CHECK (jsonb_typeof(result) = 'object')
            );
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_geocode_cache_updated_at ON geocode_cache(updated_at)`);

        // Settings is a singleton, key-value store
        await client.query(`
            CREATE TABLE IF NOT EXISTS settings (
              key TEXT PRIMARY KEY,
              data JSONB NOT NULL,
              CONSTRAINT settings_key_not_blank CHECK (length(trim(key)) > 0),
              CONSTRAINT settings_data_is_object CHECK (jsonb_typeof(data) = 'object')
            );
        `);

        // Global airports database table
        await client.query(`
            CREATE TABLE IF NOT EXISTS global_airports (
              id SERIAL PRIMARY KEY,
              iata VARCHAR(10),
              city_name TEXT,
              airport_name TEXT,
              CONSTRAINT global_airports_iata_not_blank CHECK (iata IS NULL OR length(trim(iata)) > 0)
            );
        `);
        
        // Global carriers database table
        await client.query(`
            CREATE TABLE IF NOT EXISTS global_carriers (
              id SERIAL PRIMARY KEY,
              iata VARCHAR(10),
              company_name TEXT,
              country_or_territory TEXT,
              CONSTRAINT global_carriers_identity_not_blank CHECK ((iata IS NOT NULL AND length(trim(iata)) > 0) OR (company_name IS NOT NULL AND length(trim(company_name)) > 0))
            );
        `);
        
        console.log('Database schema initialized successfully!');

        // Startup db confirmation
        console.log('Database initialization check completed: Users table ready for enrollment.');

        return; // Connection and schema setup succeeded
      } finally {
        client.release();
      }
    } catch (err) {
      console.error(`Database connection attempt ${attempt} failed:`, err.message);
      if (attempt === retries) {
        console.error('All database connection attempts exhausted. Starting server in fallback mode (or container will restart).');
        throw err; // Re-throw to allow process/container to restart if all retries fail
      }
      console.log(`Waiting ${delayMs / 1000}s before retrying database connection...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
};

const parseGlobalDatasetLines = (text, type) => {
  const rows = [];
  const memoryTarget = type === 'airports' ? memoryAirports : memoryCarriers;
  const lines = text.split('\n').filter(Boolean);

  for (const line of lines) {
    try {
      const item = JSON.parse(line);
      const iata = (item.iata || '').trim().toUpperCase();
      if (type === 'airports') {
        if (!iata) continue;
        const row = { iata, city_name: item.city_name || '', airport_name: item.airport_name || '' };
        rows.push(row);
        memoryTarget.set(iata, row);
      } else {
        const row = { iata, company_name: item.company_name || '', country_or_territory: item.country_or_territory || '' };
        if (!row.iata && !row.company_name) continue;
        rows.push(row);
        if (row.iata) memoryTarget.set(row.iata, row);
      }
    } catch (err) {}
  }

  return rows;
};

const hydrateGlobalMemoryFromDb = async (client) => {
  memoryAirports.clear();
  memoryCarriers.clear();

  const [airports, carriers] = await Promise.all([
    client.query('SELECT iata, city_name, airport_name FROM global_airports'),
    client.query('SELECT iata, company_name, country_or_territory FROM global_carriers')
  ]);

  airports.rows.forEach(row => { if (row.iata) memoryAirports.set(row.iata.toUpperCase(), row); });
  carriers.rows.forEach(row => { if (row.iata) memoryCarriers.set(row.iata.toUpperCase(), row); });

  return { airports: airports.rowCount, carriers: carriers.rowCount };
};

const getGlobalDatasetLastRefresh = async (client) => {
  const { rows } = await client.query(`SELECT data FROM settings WHERE key = 'global_data_refresh'`);
  const timestamp = rows[0]?.data?.refreshedAt;
  const time = timestamp ? new Date(timestamp).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
};

const replaceGlobalDataTable = async (client, table, columns, rows) => {
  await client.query(`TRUNCATE TABLE ${table}`);
  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const params = [];
    const values = [];
    chunk.forEach((row, rowIdx) => {
      const offset = rowIdx * columns.length;
      values.push(`(${columns.map((_, colIdx) => `$${offset + colIdx + 1}`).join(', ')})`);
      columns.forEach(col => params.push(row[col] || ''));
    });
    if (values.length > 0) {
      await client.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ${values.join(', ')}`, params);
    }
  }
};

const refreshGlobalDataFromSources = async ({ force = false } = {}) => {
  const client = await pool.connect();
  try {
    const counts = await hydrateGlobalMemoryFromDb(client);
    const lastRefresh = await getGlobalDatasetLastRefresh(client);
    const isFresh = counts.airports > 0 && counts.carriers > 0 && Date.now() - lastRefresh < GLOBAL_DATA_REFRESH_MS;

    if (isFresh && !force) {
      console.log(`Global airport/carrier data is fresh; served ${counts.airports}/${counts.carriers} rows from PostgreSQL cache.`);
      return { refreshed: false, ...counts };
    }
  } finally {
    client.release();
  }

  console.log('Refreshing global airport/carrier data from GitHub source datasets...');
  const [airportText, carrierText] = await Promise.all([
    fetchTextWithTimeout('https://raw.githubusercontent.com/dlubom/iata_code_fetcher/main/airport_data_full_processed.jsonl', 10_000),
    fetchTextWithTimeout('https://raw.githubusercontent.com/dlubom/iata_code_fetcher/main/carrier_data_full_processed.jsonl', 10_000)
  ]);

  const airportRows = parseGlobalDatasetLines(airportText, 'airports');
  const carrierRows = parseGlobalDatasetLines(carrierText, 'carriers');

  const writer = await pool.connect();
  try {
    await writer.query('BEGIN');
    await replaceGlobalDataTable(writer, 'global_airports', ['iata', 'city_name', 'airport_name'], airportRows);
    await replaceGlobalDataTable(writer, 'global_carriers', ['iata', 'company_name', 'country_or_territory'], carrierRows);
    await writer.query(
      `INSERT INTO settings (key, data) VALUES ('global_data_refresh', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data`,
      [JSON.stringify({ refreshedAt: new Date().toISOString(), airports: airportRows.length, carriers: carrierRows.length })]
    );
    await writer.query('COMMIT');
    console.log(`Global data refresh complete: ${airportRows.length} airports, ${carrierRows.length} carriers.`);
    return { refreshed: true, airports: airportRows.length, carriers: carrierRows.length };
  } catch (err) {
    try { await writer.query('ROLLBACK'); } catch (rollbackErr) { console.error('Global data rollback failed:', rollbackErr); }
    throw err;
  } finally {
    writer.release();
  }
};

const loadGlobalData = async () => refreshGlobalDataFromSources({ force: false });

const scheduleGlobalDataRefresh = () => {
  if (globalDataRefreshTimer) clearInterval(globalDataRefreshTimer);
  globalDataRefreshTimer = setInterval(() => {
    refreshGlobalDataFromSources({ force: false }).catch(err => console.error('Scheduled global data refresh failed:', err));
  }, Math.max(GLOBAL_DATA_REFRESH_MS, 60 * 60 * 1000));
  globalDataRefreshTimer.unref?.();
};

// --- Generic CRUD Handlers ---

const getResources = (table) => async (req, res) => {
  try {
    assertValidTable(table);
    const cached = getCached(table);
    if (cached) return res.json(cached);

    const { rows } = await pool.query(`SELECT data FROM ${table} ORDER BY id`);
    const payload = rows.map(r => r.data);
    setCached(table, payload);
    res.json(payload);
  } catch (err) {
    sendError(res, err, `Failed to load ${table}`);
  }
};

const createResource = (table) => async (req, res) => {
  try {
    assertValidTable(table);
    const resource = normalizeResource(req.body);
    const saved = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO ${table} (id, data) VALUES ($1, $2::jsonb)
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
         RETURNING data`,
        [resource.id, JSON.stringify(resource)]
      );
      return rows[0].data;
    }, { retries: 2 });
    invalidateCache(table);
    res.status(201).json(table === 'users' ? stripSensitiveUserFields(saved) : saved);
  } catch (err) {
    sendError(res, err, `Failed to save ${table} resource`);
  }
};

const updateResource = (table) => async (req, res) => {
  try {
    assertValidTable(table);
    const resource = normalizeResource(req.body, req.params.id);
    const saved = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO ${table} (id, data) VALUES ($1, $2::jsonb)
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
         RETURNING data`,
        [resource.id, JSON.stringify(resource)]
      );
      return rows[0].data;
    }, { retries: 2 });
    invalidateCache(table);
    res.json(table === 'users' ? stripSensitiveUserFields(saved) : saved);
  } catch (err) {
    sendError(res, err, `Failed to update ${table} resource`);
  }
};

const bulkUpsertResources = (table) => async (req, res) => {
  try {
    assertValidTable(table);
    const items = Array.isArray(req.body?.items) ? req.body.items : req.body;
    if (!Array.isArray(items)) {
      const err = new Error('Bulk request body must be an array or { items: [] }');
      err.status = 400;
      throw err;
    }
    const resources = items.map(item => normalizeResource(item));
    const saved = await withTransaction(async (client) => {
      const output = [];
      for (const resource of resources) {
        const { rows } = await client.query(
          `INSERT INTO ${table} (id, data) VALUES ($1, $2::jsonb)
           ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
           RETURNING data`,
          [resource.id, JSON.stringify(resource)]
        );
        output.push(rows[0].data);
      }
      return output;
    }, { retries: 2 });
    invalidateCache(table);
    res.status(201).json(saved);
  } catch (err) {
    sendError(res, err, `Failed to bulk save ${table}`);
  }
};

const deleteResource = (table) => async (req, res) => {
  try {
    assertValidTable(table);
    const { rowCount } = await withTransaction(
      (client) => client.query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]),
      { retries: 2 }
    );
    invalidateCache(table);
    res.json({ success: true, deleted: rowCount });
  } catch (err) {
    sendError(res, err, `Failed to delete ${table} resource`);
  }
};

// --- Routes ---

// Proxy for AviationStack (Fixes CORS issues)
app.get('/api/proxy/flight-status', async (req, res) => {
    const { access_key, flight_iata, flight_date } = req.query;
    if (!access_key || !flight_iata) {
        return res.status(400).json({ error: 'Missing access_key or flight_iata' });
    }

    const cacheKey = `${flight_iata}:${flight_date || 'latest'}`;
    const cached = flightCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        res.set('X-Cache', 'HIT');
        res.set('Cache-Control', `public, max-age=${Math.floor(FLIGHT_CACHE_TTL_MS / 1000)}`);
        return res.json(cached.data);
    }
    
    try {
        const dateParam = flight_date ? `&flight_date=${flight_date}` : '';
        const url = `http://api.aviationstack.com/v1/flights?access_key=${access_key}&flight_iata=${flight_iata}${dateParam}`;
        // Using built-in fetch (Node 18+)
        const response = await fetch(url);
        const data = await response.json();
        flightCache.set(cacheKey, { data, expiresAt: Date.now() + FLIGHT_CACHE_TTL_MS });
        res.set('X-Cache', 'MISS');
        res.set('Cache-Control', `public, max-age=${Math.floor(FLIGHT_CACHE_TTL_MS / 1000)}`);
        res.json(data);
    } catch (err) {
        console.error("Proxy error:", err);
        res.status(500).json({ error: 'Failed to fetch flight data' });
    }
});

// Proxy for AviationStack Airports (Bypasses CORS & mixed content)
app.get('/api/proxy/airports', async (req, res) => {
    const { access_key, iata_code, search } = req.query;
    if (!access_key) {
        return res.status(400).json({ error: 'Missing access_key' });
    }
    try {
        let url = `http://api.aviationstack.com/v1/airports?access_key=${access_key}`;
        if (iata_code) url += `&iata_code=${iata_code}`;
        if (search) url += `&search=${search}`;
        const response = await fetch(url);
        const data = await response.json();
        res.json(data);
    } catch (err) {
         console.error("Airports proxy error:", err);
         res.status(500).json({ error: 'Failed to fetch airport metadata' });
    }
});

// Proxy for AviationStack Airlines (Bypasses CORS & mixed content)
app.get('/api/proxy/airlines', async (req, res) => {
    const { access_key, iata_code, search } = req.query;
    if (!access_key) {
        return res.status(400).json({ error: 'Missing access_key' });
    }
    try {
        let url = `http://api.aviationstack.com/v1/airlines?access_key=${access_key}`;
        if (iata_code) url += `&iata_code=${iata_code}`;
        if (search) url += `&search=${search}`;
        const response = await fetch(url);
        const data = await response.json();
        res.json(data);
    } catch (err) {
         console.error("Airlines proxy error:", err);
         res.status(500).json({ error: 'Failed to fetch airline metadata' });
    }
});

// --- Global Search & Lookup Endpoints (External DB / PostgreSQL) ---

// Lookup single airport by IATA code
app.get('/api/airports/lookup/:iata', async (req, res) => {
    const { iata } = req.params;
    if (!iata) return res.status(400).json({ error: 'Missing IATA code' });
    const lookupCode = iata.trim().toUpperCase();
    
    // 1. Try DB first
    try {
        const { rows } = await pool.query(
            `SELECT iata, city_name, airport_name FROM global_airports WHERE UPPER(iata) = $1 LIMIT 1`,
            [lookupCode]
        );
        if (rows.length > 0) {
            return res.json(rows[0]);
        }
    } catch (err) {
        console.warn('Database lookup failed, falling back to in-memory store:', err.message);
    }

    // 2. Try In-Memory Fallback Map
    const cached = memoryAirports.get(lookupCode);
    if (cached) {
        return res.json(cached);
    }

    res.status(404).json({ error: 'Airport code not found in database or memory cache' });
});

// Lookup single carrier by IATA code
app.get('/api/carriers/lookup/:iata', async (req, res) => {
    const { iata } = req.params;
    if (!iata) return res.status(400).json({ error: 'Missing IATA code' });
    const lookupCode = iata.trim().toUpperCase();
    
    // 1. Try DB first
    try {
        const { rows } = await pool.query(
            `SELECT iata, company_name, country_or_territory FROM global_carriers WHERE UPPER(iata) = $1 LIMIT 1`,
            [lookupCode]
        );
        if (rows.length > 0) {
            return res.json(rows[0]);
        }
    } catch (err) {
        console.warn('Database carrier lookup failed, falling back to in-memory store:', err.message);
    }

    // 2. Try In-Memory Fallback Map
    const cached = memoryCarriers.get(lookupCode);
    if (cached) {
        return res.json(cached);
    }

    res.status(404).json({ error: 'Carrier code not found in database or memory cache' });
});

// Search airports by query term
app.get('/api/airports/search', async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) {
        return res.json([]);
    }
    
    // 1. Try DB first
    try {
        const searchPattern = `%${q.toLowerCase()}%`;
        const { rows } = await pool.query(
            `SELECT iata, city_name, airport_name 
             FROM global_airports 
             WHERE LOWER(iata) = LOWER($1)
                OR LOWER(iata) LIKE $2
                OR LOWER(city_name) LIKE $2
                OR LOWER(airport_name) LIKE $2
             ORDER BY 
                CASE WHEN LOWER(iata) = LOWER($1) THEN 1
                     WHEN LOWER(iata) LIKE $2 THEN 2
                     WHEN LOWER(city_name) LIKE $2 THEN 3
                     ELSE 4
                END
             LIMIT 15`,
            [q, searchPattern]
        );
        return res.json(rows);
    } catch (err) {
        console.warn('Database airport search failed, searching in-memory cache:', err.message);
    }

    // 2. Try In-Memory Fallback Search
    const lowerQuery = q.toLowerCase();
    const results = [];
    for (const [iata, details] of memoryAirports.entries()) {
        const isIataMatch = iata.toLowerCase() === lowerQuery;
        const isIataPartial = iata.toLowerCase().includes(lowerQuery);
        const isCityMatch = (details.city_name || '').toLowerCase().includes(lowerQuery);
        const isAirportMatch = (details.airport_name || '').toLowerCase().includes(lowerQuery);

        if (isIataMatch || isIataPartial || isCityMatch || isAirportMatch) {
            results.push({
                iata: details.iata,
                city_name: details.city_name,
                airport_name: details.airport_name,
                score: isIataMatch ? 1 : isIataPartial ? 2 : isCityMatch ? 3 : 4
            });
        }
    }
    results.sort((a,b) => a.score - b.score);
    res.json(results.slice(0, 15).map(({score, ...rest}) => rest));
});

// Search carriers by query term
app.get('/api/carriers/search', async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 1) {
        return res.json([]);
    }
    
    // 1. Try DB first
    try {
        const searchPattern = `%${q.toLowerCase()}%`;
        const { rows } = await pool.query(
            `SELECT iata, company_name, country_or_territory 
             FROM global_carriers 
             WHERE (LOWER(iata) = LOWER($1) AND iata <> '')
                OR LOWER(iata) LIKE $2
                OR LOWER(company_name) LIKE $2
             ORDER BY 
                CASE WHEN LOWER(iata) = LOWER($1) THEN 1
                     WHEN LOWER(company_name) LIKE $2 THEN 2
                     ELSE 3
                END
             LIMIT 15`,
            [q, searchPattern]
        );
        return res.json(rows);
    } catch (err) {
        console.warn('Database carrier search failed, searching in-memory cache:', err.message);
    }

    // 2. Try In-Memory Fallback Search
    const lowerQuery = q.toLowerCase();
    const results = [];
    for (const [iata, details] of memoryCarriers.entries()) {
        const isIataMatch = iata.toLowerCase() === lowerQuery;
        const isIataPartial = iata.toLowerCase().includes(lowerQuery);
        const isCompanyMatch = (details.company_name || '').toLowerCase().includes(lowerQuery);

        if ((isIataMatch && iata !== '') || isIataPartial || isCompanyMatch) {
            results.push({
                iata: details.iata,
                company_name: details.company_name,
                country_or_territory: details.country_or_territory,
                score: isIataMatch ? 1 : isCompanyMatch ? 2 : 3
            });
        }
    }
    results.sort((a,b) => a.score - b.score);
    res.json(results.slice(0, 15).map(({score, ...rest}) => rest));
});

// Calendar Sync Endpoint (iCal Feed)
app.get('/api/calendar/:userId/feed.ics', async (req, res) => {
    const { userId } = req.params;
    try {
        // Query trips where userId is in the participants array
        const { rows } = await pool.query(`
            SELECT data FROM trips 
            WHERE data->'participants' ? $1
            AND (data->>'status' = 'Upcoming' OR data->>'status' = 'Past')
        `, [userId]);
        
        const trips = rows.map(r => r.data);
        
        // --- ICS Generation Logic (Backend Version) ---
        const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        const formatDate = (dateStr) => dateStr.replace(/-/g, '');
        const getExclusiveEndDate = (dateStr) => {
            const date = new Date(dateStr);
            date.setDate(date.getDate() + 1);
            return date.toISOString().split('T')[0].replace(/-/g, '');
        };

        const events = trips.map(trip => {
            const start = formatDate(trip.startDate);
            const end = getExclusiveEndDate(trip.endDate);
            const summary = `${trip.icon || '✈️'} ${trip.name}`;
            const location = trip.location || '';
            const uid = `${trip.id}@wandergrid.app`;
            
            let description = `Status: ${trip.status}\\n`;
            if (trip.transports && trip.transports.length > 0) {
                description += `\\nTransports:${trip.transports.map(t => `\\n- ${t.mode}: ${t.provider} (${t.departureTime})`).join('')}`;
            }

            return [
                'BEGIN:VEVENT',
                `UID:${uid}`,
                `DTSTAMP:${now}`,
                `DTSTART;VALUE=DATE:${start}`,
                `DTEND;VALUE=DATE:${end}`,
                `SUMMARY:${summary}`,
                `LOCATION:${location}`,
                `DESCRIPTION:${description}`,
                'END:VEVENT'
            ].join('\r\n');
        });

        const icsContent = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//WanderGrid//Travel Calendar//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'X-WR-CALNAME:WanderGrid Trips',
            ...events,
            'END:VCALENDAR'
        ].join('\r\n');

        res.set('Content-Type', 'text/calendar;charset=utf-8');
        res.set('Content-Disposition', 'inline; filename="wandergrid.ics"');
        res.send(icsContent);

    } catch (err) {
        console.error("Calendar Feed Error", err);
        res.status(500).send("Error generating calendar");
    }
});

// Health Check
app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        const status = dbReady ? 200 : 503;
        res.status(status).json({
            status: dbReady ? 'ok' : 'starting',
            database: 'connected',
            pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount }
        });
    } catch (err) {
        res.status(503).json({ status: 'error', database: 'disconnected', message: err.message });
    }
});

// Authentication
app.get('/api/auth/status', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM users`);
        res.json({ hasUsers: (rows[0]?.count || 0) > 0 });
    } catch (err) {
        sendError(res, err, 'Unable to check setup status');
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }
    try {
        const { rows } = await pool.query(
            `SELECT data FROM users WHERE LOWER(data->>'email') = LOWER($1) LIMIT 1`,
            [email.trim()]
        );
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const user = rows[0].data;
        if (user.password !== password) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        res.json({ user: stripSensitiveUserFields(user), token: signToken(user) });
    } catch (err) {
        console.error('Login error:', err);
        sendError(res, err, 'Authentication failed');
    }
});

app.post('/api/auth/register', async (req, res) => {
    const user = req.body;
    if (!user.email || !user.password || !user.id) {
        return res.status(400).json({ error: 'User ID, Email, and Password are required' });
    }
    try {
        const savedUser = await withTransaction(async (client) => {
            const { rows } = await client.query(
                `SELECT 1 FROM users WHERE LOWER(data->>'email') = LOWER($1) LIMIT 1`,
                [user.email.trim()]
            );
            if (rows.length > 0) {
                const err = new Error('User already exists');
                err.status = 409;
                throw err;
            }
            const resource = normalizeResource(user);
            const result = await client.query(
                `INSERT INTO users (id, data) VALUES ($1, $2::jsonb) RETURNING data`,
                [resource.id, JSON.stringify(resource)]
            );
            return result.rows[0].data;
        }, { retries: 2 });
        invalidateCache('users');
        res.status(201).json({ user: stripSensitiveUserFields(savedUser), token: signToken(savedUser) });
    } catch (err) {
        console.error('Register error:', err);
        sendError(res, err, 'Registration failed');
    }
});

app.use('/api', requireAuth);


// Background job status for long-running work (backup/export, future imports, etc.)
app.get('/api/jobs/:id', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
});

// Async backup job: returns immediately, performs DB read in the background.
app.post('/api/backup/jobs', (req, res) => {
    const job = createJob('backup', async (update) => {
        update({ progress: 20 });
        const backup = await withTransaction(async (client) => {
            const tables = ['users', 'trips', 'events', 'entitlements', 'configs', 'flights'];
            const state = {};
            for (let i = 0; i < tables.length; i++) {
                const table = tables[i];
                const { rows } = await client.query(`SELECT data FROM ${table} ORDER BY id`);
                state[table] = rows.map(r => r.data);
                update({ progress: 20 + Math.round(((i + 1) / tables.length) * 60) });
            }
            const settingsRes = await client.query(`SELECT data FROM settings WHERE key = 'workspace'`);
            state.workspaceSettings = settingsRes.rows.length > 0 ? settingsRes.rows[0].data : {};
            return state;
        });
        update({ progress: 95 });
        return backup;
    });
    res.status(202).json({ jobId: job.id, status: job.status });
});

// Manual refresh hook for static global datasets; normal refresh happens on a schedule.
app.post('/api/admin/global-data/refresh', (req, res) => {
    const job = createJob('global-data-refresh', () => refreshGlobalDataFromSources({ force: true }));
    res.status(202).json({ jobId: job.id, status: job.status });
});

app.get('/api/geocode/search', async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ suggestions: [] });

    const normalized = q.toLowerCase();
    try {
        const cached = await pool.query(
            `SELECT result FROM geocode_cache
             WHERE query = $1 AND updated_at > NOW() - ($2::int * INTERVAL '1 millisecond')`,
            [normalized, GEOCODE_CACHE_TTL_MS]
        );
        if (cached.rows.length > 0) return res.json(cached.rows[0].result);

        const suggestions = [];
        const airportPattern = `%${normalized}%`;
        const airportMatches = await pool.query(
            `SELECT iata, city_name, airport_name
             FROM global_airports
             WHERE LOWER(iata) LIKE $1 OR LOWER(city_name) LIKE $1 OR LOWER(airport_name) LIKE $1
             ORDER BY CASE WHEN LOWER(iata) = $2 THEN 0 ELSE 1 END, iata
             LIMIT 8`,
            [airportPattern, normalized]
        );
        airportMatches.rows.forEach(row => {
            suggestions.push(`${row.iata} - ${row.airport_name || 'Airport'}, ${row.city_name || ''}`.replace(/,\s*$/, ''));
        });

        try {
            const meteo = await fetchJsonWithTimeout(
                `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&format=json`,
                {},
                2500
            );
            (meteo.results || []).forEach(item => {
                suggestions.push(`${item.name}${item.admin1 ? `, ${item.admin1}` : ''}, ${item.country}`);
            });
        } catch (err) {
            console.warn('Open-Meteo geocode lookup failed:', err.message);
        }

        const unique = [...new Set(suggestions)].slice(0, 12);
        const payload = { suggestions: unique };
        await pool.query(
            `INSERT INTO geocode_cache (query, result, updated_at) VALUES ($1, $2::jsonb, NOW())
             ON CONFLICT (query) DO UPDATE SET result = EXCLUDED.result, updated_at = NOW()`,
            [normalized, JSON.stringify(payload)]
        );
        res.json(payload);
    } catch (err) {
        sendError(res, err, 'Failed to search locations');
    }
});

// Users
app.get('/api/users', async (req, res) => {
    try {
        const cached = getCached('users:safe');
        if (cached) return res.json(cached);

        const { rows } = await pool.query(`SELECT data FROM users ORDER BY id`);
        const users = rows.map(r => stripSensitiveUserFields(r.data));
        setCached('users:safe', users);
        res.json(users);
    } catch (err) {
        sendError(res, err, 'Failed to load users');
    }
});

app.post('/api/users', createResource('users'));

app.put('/api/users/:id', async (req, res) => {
    try {
        const updatedUser = normalizeResource(req.body, req.params.id);
        const savedUser = await withTransaction(async (client) => {
            const { rows } = await client.query(`SELECT data FROM users WHERE id = $1 FOR UPDATE`, [updatedUser.id]);
            if (rows.length > 0) {
                const prevUser = rows[0].data;
                if (!updatedUser.password || String(updatedUser.password).trim() === '') {
                    updatedUser.password = prevUser.password;
                }
            }
            const result = await client.query(
                `INSERT INTO users (id, data) VALUES ($1, $2::jsonb)
                 ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
                 RETURNING data`,
                [updatedUser.id, JSON.stringify(updatedUser)]
            );
            return result.rows[0].data;
        }, { retries: 2 });
        invalidateCache('users');
        res.json(stripSensitiveUserFields(savedUser));
    } catch (err) {
        sendError(res, err, 'Failed to update user');
    }
});

app.delete('/api/users/:id', deleteResource('users'));

// Trips
app.get('/api/trips', getResources('trips'));
app.post('/api/trips', createResource('trips'));
app.post('/api/trips/bulk', bulkUpsertResources('trips'));
app.put('/api/trips/:id', updateResource('trips'));
app.delete('/api/trips/:id', deleteResource('trips'));

// Events (Custom Events)
app.get('/api/events', getResources('events'));
app.post('/api/events', createResource('events'));
app.put('/api/events/:id', updateResource('events'));
app.delete('/api/events/:id', deleteResource('events'));

// Entitlements
app.get('/api/entitlements', getResources('entitlements'));
app.post('/api/entitlements', createResource('entitlements'));
app.put('/api/entitlements/:id', updateResource('entitlements'));
app.delete('/api/entitlements/:id', deleteResource('entitlements'));

// Configs (Saved Holiday Configs)
app.get('/api/configs', getResources('configs'));
app.post('/api/configs', createResource('configs'));
app.put('/api/configs/:id', updateResource('configs'));
app.delete('/api/configs/:id', deleteResource('configs'));

// Flights
app.get('/api/flights', getResources('flights'));
app.post('/api/flights', createResource('flights'));
app.post('/api/flights/bulk', bulkUpsertResources('flights'));
app.put('/api/flights/:id', updateResource('flights'));
app.delete('/api/flights/:id', deleteResource('flights'));

// Settings (Singleton)
app.get('/api/settings', async (req, res) => {
    try {
        const cached = getCached('settings');
        if (cached) return res.json(cached);

        const { rows } = await pool.query(`SELECT data FROM settings WHERE key = 'workspace'`);
        const settings = rows.length > 0 ? rows[0].data : {};
        setCached('settings', settings);
        res.json(settings);
    } catch (err) {
        sendError(res, err, 'Failed to load settings');
    }
});

app.put('/api/settings', async (req, res) => {
    try {
        const settings = normalizeResource({ ...req.body, id: 'workspace' }, 'workspace');
        delete settings.id;
        const saved = await withTransaction(async (client) => {
            const { rows } = await client.query(
                `INSERT INTO settings (key, data) VALUES ('workspace', $1::jsonb)
                 ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data
                 RETURNING data`,
                [JSON.stringify(settings)]
            );
            return rows[0].data;
        }, { retries: 2 });
        invalidateCache('settings');
        res.json(saved);
    } catch (err) {
        sendError(res, err, 'Failed to save settings');
    }
});

// Import/Export Full State
app.get('/api/backup', async (req, res) => {
    try {
        const backup = await withTransaction(async (client) => {
            const tables = ['users', 'trips', 'events', 'entitlements', 'configs', 'flights'];
            const state = {};
            for (const table of tables) {
                const { rows } = await client.query(`SELECT data FROM ${table} ORDER BY id`);
                state[table] = rows.map(r => r.data);
            }
            const settingsRes = await client.query(`SELECT data FROM settings WHERE key = 'workspace'`);
            state.workspaceSettings = settingsRes.rows.length > 0 ? settingsRes.rows[0].data : {};
            return state;
        });
        res.json(backup);
    } catch (err) {
        sendError(res, err, 'Failed to export backup');
    }
});

app.post('/api/restore', async (req, res) => {
    try {
        await withTransaction(async (client) => {
            const data = req.body || {};
            const tables = ['users', 'trips', 'events', 'entitlements', 'configs', 'flights'];
            for (const table of tables) {
                await client.query(`TRUNCATE TABLE ${table}`);
                const items = data[table];
                if (items !== undefined && !Array.isArray(items)) {
                    const err = new Error(`Backup field ${table} must be an array`);
                    err.status = 400;
                    throw err;
                }
                if (Array.isArray(items)) {
                    for (const item of items) {
                        const resource = normalizeResource(item);
                        await client.query(`INSERT INTO ${table} (id, data) VALUES ($1, $2::jsonb)`, [resource.id, JSON.stringify(resource)]);
                    }
                }
            }
            await client.query(`TRUNCATE TABLE settings`);
            if (data.workspaceSettings) {
                await client.query(
                    `INSERT INTO settings (key, data) VALUES ('workspace', $1::jsonb)
                     ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data`,
                    [JSON.stringify(data.workspaceSettings)]
                );
            }
        });
        apiCache.clear();
        res.json({ success: true });
    } catch (err) {
        sendError(res, err, 'Failed to restore backup');
    }
});

app.post('/api/wipe', async (req, res) => {
    try {
        await withTransaction(async (client) => {
            const tables = ['users', 'trips', 'events', 'entitlements', 'configs', 'flights', 'settings'];
            for (const table of tables) {
                await client.query(`TRUNCATE TABLE ${table} CASCADE`);
            }
        });
        apiCache.clear();
        res.json({ success: true });
    } catch (err) {
        sendError(res, err, 'Failed to wipe database');
    }
});

// Serve React App
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client_build', 'index.html'));
});

const startServer = async () => {
    try {
        await initDb();
        dbReady = true;
        loadGlobalData().catch(err => console.error('Error in background data load:', err));
        scheduleGlobalDataRefresh();
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (err) {
        dbReady = false;
        console.error('Fatal database initialization failure. Refusing to accept traffic:', err.message);
        process.exit(1);
    }
};

const shutdown = async (signal) => {
    console.log(`${signal} received; closing HTTP timers and PostgreSQL pool...`);
    if (globalDataRefreshTimer) clearInterval(globalDataRefreshTimer);
    try {
        await pool.end();
        process.exit(0);
    } catch (err) {
        console.error('Error during graceful shutdown:', err);
        process.exit(1);
    }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startServer();
