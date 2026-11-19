/**
 * The browser's copy of the server's airport table (GET /api/airports/index, built from live public datasets by
 * backend_files/airportData.js). It replaces the hand-kept airport tables the app used to ship.
 *
 * Lookups are synchronous (the map, achievements and entry checks ask while rendering), so the table is kept in
 * memory and saved in IndexedDB: a returning visitor has it within a few milliseconds of start-up, and the server
 * is only asked whether it changed (ETag). Until the first copy arrives lookups return undefined and callers use
 * the position saved on the flight. When a copy arrives, `wandergrid_metadata_resolved` is dispatched so views
 * redraw with the fuller data.
 */

export interface AirportRef {
    iata: string;
    icao: string;
    /** Airport name ("Luqa International"); empty for city codes such as LON */
    name: string;
    city: string;
    lat?: number;
    lng?: number;
    /** ISO 3166-1 alpha-2, or the UK nation (GB-ENG, GB-SCT, GB-WLS, GB-NIR) like the rest of the app */
    countryCode: string;
    country: string;
    tz: string;
    /** OurAirports type: large_airport, medium_airport, small_airport, heliport, ... (empty when unknown) */
    kind: string;
}

type IndexRow = [string, string, string, string, number | null, number | null, string, string, string, string?];

const DB_NAME = 'wandergrid_airports';
const STORE = 'index';
const KEY = 'v1';

const airports = new Map<string, AirportRef>();
let loadPromise: Promise<void> | null = null;
let generation = 0;

/** Changes whenever the table is replaced, so memoised derivatives (placeSearch's local tier) can rebuild. */
export const airportIndexGeneration = (): number => generation;

const fromRow = (r: IndexRow): AirportRef | null => {
    if (!Array.isArray(r) || typeof r[0] !== 'string' || !/^[A-Z]{3}$/.test(r[0])) return null;
    const lat = typeof r[4] === 'number' && Number.isFinite(r[4]) ? r[4] : undefined;
    const lng = typeof r[5] === 'number' && Number.isFinite(r[5]) ? r[5] : undefined;
    return {
        iata: r[0], icao: r[1] || '', name: r[2] || '', city: r[3] || '',
        lat: lat !== undefined && lng !== undefined ? lat : undefined,
        lng: lat !== undefined && lng !== undefined ? lng : undefined,
        countryCode: r[6] || '', country: r[7] || '', tz: r[8] || '', kind: r[9] || '',
    };
};

function apply(rows: IndexRow[]): boolean {
    if (!Array.isArray(rows) || rows.length === 0) return false;
    airports.clear();
    generation++;
    for (const row of rows) {
        const ap = fromRow(row);
        if (ap) airports.set(ap.iata, ap);
    }
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wandergrid_metadata_resolved', { detail: { type: 'airports' } }));
    }
    return airports.size > 0;
}

/** The airport for an IATA code ("MLA"), or undefined while the table is loading or for an unknown code. */
export function getAirport(code: string | undefined | null): AirportRef | undefined {
    const c = String(code || '').trim().toUpperCase();
    return /^[A-Z]{3}$/.test(c) ? airports.get(c) : undefined;
}

/** True when the airport has a usable position. */
export const hasPosition = (ap: AirportRef | undefined): ap is AirportRef & { lat: number; lng: number } =>
    !!ap && typeof ap.lat === 'number' && typeof ap.lng === 'number';

export const airportCount = (): number => airports.size;

export function allAirports(): IterableIterator<AirportRef> {
    return airports.values();
}

/** Airports matching a typed query: exact code first, then code prefix, city and airport name. */
export function searchAirports(query: string, limit = 15): AirportRef[] {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const scored: Array<{ ap: AirportRef; score: number }> = [];
    for (const ap of airports.values()) {
        const code = ap.iata.toLowerCase();
        const city = ap.city.toLowerCase();
        const name = ap.name.toLowerCase();
        let score = 0;
        if (code === q) score = 1;
        else if (code.startsWith(q)) score = 2;
        else if (city === q) score = 3;
        else if (city.startsWith(q)) score = 4;
        else if (name.startsWith(q)) score = 5;
        else if (city.includes(q) || name.includes(q)) score = 6;
        if (!score) continue;
        // Places with a position (real airports) before city codes and unplaced entries
        scored.push({ ap, score: score + (hasPosition(ap) ? 0 : 0.5) });
    }
    scored.sort((a, b) => a.score - b.score || a.ap.city.localeCompare(b.ap.city));
    return scored.slice(0, limit).map(s => s.ap);
}

// ---------- persistence (IndexedDB) ----------

interface Stored { etag: string | null; rows: IndexRow[] }

function openDb(): Promise<IDBDatabase | null> {
    return new Promise(resolve => {
        try {
            if (typeof indexedDB === 'undefined') return resolve(null);
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}

async function readStored(): Promise<Stored | null> {
    const db = await openDb();
    if (!db) return null;
    return new Promise(resolve => {
        try {
            const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
            req.onsuccess = () => { db.close(); resolve((req.result as Stored) || null); };
            req.onerror = () => { db.close(); resolve(null); };
        } catch {
            db.close();
            resolve(null);
        }
    });
}

async function writeStored(value: Stored): Promise<void> {
    const db = await openDb();
    if (!db) return;
    await new Promise<void>(resolve => {
        try {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(value, KEY);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); resolve(); };
        } catch {
            db.close();
            resolve();
        }
    });
}

/**
 * Loads the saved copy, then asks the server whether there is a newer one. Safe to call repeatedly; pass
 * `force` after an airport data refresh to fetch again.
 */
export function loadAirportIndex(force = false): Promise<void> {
    if (loadPromise && !force) return loadPromise;
    loadPromise = (async () => {
        const stored = await readStored();
        if (stored?.rows?.length && airports.size === 0) apply(stored.rows);
        try {
            const token = typeof localStorage !== 'undefined' ? localStorage.getItem('wandergrid_session_token') : null;
            const localMode = !import.meta.env.PROD && import.meta.env.VITE_LOCAL_MODE === 'true';
            // Signed out: nothing to ask yet (dataService calls loadAirportIndex() again after sign-in)
            if (!token && !localMode) { loadPromise = null; return; }
            const headers: Record<string, string> = {};
            if (token) headers.Authorization = `Bearer ${token}`;
            if (stored?.etag && stored.rows?.length) headers['If-None-Match'] = stored.etag;
            const res = await fetch('/api/airports/index', { headers, signal: AbortSignal.timeout(20000) });
            if (res.status === 401 || res.status === 403 || res.status === 503) loadPromise = null; // try again after sign-in / once loaded
            if (res.status === 304 || !res.ok) return;
            const body = await res.json();
            if (body && Array.isArray(body.rows) && apply(body.rows)) {
                await writeStored({ etag: res.headers.get('ETag'), rows: body.rows });
            }
        } catch {
            // Offline or not signed in yet: keep the saved copy (if any) and try again on the next start
        }
    })();
    return loadPromise;
}

/** Tests: replace the table with known rows (or clear it with null). */
export function __setAirportIndexForTest(rows: AirportRef[] | null): void {
    airports.clear();
    generation++;
    for (const ap of rows || []) airports.set(ap.iata.toUpperCase(), ap);
}

if (typeof window !== 'undefined' && import.meta.env?.MODE !== 'test') {
    // dataService calls loadAirportIndex() again after sign-in, when the first request had no session yet.
    void loadAirportIndex();
}
