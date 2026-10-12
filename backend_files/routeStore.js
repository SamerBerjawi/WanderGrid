/**
 * Persistent road & rail route resolver.
 *
 * Why this exists: tracing routes used to be done by the browser, one request per transport, straight against
 * public routing hosts. Results lived only in RAM / localStorage, so every device and every session paid for
 * the same routes again, and failures that can never succeed (no rail connection) were retried every time.
 *
 * Here a route is resolved once, by the server, and stored in `cached_routes`:
 *   - 'ok'   geometry kept (simplified, polyline6-encoded) and served from the database from then on;
 *   - 'none' upstream definitively has no route: remembered for NONE_TTL so nobody asks again;
 *   - transient failures (timeouts, 5xx, 429) are never persisted, only briefly backed off.
 * Misses are resolved by a small background queue, so one batch request returns immediately with whatever is
 * known and the client polls only for what is still pending.
 */

const crypto = require('crypto');
const { normalizeProfile, haversineKm } = require('./routeProxy');

// Rail graphs are split by gauge/service: a pair unreachable on one profile is often fine on another
// (measured: Madrid-Barcelona, Amsterdam-Berlin, Rome-Venice, Sydney-Melbourne fail on all_tracks alone).
const RAIL_PROFILES = ['all_tracks', 'non_tgv', 'tgv_all', 'all_tracks_1435'];

const KEY_VERSION = 'rt1';
const OK_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const NONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TRANSIENT_BACKOFF_MS = 45 * 1000;
const MAX_ROUTES_PER_BATCH = 100;
const MAX_QUEUE = 500;
const WORKERS = 4;
const MAX_TOTAL_KM = 10000;
const SIMPLIFY_TOLERANCE_DEG = 0.00012; // ~13 m: invisible on screen, large saving on long routes
const UPSTREAM_TIMEOUT_MS = 12000;

// --- geometry helpers ---------------------------------------------------------------------------------

/** Iterative Douglas-Peucker on [lng, lat] points (no recursion: long routes have 50k+ vertices). */
function simplify(points, tolerance = SIMPLIFY_TOLERANCE_DEG) {
  const n = points.length;
  if (n <= 2) return points.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  const tol2 = tolerance * tolerance;
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      let d2;
      if (len2 === 0) {
        d2 = (px - ax) ** 2 + (py - ay) ** 2;
      } else {
        let t = ((px - ax) * dx + (py - ay) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        d2 = (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2;
      }
      if (d2 > maxD) { maxD = d2; idx = i; }
    }
    if (idx !== -1 && maxD > tol2) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i]);
  return out;
}

/** Google-style polyline at 1e6 precision. Input [lng, lat] pairs. */
function encodePolyline6(points) {
  let prevLat = 0;
  let prevLng = 0;
  let out = '';
  const push = (value) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    while (v >= 0x20) {
      out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    out += String.fromCharCode(v + 63);
  };
  for (const [lng, lat] of points) {
    const la = Math.round(lat * 1e6);
    const lo = Math.round(lng * 1e6);
    push(la - prevLat);
    push(lo - prevLng);
    prevLat = la;
    prevLng = lo;
  }
  return out;
}

function decodePolyline6(str) {
  let index = 0, lat = 0, lng = 0;
  const out = [];
  while (index < str.length) {
    let b, shift = 0, result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    out.push([lng / 1e6, lat / 1e6]);
  }
  return out;
}

// --- request normalisation -----------------------------------------------------------------------------

function parseSpec(raw) {
  if (!raw || typeof raw !== 'object') return { error: 'route must be an object' };
  const id = String(raw.id ?? '').slice(0, 200);
  if (!id) return { error: 'route id required' };
  const mode = raw.mode === 'rail' ? 'rail' : raw.mode === 'road' ? 'road' : null;
  if (!mode) return { id, error: "mode must be 'road' or 'rail'" };
  if (!Array.isArray(raw.coords) || raw.coords.length < 2 || raw.coords.length > 25) {
    return { id, error: 'coords must hold 2-25 points' };
  }
  const coords = [];
  for (const c of raw.coords) {
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return { id, error: 'coordinates out of bounds' };
    }
    coords.push([Math.round(lng * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4]); // ~11 m: the cache granularity
  }
  let profile = 'rail';
  if (mode === 'road') {
    const p = normalizeProfile(raw.profile || 'car');
    if (!p) return { id, error: 'invalid profile' };
    profile = p.profile;
  }
  const hash = crypto.createHash('sha1').update(coords.map(c => c.join(',')).join(';')).digest('hex');
  return { id, mode, profile, coords, key: `${KEY_VERSION}:${mode}:${profile}:${hash}` };
}

// --- upstream resolution -------------------------------------------------------------------------------

const toResult = (geometry, distanceKm, durationMin, attribution, profile) => ({
  status: 'ok', geometry, distanceKm, durationMin, attribution, profile,
});

