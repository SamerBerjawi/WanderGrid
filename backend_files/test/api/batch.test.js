// WP-1.9: atomic multi-record writes (REL-002).
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
const ids = async (coll) => (await srv.api('GET', `/api/${coll}`, { token: admin.token })).json.map((r) => r.id).sort();

test('bundling applies the new trip and the flight deletions together', async () => {
    for (const id of ['f1', 'f2']) await srv.api('POST', '/api/flights', { token: admin.token, body: { id, origin: 'A', destination: 'B' } });
    const r = await srv.api('POST', '/api/batch', { token: admin.token, body: {
        upsertTrips: [{ id: 'bundle', name: 'Bundle', transports: [{ id: 'f1' }, { id: 'f2' }] }],
        deleteFlights: ['f1', 'f2'] } });
    assert.equal(r.status, 200);
    assert.deepEqual(await ids('flights'), []);
    assert.deepEqual(await ids('trips'), ['bundle']);
});

test('a failure part-way rolls back every change (no lost flights)', async () => {
    for (const id of ['f1', 'f2']) await srv.api('POST', '/api/flights', { token: admin.token, body: { id, origin: 'A', destination: 'B' } });
        const realConnect = srv.pool.connect.bind(srv.pool);
    srv.pool.connect = async (...args) => {
        const client = await realConnect(...args);
        const q = client.query.bind(client);
        // Fail on the second flight deletion: the trip upsert and first deletion already ran.
        client.query = (text, params) => (typeof text === 'string' && text.includes('DELETE FROM flights') && params?.[0] === 'f2' ? Promise.reject(new Error('disk full')) : q(text, params));
        return client;
    };
    try {
        const r = await srv.api('POST', '/api/batch', { token: admin.token, body: {
            deleteFlights: ['f1', 'f2'], upsertTrips: [{ id: 'bundle', name: 'Bundle' }] } });
        assert.equal(r.status, 500);
    } finally {
        srv.pool.connect = realConnect;
    }
    assert.deepEqual(await ids('flights'), ['f1', 'f2']);
    assert.deepEqual(await ids('trips'), []);
});

test('malformed batches are rejected before touching data', async () => {
    const r = await srv.api('POST', '/api/batch', { token: admin.token, body: { deleteFlights: [{}] } });
    assert.equal(r.status, 400);
});
