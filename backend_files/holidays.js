/**
 * Public holiday lookups for the calendar's "Add a country calendar".
 *
 * Primary source: Nager.Date (no key, ~100 countries). Fallback: OpenHolidays (no key, Europe-focused, carries
 * regional data). Either answer is normalised to the same shape, only nationwide public holidays are kept
 * (regional and bank/school days would be wrong to switch on for everyone), and results are cached for a
 * day by `fetchUpstream` (serve-stale when a provider is down), so a calendar is one upstream call per
 * country and year, ever.
 */

const { fetchUpstream } = require('./upstream');

const NAGER = 'https://date.nager.at/api/v3';
const OPEN_HOLIDAYS = 'https://openholidaysapi.org';
const DAY_MS = 24 * 3600 * 1000;
const COUNTRY_CODE = /^[A-Za-z]{2}$/;

const isValidYear = year => Number.isInteger(year) && year >= 1970 && year <= 2100;
const isValidCountryCode = code => COUNTRY_CODE.test(String(code || ''));

const upstream = (key, url, fetchImpl, ttlMs = DAY_MS) =>
    fetchUpstream({ key, url, ttlMs, staleMs: 30 * DAY_MS, timeoutMs: 6000, maxBytes: 1024 * 1024, hostGate: { minIntervalMs: 100 }, ...(fetchImpl ? { fetchImpl } : {}) });

const isoDay = s => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);

const addDays = (iso, n) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};

/** Nager.Date rows to ours; keeps nationwide public holidays only. */
function fromNager(rows, year, code) {
    if (!Array.isArray(rows)) return null;
    let regional = 0;
    const holidays = [];
    for (const r of rows) {
        const date = isoDay(r?.date);
        if (!date || !date.startsWith(String(year))) continue;
        const types = Array.isArray(r.types) && r.types.length ? r.types : ['Public'];
        if (!types.includes('Public')) continue;
        if (r.global === false || (Array.isArray(r.counties) && r.counties.length)) { regional++; continue; }
        holidays.push({ date, name: String(r.name || r.localName || 'Public holiday'), localName: String(r.localName || r.name || '') });
    }
    return { holidays, regionalSkipped: regional };
}

/** OpenHolidays rows to ours; a multi-day holiday (up to a week) becomes one entry per day. */
function fromOpenHolidays(rows, year) {
    if (!Array.isArray(rows)) return null;
    let regional = 0;
    const holidays = [];
    for (const r of rows) {
        const start = isoDay(r?.startDate);
        if (!start) continue;
        if (r.type && r.type !== 'Public') continue;
        if (r.nationwide === false) { regional++; continue; }
        const names = Array.isArray(r.name) ? r.name : [];
        const en = names.find(n => String(n.language).toUpperCase() === 'EN') || names[0];
        const name = String(en?.text || 'Public holiday');
        const end = isoDay(r.endDate) || start;
        for (let i = 0, d = start; d <= end && i < 7; i++, d = addDays(start, i)) {
            if (d.startsWith(String(year))) holidays.push({ date: d, name, localName: name });
        }
    }
    return { holidays, regionalSkipped: regional };
}

/** Keeps the first entry per date and name, sorted by date. */
const tidy = holidays => {
    const seen = new Set();
    return holidays
        .filter(h => { const k = `${h.date}|${h.name}`; if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.name.localeCompare(b.name)));
};

/**
 * @returns {Promise<{ ok: true, countryCode: string, year: number, source: string, holidays: object[], regionalSkipped: number } | { ok: false, status: number, error: string }>}
 */
async function listHolidays(year, countryCode, { fetchImpl } = {}) {
    if (!isValidYear(year)) return { ok: false, status: 400, error: 'Year must be between 1970 and 2100' };
    if (!isValidCountryCode(countryCode)) return { ok: false, status: 400, error: 'Country must be a two-letter code' };
    const code = String(countryCode).toUpperCase();

    const nager = await upstream(`holidays:nager:${year}:${code}`, `${NAGER}/PublicHolidays/${year}/${code}`, fetchImpl);
    if (nager.ok) {
        const parsed = fromNager(nager.data, year, code);
        if (parsed && parsed.holidays.length > 0) return { ok: true, countryCode: code, year, source: 'nager', holidays: tidy(parsed.holidays), regionalSkipped: parsed.regionalSkipped };
    }

    const url = `${OPEN_HOLIDAYS}/PublicHolidays?countryIsoCode=${code}&languageIsoCode=EN&validFrom=${year}-01-01&validTo=${year}-12-31`;
    const fallback = await upstream(`holidays:open:${year}:${code}`, url, fetchImpl);
    if (fallback.ok) {
        const parsed = fromOpenHolidays(fallback.data, year);
        if (parsed && parsed.holidays.length > 0) return { ok: true, countryCode: code, year, source: 'openholidays', holidays: tidy(parsed.holidays), regionalSkipped: parsed.regionalSkipped };
    }

    // Nager answers 404 for a country it does not know; both empty means there is nothing to add.
    const answered = (nager.ok || nager.status === 404) && (fallback.ok || fallback.status === 404);
    return answered
        ? { ok: false, status: 404, error: `No public holidays found for ${code} in ${year}` }
        : { ok: false, status: 502, error: 'The holiday services could not be reached. Try again later.' };
}

/** @returns {Promise<{ ok: true, countries: Array<{ code: string, name: string }> } | { ok: false, status: number, error: string }>} */
async function listCountries({ fetchImpl } = {}) {
    const nager = await upstream('holidays:nager:countries', `${NAGER}/AvailableCountries`, fetchImpl, 7 * DAY_MS);
    if (nager.ok && Array.isArray(nager.data) && nager.data.length > 0) {
        const countries = nager.data.filter(c => isValidCountryCode(c?.countryCode) && c.name).map(c => ({ code: String(c.countryCode).toUpperCase(), name: String(c.name) }));
        if (countries.length > 0) return { ok: true, countries: countries.sort((a, b) => a.name.localeCompare(b.name)) };
    }
    const fallback = await upstream('holidays:open:countries', `${OPEN_HOLIDAYS}/Countries?languageIsoCode=EN`, fetchImpl, 7 * DAY_MS);
    if (fallback.ok && Array.isArray(fallback.data)) {
        const countries = fallback.data
            .map(c => ({ code: String(c?.isoCode || '').toUpperCase(), name: String((c?.name || []).find(n => String(n.language).toUpperCase() === 'EN')?.text || c?.name?.[0]?.text || '') }))
            .filter(c => isValidCountryCode(c.code) && c.name);
        if (countries.length > 0) return { ok: true, countries: countries.sort((a, b) => a.name.localeCompare(b.name)) };
    }
    return { ok: false, status: 502, error: 'The holiday services could not be reached. Try again later.' };
}

/** Express handlers (mounted under /api/proxy/holidays; the whole /api is behind the session token). */
const handleCountries = async (req, res) => {
    const r = await listCountries();
    if (!r.ok) return res.status(r.status).json({ error: r.error });
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return res.json({ countries: r.countries });
};
const handleHolidays = async (req, res) => {
    const r = await listHolidays(Number(req.params.year), req.params.countryCode);
    if (!r.ok) return res.status(r.status).json({ error: r.error });
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.json({ countryCode: r.countryCode, year: r.year, source: r.source, holidays: r.holidays, regionalSkipped: r.regionalSkipped });
};

module.exports = { listHolidays, listCountries, handleCountries, handleHolidays, fromNager, fromOpenHolidays, isValidYear, isValidCountryCode };
