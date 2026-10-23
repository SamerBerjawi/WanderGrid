/**
 * The iCalendar emitter shared by the subscription feed (`GET /api/calendar/<token>/feed.ics`, backend) and
 * the app's own .ics files (trip export, flight export, calendar download, frontend). One plain ES module with
 * no dependencies, so Node (CommonJS server, `import()`) and Vite load the same code and the two cannot drift.
 *
 * What it writes: an all-day event per trip, a timed event per transport leg, a check-in and a check-out (or one
 * span) per stay, a timed event per activity, and optionally leave and public holidays. Times with a known time
 * zone are written in UTC; everything else is a floating local time, so a viewer's zone never shifts it.
 * Text is escaped and lines are folded at 75 octets per RFC 5545; UIDs come from record ids, so an edited item
 * updates the same calendar event.
 */

/* ------------------------------------------------------------------ options (feed query parameters) */

export const DEFAULT_FEED_OPTIONS = Object.freeze({
    trips: true,          // an all-day event per trip
    flights: true,        // each flight leg as a timed event
    transport: false,     // trains, buses, ferries, cruises and car legs
    stays: true,          // check-in and check-out (or one span)
    activities: false,    // timed activities
    leave: false,         // your time off as all-day events
    holidays: false,      // public holidays of the calendars you follow
    planning: false,      // trips still in Planning (tentative)
    stay: 'split',        // 'split' = check-in + check-out events, 'span' = one all-day event
    cost: false,          // put prices in descriptions
    reminders: false,     // VALARMs
    private: 'full',      // Private trips: 'full' details, 'busy' (a bare block) or 'hide'
    remindFlight: 180,    // minutes before a flight or other transport leg
    remindStay: 1440,     // minutes before a check-in
    remindActivity: 60,   // minutes before an activity
});

const BOOLEAN_KEYS = ['trips', 'flights', 'transport', 'stays', 'activities', 'leave', 'holidays', 'planning', 'cost', 'reminders'];
const MINUTE_KEYS = ['remindFlight', 'remindStay', 'remindActivity'];
const MAX_MINUTES = 60 * 24 * 14;

const truthy = (v) => /^(1|true|on|yes)$/i.test(String(v).trim());
const falsy = (v) => /^(0|false|off|no)$/i.test(String(v).trim());

/** Reads the feed's query parameters (a URLSearchParams, a plain object, or a query string) into full options. */
export function parseFeedOptions(query) {
    const get = (key) => {
        if (!query) return undefined;
        if (typeof query === 'string') return new URLSearchParams(query).get(key) ?? undefined;
        if (typeof query.get === 'function') return query.get(key) ?? undefined;
        const v = query[key];
        return Array.isArray(v) ? v[0] : v;
    };
    const out = { ...DEFAULT_FEED_OPTIONS };
    for (const key of BOOLEAN_KEYS) {
        const raw = get(key);
        if (raw === undefined) continue;
        if (truthy(raw)) out[key] = true;
        else if (falsy(raw)) out[key] = false;
    }
    const stay = get('stay');
    if (stay === 'split' || stay === 'span') out.stay = stay;
    const priv = get('private');
    if (priv === 'full' || priv === 'busy' || priv === 'hide') out.private = priv;
    for (const key of MINUTE_KEYS) {
        const raw = get(key);
        if (raw === undefined || raw === '') continue;
        const n = Math.round(Number(raw));
        if (Number.isFinite(n) && n >= 0) out[key] = Math.min(n, MAX_MINUTES);
    }
    return out;
}

