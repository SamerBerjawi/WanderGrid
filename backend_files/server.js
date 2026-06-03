
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
    
    const fullPath = req.baseUrl + req.path;
    
    // Bypass authentication for public paths and calendar feeds
    const isPublic = publicPaths.some(p => fullPath === p) || (fullPath.startsWith('/api/calendar/') && fullPath.endsWith('/feed.ics'));
    
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
const FLIGHT_CACHE_TTL_MS = process.env.API_CACHE_TTL_MS 
    ? parseInt(process.env.API_CACHE_TTL_MS, 10) 
    : 5 * 60 * 1000;
const flightCache = new Map();

const GEOCODE_CACHE_TTL_MS = process.env.GEOCODE_CACHE_TTL_MS
    ? parseInt(process.env.GEOCODE_CACHE_TTL_MS, 10)
    : 30 * 24 * 60 * 60 * 1000; // 30 days default

const EXTERNAL_FETCH_TIMEOUT_MS = process.env.EXTERNAL_FETCH_TIMEOUT_MS
    ? parseInt(process.env.EXTERNAL_FETCH_TIMEOUT_MS, 10)
    : 3000; // 3 seconds default

// Global memory caches as robust fail-safe fallbacks
const memoryAirports = new Map();
const memoryCarriers = new Map();

let dbReady = false;

// Database Connection with environment-configurable limits
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: process.env.DB_POOL_SIZE ? parseInt(process.env.DB_POOL_SIZE, 10) : 20,
  idleTimeoutMillis: 30000, // Reclaim idle clients back to pool after 30s
  connectionTimeoutMillis: process.env.DB_CONNECTION_TIMEOUT_MS ? parseInt(process.env.DB_CONNECTION_TIMEOUT_MS, 10) : 5000,
  statement_timeout: process.env.DB_STATEMENT_TIMEOUT_MS ? parseInt(process.env.DB_STATEMENT_TIMEOUT_MS, 10) : 10000,
  query_timeout: process.env.DB_STATEMENT_TIMEOUT_MS ? parseInt(process.env.DB_STATEMENT_TIMEOUT_MS, 10) : 10000
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL pool client:', err);
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
        const tables = ['users', 'trips', 'events', 'entitlements', 'configs', 'flights', 'visited'];
        
        for (const table of tables) {
          await client.query(`
            CREATE TABLE IF NOT EXISTS ${table} (
              id TEXT PRIMARY KEY CHECK (id <> ''),
              data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object')
            );
          `);
        }

        // Settings is a singleton, key-value store
        await client.query(`
            CREATE TABLE IF NOT EXISTS settings (
              key TEXT PRIMARY KEY CHECK (key <> ''),
              data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object')
            );
        `);

        // Global airports database table
        await client.query(`
            CREATE TABLE IF NOT EXISTS global_airports (
              id SERIAL PRIMARY KEY,
              iata VARCHAR(10) CHECK (iata <> ''),
              city_name TEXT,
              airport_name TEXT
            );
        `);
        
        // Global carriers database table
        await client.query(`
            CREATE TABLE IF NOT EXISTS global_carriers (
              id SERIAL PRIMARY KEY,
              iata VARCHAR(10) CHECK (iata <> ''),
              company_name TEXT,
              country_or_territory TEXT
            );
        `);

        // Global geocoding cache table
        await client.query(`
            CREATE TABLE IF NOT EXISTS geocoding_cache (
              query TEXT PRIMARY KEY CHECK (query <> ''),
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
        
        // Strict Unique Functional User Email Index (Unique user email index)
        await client.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users ((LOWER(data->>'email'))) WHERE (data->>'email' IS NOT NULL)");
        
        // Trip Field Performance Indexes
        await client.query("CREATE INDEX IF NOT EXISTS idx_trips_status ON trips ((data->>'status'))");
        await client.query("CREATE INDEX IF NOT EXISTS idx_trips_start_date ON trips ((data->>'startDate'))");
        await client.query("CREATE INDEX IF NOT EXISTS idx_trips_end_date ON trips ((data->>'endDate'))");
        await client.query("CREATE INDEX IF NOT EXISTS idx_trips_privacy ON trips ((data->>'privacy'))");

        // Flight Field Performance Indexes
        await client.query("CREATE INDEX IF NOT EXISTS idx_flights_departure_date ON flights ((data->>'departureDate'))");
        await client.query("CREATE INDEX IF NOT EXISTS idx_flights_provider_identifier ON flights ((data->>'provider'), (data->>'identifier'))");

        // Global Airport/Carrier Lookup Indexes
        await client.query("CREATE INDEX IF NOT EXISTS idx_global_airports_iata ON global_airports (iata)");
        await client.query("CREATE INDEX IF NOT EXISTS idx_global_carriers_iata ON global_carriers (iata)");

        // Geocode Cache Indexes
        await client.query("CREATE INDEX IF NOT EXISTS idx_geocoding_cache_created_at ON geocoding_cache (created_at)");
        
        console.log('Database schema initialized successfully!');

        // Startup db confirmation
        console.log('Database initialization check completed: Users table ready for enrollment.');
        dbReady = true;

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
    
    // Clear any potentially contaminated geocoding cache records for BER, MAN, and TUN to restore correct city mappings.
    try {
        await pool.query("DELETE FROM geocoding_cache WHERE query IN ('ber', 'ber airport', 'man', 'man airport', 'manchester', 'tun', 'tun airport', 'tunis', 'tunis, tunisia', 'tunis carthage', 'tunis carthage airport')");
        console.log('[SYSTEM-CLEANUP] Cleaned up any potentially contaminated geocoding_cache values for BER, MAN, and TUN.');
    } catch (cleanErr) {
        console.warn('System cleanup query failed:', cleanErr.message);
    }
    
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
let schedulerInterval;

const startBackgroundScheduler = () => {
  const defaultInterval = 7 * 24 * 60 * 60 * 1000;
  const refreshIntervalMs = process.env.GLOBAL_DATA_REFRESH_MS
    ? parseInt(process.env.GLOBAL_DATA_REFRESH_MS, 10)
    : defaultInterval;
  
  console.log(`[SCHEDULER] Setting up background datasets synchronization task to run every ${refreshIntervalMs}ms.`);
  
  schedulerInterval = setInterval(async () => {
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
  }, refreshIntervalMs);
};

const prepopulateDatabases = async () => {
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
  prepopulateDatabases()
    .then(() => {
      loadGlobalData()
        .then(() => {
            // Start background weekly datasets synchronization task once server caches are loaded
            startBackgroundScheduler();
        })
        .catch(err => console.error('Error in background data load:', err));
    })
    .catch(err => console.error('Error in prepopulating database:', err));
}).catch(err => {
  console.error('Failed to initialize database after multiple retries. Server can still start, but database operations will fail:', err.message);
});

// --- Generic CRUD Handlers & Transactions ---

async function withTransaction(callback) {
  const maxRetries = 3;
  let attempt = 0;
  while (attempt < maxRetries) {
    attempt++;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('Error during rollback:', rollbackErr);
      }
      
      const isRetryable = err.code === '40001' || err.code === '40P01';
      if (isRetryable && attempt < maxRetries) {
        console.warn(`Database transaction retryable error ${err.code}, retrying attempt ${attempt}...`);
        await new Promise(resolve => setTimeout(resolve, 50 * attempt));
        continue;
      }
      throw err;
    } finally {
      client.release();
    }
  }
}

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
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO ${table} (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`,
        [resource.id, JSON.stringify(resource)]
      );
    });
    res.status(201).json(resource);
  } catch (err) {
    sendError(res, err, 500, `Failed to create ${table}`);
  }
};

