import { z } from 'zod';

/**
 * The trip interchange format (docs/TRIP_INTERCHANGE.md): a whole travel plan as one JSON file, to import
 * into a trip and export back out. This module reads and checks a file; nothing here touches stored data.
 * utils/tripInterchange.ts turns a checked file into WanderGrid records, and a trip back into a file.
 */

export const INTERCHANGE_FORMAT = 'wandergrid-trip-interchange';
export const INTERCHANGE_VERSION = '1.0.0';
/** Files larger than this are refused before they are read (a 3-week plan is about 50 KB). */
export const MAX_INTERCHANGE_BYTES = 2 * 1024 * 1024;
const MAX_DEPTH = 12;
/** Keys that could change an object's prototype when the data is later merged or spread. */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export interface InterchangeIssue {
    /** Where in the file: "days[3].activities[1].start_time". */
    path: string;
    message: string;
}

/* ------------------------------------------------------------------ field types */

// Control characters (other than tab and newline) are dropped: they are never meaningful in a plan and can hide text.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const text = (max: number) => z.string().max(max, `must be at most ${max} characters`).transform(s => s.replace(CONTROL, '').trim());
const optText = (max: number) => text(max).nullish().transform(v => (v ? v : undefined));
const id = z.string().min(1, 'is empty').max(200, 'must be at most 200 characters').regex(/^[^\s/\\?#]+$/, 'must not contain spaces or slashes');

const isRealDate = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
/** A calendar day as written (YYYY-MM-DD), never turned into a time, so no time zone can shift it. */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a YYYY-MM-DD date').refine(isRealDate, 'is not a real date');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be a 24-hour HH:mm time').nullish().transform(v => v ?? undefined);
const money = z.number().finite().min(0, 'must not be negative').max(1e9, 'is too large');
const currency = z.string().regex(/^[A-Z]{3}$/, 'must be a three-letter currency code (EUR)');
const list = <T extends z.ZodTypeAny>(item: T, max: number) => z.array(item).max(max, `has more than ${max} entries`).nullish().transform(v => v ?? []);
const noteList = list(text(5000), 200);

/* ------------------------------------------------------------------ the file */

const traveller = z.object({ label: text(200), type: text(40), age_at_trip: optText(60) });

const activity = z.object({
    id,
    title: text(300).pipe(z.string().min(1, 'is empty')),
    location_name: optText(300),
    order: z.number().int().min(0).max(10_000).nullish(),
    priority: optText(40),
    booking_status: optText(40),
    start_time: time,
    time_status: optText(40),
    notes: optText(5000),
    type: optText(60),
    cost: money.nullish(),
});

const dayEntry = z.object({
    id,
    date: day,
    day_number: z.number().int().min(0).max(1000).nullish(),
    destination_id: id.nullish(),
    title: optText(300),
    summary: optText(2000),
    schedule_status: optText(40),
    activities: list(activity, 200),
    notes: noteList,
});

const destination = z.object({
    id,
    name: text(300).pipe(z.string().min(1, 'is empty')),
    country_code: z.string().regex(/^[A-Z]{2}$/, 'must be a two-letter country code').nullish(),
    arrival_date: day,
    departure_date: day,
    recommended_area: optText(300),
});

const booking = z.object({
    name: optText(300),
    address: optText(500),
    type: optText(40),
    check_in_time: time,
    check_out_time: time,
    confirmation_code: optText(100),
    // Only web links: anything else (javascript:, data:) could run when a page renders it as a link.
    website: optText(500).refine(v => !v || /^https?:\/\/[^\s]+$/i.test(v), 'must be an http(s) link'),
    cost: money.nullish(),
});

const hotelOption = z.object({ id, name: text(300).pipe(z.string().min(1, 'is empty')), rank: z.number().int().min(0).max(1000).nullish(), status: optText(40) });

const stay = z.object({
    id,
    destination_id: id.nullish(),
    check_in: day,
    check_out: day,
    nights: z.number().int().min(0).max(400).nullish(),
    status: optText(40),
    preferred_area: optText(300),
    hotel_options: list(hotelOption, 50),
    target_per_night_eur: money.nullish(),
    target_per_night: money.nullish(),
    family_requirements: list(text(300), 50),
    requirements: list(text(300), 50),
    notes: optText(5000),
    booking: booking.nullish(),
});

const transport = z.object({
    id,
    date: day,
    mode: text(60).pipe(z.string().min(1, 'is empty')),
    origin: text(300).pipe(z.string().min(1, 'is empty')),
    destination: text(300).pipe(z.string().min(1, 'is empty')),
    status: optText(40),
    departure_time: time,
    arrival_time: time,
    arrival_date: day.nullish(),
    provider: optText(200),
    identifier: optText(100),
    booking_reference: optText(100),
    seat: optText(40),
    cost: money.nullish(),
    notes: optText(5000),
});

const dayTrip = z.object({
    id,
    date: day,
    origin: optText(300),
    destination: text(300).pipe(z.string().min(1, 'is empty')),
    estimated_total_hours: optText(40),
    priority: optText(40),
    notes: optText(5000),
});

const gem = z.object({
    id,
    name: text(300).pipe(z.string().min(1, 'is empty')),
    destination_id: id.nullish(),
    date: day.nullish(),
    status: optText(40),
    notes: optText(5000),
});

const budget = z.object({
    currency,
    target: money.nullish(),
    categories: z.record(z.string().max(100), money).nullish(),
    note: optText(2000),
});

const tripHead = z.object({
    external_id: id,
    name: text(500).pipe(z.string().min(1, 'is empty')),
    start_date: day,
    end_date: day,
    status: optText(40),
    classification: optText(40),
    currency: currency.nullish(),
    origin: optText(300),
    travelers: list(traveller, 50),
    notes: noteList,
});

export const interchangeSchema = z.object({
    // Notes for people or AI assistants filling the file in (the template's instructions). Read, never stored.
    $comment: z.union([text(5000), z.array(text(5000)).max(100)]).nullish(),
    schema_version: z.string().regex(/^\d+\.\d+\.\d+$/, 'must be a version like 1.0.0'),
    format: z.literal(INTERCHANGE_FORMAT, { message: `must be "${INTERCHANGE_FORMAT}"` }),
    exported_at: optText(40),
    trip: tripHead,
    destinations: list(destination, 200),
    days: list(dayEntry, 400),
    accommodation_stays: list(stay, 200),
    transport: list(transport, 500),
    budget: budget.nullish(),
    day_trips: list(dayTrip, 200),
    hidden_gems: list(gem, 500),
    import_notes: z.record(z.string().max(100), text(5000)).nullish(),
    unmapped_fields: z.record(z.string().max(300), z.unknown()).nullish(),
});

export type InterchangeFile = z.infer<typeof interchangeSchema>;
export type InterchangeActivity = z.infer<typeof activity>;
export type InterchangeDay = z.infer<typeof dayEntry>;
export type InterchangeStay = z.infer<typeof stay>;
export type InterchangeTransport = z.infer<typeof transport>;
/** The file as written, before checking (what an export produces). */
export type InterchangeInput = z.input<typeof interchangeSchema>;

/* ------------------------------------------------------------------ unmapped fields */

/** The keys each object of the format may carry. Anything else is reported and kept (see `unmapped`). */
const KNOWN: Record<string, readonly string[]> = {
    root: Object.keys(interchangeSchema.shape),
    trip: Object.keys(tripHead.shape),
    traveller: Object.keys(traveller.shape),
    destination: Object.keys(destination.shape),
    day: Object.keys(dayEntry.shape),
    activity: Object.keys(activity.shape),
    stay: Object.keys(stay.shape),
    hotel: Object.keys(hotelOption.shape),
    booking: Object.keys(booking.shape),
    transport: Object.keys(transport.shape),
    dayTrip: Object.keys(dayTrip.shape),
    gem: Object.keys(gem.shape),
    budget: Object.keys(budget.shape),
};

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Every field the format doesn't define, by its path in the file. Nothing in WanderGrid reads these; an export writes them back. */
const collectUnmapped = (raw: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    const check = (obj: unknown, kind: string, path: string) => {
        if (!isPlainObject(obj)) return;
        for (const [k, v] of Object.entries(obj)) if (!KNOWN[kind].includes(k)) out[path ? `${path}.${k}` : k] = v;
    };
    const each = (v: unknown, kind: string, path: string, inner?: (item: Record<string, unknown>, p: string) => void) => {
        if (!Array.isArray(v)) return;
        v.forEach((item, i) => {
            const p = `${path}[${isPlainObject(item) && typeof item.id === 'string' ? item.id : i}]`;
            check(item, kind, p);
            if (inner && isPlainObject(item)) inner(item, p);
        });
    };
    check(raw, 'root', '');
    check(raw.trip, 'trip', 'trip');
    if (isPlainObject(raw.trip)) each(raw.trip.travelers, 'traveller', 'trip.travelers');
    each(raw.destinations, 'destination', 'destinations');
    each(raw.days, 'day', 'days', (d, p) => each(d.activities, 'activity', `${p}.activities`));
    each(raw.accommodation_stays, 'stay', 'accommodation_stays', (s, p) => {
        each(s.hotel_options, 'hotel', `${p}.hotel_options`);
        check(s.booking, 'booking', `${p}.booking`);
    });
    each(raw.transport, 'transport', 'transport');
    each(raw.day_trips, 'dayTrip', 'day_trips');
    each(raw.hidden_gems, 'gem', 'hidden_gems');
    check(raw.budget, 'budget', 'budget');
    delete out.unmapped_fields;
    return out;
};

/* ------------------------------------------------------------------ reading a file */

export interface ParsedInterchange {
    file: InterchangeFile;
    /** Fields the format doesn't define, by path, kept for export. */
    unmapped: Record<string, unknown>;
    warnings: InterchangeIssue[];
}

export type InterchangeReadResult = { ok: true; value: ParsedInterchange } | { ok: false; errors: InterchangeIssue[] };

const fail = (message: string, path = ''): InterchangeReadResult => ({ ok: false, errors: [{ path, message }] });

const pathOf = (p: ReadonlyArray<PropertyKey>) => p.reduce<string>((s, k) => (typeof k === 'number' ? `${s}[${k}]` : s ? `${s}.${String(k)}` : String(k)), '');

const byteLength = (s: string) => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s).length : s.length);

