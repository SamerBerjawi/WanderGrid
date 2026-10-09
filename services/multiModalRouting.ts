// Multi-Modal Route Intelligence for WanderGrid: Rail (OSM Tracks) & Highways (OSRM)
import { STATIC_GEO_DATA } from './geocoding';

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

/**
 * Lightweight concurrency-managed execution queue to prevent rate-limit throttling
 * and connection exhaustion when dozens of route legs load simultaneously.
 */
class RouteRequestQueue {
    private queue: (() => Promise<void>)[] = [];
    private activeCount = 0;
    private maxConcurrency = 2;
    private delayBetweenRequests = 80;

    enqueue<T>(task: () => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    const result = await task();
                    resolve(result);
                } catch (err) {
                    reject(err);
                }
            });
            this.processNext();
        });
    }

    private async processNext() {
        if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) {
            return;
        }

        const nextTask = this.queue.shift();
        if (!nextTask) return;

        this.activeCount++;
        try {
            await nextTask();
        } finally {
            this.activeCount--;
            if (this.delayBetweenRequests > 0) {
                setTimeout(() => this.processNext(), this.delayBetweenRequests);
            } else {
                this.processNext();
            }
        }
    }
}

const routeQueue = new RouteRequestQueue();

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
 * Fetches realistic rail geometry from BRouter Rail profile or OpenStreetMap.
 */
export async function fetchRailGeometry(
    startLat: number,
    startLng: number,
    endLat: number,
    endLng: number
): Promise<[number, number, number][] | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
        const brouterUrl = `https://brouter.de/brouter?lonlats=${startLng.toFixed(5)},${startLat.toFixed(5)}|${endLng.toFixed(5)},${endLat.toFixed(5)}&profile=rail&alternativeidx=0&format=geojson`;
        const res = await fetch(brouterUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
            const text = await res.text();
            try {
                const data = JSON.parse(text);
                if (data?.features?.[0]?.geometry?.coordinates) {
                    const coords: [number, number][] = data.features[0].geometry.coordinates;
                    if (coords.length > 2) {
                        return coords.map(c => [c[0], c[1], 0]);
                    }
                }
            } catch {
                // Non-JSON response from brouter (e.g. plain text "no track found")
            }
        }
    } catch {
    } finally {
        clearTimeout(timeoutId);
    }

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
 * Real routing via backend FOSSGIS / OSRM proxy (P-02) with direct public OSRM fallback.
 */
export async function fetchRoute(
    profile: 'car' | 'bike' | 'foot' = 'car',
    coords: [number, number][] // [[lng, lat], ...]
): Promise<RouteResult | null> {
    if (!coords || coords.length < 2) return null;
    const coordsStr = coords.map(([lng, lat]) => `${lng},${lat}`).join(';');

    // 1. Backend proxy attempt
    try {
        const proxyController = new AbortController();
        const proxyTimeout = setTimeout(() => proxyController.abort(), 10000);
        const res = await fetch(
            `/api/proxy/route?profile=${encodeURIComponent(profile)}&coords=${encodeURIComponent(coordsStr)}`,
            { signal: proxyController.signal }
        );
        clearTimeout(proxyTimeout);

        if (res.ok) {
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
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
        }
    } catch {
        // Fallback to direct routing if backend proxy is unavailable
    }

    // 2. Direct public OSRM fallback if backend proxy is unreachable or returned non-200
    try {
        const osrmProfile = profile === 'bike' ? 'routed-bike/route/v1/bicycle' : profile === 'foot' ? 'routed-foot/route/v1/foot' : 'routed-car/route/v1/driving';
        const osrmUrl = `https://routing.openstreetmap.de/${osrmProfile}/${coordsStr}?overview=full&geometries=geojson&alternatives=false&steps=false`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
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

    // 3. Resilient BRouter car-fast fallback when OSRM is offline or unreachable
    if (profile === 'car' && coords.length === 2) {
        try {
            const brouterUrl = `https://brouter.de/brouter?lonlats=${coords[0][0].toFixed(5)},${coords[0][1].toFixed(5)}|${coords[1][0].toFixed(5)},${coords[1][1].toFixed(5)}&profile=car-fast&alternativeidx=0&format=geojson`;
            const bController = new AbortController();
            const bTimeout = setTimeout(() => bController.abort(), 9000);
            const bRes = await fetch(brouterUrl, { signal: bController.signal });
            clearTimeout(bTimeout);
            if (bRes.ok) {
                const bData = await bRes.json();
                const coordsArr = bData?.features?.[0]?.geometry?.coordinates;
                if (Array.isArray(coordsArr) && coordsArr.length > 2) {
                    const geometry: [number, number, number][] = coordsArr.map((c: [number, number]) => [c[0], c[1], 0]);
                    const distMeters = bData.features[0].properties?.['track-length'] || 0;
                    return {
                        geometry,
                        distanceKm: Math.round(distMeters / 1000),
                        durationMin: Math.round((distMeters / 1000) / 80 * 60),
                        attribution: '© OpenStreetMap contributors, BRouter',
                        isFallback: false
                    };
                }
            }
        } catch {}
    }

    // Fallback: direct connection points
    return {
        geometry: coords.map(([lng, lat]) => [lng, lat, 0]),
        distanceKm: 0,
        durationMin: 0,
        isFallback: true
    };
}

/**
 * Fetches highway road geometry from backend routing proxy or OSRM.
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
 * Unified Multi-Modal Geometry Dispatcher (Road & Rail only) with queue management.
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

    if (!isTrain && !isRoad) {
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

    return routeQueue.enqueue(async () => {
        try {
            // 1. Train / Rail: try rail first, then smoothly fall back to highway
            if (isTrain) {
                const railGeom = await fetchRailGeometry(startLat, startLng, endLat, endLng);
                if (railGeom && railGeom.length > 2) {
                    saveRouteToCache(key, railGeom);
                    onDone();
                    return railGeom;
                }
                const roadFallback = await fetchHighwayGeometry(startLat, startLng, endLat, endLng, waypoints);
                if (roadFallback && roadFallback.length > 2) {
                    saveRouteToCache(key, roadFallback);
                    onDone();
                    return roadFallback;
                }
            }
            // 2. Driving / Road / Bus
            else if (isRoad) {
                const highwayGeom = await fetchHighwayGeometry(startLat, startLng, endLat, endLng, waypoints);
                if (highwayGeom && highwayGeom.length > 2) {
                    saveRouteToCache(key, highwayGeom);
                    onDone();
                    return highwayGeom;
                }
            }
        } catch (e) {
            console.warn('Multi-modal route fetch failed:', e);
        } finally {
            pendingFetches.delete(key);
        }

        return null;
    });
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

    if (!isTrain && !isRoad) {
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
