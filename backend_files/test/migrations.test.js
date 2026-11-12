const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { newDb } = require('pg-mem');
const { loadMigrations, runMigrations } = require('../migrations');

const makePool = () => { const { Pool } = newDb().adapters.createPg(); return new Pool(); };
const quiet = () => {};

test('applies pending migrations once, in order, and records them', async () => {
    const pool = makePool();
    await pool.query('CREATE TABLE t (n INT)');
    const order = [];
    const list = [
        { id: '0001_a', up: async c => { order.push('a'); await c.query('INSERT INTO t VALUES (1)'); } },
        { id: '0002_b', up: async c => { order.push('b'); await c.query('INSERT INTO t VALUES (2)'); } },
    ];
    assert.deepEqual(await runMigrations(pool, list, quiet), ['0001_a', '0002_b']);
    assert.deepEqual(await runMigrations(pool, list, quiet), []);
    assert.deepEqual(order, ['a', 'b']);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM schema_migrations')).rows[0].n, 2);
});

test('a later migration is applied on the next boot; earlier ones are not repeated', async () => {
    const pool = makePool();
    let runs = 0;
    const one = { id: '0001_a', up: async () => { runs++; } };
    await runMigrations(pool, [one], quiet);
    await runMigrations(pool, [one, { id: '0002_b', up: async () => { runs += 10; } }], quiet);
    assert.equal(runs, 11);
});

test('a failing migration stops startup and is not recorded', async () => {
    const pool = makePool();
    const list = [
        { id: '0001_ok', up: async () => {} },
        { id: '0002_bad', up: async () => { throw new Error('boom'); } },
        { id: '0003_never', up: async () => { throw new Error('should not run'); } },
    ];
    await assert.rejects(() => runMigrations(pool, list, quiet), /0002_bad failed and was rolled back: boom/);
    const ids = (await pool.query('SELECT id FROM schema_migrations')).rows.map(r => r.id);
    assert.deepEqual(ids, ['0001_ok']);
});

test('loadMigrations sorts by file name and rejects duplicates and bad modules', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
    fs.writeFileSync(path.join(dir, '0002_second.js'), 'module.exports={description:"x",up:async()=>{}}');
    fs.writeFileSync(path.join(dir, '0001_first.js'), 'module.exports={up:async()=>{}}');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored');
    assert.deepEqual(loadMigrations(dir).map(m => m.id), ['0001_first', '0002_second']);
    fs.writeFileSync(path.join(dir, '0002_other.js'), 'module.exports={up:async()=>{}}');
    assert.throws(() => loadMigrations(dir), /share the number 0002/);
    fs.unlinkSync(path.join(dir, '0002_other.js'));
    fs.writeFileSync(path.join(dir, '0003_nofn.js'), 'module.exports={}');
    assert.throws(() => loadMigrations(dir), /must export an up/);
});

test('the shipped migrations load', () => {
    const list = loadMigrations();
    assert.ok(Array.isArray(list));
});

test('0001 stamps stored trips with their kind and leaves stamped ones alone', async () => {
    const pool = makePool();
    await pool.query('CREATE TABLE trips (id TEXT PRIMARY KEY, data JSONB)');
    const put = (id, data) => pool.query('INSERT INTO trips (id, data) VALUES ($1, $2)', [id, JSON.stringify(data)]);
    await put('t1', { id: 't1', name: 'Rome' });
    await put('leave-1', { id: 'leave-1', hideInPlanner: true });
    await put('b1', { id: 'b1', isBundleOnly: true, hideInPlanner: true });
    await put('t2', { id: 't2', kind: 'timeoff' });
    const m = loadMigrations().filter(x => x.id === '0001_trip_kind');
    assert.equal(m.length, 1);
    await runMigrations(pool, m, quiet);
    const kinds = Object.fromEntries((await pool.query('SELECT id, data FROM trips')).rows.map(r => [r.id, r.data.kind]));
    assert.deepEqual(kinds, { t1: 'trip', 'leave-1': 'timeoff', b1: 'bundle', t2: 'timeoff' });
    assert.equal((await pool.query('SELECT data FROM trips WHERE id = $1', ['t1'])).rows[0].data.name, 'Rome');
});
