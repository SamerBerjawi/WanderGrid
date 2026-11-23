import type {
    Accommodation, Activity, DayPlan, DayTripPlan, HiddenGemPlan, HotelCandidate, ItemPlan, LocationEntry, PlanBookingStatus,
    PlanPriority, StayPlan, Transport, TransportMode, Trip, TripClassification, TripPlan,
} from '../types';
import {
    INTERCHANGE_FORMAT, INTERCHANGE_VERSION, nightsBetween,
    type InterchangeFile, type InterchangeInput, type InterchangeIssue, type ParsedInterchange,
} from './tripInterchangeSchema';
import { daysBetween } from './tripItinerary';
import { withIntent } from './tripsModel';
import { bookingStatusOf } from './tripPlan';

/**
 * The trip interchange format (docs/TRIP_INTERCHANGE.md) in and out of WanderGrid:
 *  - `adaptInterchange` turns a checked file into native records (stops, activities, legs, booked stays) and a
 *    `TripPlan` for what has no native home (day headings, stay shortlists, day trips, hidden gems, the budget estimate);
 *  - `planImport` works out, without saving anything, what importing it into a new or existing trip changes;
 *  - `exportTrip` writes a trip back out in the same format.
 * Pure, so the import sheet and the tests share it.
 */

export const newId = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `ix-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

/* ------------------------------------------------------------------ small mappings */

const MODE_WORDS: [RegExp, TransportMode][] = [
    [/^(flight|flights|plane|air|airplane|aeroplane|fly)$/i, 'Flight'],
    [/^(train|trains|rail|shinkansen|ktx|srt|tgv|ice|eurostar|thalys|metro|subway|tram|intercity|railjet|limited express)$/i, 'Train'],
    [/^(bus|buses|coach|shuttle|minibus|highway bus)$/i, 'Bus'],
    [/^(ferry|boat|hydrofoil|jetfoil)$/i, 'Ferry'],
    [/^cruise$/i, 'Cruise'],
    [/^(car rental|rental car|car hire|hire car|rental)$/i, 'Car Rental'],
    [/^(car|personal car|drive|driving|own car)$/i, 'Personal Car'],
];

export interface ModeMapping {
    /** The native mode, or undefined when nothing matches. */
    mode?: TransportMode;
    /** More than one mode in one leg ("Train/Bus"): saved as the first, with the original text kept. */
    multimodal: boolean;
}

/** A mode as a file writes it ("Shinkansen", "Bus/Train") to WanderGrid's own modes. */
export const mapMode = (label: string): ModeMapping => {
    const parts = label.split(/\s*(?:\/|\+|,|&|\bthen\b|\band\b)\s*/i).map(p => p.trim()).filter(Boolean);
    const modes = parts.map(p => MODE_WORDS.find(([re]) => re.test(p))?.[1]);
    if (!parts.length || modes.some(m => !m)) return { mode: undefined, multimodal: false };
    return { mode: modes[0], multimodal: new Set(modes).size > 1 };
};

const PRIORITY: Record<string, PlanPriority> = {
    planned: 'planned', must: 'planned', 'must-see': 'planned', required: 'planned', core: 'planned',
    recommended: 'recommended', suggested: 'recommended',
    optional: 'optional', maybe: 'optional', 'nice-to-have': 'optional',
    alternative: 'alternative', alternate: 'alternative', backup: 'alternative',
};
const BOOKING: Record<string, PlanBookingStatus> = {
    unbooked: 'unbooked', 'not booked': 'unbooked', proposed: 'unbooked', planned: 'unbooked', tbd: 'unbooked', pending: 'unbooked',
    candidate: 'candidate', shortlisted: 'candidate', shortlist: 'candidate',
    booked: 'booked', confirmed: 'booked', reserved: 'booked', ticketed: 'booked',
    paid: 'paid',
};
const CANDIDATE: Record<string, HotelCandidate['status']> = { candidate: 'candidate', shortlisted: 'candidate', booked: 'booked', confirmed: 'booked', reserved: 'booked', paid: 'booked', rejected: 'rejected', declined: 'rejected' };
const TRIP_STATUS: Record<string, Trip['status']> = { planning: 'Planning', planned: 'Planning', draft: 'Planning', upcoming: 'Upcoming', booked: 'Upcoming', confirmed: 'Upcoming', past: 'Past', completed: 'Past', cancelled: 'Cancelled', canceled: 'Cancelled' };
const CLASSIFICATIONS: TripClassification[] = ['Personal', 'Business', 'Family', 'Bleisure', 'Other'];
const STAY_TYPES: Accommodation['type'][] = ['Hotel', 'Airbnb', 'Resort', 'Villa', 'Apartment', 'Hostel', 'Campground', 'Friends/Family'];
const TIME_STATUS: Record<string, ItemPlan['timeStatus']> = { unscheduled: 'unscheduled', tentative: 'tentative', suggested: 'tentative', estimated: 'tentative', fixed: 'fixed', scheduled: 'fixed', confirmed: 'fixed' };

const key = (v: string | undefined) => (v || '').trim().toLowerCase();
/** For matching names written with or without accents ("Sensō-ji" and "Senso-ji"). */
export const normName = (v: string | undefined) => (v || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const countryName = (code?: string | null) => {
    if (!code) return '';
    try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || ''; } catch { return ''; }
};

/** A short stable fingerprint (FNV-1a) of some values. */
const hash = (values: unknown[]): string => {
    const s = JSON.stringify(values);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36);
};

/* ------------------------------------------------------------------ the fields an import owns */

type Collection = 'activities' | 'transports' | 'locations' | 'accommodations';

/** The fields of each record an import writes, and so the only ones a re-import may change or report as conflicts. */
export const IMPORT_FIELDS: Record<Collection, readonly string[]> = {
    activities: ['title', 'date', 'time', 'location', 'description', 'type', 'plan.priority', 'plan.bookingStatus', 'plan.timeStatus', 'plan.hiddenGem', 'plan.order', 'plan.estimatedCost'],
    transports: ['mode', 'origin', 'destination', 'departureDate', 'departureTime', 'arrivalDate', 'arrivalTime', 'provider', 'identifier', 'notes', 'plan.modeLabel', 'plan.bookingStatus', 'plan.timeStatus', 'plan.estimatedCost'],
    locations: ['name', 'startDate', 'endDate', 'plan.area', 'plan.countryCode'],
    accommodations: ['name', 'address', 'type', 'checkInDate', 'checkInTime', 'checkOutDate', 'checkOutTime', 'website'],
};
const FIELD_LABEL: Record<string, string> = {
    title: 'Title', date: 'Date', time: 'Time', location: 'Place', description: 'Notes', type: 'Type', notes: 'Notes', name: 'Name',
    mode: 'Mode', origin: 'From', destination: 'To', departureDate: 'Date', departureTime: 'Departs', arrivalDate: 'Arrival date', arrivalTime: 'Arrives',
    provider: 'Operator', identifier: 'Number', startDate: 'Arrives', endDate: 'Leaves', address: 'Address', checkInDate: 'Check-in', checkInTime: 'Check-in time',
    checkOutDate: 'Check-out', checkOutTime: 'Check-out time', website: 'Website', targetBudget: 'Target budget',
    'plan.priority': 'Priority', 'plan.bookingStatus': 'Booking status', 'plan.timeStatus': 'Time', 'plan.hiddenGem': 'Hidden gem', 'plan.order': 'Order in the day',
    'plan.estimatedCost': 'Estimated price', 'plan.modeLabel': 'Mode as written', 'plan.area': 'Area', 'plan.countryCode': 'Country',
};

const get = (obj: object, path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
const set = <T extends object>(obj: T, path: string, value: unknown): T => {
    const [head, ...rest] = path.split('.');
    const cur = (obj as Record<string, unknown>)[head];
    const next = rest.length ? set((cur && typeof cur === 'object' ? cur : {}) as object, rest.join('.'), value) : value;
    const copy = { ...obj } as Record<string, unknown>;
    if (next === undefined) delete copy[head]; else copy[head] = next;
    return copy as T;
};
/** Empty, null and missing are the same value for comparison. */
const plain = (v: unknown): unknown => (v === undefined || v === null || v === '' || v === false ? '' : v);
const fingerprint = (item: object, coll: Collection) => hash(IMPORT_FIELDS[coll].map(f => plain(get(item, f))));
const shown = (v: unknown) => { const p = plain(v); return p === '' ? '(empty)' : p === true ? 'Yes' : String(p); };

/** A leg, stay or activity that is (or has been) really booked: a re-import never changes it on its own. */
const isLocked = (item: { plan?: ItemPlan; confirmationCode?: string; cost?: number; paidBy?: string }) =>
    item.plan?.bookingStatus === 'booked' || item.plan?.bookingStatus === 'paid' || Boolean(item.confirmationCode) || (item.cost || 0) > 0 || Boolean(item.paidBy);

export { bookingStatusOf, isProposed } from './tripPlan';

/* ------------------------------------------------------------------ file → records */

export interface ImportEntry {
    /** `activity:<external id>`, `transport:…`, `stay:…`. */
    key: string;
    kind: 'activity' | 'transport' | 'stay';
    externalId: string;
    label: string;
    date: string;
    /** Optional or alternative in the plan: the preview can leave these out in one go. */
    optional: boolean;
}

export interface AdaptedImport {
    externalId: string;
    head: {
        name: string; startDate: string; endDate: string; status: Trip['status']; classification?: TripClassification;
        location: string; notes: string[]; currency?: string; targetBudget?: number;
    };
    locations: LocationEntry[];
    activities: Activity[];
    transports: Transport[];
    /** Stays the file says are booked, with the hotel named. Shortlists stay in `plan.stays`. */
    accommodations: Accommodation[];
    plan: TripPlan;
    entries: ImportEntry[];
    warnings: InterchangeIssue[];
    /** Problems that stop the import (a transport mode nothing matches). */
    errors: InterchangeIssue[];
}

export interface AdaptOptions {
    /** The workspace currency: a budget in another currency is kept as an estimate but not set as the trip's target. */
    workspaceCurrency?: string;
    now?: string;
    id?: () => string;
}

/** The checked file as WanderGrid records. Native ids are new; each record keeps the file's id in `plan.externalId`. */
export const adaptInterchange = (parsed: ParsedInterchange, options: AdaptOptions = {}): AdaptedImport => {
    const f: InterchangeFile = parsed.file;
    const mint = options.id || newId;
    const warnings: InterchangeIssue[] = [...parsed.warnings];
    const errors: InterchangeIssue[] = [];
    const entries: ImportEntry[] = [];
    const warn = (path: string, message: string) => warnings.push({ path, message });

    const priorityOf = (v: string | undefined, path: string): PlanPriority | undefined => {
        if (!v) return undefined;
        const p = PRIORITY[key(v)];
        if (!p) warn(path, `Priority "${v}" isn't one WanderGrid knows; it is treated as planned.`);
        return p || 'planned';
    };
    const bookingOf = (v: string | undefined, path: string): PlanBookingStatus | undefined => {
        if (!v) return undefined;
        const b = BOOKING[key(v)];
        if (!b) warn(path, `Status "${v}" isn't one WanderGrid knows; it is treated as not booked.`);
        return b || 'unbooked';
    };
    const booked = (s?: PlanBookingStatus) => s === 'booked' || s === 'paid';

    // Stops on the route.
    const locations: LocationEntry[] = f.destinations.map(d => ({
        id: mint(),
        name: d.name,
        startDate: d.arrival_date,
        endDate: d.departure_date,
        plan: clean({ externalId: d.id, area: d.recommended_area, countryCode: d.country_code || undefined }),
    }));
    const destName = new Map(f.destinations.map(d => [d.id, d.name]));

    // Activities, in the order of their days.
    const activities: Activity[] = [];
    f.days.forEach((d, di) => d.activities.forEach((a, ai) => {
        const path = `days[${di}].activities[${ai}]`;
        const bookingStatus = bookingOf(a.booking_status, `${path}.booking_status`);
        const stated = a.time_status ? TIME_STATUS[key(a.time_status)] : undefined;
        if (a.time_status && !stated) warn(`${path}.time_status`, `"${a.time_status}" isn't a time status WanderGrid knows; the time is treated as tentative.`);
        const timeStatus: ItemPlan['timeStatus'] = !a.start_time ? 'unscheduled' : stated === 'unscheduled' ? 'tentative' : stated || (booked(bookingStatus) ? 'fixed' : 'tentative');
        const cost = a.cost ?? undefined;
        activities.push(clean({
            id: mint(),
            date: d.date,
            time: a.start_time || '',
            title: a.title,
            location: a.location_name,
            description: a.notes,
            type: a.type,
            cost: booked(bookingStatus) ? cost : undefined,
            plan: clean({
                externalId: a.id,
                priority: priorityOf(a.priority, `${path}.priority`),
                bookingStatus,
                timeStatus,
                order: a.order ?? ai + 1,
                estimatedCost: booked(bookingStatus) ? undefined : cost,
            }),
        }));
        entries.push({ key: `activity:${a.id}`, kind: 'activity', externalId: a.id, label: a.title, date: d.date, optional: ['optional', 'alternative'].includes(PRIORITY[key(a.priority)] || '') });
    }));

    // Hidden gems: a label on the day's activity of the same name, and a list of their own.
    const hiddenGems: HiddenGemPlan[] = f.hidden_gems.map((g, gi) => {
        const name = normName(g.name);
        const dayOf = new Map(f.days.map(d => [d.date, d.destination_id]));
        const match = activities.find(a => normName(a.title) === name && (!g.date || a.date === g.date))
            || activities.find(a => normName(a.title) === name && (!g.destination_id || dayOf.get(a.date) === g.destination_id));
        if (match) match.plan = { ...match.plan, hiddenGem: true };
        else warn(`hidden_gems[${gi}]`, `${g.name} isn't one of the day's activities; it is kept in the plan's hidden gems only.`);
        return clean({ externalId: g.id, name: g.name, destinationId: g.destination_id || undefined, date: g.date || undefined, status: g.status, notes: g.notes });
    });

    // Legs.
    const transports: Transport[] = [];
    f.transport.forEach((t, ti) => {
        const path = `transport[${ti}]`;
        const { mode, multimodal } = mapMode(t.mode);
        if (!mode) { errors.push({ path: `${path}.mode`, message: `"${t.mode}" isn't a mode WanderGrid knows. Use Flight, Train, Bus, Ferry, Cruise, Car Rental or Personal Car (Shinkansen, KTX, coach and the like are understood).` }); return; }
        if (multimodal) warn(`${path}.mode`, `${t.origin} to ${t.destination} is "${t.mode}", more than one mode in one leg. It is saved as ${mode}, with "${t.mode}" kept; check it on the Route tab.`);
        const bookingStatus = bookingOf(t.status, `${path}.status`) || 'booked';
        const timeStatus: ItemPlan['timeStatus'] = !t.departure_time ? 'unscheduled' : booked(bookingStatus) ? 'fixed' : 'tentative';
        transports.push(clean({
            id: mint(),
            itineraryId: '',
            type: 'One-Way' as const,
            mode,
            provider: t.provider || '',
            identifier: t.identifier || '',
            confirmationCode: t.booking_reference || '',
            origin: t.origin,
            destination: t.destination,
            departureDate: t.date,
            departureTime: t.departure_time || '',
            arrivalDate: t.arrival_date || t.date,
            arrivalTime: t.arrival_time || '',
            seatNumber: t.seat,
            notes: t.notes,
            cost: booked(bookingStatus) ? t.cost ?? undefined : undefined,
            plan: clean({
                externalId: t.id,
                bookingStatus,
                timeStatus,
                modeLabel: t.mode.trim() === mode ? undefined : t.mode.trim(),
                estimatedCost: booked(bookingStatus) ? undefined : t.cost ?? undefined,
            }),
        }) as Transport);
        entries.push({ key: `transport:${t.id}`, kind: 'transport', externalId: t.id, label: `${t.origin} → ${t.destination}`, date: t.date, optional: false });
    });

    // Stays: the shortlist is planning metadata; only a stay that names its booked hotel becomes an Accommodation.
    const accommodations: Accommodation[] = [];
    const usesEur = f.accommodation_stays.some(s => s.target_per_night_eur != null && s.target_per_night == null);
    const planCurrency = f.budget?.currency || f.trip.currency || undefined;
    if (usesEur && planCurrency && planCurrency !== 'EUR') warn('accommodation_stays', `Nightly targets are in EUR but the plan's currency is ${planCurrency}; they are shown as written.`);
    const stays: StayPlan[] = f.accommodation_stays.map((s, si) => {
        const path = `accommodation_stays[${si}]`;
        const status = bookingOf(s.status, `${path}.status`);
        const candidates: HotelCandidate[] = s.hotel_options.map(h => {
            const c = h.status ? CANDIDATE[key(h.status)] : 'candidate';
            if (!c) warn(`${path}.hotel_options`, `Hotel status "${h.status}" isn't one WanderGrid knows; ${h.name} is kept as a candidate.`);
            return clean({ externalId: h.id, name: h.name, rank: h.rank ?? undefined, status: c || 'candidate' });
        });
        const chosen = candidates.find(c => c.status === 'booked');
        const name = s.booking?.name || chosen?.name;
        let stayStatus: StayPlan['status'] = 'unbooked';
        if (booked(status) || s.booking || chosen) {
            if (!name) warn(`${path}.status`, 'says booked but names no hotel, so no stay is added; it stays on the shortlist.');
            else {
                const type = s.booking?.type && STAY_TYPES.find(t => key(t) === key(s.booking?.type));
                if (s.booking?.type && !type) warn(`${path}.booking.type`, `"${s.booking.type}" isn't a stay type WanderGrid knows; it is saved as a hotel.`);
                const acc: Accommodation = clean({
                    id: mint(),
                    name,
                    address: s.booking?.address || '',
                    type: type || 'Hotel',
                    checkInDate: s.check_in,
                    checkInTime: s.booking?.check_in_time || '',
                    checkOutDate: s.check_out,
                    checkOutTime: s.booking?.check_out_time || '',
                    confirmationCode: s.booking?.confirmation_code,
                    website: s.booking?.website,
                    cost: s.booking?.cost ?? undefined,
                    plan: { externalId: s.id, bookingStatus: status === 'paid' ? 'paid' : 'booked' },
                });
                accommodations.push(acc);
                if (chosen) chosen.accommodationId = acc.id;
                stayStatus = 'booked';
            }
        }
        entries.push({ key: `stay:${s.id}`, kind: 'stay', externalId: s.id, label: destName.get(s.destination_id || '') || name || s.preferred_area || 'Stay', date: s.check_in, optional: false });
        return clean({
            externalId: s.id,
            destinationId: s.destination_id || undefined,
            checkIn: s.check_in,
            checkOut: s.check_out,
            nights: nightsBetween(s.check_in, s.check_out),
            status: stayStatus,
            area: s.preferred_area,
            targetPerNight: s.target_per_night ?? s.target_per_night_eur ?? undefined,
            requirements: [...s.family_requirements, ...s.requirements].length ? [...s.family_requirements, ...s.requirements] : undefined,
            notes: s.notes,
            candidates,
        });
    });

    const days: DayPlan[] = f.days.map(d => clean({
        date: d.date, externalId: d.id, title: d.title, summary: d.summary,
        notes: d.notes.length ? d.notes : undefined, destinationId: d.destination_id || undefined, scheduleStatus: d.schedule_status,
    }));
    const dayTrips: DayTripPlan[] = f.day_trips.map(d => clean({
        externalId: d.id, date: d.date, origin: d.origin, destination: d.destination, hours: d.estimated_total_hours, priority: d.priority, notes: d.notes,
    }));

    // The budget is an estimate: it sets the trip's target (in the workspace currency) and never adds spending.
    const budget = f.budget ? clean({ currency: f.budget.currency, target: f.budget.target ?? undefined, categories: f.budget.categories || undefined, note: f.budget.note }) : undefined;
    let targetBudget = budget?.target;
    if (budget && targetBudget && options.workspaceCurrency && budget.currency !== options.workspaceCurrency) {
        warn('budget.currency', `The budget is in ${budget.currency} and the workspace uses ${options.workspaceCurrency}: it is kept as an estimate but not set as the trip's target.`);
        targetBudget = undefined;
    }

    const classification = f.trip.classification ? CLASSIFICATIONS.find(c => key(c) === key(f.trip.classification)) : undefined;
    if (f.trip.classification && !classification) warn('trip.classification', `"${f.trip.classification}" isn't a classification WanderGrid knows; it is left unset.`);
    const status = f.trip.status ? TRIP_STATUS[key(f.trip.status)] : undefined;
    if (f.trip.status && !status) warn('trip.status', `"${f.trip.status}" isn't a trip status WanderGrid knows; the trip is saved as planned.`);
    const first = f.destinations[0];
    let extra: Record<string, unknown> | undefined = Object.keys(parsed.unmapped).length ? parsed.unmapped : undefined;
    if (extra && JSON.stringify(extra).length > 100_000) {
        warn('', 'The fields WanderGrid doesn\'t use come to more than 100 KB, so they are not kept.');
        extra = undefined;
    }

    return {
        externalId: f.trip.external_id,
        head: clean({
            name: f.trip.name,
            startDate: f.trip.start_date,
            endDate: f.trip.end_date,
            status: status || 'Planning',
            classification,
            location: first ? [first.name, countryName(first.country_code)].filter(Boolean).join(', ') : '',
            notes: f.trip.notes,
            currency: planCurrency,
            targetBudget,
        }),
        locations,
        activities,
        transports,
        accommodations,
        plan: clean({
            source: clean({ format: INTERCHANGE_FORMAT, schemaVersion: parsedVersion(f.schema_version), externalId: f.trip.external_id, importedAt: options.now }),
            origin: f.trip.origin,
            travellers: f.trip.travelers.length ? f.trip.travelers.map(t => clean({ label: t.label, type: t.type, age: t.age_at_trip })) : undefined,
            days: days.length ? days : undefined,
            stays: stays.length ? stays : undefined,
            dayTrips: dayTrips.length ? dayTrips : undefined,
            hiddenGems: hiddenGems.length ? hiddenGems : undefined,
            budget,
            importNotes: f.import_notes && Object.keys(f.import_notes).length ? f.import_notes : undefined,
            extra,
        }),
        entries,
        warnings,
        errors,
    };
};

