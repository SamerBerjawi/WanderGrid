import type { EntitlementType, Trip, User } from '../types';
import { balancesFor, hasLeave, summarise, yearOfISO, type LeaveContext, type TypeBalance } from './calendarModel';

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
    /** Leave days on trips and time off already taken. */
    onTrips: number;
    /** Allowance minus taken minus planned; never below zero. */
    left: number;
}

export const leaveFigures = (user: User, trips: Trip[], entitlements: EntitlementType[], year: number, today: string, ctx: LeaveContext): LeaveFigures => {
    const balances = balancesFor({ user, trips, entitlements, today, ctx }, year);
    const summary = summarise(balances, user, year);
    const types = balances.map(b => ({ entitlement: b.entitlement, used: b.used, planned: b.planned, allowance: b.total, unlimited: b.unlimited, balance: b }));
    const onTrips = balances.reduce((n, b) => n + b.used, 0);
    return { year, types, allowance: summary.total, taken: summary.used, planned: summary.planned, onTrips, left: summary.left };
};

/** Years worth showing: the member's tracked years, the years of their leave trips and this year. */
export const leaveYears = (user: User, trips: Trip[], thisYear: number): number[] => {
    const years = new Set<number>([thisYear, ...(user.activeYears || [])]);
    trips.forEach(t => {
        if (!(t.participants || []).includes(user.id) || !hasLeave(t)) return;
        [yearOfISO(t.startDate), yearOfISO(t.endDate || t.startDate)].forEach(y => { if (y > 1900) years.add(y); });
    });
    return [...years].sort((a, b) => a - b);
};
