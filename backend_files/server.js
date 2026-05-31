
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');

// --- Centralized Structured JSON Logger ---
const logger = {
    info: (message, details = null) => {
        if (process.env.NODE_ENV === 'production' || process.env.STRUCTURED_LOGGING === 'true') {
            console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'INFO', message, ...(details ? { details } : {}) }));
        } else {
            console.log(`[INFO] [${new Date().toLocaleTimeString()}] ${message}`, details ? details : '');
        }
    },
    warn: (message, details = null) => {
        if (process.env.NODE_ENV === 'production' || process.env.STRUCTURED_LOGGING === 'true') {
            console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'WARN', message, ...(details ? { details } : {}) }));
        } else {
            console.warn(`[WARN] [${new Date().toLocaleTimeString()}] ${message}`, details ? details : '');
        }
    },
    error: (message, error = null, details = null) => {
        const errorDetails = error ? {
            name: error.name,
            message: error.message,
            stack: error.stack
        } : null;
        
        if (process.env.NODE_ENV === 'production' || process.env.STRUCTURED_LOGGING === 'true') {
            console.error(JSON.stringify({ 
                timestamp: new Date().toISOString(), 
                level: 'ERROR', 
                message, 
                ...(errorDetails ? { error: errorDetails } : {}),
                ...(details ? { details } : {}) 
            }));
        } else {
            console.error(`[ERROR] [${new Date().toLocaleTimeString()}] ${message}`, error ? error : '', details ? details : '');
        }
    }
};

// Override standard global console log operations to use Structured Logger when appropriate
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

console.log = (message, ...args) => {
    if (process.env.NODE_ENV === 'production' || process.env.STRUCTURED_LOGGING === 'true') {
        const details = args.length > 0 ? args : null;
        originalConsoleLog(JSON.stringify({ timestamp: new Date().toISOString(), level: 'INFO', message, ...(details ? { details } : {}) }));
    } else {
        originalConsoleLog(message, ...args);
    }
};

console.warn = (message, ...args) => {
    if (process.env.NODE_ENV === 'production' || process.env.STRUCTURED_LOGGING === 'true') {
        const details = args.length > 0 ? args : null;
        originalConsoleWarn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'WARN', message, ...(details ? { details } : {}) }));
    } else {
        originalConsoleWarn(message, ...args);
    }
};

console.error = (message, ...args) => {
    if (process.env.NODE_ENV === 'production' || process.env.STRUCTURED_LOGGING === 'true') {
        const errObj = args.find(arg => arg instanceof Error);
        const details = args.filter(arg => !(arg instanceof Error));
        originalConsoleError(JSON.stringify({ 
            timestamp: new Date().toISOString(), 
            level: 'ERROR', 
            message, 
            ...(errObj ? { error: { name: errObj.name, message: errObj.message, stack: errObj.stack } } : {}),
            ...(details.length > 0 ? { details } : {})
        }));
    } else {
        originalConsoleError(message, ...args);
    }
};

// --- Centralized Security and Authorization Configuration ---
const JWT_SECRET = process.env.JWT_SECRET || 'wandergrid_super_secret_development_key_change_me_in_production';

function hashPassword(password) {
    if (!password) return '';
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
    if (!storedHash) return false;
    if (!storedHash.includes(':')) {
        // Compatibility mode for existing plain-text passwords
        return password === storedHash;
    }
    const [salt, hash] = storedHash.split(':');
    const verifyHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return hash === verifyHash;
}

function removeSensitiveData(obj) {
    if (obj === null || obj === undefined) {
        return obj;
    }
    if (typeof obj !== 'object') {
        return obj;
    }
    
    if (Array.isArray(obj)) {
        return obj.map(removeSensitiveData);
    }
    
    const cleaned = {};
    for (const [key, val] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        if (
            lowerKey === 'password' || 
            lowerKey.includes('apikey') || 
            lowerKey.includes('api_key') || 
            lowerKey.includes('token') || 
            lowerKey.includes('secret')
        ) {
            continue;
        }
        
        cleaned[key] = removeSensitiveData(val);
    }
    return cleaned;
}

