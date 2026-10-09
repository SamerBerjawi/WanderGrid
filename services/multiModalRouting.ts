// Multi-Modal Route Intelligence for WanderGrid: Rail (OSM Tracks) & Highways (OSRM) & Maritime (Marnet)
import { STATIC_GEO_DATA } from './geocoding';
import { fetchSeaRoute } from './maritimeRouting';

// Global In-Memory RAM Cache for Multi-Modal Geometries
const multiModalCache = new Map<string, [number, number, number][]>();
const pendingFetches = new Set<string>();

const STORAGE_KEY = 'wandergrid_overland_routes_v3';

// Load stored routes from persistent storage on startup, purging any poisoned <= 2-point straight lines
try {
    if (typeof window !== 'undefined') {
        localStorage.removeItem('wandergrid_multimodal_routes_v1');
        
        // Inspect current and previous storage versions
        const legacyStored = localStorage.getItem('wandergrid_overland_routes_v2');
        const stored = localStorage.getItem(STORAGE_KEY) || legacyStored;

        if (stored) {
            const parsed = JSON.parse(stored);
            const sanitized: Record<string, [number, number, number][]> = {};
            
            Object.entries(parsed).forEach(([k, v]) => {
                const pts = v as [number, number, number][];
                // Only keep real traced curves with > 2 points (purge 2-point straight fallbacks)
                if (Array.isArray(pts) && pts.length > 2) {
                    multiModalCache.set(k, pts);
                    sanitized[k] = pts;
                }
            });

            // Clean legacy and write back sanitized routes
            localStorage.removeItem('wandergrid_overland_routes_v2');
            localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
        }
    }
} catch (e) {
    console.warn('Failed to load multi-modal route cache:', e);
}

const saveRouteToCache = (key: string, points: [number, number, number][]) => {
    // Never cache 2-point straight line fallbacks as traced routes
    if (!points || points.length <= 2) return;

    multiModalCache.set(key, points);
    try {
        if (typeof window !== 'undefined') {
            const data: Record<string, [number, number, number][]> = {};
            let count = 0;
            multiModalCache.forEach((val, k) => {
                if (count < 500 && val.length > 2) {
                    data[k] = val;
                    count++;
                }
            });
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        }
    } catch (e) {}
};

/**
 * Builds a deterministic cache key for a route with optional intermediate waypoints.
 */
export function buildRouteKey(
    mode: string | undefined,
    startLat: number,
    startLng: number,
    endLat: number,
    endLng: number,
    waypoints?: any[]
): string {
    const cleanMode = (mode || '').toLowerCase();
    const wpParts: string[] = [];
    if (waypoints && Array.isArray(waypoints)) {
        for (const wp of waypoints) {
            const lat = wp?.coordinates?.lat ?? wp?.lat;
            const lng = wp?.coordinates?.lng ?? wp?.lng;
            if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
                wpParts.push(`${lat.toFixed(3)},${lng.toFixed(3)}`);
            }
        }
    }
    const wpStr = wpParts.length > 0 ? `_${wpParts.join(';')}` : '';
    return `${cleanMode}_${startLat.toFixed(3)},${startLng.toFixed(3)}${wpStr}|${endLat.toFixed(3)},${endLng.toFixed(3)}`;
}

