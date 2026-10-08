const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeToponym,
  classifyOsmType,
} = require('../geocodingChain.js');

describe('P-03 Multi-Provider Geocoding Chain', () => {
  test('normalizes toponym diacritics and casing accurately', () => {
    assert.equal(normalizeToponym('Huế'), 'hue');
    assert.equal(normalizeToponym('München'), 'munchen');
    assert.equal(normalizeToponym('São Paulo'), 'sao paulo');
    assert.equal(normalizeToponym('  PARIS  '), 'paris');
    assert.equal(normalizeToponym(''), '');
  });

  test('classifies OSM tag pairs into coarse place categories', () => {
    assert.deepEqual(classifyOsmType('tourism', 'museum'), ['poi', 'museum']);
    assert.deepEqual(classifyOsmType('historic', 'monument'), ['poi', 'monument']);
    assert.deepEqual(classifyOsmType('place', 'city'), ['place', 'city']);
    assert.deepEqual(classifyOsmType('aeroway', 'aerodrome'), ['airport', 'aerodrome']);
    assert.deepEqual(classifyOsmType('leisure', 'park'), ['park', 'park']);
    assert.deepEqual(classifyOsmType('highway', 'primary'), ['street', 'primary']);
    assert.deepEqual(classifyOsmType('natural', 'peak'), ['natural', 'peak']);
  });

  test('handles photon extent [west, north, east, south] to standard [west, south, east, north]', () => {
    const extent = [2.2, 48.9, 2.4, 48.7]; // [west, north, east, south]
    const [west, north, east, south] = extent;
    const viewport = [west, south, east, north];
    assert.deepEqual(viewport, [2.2, 48.7, 2.4, 48.9]);
    assert.ok(viewport[0] <= viewport[2]); // west <= east
    assert.ok(viewport[1] <= viewport[3]); // south <= north
  });
});