const parsedVersion = (v: string) => v;

/** The object without undefined values, so stored records carry no empty keys. */
function clean<T extends object>(obj: T): T {
    const out = {} as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
    return out as T;
}

/* ------------------------------------------------------------------ what an import changes */

export interface FieldConflict {
    /** Unique per conflict: `<collection>:<external id>:<field>`. */
    key: string;
    /** What it is about ("Sensō-ji, 18 Oct" or "Trip"). */
    label: string;
    field: string;
    fieldLabel: string;
    current: string;
    incoming: string;
}
export type ConflictChoice = 'keep' | 'incoming';

/** `stays` are stay plans (with their shortlists); `bookedStays` the Accommodation records for stays already booked. */
export interface ImportCounts { stops: number; activities: number; transports: number; stays: number; bookedStays: number; candidates: number; hiddenGems: number; days: number; dayTrips: number }
export interface ImportSummary {
    added: ImportCounts;
    /** Records the file changed that no one had edited. */
    updated: number;
    /** Records already as the file has them. */
    unchanged: number;
    /** Records already in the trip, entered by hand: linked to the file, not copied. */
    duplicates: number;
    /** Records left out in the preview. */
    skipped: number;
    conflicts: number;
}

export interface ImportPlan {
    trip: Trip;
    created: boolean;
    summary: ImportSummary;
    conflicts: FieldConflict[];
}