/**
 * Read and check an interchange file. Refuses files that are too large, not JSON, nested too deeply, of another
 * format or major version, or whose fields don't fit the format; drops keys that could pollute prototypes.
 * Then checks the plan holds together (dates in order, references that exist, no repeated ids).
 */
export const readInterchange = (input: string): InterchangeReadResult => {
    if (byteLength(input) > MAX_INTERCHANGE_BYTES) return fail(`The file is larger than ${MAX_INTERCHANGE_BYTES / 1024 / 1024} MB.`);
    let trimmed = input.replace(/^\uFEFF/, '').trim();
    if (!trimmed) return fail('The file is empty.');
    // An AI assistant's reply pasted as is: the JSON inside a ```json fence, or with a sentence before or after it.
    let unwrapped = false;
    const fenced = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n?```/i);
    if (trimmed[0] !== '{' && fenced && fenced[1].trim().startsWith('{')) { trimmed = fenced[1].trim(); unwrapped = true; }
    else if (trimmed[0] !== '{' && trimmed.includes('{') && trimmed.lastIndexOf('}') > trimmed.indexOf('{')) { trimmed = trimmed.slice(trimmed.indexOf('{'), trimmed.lastIndexOf('}') + 1); unwrapped = true; }
    if (trimmed[0] !== '{') return fail('This is not a WanderGrid trip file: it should be a JSON object starting with "{".');
    let dropped = 0;
    let raw: unknown;
    try {
        raw = JSON.parse(trimmed, (key, value) => {
            if (DANGEROUS_KEYS.has(key)) { dropped++; return undefined; }
            return value;
        });
    } catch (e) {
        return fail(`The file is not valid JSON${e instanceof Error && e.message ? ` (${e.message})` : ''}.`);
    }
    const depth = (v: unknown, d: number): number => (d > MAX_DEPTH || typeof v !== 'object' || v === null ? d : Math.max(d, ...Object.values(v).map(x => depth(x, d + 1))));
    if (depth(raw, 0) > MAX_DEPTH) return fail(`The file is nested more than ${MAX_DEPTH} levels deep.`);
    if (!isPlainObject(raw)) return fail('This is not a WanderGrid trip file.');
    if (raw.format !== INTERCHANGE_FORMAT) return fail(`This is not a WanderGrid trip file: "format" should be "${INTERCHANGE_FORMAT}".`, 'format');
    const version = typeof raw.schema_version === 'string' ? raw.schema_version : '';
    const [major, minor] = version.split('.').map(Number);
    if (major !== 1) return fail(`Schema version ${version || '(missing)'} isn't supported: this version of WanderGrid reads 1.x files.`, 'schema_version');

    const parsed = interchangeSchema.safeParse(raw);
    if (!parsed.success) {
        return { ok: false, errors: parsed.error.issues.slice(0, 50).map(i => ({ path: pathOf(i.path), message: i.message })) };
    }
    const file = parsed.data;
    const warnings: InterchangeIssue[] = [];
    if (unwrapped) warnings.push({ path: '', message: "Text around the JSON (such as an assistant's message or a code fence) was ignored." });
    if (dropped) warnings.push({ path: '', message: `${dropped} key${dropped === 1 ? '' : 's'} named __proto__, constructor or prototype ${dropped === 1 ? 'was' : 'were'} removed.` });
    if (minor > 0) warnings.push({ path: 'schema_version', message: `The file is version ${version}, newer than ${INTERCHANGE_VERSION}. Fields this version doesn't know are listed below and kept.` });
    const unmapped = { ...collectUnmapped(raw), ...(isPlainObject(raw.unmapped_fields) ? raw.unmapped_fields : {}) };
    for (const path of Object.keys(collectUnmapped(raw))) warnings.push({ path, message: 'Not a field WanderGrid uses. It is kept with the trip and written back on export.' });

    const errors = checkPlan(file, warnings);
    if (errors.length) return { ok: false, errors };
    return { ok: true, value: { file, unmapped, warnings } };
};

