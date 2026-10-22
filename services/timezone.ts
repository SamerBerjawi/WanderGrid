/**
 * Time zones for places that are not airports (a station, a port, a town), so a train from London to
 * Paris or a ferry across a zone line gets its real duration. Looked up once per place from the
 * position (Open-Meteo, which needs no key) and kept in this browser; nothing is blocked on it, and
 * a place whose zone is unknown is simply treated as being on the same clock as the other end.
 */

const KEY = 'wandergrid_place_tz_v1';
const norm = (name: string) => name.trim().toLowerCase();
const byName = new Map<string, string>();

try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.entries(JSON.parse(raw) as Record<string, string>).forEach(([k, v]) => byName.set(k, v));
} catch { /* storage unavailable */ }

const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(byName))); } catch { /* storage unavailable */ } };

/** The zone already found for a place name, if any. */
export const knownZone = (name: string): string | undefined => byName.get(norm(name));

/** Finds and remembers the zone for a place at a position. Resolves to the zone, or undefined when it can't be found. */
export const ensureZone = async (name: string, lat?: number, lng?: number): Promise<string | undefined> => {
    const known = knownZone(name);
    if (known || lat == null || lng == null || !name.trim()) return known;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}&timezone=auto&forecast_days=1&daily=sunrise`, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) return undefined;
        const zone = (await res.json())?.timezone;
        if (typeof zone === 'string' && zone) { byName.set(norm(name), zone); persist(); return zone; }
    } catch { /* offline or blocked: carry on without it */ }
    return undefined;
};
