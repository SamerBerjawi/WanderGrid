
const express = require('express');
const { Pool } = require('pg');
const { AviationStackError, normalizeFutureFlight, requestAviationStack } = require('./aviationStack');
const { resolveFlight } = require('./flightLookup.js');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const util = require('util');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { fetchUpstream } = require('./upstream');
const { resolveIcaoCallsign } = require('./carrierMapping');
const { handleRouteProxy, handleRailRouteProxy } = require('./routeProxy');
const { createRouteService } = require('./routeStore');
const { searchGeocodingChain, searchOpenMeteo, searchPhoton, searchNominatim, reverseGeocode } = require('./geocodingChain');
const { testProvider } = require('./integrationsTester');
const { SERVICE_KEYS, testKey } = require('./keyTester');
const holidays = require('./holidays');

const pbkdf2Async = util.promisify(crypto.pbkdf2);




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

// Fail-fast validation for production deployments
if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'wandergrid_super_secret_development_key_change_me_in_production') {
        console.error('FATAL: In production mode (NODE_ENV=production), JWT_SECRET environment variable must be explicitly defined and not use development defaults.');
        process.exit(1);
    }
}

// Password hashes are stored as `pbkdf2$sha512$<iterations>$<saltHex>$<hashHex>`.
// Older rows may hold the previous `saltHex:hashHex` PBKDF2 format or legacy plaintext; both are
// still accepted at login and transparently upgraded to the current format.
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 200;
const PBKDF2_ITERATIONS = 100000;
const HASH_PREFIX = 'pbkdf2$sha512$';
const LEGACY_PBKDF2_PATTERN = /^[0-9a-f]{32}:[0-9a-f]{128}$/;
// Hashes produced by an old client build (SHA-256 in the browser); they can never be verified.
const BROWSER_HASH_PATTERN = /^[0-9a-f]{32}:[0-9a-f]{64}$/;

const isStoredPasswordHash = (value) =>
    typeof value === 'string' && (value.startsWith(HASH_PREFIX) || LEGACY_PBKDF2_PATTERN.test(value));

// True when the account has no password that can ever be used to sign in.
const passwordNeedsReset = (stored) => !stored || BROWSER_HASH_PATTERN.test(stored);

function validatePasswordPolicy(password) {
    if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
        return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
    }
    if (password.length > PASSWORD_MAX_LENGTH) {
        return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
    }
    return null;
}

async function hashPassword(password) {
    if (!password) return '';
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = await pbkdf2Async(password, salt, PBKDF2_ITERATIONS, 64, 'sha512');
    return `${HASH_PREFIX}${PBKDF2_ITERATIONS}$${salt}$${derivedKey.toString('hex')}`;
}

const safeEqualHex = (a, b) => {
    const left = Buffer.from(a, 'hex');
    const right = Buffer.from(b, 'hex');
    return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
};

async function verifyPassword(password, storedHash) {
    if (!storedHash || typeof password !== 'string') return false;
    if (storedHash.startsWith(HASH_PREFIX)) {
        const [, , iterations, salt, hash] = storedHash.split('$');
        const verifyHash = await pbkdf2Async(password, salt, parseInt(iterations, 10), 64, 'sha512');
        return safeEqualHex(hash, verifyHash.toString('hex'));
    }
    if (LEGACY_PBKDF2_PATTERN.test(storedHash)) {
        const [salt, hash] = storedHash.split(':');
        const verifyHash = await pbkdf2Async(password, salt, PBKDF2_ITERATIONS, 64, 'sha512');
        return safeEqualHex(hash, verifyHash.toString('hex'));
    }
    if (BROWSER_HASH_PATTERN.test(storedHash)) return false;
    // Legacy plaintext row: compare in constant time; it is rehashed after a successful login.
    const a = Buffer.from(password);
    const b = Buffer.from(storedHash);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Strip secrets from a user record before it leaves the server.
function toPublicUser(user) {
    if (!user) return user;
    const { password, tokenVersion, calendarToken, passwordReset, ...rest } = user;
    return { ...rest, passwordResetRequired: passwordNeedsReset(password) };
}

// Paid third-party API keys never leave the server in backups (decision C-5).
const SECRET_SETTING_KEYS_LOWER = new Set(['aviationstackapikey', 'aerodataboxapikey', 'openaipapikey']);

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
        // Redact user passwords and personal calendar-feed secrets; API keys and settings are kept
        if (lowerKey === 'password' || lowerKey === 'calendartoken' || lowerKey === 'passwordreset' || SECRET_SETTING_KEYS_LOWER.has(lowerKey)) {
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
        '/api/auth/register',
        '/api/auth/setup-status',
        '/api/auth/demo',
        '/api/auth/reset-password'
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
    
    let decoded;
    try {
        decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired access token' });
    }
    // The session is only as valid as the account behind it: deleted users, and tokens issued
    // before a logout / password change / role change (tokenVersion bump), are rejected.
    pool.query(`SELECT data FROM users WHERE id = $1`, [decoded.id])
        .then(({ rows }) => {
            const user = rows[0]?.data;
            if (!user || (user.tokenVersion || 0) !== (decoded.tv || 0)) {
                return res.status(401).json({ error: 'Session is no longer valid' });
            }
            req.user = { id: user.id, email: user.email, role: user.role };
            next();
        })
        .catch(err => sendError(res, err, 503, 'Unable to verify session'));
}

const SESSION_TTL = process.env.SESSION_TTL || '24h';
const signSession = (user) =>
    jwt.sign({ id: user.id, email: user.email, role: user.role, tv: user.tokenVersion || 0 }, JWT_SECRET, { expiresIn: SESSION_TTL });

// Role gate for routes that only workspace administrators may use.
const requireRole = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'You do not have permission to perform this action' });
    }
    next();
};
const requireAdmin = requireRole('Admin');

function sendError(res, err, status = 500, defaultMessage = 'An unexpected error occurred') {
    console.error(err);
    
    // In production, sanitize the response message to avoid leaking stack traces, database schemas, or system paths
    if (process.env.NODE_ENV === 'production') {
        return res.status(status).json({ error: defaultMessage });
    } else {
        return res.status(status).json({ error: err.message, stack: err.stack });
    }
}

// Error carrying an HTTP status and a client-safe message (thrown inside handlers/transactions).
class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const app = express();
const PORT = process.env.PORT || 3000;

// Express 4 does not catch rejected promises from async handlers, and Node exits on an unhandled
// rejection — one failed `await` (e.g. the DB being unreachable) used to crash the whole API.
// Route every handler's rejection to the error middleware registered after the routes.
const forwardAsyncErrors = (handler) => {
    if (typeof handler !== 'function' || handler.length > 3) return handler; // error middleware untouched
    return function (req, res, next) {
        try {
            const result = handler.call(this, req, res, next);
            if (result && typeof result.catch === 'function') result.catch(next);
        } catch (err) {
            next(err);
        }
    };
};
for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const original = app[method].bind(app);
    app[method] = (path, ...handlers) => (handlers.length === 0 ? original(path) : original(path, ...handlers.map(forwardAsyncErrors)));
}

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection (process kept alive):', reason instanceof Error ? reason : new Error(String(reason)));
});
const FLIGHT_CACHE_TTL_MS = process.env.API_CACHE_TTL_MS 
    ? parseInt(process.env.API_CACHE_TTL_MS, 10) 
    : 5 * 60 * 1000;
// Map with a size cap: inserting beyond `max` evicts the oldest entry, so caches keyed by user input
// (callsigns, queries) can't grow until the process runs out of memory (REL-010).
class BoundedMap extends Map {
    constructor(max) {
        super();
        this.max = max;
    }
    set(key, value) {
        if (this.has(key)) this.delete(key);
        super.set(key, value);
        while (this.size > this.max) this.delete(this.keys().next().value);
        return this;
    }
}
const CACHE_MAX_ENTRIES = process.env.CACHE_MAX_ENTRIES ? parseInt(process.env.CACHE_MAX_ENTRIES, 10) : 2000;

const flightCache = new BoundedMap(CACHE_MAX_ENTRIES);
const FLIGHT_FETCH_TIMEOUT_MS = process.env.FLIGHT_FETCH_TIMEOUT_MS
    ? parseInt(process.env.FLIGHT_FETCH_TIMEOUT_MS, 10)
    : 10000;

const GEOCODE_CACHE_TTL_MS = process.env.GEOCODE_CACHE_TTL_MS
    ? parseInt(process.env.GEOCODE_CACHE_TTL_MS, 10)
    : 30 * 24 * 60 * 60 * 1000; // 30 days default

const EXTERNAL_FETCH_TIMEOUT_MS = process.env.EXTERNAL_FETCH_TIMEOUT_MS
    ? parseInt(process.env.EXTERNAL_FETCH_TIMEOUT_MS, 10)
    : 3000; // 3 seconds default

// Global memory caches as robust fail-safe fallbacks
const memoryAirports = new Map();
const memoryCarriers = new Map();
const memoryGeocoding = new BoundedMap(Math.max(CACHE_MAX_ENTRIES, 5000));
const openSkyCache = new BoundedMap(CACHE_MAX_ENTRIES);

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
// Content-Security-Policy (SEC-011): scripts only from this origin (no inline or third-party script),
// which contains any future HTML-injection bug. Maps, tiles, geocoding and routing fall-backs still
// talk to third-party HTTPS hosts from the browser, and map libraries use blob: workers.
const CSP_DIRECTIVES = {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'wasm-unsafe-eval'", 'blob:'],
    workerSrc: ["'self'", 'blob:'],
    childSrc: ["'self'", 'blob:'],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
    fontSrc: ["'self'", 'data:'],
    connectSrc: ["'self'", 'https:', 'data:', 'blob:'],
    mediaSrc: ["'self'", 'data:', 'blob:', 'https:'],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'self'"],
    upgradeInsecureRequests: null,
};
app.use(helmet({
    contentSecurityPolicy: { useDefaults: false, directives: CSP_DIRECTIVES },
    crossOriginEmbedderPolicy: false
}));
app.use(compression({ threshold: 1024 }));
// The SPA is served from this same origin, so cross-origin access is off unless explicitly allowed
// (comma-separated CORS_ORIGINS, e.g. for a separately hosted frontend) (SEC-016).
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
if (CORS_ORIGINS.length > 0) {
    app.use(cors({ origin: CORS_ORIGINS }));
}
// Restores carry whole workspaces; everything else is a single record.
const RESTORE_BODY_LIMIT = process.env.RESTORE_BODY_LIMIT || '50mb';
const DEFAULT_BODY_LIMIT = process.env.BODY_LIMIT || '5mb';
const parseRestoreBody = express.json({ limit: RESTORE_BODY_LIMIT });
const parseDefaultBody = express.json({ limit: DEFAULT_BODY_LIMIT });
app.use((req, res, next) => (req.path === '/api/restore' ? parseRestoreBody : parseDefaultBody)(req, res, next));
app.use(express.static(path.join(__dirname, 'client_build'), {
    maxAge: '1y',
    immutable: true,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.pmtiles')) {
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Content-Type', 'application/vnd.pmtiles');
        }
        if (filePath.endsWith('.html') || filePath.endsWith('sw.js') || filePath.endsWith('registerSW.js') || filePath.endsWith('manifest.json') || filePath.endsWith('icon.svg')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, proxy-revalidate, max-age=0');
            res.setHeader('Pragma', 'no-cache');
        }
    }
}));

// Serve static assets from public directory (PMTiles vector tiles & airport-style icons)
app.use(express.static(path.join(__dirname, '../public'), {
    maxAge: '7d',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.pmtiles')) {
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Content-Type', 'application/vnd.pmtiles');
            res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        }
    }
}));

// Rate Limiting Configuration
const apiRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 300, // max 300 requests per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
});

const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // max 20 login/register attempts per 15 minutes per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts, please try again later.' }
});

