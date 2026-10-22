// Multi-Modal Route Intelligence for WanderGrid: Rail (OSM Tracks) & Highways (OSRM) & Maritime (Marnet)
import { STATIC_GEO_DATA } from './geocoding';

// Global In-Memory RAM Cache for Multi-Modal Geometries
const multiModalCache = new Map<string, [number, number, number][]>();
const encodedRoutes = new Map<string, string>(); // key -> polyline6 ('~' prefix = approximated), what gets persisted
const approximateRoutes = new Set<string>(); // rail legs traced along roads because no rail connection exists
const pendingFetches = new Set<string>();

// v5 stores polyline6 strings (about 5x smaller than coordinate arrays) and is written at most once a second.
const STORAGE_KEY = 'wandergrid_overland_routes_v5';
const MAX_STORED_ROUTES = 400;

/** Bearer token for the backend proxies: every /api route requires it, so unauthenticated calls were all 401. */
function authHeaders(): Record<string, string> {
    try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('wandergrid_session_token') : null;
        return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
        return {};
    }
}

// Checks if a geometry is an un-routed chord. Only degenerate (<=2 point) geometries qualify:
// genuine routing engine output (even for very straight roads / short hops) always has intermediate vertices,
// and a deviation heuristic wrongly rejected real routes, leaving them as straight lines.
export function isStraightLineRoute(pts: [number, number, number][]): boolean {
    if (!Array.isArray(pts) || pts.length <= 2) return true;
    const start = pts[0];
    const end = pts[pts.length - 1];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    return dx * dx + dy * dy < 1e-10;
}

// --- Request scheduling: the public routing hosts are rate-gated (and the proxy aborts requests that wait too long
// in its host queue), so bursting every transport at once made roughly half of them fail => random straight lines.
const MAX_CONCURRENT_ROUTE_FETCHES = 6;
const MAX_ROUTE_ATTEMPTS = 4;
let activeRouteFetches = 0;
const routeFetchQueue: Array<() => void> = [];

function acquireRouteSlot(): Promise<void> {
    if (activeRouteFetches < MAX_CONCURRENT_ROUTE_FETCHES) {
        activeRouteFetches++;
        return Promise.resolve();
    }
    return new Promise(resolve => routeFetchQueue.push(() => { activeRouteFetches++; resolve(); }));
}

function releaseRouteSlot() {
    activeRouteFetches = Math.max(0, activeRouteFetches - 1);
    const next = routeFetchQueue.shift();
    if (next) next();
}

export type RouteStatus = 'ready' | 'loading' | 'failed' | 'idle';
const routeAttempts = new Map<string, number>();
const failedRoutes = new Set<string>();

