/**
 * Flight lookup by flight number and date (what Flighty or ByAir do when you type "ME215").
 *
 * Several sources are asked at once and their answers merged, best first:
 *
 *   1. FlightStats (keyless): the public JSON behind flightstats.com's flight tracker. Schedule, gates and
 *      terminals, delays, aircraft, tail number and, in the air, the live position. It only holds flights
 *      from about three days back to about three days ahead. It is an undocumented endpoint with no
 *      contract, so it can change or block without notice; set FLIGHT_LOOKUP_FLIGHTSTATS=off to disable it.
 *   2. AeroDataBox (free RapidAPI tier, needs the workspace key): schedules months ahead and back.
 *   3. AviationStack (free key): real-time flights only on its free plan.
 *   4. ADSBdb (keyless): the airline and route a flight number flies (BEY to BRU). No times, so the
 *      result says so and the caller asks for them.
 *
 * Every source has a timeout, goes through the shared upstream helper (cache, de-duplication, serve
 * stale on failure) and sits behind a circuit breaker: a source that keeps failing is skipped for a
 * few minutes instead of slowing every lookup. The answer lists what each source said, so the app can
 * tell the person why nothing was found.
 */

const { fetchUpstream } = require('./upstream.js');
const { IATA_TO_ICAO } = require('./carrierMapping.js');

const ICAO_TO_IATA = new Map([...IATA_TO_ICAO.entries()].map(([iata, icao]) => [icao, iata]));

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const DAY = 86400000;

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

/**
 * "ME215", "me 215", "ME-0215", "MEA215" (the callsign form) and "6E 123" all become a carrier and a number.
 * A three-letter carrier is an ICAO code and is mapped back to its IATA code when it is known.
 */
function parseFlightNumber(input) {
    const clean = String(input || '').toUpperCase().replace(/[\s\-_.]/g, '');
    if (!clean) return null;
    let carrier = '';
    let number = '';
    let m;
    if ((m = clean.match(/^([A-Z][A-Z0-9]|[0-9][A-Z])(\d{1,4})[A-Z]?$/))) {
        [, carrier, number] = m;
    } else if ((m = clean.match(/^([A-Z]{3})(\d{1,4})[A-Z]?$/))) {
        const iata = ICAO_TO_IATA.get(m[1]);
        if (!iata) return null;
        carrier = iata;
        number = m[2];
    } else {
        return null;
    }
    number = number.replace(/^0+(?=\d)/, '');
    if (!carrier || !number || Number(number) === 0) return null;
    return { carrier, number, iata: `${carrier}${number}`, icao: IATA_TO_ICAO.get(carrier) ? `${IATA_TO_ICAO.get(carrier)}${number}` : '' };
}

const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/* ------------------------------------------------------------------ */
/* Circuit breaker                                                     */
/* ------------------------------------------------------------------ */

const breakers = new Map();
const BREAKER_FAILURES = 3;
const BREAKER_OPEN_MS = 5 * 60 * 1000;

function breakerOpen(name, now = Date.now()) {
    const b = breakers.get(name);
    return Boolean(b && b.openUntil > now);
}
function recordOutcome(name, ok, now = Date.now()) {
    const b = breakers.get(name) || { failures: 0, openUntil: 0 };
    if (ok) { b.failures = 0; b.openUntil = 0; }
    else { b.failures += 1; if (b.failures >= BREAKER_FAILURES) b.openUntil = now + BREAKER_OPEN_MS; }
    breakers.set(name, b);
}
function resetBreakers() { breakers.clear(); }

/* ------------------------------------------------------------------ */
/* Normalised shape                                                    */
/* ------------------------------------------------------------------ */

/** Times are local to their airport as "YYYY-MM-DDTHH:mm" (what the app stores), with UTC alongside. */
const local = (s) => (s ? String(s).slice(0, 16) : null);
const utc = (s) => (s ? new Date(s).toISOString() : null);
const minutesBetween = (a, b) => (a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 60000) : null);
const toKnots = (mph) => Math.round(mph * 0.868976);

function emptyEnd() {
    return { iata: '', icao: '', name: '', city: '', country: '', timezone: '', terminal: '', gate: '', baggage: '', scheduledLocal: null, scheduledUtc: null, estimatedLocal: null, estimatedUtc: null, actualLocal: null, actualUtc: null, delay: 0 };
}