export interface PlanImportOptions {
    /** Entry keys (`activity:<id>`, …) left out in the preview. */
    excluded?: ReadonlySet<string>;
    /** What to do with each conflict (by `FieldConflict.key`); a conflict with no choice keeps the trip's value. */
    choices?: Readonly<Record<string, ConflictChoice>>;
    /** The id for a new trip. */
    tripId?: string;
    id?: () => string;
}

const emptyCounts = (): ImportCounts => ({ stops: 0, activities: 0, transports: 0, stays: 0, bookedStays: 0, candidates: 0, hiddenGems: 0, days: 0, dayTrips: 0 });
const COUNT_OF: Record<Collection, keyof ImportCounts> = { activities: 'activities', transports: 'transports', locations: 'stops', accommodations: 'bookedStays' };

const isDuplicate: Record<Collection, (a: any, b: any) => boolean> = {
    activities: (a: Activity, b: Activity) => a.date === b.date && normName(a.title) === normName(b.title),
    transports: (a: Transport, b: Transport) => a.departureDate === b.departureDate && a.mode === b.mode && normName(a.origin) === normName(b.origin) && normName(a.destination) === normName(b.destination),
    locations: (a: LocationEntry, b: LocationEntry) => normName(a.name) === normName(b.name),
    accommodations: (a: Accommodation, b: Accommodation) => a.checkInDate === b.checkInDate && normName(a.name) === normName(b.name),
};
const describe: Record<Collection, (x: any) => string> = {
    activities: (a: Activity) => `${a.title}, ${a.date}`,
    transports: (t: Transport) => `${t.origin} → ${t.destination}, ${t.departureDate}`,
    locations: (l: LocationEntry) => l.name,
    accommodations: (a: Accommodation) => `${a.name}, ${a.checkInDate}`,
};

