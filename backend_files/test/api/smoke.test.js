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