function authenticateToken(req, res, next) {
    // Define the public paths that require NO token verification
    const publicPaths = [
        '/api/health',
        '/api/auth/login',
        '/api/auth/register'
    ];
    
    // Bypass authentication for public paths and calendar feeds
    const isPublic = publicPaths.some(p => req.path === p) || (req.path.startsWith('/api/calendar/') && req.path.endsWith('/feed.ics'));
    
    if (isPublic) {
        return next();
    }
    
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Extract Bearer <token>
    
    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired access token' });
        }
        req.user = decoded;
        next();
    });
}

function sendError(res, err, status = 500, defaultMessage = 'An unexpected error occurred') {
    console.error(err);
    
    // In production, sanitize the response message to avoid leaking stack traces, database schemas, or system paths
    if (process.env.NODE_ENV === 'production') {
        return res.status(status).json({ error: defaultMessage });
    } else {
        return res.status(status).json({ error: err.message, stack: err.stack });
    }
}

const app = express();
const PORT = process.env.PORT || 3000;
const FLIGHT_CACHE_TTL_MS = 5 * 60 * 1000;
const flightCache = new Map();

// Global memory caches as robust fail-safe fallbacks
const memoryAirports = new Map();
const memoryCarriers = new Map();

// Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                // Database Connection Pooling limits to 20 client connections
  idleTimeoutMillis: 30000, // Reclaim idle clients back to pool after 30s
  connectionTimeoutMillis: 5000 // Fast-fail if DB connection takes >5s
});

// Middleware & Security Headers
app.use(helmet({
    contentSecurityPolicy: false, // Turned off for seamless loading inside the preview sandbox iframe
    crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'client_build')));