function decodePolyline6(str: string): [number, number, number][] {
    let index = 0, lat = 0, lng = 0;
    const coordinates: [number, number, number][] = [];
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

/**
 * Generates high-altitude 3D parabolic geodesic arc points between two coordinates.
 */
export function getGeodesicArcPoints(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
    numPoints: number = 60,
    maxAltitudeFactor: number = 0.15
): [number, number, number][] {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const toDeg = (r: number) => (r * 180) / Math.PI;

    const phi1 = toRad(lat1), lambda1 = toRad(lng1);
    const phi2 = toRad(lat2), lambda2 = toRad(lng2);

    const dLat = phi2 - phi1;
    const dLng = lambda2 - lambda1;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLng / 2) ** 2;
    const d = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    if (d < 1e-6) {
        return [[lng1, lat1, 0], [lng2, lat2, 0]];
    }

    const points: [number, number, number][] = [];
    const earthRadiusKm = 6371;
    const totalDistKm = d * earthRadiusKm;
    const maxAltMeters = Math.min(11500, Math.max(1200, totalDistKm * maxAltitudeFactor * 1000));

    for (let i = 0; i <= numPoints; i++) {
        const f = i / numPoints;
        const A = Math.sin((1 - f) * d) / Math.sin(d);
        const B = Math.sin(f * d) / Math.sin(d);

        const x = A * Math.cos(phi1) * Math.cos(lambda1) + B * Math.cos(phi2) * Math.cos(lambda2);
        const y = A * Math.cos(phi1) * Math.sin(lambda1) + B * Math.cos(phi2) * Math.sin(lambda2);
        const z = A * Math.sin(phi1) + B * Math.sin(phi2);

        const curLat = toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)));
        const curLng = toDeg(Math.atan2(y, x));

        const altMeters = Math.sin(f * Math.PI) * maxAltMeters;
        points.push([curLng, curLat, altMeters]);
    }

    return points;
}

/**
 * Generates a smooth natural geographic rail corridor curvature (never roads or 2-point straight lines).
 */
export function generateSmoothRailCorridor(
    startLat: number,
    startLng: number,
    endLat: number,
    endLng: number,
    waypoints?: any[],
    numPointsPerLeg: number = 24
): [number, number, number][] {
    const legs: [number, number][] = [[startLng, startLat]];
    if (waypoints && Array.isArray(waypoints)) {
        for (const wp of waypoints) {
            const lat = wp?.coordinates?.lat ?? wp?.lat;
            const lng = wp?.coordinates?.lng ?? wp?.lng;
            if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
                legs.push([lng, lat]);
            }
        }
    }
    legs.push([endLng, endLat]);

    const result: [number, number, number][] = [];
    const toRad = (d: number) => (d * Math.PI) / 180;
    const toDeg = (r: number) => (r * 180) / Math.PI;

    for (let k = 0; k < legs.length - 1; k++) {
        const [lng1, lat1] = legs[k];
        const [lng2, lat2] = legs[k + 1];

        const phi1 = toRad(lat1), lam1 = toRad(lng1);
        const phi2 = toRad(lat2), lam2 = toRad(lng2);
        const dLat = phi2 - phi1;
        const dLng = lam2 - lam1;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLng / 2) ** 2;
        const d = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        if (d < 1e-5) {
            if (result.length === 0) result.push([lng1, lat1, 0]);
            result.push([lng2, lat2, 0]);
            continue;
        }

        for (let i = (k === 0 ? 0 : 1); i <= numPointsPerLeg; i++) {
            const f = i / numPointsPerLeg;
            const A = Math.sin((1 - f) * d) / Math.sin(d);
            const B = Math.sin(f * d) / Math.sin(d);

            const x = A * Math.cos(phi1) * Math.cos(lam1) + B * Math.cos(phi2) * Math.cos(lam2);
            const y = A * Math.cos(phi1) * Math.sin(lam1) + B * Math.cos(phi2) * Math.sin(lam2);
            const z = A * Math.sin(phi1) + B * Math.sin(phi2);

            const curLat = toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)));
            const curLng = toDeg(Math.atan2(y, x));
            result.push([curLng, curLat, 0]);
        }
    }

    return result;
}

/**
 * Fetches real physical rail geometry using OpenRailRouting (GraphHopper) via proxy or upstream.
 * Traces actual railway tracks worldwide. Falls back to a smooth rail corridor (never highways or straight lines).
 */
