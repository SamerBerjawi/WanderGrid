import { describe, expect, it } from 'vitest';
import type { EntitlementType, Trip, User } from '../../types';
import { holidayDays } from '../../utils/calendarModel';
import { dayCells, leaveFields, leaveNote, leaveStatus, planLeave, tracksLeave, type PlanInput } from '../../utils/leavePlan';

const WEEK = [1, 2, 3, 4, 5];
const TODAY = '2026-02-01';

const annual: EntitlementType = { id: 'annual', name: 'Annual leave', category: 'Annual', color: 'green', accrual: { period: 'yearly', amount: 25 }, carryOver: { enabled: false, maxDays: 0, expiryType: 'none' } };
const sick: EntitlementType = { id: 'sick', name: 'Sick leave', category: 'Sick', color: 'red', accrual: { period: 'yearly', amount: 10 }, carryOver: { enabled: false, maxDays: 0, expiryType: 'none' } };
const policy = (entitlementId: string, year: number, amount: number) => ({ entitlementId, year, isActive: true, accrual: { period: 'yearly' as const, amount }, carryOver: { enabled: false, maxDays: 0, expiryType: 'none' as const } });

const user = (over: Partial<User> = {}): User => ({
    id: 'u1', name: 'Sam', role: 'Admin', leaveBalance: 0, takenLeave: 0, allowance: 0,
    policies: [policy('annual', 2026, 25), policy('sick', 2026, 10), policy('annual', 2027, 25)], ...over,
});
const trip = (id: string, start: string, end: string, over: Partial<Trip> = {}): Trip => ({
    id, name: id, location: '', startDate: start, endDate: end, status: 'Upcoming', participants: ['u1'], ...over,
});
const goodFriday = holidayDays([{ id: 'be', countryName: 'Belgium', holidays: [{ id: 'h1', name: 'Good Friday', date: '2026-04-03', countryCode: 'BE', isIncluded: true }] } as any], 'none', WEEK);

const input = (t: Trip, over: Partial<PlanInput> = {}): PlanInput => ({
    trip: t, user: user(), trips: [t], entitlements: [annual, sick], today: TODAY, workingDays: WEEK, holidays: goodFriday, ...over,
});

describe('what a trip costs', () => {
    it('skips weekends and public holidays', () => {
        // Mon 30 Mar to Sun 5 Apr: four working days, Good Friday, and the weekend.
        const plan = planLeave(input(trip('a', '2026-03-30', '2026-04-05')));
        expect(plan.cost).toBe(4);
        expect(plan.skipped).toEqual({ weekend: 2, holiday: 1, worked: 0 });
        expect(plan.days.map(d => d.kind)).toEqual(['leave', 'leave', 'leave', 'leave', 'holiday', 'weekend', 'weekend']);
        expect(plan.days[4].label).toBe('Good Friday');
    });

    it('counts half days and days the member works anyway', () => {
        const t = trip('b', '2026-03-02', '2026-03-06', { durationMode: 'custom', startPortion: 'pm', endPortion: 'am', excludedDates: ['2026-03-04'] });
        const cells = dayCells(t, WEEK, []);
        expect(cells.map(c => c.kind)).toEqual(['half', 'leave', 'worked', 'leave', 'half']);
        expect(planLeave(input(t)).cost).toBe(3);
    });

    it('follows the member\'s working week', () => {
        const t = trip('c', '2026-03-02', '2026-03-08');
        expect(planLeave(input(t)).cost).toBe(5);
        expect(planLeave(input(t, { workingDays: [1, 2, 3, 4] })).cost).toBe(4);
    });

    it('splits a trip across New Year by the year each day falls in', () => {
        // Mon 28 Dec 2026 to Fri 8 Jan 2027: four working days in 2026 (28 to 31), then 1, 4 to 8 Jan.
        const plan = planLeave(input(trip('d', '2026-12-28', '2027-01-08')));
        expect(plan.years).toEqual([{ year: 2026, cost: 4 }, { year: 2027, cost: 6 }]);
        expect(plan.cost).toBe(10);
    });
});

