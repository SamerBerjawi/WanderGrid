import type { EntitlementType, Trip, User } from '../types';
import { tripDays } from './tripsModel';

/**
 * Leave figures for one member and year, from the member's trips, their per-year policies and the
 * calendar's own figures (`allowance` and `takenLeave` on the user). Mirrors the Vacation Calendar:
 * a trip counts as leave when it has a leave type, its days are the trip's inclusive length, and it is
 * attributed to the year it starts in. A trip with `allocations` splits its days across types and years.
 */

export interface LeaveTypeFigures {
    entitlement: EntitlementType;
    /** Days a past trip has already used. */
    used: number;
    /** Days of trips under way or still to come. */
    planned: number;
    /** Days the member's policy grants for the year; null when no policy sets it. */
    allowance: number | null;
    unlimited: boolean;
}

export interface LeaveFigures {
    year: number;
    types: LeaveTypeFigures[];
    /** The calendar's yearly allowance for the member. */
    allowance: number;
    /** Days recorded as taken (set by an admin). */
    taken: number;
    /** Leave days on trips under way or still to come this year. */
    planned: number;
    /** Leave days on trips already over this year. */
    onTrips: number;
    /** Allowance minus taken minus planned; never below zero. */
    left: number;
}

const yearOf = (iso?: string): number => {
    const y = Number((iso || '').slice(0, 4));
    return Number.isFinite(y) && y > 0 ? y : NaN;
};

/** The days a trip puts on each leave type in a year: [entitlementId, days][]. */
export const tripLeaveDays = (trip: Trip, year: number): Array<[string, number]> => {
    const split = (trip.allocations || []).filter(a => a.entitlementId && Number(a.days) > 0);
    if (split.length > 0) {
        const startYear = yearOf(trip.startDate);
        return split
            .filter(a => (a.targetYear ?? startYear) === year)
            .map(a => [a.entitlementId, Number(a.days)] as [string, number]);
    }
    if (!trip.entitlementId || yearOf(trip.startDate) !== year) return [];
    const days = tripDays(trip);
    return days > 0 ? [[trip.entitlementId, days]] : [];
};

/** Yearly days a policy grants: monthly accrual runs twelve times, yearly and lump sums once. */
const policyAllowance = (user: User, entitlementId: string, year: number): { days: number | null; unlimited: boolean } => {
    const policy = (user.policies || []).find(p => p.entitlementId === entitlementId && p.year === year && p.isActive);
    if (!policy) return { days: null, unlimited: false };
    if (policy.isUnlimited) return { days: null, unlimited: true };
    const amount = Number(policy.accrual?.amount) || 0;
    return { days: policy.accrual?.period === 'monthly' ? amount * 12 : amount, unlimited: false };
};

export const leaveFigures = (user: User, trips: Trip[], entitlements: EntitlementType[], year: number, today: string): LeaveFigures => {
    const mine = trips.filter(t => t.status !== 'Cancelled' && (t.participants || []).includes(user.id));
    const byType = new Map<string, { used: number; planned: number }>();
    for (const trip of mine) {
        const over = (trip.endDate || trip.startDate || '') < today;
        for (const [id, days] of tripLeaveDays(trip, year)) {
            const slot = byType.get(id) || { used: 0, planned: 0 };
            if (over) slot.used += days; else slot.planned += days;
            byType.set(id, slot);
        }
    }
    const types: LeaveTypeFigures[] = entitlements
        .map(entitlement => {
            const slot = byType.get(entitlement.id) || { used: 0, planned: 0 };
            const grant = policyAllowance(user, entitlement.id, year);
            return { entitlement, used: slot.used, planned: slot.planned, allowance: grant.days, unlimited: grant.unlimited || Boolean(entitlement.isUnlimited && grant.days === null && slot.used + slot.planned > 0) };
        })
        // A type is listed when the member has a policy for it or has trips on it.
        .filter(t => t.allowance !== null || t.unlimited || t.used + t.planned > 0);

    const allowance = Number(user.allowance ?? user.leaveBalance) || 0;
    const taken = Number(user.takenLeave) || 0;
    let planned = 0;
    let onTrips = 0;
    byType.forEach(v => { planned += v.planned; onTrips += v.used; });
    return { year, types, allowance, taken, planned, onTrips, left: Math.max(0, allowance - taken - planned) };
};

/** Years worth showing: the member's tracked years, the years of their leave trips and this year. */
export const leaveYears = (user: User, trips: Trip[], thisYear: number): number[] => {
    const years = new Set<number>([thisYear, ...(user.activeYears || [])]);
    trips.forEach(t => {
        if (!(t.participants || []).includes(user.id) || !(t.entitlementId || t.allocations?.length)) return;
        const y = yearOf(t.startDate);
        if (!Number.isNaN(y)) years.add(y);
    });
    return [...years].sort((a, b) => a - b);
};
