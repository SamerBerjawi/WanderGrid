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

test('a refresh joins the live sources, serves /api/airports/index and repairs saved flights and failed routes', async () => {
    const names = [
        { iata: 'MLA', city_name: 'Malta', airport_name: 'Luqa International' },
        { iata: 'TUN', city_name: 'Tunis', airport_name: 'Carthage' },
        { iata: 'LHR', city_name: 'London', airport_name: 'Heathrow' },
        { iata: 'MUC', city_name: 'Munich', airport_name: 'Munich Intl.' },
        { iata: 'ALC', city_name: 'Alicante', airport_name: 'Alicante Airport' },
    ].map((r) => JSON.stringify(r)).join('\n');
    const csv = [
        '"id","ident","type","name","latitude_deg","longitude_deg","elevation_ft","continent","iso_country","iso_region","municipality","scheduled_service","icao_code","iata_code"',
        '1,"LMML","large_airport","Malta International Airport",35.845932,14.491546,300,"EU","MT","MT-25","Valletta","yes","LMML","MLA"',
        '2,"DTTA","large_airport","Tunis Carthage",36.851002,10.2272,22,"AF","TN","TN-11","Tunis","yes","DTTA","TUN"',
    ].join('\n');
    const tz = JSON.stringify({ LMML: { icao: 'LMML', iata: 'MLA', tz: 'Europe/Malta' } });

    // A saved flight with the old wrong position (Mladá Boleslav) and a road leg the router could not trace
    await srv.api('POST', '/api/flights', { token: admin.token, body: { id: 'f-mla', mode: 'Flight', origin: 'TUN', destination: 'MLA', departureDate: '2026-11-01', originLat: 36.85, originLng: 10.22, destLat: 50.3983, destLng: 14.8983, destGeoKey: 'MLA' } });
    await srv.pool.query("INSERT INTO cached_routes (route_key, payload) VALUES ('road:none', $1), ('road:ok', $2), ('road:long', $3)", [
        JSON.stringify({ status: 'none', reason: 'no_route' }), JSON.stringify({ status: 'ok', geometry: 'x' }), JSON.stringify({ status: 'none', reason: 'too_long' }),
    ]);

    await withFetch(
        async (url) => new Response(/ourairports/.test(url) ? csv : /mwgg/.test(url) ? tz : names),
        async () => {
            await srv.__test.refreshGlobalDataset('airports');
            await srv.__test.loadGlobalData();
        }
    );
    const out = await srv.__test.repairAfterRefresh();
    assert.equal(out.repaired.legs, 1);
    assert.equal(out.routes, 1);

    const flight = (await srv.api('GET', '/api/flights', { token: admin.token })).json.find((f) => f.id === 'f-mla');
    assert.ok(Math.abs(flight.destLat - 35.8459) < 0.01, `MLA repaired to Malta, got ${flight.destLat}`);
    assert.equal(flight.originLat, 36.85, 'the Tunis position was close enough and is kept');

    const keys = (await srv.pool.query('SELECT route_key FROM cached_routes')).rows.map((r) => r.route_key).sort();
    assert.deepEqual(keys, ['road:long', 'road:ok']);

    const lookup = await srv.api('GET', '/api/airports/lookup/MLA', { token: admin.token });
    assert.equal(lookup.json.timezone, 'Europe/Malta');
    assert.equal(lookup.json.country_code, 'MT');

    const index = await srv.api('GET', '/api/airports/index', { token: admin.token });
    assert.equal(index.status, 200);
    const mla = index.json.rows.find((r) => r[0] === 'MLA');
    assert.deepEqual(mla.slice(0, 4), ['MLA', 'LMML', 'Luqa International', 'Malta']);
    assert.ok(Math.abs(mla[4] - 35.8459) < 0.001);
    const etag = index.headers.get('etag');
    assert.ok(etag);
    const again = await srv.api('GET', '/api/airports/index', { token: admin.token, headers: { 'If-None-Match': etag } });
    assert.equal(again.status, 304);
});
