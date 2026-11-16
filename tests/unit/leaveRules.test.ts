import { describe, expect, it } from 'vitest';
import type { EntitlementType, SavedConfig, Trip, User, UserPolicy } from '../../types';
import {
    balancesFor, carryOverExpiry, holidayDays, leaveContext, leaveOverlaps, memberLeaveDays, summarise, type BalanceInput,
} from '../../utils/calendarModel';
import { leaveFigures } from '../../utils/leaveModel';
import { leaveByType, leaveTrips } from '../../utils/dashboardModel';
import { planLeave } from '../../utils/leavePlan';
import { leaveFromTrip, tripWithoutLeave } from '../../utils/leaveEntry';

/** Fixtures are trips that carry leave (the old shape), turned into leave entries. */
const L = (...trips: Trip[]) => trips.flatMap(leaveFromTrip);

/**
 * Phase 0 of the leave work: one way of counting for every page, a day counted once, weekend holidays that never
 * share a day, days in lieu, and carry-over that expires.
 */

const WORK = [1, 2, 3, 4, 5];
const ctx = leaveContext(WORK, []);
const annual: EntitlementType = { id: 'annual', name: 'Annual', category: 'Annual', color: 'blue', accrual: { period: 'yearly', amount: 25 }, carryOver: { enabled: false, maxDays: 0, expiryType: 'none' } };
const lieuType: EntitlementType = { ...annual, id: 'lieu', name: 'Time in lieu', category: 'Lieu', color: 'teal' };
const trip = (id: string, start: string, end: string, over: Partial<Trip> = {}): Trip => ({
    id, name: id, location: '', startDate: start, endDate: end, status: 'Upcoming', participants: ['u1'], entitlementId: 'annual', ...over,
});
const policy = (year: number, amount: number, carry?: Partial<UserPolicy['carryOver']>): UserPolicy => ({
    entitlementId: 'annual', year, isActive: true, accrual: { period: 'yearly', amount },
    carryOver: { enabled: Boolean(carry), maxDays: 5, expiryType: 'none', ...carry },
});
const user = (over: Partial<User> = {}): User => ({ id: 'u1', name: 'A', role: 'Admin', leaveBalance: 25, takenLeave: 0, allowance: 25, policies: [policy(2026, 25)], ...over });
const cal = (holidays: { date: string; name: string; isIncluded?: boolean }[]): SavedConfig[] => [{
    id: 'XX-2026', countryCode: 'XX', countryName: 'X', year: 2026, updatedAt: '',
    holidays: holidays.map((h, i) => ({ id: `h${i}`, countryCode: 'XX', isIncluded: true, ...h })),
}];

describe('every page counts leave the same way', () => {
    // Mon 5 – Sun 11 Oct 2026 with a holiday on Wednesday: four leave days, not seven.
    const holidays = holidayDays(cal([{ date: '2026-10-07', name: 'Holiday' }]), 'none', WORK);
    const c = leaveContext(WORK, holidays);
    const week = trip('week', '2026-10-05', '2026-10-11');
    const u = user();
    const today = '2026-01-01';

    it('gives the calendar, member, dashboard and planner the same figure', () => {
        const [b] = balancesFor({ user: u, leave: L(week), entitlements: [annual], today, ctx: c }, 2026);
        expect(b.planned).toBe(4);
        const f = leaveFigures(u, L(week), [annual], 2026, today, c);
        expect(f.types[0].planned).toBe(4);
        expect(f.left).toBe(21);
        expect(leaveByType(L(week), [annual], u, 2026, c, today)[0].days).toBe(4);
        expect(leaveTrips(L(week), [tripWithoutLeave(week)], u, 2026, c, today)[0].days).toBe(4);
        expect(planLeave({ trip: tripWithoutLeave(week), user: u, leave: L(week), entitlements: [annual], today, workingDays: WORK, holidays }).cost).toBe(4);
    });

    it('splits a trip across New Year on every page', () => {
        const nye = trip('nye', '2026-12-28', '2027-01-02');
        expect(leaveByType(L(nye), [annual], u, 2026, ctx, today)[0].days).toBe(4);
        expect(leaveByType(L(nye), [annual], u, 2027, ctx, today)[0].days).toBe(1);
        expect(leaveFigures(u, L(nye), [annual], 2026, today, ctx).planned).toBe(4);
    });
});

