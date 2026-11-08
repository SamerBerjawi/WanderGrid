import type { Trip } from '../types';
import { calculateDistance } from '../services/geocoding';
import { addDaysISO, daysBetween, isWeekend, type HolidayDay } from './calendarModel';
import { daysOffRuns, suggestBreaks, type BreakSuggestion } from './leaveOptimizer';

/**
 * "Where next?" ideas: your coming days off, matched with places on the wishlist that are worth the trip in that
 * time. The days off come from the leave optimizer (holidays joined to weekends with as few leave days as
 * possible) and, when a workspace has no holiday calendar, plain weekends with one day of leave. A place fits a
 * break when it is close enough to enjoy (`reachKm`), and the farthest place that fits gets the break, so a long
 * break is not spent on a place down the road. Pure: the hook supplies the days off, places and trips.
 */

export interface Candidate { id: string; name: string; code?: string; notes?: string; lat?: number; lng?: number }
export interface Idea {
    id: string;
    window: BreakSuggestion;
    place: Candidate;
    /** Distance from home in km, rounded to 50; null when home or the place has no position. */
    km: number | null;
}

/** The farthest worth flying for a break of this many days off. */
export const reachKm = (daysOff: number): number =>
    daysOff <= 3 ? 2000 : daysOff === 4 ? 3500 : daysOff === 5 ? 6000 : daysOff <= 8 ? 10000 : Number.POSITIVE_INFINITY;

const round50 = (n: number) => Math.round(n / 50) * 50;

export const distanceKm = (home: { lat: number; lng: number } | undefined, place: Candidate): number | null =>
    home && place.lat != null && place.lng != null ? round50(calculateDistance(home.lat, home.lng, place.lat, place.lng)) : null;

/** Whether a break overlaps a trip that is already planned (you are away then). */
export const overlapsTrip = (b: { start: string; end: string }, trips: Trip[]): boolean =>
    trips.some(t => t.status !== 'Cancelled' && !t.archived && t.startDate && t.startDate <= b.end && (t.endDate || t.startDate) >= b.start);

/**
 * Weekends joined to the working day before them (one leave day) for the workspaces without holidays: each is a
 * three-day break for one day of leave. Ones too close together are thinned out so the list varies.
 */
export const weekendBreaks = (from: string, to: string, workingDays: number[], booked: Set<string>, limit: number): BreakSuggestion[] => {
    const out: BreakSuggestion[] = [];
    let last = '';
    for (const run of daysOffRuns(from, to, workingDays, [])) {
        const before = addDaysISO(run.start, -1);
        if (before < from || isWeekend(before, workingDays) || booked.has(before)) continue;
        if (last && daysBetween(last, run.start) < 14) continue;
        last = run.start;
        out.push({ id: `weekend-${run.start}`, start: before, end: run.end, leaveDates: [before], daysOff: run.len + 1, holidays: [], ratio: run.len + 1, kind: 'value' });
        if (out.length >= limit) break;
    }
    return out;
};

export interface IdeasInput {
    today: string;
    /** How far ahead to look, in days. */
    horizon?: number;
    workingDays: number[];
    holidays: HolidayDay[];
    /** Working days already booked as leave. */
    booked?: Set<string>;
    trips: Trip[];
    places: Candidate[];
    home?: { lat: number; lng: number };
    maxLeave?: number;
    max?: number;
}

/** The days off to plan around, soonest first. */
export const upcomingBreaks = ({ today, horizon = 150, workingDays, holidays, booked = new Set(), trips, maxLeave = 3, max = 4 }: Omit<IdeasInput, 'places' | 'home'>): BreakSuggestion[] => {
    const from = addDaysISO(today, 3);
    const to = addDaysISO(today, horizon);
    const fromHolidays = suggestBreaks({ from, to, workingDays, holidays, maxLeave, booked })
        .filter(b => b.start >= from && !overlapsTrip(b, trips));
    const all = [...fromHolidays];
    if (all.length < max) all.push(...weekendBreaks(addDaysISO(today, 10), to, workingDays, booked, max - all.length).filter(b => !overlapsTrip(b, trips) && !all.some(x => x.start <= b.end && x.end >= b.start)));
    return all.sort((a, b) => a.start.localeCompare(b.start)).slice(0, max);
};

/** One idea per break: the farthest wishlist place that fits it, each place used once. */
export const buildIdeas = (input: IdeasInput): Idea[] => {
    // The best breaks (the fewest leave days for the most days off) choose first; the result is back in date order.
    const windows = upcomingBreaks(input)
        .sort((a, b) => a.leaveDates.length - b.leaveDates.length || b.daysOff - a.daysOff || a.start.localeCompare(b.start));
    const used = new Set<string>();
    const out: Idea[] = [];
    for (const window of windows) {
        const reach = reachKm(window.daysOff);
        const options = input.places
            .filter(p => !used.has(p.id))
            .map(p => ({ p, km: distanceKm(input.home, p) }))
            .filter(o => o.km === null || o.km <= reach);
        if (!options.length) continue;
        // The farthest that fits uses the break well; places with no distance come last.
        options.sort((a, b) => (b.km ?? -1) - (a.km ?? -1) || a.p.name.localeCompare(b.p.name));
        const pick = options[0];
        used.add(pick.p.id);
        out.push({ id: `${window.id}|${pick.p.id}`, window, place: pick.p, km: pick.km });
    }
    return out.sort((a, b) => a.window.start.localeCompare(b.window.start));
};

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/** "4 days off for 1 leave day", or "3 days off, no leave needed". */
export const describeBreak = (b: BreakSuggestion): string =>
    b.leaveDates.length === 0 ? `${days(b.daysOff)} off, no leave needed` : `${days(b.daysOff)} off for ${days(b.leaveDates.length)} of leave`;

/** The new-trip address for an idea: the dates and place are filled in on arrival. */
export const ideaLink = (idea: Idea): string => {
    const q = new URLSearchParams({ new: '1', start: idea.window.start, end: idea.window.end, to: idea.place.name });
    return `/trips?${q.toString()}`;
};
