// Global airport physical runway coordinates (OurAirports ground truth) — type definitions and zero-dependency loader
export interface PhysicalRunway {
    id: string;
    leIdent: string;
    heIdent: string;
    start: [number, number]; // [lng, lat]
    end: [number, number];   // [lng, lat]
    lengthMeters: number;
    widthMeters: number;
}

// The data itself (OurAirports, ~6k airports) lives in public/data/airport-runways.json and is fetched on
// demand: parsing JSON is far cheaper than compiling a 2 MB JS module (PERF-014).
export const RUNWAY_DATASET_URL = '/data/airport-runways.json';

let runwayDatasetCache: Record<string, PhysicalRunway[]> | null = null;
let runwayLoadingPromise: Promise<Record<string, PhysicalRunway[]>> | null = null;

/**
 * Computes the centroid { lat, lng } of an airport's primary physical runway, or null if invalid.
 */
export function runwayCentroid(rws: PhysicalRunway[] | undefined): { lat: number; lng: number } | null {
    if (!Array.isArray(rws) || rws.length === 0) return null;
    const first = rws[0];
    if (!first || !Array.isArray(first.start) || !Array.isArray(first.end)) return null;
    if (first.start.length < 2 || first.end.length < 2) return null;
    const lng = (Number(first.start[0]) + Number(first.end[0])) / 2;
    const lat = (Number(first.start[1]) + Number(first.end[1])) / 2;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) {
        return null;
    }
    return { lat, lng };
}

/**
 * Asynchronously loads the physical runway dataset on demand, caching it in memory.
 */
export async function getPhysicalRunways(): Promise<Record<string, PhysicalRunway[]>> {
    if (runwayDatasetCache) return runwayDatasetCache;
    if (!runwayLoadingPromise) {
        runwayLoadingPromise = fetch(RUNWAY_DATASET_URL)
            .then(res => {
                if (!res.ok) throw new Error(`Runway dataset unavailable (HTTP ${res.status})`);
                return res.json() as Promise<Record<string, PhysicalRunway[]>>;
            })
            .then(data => {
                runwayDatasetCache = data;
                return data;
            })
            .catch(err => {
                runwayLoadingPromise = null; // allow a retry later
                throw err;
            });
    }
    return runwayLoadingPromise;
}

/**
 * Returns the currently cached physical runway dataset synchronously, or null if not yet loaded.
 */
export function getPhysicalRunwaysSync(): Record<string, PhysicalRunway[]> | null {
    return runwayDatasetCache;
}

/**
 * Synchronously resolves an IATA code's runway centroid if the runway dataset is already loaded.
 */
export function getAirportRunwayCentroidSync(iata: string): { lat: number; lng: number } | null {
    if (!runwayDatasetCache) return null;
    const code = (iata || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) return null;
    return runwayCentroid(runwayDatasetCache[code]);
}

/**
 * Loads the physical runway dataset if needed and returns the IATA code's runway centroid.
 */
export async function getAirportRunwayCentroid(iata: string): Promise<{ lat: number; lng: number } | null> {
    const code = (iata || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) return null;
    if (!runwayDatasetCache) {
        await getPhysicalRunways().catch(() => null);
    }
    return getAirportRunwayCentroidSync(code);
}

/**
 * Test helper to seed or reset the cached physical runway dataset deterministically.
 */
export function __setPhysicalRunwaysForTest(data: Record<string, PhysicalRunway[]> | null): void {
    runwayDatasetCache = data;
    runwayLoadingPromise = null;
}
