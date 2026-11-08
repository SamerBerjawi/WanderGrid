const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { clearUpstreamCache } = require('../upstream.js');
const { getRate, parseRate } = require('../fxRates.js');

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: new Headers({ 'content-type': 'application/json' }), text: async () => JSON.stringify(body) });
const recorder = (status, body) => { const calls = []; const fn = async url => { calls.push(url); return json(status, body); }; fn.calls = calls; return fn; };
const NOW = () => '2026-11-07';

describe('exchange rates', () => {
  beforeEach(() => clearUpstreamCache());

  test('reads a Frankfurter answer', () => {
    assert.deepEqual(parseRate({ amount: 1, base: 'EUR', date: '2026-03-05', rates: { USD: 1.0821 } }, 'usd'), { date: '2026-03-05', rate: 1.0821 });
    assert.equal(parseRate({ date: '2026-03-05', rates: {} }, 'USD'), null);
    assert.equal(parseRate({ date: '2026-03-05', rates: { USD: 0 } }, 'USD'), null);
    assert.equal(parseRate({ date: 'soon', rates: { USD: 1.1 } }, 'USD'), null);
    assert.equal(parseRate(null, 'USD'), null);
  });

  test('asks for the day, and returns the date the rate is for (a weekend gets Friday)', async () => {
    const fetchImpl = recorder(200, { base: 'EUR', date: '2026-03-06', rates: { USD: 1.09 } });
    const r = await getRate('2026-03-07', 'eur', 'usd', { fetchImpl, now: NOW });
    assert.deepEqual(r, { ok: true, from: 'EUR', to: 'USD', date: '2026-03-06', rate: 1.09 });
    assert.equal(fetchImpl.calls.length, 1);
    assert.match(fetchImpl.calls[0], /api\.frankfurter\.dev\/v1\/2026-03-07\?base=EUR&symbols=USD/);
  });

  test('uses the latest rate for today and for a day that has not come', async () => {
    const fetchImpl = recorder(200, { base: 'EUR', date: '2026-11-06', rates: { GBP: 0.87 } });
    await getRate('2026-11-07', 'EUR', 'GBP', { fetchImpl, now: NOW });
    await getRate('2027-01-01', 'EUR', 'GBP', { fetchImpl, now: NOW });
    assert.match(fetchImpl.calls[0], /frankfurter\.dev\/v1\/latest\?base=EUR&symbols=GBP/);
    // Both ask for "latest", so the second is answered from the cache.
    assert.equal(fetchImpl.calls.length, 1);
  });

  test('a rate for a past day is fetched once', async () => {
    const fetchImpl = recorder(200, { base: 'EUR', date: '2026-03-05', rates: { JPY: 160.2 } });
    const a = await getRate('2026-03-05', 'EUR', 'JPY', { fetchImpl, now: NOW });
    const b = await getRate('2026-03-05', 'EUR', 'JPY', { fetchImpl, now: NOW });
    assert.equal(a.rate, 160.2);
    assert.deepEqual(a, b);
    assert.equal(fetchImpl.calls.length, 1);
  });

  test('the same currency is 1 and asks nobody', async () => {
    const fetchImpl = recorder(500, {});
    const r = await getRate('2026-03-05', 'EUR', 'eur', { fetchImpl, now: NOW });
    assert.deepEqual(r, { ok: true, from: 'EUR', to: 'EUR', date: '2026-03-05', rate: 1 });
    assert.equal(fetchImpl.calls.length, 0);
  });

  test('rejects a bad date or currency before asking anyone', async () => {
    const fetchImpl = recorder(200, {});
    assert.equal((await getRate('05/03/2026', 'EUR', 'USD', { fetchImpl })).status, 400);
    assert.equal((await getRate('2026-02-30x', 'EUR', 'USD', { fetchImpl })).status, 400);
    assert.equal((await getRate('2026-03-05', 'EURO', 'USD', { fetchImpl })).status, 400);
    assert.equal((await getRate('2026-03-05', 'EUR', '../', { fetchImpl })).status, 400);
    assert.equal(fetchImpl.calls.length, 0);
  });

  test('says 404 for a currency it has no rate for, 502 when it cannot be reached or answers nonsense', async () => {
    const missing = await getRate('2026-03-05', 'EUR', 'XYZ', { fetchImpl: recorder(404, { message: 'not found' }), now: NOW });
    assert.equal(missing.status, 404);
    assert.match(missing.error, /by hand/);
    clearUpstreamCache();
    const down = await getRate('2026-03-05', 'EUR', 'USD', { fetchImpl: recorder(503, {}), now: NOW });
    assert.equal(down.status, 502);
    clearUpstreamCache();
    const junk = await getRate('2026-03-05', 'EUR', 'USD', { fetchImpl: recorder(200, { hello: 'world' }), now: NOW });
    assert.equal(junk.status, 502);
  });
});
