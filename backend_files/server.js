
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
const sharedTrip = require('./sharedTrip');
const { resolveIcaoCallsign } = require('./carrierMapping');
const { handleRouteProxy, handleRailRouteProxy } = require('./routeProxy');
const { createRouteService } = require('./routeStore');
const { searchGeocodingChain, searchOpenMeteo, searchPhoton, searchNominatim, reverseGeocode } = require('./geocodingChain');
const { testProvider } = require('./integrationsTester');
const { SERVICE_KEYS, testKey } = require('./keyTester');
const holidays = require('./holidays');
const { runMigrations } = require('./migrations');
const { tripKind } = require('./tripKind');
const createRecordStore = require('./records');
const registerRecordRoutes = require('./recordRoutes');
const registerAuthRoutes = require('./auth');
const registerSettingsRoutes = require('./settings');
const registerJobRoutes = require('./jobs');
const registerProxyRoutes = require('./proxy');
const fxRates = require('./fxRates');

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
    
    // Bypass authentication for public paths, calendar feeds and public trip links
    const isPublic = publicPaths.some(p => fullPath === p) || (fullPath.startsWith('/api/calendar/') && fullPath.endsWith('/feed.ics')) || fullPath.startsWith('/api/public/trips/');
    
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

// Behind a reverse proxy or tunnel every request arrives from the proxy's address, so rate limits would be
// shared by all users. TRUST_PROXY is a hop count (1 for Cloudflare Tunnel, Caddy or Traefik in front), 'true',
// or a subnet list as Express accepts. Left unset, the socket address is used (no proxy).
if (process.env.TRUST_PROXY) {
    const raw = process.env.TRUST_PROXY.trim();
    app.set('trust proxy', /^\d+$/.test(raw) ? Number(raw) : raw === 'true' ? true : raw === 'false' ? false : raw);
}

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
        if (filePath.endsWith('.html') || filePath.endsWith('sw.js') || filePath.endsWith('registerSW.js') || filePath.endsWith('manifest.json') || /(?:^|[\\/])(?:icon\.svg|favicon[^\\/]*|apple-touch-icon\.png|app-icon[^\\/]*\.png)$/.test(filePath)) {
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
// The strict limiter only guards the endpoints that take credentials. Session checks (/auth/me) and the
// public setup-status run on every page load and must not count towards it (F-02).
app.use(['/api/auth/login', '/api/auth/register', '/api/auth/demo', '/api/auth/reset-password'], authRateLimiter);

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

        // Public trip links: one row per trip that is shared; the token is the only key (sharedTrip.js)
        await client.query(`
            CREATE TABLE IF NOT EXISTS trip_shares (
              token TEXT PRIMARY KEY CHECK (token <> ''),
              trip_id TEXT NOT NULL UNIQUE,
              created_by TEXT,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

        // Shape changes to stored JSON (D-06). Runs after the tables exist and before the server reports ready.
        const appliedMigrations = await runMigrations(pool);
        if (appliedMigrations.length) console.log(`Applied ${appliedMigrations.length} migration(s): ${appliedMigrations.join(', ')}`);

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

// --- Record store (validation, ownership, concurrency, CRUD): see records.js ---
const store = createRecordStore({ pool, sendError, HttpError, EMAIL_PATTERN });
const { withTransaction, validateRecord, isTripParticipant, withNextVersion, bulkUpsert } = store;

// --- Workspace settings reader (shared by auth, proxies and settings) ---
const readWorkspaceSettings = async (client = pool) => {
    const { rows } = await client.query(`SELECT data FROM settings WHERE key = 'workspace'`);
    return rows.length > 0 ? rows[0].data : {};
};

// Workspace settings and third-party secrets: see settings.js
const { SECRET_MASK, dropObsoleteSettings, invalidateSecretsCache, workspaceSecret } = registerSettingsRoutes(app, {
    requireAdmin, sendError, withTransaction, readWorkspaceSettings,
});

// External-service proxies and the airport/carrier lookups: see proxy.js
registerProxyRoutes(app, {
    pool, logger, sendError, requireAdmin, readWorkspaceSettings, workspaceSecret, SECRET_MASK,
  FLIGHT_CACHE_TTL_MS, CACHE_MAX_ENTRIES, FLIGHT_FETCH_TIMEOUT_MS, GEOCODE_CACHE_TTL_MS,
  flightCache, memoryAirports, memoryCarriers, memoryGeocoding, openSkyCache, BoundedMap, HttpError, EXTERNAL_FETCH_TIMEOUT_MS,
});

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

// Authentication, demo, password reset, sessions and the member roster: see auth.js
registerAuthRoutes(app, {
    pool, sendError, requireAdmin, signSession, toPublicUser, hashPassword, verifyPassword, validatePasswordPolicy,
    safeEqualHex, HASH_PREFIX, EMAIL_PATTERN, BoundedMap, HttpError, readWorkspaceSettings,
    withTransaction, validateRecord, isTripParticipant, withNextVersion, bulkUpsert,
});

// Record collections and /api/batch: see recordRoutes.js
registerRecordRoutes(app, { store, requireAdmin, sharedTrip, sendError, pool, HttpError });

// Background jobs, backup, restore and wipe: see jobs.js
const { activeJobs } = registerJobRoutes(app, {
    pool, sendError, requireAdmin, withTransaction, bulkUpsert, loadGlobalData, refreshAllGlobalDatasets, tripKind,
  isStoredPasswordHash, hashPassword, removeSensitiveData, SECRET_MASK, dropObsoleteSettings, invalidateSecretsCache, HttpError, BoundedMap,
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
