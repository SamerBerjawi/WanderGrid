const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { fetchUpstream, clearUpstreamCache } = require('../upstream.js');

describe('P-00 Shared Upstream Helper', () => {
  beforeEach(() => {
    clearUpstreamCache();
  });

  test('coalesces concurrent requests to the same URL into a single upstream fetch', async () => {
    let callCount = 0;
    const mockFetch = async (url) => {
      callCount++;
      await new Promise(r => setTimeout(r, 50));
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ message: 'hello' }),
      };
    };

    const [res1, res2] = await Promise.all([
      fetchUpstream({ url: 'https://api.example.com/data', fetchImpl: mockFetch }),
      fetchUpstream({ url: 'https://api.example.com/data', fetchImpl: mockFetch }),
    ]);

    assert.equal(callCount, 1, 'Upstream should only be called once');
    assert.equal(res1.ok, true);
    assert.equal(res2.ok, true);
    assert.deepEqual(res1.data, { message: 'hello' });
    assert.deepEqual(res2.data, { message: 'hello' });
  });

  test('fresh cache returns outcome: hit without calling upstream again', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ count: callCount }),
      };
    };

    const first = await fetchUpstream({
      url: 'https://api.example.com/item',
      ttlMs: 5000,
      fetchImpl: mockFetch,
    });
    assert.equal(first.outcome, 'miss');
    assert.equal(callCount, 1);

    const second = await fetchUpstream({
      url: 'https://api.example.com/item',
      ttlMs: 5000,
      fetchImpl: mockFetch,
    });
    assert.equal(second.outcome, 'hit');
    assert.equal(second.stale, false);
    assert.equal(callCount, 1, 'Should return from cache without upstream call');
  });

  test('serves stale entry with stale: true on 5xx or transport failure', async () => {
    let shouldFail = false;
    const mockFetch = async () => {
      if (shouldFail) {
        throw new Error('Network offline');
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ temperature: 21 }),
      };
    };

    // 1. Initial success with short TTL but long stale window
    const first = await fetchUpstream({
      url: 'https://api.example.com/weather',
      ttlMs: 30, // expires in 30ms
      staleMs: 5000,
      fetchImpl: mockFetch,
    });
    assert.equal(first.ok, true);
    assert.equal(first.outcome, 'miss');

    // Wait for TTL to expire
    await new Promise(r => setTimeout(r, 60));

    // 2. Upstream goes down
    shouldFail = true;
    const staleResult = await fetchUpstream({
      url: 'https://api.example.com/weather',
      ttlMs: 30,
      staleMs: 5000,
      fetchImpl: mockFetch,
    });

    assert.equal(staleResult.ok, true);
    assert.equal(staleResult.stale, true);
    assert.equal(staleResult.outcome, 'stale');
    assert.deepEqual(staleResult.data, { temperature: 21 });
  });

  test('negative cache only on definitive 404', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      return {
        ok: false,
        status: 404,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ error: 'Not found' }),
      };
    };

    const first = await fetchUpstream({
      url: 'https://api.example.com/missing',
      negativeTtlMs: 2000,
      fetchImpl: mockFetch,
    });
    assert.equal(first.outcome, 'notfound');
    assert.equal(first.status, 404);
    assert.equal(first.answered, true);
    assert.equal(callCount, 1);

    const second = await fetchUpstream({
      url: 'https://api.example.com/missing',
      negativeTtlMs: 2000,
      fetchImpl: mockFetch,
    });
    assert.equal(second.outcome, 'notfound');
    assert.equal(callCount, 1, 'Negative cache prevented second upstream hit');
  });

  test('never caches transport errors when no stale data exists', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      throw new Error('Connection refused');
    };

    const first = await fetchUpstream({
      url: 'https://api.example.com/broken',
      fetchImpl: mockFetch,
    });
    assert.equal(first.ok, false);
    assert.equal(first.answered, false);
    assert.equal(first.outcome, 'error');

    const second = await fetchUpstream({
      url: 'https://api.example.com/broken',
      fetchImpl: mockFetch,
    });
    assert.equal(second.ok, false);
    assert.equal(callCount, 2, 'Transport error must never be cached');
  });

  test('enforces maxBytes limit', async () => {
    const hugeString = 'x'.repeat(1000);
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: async () => hugeString,
    });

    const result = await fetchUpstream({
      url: 'https://api.example.com/huge',
      maxBytes: 100, // cap at 100 bytes
      fetchImpl: mockFetch,
    });

    assert.equal(result.ok, false);
    assert.match(result.error, /exceeded/i);
  });

  test('enforces per-host rate gate minimum interval', async () => {
    const timestamps = [];
    const mockFetch = async () => {
      timestamps.push(Date.now());
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => 'ok',
      };
    };

    await Promise.all([
      fetchUpstream({ url: 'https://gated.example.com/1', hostGate: { minIntervalMs: 50 }, fetchImpl: mockFetch }),
      fetchUpstream({ url: 'https://gated.example.com/2', hostGate: { minIntervalMs: 50 }, fetchImpl: mockFetch }),
      fetchUpstream({ url: 'https://gated.example.com/3', hostGate: { minIntervalMs: 50 }, fetchImpl: mockFetch }),
    ]);

    assert.equal(timestamps.length, 3);
    const diff1 = timestamps[1] - timestamps[0];
    const diff2 = timestamps[2] - timestamps[1];
    assert.ok(diff1 >= 40, `Interval 1 (${diff1}ms) should be around 50ms`);
    assert.ok(diff2 >= 40, `Interval 2 (${diff2}ms) should be around 50ms`);
  });
});
