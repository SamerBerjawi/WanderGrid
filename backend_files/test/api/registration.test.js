// WP-1.1: registration lockdown (SEC-002, SEC-003, QA-A-001, QA-A-006) and first-run setup (QA-A-004).
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('../helpers/testServer');

let srv;
before(async () => { srv = await startTestServer(); });
after(async () => { await srv.close(); });
beforeEach(async () => { await srv.reset(); });

const register = (body) => srv.api('POST', '/api/auth/register', { body });
const login = (email, password) => srv.api('POST', '/api/auth/login', { body: { email, password } });

test('setup-status is public and reports an empty workspace', async () => {
    const r = await srv.api('GET', '/api/auth/setup-status');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { needsSetup: true, allowSelfRegistration: true });
    await register({ name: 'First', email: 'first@test.dev', password: 'password-1' });
    assert.equal((await srv.api('GET', '/api/auth/setup-status')).json.needsSetup, false);
});

test('the first account becomes Admin and later sign-ups are Partner, whatever role is sent', async () => {
    const a = await register({ name: 'First', email: 'First@Test.dev', password: 'password-1', role: 'Partner' });
    assert.equal(a.status, 201);
    assert.equal(a.json.user.role, 'Admin');
    assert.equal(a.json.user.id, 'first@test.dev');
    const b = await register({ name: 'Eve', email: 'eve@test.dev', password: 'password-2', role: 'Admin', id: 'whatever' });
    assert.equal(b.status, 201);
    assert.equal(b.json.user.role, 'Partner');
    assert.equal(b.json.user.id, 'eve@test.dev', 'client-supplied id is ignored');
    assert.equal(b.json.user.password, undefined);
});

test('registering with an existing id or email cannot overwrite that account', async () => {
    await register({ name: 'Admin', email: 'admin@test.dev', password: 'admin-pass-1' });
    const byId = await register({ id: 'admin@test.dev', name: 'Mallory', email: 'admin@test.dev', password: 'mallory-1', role: 'Admin' });
    assert.equal(byId.status, 409);
    assert.match(byId.json.error, /already exists/);
    const byCase = await register({ name: 'Mallory', email: ' ADMIN@test.dev ', password: 'mallory-1' });
    assert.equal(byCase.status, 409);
    assert.equal((await login('admin@test.dev', 'admin-pass-1')).status, 200, 'original admin can still sign in');
    assert.equal((await login('admin@test.dev', 'mallory-1')).status, 401);
});

test('admins can disable self-registration', async () => {
    const admin = (await register({ name: 'Admin', email: 'admin@test.dev', password: 'admin-pass-1' })).json;
    await srv.api('PUT', '/api/settings', { token: admin.token, body: { orgName: 'X', allowSelfRegistration: false } });
    assert.equal((await srv.api('GET', '/api/auth/setup-status')).json.allowSelfRegistration, false);
    const r = await register({ name: 'Late', email: 'late@test.dev', password: 'late-pass-1' });
    assert.equal(r.status, 403);
});

test('register validates email and password presence', async () => {
    assert.equal((await register({ email: 'not-an-email', password: 'x' })).status, 400);
    assert.equal((await register({ email: 'a@b.dev' })).status, 400);
});

test('creating a record never overwrites an existing one (POST returns 409)', async () => {
    const admin = (await register({ name: 'Admin', email: 'admin@test.dev', password: 'admin-pass-1' })).json;
    const trip = { id: 't1', name: 'Original', participants: ['admin@test.dev'] };
    assert.equal((await srv.api('POST', '/api/trips', { token: admin.token, body: trip })).status, 201);
    const again = await srv.api('POST', '/api/trips', { token: admin.token, body: { ...trip, name: 'Overwritten' } });
    assert.equal(again.status, 409);
    const list = await srv.api('GET', '/api/trips', { token: admin.token });
    assert.equal(list.json.find((t) => t.id === 't1').name, 'Original');
    const dupUser = await srv.api('POST', '/api/users', { token: admin.token, body: { id: 'admin@test.dev', email: 'admin@test.dev', name: 'X' } });
    assert.equal(dupUser.status, 409);
});

test('demo on a fresh install creates the first admin with sample data (QA-A-008)', async () => {
    const r = await srv.api('POST', '/api/auth/demo');
    assert.equal(r.status, 200);
    assert.equal(r.json.user.role, 'Admin');
    const trips = (await srv.api('GET', '/api/trips', { token: r.json.token })).json;
    assert.equal(trips.length, 1);
    assert.equal((await srv.api('GET', '/api/visited', { token: r.json.token })).json.length, 5);
    assert.equal((await srv.api('POST', '/api/auth/login', { body: { email: 'demo@wandergrid.app', password: 'password' } })).status, 401, 'no default password');
});

test('demo on a populated workspace is a Partner that sees only its own sample trip, and respects closed sign-up', async () => {
    const admin = (await register({ name: 'Admin', email: 'admin@test.dev', password: 'admin-pass-1' })).json;
    await srv.api('POST', '/api/trips', { token: admin.token, body: { id: 'family', name: 'Family trip', privacy: 'Private', participants: ['admin@test.dev'] } });
    const demo = await srv.api('POST', '/api/auth/demo');
    assert.equal(demo.status, 200);
    assert.equal(demo.json.user.role, 'Partner');
    const trips = (await srv.api('GET', '/api/trips', { token: demo.json.token })).json;
    assert.deepEqual(trips.map((t) => t.participants), [['demo@wandergrid.app']]);
    assert.equal((await srv.api('GET', '/api/visited', { token: demo.json.token })).json.length, 0, 'real atlas untouched');
    await srv.api('PUT', '/api/settings', { token: admin.token, body: { allowSelfRegistration: false } });
    assert.equal((await srv.api('POST', '/api/auth/demo')).status, 403);
});
