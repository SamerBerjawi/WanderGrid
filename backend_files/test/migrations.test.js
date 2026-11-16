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

test('0002 gives mode-less flights and trip legs the mode Flight and leaves others alone', async () => {
    const pool = makePool();
    await pool.query('CREATE TABLE flights (id TEXT PRIMARY KEY, data JSONB)');
    await pool.query('CREATE TABLE trips (id TEXT PRIMARY KEY, data JSONB)');
    const put = (t, id, data) => pool.query(`INSERT INTO ${t} (id, data) VALUES ($1, $2)`, [id, JSON.stringify(data)]);
    await put('flights', 'f1', { id: 'f1' });
    await put('flights', 'f2', { id: 'f2', mode: 'Train' });
    await put('trips', 't1', { id: 't1', transports: [{ id: 'a' }, { id: 'b', mode: 'Ferry' }] });
    await runMigrations(pool, loadMigrations().filter(x => x.id === '0002_leg_mode'), quiet);
    const f = Object.fromEntries((await pool.query('SELECT id, data FROM flights')).rows.map(r => [r.id, r.data.mode]));
    assert.deepEqual(f, { f1: 'Flight', f2: 'Train' });
    const legs = (await pool.query('SELECT data FROM trips')).rows[0].data.transports.map(t => t.mode);
    assert.deepEqual(legs, ['Flight', 'Ferry']);
});

test('0003 replaces participant emails with user ids and leaves everything else alone', async () => {
    const pool = makePool();
    await pool.query('CREATE TABLE users (id TEXT PRIMARY KEY, data JSONB NOT NULL)');
    await pool.query('CREATE TABLE trips (id TEXT PRIMARY KEY, data JSONB NOT NULL)');
    const put = (t, id, data) => pool.query(`INSERT INTO ${t} (id, data) VALUES ($1, $2)`, [id, JSON.stringify(data)]);
    await put('users', 'u-ann', { email: 'Ann@Test.dev' });
    await put('users', 'bob@test.dev', { email: 'bob@test.dev' });
    await put('trips', 't1', { participants: ['ann@test.dev', 'bob@test.dev', 'ghost@test.dev'] });
    await put('trips', 't2', { participants: ['u-ann', 'ANN@test.dev'] });
    await put('trips', 't3', { name: 'no participants' });
    await runMigrations(pool, [require('../migrations/0003_participant_ids')].map(m => ({ id: '0003_participant_ids', ...m })), quiet);
    const get = async id => (await pool.query('SELECT data FROM trips WHERE id = $1', [id])).rows[0].data;
    assert.deepEqual((await get('t1')).participants, ['u-ann', 'bob@test.dev', 'ghost@test.dev']);
    assert.deepEqual((await get('t2')).participants, ['u-ann']);
    assert.equal((await get('t3')).participants, undefined);
});