/* ------------------------------------------------------------------ */
/* FlightStats                                                         */
/* ------------------------------------------------------------------ */

const FS_STATUS = { S: 'scheduled', A: 'active', L: 'landed', C: 'cancelled', D: 'diverted', R: 'diverted', U: 'unknown', NO: 'unknown', DN: 'unknown' };

/** One FlightStats flight-tracker payload as a candidate, or null when it holds no flight. */
function normalizeFlightStats(payload, fallback = {}) {
    const d = payload && payload.data;
    if (!d || !d.schedule || !d.departureAirport || !d.arrivalAirport) return null;
    const sch = d.schedule;
    const dep = { ...emptyEnd() };
    const arr = { ...emptyEnd() };
    const fill = (end, ap, sched, schedUtc, est, estUtc, actualFlag, delay) => {
        end.iata = ap.iata || ap.fs || '';
        end.name = ap.name || '';
        end.city = ap.city || '';
        end.country = ap.country || '';
        end.timezone = ap.timeZoneRegionName || '';
        end.terminal = ap.terminal || '';
        end.gate = ap.gate || '';
        end.baggage = ap.baggage || '';
        end.scheduledLocal = local(sched);
        end.scheduledUtc = utc(schedUtc);
        const isActual = actualFlag === 'Actual';
        if (est) { if (isActual) { end.actualLocal = local(est); end.actualUtc = utc(estUtc); } else { end.estimatedLocal = local(est); end.estimatedUtc = utc(estUtc); } }
        end.delay = Number(delay) || 0;
    };
    fill(dep, d.departureAirport, sch.scheduledDeparture, sch.scheduledDepartureUTC, sch.estimatedActualDeparture, sch.estimatedActualDepartureUTC, sch.estimatedActualDepartureTitle, d.status?.delay?.departure?.minutes);
    fill(arr, d.arrivalAirport, sch.scheduledArrival, sch.scheduledArrivalUTC, sch.estimatedActualArrival, sch.estimatedActualArrivalUTC, sch.estimatedActualArrivalTitle, d.status?.delay?.arrival?.minutes);

    const track = d.positional?.flexTrack;
    const p = Array.isArray(track?.positions) && track.positions.length ? track.positions[0] : null;
    const note = d.flightNote || {};
    let status = FS_STATUS[d.status?.statusCode] || 'unknown';
    if (note.canceled) status = 'cancelled';
    else if (note.landed || sch.isLanded) status = 'landed';
    else if (note.hasDepartedRunway || note.hasDepartedGate) status = status === 'diverted' ? status : 'active';

    return {
        source: 'flightstats',
        sourceLabel: 'FlightStats',
        confidence: 'schedule',
        flightIata: `${d.resultHeader?.carrier?.fs || fallback.carrier || ''}${d.resultHeader?.flightNumber || fallback.number || ''}`,
        airline: { name: d.resultHeader?.carrier?.name || d.ticketHeader?.carrier?.name || '', iata: d.resultHeader?.carrier?.fs || fallback.carrier || '', icao: '' },
        status,
        statusText: d.status?.statusDescription || d.status?.status || '',
        departure: dep,
        arrival: arr,
        aircraft: { model: d.additionalFlightInfo?.equipment?.name || '', registration: track?.tailNumber || '' },
        durationMinutes: minutesBetween(dep.actualUtc || dep.estimatedUtc || dep.scheduledUtc, arr.actualUtc || arr.estimatedUtc || arr.scheduledUtc),
        live: p ? { lat: p.lat, lng: p.lon, altitudeFt: p.altitudeFt ?? null, speedKn: p.speedMph != null ? toKnots(p.speedMph) : null, heading: p.course != null ? (Math.round(p.course) + 360) % 360 : null, updated: p.lastObserved || p.date || null, onGround: (p.altitudeFt ?? 1) <= 0 } : null,
    };
}

/** FlightStats keeps about three days either side of today; asking further out only draws a block. */
const FS_RANGE_DAYS = 10;