describe('leave types and the balance', () => {
    it('shows what each type would have left, without this trip\'s own leave', () => {
        const t = trip('e', '2026-03-30', '2026-04-05', { entitlementId: 'annual' });
        const other = trip('o', '2026-06-01', '2026-06-05', { entitlementId: 'annual' });
        const plan = planLeave(input(t, { trips: [t, other] }));
        const opt = plan.options.find(o => o.entitlement.id === 'annual')!;
        // 25 granted, 5 planned on the other trip: 20 left before this trip, 16 after.
        expect(opt.years).toEqual([{ year: 2026, cost: 4, remaining: 20, after: 16 }]);
        expect(opt).toMatchObject({ tracked: true, covers: true, shortBy: 0 });
        expect(plan.current).toBe('annual');
    });

    it('suggests an annual-style type that covers the trip, never sick leave first', () => {
        const plan = planLeave(input(trip('f', '2026-03-30', '2026-04-05'), { entitlements: [sick, annual] }));
        expect(plan.suggested).toBe('annual');
    });

    it('reports a shortfall, and still never suggests sick leave for a holiday', () => {
        const big = trip('g', '2026-03-02', '2026-03-27');
        const used = trip('u', '2026-05-04', '2026-06-05', { entitlementId: 'annual' });
        const plan = planLeave(input(big, { trips: [big, used] }));
        const annualOpt = plan.options.find(o => o.entitlement.id === 'annual')!;
        // 25 - 25 (the other trip's 25 working days) = 0 left; the trip needs 20.
        expect(annualOpt.shortBy).toBe(20);
        expect(annualOpt.covers).toBe(false);
        expect(plan.suggested).toBe('annual');
        // With another annual-style type that does cover it, that one is suggested.
        const lieu: EntitlementType = { ...annual, id: 'lieu', name: 'Time in lieu', category: 'Lieu' };
        const withLieu = planLeave(input(big, { trips: [big, used], entitlements: [annual, lieu], user: user({ policies: [policy('annual', 2026, 25), policy('lieu', 2026, 30)] }) }));
        expect(withLieu.suggested).toBe('lieu');
    });

    it('checks each year of a trip against that year\'s policy', () => {
        const t = trip('h', '2026-12-28', '2027-01-08');
        const plan = planLeave(input(t, { user: user({ policies: [policy('annual', 2026, 2), policy('annual', 2027, 25)] }) }));
        const opt = plan.options.find(o => o.entitlement.id === 'annual')!;
        expect(opt.years.map(y => [y.year, y.remaining, y.after])).toEqual([[2026, 2, -2], [2027, 25, 19]]);
        expect(opt.shortBy).toBe(2);
    });

    it('treats a type without a policy as untracked, and an unlimited one as covering', () => {
        const t = trip('i', '2026-03-02', '2026-03-06');
        const plan = planLeave(input(t, { user: user({ policies: [policy('annual', 2026, 25)] }) }));
        expect(plan.options.find(o => o.entitlement.id === 'sick')).toMatchObject({ tracked: false, covers: true });
        const unlimited = planLeave(input(t, { user: user({ policies: [{ ...policy('annual', 2026, 0), isUnlimited: true }] }) }));
        expect(unlimited.options.find(o => o.entitlement.id === 'annual')).toMatchObject({ unlimited: true, tracked: true, covers: true });
    });

    it('reports a split trip as split with no single current type', () => {
        const t = trip('j', '2026-03-02', '2026-03-06', { entitlementId: 'annual', allocations: [{ entitlementId: 'annual', days: 3 }, { entitlementId: 'sick', days: 2 }] });
        expect(planLeave(input(t))).toMatchObject({ split: true, current: undefined });
    });
});

describe('the trip chip', () => {
    it('says nothing for past, cancelled, archived or undated trips', () => {
        expect(leaveStatus(input(trip('p', '2026-01-05', '2026-01-09'))).kind).toBe('none');
        expect(leaveStatus(input(trip('c', '2026-03-02', '2026-03-06', { status: 'Cancelled' }))).kind).toBe('none');
        expect(leaveStatus(input(trip('r', '2026-03-02', '2026-03-06', { archived: true }))).kind).toBe('none');
        expect(leaveStatus(input(trip('n', '', ''))).kind).toBe('none');
    });

    it('does not nag a member who does not track leave', () => {
        const none = user({ policies: [], allowance: 0, leaveBalance: 0 });
        expect(tracksLeave(none, [])).toBe(false);
        expect(leaveStatus(input(trip('t', '2026-03-02', '2026-03-06'), { user: none })).kind).toBe('none');
        expect(tracksLeave(user({ policies: [], allowance: 25 }), [])).toBe(true);
    });

    it('says a weekend-only trip needs no leave', () => {
        expect(leaveStatus(input(trip('w', '2026-03-07', '2026-03-08'))).kind).toBe('free');
    });

    it('says what a trip with no leave needs, and whether the suggested type covers it', () => {
        const t = trip('x', '2026-03-30', '2026-04-05');
        const state = leaveStatus(input(t));
        expect(state).toEqual({ kind: 'needed', cost: 4, typeId: 'annual', typeName: 'Annual leave', short: 0 });
        expect(leaveNote(state)).toEqual({ tone: 'needed', text: 'Needs 4 days of leave' });
        const poor = leaveStatus(input(t, { user: user({ policies: [policy('annual', 2026, 1), policy('sick', 2026, 1)] }) }));
        expect(poor).toMatchObject({ kind: 'needed', cost: 4, short: 3 });
        expect(leaveNote(poor)).toEqual({ tone: 'short', text: 'Needs 4 days, 3 over' });
    });

    it('says what a trip with leave takes, and when it runs over the balance', () => {
        const t = trip('y', '2026-03-30', '2026-04-05', { entitlementId: 'annual' });
        const ok = leaveStatus(input(t));
        expect(ok).toEqual({ kind: 'booked', cost: 4, typeName: 'Annual leave', short: 0 });
        expect(leaveNote(ok)).toEqual({ tone: 'ok', text: '4 days of Annual leave' });
        const over = leaveStatus(input(t, { user: user({ policies: [policy('annual', 2026, 1)] }) }));
        expect(over).toMatchObject({ kind: 'booked', short: 3 });
        expect(leaveNote(over)).toEqual({ tone: 'short', text: '3 days over Annual leave' });
    });

    it('counts a split trip against each of its types', () => {
        const t = trip('z', '2026-03-02', '2026-03-06', { entitlementId: 'annual', allocations: [{ entitlementId: 'annual', days: 3 }, { entitlementId: 'sick', days: 2 }] });
        expect(leaveStatus(input(t))).toEqual({ kind: 'booked', cost: 5, typeName: 'Annual leave + Sick leave', short: 0 });
    });
});

describe('applying', () => {
    it('puts the leave on one type and clears any split', () => {
        expect(leaveFields('annual')).toEqual({ entitlementId: 'annual', allocations: undefined });
        expect(leaveFields(undefined)).toEqual({ entitlementId: undefined, allocations: undefined });
    });
});
