// WP-2.5: optimistic concurrency (REL-005).
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
const put = (url, body) => srv.api('PUT', url, { token: admin.token, body });

test('records start at version 1 and every write increments it', async () => {
    const created = (await srv.api('POST', '/api/trips', { token: admin.token, body: { id: 't', name: 'A' } })).json;
    assert.equal(created.version, 1);
    const updated = (await put('/api/trips/t', { ...created, name: 'B' })).json;
    assert.equal(updated.version, 2);
});

test('a write based on an outdated version is rejected with 409, not silently applied', async () => {
    const base = (await srv.api('POST', '/api/trips', { token: admin.token, body: { id: 't', name: 'Base', packingList: [] } })).json;
    const tabA = await put('/api/trips/t', { ...base, accommodations: [{ id: 'stay' }] });
    assert.equal(tabA.status, 200);
    const tabB = await put('/api/trips/t', { ...base, packingList: [{ id: 'p', text: 'Socks' }] });
    assert.equal(tabB.status, 409);
    assert.match(tabB.json.error, /changed by someone else/);
    const stored = (await srv.api('GET', '/api/trips', { token: admin.token })).json[0];
    assert.equal(stored.accommodations.length, 1, "tab A's change survives");
});

test('writes without a version are still accepted (older clients, imports)', async () => {
    await srv.api('POST', '/api/flights', { token: admin.token, body: { id: 'f', origin: 'A' } });
    const r = await put('/api/flights/f', { id: 'f', origin: 'B' });
    assert.equal(r.status, 200);
    assert.equal(r.json.version, 2);
});

test('batch writes check versions too', async () => {
    const base = (await srv.api('POST', '/api/trips', { token: admin.token, body: { id: 't', name: 'A' } })).json;
    await put('/api/trips/t', { ...base, name: 'Changed elsewhere' });
    const r = await srv.api('POST', '/api/batch', { token: admin.token, body: { upsertTrips: [{ ...base, name: 'Stale' }] } });
    assert.equal(r.status, 409);
});

test('user profile edits are versioned', async () => {
    const me = (await srv.api('GET', '/api/auth/me', { token: admin.token })).json;
    const first = await put('/api/users/admin@test.dev', { ...me, name: 'One' });
    assert.equal(first.status, 200);
    const stale = await put('/api/users/admin@test.dev', { ...me, name: 'Two' });
    assert.equal(stale.status, 409);
});

test('PATCH /api/settings changes only the fields sent', async () => {
    await srv.api('PUT', '/api/settings', { token: admin.token, body: { orgName: 'Org', theme: 'dark', currency: 'USD' } });
    await srv.api('PATCH', '/api/settings', { token: admin.token, body: { theme: 'light' } });
    await srv.api('PATCH', '/api/settings', { token: admin.token, body: { orgName: 'Renamed' } });
    const s = (await srv.api('GET', '/api/settings', { token: admin.token })).json;
    assert.deepEqual([s.orgName, s.theme, s.currency], ['Renamed', 'light', 'USD']);
});