async function lookupFlightStats(parsed, date, ctx) {
    if (Math.abs(Date.parse(`${date}T12:00:00Z`) - ctx.now) > FS_RANGE_DAYS * DAY) return { ok: true, skipped: 'Outside its date range', candidates: [] };
    const [y, m, d] = date.split('-');
    const near = Math.abs(Date.parse(`${date}T12:00:00Z`) - ctx.now) < 2 * DAY;
    const r = await fetchUpstream({
        key: `fs:${parsed.iata}:${date}`,
        url: `https://www.flightstats.com/v2/api-next/flight-tracker/${encodeURIComponent(parsed.carrier)}/${encodeURIComponent(parsed.number)}/${y}/${Number(m)}/${Number(d)}`,
        headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
        // Flights in the air change by the minute; days away barely move.
        ttlMs: near ? 30 * 1000 : 15 * 60 * 1000,
        staleMs: 6 * 3600 * 1000,
        timeoutMs: ctx.timeoutMs,
        negativeTtlMs: 0,
        hostGate: { minIntervalMs: 150 },
        fetchImpl: ctx.fetchImpl,
    });
    if (!r.ok) return { ok: false, error: r.error || `HTTP ${r.status}`, hard: r.status === 403 || r.status === 429 || r.status >= 500 || !r.answered };
    const c = normalizeFlightStats(r.data, parsed);
    return { ok: true, candidates: c ? [c] : [] };
}

/* ------------------------------------------------------------------ */
/* AeroDataBox (key)                                                   */
/* ------------------------------------------------------------------ */

const ADB_STATUS = { Expected: 'scheduled', EnRoute: 'active', CheckIn: 'scheduled', Boarding: 'scheduled', GateClosed: 'scheduled', Departed: 'active', Delayed: 'scheduled', Approaching: 'active', Arrived: 'landed', Canceled: 'cancelled', CanceledUncertain: 'cancelled', Diverted: 'diverted', Unknown: 'unknown' };

function normalizeAeroDataBox(item, parsed) {
    if (!item || !item.departure || !item.arrival) return null;
    const side = (e) => {
        const o = emptyEnd();
        const ap = e.airport || {};
        o.iata = ap.iata || '';
        o.icao = ap.icao || '';
        o.name = ap.name || '';
        o.city = ap.municipalityName || '';
        o.country = ap.countryCode || '';
        o.timezone = ap.timeZone || '';
        o.terminal = e.terminal || '';
        o.gate = e.gate || '';
        o.baggage = e.baggageBelt || '';
        o.scheduledLocal = local(e.scheduledTime?.local && e.scheduledTime.local.replace(' ', 'T'));
        o.scheduledUtc = e.scheduledTime?.utc ? new Date(e.scheduledTime.utc.replace(' ', 'T').replace(/Z?$/, 'Z')).toISOString() : null;
        const revised = e.revisedTime || e.predictedTime;
        if (revised?.local) { o.estimatedLocal = local(revised.local.replace(' ', 'T')); o.estimatedUtc = revised.utc ? new Date(revised.utc.replace(' ', 'T').replace(/Z?$/, 'Z')).toISOString() : null; }
        const runway = e.runwayTime;
        if (runway?.local) { o.actualLocal = local(runway.local.replace(' ', 'T')); o.actualUtc = runway.utc ? new Date(runway.utc.replace(' ', 'T').replace(/Z?$/, 'Z')).toISOString() : null; }
        const base = o.scheduledUtc;
        const now = o.actualUtc || o.estimatedUtc;
        o.delay = base && now ? Math.round((Date.parse(now) - Date.parse(base)) / 60000) : 0;
        return o;
    };
    const dep = side(item.departure);
    const arr = side(item.arrival);
    return {
        source: 'aerodatabox',
        sourceLabel: 'AeroDataBox',
        confidence: 'schedule',
        flightIata: String(item.number || parsed.iata).replace(/\s/g, ''),
        airline: { name: item.airline?.name || '', iata: item.airline?.iata || parsed.carrier, icao: item.airline?.icao || '' },
        status: ADB_STATUS[item.status] || 'unknown',
        statusText: item.status || '',
        departure: dep,
        arrival: arr,
        aircraft: { model: item.aircraft?.model || '', registration: item.aircraft?.reg || '' },
        durationMinutes: minutesBetween(dep.actualUtc || dep.estimatedUtc || dep.scheduledUtc, arr.actualUtc || arr.estimatedUtc || arr.scheduledUtc),
        live: null,
        codeshared: item.codeShareStatus === 'IsCodeshared',
    };
}

