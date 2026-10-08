const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { PROVIDER_CONFIGS, testProvider } = require('../integrationsTester.js');

describe('P-06 Integrations Provider Tester', () => {
  test('defines valid test configs for all five core GEV providers', () => {
    const requiredKeys = ['adsbdb', 'osrm', 'geocoding', 'openfreemap', 'gibs'];
    for (const key of requiredKeys) {
      assert.ok(PROVIDER_CONFIGS[key], `Provider config for ${key} should exist`);
      assert.ok(typeof PROVIDER_CONFIGS[key].name === 'string', `${key} must have name`);
      assert.ok(typeof PROVIDER_CONFIGS[key].getUrl() === 'string', `${key} must have getUrl()`);
      assert.ok(PROVIDER_CONFIGS[key].timeoutMs > 0, `${key} must have timeoutMs`);
    }
  });

  test('reports success and latency when provider responds with HTTP 200', async () => {
    const mockFetch = async () => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: { ok: true }
    });

    const res = await testProvider('adsbdb', mockFetch);
    assert.equal(res.provider, 'adsbdb');
    assert.equal(res.success, true);
    assert.equal(res.status, 200);
    assert.ok(res.latencyMs >= 0);
    assert.match(res.message, /operational/i);
  });

  test('reports failure when provider responds with HTTP 500', async () => {
    const mockFetch = async () => ({
      status: 500,
      headers: { 'content-type': 'application/json' },
      data: null
    });

    const res = await testProvider('osrm', mockFetch);
    assert.equal(res.provider, 'osrm');
    assert.equal(res.success, false);
    assert.equal(res.status, 500);
    assert.match(res.message, /returned HTTP 500/i);
  });

  test('throws error for unknown provider', async () => {
    await assert.rejects(
      async () => testProvider('non_existent_provider'),
      /Unknown provider: non_existent_provider/
    );
  });
});