app.use('/api', apiRateLimiter);
app.use('/api/auth', authRateLimiter);

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

        // Global route-flights cache table
        await client.query(`
            CREATE TABLE IF NOT EXISTS cached_routes (
              id SERIAL PRIMARY KEY,
              route_key VARCHAR(255) UNIQUE CHECK (route_key <> ''),
              payload JSONB NOT NULL,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Whole-document GIN indexes were never used by any query but were rewritten on every save, and the
        // dataset tables had duplicate iata indexes; drop them on existing databases (PERF-012).
        console.log('Creating database indexes on core tables...');
        for (const unused of ['idx_trips_data', 'idx_users_data', 'idx_flights_data', 'idx_events_data', 'idx_configs_data', 'idx_airports_iata', 'idx_carriers_iata']) {
            await client.query(`DROP INDEX IF EXISTS ${unused}`);
        }
        
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

        // Route Cache Indexes
        await client.query("CREATE INDEX IF NOT EXISTS idx_cached_routes_route_key ON cached_routes (route_key)");
        
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
    
    // Clear any potentially contaminated geocoding cache records for BER, MAN, TUN, and Malmö to restore correct city mappings.
    try {
        await pool.query("DELETE FROM geocoding_cache WHERE query IN ('ber', 'ber airport', 'man', 'man airport', 'manchester', 'tun', 'tun airport', 'tunis', 'tunis, tunisia', 'tunis carthage', 'tunis carthage airport', 'naples', 'napoli', 'capri', 'vatican', 'vatican city', 'rome', 'rome, italy', 'malmö', 'malmo', 'malmö, sweden', 'malmo, sweden', 'malmön', 'mmx')");
        console.log('[SYSTEM-CLEANUP] Cleaned up any potentially contaminated geocoding_cache values for BER, MAN, TUN, Naples, Napoli, Capri, Vatican, Rome, and Malmö.');
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

    // Preload top hot geocoding queries into RAM cache for instantaneous 0ms responses
    try {
        const geoRes = await pool.query('SELECT query, results FROM geocoding_cache ORDER BY created_at DESC LIMIT 500');
        let geoCount = 0;
        geoRes.rows.forEach(row => {
            if (row.query && row.results) {
                memoryGeocoding.set(row.query, row.results);
                geoCount++;
            }
        });
        console.log(`Successfully preloaded ${geoCount} hot geocoding queries into fast RAM cache.`);
    } catch (geoErr) {
        console.warn('Could not preload geocoding cache into RAM:', geoErr.message);
    }

  } catch (err) {
    console.warn('Failed to load global datasets from PG database to memory cache; making lazy network fallback fetch...', err.message);
    // If table is empty or query fails, run the Raw GitHub fetch in the background as a fail-safe fallback
    try {
        console.log('Fetching & parsing global carriers from GitHub (fail-safe recovery)...');
        const carrierResponse = await fetch(GLOBAL_DATASETS.carriers.url, { signal: AbortSignal.timeout(DATASET_FETCH_TIMEOUT_MS) });
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
        const airResponse = await fetch(GLOBAL_DATASETS.airports.url, { signal: AbortSignal.timeout(DATASET_FETCH_TIMEOUT_MS) });
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

// --- Global airport / carrier datasets ---
// One download -> validate -> replace path, shared by first-run prepopulation, the weekly scheduler
// and POST /api/jobs/refresh. A refresh never commits an empty or truncated table (REL-009): the
// parsed row count must reach a floor before the transactional TRUNCATE + INSERT runs.
const DATASET_FETCH_TIMEOUT_MS = process.env.DATASET_FETCH_TIMEOUT_MS ? parseInt(process.env.DATASET_FETCH_TIMEOUT_MS, 10) : 60000;
const GLOBAL_DATASETS = {
    airports: {
        url: 'https://raw.githubusercontent.com/dlubom/iata_code_fetcher/main/airport_data_full_processed.jsonl',
        table: 'global_airports',
        columns: ['iata', 'city_name', 'airport_name'],
        toRow: (item) => [String(item.iata || '').trim().toUpperCase(), item.city_name || '', item.airport_name || ''],
        minRows: () => parseInt(process.env.DATASET_MIN_AIRPORTS || '5000', 10),
    },
    carriers: {
        url: 'https://raw.githubusercontent.com/dlubom/iata_code_fetcher/main/carrier_data_full_processed.jsonl',
        table: 'global_carriers',
        columns: ['iata', 'company_name', 'country_or_territory'],
        toRow: (item) => [String(item.iata || '').trim().toUpperCase(), item.company_name || '', item.country_or_territory || ''],
        minRows: () => parseInt(process.env.DATASET_MIN_CARRIERS || '500', 10),
    },
};

function parseDatasetLines(dataset, text) {
    const rows = [];
    let skipped = 0;
    for (const line of String(text).split('\n')) {
        if (!line.trim()) continue;
        try {
            const row = dataset.toRow(JSON.parse(line));
            if (row[0]) rows.push(row); else skipped++;
        } catch (err) {
            skipped++;
        }
    }
    return { rows, skipped };
}

async function downloadDataset(dataset) {
    const response = await fetch(dataset.url, { signal: AbortSignal.timeout(DATASET_FETCH_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`${dataset.table} download failed with HTTP ${response.status}`);
    return parseDatasetLines(dataset, await response.text());
}

async function replaceDataset(dataset, rows) {
    const { rows: countRows } = await pool.query(`SELECT COUNT(*) AS count FROM ${dataset.table}`);
    const current = Number(countRows[0].count);
    const floor = Math.max(dataset.minRows(), Math.floor(current * 0.9));
    if (rows.length < floor) {
        throw new Error(`Refusing to replace ${dataset.table}: parsed ${rows.length} rows, need at least ${floor} (currently ${current})`);
    }
    await withTransaction(async (client) => {
        await client.query(`TRUNCATE TABLE ${dataset.table} RESTART IDENTITY`);
        const width = dataset.columns.length;
        for (let i = 0; i < rows.length; i += 500) {
            const chunk = rows.slice(i, i + 500);
            // Placeholders follow the rows actually inserted (skipped lines never shift them).
            const values = chunk.map((_, r) => `(${dataset.columns.map((__, c) => `$${r * width + c + 1}`).join(', ')})`);
            await client.query(`INSERT INTO ${dataset.table} (${dataset.columns.join(', ')}) VALUES ${values.join(', ')}`, chunk.flat());
        }
    });
}

async function refreshGlobalDataset(name, { onlyIfEmpty = false } = {}) {
    const dataset = GLOBAL_DATASETS[name];
    if (onlyIfEmpty) {
        const { rows } = await pool.query(`SELECT COUNT(*) AS count FROM ${dataset.table}`);
        if (Number(rows[0].count) > 0) return { name, skippedRefresh: true };
    }
    const { rows, skipped } = await downloadDataset(dataset);
    if (skipped > 0) console.warn(`[DATASETS] ${dataset.table}: skipped ${skipped} malformed or empty lines`);
    await replaceDataset(dataset, rows);
    console.log(`[DATASETS] ${dataset.table} replaced with ${rows.length} rows.`);
    return { name, rows: rows.length, skipped };
}

async function refreshAllGlobalDatasets(options) {
    const results = [];
    for (const name of Object.keys(GLOBAL_DATASETS)) {
        results.push(await refreshGlobalDataset(name, options));
    }
    return results;
}

// Scheduled weekly background dataset synchronization task
let schedulerInterval;

let backgroundTasksStopped = false;
const startBackgroundScheduler = () => {
  if (backgroundTasksStopped) return;
  const defaultInterval = 7 * 24 * 60 * 60 * 1000;
  const refreshIntervalMs = process.env.GLOBAL_DATA_REFRESH_MS
    ? parseInt(process.env.GLOBAL_DATA_REFRESH_MS, 10)
    : defaultInterval;
  
  console.log(`[SCHEDULER] Setting up background datasets synchronization task to run every ${refreshIntervalMs}ms.`);
  
  schedulerInterval = setInterval(async () => {
    console.log('[SCHEDULER] Running background datasets synchronization task...');
    try {
      await refreshAllGlobalDatasets();
      // Reload updated records back into RAM memory caches safely
      await loadGlobalData();
      console.log('[SCHEDULER] Background dataset synchronization complete and RAM caches reloaded.');
    } catch (err) {
      console.error('[SCHEDULER] Failed scheduled synchronization run (existing data kept):', err.message);
    }
  }, refreshIntervalMs);
  if (schedulerInterval.unref) schedulerInterval.unref();
};

const prepopulateDatabases = async () => {
  // First run: fill empty dataset tables (existing data is left alone).
  for (const name of Object.keys(GLOBAL_DATASETS)) {
    try {
      await refreshGlobalDataset(name, { onlyIfEmpty: true });
    } catch (err) {
      console.error(`Error pre-populating ${GLOBAL_DATASETS[name].table}:`, err);
    }
  }
};

const ready = initDb().then(() => {
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

// --- Request validation (SEC-012, REL-011) ---
// Every collection write is checked for shape before it is stored, so one malformed record can't
// break readers (calendar feed, trip page) and clients can't smuggle oversized documents.
const RECORD_ID_PATTERN = /^[^\s/\\?#]{1,200}$/;
const ISO_DAY_OR_EMPTY = /^(\d{4}-\d{2}-\d{2}([T ].*)?)?$/;
const MAX_RECORD_BYTES = { users: 2 * 1024 * 1024, default: 1024 * 1024 };
const MAX_AVATAR_CHARS = Math.ceil((1024 * 1024 * 4) / 3) + 64; // ~1 MB decoded
const AVATAR_PATTERN = /^(data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+|https:\/\/\S+)?$/;

const isValidDayOrEmpty = (v) => v === undefined || v === null || (typeof v === 'string' && ISO_DAY_OR_EMPTY.test(v) && (v === '' || !isNaN(new Date(v.slice(0, 10)).getTime())));
const isArrayOrMissing = (v) => v === undefined || v === null || Array.isArray(v);
const isStringOrMissing = (v, max = 2000) => v === undefined || v === null || (typeof v === 'string' && v.length <= max);

const RECORD_RULES = {
    trips: (r) => {
        if (!isStringOrMissing(r.name, 500)) return 'name must be text (max 500 characters)';
        if (!isValidDayOrEmpty(r.startDate) || !isValidDayOrEmpty(r.endDate)) return 'startDate/endDate must be YYYY-MM-DD dates';
        for (const field of ['participants', 'transports', 'accommodations', 'activities', 'locations', 'packingList']) {
            if (!isArrayOrMissing(r[field])) return `${field} must be a list`;
        }
        if (Array.isArray(r.participants) && !r.participants.every(p => typeof p === 'string')) return 'participants must be user ids';
        if (r.privacy !== undefined && r.privacy !== null && !['Private', 'Public', 'Shared'].includes(r.privacy)) return 'privacy must be Private, Public or Shared';
        return null;
    },
    flights: (r) => {
        if (!isValidDayOrEmpty(r.departureDate) || !isValidDayOrEmpty(r.arrivalDate)) return 'departureDate/arrivalDate must be YYYY-MM-DD dates';
        for (const field of ['origin', 'destination', 'provider', 'identifier', 'mode']) {
            if (!isStringOrMissing(r[field], 500)) return `${field} must be text`;
        }
        return null;
    },
    visited: (r) => (!isStringOrMissing(r.type, 50) || !isStringOrMissing(r.code, 100) ? 'type/code must be text' : null),
    configs: (r) => (!isArrayOrMissing(r.holidays) ? 'holidays must be a list' : null),
    users: (r) => {
        if (!isStringOrMissing(r.name, 200)) return 'name must be text (max 200 characters)';
        if (r.email !== undefined && r.email !== null && (typeof r.email !== 'string' || (r.email && !EMAIL_PATTERN.test(r.email.trim())))) return 'email is not valid';
        if (r.profilePicture !== undefined && r.profilePicture !== null) {
            if (typeof r.profilePicture !== 'string' || r.profilePicture.length > MAX_AVATAR_CHARS || !AVATAR_PATTERN.test(r.profilePicture)) {
                return 'profilePicture must be a PNG, JPEG, WebP or GIF image under 1 MB';
            }
        }
        return null;
    },
};

function validateRecord(table, record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return 'Record must be a JSON object';
    if (typeof record.id !== 'string' || !RECORD_ID_PATTERN.test(record.id)) return 'Record id must be 1–200 characters without spaces or slashes';
    const limit = MAX_RECORD_BYTES[table] || MAX_RECORD_BYTES.default;
    if (Buffer.byteLength(JSON.stringify(record)) > limit) return `Record is too large (max ${Math.round(limit / 1024)} KB)`;
    const rule = RECORD_RULES[table];
    return rule ? rule(record) : null;
}

const assertValidRecords = (table, records) => {
    for (const record of records) {
        const problem = validateRecord(table, record);
        if (problem) throw new HttpError(400, `Invalid ${table} record${record && typeof record.id === 'string' ? ` "${record.id.slice(0, 60)}"` : ''}: ${problem}`);
    }
};

// --- Record ownership (SEC-001) ---
// Trips: readable by participants (or anyone when Public), writable by participants; admins see all.
// Flights / land journeys / atlas records: a shared household log that everyone can read, but only
// the record's owner (ownerId) or an admin may change; records without an owner are admin-managed.
const normKey = (v) => String(v ?? '').toLowerCase().trim();
const isAdminUser = (user) => user?.role === 'Admin';
const isTripParticipant = (trip, user) => {
    const keys = new Set([user.id, user.email].filter(Boolean).map(normKey));
    return Array.isArray(trip?.participants) && trip.participants.some(p => keys.has(normKey(p)));
};
const OWNERSHIP = {
    trips: {
        canRead: (trip, user) => isAdminUser(user) || trip.privacy === 'Public' || isTripParticipant(trip, user),
        canWrite: (trip, user) => isAdminUser(user) || isTripParticipant(trip, user),
        // A new trip always includes its creator, so they can't lock themselves out of it.
        prepareNew: (trip, user) => (isAdminUser(user) || isTripParticipant(trip, user))
            ? trip
            : { ...trip, participants: [...(Array.isArray(trip.participants) ? trip.participants : []), user.id] },
        prepareUpdate: (incoming) => incoming,
    },
    flights: {
        canRead: () => true,
        canWrite: (rec, user) => isAdminUser(user) || (!!rec.ownerId && rec.ownerId === user.id),
        prepareNew: (rec, user) => ({ ...rec, ownerId: user.id }),
        prepareUpdate: (incoming, existing) => ({ ...incoming, ownerId: existing.ownerId }),
    },
};
OWNERSHIP.visited = OWNERSHIP.flights;

const forbidden = () => new HttpError(403, 'You do not have permission to change this record');

// --- Optimistic concurrency (REL-005) ---
// Every stored record carries an integer `version`. A write that names a version must match the
// stored one (otherwise someone else changed it: 409); every successful write increments it.
// Writes without a version (older clients, imports) are accepted and still bump it.
const conflict = (table, id) => new HttpError(409, `This ${table === 'trips' ? 'trip' : 'record'} was changed by someone else. Reload to see the latest version, then try again.`);
function withNextVersion(table, incoming, existing) {
    const current = Number(existing?.version) || 0;
    if (existing && incoming.version !== undefined && incoming.version !== null && Number(incoming.version) !== current) {
        throw conflict(table, incoming.id);
    }
    return { ...incoming, version: current + 1, updatedAt: new Date().toISOString() };
}

// Upserts records after checking the caller may change each existing one (new ones get an owner).
async function guardedBulkUpsert(client, table, items, user) {
    if (!Array.isArray(items)) throw new HttpError(400, 'Body must be a list of records');
    assertValidRecords(table, items);
    const policy = OWNERSHIP[table];
    if (!policy) return bulkUpsert(client, table, items);
    const ids = items.filter(i => i && i.id).map(i => i.id);
    const existing = new Map();
    for (const id of ids) {
        const { rows } = await client.query(`SELECT data FROM ${table} WHERE id = $1`, [id]);
        if (rows.length > 0) existing.set(id, rows[0].data);
    }
    const prepared = items.filter(i => i && i.id).map(item => {
        const prev = existing.get(item.id);
        if (!prev) return withNextVersion(table, policy.prepareNew(item, user), null);
        if (!policy.canWrite(prev, user)) throw forbidden();
        return withNextVersion(table, policy.prepareUpdate(item, prev), prev);
    });
    await bulkUpsert(client, table, prepared);
    return prepared;
}

// { id: version } map so clients can continue editing without tripping their own version checks.
const versionMap = (records) => Object.fromEntries((records || []).map(r => [r.id, r.version]));

async function guardedDelete(client, table, id, user) {
    const policy = OWNERSHIP[table];
    if (policy) {
        const { rows } = await client.query(`SELECT data FROM ${table} WHERE id = $1`, [id]);
        if (rows.length > 0 && !policy.canWrite(rows[0].data, user)) throw forbidden();
    }
    await client.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
}

const getResources = (table) => async (req, res) => {
  try {
    const { limit, offset, status, tripId, after, before, privacy, sort } = req.query;
    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`(data->>'status') = $${params.length}`);
    }
    if (privacy) {
      params.push(privacy);
      conditions.push(`(data->>'privacy') = $${params.length}`);
    }
    if (tripId) {
      params.push(tripId);
      conditions.push(`(data->>'tripId') = $${params.length}`);
    }
    if (after) {
      params.push(after);
      if (table === 'flights') {
        conditions.push(`(data->>'departureDate') >= $${params.length}`);
      } else {
        conditions.push(`(data->>'startDate') >= $${params.length}`);
      }
    }
    if (before) {
      params.push(before);
      if (table === 'flights') {
        conditions.push(`(data->>'departureDate') <= $${params.length}`);
      } else {
        conditions.push(`(data->>'endDate') <= $${params.length}`);
      }
    }

    let query = `SELECT data FROM ${table}`;
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    if (sort === 'desc') {
      if (table === 'flights') {
        query += ` ORDER BY (data->>'departureDate') DESC`;
      } else if (table === 'trips' || table === 'events') {
        query += ` ORDER BY (data->>'startDate') DESC`;
      }
    } else if (sort === 'asc') {
      if (table === 'flights') {
        query += ` ORDER BY (data->>'departureDate') ASC`;
      } else if (table === 'trips' || table === 'events') {
        query += ` ORDER BY (data->>'startDate') ASC`;
      }
    }

    const parsedLimit = parseInt(limit, 10);
    if (!isNaN(parsedLimit) && parsedLimit > 0) {
      params.push(parsedLimit);
      query += ` LIMIT $${params.length}`;
    }

    const parsedOffset = parseInt(offset, 10);
    if (!isNaN(parsedOffset) && parsedOffset >= 0) {
      params.push(parsedOffset);
      query += ` OFFSET $${params.length}`;
    }

    const { rows } = await pool.query(query, params);
    const policy = OWNERSHIP[table];
    const records = rows.map(r => r.data);
    res.json(policy ? records.filter(r => policy.canRead(r, req.user)) : records);
  } catch (err) {
    sendError(res, err, 500, `Failed to retrieve ${table}`);
  }
};

/**
 * High-performance multi-row bulk upsert helper
 */
async function bulkUpsert(client, table, items, chunkSize = 500) {
  if (!items || !Array.isArray(items) || items.length === 0) return 0;
  // Postgres rejects a multi-row upsert that touches the same id twice; the last copy wins.
  items = Array.from(new Map(items.filter(item => item && item.id).map(item => [item.id, item])).values());
  let count = 0;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize).filter(item => item && item.id);
    if (chunk.length === 0) continue;
    const values = [];
    const params = [];
    chunk.forEach((item, idx) => {
      values.push(`($${idx * 2 + 1}, $${idx * 2 + 2})`);
      params.push(item.id, JSON.stringify(item));
    });
    await client.query(`
      INSERT INTO ${table} (id, data)
      VALUES ${values.join(', ')}
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
    `, params);
    count += chunk.length;
  }
  return count;
}

const createResource = (table) => async (req, res) => {
  const resource = req.body;
  if (!resource || typeof resource !== 'object' || !resource.id) return res.status(400).json({ error: 'ID is required' });
  let created = resource;
  const problem = validateRecord(table, resource);
  if (problem) return res.status(400).json({ error: `Invalid ${table} record: ${problem}` });
  
  try {
    await withTransaction(async (client) => {
      // Creating never overwrites an existing record; updates go through PUT /:id.
      const { rows } = await client.query(`SELECT 1 FROM ${table} WHERE id = $1`, [resource.id]);
      if (rows.length > 0) throw new HttpError(409, `A record with id ${resource.id} already exists`);
      created = withNextVersion(table, OWNERSHIP[table] ? OWNERSHIP[table].prepareNew(resource, req.user) : resource, null);
      await client.query(`INSERT INTO ${table} (id, data) VALUES ($1, $2)`, [created.id, JSON.stringify(created)]);
    });
    res.status(201).json(created);
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.code === '23505') return res.status(409).json({ error: `A record with id ${resource.id} already exists` });
    sendError(res, err, 500, `Failed to create ${table}`);
  }
};

const updateResource = (table) => async (req, res) => {
  const { id } = req.params;
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Body must be a JSON object' });
  }
  // The URL decides which record is written; a different body id is ignored (REL-011).
  const resource = { ...req.body, id };
  
  try {
    const saved = await withTransaction(async (client) => {
      const [record] = await guardedBulkUpsertOne(client, table, resource, req.user);
      return record;
    });
    res.json(saved);
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    sendError(res, err, 500, `Failed to update ${table}`);
  }
};

// Single-record variant of guardedBulkUpsert that returns the stored record.
async function guardedBulkUpsertOne(client, table, record, user) {
  assertValidRecords(table, [record]);
  const policy = OWNERSHIP[table];
  let prepared = record;
  const { rows } = await client.query(`SELECT data FROM ${table} WHERE id = $1`, [record.id]);
  const existing = rows[0]?.data || null;
  if (policy) {
    if (!existing) prepared = policy.prepareNew(record, user);
    else if (!policy.canWrite(existing, user)) throw forbidden();
    else prepared = policy.prepareUpdate(record, existing);
  }
  prepared = withNextVersion(table, prepared, existing);
  await client.query(
    `INSERT INTO ${table} (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`,
    [prepared.id, JSON.stringify(prepared)]
  );
  return [prepared];
}

const deleteResource = (table) => async (req, res) => {
  const { id } = req.params;
  try {
    await withTransaction(async (client) => {
      await guardedDelete(client, table, id, req.user);
    });
    res.json({ success: true });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    sendError(res, err, 500, `Failed to delete ${table}`);
  }
};

// --- Routes ---

// Proxies receive the workspace's keys here, so browsers never need (or see) them.
const PROXY_KEY_HEADERS = { 'x-aviationstack-key': 'aviationStackApiKey', 'x-aerodatabox-key': 'aeroDataBoxApiKey', 'x-openaip-key': 'openAipApiKey' };
app.use('/api/proxy', async (req, res, next) => {
    try {
        for (const [header, key] of Object.entries(PROXY_KEY_HEADERS)) {
            const sent = String(req.headers[header] || '').trim();
            if (!sent || sent === SECRET_MASK) {
                const value = await workspaceSecret(key);
                if (value) req.headers[header] = value; else delete req.headers[header];
            }
        }
        // Legacy query-string keys (AviationStack airports/airlines)
        if (req.query && (!req.query.access_key || req.query.access_key === SECRET_MASK)) {
            const value = await workspaceSecret('aviationStackApiKey');
            const query = { ...req.query };
            if (value) query.access_key = value; else delete query.access_key;
            // req.query is a lazily-computed getter in recent Express versions; replace it outright.
            Object.defineProperty(req, 'query', { value: query, writable: true, configurable: true, enumerable: true });
        }
        next();
    } catch (err) {
        next(err);
    }
});


// AviationStack proxies keep API calls server-side to avoid browser CORS and mixed-content failures.
// Keys are masked for clients (SEC-010), so a header that is empty or the mask means "use the stored key".
const clientKeyOrStored = async (supplied, settingKey) => {
    const key = String(supplied || '').trim();
    if (key && key !== SECRET_MASK) return key;
    return workspaceSecret(settingKey);
};

const getAviationStackKey = (req) =>
    clientKeyOrStored(req.get('X-AviationStack-Key') || req.query.access_key, 'aviationStackApiKey');

const sendAviationStackError = (res, error) => {
    const status = error instanceof AviationStackError ? error.status : 502;
    console.error('[API] AviationStack request failed:', error);
    return res.status(status).json({
        error: error.message || 'AviationStack request failed.',
        code: error.code || 'aviationstack_error'
    });
};

app.get('/api/proxy/flight-status', async (req, res) => {
    const accessKey = await getAviationStackKey(req);
    const flightIata = String(req.query.flight_iata || '').trim().toUpperCase().replace(/\s/g, '');
    const flightDate = String(req.query.flight_date || '').trim();
    if (!accessKey || !flightIata) {
        return res.status(400).json({ error: 'Missing AviationStack API key or flight number.' });
    }

    const cacheKey = `${flightIata}:${flightDate || 'latest'}`;
    const cached = flightCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        res.set('X-Cache', 'HIT');
        res.set('Cache-Control', `private, max-age=${Math.floor(FLIGHT_CACHE_TTL_MS / 1000)}`);
        return res.json(cached.data);
    }

    try {
        const data = await requestAviationStack('flights', {
            access_key: accessKey,
            flight_iata: flightIata,
            flight_date: flightDate
        }, { timeoutMs: FLIGHT_FETCH_TIMEOUT_MS });
        flightCache.set(cacheKey, { data, expiresAt: Date.now() + FLIGHT_CACHE_TTL_MS });
        res.set('X-Cache', 'MISS');
        res.set('Cache-Control', `private, max-age=${Math.floor(FLIGHT_CACHE_TTL_MS / 1000)}`);
        return res.json(data);
    } catch (error) {
        return sendAviationStackError(res, error);
    }
});

app.get('/api/proxy/route-flights', async (req, res) => {
    const accessKey = await getAviationStackKey(req);
    const cleanDep = String(req.query.dep_iata || '').trim().toUpperCase();
    const cleanArr = String(req.query.arr_iata || '').trim().toUpperCase();
    const cleanDate = String(req.query.flight_date || '').trim();
    if (!accessKey || !/^[A-Z]{3}$/.test(cleanDep) || !/^[A-Z]{3}$/.test(cleanArr) || !/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
        return res.status(400).json({ error: 'A valid API key, origin, destination, and date are required.' });
    }

    const targetTime = Date.parse(`${cleanDate}T00:00:00Z`);
    if (Number.isNaN(targetTime)) {
        return res.status(400).json({ error: 'Flight date must use YYYY-MM-DD format.' });
    }
    const today = new Date();
    const todayTime = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const isPast = targetTime < todayTime;
    const isFuture = targetTime > todayTime;
    const cacheKey = `${cleanDep}-${cleanArr}-${cleanDate}`;

    try {
        const cacheRes = await pool.query('SELECT payload, updated_at FROM cached_routes WHERE route_key = $1', [cacheKey]);
        if (cacheRes.rows.length > 0) {
            const { payload, updated_at } = cacheRes.rows[0];
            const age = Date.now() - new Date(updated_at).getTime();
            const maxAge = isPast ? Infinity : isFuture ? 24 * 60 * 60 * 1000 : FLIGHT_CACHE_TTL_MS;
            if (age < maxAge) {
                res.set('X-Cache', 'HIT');
                return res.json({ pagination: { count: payload.length, total: payload.length }, data: payload });
            }
        }
    } catch (error) {
        console.error('[DB CACHE ERROR] Failed querying cached_routes:', error);
    }

    try {
        let flights;
        if (isFuture) {
            const daysAhead = Math.floor((targetTime - todayTime) / (24 * 60 * 60 * 1000));
            if (daysAhead <= 7) {
                return res.status(422).json({
                    error: 'AviationStack only publishes future schedules more than 7 days ahead. Search today, a past date supported by your plan, or a date at least 8 days from today.',
                    code: 'future_date_not_available'
                });
            }
            const data = await requestAviationStack('flightsFuture', {
                access_key: accessKey,
                iataCode: cleanDep,
                type: 'departure',
                date: cleanDate
            }, { timeoutMs: FLIGHT_FETCH_TIMEOUT_MS });
            flights = (data.data || [])
                .map(item => normalizeFutureFlight(item, cleanDate))
                .filter(item => item.arrival.iata.toUpperCase() === cleanArr);
        } else {
            const data = await requestAviationStack('flights', {
                access_key: accessKey,
                dep_iata: cleanDep,
                arr_iata: cleanArr,
                flight_date: cleanDate
            }, { timeoutMs: FLIGHT_FETCH_TIMEOUT_MS });
            flights = Array.isArray(data.data) ? data.data : [];
        }

        if (flights.length > 0) {
            try {
                await pool.query(
                    `INSERT INTO cached_routes (route_key, payload, updated_at)
                     VALUES ($1, $2, CURRENT_TIMESTAMP)
                     ON CONFLICT (route_key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = CURRENT_TIMESTAMP`,
                    [cacheKey, JSON.stringify(flights)]
                );
            } catch (error) {
                console.error('[DB CACHE ERROR] Failed saving route cache:', error);
            }
        }

        res.set('X-Cache', 'MISS');
        return res.json({ pagination: { count: flights.length, total: flights.length }, data: flights });
    } catch (error) {
        return sendAviationStackError(res, error);
    }
});

// Proxy for AviationStack Airports (Bypasses CORS & mixed content)
app.get('/api/proxy/airports', async (req, res) => {
    const { access_key, iata_code, search } = req.query;
    if (!access_key) {
        return res.status(400).json({ error: 'Missing access_key' });
    }
    try {
        const params = new URLSearchParams({ access_key: String(access_key) });
        if (iata_code) params.set('iata_code', String(iata_code));
        if (search) params.set('search', String(search));
        const response = await fetch(`http://api.aviationstack.com/v1/airports?${params}`, { signal: AbortSignal.timeout(FLIGHT_FETCH_TIMEOUT_MS) });
        if (!response.ok) return res.status(502).json({ error: `AviationStack returned HTTP ${response.status}` });
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
        const params = new URLSearchParams({ access_key: String(access_key) });
        if (iata_code) params.set('iata_code', String(iata_code));
        if (search) params.set('search', String(search));
        const response = await fetch(`http://api.aviationstack.com/v1/airlines?${params}`, { signal: AbortSignal.timeout(FLIGHT_FETCH_TIMEOUT_MS) });
        if (!response.ok) return res.status(502).json({ error: `AviationStack returned HTTP ${response.status}` });
        const data = await response.json();
        res.json(data);
    } catch (err) {
         console.error("Airlines proxy error:", err);
         res.status(500).json({ error: 'Failed to fetch airline metadata' });
    }
});