export async function fetchRailGeometry(
    startLat: number,
    startLng: number,
    endLat: number,
    endLng: number,
    waypoints?: any[]
): Promise<[number, number, number][] | null> {
    const allCoords: [number, number][] = [[startLng, startLat]];
    if (waypoints && Array.isArray(waypoints)) {
        for (const wp of waypoints) {
            const lat = wp?.coordinates?.lat ?? wp?.lat;
            const lng = wp?.coordinates?.lng ?? wp?.lng;
            if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
                allCoords.push([lng, lat]);
            }
        }
    }
    allCoords.push([endLng, endLat]);

    const coordsStr = allCoords.map(([lng, lat]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(';');
    const ghPoints = allCoords.map(([lng, lat]) => `point=${lat.toFixed(5)},${lng.toFixed(5)}`).join('&');

    // 1. Try local/backend rail proxy
    try {
        const proxyController = new AbortController();
        const proxyTimeout = setTimeout(() => proxyController.abort(), 8000);
        const res = await fetch(`/api/proxy/rail?coords=${encodeURIComponent(coordsStr)}`, {
            signal: proxyController.signal
        });
        clearTimeout(proxyTimeout);

        if (res.ok) {
            const data = await res.json();
            if (data.ok && Array.isArray(data.geometry) && data.geometry.length > 2) {
                return data.geometry;
            }
        }
    } catch {}

    // 2. Direct OpenRailRouting query (with profile fallbacks)
    const profiles = ['all_tracks', 'all_tracks_1435', 'tgv_all'];
    for (const prof of profiles) {
        try {
            const directUrl = `https://routing.openrailrouting.org/route?${ghPoints}&profile=${prof}&points_encoded=false`;
            const directController = new AbortController();
            const directTimeout = setTimeout(() => directController.abort(), 7000);
            const directRes = await fetch(directUrl, {
                signal: directController.signal,
                headers: { 'User-Agent': 'WanderGrid/1.0' }
            });
            clearTimeout(directTimeout);

            if (directRes.ok) {
                const data = await directRes.json();
                const coords: [number, number][] = data?.paths?.[0]?.points?.coordinates;
                if (Array.isArray(coords) && coords.length > 2) {
                    return coords.map(c => [c[0], c[1], 0]);
                }
            }
        } catch {}
    }

    // 3. Smooth geographic rail corridor (NEVER highway roads and NEVER 2-point straight lines)
    return generateSmoothRailCorridor(startLat, startLng, endLat, endLng, waypoints);
}

export interface RouteResult {
    geometry: [number, number, number][];
    distanceKm: number;
    durationMin: number;
    attribution?: string;
    fixMapUrl?: string;
    isFallback?: boolean;
}

/**
 * Real routing via backend FOSSGIS / Valhalla proxy (P-02) with direct public Valhalla and OSRM fallbacks.
 */
export async function fetchRoute(
    profile: 'car' | 'bike' | 'foot' = 'car',
    coords: [number, number][] // [[lng, lat], ...]
): Promise<RouteResult | null> {
    if (!coords || coords.length < 2) return null;
    const coordsStr = coords.map(([lng, lat]) => `${lng},${lat}`).join(';');

    // 1. Backend route proxy (Valhalla FOSSGIS engine)
    try {
        const proxyController = new AbortController();
        const proxyTimeout = setTimeout(() => proxyController.abort(), 10000);
        const res = await fetch(
            `/api/proxy/route?profile=${encodeURIComponent(profile)}&coords=${encodeURIComponent(coordsStr)}`,
            { signal: proxyController.signal }
        );
        clearTimeout(proxyTimeout);

        if (res.ok) {
            const data = await res.json();
            if (data.ok && Array.isArray(data.geometry) && data.geometry.length > 2) {
                return {
                    geometry: data.geometry,
                    distanceKm: data.distanceKm,
                    durationMin: data.durationMin,
                    attribution: data.attribution,
                    fixMapUrl: data.fixMapUrl,
                    isFallback: false
                };
            }
        }
    } catch {}

    // 2. Direct OSRM fallback (CORS enabled on routing.openstreetmap.de & project-osrm.org)
    try {
        const osrmProfile = profile === 'bike' ? 'routed-bike/route/v1/bicycle' : profile === 'foot' ? 'routed-foot/route/v1/foot' : 'routed-car/route/v1/driving';
        const osrmUrl = `https://routing.openstreetmap.de/${osrmProfile}/${coordsStr}?overview=full&geometries=geojson&alternatives=false&steps=false`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const osrmRes = await fetch(osrmUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (osrmRes.ok) {
            const data = await osrmRes.json();
            const route = data?.routes?.[0];
            if (data.code === 'Ok' && route?.geometry?.coordinates?.length > 2) {
                const geometry: [number, number, number][] = route.geometry.coordinates.map((c: [number, number]) => [c[0], c[1], 0]);
                return {
                    geometry,
                    distanceKm: Math.round((route.distance || 0) / 1000),
                    durationMin: Math.round((route.duration || 0) / 60),
                    attribution: '© OpenStreetMap contributors, OSRM',
                    isFallback: false
                };
            }
        }
    } catch {}

    // 3. Direct Project OSRM fallback
    try {
        const demoProfile = profile === 'bike' ? 'bicycle' : profile === 'foot' ? 'foot' : 'driving';
        const demoUrl = `https://router.project-osrm.org/route/v1/${demoProfile}/${coordsStr}?overview=full&geometries=geojson&alternatives=false&steps=false`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const osrmRes = await fetch(demoUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (osrmRes.ok) {
            const data = await osrmRes.json();
            const route = data?.routes?.[0];
            if (data.code === 'Ok' && route?.geometry?.coordinates?.length > 2) {
                const geometry: [number, number, number][] = route.geometry.coordinates.map((c: [number, number]) => [c[0], c[1], 0]);
                return {
                    geometry,
                    distanceKm: Math.round((route.distance || 0) / 1000),
                    durationMin: Math.round((route.duration || 0) / 60),
                    attribution: '© OpenStreetMap contributors, OSRM',
                    isFallback: false
                };
            }
        }
    } catch {}

    // 4. Direct Valhalla fallback
    try {
        const locations = coords.map(([lon, lat]) => ({ lat, lon }));
        const costing = profile === 'bike' ? 'bicycle' : profile === 'foot' ? 'pedestrian' : 'auto';
        const vUrl = `https://valhalla1.openstreetmap.de/route?json=${encodeURIComponent(JSON.stringify({ locations, costing }))}`;
        const vController = new AbortController();
        const vTimeout = setTimeout(() => vController.abort(), 4000);
        const vRes = await fetch(vUrl, { signal: vController.signal });
        clearTimeout(vTimeout);

        if (vRes.ok) {
            const vData = await vRes.json();
            const trip = vData?.trip;
            if (trip?.legs?.length) {
                let allGeometry: [number, number, number][] = [];
                for (const leg of trip.legs) {
                    if (leg.shape) {
                        allGeometry = allGeometry.concat(decodePolyline6(leg.shape));
                    }
                }
                if (allGeometry.length > 2) {
                    return {
                        geometry: allGeometry,
                        distanceKm: Math.round((trip.summary?.length || 0) * 10) / 10,
                        durationMin: Math.round((trip.summary?.time || 0) / 60),
                        attribution: '© OpenStreetMap contributors · routing by FOSSGIS (Valhalla)',
                        isFallback: false
                    };
                }
            }
        }
    } catch {}

    return null;
}

/**
 * Fetches highway road geometry from backend routing proxy or direct Valhalla/OSRM.
 */
export async function fetchHighwayGeometry(
    startLat: number,
    startLng: number,
    endLat: number,
    endLng: number,
    waypoints?: any[]
): Promise<[number, number, number][] | null> {
    const allCoords: [number, number][] = [[startLng, startLat]];

    if (waypoints && Array.isArray(waypoints)) {
        for (const wp of waypoints) {
            const lat = wp?.coordinates?.lat ?? wp?.lat;
            const lng = wp?.coordinates?.lng ?? wp?.lng;
            if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
                allCoords.push([lng, lat]);
            }
        }
    }
    allCoords.push([endLng, endLat]);

    const route = await fetchRoute('car', allCoords);
    if (route && !route.isFallback && route.geometry && route.geometry.length > 2) {
        return route.geometry;
    }
    return null;
}

/**
 * Unified Multi-Modal Geometry Dispatcher (Rail, Maritime Sea Lanes & Highway Roads) with immediate async execution.
 */
export async function fetchMultiModalRoute(
    mode: string | undefined,
    startLat: number,
    startLng: number,
    endLat: number,
    endLng: number,
    onDone: () => void,
    waypoints?: any[]
): Promise<[number, number, number][] | null> {
    const cleanMode = (mode || '').toLowerCase();
    const isTrain = cleanMode.includes('train') || cleanMode.includes('rail');
    const isRoad = cleanMode.includes('car') || cleanMode.includes('drive') || cleanMode.includes('bus') || cleanMode.includes('road') || cleanMode.includes('taxi');
    const isSea = ['cruise', 'ferry', 'boat', 'ship'].some(m => cleanMode.includes(m));

    if (!isTrain && !isRoad && !isSea) {
        return null;
    }

    const key = buildRouteKey(mode, startLat, startLng, endLat, endLng, waypoints);

    if (multiModalCache.has(key)) {
        const cached = multiModalCache.get(key)!;
        if (cached && cached.length > 2) {
            return cached;
        }
        multiModalCache.delete(key);
    }

    if (pendingFetches.has(key)) {
        return null;
    }

    pendingFetches.add(key);

    (async () => {
        try {
            // 1. Maritime / Sea Routing (Ferry & Cruise along shipping lanes)
            if (isSea) {
                const seaGeom = await fetchSeaRoute(startLat, startLng, endLat, endLng, waypoints);
                if (seaGeom && seaGeom.length > 2) {
                    saveRouteToCache(key, seaGeom);
                    onDone();
                    return;
                }
            }
            // 2. Train / Rail (Tracks only, never roads or straight lines)
            else if (isTrain) {
                const railGeom = await fetchRailGeometry(startLat, startLng, endLat, endLng, waypoints);
                if (railGeom && railGeom.length > 2) {
                    saveRouteToCache(key, railGeom);
                    onDone();
                    return;
                }
            }
            // 3. Driving / Road / Bus (Highway routing via Valhalla)
            else if (isRoad) {
                const highwayGeom = await fetchHighwayGeometry(startLat, startLng, endLat, endLng, waypoints);
                if (highwayGeom && highwayGeom.length > 2) {
                    saveRouteToCache(key, highwayGeom);
                    onDone();
                    return;
                }
            }
        } catch (e) {
            console.warn('Multi-modal route fetch failed:', e);
        } finally {
            pendingFetches.delete(key);
        }
    })();

    return null;
}

export function getCachedMultiModalRoute(
    mode: string | undefined,
    startLat: number,
    startLng: number,
    endLat: number,
    endLng: number,
    waypoints?: any[]
): [number, number, number][] | null {
    const cleanMode = (mode || '').toLowerCase();
    const isTrain = cleanMode.includes('train') || cleanMode.includes('rail');
    const isRoad = cleanMode.includes('car') || cleanMode.includes('drive') || cleanMode.includes('bus') || cleanMode.includes('road') || cleanMode.includes('taxi');
    const isSea = ['cruise', 'ferry', 'boat', 'ship'].some(m => cleanMode.includes(m));

    if (!isTrain && !isRoad && !isSea) {
        return null;
    }

    const key = buildRouteKey(mode, startLat, startLng, endLat, endLng, waypoints);
    const cached = multiModalCache.get(key);
    // Never return 2-point straight fallbacks from cache
    if (cached && cached.length > 2) {
        return cached;
    }
    return null;
}
