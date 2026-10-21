import type { Accommodation, Activity, Transport, Trip } from '../types';
import { calculateDistance } from '../services/geocoding';

/** One thing happening on one day of a trip. */
export type DayItem =
    | { kind: 'transport'; id: string; part: 'depart' | 'arrive'; time: string; item: Transport }
    | { kind: 'stay'; id: string; part: 'in' | 'out'; time: string; item: Accommodation }
    | { kind: 'activity'; id: string; part: 'at'; time: string; item: Activity };

export interface TripDay {
    date: string;
    /** 1-based position in the trip, or 0 for a day outside the trip's dates. */
    number: number;
    items: DayItem[];
}

const DAY_MS = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const toTime = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);

/** Every day from start to end (inclusive), as ISO dates. */
export const daysBetween = (start: string, end: string): string[] => {
    const s = toTime(start);
    const e = toTime(end || start);
    if (Number.isNaN(s) || Number.isNaN(e) || e < s) return Number.isNaN(s) ? [] : [iso(s)];
    const out: string[] = [];
    for (let t = s; t <= e && out.length < 400; t += DAY_MS) out.push(iso(t));
    return out;
};

/**
 * The trip laid out day by day: each leg on its departure day (and again on its arrival day when that
 * differs), each stay on its check-in and check-out days, each activity on its day. Days with items
 * outside the trip's dates are kept, so nothing booked disappears.
 */
export const buildDays = (trip: Trip): TripDay[] => {
    const byDate = new Map<string, DayItem[]>();
    const push = (date: string | undefined, item: DayItem) => {
        const d = (date || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
        byDate.set(d, [...(byDate.get(d) || []), item]);
    };
    (trip.transports || []).forEach(t => {
        push(t.departureDate, { kind: 'transport', id: `${t.id}:d`, part: 'depart', time: t.departureTime || '', item: t });
        if (t.arrivalDate && t.arrivalDate.slice(0, 10) !== (t.departureDate || '').slice(0, 10)) {
            push(t.arrivalDate, { kind: 'transport', id: `${t.id}:a`, part: 'arrive', time: t.arrivalTime || '', item: t });
        }
    });
    (trip.accommodations || []).forEach(a => {
        push(a.checkInDate, { kind: 'stay', id: `${a.id}:i`, part: 'in', time: a.checkInTime || '', item: a });
        push(a.checkOutDate, { kind: 'stay', id: `${a.id}:o`, part: 'out', time: a.checkOutTime || '', item: a });
    });
    (trip.activities || []).forEach(a => push(a.date, { kind: 'activity', id: a.id, part: 'at', time: a.time || '', item: a }));

    const tripDates = trip.startDate ? daysBetween(trip.startDate, trip.endDate || trip.startDate) : [];
    const all = Array.from(new Set([...tripDates, ...byDate.keys()])).sort();
    return all.map(date => ({
        date,
        number: tripDates.indexOf(date) + 1,
        items: (byDate.get(date) || []).sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99')),
    }));
};

export interface CostSplit { transport: number; stays: number; activities: number; total: number }

export const costSplit = (trip: Trip): CostSplit => {
    const sum = (list: { cost?: number }[] | undefined) => (list || []).reduce((s, i) => s + (i.cost || 0), 0);
    const transport = sum(trip.transports);
    const stays = sum(trip.accommodations);
    const activities = sum(trip.activities);
    return { transport, stays, activities, total: transport + stays + activities };
};

export interface TripStats {
    days: number;
    /** Nights covered by a booked stay, and the nights the trip has. */
    nightsBooked: number;
    nightsTotal: number;
    distanceKm: number;
    excursions: number;
}

const nightsOf = (a?: string, b?: string) => {
    if (!a || !b) return 0;
    const n = Math.round((toTime(b) - toTime(a)) / DAY_MS);
    return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Counts for the page header: how long, how many nights have a bed, how far, how many excursions. */
export const tripStats = (trip: Trip): TripStats => {
    const days = trip.startDate ? daysBetween(trip.startDate, trip.endDate || trip.startDate).length : 0;
    const nightsTotal = Math.max(0, days - 1);
    const nightsBooked = Math.min(nightsTotal || Infinity, (trip.accommodations || []).reduce((n, a) => n + nightsOf(a.checkInDate, a.checkOutDate), 0));
    const distanceKm = Math.round((trip.transports || []).reduce((sum, t) => {
        if (t.distance != null) return sum + t.distance;
        if (t.originLat != null && t.originLng != null && t.destLat != null && t.destLng != null) return sum + calculateDistance(t.originLat, t.originLng, t.destLat, t.destLng);
        return sum;
    }, 0));
    return { days, nightsBooked: Number.isFinite(nightsBooked) ? nightsBooked : 0, nightsTotal, distanceKm, excursions: (trip.transports || []).filter(t => t.isExcursion).length };
};

/** The trip's target budget: the saved one, or one an older page stored as a custom field. */
export const targetBudgetOf = (trip: Trip): number | undefined => {
    if (trip.targetBudget && trip.targetBudget > 0) return trip.targetBudget;
    const legacy = Number((trip as unknown as { customFields?: Array<{ key: string; value: string }> }).customFields?.find(f => f.key === 'targetBudget')?.value);
    return legacy > 0 ? legacy : undefined;
};

/** An ISO date moved by whole days (UTC, so daylight saving never shifts it). */
export const shiftDate = (date: string | undefined, days: number): string => {
    if (!date) return '';
    const t = toTime(date);
    return Number.isNaN(t) ? date : iso(t + days * DAY_MS);
};