/** The shortest query string that reads back as these options ('' when they are all defaults). */
export function feedOptionsToQuery(options) {
    const merged = { ...DEFAULT_FEED_OPTIONS, ...options };
    const params = [];
    for (const key of BOOLEAN_KEYS) if (merged[key] !== DEFAULT_FEED_OPTIONS[key]) params.push(`${key}=${merged[key] ? 1 : 0}`);
    if (merged.stay !== DEFAULT_FEED_OPTIONS.stay) params.push(`stay=${merged.stay}`);
    if (merged.private !== DEFAULT_FEED_OPTIONS.private) params.push(`private=${merged.private}`);
    for (const key of MINUTE_KEYS) if (merged[key] !== DEFAULT_FEED_OPTIONS[key]) params.push(`${key}=${merged[key]}`);
    return params.join('&');
}

/** The options for one trip's own file: everything about that trip, no reminders. */
export const TRIP_FILE_OPTIONS = Object.freeze({ ...DEFAULT_FEED_OPTIONS, transport: true, activities: true, planning: true, cost: false });

/* ------------------------------------------------------------------ text: escaping and folding */

/** RFC 5545 §3.3.11 TEXT: backslash, semicolon, comma and newlines. */
export const icsEscape = (value) => String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');

const encoder = new TextEncoder();
/** Folds a content line at 75 octets without splitting a UTF-8 character (RFC 5545 §3.1). */
export function icsFold(line) {
    if (encoder.encode(line).length <= 75) return line;
    const parts = [];
    let current = '';
    let bytes = 0;
    for (const ch of line) {
        const len = encoder.encode(ch).length;
        if (bytes + len > (parts.length === 0 ? 75 : 74)) { parts.push(current); current = ''; bytes = 0; }
        current += ch;
        bytes += len;
    }
    parts.push(current);
    return parts.join('\r\n ');
}

/* ------------------------------------------------------------------ dates and time zones */

const pad = (n, w = 2) => String(n).padStart(w, '0');
const DAY = /^(\d{4})-(\d{2})-(\d{2})/;
const TIME = /^(\d{1,2}):(\d{2})/;

export const validDay = (iso) => {
    if (typeof iso !== 'string') return false;
    const m = DAY.exec(iso);
    if (!m) return false;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};
const ymd = (iso) => iso.slice(0, 10).replace(/-/g, '');
const parseDay = (iso) => { const m = DAY.exec(iso); return { y: +m[1], mo: +m[2], d: +m[3] }; };
const parseTime = (t) => { const m = TIME.exec(typeof t === 'string' ? t.trim() : ''); return m && +m[1] < 24 && +m[2] < 60 ? { h: +m[1], mi: +m[2] } : null; };
const addDays = (iso, n) => {
    const { y, mo, d } = parseDay(iso);
    return new Date(Date.UTC(y, mo - 1, d + n)).toISOString().slice(0, 10);
};
const utcStamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const localStamp = (ms) => utcStamp(ms).slice(0, -1); // wall-clock time carried in a "UTC" millisecond value

const formatters = new Map();
const zoneFormatter = (tz) => {
    let f = formatters.get(tz);
    if (f === undefined) {
        try {
            f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
        } catch { f = null; }
        formatters.set(tz, f);
    }
    return f;
};
const offsetMs = (ms, tz) => {
    const f = zoneFormatter(tz);
    if (!f) return null;
    const p = {};
    for (const part of f.formatToParts(new Date(ms))) p[part.type] = Number(part.value);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
};

/** A wall-clock date and time in a zone as a UTC instant in ms; null for an unknown zone. */
export function zonedToUtcMs(dateIso, time, tz) {
    if (!tz || !validDay(dateIso)) return null;
    const t = parseTime(time) || { h: 0, mi: 0 };
    const { y, mo, d } = parseDay(dateIso);
    const wall = Date.UTC(y, mo - 1, d, t.h, t.mi);
    const first = offsetMs(wall, tz);
    if (first === null) return null;
    let utc = wall - first;
    const second = offsetMs(utc, tz);
    if (second !== null && second !== first) utc = wall - second;
    return utc;
}

const wallMs = (dateIso, time) => {
    const t = parseTime(time) || { h: 0, mi: 0 };
    const { y, mo, d } = parseDay(dateIso);
    return Date.UTC(y, mo - 1, d, t.h, t.mi);
};

