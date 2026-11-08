import { dataService } from './mockDb';

/**
 * Exchange rates for trip expenses: one currency into another on a day, from Frankfurter (the ECB's reference
 * rates, no key). With the server they come from its proxy (`/api/proxy/fx`, cached for a month per past day); in
 * local mode the browser asks Frankfurter directly. A day's rate never changes, so answers are kept on this device
 * (today's rate for six hours), and an expense keeps the rate it was saved with whatever the market does next.
 */

// api.frankfurter.app is the old address: browsers can no longer fetch it, while this one serves the same data.
const FRANKFURTER = 'https://api.frankfurter.dev/v1';
const CACHE_KEY = 'wandergrid_fx_v1';
const MAX_ENTRIES = 400;
const TODAY_TTL_MS = 6 * 3600 * 1000;
const TIMEOUT_MS = 8000;

interface Entry { rate: number; date: string; at: number }
export interface FxRate { rate: number; /** The day the rate is for (an earlier working day for a weekend). */ date: string }

export const rateKey = (day: string, from: string, to: string) => `${day}|${from}|${to}`;

/** A past day's rate is good for ever; today's, for six hours. */
export const isFresh = (entry: Entry, day: string, today: string, now: number): boolean => day < today || now - entry.at < TODAY_TTL_MS;

/** Frankfurter's `{ date, rates: { USD: 1.08 } }` as `{ rate, date }`, or null when it is not a usable answer. */
export const fromFrankfurter = (body: any, to: string): FxRate | null => {
    const rate = Number(body?.rates?.[to.toUpperCase()]);
    const date = typeof body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : '';
    return Number.isFinite(rate) && rate > 0 && date ? { rate, date } : null;
};

const readCache = (): Record<string, Entry> => {
    try { const v = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
};
const writeCache = (cache: Record<string, Entry>) => {
    try {
        const keys = Object.keys(cache);
        // Oldest answers go first when the cache is full.
        if (keys.length > MAX_ENTRIES) keys.sort((a, b) => cache[a].at - cache[b].at).slice(0, keys.length - MAX_ENTRIES).forEach(k => delete cache[k]);
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch { /* storage full or unavailable: the next lookup just asks again */ }
};

const authHeaders = (): Record<string, string> => {
    try { const t = localStorage.getItem('wandergrid_session_token'); return t ? { Authorization: `Bearer ${t}` } : {}; } catch { return {}; }
};

const todayIso = () => new Date().toISOString().slice(0, 10);

/** The rate to turn one `from` into `to` on `day`. Throws a sentence for the person when there is none. */
export const getRate = async (day: string, from: string, to: string, now = Date.now()): Promise<FxRate> => {
    const f = from.trim().toUpperCase(), t = to.trim().toUpperCase();
    if (f === t) return { rate: 1, date: day };
    const today = todayIso();
    const when = day > today ? today : day;
    const key = rateKey(when, f, t);
    const cache = readCache();
    const hit = cache[key];
    if (hit && isFresh(hit, when, today, now)) return { rate: hit.rate, date: hit.date };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let status = 0, body: any = null;
    try {
        const dbMode = dataService.isDatabaseMode();
        const url = dbMode ? `/api/proxy/fx/${when}?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}` : `${FRANKFURTER}/${when === today ? 'latest' : when}?base=${f}&symbols=${t}`;
        const res = await fetch(url, { headers: dbMode ? authHeaders() : {}, signal: controller.signal });
        status = res.status;
        try { body = await res.json(); } catch { /* not JSON */ }
    } catch {
        throw new Error('The exchange rate service could not be reached. Enter a rate by hand, or try again later.');
    } finally {
        clearTimeout(timer);
    }
    // The proxy answers `{ rate, date }`; Frankfurter answers `{ rates: { XXX: n }, date }`.
    const parsed = status === 200 ? (typeof body?.rate === 'number' && body.rate > 0 && typeof body?.date === 'string' ? { rate: body.rate as number, date: body.date as string } : fromFrankfurter(body, t)) : null;
    if (!parsed) {
        throw new Error(status === 404 || status === 422 ? `No rate for ${f} to ${t} on that day. Enter one by hand.` : body?.error || 'No rate came back. Enter one by hand, or try again later.');
    }
    cache[key] = { rate: parsed.rate, date: parsed.date, at: now };
    writeCache(cache);
    return parsed;
};
