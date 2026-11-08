import type { EntitlementType, Trip, User } from '../types';
import {
    balancesFor, dayWeight, hasLeave, isWeekend, leaveContext, leaveUse, tripDates, yearOfISO, type HolidayDay,
} from './calendarModel';

/**
 * Leave meets trips: what a trip costs in leave, and whether the leave is there. It sits on the calendar's own
 * counting (utils/calendarModel.ts): weekends, public holidays and days the member works anyway cost nothing,
 * half days cost half, and a trip across New Year splits itself between the years. This file adds the planning
 * on top: a day-by-day picture, each leave type with what it would have left, a suggested type, and a status
 * for the trip's chip. Pure, so it is unit-tested without a screen.
 */

export interface PlanInput {
    trip: Trip;
    /** The member the leave is for. */
    user: User;
    /** Every trip (the member's balance counts the others' leave). */
    trips: Trip[];
    entitlements: EntitlementType[];
    today: string;
    workingDays: number[];
    /** The member's holidays (utils/calendarModel `holidayDays`). */
    holidays: HolidayDay[];
}

export type DayKind = 'leave' | 'half' | 'weekend' | 'holiday' | 'worked';
export interface DayCell { iso: string; kind: DayKind; weight: number; /** The holiday's name. */ label?: string }

export interface OptionYear { year: number; cost: number; /** Days the type has left that year without this trip; null when it has no policy or no limit. */ remaining: number | null; after: number | null }
export interface TypeOption {
    entitlement: EntitlementType;
    years: OptionYear[];
    unlimited: boolean;
    /** False when the member has no policy for the type, so there is no balance to check against. */
    tracked: boolean;
    /** Enough days left in every year of the trip (always true when unlimited or untracked). */
    covers: boolean;
    /** The most days it falls short by in any one year. */
    shortBy: number;
}

export interface LeavePlan {
    /** Leave days the trip costs. */
    cost: number;
    days: DayCell[];
    skipped: { weekend: number; holiday: number; worked: number };
    /** Cost by calendar year, for a trip that crosses New Year. */
    years: { year: number; cost: number }[];
    options: TypeOption[];
    /** The type to take it from: the first annual-style type that covers the trip. */
    suggested?: string;
    /** The type the trip already takes its leave from (one type; a split is reported as `split`). */
    current?: string;
    split: boolean;
}

const tripYears = (trip: Trip): number[] => {
    const a = yearOfISO(trip.startDate), b = yearOfISO(trip.endDate || trip.startDate);
    if (!a || !b || b < a) return a ? [a] : [];
    return Array.from({ length: Math.min(b - a, 5) + 1 }, (_, i) => a + i);
};

/** The trip as if it took no leave: what the member's balance looks like without it. */
const withoutLeave = (trips: Trip[], trip: Trip): Trip[] =>
    trips.map(t => (t.id === trip.id ? { ...t, entitlementId: undefined, allocations: undefined } : t));

/** Types worth suggesting for a holiday: not sick or unpaid leave. */
const suggestable = (e: EntitlementType) => e.category !== 'Sick' && e.category !== 'Unpaid';

/** The day-by-day picture of a trip against a member's working week and holidays. */
export const dayCells = (trip: Trip, workingDays: number[], holidays: HolidayDay[]): DayCell[] => {
    const ctx = leaveContext(workingDays, holidays);
    const names = new Map(holidays.filter(h => h.counted).map(h => [h.observed, h.name]));
    const excluded = new Set(trip.excludedDates || []);
    return tripDates(trip).map(iso => {
        const weight = dayWeight(trip, iso, ctx);
        if (excluded.has(iso)) return { iso, kind: 'worked' as const, weight };
        if (isWeekend(iso, workingDays)) return { iso, kind: 'weekend' as const, weight };
        if (ctx.offDays.has(iso)) return { iso, kind: 'holiday' as const, weight, label: names.get(iso) };
        return { iso, kind: weight > 0 && weight < 1 ? ('half' as const) : ('leave' as const), weight };
    });
};

export const planLeave = ({ trip, user, trips, entitlements, today, workingDays, holidays }: PlanInput): LeavePlan => {
    const ctx = leaveContext(workingDays, holidays);
    const days = dayCells(trip, workingDays, holidays);
    const skipped = { weekend: 0, holiday: 0, worked: 0 };
    days.forEach(d => { if (d.kind === 'weekend' || d.kind === 'holiday' || d.kind === 'worked') skipped[d.kind] += 1; });
    const cost = days.reduce((n, d) => n + d.weight, 0);
    const byYear = new Map<number, number>();
    days.forEach(d => byYear.set(yearOfISO(d.iso), (byYear.get(yearOfISO(d.iso)) || 0) + d.weight));
    const years = [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, c]) => ({ year, cost: c })).filter(y => y.cost > 0);

    const base = withoutLeave(trips, trip);
    const balances = new Map(years.map(y => [y.year, balancesFor({ user, trips: base, entitlements, today, ctx }, y.year)]));
    const options: TypeOption[] = entitlements.map(entitlement => {
        const rows: OptionYear[] = years.map(y => {
            const b = balances.get(y.year)?.find(x => x.entitlement.id === entitlement.id);
            const remaining = b && b.remaining !== null && !b.unlimited ? b.remaining : null;
            return { year: y.year, cost: y.cost, remaining, after: remaining === null ? null : remaining - y.cost };
        });
        const unlimited = Boolean(balances.get(years[0]?.year ?? 0)?.find(x => x.entitlement.id === entitlement.id)?.unlimited);
        const tracked = unlimited || rows.some(r => r.remaining !== null);
        const shortBy = Math.max(0, ...rows.map(r => (r.after !== null && r.after < 0 ? -r.after : 0)));
        return { entitlement, years: rows, unlimited, tracked, covers: shortBy === 0, shortBy };
    });

    const preferred = options.filter(o => suggestable(o.entitlement));
    const pool = preferred.length ? preferred : options;
    const suggested = (pool.find(o => o.tracked && o.covers) ?? pool.slice().sort((a, b) => a.shortBy - b.shortBy)[0])?.entitlement.id;

    const split = (trip.allocations || []).some(a => a.entitlementId && Number(a.days) > 0);
    return { cost, days, skipped, years, options, suggested, current: split ? undefined : trip.entitlementId, split };
};