// ==========================================
// AERODATABOX PROXY (FLIGHT LOOKUPS & AIRCRAFT)
// ==========================================
const aeroDataBoxCache = new BoundedMap(CACHE_MAX_ENTRIES);
const AERODATABOX_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const AERODATABOX_ENDPOINTS = {
    rapidapi: {
        baseUrl: 'https://aerodatabox.p.rapidapi.com',
        authHeader: 'x-rapidapi-key'
    },
    direct: {
        baseUrl: 'https://api.aerodatabox.com',
        authHeader: 'X-Api-Key'
    }
};

// ==========================================
// FLIGHT LOOKUP BY NUMBER AND DATE (flightLookup.js)
// Keyless sources first (FlightStats, ADSBdb), then the workspace's AeroDataBox / AviationStack keys.
// Always answers 200 with the candidates found and what each source said.
// ==========================================
app.get('/api/flights/lookup', async (req, res) => {
    const flight = String(req.query.flight || '').trim();
    const date = String(req.query.date || '').trim();
    try {
        const adbKey = await workspaceSecret('aeroDataBoxApiKey') || '';
        const mode = String(await workspaceSecret('aeroDataBoxEndpoint') || process.env.INTEGRATIONS_AERO_DATA_BOX_ENDPOINT || 'rapidapi').toLowerCase();
        const cfg = AERODATABOX_ENDPOINTS[mode] || AERODATABOX_ENDPOINTS.rapidapi;
        const result = await resolveFlight(flight, date, {
            flightstats: String(process.env.FLIGHT_LOOKUP_FLIGHTSTATS || 'on').toLowerCase() !== 'off',
            aerodatabox: adbKey ? { key: adbKey, baseUrl: cfg.baseUrl, authHeader: cfg.authHeader, host: mode === 'rapidapi' ? 'aerodatabox.p.rapidapi.com' : '' } : null,
            aviationstackKey: await workspaceSecret('aviationStackApiKey') || '',
        });
        if (!result.ok) return res.status(400).json(result);
        res.set('Cache-Control', 'private, max-age=15');
        return res.json(result);
    } catch (err) {
        logger.warn('Flight lookup failed', { error: err.message });
        return res.status(502).json({ ok: false, error: 'lookup_failed', message: 'The flight lookup failed. Try again.', candidates: [], attempts: [] });
    }
});

app.get('/api/proxy/aerodatabox/flights/number/:flightNumber', async (req, res) => {
    const rawNumber = String(req.params.flightNumber || '').trim().replace(/\s|-/g, '').toUpperCase();
    if (!rawNumber) {
        return res.status(400).json({ error: 'Flight number is required.' });
    }

    const apiKey = await clientKeyOrStored(req.get('X-AeroDataBox-Key') || req.query.api_key, 'aeroDataBoxApiKey');
    if (!apiKey) {
        return res.status(400).json({ error: 'AeroDataBox API key is missing. Please configure it in Settings.' });
    }

    const endpointMode = String(req.get('X-AeroDataBox-Endpoint') || req.query.endpoint || await workspaceSecret('aeroDataBoxEndpoint') || process.env.INTEGRATIONS_AERO_DATA_BOX_ENDPOINT || 'rapidapi').toLowerCase();
    const config = AERODATABOX_ENDPOINTS[endpointMode] || AERODATABOX_ENDPOINTS.rapidapi;

    const date = String(req.query.date || '').trim();
    let apiPath = '';

    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        apiPath = `/flights/number/${encodeURIComponent(rawNumber)}/${date}?dateLocalRole=Both&withAircraftImage=false&withLocation=false`;
    } else {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const fmt = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
        const fromDate = fmt(new Date(now.getTime() - 2 * 86400000));
        const toDate = fmt(new Date(now.getTime() + 2 * 86400000));
        apiPath = `/flights/number/${encodeURIComponent(rawNumber)}/${fromDate}/${toDate}?dateLocalRole=Both&withAircraftImage=false&withLocation=false`;
    }

    const cacheKey = `${endpointMode}:${rawNumber}:${date || 'window'}`;
    const cached = aeroDataBoxCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        res.set('X-Cache', 'HIT');
        res.set('Cache-Control', `private, max-age=${Math.floor(AERODATABOX_CACHE_TTL_MS / 1000)}`);
        return res.json(cached.data);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
        const upstreamUrl = `${config.baseUrl}${apiPath}`;
        const headers = { [config.authHeader]: apiKey };
        if (endpointMode === 'rapidapi') {
            headers['x-rapidapi-host'] = 'aerodatabox.p.rapidapi.com';
        }

        const upstream = await fetch(upstreamUrl, {
            headers,
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (upstream.status === 204) {
            return res.json([]);
        }

        if (!upstream.ok) {
            const errText = await upstream.text().catch(() => '');
            return res.status(upstream.status).json({
                error: `AeroDataBox returned HTTP ${upstream.status}`,
                details: errText
            });
        }

        const data = await upstream.json();
        aeroDataBoxCache.set(cacheKey, { data, expiresAt: Date.now() + AERODATABOX_CACHE_TTL_MS });
        res.set('X-Cache', 'MISS');
        res.set('Cache-Control', `private, max-age=${Math.floor(AERODATABOX_CACHE_TTL_MS / 1000)}`);
        return res.json(data);
    } catch (error) {
        clearTimeout(timeout);
        console.error('[API] AeroDataBox fetch failed:', error);
        return res.status(error.name === 'AbortError' ? 504 : 502).json({
            error: error.name === 'AbortError' ? 'AeroDataBox request timed out.' : 'Failed to reach AeroDataBox.'
        });
    }
});