async function lookupAeroDataBox(parsed, date, ctx) {
    const cfg = ctx.aerodatabox;
    if (!cfg || !cfg.key) return { ok: true, skipped: 'No AeroDataBox key', candidates: [] };
    const headers = { [cfg.authHeader]: cfg.key };
    if (cfg.host) headers['x-rapidapi-host'] = cfg.host;
    const r = await fetchUpstream({
        key: `adb:${cfg.baseUrl}:${parsed.iata}:${date}`,
        url: `${cfg.baseUrl}/flights/number/${encodeURIComponent(parsed.iata)}/${date}?dateLocalRole=Departure&withAircraftImage=false&withLocation=false`,
        headers,
        ttlMs: 10 * 60 * 1000,
        staleMs: 12 * 3600 * 1000,
        timeoutMs: ctx.timeoutMs,
        negativeTtlMs: 5 * 60 * 1000,
        hostGate: { minIntervalMs: 250 },
        fetchImpl: ctx.fetchImpl,
    });
    if (r.status === 204 || r.outcome === 'notfound') return { ok: true, candidates: [] };
    if (!r.ok) return { ok: false, error: r.error || `HTTP ${r.status}`, hard: r.status === 401 || r.status === 403 || r.status === 429 || r.status >= 500 || !r.answered };
    const list = Array.isArray(r.data) ? r.data : [];
    const all = list.map((i) => normalizeAeroDataBox(i, parsed)).filter(Boolean);
    // The operating flight, not its codeshare duplicates, unless that is all there is.
    const operated = all.filter((c) => !c.codeshared);
    return { ok: true, candidates: (operated.length ? operated : all).filter((c) => !c.departure.scheduledLocal || c.departure.scheduledLocal.slice(0, 10) === date) };
}

/* ------------------------------------------------------------------ */
/* AviationStack (key)                                                 */
/* ------------------------------------------------------------------ */

const AVS_STATUS = { scheduled: 'scheduled', active: 'active', landed: 'landed', cancelled: 'cancelled', incident: 'diverted', diverted: 'diverted' };

function normalizeAviationStack(item, parsed, date) {
    if (!item || !item.departure || !item.arrival) return null;
    const side = (e) => {
        const o = emptyEnd();
        o.iata = e.iata || ''; o.icao = e.icao || ''; o.name = e.airport || ''; o.timezone = e.timezone || '';
        o.terminal = e.terminal || ''; o.gate = e.gate || ''; o.baggage = e.baggage || '';
        // AviationStack sends local wall time with a bogus "+00:00": keep the wall clock.
        o.scheduledLocal = local(e.scheduled);
        o.estimatedLocal = e.estimated && e.estimated !== e.scheduled ? local(e.estimated) : null;
        o.actualLocal = local(e.actual);
        o.delay = Number(e.delay) || 0;
        return o;
    };
    const dep = side(item.departure);
    const arr = side(item.arrival);
    const mins = dep.scheduledLocal && arr.scheduledLocal ? Math.round((Date.parse(`${arr.scheduledLocal}:00Z`) - Date.parse(`${dep.scheduledLocal}:00Z`)) / 60000) : null;
    return {
        source: 'aviationstack',
        sourceLabel: 'AviationStack',
        confidence: 'schedule',
        flightIata: item.flight?.iata || parsed.iata,
        airline: { name: item.airline?.name || '', iata: item.airline?.iata || parsed.carrier, icao: item.airline?.icao || '' },
        status: AVS_STATUS[item.flight_status] || 'unknown',
        statusText: item.flight_status || '',
        departure: dep,
        arrival: arr,
        aircraft: { model: item.aircraft?.iata || '', registration: item.aircraft?.registration || '' },
        // Wall-clock difference is wrong across time zones; leave it to the caller to work out from the airports.
        durationMinutes: null,
        wallClockMinutes: mins,
        live: item.live && item.live.latitude != null ? { lat: item.live.latitude, lng: item.live.longitude, altitudeFt: item.live.altitude != null ? Math.round(item.live.altitude * 3.28084) : null, speedKn: item.live.speed_horizontal != null ? Math.round(item.live.speed_horizontal * 0.539957) : null, heading: item.live.direction ?? null, updated: item.live.updated || null, onGround: Boolean(item.live.is_ground) } : null,
        flightDate: item.flight_date || date,
    };
}

