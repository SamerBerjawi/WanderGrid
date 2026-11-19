process.env.DATASET_MIN_CARRIERS = '2';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('../helpers/testServer');

let srv, admin;

before(async () => {
    srv = await startTestServer();
    admin = (await srv.api('POST', '/api/auth/register', {
        body: { name: 'Admin', email: 'carriers-admin@test.dev', password: 'admin-pass-1' },
    })).json;
});

after(async () => {
    await srv.close();
});

const withFetch = async (impl, fn) => {
    const original = global.fetch;
    global.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        return /localhost|127\.0\.0\.1/.test(url) ? original(input, init) : impl(url, init);
    };
    try {
        return await fn();
    } finally {
        global.fetch = original;
    }
};

const REGISTER = [
    { company_name: 'KM Malta Airlines Limited', country_or_territory: 'Malta', iata: 'KM' },
    { company_name: 'Middle East Airlines AirLiban Dba MEA', country_or_territory: 'Lebanon', iata: 'ME' },
    { company_name: 'Astra Airways Limited dba Air Astra', country_or_territory: 'Bangladesh', iata: '2A' },
].map((r) => JSON.stringify(r)).join('\n');
const OPENFLIGHTS = [
    '100,"KM Malta Airlines",\\N,"KM","KMM","KOMALTA","Malta","Y"',
    '3490,"Middle East Airlines",\\N,"ME","MEA","CEDAR JET","Lebanon","Y"',
    '2021,"Deutsche Bahn",\\N,"2A","","","Germany","Y"',
].join('\n');

test('a table from before ICAO codes is refreshed once, even though the joined table has fewer rows', async () => {
    // The old table repeated codes (one row per register entry) and had no ICAO column values
    for (let i = 0; i < 4; i++) {
        await srv.pool.query("INSERT INTO global_carriers (iata, company_name, country_or_territory) VALUES ('KM', 'Air Malta plc', 'Malta'), ('ME', 'MEA', 'Lebanon')");
    }
    await withFetch(
        async (url) => new Response(/openflights/.test(url) ? OPENFLIGHTS : REGISTER),
        async () => {
            const result = await srv.__test.refreshGlobalDataset('carriers', { onlyIfEmpty: true });
            assert.equal(result.skippedRefresh, undefined, 'a table without ICAO codes is not left as it is');
            assert.equal(result.rows, 3);
            await srv.__test.loadGlobalData();
        }
    );
    const { rows } = await srv.pool.query('SELECT iata, company_name, icao, active FROM global_carriers ORDER BY iata');
    assert.deepEqual(rows.map((r) => [r.iata, r.company_name, r.icao, r.active]), [
        ['2A', 'Air Astra', '', null],
        ['KM', 'KM Malta Airlines', 'KMM', true],
        ['ME', 'Middle East Airlines', 'MEA', true],
    ]);

    // Refreshed tables are left alone on the next start
    const again = await srv.__test.refreshGlobalDataset('carriers', { onlyIfEmpty: true });
    assert.equal(again.skippedRefresh, true);
});

test('/api/carriers/index serves the table with an ETag, and lookups use the same names', async () => {
    const index = await srv.api('GET', '/api/carriers/index', { token: admin.token });
    assert.equal(index.status, 200);
    assert.deepEqual(index.json.rows, [
        ['2A', '', 'Air Astra', 'Bangladesh', null],
        ['KM', 'KMM', 'KM Malta Airlines', 'Malta', 1],
        ['ME', 'MEA', 'Middle East Airlines', 'Lebanon', 1],
    ]);
    const etag = index.headers.get('etag');
    assert.match(etag, /^"carriers-[0-9a-f]{16}"$/);
    const unchanged = await srv.api('GET', '/api/carriers/index', { token: admin.token, headers: { 'If-None-Match': etag } });
    assert.equal(unchanged.status, 304);

    const unauthenticated = await srv.api('GET', '/api/carriers/index');
    assert.equal(unauthenticated.status, 401);

    const lookup = await srv.api('GET', '/api/carriers/lookup/KM', { token: admin.token });
    assert.equal(lookup.json.company_name, 'KM Malta Airlines');
});