describe('a day is counted once', () => {
    const today = '2026-01-01';
    const timeOff = trip('leave-1', '2026-10-05', '2026-10-09', { name: 'Time off' });
    const travel = trip('paris', '2026-10-07', '2026-10-13', { name: 'Paris' });

    it('does not count the days two entries share twice', () => {
        const days = memberLeaveDays(user(), L(travel, timeOff), ctx, today);
        // Time off Mon–Fri (5) + the trip's own Mon–Tue after it (2).
        expect(days.reduce((n, d) => n + d.days, 0)).toBe(7);
        // Time off made on the calendar owns the shared days.
        expect(days.filter(d => d.entryId === 'leave-1')).toHaveLength(5);
        const [b] = balancesFor({ user: user(), leave: L(travel, timeOff), entitlements: [annual], today, ctx }, 2026);
        expect(b.planned).toBe(7);
    });

    it('adds a morning and an afternoon up to one day', () => {
        const am = trip('am', '2026-10-05', '2026-10-05', { durationMode: 'all_am' });
        const pm = trip('pm', '2026-10-05', '2026-10-05', { durationMode: 'all_pm' });
        expect(memberLeaveDays(user(), L(am, pm), ctx, today).reduce((n, d) => n + d.days, 0)).toBe(1);
        expect(leaveOverlaps(user(), L(am, pm), ctx)).toEqual([]);
    });

    it('lists the working days that overlap', () => {
        const overlaps = leaveOverlaps(user(), L(travel, timeOff), ctx);
        expect(overlaps.map(o => o.iso)).toEqual(['2026-10-07', '2026-10-08', '2026-10-09']);
        expect(overlaps[0].entryIds).toEqual(['leave-1', 'leave:paris:u1']);
    });

    it('ignores cancelled entries and other members', () => {
        const cancelled = trip('x', '2026-10-05', '2026-10-09', { status: 'Cancelled' });
        const theirs = trip('y', '2026-10-05', '2026-10-09', { participants: ['u2'] });
        expect(leaveOverlaps(user(), L(timeOff, cancelled, theirs), ctx)).toEqual([]);
    });

    it('shows the trip planner the days time off already covers', () => {
        const plain = { ...travel, entitlementId: undefined };
        const plan = planLeave({ trip: plain, user: user(), leave: L(plain, timeOff), entitlements: [annual], today, workingDays: WORK, holidays: [] });
        expect(plan.cost).toBe(2);
        expect(plan.skipped.covered).toBe(3);
        expect(plan.days.find(d => d.iso === '2026-10-07')).toMatchObject({ kind: 'covered', label: 'Time off' });
    });
});

describe('weekend holidays', () => {
    // Christmas 2027 is a Saturday and Boxing Day a Sunday.
    const xmas = [{ date: '2027-12-25', name: 'Christmas' }, { date: '2027-12-26', name: 'Boxing Day' }];

    it('moves two weekend holidays to two different working days', () => {
        const days = holidayDays(cal(xmas), 'monday', WORK);
        expect(days.map(d => d.observed)).toEqual(['2027-12-27', '2027-12-28']);
    });

    it('skips a working day another holiday already holds', () => {
        // Sat 2 Jan 2027 moves past the Monday 4 Jan holiday.
        const days = holidayDays(cal([{ date: '2027-01-02', name: 'A' }, { date: '2027-01-04', name: 'B' }]), 'monday', WORK);
        expect(days.find(d => d.name === 'A')?.observed).toBe('2027-01-05');
    });

    it('does not let a switched-off holiday block a day', () => {
        const days = holidayDays(cal([{ date: '2027-01-02', name: 'A' }, { date: '2027-01-04', name: 'B', isIncluded: false }]), 'monday', WORK);
        expect(days.find(d => d.name === 'A')?.observed).toBe('2027-01-04');
    });

    it('keeps one copy of a holiday two calendars share', () => {
        const two = [...cal(xmas), { ...cal(xmas)[0], id: 'YY-2027', countryName: 'Y' }];
        expect(holidayDays(two, 'monday', WORK)).toHaveLength(2);
    });

    it('earns a day in lieu for each counted weekend holiday', () => {
        const days = holidayDays(cal([...xmas, { date: '2027-05-01', name: 'Labour', isIncluded: false }]), 'lieu', WORK);
        expect(days.every(d => d.observed === d.date)).toBe(true);
        const c = leaveContext(WORK, days);
        expect(c.lieuDates).toEqual(['2027-12-25', '2027-12-26']);
        const u = user({ policies: [policy(2027, 25)] });
        // A "Lieu" type takes them when there is one…
        const rows = balancesFor({ user: u, leave: [], entitlements: [annual, lieuType], today: '2027-01-01', ctx: c }, 2027);
        expect(rows.find(r => r.entitlement.id === 'lieu')).toMatchObject({ lieu: 2, total: 2, remaining: 2 });
        expect(rows.find(r => r.entitlement.id === 'annual')).toMatchObject({ lieu: 0, total: 25 });
        // …else the annual type.
        const [only] = balancesFor({ user: u, leave: [], entitlements: [annual], today: '2027-01-01', ctx: c }, 2027);
        expect(only).toMatchObject({ lieu: 2, total: 27 });
    });
});