async function lookupAviationStack(parsed, date, ctx) {
    const key = ctx.aviationstackKey;
    if (!key) return { ok: true, skipped: 'No AviationStack key', candidates: [] };
    const url = new URL('https://api.aviationstack.com/v1/flights');
    url.searchParams.set('access_key', key);
    url.searchParams.set('flight_iata', parsed.iata);
    url.searchParams.set('flight_date', date);
    const r = await fetchUpstream({
        key: `avs:${parsed.iata}:${date}`,
        url: url.toString(),
        ttlMs: 5 * 60 * 1000,
        staleMs: 12 * 3600 * 1000,
        timeoutMs: ctx.timeoutMs,
        negativeTtlMs: 5 * 60 * 1000,
        hostGate: { minIntervalMs: 300 },
        fetchImpl: ctx.fetchImpl,
    });
    if (!r.ok) return { ok: false, error: r.error || `HTTP ${r.status}`, hard: r.status === 401 || r.status === 403 || r.status === 429 || r.status >= 500 || !r.answered };
    if (r.data && r.data.error) return { ok: false, error: String(r.data.error.message || r.data.error.code || 'AviationStack error'), hard: false };
    const list = Array.isArray(r.data?.data) ? r.data.data : [];
    return { ok: true, candidates: list.filter((i) => !i.flight?.codeshared).map((i) => normalizeAviationStack(i, parsed, date)).filter(Boolean) };
}

/* ------------------------------------------------------------------ */
/* ADSBdb (keyless): the route a flight number flies                   */
/* ------------------------------------------------------------------ */

async function lookupAdsbdb(parsed, date, ctx) {
    const callsign = parsed.icao || parsed.iata;
    const r = await fetchUpstream({
        key: `adsbdb:callsign:${callsign}`,
        url: `https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`,
        ttlMs: 24 * 3600 * 1000,
        staleMs: 7 * 24 * 3600 * 1000,
        timeoutMs: ctx.timeoutMs,
        negativeTtlMs: 6 * 3600 * 1000,
        hostGate: { minIntervalMs: 200 },
        fetchImpl: ctx.fetchImpl,
    });
    if (r.outcome === 'notfound') return { ok: true, candidates: [] };
    if (!r.ok) return { ok: false, error: r.error || `HTTP ${r.status}`, hard: r.status >= 500 || !r.answered };
    const f = r.data?.response?.flightroute;
    if (!f || !f.origin || !f.destination) return { ok: true, candidates: [] };
    const end = (a) => ({ ...emptyEnd(), iata: a.iata_code || '', icao: a.icao_code || '', name: a.name || '', city: a.municipality || '', country: a.country_iso_name || '' });
    return {
        ok: true,
        candidates: [{
            source: 'adsbdb',
            sourceLabel: 'ADSBdb',
            confidence: 'route-only',
            flightIata: f.callsign_iata || parsed.iata,
            airline: { name: f.airline?.name || '', iata: f.airline?.iata || parsed.carrier, icao: f.airline?.icao || '' },
            status: 'unknown',
            statusText: '',
            departure: end(f.origin),
            arrival: end(f.destination),
            aircraft: { model: '', registration: '' },
            durationMinutes: null,
            live: null,
        }],
    };
}

/* ------------------------------------------------------------------ */
/* Orchestration                                                       */
/* ------------------------------------------------------------------ */

const PRIORITY = ['flightstats', 'aerodatabox', 'aviationstack', 'adsbdb'];

/** Two candidates are the same leg when they leave the same airport for the same one within a few hours. */
function sameLeg(a, b) {
    if (a.departure.iata !== b.departure.iata || a.arrival.iata !== b.arrival.iata) return false;
    const ta = a.departure.scheduledUtc ? Date.parse(a.departure.scheduledUtc) : null;
    const tb = b.departure.scheduledUtc ? Date.parse(b.departure.scheduledUtc) : null;
    return ta == null || tb == null || Math.abs(ta - tb) < 6 * 3600 * 1000;
}