// Load stored routes from persistent storage on startup
try {
    if (typeof window !== 'undefined') {
        ['wandergrid_multimodal_routes_v1', 'wandergrid_overland_routes_v2', 'wandergrid_overland_routes_v3', 'wandergrid_overland_routes_v4']
            .forEach(k => localStorage.removeItem(k));

        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored) as Record<string, string>;
            Object.entries(parsed).forEach(([k, stored]) => {
                if (typeof stored !== 'string') return;
                const approx = stored.startsWith('~');
                const enc = approx ? stored.slice(1) : stored;
                const pts = decodePolyline6(enc);
                if (pts.length > 2 && !isStraightLineRoute(pts)) {
                    multiModalCache.set(k, pts);
                    encodedRoutes.set(k, stored);
                    if (approx) approximateRoutes.add(k);
                }
            });
        }
    }
} catch (e) {
    console.warn('Failed to load multi-modal route cache:', e);
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist() {
    if (typeof window === 'undefined' || persistTimer) return;
    persistTimer = setTimeout(() => {
        persistTimer = null;
        try {
            const entries = Array.from(encodedRoutes.entries()).slice(-MAX_STORED_ROUTES);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
        } catch {
            // storage full or unavailable: the server store is the source of truth anyway
        }
    }, 1000);
}

function encodePolyline6(points: [number, number, number][]): string {
    let prevLat = 0, prevLng = 0, out = '';
    const push = (value: number) => {
        let v = value < 0 ? ~(value << 1) : value << 1;
        while (v >= 0x20) { out += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; }
        out += String.fromCharCode(v + 63);
    };
    for (const [lng, lat] of points) {
        const la = Math.round(lat * 1e6), lo = Math.round(lng * 1e6);
        push(la - prevLat); push(lo - prevLng);
        prevLat = la; prevLng = lo;
    }
    return out;
}

const saveRouteToCache = (key: string, points: [number, number, number][], encoded?: string, approximate = false) => {
    // Never cache straight line fallbacks as traced routes
    if (!points || points.length <= 2 || isStraightLineRoute(points)) return;

    multiModalCache.set(key, points);
    encodedRoutes.delete(key); // re-insert so the newest entries survive the size cap
    encodedRoutes.set(key, (approximate ? '~' : '') + (encoded || encodePolyline6(points)));
    if (approximate) approximateRoutes.add(key); else approximateRoutes.delete(key);
    schedulePersist();
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
    // Sea legs: a different key from the arcs cached before mapped ferry lines existed, so they are traced again.
    const seaTag = /ferry|cruise|sea|boat|ship/.test(cleanMode) ? '#f' : '';
    return `${cleanMode}_${startLat.toFixed(3)},${startLng.toFixed(3)}${wpStr}|${endLat.toFixed(3)},${endLng.toFixed(3)}${seaTag}`;
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
            signal: proxyController.signal,
            headers: authHeaders()
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
            const directTimeout = setTimeout(() => directController.abort(), 4000);
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

    // No real track geometry available: report failure so the caller can retry. A synthetic corridor must
    // never be cached/treated as a traced route.
    return null;
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
        const proxyTimeout = setTimeout(() => proxyController.abort(), 20000);
        const res = await fetch(
            `/api/proxy/route?profile=${encodeURIComponent(profile)}&coords=${encodeURIComponent(coordsStr)}`,
            { signal: proxyController.signal, headers: authHeaders() }
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

    // 3b. Very long legs: the full-detail geometry can be >1 MB and miss the short timeouts above. A
    // simplified overview is far smaller and still follows the highways, which beats a straight line.
    try {
        const osrmProfile = profile === 'bike' ? 'routed-bike/route/v1/bicycle' : profile === 'foot' ? 'routed-foot/route/v1/foot' : 'routed-car/route/v1/driving';
        const url = `https://routing.openstreetmap.de/${osrmProfile}/${coordsStr}?overview=simplified&geometries=geojson&alternatives=false&steps=false`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 9000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
            const data = await res.json();
            const route = data?.routes?.[0];
            if (data.code === 'Ok' && route?.geometry?.coordinates?.length > 2) {
                return {
                    geometry: route.geometry.coordinates.map((c: [number, number]) => [c[0], c[1], 0] as [number, number, number]),
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
 * Fetches highway road geometry from backend routing proxy or direct OSRM/Valhalla.
 * If routing fails or is offline, falls back to smooth geographic corridor (never straight lines).
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
    if (route && !route.isFallback && route.geometry && route.geometry.length > 2 && !isStraightLineRoute(route.geometry)) {
        return route.geometry;
    }

    if (allCoords.length > 2) {
        const directRoute = await fetchRoute('car', [[startLng, startLat], [endLng, endLat]]);
        if (directRoute && !directRoute.isFallback && directRoute.geometry && directRoute.geometry.length > 2 && !isStraightLineRoute(directRoute.geometry)) {
            return directRoute.geometry;
        }
    }

    return null;
}

// --- Batched resolution through the server's persistent route store -------------------------------------
// One POST carries every road/rail leg the map needs. The server answers instantly for anything it already
// holds (including "no route exists") and resolves the rest in the background; we poll only for those.
type BatchEntry = {
    key: string;
    mode: 'road' | 'rail';
    coords: [number, number][];
    callbacks: Array<() => void>;
    polls: number;
    errors: number;
    retry: () => void;
};
const batchQueue = new Map<string, BatchEntry>();
let batchTimer: ReturnType<typeof setTimeout> | null = null;
// Local dev mode (VITE_LOCAL_MODE) has no backend at all: go straight to the direct per-route path.
const LOCAL_MODE = typeof import.meta !== 'undefined' && !import.meta.env?.PROD && import.meta.env?.VITE_LOCAL_MODE === 'true';
let batchUnavailable = LOCAL_MODE;
let batchWorked = false; // true once the endpoint has answered successfully
// Legs the batch endpoint could not settle: resolved through the direct per-route path instead.
const legacyKeys = new Set<string>();
const MAX_POLLS = 45;
const MAX_ERROR_RETRIES = 1;

function scheduleBatch(delayMs: number) {
    if (batchTimer) return;
    batchTimer = setTimeout(() => {
        batchTimer = null;
        void flushBatch();
    }, delayMs);
}

/** Hand a leg the batch endpoint could not settle to the direct per-route path. */
function toLegacy(entry: BatchEntry) {
    batchQueue.delete(entry.key);
    pendingFetches.delete(entry.key);
    legacyKeys.add(entry.key);
    entry.callbacks.slice(1).forEach(cb => { try { cb(); } catch { /* ignore */ } });
    entry.retry();
}

function settle(entry: BatchEntry, outcome: 'ok' | 'failed') {
    batchQueue.delete(entry.key);
    pendingFetches.delete(entry.key);
    routeAttempts.delete(entry.key);
    if (outcome === 'failed') failedRoutes.add(entry.key);
    entry.callbacks.forEach(cb => { try { cb(); } catch { /* a render callback must not break settling */ } });
}

async function flushBatch() {
    const entries = Array.from(batchQueue.values()).slice(0, 100);
    if (entries.length === 0) return;

    let results: Record<string, { status: string; geometry?: string; approximate?: boolean }> | null = null;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        const res = await fetch('/api/proxy/routes/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ routes: entries.map(e => ({ id: e.key, mode: e.mode, coords: e.coords })) }),
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (res.ok) {
            results = (await res.json())?.results || null;
            batchWorked = batchWorked || results !== null;
        } else if (!batchWorked) {
            // The endpoint has never answered successfully (missing, auth failure, backend down, dev proxy
            // 500/502...): do not wait on it. Use the direct per-route path, which is what always worked.
            batchUnavailable = true;
        }
    } catch {
        if (!batchWorked) batchUnavailable = true;
    }

    if (batchUnavailable) {
        entries.forEach(e => { batchQueue.delete(e.key); pendingFetches.delete(e.key); e.retry(); });
        if (batchQueue.size > 0) scheduleBatch(0);
        return;
    }

    let anyPending = false;
    entries.forEach(entry => {
        const r = results?.[entry.key];
        if (r?.status === 'ok' && typeof r.geometry === 'string') {
            const pts = decodePolyline6(r.geometry);
            if (pts.length > 2) {
                saveRouteToCache(entry.key, pts, r.geometry, r.approximate === true);
                return settle(entry, 'ok');
            }
            return toLegacy(entry);
        }
        if (r?.status === 'none') return settle(entry, 'failed'); // authoritative: no such route, never retried
        if (r?.status === 'pending') {
            entry.polls++;
            if (entry.polls > MAX_POLLS) return toLegacy(entry);
            anyPending = true;
            return;
        }
        // 'error' or no answer: retry once, then resolve it directly instead of leaving the map empty
        entry.errors++;
        routeAttempts.set(entry.key, entry.errors);
        if (entry.errors > MAX_ERROR_RETRIES) return toLegacy(entry);
        anyPending = true;
    });

    if (batchQueue.size > 0) {
        const hasErrors = entries.some(e => batchQueue.has(e.key) && e.errors > 0);
        scheduleBatch(hasErrors ? 2000 : anyPending ? 1200 : 0);
    }
}

function enqueueBatchRoute(
    key: string,
    mode: 'road' | 'rail',
    coords: [number, number][],
    onDone: () => void,
    retry: () => void
) {
    const existing = batchQueue.get(key);
    if (existing) {
        existing.callbacks.push(onDone);
        return;
    }
    batchQueue.set(key, { key, mode, coords, callbacks: [onDone], polls: 0, errors: 0, retry });
    scheduleBatch(60); // gather every leg requested in the same render pass into one request
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

    // Already settled as unavailable this session (the server remembers definitive "no route" answers):
    // do not ask again on every re-render.
    if (failedRoutes.has(key)) {
        return null;
    }

    pendingFetches.add(key);
    failedRoutes.delete(key);

    if ((isTrain || isRoad) && !batchUnavailable && !legacyKeys.has(key)) {
        const coords: [number, number][] = [[startLng, startLat]];
        (waypoints || []).forEach((wp: any) => {
            const lat = wp?.coordinates?.lat ?? wp?.lat;
            const lng = wp?.coordinates?.lng ?? wp?.lng;
            if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) coords.push([lng, lat]);
        });
        coords.push([endLng, endLat]);
        enqueueBatchRoute(
            key,
            isTrain ? 'rail' : 'road',
            coords,
            onDone,
            () => { void fetchMultiModalRoute(mode, startLat, startLng, endLat, endLng, onDone, waypoints); }
        );
        return null;
    }

    (async () => {
        let success = false;
        await acquireRouteSlot();
        try {
            let geom: [number, number, number][] | null = null;
            let approximate = false;
            if (isSea) {
                // searoute-js carries a large global shipping-lane network: load it only when a sea leg is drawn (PERF-004).
                const { fetchSeaRoute } = await import('./maritimeRouting');
                geom = await fetchSeaRoute(startLat, startLng, endLat, endLng, waypoints, 'quick');
            } else if (isTrain) {
                geom = await fetchRailGeometry(startLat, startLng, endLat, endLng, waypoints);
                if (!geom) {
                    // No rail connection: follow the road network so the leg still shows real geography.
                    geom = await fetchHighwayGeometry(startLat, startLng, endLat, endLng, waypoints);
                    approximate = !!geom;
                }
            } else if (isRoad) {
                geom = await fetchHighwayGeometry(startLat, startLng, endLat, endLng, waypoints);
            }
            if (geom && geom.length > 2) {
                saveRouteToCache(key, geom, undefined, approximate);
                success = true;
            }
        } catch (e) {
            console.warn('Multi-modal route fetch failed:', e);
        } finally {
            releaseRouteSlot();
            pendingFetches.delete(key);
        }

        if (success) {
            routeAttempts.delete(key);
            onDone();
            return;
        }

        // Retry with backoff; only mark as failed (and let the map draw a fallback) once attempts are exhausted
        const attempts = (routeAttempts.get(key) || 0) + 1;
        routeAttempts.set(key, attempts);
        if (attempts < MAX_ROUTE_ATTEMPTS) {
            setTimeout(() => {
                void fetchMultiModalRoute(mode, startLat, startLng, endLat, endLng, onDone, waypoints);
            }, 1500 * attempts);
        } else {
            failedRoutes.add(key);
            onDone();
        }
    })();

    return null;
}

/**
 * Reports whether a route is traced ('ready'), still being fetched/retried ('loading'),
 * permanently unavailable ('failed') or not requested yet ('idle').
 */
export function getMultiModalRouteStatus(
    mode: string | undefined,
    startLat: number,
    startLng: number,
    endLat: number,
    endLng: number,
    waypoints?: any[]
): RouteStatus {
    const key = buildRouteKey(mode, startLat, startLng, endLat, endLng, waypoints);
    if (multiModalCache.has(key)) return 'ready';
    if (failedRoutes.has(key)) return 'failed';
    if (pendingFetches.has(key) || routeAttempts.has(key)) return 'loading';
    return 'idle';
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
    // Never return straight fallbacks from cache
    if (cached && cached.length > 2 && !isStraightLineRoute(cached)) {
        return cached;
    }
    return null;
}

/** True when a rail leg is drawn along roads because the rail network has no connection for it. */
export function isApproximateMultiModalRoute(
    mode: string | undefined,
    startLat: number,
    startLng: number,
    endLat: number,
    endLng: number,
    waypoints?: any[]
): boolean {
    return approximateRoutes.has(buildRouteKey(mode, startLat, startLng, endLat, endLng, waypoints));
}
