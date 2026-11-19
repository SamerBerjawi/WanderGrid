process.env.DATASET_MIN_AIRPORTS = '3';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('../helpers/testServer');

let srv, admin;

before(async () => {
    srv = await startTestServer();
    admin = (await srv.api('POST', '/api/auth/register', {
        body: { name: 'Admin', email: 'airports-admin@test.dev', password: 'admin-pass-1' },
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

const seedAirports = async (rows) => {
    const payload = rows.map((r) => JSON.stringify(r)).join('\n');
    await withFetch(
        async () => new Response(payload, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } }),
        async () => {
            await srv.__test.refreshGlobalDataset('airports');
            await srv.__test.loadGlobalData();
        }
    );
};

test('airports API: lookup/search/geocode resolve MLA and other airports from RAM with runway coordinates', async () => {
    await seedAirports([
        { iata: 'MLA', city_name: 'Malta', airport_name: 'Luqa International' },
        { iata: 'MUC', city_name: 'Munich', airport_name: 'Munich Intl.' },
        { iata: 'MUC', city_name: 'Munich', airport_name: 'Metropolitan Area' },
        { iata: 'ALC', city_name: 'Alicante', airport_name: 'Alicante Airport' },
        { iata: 'LHR', city_name: 'London', airport_name: 'Heathrow' },
    ]);

    // Verify /api/airports/lookup/MLA resolves from memory without hitting global_airports in PG
    const origQuery = srv.pool.query.bind(srv.pool);
    let globalAirportsQueries = 0;
    srv.pool.query = (sql, params) => {
        if (typeof sql === 'string' && /global_airports/i.test(sql)) {
            globalAirportsQueries++;
        }
        return origQuery(sql, params);
    };
    let lookupMla;
    try {
        lookupMla = await srv.api('GET', '/api/airports/lookup/MLA', { token: admin.token });
    } finally {
        srv.pool.query = origQuery;
    }

    assert.equal(lookupMla.status, 200);
    assert.equal(globalAirportsQueries, 0, 'lookup should serve from memoryAirports without querying global_airports');
    assert.equal(lookupMla.json.iata, 'MLA');
    assert.equal(lookupMla.json.city_name, 'Malta');
    assert.equal(lookupMla.json.airport_name, 'Luqa International');
    assert.ok(Math.abs(lookupMla.json.latitude - 35.8537) < 0.05, `expected Malta lat ~35.8537, got ${lookupMla.json.latitude}`);
    assert.ok(Math.abs(lookupMla.json.longitude - 14.4708) < 0.05, `expected Malta lng ~14.4708, got ${lookupMla.json.longitude}`);

    // Verify MUC keeps real airport name when Metropolitan Area appears second
    const lookupMucFirst = await srv.api('GET', '/api/airports/lookup/MUC', { token: admin.token });
    assert.equal(lookupMucFirst.status, 200);
    assert.equal(lookupMucFirst.json.airport_name, 'Munich Intl.');

    // Verify /api/airports/search?q=mla returns MLA first with real Malta coordinates
    const searchMla = await srv.api('GET', '/api/airports/search?q=mla', { token: admin.token });
    assert.equal(searchMla.status, 200);
    assert.ok(Array.isArray(searchMla.json) && searchMla.json.length >= 1);
    assert.equal(searchMla.json[0].iata, 'MLA');
    assert.ok(Math.abs(searchMla.json[0].latitude - 35.8537) < 0.05);
    assert.ok(Math.abs(searchMla.json[0].longitude - 14.4708) < 0.05);

    // Verify /api/geocode/search resolves MLA, "MLA airport", and ALC offline from local airport data
    for (const q of ['MLA', 'MLA%20airport']) {
        const geo = await srv.api('GET', `/api/geocode/search?q=${q}`, { token: admin.token });
        assert.equal(geo.status, 200);
        assert.equal(geo.headers.get('x-cache'), 'LOCAL_AIRPORT', `expected LOCAL_AIRPORT cache header for ${q}`);
        assert.equal(geo.json?.ok, true);
        assert.equal(geo.json?.provider, 'local_airport');
        assert.ok(Array.isArray(geo.json?.results) && geo.json.results.length >= 1);
        const first = geo.json.results[0];
        assert.equal(first.iata, 'MLA');
        assert.ok(first.latitude !== 0 && first.longitude !== 0, 'must not return (0, 0)');
        assert.ok(first.latitude < 45, `MLA must not resolve to Central Europe / Czechia (got ${first.latitude})`);
        assert.ok(Math.abs(first.latitude - 35.8537) < 0.05);
        assert.ok(Math.abs(first.longitude - 14.4708) < 0.05);
    }

    const geoAlc = await srv.api('GET', '/api/geocode/search?q=ALC', { token: admin.token });
    assert.equal(geoAlc.status, 200);
    assert.equal(geoAlc.headers.get('x-cache'), 'LOCAL_AIRPORT');
    assert.ok(Array.isArray(geoAlc.json?.results) && geoAlc.json.results.length >= 1);
    assert.equal(geoAlc.json.results[0].iata, 'ALC');
    assert.ok(Math.abs(geoAlc.json.results[0].latitude - 38.2822) < 0.05);
    assert.ok(Math.abs(geoAlc.json.results[0].longitude - (-0.5582)) < 0.05);

    // Verify MUC also keeps real airport name when Metropolitan Area appears FIRST
    await seedAirports([
        { iata: 'MUC', city_name: 'Munich', airport_name: 'Metropolitan Area' },
        { iata: 'MUC', city_name: 'Munich', airport_name: 'Munich Intl.' },
        { iata: 'MLA', city_name: 'Malta', airport_name: 'Luqa International' },
        { iata: 'ALC', city_name: 'Alicante', airport_name: 'Alicante Airport' },
        { iata: 'LHR', city_name: 'London', airport_name: 'Heathrow' },
    ]);

    const lookupMucReversed = await srv.api('GET', '/api/airports/lookup/MUC', { token: admin.token });
    assert.equal(lookupMucReversed.status, 200);
    assert.equal(lookupMucReversed.json.airport_name, 'Munich Intl.');
});
