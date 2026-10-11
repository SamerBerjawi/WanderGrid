// WP-2.11: request validation (SEC-012, REL-011).
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
const post = (coll, body) => srv.api('POST', `/api/${coll}`, { token: admin.token, body });

test('invalid dates are rejected before they can break the calendar feed or trip page', async () => {
    const r = await post('trips', { id: 't1', name: 'X', startDate: '2026-13-45', endDate: '2026-11-02' });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /YYYY-MM-DD/);
    assert.equal((await post('trips', { id: 't2', name: 'Ok', startDate: '2026-11-01', endDate: '2026-11-02' })).status, 201);
    assert.equal((await post('flights', { id: 'f1', departureDate: 'tomorrow' })).status, 400);
});

test('list fields must be lists', async () => {
    assert.equal((await post('trips', { id: 't1', name: 'X', transports: 'nope' })).status, 400);
    assert.equal((await post('configs', { id: 'c1', holidays: {} })).status, 400);
});

test('ids are bounded and path-safe', async () => {
    assert.equal((await post('trips', { id: '../etc', name: 'X' })).status, 400);
    assert.equal((await post('trips', { id: 'x'.repeat(300), name: 'X' })).status, 400);
    assert.equal((await post('trips', { name: 'no id' })).status, 400);
});

test('oversized records are rejected (1 MB per record)', async () => {
    const r = await post('trips', { id: 'big', name: 'X', notes: 'x'.repeat(1100 * 1024) });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /too large/);
});

test('avatars must be small images or https URLs, not arbitrary strings', async () => {
    const put = (profilePicture) => srv.api('PUT', '/api/users/admin@test.dev', { token: admin.token, body: { id: 'admin@test.dev', email: 'admin@test.dev', name: 'Admin', role: 'Admin', profilePicture } });
    assert.equal((await put('data:image/png;base64,iVBORw0KGgo=')).status, 200);
    assert.equal((await put('https://example.com/me.jpg')).status, 200);
    assert.equal((await put('javascript:alert(1)')).status, 400);
    assert.equal((await put('data:text/html;base64,PHNjcmlwdD4=')).status, 400);
    assert.equal((await put(`data:image/png;base64,${'A'.repeat(1500 * 1024)}`)).status, 400);
});

test('bulk and batch writes are validated too', async () => {
    assert.equal((await srv.api('POST', '/api/trips/bulk', { token: admin.token, body: [{ id: 'ok', name: 'A' }, { id: 'bad', startDate: 'x' }] })).status, 400);
    assert.equal((await srv.api('GET', '/api/trips', { token: admin.token })).json.length, 0, 'nothing stored from a rejected batch');
    assert.equal((await srv.api('POST', '/api/batch', { token: admin.token, body: { upsertFlights: [{ id: 'f', departureDate: 'later' }] } })).status, 400);
});
