/**
 * The browser's copy of the server's airline table (GET /api/carriers/index, built from IATA's register and
 * OpenFlights by backend_files/carrierData.js). It replaces the top-50 airline list the app used to ship and the two
 * files every browser used to download from GitHub.
 *
 * Works like services/airportIndex.ts: lookups are synchronous (names are drawn while rendering), so the table is
 * kept in memory and saved in IndexedDB, and the server is only asked whether it changed (ETag). Until the first copy
 * arrives lookups return undefined and callers fall back to the per-code lookup. When a copy arrives,
 * `wandergrid_metadata_resolved` is dispatched with type 'carriers' so views redraw with the names.
 */

export interface CarrierRef {
    /** IATA designator ("KM") */
    iata: string;
    /** ICAO designator ("KMM"); empty when unknown */
    icao: string;
    /** Name to show ("KM Malta Airlines"), already cleaned of legal suffixes on the server */
    name: string;
    country: string;
    /** OpenFlights' active flag; undefined when OpenFlights does not know the airline */
    active?: boolean;
}

type IndexRow = [string, string, string, string, (0 | 1 | null)?];

const DB_NAME = 'wandergrid_carriers';
const STORE = 'index';
const KEY = 'v1';

const carriers = new Map<string, CarrierRef>();
const byIcao = new Map<string, string>();
let loadPromise: Promise<void> | null = null;

const fromRow = (r: IndexRow): CarrierRef | null => {
    if (!Array.isArray(r) || typeof r[0] !== 'string' || !/^[A-Z0-9]{2}$/.test(r[0])) return null;
    return {
        iata: r[0], icao: r[1] || '', name: r[2] || '', country: r[3] || '',
        active: r[4] === 1 ? true : r[4] === 0 ? false : undefined,
    };
};

function index(list: Iterable<CarrierRef>): void {
    carriers.clear();
    byIcao.clear();
    for (const c of list) {
        carriers.set(c.iata, c);
        // Several airlines can have used one ICAO code; an active one wins
        if (c.icao && (!byIcao.has(c.icao) || (c.active && !carriers.get(byIcao.get(c.icao)!)?.active))) byIcao.set(c.icao, c.iata);
    }
}

function apply(rows: IndexRow[]): boolean {
    if (!Array.isArray(rows) || rows.length === 0) return false;
    index(rows.map(fromRow).filter((c): c is CarrierRef => !!c));
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wandergrid_metadata_resolved', { detail: { type: 'carriers' } }));
    }
    return carriers.size > 0;
}

/** The airline for an IATA code ("KM"), or undefined while the table is loading or for an unknown code. */
export function getCarrier(code: string | undefined | null): CarrierRef | undefined {
    const c = String(code || '').trim().toUpperCase();
    return /^[A-Z0-9]{2}$/.test(c) ? carriers.get(c) : undefined;
}

/** The IATA code for an ICAO airline code ("KMM" -> "KM"), or undefined when unknown. */
export function carrierIataForIcao(icao: string | undefined | null): string | undefined {
    const c = String(icao || '').trim().toUpperCase();
    return /^[A-Z]{3}$/.test(c) ? byIcao.get(c) : undefined;
}

export const carrierCount = (): number => carriers.size;

/** Airlines matching a typed query: exact code first, then code prefix, name start and name. */
export function searchCarriers(query: string, limit = 15): CarrierRef[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const scored: Array<{ c: CarrierRef; score: number }> = [];
    for (const c of carriers.values()) {
        const code = c.iata.toLowerCase();
        const name = c.name.toLowerCase();
        let score = 0;
        if (code === q || c.icao.toLowerCase() === q) score = 1;
        else if (code.startsWith(q)) score = 2;
        else if (name === q) score = 3;
        else if (name.startsWith(q)) score = 4;
        else if (q.length >= 2 && name.includes(q)) score = 5;
        if (!score) continue;
        // Airlines still flying before defunct ones
        scored.push({ c, score: score + (c.active === false ? 0.5 : 0) });
    }
    scored.sort((a, b) => a.score - b.score || a.c.name.localeCompare(b.c.name));
    return scored.slice(0, limit).map(s => s.c);
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
 * `force` after a data refresh to fetch again.
 */
export function loadCarrierIndex(force = false): Promise<void> {
    if (loadPromise && !force) return loadPromise;
    loadPromise = (async () => {
        const stored = await readStored();
        if (stored?.rows?.length && carriers.size === 0) apply(stored.rows);
        try {
            const token = typeof localStorage !== 'undefined' ? localStorage.getItem('wandergrid_session_token') : null;
            const localMode = !import.meta.env.PROD && import.meta.env.VITE_LOCAL_MODE === 'true';
            // Signed out: nothing to ask yet (dataService calls loadCarrierIndex() again after sign-in)
            if (!token && !localMode) { loadPromise = null; return; }
            const headers: Record<string, string> = {};
            if (token) headers.Authorization = `Bearer ${token}`;
            if (stored?.etag && stored.rows?.length) headers['If-None-Match'] = stored.etag;
            const res = await fetch('/api/carriers/index', { headers, signal: AbortSignal.timeout(20000) });
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

/** Tests: replace the table with known airlines (or clear it with null). */
export function __setCarrierIndexForTest(list: CarrierRef[] | null): void {
    index((list || []).map(c => ({ ...c, iata: c.iata.toUpperCase(), icao: (c.icao || '').toUpperCase() })));
}

if (typeof window !== 'undefined' && import.meta.env?.MODE !== 'test') {
    // dataService calls loadCarrierIndex() again after sign-in, when the first request had no session yet.
    void loadCarrierIndex();
}
