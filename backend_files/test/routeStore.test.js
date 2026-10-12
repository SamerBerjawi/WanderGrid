const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createRouteService, parseSpec, simplify, encodePolyline6, decodePolyline6, RAIL_PROFILES } = require('../routeStore.js');

// In-memory stand-in for the cached_routes table.
function fakePool() {
  const rows = new Map();
  return {
    rows,
    async query(sql, params) {
      if (/SELECT route_key/.test(sql)) {
        return { rows: params.filter(k => rows.has(k)).map(k => ({ route_key: k, ...rows.get(k) })) };
      }
      if (/INSERT INTO cached_routes/.test(sql)) {
        rows.set(params[0], { payload: JSON.parse(params[1]), updated_at: new Date() });
        return { rows: [] };
      }
      throw new Error('unexpected query');
    },
  };
}

const res = () => {
  const r = { headers: {}, body: null, statusCode: 200 };
  r.set = (k, v) => { r.headers[k] = v; return r; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};
const tick = (ms = 10) => new Promise(r => setTimeout(r, ms));
const line = Array.from({ length: 50 }, (_, i) => [4 + i * 0.01, 52 + i * 0.01]);
const railBody = { paths: [{ distance: 500000, time: 3600000, points: { coordinates: line } }] };

describe('route store geometry helpers', () => {
  test('polyline6 round-trips', () => {
    const pts = [[4.9, 52.37], [2.35, 48.85], [-0.12, 51.5]];
    const back = decodePolyline6(encodePolyline6(pts));
    back.forEach((p, i) => { assert.ok(Math.abs(p[0] - pts[i][0]) < 1e-6 && Math.abs(p[1] - pts[i][1]) < 1e-6); });
  });

  test('simplify keeps endpoints and drops collinear points', () => {
    const out = simplify(line);
    assert.deepEqual(out[0], line[0]);
    assert.deepEqual(out[out.length - 1], line[line.length - 1]);
    assert.ok(out.length < 5);
  });

  test('parseSpec validates and builds a stable key', () => {
    const a = parseSpec({ id: 'a', mode: 'rail', coords: [[4.90001, 52.37], [2.35, 48.85]] });
    const b = parseSpec({ id: 'b', mode: 'rail', coords: [[4.90002, 52.37], [2.35, 48.85]] });
    assert.equal(a.key, b.key, 'sub-11m differences share one cache entry');
    assert.ok(parseSpec({ id: 'x', mode: 'plane', coords: [[0, 0], [1, 1]] }).error);
    assert.ok(parseSpec({ id: 'x', mode: 'rail', coords: [[0, 0]] }).error);
    assert.ok(parseSpec({ id: 'x', mode: 'rail', coords: [[0, 0], [999, 1]] }).error);
  });
});

describe('route store resolution', () => {
  test('rail ladder falls through profiles and the result is persisted then served from the database', async () => {
    const pool = fakePool();
    const calls = [];
    const fetchUpstream = async ({ url }) => {
      calls.push(url);
      if (url.includes('profile=all_tracks&')) return { ok: false, status: 400, data: { message: 'Connection between locations not found' } };
      if (url.includes('profile=non_tgv')) return { ok: true, status: 200, data: railBody };
      return { ok: false, status: 400, data: null };
    };
    const svc = createRouteService({ pool, fetchUpstream, log: { error() {} } });
    const body = { routes: [{ id: 't1', mode: 'rail', coords: [[4.9, 52.37], [13.4, 52.52]] }] };

    const r1 = res();
    await svc.handleResolve({ body }, r1);
    assert.equal(r1.body.results.t1.status, 'pending');
    await tick(30);

    const r2 = res();
    const before = calls.length;
    await svc.handleResolve({ body }, r2);
    assert.equal(r2.body.results.t1.status, 'ok');
    assert.ok(typeof r2.body.results.t1.geometry === 'string');
    assert.equal(calls.length, before, 'served from the store, no upstream call');
    assert.equal(calls.length, 2, 'all_tracks failed, non_tgv succeeded');
  });

  test('a leg with no rail connection falls back to the road network, flagged approximate', async () => {
    const pool = fakePool();
    const roadBody = { code: 'Ok', routes: [{ distance: 280000, duration: 11000, geometry: { coordinates: line } }] };
    const fetchUpstream = async ({ url }) => {
      if (url.includes('openrailrouting')) return { ok: false, status: 400, data: { message: 'Connection between locations not found' } };
      return { ok: true, status: 200, data: roadBody };
    };
    const svc = createRouteService({ pool, fetchUpstream, log: { error() {} } });
    const body = { routes: [{ id: 'rf', mode: 'rail', coords: [[12.5, 41.9], [11.25, 43.77]] }] };
    await svc.handleResolve({ body }, res());
    await tick(30);
    const r = res();
    await svc.handleResolve({ body }, r);
    assert.equal(r.body.results.rf.status, 'ok');
    assert.equal(r.body.results.rf.approximate, true);
  });

  test('a definitive failure on both rail and road is remembered as none and never asked again', async () => {
    const pool = fakePool();
    let calls = 0;
    const fetchUpstream = async () => { calls++; return { ok: false, status: 400, data: { message: 'Cannot find point 0' } }; };
    const svc = createRouteService({ pool, fetchUpstream, log: { error() {} } });
    const body = { routes: [{ id: 'n', mode: 'rail', coords: [[35.5, 33.89], [35.83, 34.43]] }] };
    await svc.handleResolve({ body }, res());
    await tick(30);
    const afterFirst = calls;
    assert.ok(afterFirst >= RAIL_PROFILES.length);
    const r = res();
    await svc.handleResolve({ body }, r);
    assert.equal(r.body.results.n.status, 'none');
    assert.equal(calls, afterFirst);
  });

  test('transient upstream failure is not persisted and backs off', async () => {
    const pool = fakePool();
    let calls = 0;
    const fetchUpstream = async () => { calls++; return { ok: false, status: 503, data: null }; };
    const svc = createRouteService({ pool, fetchUpstream, log: { error() {} } });
    const body = { routes: [{ id: 'e', mode: 'road', coords: [[4.9, 52.37], [2.35, 48.85]] }] };
    await svc.handleResolve({ body }, res());
    await tick(30);
    assert.equal(pool.rows.size, 0, 'nothing persisted');
    const callsAfter = calls;
    const r = res();
    await svc.handleResolve({ body }, r);
    assert.equal(r.body.results.e.status, 'error');
    assert.equal(calls, callsAfter, 'backoff window prevents hammering');
  });

  test('identical concurrent requests share one resolution', async () => {
    const pool = fakePool();
    let calls = 0;
    const fetchUpstream = async () => { calls++; await tick(15); return { ok: true, status: 200, data: railBody }; };
    const svc = createRouteService({ pool, fetchUpstream, log: { error() {} } });
    const body = { routes: [
      { id: 'a', mode: 'rail', coords: [[4.9, 52.37], [2.35, 48.85]] },
      { id: 'b', mode: 'rail', coords: [[4.9, 52.37], [2.35, 48.85]] },
    ] };
    await svc.handleResolve({ body }, res());
    await tick(60);
    assert.equal(calls, 1);
  });

  test('rejects oversized batches and bad bodies', async () => {
    const svc = createRouteService({ pool: fakePool(), fetchUpstream: async () => ({}), log: { error() {} } });
    const r1 = res();
    await svc.handleResolve({ body: {} }, r1);
    assert.equal(r1.statusCode, 400);
    const r2 = res();
    await svc.handleResolve({ body: { routes: Array.from({ length: 101 }, (_, i) => ({ id: String(i) })) } }, r2);
    assert.equal(r2.statusCode, 400);
  });
});
