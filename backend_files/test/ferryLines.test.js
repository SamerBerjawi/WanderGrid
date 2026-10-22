const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { chainWays, sliceBetween, pickFerryLine, resolveFerryLine, buildQuery, haversineKm } = require('../ferryLines.js');
const { createRouteService, parseSpec, decodePolyline6 } = require('../routeStore.js');

const STOCKHOLM = [18.0686, 59.3293];
const MARIEHAMN = [19.9348, 60.0973];
const HELSINKI = [24.9354, 60.1695];
const TALLINN = [24.7536, 59.4370];

// A mapped line Stockholm - Mariehamn - Helsinki - Tallinn, in three ways, the middle one drawn the other way round.
const way = (pts) => ({ type: 'way', role: '', geometry: pts.map(([lon, lat]) => ({ lat, lon })) });
const relation = (name) => ({
  type: 'relation', id: 1, tags: { route: 'ferry', name },
  members: [
    way([STOCKHOLM, [18.8, 59.55], [19.4, 59.85], MARIEHAMN]),
    way([HELSINKI, [23.5, 60.1], [22.0, 60.0], [20.8, 60.05], MARIEHAMN]),
    way([HELSINKI, [24.9, 59.9], TALLINN]),
  ],
});

describe('ferry line assembly', () => {
  test('ways are joined end to end whichever way they are drawn', () => {
    const chains = chainWays(relation('x').members.map(m => m.geometry.map(g => [g.lon, g.lat])));
    assert.equal(chains.length, 1);
    const c = chains[0];
    const ends = [c[0], c[c.length - 1]];
    assert.ok(ends.some(e => haversineKm(e, STOCKHOLM) < 0.01));
    assert.ok(ends.some(e => haversineKm(e, TALLINN) < 0.01));
  });

  test('a line that runs past the asked-for places is cut between them and oriented from the first', () => {
    const chain = chainWays(relation('x').members.map(m => m.geometry.map(g => [g.lon, g.lat])))[0];
    const part = sliceBetween(chain, STOCKHOLM, HELSINKI);
    assert.deepEqual(part[0], STOCKHOLM);
    assert.deepEqual(part[part.length - 1], HELSINKI);
    assert.ok(part.some(p => haversineKm(p, MARIEHAMN) < 0.01), 'the call at Mariehamn is on the line');
    assert.ok(!part.some(p => haversineKm(p, TALLINN) < 1), 'Tallinn is not');
    const back = sliceBetween(chain, HELSINKI, STOCKHOLM);
    assert.deepEqual(back[0], HELSINKI);
  });

  test('a place the line does not serve gives no slice', () => {
    const chain = chainWays(relation('x').members.map(m => m.geometry.map(g => [g.lon, g.lat])))[0];
    assert.equal(sliceBetween(chain, STOCKHOLM, [10.75, 59.91]), null);
  });

  test('the shortest plausible relation wins and an implausible one is rejected', () => {
    const detour = { type: 'relation', tags: { name: 'wrong' }, members: [way([STOCKHOLM, [0, 70], [40, 70], HELSINKI])] };
    const best = pickFerryLine([detour, relation('Viking Line')], STOCKHOLM, HELSINKI);
    assert.equal(best.name, 'Viking Line');
    assert.equal(pickFerryLine([detour], STOCKHOLM, HELSINKI), null);
  });

  test('the query asks for ferry relations near both ports', () => {
    const q = buildQuery(STOCKHOLM, HELSINKI);
    assert.match(q, /"route"="ferry"/);
    assert.match(q, /59\.32930,18\.06860/);
    assert.match(q, /60\.16950,24\.93540/);
  });
});

describe('ferry line lookup', () => {
  const ok = (elements) => async () => ({ ok: true, status: 200, data: { elements } });

  test('joins the lines of consecutive pairs and says "none" when one pair has no line', async () => {
    const r = await resolveFerryLine([STOCKHOLM, MARIEHAMN, HELSINKI], ok([relation('Line')]), ['h1']);
    assert.equal(r.status, 'ok');
    assert.deepEqual(r.coords[0], STOCKHOLM);
    assert.deepEqual(r.coords[r.coords.length - 1], HELSINKI);
    const none = await resolveFerryLine([STOCKHOLM, [10.75, 59.91]], ok([relation('Line')]), ['h1']);
    assert.equal(none.status, 'none');
  });

  test('falls through to the next Overpass host, and reports an error only when none answers', async () => {
    const calls = [];
    const fetchUpstream = async ({ url }) => {
      calls.push(url.split('?')[0]);
      return url.startsWith('h1') ? { ok: false, status: 504 } : { ok: true, status: 200, data: { elements: [relation('Line')] } };
    };
    const r = await resolveFerryLine([STOCKHOLM, HELSINKI], fetchUpstream, ['h1', 'h2']);
    assert.equal(r.status, 'ok');
    assert.deepEqual(calls, ['h1', 'h2']);
    const down = await resolveFerryLine([STOCKHOLM, HELSINKI], async () => ({ ok: false, status: 502 }), ['h1', 'h2']);
    assert.equal(down.status, 'error');
  });
});

