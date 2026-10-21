import type { Accommodation, Activity, Transport, Trip } from '../types';

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
