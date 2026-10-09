// Maritime & Sea Routing Engine for WanderGrid
// Calculates real maritime shipping lanes and ferry channels using Eurostat Marnet network

import searoute from 'searoute-js';

export interface SeaRouteResult {
    geometry: [number, number, number][];
    distanceKm: number;
    durationHours: number;
    isRealSeaLane: boolean;
}

// In-memory RAM cache for calculated sea routes
const seaRouteCache = new Map<string, [number, number, number][]>();

/**
 * Executes searoute calculation silently without polluting console logs.
 */
function runSearouteSilently(origin: [number, number], destination: [number, number]): any {
    const originalLog = console.log;
    try {
        console.log = () => {};
        return searoute(origin, destination, 'km');
    } catch {
        return null;
    } finally {
        console.log = originalLog;
    }
}

/**
 * Calculates geodesic spherical points between two coordinates (for smooth coastal water links).
 */
function getSphericalWaterPoints(
    lng1: number,
    lat1: number,
    lng2: number,
    lat2: number,
    numPoints: number = 24
): [number, number, number][] {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const toDeg = (r: number) => (r * 180) / Math.PI;

    const phi1 = toRad(lat1), lam1 = toRad(lng1);
    const phi2 = toRad(lat2), lam2 = toRad(lng2);

    const dLat = phi2 - phi1;
    const dLng = lam2 - lam1;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLng / 2) ** 2;
    const d = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    if (d < 1e-5) {
        return [[lng1, lat1, 0], [lng2, lat2, 0]];
    }

    const pts: [number, number, number][] = [];
    for (let i = 0; i <= numPoints; i++) {
        const f = i / numPoints;
        const A = Math.sin((1 - f) * d) / Math.sin(d);
        const B = Math.sin(f * d) / Math.sin(d);

        const x = A * Math.cos(phi1) * Math.cos(lam1) + B * Math.cos(phi2) * Math.cos(lam2);
        const y = A * Math.cos(phi1) * Math.sin(lam1) + B * Math.cos(phi2) * Math.sin(lam2);
        const z = A * Math.sin(phi1) + B * Math.sin(phi2);

        const curLat = toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)));
        const curLng = toDeg(Math.atan2(y, x));
        pts.push([curLng, curLat, 0]);
    }
    return pts;
}

/**
 * Computes realistic maritime sea routes between coastal/port coordinates.
 * Traces actual navigable shipping and ferry lanes avoiding landmasses.
 */
export async function fetchSeaRoute(
    startLat: number,
    startLng: number,
    endLat: number,
    endLng: number,
    waypoints?: any[]
): Promise<[number, number, number][] | null> {
    const cacheKey = `sea_${startLat.toFixed(3)},${startLng.toFixed(3)}|${endLat.toFixed(3)},${endLng.toFixed(3)}`;
    if (seaRouteCache.has(cacheKey)) {
        return seaRouteCache.get(cacheKey)!;
    }

    // Assemble sequential journey waypoints
    const legPoints: [number, number][] = [[startLng, startLat]];

    if (waypoints && Array.isArray(waypoints)) {
        for (const wp of waypoints) {
            const lat = wp?.coordinates?.lat ?? wp?.lat;
            const lng = wp?.coordinates?.lng ?? wp?.lng;
            if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
                legPoints.push([lng, lat]);
            }
        }
    }
    legPoints.push([endLng, endLat]);

    const fullRoute: [number, number, number][] = [];

    for (let i = 0; i < legPoints.length - 1; i++) {
        const origin = legPoints[i];
        const dest = legPoints[i + 1];

        // 1. Try real maritime shipping route
        const seaFeature = runSearouteSilently(origin, dest);
        if (seaFeature?.geometry?.coordinates && Array.isArray(seaFeature.geometry.coordinates)) {
            const rawCoords: [number, number][] = seaFeature.geometry.coordinates;

            if (rawCoords.length > 0) {
                // Ensure route begins at the origin port
                if (fullRoute.length === 0) {
                    fullRoute.push([origin[0], origin[1], 0]);
                }

                // Append intermediate navigable sea channel coordinates
                for (const c of rawCoords) {
                    const last = fullRoute[fullRoute.length - 1];
                    const distApprox = Math.hypot(c[0] - last[0], c[1] - last[1]);
                    if (distApprox > 0.001) {
                        fullRoute.push([c[0], c[1], 0]);
                    }
                }

                // Connect to destination port
                const last = fullRoute[fullRoute.length - 1];
                if (Math.hypot(dest[0] - last[0], dest[1] - last[1]) > 0.001) {
                    fullRoute.push([dest[0], dest[1], 0]);
                }
                continue;
            }
        }

        // 2. Coastal water fallback (multi-point geodesic curve, never roads or 2-point straight line)
        const curve = getSphericalWaterPoints(origin[0], origin[1], dest[0], dest[1], 24);
        for (const pt of curve) {
            if (fullRoute.length === 0) {
                fullRoute.push(pt);
            } else {
                const last = fullRoute[fullRoute.length - 1];
                if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) > 0.0001) {
                    fullRoute.push(pt);
                }
            }
        }
    }

    if (fullRoute.length > 2) {
        seaRouteCache.set(cacheKey, fullRoute);
        return fullRoute;
    }

    return null;
}
