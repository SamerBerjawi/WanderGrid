// WP-1.2a: role-based authorization (SEC-001, QA-A-002) and admin self/last-admin protection (QA-G-002).
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('../helpers/testServer');

let srv, admin, partner;
before(async () => { srv = await startTestServer(); });
after(async () => { await srv.close(); });
beforeEach(async () => {
    await srv.reset();
    admin = (await srv.api('POST', '/api/auth/register', { body: { name: 'Admin', email: 'admin@test.dev', password: 'admin-pass-1' } })).json;
    partner = (await srv.api('POST', '/api/auth/register', { body: { name: 'Partner', email: 'partner@test.dev', password: 'partner-pass-1' } })).json;
});

const ADMIN_ONLY = [
    ['POST', '/api/users', { id: 'x@test.dev', email: 'x@test.dev', name: 'X' }],
    ['DELETE', '/api/users/admin@test.dev'],
    ['PUT', '/api/settings', { orgName: 'Pwned' }],
    ['GET', '/api/backup'],
    ['POST', '/api/restore', { users: [], restoreOptions: { mode: 'merge' } }],
    ['POST', '/api/wipe'],
    ['POST', '/api/jobs/backup'],
    ['POST', '/api/jobs/refresh'],
    ['GET', '/api/jobs/status/whatever'],
    ['POST', '/api/events', { id: 'e1' }],
    ['PUT', '/api/entitlements/e1', { id: 'e1' }],
    ['DELETE', '/api/configs/c1'],
];

test('a Partner gets 403 on every admin-only route', async () => {
    for (const [method, url, body] of ADMIN_ONLY) {
        const r = await srv.api(method, url, { token: partner.token, body });
        assert.equal(r.status, 403, `${method} ${url}`);
    }
    const users = await srv.api('GET', '/api/users', { token: admin.token });
    assert.equal(users.json.length, 2, 'nothing was deleted or wiped');
});

test('an Admin may use the admin-only routes', async () => {
    assert.equal((await srv.api('PUT', '/api/settings', { token: admin.token, body: { orgName: 'Ok' } })).status, 200);
    assert.equal((await srv.api('GET', '/api/backup', { token: admin.token })).status, 200);
    assert.equal((await srv.api('POST', '/api/users', { token: admin.token, body: { id: 'new@test.dev', email: 'new@test.dev', name: 'New', role: 'Partner' } })).status, 201);
    assert.equal((await srv.api('DELETE', '/api/users/new@test.dev', { token: admin.token })).status, 200);
});

test('a Partner cannot edit another user, and cannot change their own role', async () => {
    const other = await srv.api('PUT', '/api/users/admin@test.dev', { token: partner.token, body: { id: 'admin@test.dev', email: 'admin@test.dev', name: 'pwned', password: 'hijacked1', role: 'Admin' } });
    assert.equal(other.status, 403);
    const self = await srv.api('PUT', '/api/users/partner@test.dev', { token: partner.token, body: { id: 'partner@test.dev', email: 'partner@test.dev', name: 'Renamed', role: 'Admin' } });
    assert.equal(self.status, 200);
    assert.equal(self.json.role, 'Partner', 'role stays Partner');
    assert.equal(self.json.name, 'Renamed');
    const login = await srv.api('POST', '/api/auth/login', { body: { email: 'admin@test.dev', password: 'admin-pass-1' } });
    assert.equal(login.status, 200, 'admin password unchanged');
});

test('an Admin cannot delete their own account or remove the last administrator', async () => {
    const self = await srv.api('DELETE', '/api/users/admin@test.dev', { token: admin.token });
    assert.equal(self.status, 409);
    const demote = await srv.api('PUT', '/api/users/admin@test.dev', { token: admin.token, body: { id: 'admin@test.dev', email: 'admin@test.dev', name: 'Admin', role: 'Partner' } });
    assert.equal(demote.status, 409);
    // With a second admin, one admin may remove the other.
    await srv.api('PUT', '/api/users/partner@test.dev', { token: admin.token, body: { id: 'partner@test.dev', email: 'partner@test.dev', name: 'Partner', role: 'Admin' } });
    assert.equal((await srv.api('DELETE', '/api/users/partner@test.dev', { token: admin.token })).status, 200);
});

test('an invalid token is 401 (sign out), not 403 (forbidden)', async () => {
    assert.equal((await srv.api('GET', '/api/trips', { token: 'not-a-jwt' })).status, 401);
});

test('PUT /api/users/:id ignores a body id that differs from the URL', async () => {
    const r = await srv.api('PUT', '/api/users/partner@test.dev', { token: partner.token, body: { id: 'admin@test.dev', email: 'partner@test.dev', name: 'P' } });
    assert.equal(r.status, 200);
    assert.equal(r.json.id, 'partner@test.dev');
    const users = (await srv.api('GET', '/api/users', { token: admin.token })).json;
    assert.equal(users.find((u) => u.id === 'admin@test.dev').name, 'Admin');
});
