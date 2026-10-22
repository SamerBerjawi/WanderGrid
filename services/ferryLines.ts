/**
 * Real ferry lines from OpenStreetMap, through the server's route store (it looks the line up once, keeps
 * it, and remembers when no ferry is mapped). Needs the backend: in local mode, or when it can't be reached,
 * this answers null and the caller falls back to a shipping lane or an arc.
 */

const LOCAL_MODE = typeof import.meta !== 'undefined' && !import.meta.env?.PROD && import.meta.env?.VITE_LOCAL_MODE === 'true';

const token = (): Record<string, string> => {
    try { const t = localStorage.getItem('wandergrid_session_token'); return t ? { Authorization: `Bearer ${t}` } : {}; } catch { return {}; }
};

const decodePolyline6 = (str: string): [number, number, number][] => {
    let index = 0, lat = 0, lng = 0;
    const out: [number, number, number][] = [];
    while (index < str.length) {
        let b, shift = 0, result = 0;
        do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        lat += (result & 1) ? ~(result >> 1) : (result >> 1);
        shift = 0; result = 0;
        do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        lng += (result & 1) ? ~(result >> 1) : (result >> 1);
        out.push([lng / 1e6, lat / 1e6, 0]);
    }
    return out;
};

const memory = new Map<string, Promise<[number, number, number][] | null>>();
let unavailable = LOCAL_MODE;

const POLL_MS = 1500;
const MAX_POLLS = 24; // about 36 s: the first lookup of a line asks OpenStreetMap, later ones are instant

/** The mapped ferry line through `coords` ([lng, lat]: from, any stops, to) as [lng, lat, 0] points, or null when there is none. */
export const fetchFerryLine = (coords: [number, number][]): Promise<[number, number, number][] | null> => {
    if (unavailable || coords.length < 2) return Promise.resolve(null);
    const key = coords.map(c => `${c[0].toFixed(4)},${c[1].toFixed(4)}`).join(';');
    const known = memory.get(key);
    if (known) return known;
    const job = (async () => {
        for (let i = 0; i <= MAX_POLLS; i++) {
            let res: Response;
            try {
                res = await fetch('/api/proxy/routes/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json', ...token() }, body: JSON.stringify({ routes: [{ id: 'ferry', mode: 'sea', coords }] }) });
            } catch { unavailable = true; return null; }
            if (!res.ok) { if (res.status === 401 || res.status === 404 || res.status >= 500) unavailable = res.status !== 401; return null; }
            const r = (await res.json())?.results?.ferry;
            if (r?.status === 'ok' && typeof r.geometry === 'string') { const pts = decodePolyline6(r.geometry); return pts.length > 2 ? pts : null; }
            if (r?.status !== 'pending') return null; // none, or the server could not reach OpenStreetMap right now
            await new Promise(done => setTimeout(done, POLL_MS));
        }
        return null;
    })().then(pts => { if (!pts) memory.delete(key); return pts; });
    memory.set(key, job);
    return job;
};
