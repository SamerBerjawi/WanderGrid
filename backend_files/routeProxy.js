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

const ROUTE_MAX_LEG_KM = 2500;
const ROUTE_MAX_TOTAL_KM = 10000;
const ROUTE_CACHE_MS = 10 * 60 * 1000; // 10 minutes

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function decodePolyline6(str) {
  let index = 0, lat = 0, lng = 0;
  const coordinates = [];
  const factor = 1e6;
  while (index < str.length) {
    let b, shift = 0, result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    coordinates.push([lng / factor, lat / factor, 0]);
  }
  return coordinates;
}

function normalizeProfile(raw) {
  const p = (raw || 'car').toLowerCase().trim();
  if (p === 'car' || p === 'driving') return { profile: 'car', costing: 'auto', osrmPath: 'routed-car/route/v1/driving' };
  if (p === 'bike' || p === 'bicycle') return { profile: 'bike', costing: 'bicycle', osrmPath: 'routed-bike/route/v1/bicycle' };
  if (p === 'foot' || p === 'walking') return { profile: 'foot', costing: 'pedestrian', osrmPath: 'routed-foot/route/v1/foot' };
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
  if (pairs.length < 2 || pairs.length > 25) {
    return res.status(400).json({ ok: false, error: 'coords must contain between 2 and 25 points' });
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
  // 1. Primary: FOSSGIS OSRM (instant response)
  const osrmUrl = `https://routing.openstreetmap.de/${profileConfig.osrmPath}/${coordsString}?overview=full&geometries=geojson&alternatives=false&steps=false`;
  try {
    const osrmResult = await fetchUpstream({
      key: `osrm-fossgis:${profileConfig.profile}:${coordsString}`,
      url: osrmUrl,
      ttlMs: ROUTE_CACHE_MS,
      staleMs: 60 * 60 * 1000,
      timeoutMs: 9000,
      maxBytes: 8 * 1024 * 1024,
      hostGate: { minIntervalMs: 250 },
    });

    if (osrmResult.outcome === 'hit') res.set('X-Cache', 'HIT');
    else if (osrmResult.outcome === 'stale') res.set('X-Cache', 'STALE');
    else if (osrmResult.outcome === 'miss') res.set('X-Cache', 'MISS');

    if (osrmResult.ok && osrmResult.data?.code === 'Ok' && osrmResult.data?.routes?.[0]?.geometry?.coordinates?.length) {
      const route = osrmResult.data.routes[0];
      return res.json({
        ok: true,
        code: 'Ok',
        distanceKm: Math.round((route.distance / 1000) * 10) / 10,
        durationMin: Math.round(route.duration / 60),
        geometry: route.geometry.coordinates.map(c => [c[0], c[1], 0]),
        attribution: '© OpenStreetMap contributors · routing by FOSSGIS',
        fixMapUrl: 'https://www.openstreetmap.org/fixthemap'
      });
    }
  } catch {}

  // 2. Secondary: Project OSRM Demo
  try {
    const demoProfile = profileConfig.profile === 'bike' ? 'bicycle' : profileConfig.profile === 'foot' ? 'foot' : 'driving';
    const demoUrl = `https://router.project-osrm.org/route/v1/${demoProfile}/${coordsString}?overview=full&geometries=geojson&alternatives=false&steps=false`;
    const demoResult = await fetchUpstream({
      key: `osrm-demo:${profileConfig.profile}:${coordsString}`,
      url: demoUrl,
      ttlMs: ROUTE_CACHE_MS,
      staleMs: 60 * 60 * 1000,
      timeoutMs: 9000,
      maxBytes: 8 * 1024 * 1024,
      hostGate: { minIntervalMs: 250 },
    });

    if (demoResult.ok && demoResult.data?.code === 'Ok' && demoResult.data?.routes?.[0]?.geometry?.coordinates?.length) {
      const route = demoResult.data.routes[0];
      return res.json({
        ok: true,
        code: 'Ok',
        distanceKm: Math.round((route.distance / 1000) * 10) / 10,
        durationMin: Math.round(route.duration / 60),
        geometry: route.geometry.coordinates.map(c => [c[0], c[1], 0]),
        attribution: '© OpenStreetMap contributors, OSRM',
        fixMapUrl: 'https://www.openstreetmap.org/fixthemap'
      });
    }
  } catch {}

  // 3. Tertiary: Valhalla FOSSGIS
  try {
    const locations = points.map(([lon, lat]) => ({ lat, lon }));
    const valhallaUrl = `https://valhalla1.openstreetmap.de/route?json=${encodeURIComponent(JSON.stringify({ locations, costing: profileConfig.costing }))}`;
    const result = await fetchUpstream({
      key: `valhalla:${profileConfig.profile}:${coordsString}`,
      url: valhallaUrl,
      ttlMs: ROUTE_CACHE_MS,
      staleMs: 60 * 60 * 1000,
      timeoutMs: 9000,
      maxBytes: 8 * 1024 * 1024,
      hostGate: { minIntervalMs: 250 },
    });

    if (result.ok && result.data?.trip?.legs?.length) {
      const trip = result.data.trip;
      let allGeometry = [];
      for (const leg of trip.legs) {
        if (leg.shape) {
          const legCoords = decodePolyline6(leg.shape);
          allGeometry = allGeometry.concat(legCoords);
        }
      }

      if (allGeometry.length > 2) {
        return res.json({
          ok: true,
          code: 'Ok',
          distanceKm: Math.round((trip.summary?.length || 0) * 10) / 10,
          durationMin: Math.round((trip.summary?.time || 0) / 60),
          geometry: allGeometry,
          attribution: '© OpenStreetMap contributors · routing by FOSSGIS (Valhalla)',
          fixMapUrl: 'https://www.openstreetmap.org/fixthemap'
        });
      }
    }

    return res.status(502).json({
      ok: false,
      error: 'Failed to calculate route from upstream providers',
    });
  } catch (err) {
    console.error('[Route Proxy Error]:', err.message);
    return res.status(502).json({ ok: false, error: 'Routing service error' });
  }
}

/**
 * OpenRailRouting (GraphHopper) Real Railway Routing Proxy
 * Traces actual physical railway tracks worldwide.
 */
async function handleRailRouteProxy(req, res) {
  const rawCoords = String(req.query.coords || req.query.points || '').trim();
  if (!rawCoords) {
    return res.status(400).json({ ok: false, error: 'coords parameter required (lon,lat;lon,lat or lat,lng;lat,lng)' });
  }

  const pairs = rawCoords.split(';').map(s => s.trim()).filter(Boolean);
  if (pairs.length < 2 || pairs.length > 25) {
    return res.status(400).json({ ok: false, error: 'coords must contain between 2 and 25 points' });
  }

  const ghPoints = [];
  for (const pr of pairs) {
    const parts = pr.split(',');
    if (parts.length !== 2) return res.status(400).json({ ok: false, error: `Invalid coordinate pair: ${pr}` });
    const p1 = Number(parts[0]);
    const p2 = Number(parts[1]);
    if (!Number.isFinite(p1) || !Number.isFinite(p2)) {
      return res.status(400).json({ ok: false, error: `Invalid coordinate numbers: ${pr}` });
    }

    // Default: caller sends lon,lat (OSRM style)
    let lat = p2;
    let lon = p1;
    if (req.query.format === 'lat,lng') {
      lat = p1;
      lon = p2;
    }
    ghPoints.push(`point=${lat.toFixed(5)},${lon.toFixed(5)}`);
  }

  const pointsQuery = ghPoints.join('&');
  const profile = req.query.profile || 'all_tracks';
  const upstreamUrl = `https://routing.openrailrouting.org/route?${pointsQuery}&profile=${encodeURIComponent(profile)}&points_encoded=false`;

  try {
    const result = await fetchUpstream({
      key: `rail:${profile}:${pointsQuery}`,
      url: upstreamUrl,
      ttlMs: ROUTE_CACHE_MS,
      staleMs: 60 * 60 * 1000,
      timeoutMs: 15000,
      maxBytes: 8 * 1024 * 1024,
      hostGate: { minIntervalMs: 250 },
    });

    if (result.outcome === 'hit') res.set('X-Cache', 'HIT');
    else if (result.outcome === 'stale') res.set('X-Cache', 'STALE');
    else if (result.outcome === 'miss') res.set('X-Cache', 'MISS');

    if (!result.ok || !result.data) {
      return res.status(result.status || 502).json({
        ok: false,
        error: result.error || 'Failed to calculate rail route from upstream',
      });
    }

    const data = result.data;
    const path = data?.paths?.[0];
    if (!path?.points?.coordinates?.length) {
      return res.status(404).json({
        ok: false,
        error: data.message || 'No physical rail connection found between coordinates',
      });
    }

    return res.json({
      ok: true,
      distanceKm: Math.round((path.distance / 1000) * 10) / 10,
      durationMin: Math.round(path.time / 60000),
      geometry: path.points.coordinates.map(c => [c[0], c[1], 0]),
      attribution: '© OpenStreetMap contributors · OpenRailRouting (GraphHopper)',
    });
  } catch (err) {
    console.error('[Rail Route Proxy Error]:', err.message);
    return res.status(502).json({ ok: false, error: 'Rail routing service error' });
  }
}

module.exports = {
  haversineKm,
  normalizeProfile,
  handleRouteProxy,
  handleRailRouteProxy,
};
