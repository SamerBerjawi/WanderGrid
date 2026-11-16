import type { CustomEvent, EntitlementType, LeaveEntry, LeaveSpan, Trip, User } from '../types';
import {
    balancesFor, dayWeight, isRestDay, leaveContext, memberLeaveDays, tripDates, yearOfISO, type HolidayDay,
} from './calendarModel';
import { countsAsLeave, defaultState, hasLeaveType, newLeaveId } from './leaveEntry';

/**
 * Leave meets trips: what a trip costs in leave, and whether the leave is there. Since leave Phase 1 a trip's leave
 * is the member's leave entries linked to it (`tripId`); their dates may differ from the trip's. This sits on the
 * calendar's own counting (utils/calendarModel.ts): weekends, public holidays and days the member works anyway cost
 * nothing, half days cost half, a trip across New Year splits itself, and days other leave already covers are not
 * paid twice. Pure, so it is unit-tested without a screen.
 */

export interface PlanInput {
    trip: Trip;
    /** The member the leave is for. */
    user: User;
    /** Every leave entry (the member's balance counts their other leave). */
    leave: LeaveEntry[];
    entitlements: EntitlementType[];
    today: string;
    workingDays: number[];
    /** The member's holidays (utils/calendarModel `holidayDays`). */
    holidays: HolidayDay[];
    /** The workspace's events (company days off, working weekend days). */
    events?: Pick<CustomEvent, 'date' | 'isWorkingDay'>[];
}

/** `covered`: another leave entry of the member already takes the day. */
export type DayKind = 'leave' | 'half' | 'weekend' | 'holiday' | 'worked' | 'covered';
export interface DayCell { iso: string; kind: DayKind; weight: number; /** The holiday's or the other leave's name. */ label?: string }

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
    /** Leave days the trip costs (its linked leave, else the whole trip as full days). */
    cost: number;
    days: DayCell[];
    skipped: { weekend: number; holiday: number; worked: number; covered: number };
    /** Cost by calendar year, for a trip that crosses New Year. */
    years: { year: number; cost: number }[];
    options: TypeOption[];
    /** The type to take it from: the first annual-style type that covers the trip. */
    suggested?: string;
    /** The type the linked leave takes its days from (one type; a split is reported as `split`). */
    current?: string;
    split: boolean;
    /** The member's leave entries linked to the trip. */
    linked: LeaveEntry[];
    /** The linked leave's dates differ from the trip's. */
    datesDiffer: boolean;
}

const spanYears = (span: Pick<LeaveSpan, 'startDate' | 'endDate'>): number[] => {
    const a = yearOfISO(span.startDate), b = yearOfISO(span.endDate || span.startDate);
    if (!a || !b || b < a) return a ? [a] : [];
    return Array.from({ length: Math.min(b - a, 5) + 1 }, (_, i) => a + i);
};

/** The member's leave entries for a trip that count. */
export const linkedLeave = (trip: Pick<Trip, 'id'>, user: Pick<User, 'id'>, leave: LeaveEntry[]): LeaveEntry[] =>
    leave.filter(e => e.tripId === trip.id && e.memberId === user.id && countsAsLeave(e));

/** Types worth suggesting for a holiday: not sick or unpaid leave. */
const suggestable = (e: EntitlementType) => e.category !== 'Sick' && e.category !== 'Unpaid';

/** Leave the member already has on each date from other entries: the weight taken and the entry's name. */
export type Covered = Map<string, { weight: number; label: string }>;

/** What the member's other leave entries already take, day by day (`skip` left out). */
export const coveredDays = (skip: ReadonlySet<string>, user: Pick<User, 'id'>, leave: LeaveEntry[], ctx: ReturnType<typeof leaveContext>, today: string): Covered => {
    const others = leave.filter(e => !skip.has(e.id));
    const byId = new Map(others.map(e => [e.id, e]));
    const out: Covered = new Map();
    // Every counting entry claims its days, with or without a type: give typeless ones a stand-in so they are seen.
    const stand = others.map(e => (hasLeaveType(e) ? e : { ...e, entitlementId: '__time_off__' }));
    memberLeaveDays(user, stand, ctx, today).forEach(d => {
        const e = byId.get(d.entryId);
        // A split's days are not dated, so only dated days are known to overlap.
        if (!e || e.allocations?.length) return;
        const slot = out.get(d.iso) || { weight: 0, label: e.name || 'Time off' };
        slot.weight += d.days;
        out.set(d.iso, slot);
    });
    return out;
};

