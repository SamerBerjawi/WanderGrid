// WP-2.6: server resilience (REL-008, REL-009, REL-010, SEC-015).
process.env.FLIGHT_FETCH_TIMEOUT_MS = '200';
process.env.DATASET_MIN_AIRPORTS = '3';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('../helpers/testServer');

let srv, admin;
before(async () => {
    srv = await startTestServer();
    admin = (await srv.api('POST', '/api/auth/register', { body: { name: 'Admin', email: 'admin@test.dev', password: 'admin-pass-1' } })).json;
});
after(async () => { await srv.close(); });

const withFetch = async (impl, fn) => {
    const original = global.fetch;
    global.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        return /localhost|127\.0\.0\.1/.test(url) ? original(input, init) : impl(url, init);
    };
    try { return await fn(); } finally { global.fetch = original; }
};
const airportCount = async () => Number((await srv.pool.query('SELECT COUNT(*) AS count FROM global_airports')).rows[0].count);
const jsonl = (n, extra = []) => [...extra, ...Array.from({ length: n }, (_, i) => JSON.stringify({ iata: `A${String(i).padStart(2, '0')}`, city_name: 'City', airport_name: `Airport ${i}` }))].join('\n');

test('a dataset refresh that parses too few rows is refused and keeps the existing table (REL-009)', async () => {
    await withFetch(async () => new Response(jsonl(10)), () => srv.__test.refreshGlobalDataset('airports'));
    assert.equal(await airportCount(), 10);
    await assert.rejects(
        withFetch(async () => new Response('<html>rate limited</html>'), () => srv.__test.refreshGlobalDataset('airports')),
        /Refusing to replace global_airports/
    );
    assert.equal(await airportCount(), 10, 'existing rows kept');
});

test('malformed lines are skipped without breaking the bulk insert placeholders', async () => {
    const r = await withFetch(async () => new Response(jsonl(12, ['{broken', JSON.stringify({ iata: '' })])), () => srv.__test.refreshGlobalDataset('airports'));
    assert.equal(r.rows, 12);
    assert.equal(r.skipped, 2);
    assert.equal(await airportCount(), 12);
});

test('dataset downloads carry a timeout signal instead of hanging forever', async () => {
    let sawSignal = false;
    await withFetch((url, init) => { sawSignal = init?.signal instanceof AbortSignal; return Promise.resolve(new Response(jsonl(12))); },
        () => srv.__test.refreshGlobalDataset('airports'));
    assert.ok(sawSignal);
});

test('the AviationStack proxy times out on a hung upstream and encodes its parameters (REL-008)', async () => {
    let seenUrl = '';
    const started = Date.now();
    const r = await withFetch((url, init) => { seenUrl = url; return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))); },
        () => srv.api('GET', '/api/proxy/airports?access_key=k&search=' + encodeURIComponent('São Paulo & co'), { token: admin.token }));
    assert.equal(r.status, 500);
    assert.ok(Date.now() - started < 3000, 'returned promptly');
    assert.match(seenUrl, /search=S%C3%A3o\+Paulo\+%26\+co/);
});

test('caches keyed by user input are bounded (REL-010)', () => {
    const cache = new srv.__test.BoundedMap(3);
    for (let i = 0; i < 10; i++) cache.set(`k${i}`, i);
    assert.equal(cache.size, 3);
    assert.deepEqual([...cache.keys()], ['k7', 'k8', 'k9']);
    assert.ok(srv.__test.activeJobs instanceof srv.__test.BoundedMap);
});

test('/api/health reveals no database details when the DB is down (SEC-015)', async () => {
    const realQuery = srv.pool.query.bind(srv.pool);
    srv.pool.query = () => Promise.reject(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    try {
        const r = await srv.api('GET', '/api/health');
        assert.equal(r.status, 503);
        assert.deepEqual(r.json, { status: 'error' });
    } finally {
        srv.pool.query = realQuery;
    }
    assert.deepEqual((await srv.api('GET', '/api/health')).json, { status: 'ok' });
});