app.get('/api/proxy/aerodatabox/aircrafts/reg/:reg', async (req, res) => {
    const reg = String(req.params.reg || '').trim();
    if (!reg) return res.status(400).json({ error: 'Aircraft registration required.' });

    const apiKey = await clientKeyOrStored(req.get('X-AeroDataBox-Key') || req.query.api_key, 'aeroDataBoxApiKey');
    if (!apiKey) return res.status(400).json({ error: 'AeroDataBox API key is missing.' });

    const endpointMode = String(req.get('X-AeroDataBox-Endpoint') || req.query.endpoint || await workspaceSecret('aeroDataBoxEndpoint') || process.env.INTEGRATIONS_AERO_DATA_BOX_ENDPOINT || 'rapidapi').toLowerCase();
    const config = AERODATABOX_ENDPOINTS[endpointMode] || AERODATABOX_ENDPOINTS.rapidapi;

    const cacheKey = `reg:${endpointMode}:${reg}`;
    const cached = aeroDataBoxCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        res.set('X-Cache', 'HIT');
        return res.json(cached.data);
    }

    try {
        const upstreamUrl = `${config.baseUrl}/aircrafts/reg/${encodeURIComponent(reg)}`;
        const headers = { [config.authHeader]: apiKey };
        if (endpointMode === 'rapidapi') headers['x-rapidapi-host'] = 'aerodatabox.p.rapidapi.com';

        const upstream = await fetch(upstreamUrl, { headers, signal: AbortSignal.timeout(FLIGHT_FETCH_TIMEOUT_MS) });
        if (upstream.status === 204) return res.json(null);
        if (!upstream.ok) return res.status(upstream.status).json({ error: 'Aircraft lookup failed.' });

        const data = await upstream.json();
        aeroDataBoxCache.set(cacheKey, { data, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
        res.set('X-Cache', 'MISS');
        return res.json(data);
    } catch (e) {
        return res.status(502).json({ error: 'Failed to contact AeroDataBox for aircraft registration.' });
    }
});

// ==========================================
// KEYLESS FLIGHT LOOKUP (ADSBdb & adsb.lol)
// ==========================================
const adsbLolCache = new BoundedMap(CACHE_MAX_ENTRIES);

// P-01: ADSBdb Callsign Route Lookup (Cached 24h, 8s timeout, host gate 200ms)
const handleAdsbDbCallsign = async (req, res) => {
    const rawInput = String(req.params.callsign || req.params.flightNumber || '').trim().replace(/\s|-/g, '').toUpperCase();
    if (!rawInput) return res.status(400).json({ ok: false, error: 'Callsign or flight number required' });

    // Convert IATA flight number (e.g. UA123) to ICAO callsign (e.g. UAL123)
    const callsign = resolveIcaoCallsign(rawInput);
    if (!callsign) {
        return res.status(400).json({
            ok: false,
            error: 'unsupported',
            message: `Carrier code in '${rawInput}' cannot be mapped to an ICAO callsign`
        });
    }

    try {
        const result = await fetchUpstream({
            key: `adsbdb:callsign:${callsign}`,
            url: `https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`,
            ttlMs: 24 * 3600 * 1000, // 24 hours
            staleMs: 7 * 24 * 3600 * 1000, // 7 days stale on network error
            timeoutMs: 8000,
            negativeTtlMs: 24 * 3600 * 1000,
            hostGate: { minIntervalMs: 200 }, // ~5 req/s rate-gate
        });

        if (result.outcome === 'hit') res.set('X-Cache', 'HIT');
        else if (result.outcome === 'stale') res.set('X-Cache', 'STALE');
        else if (result.outcome === 'miss') res.set('X-Cache', 'MISS');

        if (result.outcome === 'notfound' || result.status === 404) {
            return res.status(404).json({ ok: false, error: 'Flight or callsign not found in ADSBdb' });
        }

        if (!result.ok) {
            return res.status(result.status || 502).json({
                ok: false,
                error: result.error || 'Failed to reach ADSBdb',
                answered: result.answered
            });
        }

        return res.json(result.data);
    } catch (err) {
        logger.warn('ADSBdb proxy exception', { error: err.message, callsign });
        return res.status(502).json({ ok: false, error: 'Internal error communicating with ADSBdb' });
    }
};

app.get('/api/proxy/adsbdb/callsign/:callsign', handleAdsbDbCallsign);
app.get('/api/proxy/adsbdb/flights/:flightNumber', handleAdsbDbCallsign);

app.get('/api/proxy/adsb-lol/callsign/:callsign', async (req, res) => {
    const requested = String(req.params.callsign || '').trim().replace(/\s|-/g, '').toUpperCase();
    if (!requested) return res.status(400).json({ error: 'Callsign is required.' });
    // Transponders broadcast ICAO callsigns (AAL100), not the IATA flight number (AA100).
    const rawCallsign = resolveIcaoCallsign(requested) || requested;

    const cacheKey = `callsign:${rawCallsign}`;
    const cached = adsbLolCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        res.set('X-Cache', 'HIT');
        return res.json(cached.data);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
        const upstream = await fetch(`https://api.adsb.lol/v2/callsign/${encodeURIComponent(rawCallsign)}`, {
            signal: controller.signal,
            headers: { 'User-Agent': 'WanderGrid/1.0' }
        });
        clearTimeout(timeout);

        if (!upstream.ok) {
            return res.status(upstream.status).json({ error: `adsb.lol returned HTTP ${upstream.status}` });
        }

        const data = await upstream.json();
        adsbLolCache.set(cacheKey, { data, expiresAt: Date.now() + 60000 }); // 1 minute
        res.set('X-Cache', 'MISS');
        return res.json(data);
    } catch (e) {
        clearTimeout(timeout);
        return res.status(e.name === 'AbortError' ? 504 : 502).json({ error: 'Failed to reach adsb.lol.' });
    }
});

// P-01: ADSBdb Aircraft Lookup (Cached 24h, 8s timeout, host gate 200ms)
app.get('/api/proxy/adsbdb/aircraft/:hexOrReg', async (req, res) => {
    const param = String(req.params.hexOrReg || '').trim().toUpperCase();
    if (!param) return res.status(400).json({ ok: false, error: 'ICAO hex or registration required' });

    try {
        const result = await fetchUpstream({
            key: `adsbdb:aircraft:${param}`,
            url: `https://api.adsbdb.com/v0/aircraft/${encodeURIComponent(param)}`,
            ttlMs: 24 * 3600 * 1000, // 24 hours
            staleMs: 7 * 24 * 3600 * 1000,
            timeoutMs: 8000,
            negativeTtlMs: 24 * 3600 * 1000,
            hostGate: { minIntervalMs: 200 },
        });

        if (result.outcome === 'hit') res.set('X-Cache', 'HIT');
        else if (result.outcome === 'stale') res.set('X-Cache', 'STALE');
        else if (result.outcome === 'miss') res.set('X-Cache', 'MISS');

        if (result.outcome === 'notfound' || result.status === 404) {
            return res.status(404).json({ ok: false, error: 'Aircraft not found in ADSBdb' });
        }

        if (!result.ok) {
            return res.status(result.status || 502).json({
                ok: false,
                error: result.error || 'Failed to reach ADSBdb aircraft',
                answered: result.answered
            });
        }

        return res.json(result.data);
    } catch (err) {
        logger.warn('ADSBdb aircraft proxy exception', { error: err.message, param });
        return res.status(502).json({ ok: false, error: 'Internal error communicating with ADSBdb' });
    }
});

// ==========================================
// P-02: REAL ROAD & RAIL ROUTING PROXIES
// ==========================================
// Persistent, batched road/rail tracing (see routeStore.js). The GET proxies below remain for single lookups.
const routeService = createRouteService({ pool, fetchUpstream });
app.post('/api/proxy/routes/resolve', routeService.handleResolve);
app.get('/api/proxy/route', handleRouteProxy);
app.get('/api/route', handleRouteProxy);
app.get('/api/proxy/rail', handleRailRouteProxy);
app.get('/api/rail', handleRailRouteProxy);

// ==========================================
// P-06: INTEGRATIONS TEST ENDPOINT (/api/proxy/test/:provider)
// ==========================================
app.get('/api/proxy/test/:provider', async (req, res) => {
    try {
        const result = await testProvider(req.params.provider);
        return res.status(result.success ? 200 : 502).json(result);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

// Tests a stored API key (Settings › Integrations). Admin only; the key is read here and never sent back.
const KEY_SERVICE_SETTING = { aviationstack: 'aviationStackApiKey', aerodatabox: 'aeroDataBoxApiKey', openaip: 'openAipApiKey' };
app.post('/api/integrations/test-key/:service', requireAdmin, async (req, res) => {
    const service = String(req.params.service || '').toLowerCase();
    if (!SERVICE_KEYS.includes(service)) return res.status(400).json({ error: 'Unknown service' });
    try {
        let key;
        if (service === 'brandfetch') key = String((await readWorkspaceSettings()).brandfetchApiKey || '').trim();
        else key = await workspaceSecret(KEY_SERVICE_SETTING[service]);
        const mode = String(await workspaceSecret('aeroDataBoxEndpoint') || process.env.INTEGRATIONS_AERO_DATA_BOX_ENDPOINT || 'rapidapi').toLowerCase();
        const cfg = AERODATABOX_ENDPOINTS[mode] || AERODATABOX_ENDPOINTS.rapidapi;
        const result = await testKey(service, key, { ...cfg, host: mode === 'rapidapi' ? 'aerodatabox.p.rapidapi.com' : '' });
        return res.json(result);
    } catch (err) {
        return sendError(res, err, 500, 'The key could not be tested');
    }
});

// The route a flight in the air (or just landed) has flown so far. OpenSky serves tracks keyless for the current
// flight only ("You cannot access historical tracks" otherwise), so this is for saving the route while it is live.
const trackCache = new BoundedMap(CACHE_MAX_ENTRIES);
const simplifyPath = (points, max = 80) => {
    if (points.length <= max) return points;
    const out = [];
    for (let i = 0; i < max; i++) out.push(points[Math.round((i * (points.length - 1)) / (max - 1))]);
    return out;
};
app.get('/api/proxy/opensky/track', async (req, res) => {
    const callsign = req.query.callsign ? (resolveIcaoCallsign(req.query.callsign) || String(req.query.callsign)).trim().toUpperCase() : '';
    let icao24 = req.query.icao24 ? String(req.query.icao24).toLowerCase() : '';
    if (!callsign && !icao24) return res.status(400).json({ error: 'Give a callsign or icao24.' });
    const key = `track_${icao24 || callsign}`;
    const hit = trackCache.get(key);
    if (hit && Date.now() < hit.expiresAt) return res.json(hit.data);
    const get = async (url, ms = 6000) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ms);
        try { return await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'WanderGrid/1.0' } }); } finally { clearTimeout(timer); }
    };
    try {
        if (!icao24) {
            // The transponder code of the aircraft flying this callsign: adsb.lol answers quickly; OpenSky's full state list is the slow fallback.
            try {
                const r = await get(`https://api.adsb.lol/v2/callsign/${encodeURIComponent(callsign)}`, 5000);
                if (r.ok) icao24 = (((await r.json()).ac || [])[0] || {}).hex || '';
            } catch { /* fall through */ }
            if (!icao24) {
                const states = await get('https://opensky-network.org/api/states/all', 9000);
                if (!states.ok) return res.status(502).json({ error: `OpenSky returned HTTP ${states.status}` });
                const found = ((await states.json()).states || []).find(s => (s[1] || '').trim().toUpperCase() === callsign);
                if (!found) return res.json({ path: [], note: 'No transponder seen for that callsign right now.' });
                icao24 = found[0];
            }
        }
        const up = await get(`https://opensky-network.org/api/tracks/all?icao24=${encodeURIComponent(icao24)}&time=0`);
        if (!up.ok) return res.json({ icao24, path: [], note: `OpenSky returned HTTP ${up.status}` });
        const body = await up.json();
        const points = (body.path || []).filter(p => p[1] != null && p[2] != null).map(p => [Math.round(p[1] * 100) / 100, Math.round(p[2] * 100) / 100]) // [latitude, longitude];
        const data = { icao24, callsign: (body.callsign || '').trim(), start: body.startTime || null, end: body.endTime || null, path: simplifyPath(points) };
        trackCache.set(key, { data, expiresAt: Date.now() + 45000 });
        return res.json(data);
    } catch (e) {
        return res.status(e.name === 'AbortError' ? 504 : 502).json({ error: 'Failed to reach OpenSky Network.' });
    }
});

// ==========================================
// OPENSKY NETWORK LIVE TELEMETRY PROXY (FREE / KEYLESS)

// ==========================================
app.get('/api/proxy/opensky/states', async (req, res) => {
    const { icao24 } = req.query;
    const callsign = req.query.callsign ? (resolveIcaoCallsign(req.query.callsign) || String(req.query.callsign)) : undefined;
    const cacheKey = `opensky_${icao24 || 'all'}_${callsign || 'all'}`;
    const cached = openSkyCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
        res.set('X-Cache', 'HIT');
        return res.json(cached.data);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
        let url = 'https://opensky-network.org/api/states/all';
        if (icao24) {
            url += `?icao24=${encodeURIComponent(icao24.toLowerCase())}`;
        }
        const upstream = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'WanderGrid/1.0' }
        });
        clearTimeout(timeout);

        if (!upstream.ok) {
            return res.status(upstream.status).json({ error: `OpenSky returned HTTP ${upstream.status}` });
        }

        const data = await upstream.json();
        // If a specific callsign was requested, filter states
        if (callsign && data.states && Array.isArray(data.states)) {
            const cleanCallsign = callsign.trim().toUpperCase();
            data.states = data.states.filter(s => (s[1] || '').trim().toUpperCase() === cleanCallsign);
        }

        openSkyCache.set(cacheKey, { data, expiresAt: Date.now() + 10000 }); // 10s TTL
        res.set('X-Cache', 'MISS');
        return res.json(data);
    } catch (e) {
        clearTimeout(timeout);
        return res.status(e.name === 'AbortError' ? 504 : 502).json({ error: 'Failed to reach OpenSky Network.' });
    }
});

