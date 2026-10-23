const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('../helpers/testServer');

let srv;
before(async () => { srv = await startTestServer(); });
after(async () => { await srv.close(); });

test('server boots against the in-memory database and answers health', async () => {
    const r = await srv.api('GET', '/api/health');
    assert.equal(r.status, 200);
});

test('protected routes require a token', async () => {
    const r = await srv.api('GET', '/api/trips');
    assert.equal(r.status, 401);
});

test('cross-origin requests are not granted CORS access by default (SEC-016)', async () => {
    const r = await srv.api('OPTIONS', '/api/trips', { headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } });
    assert.equal(r.headers.get('access-control-allow-origin'), null);
});

test('responses carry a Content-Security-Policy that forbids inline and third-party scripts (SEC-011)', async () => {
    const r = await srv.api('GET', '/api/health');
    const csp = r.headers.get('content-security-policy') || '';
    assert.match(csp, /script-src 'self'/);
    assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
    assert.doesNotMatch(csp, /script-src[^;]*https:/);
    assert.match(csp, /object-src 'none'/);
});

test('holiday proxy needs a token and rejects bad parameters before any upstream call', async () => {
    assert.equal((await srv.api('GET', '/api/proxy/holidays/2026/BE')).status, 401);
    await srv.reset();
    const { token } = (await srv.api('POST', '/api/auth/register', { body: { name: 'Admin', email: 'holidays@test.dev', password: 'admin-pass-1' } })).json;
    assert.equal((await srv.api('GET', '/api/proxy/holidays/1800/BE', { token })).status, 400);
    assert.equal((await srv.api('GET', '/api/proxy/holidays/2026/BEL', { token })).status, 400);
});