/* ------------------------------------------------------------------ checks across the plan */

const DAY_MS = 86_400_000;
const ms = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
export const nightsBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DAY_MS);

/** The plan holds together: dates in order and inside the trip, references to things that exist, no id used twice. */
const checkPlan = (f: InterchangeFile, warnings: InterchangeIssue[]): InterchangeIssue[] => {
    const errors: InterchangeIssue[] = [];
    const { start_date: start, end_date: end } = f.trip;
    if (end < start) errors.push({ path: 'trip.end_date', message: 'is before the start date.' });
    if (nightsBetween(start, end) > 366) errors.push({ path: 'trip.end_date', message: 'makes the trip longer than a year.' });

    const unique = (path: string, ids: string[]) => {
        const seen = new Set<string>();
        ids.forEach((v, i) => { if (seen.has(v)) errors.push({ path: `${path}[${i}].id`, message: `"${v}" is used more than once.` }); seen.add(v); });
    };
    unique('destinations', f.destinations.map(d => d.id));
    unique('days', f.days.map(d => d.id));
    unique('days[].activities', f.days.flatMap(d => d.activities.map(a => a.id)));
    unique('accommodation_stays', f.accommodation_stays.map(s => s.id));
    unique('accommodation_stays[].hotel_options', f.accommodation_stays.flatMap(s => s.hotel_options.map(h => h.id)));
    unique('transport', f.transport.map(t => t.id));
    unique('day_trips', f.day_trips.map(d => d.id));
    unique('hidden_gems', f.hidden_gems.map(g => g.id));
    const dates = new Set<string>();
    f.days.forEach((d, i) => { if (dates.has(d.date)) errors.push({ path: `days[${i}].date`, message: `${d.date} has more than one day entry.` }); dates.add(d.date); });

    const dest = new Set(f.destinations.map(d => d.id));
    const ref = (path: string, v: string | null | undefined) => { if (v && !dest.has(v)) errors.push({ path, message: `refers to destination "${v}", which isn't in destinations.` }); };
    const inTrip = (path: string, d: string | null | undefined, what: string) => { if (d && (d < start || d > end)) warnings.push({ path, message: `${what} ${d} is outside the trip's dates.` }); };

    f.destinations.forEach((d, i) => {
        if (d.departure_date < d.arrival_date) errors.push({ path: `destinations[${i}].departure_date`, message: 'is before the arrival date.' });
        inTrip(`destinations[${i}].arrival_date`, d.arrival_date, 'Arrival');
    });
    f.days.forEach((d, i) => {
        ref(`days[${i}].destination_id`, d.destination_id);
        if (d.date < start || d.date > end) errors.push({ path: `days[${i}].date`, message: `${d.date} is outside the trip's dates.` });
        else if (d.day_number && d.day_number !== nightsBetween(start, d.date) + 1) warnings.push({ path: `days[${i}].day_number`, message: `says day ${d.day_number}, but ${d.date} is day ${nightsBetween(start, d.date) + 1}. The date is used.` });
    });
    f.accommodation_stays.forEach((s, i) => {
        ref(`accommodation_stays[${i}].destination_id`, s.destination_id);
        if (s.check_out <= s.check_in) errors.push({ path: `accommodation_stays[${i}].check_out`, message: 'must be after check-in.' });
        else if (s.nights != null && s.nights !== nightsBetween(s.check_in, s.check_out)) warnings.push({ path: `accommodation_stays[${i}].nights`, message: `says ${s.nights} nights, but the dates make ${nightsBetween(s.check_in, s.check_out)}. The dates are used.` });
        inTrip(`accommodation_stays[${i}].check_in`, s.check_in, 'Check-in');
    });
    f.transport.forEach((t, i) => {
        if (t.arrival_date && t.arrival_date < t.date) errors.push({ path: `transport[${i}].arrival_date`, message: 'is before the departure date.' });
        inTrip(`transport[${i}].date`, t.date, 'The leg on');
    });
    f.hidden_gems.forEach((g, i) => { ref(`hidden_gems[${i}].destination_id`, g.destination_id); inTrip(`hidden_gems[${i}].date`, g.date, 'The date'); });
    f.day_trips.forEach((d, i) => inTrip(`day_trips[${i}].date`, d.date, 'The day trip on'));

    const covered = new Set(f.days.map(d => d.date));
    const missing = Math.max(0, nightsBetween(start, end) + 1) - [...covered].filter(d => d >= start && d <= end).length;
    if (f.days.length && missing > 0) warnings.push({ path: 'days', message: `${missing} of the trip's days have no entry; they show as empty days.` });

    if (f.budget?.target != null && f.budget.categories) {
        const sum = Object.values(f.budget.categories).reduce((s, v) => s + v, 0);
        if (Math.abs(sum - f.budget.target) > 0.5) warnings.push({ path: 'budget.categories', message: `add up to ${Math.round(sum)}, not the target of ${f.budget.target}.` });
        const allowance = f.budget.categories.accommodation;
        const shortlist = f.accommodation_stays.reduce((s, x) => s + (x.target_per_night_eur ?? x.target_per_night ?? 0) * nightsBetween(x.check_in, x.check_out), 0);
        if (allowance && shortlist > allowance) warnings.push({ path: 'budget.categories.accommodation', message: `The hotel shortlist targets come to ${Math.round(shortlist)}, more than the ${allowance} set aside for accommodation.` });
    }
    return errors;
};