// Global API Route Protection
app.use('/api', authenticateToken);

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
              data JSONB NOT NULL
            );
          `);
        }

        // Settings is a singleton, key-value store
        await client.query(`
            CREATE TABLE IF NOT EXISTS settings (
              key TEXT PRIMARY KEY,
              data JSONB NOT NULL
            );
        `);

        // Global airports database table
        await client.query(`
            CREATE TABLE IF NOT EXISTS global_airports (
              id SERIAL PRIMARY KEY,
              iata VARCHAR(10),
              city_name TEXT,
              airport_name TEXT
            );
        `);
        
        // Global carriers database table
        await client.query(`
            CREATE TABLE IF NOT EXISTS global_carriers (
              id SERIAL PRIMARY KEY,
              iata VARCHAR(10),
              company_name TEXT,
              country_or_territory TEXT
            );
        `);

        // Global geocoding cache table
        await client.query(`
            CREATE TABLE IF NOT EXISTS geocoding_cache (
              query TEXT PRIMARY KEY,
              results JSONB NOT NULL,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Add GIN indexes on JSONB tables to address latency and fast query filters
        console.log('Creating database indexes on core tables...');
        await client.query('CREATE INDEX IF NOT EXISTS idx_trips_data ON trips USING gin (data)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_users_data ON users USING gin (data)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_flights_data ON flights USING gin (data)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_events_data ON events USING gin (data)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_configs_data ON configs USING gin (data)');
        
        // Speed up authentications by creating a functional index on the lowered email key
        await client.query("CREATE INDEX IF NOT EXISTS idx_users_email ON users ((LOWER(data->>'email')))");
        
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

const loadGlobalData = async () => {
  try {
    console.log('Loading global memory caches from PostgreSQL database... (eliminating raw GitHub web requests on startup)');
    
    const airportsRes = await pool.query('SELECT iata, city_name, airport_name FROM global_airports');
    let apCount = 0;
    airportsRes.rows.forEach(row => {
        const iata = (row.iata || '').trim().toUpperCase();
        if (iata) {
            memoryAirports.set(iata, {
                iata,
                city_name: row.city_name || '',
                airport_name: row.airport_name || ''
            });
            apCount++;
        }
    });
    console.log(`Successfully preloaded ${apCount} airports from PostgreSQL database into fast RAM cache.`);

    const carriersRes = await pool.query('SELECT iata, company_name, country_or_territory FROM global_carriers');
    let crCount = 0;
    carriersRes.rows.forEach(row => {
        const iata = (row.iata || '').trim().toUpperCase();
        if (iata) {
            memoryCarriers.set(iata, {
                iata,
                company_name: row.company_name || '',
                country_or_territory: row.country_or_territory || ''
            });
            crCount++;
        }
    });
    console.log(`Successfully preloaded ${crCount} carriers from PostgreSQL database into fast RAM cache.`);

  } catch (err) {
    console.warn('Failed to load global datasets from PG database to memory cache; making lazy network fallback fetch...', err.message);
    // If table is empty or query fails, run the Raw GitHub fetch in the background as a fail-safe fallback
    try {
        console.log('Fetching & parsing global carriers from GitHub (fail-safe recovery)...');
        const carrierResponse = await fetch('https://raw.githubusercontent.com/dlubom/iata_code_fetcher/main/carrier_data_full_processed.jsonl');
        if (carrierResponse.ok) {
          const text = await carrierResponse.text();
          const lines = text.split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const item = JSON.parse(line);
              const iata = (item.iata || '').trim().toUpperCase();
              if (iata) {
                memoryCarriers.set(iata, {
                  iata,
                  company_name: item.company_name || '',
                  country_or_territory: item.country_or_territory || ''
                });
              }
            } catch (e) {}
          }
        }
        
        console.log('Fetching & parsing global airports from GitHub (fail-safe recovery)...');
        const airResponse = await fetch('https://raw.githubusercontent.com/dlubom/iata_code_fetcher/main/airport_data_full_processed.jsonl');
        if (airResponse.ok) {
          const text = await airResponse.text();
          const lines = text.split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const item = JSON.parse(line);
              const iata = (item.iata || '').trim().toUpperCase();
              if (iata) {
                memoryAirports.set(iata, {
                  iata,
                  city_name: item.city_name || '',
                  airport_name: item.airport_name || ''
                });
              }
            } catch (e) {}
          }
        }
    } catch (fallbackErr) {
        console.error('Unified preloading failed entirely:', fallbackErr);
    }
  }
};

