// WP-1.5: revocable sessions (SEC-007, QA-A-010, QA-A-005).
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { startTestServer } = require('../helpers/testServer');

let srv, admin, partner;
before(async () => { srv = await startTestServer(); });
after(async () => { await srv.close(); });
beforeEach(async () => {
    await srv.reset();
    admin = (await srv.api('POST', '/api/auth/register', { body: { name: 'Admin', email: 'admin@test.dev', password: 'admin-pass-1' } })).json;
    partner = (await srv.api('POST', '/api/auth/register', { body: { name: 'Partner', email: 'partner@test.dev', password: 'partner-pass-1' } })).json;
});
const trips = (token) => srv.api('GET', '/api/trips', { token });

test('GET /api/auth/me returns the signed-in user without secrets', async () => {
    const r = await srv.api('GET', '/api/auth/me', { token: partner.token });
    assert.equal(r.status, 200);
    assert.equal(r.json.id, 'partner@test.dev');
    assert.equal(r.json.password, undefined);
    assert.equal(r.json.tokenVersion, undefined);
});

test('logout revokes the token on the server (QA-A-010)', async () => {
    assert.equal((await trips(partner.token)).status, 200);
    assert.equal((await srv.api('POST', '/api/auth/logout', { token: partner.token })).status, 200);
    assert.equal((await trips(partner.token)).status, 401);
    const again = (await srv.api('POST', '/api/auth/login', { body: { email: 'partner@test.dev', password: 'partner-pass-1' } })).json;
    assert.equal((await trips(again.token)).status, 200, 'a fresh login works');
});

test('a deleted user is no longer authenticated', async () => {
    await srv.api('DELETE', '/api/users/partner@test.dev', { token: admin.token });
    assert.equal((await trips(partner.token)).status, 401);
    assert.equal((await srv.api('GET', '/api/auth/me', { token: partner.token })).status, 401);
});

test('a password change by an admin revokes the member\'s sessions', async () => {
    await srv.api('PUT', '/api/users/partner@test.dev', { token: admin.token, body: { id: 'partner@test.dev', email: 'partner@test.dev', name: 'Partner', role: 'Partner', password: 'reset-pass-1' } });
    assert.equal((await trips(partner.token)).status, 401);
});

test('changing your own password keeps you signed in with the returned token', async () => {
    const r = await srv.api('PUT', '/api/users/partner@test.dev', { token: partner.token, body: { id: 'partner@test.dev', email: 'partner@test.dev', name: 'Partner', password: 'mine-new-pass' } });
    assert.equal(r.status, 200);
    assert.ok(r.json.sessionToken);
    assert.equal((await trips(partner.token)).status, 401, 'old token revoked');
    assert.equal((await trips(r.json.sessionToken)).status, 200);
});

test('the role comes from the database, not the token', async () => {
    const forged = jwt.sign({ id: 'partner@test.dev', email: 'partner@test.dev', role: 'Admin', tv: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });
    assert.equal((await srv.api('POST', '/api/wipe', { token: forged })).status, 403);
    // A demotion takes effect immediately even for a token issued before it.
    await srv.api('PUT', '/api/users/partner@test.dev', { token: admin.token, body: { id: 'partner@test.dev', email: 'partner@test.dev', name: 'Partner', role: 'Admin' } });
    const promoted = (await srv.api('POST', '/api/auth/login', { body: { email: 'partner@test.dev', password: 'partner-pass-1' } })).json;
    await srv.api('PUT', '/api/users/partner@test.dev', { token: admin.token, body: { id: 'partner@test.dev', email: 'partner@test.dev', name: 'Partner', role: 'Partner' } });
    assert.equal((await srv.api('GET', '/api/backup', { token: promoted.token })).status, 401);
});

test('sessions expire after 24 hours by default', async () => {
    const { exp, iat } = jwt.decode(admin.token);
    assert.equal(exp - iat, 24 * 3600);
});
