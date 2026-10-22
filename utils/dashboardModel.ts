import type { EntitlementType, Trip, User } from '../types';
import { calculateDistance, getCoordinatesSync } from '../services/geocoding';
import { destinationsOf, isTravelling } from './tripsModel';

/**
 * Pure logic for the New Dashboard (UI_UX_DESIGN_REFERENCE.md §5.2 rows 2 and 14): what was travelled
 * (legs, distance, nights), daily series for the Metric Card, yearly totals, what is next, and leave by
 * type. Nothing here touches the network or storage.
 */

export type LegKind = 'flight' | 'rail' | 'road' | 'sea';

export const LEG_KIND_LABEL: Record<LegKind, string> = { flight: 'Flights', rail: 'Rail', road: 'Road', sea: 'Sea' };
const LEG_KINDS: LegKind[] = ['flight', 'rail', 'road', 'sea'];

const kindOfMode = (mode?: string): LegKind => {
    if (mode === 'Train') return 'rail';
    if (mode === 'Bus' || mode === 'Car Rental' || mode === 'Personal Car') return 'road';
    if (mode === 'Cruise' || mode === 'Ferry') return 'sea';
    return 'flight';
};

export interface Leg {
    key: string;
    tripId?: string;
    kind: LegKind;
    origin: string;
    destination: string;
    /** YYYY-MM-DD of departure. */
    date: string;
    km: number;
    provider?: string;
    identifier?: string;
}

const DAY_MS = 86_400_000;
const toUTC = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return Date.UTC(y, (m || 1) - 1, d || 1);
};
const toISO = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => toISO(toUTC(iso) + n * DAY_MS);
const daysBetween = (a: string, b: string) => Math.round((toUTC(b) - toUTC(a)) / DAY_MS);

/** The trips that count as trips: not cancelled, not a hidden flight bundle. */
export const realTrips = (trips: Trip[]): Trip[] =>
    trips.filter(t => t.status !== 'Cancelled' && !t.hideInPlanner && !t.isBundleOnly && !!t.startDate);

const legKm = (t: Trip['transports'] extends (infer T)[] | undefined ? T : never): number => {
    if (t.distance) return t.distance;
    let { originLat, originLng, destLat, destLng } = t;
    if (originLat == null || originLng == null) {
        const c = t.origin ? getCoordinatesSync(t.origin) : undefined;
        if (c) { originLat = c.lat; originLng = c.lng; }
    }
    if (destLat == null || destLng == null) {
        const c = t.destination ? getCoordinatesSync(t.destination) : undefined;
        if (c) { destLat = c.lat; destLng = c.lng; }
    }
    if (originLat == null || originLng == null || destLat == null || destLng == null) return 0;
    return calculateDistance(originLat, originLng, destLat, destLng);
};

/**
 * Every leg that has happened by `today`: those on trips (not cancelled, hidden bundles included) and
 * flights that belong to no trip, with a flight that appears twice counted once.
 */
export const legsOf = (trips: Trip[], flights: any[], today: string): Leg[] => {
    const legs: Leg[] = [];
    const seen = new Set<string>();
    const push = (t: any, trip: Trip | undefined, i: number) => {
        const date = (t.departureDate || trip?.startDate || '').slice(0, 10);
        if (!date || date > today || !t.origin || !t.destination) return;
        const dedupe = `${t.id || ''}|${t.origin}|${t.destination}|${date}|${t.identifier || ''}`;
        const alt = `${t.identifier || ''}|${date}|${t.origin}`;
        if (seen.has(dedupe) || (t.identifier && seen.has(alt))) return;
        seen.add(dedupe);
        if (t.identifier) seen.add(alt);
        legs.push({
            key: `${trip?.id || 'flight'}:${t.id || i}`,
            tripId: trip?.id,
            kind: kindOfMode(t.mode),
            origin: t.origin,
            destination: t.destination,
            date,
            km: legKm(t),
            provider: t.provider,
            identifier: t.identifier,
        });
    };
    trips.forEach(trip => {
        if (trip.status === 'Cancelled') return;
        (trip.transports || []).forEach((t, i) => push(t, trip, i));
    });
    const tripIds = new Set(trips.map(t => t.id));
    (flights || []).forEach((f, i) => {
        const owned = f.tripId && f.tripId !== 'unassigned' && tripIds.has(f.tripId);
        push({ ...f, mode: f.mode || 'Flight' }, owned ? trips.find(t => t.id === f.tripId) : undefined, i);
    });
    return legs;
};

