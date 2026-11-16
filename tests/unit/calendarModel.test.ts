import { describe, expect, it } from 'vitest';
import type { EntitlementType, Trip, User } from '../../types';
import {
    balancesFor, carryOverInto, countedDays, dayWeight, holidayDays, layoutWeek, leaveContext, memberLeaveDays, monthMatrix, observedDate, summarise,
    buildItems, type BalanceInput, type CalendarItem,
} from '../../utils/calendarModel';
import { leaveFromTrip, tripWithoutLeave } from '../../utils/leaveEntry';

const WORK = [1, 2, 3, 4, 5];
const ctx = leaveContext(WORK, []);
const trip = (over: Partial<Trip>): Trip => ({ id: 't', name: 'T', location: '', startDate: '2026-10-05', endDate: '2026-10-11', status: 'Upcoming', participants: ['u1'], ...over });
const annual: EntitlementType = { id: 'annual', name: 'Annual', category: 'Annual', color: 'blue', accrual: { period: 'yearly', amount: 25 }, carryOver: { enabled: false, maxDays: 0, expiryType: 'none' } };
const user = (over: Partial<User> = {}): User => ({ id: 'u1', name: 'A', role: 'Admin', leaveBalance: 25, takenLeave: 0, allowance: 25, ...over });
const policy = (year: number, amount: number, carry = false, maxDays = 5) => ({
    entitlementId: 'annual', year, isActive: true, accrual: { period: 'yearly' as const, amount }, carryOver: { enabled: carry, maxDays, expiryType: 'none' as const },
});

describe('monthMatrix', () => {
    it('starts on the chosen weekday and pads with neighbouring days', () => {
        const mon = monthMatrix(2026, 9, 1); // October 2026 starts on a Thursday
        expect(mon[0][0].iso).toBe('2026-09-28');
        expect(mon[0][3].iso).toBe('2026-10-01');
        expect(mon[0][3].inMonth).toBe(true);
        expect(mon[0][0].inMonth).toBe(false);
        const sun = monthMatrix(2026, 9, 0);
        expect(sun[0][0].iso).toBe('2026-09-27');
        expect(mon.every(w => w.length === 7)).toBe(true);
    });
});

describe('leave days', () => {
    it('skips weekends, holidays and days worked', () => {
        // Mon 5 – Sun 11 Oct: five working days.
        expect(countedDays(trip({ entitlementId: 'annual' }), ctx)).toBe(5);
        const holiday = leaveContext(WORK, [{ id: 'h', name: 'H', date: '2026-10-07', countryCode: 'XX', isIncluded: true, observed: '2026-10-07', countryName: 'X', counted: true }]);
        expect(countedDays(trip({ entitlementId: 'annual' }), holiday)).toBe(4);
        expect(countedDays(trip({ entitlementId: 'annual', excludedDates: ['2026-10-06'] }), ctx)).toBe(4);
    });

    it('counts half days', () => {
        expect(countedDays(trip({ entitlementId: 'annual', durationMode: 'all_am' }), ctx)).toBe(2.5);
        expect(countedDays(trip({ entitlementId: 'annual', durationMode: 'custom', startPortion: 'pm', endPortion: 'am', endDate: '2026-10-09' }), ctx)).toBe(4);
        expect(dayWeight(trip({ startDate: '2026-10-06', endDate: '2026-10-06', durationMode: 'single_pm' }), '2026-10-06', ctx)).toBe(0.5);
    });

    it('splits leave across New Year by date and uses allocations when present', () => {
        const per = (t: Trip, year: number) => memberLeaveDays(user(), leaveFromTrip(t), ctx, '2026-01-01').filter(d => d.iso.startsWith(String(year))).reduce((n, d) => n + d.days, 0);
        const t = trip({ entitlementId: 'annual', startDate: '2026-12-28', endDate: '2027-01-02' });
        expect(per(t, 2026)).toBe(4);
        expect(per(t, 2027)).toBe(1);
        const split = trip({ allocations: [{ entitlementId: 'annual', days: 3 }] });
        expect(per(split, 2026)).toBe(3);
        expect(per(split, 2027)).toBe(0);
    });

    it('never counts an idea, a refusal or a cancellation, and keeps a request apart as pending', () => {
        const [e] = leaveFromTrip(trip({ entitlementId: 'annual' }));
        const u = user({ policies: [policy(2026, 25)] });
        const bal = (state: typeof e.state) => balancesFor({ user: u, leave: [{ ...e, state }], entitlements: [annual], today: '2026-01-01', ctx }, 2026)[0];
        expect(bal('draft')).toMatchObject({ planned: 0, pending: 0, remaining: 25 });
        expect(bal('rejected').remaining).toBe(25);
        expect(bal('cancelled').remaining).toBe(25);
        expect(bal('requested')).toMatchObject({ planned: 0, pending: 5, remaining: 20 });
        expect(bal('approved')).toMatchObject({ planned: 5, pending: 0, remaining: 20 });
    });
});