/** The day-by-day picture of a span against a member's working week, holidays and other leave. */
export const dayCells = (span: LeaveSpan, workingDays: number[], holidays: HolidayDay[], covered?: Covered, events: PlanInput['events'] = []): DayCell[] => {
    const ctx = leaveContext(workingDays, holidays, events);
    const names = new Map(holidays.filter(h => h.counted).map(h => [h.observed, h.name]));
    const excluded = new Set(span.excludedDates || []);
    return tripDates(span).map(iso => {
        const full = dayWeight(span, iso, ctx);
        if (excluded.has(iso)) return { iso, kind: 'worked' as const, weight: full };
        if (isRestDay(iso, ctx)) return { iso, kind: 'weekend' as const, weight: full };
        if (ctx.offDays.has(iso)) return { iso, kind: 'holiday' as const, weight: full, label: names.get(iso) ?? 'Company day off' };
        const other = covered?.get(iso);
        const weight = Math.max(0, Math.min(full, 1 - (other?.weight ?? 0)));
        if (other && weight <= 0) return { iso, kind: 'covered' as const, weight: 0, label: other.label };
        return { iso, kind: weight > 0 && weight < 1 ? ('half' as const) : ('leave' as const), weight };
    });
};

export const planLeave = ({ trip, user, leave, entitlements, today, workingDays, holidays, events = [] }: PlanInput): LeavePlan => {
    const ctx = leaveContext(workingDays, holidays, events);
    const linked = linkedLeave(trip, user, leave);
    const skip = new Set(linked.map(e => e.id));
    const covered = coveredDays(skip, user, leave, ctx, today);
    // With linked leave the plan shows its days (they may differ from the trip's); without, the trip's as full days.
    const spans: LeaveSpan[] = linked.length ? linked : [{ startDate: trip.startDate, endDate: trip.endDate || trip.startDate }];
    const seen = new Set<string>();
    const days = spans.flatMap(s => dayCells(s, workingDays, holidays, covered, events)).filter(d => (seen.has(d.iso) ? false : (seen.add(d.iso), true)))
        .sort((a, b) => a.iso.localeCompare(b.iso));
    const skipped = { weekend: 0, holiday: 0, worked: 0, covered: 0 };
    days.forEach(d => { if (d.kind === 'weekend' || d.kind === 'holiday' || d.kind === 'worked' || d.kind === 'covered') skipped[d.kind] += 1; });
    const cost = days.reduce((n, d) => n + d.weight, 0);
    const byYear = new Map<number, number>();
    days.forEach(d => byYear.set(yearOfISO(d.iso), (byYear.get(yearOfISO(d.iso)) || 0) + d.weight));
    const years = [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, c]) => ({ year, cost: c })).filter(y => y.cost > 0);

    const base = leave.filter(e => !skip.has(e.id));
    const balances = new Map(years.map(y => [y.year, balancesFor({ user, leave: base, entitlements, today, ctx }, y.year)]));
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

    const first = linked[0];
    const split = linked.some(e => (e.allocations || []).some(a => a.entitlementId && Number(a.days) > 0));
    const datesDiffer = linked.length > 0 && (linked.length > 1 || first.startDate !== trip.startDate || (first.endDate || first.startDate) !== (trip.endDate || trip.startDate));
    return { cost, days, skipped, years, options, suggested, current: split ? undefined : first?.entitlementId, split, linked, datesDiffer };
};

export type TripLeaveStatus =
    /** Nothing to say: a past or cancelled trip, no dates, or a member who does not track leave. */
    | { kind: 'none' }
    /** Every day is a weekend, a holiday or already on other leave: no leave is needed. */
    | { kind: 'free' }
    /** No leave is booked and the trip needs some. */
    | { kind: 'needed'; cost: number; typeId?: string; typeName?: string; short: number }
    /** Leave is booked; `short` is how many days it runs over the type's balance. */
    | { kind: 'booked'; cost: number; typeName: string; short: number; pending: boolean };

