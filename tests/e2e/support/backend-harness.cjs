/**
 * E2E test harness (test-only; not shipped).
 *
 * Boots the real backend_files/server.js (via its exported start()) with an in-memory Postgres (pg-mem)
 * substituted for the `pg` driver, and exposes a small control server for tests:
 *   GET  :3099/health  -> 200 once the DB schema is initialised and a clean snapshot exists
 *   POST :3099/reset   -> restore the clean snapshot (empty DB, schema only)
 *
 * Env:
 *   E2E_API_PORT        (default 3001, the port vite's /api proxy targets)
 *   E2E_CONTROL_PORT    (default 3099)
 *   E2E_RATE_LIMIT_MAX  raise express-rate-limit ceilings so suites can log in repeatedly
 *   E2E_BLOCK_EXTERNAL  "1" (default) makes outbound fetches to third-party hosts fail fast,
 *                       so tests are deterministic and offline
 */
const http = require('http');
const path = require('path');
const Module = require('module');
const { newDb } = require('pg-mem');

const API_PORT = process.env.E2E_API_PORT || '3001';
const CONTROL_PORT = Number(process.env.E2E_CONTROL_PORT || 3099);
const RATE_MAX = Number(process.env.E2E_RATE_LIMIT_MAX || 0);
const BLOCK_EXTERNAL = (process.env.E2E_BLOCK_EXTERNAL ?? '1') === '1';

// ---- in-memory Postgres ----------------------------------------------------
const db = newDb({ autoCreateForeignKeyIndices: true });
const { Pool: MemPool } = db.adapters.createPg();
// pg-mem cannot parse some CHECK constraints used by initDb(); they are not needed for behaviour tests.
const stripChecks = (t) => (typeof t === 'string' ? t.replace(/CHECK \((?:[^()]|\([^()]*\))*\)/g, '') : t);
const patchQuery = (target) => {
  const q = target.query.bind(target);
  target.query = (text, params, cb) => {
    if (text && typeof text === 'object' && typeof text.text === 'string') text = { ...text, text: stripChecks(text.text) };
    return q(stripChecks(text), params, cb);
  };
};
// pg-mem's pg adapter ignores ROLLBACK; emulate it with a snapshot taken at BEGIN
// (requests are effectively serial in e2e runs, so a whole-database snapshot is accurate).
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
class Pool extends MemPool {
  constructor(...args) { super(...args); patchQuery(this); }
  async connect(...args) { const c = await super.connect(...args); patchQuery(c); patchTransactions(c); return c; }
}

const realLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'pg') return { Pool };
  if (request === 'express-rate-limit' && RATE_MAX > 0) {
    const real = realLoad.call(this, request, parent, isMain);
    const fn = real.rateLimit || real.default || real;
    const wrapped = (opts = {}) => fn({ ...opts, max: RATE_MAX, limit: RATE_MAX });
    return Object.assign(wrapped, real, { rateLimit: wrapped, default: wrapped });
  }
  return realLoad.call(this, request, parent, isMain);
};

if (BLOCK_EXTERNAL) {
  const realFetch = global.fetch;
  global.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) return realFetch(input, init);
    throw new TypeError(`E2E harness: external network blocked (${url.slice(0, 80)})`);
  };
}

// ---- boot the real server ----------------------------------------------------
process.env.PORT = API_PORT;
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://e2e@memory/e2e';
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e_test_secret_not_for_production';
require(path.resolve(__dirname, '../../../backend_files/server.js')).start();

// ---- control server ----------------------------------------------------------
let snapshot = null;
const tablesReady = () => {
  try {
    const names = db.public.many(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`).map((r) => r.table_name);
    return ['users', 'trips', 'flights', 'visited', 'settings', 'events', 'entitlements', 'configs'].every((t) => names.includes(t));
  } catch { return false; }
};
const waitForSchema = setInterval(() => {
  if (!snapshot && tablesReady()) { snapshot = db.backup(); clearInterval(waitForSchema); console.log('[e2e-harness] schema ready, snapshot taken'); }
}, 200);

http.createServer((req, res) => {
  const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.url === '/health') return snapshot ? send(200, { ok: true }) : send(503, { ok: false });
  if (req.url === '/reset' && req.method === 'POST') {
    if (!snapshot) return send(503, { ok: false, error: 'not ready' });
    snapshot.restore();
    return send(200, { ok: true });
  }
  send(404, { error: 'not found' });
}).listen(CONTROL_PORT, () => console.log(`[e2e-harness] control on :${CONTROL_PORT}, api on :${API_PORT}`));