export type LeaveState =
    /** Nothing to say: a past or cancelled trip, no dates, or a member who does not track leave. */
    | { kind: 'none' }
    /** Every day is a weekend or a holiday: no leave is needed. */
    | { kind: 'free' }
    /** No leave is booked and the trip needs some. */
    | { kind: 'needed'; cost: number; typeId?: string; typeName?: string; short: number }
    /** Leave is booked; `short` is how many days it runs over the type's balance. */
    | { kind: 'booked'; cost: number; typeName: string; short: number };

/** Whether the member tracks leave at all: a policy, a yearly allowance, or leave already on a trip. */
export const tracksLeave = (user: User, trips: Trip[]): boolean =>
    (user.policies || []).some(p => p.isActive) || Number(user.allowance ?? user.leaveBalance) > 0 || trips.some(t => hasLeave(t) && (t.participants || []).includes(user.id));

/** The state behind a trip's chip for one member. */
export const leaveStatus = (input: PlanInput): LeaveState => {
    const { trip, user, trips, entitlements, today, workingDays, holidays } = input;
    if (!trip.startDate || trip.status === 'Cancelled' || trip.archived) return { kind: 'none' };
    if ((trip.endDate || trip.startDate) < today) return { kind: 'none' };
    if (!hasLeave(trip) && !tracksLeave(user, trips)) return { kind: 'none' };

    const plan = planLeave(input);
    if (!hasLeave(trip)) {
        if (plan.cost <= 0) return { kind: 'free' };
        const pick = plan.options.find(o => o.entitlement.id === plan.suggested);
        return { kind: 'needed', cost: plan.cost, typeId: pick?.entitlement.id, typeName: pick?.entitlement.name, short: pick && !pick.covers ? pick.shortBy : 0 };
    }

    // Booked: how far over is each type the trip draws on, in each year?
    const ctx = leaveContext(workingDays, holidays);
    let cost = 0;
    let short = 0;
    const names = new Set<string>();
    for (const year of tripYears(trip)) {
        const uses = leaveUse(trip, year, today, ctx);
        const balances = balancesFor({ user, trips, entitlements, today, ctx }, year);
        for (const u of uses) {
            const days = u.used + u.planned;
            cost += days;
            names.add(entitlements.find(e => e.id === u.entitlementId)?.name || 'Leave');
            const b = balances.find(x => x.entitlement.id === u.entitlementId);
            if (b && !b.unlimited && b.remaining !== null && b.remaining < 0) short += Math.min(days, -b.remaining);
        }
    }
    return { kind: 'booked', cost, typeName: [...names].join(' + ') || 'Leave', short };
};

/** The fields that put a trip's leave on one type (replacing any split). */
export const leaveFields = (entitlementId: string | undefined): Pick<Trip, 'entitlementId' | 'allocations'> => ({ entitlementId, allocations: undefined });

const dayWord = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/** The chip's wording and tone for a status. */
export const leaveNote = (state: LeaveState): { tone: 'ok' | 'needed' | 'short'; text: string } | null => {
    switch (state.kind) {
        case 'needed':
            return state.short > 0
                ? { tone: 'short', text: `Needs ${dayWord(state.cost)}, ${state.short} over` }
                : { tone: 'needed', text: `Needs ${dayWord(state.cost)} of leave` };
        case 'booked':
            return state.short > 0
                ? { tone: 'short', text: `${dayWord(state.short)} over ${state.typeName}` }
                : { tone: 'ok', text: `${dayWord(state.cost)} of ${state.typeName}` };
        default:
            return null;
    }
};

/** The leave type offered when a workspace has none yet: Annual leave, a yearly allowance, no carry-over. */
export const defaultAnnualType = (user?: Pick<User, 'allowance'>): EntitlementType => ({
    id: `annual-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Annual leave',
    category: 'Annual',
    color: 'green',
    accrual: { period: 'yearly', amount: user?.allowance && user.allowance > 0 ? user.allowance : 25 },
    carryOver: { enabled: false, maxDays: 0, expiryType: 'none' },
});