/** Nights between start and end, counted up to `today` for a trip still under way. */
export const nightsAway = (trip: Trip, today: string): number => {
    if (!trip.startDate || trip.startDate > today) return 0;
    const end = trip.endDate && trip.endDate < today ? trip.endDate : today;
    return Math.max(0, daysBetween(trip.startDate, end));
};

export const ORBIT_KM = 40_075;

export interface TravelTotals {
    trips: number;
    nights: number;
    flights: number;
    km: number;
}

export const travelTotals = (trips: Trip[], legs: Leg[], today: string): TravelTotals => {
    const done = realTrips(trips).filter(t => t.startDate <= today);
    return {
        trips: done.length,
        nights: done.reduce((n, t) => n + nightsAway(t, today), 0),
        flights: legs.filter(l => l.kind === 'flight').length,
        km: Math.round(legs.reduce((n, l) => n + l.km, 0)),
    };
};

/* -------------------------------- series ---------------------------------- */

/** One entry per day, oldest first, ending today. */
export const dayAxis = (today: string, days: number): string[] =>
    Array.from({ length: days }, (_, i) => addDays(today, i - (days - 1)));

export interface DailySeries {
    segments: string[];
    data: { date: string; parts: number[] }[];
}

const finishSeries = (axis: string[], names: string[], grid: number[][]): DailySeries => {
    // Segments that never carry a value would only be rows of zeros.
    const keep = names.map((_, s) => grid.some(day => day[s] > 0));
    const segments = names.filter((_, s) => keep[s]);
    return {
        segments: segments.length ? segments : [names[0]],
        data: axis.map((date, d) => ({
            date,
            parts: segments.length ? grid[d].filter((_, s) => keep[s]) : [0],
        })),
    };
};

const emptyGrid = (days: number, width: number) => Array.from({ length: days }, () => new Array<number>(width).fill(0));

export const distanceSeries = (legs: Leg[], axis: string[]): DailySeries => {
    const grid = emptyGrid(axis.length, LEG_KINDS.length);
    const first = axis[0];
    legs.forEach(l => {
        const d = daysBetween(first, l.date);
        if (d >= 0 && d < axis.length) grid[d][LEG_KINDS.indexOf(l.kind)] += l.km;
    });
    return finishSeries(axis, LEG_KINDS.map(k => LEG_KIND_LABEL[k]), grid);
};

const LENGTH_NAMES = ['Short (to 3 nights)', 'A week (4–9)', 'Long (10+)'];
const lengthBucket = (nights: number) => (nights <= 3 ? 0 : nights <= 9 ? 1 : 2);

export const nightsSeries = (trips: Trip[], axis: string[]): DailySeries => {
    const grid = emptyGrid(axis.length, LENGTH_NAMES.length);
    const first = axis[0];
    const today = axis[axis.length - 1];
    realTrips(trips).forEach(t => {
        const total = Math.max(0, daysBetween(t.startDate, t.endDate || t.startDate));
        const bucket = lengthBucket(total);
        const last = (t.endDate && t.endDate < today ? t.endDate : today);
        for (let day = t.startDate; day < last; day = addDays(day, 1)) {
            const d = daysBetween(first, day);
            if (d >= 0 && d < axis.length) grid[d][bucket] += 1;
        }
    });
    return finishSeries(axis, LENGTH_NAMES, grid);
};

const SPEND_NAMES = ['Transport', 'Stays', 'Activities'];

