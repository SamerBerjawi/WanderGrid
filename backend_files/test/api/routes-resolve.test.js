// Persistent road/rail route store: auth, validation, and serving a stored route without any upstream call.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('../helpers/testServer');
const { parseSpec, encodePolyline6 } = require('../../routeStore');

let srv, admin;
before(async () => { srv = await startTestServer(); });
after(async () => { await srv.close(); });
beforeEach(async () => {
    await srv.reset();
    admin = (await srv.api('POST', '/api/auth/register', { body: { name: 'Admin', email: 'admin@test.dev', password: 'admin-pass-1' } })).json;
});

test('route resolution requires a session token', async () => {
    const r = await srv.api('POST', '/api/proxy/routes/resolve', { body: { routes: [] } });
    assert.equal(r.status, 401);
});

test('a body without routes is rejected', async () => {
    const r = await srv.api('POST', '/api/proxy/routes/resolve', { token: admin.token, body: {} });
    assert.equal(r.status, 400);
});

test('invalid specs are answered individually without touching an upstream', async () => {
    const r = await srv.api('POST', '/api/proxy/routes/resolve', { token: admin.token, body: { routes: [
        { id: 'bad-mode', mode: 'plane', coords: [[0, 0], [1, 1]] },
        { id: 'one-point', mode: 'rail', coords: [[0, 0]] },
    ] } });
    assert.equal(r.status, 200);
    assert.equal(r.json.results['bad-mode'].status, 'none');
    assert.equal(r.json.results['one-point'].status, 'none');
});

test('a stored route is served from the database', async () => {
    const spec = parseSpec({ id: 'x', mode: 'rail', coords: [[4.9, 52.37], [2.35, 48.85]] });
    const geometry = encodePolyline6([[4.9, 52.37], [3.6, 50.6], [2.35, 48.85]]);
    await srv.pool.query(
        'INSERT INTO cached_routes (route_key, payload) VALUES ($1, $2)',
        [spec.key, JSON.stringify({ status: 'ok', geometry, distanceKm: 500, durationMin: 200, attribution: 'test' })]
    );
    const r = await srv.api('POST', '/api/proxy/routes/resolve', { token: admin.token, body: { routes: [
        { id: 'ams-par', mode: 'rail', coords: [[4.9, 52.37], [2.35, 48.85]] },
    ] } });
    assert.equal(r.status, 200);
    assert.equal(r.json.results['ams-par'].status, 'ok');
    assert.equal(r.json.results['ams-par'].geometry, geometry);
});

test('a remembered "no route" is returned without asking upstream again', async () => {
    const spec = parseSpec({ id: 'x', mode: 'rail', coords: [[35.5, 33.89], [35.83, 34.43]] });
    await srv.pool.query('INSERT INTO cached_routes (route_key, payload) VALUES ($1, $2)',
        [spec.key, JSON.stringify({ status: 'none', reason: 'no_rail_connection' })]);
    const r = await srv.api('POST', '/api/proxy/routes/resolve', { token: admin.token, body: { routes: [
        { id: 'beirut', mode: 'rail', coords: [[35.5, 33.89], [35.83, 34.43]] },
    ] } });
    assert.equal(r.json.results.beirut.status, 'none');
});