const updateResource = (table) => async (req, res) => {
  const { id } = req.params;
  const resource = req.body;
  
  try {
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO ${table} (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`,
        [id, JSON.stringify(resource)]
      );
    });
    res.json(resource);
  } catch (err) {
    sendError(res, err, 500, `Failed to update ${table}`);
  }
};

const deleteResource = (table) => async (req, res) => {
  const { id } = req.params;
  try {
    await withTransaction(async (client) => {
      await client.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    });
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

// Local Airport Database coordinates mapping for ultra-fast, zero-dependency geocoding
const STATIC_GEO_COORDS = {
    "AMS": { "lat": "52.3086", "lon": "4.7639", "name": "Schiphol", "city": "Amsterdam", "country": "Netherlands", "tz": "Europe/Amsterdam", "iso": "NL" },
    "LHR": { "lat": "51.4706", "lon": "-0.4619", "name": "Heathrow", "city": "London", "country": "United Kingdom", "tz": "Europe/London", "iso": "GB" },
    "MAN": { "lat": "53.3588", "lon": "-2.2728", "name": "Manchester Airport", "city": "Manchester", "country": "United Kingdom", "tz": "Europe/London", "iso": "GB" },
    "JFK": { "lat": "40.6398", "lon": "-73.7789", "name": "John F Kennedy Intl", "city": "New York", "country": "United States", "tz": "America/New_York", "iso": "US" },
    "DXB": { "lat": "25.2528", "lon": "55.3644", "name": "Dubai Intl", "city": "Dubai", "country": "United Arab Emirates", "tz": "Asia/Dubai", "iso": "AE" },
    "CDG": { "lat": "49.0097", "lon": "2.5478", "name": "Charles De Gaulle", "city": "Paris", "country": "France", "tz": "Europe/Paris", "iso": "FR" },
    "FRA": { "lat": "50.0333", "lon": "8.5706", "name": "Frankfurt am Main", "city": "Frankfurt", "country": "Germany", "tz": "Europe/Berlin", "iso": "DE" },
    "BER": { "lat": "52.3667", "lon": "13.5033", "name": "Berlin Brandenburg", "city": "Berlin", "country": "Germany", "tz": "Europe/Berlin", "iso": "DE" },
    "VIE": { "lat": "48.1103", "lon": "16.5697", "name": "Vienna Intl", "city": "Vienna", "country": "Austria", "tz": "Europe/Vienna", "iso": "AT" },
    "SIN": { "lat": "1.3502", "lon": "103.994", "name": "Changi Intl", "city": "Singapore", "country": "Singapore", "tz": "Asia/Singapore", "iso": "SG" },
    "HKG": { "lat": "22.3089", "lon": "113.915", "name": "Hong Kong Intl", "city": "Hong Kong", "country": "Hong Kong", "tz": "Asia/Hong_Kong", "iso": "HK" },
    "HND": { "lat": "35.5523", "lon": "139.78", "name": "Haneda", "city": "Tokyo", "country": "Japan", "tz": "Asia/Tokyo", "iso": "JP" },
    "SYD": { "lat": "-33.9461", "lon": "151.177", "name": "Kingsford Smith", "city": "Sydney", "country": "Australia", "tz": "Australia/Sydney", "iso": "AU" },
    "BEY": { "lat": "33.82", "lon": "35.49", "name": "Beirut Airport", "city": "Beirut", "country": "Lebanon", "tz": "Asia/Beirut", "iso": "LB" },
    "PRG": { "lat": "50.10", "lon": "14.26", "name": "Prague Airport", "city": "Prague", "country": "Czechia", "tz": "Europe/Prague", "iso": "CZ" },
    "BCN": { "lat": "41.29", "lon": "2.07", "name": "Barcelona Airport", "city": "Barcelona", "country": "Spain", "tz": "Europe/Madrid", "iso": "ES" },
    "ORD": { "lat": "41.97", "lon": "-87.90", "name": "O'Hare Airport", "city": "Chicago", "country": "United States", "tz": "America/Chicago", "iso": "US" },
    "DTW": { "lat": "42.21", "lon": "-83.35", "name": "Detroit Airport", "city": "Detroit", "country": "United States", "tz": "America/Detroit", "iso": "US" },
    "IAD": { "lat": "38.95", "lon": "-77.45", "name": "Dulles Airport", "city": "Washington D.C.", "country": "United States", "tz": "America/New_York", "iso": "US" },
    "GRR": { "lat": "42.88", "lon": "-85.52", "name": "Grand Rapids Airport", "city": "Grand Rapids", "country": "United States", "tz": "America/New_York", "iso": "US" },
    "ATL": { "lat": "33.64", "lon": "-84.42", "name": "Atlanta Airport", "city": "Atlanta", "country": "United States", "tz": "America/New_York", "iso": "US" },
    "AMM": { "lat": "31.72", "lon": "35.99", "name": "Queen Alia Airport", "city": "Amman", "country": "Jordan", "tz": "Asia/Amman", "iso": "JO" },
    "TUN": { "lat": "36.85", "lon": "10.22", "name": "Tunis Airport", "city": "Tunis", "country": "Tunisia", "tz": "Africa/Tunis", "iso": "TN" },
    "DJE": { "lat": "33.86", "lon": "10.77", "name": "Djerba Airport", "city": "Djerba", "country": "Tunisia", "tz": "Africa/Tunis", "iso": "TN" },
    "SAW": { "lat": "40.89", "lon": "29.30", "name": "Sabiha Gökçen Airport", "city": "Istanbul", "country": "Turkey", "tz": "Europe/Istanbul", "iso": "TR" },
    "IST": { "lat": "41.27", "lon": "28.74", "name": "Istanbul Airport", "city": "Istanbul", "country": "Turkey", "tz": "Europe/Istanbul", "iso": "TR" },
    "ISL": { "lat": "41.27", "lon": "28.74", "name": "Atatürk Airport", "city": "Istanbul", "country": "Turkey", "tz": "Europe/Istanbul", "iso": "TR" },
    "CPH": { "lat": "55.61", "lon": "12.65", "name": "Copenhagen Airport", "city": "Copenhagen", "country": "Denmark", "tz": "Europe/Copenhagen", "iso": "DK" },
    "LIS": { "lat": "38.77", "lon": "-9.13", "name": "Lisbon Airport", "city": "Lisbon", "country": "Portugal", "tz": "Europe/Lisbon", "iso": "PT" },
    "ATH": { "lat": "37.93", "lon": "23.94", "name": "Athens Airport", "city": "Athens", "country": "Greece", "tz": "Europe/Athens", "iso": "GR" },
    "MCT": { "lat": "23.59", "lon": "58.28", "name": "Muscat Airport", "city": "Muscat", "country": "Oman", "tz": "Asia/Muscat", "iso": "OM" },
    "AUH": { "lat": "24.43", "lon": "54.65", "name": "Abu Dhabi Airport", "city": "Abu Dhabi", "country": "United Arab Emirates", "tz": "Asia/Dubai", "iso": "AE" },
    "PSA": { "lat": "43.68", "lon": "10.39", "name": "Pisa Airport", "city": "Pisa", "country": "Italy", "tz": "Europe/Rome", "iso": "IT" },
    "SXF": { "lat": "52.38", "lon": "13.52", "name": "Schönefeld Airport", "city": "Berlin", "country": "Germany", "tz": "Europe/Berlin", "iso": "DE" },
    "FLR": { "lat": "43.81", "lon": "11.20", "name": "Florence Airport", "city": "Florence", "country": "Italy", "tz": "Europe/Rome", "iso": "IT" },
    "OTP": { "lat": "44.57", "lon": "26.10", "name": "Otopeni Airport", "city": "Bucharest", "country": "Romania", "tz": "Europe/Bucharest", "iso": "RO" },
    "BRU": { "lat": "50.90", "lon": "4.48", "name": "Brussels Airport", "city": "Brussels", "country": "Belgium", "tz": "Europe/Brussels", "iso": "BE" },
    "LCA": { "lat": "34.87", "lon": "33.62", "name": "Larnaca Airport", "city": "Larnaca", "country": "Cyprus", "tz": "Asia/Nicosia", "iso": "CY" },
    "CRL": { "lat": "50.45", "lon": "4.45", "name": "Charleroi Airport", "city": "Brussels", "country": "Belgium", "tz": "Europe/Brussels", "iso": "BE" },
    "ZRH": { "lat": "47.46", "lon": "8.54", "name": "Zurich Airport", "city": "Zurich", "country": "Switzerland", "tz": "Europe/Zurich", "iso": "CH" },
    "NCE": { "lat": "43.66", "lon": "7.21", "name": "Nice Airport", "city": "Nice", "country": "France", "tz": "Europe/Paris", "iso": "FR" },
    "WAW": { "lat": "52.16", "lon": "20.96", "name": "Chopin Airport", "city": "Warsaw", "country": "Poland", "tz": "Europe/Warsaw", "iso": "PL" },
    "KUL": { "lat": "2.74", "lon": "101.70", "name": "Kuala Lumpur Airport", "city": "Kuala Lumpur", "country": "Malaysia", "tz": "Asia/Kuala_Lumpur", "iso": "MY" },
    "LGK": { "lat": "6.32", "lon": "99.73", "name": "Langkawi Airport", "city": "Langkawi", "country": "Malaysia", "tz": "Asia/Kuala_Lumpur", "iso": "MY" },
    "DPS": { "lat": "-8.74", "lon": "115.16", "name": "Ngurah Rai Airport", "city": "Bali", "country": "Indonesia", "tz": "Asia/Makassar", "iso": "ID" },
    "FCO": { "lat": "41.80", "lon": "12.24", "name": "Fiumicino Airport", "city": "Rome", "country": "Italy", "tz": "Europe/Rome", "iso": "IT" },
    "NAP": { "lat": "40.88", "lon": "14.29", "name": "Naples Airport", "city": "Naples", "country": "Italy", "tz": "Europe/Rome", "iso": "IT" },
    "OPO": { "lat": "41.24", "lon": "-8.67", "name": "Porto Airport", "city": "Porto", "country": "Portugal", "tz": "Europe/Lisbon", "iso": "PT" },
    "BUD": { "lat": "47.43", "lon": "19.26", "name": "Ferenc Liszt Airport", "city": "Budapest", "country": "Hungary", "tz": "Europe/Budapest", "iso": "HU" },
    "TFS": { "lat": "28.04", "lon": "-16.57", "name": "Tenerife South Airport", "city": "Tenerife", "country": "Spain", "tz": "Atlantic/Canary", "iso": "ES" },
    "LAX": { "lat": "33.94", "lon": "-118.40", "name": "Los Angeles Airport", "city": "Los Angeles", "country": "United States", "tz": "America/Los_Angeles", "iso": "US" },
    "SFO": { "lat": "37.62", "lon": "-122.37", "name": "San Francisco Airport", "city": "San Francisco", "country": "United States", "tz": "America/Los_Angeles", "iso": "US" },
    "ORY": { "lat": "48.72", "lon": "2.36", "name": "Orly Airport", "city": "Paris", "country": "France", "tz": "Europe/Paris", "iso": "FR" },
    "SOF": { "lat": "42.69", "lon": "23.41", "name": "Sofia Airport", "city": "Sofia", "country": "Bulgaria", "tz": "Europe/Sofia", "iso": "BG" },
    "AGP": { "lat": "36.67", "lon": "-4.49", "name": "Málaga Airport", "city": "Málaga", "country": "Spain", "tz": "Europe/Madrid", "iso": "ES" },
    "TLL": { "lat": "59.41", "lon": "24.83", "name": "Tallinn Airport", "city": "Tallinn", "country": "Estonia", "tz": "Europe/Tallinn", "iso": "EE" },
    "DUB": { "lat": "53.42", "lon": "-6.24", "name": "Dublin Airport", "city": "Dublin", "country": "Ireland", "tz": "Europe/Dublin", "iso": "IE" },
    "CLE": { "lat": "41.41", "lon": "-81.85", "name": "Cleveland Airport", "city": "Cleveland", "country": "United States", "tz": "America/New_York", "iso": "US" },
    "BRI": { "lat": "41.13", "lon": "16.76", "name": "Bari Airport", "city": "Bari", "country": "Italy", "tz": "Europe/Rome", "iso": "IT" },
    "CAI": { "lat": "30.12", "lon": "31.40", "name": "Cairo Airport", "city": "Cairo", "country": "Egypt", "tz": "Africa/Cairo", "iso": "EG" },
    "ASW": { "lat": "23.96", "lon": "32.81", "name": "Aswan Airport", "city": "Aswan", "country": "Egypt", "tz": "Africa/Cairo", "iso": "EG" },
    "LXR": { "lat": "25.67", "lon": "32.70", "name": "Luxor Airport", "city": "Luxor", "country": "Egypt", "tz": "Africa/Cairo", "iso": "EG" },
    "PDL": { "lat": "37.74", "lon": "-25.69", "name": "Ponta Delgada Airport", "city": "Azores", "country": "Portugal", "tz": "Atlantic/Azores", "iso": "PT" },
    "MAD": { "lat": "40.4839", "lon": "-3.5679", "name": "Adolfo Suárez Madrid-Barajas", "city": "Madrid", "country": "Spain", "tz": "Europe/Madrid", "iso": "ES" },
    "DOH": { "lat": "25.2611", "lon": "51.5650", "name": "Hamad Intl", "city": "Doha", "country": "Qatar", "tz": "Asia/Qatar", "iso": "QA" },
    "CMB": { "lat": "7.1807", "lon": "79.8837", "name": "Bandaranaike Intl", "city": "Colombo", "country": "Sri Lanka", "tz": "Asia/Colombo", "iso": "LK" },
    "PNH": { "lat": "11.5466", "lon": "104.8460", "name": "Phnom Penh Intl", "city": "Phnom Penh", "country": "Cambodia", "tz": "Asia/Phnom_Penh", "iso": "KH" },
    "ARN": { "lat": "59.6519", "lon": "17.9186", "name": "Stockholm Arlanda", "city": "Stockholm", "country": "Sweden", "tz": "Europe/Stockholm", "iso": "SE" },
    "Paris": { "lat": "48.8566", "lon": "2.3522", "city": "Paris", "country": "France", "iso": "FR" },
    "London": { "lat": "51.5074", "lon": "-0.1278", "city": "London", "country": "United Kingdom", "iso": "GB" },
    "New York": { "lat": "40.7128", "lon": "-74.0060", "city": "New York", "country": "United States", "iso": "US" },
    "Tokyo": { "lat": "35.6762", "lon": "139.6503", "city": "Tokyo", "country": "Japan", "iso": "JP" },
    "Dubai": { "lat": "25.2048", "lon": "55.2708", "city": "Dubai", "country": "United Arab Emirates", "iso": "AE" },
    "Rome": { "lat": "41.9028", "lon": "12.4964", "city": "Rome", "country": "Italy", "iso": "IT" },
    "Barcelona": { "lat": "41.3851", "lon": "2.1734", "city": "Barcelona", "country": "Spain", "iso": "ES" },
    "Berlin": { "lat": "52.5200", "lon": "13.4050", "city": "Berlin", "country": "Germany", "iso": "DE" },
    "Amsterdam": { "lat": "52.3676", "lon": "4.9041", "city": "Amsterdam", "country": "Netherlands", "iso": "NL" },
    "Brussels": { "lat": "50.8503", "lon": "4.3517", "city": "Brussels", "country": "Belgium", "iso": "BE" },
    "Singapore": { "lat": "1.3521", "lon": "103.8198", "city": "Singapore", "country": "Singapore", "iso": "SG" },
    "Bali": { "lat": "-8.4095", "lon": "115.1889", "city": "Denpasar", "country": "Indonesia", "iso": "ID" },
    "Sydney": { "lat": "-33.8688", "lon": "151.2093", "city": "Sydney", "country": "Australia", "iso": "AU" },
    "Madrid": { "lat": "40.4168", "lon": "-3.7038", "city": "Madrid", "country": "Spain", "iso": "ES" },
    "Doha": { "lat": "25.2854", "lon": "51.5310", "city": "Doha", "country": "Qatar", "iso": "QA" },
    "Sri Lanka": { "lat": "7.8731", "lon": "80.7718", "city": "Colombo", "country": "Sri Lanka", "iso": "LK" },
    "Colombo": { "lat": "6.9271", "lon": "79.8612", "city": "Colombo", "country": "Sri Lanka", "iso": "LK" },
    "Cambodia": { "lat": "12.5657", "lon": "104.9910", "city": "Phnom Penh", "country": "Cambodia", "iso": "KH" },
    "Phnom Penh": { "lat": "11.5564", "lon": "104.9282", "city": "Phnom Penh", "country": "Cambodia", "iso": "KH" },
    "Stockholm": { "lat": "59.3293", "lon": "18.0686", "city": "Stockholm", "country": "Sweden", "iso": "SE" },
    "Sweden": { "lat": "60.1282", "lon": "18.6435", "city": "Stockholm", "country": "Sweden", "iso": "SE" },
    "Tunis": { "lat": "36.8065", "lon": "10.1815", "city": "Tunis", "country": "Tunisia", "iso": "TN", "tz": "Africa/Tunis" },
    "Tunisia": { "lat": "33.8869", "lon": "9.5375", "city": "Tunis", "country": "Tunisia", "iso": "TN", "tz": "Africa/Tunis" }
};

// Search local static and prepopulated airport/city data offline-first before triggering external network calls
function searchLocalAirportData(q) {
    if (!q) return null;
    const queryLower = q.trim().toLowerCase();
    
    // A. Direct IATA exact 3-letter code lookup
    if (queryLower.length === 3) {
        const iataUpper = queryLower.toUpperCase();
        const gps = STATIC_GEO_COORDS[iataUpper];
        if (gps) {
            const details = memoryAirports.get(iataUpper);
            return [{
                name: details?.airport_name || gps.name || gps.city || iataUpper,
                latitude: parseFloat(gps.lat),
                longitude: parseFloat(gps.lon),
                country: gps.country || details?.country || '',
                country_code: gps.iso || '',
                timezone: gps.tz || 'UTC',
                admin1: details?.city_name || gps.city || ''
            }];
        }
        
        const details = memoryAirports.get(iataUpper);
        if (details) {
            return [{
                name: details.airport_name || details.city_name,
                latitude: 0,
                longitude: 0,
                country: details.country || '',
                country_code: '',
                timezone: 'UTC',
                admin1: details.city_name
            }];
        }
    }
    
    const results = [];

    // B. Search high-fidelity static airport coordinates first to be extremely fast and robust
    for (const [iata, gps] of Object.entries(STATIC_GEO_COORDS)) {
        if (iata.length === 3) {
            const iataLower = iata.toLowerCase();
            const cityLower = (gps.city || '').toLowerCase();
            const airportLower = (gps.name || '').toLowerCase();
            
            if (iataLower === queryLower || cityLower.includes(queryLower) || airportLower.includes(queryLower) || queryLower.includes(cityLower)) {
                const details = memoryAirports.get(iata);
                results.push({
                    name: details?.airport_name || gps.name || gps.city ? `${details?.airport_name || gps.name} (${iata})` : iata,
                    latitude: parseFloat(gps.lat),
                    longitude: parseFloat(gps.lon),
                    country: gps.country || details?.country || '',
                    country_code: gps.iso || '',
                    timezone: gps.tz || 'UTC',
                    admin1: details?.city_name || gps.city || ''
                });
            }
        }
    }

    // Secondary check of other in-memory database airports to ensure complete coverage
    for (const [iata, details] of memoryAirports.entries()) {
        const iataLower = iata.toLowerCase();
        const cityLower = (details.city_name || '').toLowerCase();
        const airportLower = (details.airport_name || '').toLowerCase();
        
        if (iataLower === queryLower || cityLower.includes(queryLower) || airportLower.includes(queryLower)) {
            // Only add if not already matched from static coords to avoid duplicates
            if (!results.some(r => r.name.includes(`(${iata})`))) {
                const gps = STATIC_GEO_COORDS[iata];
                results.push({
                    name: `${details.airport_name} (${iata})`,
                    latitude: gps ? parseFloat(gps.lat) : 0,
                    longitude: gps ? parseFloat(gps.lon) : 0,
                    country: gps?.country || '',
                    country_code: gps?.iso || '',
                    timezone: gps?.tz || 'UTC',
                    admin1: details.city_name
                });
            }
        }
    }
    
    // C. Search static city labels directly
    for (const [key, details] of Object.entries(STATIC_GEO_COORDS)) {
        if (key.length > 3 && (key.toLowerCase() === queryLower || queryLower.includes(key.toLowerCase()) || key.toLowerCase().includes(queryLower))) {
            // Avoid adding duplicate cities
            if (!results.some(r => r.name.toLowerCase() === (details.city || key).toLowerCase())) {
                results.push({
                    name: details.city || key,
                    latitude: parseFloat(details.lat),
                    longitude: parseFloat(details.lon),
                    country: details.country || '',
                    country_code: details.iso || '',
                    timezone: details.tz || 'UTC',
                    admin1: details.city || ''
                });
            }
        }
    }
    
    return results.length > 0 ? results : null;
}

// Single multi-endpoint controller supporting /api/proxy/geocoding and /api/geocode/search with PostgreSQL-backed caching
const handleGeocodingSearch = async (req, res) => {
    const { q } = req.query;
    if (!q || !q.trim()) {
        return res.json([]);
    }
    const trimmedQ = q.trim().toLowerCase();
    
    // 1. Search local airport data first beforehand to avoid external api/geocoding cache contamination for common trips & flights
    const localMatches = searchLocalAirportData(trimmedQ);
    if (localMatches) {
        res.set('X-Cache', 'LOCAL_AIRPORT');
        return res.json(localMatches);
    }

    try {
        // 2. Check persistent PostgreSQL geocoding database cache if not matched locally
        const cacheLookup = await pool.query('SELECT results, created_at FROM geocoding_cache WHERE query = $1', [trimmedQ]);
        if (cacheLookup.rows.length > 0) {
            const row = cacheLookup.rows[0];
            const age = Date.now() - new Date(row.created_at).getTime();
            if (age < GEOCODE_CACHE_TTL_MS) {
                res.set('X-Cache', 'HIT');
                return res.json(row.results);
            } else {
                console.log(`[GEOCODE] Cache expired for query: ${trimmedQ}`);
            }
        }
    } catch (dbErr) {
        console.warn("Geocoding database cache lookup failed:", dbErr.message);
    }

    // 3. Fetch from OpenMeteo geocoding API with robust timeout abort protection
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, EXTERNAL_FETCH_TIMEOUT_MS);

    try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trimmedQ)}&count=10&language=en&format=json`;
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Open-Meteo returned status ${response.status}`);
        }

        const data = await response.json();
        const results = data.results || [];

        // Fill in defaults for coordinates mapping so results match formatting
        const formattedResults = results.map(item => ({
            name: item.name,
            latitude: item.latitude,
            longitude: item.longitude,
            country: item.country || '',
            country_code: item.country_code || '',
            timezone: item.timezone || 'UTC',
            admin1: item.admin1 || ''
        }));

        // 4. Keep results cached in DB for subsequent instantaneous requests (0ms latency)
        try {
            await pool.query(
                'INSERT INTO geocoding_cache (query, results) VALUES ($1, $2) ON CONFLICT (query) DO UPDATE SET results = $2',
                [trimmedQ, JSON.stringify(formattedResults)]
            );
        } catch (dbWriteErr) {
            console.warn("Could not write geocoding result to cache:", dbWriteErr.message);
        }

        res.set('X-Cache', 'MISS');
        res.json(formattedResults);
    } catch (err) {
        clearTimeout(timeoutId);
        console.error("Geocoding API error or timeout:", err.message);
        // Fast-fail: return empty results instead of hanging or freezing the client UI
        res.json([]);
    }
};

// Route handlers for geocoding search
app.get('/api/proxy/geocoding', handleGeocodingSearch);
app.get('/api/geocode/search', handleGeocodingSearch);

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
        res.json({ 
            status: dbReady ? 'ok' : 'initializing', 
            database: 'connected', 
            dbReady,
            pool: {
                totalConnections: pool.totalCount,
                idleConnections: pool.idleCount,
                waitingQueries: pool.waitingCount
            }
        });
    } catch (err) {
        res.status(500).json({ 
            status: 'error', 
            database: 'disconnected', 
            dbReady: false,
            message: err.message,
            pool: {
                totalConnections: pool.totalCount,
                idleConnections: pool.idleCount,
                waitingQueries: pool.waitingCount
            }
        });
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
        
        await withTransaction(async (client) => {
            await client.query(
                `INSERT INTO users (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`,
                [user.id, JSON.stringify(user)]
            );
        });
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
        await withTransaction(async (client) => {
            await client.query(
                `INSERT INTO users (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`,
                [user.id, JSON.stringify(user)]
            );
        });
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
        await withTransaction(async (client) => {
            await client.query(
                `INSERT INTO users (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`,
                [id, JSON.stringify(updatedUser)]
            );
        });
        res.json(updatedUser);
    } catch (err) {
        sendError(res, err, 500, 'Failed to update user');
    }
});

app.delete('/api/users/:id', deleteResource('users'));

// Trips
app.get('/api/trips', getResources('trips'));
app.post('/api/trips', createResource('trips'));
app.post('/api/trips/bulk', async (req, res) => {
    const list = req.body;
    if (!Array.isArray(list)) {
        return res.status(400).json({ error: 'Body must be an array of trips' });
    }
    try {
        await withTransaction(async (client) => {
            for (const trip of list) {
                if (!trip.id) continue;
                await client.query(
                    `INSERT INTO trips (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`,
                    [trip.id, JSON.stringify(trip)]
                );
            }
        });
        res.status(201).json({ success: true, count: list.length });
    } catch (err) {
        sendError(res, err, 500, 'Failed to perform bulk trip upsert');
    }
});
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
app.post('/api/flights/bulk', async (req, res) => {
    const list = req.body;
    if (!Array.isArray(list)) {
        return res.status(400).json({ error: 'Body must be an array of flights' });
    }
    try {
        await withTransaction(async (client) => {
            for (const flight of list) {
                if (!flight.id) continue;
                await client.query(
                    `INSERT INTO flights (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`,
                    [flight.id, JSON.stringify(flight)]
                );
            }
        });
        res.status(201).json({ success: true, count: list.length });
    } catch (err) {
        sendError(res, err, 500, 'Failed to perform bulk flight upsert');
    }
});
app.put('/api/flights/:id', updateResource('flights'));
app.delete('/api/flights/:id', deleteResource('flights'));

// Visited Countries & Cities
app.get('/api/visited', getResources('visited'));
app.post('/api/visited', createResource('visited'));
app.post('/api/visited/bulk', async (req, res) => {
    const list = req.body;
    if (!Array.isArray(list)) {
        return res.status(400).json({ error: 'Body must be an array of visited items' });
    }
    try {
        await withTransaction(async (client) => {
            for (const item of list) {
                if (!item.id) continue;
                await client.query(
                    `INSERT INTO visited (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`,
                    [item.id, JSON.stringify(item)]
                );
            }
        });
        res.status(201).json({ success: true, count: list.length });
    } catch (err) {
        sendError(res, err, 500, 'Failed to perform bulk visited upsert');
    }
});
app.put('/api/visited/:id', updateResource('visited'));
app.delete('/api/visited/:id', deleteResource('visited'));

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

// Added job status polling via /api/jobs/:id (specifically matching requirement text)
app.get('/api/jobs/:id', (req, res) => {
    const { id } = req.params;
    const job = activeJobs.get(id);
    if (!job) {
        return res.status(404).json({ error: 'Background job not found' });
    }
    res.json(job);
});

// Immediately acknowledges the request with 'Processing' state while compiling heavy table states
app.post('/api/jobs/backup', (req, res) => {
    const jobId = runBackgroundJob('DATABASE_BACKUP', async (progress) => {
        const tables = ['users', 'trips', 'events', 'entitlements', 'configs', 'flights', 'visited'];
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

// Added manual global data refresh job endpoint. This lets heavy operations return quickly with a “processing” status.
app.post('/api/jobs/refresh', (req, res) => {
    const jobId = runBackgroundJob('GLOBAL_DATA_REFRESH', async (progress) => {
        progress(20);
        
        // Re-fetch and update airports
        const response = await fetch('https://raw.githubusercontent.com/dlubom/iata_code_fetcher/main/airport_data_full_processed.jsonl');
        if (response.ok) {
            const text = await response.text();
            const lines = text.split('\n').filter(Boolean);
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
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
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        }
        
        progress(60);
        
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
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        }
        
        progress(90);
        await loadGlobalData();
        progress(100);
        return { message: 'Database global datasets successfully refreshed and memory maps synced.' };
    });
    
    res.status(202).json({
        success: true,
        message: 'Global static airports and carriers data refresh job started.',
        jobId,
        status: 'Processing'
    });
});

app.post('/api/jobs/refresh-data', (req, res) => {
    res.redirect(307, '/api/jobs/refresh');
});
app.post('/api/jobs/refresh-global-data', (req, res) => {
    res.redirect(307, '/api/jobs/refresh');
});

// Import/Export Full State
app.get('/api/backup', async (req, res) => {
    try {
        const tables = ['users', 'trips', 'events', 'entitlements', 'configs', 'flights', 'visited'];
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
    const data = req.body;
    
    // Strict validation-driven checks
    if (!data || typeof data !== 'object') {
        return res.status(400).json({ error: 'Validation failed: Backup payload must be a JSON object' });
    }
    
    const tables = ['users', 'trips', 'events', 'entitlements', 'configs', 'flights', 'visited'];
    for (const table of tables) {
        if (data[table] !== undefined) {
            if (!Array.isArray(data[table])) {
                return res.status(400).json({ error: `Validation failed: '${table}' must be an array` });
            }
            for (const item of data[table]) {
                if (!item || typeof item !== 'object') {
                    return res.status(400).json({ error: `Validation failed: Items in '${table}' must be objects` });
                }
                if (!item.id || typeof item.id !== 'string' || item.id.trim() === '') {
                    return res.status(400).json({ error: `Validation failed: Items in '${table}' must have a valid non-empty string ID` });
                }
            }
        }
    }
    
    if (data.workspaceSettings !== undefined && (typeof data.workspaceSettings !== 'object' || data.workspaceSettings === null)) {
        return res.status(400).json({ error: "Validation failed: 'workspaceSettings' must be an object" });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
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
        const tables = ['users', 'trips', 'events', 'entitlements', 'configs', 'flights', 'visited', 'settings'];
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
    
    // Clear any active background scheduler timer to release the Node.js event line
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        console.log('[SYSTEM] Background scheduler dataset refresh timer cleared.');
    }

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