/**
 * What importing the file into `target` (or a new trip) would save, without saving it. Additive: nothing already in
 * the trip is removed. Each record is matched to the trip's by the file's id; a match no one edited since the last
 * import takes the file's values, while an edited or booked one keeps the trip's values field by field unless a
 * choice says otherwise (`conflicts` lists them). A record entered by hand that looks the same is linked, not copied.
 */
export const planImport = (adapted: AdaptedImport, target: Trip | undefined, options: PlanImportOptions = {}): ImportPlan => {
    const excluded = options.excluded || new Set<string>();
    const choices = options.choices || {};
    const conflicts: FieldConflict[] = [];
    const summary: ImportSummary = { added: emptyCounts(), updated: 0, unchanged: 0, duplicates: 0, skipped: 0, conflicts: 0 };
    const tripId = target?.id || options.tripId || (options.id || newId)();

    const stayEntry = (ext?: string) => `stay:${ext}`;
    const keep = <T extends { plan?: ItemPlan }>(kind: string, list: T[]) => list.filter(x => {
        const off = excluded.has(`${kind}:${x.plan?.externalId}`);
        if (off) summary.skipped++;
        return !off;
    });
    const incomingActivities = keep('activity', adapted.activities);
    const incomingTransports = keep('transport', adapted.transports).map(t => ({ ...t, itineraryId: `itinerary-${tripId}` }));
    const incomingStays = (adapted.plan.stays || []).filter(s => { const off = excluded.has(stayEntry(s.externalId)); if (off) summary.skipped++; return !off; });
    const keptStayIds = new Set(incomingStays.map(s => s.externalId));
    const incomingAccommodations = adapted.accommodations.filter(a => keptStayIds.has(a.plan?.externalId));

    const merge = <T extends { id: string; plan?: ItemPlan }>(coll: Collection, existing: T[], incoming: T[]): T[] => {
        const out = [...existing];
        for (const raw of incoming) {
            const ext = raw.plan?.externalId as string;
            const inc = { ...raw, plan: { ...raw.plan, importHash: fingerprint(raw, coll) } } as T;
            const at = out.findIndex(e => e.plan?.externalId === ext || e.id === ext);
            if (at < 0) {
                const dup = out.findIndex(e => !e.plan?.externalId && isDuplicate[coll](e, inc));
                if (dup >= 0) {
                    // Entered by hand already: link it to the file so the next import matches it, and change nothing else.
                    out[dup] = { ...out[dup], plan: { ...out[dup].plan, externalId: ext, importHash: inc.plan!.importHash } };
                    summary.duplicates++;
                    continue;
                }
                out.push(inc);
                summary.added[COUNT_OF[coll]]++;
                continue;
            }
            const cur = out[at];
            const incHash = inc.plan!.importHash;
            if (cur.plan?.importHash === incHash) { summary.unchanged++; continue; }
            const edited = isLocked(cur as { plan?: ItemPlan }) || fingerprint(cur, coll) !== cur.plan?.importHash;
            let next = cur;
            let changed = false;
            for (const field of IMPORT_FIELDS[coll]) {
                const a = plain(get(cur, field)), b = plain(get(inc, field));
                if (a === b) continue;
                // Whether a time is tentative goes with the time itself: one choice covers both.
                if (edited && field === 'plan.timeStatus') {
                    if (choices[`${coll}:${ext}:${coll === 'activities' ? 'time' : 'departureTime'}`] !== 'incoming') continue;
                } else if (edited) {
                    const k = `${coll}:${ext}:${field}`;
                    conflicts.push({ key: k, label: describe[coll](cur), field, fieldLabel: FIELD_LABEL[field] || field, current: shown(a), incoming: shown(b) });
                    if (choices[k] !== 'incoming') continue;
                }
                next = set(next, field, get(inc, field));
                changed = true;
            }
            // A stop renamed by the file loses the map position found for its old name.
            if (coll === 'locations' && changed && get(next, 'name') !== get(cur, 'name')) next = set(next, 'coordinates', undefined);
            out[at] = { ...next, plan: { ...next.plan, externalId: ext, importHash: incHash } };
            if (changed) summary.updated++; else summary.unchanged++;
        }
        return out;
    };

    const base: Trip = target ? { ...target } : {
        id: tripId,
        name: adapted.head.name,
        location: adapted.head.location,
        startDate: adapted.head.startDate,
        endDate: adapted.head.endDate,
        status: adapted.head.status,
        classification: adapted.head.classification,
        participants: [],
        privacy: 'Private',
        kind: 'trip',
    };
    const locations = merge('locations', base.locations || [], adapted.locations);
    const activities = merge('activities', base.activities || [], incomingActivities);
    const transports = merge('transports', base.transports || [], incomingTransports);
    const accommodations = merge('accommodations', base.accommodations || [], incomingAccommodations);

    // The plan: entries are matched by the file's id (days by date); a stay's booking and hotel choices made since are kept.
    const old = base.plan || {};
    const byExt = <T extends { externalId?: string }>(cur: T[] | undefined, inc: T[] | undefined, count: keyof ImportCounts, keyOf: (x: T) => string | undefined = x => x.externalId, mergeOne?: (c: T, i: T) => T): T[] | undefined => {
        if (!inc?.length) return cur;
        const out = [...(cur || [])];
        for (const item of inc) {
            const at = out.findIndex(x => keyOf(x) && keyOf(x) === keyOf(item));
            if (at < 0) { out.push(item); summary.added[count]++; } else out[at] = mergeOne ? mergeOne(out[at], item) : item;
        }
        return out;
    };
    // A stay booked in the file whose booking the trip already had (an export of this trip) adds no shortlist of its own.
    const hadBooking = new Set((base.accommodations || []).map(a => a.plan?.externalId || a.id));
    const planStays = incomingStays.filter(s => !(s.status === 'booked' && s.externalId && hadBooking.has(s.externalId) && !(old.stays || []).some(o => o.externalId === s.externalId)));
    const stays = byExt(old.stays, planStays, 'stays', undefined, (cur, inc) => ({
        ...inc,
        status: cur.status === 'booked' ? 'booked' : inc.status,
        candidates: inc.candidates.map(c => {
            const was = cur.candidates.find(x => (x.externalId && x.externalId === c.externalId) || normName(x.name) === normName(c.name));
            return was && was.status !== 'candidate' ? { ...c, status: was.status, accommodationId: was.accommodationId } : c;
        }).concat(cur.candidates.filter(x => !inc.candidates.some(c => (x.externalId && x.externalId === c.externalId) || normName(x.name) === normName(c.name)))),
    }));
    summary.added.candidates = planStays.reduce((n, s) => n + s.candidates.filter(c => !(old.stays || []).some(o => o.externalId === s.externalId && o.candidates.some(x => x.externalId === c.externalId))).length, 0);
    const plan: TripPlan = clean({
        ...old,
        source: adapted.plan.source,
        origin: adapted.plan.origin ?? old.origin,
        travellers: adapted.plan.travellers ?? old.travellers,
        days: byExt(old.days, adapted.plan.days, 'days', d => d.date),
        stays,
        dayTrips: byExt(old.dayTrips, adapted.plan.dayTrips, 'dayTrips'),
        hiddenGems: byExt(old.hiddenGems, adapted.plan.hiddenGems, 'hiddenGems'),
        budget: adapted.plan.budget ?? old.budget,
        importNotes: adapted.plan.importNotes ? { ...old.importNotes, ...adapted.plan.importNotes } : old.importNotes,
        extra: adapted.plan.extra ? { ...old.extra, ...adapted.plan.extra } : old.extra,
    });

    // The trip itself: an existing trip keeps its name, status and budget unless a choice says otherwise; its dates
    // widen to cover the plan; notes are added, never replaced.
    let trip: Trip = { ...base, locations, activities, transports, accommodations, plan };
    if (target) {
        const tripConflict = (field: 'name' | 'targetBudget', current: unknown, incoming: unknown) => {
            if (incoming === undefined || plain(current) === '' || plain(current) === plain(incoming)) return plain(current) === '' ? incoming : current;
            const k = `trip:${adapted.externalId}:${field}`;
            conflicts.push({ key: k, label: 'Trip', field, fieldLabel: FIELD_LABEL[field] || field, current: shown(current), incoming: shown(incoming) });
            return choices[k] === 'incoming' ? incoming : current;
        };
        trip.name = tripConflict('name', target.name, adapted.head.name) as string;
        trip.targetBudget = tripConflict('targetBudget', target.targetBudget, adapted.head.targetBudget) as number | undefined;
        trip.startDate = !target.startDate || adapted.head.startDate < target.startDate ? adapted.head.startDate : target.startDate;
        trip.endDate = !target.endDate || adapted.head.endDate > target.endDate ? adapted.head.endDate : target.endDate;
        trip.classification = target.classification ?? adapted.head.classification;
        trip.location = target.location || adapted.head.location;
    } else {
        trip.targetBudget = adapted.head.targetBudget;
    }
    const notes = (trip.notes || '').split('\n');
    const newNotes = adapted.head.notes.filter(n => !notes.some(line => line.trim() === n.trim()));
    if (newNotes.length) trip.notes = [...(trip.notes ? [trip.notes] : []), ...newNotes].join('\n');
    if (!trip.ledgerCurrency && !(trip.expenses || []).length && adapted.head.currency) trip.ledgerCurrency = adapted.head.currency;
    trip = clean(withIntent(trip, target));

    summary.conflicts = conflicts.length;
    return { trip, created: !target, summary, conflicts };
};

