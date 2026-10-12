// WP-1.3: password pipeline (QA-A-003, QA-G-001, QA-A-012, SEC-008, SEC-009) and restore defaults (SEC-005).
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

const login = (email, password) => srv.api('POST', '/api/auth/login', { body: { email, password } });
const rawUser = async (id) => (await srv.pool.query('SELECT data FROM users WHERE id = $1', [id])).rows[0]?.data;

test('register rejects passwords shorter than 8 characters', async () => {
    const r = await srv.api('POST', '/api/auth/register', { body: { name: 'W', email: 'w@test.dev', password: '1' } });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /at least 8 characters/);
});

test('passwords are stored in the prefixed PBKDF2 format, never returned', async () => {
    const stored = await rawUser('admin@test.dev');
    assert.match(stored.password, /^pbkdf2\$sha512\$100000\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    const users = (await srv.api('GET', '/api/users', { token: admin.token })).json;
    assert.ok(users.every((u) => u.password === undefined));
});

test('a member added by an admin can sign in with the given password (QA-G-001)', async () => {
    const r = await srv.api('POST', '/api/users', { token: admin.token, body: { id: 'elena@test.dev', email: 'elena@test.dev', name: 'Elena', role: 'Partner', password: 'Elena!Pass1' } });
    assert.equal(r.status, 201);
    assert.equal(r.json.password, undefined, 'create response has no hash (SEC-009)');
    assert.equal((await login('elena@test.dev', 'Elena!Pass1')).status, 200);
});

test('changing your own password works, and the response has no hash (QA-A-003, SEC-009)', async () => {
    const r = await srv.api('PUT', '/api/users/admin@test.dev', { token: admin.token, body: { id: 'admin@test.dev', email: 'admin@test.dev', name: 'Admin', role: 'Admin', password: 'new-pass-123' } });
    assert.equal(r.status, 200);
    assert.equal(r.json.password, undefined);
    assert.equal((await login('admin@test.dev', 'new-pass-123')).status, 200);
    assert.equal((await login('admin@test.dev', 'admin-pass-1')).status, 401);
});

test('a password containing ":" is hashed and works (SEC-008)', async () => {
    await srv.api('PUT', '/api/users/admin@test.dev', { token: admin.token, body: { id: 'admin@test.dev', email: 'admin@test.dev', name: 'Admin', role: 'Admin', password: 'my:secret:pass' } });
    assert.ok((await rawUser('admin@test.dev')).password.startsWith('pbkdf2$'));
    assert.equal((await login('admin@test.dev', 'my:secret:pass')).status, 200);
});

test('a client-supplied salt:hash value is treated as a new password, not stored raw (SEC-008)', async () => {
    const fake = 'a'.repeat(32) + ':' + 'b'.repeat(128);
    await srv.api('PUT', '/api/users/admin@test.dev', { token: admin.token, body: { id: 'admin@test.dev', email: 'admin@test.dev', name: 'Admin', role: 'Admin', password: fake } });
    assert.notEqual((await rawUser('admin@test.dev')).password, fake);
    assert.equal((await login('admin@test.dev', fake)).status, 200);
});

test('editing a profile without a password keeps the existing password', async () => {
    await srv.api('PUT', '/api/users/admin@test.dev', { token: admin.token, body: { id: 'admin@test.dev', email: 'admin@test.dev', name: 'Renamed', role: 'Admin', password: '' } });
    assert.equal((await login('admin@test.dev', 'admin-pass-1')).status, 200);
});

test('legacy plaintext and old-format rows still sign in and are upgraded on login', async () => {
    const legacy = await rawUser('admin@test.dev');
    await srv.pool.query('UPDATE users SET data = $2 WHERE id = $1', ['admin@test.dev', JSON.stringify({ ...legacy, password: 'plain-legacy-1' })]);
    assert.equal((await login('admin@test.dev', 'wrong-pass-1')).status, 401);
    assert.equal((await login('admin@test.dev', 'plain-legacy-1')).status, 200);
    assert.ok((await rawUser('admin@test.dev')).password.startsWith('pbkdf2$'));
});

test('accounts holding an old browser SHA-256 hash are flagged for reset', async () => {
    const legacy = await rawUser('admin@test.dev');
    await srv.pool.query('UPDATE users SET data = $2 WHERE id = $1', ['admin@test.dev', JSON.stringify({ ...legacy, password: 'c'.repeat(32) + ':' + 'd'.repeat(64) })]);
    const users = (await srv.api('GET', '/api/users', { token: admin.token })).json;
    assert.equal(users.find((u) => u.id === 'admin@test.dev').passwordResetRequired, true);
});

test('restore never assigns the default password "password" (SEC-005)', async () => {
    const r = await srv.restore(admin.token, {
        users: [{ id: 'cfo@test.dev', email: 'cfo@test.dev', name: 'CFO', role: 'Admin' }, { id: 'x@test.dev', email: 'x@test.dev', name: 'X', role: 'Partner', password: 'plain12345' }],
        restoreOptions: { mode: 'merge' } });
    assert.equal(r.json.status, 'Completed');
    assert.equal((await login('cfo@test.dev', 'password')).status, 401);
    assert.ok((await rawUser('x@test.dev')).password.startsWith('pbkdf2$'), 'plaintext from the file is hashed');
    assert.equal((await login('x@test.dev', 'plain12345')).status, 200);
    assert.equal((await login('admin@test.dev', 'admin-pass-1')).status, 200, 'existing admin keeps their password');
});

test('an admin-issued reset code lets a member set a new password once (QA-A-009)', async () => {
    await srv.api('POST', '/api/auth/register', { body: { name: 'Pat', email: 'pat@test.dev', password: 'pat-old-pass' } });
    const patOld = (await login('pat@test.dev', 'pat-old-pass')).json;
    assert.equal((await srv.api('POST', '/api/users/pat@test.dev/reset-code', { token: patOld.token })).status, 403, 'members cannot issue codes');
    const issued = await srv.api('POST', '/api/users/pat@test.dev/reset-code', { token: admin.token });
    assert.equal(issued.status, 200);
    assert.match(issued.json.code, /^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    const users = (await srv.api('GET', '/api/users', { token: admin.token })).json;
    assert.equal(users.find((u) => u.id === 'pat@test.dev').passwordReset, undefined, 'code hash never leaves the server');

    const wrong = await srv.api('POST', '/api/auth/reset-password', { body: { email: 'pat@test.dev', code: 'AAAAA-BBBBB', password: 'pat-new-pass' } });
    assert.equal(wrong.status, 400);
    const ok = await srv.api('POST', '/api/auth/reset-password', { body: { email: 'pat@test.dev', code: issued.json.code.toLowerCase(), password: 'pat-new-pass' } });
    assert.equal(ok.status, 200);
    assert.equal((await login('pat@test.dev', 'pat-new-pass')).status, 200);
    assert.equal((await srv.api('GET', '/api/trips', { token: patOld.token })).status, 401, 'old sessions revoked');
    const reuse = await srv.api('POST', '/api/auth/reset-password', { body: { email: 'pat@test.dev', code: issued.json.code, password: 'another-pass-1' } });
    assert.equal(reuse.status, 400, 'codes are single-use');
});

test('expired reset codes are rejected', async () => {
    const issued = (await srv.api('POST', '/api/users/admin@test.dev/reset-code', { token: admin.token })).json;
    const row = await rawUser('admin@test.dev');
    row.passwordReset.expiresAt = new Date(Date.now() - 1000).toISOString();
    await srv.pool.query('UPDATE users SET data = $2 WHERE id = $1', ['admin@test.dev', JSON.stringify(row)]);
    const r = await srv.api('POST', '/api/auth/reset-password', { body: { email: 'admin@test.dev', code: issued.code, password: 'whatever-123' } });
    assert.equal(r.status, 400);
});
