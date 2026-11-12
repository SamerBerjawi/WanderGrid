// F-02 / D-03: repeated wrong passwords pause one account without affecting anyone else.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('../helpers/testServer');

let srv;
before(async () => { srv = await startTestServer(); });
after(async () => { await srv.close(); });
beforeEach(async () => { await srv.reset(); });

const login = (email, password) => srv.api('POST', '/api/auth/login', { body: { email, password } });

test('ten wrong passwords pause that account only; a right password before the limit resets the count', async () => {
    await srv.api('POST', '/api/auth/register', { body: { name: 'A', email: 'a@test.dev', password: 'a-pass-12345' } });
    await srv.api('POST', '/api/auth/register', { body: { name: 'B', email: 'b@test.dev', password: 'b-pass-12345' } });
    for (let i = 0; i < 5; i++) assert.equal((await login('a@test.dev', 'wrong-pass-1')).status, 401);
    assert.equal((await login('a@test.dev', 'a-pass-12345')).status, 200, 'success before the limit clears the count');
    for (let i = 0; i < 10; i++) assert.equal((await login('A@test.dev', 'wrong-pass-1')).status, 401);
    const locked = await login('a@test.dev', 'a-pass-12345');
    assert.equal(locked.status, 429, 'even the right password waits once the account is paused');
    assert.equal((await login('b@test.dev', 'b-pass-12345')).status, 200, 'other accounts are unaffected');
});

test('session checks are not counted by the credential limiter', async () => {
    const reg = (await srv.api('POST', '/api/auth/register', { body: { name: 'A', email: 'a@test.dev', password: 'a-pass-12345' } })).json;
    for (let i = 0; i < 30; i++) assert.equal((await srv.api('GET', '/api/auth/me', { token: reg.token })).status, 200);
});

test('an unknown email costs about as long as a wrong password (F-15)', async () => {
    await srv.reset();
    await srv.api('POST', '/api/auth/register', { body: { name: 'Ada', email: 'ada@example.com', password: 'Passw0rd!long1' } });
    const time = async (email) => { const t = process.hrtime.bigint(); await srv.api('POST', '/api/auth/login', { body: { email, password: 'wrong-password-1' } }); return Number(process.hrtime.bigint() - t) / 1e6; };
    await time('nobody@example.com'); // warm the cached dummy hash
    const unknown = await time('nobody2@example.com');
    const known = await time('ada@example.com');
    assert.ok(unknown > known * 0.4, `unknown ${unknown.toFixed(1)}ms vs known ${known.toFixed(1)}ms`);
});