describe('carry-over expiry', () => {
    const input = (u: User, trips: Trip[], today: string): BalanceInput => ({ user: u, leave: L(...trips), entitlements: [annual], today, ctx });

    it('reads the expiry date from the policy', () => {
        expect(carryOverExpiry({ enabled: true, maxDays: 5, expiryType: 'months', expiryValue: 3 }, 2027)).toBe('2027-03-31');
        expect(carryOverExpiry({ enabled: true, maxDays: 5, expiryType: 'months', expiryValue: 2 }, 2028)).toBe('2028-02-29');
        expect(carryOverExpiry({ enabled: true, maxDays: 5, expiryType: 'fixed_date', expiryValue: '06-30' }, 2027)).toBe('2027-06-30');
        expect(carryOverExpiry({ enabled: true, maxDays: 5, expiryType: 'fixed_date', expiryValue: '02-30' }, 2027)).toBe('2027-02-28');
        expect(carryOverExpiry({ enabled: true, maxDays: 5, expiryType: 'none' }, 2027)).toBeNull();
        expect(carryOverExpiry({ enabled: true, maxDays: 5, expiryType: 'fixed_date', expiryValue: 'soon' }, 2027)).toBeNull();
    });

    // 2026: 25 days, 20 used, so 5 carry into 2027 and must be used by 31 March 2027.
    const u = user({ policies: [policy(2026, 25, { expiryType: 'months', expiryValue: 3 }), policy(2027, 25)] });
    const used2026 = trip('a', '2026-03-02', '2026-03-27'); // 20 working days

    it('warns before the date and takes the days off after it', () => {
        const before = balancesFor(input(u, [used2026], '2027-02-01'), 2027)[0];
        expect(before).toMatchObject({ carryOver: 5, expired: 0, expiring: { days: 5, on: '2027-03-31' }, total: 30, remaining: 30 });
        const after = balancesFor(input(u, [used2026], '2027-04-01'), 2027)[0];
        expect(after).toMatchObject({ carryOver: 5, expired: 5, expiring: null, remaining: 25 });
        expect(summarise([after], u, 2027).left).toBe(25);
    });

    it('uses carried-over days first, so leave before the date saves them', () => {
        const march = trip('b', '2027-03-08', '2027-03-10'); // 3 days before expiry
        const after = balancesFor(input(u, [used2026, march], '2027-04-01'), 2027)[0];
        expect(after).toMatchObject({ expired: 2, used: 3, remaining: 25 - 0 + 5 - 2 - 3 });
    });

    it('never expires without a rule', () => {
        const keep = user({ policies: [policy(2026, 25, {}), policy(2027, 25)] });
        expect(balancesFor(input(keep, [used2026], '2027-12-01'), 2027)[0]).toMatchObject({ carryOver: 5, expired: 0, remaining: 30 });
    });

    it('carries only what was left after expiry into the year after', () => {
        const chain = user({ policies: [
            policy(2026, 25, { expiryType: 'months', expiryValue: 3 }),
            policy(2027, 25, { maxDays: 10 }),
            policy(2028, 25),
        ] });
        // 2027: 25 + 5 carried, the 5 expire unused, nothing taken: 25 left to carry, capped at 10.
        expect(balancesFor(input(chain, [used2026], '2028-01-02'), 2028)[0].carryOver).toBe(10);
    });
});

describe('which entry owns a shared day', () => {
    const today = '2026-01-01';
    const first = trip('first', '2026-10-05', '2026-10-09', { status: 'Planning' });
    const second = trip('second', '2026-10-07', '2026-10-13', { status: 'Upcoming' });
    const owned = (leave: ReturnType<typeof L>) => {
        const out: Record<string, number> = {};
        memberLeaveDays(user(), leave, ctx, today).forEach(d => { out[d.entryId] = (out[d.entryId] || 0) + d.days; });
        return out;
    };

    it('gives it to the entry that starts first, planned or approved alike', () => {
        expect(owned(L(first, second))).toEqual({ 'leave:first:u1': 5, 'leave:second:u1': 2 });
    });

    it('lets a request yield to booked leave', () => {
        const leave = L(first, second).map(e => (e.id === 'leave:first:u1' ? { ...e, state: 'requested' as const } : e));
        expect(owned(leave)).toEqual({ 'leave:first:u1': 2, 'leave:second:u1': 5 });
    });
});