export const spendSeries = (trips: Trip[], axis: string[]): DailySeries => {
    const grid = emptyGrid(axis.length, SPEND_NAMES.length);
    const first = axis[0];
    const add = (date: string | undefined, s: number, cost?: number) => {
        if (!date || !cost) return;
        const d = daysBetween(first, date.slice(0, 10));
        if (d >= 0 && d < axis.length) grid[d][s] += cost;
    };
    trips.forEach(t => {
        if (t.status === 'Cancelled') return;
        (t.transports || []).forEach(x => add(x.departureDate || t.startDate, 0, x.cost));
        (t.accommodations || []).forEach(x => add(x.checkInDate || t.startDate, 1, x.cost));
        (t.activities || []).forEach(x => add(x.date || t.startDate, 2, x.cost));
    });
    return finishSeries(axis, SPEND_NAMES, grid);
};

/** Trips pinned on the chart, by the day they start. */
export const tripEvents = (trips: Trip[], axis: string[]): { date: string; label: string }[] => {
    const set = new Set(axis);
    return realTrips(trips)
        .filter(t => set.has(t.startDate.slice(0, 10)))
        .map(t => ({ date: t.startDate.slice(0, 10), label: t.name }));
};

/* --------------------------------- years ---------------------------------- */

export interface YearRow {
    year: string;
    trips: number;
    km: number;
    nights: number;
}

/** Trips, distance and nights for each year with any travel, oldest first, up to this year. */
export const yearlyRows = (trips: Trip[], legs: Leg[], today: string): YearRow[] => {
    const rows = new Map<string, YearRow>();
    const row = (y: string) => {
        let r = rows.get(y);
        if (!r) { r = { year: y, trips: 0, km: 0, nights: 0 }; rows.set(y, r); }
        return r;
    };
    realTrips(trips).filter(t => t.startDate <= today).forEach(t => {
        row(t.startDate.slice(0, 4)).trips += 1;
        const end = t.endDate && t.endDate < today ? t.endDate : today;
        for (let day = t.startDate; day < end; day = addDays(day, 1)) row(day.slice(0, 4)).nights += 1;
    });
    legs.forEach(l => { row(l.date.slice(0, 4)).km += l.km; });
    const years = [...rows.keys()].sort();
    if (!years.length) return [];
    // Fill the gaps, so a quiet year shows as a quiet year.
    const out: YearRow[] = [];
    for (let y = Number(years[0]); y <= Number(today.slice(0, 4)); y++) out.push(rows.get(String(y)) ?? { year: String(y), trips: 0, km: 0, nights: 0 });
    return out.map(r => ({ ...r, km: Math.round(r.km) }));
};

/* ------------------------------- what's next ------------------------------ */

export interface UpNext {
    trip: Trip;
    /** Under way today. */
    travelling: boolean;
    /** Days until it starts (0 today), or days left while travelling. */
    days: number;
}

/** Upcoming trips (not cancelled, not ended), soonest first. */
export const upcomingTrips = (trips: Trip[], today: string): Trip[] =>
    realTrips(trips)
        .filter(t => (t.endDate || t.startDate) >= today && t.status !== 'Past')
        .sort((a, b) => a.startDate.localeCompare(b.startDate));

export const upNext = (trips: Trip[], today: string): UpNext | null => {
    const list = upcomingTrips(trips, today);
    const now = list.find(t => isTravelling(t, today));
    if (now) return { trip: now, travelling: true, days: Math.max(0, daysBetween(today, now.endDate || today)) };
    const next = list.find(t => t.startDate >= today);
    return next ? { trip: next, travelling: false, days: daysBetween(today, next.startDate) } : null;
};

export const recentTrips = (trips: Trip[], today: string): Trip[] =>
    realTrips(trips)
        .filter(t => t.startDate <= today && (t.endDate || t.startDate) < today)
        .sort((a, b) => (b.endDate || b.startDate).localeCompare(a.endDate || a.startDate));

/** The first flight on a trip under way, flying today. */
export const flightToday = (trips: Trip[], today: string) => {
    const active = realTrips(trips).find(t => t.startDate <= today && (t.endDate || t.startDate) >= today);
    const flight = (active?.transports || [])
        .filter(t => t.mode === 'Flight' && t.departureDate === today)
        .sort((a, b) => (a.departureTime || '00:00').localeCompare(b.departureTime || '00:00'))[0];
    if (!flight) return null;
    const code = flight.providerCode && flight.identifier ? `${flight.providerCode}${flight.identifier}` : flight.identifier;
    return { code: code || 'Flight', origin: flight.origin, destination: flight.destination, time: flight.departureTime, tripId: active!.id };
};

