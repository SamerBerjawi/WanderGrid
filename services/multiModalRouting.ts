// Multi-Modal Route Intelligence for WanderGrid: Rail (OSM Tracks) & Highways (OSRM)
import { STATIC_GEO_DATA } from './geocoding';

// Global In-Memory RAM Cache for Multi-Modal Geometries
const multiModalCache = new Map<string, [number, number, number][]>();
const pendingFetches = new Set<string>();

const STORAGE_KEY = 'wandergrid_overland_routes_v2';

// Load stored routes from persistent storage on startup
try {
    if (typeof window !== 'undefined') {
        // Clean legacy caches
        localStorage.removeItem('wandergrid_multimodal_routes_v1');
        
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            Object.entries(parsed).forEach(([k, v]) => {
                multiModalCache.set(k, v as [number, number, number][]);
            });
        }
    }
} catch (e) {
    console.warn('Failed to load multi-modal route cache:', e);
}

const saveRouteToCache = (key: string, points: [number, number, number][]) => {
    multiModalCache.set(key, points);
    try {
        if (typeof window !== 'undefined') {
            const data: Record<string, [number, number, number][]> = {};
            // Keep most recent 500 routes
            let count = 0;
            multiModalCache.forEach((val, k) => {
                if (count < 500) {
                    data[k] = val;
                    count++;
                }
            });
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        }
    } catch (e) {}
};

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
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
        const brouterUrl = `https://brouter.de/brouter?lonlats=${startLng.toFixed(5)},${startLat.toFixed(5)}|${endLng.toFixed(5)},${endLat.toFixed(5)}&profile=rail&alternativeidx=0&format=geojson`;
        const res = await fetch(brouterUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
            const data = await res.json();
            if (data?.features?.[0]?.geometry?.coordinates) {
                const coords: [number, number][] = data.features[0].geometry.coordinates;
                return coords.map(c => [c[0], c[1], 0]);
            }
        }
    } catch (e) {
    } finally {
        clearTimeout(timeoutId);
    }

    return null;
}

/**
 * Fetches highway road geometry from OSRM.
 */
export async function fetchHighwayGeometry(
    startLat: number,
    startLng: number,
    endLat: number,
    endLng: number
): Promise<[number, number, number][] | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
            const data = await res.json();
            if (data?.routes?.[0]?.geometry?.coordinates) {
                const coords: [number, number][] = data.routes[0].geometry.coordinates;
                return coords.map(c => [c[0], c[1], 0]);
            }
        }
    } catch (e) {
    } finally {
        clearTimeout(timeoutId);
    }

    return null;
}

/**
 * Unified Multi-Modal Geometry Dispatcher (Road & Rail only)
 */
export async function fetchMultiModalRoute(
    mode: string | undefined,
    startLat: number,
    startLng: number,
    endLat: number,
    endLng: number,
    onDone: () => void
): Promise<[number, number, number][] | null> {
    const cleanMode = (mode || '').toLowerCase();
    const isTrain = cleanMode.includes('train') || cleanMode.includes('rail');
    const isRoad = cleanMode.includes('car') || cleanMode.includes('drive') || cleanMode.includes('bus') || cleanMode.includes('road') || cleanMode.includes('taxi');

    if (!isTrain && !isRoad) {
        return null;
    }

    const key = `${cleanMode}_${startLat.toFixed(3)},${startLng.toFixed(3)}|${endLat.toFixed(3)},${endLng.toFixed(3)}`;

    if (multiModalCache.has(key)) {
        return multiModalCache.get(key)!;
    }

    if (pendingFetches.has(key)) {
        return null;
    }

    pendingFetches.add(key);

    try {
        // 1. Train / Rail
        if (isTrain) {
            const railGeom = await fetchRailGeometry(startLat, startLng, endLat, endLng);
            if (railGeom && railGeom.length > 1) {
                saveRouteToCache(key, railGeom);
                onDone();
                return railGeom;
            }
            const roadFallback = await fetchHighwayGeometry(startLat, startLng, endLat, endLng);
            if (roadFallback && roadFallback.length > 1) {
                saveRouteToCache(key, roadFallback);
                onDone();
                return roadFallback;
            }
        }

        // 2. Driving / Road / Bus
        else if (isRoad) {
            const highwayGeom = await fetchHighwayGeometry(startLat, startLng, endLat, endLng);
            if (highwayGeom && highwayGeom.length > 1) {
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
}

export function getCachedMultiModalRoute(
    mode: string | undefined,
    startLat: number,
    startLng: number,
    endLat: number,
    endLng: number
): [number, number, number][] | null {
    const cleanMode = (mode || '').toLowerCase();
    const isTrain = cleanMode.includes('train') || cleanMode.includes('rail');
    const isRoad = cleanMode.includes('car') || cleanMode.includes('drive') || cleanMode.includes('bus') || cleanMode.includes('road') || cleanMode.includes('taxi');

    if (!isTrain && !isRoad) {
        return null;
    }

    const key = `${cleanMode}_${startLat.toFixed(3)},${startLng.toFixed(3)}|${endLat.toFixed(3)},${endLng.toFixed(3)}`;
    return multiModalCache.get(key) || null;
}
