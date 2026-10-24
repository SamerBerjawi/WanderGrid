const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { SERVICE_KEYS, testKey } = require('../keyTester.js');

const reply = (status, body = {}) => async () => ({ status, ok: status >= 200 && status < 300, json: async () => body });

describe('API key tester', () => {
  test('covers the four keyed services', () => {
    assert.deepEqual([...SERVICE_KEYS].sort(), ['aerodatabox', 'aviationstack', 'brandfetch', 'openaip']);
  });

  test('accepts a key the provider accepts, and says so without the key', async () => {
    const r = await testKey('openaip', 'secret-key', {}, reply(200));
    assert.equal(r.success, true);
    assert.ok(!JSON.stringify(r).includes('secret-key'));
  });

  test('reports a rejected key', async () => {
    const r = await testKey('openaip', 'bad', {}, reply(401));
    assert.equal(r.success, false);
    assert.match(r.message, /rejected/i);
  });

  test('OpenAIP treats an empty tile (204) as a good key', async () => {
    assert.equal((await testKey('openaip', 'k', {}, reply(204))).success, true);
  });

  test('AviationStack error objects fail even on HTTP 200', async () => {
    const r = await testKey('aviationstack', 'k', {}, reply(200, { error: { code: 'invalid_access_key', message: 'Bad key' } }));
    assert.equal(r.success, false);
    assert.equal(r.message, 'Bad key');
  });

  test('a network failure is reported, not thrown', async () => {
    const r = await testKey('brandfetch', 'k', {}, async () => { throw new Error('offline'); });
    assert.equal(r.success, false);
    assert.match(r.message, /could not be reached/);
  });

  test('no key means no request', async () => {
    let called = false;
    const r = await testKey('openaip', '', {}, async () => { called = true; return { status: 200 }; });
    assert.equal(r.success, false);
    assert.equal(called, false);
  });

  test('AeroDataBox uses the endpoint config it is given', async () => {
    let seen;
    await testKey('aerodatabox', 'k', { baseUrl: 'https://api.aerodatabox.com', authHeader: 'X-Api-Key', host: '' }, async (url, init) => { seen = { url, init }; return { status: 200, ok: true, json: async () => ({}) }; });
    assert.match(seen.url, /^https:\/\/api\.aerodatabox\.com\/airports\/iata\/LHR/);
    assert.equal(seen.init.headers['X-Api-Key'], 'k');
  });
});