describe('weekend holidays', () => {
    it('moves a weekend holiday to the next working day under the Monday rule', () => {
        expect(observedDate('2026-10-10', 'monday', WORK)).toBe('2026-10-12');
        expect(observedDate('2026-10-10', 'none', WORK)).toBe('2026-10-10');
        const days = holidayDays([{ id: 'c', countryCode: 'XX', countryName: 'X', year: 2026, updatedAt: '', holidays: [{ id: 'a', name: 'A', date: '2026-10-10', countryCode: 'XX', isIncluded: false }] }], 'monday', WORK);
        expect(days[0].observed).toBe('2026-10-12');
        expect(days[0].counted).toBe(false);
    });
});

describe('balances', () => {
    const input = (u: User, trips: Trip[]): BalanceInput => ({ user: u, leave: trips.flatMap(leaveFromTrip), entitlements: [annual], today: '2026-10-08', ctx });

    it('splits used and planned and leaves the remainder', () => {
        const u = user({ policies: [policy(2026, 25)] });
        const [b] = balancesFor(input(u, [trip({ entitlementId: 'annual' })]), 2026);
        expect(b.total).toBe(25);
        expect(b.used).toBe(3); // Mon–Wed before the 8th
        expect(b.planned).toBe(2);
        expect(b.remaining).toBe(20);
    });

    it('carries unused days over up to the limit', () => {
        const u = user({ policies: [policy(2025, 25, true, 5), policy(2026, 25)] });
        const used = trip({ entitlementId: 'annual', startDate: '2025-03-03', endDate: '2025-03-07' }); // 5 days
        expect(carryOverInto(input(u, [used]), 'annual', 2026)).toBe(5);
        const [b] = balancesFor(input(u, [used]), 2026);
        expect(b.total).toBe(30);
    });

    it('falls back to the yearly allowance without policies', () => {
        const u = user({ takenLeave: 2 });
        const balances = balancesFor(input(u, [trip({ entitlementId: 'annual' })]), 2026);
        const s = summarise(balances, u, 2026);
        expect(s.fallback).toBe(true);
        expect(s.left).toBe(25 - 3 - 2);
    });
});

describe('week layout', () => {
    const item = (id: string, start: string, end: string): CalendarItem => ({ key: id, kind: 'trip', id, title: id, start, end, state: 'planned', leave: false, muted: false });
    const week = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];

    it('keeps a multi-day item on one lane and counts what does not fit', () => {
        const days = layoutWeek([item('a', '2026-10-05', '2026-10-08'), item('b', '2026-10-06', '2026-10-06'), item('c', '2026-10-06', '2026-10-06'), item('d', '2026-10-06', '2026-10-06')], week, 2);
        expect(days[0].slots[0]?.item.id).toBe('a');
        expect(days[1].slots[0]?.item.id).toBe('a');
        expect(days[1].slots[1]?.item.id).toBe('b');
        expect(days[1].more).toBe(2);
        expect(days[0].slots[0]?.first).toBe(true);
        expect(days[3].slots[0]?.last).toBe(true);
    });

    it('shows trips and leave apart, filtered by member, leave and search', () => {
        const raw = [trip({ id: 'x', name: 'Rome', entitlementId: 'annual' }), trip({ id: 'y', name: 'Oslo', participants: ['u2'] })];
        const sources = { trips: raw.map(tripWithoutLeave), leave: raw.flatMap(leaveFromTrip), holidays: [], events: [] };
        const ids = (f: Partial<{ memberIds: string[]; leaveOnly: boolean; query: string }>) => buildItems(sources, { memberIds: [], leaveOnly: false, query: '', ...f }, '2026-10-01').map(i => `${i.kind}:${i.id}`);
        expect(ids({})).toEqual(['leave:leave:x:u1', 'trip:x', 'trip:y']);
        expect(ids({ memberIds: ['u2'] })).toEqual(['trip:y']);
        expect(ids({ leaveOnly: true })).toEqual(['leave:leave:x:u1']);
        expect(ids({ query: 'osl' })).toEqual(['trip:y']);
        // A trip with leave linked to it says so.
        expect(buildItems(sources, { memberIds: [], leaveOnly: false, query: '' }, '2026-10-01').find(i => i.id === 'x')?.leave).toBe(true);
    });

    it('shows an idea muted and a request as pending, and leaves out refusals', () => {
        const [e] = leaveFromTrip(trip({ id: 'z', entitlementId: 'annual' }));
        const items = buildItems({ trips: [], leave: [{ ...e, id: 'a', state: 'draft' }, { ...e, id: 'b', state: 'requested' }, { ...e, id: 'c', state: 'rejected' }], holidays: [], events: [] }, { memberIds: [], leaveOnly: false, query: '' }, '2026-10-01');
        expect(items.map(i => [i.id, i.muted, i.pending])).toEqual([['a', true, false], ['b', false, true]]);
    });
});
