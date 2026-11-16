import { describe, expect, it } from 'vitest';
import type { EntitlementType, LeaveEntry, User, UserPolicy } from '../../types';
import { holidayDays, leaveContext } from '../../utils/calendarModel';
import { leaveByMonth, leaveReminders, timeOffBought, timeOffSentence, yearHistory } from '../../utils/leaveInsights';

const WORK = [1, 2, 3, 4, 5];
const ctx = leaveContext(WORK, []);
const annual: EntitlementType = { id: 'annual', name: 'Annual leave', category: 'Annual', color: 'green', accrual: { period: 'yearly', amount: 25 }, carryOver: { enabled: false, maxDays: 0, expiryType: 'none' } };
const policy = (year: number, carry?: Partial<UserPolicy['carryOver']>): UserPolicy => ({ entitlementId: 'annual', year, isActive: true, accrual: { period: 'yearly', amount: 25 }, carryOver: { enabled: Boolean(carry), maxDays: 5, expiryType: 'none', ...carry } });
const user = (over: Partial<User> = {}): User => ({ id: 'u', name: 'U', role: 'Admin', leaveBalance: 0, takenLeave: 0, allowance: 0, policies: [policy(2026)], ...over });
const entry = (id: string, start: string, end: string, over: Partial<LeaveEntry> = {}): LeaveEntry => ({ id, memberId: 'u', startDate: start, endDate: end, state: 'approved', entitlementId: 'annual', ...over });

describe('what leave bought', () => {
    it('widens leave to the weekends and holidays next to it', () => {
        // Fri 9 Oct (1 day) and Mon 19 – Fri 23 Oct (5 days): 3 + 9 days away.
        const leave = [entry('a', '2026-10-09', '2026-10-09'), entry('b', '2026-10-19', '2026-10-23')];
        const t = timeOffBought(user(), leave, ctx, '2026-01-01', 2026);
        expect(t).toEqual({ leaveDays: 6, daysOff: 12, longest: 9 });
        expect(timeOffSentence(t)).toBe("You've enjoyed 12 days off using only 6 leave days.");
        expect(timeOffSentence(t, true)).toBe('12 days off for only 6 leave days.');
    });

    it('joins a holiday next to leave, and leaves out days worked', () => {
        const hol = leaveContext(WORK, holidayDays([{ id: 'x', countryCode: 'XX', countryName: 'X', year: 2026, updatedAt: '', holidays: [{ id: 'h', name: 'H', date: '2026-10-12', countryCode: 'XX', isIncluded: true }] }], 'none', WORK));
        expect(timeOffBought(user(), [entry('a', '2026-10-09', '2026-10-09')], hol, '2026-01-01', 2026).daysOff).toBe(4);
        expect(timeOffBought(user(), [entry('a', '2026-10-05', '2026-10-09', { excludedDates: ['2026-10-07'] })], ctx, '2026-01-01', 2026)).toMatchObject({ leaveDays: 4, daysOff: 8, longest: 4 });
        expect(timeOffSentence({ leaveDays: 0, daysOff: 0, longest: 0 })).toBeNull();
    });
});

describe('the years and the months', () => {
    it('lists each year with its forecast flag', () => {
        const u = user({ policies: [policy(2025, {}), policy(2026)] });
        const rows = yearHistory(u, [entry('a', '2025-03-03', '2025-03-07')], [annual], ctx, '2026-02-01', [2025, 2026]);
        expect(rows).toEqual([
            { year: 2025, total: 25, used: 5, planned: 0, pending: 0, left: 20, carriedIn: 0, expired: 0, forecast: false },
            { year: 2026, total: 30, used: 0, planned: 0, pending: 0, left: 30, carriedIn: 5, expired: 0, forecast: true },
        ]);
    });

    it('puts leave days in their months', () => {
        const months = leaveByMonth(user(), [entry('a', '2026-03-30', '2026-04-03')], ctx, '2026-01-01', 2026);
        expect(months[2]).toBe(2);
        expect(months[3]).toBe(3);
        expect(months.reduce((n, x) => n + x, 0)).toBe(5);
    });
});

describe('reminders', () => {
    const today = '2026-10-15';

    it('reminds of leave coming up, requests waiting and trips to check', () => {
        const leave = [entry('soon', '2026-10-20', '2026-10-23', { name: 'Ski' }), entry('req', '2026-11-02', '2026-11-04', { state: 'requested', name: 'Rome' }), entry('far', '2026-12-21', '2026-12-24')];
        const r = leaveReminders(user(), leave, [annual], ctx, today, { tripIssues: 2 });
        expect(r.find(x => x.kind === 'upcoming')?.text).toBe('Ski starts in 5 days.');
        expect(r.find(x => x.kind === 'requests')?.text).toBe('Rome is still waiting for an answer, 18 days before it starts.');
        expect(r.find(x => x.kind === 'trips')?.text).toBe('2 trips need a look at their leave.');
        expect(r.some(x => x.entryId === 'far' && x.kind === 'upcoming')).toBe(false);
    });

    it('warns late in the year about leave that would be lost, and about expiring carry-over', () => {
        const left = leaveReminders(user(), [], [annual], ctx, today);
        expect(left.find(x => x.kind === 'unused')).toMatchObject({ tone: 'rust', text: '25 days of Annual leave left this year; 25 days would be lost.' });
        const carrying = user({ policies: [policy(2026, { maxDays: 5 })] });
        expect(leaveReminders(carrying, [], [annual], ctx, today).find(x => x.kind === 'unused')?.text).toBe('25 days of Annual leave left this year; 5 days carry over, 20 days would be lost.');
        expect(leaveReminders(user(), [], [annual], ctx, '2026-06-01').some(x => x.kind === 'unused')).toBe(false);
        const expiring = user({ policies: [policy(2025, { expiryType: 'months', expiryValue: 3 }), policy(2026)] });
        const e = leaveReminders(expiring, [], [annual], ctx, '2026-02-15');
        expect(e[0]).toMatchObject({ kind: 'expiring', tone: 'rust' });
    });

    it('stays quiet about what the member turned off', () => {
        const quiet = user({ leaveReminders: { unused: false, upcoming: false } });
        const r = leaveReminders(quiet, [entry('soon', '2026-10-20', '2026-10-23')], [annual], ctx, today);
        expect(r.map(x => x.kind)).toEqual([]);
    });
});
