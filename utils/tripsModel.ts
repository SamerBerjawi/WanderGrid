import type { Trip } from '../types';

/**
 * Pure trip logic for the New Trips page (UI_UX_DESIGN_REFERENCE.md §5.2 row 3): which column a
 * trip sits in, how long it is, when it starts, and what it still needs.
 */

export type TripBucket = 'planned' | 'confirmed' | 'past';

export const BUCKET_STATUS: Record<TripBucket, Trip['status']> = {
    planned: 'Planning',
    confirmed: 'Upcoming',
    past: 'Past',
};

export const todayISO = (): string => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const DAY_MS = 86_400_000;
const toTime = (iso?: string) => {
    if (!iso) return NaN;
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return Date.UTC(y, (m || 1) - 1, d || 1);
};

/** True when the trip's dates have passed, whatever its stored status says. */
export const hasPastDates = (trip: Trip, today: string): boolean =>
    Boolean((trip.endDate && trip.endDate < today) || (trip.startDate && trip.startDate < today && !trip.endDate));

/** The column a trip sits in: past by status or dates, confirmed when Upcoming, otherwise planned. */
export const bucketOf = (trip: Trip, today: string): TripBucket => {
    if (trip.status === 'Past' || hasPastDates(trip, today)) return 'past';
    return trip.status === 'Upcoming' ? 'confirmed' : 'planned';
};

/**
 * Whether a drag or a "Move to" may put the trip in a column. Dates that have already passed pin a
 * trip to Past until the dates are edited.
 */
export const canMoveTo = (trip: Trip, bucket: TripBucket, today: string): { ok: true } | { ok: false; reason: string } =>
    bucket !== 'past' && hasPastDates(trip, today)
        ? { ok: false, reason: 'The dates have passed. Change the dates first.' }
        : { ok: true };

/** Inclusive number of days, or 0 when the dates are missing. */
export const tripDays = (trip: Trip): number => {
    const s = toTime(trip.startDate);
    const e = toTime(trip.endDate || trip.startDate);
    if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
    return Math.round((e - s) / DAY_MS) + 1;
};

export const isTravelling = (trip: Trip, today: string): boolean =>
    Boolean(trip.startDate && trip.startDate <= today && (trip.endDate || trip.startDate) >= today) && trip.status !== 'Past';

export interface TripTiming {
    /** The hero number on a card, or null when the trip is undated. */
    value: number | null;
    /** The muted qualifier under it. */
    unit: string;
    state: 'now' | 'soon' | 'later' | 'past' | 'undated';
}

/** Days to go, days left, or days since, for the card's hero number. */
export const timingOf = (trip: Trip, today: string): TripTiming => {
    const start = toTime(trip.startDate);
    if (Number.isNaN(start)) return { value: null, unit: 'No dates yet', state: 'undated' };
    const now = toTime(today);
    const end = toTime(trip.endDate || trip.startDate);
    if (isTravelling(trip, today)) {
        const left = Math.round((end - now) / DAY_MS);
        return { value: left, unit: left === 1 ? 'day left' : 'days left', state: 'now' };
    }
    if (bucketOf(trip, today) === 'past') {
        const since = Math.max(0, Math.round((now - (Number.isNaN(end) ? start : end)) / DAY_MS));
        return { value: since, unit: since === 1 ? 'day ago' : 'days ago', state: 'past' };
    }
    const until = Math.max(0, Math.round((start - now) / DAY_MS));
    return { value: until, unit: until === 1 ? 'day to go' : 'days to go', state: until <= 60 ? 'soon' : 'later' };
};

/** What a coming trip is still missing, so the card can ask for it. Only trips within 90 days ask. */
export const tripNeeds = (trip: Trip, today: string): ('flights' | 'stay')[] => {
    if (bucketOf(trip, today) !== 'confirmed' || trip.isBundleOnly || isTravelling(trip, today)) return [];
    const t = timingOf(trip, today);
    if (t.value === null || t.value > 90) return [];
    const out: ('flights' | 'stay')[] = [];
    if (!(trip.transports || []).length) out.push('flights');
    if (!(trip.accommodations || []).length) out.push('stay');
    return out;
};

/** Distinct destination names, in route order. */
export const destinationsOf = (trip: Trip): string[] => {
    const names = (trip.locations || []).map(l => l.name).filter(Boolean);
    const source = names.length ? names : (trip.location || '').split(',').map(s => s.trim()).filter(Boolean);
    return Array.from(new Set(source));
};

export const tripMatches = (trip: Trip, query: string): boolean => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    return [trip.name, trip.subtitle, trip.description, trip.location, ...(trip.locations || []).map(l => l.name)]
        .some(part => (part || '').toLowerCase().includes(q));
};

export type TripSort = 'date' | 'name' | 'length' | 'cost' | 'destination';

/** The list in the chosen order. `date` keeps the board's own order (soonest first, past newest first). */
export const sortTrips = (trips: Trip[], key: TripSort): Trip[] => {
    if (key === 'date') return trips;
    const copy = [...trips];
    const first = (t: Trip) => destinationsOf(t)[0] || '';
    if (key === 'name') copy.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    else if (key === 'destination') copy.sort((a, b) => first(a).localeCompare(first(b), undefined, { sensitivity: 'base' }) || a.name.localeCompare(b.name));
    else if (key === 'length') copy.sort((a, b) => tripDays(b) - tripDays(a) || a.name.localeCompare(b.name));
    else copy.sort((a, b) => tripCost(b) - tripCost(a) || a.name.localeCompare(b.name));
    return copy;
};

export const tripYears = (trip: Trip): string[] =>
    Array.from(new Set([trip.startDate, trip.endDate].map(d => (d || '').slice(0, 4)).filter(y => /^\d{4}$/.test(y))));

/** "Kyoto · Osaka · +3": at most `max` names, then how many more. */
export const destinationLabel = (trip: Trip, max = 2): string => {
    const all = destinationsOf(trip);
    if (all.length <= max) return all.join(' · ');
    return `${all.slice(0, max).join(' · ')} · +${all.length - max}`;
};

/** Everything booked on the trip (transport, stays, activities). */
export const tripCost = (trip: Trip): number =>
    [...(trip.transports || []), ...(trip.accommodations || []), ...(trip.activities || [])].reduce((sum, i) => sum + (i.cost || 0), 0);
