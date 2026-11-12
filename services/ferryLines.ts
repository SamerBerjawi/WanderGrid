/**
 * Real ferry lines from OpenStreetMap, through the server's route store (it looks the line up once, keeps
 * it, and remembers when no ferry is mapped). Needs the backend: in local mode, or when it can't be reached,
 * this distinguishes temporary errors from missing mapped ferry coverage.
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

export type FerryLine = { status: 'ok'; points: [number, number, number][] } | { status: 'none' } | { status: 'pending' } | { status: 'error' };

const memory = new Map<string, Promise<FerryLine>>();

const POLL_MS = 1500;

/**
 * The mapped ferry line through `coords` ([lng, lat]: from, any stops, to). 'none' means no mapped ferry;
 * 'error' is temporary and is never cached. 'pending' means ask again after `maxPolls` checks;
 * it keeps going meanwhile. The first lookup of a line asks OpenStreetMap; later ones are instant.
 */
export const fetchFerryLine = (coords: [number, number][], maxPolls = 24): Promise<FerryLine> => {
    if (LOCAL_MODE || coords.length < 2) return Promise.resolve({ status: 'none' });
    const key = coords.map(c => `${c[0].toFixed(4)},${c[1].toFixed(4)}`).join(';');
    const known = memory.get(key);
    if (known) return known;
    const job = (async (): Promise<FerryLine> => {
        for (let i = 0; i <= maxPolls; i++) {
            const ctl = new AbortController();
            const timer = setTimeout(() => ctl.abort(), 15_000);
            try {
                const res = await fetch('/api/proxy/routes/resolve', {
                    signal: ctl.signal,
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...token() },
                    body: JSON.stringify({ routes: [{ id: 'ferry', mode: 'sea', coords }] }),
                });
                if (!res.ok) return { status: 'error' };
                const r = (await res.json())?.results?.ferry;
                if (r?.status === 'ok' && typeof r.geometry === 'string') {
                    const pts = decodePolyline6(r.geometry);
                    return pts.length > 2 ? { status: 'ok', points: pts } : { status: 'error' };
                }
                if (r?.status === 'none') return { status: 'none' };
                if (r?.status !== 'pending') return { status: 'error' };
            } catch {
                return { status: 'error' };
            } finally {
                clearTimeout(timer);
            }
            await new Promise(done => setTimeout(done, POLL_MS));
        }
        return { status: 'pending' };
    })().then(r => {
        if (r.status === 'pending' || r.status === 'error') memory.delete(key);
        return r;
    });
    memory.set(key, job);
    return job;
};