// Scheduled weekly background dataset synchronization task
const startBackgroundScheduler = () => {
  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  setInterval(async () => {
    console.log('[SCHEDULER] Running background datasets synchronization task...');
    try {
      const response = await fetch('https://raw.githubusercontent.com/dlubom/iata_code_fetcher/main/airport_data_full_processed.jsonl');
      if (response.ok) {
        const text = await response.text();
        const lines = text.split('\n').filter(Boolean);
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          // Truncate and rewrite to keep them completely updated cleanly
          await client.query('TRUNCATE TABLE global_airports RESTART IDENTITY');
          const chunkSize = 500;
          for (let i = 0; i < lines.length; i += chunkSize) {
            const chunk = lines.slice(i, i + chunkSize);
            const values = [];
            const params = [];
            chunk.forEach((line, idx) => {
              try {
                const item = JSON.parse(line);
                if (item.iata) {
                  values.push(`($${idx * 3 + 1}, $${idx * 3 + 2}, $${idx * 3 + 3})`);
                  params.push(item.iata.trim().toUpperCase(), item.city_name || '', item.airport_name || '');
                }
              } catch (err) {}
            });
            if (values.length > 0) {
              await client.query(`INSERT INTO global_airports (iata, city_name, airport_name) VALUES ${values.join(', ')}`, params);
            }
          }
          await client.query('COMMIT');
          console.log('[SCHEDULER] global_airports table synchronized successfully.');
        } finally {
          client.release();
        }
      }
      
      // Sync carriers too
      const carrierRes = await fetch('https://raw.githubusercontent.com/dlubom/iata_code_fetcher/main/carrier_data_full_processed.jsonl');
      if (carrierRes.ok) {
        const text = await carrierRes.text();
        const lines = text.split('\n').filter(Boolean);
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('TRUNCATE TABLE global_carriers RESTART IDENTITY');
          const chunkSize = 500;
          for (let i = 0; i < lines.length; i += chunkSize) {
            const chunk = lines.slice(i, i + chunkSize);
            const values = [];
            const params = [];
            chunk.forEach((line, idx) => {
              try {
                const item = JSON.parse(line);
                if (item.iata) {
                  values.push(`($${idx * 3 + 1}, $${idx * 3 + 2}, $${idx * 3 + 3})`);
                  params.push(item.iata.trim().toUpperCase(), item.company_name || '', item.country_or_territory || '');
                }
              } catch (err) {}
            });
            if (values.length > 0) {
              await client.query(`INSERT INTO global_carriers (iata, company_name, country_or_territory) VALUES ${values.join(', ')}`, params);
            }
          }
          await client.query('COMMIT');
          console.log('[SCHEDULER] global_carriers table synchronized successfully.');
        } finally {
          client.release();
        }
      }
      
      // Reload updated records back into RAM memory caches safely
      await loadGlobalData();
      console.log('[SCHEDULER] Background dataset synchronization complete and RAM caches reloaded.');
    } catch (err) {
      console.error('[SCHEDULER] Failed scheduled synchronization run:', err.message);
    }
  }, ONE_WEEK_MS);
};

  let client;
  try {
    client = await pool.connect();
    
    // Check if airports table is empty
    const airportsCount = await client.query('SELECT COUNT(*) FROM global_airports');
    const countAirports = parseInt(airportsCount.rows[0].count, 10);
    
    if (countAirports === 0) {
      console.log('Prepopulating global_airports from GitHub...');
      const response = await fetch('https://raw.githubusercontent.com/dlubom/iata_code_fetcher/main/airport_data_full_processed.jsonl');
      if (response.ok) {
        const text = await response.text();
        const lines = text.split('\n').filter(Boolean);
        console.log(`Downloaded ${lines.length} airports; parsing & inserting chunks...`);
        
        await client.query('BEGIN');
        const chunkSize = 500;
        for (let i = 0; i < lines.length; i += chunkSize) {
          const chunk = lines.slice(i, i + chunkSize);
          const values = [];
          const params = [];
          
          chunk.forEach((line, idx) => {
            try {
              const item = JSON.parse(line);
              if (item.iata) {
                const iata = item.iata.trim().toUpperCase();
                const city = item.city_name || '';
                const airport = item.airport_name || '';
                values.push(`($${idx * 3 + 1}, $${idx * 3 + 2}, $${idx * 3 + 3})`);
                params.push(iata, city, airport);
              }
            } catch (err) {}
          });
          
          if (values.length > 0) {
            await client.query(`
              INSERT INTO global_airports (iata, city_name, airport_name)
              VALUES ${values.join(', ')}
            `, params);
          }
        }
        await client.query('COMMIT');
        
        console.log('Creating database indexes on global_airports...');
        await client.query('CREATE INDEX IF NOT EXISTS idx_airports_iata ON global_airports(iata)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_airports_city_name ON global_airports(city_name)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_airports_airport_name ON global_airports(airport_name)');
        console.log('Successfully pre-populated global_airports!');
      } else {
        console.error('Failed to download airports file from GitHub. Status:', response.status);
      }
    } else {
      console.log(`global_airports already pre-populated with ${countAirports} records.`);
    }
    
    // Check if carriers table is empty
    const carriersCount = await client.query('SELECT COUNT(*) FROM global_carriers');
    const countCarriers = parseInt(carriersCount.rows[0].count, 10);
    
    if (countCarriers === 0) {
      console.log('Prepopulating global_carriers from GitHub...');
      const response = await fetch('https://raw.githubusercontent.com/dlubom/iata_code_fetcher/main/carrier_data_full_processed.jsonl');
      if (response.ok) {
        const text = await response.text();
        const lines = text.split('\n').filter(Boolean);
        console.log(`Downloaded ${lines.length} carriers; parsing & inserting chunks...`);
        
        await client.query('BEGIN');
        const chunkSize = 500;
        for (let i = 0; i < lines.length; i += chunkSize) {
          const chunk = lines.slice(i, i + chunkSize);
          const values = [];
          const params = [];
          
          chunk.forEach((line, idx) => {
            try {
              const item = JSON.parse(line);
              const iata = (item.iata || '').trim().toUpperCase();
              const name = item.company_name || '';
              const country = item.country_or_territory || '';
              if (iata || name) {
                values.push(`($${idx * 3 + 1}, $${idx * 3 + 2}, $${idx * 3 + 3})`);
                params.push(iata, name, country);
              }
            } catch (err) {}
          });
          
          if (values.length > 0) {
            await client.query(`
              INSERT INTO global_carriers (iata, company_name, country_or_territory)
              VALUES ${values.join(', ')}
            `, params);
          }
        }
        await client.query('COMMIT');
        
        console.log('Creating database indexes on global_carriers...');
        await client.query('CREATE INDEX IF NOT EXISTS idx_carriers_iata ON global_carriers(iata)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_carriers_company_name ON global_carriers(company_name)');
        console.log('Successfully pre-populated global_carriers!');
      } else {
        console.error('Failed to download carriers file from GitHub. Status:', response.status);
      }
    } else {
      console.log(`global_carriers already pre-populated with ${countCarriers} records.`);
    }
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (e) {}
    }
    console.error('Error pre-populating global databases:', err);
  } finally {
    if (client) client.release();
  }
};

