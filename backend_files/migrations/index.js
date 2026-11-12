'use strict';
/**
 * Numbered schema and data migrations (decision D-06).
 *
 * initDb() still creates missing tables and indexes (CREATE ... IF NOT EXISTS). Anything that changes the
 * SHAPE of stored data (a new JSON field with a backfill, a renamed field, a split status) is a migration:
 * a file in this folder named NNNN_short_name.js exporting { id, description, up(client) }.
 *
 *  - Migrations run once, in id order, at boot, each in its own transaction together with its bookkeeping row
 *    in `schema_migrations`. If one throws, it is rolled back and startup fails loudly (the container restarts
 *    rather than running on half-migrated data).
 *  - `up` must be idempotent in spirit: it receives a client already inside the transaction and must use it
 *    for every query.
 *  - Never edit a migration that has shipped. Add a new one.
 *  - Readers may stop tolerating an old shape once the migration that fixes it has shipped for a release.
 */
const fs = require('fs');
const path = require('path');

const FILE_PATTERN = /^(\d{4})_[a-z0-9_]+\.js$/;

/** Loads the migration modules in this folder, sorted by id, and checks the ids are unique and match the file. */
const loadMigrations = (dir = __dirname) => {
    const list = fs.readdirSync(dir)
        .filter(f => FILE_PATTERN.test(f))
        .sort()
        .map(f => {
            const m = require(path.join(dir, f));
            const id = f.replace(/\.js$/, '');
            if (!m || typeof m.up !== 'function') throw new Error(`Migration ${f} must export an up(client) function`);
            if (m.id && m.id !== id) throw new Error(`Migration ${f} declares id "${m.id}", which does not match its file name`);
            return { id, description: m.description || '', up: m.up };
        });
    const seen = new Set();
    for (const m of list) {
        const n = m.id.slice(0, 4);
        if (seen.has(n)) throw new Error(`Two migrations share the number ${n}`);
        seen.add(n);
    }
    return list;
};

const LOCK_KEY = 726300;

/**
 * Applies every migration not yet recorded. Returns the ids it applied.
 * `migrations` defaults to the files in this folder; tests pass their own list.
 */
const runMigrations = async (pool, migrations = loadMigrations(), log = console.log) => {
    const client = await pool.connect();
    let locked = false;
    try {
        // Probe first, then create: some engines reject CREATE TABLE IF NOT EXISTS on a table that already exists.
        try { await client.query('SELECT id FROM schema_migrations LIMIT 1'); }
        catch { await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, description TEXT, applied_at TEXT)'); }
        // Two instances starting together must not run the same migration twice. Engines without advisory locks
        // (the in-memory test database) skip it.
        try { await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]); locked = true; } catch { /* no advisory locks */ }

        const done = new Set((await client.query('SELECT id FROM schema_migrations')).rows.map(r => r.id));
        const applied = [];
        for (const m of migrations) {
            if (done.has(m.id)) continue;
            log(`Applying migration ${m.id}${m.description ? ` (${m.description})` : ''}...`);
            await client.query('BEGIN');
            try {
                await m.up(client);
                await client.query('INSERT INTO schema_migrations (id, description, applied_at) VALUES ($1, $2, $3)', [m.id, m.description, new Date().toISOString()]);
                await client.query('COMMIT');
            } catch (err) {
                await client.query('ROLLBACK').catch(() => {});
                err.message = `Migration ${m.id} failed and was rolled back: ${err.message}`;
                throw err;
            }
            applied.push(m.id);
        }
        return applied;
    } finally {
        if (locked) await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
        client.release();
    }
};

module.exports = { loadMigrations, runMigrations };
