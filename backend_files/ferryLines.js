/**
 * Real ferry lines from OpenStreetMap.
 *
 * Regular ferries are mapped in OSM as `route=ferry` relations whose member ways are the line the boat
 * sails (through the archipelago, round the headland). The shipping-lane network the client uses
 * (searoute-js) is built for ocean traffic and has no lane for most crossings, so those fall back to a
 * straight arc. Here the line is read from OSM (Overpass API) once and stored by the route store.
 *
 * A relation often covers more than the two places asked for (Stockholm - Mariehamn - Helsinki - Tallinn),
 * so the chain of ways is joined end to end and cut between the vertices nearest to the two places.
 */

// The main public server (overpass-api.de) is often at capacity and asks automated users to run their own;
// the community instance below answered where it did not. Set OVERPASS_URLS (comma separated) to use your own.
const DEFAULT_OVERPASS_HOSTS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const overpassHosts = () => {
  const own = String(process.env.OVERPASS_URLS || '').split(',').map(s => s.trim()).filter(u => /^https?:\/\//.test(u));
  return own.length ? own : DEFAULT_OVERPASS_HOSTS;
};
/** How close, in metres, a ferry line must pass to a port for it to count as serving it. */
const PORT_RADIUS_M = 4000;
/** Rejected as a bad match: shorter than the straight line, or this many times longer. */
const MAX_DETOUR = 4;

const toRad = d => (d * Math.PI) / 180;
function haversineKm(a, b) {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
const lengthKm = pts => pts.reduce((km, p, i) => (i ? km + haversineKm(pts[i - 1], p) : km), 0);

/** Overpass QL: ferry relations that pass near both ports (a relation is "near" when any member is). */
function buildQuery(a, b, radius = PORT_RADIUS_M) {
  return `[out:json][timeout:25];rel(around:${radius},${a[1].toFixed(5)},${a[0].toFixed(5)})["route"="ferry"]->.a;rel.a(around:${radius},${b[1].toFixed(5)},${b[0].toFixed(5)});out geom;`;
}

const same = (p, q) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6;

/** Joins ways end to end (reversing as needed) into one or more chains of [lng, lat]. */
function chainWays(ways) {
  const left = ways.filter(w => w.length > 1).map(w => w.slice());
  const chains = [];
  while (left.length) {
    let chain = left.shift();
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < left.length; i++) {
        const w = left[i];
        const head = chain[0], tail = chain[chain.length - 1];
        if (same(tail, w[0])) chain = chain.concat(w.slice(1));
        else if (same(tail, w[w.length - 1])) chain = chain.concat(w.slice(0, -1).reverse());
        else if (same(head, w[w.length - 1])) chain = w.slice(0, -1).concat(chain);
        else if (same(head, w[0])) chain = w.slice(1).reverse().concat(chain);
        else continue;
        left.splice(i, 1);
        grew = true;
        break;
      }
    }
    chains.push(chain);
  }
  return chains;
}

const nearest = (pts, p) => {
  let best = 0, bestKm = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = haversineKm(pts[i], p);
    if (d < bestKm) { bestKm = d; best = i; }
  }
  return { index: best, km: bestKm };
};

/** The part of a chain between the vertices nearest to a and b, oriented from a to b; null when a port is not on it. */
function sliceBetween(chain, a, b, radiusKm = PORT_RADIUS_M / 1000) {
  const na = nearest(chain, a), nb = nearest(chain, b);
  if (na.km > radiusKm * 1.5 || nb.km > radiusKm * 1.5 || na.index === nb.index) return null;
  const part = na.index < nb.index ? chain.slice(na.index, nb.index + 1) : chain.slice(nb.index, na.index + 1).reverse();
  return [a, ...part, b].filter((p, i, arr) => i === 0 || !same(p, arr[i - 1]));
}

/** Overpass `elements` -> the best line from a to b as [lng, lat] points, or null when no ferry relation fits. */
function pickFerryLine(elements, a, b) {
  const straight = haversineKm(a, b);
  let best = null;
  for (const rel of elements || []) {
    if (rel?.type !== 'relation') continue;
    const ways = (rel.members || [])
      .filter(m => m.type === 'way' && Array.isArray(m.geometry) && m.geometry.length > 1)
      .map(m => m.geometry.map(g => [g.lon, g.lat]));
    for (const chain of chainWays(ways)) {
      const part = sliceBetween(chain, a, b);
      if (!part) continue;
      const km = lengthKm(part);
      if (km < straight * 0.98 || km > straight * MAX_DETOUR) continue;
      if (!best || km < best.km) best = { points: part, km, name: rel.tags?.name || rel.tags?.ref || '' };
    }
  }
  return best;
}

/**
 * Looks up the ferry line for every consecutive pair of `coords` ([lng, lat]) and joins them.
 * Returns { status: 'ok', coords, km, names } | { status: 'none' } (no ferry line for some pair) | { status: 'error' } (Overpass unavailable).
 */
async function resolveFerryLine(coords, fetchUpstream, hosts = overpassHosts()) {
  const out = [];
  const names = [];
  let km = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1], b = coords[i];
    const query = encodeURIComponent(buildQuery(a, b));
    let answered = false;
    let found = null;
    for (const host of hosts) {
      const r = await fetchUpstream({
        key: `ferry:${host}:${query}`,
        url: `${host}?data=${query}`,
        ttlMs: 0, staleMs: 0, cacheResult: false, negativeTtlMs: 0,
        timeoutMs: 20000,
        maxBytes: 16 * 1024 * 1024,
        hostGate: { minIntervalMs: 1000 },
      });
      if (r.ok && Array.isArray(r.data?.elements)) { answered = true; found = pickFerryLine(r.data.elements, a, b); break; }
    }
    if (!answered) return { status: 'error' };
    if (!found) return { status: 'none' };
    out.push(...(out.length ? found.points.slice(1) : found.points));
    km += found.km;
    if (found.name) names.push(found.name);
  }
  return { status: 'ok', coords: out, km: Math.round(km * 10) / 10, names };
}

module.exports = { overpassHosts, PORT_RADIUS_M, buildQuery, chainWays, sliceBetween, pickFerryLine, resolveFerryLine, haversineKm };
