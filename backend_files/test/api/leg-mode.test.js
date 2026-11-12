const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('../helpers/testServer');

test('a flight saved without a mode is stored as Flight, and an unknown mode is refused (F-05)', async () => {
    const srv = await startTestServer();
    try {
        const reg = await srv.api('POST', '/api/auth/register', { body: { name: 'Ada', email: 'ada@example.com', password: 'Passw0rd!long1' } });
        const token = reg.json.token;
        const ok = await srv.api('POST', '/api/flights', { token, body: { id: 'f1', origin: 'LHR', destination: 'JFK', departureDate: '2026-05-01' } });
        assert.equal(ok.status, 201);
        const list = await srv.api('GET', '/api/flights', { token });
        assert.equal(list.json.find(f => f.id === 'f1').mode, 'Flight');
        const bad = await srv.api('POST', '/api/flights', { token, body: { id: 'f2', mode: 'Rocket' } });
        assert.equal(bad.status, 400);
        const atlas = await srv.api('POST', '/api/visited', { token, body: { id: 'v1', type: 'country', code: 'FR', name: 'France' } });
        assert.equal(atlas.status, 201);
        const v = (await srv.api('GET', '/api/visited', { token })).json.find(x => x.id === 'v1');
        assert.equal(v.mode, undefined);
    } finally { await srv.close(); }
});
