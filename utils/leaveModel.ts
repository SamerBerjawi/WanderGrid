import type { EntitlementType, LeaveEntry, User } from '../types';
import { balancesFor, summarise, yearOfISO, type LeaveContext, type TypeBalance } from './calendarModel';

/**
 * Leave figures for one member and year, for the Member page and Year in review. A thin view over the calendar's
 * own counting (`utils/calendarModel.ts`: weekends, public holidays, half days and days worked cost nothing, a trip
 * across New Year splits itself, overlapping entries count a day once, carry-over and its expiry), so every page
 * shows the same numbers as the Calendar.
 */

export interface LeaveTypeFigures {
    entitlement: EntitlementType;
    /** Days already taken. */
    used: number;
    /** Days booked from today on. */
    planned: number;
    /** What the type offers in the year (allowance, carry-over, days in lieu); null when nothing sets it. */
    allowance: number | null;
    unlimited: boolean;
    balance: TypeBalance;
}

export interface LeaveFigures {
    year: number;
    types: LeaveTypeFigures[];
    /** What the year offers in all: the types' totals, else the member's yearly allowance. */
    allowance: number;
    /** Days taken (with no leave types, the days an admin recorded as taken when that is more). */
    taken: number;
    /** Leave days booked from today on. */
    planned: number;
    /** Leave days requested and not answered yet. */
    pending: number;
    /** Leave days on trips and time off already taken. */
    onTrips: number;
    /** Allowance minus taken minus planned; never below zero. */
    left: number;
}

export const leaveFigures = (user: User, leave: LeaveEntry[], entitlements: EntitlementType[], year: number, today: string, ctx: LeaveContext): LeaveFigures => {
    const balances = balancesFor({ user, leave, entitlements, today, ctx }, year);
    const summary = summarise(balances, user, year);
    const types = balances.map(b => ({ entitlement: b.entitlement, used: b.used, planned: b.planned, allowance: b.total, unlimited: b.unlimited, balance: b }));
    const onTrips = balances.reduce((n, b) => n + b.used, 0);
    return { year, types, allowance: summary.total, taken: summary.used, planned: summary.planned, pending: summary.pending, onTrips, left: summary.left };
};

/** Years worth showing: the member's tracked years, the years of their leave and this year. */
export const leaveYears = (user: User, leave: LeaveEntry[], thisYear: number): number[] => {
    const years = new Set<number>([thisYear, ...(user.activeYears || [])]);
    leave.forEach(e => {
        if (e.memberId !== user.id) return;
        [yearOfISO(e.startDate), yearOfISO(e.endDate || e.startDate)].forEach(y => { if (y > 1900) years.add(y); });
    });
    return [...years].sort((a, b) => a - b);
};
