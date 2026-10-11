// WP-1.10: restore & wipe robustness (REL-001, REL-004, PERF-011).
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('../helpers/testServer');

let srv, admin;
before(async () => { srv = await startTestServer(); });
after(async () => { await srv.close(); });
beforeEach(async () => {
    await srv.reset();
    admin = (await srv.api('POST', '/api/auth/register', { body: { name: 'Admin', email: 'admin@test.dev', password: 'admin-pass-1' } })).json;
});

const withDatabaseDown = async (fn) => {
    const realConnect = srv.pool.connect.bind(srv.pool);
    const realQuery = srv.pool.query.bind(srv.pool);
    srv.pool.connect = () => Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:5432'));
    // Session checks stay up so the request reaches the handler under test.
    srv.pool.query = (text, params) => (/FROM users WHERE id/.test(text) ? realQuery(text, params) : Promise.reject(new Error('connect ECONNREFUSED')));
    try { return await fn(); } finally { srv.pool.connect = realConnect; srv.pool.query = realQuery; }
};

test('wipe during a database outage returns 500 and the server keeps running (REL-001)', async () => {
    const r = await withDatabaseDown(() => srv.api('POST', '/api/wipe', { token: admin.token }));
    assert.equal(r.status, 500);
    assert.equal((await srv.api('GET', '/api/health')).status, 200, 'still serving');
});

test('restore during a database outage reports a failed job and the server keeps running (REL-001)', async () => {
    const r = await withDatabaseDown(() => srv.restore(admin.token, { trips: [{ id: 't1', name: 'X' }], restoreOptions: { mode: 'merge' } }));
    assert.equal(r.json.status, 'Failed');
    assert.equal((await srv.api('GET', '/api/health')).status, 200);
});

test('restore answers 202 immediately with a job, and runs exactly once', async () => {
    const started = await srv.api('POST', '/api/restore', { token: admin.token, body: { trips: [{ id: 't1', name: 'Once' }], restoreOptions: { mode: 'merge' } } });
    assert.equal(started.status, 202);
    assert.ok(started.json.jobId);
    let job;
    for (let i = 0; i < 100; i++) {
        job = (await srv.api('GET', `/api/jobs/status/${started.json.jobId}`, { token: admin.token })).json;
        if (job.status !== 'Processing') break;
        await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(job.status, 'Completed');
    const trips = (await srv.api('GET', '/api/trips', { token: admin.token })).json;
    assert.deepEqual(trips.map((t) => t.id), ['t1']);
});

test('a 12 MB restore is accepted (REL-004: was 413 above 10 MB)', async () => {
    // 600 trips x 20 KB = ~12 MB (pg-mem can't take one 12 MB string parameter, real Postgres can).
    const notes = 'x'.repeat(20 * 1024);
    const trips = Array.from({ length: 600 }, (_, i) => ({ id: `big${i}`, name: `Trip ${i}`, notes }));
    const r = await srv.restore(admin.token, { trips, restoreOptions: { mode: 'merge' } });
    assert.equal(r.started.status, 202);
    assert.equal(r.json.status, 'Completed');
    assert.equal((await srv.api('GET', '/api/trips', { token: admin.token })).json.length, 600);
});

test('other endpoints still reject oversized bodies with a JSON 413', async () => {
    const r = await srv.api('POST', '/api/trips', { token: admin.token, body: { id: 'huge', name: 'x'.repeat(6 * 1024 * 1024) } });
    assert.equal(r.status, 413);
    assert.match(r.json.error, /too large/);
});

test('restore validates the file shape before starting a job', async () => {
    const r = await srv.api('POST', '/api/restore', { token: admin.token, body: { trips: 'nope' } });
    assert.equal(r.status, 400);
});

test('restore (replace) handles many records and duplicate ids in one pass (PERF-011)', async () => {
    const trips = Array.from({ length: 1200 }, (_, i) => ({ id: `t${i}`, name: `Trip ${i}` }));
    trips.push({ id: 't5', name: 'Duplicate wins' });
    const r = await srv.restore(admin.token, { trips, restoreOptions: { mode: 'replace', selectedCategories: { flights: true, roadTrips: true } } });
    assert.equal(r.json.status, 'Completed');
    const list = (await srv.api('GET', '/api/trips', { token: admin.token })).json;
    assert.equal(list.length, 1200);
    assert.equal(list.find((t) => t.id === 't5').name, 'Duplicate wins');
});

test('malformed JSON gets a 400 JSON error, not a crash', async () => {
    const r = await srv.api('POST', '/api/trips', { token: admin.token, body: '{not json', headers: { 'Content-Type': 'application/json' } });
    assert.equal(r.status, 400);
});