function createRouteService({ pool, fetchUpstream, now = Date.now, log = console }) {
  const inFlight = new Map();      // key -> Promise<result>
  const backoff = new Map();       // key -> retry-after timestamp (transient failures)
  const queue = [];
  let active = 0;

  async function resolveRoad(spec) {
    const p = normalizeProfile(spec.profile);
    const coordsString = spec.coords.map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(';');
    const demoProfile = p.profile === 'bike' ? 'bicycle' : p.profile === 'foot' ? 'foot' : 'driving';
    const attempts = [
      {
        name: 'fossgis',
        url: `https://routing.openstreetmap.de/${p.osrmPath}/${coordsString}?overview=full&geometries=geojson&alternatives=false&steps=false`,
        attribution: '© OpenStreetMap contributors · routing by FOSSGIS',
        parse: d => (d?.code === 'Ok' && d.routes?.[0]?.geometry?.coordinates?.length
          ? { coords: d.routes[0].geometry.coordinates, km: d.routes[0].distance / 1000, min: d.routes[0].duration / 60 } : null),
      },
      {
        name: 'osrm-demo',
        url: `https://router.project-osrm.org/route/v1/${demoProfile}/${coordsString}?overview=full&geometries=geojson&alternatives=false&steps=false`,
        attribution: '© OpenStreetMap contributors, OSRM',
        parse: d => (d?.code === 'Ok' && d.routes?.[0]?.geometry?.coordinates?.length
          ? { coords: d.routes[0].geometry.coordinates, km: d.routes[0].distance / 1000, min: d.routes[0].duration / 60 } : null),
      },
      {
        name: 'valhalla',
        url: `https://valhalla1.openstreetmap.de/route?json=${encodeURIComponent(JSON.stringify({
          locations: spec.coords.map(([lon, lat]) => ({ lat, lon })), costing: p.costing,
        }))}`,
        attribution: '© OpenStreetMap contributors · routing by FOSSGIS (Valhalla)',
        parse: d => {
          const legs = d?.trip?.legs;
          if (!Array.isArray(legs) || !legs.length) return null;
          let all = [];
          for (const leg of legs) if (leg.shape) all = all.concat(decodePolyline6(leg.shape));
          return all.length > 2 ? { coords: all, km: d.trip.summary?.length || 0, min: (d.trip.summary?.time || 0) / 60 } : null;
        },
      },
    ];

    let transient = false;
    for (const a of attempts) {
      const r = await fetchUpstream({
        key: `rs:${a.name}:${p.profile}:${coordsString}`,
        url: a.url,
        ttlMs: 0,
        staleMs: 0,
        cacheResult: false,
        timeoutMs: UPSTREAM_TIMEOUT_MS,
        maxBytes: 16 * 1024 * 1024,
        hostGate: { minIntervalMs: 250 },
        negativeTtlMs: 0,
      });
      if (r.ok) {
        const parsed = a.parse(r.data);
        if (parsed && parsed.coords.length > 2) {
          const simple = simplify(parsed.coords.map(c => [c[0], c[1]]));
          return toResult(encodePolyline6(simple), Math.round(parsed.km * 10) / 10, Math.round(parsed.min), a.attribution, p.profile);
        }
        continue; // answered without a usable route (NoRoute etc.): ask the next engine
      }
      // 4xx other than 404 is the engine rejecting this input: keep trying the next engine, not transient.
      if (!(r.status >= 400 && r.status < 500 && r.status !== 429)) transient = true;
    }
    return transient
      ? { status: 'error', reason: 'upstream_unavailable' }
      : { status: 'none', reason: 'no_route' };
  }

  async function resolveRail(spec) {
    const ghPoints = spec.coords.map(([lng, lat]) => `point=${lat.toFixed(5)},${lng.toFixed(5)}`).join('&');
    let transient = false;
    for (const profile of RAIL_PROFILES) {
      const r = await fetchUpstream({
        key: `rs:rail:${profile}:${ghPoints}`,
        url: `https://routing.openrailrouting.org/route?${ghPoints}&profile=${profile}&points_encoded=false`,
        ttlMs: 0,
        staleMs: 0,
        cacheResult: false,
        timeoutMs: UPSTREAM_TIMEOUT_MS,
        maxBytes: 16 * 1024 * 1024,
        hostGate: { minIntervalMs: 250 },
        negativeTtlMs: 0,
      });
      if (r.ok) {
        const path = r.data?.paths?.[0];
        const coords = path?.points?.coordinates;
        if (Array.isArray(coords) && coords.length > 2) {
          const simple = simplify(coords.map(c => [c[0], c[1]]));
          return toResult(encodePolyline6(simple), Math.round((path.distance / 1000) * 10) / 10,
            Math.round((path.time || 0) / 60000), '© OpenStreetMap contributors · OpenRailRouting (GraphHopper)', profile);
        }
        continue;
      }
      // 400 = "Connection between locations not found" / "Cannot find point": this profile can't, try the next.
      if (r.status === 400 || r.status === 404) continue;
      transient = true;
    }
    if (transient) return { status: 'error', reason: 'upstream_unavailable' };

    // The rail graph has no connection (gaps in OpenRailRouting's data are common: e.g. Rome-Florence,
    // Tokyo-Kyoto). Trace the corridor along the road network instead, flagged as approximate, so a rail leg
    // still follows real geography rather than disappearing. This is what the map showed before the proxy rewrite.
    const road = await resolveRoad({ ...spec, mode: 'road', profile: 'car' });
    if (road.status === 'ok') {
      return {
        ...road,
        approximate: true,
        profile: 'road-approximation',
        attribution: '© OpenStreetMap contributors · approximated along roads (no rail connection in the rail network)',
      };
    }
    return road.status === 'error' ? road : { status: 'none', reason: 'no_rail_connection' };
  }

  async function persist(spec, result) {
    try {
      await pool.query(
        `INSERT INTO cached_routes (route_key, payload, updated_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (route_key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = CURRENT_TIMESTAMP`,
        [spec.key, JSON.stringify(result)]
      );
    } catch (err) {
      log.error('[RouteStore] failed to persist route:', err.message);
    }
  }

  async function resolveAndStore(spec) {
    let total = 0;
    for (let i = 1; i < spec.coords.length; i++) {
      total += haversineKm(spec.coords[i - 1][1], spec.coords[i - 1][0], spec.coords[i][1], spec.coords[i][0]);
    }
    if (total > MAX_TOTAL_KM) {
      const none = { status: 'none', reason: 'too_long' };
      await persist(spec, none);
      return none;
    }
    let result;
    try {
      result = spec.mode === 'rail' ? await resolveRail(spec) : await resolveRoad(spec);
    } catch (err) {
      log.error('[RouteStore] resolve failed:', err.message);
      result = { status: 'error', reason: 'internal' };
    }
    if (result.status === 'error') {
      backoff.set(spec.key, now() + TRANSIENT_BACKOFF_MS);
      return result;
    }
    backoff.delete(spec.key);
    await persist(spec, result);
    return result;
  }

  function pump() {
    while (active < WORKERS && queue.length) {
      const job = queue.shift();
      active++;
      resolveAndStore(job.spec)
        .then(job.resolve, job.reject)
        .finally(() => {
          active--;
          inFlight.delete(job.spec.key);
          pump();
        });
    }
  }

  /** Start resolving unless it is already running; returns false when the queue is saturated. */
  function enqueue(spec) {
    if (inFlight.has(spec.key)) return true;
    if (queue.length >= MAX_QUEUE) return false;
    const promise = new Promise((resolve, reject) => queue.push({ spec, resolve, reject }));
    promise.catch(() => {});
    inFlight.set(spec.key, promise);
    pump();
    return true;
  }

  const view = (payload) => {
    if (payload.status !== 'ok') return { status: payload.status, reason: payload.reason };
    return {
      status: 'ok',
      geometry: payload.geometry,
      distanceKm: payload.distanceKm,
      durationMin: payload.durationMin,
      attribution: payload.attribution,
      approximate: payload.approximate === true ? true : undefined,
    };
  };

  async function lookup(keys) {
    const found = new Map();
    if (!keys.length) return found;
    try {
      // IN (...) rather than = ANY($1): identical on PostgreSQL, and also works on the in-memory test database.
      const res = await pool.query(
        `SELECT route_key, payload, updated_at FROM cached_routes WHERE route_key IN (${keys.map((_, i) => `$${i + 1}`).join(',')})`,
        keys
      );
      for (const row of res.rows) found.set(row.route_key, row);
    } catch (err) {
      log.error('[RouteStore] lookup failed:', err.message);
    }
    return found;
  }

  /** POST /api/proxy/routes/resolve */
  async function handleResolve(req, res) {
    const list = Array.isArray(req.body?.routes) ? req.body.routes : null;
    if (!list) return res.status(400).json({ error: 'routes array required' });
    if (list.length > MAX_ROUTES_PER_BATCH) {
      return res.status(400).json({ error: `At most ${MAX_ROUTES_PER_BATCH} routes per request` });
    }

    const results = {};
    const specs = [];
    for (const raw of list) {
      const spec = parseSpec(raw);
      if (spec.error) {
        if (spec.id) results[spec.id] = { status: 'none', reason: spec.error };
        continue;
      }
      specs.push(spec);
    }

    const cached = await lookup(specs.map(s => s.key));
    const t = now();
    for (const spec of specs) {
      const row = cached.get(spec.key);
      if (row) {
        const age = t - new Date(row.updated_at).getTime();
        const payload = row.payload || {};
        if (payload.status === 'ok' && age < OK_TTL_MS) { results[spec.id] = view(payload); continue; }
        if (payload.status === 'none' && age < NONE_TTL_MS) { results[spec.id] = view(payload); continue; }
      }
      if ((backoff.get(spec.key) || 0) > t) {
        results[spec.id] = { status: 'error', reason: 'upstream_unavailable' };
        continue;
      }
      results[spec.id] = enqueue(spec) ? { status: 'pending' } : { status: 'error', reason: 'busy' };
    }

    res.set('Cache-Control', 'no-store');
    return res.json({ results });
  }

  return { handleResolve, parseSpec, _internals: { enqueue, inFlight, queue } };
}

module.exports = {
  createRouteService,
  parseSpec,
  simplify,
  encodePolyline6,
  decodePolyline6,
  RAIL_PROFILES,
};