/** Whether the member tracks leave at all: an allowance for some type, or leave already booked. */
export const tracksLeave = (user: User, leave: LeaveEntry[]): boolean =>
    (user.policies || []).some(p => p.isActive) || leave.some(e => e.memberId === user.id && hasLeaveType(e));

/** The state behind a trip's chip for one member. */
export const leaveStatus = (input: PlanInput): TripLeaveStatus => {
    const { trip, user, leave, entitlements, today, workingDays, holidays, events = [] } = input;
    if (!trip.startDate || trip.status === 'Cancelled' || trip.archived) return { kind: 'none' };
    if ((trip.endDate || trip.startDate) < today) return { kind: 'none' };
    const linked = linkedLeave(trip, user, leave);
    if (linked.length === 0 && !tracksLeave(user, leave)) return { kind: 'none' };

    if (linked.length === 0) {
        const plan = planLeave(input);
        if (plan.cost <= 0) return { kind: 'free' };
        const pick = plan.options.find(o => o.entitlement.id === plan.suggested);
        return { kind: 'needed', cost: plan.cost, typeId: pick?.entitlement.id, typeName: pick?.entitlement.name, short: pick && !pick.covers ? pick.shortBy : 0 };
    }

    // Booked: how far over is each type the linked leave draws on, in each year? Days another entry already takes
    // are not the trip's to pay for.
    const ctx = leaveContext(workingDays, holidays, events);
    const ids = new Set(linked.map(e => e.id));
    const mine = memberLeaveDays(user, leave, ctx, today).filter(d => ids.has(d.entryId));
    let cost = 0;
    let short = 0;
    const names = new Set<string>();
    const years = [...new Set(linked.flatMap(spanYears))];
    for (const year of years) {
        const perType = new Map<string, number>();
        mine.filter(d => yearOfISO(d.iso) === year).forEach(d => perType.set(d.entitlementId, (perType.get(d.entitlementId) || 0) + d.days));
        if (perType.size === 0) continue;
        const balances = balancesFor({ user, leave, entitlements, today, ctx }, year);
        perType.forEach((days, id) => {
            cost += days;
            names.add(entitlements.find(e => e.id === id)?.name || 'Leave');
            const b = balances.find(x => x.entitlement.id === id);
            if (b && !b.unlimited && b.remaining !== null && b.remaining < 0) short += Math.min(days, -b.remaining);
        });
    }
    return { kind: 'booked', cost, typeName: [...names].join(' + ') || 'Time off', short, pending: linked.every(e => e.state === 'requested') };
};

/**
 * The leave entry that puts a trip's days on one leave type for a member: the existing linked entry changed to that
 * type (its own dates kept), or a new one over the trip's dates. A confirmed trip starts as approved leave.
 */
export const linkedEntryFor = (trip: Trip, user: User, entitlementId: string, existing?: LeaveEntry): LeaveEntry => existing
    ? { ...existing, entitlementId, allocations: undefined }
    : {
        id: newLeaveId(),
        memberId: user.id,
        name: trip.name,
        startDate: trip.startDate,
        endDate: trip.endDate || trip.startDate,
        entitlementId,
        state: trip.status === 'Upcoming' || trip.status === 'Past' ? 'approved' : defaultState(user),
        tripId: trip.id,
    };

const dayWord = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/** The chip's wording and tone for a status. */
export const leaveNote = (state: TripLeaveStatus): { tone: 'ok' | 'needed' | 'short'; text: string } | null => {
    switch (state.kind) {
        case 'needed':
            return state.short > 0
                ? { tone: 'short', text: `Needs ${dayWord(state.cost)}, ${state.short} over` }
                : { tone: 'needed', text: `Needs ${dayWord(state.cost)} of leave` };
        case 'booked':
            return state.short > 0
                ? { tone: 'short', text: `${dayWord(state.short)} over ${state.typeName}` }
                : { tone: state.pending ? 'needed' : 'ok', text: `${dayWord(state.cost)} of ${state.typeName}${state.pending ? ', requested' : ''}` };
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
