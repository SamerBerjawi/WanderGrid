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
    await srv.api('PUT', '/api/settings', { token: admin.token, body: { orgName: 'Org', aviationStackApiKey: 'av-real', brandfetchApiKey: 'bf-client-id' } });
});

test('no user, admin included, can read a stored secret key', async () => {
    for (const who of [admin, partner]) {
        const s = (await srv.api('GET', '/api/settings', { token: who.token })).json;
        assert.equal(s.aviationStackApiKey, MASK);
        assert.equal(s.aeroDataBoxApiKey, '');
        assert.equal(s.configuredKeys.aviationStackApiKey, true);
        assert.equal(s.brandfetchApiKey, 'bf-client-id', 'public client ids stay readable');
    }
});

test('saving settings with the mask keeps the stored key; an empty string clears it', async () => {
    await srv.api('PUT', '/api/settings', { token: admin.token, body: { orgName: 'Renamed', aviationStackApiKey: MASK, aeroDataBoxApiKey: 'adb-real' } });
    const raw = (await srv.pool.query(`SELECT data FROM settings WHERE key = 'workspace'`)).rows[0].data;
    assert.equal(raw.aviationStackApiKey, 'av-real');
    assert.equal(raw.aeroDataBoxApiKey, 'adb-real');
    await srv.api('PUT', '/api/settings', { token: admin.token, body: { aviationStackApiKey: '' } });
    const cleared = (await srv.pool.query(`SELECT data FROM settings WHERE key = 'workspace'`)).rows[0].data;
    assert.equal(cleared.aviationStackApiKey, '');
    assert.equal(raw.orgName, 'Renamed');
});

test('backups never contain secret keys', async () => {
    const backup = await srv.api('GET', '/api/backup', { token: admin.token, raw: true });
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

test('OpenAIP tile proxy only accepts numeric coordinates', async () => {
    const r = await srv.api('GET', '/api/proxy/openaip/1/2/..%2F..%2Fx', { token: partner.token });
    assert.equal(r.status, 400);
});

test('settings say where each key comes from, without the key', async () => {
    const s = (await srv.api('GET', '/api/settings', { token: admin.token })).json;
    assert.equal(s.keySources.aviationStackApiKey, 'workspace');
    assert.equal(s.keySources.aeroDataBoxApiKey, 'none');
    assert.deepEqual(Object.keys(s.keySources).sort(), ['aeroDataBoxApiKey', 'aviationStackApiKey', 'openAipApiKey']);
    assert.ok(!JSON.stringify(s).includes('av-real'));
});

test('testing a stored key is for admins and never returns the key', async () => {
    const denied = await srv.api('POST', '/api/integrations/test-key/aviationstack', { token: partner.token });
    assert.equal(denied.status, 403);
    const original = global.fetch;
    let sent = '';
    global.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        if (/localhost|127\.0\.0\.1/.test(url)) return original(input, init);
        sent = url + JSON.stringify(init?.headers || {});
        return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    };
    try {
        const r = await srv.api('POST', '/api/integrations/test-key/aviationstack', { token: admin.token });
        assert.equal(r.status, 200);
        assert.equal(r.json.success, true);
        assert.match(sent, /av-real/, 'the stored key is used upstream');
        assert.ok(!JSON.stringify(r.json).includes('av-real'));
        const unknown = await srv.api('POST', '/api/integrations/test-key/nope', { token: admin.token });
        assert.equal(unknown.status, 400);
    } finally { global.fetch = original; }
});

test('the removed AI endpoint is gone', async () => {
    const r = await srv.api('POST', '/api/ai/generate', { token: partner.token, body: { contents: [{ role: 'user', text: 'hi' }] } });
    assert.equal(r.status, 404);
    const gone = await srv.api('POST', '/api/integrations/test-key/gemini', { token: admin.token });
    assert.equal(gone.status, 400);
});

test('keys of removed integrations in old settings and backups are ignored, never echoed, dropped on save', async () => {
    const legacy = { orgName: 'Old', aviationStackApiKey: 'av-real', googleGeminiApiKey: 'AIza-OLD-KEY', cartoApiKey: 'carto-old-key' };
    await srv.pool.query(`INSERT INTO settings (key, data) VALUES ('workspace', $1) ON CONFLICT (key) DO UPDATE SET data = $1`, [JSON.stringify(legacy)]);
    const s = await srv.api('GET', '/api/settings', { token: partner.token });
    assert.equal(s.status, 200);
    assert.equal(s.json.orgName, 'Old');
    assert.ok(!/AIza-OLD-KEY|carto-old-key/.test(JSON.stringify(s.json)), 'old keys are not sent to clients');
    const backup = await srv.api('GET', '/api/backup', { token: admin.token, raw: true });
    assert.ok(!/AIza-OLD-KEY|carto-old-key/.test(backup.text), 'old keys are not exported');
    // A client that still sends them back: accepted, and not stored.
    const put = await srv.api('PUT', '/api/settings', { token: admin.token, body: { ...s.json, orgName: 'New', googleGeminiApiKey: 'AIza-OLD-KEY' } });
    assert.equal(put.status, 200);
    const raw = (await srv.pool.query(`SELECT data FROM settings WHERE key = 'workspace'`)).rows[0].data;
    assert.equal(raw.orgName, 'New');
    assert.equal(raw.aviationStackApiKey, 'av-real');
    assert.ok(!('googleGeminiApiKey' in raw) && !('cartoApiKey' in raw));
});
