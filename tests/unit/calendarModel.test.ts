import { describe, expect, it } from 'vitest';
import type { EntitlementType, Trip, User } from '../../types';
import {
    balancesFor, carryOverInto, countedDays, dayWeight, holidayDays, layoutWeek, leaveContext, leaveUse, monthMatrix, observedDate, summarise,
    buildItems, type BalanceInput, type CalendarItem,
} from '../../utils/calendarModel';

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

    it('splits a trip across New Year by date and uses allocations when present', () => {
        const t = trip({ entitlementId: 'annual', startDate: '2026-12-28', endDate: '2027-01-02' });
        expect(leaveUse(t, 2026, '2026-01-01', ctx)[0].planned).toBe(4);
        expect(leaveUse(t, 2027, '2026-01-01', ctx)[0].planned).toBe(1);
        const split = trip({ allocations: [{ entitlementId: 'annual', days: 3 }] });
        expect(leaveUse(split, 2026, '2026-01-01', ctx)).toEqual([{ entitlementId: 'annual', used: 0, planned: 3 }]);
        expect(leaveUse(split, 2027, '2026-01-01', ctx)).toEqual([]);
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
    const input = (u: User, trips: Trip[]): BalanceInput => ({ user: u, trips, entitlements: [annual], today: '2026-10-08', ctx });

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

    it('filters items by member, leave and search', () => {
        const trips = [trip({ id: 'x', name: 'Rome', entitlementId: 'annual' }), trip({ id: 'y', name: 'Oslo', participants: ['u2'] })];
        expect(buildItems(trips, [], [], { memberIds: ['u2'], leaveOnly: false, query: '' }, '2026-10-01').map(i => i.id)).toEqual(['y']);
        expect(buildItems(trips, [], [], { memberIds: [], leaveOnly: true, query: '' }, '2026-10-01').map(i => i.id)).toEqual(['x']);
        expect(buildItems(trips, [], [], { memberIds: [], leaveOnly: false, query: 'osl' }, '2026-10-01').map(i => i.id)).toEqual(['y']);
    });
});