// ==========================================
// OPENAIP VECTOR TILE PROXY (AERONAUTICAL CHARTS)
// ==========================================
app.get('/api/proxy/openaip/:z/:x/:y', async (req, res) => {
    const { z, x, y } = req.params;
    // Only numeric tile coordinates reach the upstream URL (no path/query injection).
    if (!/^\d{1,2}$/.test(z) || !/^\d{1,7}$/.test(x) || !/^\d{1,7}(\.pbf)?$/.test(y)) {
        return res.status(400).json({ error: 'Invalid tile coordinates' });
    }
    const apiKey = (req.get('X-OpenAIP-Key') || process.env.INTEGRATIONS_OPEN_AIP_KEY || '').trim();
    if (!apiKey) {
        return res.status(403).json({ error: 'OpenAIP API key not configured.' });
    }

    const cleanY = String(y).replace(/\.pbf$/, '');
    const upstreamUrl = `https://api.tiles.openaip.net/api/data/openaip/${z}/${x}/${cleanY}.pbf`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
        const upstream = await fetch(upstreamUrl, {
            headers: {
                'x-openaip-api-key': apiKey,
                'accept': 'application/vnd.mapbox-vector-tile,application/x-protobuf'
            },
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (upstream.status === 204) {
            return res.status(204).end();
        }

        if (!upstream.ok) {
            return res.status(upstream.status).end();
        }

        const buffer = await upstream.arrayBuffer();
        res.set({
            'Content-Type': 'application/x-protobuf',
            'Cache-Control': 'private, max-age=300, stale-while-revalidate=3600',
            'Access-Control-Allow-Origin': '*'
        });
        return res.send(Buffer.from(buffer));
    } catch (e) {
        clearTimeout(timeout);
        return res.status(502).end();
    }
});

// Local Airport Database coordinates mapping for ultra-fast, zero-dependency geocoding
const STATIC_GEO_COORDS = {
    "AMS": { "lat": "52.3086", "lon": "4.7639", "name": "Schiphol", "city": "Amsterdam", "country": "Netherlands", "tz": "Europe/Amsterdam", "iso": "NL" },
    "LHR": { "lat": "51.4706", "lon": "-0.4619", "name": "Heathrow", "city": "London", "country": "England", "tz": "Europe/London", "iso": "GB-ENG" },
    "LGW": { "lat": "51.1537", "lon": "-0.1821", "name": "Gatwick Airport", "city": "London", "country": "England", "tz": "Europe/London", "iso": "GB-ENG" },
    "MAN": { "lat": "53.3588", "lon": "-2.2728", "name": "Manchester Airport", "city": "Manchester", "country": "England", "tz": "Europe/London", "iso": "GB-ENG" },
    "BHX": { "lat": "52.4539", "lon": "-1.7480", "name": "Birmingham Airport", "city": "Birmingham", "country": "England", "tz": "Europe/London", "iso": "GB-ENG" },
    "EDI": { "lat": "55.9508", "lon": "-3.3725", "name": "Edinburgh Airport", "city": "Edinburgh", "country": "Scotland", "tz": "Europe/London", "iso": "GB-SCT" },
    "GLA": { "lat": "55.8719", "lon": "-4.4331", "name": "Glasgow Airport", "city": "Glasgow", "country": "Scotland", "tz": "Europe/London", "iso": "GB-SCT" },
    "CWL": { "lat": "51.3967", "lon": "-3.3433", "name": "Cardiff Airport", "city": "Cardiff", "country": "Wales", "tz": "Europe/London", "iso": "GB-WLS" },
    "BFS": { "lat": "54.6575", "lon": "-6.2158", "name": "Belfast Intl Airport", "city": "Belfast", "country": "Northern Ireland", "tz": "Europe/London", "iso": "GB-NIR" },
    "BHD": { "lat": "54.6181", "lon": "-5.8725", "name": "George Best Belfast City", "city": "Belfast", "country": "Northern Ireland", "tz": "Europe/London", "iso": "GB-NIR" },
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
    "MMX": { "lat": "55.5362", "lon": "13.3697", "name": "Malmö Airport", "city": "Malmö", "country": "Sweden", "tz": "Europe/Stockholm", "iso": "SE" },
    "GOT": { "lat": "57.6628", "lon": "12.2798", "name": "Göteborg Landvetter", "city": "Gothenburg", "country": "Sweden", "tz": "Europe/Stockholm", "iso": "SE" },
    "Paris": { "lat": "48.8566", "lon": "2.3522", "city": "Paris", "country": "France", "iso": "FR" },
    "London": { "lat": "51.5074", "lon": "-0.1278", "city": "London", "country": "England", "iso": "GB-ENG" },
    "Manchester": { "lat": "53.4808", "lon": "-2.2426", "city": "Manchester", "country": "England", "iso": "GB-ENG" },
    "Birmingham": { "lat": "52.4862", "lon": "-1.8904", "city": "Birmingham", "country": "England", "iso": "GB-ENG" },
    "Edinburgh": { "lat": "55.9533", "lon": "-3.1883", "city": "Edinburgh", "country": "Scotland", "iso": "GB-SCT" },
    "Glasgow": { "lat": "55.8642", "lon": "-4.2518", "city": "Glasgow", "country": "Scotland", "iso": "GB-SCT" },
    "Cardiff": { "lat": "51.4816", "lon": "-3.1791", "city": "Cardiff", "country": "Wales", "iso": "GB-WLS" },
    "Belfast": { "lat": "54.5973", "lon": "-5.9301", "city": "Belfast", "country": "Northern Ireland", "iso": "GB-NIR" },
    "New York": { "lat": "40.7128", "lon": "-74.0060", "city": "New York", "country": "United States", "iso": "US" },
    "Tokyo": { "lat": "35.6762", "lon": "139.6503", "city": "Tokyo", "country": "Japan", "iso": "JP" },
    "Dubai": { "lat": "25.2048", "lon": "55.2708", "city": "Dubai", "country": "United Arab Emirates", "iso": "AE" },
    "Rome": { "lat": "41.9028", "lon": "12.4964", "city": "Rome", "country": "Italy", "iso": "IT" },
    "Vatican City": { "lat": "41.9029", "lon": "12.4534", "city": "Vatican City", "country": "Vatican City", "iso": "VA" },
    "Vatican": { "lat": "41.9029", "lon": "12.4534", "city": "Vatican City", "country": "Vatican City", "iso": "VA" },
    "Naples": { "lat": "40.8518", "lon": "14.2681", "city": "Naples", "country": "Italy", "iso": "IT" },
    "Napoli": { "lat": "40.8518", "lon": "14.2681", "city": "Naples", "country": "Italy", "iso": "IT" },
    "Capri": { "lat": "40.5518", "lon": "14.2447", "city": "Capri", "country": "Italy", "iso": "IT" },
    "Milan": { "lat": "45.4642", "lon": "9.1900", "city": "Milan", "country": "Italy", "iso": "IT" },
    "Venice": { "lat": "45.4408", "lon": "12.3155", "city": "Venice", "country": "Italy", "iso": "IT" },
    "Florence": { "lat": "43.7696", "lon": "11.2558", "city": "Florence", "country": "Italy", "iso": "IT" },
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
    "Stockholm": { "lat": "59.3293", "lon": "18.0686", "city": "Stockholm", "country": "Sweden", "iso": "SE", "tz": "Europe/Stockholm" },
    "Sweden": { "lat": "60.1282", "lon": "18.6435", "city": "Sweden", "country": "Sweden", "iso": "SE" },
    "Malmö": { "lat": "55.6059", "lon": "13.0007", "city": "Malmö", "country": "Sweden", "iso": "SE", "tz": "Europe/Stockholm" },
    "Malmo": { "lat": "55.6059", "lon": "13.0007", "city": "Malmö", "country": "Sweden", "iso": "SE", "tz": "Europe/Stockholm" },
    "Gothenburg": { "lat": "57.7089", "lon": "11.9746", "city": "Gothenburg", "country": "Sweden", "iso": "SE", "tz": "Europe/Stockholm" },
    "Göteborg": { "lat": "57.7089", "lon": "11.9746", "city": "Gothenburg", "country": "Sweden", "iso": "SE", "tz": "Europe/Stockholm" },
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
            
            if (iataLower === queryLower || (cityLower && queryLower.length >= 3 && cityLower.startsWith(queryLower)) || (airportLower && queryLower.length >= 3 && airportLower.startsWith(queryLower)) || (cityLower && queryLower === cityLower)) {
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
        
        if (iataLower === queryLower || (queryLower.length >= 3 && (cityLower.startsWith(queryLower) || airportLower.startsWith(queryLower)))) {
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
    const queryCityPart = queryLower.split(',')[0].trim();
    for (const [key, details] of Object.entries(STATIC_GEO_COORDS)) {
        if (key.length <= 3) continue;
        const keyLower = key.toLowerCase();
        const isCountryEntry = (details.country || '').toLowerCase() === keyLower;

        // Country entries only match if the query is specifically the country itself
        if (isCountryEntry) {
            if (queryLower === keyLower) {
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
            continue;
        }

        // City entries match exact, city part, or prefix
        if (keyLower === queryLower || keyLower === queryCityPart || queryLower.startsWith(keyLower + ' ') || queryLower.startsWith(keyLower + ',')) {
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
    const { q, lat, lon } = req.query;
    if (!q || !q.trim()) {
        return res.json({ ok: true, answered: true, results: [] });
    }
    const trimmedQ = q.trim().toLowerCase();
    const biasLat = lat ? parseFloat(lat) : undefined;
    const biasLon = lon ? parseFloat(lon) : undefined;
    const cacheKey = `${trimmedQ}${Number.isFinite(biasLat) && Number.isFinite(biasLon) ? `:${biasLat.toFixed(2)},${biasLon.toFixed(2)}` : ''}`;
    
    // 0. Provider-specific lookups (used by the progressive autocomplete: providers are queried in parallel by the client).
    const provider = String(req.query.provider || '').toLowerCase();
    if (provider) {
        const tag = String(req.query.tag || '');
        const providerKey = `${provider}|${tag}|${cacheKey}`;
        if (memoryGeocoding.has(providerKey)) {
            res.set('X-Cache', 'RAM');
            return res.json({ ok: true, answered: true, provider, results: memoryGeocoding.get(providerKey) });
        }
        try {
            const row = (await pool.query('SELECT results, created_at FROM geocoding_cache WHERE query = $1', [providerKey])).rows[0];
            if (row && Date.now() - new Date(row.created_at).getTime() < GEOCODE_CACHE_TTL_MS) {
                memoryGeocoding.set(providerKey, row.results);
                res.set('X-Cache', 'HIT');
                return res.json({ ok: true, answered: true, provider, results: row.results });
            }
        } catch (dbErr) {
            console.warn('Geocoding provider cache lookup failed:', dbErr.message);
        }

        let providerResults = [];
        if (provider === 'open-meteo') providerResults = await searchOpenMeteo(q.trim());
        else if (provider === 'photon') providerResults = await searchPhoton(q.trim(), { lat: biasLat, lon: biasLon, tag });
        else if (provider === 'nominatim') providerResults = await searchNominatim(q.trim());
        else return res.status(400).json({ ok: false, answered: false, error: 'Unknown provider', results: [] });

        // Only cache non-empty answers so a transient upstream failure is retried on the next keystroke
        if (providerResults.length > 0) {
            memoryGeocoding.set(providerKey, providerResults);
            pool.query(
                'INSERT INTO geocoding_cache (query, results) VALUES ($1, $2) ON CONFLICT (query) DO UPDATE SET results = $2',
                [providerKey, JSON.stringify(providerResults)]
            ).catch(e => console.warn('Could not write geocoding provider result to cache:', e.message));
        }
        res.set('X-Cache', 'MISS');
        return res.json({ ok: true, answered: true, provider, results: providerResults });
    }

    // 1. Legacy path: search local airport data first beforehand to avoid external api/geocoding cache contamination for common trips & flights
    const localMatches = searchLocalAirportData(trimmedQ);
    if (localMatches) {
        res.set('X-Cache', 'LOCAL_AIRPORT');
        res.set('X-Answered', 'true');
        return res.json({ ok: true, answered: true, provider: 'local_airport', results: localMatches });
    }

    // 2. Instant RAM Cache (0ms)
    if (memoryGeocoding.has(cacheKey)) {
        res.set('X-Cache', 'RAM');
        res.set('X-Answered', 'true');
        const cached = memoryGeocoding.get(cacheKey);
        return res.json({ ok: true, answered: true, provider: 'cache', results: cached });
    }

    try {
        // 3. Check persistent PostgreSQL geocoding database cache if not matched in RAM
        const cacheLookup = await pool.query('SELECT results, created_at FROM geocoding_cache WHERE query = $1', [cacheKey]);
        if (cacheLookup.rows.length > 0) {
            const row = cacheLookup.rows[0];
            const age = Date.now() - new Date(row.created_at).getTime();
            if (age < GEOCODE_CACHE_TTL_MS) {
                memoryGeocoding.set(cacheKey, row.results);
                res.set('X-Cache', 'HIT');
                res.set('X-Answered', 'true');
                return res.json({ ok: true, answered: true, provider: 'cache', results: row.results });
            } else {
                console.log(`[GEOCODE] Cache expired for query: ${cacheKey}`);
            }
        }
    } catch (dbErr) {
        console.warn("Geocoding database cache lookup failed:", dbErr.message);
    }

    // 4. Multi-provider geocoding chain: Open-Meteo -> Photon -> Nominatim (P-03)
    try {
        const chainRes = await searchGeocodingChain(trimmedQ, { lat: biasLat, lon: biasLon });

        if (!chainRes.ok || !chainRes.answered) {
            res.set('X-Answered', 'false');
            return res.status(502).json({
                ok: false,
                answered: false,
                error: chainRes.error || 'Geocoding services did not answer',
                results: []
            });
        }

        const results = chainRes.results || [];

        // 5. Keep results cached in both RAM and DB for subsequent instantaneous requests (0ms latency)
        memoryGeocoding.set(cacheKey, results);
        try {
            await pool.query(
                'INSERT INTO geocoding_cache (query, results) VALUES ($1, $2) ON CONFLICT (query) DO UPDATE SET results = $2',
                [cacheKey, JSON.stringify(results)]
            );
        } catch (dbWriteErr) {
            console.warn("Could not write geocoding result to cache:", dbWriteErr.message);
        }

        res.set('X-Cache', 'MISS');
        res.set('X-Answered', 'true');
        return res.json({
            ok: true,
            answered: true,
            provider: chainRes.provider || 'none',
            results
        });
    } catch (err) {
        console.error("Geocoding chain exception:", err.message);
        res.set('X-Answered', 'false');
        return res.status(502).json({
            ok: false,
            answered: false,
            error: err.message || 'Geocoding failed due to internal error',
            results: []
        });
    }
};


// Route handlers for geocoding search
// Public holidays for the calendar's "Add a country calendar" (Nager.Date, OpenHolidays as fallback).
app.get('/api/proxy/holidays/countries', holidays.handleCountries);
app.get('/api/proxy/holidays/:year/:countryCode', holidays.handleHolidays);
app.get('/api/proxy/geocoding', handleGeocodingSearch);
app.get('/api/geocode/search', handleGeocodingSearch);

// Name of the place at a coordinate (Atlas "Find the name"). Cached upstream by coordinate; a miss is a normal answer.
app.get('/api/proxy/reverse-geocode', async (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        return res.status(400).json({ ok: false, error: 'lat and lon must be coordinates' });
    }
    const result = await reverseGeocode(lat, lon);
    res.json({ ok: true, answered: result !== null, result });
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
            res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
            return res.json(rows[0]);
        }
    } catch (err) {
        console.warn('Database lookup failed, falling back to in-memory store:', err.message);
    }

    // 2. Try In-Memory Fallback Map
    const cached = memoryAirports.get(lookupCode);
    if (cached) {
        res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
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
            res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
            return res.json(rows[0]);
        }
    } catch (err) {
        console.warn('Database carrier lookup failed, falling back to in-memory store:', err.message);
    }

    // 2. Try In-Memory Fallback Map
    const cached = memoryCarriers.get(lookupCode);
    if (cached) {
        res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
        return res.json(cached);
    }

    res.status(404).json({ error: 'Carrier code not found in database or memory cache' });
});

// Search airports by query term
// In-memory airport search over the RAM dataset (AGENTS.md §1): no DB round trip or table scan per keystroke (PERF-013).
function searchAirportsInMemory(q) {
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
    return results.slice(0, 15).map(({score, ...rest}) => rest);
}

app.get('/api/airports/search', async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) {
        return res.json([]);
    }
    
    // 1. RAM first; the database is only consulted before the in-memory maps are loaded.
    if (memoryAirports.size > 0) return res.json(searchAirportsInMemory(q));

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

    // 2. Database unavailable: answer from memory (possibly empty)
    res.json(searchAirportsInMemory(q));
});

// Search carriers by query term
// In-memory carrier search over the RAM dataset (AGENTS.md §1): no DB round trip or table scan per keystroke (PERF-013).
function searchCarriersInMemory(q) {
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
    return results.slice(0, 15).map(({score, ...rest}) => rest);
}

app.get('/api/carriers/search', async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 1) {
        return res.json([]);
    }
    
    // 1. RAM first; the database is only consulted before the in-memory maps are loaded.
    if (memoryCarriers.size > 0) return res.json(searchCarriersInMemory(q));

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

    // 2. Database unavailable: answer from memory (possibly empty)
    res.json(searchCarriersInMemory(q));
});

// Calendar Sync Endpoint (iCal Feed)
// --- Calendar subscription feed ---
// The feed URL carries a random, rotatable per-user token instead of the (guessable) user id, so
// knowing someone's email no longer reveals their travel plans. Text is escaped per RFC 5545.
const CALENDAR_TOKEN_PATTERN = /^[0-9a-f]{48}$/;
const newCalendarToken = () => crypto.randomBytes(24).toString('hex');

// The feed is built by icsFeed.mjs, the same module the app uses for its own .ics files. It is an ES module,
// so a CommonJS server loads it with import(); the promise is awaited on first use.
const icsFeedModule = import('./icsFeed.mjs');
const AIRPORT_TIMEZONES = require('./airportTimezones.json');