describe('route store, sea mode', () => {
  const pool = () => {
    const rows = new Map();
    return {
      rows,
      async query(sql, params) {
        if (/SELECT route_key/.test(sql)) return { rows: params.filter(k => rows.has(k)).map(k => ({ route_key: k, ...rows.get(k) })) };
        if (/INSERT INTO cached_routes/.test(sql)) { rows.set(params[0], { payload: JSON.parse(params[1]), updated_at: new Date() }); return { rows: [] }; }
        throw new Error('unexpected query');
      },
    };
  };
  const res = () => { const r = { body: null, statusCode: 200 }; r.set = () => r; r.status = c => { r.statusCode = c; return r; }; r.json = b => { r.body = b; return r; }; return r; };
  const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));

  test('parseSpec accepts sea and keys it apart from road and rail', () => {
    const sea = parseSpec({ id: 'a', mode: 'sea', coords: [STOCKHOLM, HELSINKI] });
    const rail = parseSpec({ id: 'a', mode: 'rail', coords: [STOCKHOLM, HELSINKI] });
    assert.equal(sea.mode, 'sea');
    assert.notEqual(sea.key, rail.key);
  });

  test('a ferry line is resolved once, stored, then served from the database', async () => {
    const p = pool();
    let upstream = 0;
    const svc = createRouteService({ pool: p, fetchUpstream: async () => { upstream++; return { ok: true, status: 200, data: { elements: [relation('Viking Line')] } }; }, log: { error() {} } });
    const body = { routes: [{ id: 's', mode: 'sea', coords: [STOCKHOLM, HELSINKI] }] };
    let r = res();
    await svc.handleResolve({ body }, r);
    assert.equal(r.body.results.s.status, 'pending');
    await tick(100);
    r = res();
    await svc.handleResolve({ body }, r);
    assert.equal(r.body.results.s.status, 'ok');
    assert.match(r.body.results.s.attribution, /Viking Line/);
    const pts = decodePolyline6(r.body.results.s.geometry);
    assert.ok(pts.length >= 3);
    const calls = upstream;
    r = res();
    await svc.handleResolve({ body }, r);
    assert.equal(upstream, calls, 'the stored answer is not fetched again');
  });

  test('no mapped ferry is remembered as none, so it is not asked again', async () => {
    const p = pool();
    let upstream = 0;
    const svc = createRouteService({ pool: p, fetchUpstream: async () => { upstream++; return { ok: true, status: 200, data: { elements: [] } }; }, log: { error() {} } });
    const body = { routes: [{ id: 's', mode: 'sea', coords: [STOCKHOLM, HELSINKI] }] };
    await svc.handleResolve({ body }, res());
    await tick(100);
    const r = res();
    await svc.handleResolve({ body }, r);
    assert.equal(r.body.results.s.status, 'none');
    const calls = upstream;
    await svc.handleResolve({ body }, res());
    assert.equal(upstream, calls);
  });

  test('an Overpass outage is a transient error and is not stored', async () => {
    const p = pool();
    const svc = createRouteService({ pool: p, fetchUpstream: async () => ({ ok: false, status: 504 }), log: { error() {} } });
    const body = { routes: [{ id: 's', mode: 'sea', coords: [STOCKHOLM, HELSINKI] }] };
    await svc.handleResolve({ body }, res());
    await tick(100);
    const r = res();
    await svc.handleResolve({ body }, r);
    assert.equal(r.body.results.s.status, 'error');
    assert.equal(p.rows.size, 0);
  });
});

describe('real OpenStreetMap data', () => {
  const fixture = require('./fixtures/overpass-ferry-stockholm-helsinki.json');

  test('Stockholm to Helsinki follows the mapped Viking or Silja line through Mariehamn', () => {
    const best = pickFerryLine(fixture.elements, STOCKHOLM, HELSINKI);
    assert.ok(best, 'a line is found');
    assert.match(best.name, /Stockholm => Mariehamn => Helsinki|Helsinki => Mariehamn => Stockholm/);
    assert.ok(best.points.some(p => haversineKm(p, MARIEHAMN) < 6), 'it calls at Mariehamn');
    const straight = haversineKm(STOCKHOLM, HELSINKI);
    assert.ok(best.km > straight && best.km < straight * 1.6, `a sailed line of ${best.km.toFixed(0)} km against ${straight.toFixed(0)} km straight`);
    assert.deepEqual(best.points[0], STOCKHOLM);
    assert.deepEqual(best.points[best.points.length - 1], HELSINKI);
  });

  test('the same line, asked from the other end, runs from Helsinki', () => {
    const best = pickFerryLine(fixture.elements, HELSINKI, STOCKHOLM);
    assert.deepEqual(best.points[0], HELSINKI);
  });

  test('Stockholm to Mariehamn alone is the first part of it', () => {
    const best = pickFerryLine(fixture.elements, STOCKHOLM, MARIEHAMN);
    assert.ok(best);
    assert.ok(best.km < 300);
  });
});