initDb().then(() => {
  loadGlobalData()
    .then(() => {
        // Start background weekly datasets synchronization task once server caches are loaded
        startBackgroundScheduler();
    })
    .catch(err => console.error('Error in background data load:', err));
}).catch(err => {
  console.error('Failed to initialize database after multiple retries. Server can still start, but database operations will fail:', err.message);
});

// --- Generic CRUD Handlers ---

const getResources = (table) => async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT data FROM ${table}`);
    res.json(rows.map(r => r.data));
  } catch (err) {
    sendError(res, err, 500, `Failed to retrieve ${table}`);
  }
};

const createResource = (table) => async (req, res) => {
  const resource = req.body;
  if (!resource.id) return res.status(400).json({ error: 'ID is required' });
  
  try {
    await pool.query(
      `INSERT INTO ${table} (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`,
      [resource.id, JSON.stringify(resource)]
    );
    res.status(201).json(resource);
  } catch (err) {
    sendError(res, err, 500, `Failed to create ${table}`);
  }
};

const updateResource = (table) => async (req, res) => {
  const { id } = req.params;
  const resource = req.body;
  
  try {
    await pool.query(
      `INSERT INTO ${table} (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`,
      [id, JSON.stringify(resource)]
    );
    res.json(resource);
  } catch (err) {
    sendError(res, err, 500, `Failed to update ${table}`);
  }
};

const deleteResource = (table) => async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err, 500, `Failed to delete ${table}`);
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

// Proxy for Geocoding (Bypasses CORS, caches in PostgreSQL, enforces strict 3s timeout)
app.get('/api/proxy/geocoding', async (req, res) => {
    const { q } = req.query;
    if (!q || !q.trim()) {
        return res.json([]);
    }
    const trimmedQ = q.trim().toLowerCase();
    
    try {
        // 1. Check persistent PostgreSQL geocoding database cache first
        const cacheLookup = await pool.query('SELECT results FROM geocoding_cache WHERE query = $1', [trimmedQ]);
        if (cacheLookup.rows.length > 0) {
            res.set('X-Cache', 'HIT');
            return res.json(cacheLookup.rows[0].results);
        }
    } catch (dbErr) {
        console.warn("Geocoding database cache lookup failed:", dbErr.message);
    }

    // 2. Fetch from OpenMeteo geocoding API with robust 3-second timeout abort protection
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, 3000);

    try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trimmedQ)}&count=10&language=en&format=json`;
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Open-Meteo returned status ${response.status}`);
        }

        const data = await response.json();
        const results = data.results || [];

        // 3. Keep results cached in DB for subsequent instantaneous requests (0ms latency)
        try {
            await pool.query(
                'INSERT INTO geocoding_cache (query, results) VALUES ($1, $2) ON CONFLICT (query) DO UPDATE SET results = $2',
                [trimmedQ, JSON.stringify(results)]
            );
        } catch (dbWriteErr) {
            console.warn("Could not write geocoding result to cache:", dbWriteErr.message);
        }

        res.set('X-Cache', 'MISS');
        res.json(results);
    } catch (err) {
        clearTimeout(timeoutId);
        console.error("Geocoding api error or timeout:", err.message);
        // Fast-fail: return empty results instead of hanging of freezing the client UI
        res.json([]);
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
        res.json({ status: 'ok', database: 'connected' });
    } catch (err) {
        res.status(500).json({ status: 'error', database: 'disconnected', message: err.message });
    }
});

// Authentication
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
        if (!verifyPassword(password, user.password)) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const responseUser = { ...user };
        delete responseUser.password;
        
        const tokenUser = { id: responseUser.id, email: responseUser.email, role: responseUser.role };
        const token = jwt.sign(tokenUser, JWT_SECRET, { expiresIn: '7d' });
        
        res.json({ user: responseUser, token });
    } catch (err) {
        sendError(res, err, 500, 'Authentication failed');
    }
});

app.post('/api/auth/register', async (req, res) => {
    const user = req.body;
    if (!user.email || !user.password || !user.id) {
        return res.status(400).json({ error: 'User ID, Email, and Password are required' });
    }
    try {
        const { rows } = await pool.query(
            `SELECT 1 FROM users WHERE LOWER(data->>'email') = LOWER($1) LIMIT 1`,
            [user.email.trim()]
        );
        if (rows.length > 0) {
            return res.status(400).json({ error: 'User already exists' });
        }
        
        user.password = hashPassword(user.password);
        
        await pool.query(
            `INSERT INTO users (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`,
            [user.id, JSON.stringify(user)]
        );
        const responseUser = { ...user };
        delete responseUser.password;
        
        const tokenUser = { id: responseUser.id, email: responseUser.email, role: responseUser.role };
        const token = jwt.sign(tokenUser, JWT_SECRET, { expiresIn: '7d' });
        
        res.status(201).json({ user: responseUser, token });
    } catch (err) {
        sendError(res, err, 500, 'Registration failed');
    }
});

// Users
app.get('/api/users', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT data FROM users`);
        const users = rows.map(r => {
            const u = { ...r.data };
            delete u.password; // Strip passwords to prevent credential leaks over API
            return u;
        });
        res.json(users);
    } catch (err) {
        sendError(res, err, 500, 'Failed to fetch users');
    }
});