/* ------------------------------------------------------------------ event assembly */

const UID_DOMAIN = '@wandergrid.app';
const HOUR = 3_600_000;

const trigger = (minutes) => {
    if (minutes % 1440 === 0 && minutes >= 1440) return `-P${minutes / 1440}D`;
    if (minutes % 60 === 0) return `-PT${minutes / 60}H`;
    return `-PT${minutes}M`;
};

/**
 * One VEVENT. `start`/`end` are `{ date }` (all day; `end` is the last day, inclusive), `{ utc }` (ms) or `{ wall }`
 * (ms of a floating local time). `meta` carries stamp, last-modified and sequence.
 */
function vevent(uid, meta, { summary, start, end, location, description, url, status, alarm, alarmText }) {
    const prop = (name, spec) => spec.date
        ? `${name};VALUE=DATE:${ymd(spec.date)}`
        : `${name}:${spec.utc !== undefined ? utcStamp(spec.utc) : localStamp(spec.wall)}`;
    const lines = [
        'BEGIN:VEVENT',
        `UID:${uid}${UID_DOMAIN}`,
        `DTSTAMP:${utcStamp(meta.stamp)}`,
        ...(meta.lastModified ? [`LAST-MODIFIED:${utcStamp(meta.lastModified)}`] : []),
        `SEQUENCE:${meta.sequence}`,
        prop('DTSTART', start),
        start.date ? `DTEND;VALUE=DATE:${ymd(addDays(end?.date && end.date >= start.date ? end.date : start.date, 1))}` : prop('DTEND', end),
        `SUMMARY:${icsEscape(summary)}`,
        ...(location ? [`LOCATION:${icsEscape(location)}`] : []),
        ...(description ? [`DESCRIPTION:${icsEscape(description)}`] : []),
        ...(url ? [`URL:${url}`] : []),
        `STATUS:${status || 'CONFIRMED'}`,
        `TRANSP:${start.date ? 'TRANSPARENT' : 'OPAQUE'}`,
        ...(alarm ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(alarmText || summary)}`, `TRIGGER:${trigger(alarm)}`, 'END:VALARM'] : []),
        'END:VEVENT',
    ];
    return lines.map(icsFold).join('\r\n');
}

/** A timed span from a start and an end that may sit in different zones: UTC when both are known, else floating. */
function timedSpan(startDate, startTime, startTz, endDate, endTime, endTz, defaultLength = HOUR) {
    const hasEnd = validDay(endDate) && parseTime(endTime);
    const su = zonedToUtcMs(startDate, startTime, startTz);
    const eu = hasEnd ? zonedToUtcMs(endDate, endTime, endTz || startTz) : null;
    if (su !== null && (!hasEnd || eu !== null)) {
        const e = hasEnd && eu > su ? eu : su + defaultLength;
        return { start: { utc: su }, end: { utc: e } };
    }
    const sw = wallMs(startDate, startTime);
    const ew = hasEnd ? wallMs(endDate, endTime) : sw + defaultLength;
    return { start: { wall: sw }, end: { wall: ew > sw ? ew : sw + defaultLength } };
}

const plural = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'}`;
const lead = (m) => (m % 1440 === 0 && m >= 1440 ? plural(m / 1440, 'day') : m % 60 === 0 && m >= 60 ? plural(m / 60, 'hour') : plural(m, 'minute'));

const timeOf = (time) => { const t = parseTime(time); return t ? `${pad(t.h)}:${pad(t.mi)}` : ''; };
const money = (n, ctx) => (typeof n === 'number' && n > 0 ? `${ctx.currency ? `${ctx.currency} ` : ''}${Number.isInteger(n) ? n : n.toFixed(2)}` : '');

const SYMBOL = { Flight: '✈', Train: '🚆', Bus: '🚌', 'Car Rental': '🚗', 'Personal Car': '🚗', Cruise: '🛳', Ferry: '⛴' };

const iataOf = (v) => {
    const s = String(v || '').trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(s)) return s;
    const m = /\b([A-Z]{3})\b/.exec(s);
    return m ? m[1] : '';
};
const placeLabel = (v, mode) => {
    const s = String(v || '').trim();
    if (!s) return '—';
    if (mode !== 'Flight') { const n = s.split(/[,(]/)[0].trim() || s; return n.length <= 24 ? n : `${n.slice(0, 23)}…`; }
    if (/^[A-Za-z]{3,4}$/.test(s)) return s.toUpperCase();
    return iataOf(s) || s.split(/[,(\-–]/)[0].trim() || s;
};

const tripUrl = (trip, ctx) => (ctx.baseUrl ? `${String(ctx.baseUrl).replace(/\/+$/, '')}/trip/${encodeURIComponent(trip.id)}` : '');

const metaOf = (trip, ctx) => {
    const t = Date.parse(trip.updatedAt);
    const lastModified = Number.isFinite(t) ? t : null;
    return { stamp: lastModified ?? ctx.now, lastModified, sequence: Number(trip.version) || 0 };
};
const statusOf = (trip) => (trip.status === 'Cancelled' ? 'CANCELLED' : trip.status === 'Planning' ? 'TENTATIVE' : 'CONFIRMED');

/** One transport leg (flight, train, ...) as a timed event. */
export function transportEvent(t, trip, options, ctx) {
    if (!validDay(t.departureDate)) return null;
    const flight = (t.mode || 'Flight') === 'Flight';
    const fromCode = flight ? iataOf(t.origin) : '';
    const toCode = flight ? iataOf(t.destination) : '';
    const depTz = t.originTz || (flight && ctx.airportTz ? ctx.airportTz(fromCode) : undefined);
    const arrTz = t.destinationTz || (flight && ctx.airportTz ? ctx.airportTz(toCode) : undefined);
    const route = `${placeLabel(t.origin, t.mode)} → ${placeLabel(t.destination, t.mode)}`;
    const summary = flight
        ? `${SYMBOL.Flight} ${[route, t.identifier].filter(Boolean).join(' · ')}`
        : `${SYMBOL[t.mode] || ''} ${[`${t.mode} ${route}`, t.identifier].filter(Boolean).join(' · ')}`.trim();

    const dep = timeOf(t.departureTime);
    const arrDate = validDay(t.arrivalDate) ? t.arrivalDate : t.departureDate;
    const arr = timeOf(t.arrivalTime);
    let start, end;
    if (!dep) {
        start = { date: t.departureDate };
        end = { date: arrDate >= t.departureDate ? arrDate : t.departureDate };
    } else {
        ({ start, end } = timedSpan(t.departureDate, dep, depTz, arrDate, arr, arrTz));
    }

    const airportName = (code, fallback) => (flight && code && ctx.airportName ? ctx.airportName(code) : '') || fallback || '';
    const where = (code, text) => { const n = airportName(code, ''); return n ? `${n}${code ? ` (${code})` : ''}` : String(text || '').trim(); };
    const dTerm = [t.departureTerminal && `Terminal ${t.departureTerminal}`, t.departureGate && `Gate ${t.departureGate}`].filter(Boolean).join(', ');
    const aTerm = [t.arrivalTerminal && `Terminal ${t.arrivalTerminal}`, t.arrivalGate && `Gate ${t.arrivalGate}`].filter(Boolean).join(', ');
    const description = [
        [t.provider, t.identifier].filter(Boolean).join(' '),
        dep ? `Departs ${dep}${t.departureDate ? ` on ${t.departureDate}` : ''} from ${where(fromCode, t.origin) || '—'}` : '',
        arr ? `Arrives ${arr}${arrDate !== t.departureDate ? ` on ${arrDate}` : ''} at ${where(toCode, t.destination) || '—'}` : '',
        dTerm ? `Departure: ${dTerm}` : '',
        aTerm ? `Arrival: ${aTerm}` : '',
        t.seatNumber ? `Seat: ${t.seatNumber}${t.seatType ? ` (${String(t.seatType).toLowerCase()})` : ''}` : '',
        t.travelClass ? `Class: ${t.travelClass}` : '',
        t.vehicleModel ? `${flight ? 'Aircraft' : 'Vehicle'}: ${t.vehicleModel}${t.tailNumber ? ` (${t.tailNumber})` : ''}` : '',
        t.confirmationCode ? `Confirmation: ${t.confirmationCode}` : '',
        t.pickupLocation ? `Pick-up: ${t.pickupLocation}` : '',
        t.dropoffLocation ? `Drop-off: ${t.dropoffLocation}` : '',
        t.notes || '',
        options.cost ? (money(t.cost, ctx) ? `Cost: ${money(t.cost, ctx)}` : '') : '',
        trip && trip.id !== 'unassigned' && trip.name ? `Trip: ${trip.name}` : '',
        trip ? tripUrl(trip, ctx) : '',
    ].filter(Boolean).join('\n');

    return vevent(t.id, metaOf(trip || {}, ctx), {
        summary, start, end,
        location: where(fromCode, t.origin) || t.pickupLocation || '',
        description, url: trip ? tripUrl(trip, ctx) : '',
        status: trip ? statusOf(trip) : 'CONFIRMED',
        alarm: options.reminders && dep ? options.remindFlight : 0,
        alarmText: `${t.identifier || (flight ? 'Flight' : t.mode)} leaves in ${lead(options.remindFlight)}`,
    });
}

function stayEvents(a, trip, options, ctx) {
    if (!validDay(a.checkInDate)) return [];
    const out = validDay(a.checkOutDate) && a.checkOutDate >= a.checkInDate ? a.checkOutDate : a.checkInDate;
    const tz = a.coordinates?.tz;
    const meta = metaOf(trip, ctx);
    const status = statusOf(trip);
    const url = tripUrl(trip, ctx);
    const body = (side) => [
        a.address ? `Address: ${a.address}` : '',
        a.checkInTime || a.checkOutTime ? `Check-in${a.checkInTime ? ` ${timeOf(a.checkInTime)}` : ''}${a.checkInDate ? ` on ${a.checkInDate}` : ''}` : '',
        a.checkOutTime || a.checkOutDate ? `Check-out${a.checkOutTime ? ` ${timeOf(a.checkOutTime)}` : ''}${out ? ` on ${out}` : ''}` : '',
        a.confirmationCode ? `Confirmation: ${a.confirmationCode}` : '',
        a.type ? `Type: ${a.type}` : '',
        a.website || '',
        a.notes || '',
        options.cost && money(a.cost, ctx) ? `Cost: ${money(a.cost, ctx)}` : '',
        trip.name ? `Trip: ${trip.name}` : '',
        url,
        side,
    ].filter(Boolean).join('\n');

    if (options.stay === 'span') {
        return [vevent(a.id, meta, {
            summary: `🛏 ${a.name || 'Stay'}`, start: { date: a.checkInDate }, end: { date: out },
            location: a.address, description: body(''), url, status,
            alarm: options.reminders ? options.remindStay : 0, alarmText: `Check-in at ${a.name || 'your stay'}`,
        })];
    }
    const point = (date, time, sumPrefix, alarm) => {
        const t = timeOf(time);
        const span = t ? timedSpan(date, t, tz, '', '', tz, HOUR) : { start: { date }, end: { date } };
        return vevent(`${a.id}-${sumPrefix === 'Check-in' ? 'in' : 'out'}`, meta, {
            summary: `🛏 ${sumPrefix} · ${a.name || 'Stay'}`, ...span, location: a.address, description: body(''), url, status,
            alarm, alarmText: `${sumPrefix} at ${a.name || 'your stay'}`,
        });
    };
    return [point(a.checkInDate, a.checkInTime, 'Check-in', options.reminders ? options.remindStay : 0), point(out, a.checkOutTime, 'Check-out', 0)];
}

function activityEvent(a, trip, options, ctx) {
    if (!validDay(a.date)) return null;
    const time = timeOf(a.time);
    const tz = a.coordinates?.tz;
    const span = time ? timedSpan(a.date, time, tz, '', '', tz, HOUR) : { start: { date: a.date }, end: { date: a.date } };
    const description = [
        a.type && a.type !== 'Activity' ? `Type: ${a.type}` : '',
        a.description || '',
        options.cost && money(a.cost, ctx) ? `Cost: ${money(a.cost, ctx)}` : '',
        trip.name ? `Trip: ${trip.name}` : '',
        tripUrl(trip, ctx),
    ].filter(Boolean).join('\n');
    return vevent(a.id, metaOf(trip, ctx), {
        summary: a.title || 'Activity', ...span, location: a.location, description, url: tripUrl(trip, ctx), status: statusOf(trip),
        alarm: options.reminders && time ? options.remindActivity : 0, alarmText: `${a.title || 'Activity'} starts soon`,
    });
}

const hasLeave = (trip) => Boolean(trip.entitlementId) || (Array.isArray(trip.allocations) && trip.allocations.length > 0);
export const isStandaloneLeave = (trip) => String(trip.id || '').startsWith('leave-');

function tripEvent(trip, options, ctx) {
    const leaveType = options.leave && hasLeave(trip) ? ctx.entitlementName?.(trip.entitlementId || trip.allocations?.[0]?.entitlementId) : '';
    const place = trip.location && String(trip.location).trim().toLowerCase() !== String(trip.name || '').trim().toLowerCase() ? trip.location : '';
    const description = [
        `Status: ${trip.status}`,
        trip.subtitle || '',
        trip.description || '',
        options.leave && hasLeave(trip) ? `Leave${leaveType ? `: ${leaveType}` : ''}` : '',
        trip.notes || '',
        tripUrl(trip, ctx),
    ].filter(Boolean).join('\n');
    return vevent(trip.id, metaOf(trip, ctx), {
        summary: `${trip.icon || '✈️'} ${[trip.name, place].filter(Boolean).join(' · ')}`,
        start: { date: trip.startDate }, end: { date: trip.endDate }, location: trip.location, description,
        url: tripUrl(trip, ctx), status: statusOf(trip),
    });
}

function leaveEvent(trip, ctx) {
    const kind = ctx.entitlementName?.(trip.entitlementId || trip.allocations?.[0]?.entitlementId);
    return vevent(`leave-${trip.id}`, metaOf(trip, ctx), {
        summary: `🌴 ${kind ? `${kind}` : 'Time off'}${trip.name && !isStandaloneLeave(trip) ? ` · ${trip.name}` : ''}`,
        start: { date: trip.startDate }, end: { date: trip.endDate },
        description: [trip.notes || '', tripUrl(trip, ctx)].filter(Boolean).join('\n'), status: statusOf(trip),
    });
}

/** A Private trip shown as a bare block, no details. */
function busyEvent(trip, ctx) {
    return vevent(trip.id, metaOf(trip, ctx), { summary: 'Private trip', start: { date: trip.startDate }, end: { date: trip.endDate }, status: statusOf(trip) });
}

/** Every event of one trip according to the options (exported for the app's single-trip file). */
export function tripEvents(trip, options, ctx) {
    const o = { ...DEFAULT_FEED_OPTIONS, ...options };
    const datesOk = validDay(trip.startDate) && validDay(trip.endDate);
    const isPrivate = trip.privacy === 'Private';
    if (isPrivate && ctx.viewer !== 'owner') return []; // never reached by the feed: it only holds the owner's trips
    if (isPrivate && o.private === 'hide') return [];
    if (isPrivate && o.private === 'busy') return o.trips && datesOk ? [busyEvent(trip, ctx)] : [];
    if (isStandaloneLeave(trip)) return o.leave && datesOk ? [leaveEvent(trip, ctx)] : [];

    const events = [];
    if (o.trips && datesOk) events.push(tripEvent(trip, o, ctx));
    for (const t of Array.isArray(trip.transports) ? trip.transports : []) {
        const isFlight = (t.mode || 'Flight') === 'Flight';
        if (isFlight ? !o.flights : !o.transport) continue;
        const e = transportEvent(t, trip, o, ctx);
        if (e) events.push(e);
    }
    if (o.stays) for (const a of Array.isArray(trip.accommodations) ? trip.accommodations : []) events.push(...stayEvents(a, trip, o, ctx));
    if (o.activities) for (const a of Array.isArray(trip.activities) ? trip.activities : []) { const e = activityEvent(a, trip, o, ctx); if (e) events.push(e); }
    return events;
}

function holidayEvents(holidayCalendars, ctx) {
    const events = [];
    for (const cfg of holidayCalendars || []) {
        for (const h of Array.isArray(cfg.holidays) ? cfg.holidays : []) {
            if (!validDay(h.date) || !h.name) continue;
            events.push(vevent(`holiday-${cfg.id}-${h.id || ymd(h.date)}`, { stamp: ctx.now, lastModified: null, sequence: 0 }, {
                summary: `🏳 ${h.name}`, start: { date: h.date }, end: { date: h.date },
                description: [cfg.countryName ? `${cfg.countryName} ${cfg.year || ''}`.trim() : ''].filter(Boolean).join('\n'),
            }));
        }
    }
    return events;
}

/* ------------------------------------------------------------------ the calendar */

export const FEED_REFRESH = 'PT1H';

/** Wraps events in a VCALENDAR with CRLF line ends. `name` is shown by calendar apps. */
export function wrapCalendar(events, name = 'WanderGrid Trips', { refresh = true } = {}) {
    return [
        'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//WanderGrid//${name.replace(/[^\w ./-]/g, '')}//EN`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
        icsFold(`X-WR-CALNAME:${icsEscape(name)}`),
        ...(refresh ? [`REFRESH-INTERVAL;VALUE=DURATION:${FEED_REFRESH}`, `X-PUBLISHED-TTL:${FEED_REFRESH}`] : []),
        ...events, 'END:VCALENDAR',
    ].join('\r\n') + '\r\n';
}

/**
 * The whole feed for one person.
 * `trips` are that person's trips (the caller has already limited them to the owner); `ctx` may carry
 * `now` (ms), `baseUrl`, `airportTz(iata)`, `airportName(iata)`, `entitlementName(id)`, `holidayCalendars`, `currency`, `name`.
 * Cancelled trips disappear from the feed, and so does anything deleted: subscribed calendars drop events that are no longer listed.
 */
export function buildFeed(trips, options = {}, ctx = {}) {
    const o = { ...DEFAULT_FEED_OPTIONS, ...options };
    const context = { viewer: 'owner', now: Date.now(), ...ctx };
    const events = [];
    for (const trip of Array.isArray(trips) ? trips : []) {
        if (!trip || typeof trip !== 'object' || !trip.id) continue;
        if (trip.status === 'Cancelled') continue;
        if (trip.status === 'Planning' && !o.planning && !isStandaloneLeave(trip)) continue;
        if (trip.isBundleOnly) continue;
        try { events.push(...tripEvents(trip, o, context)); } catch { /* one bad record must not break the feed */ }
    }
    if (o.holidays) events.push(...holidayEvents(context.holidayCalendars, context));
    return wrapCalendar(events, context.name || 'WanderGrid Trips');
}