test('0004 moves leave off trips into the leave table, once', async () => {
    const pool = makePool();
    await pool.query('CREATE TABLE trips (id TEXT PRIMARY KEY, data JSONB NOT NULL)');
    await pool.query('CREATE TABLE trip_shares (trip_id TEXT)');
    await pool.query('CREATE TABLE leave (id TEXT PRIMARY KEY, data JSONB NOT NULL)');
    const put = (id, data) => pool.query('INSERT INTO trips (id, data) VALUES ($1, $2)', [id, JSON.stringify({ id, ...data })]);
    await put('leave-a', { name: 'Dentist', kind: 'timeoff', startDate: '2026-03-02', endDate: '2026-03-02', status: 'Planning', participants: ['u1'], entitlementId: 'annual', durationMode: 'single_am' });
    await put('rome', { name: 'Rome', startDate: '2026-05-04', endDate: '2026-05-08', status: 'Upcoming', participants: ['u1', 'u2'], entitlementId: 'annual', excludedDates: ['2026-05-06'], transports: [] });
    await put('split', { name: 'Split', startDate: '2026-12-28', endDate: '2027-01-04', status: 'Cancelled', participants: ['u1'], allocations: [{ entitlementId: 'annual', days: 3 }, { entitlementId: 'lieu', days: 2, targetYear: 2027 }] });
    await put('plain', { name: 'Plain', startDate: '2026-06-01', endDate: '2026-06-03', status: 'Planning', participants: ['u1'] });
    const m = [{ id: '0004_leave_entries', ...require('../migrations/0004_leave_entries') }];
    await runMigrations(pool, m, quiet);

    const leave = Object.fromEntries((await pool.query('SELECT id, data FROM leave')).rows.map(r => [r.id, r.data]));
    assert.deepEqual(Object.keys(leave).sort(), ['leave-a', 'leave:rome:u1', 'leave:rome:u2', 'leave:split:u1']);
    assert.deepEqual(
        { ...leave['leave-a'], updatedAt: undefined },
        { id: 'leave-a', memberId: 'u1', name: 'Dentist', startDate: '2026-03-02', endDate: '2026-03-02', entitlementId: 'annual', durationMode: 'single_am', state: 'planned', version: 1, updatedAt: undefined },
    );
    assert.equal(leave['leave:rome:u2'].tripId, 'rome');
    assert.equal(leave['leave:rome:u2'].state, 'approved');
    assert.deepEqual(leave['leave:rome:u1'].excludedDates, ['2026-05-06']);
    assert.equal(leave['leave:split:u1'].state, 'cancelled');
    assert.equal(leave['leave:split:u1'].allocations.length, 2);

    const trips = Object.fromEntries((await pool.query('SELECT id, data FROM trips')).rows.map(r => [r.id, r.data]));
    assert.deepEqual(Object.keys(trips).sort(), ['plain', 'rome', 'split']);
    assert.equal(trips.rome.entitlementId, undefined);
    assert.equal(trips.rome.excludedDates, undefined);
    assert.deepEqual(trips.rome.transports, []);
    assert.equal(trips.split.allocations, undefined);
    assert.equal(trips.plain.name, 'Plain');

    // A second run (as a restore does) adds nothing and keeps edits made since.
    await pool.query('UPDATE leave SET data = $2 WHERE id = $1', ['leave:rome:u1', JSON.stringify({ ...leave['leave:rome:u1'], note: 'edited' })]);
    const { convertTripLeave } = require('../leaveEntries');
    const client = await pool.connect();
    assert.deepEqual(await convertTripLeave(client), { created: 0, tripsChanged: 0 });
    client.release();
    assert.equal((await pool.query('SELECT data FROM leave WHERE id = $1', ['leave:rome:u1'])).rows[0].data.note, 'edited');
});

test('0005 turns the old yearly allowance into an Annual leave allowance, once', async () => {
    const pool = makePool();
    for (const t of ['users', 'entitlements', 'leave']) await pool.query(`CREATE TABLE ${t} (id TEXT PRIMARY KEY, data JSONB NOT NULL)`);
    const put = (t, id, data) => pool.query(`INSERT INTO ${t} (id, data) VALUES ($1, $2)`, [id, JSON.stringify({ id, ...data })]);
    await put('users', 'a', { allowance: 30, takenLeave: 4 });
    await put('users', 'b', { leaveBalance: 20, takenLeave: 2 });
    await put('users', 'c', { allowance: 25, policies: [{ entitlementId: 'x', year: 2026, isActive: true, accrual: { period: 'yearly', amount: 10 } }] });
    await put('users', 'd', { allowance: 0 });
    await put('leave', 'l1', { memberId: 'b', startDate: '2026-03-02', endDate: '2026-03-03', state: 'approved' });
    const { convertLegacyAllowances } = require('../legacyLeave');
    const client = await pool.connect();
    assert.deepEqual(await convertLegacyAllowances(client, 2026), { converted: 4, typeCreated: true });
    const users = Object.fromEntries((await client.query('SELECT id, data FROM users')).rows.map(r => [r.id, r.data]));
    const types = (await client.query('SELECT data FROM entitlements')).rows.map(r => r.data);
    assert.deepEqual(types.map(t => [t.id, t.category]), [['annual-leave', 'Annual']]);
    assert.deepEqual(users.a.policies, [{ entitlementId: 'annual-leave', year: 2026, isActive: true, accrual: { period: 'yearly', amount: 30 }, carryOver: { enabled: false, maxDays: 0, expiryType: 'none' } }]);
    assert.deepEqual(users.a.leaveAdjustments.map(x => [x.entitlementId, x.year, x.days]), [['annual-leave', 2026, -4]]);
    assert.equal(users.b.policies[0].accrual.amount, 20);
    assert.equal(users.b.leaveAdjustments, undefined, 'leave entries already count what was recorded');
    assert.equal(users.c.policies.length, 1, 'existing allowances are kept');
    assert.equal(users.d.policies, undefined);
    assert.ok(Object.values(users).every(u => u.legacyLeaveConverted));
    assert.deepEqual(await convertLegacyAllowances(client, 2026), { converted: 0, typeCreated: false });
    client.release();
});
