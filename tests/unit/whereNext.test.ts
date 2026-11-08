import { describe, expect, it } from 'vitest';
import type { Trip } from '../../types';
import { holidayDays } from '../../utils/calendarModel';
import { buildIdeas, describeBreak, distanceKm, ideaLink, overlapsTrip, reachKm, upcomingBreaks, weekendBreaks, type Candidate } from '../../utils/whereNext';

const WEEK = [1, 2, 3, 4, 5];
const TODAY = '2026-11-07'; // a Saturday
const holidays = holidayDays([{ id: 'be', countryName: 'Belgium', holidays: [
    { id: 'h1', name: 'Christmas Day', date: '2026-12-25', countryCode: 'BE', isIncluded: true },
    { id: 'h2', name: 'Good Friday', date: '2027-03-26', countryCode: 'BE', isIncluded: true },
    { id: 'h3', name: 'Easter Monday', date: '2027-03-29', countryCode: 'BE', isIncluded: true },
] } as any], 'none', WEEK);

const HOME = { lat: 50.85, lng: 4.35 }; // Brussels
const ghent: Candidate = { id: 'gh', name: 'Ghent', lat: 51.05, lng: 3.72 };
const lisbon: Candidate = { id: 'li', name: 'Lisbon', lat: 38.72, lng: -9.14 };
const athens: Candidate = { id: 'at', name: 'Athens', lat: 37.98, lng: 23.73 }; // about 2,100 km
const tokyo: Candidate = { id: 'to', name: 'Tokyo', lat: 35.68, lng: 139.69 };
const trip = (start: string, end: string, over: Partial<Trip> = {}): Trip => ({ id: 't', name: 't', location: '', startDate: start, endDate: end, status: 'Upcoming', participants: [], ...over });

const base = { today: TODAY, workingDays: WEEK, holidays, trips: [] as Trip[], places: [ghent, lisbon, athens, tokyo], home: HOME };

describe('reach and distance', () => {
    it('allows farther for longer breaks', () => {
        expect(reachKm(3)).toBe(2000);
        expect(reachKm(4)).toBe(3500);
        expect(reachKm(5)).toBe(6000);
        expect(reachKm(8)).toBe(10000);
        expect(reachKm(9)).toBe(Number.POSITIVE_INFINITY);
    });

    it('measures from home in steps of 50 km, and has nothing without a position', () => {
        expect(distanceKm(HOME, lisbon)).toBeGreaterThan(1650);
        expect(distanceKm(HOME, lisbon)! % 50).toBe(0);
        expect(distanceKm(undefined, lisbon)).toBeNull();
        expect(distanceKm(HOME, { id: 'x', name: 'Nowhere' })).toBeNull();
    });
});

describe('the days off to plan around', () => {
    it('finds the long weekends the holidays make, soonest first, and leaves out ones you are away', () => {
        const all = upcomingBreaks({ ...base, max: 6 });
        expect(all.map(b => b.start)).toContain('2026-12-25');
        const easter = all.find(b => b.holidays.includes('Good Friday'))!;
        expect(easter).toMatchObject({ start: '2027-03-26', end: '2027-03-29', daysOff: 4, kind: 'free' });
        expect(all.map(b => b.start)).toEqual([...all.map(b => b.start)].sort());
        const away = upcomingBreaks({ ...base, trips: [trip('2026-12-24', '2026-12-28')], max: 6 });
        expect(away.some(b => b.holidays.includes('Christmas Day'))).toBe(false);
    });

    it('offers weekends with one leave day when there are no holidays, thinned out so they vary', () => {
        const w = weekendBreaks('2026-11-10', '2027-01-31', WEEK, new Set(), 4);
        expect(w).toHaveLength(4);
        w.forEach(b => {
            expect(b.leaveDates).toHaveLength(1);
            expect(b.daysOff).toBe(3);
            expect(new Date(`${b.start}T00:00:00Z`).getUTCDay()).toBe(5); // a Friday
        });
        const gaps = w.slice(1).map((b, i) => (Date.parse(b.start) - Date.parse(w[i].start)) / 86_400_000);
        expect(Math.min(...gaps)).toBeGreaterThanOrEqual(14);
        // A Friday already booked as leave is not asked for again.
        expect(weekendBreaks('2026-11-10', '2026-11-30', WEEK, new Set(['2026-11-13']), 4).map(b => b.start)).not.toContain('2026-11-13');
        const noHolidays = upcomingBreaks({ ...base, holidays: [], max: 3 });
        expect(noHolidays).toHaveLength(3);
        expect(noHolidays.every(b => b.leaveDates.length === 1)).toBe(true);
    });

    it('overlap means any shared day', () => {
        expect(overlapsTrip({ start: '2026-12-25', end: '2026-12-27' }, [trip('2026-12-27', '2026-12-30')])).toBe(true);
        expect(overlapsTrip({ start: '2026-12-25', end: '2026-12-27' }, [trip('2026-12-28', '2026-12-30')])).toBe(false);
        expect(overlapsTrip({ start: '2026-12-25', end: '2026-12-27' }, [trip('2026-12-26', '2026-12-30', { status: 'Cancelled' })])).toBe(false);
    });
});

describe('matching a break with a place', () => {
    it('gives each break the farthest place that fits it, each place once', () => {
        const ideas = buildIdeas({ ...base, max: 4 });
        const christmas = ideas.find(i => i.window.holidays.includes('Christmas Day'))!;
        const easter = ideas.find(i => i.window.holidays.includes('Good Friday'))!;
        // Four days off reaches 3,500 km and chooses first: Athens (2,100 km), not Lisbon. Three days reach 2,000 km: Lisbon.
        expect(easter.place.name).toBe('Athens');
        expect(christmas.place.name).toBe('Lisbon');
        expect(ideas.every(i => i.place.name !== 'Tokyo')).toBe(true);
        expect(new Set(ideas.map(i => i.place.id)).size).toBe(ideas.length);
    });

    it('sends a long break far away, and skips a break nothing fits', () => {
        const long = buildIdeas({ ...base, holidays: [], places: [ghent, tokyo], max: 3 });
        // Weekend breaks are three days: Tokyo never fits, so Ghent has only one break to go to and the rest are skipped.
        expect(long.map(i => i.place.name)).toEqual(['Ghent']);
        const week = buildIdeas({ ...base, holidays: [], places: [tokyo], trips: [], max: 3 });
        expect(week).toEqual([]);
    });

    it('falls back to any place when home has no position', () => {
        const ideas = buildIdeas({ ...base, home: undefined, max: 4 });
        expect(ideas.length).toBeGreaterThan(0);
        expect(ideas.every(i => i.km === null)).toBe(true);
    });
});

describe('wording and links', () => {
    it('describes a break', () => {
        const [free] = upcomingBreaks({ ...base, max: 1 });
        expect(describeBreak(free)).toBe('3 days off, no leave needed');
        expect(describeBreak({ ...free, daysOff: 4, leaveDates: ['2027-03-25'] })).toBe('4 days off for 1 day of leave');
        expect(describeBreak({ ...free, daysOff: 5, leaveDates: ['a', 'b'] })).toBe('5 days off for 2 days of leave');
    });

    it('links to a new trip with the dates and place filled in', () => {
        const idea = buildIdeas({ ...base, max: 4 }).find(i => i.place.name === 'Athens')!;
        expect(ideaLink(idea)).toBe('/trips?new=1&start=2027-03-26&end=2027-03-29&to=Athens');
    });
});