app.post('/api/users', async (req, res) => {
    const user = req.body;
    if (!user.id) return res.status(400).json({ error: 'ID is required' });
    
    try {
        if (user.password && !user.password.includes(':')) {
            user.password = hashPassword(user.password);
        }
        await pool.query(
            `INSERT INTO users (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`,
            [user.id, JSON.stringify(user)]
        );
        res.status(201).json(user);
    } catch (err) {
        sendError(res, err, 500, 'Failed to insert user');
    }
});

app.put('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const updatedUser = req.body;
    try {
        const { rows } = await pool.query(`SELECT data FROM users WHERE id = $1`, [id]);
        if (rows.length > 0) {
            const prevUser = rows[0].data;
            if (!updatedUser.password || updatedUser.password.trim() === '') {
                updatedUser.password = prevUser.password;
            } else if (updatedUser.password !== prevUser.password) {
                if (!updatedUser.password.includes(':')) {
                    updatedUser.password = hashPassword(updatedUser.password);
                }
            }
        } else if (updatedUser.password && !updatedUser.password.includes(':')) {
            updatedUser.password = hashPassword(updatedUser.password);
        }
        await pool.query(
            `INSERT INTO users (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`,
            [id, JSON.stringify(updatedUser)]
        );
        res.json(updatedUser);
    } catch (err) {
        sendError(res, err, 500, 'Failed to update user');
    }
});

