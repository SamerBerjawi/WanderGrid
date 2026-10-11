// WP-2.10: third-party API keys stay on the server (SEC-010).
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('../helpers/testServer');

let srv, admin, partner;
const MASK = '••••••••';
before(async () => { srv = await startTestServer(); });
after(async () => { await srv.close(); });
beforeEach(async () => {
    await srv.reset();
    admin = (await srv.api('POST', '/api/auth/register', { body: { name: 'Admin', email: 'admin@test.dev', password: 'admin-pass-1' } })).json;
    partner = (await srv.api('POST', '/api/auth/register', { body: { name: 'Partner', email: 'partner@test.dev', password: 'partner-pass-1' } })).json;
    await srv.api('PUT', '/api/settings', { token: admin.token, body: { orgName: 'Org', googleGeminiApiKey: 'AIza-REAL-KEY', aviationStackApiKey: 'av-real', brandfetchApiKey: 'bf-client-id' } });
});

test('no user, admin included, can read a stored secret key', async () => {
    for (const who of [admin, partner]) {
        const s = (await srv.api('GET', '/api/settings', { token: who.token })).json;
        assert.equal(s.googleGeminiApiKey, MASK);
        assert.equal(s.aviationStackApiKey, MASK);
        assert.equal(s.aeroDataBoxApiKey, '');
        assert.equal(s.configuredKeys.googleGeminiApiKey, true);
        assert.equal(s.brandfetchApiKey, 'bf-client-id', 'public client ids stay readable');
    }
});

test('saving settings with the mask keeps the stored key; an empty string clears it', async () => {
    await srv.api('PUT', '/api/settings', { token: admin.token, body: { orgName: 'Renamed', googleGeminiApiKey: MASK, aviationStackApiKey: '' } });
    const raw = (await srv.pool.query(`SELECT data FROM settings WHERE key = 'workspace'`)).rows[0].data;
    assert.equal(raw.googleGeminiApiKey, 'AIza-REAL-KEY');
    assert.equal(raw.aviationStackApiKey, '');
    assert.equal(raw.orgName, 'Renamed');
});

test('backups never contain secret keys', async () => {
    const backup = await srv.api('GET', '/api/backup', { token: admin.token, raw: true });
    assert.ok(!backup.text.includes('AIza-REAL-KEY'));
    assert.ok(!backup.text.includes('av-real'));
});

test('proxies use the workspace key server-side when the browser sends none (or the mask)', async () => {
    const original = global.fetch;
    let seen = '';
    global.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        if (/localhost|127\.0\.0\.1/.test(url)) return original(input, init);
        seen = url;
        return Promise.resolve(new Response(JSON.stringify({ data: [] }), { headers: { 'Content-Type': 'application/json' } }));
    };
    try {
        const r = await srv.api('GET', `/api/proxy/airports?iata_code=LHR&access_key=${encodeURIComponent(MASK)}`, { token: partner.token });
        assert.equal(r.status, 200);
        assert.match(seen, /access_key=av-real/);
    } finally { global.fetch = original; }
});

test('the AI endpoint calls Gemini with the server key and returns text', async () => {
    const original = global.fetch;
    let headers = null;
    global.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        if (/localhost|127\.0\.0\.1/.test(url)) return original(input, init);
        headers = init.headers;
        return Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Pack light.' }] } }] }), { headers: { 'Content-Type': 'application/json' } }));
    };
    try {
        const r = await srv.api('POST', '/api/ai/generate', { token: partner.token, body: { contents: [{ role: 'user', text: 'What to pack?' }] } });
        assert.equal(r.status, 200);
        assert.equal(r.json.text, 'Pack light.');
        assert.equal(headers['x-goog-api-key'], 'AIza-REAL-KEY');
    } finally { global.fetch = original; }
});

test('the AI endpoint explains a missing key', async () => {
    await srv.api('PUT', '/api/settings', { token: admin.token, body: { googleGeminiApiKey: '' } });
    const r = await srv.api('POST', '/api/ai/generate', { token: partner.token, body: { contents: [{ role: 'user', text: 'hi' }] } });
    assert.equal(r.status, 412);
    assert.match(r.json.error, /Gemini API Key/);
});

test('OpenAIP tile proxy only accepts numeric coordinates', async () => {
    const r = await srv.api('GET', '/api/proxy/openaip/1/2/..%2F..%2Fx', { token: partner.token });
    assert.equal(r.status, 400);
});
