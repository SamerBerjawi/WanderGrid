/**
 * Exchange rates for trip expenses: one currency into another on a given day, from Frankfurter (the European
 * Central Bank's reference rates; no key). A past day's rate never changes, so it is cached for a month; today's is
 * kept for six hours. A weekend or holiday gets the last working day's rate, and a date in the future gets the
 * latest. The answer is `{ date, rate }` where `date` is the day the rate is for.
 */

const { fetchUpstream } = require('./upstream');

// api.frankfurter.app is the old address: browsers can no longer fetch it, while this one serves the same data.
const FRANKFURTER = 'https://api.frankfurter.dev/v1';
const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;

const isCurrency = code => /^[A-Za-z]{3}$/.test(String(code || ''));
const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const todayIso = () => new Date().toISOString().slice(0, 10);

/** Frankfurter's `{ date, rates: { USD: 1.08 } }` as `{ date, rate }`, or null when it is not a usable answer. */
function parseRate(body, to) {
    const rate = body && typeof body === 'object' ? Number(body.rates?.[String(to).toUpperCase()]) : NaN;
    const date = typeof body?.date === 'string' && isDay(body.date) ? body.date : null;
    return Number.isFinite(rate) && rate > 0 && date ? { date, rate } : null;
}

/**
 * @returns {Promise<{ ok: true, from: string, to: string, date: string, rate: number } | { ok: false, status: number, error: string }>}
 */
async function getRate(date, from, to, { fetchImpl, now = todayIso } = {}) {
    if (!isDay(date)) return { ok: false, status: 400, error: 'Date must be YYYY-MM-DD' };
    if (!isCurrency(from) || !isCurrency(to)) return { ok: false, status: 400, error: 'Currencies must be three-letter codes' };
    const f = String(from).toUpperCase();
    const t = String(to).toUpperCase();
    if (f === t) return { ok: true, from: f, to: t, date, rate: 1 };

    const today = now();
    const latest = date >= today;
    const when = latest ? 'latest' : date;
    const result = await fetchUpstream({
        key: `fx:${when}:${f}:${t}`,
        url: `${FRANKFURTER}/${when}?base=${f}&symbols=${t}`,
        ttlMs: latest ? 6 * HOUR_MS : 30 * DAY_MS,
        staleMs: 30 * DAY_MS,
        timeoutMs: 6000,
        maxBytes: 64 * 1024,
        hostGate: { minIntervalMs: 100 },
        ...(fetchImpl ? { fetchImpl } : {}),
    });
    if (result.ok) {
        const parsed = parseRate(result.data, t);
        if (parsed) return { ok: true, from: f, to: t, date: parsed.date, rate: parsed.rate };
        return { ok: false, status: 502, error: 'The exchange rate service sent an answer that could not be read.' };
    }
    // 404 and 422: a currency or date it has no rate for.
    if (result.status === 404 || result.status === 422) return { ok: false, status: 404, error: `No rate for ${f} to ${t} on ${date}. Enter one by hand.` };
    return { ok: false, status: 502, error: 'The exchange rate service could not be reached. Enter a rate by hand, or try again later.' };
}

/** Express handler, mounted at /api/proxy/fx/:date?from=EUR&to=USD (the whole /api is behind the session token). */
const handleRate = async (req, res) => {
    const r = await getRate(req.params.date, req.query.from, req.query.to);
    if (!r.ok) return res.status(r.status).json({ error: r.error });
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.json({ from: r.from, to: r.to, date: r.date, rate: r.rate });
};

module.exports = { getRate, handleRate, parseRate, isCurrency, isDay };