app.delete('/api/users/:id', deleteResource('users'));

// Trips
app.get('/api/trips', getResources('trips'));
app.post('/api/trips', createResource('trips'));
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
app.put('/api/flights/:id', updateResource('flights'));
app.delete('/api/flights/:id', deleteResource('flights'));

// Settings (Singleton)
app.get('/api/settings', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT data FROM settings WHERE key = 'workspace'`);
        res.json(rows.length > 0 ? rows[0].data : {});
    } catch (err) {
        sendError(res, err, 500, 'Failed to retrieve workspace settings');
    }
});

app.put('/api/settings', async (req, res) => {
    try {
        const settings = req.body;
        await pool.query(
            `INSERT INTO settings (key, data) VALUES ('workspace', $1) ON CONFLICT (key) DO UPDATE SET data = $1`,
            [JSON.stringify(settings)]
        );
        res.json(settings);
    } catch (err) {
        sendError(res, err, 500, 'Failed to update workspace settings');
    }
});

// --- Background Job Manager & Supervisor Engine ---
const activeJobs = new Map();

function runBackgroundJob(jobType, taskFn) {
    const jobId = crypto.randomUUID();
    activeJobs.set(jobId, {
        id: jobId,
        type: jobType,
        status: 'Processing',
        progress: 10,
        result: null,
        error: null,
        createdAt: new Date().toISOString()
    });
    
    // Execute asynchronously (offloading from HTTP event phase)
    Promise.resolve().then(async () => {
        try {
            const updateProgress = (p) => {
                const job = activeJobs.get(jobId);
                if (job) {
                    job.progress = p;
                    activeJobs.set(jobId, job);
                }
            };

            const result = await taskFn(updateProgress);
            
            const job = activeJobs.get(jobId);
            if (job) {
                job.status = 'Completed';
                job.progress = 100;
                job.result = result;
                activeJobs.set(jobId, job);
            }
        } catch (err) {
            console.error(`Background Job [${jobId}] failed:`, err.message);
            const job = activeJobs.get(jobId);
            if (job) {
                job.status = 'Failed';
                job.progress = 100;
                job.error = err.message;
                activeJobs.set(jobId, job);
            }
        }
    });
    
    return jobId;
}

// Background Task Status Endpoint
app.get('/api/jobs/status/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = activeJobs.get(jobId);
    if (!job) {
        return res.status(404).json({ error: 'Background job not found' });
    }
    res.json(job);
});

// Immediately acknowledges the request with 'Processing' state while compiling heavy table states
app.post('/api/jobs/backup', (req, res) => {
    const jobId = runBackgroundJob('DATABASE_BACKUP', async (progress) => {
        const tables = ['users', 'trips', 'events', 'entitlements', 'configs', 'flights'];
        const backup = {};
        
        for (let i = 0; i < tables.length; i++) {
            const table = tables[i];
            const { rows } = await pool.query(`SELECT data FROM ${table}`);
            backup[table] = rows.map(r => r.data);
            progress(Math.round(20 + (i / tables.length) * 60)); // Stagger progress metric
        }
        
        const settingsRes = await pool.query(`SELECT data FROM settings WHERE key = 'workspace'`);
        backup.workspaceSettings = settingsRes.rows.length > 0 ? settingsRes.rows[0].data : {};
        progress(90);
        
        const cleanBackup = removeSensitiveData(backup);
        progress(100);
        return cleanBackup;
    });
    
    res.status(202).json({
        success: true,
        message: 'Database backup offloaded to background worker.',
        jobId,
        status: 'Processing'
    });
});

// Import/Export Full State
app.get('/api/backup', async (req, res) => {
    try {
        const tables = ['users', 'trips', 'events', 'entitlements', 'configs', 'flights'];
        const backup = {};
        
        for (const table of tables) {
            const { rows } = await pool.query(`SELECT data FROM ${table}`);
            backup[table] = rows.map(r => r.data);
        }
        
        const settingsRes = await pool.query(`SELECT data FROM settings WHERE key = 'workspace'`);
        backup.workspaceSettings = settingsRes.rows.length > 0 ? settingsRes.rows[0].data : {};
        
        const cleanBackup = removeSensitiveData(backup);
        res.json(cleanBackup);
    } catch (err) {
        sendError(res, err, 500, 'Failed to generate database backup');
    }
});

app.post('/api/restore', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const data = req.body;
        
        const tables = ['users', 'trips', 'events', 'entitlements', 'configs', 'flights'];
        for (const table of tables) {
            const existingItemsMap = new Map();
            try {
                const { rows } = await client.query(`SELECT id, data FROM ${table}`);
                rows.forEach(r => existingItemsMap.set(r.id, r.data));
            } catch (err) {
                console.warn(`Could not load existing items for merge: ${err.message}`);
            }

            await client.query(`TRUNCATE TABLE ${table}`);
            if (data[table] && Array.isArray(data[table])) {
                for (const item of data[table]) {
                    if (table === 'users') {
                        const existingUser = existingItemsMap.get(item.id);
                        if (!item.password) {
                            if (existingUser && existingUser.password) {
                                item.password = existingUser.password;
                            } else {
                                item.password = hashPassword('password');
                            }
                        }
                    }
                    await client.query(`INSERT INTO ${table} (id, data) VALUES ($1, $2)`, [item.id, JSON.stringify(item)]);
                }
            }
        }
        
        if (data.workspaceSettings) {
            let currentSettings = {};
            try {
                const settingsRes = await client.query(`SELECT data FROM settings WHERE key = 'workspace'`);
                if (settingsRes.rows.length > 0) {
                    currentSettings = settingsRes.rows[0].data;
                }
            } catch (err) {}

            const mergedSettings = { ...data.workspaceSettings };
            const keysToCheck = ['aviationStackApiKey', 'brandfetchApiKey', 'googleGeminiApiKey'];
            keysToCheck.forEach(k => {
                if (!mergedSettings[k] && currentSettings[k]) {
                    mergedSettings[k] = currentSettings[k];
                }
            });

            await client.query(
                `INSERT INTO settings (key, data) VALUES ('workspace', $1) ON CONFLICT (key) DO UPDATE SET data = $1`,
                [JSON.stringify(mergedSettings)]
            );
        }
        
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        sendError(res, err, 500, 'Failed to restore database backup');
    } finally {
        client.release();
    }
});

app.post('/api/wipe', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Truncate all tables
        const tables = ['users', 'trips', 'events', 'entitlements', 'configs', 'flights', 'settings'];
        for (const table of tables) {
            await client.query(`TRUNCATE TABLE ${table} CASCADE`);
        }
        
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        sendError(res, err, 500, 'Failed to wipe database content');
    } finally {
        client.release();
    }
});

// Serve React App
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client_build', 'index.html'));
});

const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// --- Graceful Shutdown Handler ---
const gracefulShutdown = async (signal) => {
    console.warn(`[SYSTEM] Received ${signal}. Initiating graceful shutdown...`);
    
    // Close the Express HTTP Server first so we stop taking new incoming traffic
    if (server) {
        server.close(() => {
            console.log('[SYSTEM] Active HTTP server sessions closed.');
        });
    }

    // Terminate connection pools cleanly
    try {
        await pool.end();
        console.log('[SYSTEM] PostgreSQL connection pool terminated cleanly.');
    } catch (err) {
        console.error('[SYSTEM] Error closing database connection pool:', err.message);
    }

    console.warn('[SYSTEM] Graceful shutdown completed. Exiting.');
    process.exit(0);
};

// Listen for lifecycle signals emitted by modern orchestration engines (e.g., Kubernetes, Cloud Run, Docker)
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