/** Fills what the better answer left empty from the other: a gate here, an aircraft there. */
function mergeInto(base, extra) {
    const out = { ...base, departure: { ...base.departure }, arrival: { ...base.arrival }, aircraft: { ...base.aircraft }, airline: { ...base.airline } };
    for (const side of ['departure', 'arrival']) for (const [k, v] of Object.entries(extra[side])) if (!out[side][k] && v) out[side][k] = v;
    for (const [k, v] of Object.entries(extra.aircraft)) if (!out.aircraft[k] && v) out.aircraft[k] = v;
    if (!out.airline.name && extra.airline.name) out.airline = { ...out.airline, ...extra.airline };
    if (!out.live && extra.live) out.live = extra.live;
    if (out.durationMinutes == null && extra.durationMinutes != null) out.durationMinutes = extra.durationMinutes;
    out.alsoFrom = [...(base.alsoFrom || []), extra.sourceLabel];
    return out;
}

/**
 * Looks a flight up. `opts`: { aerodatabox: { key, baseUrl, authHeader, host }, aviationstackKey, flightstats: boolean,
 * fetchImpl, now, timeoutMs }. Always resolves: `candidates` may be empty, and `attempts` says what each source did.
 */
async function resolveFlight(flight, date, opts = {}) {
    const parsed = parseFlightNumber(flight);
    if (!parsed) return { ok: false, error: 'invalid_flight', message: 'That does not look like a flight number. Try something like ME215.', candidates: [], attempts: [] };
    if (!validDate(date)) return { ok: false, error: 'invalid_date', message: 'Choose the departure date.', candidates: [], attempts: [] };

    const ctx = { now: opts.now ?? Date.now(), timeoutMs: opts.timeoutMs ?? 6000, fetchImpl: opts.fetchImpl ?? globalThis.fetch, aerodatabox: opts.aerodatabox, aviationstackKey: opts.aviationstackKey };
    const sources = [
        ['flightstats', opts.flightstats !== false, lookupFlightStats],
        ['aerodatabox', Boolean(ctx.aerodatabox?.key), lookupAeroDataBox],
        ['aviationstack', Boolean(ctx.aviationstackKey), lookupAviationStack],
    ];

    const attempts = [];
    const runOne = async (name, run) => {
        const started = Date.now();
        if (breakerOpen(name, ctx.now)) { attempts.push({ source: name, state: 'skipped', note: 'Failing recently', ms: 0 }); return []; }
        try {
            const r = await run(parsed, date, ctx);
            if (r.skipped) { attempts.push({ source: name, state: 'skipped', note: r.skipped, ms: 0 }); return []; }
            if (!r.ok) {
                // Only a source that is down or blocking counts against it, not one that simply has no such flight.
                if (r.hard) recordOutcome(name, false, ctx.now);
                attempts.push({ source: name, state: 'error', note: r.error, ms: Date.now() - started });
                return [];
            }
            recordOutcome(name, true, ctx.now);
            attempts.push({ source: name, state: r.candidates.length ? 'found' : 'none', count: r.candidates.length, ms: Date.now() - started });
            return r.candidates;
        } catch (e) {
            recordOutcome(name, false, ctx.now);
            attempts.push({ source: name, state: 'error', note: e && e.message ? e.message : 'failed', ms: Date.now() - started });
            return [];
        }
    };

    const lists = await Promise.all(sources.filter(([, on]) => on).map(([name, , run]) => runOne(name, run)));
    let candidates = [];
    for (const c of lists.flat().sort((a, b) => PRIORITY.indexOf(a.source) - PRIORITY.indexOf(b.source))) {
        const i = candidates.findIndex((x) => sameLeg(x, c));
        if (i < 0) candidates.push(c); else candidates[i] = mergeInto(candidates[i], c);
    }

    // Nothing with times: say at least where the flight number goes.
    if (candidates.length === 0) {
        const route = await runOne('adsbdb', lookupAdsbdb);
        candidates = route;
    }
    candidates.sort((a, b) => (a.departure.scheduledUtc || '').localeCompare(b.departure.scheduledUtc || ''));

    return { ok: true, query: { flight: parsed.iata, carrier: parsed.carrier, number: parsed.number, date }, candidates, attempts };
}

module.exports = {
    parseFlightNumber,
    normalizeFlightStats,
    normalizeAeroDataBox,
    normalizeAviationStack,
    resolveFlight,
    resetBreakers,
    BREAKER_FAILURES,
};