// Returns (creating on first use) the signed-in user's feed token.
app.get('/api/calendar/token', async (req, res) => {
    try {
        const token = await withTransaction(async (client) => {
            const { rows } = await client.query(`SELECT data FROM users WHERE id = $1`, [req.user.id]);
            if (rows.length === 0) throw new HttpError(404, 'User not found');
            const user = rows[0].data;
            if (CALENDAR_TOKEN_PATTERN.test(user.calendarToken || '')) return user.calendarToken;
            const updated = { ...user, calendarToken: newCalendarToken() };
            await client.query(`UPDATE users SET data = $2 WHERE id = $1`, [user.id, JSON.stringify(updated)]);
            return updated.calendarToken;
        });
        res.json({ token });
    } catch (err) {
        if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
        sendError(res, err, 500, 'Failed to read calendar link');
    }
});

// Invalidates the previous feed URL (e.g. after sharing it by mistake).
app.post('/api/calendar/token/rotate', async (req, res) => {
    try {
        const token = await withTransaction(async (client) => {
            const { rows } = await client.query(`SELECT data FROM users WHERE id = $1`, [req.user.id]);
            if (rows.length === 0) throw new HttpError(404, 'User not found');
            const updated = { ...rows[0].data, calendarToken: newCalendarToken() };
            await client.query(`UPDATE users SET data = $2 WHERE id = $1`, [updated.id, JSON.stringify(updated)]);
            return updated.calendarToken;
        });
        res.json({ token });
    } catch (err) {
        if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
        sendError(res, err, 500, 'Failed to reset calendar link');
    }
});

// What the person's "What to sync" panel remembers. The feed URL itself carries the choice as query
// parameters (one URL = one configuration, see icsFeed.mjs), so this only restores the panel.
app.get('/api/calendar/prefs', async (req, res) => {
    try {
        const { parseFeedOptions } = await icsFeedModule;
        const { rows } = await pool.query(`SELECT data FROM users WHERE id = $1`, [req.user.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json({ options: parseFeedOptions(rows[0].data.calendarFeed || {}) });
    } catch (err) {
        sendError(res, err, 500, 'Failed to read calendar options');
    }
});

app.put('/api/calendar/prefs', async (req, res) => {
    try {
        const { parseFeedOptions } = await icsFeedModule;
        const options = parseFeedOptions(req.body && typeof req.body === 'object' ? req.body : {});
        await withTransaction(async (client) => {
            const { rows } = await client.query(`SELECT data FROM users WHERE id = $1`, [req.user.id]);
            if (rows.length === 0) throw new HttpError(404, 'User not found');
            await client.query(`UPDATE users SET data = $2 WHERE id = $1`, [req.user.id, JSON.stringify({ ...rows[0].data, calendarFeed: options })]);
        });
        res.json({ options });
    } catch (err) {
        if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
        sendError(res, err, 500, 'Failed to save calendar options');
    }
});

// Public (token-authenticated) feed for calendar apps. Calendar apps poll it often, so a finished feed is kept
// for a short time per link and options, and answers If-None-Match with 304.
const FEED_CACHE_MS = 30_000;
const FEED_CACHE_MAX = 200;
const feedCache = new Map();
const FEED_PLACEHOLDER_TIME = Date.UTC(2026, 0, 1);

app.get('/api/calendar/:token/feed.ics', async (req, res) => {
    const { token } = req.params;
    if (!CALENDAR_TOKEN_PATTERN.test(token)) return res.status(404).send('Not found');
    try {
        const { buildFeed, parseFeedOptions, feedOptionsToQuery } = await icsFeedModule;
        const options = parseFeedOptions(req.query);
        const proto = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
        const baseUrl = (process.env.PUBLIC_URL || `${proto}://${req.get('host') || 'localhost'}`).replace(/\/+$/, '');
        const key = `${token}|${feedOptionsToQuery(options)}|${baseUrl}`;
        let entry = feedCache.get(key);
        if (!entry || entry.expires < Date.now()) {
            const { rows: userRows } = await pool.query(`SELECT data FROM users WHERE data->>'calendarToken' = $1 LIMIT 1`, [token]);
            if (userRows.length === 0) return res.status(404).send('Not found');
            const user = userRows[0].data;

            const { rows } = await pool.query(`SELECT data FROM trips`);
            const trips = rows.map(r => r.data).filter(t => t && Array.isArray(t.participants) && t.participants.includes(user.id));

            const entitlements = new Map();
            if (options.leave) {
                const { rows: ent } = await pool.query(`SELECT data FROM entitlements`);
                ent.forEach(r => entitlements.set(r.data.id, r.data.name));
            }
            let holidayCalendars = [];
            if (options.holidays && Array.isArray(user.holidayConfigIds) && user.holidayConfigIds.length > 0) {
                const { rows: cfg } = await pool.query(`SELECT data FROM configs`);
                holidayCalendars = cfg.map(r => r.data).filter(c => user.holidayConfigIds.includes(c.id));
            }

            // DTSTAMP/LAST-MODIFIED come from the records (updatedAt), never from the clock, so an unchanged feed is byte-identical.
            const newest = trips.reduce((m, t) => Math.max(m, Date.parse(t.updatedAt) || 0), 0);
            const generatedAt = newest || FEED_PLACEHOLDER_TIME;
            const body = buildFeed(trips, options, {
                now: generatedAt, baseUrl,
                airportTz: (iata) => AIRPORT_TIMEZONES[iata],
                airportName: (iata) => memoryAirports.get(iata)?.airport_name || '',
                entitlementName: (id) => entitlements.get(id) || '',
                holidayCalendars,
            });
            entry = { body, etag: `"${crypto.createHash('sha1').update(body).digest('hex')}"`, modified: new Date(generatedAt).toUTCString(), expires: Date.now() + FEED_CACHE_MS };
            if (feedCache.size >= FEED_CACHE_MAX) feedCache.clear();
            feedCache.set(key, entry);
        }
        res.set('ETag', entry.etag);
        res.set('Last-Modified', entry.modified);
        res.set('Cache-Control', 'private, max-age=0, must-revalidate');
        if (req.headers['if-none-match'] === entry.etag) return res.status(304).end();
        res.set('Content-Type', 'text/calendar;charset=utf-8');
        res.set('Content-Disposition', 'inline; filename="wandergrid.ics"');
        res.send(entry.body);
    } catch (err) {
        console.error("Calendar Feed Error", err);
        res.status(500).send("Error generating calendar");
    }
});

// Health Check
// Public liveness/readiness probe: status only. Connection errors and pool statistics are logged,
// never returned to anonymous callers (SEC-015).
app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: dbReady ? 'ok' : 'initializing' });
    } catch (err) {
        console.error('Health check: database unreachable', err);
        res.status(503).json({ status: 'error' });
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
        const isPasswordValid = await verifyPassword(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        if (!user.password.startsWith(HASH_PREFIX)) {
            // Upgrade legacy plaintext / old-format hashes now that we know the password.
            user.password = await hashPassword(password);
            await pool.query(`UPDATE users SET data = $2 WHERE id = $1`, [user.id, JSON.stringify(user)]);
        }
        
        const responseUser = toPublicUser(user);
        
        const token = signSession(user);
        
        res.json({ user: responseUser, token });
    } catch (err) {
        sendError(res, err, 500, 'Authentication failed');
    }
});

// Server-side defaults for new accounts; clients cannot choose id, role or other privileged fields.
const newUserRecord = ({ id, name, email, role, password }) => {
    const year = new Date().getFullYear();
    const allowance = role === 'Admin' ? 30 : 25;
    return {
        id, name, email, role, password, version: 1,
        leaveBalance: allowance, takenLeave: 0, allowance, lieuBalance: 0,
        activeYears: [year, year + 1, year + 2], policies: [], holidayConfigIds: []
    };
};

const readWorkspaceSettings = async (client = pool) => {
    const { rows } = await client.query(`SELECT data FROM settings WHERE key = 'workspace'`);
    return rows.length > 0 ? rows[0].data : {};
};

// Public: lets the sign-in screen decide between first-run setup, sign-in and sign-up.
app.get('/api/auth/setup-status', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT COUNT(*) AS count FROM users`);
        const settings = await readWorkspaceSettings();
        res.json({
            needsSetup: Number(rows[0].count) === 0,
            allowSelfRegistration: settings.allowSelfRegistration !== false
        });
    } catch (err) {
        sendError(res, err, 500, 'Failed to read setup status');
    }
});

app.post('/api/auth/register', async (req, res) => {
    const { name, email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(cleanEmail)) {
        return res.status(400).json({ error: 'Please enter a valid email address' });
    }
    const policyError = validatePasswordPolicy(password);
    if (policyError) return res.status(400).json({ error: policyError });
    const cleanName = (typeof name === 'string' ? name.trim() : '').slice(0, 200) || cleanEmail.split('@')[0];
    try {
        const passwordHash = await hashPassword(password);
        const user = await withTransaction(async (client) => {
            const { rows: countRows } = await client.query(`SELECT COUNT(*) AS count FROM users`);
            const isFirstUser = Number(countRows[0].count) === 0;
            if (!isFirstUser) {
                const settings = await readWorkspaceSettings(client);
                if (settings.allowSelfRegistration === false) {
                    throw new HttpError(403, 'Self-registration is disabled. Ask an administrator to add you.');
                }
            }
            const { rows: existing } = await client.query(
                `SELECT 1 FROM users WHERE id = $1 OR LOWER(data->>'email') = $1 LIMIT 1`,
                [cleanEmail]
            );
            if (existing.length > 0) {
                throw new HttpError(409, 'An account with this email already exists');
            }
            // The very first account becomes the workspace administrator; everyone else is a Partner.
            const record = newUserRecord({ id: cleanEmail, name: cleanName, email: cleanEmail, role: isFirstUser ? 'Admin' : 'Partner', password: passwordHash });
            await client.query(`INSERT INTO users (id, data) VALUES ($1, $2)`, [record.id, JSON.stringify(record)]);
            return record;
        });
        const responseUser = toPublicUser(user);

        const token = signSession(user);

        res.status(201).json({ user: responseUser, token });
    } catch (err) {
        if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
        sendError(res, err, 500, 'Registration failed');
    }
});

// --- "Auto-Setup & Demo Run" ---
// On a fresh install the demo creates the first (Admin) account; on a populated workspace it is only
// available when public sign-up is open, and then signs in a Partner demo account that can see no
// more than any self-registered user. Demo accounts have a random, never-shared password.
const DEMO_EMAIL = 'demo@wandergrid.app';
const demoSampleTrip = (ownerId) => ({
    id: `trip-demo-${crypto.randomBytes(4).toString('hex')}`,
    name: 'Grand Intercontinental Expedition',
    location: 'Paris, France',
    startDate: '2025-06-01',
    endDate: '2025-06-25',
    status: 'Past',
    privacy: 'Private',
    participants: [ownerId],
    transports: [
        { id: `tr-demo-1-${ownerId}`, itineraryId: 'itin-demo-1', type: 'One-Way', mode: 'Flight', provider: 'Air France', identifier: 'AF007', origin: 'JFK', destination: 'CDG', originLat: 40.6413, originLng: -73.7781, destLat: 49.0097, destLng: 2.5479, departureDate: '2025-06-01', departureTime: '18:30', arrivalDate: '2025-06-02', arrivalTime: '08:00', travelClass: 'Business' },
        { id: `tr-demo-2-${ownerId}`, itineraryId: 'itin-demo-2', type: 'One-Way', mode: 'Train', provider: 'Eurostar', identifier: 'ES9310', origin: 'Paris', destination: 'Amsterdam', originLat: 48.8566, originLng: 2.3522, destLat: 52.3676, destLng: 4.9041, departureDate: '2025-06-06', departureTime: '10:20', arrivalDate: '2025-06-06', arrivalTime: '13:45', travelClass: 'First' },
        { id: `tr-demo-3-${ownerId}`, itineraryId: 'itin-demo-3', type: 'One-Way', mode: 'Flight', provider: 'KLM', identifier: 'KL861', origin: 'AMS', destination: 'NRT', originLat: 52.3105, originLng: 4.7683, destLat: 35.772, destLng: 140.3929, departureDate: '2025-06-12', departureTime: '14:40', arrivalDate: '2025-06-13', arrivalTime: '08:50', travelClass: 'Economy' }
    ]
});
const DEMO_VISITED = [
    { id: 'country_US', type: 'country', code: 'US', name: 'United States', residenceStatus: 'lived_current' },
    { id: 'country_FR', type: 'country', code: 'FR', name: 'France', residenceStatus: 'visited' },
    { id: 'country_NL', type: 'country', code: 'NL', name: 'Netherlands', residenceStatus: 'visited' },
    { id: 'country_JP', type: 'country', code: 'JP', name: 'Japan', residenceStatus: 'visited' },
    { id: 'country_GB', type: 'country', code: 'GB', name: 'United Kingdom', residenceStatus: 'lived_past' }
];

app.post('/api/auth/demo', async (req, res) => {
    try {
        const user = await withTransaction(async (client) => {
            const { rows: countRows } = await client.query(`SELECT COUNT(*) AS count FROM users`);
            const isFresh = Number(countRows[0].count) === 0;
            if (!isFresh) {
                const settings = await readWorkspaceSettings(client);
                if (settings.allowSelfRegistration === false) {
                    throw new HttpError(403, 'Demo access is turned off for this workspace.');
                }
            }
            let { rows } = await client.query(`SELECT data FROM users WHERE id = $1`, [DEMO_EMAIL]);
            let demoUser = rows[0]?.data;
            if (!demoUser) {
                demoUser = newUserRecord({
                    id: DEMO_EMAIL, name: 'Demo Traveller', email: DEMO_EMAIL,
                    role: isFresh ? 'Admin' : 'Partner',
                    password: await hashPassword(crypto.randomBytes(24).toString('hex'))
                });
                demoUser.isDemo = true;
                await client.query(`INSERT INTO users (id, data) VALUES ($1, $2)`, [demoUser.id, JSON.stringify(demoUser)]);
            }
            const { rows: tripRows } = await client.query(`SELECT data FROM trips`);
            if (!tripRows.some(r => isTripParticipant(r.data, demoUser))) {
                const trip = demoSampleTrip(demoUser.id);
                await client.query(`INSERT INTO trips (id, data) VALUES ($1, $2)`, [trip.id, JSON.stringify(trip)]);
            }
            // Only an empty workspace gets sample atlas records; never write into a real household's atlas.
            if (isFresh) await bulkUpsert(client, 'visited', DEMO_VISITED.map(v => ({ ...v, ownerId: demoUser.id })));
            return demoUser;
        });
        res.json({ user: toPublicUser(user), token: signSession(user) });
    } catch (err) {
        if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
        sendError(res, err, 500, 'Demo mode is unavailable');
    }
});

// --- Password reset (no email service): an admin issues a one-time code, the member redeems it ---
const RESET_CODE_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const sha256Hex = (value) => crypto.createHash('sha256').update(value).digest('hex');
const newResetCode = () => {
    const bytes = crypto.randomBytes(10);
    const chars = Array.from(bytes, b => RESET_CODE_ALPHABET[b % RESET_CODE_ALPHABET.length]).join('');
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
};
const normaliseResetCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

app.post('/api/users/:id/reset-code', requireAdmin, async (req, res) => {
    try {
        const result = await withTransaction(async (client) => {
            const { rows } = await client.query(`SELECT data FROM users WHERE id = $1`, [req.params.id]);
            if (rows.length === 0) throw new HttpError(404, 'User not found');
            const code = newResetCode();
            const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MS).toISOString();
            const updated = { ...rows[0].data, passwordReset: { codeHash: sha256Hex(normaliseResetCode(code)), expiresAt } };
            await client.query(`UPDATE users SET data = $2 WHERE id = $1`, [updated.id, JSON.stringify(updated)]);
            return { code, expiresAt };
        });
        res.json(result);
    } catch (err) {
        if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
        sendError(res, err, 500, 'Failed to create a reset code');
    }
});

// Public: redeem a reset code. Every failure gives the same answer so codes and emails can't be probed.
app.post('/api/auth/reset-password', async (req, res) => {
    const { email, code, password } = req.body || {};
    const invalid = () => res.status(400).json({ error: 'That reset code is invalid or has expired. Ask an administrator for a new one.' });
    if (typeof email !== 'string' || typeof code !== 'string') return invalid();
    const policyError = validatePasswordPolicy(password);
    if (policyError) return res.status(400).json({ error: policyError });
    try {
        const ok = await withTransaction(async (client) => {
            const { rows } = await client.query(`SELECT data FROM users WHERE LOWER(data->>'email') = LOWER($1) LIMIT 1`, [email.trim()]);
            const user = rows[0]?.data;
            const reset = user?.passwordReset;
            if (!reset || !reset.codeHash || new Date(reset.expiresAt).getTime() < Date.now()) return false;
            if (!safeEqualHex(reset.codeHash, sha256Hex(normaliseResetCode(code)))) return false;
            const { passwordReset, ...rest } = user;
            const updated = { ...rest, password: await hashPassword(password), tokenVersion: (user.tokenVersion || 0) + 1 };
            await client.query(`UPDATE users SET data = $2 WHERE id = $1`, [user.id, JSON.stringify(updated)]);
            return true;
        });
        if (!ok) return invalid();
        res.json({ success: true });
    } catch (err) {
        sendError(res, err, 500, 'Failed to reset the password');
    }
});

// The signed-in user's own record (used to restore a session on page load).
app.get('/api/auth/me', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT data FROM users WHERE id = $1`, [req.user.id]);
        if (rows.length === 0) return res.status(401).json({ error: 'Session is no longer valid' });
        res.json(toPublicUser(rows[0].data));
    } catch (err) {
        sendError(res, err, 500, 'Failed to load the current user');
    }
});

