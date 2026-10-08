const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { haversineKm, normalizeProfile } = require('../routeProxy.js');

describe('P-02 Real Road Routing Proxy', () => {
  test('calculates accurate Haversine distance between coordinates', () => {
    // Paris (48.8566, 2.3522) to Lyon (45.7640, 4.8357) ~392 km great circle
    const dist = haversineKm(48.8566, 2.3522, 45.7640, 4.8357);
    assert.ok(dist >= 390 && dist <= 395, `Expected ~392 km, got ${dist}`);
  });

  test('normalizes supported routing profiles', () => {
    assert.deepEqual(normalizeProfile('car'), { profile: 'car', osrmPath: 'routed-car/route/v1/driving' });
    assert.deepEqual(normalizeProfile('driving'), { profile: 'car', osrmPath: 'routed-car/route/v1/driving' });
    assert.deepEqual(normalizeProfile('bike'), { profile: 'bike', osrmPath: 'routed-bike/route/v1/bicycle' });
    assert.deepEqual(normalizeProfile('foot'), { profile: 'foot', osrmPath: 'routed-foot/route/v1/foot' });
    assert.equal(normalizeProfile('rocket'), null);
  });
});
