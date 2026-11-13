/**
 * Boots the real server.js against an in-memory Postgres (pg-mem) for API integration tests.
 * Each test file runs in its own process under `node --test`, so the module hooks here are isolated.
 *
 *   const srv = await startTestServer();
 *   const res = await srv.api('POST', '/api/auth/register', { body: {...} });
 *   await srv.reset();   // back to an empty, schema-only database
 *   await srv.close();
 */
const path = require('path');
const Module = require('module');
const { newDb } = require('pg-mem');  // only used when TEST_DATABASE_URL is not set

// TEST_DATABASE_URL runs the same tests against a real PostgreSQL (CI does, with a postgres:15 service). Each test
// process gets its own schema, so files running in parallel never see each other's rows.
const REAL_URL = process.env.TEST_DATABASE_URL || '';
const DATA_TABLES = ['users', 'trips', 'events', 'entitlements', 'configs', 'flights', 'visited', 'settings', 'trip_shares', 'cached_routes', 'geocoding_cache'];

function installHooks() {
    const db = REAL_URL ? null : newDb({ autoCreateForeignKeyIndices: true });
    const { Pool: MemPool } = db ? db.adapters.createPg() : { Pool: null };
    // pg-mem cannot parse some CHECK constraints used by initDb(); they don't affect behaviour.
    const stripChecks = (t) => (typeof t === 'string' ? t.replace(/CHECK \((?:[^()]|\([^()]*\))*\)/g, '') : t);
    const patchQuery = (target) => {
        const q = target.query.bind(target);
        target.query = (text, params, cb) => {
            if (text && typeof text === 'object' && typeof text.text === 'string') text = { ...text, text: stripChecks(text.text) };
            return q(stripChecks(text), params, cb);
        };
    };
    // pg-mem's pg adapter ignores ROLLBACK; emulate it with a snapshot taken at BEGIN.
    // Tests run one transaction at a time, so a whole-database snapshot is accurate here.
    const patchTransactions = (client) => {
        const q = client.query.bind(client);
        let snapshot = null;
        client.query = (text, params, cb) => {
            const sql = typeof text === 'string' ? text.trim().toUpperCase() : '';
            if (sql === 'BEGIN') snapshot = db.backup();
            else if (sql === 'COMMIT') snapshot = null;
            else if (sql === 'ROLLBACK' && snapshot) { snapshot.restore(); snapshot = null; }
            return q(text, params, cb);
        };
    };
    class Pool extends (MemPool || Object) {
        constructor(...args) { super(...args); patchQuery(this); }
        async connect(...args) { const c = await super.connect(...args); patchQuery(c); patchTransactions(c); return c; }
    }
    const realLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === 'pg' && !REAL_URL) return { Pool };
        if (request === 'express-rate-limit') {
            const real = realLoad.call(this, request, parent, isMain);
            const fn = real.rateLimit || real.default || real;
            // TEST_REAL_RATE_LIMIT=1 keeps the production limits, to reproduce what a busy client sees (devServer.js).
            const wrapped = (opts = {}) => (process.env.TEST_REAL_RATE_LIMIT ? fn(opts) : fn({ ...opts, max: 100000, limit: 100000 }));
            return Object.assign(wrapped, real, { rateLimit: wrapped, default: wrapped });
        }
        return realLoad.call(this, request, parent, isMain);
    };
    // Keep tests offline and deterministic: only loopback fetches are allowed.
    const realFetch = global.fetch;
    global.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input?.url || String(input);
        if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) return realFetch(input, init);
        // Manual checks only (devServer.js): TEST_ALLOW_HOSTS="api.adsb.lol,opensky-network.org" lets those hosts through.
        const allowed = (process.env.TEST_ALLOW_HOSTS || '').split(',').filter(Boolean);
        if (allowed.some(h => url.startsWith(`https://${h}/`))) return realFetch(input, init);
        throw new TypeError(`test: external network blocked (${url.slice(0, 80)})`);
    };
    return db;
}

async function startTestServer({ port = 0 } = {}) {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'api_test_secret_not_for_production';
    let schema = null;
    if (REAL_URL) {
        schema = `t_${process.pid}_${Date.now()}`;
        const { Client } = require('pg');
        const boot = new Client({ connectionString: REAL_URL });
        await boot.connect();
        await boot.query(`CREATE SCHEMA ${schema}`);
        await boot.end();
        const url = new URL(REAL_URL);
        url.searchParams.set('options', `-c search_path=${schema}`);
        url.searchParams.set('application_name', schema);
        process.env.DATABASE_URL = url.toString();
    } else {
        process.env.DATABASE_URL = 'postgres://test@memory/test';
    }
    // Most suites add a second member by self-registering; the default-closed behaviour is tested in registration.test.js.
    if (process.env.ALLOW_SIGNUP === undefined) process.env.ALLOW_SIGNUP = 'true';
    const db = installHooks();
    if (!process.env.TEST_VERBOSE) { console.log = () => {}; console.warn = () => {}; console.error = () => {}; }
    const mod = require(path.resolve(__dirname, '../../server.js'));
    await mod.ready;
    const snapshot = db ? db.backup() : null;
    const server = mod.start(port);
    await new Promise((r) => server.listening ? r() : server.once('listening', r));
    const base = `http://127.0.0.1:${server.address().port}`;

    async function api(method, url, { body, token, headers = {}, raw = false } = {}) {
        const res = await fetch(base + url, {
            method,
            headers: {
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...headers,
            },
            body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
        });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch { /* non-JSON body */ }
        return { status: res.status, headers: res.headers, json, text: raw ? text : undefined };
    }

    // POST /api/restore runs as a background job; wait for it like the client does.
    async function restore(token, body) {
        const started = await api('POST', '/api/restore', { token, body });
        if (started.status !== 202) return started;
        for (let i = 0; i < 200; i++) {
            const job = await api('GET', `/api/jobs/status/${started.json.jobId}`, { token });
            if (job.json?.status === 'Completed' || job.json?.status === 'Failed') return { ...job, started };
            await new Promise((r) => setTimeout(r, 25));
        }
        throw new Error('restore job did not finish');
    }

    return {
        ...mod,
        restore,
        db,
        base,
        api,
        reset: async () => {
            if (snapshot) { snapshot.restore(); return; }
            await mod.pool.query(`TRUNCATE ${DATA_TABLES.join(', ')}`);
        },
        close: async () => {
            mod.stopBackgroundTasks();
            await new Promise((r) => { server.close(() => r()); server.closeAllConnections?.(); });
            if (schema) {
                // A connection a test left busy (or in a transaction) must not hang the cleanup: report it, end it, drop the schema.
                const { Client } = require('pg');
                const admin = new Client({ connectionString: REAL_URL });
                await admin.connect();
                const { rows } = await admin.query('SELECT pid, state, left(query, 80) AS query FROM pg_stat_activity WHERE application_name = $1 AND pid <> pg_backend_pid() AND state <> $2', [schema, 'idle']);
                if (rows.length) process.stderr.write(`test: ${rows.length} connection(s) not idle at close: ${JSON.stringify(rows)}\n`);
                await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = $1 AND pid <> pg_backend_pid()', [schema]);
                await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
                await admin.end();
                await Promise.race([mod.pool.end().catch(() => {}), new Promise((r) => setTimeout(r, 3000))]);
                return;
            }
            await mod.pool.end().catch(() => {});
        },
    };
}

module.exports = { startTestServer };