// Ends every session of the current user by bumping their token version.
app.post('/api/auth/logout', async (req, res) => {
    try {
        await withTransaction(async (client) => {
            const { rows } = await client.query(`SELECT data FROM users WHERE id = $1`, [req.user.id]);
            if (rows.length === 0) return;
            const user = { ...rows[0].data, tokenVersion: (rows[0].data.tokenVersion || 0) + 1 };
            await client.query(`UPDATE users SET data = $2 WHERE id = $1`, [user.id, JSON.stringify(user)]);
        });
        res.json({ success: true });
    } catch (err) {
        sendError(res, err, 500, 'Failed to sign out');
    }
});

// Users
app.get('/api/users', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT data FROM users`);
        const users = rows.map(r => toPublicUser(r.data)); // never send password hashes
        res.json(users);
    } catch (err) {
        sendError(res, err, 500, 'Failed to fetch users');
    }
});

app.post('/api/users', requireAdmin, async (req, res) => {
    const user = req.body;
    const problem = validateRecord('users', user);
    if (problem) return res.status(400).json({ error: `Invalid user: ${problem}` });
    
    try {
        delete user.tokenVersion;
        user.version = 1;
        delete user.calendarToken;
        delete user.passwordReset;
        delete user.passwordResetRequired;
        if (user.password) {
            const policyError = validatePasswordPolicy(user.password);
            if (policyError) return res.status(400).json({ error: policyError });
            user.password = await hashPassword(user.password);
        } else {
            delete user.password;
        }
        await withTransaction(async (client) => {
            const { rows: existing } = await client.query(
                `SELECT 1 FROM users WHERE id = $1 OR ($2::text IS NOT NULL AND LOWER(data->>'email') = LOWER($2)) LIMIT 1`,
                [user.id, typeof user.email === 'string' ? user.email.trim() : null]
            );
            if (existing.length > 0) throw new HttpError(409, 'An account with this email already exists');
            await client.query(`INSERT INTO users (id, data) VALUES ($1, $2)`, [user.id, JSON.stringify(user)]);
        });
        res.status(201).json(toPublicUser(user));
    } catch (err) {
        if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
        sendError(res, err, 500, 'Failed to insert user');
    }
});

const countAdmins = async (client) => {
    const { rows } = await client.query(`SELECT COUNT(*) AS count FROM users WHERE data->>'role' = 'Admin'`);
    return Number(rows[0].count);
};

// Admins may edit anyone; everyone else may edit only their own profile and never their own role.
app.put('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const isAdmin = req.user.role === 'Admin';
    if (!isAdmin && req.user.id !== id) {
        return res.status(403).json({ error: 'You can only edit your own profile' });
    }
    const updatedUser = { ...(req.body || {}), id };
    const problem = validateRecord('users', updatedUser);
    if (problem) return res.status(400).json({ error: `Invalid user: ${problem}` });
    try {
        const saved = await withTransaction(async (client) => {
            const { rows } = await client.query(`SELECT data FROM users WHERE id = $1`, [id]);
            if (rows.length === 0) throw new HttpError(404, 'User not found');
            const prevUser = rows[0].data;

            Object.assign(updatedUser, withNextVersion('users', updatedUser, prevUser));
            if (!isAdmin) updatedUser.role = prevUser.role;
            if (prevUser.role === 'Admin' && updatedUser.role !== 'Admin' && await countAdmins(client) <= 1) {
                throw new HttpError(409, 'The workspace needs at least one administrator');
            }
            if (typeof updatedUser.email === 'string' && updatedUser.email.trim().toLowerCase() !== String(prevUser.email || '').toLowerCase()) {
                const { rows: clash } = await client.query(
                    `SELECT 1 FROM users WHERE id <> $1 AND LOWER(data->>'email') = LOWER($2) LIMIT 1`,
                    [id, updatedUser.email.trim()]
                );
                if (clash.length > 0) throw new HttpError(409, 'An account with this email already exists');
            }

            // An empty password keeps the current one; anything else is a new password (never a raw hash).
            if (typeof updatedUser.password !== 'string' || updatedUser.password.trim() === '' || updatedUser.password === prevUser.password) {
                updatedUser.password = prevUser.password;
            } else {
                const policyError = validatePasswordPolicy(updatedUser.password);
                if (policyError) throw new HttpError(400, policyError);
                updatedUser.password = await hashPassword(updatedUser.password);
            }
            if (!updatedUser.password) delete updatedUser.password;
            // Clients never set the token version; a password or role change signs out other sessions.
            updatedUser.tokenVersion = prevUser.tokenVersion || 0;
            // Server-managed fields are never taken from the client.
            delete updatedUser.passwordResetRequired;
            delete updatedUser.sessionToken;
            if (prevUser.calendarToken) updatedUser.calendarToken = prevUser.calendarToken;
            else delete updatedUser.calendarToken;
            if (prevUser.calendarFeed) updatedUser.calendarFeed = prevUser.calendarFeed;
            else delete updatedUser.calendarFeed;
            // An outstanding reset code survives profile edits but not a password change.
            if (prevUser.passwordReset && updatedUser.password === prevUser.password) updatedUser.passwordReset = prevUser.passwordReset;
            else delete updatedUser.passwordReset;
            if (updatedUser.password !== prevUser.password || updatedUser.role !== prevUser.role) {
                updatedUser.tokenVersion += 1;
            }
            await client.query(`UPDATE users SET data = $2 WHERE id = $1`, [id, JSON.stringify(updatedUser)]);
            return updatedUser;
        });
        // Editing your own password/role revokes your other sessions; hand this one a fresh token.
        const body = toPublicUser(saved);
        if (id === req.user.id) body.sessionToken = signSession(saved);
        res.json(body);
    } catch (err) {
        if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
        sendError(res, err, 500, 'Failed to update user');
    }
});

app.delete('/api/users/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    if (id === req.user.id) {
        return res.status(409).json({ error: "You can't delete your own account" });
    }
    try {
        await withTransaction(async (client) => {
            const { rows } = await client.query(`SELECT data FROM users WHERE id = $1`, [id]);
            if (rows.length > 0 && rows[0].data.role === 'Admin' && await countAdmins(client) <= 1) {
                throw new HttpError(409, 'The workspace needs at least one administrator');
            }
            await client.query(`DELETE FROM users WHERE id = $1`, [id]);
        });
        res.json({ success: true });
    } catch (err) {
        if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
        sendError(res, err, 500, 'Failed to delete users');
    }
});

// Trips
// Applies a multi-record change (e.g. bundling flights into a trip, moving a flight) in ONE
// transaction, so a failure part-way can never leave flights deleted but not re-saved.
const BATCH_KEYS = { upsertTrips: 'trips', deleteTrips: 'trips', upsertFlights: 'flights', deleteFlights: 'flights' };
app.post('/api/batch', async (req, res) => {
    const body = req.body || {};
    for (const key of Object.keys(BATCH_KEYS)) {
        const list = body[key];
        if (list === undefined) continue;
        const isDelete = key.startsWith('delete');
        const valid = Array.isArray(list) && list.every(item => isDelete
            ? typeof item === 'string' && item
            : item && typeof item === 'object' && typeof item.id === 'string' && item.id);
        if (!valid) return res.status(400).json({ error: `${key} must be an array of ${isDelete ? 'ids' : 'records with an id'}` });
    }
    const versions = {};
    try {
        await withTransaction(async (client) => {
            if (body.upsertTrips) versions.trips = versionMap(await guardedBulkUpsert(client, 'trips', body.upsertTrips, req.user));
            if (body.upsertFlights) versions.flights = versionMap(await guardedBulkUpsert(client, 'flights', body.upsertFlights, req.user));
            for (const id of body.deleteTrips || []) await guardedDelete(client, 'trips', id, req.user);
            for (const id of body.deleteFlights || []) await guardedDelete(client, 'flights', id, req.user);
        });
        res.json({ success: true, versions });
    } catch (err) {
        if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
        sendError(res, err, 500, 'Failed to apply changes');
    }
});

app.get('/api/trips', getResources('trips'));
app.post('/api/trips', createResource('trips'));
app.post('/api/trips/bulk', async (req, res) => {
    const list = req.body;
    if (!Array.isArray(list)) {
        return res.status(400).json({ error: 'Body must be an array of trips' });
    }
    try {
        let count = 0;
        let versions = {};
        await withTransaction(async (client) => {
            const saved = await guardedBulkUpsert(client, 'trips', list, req.user);
            count = saved.length;
            versions = versionMap(saved);
        });
        res.status(201).json({ success: true, count, versions });
    } catch (err) {
        if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
        sendError(res, err, 500, 'Failed to perform bulk trip upsert');
    }
});
app.put('/api/trips/:id', updateResource('trips'));
app.delete('/api/trips/:id', deleteResource('trips'));

// Events (Custom Events)
app.get('/api/events', getResources('events'));
app.post('/api/events', requireAdmin, createResource('events'));
app.put('/api/events/:id', requireAdmin, updateResource('events'));
app.delete('/api/events/:id', requireAdmin, deleteResource('events'));

// Entitlements
app.get('/api/entitlements', getResources('entitlements'));
app.post('/api/entitlements', requireAdmin, createResource('entitlements'));
app.put('/api/entitlements/:id', requireAdmin, updateResource('entitlements'));
app.delete('/api/entitlements/:id', requireAdmin, deleteResource('entitlements'));

// Configs (Saved Holiday Configs)
app.get('/api/configs', getResources('configs'));
app.post('/api/configs', requireAdmin, createResource('configs'));
app.put('/api/configs/:id', requireAdmin, updateResource('configs'));
app.delete('/api/configs/:id', requireAdmin, deleteResource('configs'));

// Flights
app.get('/api/flights', getResources('flights'));
app.post('/api/flights', createResource('flights'));
app.post('/api/flights/bulk', async (req, res) => {
    const list = req.body;
    if (!Array.isArray(list)) {
        return res.status(400).json({ error: 'Body must be an array of flights' });
    }
    try {
        let count = 0;
        let versions = {};
        await withTransaction(async (client) => {
            const saved = await guardedBulkUpsert(client, 'flights', list, req.user);
            count = saved.length;
            versions = versionMap(saved);
        });
        res.status(201).json({ success: true, count, versions });
    } catch (err) {
        if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
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
        let count = 0;
        let versions = {};
        await withTransaction(async (client) => {
            const saved = await guardedBulkUpsert(client, 'visited', list, req.user);
            count = saved.length;
            versions = versionMap(saved);
        });
        res.status(201).json({ success: true, count, versions });
    } catch (err) {
        if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
        sendError(res, err, 500, 'Failed to perform bulk visited upsert');
    }
});
// One atlas merge step in a single transaction: write the surviving records, then remove the ones folded
// into them. All or nothing, so a failed step leaves both the survivors and the duplicates as they were.
const MAX_VISITED_MERGE = 500;
app.post('/api/visited/merge', async (req, res) => {
    const { upserts = [], deleteIds = [] } = req.body || {};
    if (!Array.isArray(upserts) || !Array.isArray(deleteIds) || deleteIds.some(id => typeof id !== 'string')) {
        return res.status(400).json({ error: 'upserts and deleteIds must be lists' });
    }
    if (upserts.length + deleteIds.length > MAX_VISITED_MERGE) {
        return res.status(413).json({ error: `At most ${MAX_VISITED_MERGE} records per merge step` });
    }
    try {
        let versions = {};
        await withTransaction(async (client) => {
            const saved = upserts.length > 0 ? await guardedBulkUpsert(client, 'visited', upserts, req.user) : [];
            versions = versionMap(saved);
            const keep = new Set(upserts.map(u => u && u.id));
            for (const id of deleteIds) {
                if (!keep.has(id)) await guardedDelete(client, 'visited', id, req.user);
            }
        });
        res.json({ success: true, upserted: upserts.length, deleted: deleteIds.length, versions });
    } catch (err) {
        if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
        sendError(res, err, 500, 'Failed to merge visited records');
    }
});
app.put('/api/visited/:id', updateResource('visited'));
app.delete('/api/visited/:id', deleteResource('visited'));

// Settings (Singleton)
// --- Workspace settings & third-party secrets (SEC-010) ---
// Paid API keys are write-only for clients: GET returns a mask when a key is set, PUT keeps the
// stored key when it receives the mask, and the /api/proxy/* routes inject keys server-side.
// (The Brandfetch key is a public client identifier used in image URLs and stays readable.)
const SECRET_SETTING_KEYS = ['aviationStackApiKey', 'aeroDataBoxApiKey', 'openAipApiKey'];
const SECRET_MASK = '••••••••';
const SECRET_ENV_FALLBACKS = {
    aviationStackApiKey: 'INTEGRATIONS_AVIATION_STACK_KEY',
    aeroDataBoxApiKey: 'INTEGRATIONS_AERO_DATA_BOX_KEY',
    openAipApiKey: 'INTEGRATIONS_OPEN_AIP_KEY',
};
// Keys of integrations that were removed. Workspaces and backups made before may still carry them: they are
// ignored, never sent to a client, and dropped the next time the settings are saved.
const OBSOLETE_SETTING_KEYS = ['googleGeminiApiKey', 'cartoApiKey'];
const dropObsoleteSettings = (obj) => {
    if (obj && typeof obj === 'object') for (const k of OBSOLETE_SETTING_KEYS) delete obj[k];
    return obj;
};

const maskSettings = (settings) => {
    const masked = dropObsoleteSettings({ ...settings });
    const configuredKeys = {};
    const keySources = {};
    for (const key of SECRET_SETTING_KEYS) {
        const hasKey = Boolean(settings[key] || process.env[SECRET_ENV_FALLBACKS[key]]);
        configuredKeys[key] = hasKey;
        // Where the key comes from: saved in the workspace, or provided by the host's environment.
        keySources[key] = settings[key] ? 'workspace' : hasKey ? 'env' : 'none';
        masked[key] = hasKey ? SECRET_MASK : '';
    }
    masked.configuredKeys = configuredKeys;
    masked.keySources = keySources;
    return masked;
};

let secretsCache = { value: null, expiresAt: 0 };
const invalidateSecretsCache = () => { secretsCache = { value: null, expiresAt: 0 }; };
async function workspaceSecret(key) {
    if (!secretsCache.value || secretsCache.expiresAt < Date.now()) {
        secretsCache = { value: await readWorkspaceSettings(), expiresAt: Date.now() + 30000 };
    }
    return String(secretsCache.value[key] || process.env[SECRET_ENV_FALLBACKS[key]] || '').trim();
}

app.get('/api/settings', async (req, res) => {
    try {
        res.json(maskSettings(await readWorkspaceSettings()));
    } catch (err) {
        sendError(res, err, 500, 'Failed to retrieve workspace settings');
    }
});

app.put('/api/settings', requireAdmin, async (req, res) => {
    try {
        const incoming = dropObsoleteSettings({ ...(req.body || {}) });
        delete incoming.configuredKeys;
        delete incoming.keySources;
        const saved = await withTransaction(async (client) => {
            const current = await readWorkspaceSettings(client);
            for (const key of SECRET_SETTING_KEYS) {
                // The mask (or an absent field) means "unchanged"; an empty string clears the key.
                if (incoming[key] === undefined || incoming[key] === SECRET_MASK) {
                    if (current[key]) incoming[key] = current[key]; else delete incoming[key];
                }
            }
            await client.query(
                `INSERT INTO settings (key, data) VALUES ('workspace', $1) ON CONFLICT (key) DO UPDATE SET data = $1`,
                [JSON.stringify(incoming)]
            );
            return incoming;
        });
        invalidateSecretsCache();
        res.json(maskSettings(saved));
    } catch (err) {
        sendError(res, err, 500, 'Failed to update workspace settings');
    }
});

// Partial update: only the fields sent are changed, so two admins (or the sidebar theme toggle and the
// Settings page) editing different fields can't silently undo each other (REL-005).
app.patch('/api/settings', requireAdmin, async (req, res) => {
    try {
        const changes = dropObsoleteSettings({ ...(req.body || {}) });
        delete changes.configuredKeys;
        delete changes.keySources;
        for (const key of SECRET_SETTING_KEYS) if (changes[key] === SECRET_MASK) delete changes[key];
        const saved = await withTransaction(async (client) => {
            const merged = dropObsoleteSettings({ ...(await readWorkspaceSettings(client)), ...changes });
            await client.query(
                `INSERT INTO settings (key, data) VALUES ('workspace', $1) ON CONFLICT (key) DO UPDATE SET data = $1`,
                [JSON.stringify(merged)]
            );
            return merged;
        });
        invalidateSecretsCache();
        res.json(maskSettings(saved));
    } catch (err) {
        sendError(res, err, 500, 'Failed to update workspace settings');
    }
});

// --- Background Job Manager & Supervisor Engine ---
// Finished jobs (and their results, e.g. a whole backup) are kept for a while for polling, then dropped.
const JOB_RETENTION_MS = process.env.JOB_RETENTION_MS ? parseInt(process.env.JOB_RETENTION_MS, 10) : 30 * 60 * 1000;
const activeJobs = new BoundedMap(100);
const scheduleJobCleanup = (jobId) => {
    const timer = setTimeout(() => activeJobs.delete(jobId), JOB_RETENTION_MS);
    if (timer.unref) timer.unref();
};

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
            scheduleJobCleanup(jobId);
        } catch (err) {
            console.error(`Background Job [${jobId}] failed:`, err.message);
            const job = activeJobs.get(jobId);
            if (job) {
                job.status = 'Failed';
                job.progress = 100;
                job.error = err.message;
                activeJobs.set(jobId, job);
            }
            scheduleJobCleanup(jobId);
        }
    });
    
    return jobId;
}

// Background Task Status Endpoint
// Background jobs (backup, dataset refresh) are administrator tools.
app.use('/api/jobs', requireAdmin);

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
        backup.workspaceSettings = dropObsoleteSettings(settingsRes.rows.length > 0 ? { ...settingsRes.rows[0].data } : {});
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
        const datasets = await refreshAllGlobalDatasets();
        progress(90);
        await loadGlobalData();
        progress(100);
        return { message: 'Database global datasets successfully refreshed and memory maps synced.', datasets };
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
app.get('/api/backup', requireAdmin, async (req, res) => {
    try {
        const tables = ['users', 'trips', 'events', 'entitlements', 'configs', 'flights', 'visited'];
        const backup = {};
        
        for (const table of tables) {
            const { rows } = await pool.query(`SELECT data FROM ${table}`);
            backup[table] = rows.map(r => r.data);
        }
        
        const settingsRes = await pool.query(`SELECT data FROM settings WHERE key = 'workspace'`);
        backup.workspaceSettings = dropObsoleteSettings(settingsRes.rows.length > 0 ? { ...settingsRes.rows[0].data } : {});
        
        const cleanBackup = removeSensitiveData(backup);
        res.json(cleanBackup);
    } catch (err) {
        sendError(res, err, 500, 'Failed to generate database backup');
    }
});

// Restored accounts keep their current password, accept a stored hash, or hash a plaintext value.
// A user with none gets no usable password (an admin must set one) — never a shared default.
async function restoredPassword(incoming, existing) {
    if (typeof incoming === 'string' && incoming) {
        return isStoredPasswordHash(incoming) ? incoming : hashPassword(incoming);
    }
    return (existing && existing.password) || '';
}

app.post('/api/restore', requireAdmin, async (req, res) => {
    const rawBody = req.body || {};
    const data = (rawBody.data && typeof rawBody.data === 'object') ? rawBody.data : rawBody;
    
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

    const restoreOptions = rawBody.restoreOptions || data.restoreOptions || {};
    const mode = restoreOptions.mode === 'merge' ? 'merge' : 'replace';
    const selected = restoreOptions.selectedCategories || {
        flights: true,
        roadTrips: true,
        visited: true,
        settings: true,
        users: true,
        calendar: true
    };

    const currentUserId = restoreOptions.currentUserId || req.user?.id;
    const currentUserEmail = (restoreOptions.currentUserEmail || req.user?.email || '').toLowerCase().trim();

    // Helper functions for trip categorization
    const isTripRoad = (t) => {
        if (t.icon === '🚗') return true;
        if (t.locations && t.locations.length > 1) return true;
        const transports = t.transports || [];
        return transports.some(tr => tr.mode && tr.mode !== 'Flight');
    };
    const isTripAir = (t) => {
        if (t.isBundleOnly || t.icon === '✈️') return true;
        const transports = t.transports || [];
        if (transports.length === 0) return true; // General trip default
        return transports.some(tr => !tr.mode || tr.mode === 'Flight');
    };

    // Runs as a background job (202 + poll /api/jobs/status/:id): large restores outlive the
    // client's request timeout, and clients therefore never resend the same restore.
    const jobId = runBackgroundJob('restore', () => withTransaction(async (client) => {
        
        // 1. RESTORE USERS (With Active Session Safety)
        if (selected.users !== false && data.users && Array.isArray(data.users)) {
            const { rows: existingUserRows } = await client.query('SELECT id, data FROM users');
            const existingUserMap = new Map(existingUserRows.map(r => [r.id, r.data]));
            
            // Find currently active user in DB
            let activeUserRecord = null;
            for (const r of existingUserRows) {
                if (r.id === currentUserId || (r.data?.email && r.data.email.toLowerCase().trim() === currentUserEmail)) {
                    activeUserRecord = r.data;
                    break;
                }
            }
            if (!activeUserRecord && restoreOptions.currentUser) {
                activeUserRecord = restoreOptions.currentUser;
            }

            if (mode === 'replace') {
                await client.query('TRUNCATE TABLE users');
                let sessionUserInserted = false;
                for (const item of data.users) {
                    const existing = existingUserMap.get(item.id);
                    item.password = await restoredPassword(item.password, existing);
                    if (item.id === currentUserId || (item.email && item.email.toLowerCase().trim() === currentUserEmail)) {
                        sessionUserInserted = true;
                    }
                }
                await bulkUpsert(client, 'users', data.users);
                // Guarantee active user is never deleted
                if (!sessionUserInserted && activeUserRecord) {
                    await client.query(
                        'INSERT INTO users (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2',
                        [activeUserRecord.id, JSON.stringify(activeUserRecord)]
                    );
                }
            } else {
                // Merge users
                const mergedUsers = [];
                for (const item of data.users) {
                    const existing = existingUserMap.get(item.id);
                    const mergedUser = existing ? { ...existing, ...item } : item;
                    mergedUser.password = await restoredPassword(item.password, existing);
                    mergedUsers.push(mergedUser);
                }
                await bulkUpsert(client, 'users', mergedUsers);
            }
        }

        // 2. RESTORE TRIPS (Granular Flights vs Road Trips)
        if ((selected.flights !== false || selected.roadTrips !== false) && data.trips && Array.isArray(data.trips)) {
            const { rows: existingTripRows } = await client.query('SELECT id, data FROM trips');
            const existingTripsMap = new Map(existingTripRows.map(r => [r.id, r.data]));

            const incomingTrips = data.trips.filter(t => {
                const road = isTripRoad(t);
                const air = isTripAir(t);
                if (selected.roadTrips && selected.flights) return true;
                if (selected.roadTrips && road) return true;
                if (selected.flights && air) return true;
                return false;
            });

            if (mode === 'replace') {
                // Keep categories not selected
                const tripsToKeep = new Map();
                if (!selected.roadTrips) {
                    existingTripRows.forEach(r => { if (isTripRoad(r.data)) tripsToKeep.set(r.id, r.data); });
                }
                if (!selected.flights) {
                    existingTripRows.forEach(r => { if (isTripAir(r.data) && !isTripRoad(r.data)) tripsToKeep.set(r.id, r.data); });
                }
                // Add incoming
                incomingTrips.forEach(t => tripsToKeep.set(t.id, t));

                await client.query('TRUNCATE TABLE trips');
                await bulkUpsert(client, 'trips', Array.from(tripsToKeep.values()));
            } else {
                // Merge
                await bulkUpsert(client, 'trips', incomingTrips.map(t => {
                    const existing = existingTripsMap.get(t.id);
                    return existing ? { ...existing, ...t } : t;
                }));
            }
        }

        // 3. RESTORE FLIGHTS (Independent Transports)
        if ((selected.flights !== false || selected.roadTrips !== false) && data.flights && Array.isArray(data.flights)) {
            const { rows: existingFlightRows } = await client.query('SELECT id, data FROM flights');
            const existingFlightsMap = new Map(existingFlightRows.map(r => [r.id, r.data]));

            const incomingFlights = data.flights.filter(f => {
                const isAir = !f.mode || f.mode === 'Flight';
                if (selected.flights && isAir) return true;
                if (selected.roadTrips && !isAir) return true;
                return false;
            });

            if (mode === 'replace') {
                const flightsToKeep = new Map();
                if (!selected.flights) {
                    existingFlightRows.forEach(r => { if (!r.data.mode || r.data.mode === 'Flight') flightsToKeep.set(r.id, r.data); });
                }
                if (!selected.roadTrips) {
                    existingFlightRows.forEach(r => { if (r.data.mode && r.data.mode !== 'Flight') flightsToKeep.set(r.id, r.data); });
                }
                incomingFlights.forEach(f => flightsToKeep.set(f.id, f));

                await client.query('TRUNCATE TABLE flights');
                await bulkUpsert(client, 'flights', Array.from(flightsToKeep.values()));
            } else {
                await bulkUpsert(client, 'flights', incomingFlights.map(f => {
                    const existing = existingFlightsMap.get(f.id);
                    return existing ? { ...existing, ...f } : f;
                }));
            }
        }

        // 4. RESTORE VISITED PLACES
        if (selected.visited !== false && data.visited && Array.isArray(data.visited)) {
            if (mode === 'replace') await client.query('TRUNCATE TABLE visited');
            await bulkUpsert(client, 'visited', data.visited);
        }

        // 5. RESTORE CALENDAR / EVENTS / ENTITLEMENTS / CONFIGS
        if (selected.calendar !== false) {
            const calTables = ['events', 'entitlements', 'configs'];
            for (const table of calTables) {
                if (data[table] && Array.isArray(data[table])) {
                    if (mode === 'replace') await client.query(`TRUNCATE TABLE ${table}`);
                    await bulkUpsert(client, table, data[table]);
                }
            }
        }
        
        // 6. RESTORE WORKSPACE SETTINGS & API KEYS
        if (selected.settings !== false && data.workspaceSettings && typeof data.workspaceSettings === 'object') {
            let currentSettings = {};
            try {
                const settingsRes = await client.query(`SELECT data FROM settings WHERE key = 'workspace'`);
                if (settingsRes.rows.length > 0 && settingsRes.rows[0].data) {
                    currentSettings = settingsRes.rows[0].data;
                }
            } catch (err) {}
            if (!currentSettings || typeof currentSettings !== 'object') {
                currentSettings = {};
            }

            const mergedSettings = mode === 'merge' 
                ? { ...currentSettings, ...data.workspaceSettings } 
                : { ...data.workspaceSettings };
                
            const keysToCheck = ['aviationStackApiKey', 'aeroDataBoxApiKey', 'aeroDataBoxEndpoint', 'openAipApiKey', 'brandfetchApiKey'];
            delete mergedSettings.configuredKeys;
            dropObsoleteSettings(mergedSettings);
            keysToCheck.forEach(k => {
                if (mergedSettings[k] === SECRET_MASK) delete mergedSettings[k]; // masked values are never real keys
                if (!mergedSettings[k] && currentSettings && currentSettings[k]) {
                    mergedSettings[k] = currentSettings[k];
                }
            });

            await client.query(
                `INSERT INTO settings (key, data) VALUES ('workspace', $1) ON CONFLICT (key) DO UPDATE SET data = $1`,
                [JSON.stringify(mergedSettings)]
            );
        }
        
        invalidateSecretsCache();
        return { success: true, mode, selected };
    }));
    res.status(202).json({ jobId, status: 'Processing' });
});

app.post('/api/wipe', requireAdmin, async (req, res) => {
    try {
        await withTransaction(async (client) => {
            const tables = ['users', 'trips', 'events', 'entitlements', 'configs', 'flights', 'visited', 'settings'];
            for (const table of tables) {
                await client.query(`TRUNCATE TABLE ${table} CASCADE`);
            }
        });
        res.json({ success: true });
    } catch (err) {
        sendError(res, err, 500, 'Failed to wipe database content');
    }
});

// Last-resort error handler: async failures and body-parser errors become JSON responses
// instead of hung requests or a crashed process.
app.use('/api', (err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = Number(err.status || err.statusCode) || 500;
    if (status === 413) return res.status(413).json({ error: 'Request is too large' });
    if (status === 400 && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON' });
    sendError(res, err, status >= 400 && status < 600 ? status : 500, 'An unexpected error occurred');
});

// Serve React App
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.sendFile(path.join(__dirname, 'client_build', 'index.html'));
});

// Listen only when run directly (`node server.js`); tests import `app` and listen themselves.
let server = null;
const start = (port = PORT) => {
    server = app.listen(port, () => {
        console.log(`Server running on port ${server.address().port}`);
    });
    return server;
};
if (require.main === module) start();

const stopBackgroundTasks = () => { backgroundTasksStopped = true; if (schedulerInterval) clearInterval(schedulerInterval); };

module.exports = { app, pool, ready, start, stopBackgroundTasks };

// --- Graceful Shutdown Handler ---
const gracefulShutdown = async (signal) => {
    console.warn(`[SYSTEM] Received ${signal}. Initiating graceful shutdown...`);
    
    // Clear any active background scheduler timer to release the Node.js event line
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        console.log('[SYSTEM] Background scheduler dataset refresh timer cleared.');
    }

    // Stop accepting new connections and wait (bounded) for in-flight requests to finish before the
    // pool is closed, so a deploy doesn't cut off a restore or multi-step save mid-way (REL-016).
    if (server) {
        const drainMs = process.env.SHUTDOWN_DRAIN_MS ? parseInt(process.env.SHUTDOWN_DRAIN_MS, 10) : 10000;
        await new Promise((resolve) => {
            const timer = setTimeout(() => {
                console.warn(`[SYSTEM] Requests still open after ${drainMs}ms; closing them.`);
                server.closeAllConnections?.();
                resolve();
            }, drainMs);
            server.close(() => {
                clearTimeout(timer);
                console.log('[SYSTEM] Active HTTP server sessions closed.');
                resolve();
            });
            server.closeIdleConnections?.();
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

module.exports.gracefulShutdown = gracefulShutdown;
// Internals exercised directly by the API test-suite.
module.exports.__test = { BoundedMap, GLOBAL_DATASETS, parseDatasetLines, refreshGlobalDataset, activeJobs, loadGlobalData };
