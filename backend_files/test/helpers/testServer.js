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
const { newDb } = require('pg-mem');

function installHooks() {
    const db = newDb({ autoCreateForeignKeyIndices: true });
    const { Pool: MemPool } = db.adapters.createPg();
    // pg-mem cannot parse some CHECK constraints used by initDb(); they don't affect behaviour.
    const stripChecks = (t) => (typeof t === 'string' ? t.replace(/CHECK \((?:[^()]|\([^()]*\))*\)/g, '') : t);
    const patchQuery = (target) => {
        const q = target.query.bind(target);
        target.query = (text, params, cb) => {
            if (text && typeof text === 'object' && typeof text.text === 'string') text = { ...text, text: stripChecks(text.text) };
            return q(stripChecks(text), params, cb);
        };
    };
    class Pool extends MemPool {
        constructor(...args) { super(...args); patchQuery(this); }
        async connect(...args) { const c = await super.connect(...args); patchQuery(c); return c; }
    }
    const realLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === 'pg') return { Pool };
        if (request === 'express-rate-limit') {
            const real = realLoad.call(this, request, parent, isMain);
            const fn = real.rateLimit || real.default || real;
            const wrapped = (opts = {}) => fn({ ...opts, max: 100000, limit: 100000 });
            return Object.assign(wrapped, real, { rateLimit: wrapped, default: wrapped });
        }
        return realLoad.call(this, request, parent, isMain);
    };
    // Keep tests offline and deterministic: only loopback fetches are allowed.
    const realFetch = global.fetch;
    global.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input?.url || String(input);
        if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) return realFetch(input, init);
        throw new TypeError(`test: external network blocked (${url.slice(0, 80)})`);
    };
    return db;
}

async function startTestServer() {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'api_test_secret_not_for_production';
    process.env.DATABASE_URL = 'postgres://test@memory/test';
    const db = installHooks();
    if (!process.env.TEST_VERBOSE) { console.log = () => {}; console.warn = () => {}; console.error = () => {}; }
    const mod = require(path.resolve(__dirname, '../../server.js'));
    await mod.ready;
    const snapshot = db.backup();
    const server = mod.start(0);
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

    return {
        ...mod,
        db,
        base,
        api,
        reset: async () => { snapshot.restore(); },
        close: async () => {
            mod.stopBackgroundTasks();
            await new Promise((r) => { server.close(() => r()); server.closeAllConnections?.(); });
            await mod.pool.end().catch(() => {});
        },
    };
}

module.exports = { startTestServer };