/** The number of records an import plan adds, for the button and the undo message. */
export const addedTotal = (s: ImportSummary) => s.added.stops + s.added.activities + s.added.transports + s.added.stays;

/** A trip already imported from this file (same trip id in the file), to offer it as the place to import again. */
export const previousImport = (trips: Trip[], externalId: string): Trip | undefined =>
    trips.find(t => !t.archived && t.plan?.source?.format === INTERCHANGE_FORMAT && t.plan.source.externalId === externalId);

/* ------------------------------------------------------------------ trip → file */

export interface ExportOptions {
    /** Also write booking references, seats and companions' names. Off by default: an export is easy to pass on. */
    includePrivate?: boolean;
    workspaceCurrency?: string;
    now?: string;
}

const STATUS_OUT: Record<Trip['status'], string> = { Planning: 'planning', Upcoming: 'upcoming', Past: 'past', Cancelled: 'cancelled' };
const extOf = (x: { id: string; plan?: ItemPlan }) => x.plan?.externalId || x.id;
const nullable = <T>(v: T | undefined | '') => (v === undefined || v === '' ? null : v);

/**
 * The trip as an interchange file. Ids are the ones it was imported with (or the record's own), so importing the
 * export into the same trip changes nothing. Spending (`expenses`), who paid, and account members are never written;
 * booking references, seats and companions' names only with `includePrivate`.
 */
