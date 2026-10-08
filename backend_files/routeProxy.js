/**
 * FOSSGIS / OSRM Real Road Routing Proxy
 * 
 * Proxies requests to routing.openstreetmap.de with strict safety limits:
 * - 1 req/s upstream rate gate via P-00
 * - In-flight coalescing & 10-minute caching
 * - 2-12 coordinates
 * - Max leg distance: 600 km
 * - Max total distance: 2500 km
 * - 12s timeout, 8MB response cap
 * - Attribution: © OpenStreetMap contributors · routing by FOSSGIS
 */

const { fetchUpstream } = require('./upstream');

const ROUTE_MAX_LEG_KM = 600;
const ROUTE_MAX_TOTAL_KM = 2500;
const ROUTE_CACHE_MS = 10 * 60 * 1000; // 10 minutes

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeProfile(raw) {
  const p = (raw || 'car').toLowerCase().trim();
  if (p === 'car' || p === 'driving') return { profile: 'car', osrmPath: 'routed-car/route/v1/driving' };
  if (p === 'bike' || p === 'bicycle') return { profile: 'bike', osrmPath: 'routed-bike/route/v1/bicycle' };
  if (p === 'foot' || p === 'walking') return { profile: 'foot', osrmPath: 'routed-foot/route/v1/foot' };
  return null;
}

async function handleRouteProxy(req, res) {
  const rawProfile = req.query.profile || 'car';
  const profileConfig = normalizeProfile(rawProfile);
  if (!profileConfig) {
    return res.status(400).json({ ok: false, error: 'Invalid profile. Allowed: car, bike, foot' });
  }

  const rawCoords = String(req.query.coords || '').trim();
  if (!rawCoords) {
    return res.status(400).json({ ok: false, error: 'coords parameter required (lon,lat;lon,lat)' });
  }

  const pairs = rawCoords.split(';').map(s => s.trim()).filter(Boolean);
  if (pairs.length < 2 || pairs.length > 12) {
    return res.status(400).json({ ok: false, error: 'coords must contain between 2 and 12 points' });
  }

  const cleanPairs = [];
  const points = []; // [lon, lat]

  for (const pr of pairs) {
    const parts = pr.split(',');
    if (parts.length !== 2) {
      return res.status(400).json({ ok: false, error: `Invalid coordinate pair: ${pr}` });
    }
    const lon = Number(parts[0]);
    const lat = Number(parts[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return res.status(400).json({ ok: false, error: `Coordinates out of bounds: ${lon},${lat}` });
    }
    cleanPairs.push(`${lon.toFixed(6)},${lat.toFixed(6)}`);
    points.push([lon, lat]);
  }

  // Validate leg and total distance limits
  let totalKm = 0;
  for (let i = 1; i < points.length; i++) {
    const legDist = haversineKm(points[i - 1][1], points[i - 1][0], points[i][1], points[i][0]);
    if (legDist > ROUTE_MAX_LEG_KM) {
      return res.status(400).json({
        ok: false,
        error: `Route leg exceeds maximum allowed distance of ${ROUTE_MAX_LEG_KM} km (${Math.round(legDist)} km)`
      });
    }
    totalKm += legDist;
  }

  if (totalKm > ROUTE_MAX_TOTAL_KM) {
    return res.status(400).json({
      ok: false,
      error: `Total route distance exceeds maximum allowed limit of ${ROUTE_MAX_TOTAL_KM} km (${Math.round(totalKm)} km)`
    });
  }

  const coordsString = cleanPairs.join(';');
  const upstreamUrl = `https://routing.openstreetmap.de/${profileConfig.osrmPath}/${coordsString}?overview=full&geometries=geojson&alternatives=false&steps=false`;

  try {
    const result = await fetchUpstream({
      key: `route:${profileConfig.profile}:${coordsString}`,
      url: upstreamUrl,
      ttlMs: ROUTE_CACHE_MS,
      staleMs: 60 * 60 * 1000,
      timeoutMs: 12000,
      maxBytes: 8 * 1024 * 1024,
      hostGate: { minIntervalMs: 1000 }, // 1 req/s FOSSGIS rate limit
    });

    if (result.outcome === 'hit') res.set('X-Cache', 'HIT');
    else if (result.outcome === 'stale') res.set('X-Cache', 'STALE');
    else if (result.outcome === 'miss') res.set('X-Cache', 'MISS');

    if (!result.ok || !result.data) {
      return res.status(result.status || 502).json({
        ok: false,
        error: result.error || 'Failed to calculate route from upstream',
        answered: result.answered,
      });
    }

    const osrm = result.data;
    const route = osrm?.routes?.[0];

    if (osrm.code !== 'Ok' || !route?.geometry?.coordinates?.length) {
      return res.status(404).json({
        ok: false,
        error: 'No route found between the specified coordinates',
        answered: true,
      });
    }

    const distanceKm = Math.round((route.distance / 1000) * 10) / 10;
    const durationMin = Math.round(route.duration / 60);
    const geometry = route.geometry.coordinates.map(c => [c[0], c[1], 0]);

    return res.json({
      ok: true,
      code: 'Ok',
      distanceKm,
      durationMin,
      geometry,
      attribution: '© OpenStreetMap contributors · routing by FOSSGIS',
      fixMapUrl: 'https://www.openstreetmap.org/fixthemap'
    });
  } catch (err) {
    console.error('[Route Proxy Error]:', err.message);
    return res.status(502).json({ ok: false, error: 'Routing service error' });
  }
}

module.exports = {
  haversineKm,
  normalizeProfile,
  handleRouteProxy,
};