export const tripsPlace = (trip: Trip, max = 2): string => {
    const all = destinationsOf(trip);
    return all.length <= max ? all.join(' · ') : `${all.slice(0, max).join(' · ')} · +${all.length - max}`;
};


/* ---------------------------------- rank ---------------------------------- */

const RANKS = [
    { name: 'Backyard Explorer', countries: 0 },
    { name: 'Wanderer', countries: 2 },
    { name: 'Voyager', countries: 5 },
    { name: 'Globetrotter', countries: 10 },
    { name: 'Nomad', countries: 20 },
    { name: 'Citizen of the World', countries: 30 },
];

export const rankOf = (countries: number) => {
    const index = RANKS.reduce((best, r, i) => (countries >= r.countries ? i : best), 0);
    const next = RANKS[index + 1];
    return { name: RANKS[index].name, next: next ? { name: next.name, needs: next.countries - countries } : null };
};

/* ---------------------------------- leave --------------------------------- */

export type LeaveAccent = 'navy' | 'green' | 'mustard' | 'muted' | 'plum' | 'rust' | 'sea';

export const ENTITLEMENT_ACCENT: Record<EntitlementType['color'], LeaveAccent> = {
    blue: 'navy', green: 'green', amber: 'mustard', gray: 'muted', purple: 'plum', red: 'rust', indigo: 'navy', pink: 'plum', teal: 'sea', cyan: 'sea',
};

export interface LeaveUse {
    entitlementId: string;
    name: string;
    accent: LeaveAccent;
    days: number;
}

/** Days of leave a member has booked in a year, by leave type: the trip's allocations, else its single type. */
export const leaveByType = (trips: Trip[], types: EntitlementType[], user: Pick<User, 'id'>, year: number): LeaveUse[] => {
    const days = new Map<string, number>();
    const add = (id: string, n: number) => { if (n > 0) days.set(id, (days.get(id) || 0) + n); };
    trips.forEach(t => {
        if (t.status === 'Cancelled' || !t.participants?.includes(user.id)) return;
        const startYear = Number((t.startDate || '').slice(0, 4));
        if (t.allocations?.length) {
            t.allocations.forEach(a => { if ((a.targetYear ?? startYear) === year) add(a.entitlementId, a.days); });
        } else if (t.entitlementId) {
            const excluded = new Set(t.excludedDates || []);
            let n = 0;
            for (let day = t.startDate; day <= (t.endDate || t.startDate); day = addDays(day, 1)) {
                if (day.startsWith(String(year)) && !excluded.has(day)) n += 1;
            }
            add(t.entitlementId, n);
        }
    });
    return [...days.entries()].map(([id, n]) => {
        const type = types.find(e => e.id === id);
        return { entitlementId: id, name: type?.name || 'Leave', accent: type ? ENTITLEMENT_ACCENT[type.color] : 'muted', days: n };
    }).sort((a, b) => b.days - a.days);
};

export interface LeaveTrip {
    trip: Trip;
    days: number;
}

/** The trips that use a member's leave in a year, soonest first, with the days each one takes. */
export const leaveTrips = (trips: Trip[], user: Pick<User, 'id'>, year: number): LeaveTrip[] => {
    const out: LeaveTrip[] = [];
    trips.forEach(t => {
        if (t.status === 'Cancelled' || !t.participants?.includes(user.id)) return;
        const startYear = Number((t.startDate || '').slice(0, 4));
        let n = 0;
        if (t.allocations?.length) {
            n = t.allocations.filter(a => (a.targetYear ?? startYear) === year).reduce((sum, a) => sum + a.days, 0);
        } else if (t.entitlementId) {
            const excluded = new Set(t.excludedDates || []);
            for (let day = t.startDate; day <= (t.endDate || t.startDate); day = addDays(day, 1)) {
                if (day.startsWith(String(year)) && !excluded.has(day)) n += 1;
            }
        }
        if (n > 0) out.push({ trip: t, days: n });
    });
    return out.sort((a, b) => a.trip.startDate.localeCompare(b.trip.startDate));
};