export const exportTrip = (trip: Trip, options: ExportOptions = {}): InterchangeInput => {
    const plan = trip.plan || {};
    const locations = trip.locations || [];
    const activities = trip.activities || [];
    const accommodations = trip.accommodations || [];
    const transports = [...(trip.transports || [])].sort((a, b) => `${a.departureDate}${a.departureTime}`.localeCompare(`${b.departureDate}${b.departureTime}`));
    const itemDates = [...activities.map(a => a.date), ...transports.map(t => t.departureDate), ...accommodations.map(a => a.checkInDate)].filter(d => /^\d{4}-\d{2}-\d{2}/.test(d || '')).map(d => d.slice(0, 10)).sort();
    const start = [trip.startDate, itemDates[0]].filter(Boolean).sort()[0] || options.now?.slice(0, 10) || '';
    const end = [trip.endDate || trip.startDate, itemDates[itemDates.length - 1]].filter(Boolean).sort().pop() || start;
    const currency = plan.budget?.currency || trip.ledgerCurrency || options.workspaceCurrency || 'EUR';
    const locationExt = (date: string) => { const l = locations.find(x => x.startDate <= date && date < x.endDate); return l ? extOf(l) : null; };

    const days = daysBetween(start, end).flatMap((date, i) => {
        const dp = plan.days?.find(d => d.date === date);
        const acts = activities.filter(a => a.date?.slice(0, 10) === date).sort((a, b) => (a.plan?.order ?? 1e6) - (b.plan?.order ?? 1e6) || (a.time || '99').localeCompare(b.time || '99'));
        if (!dp && !acts.length) return [];
        return [{
            id: dp?.externalId || `day-${date}`,
            date,
            day_number: i + 1,
            destination_id: dp ? dp.destinationId ?? null : locationExt(date),
            title: nullable(dp?.title),
            summary: nullable(dp?.summary),
            schedule_status: nullable(dp?.scheduleStatus),
            activities: acts.map((a, ai) => {
                const status = a.plan?.bookingStatus;
                return {
                    id: extOf(a),
                    title: a.title,
                    location_name: nullable(a.location),
                    order: a.plan?.order ?? ai + 1,
                    priority: nullable(a.plan?.priority),
                    booking_status: nullable(status),
                    start_time: nullable(a.time),
                    time_status: a.plan?.timeStatus || (a.time ? 'fixed' : 'unscheduled'),
                    notes: nullable(a.description),
                    ...(a.type ? { type: a.type } : {}),
                    ...(a.cost || a.plan?.estimatedCost ? { cost: a.cost || a.plan?.estimatedCost } : {}),
                };
            }),
            notes: dp?.notes || [],
        }];
    });

    const bookingOut = (a: Accommodation) => ({
        name: a.name,
        address: nullable(a.address),
        type: a.type,
        check_in_time: nullable(a.checkInTime),
        check_out_time: nullable(a.checkOutTime),
        confirmation_code: options.includePrivate ? nullable(a.confirmationCode) : null,
        website: nullable(a.website),
        cost: a.cost ?? null,
    });
    const used = new Set<string>();
    const nightly = currency === 'EUR' ? 'target_per_night_eur' : 'target_per_night';
    const stays = [
        ...(plan.stays || []).map(s => {
            const acc = accommodations.find(a => s.candidates.some(c => c.accommodationId === a.id) || (s.externalId && a.plan?.externalId === s.externalId));
            if (acc) used.add(acc.id);
            return {
                id: s.externalId || `stay-${s.checkIn}`,
                destination_id: s.destinationId ?? null,
                check_in: s.checkIn,
                check_out: s.checkOut,
                nights: nightsBetween(s.checkIn, s.checkOut),
                status: acc ? acc.plan?.bookingStatus === 'paid' ? 'paid' : 'booked' : s.status,
                preferred_area: nullable(s.area),
                hotel_options: s.candidates.map((c, i) => ({ id: c.externalId || `${s.externalId || 'stay'}-hotel-${i + 1}`, name: c.name, rank: c.rank ?? i + 1, status: c.status })),
                [nightly]: s.targetPerNight ?? null,
                family_requirements: s.requirements || [],
                notes: nullable(s.notes),
                ...(acc ? { booking: bookingOut(acc) } : {}),
            };
        }),
        ...accommodations.filter(a => !used.has(a.id)).map(a => ({
            id: extOf(a),
            destination_id: locationExt(a.checkInDate),
            check_in: a.checkInDate,
            check_out: a.checkOutDate,
            nights: nightsBetween(a.checkInDate, a.checkOutDate),
            status: a.plan?.bookingStatus === 'paid' ? 'paid' : 'booked',
            preferred_area: null,
            hotel_options: [{ id: `${extOf(a)}-hotel`, name: a.name, rank: 1, status: 'booked' }],
            notes: nullable(a.notes),
            booking: bookingOut(a),
        })),
    ].filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s.check_in) && /^\d{4}-\d{2}-\d{2}$/.test(s.check_out) && s.check_out > s.check_in);

    const transport = transports.filter(t => /^\d{4}-\d{2}-\d{2}/.test(t.departureDate || '')).map(t => ({
        id: extOf(t),
        date: t.departureDate.slice(0, 10),
        mode: t.plan?.modeLabel || t.mode || 'Flight',
        origin: t.origin || '?',
        destination: t.destination || '?',
        status: bookingStatusOf(t) || 'booked',
        departure_time: nullable(t.departureTime),
        arrival_time: nullable(t.arrivalTime),
        arrival_date: t.arrivalDate ? t.arrivalDate.slice(0, 10) : null,
        ...(t.provider ? { provider: t.provider } : {}),
        ...(t.identifier ? { identifier: t.identifier } : {}),
        ...(options.includePrivate && t.confirmationCode ? { booking_reference: t.confirmationCode } : {}),
        ...(options.includePrivate && t.seatNumber ? { seat: t.seatNumber } : {}),
        ...(t.cost || t.plan?.estimatedCost ? { cost: t.cost || t.plan?.estimatedCost } : {}),
        notes: nullable(t.notes),
    }));

    const target = trip.targetBudget ?? plan.budget?.target;
    const budget = plan.budget || target ? {
        currency,
        target: target ?? null,
        ...(plan.budget?.categories ? { categories: plan.budget.categories } : {}),
        note: nullable(plan.budget?.note),
    } : undefined;

    // Fields the import didn't use go back where they were: top-level and trip-level keys in place, the rest grouped.
    const extra = plan.extra || {};
    const rootExtra: Record<string, unknown> = {}, tripExtra: Record<string, unknown> = {}, nested: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(extra)) {
        if (/^[A-Za-z0-9_-]+$/.test(k)) rootExtra[k] = v;
        else if (/^trip\.[A-Za-z0-9_-]+$/.test(k)) tripExtra[k.slice(5)] = v;
        else nested[k] = v;
    }
    const travellers = plan.travellers?.length
        ? plan.travellers.map(t => ({ label: t.label, type: t.type, ...(t.age ? { age_at_trip: t.age } : {}) }))
        : options.includePrivate ? (trip.companions || []).filter(c => !c.isPayerOnly).map(c => ({ label: c.name, type: c.role.toLowerCase() })) : [];

    return {
        ...rootExtra,
        schema_version: INTERCHANGE_VERSION,
        format: INTERCHANGE_FORMAT,
        ...(options.now ? { exported_at: options.now } : {}),
        trip: {
            ...tripExtra,
            external_id: plan.source?.externalId || trip.id,
            name: trip.name || 'Trip',
            start_date: start,
            end_date: end,
            status: STATUS_OUT[trip.status] || 'planning',
            ...(trip.classification ? { classification: trip.classification } : {}),
            currency,
            ...(plan.origin ? { origin: plan.origin } : {}),
            travelers: travellers,
            notes: (trip.notes || '').split('\n').map(s => s.trim()).filter(Boolean),
        },
        destinations: locations.filter(l => l.startDate && l.endDate && l.endDate >= l.startDate).map(l => ({
            id: extOf(l),
            name: l.name,
            country_code: nullable(l.plan?.countryCode || l.coordinates?.countryCode?.toUpperCase()),
            arrival_date: l.startDate.slice(0, 10),
            departure_date: l.endDate.slice(0, 10),
            recommended_area: nullable(l.plan?.area),
        })),
        days,
        accommodation_stays: stays,
        transport,
        ...(budget ? { budget } : {}),
        day_trips: (plan.dayTrips || []).map(d => ({ id: d.externalId || `daytrip-${d.date}`, date: d.date, origin: nullable(d.origin), destination: d.destination, estimated_total_hours: nullable(d.hours), priority: nullable(d.priority), notes: nullable(d.notes) })),
        hidden_gems: (plan.hiddenGems || []).map((g, i) => ({ id: g.externalId || `gem-${i + 1}`, name: g.name, destination_id: g.destinationId ?? null, date: g.date ?? null, status: nullable(g.status), notes: nullable(g.notes) })),
        ...(plan.importNotes ? { import_notes: plan.importNotes } : {}),
        ...(Object.keys(nested).length ? { unmapped_fields: nested } : {}),
    };
};

/** A file name for the export: the trip's name in plain letters. */
export const exportFileName = (trip: Trip) => `${normName(trip.name).replace(/\s+/g, '-').slice(0, 60) || 'trip'}.wandergrid.json`;
