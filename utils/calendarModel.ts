import type { CustomEvent, EntitlementType, PublicHoliday, SavedConfig, Trip, User, WorkspaceSettings } from '../types';
import { isTravelling } from './tripsModel';

/**
 * Pure logic for the New calendar (UI_UX_DESIGN_REFERENCE.md §5.2 row 8): month and year grids, what
 * sits on each day, how many leave days a trip really uses (weekends, holidays, days worked and half
 * days left out) and the balance of each leave type for a member and year, with carry-over.
 * Dates are ISO `YYYY-MM-DD` strings and all arithmetic is in UTC, so a time zone never shifts a day.
 */

export type WeekStart = 0 | 1 | 6;

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');
const utc = (iso: string) => {
    const [y, m, d] = (iso || '').slice(0, 10).split('-').map(Number);
    return Date.UTC(y, (m || 1) - 1, d || 1);
};

export const isoOf = (year: number, month0: number, day: number): string => `${year}-${pad(month0 + 1)}-${pad(day)}`;
export const addDaysISO = (iso: string, n: number): string => {
    const d = new Date(utc(iso) + n * DAY_MS);
    return isoOf(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};
/** 0 = Sunday … 6 = Saturday. */
export const weekdayOf = (iso: string): number => new Date(utc(iso)).getUTCDay();
export const daysBetween = (from: string, to: string): number => Math.round((utc(to) - utc(from)) / DAY_MS);
export const yearOfISO = (iso?: string): number => Number((iso || '').slice(0, 4));

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** The weekdays of a row, starting on the chosen day. */
export const weekdayOrder = (weekStart: WeekStart): number[] => Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7);

export interface GridDay { iso: string; inMonth: boolean }

/** The weeks of a month, each a row of seven days, padded with the neighbouring months' days. */
export const monthMatrix = (year: number, month0: number, weekStart: WeekStart): GridDay[][] => {
    const first = isoOf(year, month0, 1);
    const lead = (weekdayOf(first) - weekStart + 7) % 7;
    const length = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
    const rows = Math.ceil((lead + length) / 7);
    const start = addDaysISO(first, -lead);
    return Array.from({ length: rows }, (_, r) =>
        Array.from({ length: 7 }, (_, c) => {
            const iso = addDaysISO(start, r * 7 + c);
            return { iso, inMonth: iso.slice(0, 7) === first.slice(0, 7) };
        }));
};

export const monthOf = (iso: string) => ({ year: yearOfISO(iso), month0: Number(iso.slice(5, 7)) - 1 });

export const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];
export const workingDaysOf = (settings?: Pick<WorkspaceSettings, 'workingDays'> | null): number[] =>
    settings?.workingDays && settings.workingDays.length > 0 ? settings.workingDays : DEFAULT_WORKING_DAYS;
export const isWeekend = (iso: string, workingDays: number[]): boolean => !workingDays.includes(weekdayOf(iso));

/* --------------------------------- holidays -------------------------------- */

export interface HolidayDay extends PublicHoliday {
    /** The day it is taken off: the date itself, or the next working day under "Move to Monday". */
    observed: string;
    countryName: string;
    /** False when the holiday is switched off: shown, but not a day off. */
    counted: boolean;
}

/** Where a holiday falls for a member: a weekend holiday moves to the next working day under the "monday" rule. */
export const observedDate = (date: string, rule: User['holidayWeekendRule'] | undefined, workingDays: number[]): string => {
    if (rule !== 'monday' || workingDays.length === 0 || !isWeekend(date, workingDays)) return date;
    let day = date;
    for (let i = 0; i < 7 && isWeekend(day, workingDays); i++) day = addDaysISO(day, 1);
    return day;
};

/** The holidays of the given calendars as days, each once, with the member's weekend rule applied. */
export const holidayDays = (configs: SavedConfig[], rule: User['holidayWeekendRule'] | undefined, workingDays: number[]): HolidayDay[] => {
    const seen = new Set<string>();
    const out: HolidayDay[] = [];
    configs.forEach(c => (c.holidays || []).forEach(h => {
        if (!h.date) return;
        const observed = observedDate(h.date, rule, workingDays);
        const key = `${observed}|${h.name}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ ...h, configId: c.id, observed, countryName: c.countryName, counted: h.isIncluded !== false });
    }));
    return out.sort((a, b) => a.observed.localeCompare(b.observed));
};

/**
 * The calendars shown for the members in view: the ones the members have linked; when none of them has
 * linked any, every saved calendar (so a fresh workspace still shows its holidays).
 */
export const configsFor = (configs: SavedConfig[], members: User[]): SavedConfig[] => {
    const linked = new Set(members.flatMap(m => m.holidayConfigIds || []));
    return linked.size > 0 ? configs.filter(c => linked.has(c.id)) : configs;
};

/* ------------------------------- counting leave ------------------------------ */

export interface LeaveContext {
    workingDays: number[];
    /** Dates that are public holidays (taken off) for the member. */
    offDays: Set<string>;
}

export const leaveContext = (workingDays: number[], holidays: HolidayDay[]): LeaveContext => ({
    workingDays,
    offDays: new Set(holidays.filter(h => h.counted).map(h => h.observed)),
});

/** A trip with a leave type or a split of days across types. */
export const hasLeave = (trip: Trip): boolean => Boolean(trip.entitlementId || (trip.allocations && trip.allocations.length > 0));

/**
 * What one date of a trip takes from leave: 0 on a weekend, a public holiday or a day the member works
 * anyway, 0.5 for a half day (a morning or afternoon only, or the first day starting after lunch and the
 * last day ending before it), otherwise 1.
 */
export const dayWeight = (trip: Trip, iso: string, ctx: LeaveContext): number => {
    const start = trip.startDate;
    const end = trip.endDate || trip.startDate;
    if (iso < start || iso > end) return 0;
    if ((trip.excludedDates || []).includes(iso)) return 0;
    if (isWeekend(iso, ctx.workingDays) || ctx.offDays.has(iso)) return 0;
    switch (trip.durationMode) {
        case 'all_am':
        case 'all_pm':
            return 0.5;
        case 'single_am':
        case 'single_pm':
            return iso === start ? 0.5 : 1;
        case 'custom': {
            const startHalf = iso === start && trip.startPortion === 'pm';
            const endHalf = iso === end && trip.endPortion === 'am';
            return startHalf || endHalf ? 0.5 : 1;
        }
        default:
            return 1;
    }
};

/** The longest trip the model walks day by day (a mistyped year never freezes the page). */
const MAX_SPAN = 800;

export const tripDates = (trip: Trip): string[] => {
    const start = trip.startDate;
    const end = trip.endDate || trip.startDate;
    if (!start || !end || end < start) return [];
    const n = Math.min(daysBetween(start, end), MAX_SPAN);
    return Array.from({ length: n + 1 }, (_, i) => addDaysISO(start, i));
};

/** Days a trip counts against leave, in total or within one year. */
export const countedDays = (trip: Trip, ctx: LeaveContext, year?: number): number =>
    tripDates(trip).reduce((sum, iso) => (year && yearOfISO(iso) !== year ? sum : sum + dayWeight(trip, iso, ctx)), 0);

/** Why a trip's length is not all leave: the weekend days, holidays and worked days left out. */
export const skippedDays = (trip: Trip, ctx: LeaveContext): { weekend: number; holiday: number; worked: number } => {
    const out = { weekend: 0, holiday: 0, worked: 0 };
    const excluded = new Set(trip.excludedDates || []);
    tripDates(trip).forEach(iso => {
        if (excluded.has(iso)) out.worked += 1;
        else if (isWeekend(iso, ctx.workingDays)) out.weekend += 1;
        else if (ctx.offDays.has(iso)) out.holiday += 1;
    });
    return out;
};

export interface LeaveUse { entitlementId: string; used: number; planned: number }

/**
 * The days a trip puts on each leave type in a year, split into used (before today) and planned (today and
 * later). A trip with `allocations` uses those days (in their target year, else the year it starts);
 * otherwise the days are counted date by date, so a trip across New Year splits itself.
 */
export const leaveUse = (trip: Trip, year: number, today: string, ctx: LeaveContext): LeaveUse[] => {
    const split = (trip.allocations || []).filter(a => a.entitlementId && Number(a.days) > 0);
    if (split.length > 0) {
        const startYear = yearOfISO(trip.startDate);
        const over = (trip.endDate || trip.startDate) < today;
        return split
            .filter(a => (a.targetYear ?? startYear) === year)
            .map(a => ({ entitlementId: a.entitlementId, used: over ? Number(a.days) : 0, planned: over ? 0 : Number(a.days) }));
    }
    if (!trip.entitlementId) return [];
    let used = 0;
    let planned = 0;
    tripDates(trip).forEach(iso => {
        if (yearOfISO(iso) !== year) return;
        const w = dayWeight(trip, iso, ctx);
        if (iso < today) used += w; else planned += w;
    });
    return used + planned > 0 ? [{ entitlementId: trip.entitlementId, used, planned }] : [];
};

/* --------------------------------- balances -------------------------------- */

export interface TypeBalance {
    entitlement: EntitlementType;
    year: number;
    /** Days the policy grants for the year (monthly accrual runs twelve times); null without a policy. */
    allowance: number | null;
    /** Days carried over from the year before. */
    carryOver: number;
    /** Allowance plus carry-over; null when unlimited or without a policy. */
    total: number | null;
    used: number;
    planned: number;
    /** Total minus used minus planned; negative when over; null when unlimited or without a policy. */
    remaining: number | null;
    unlimited: boolean;
}

const policyOf = (user: User, entitlementId: string, year: number) =>
    (user.policies || []).find(p => p.entitlementId === entitlementId && p.year === year && p.isActive);

const policyDays = (user: User, entitlementId: string, year: number): { days: number | null; unlimited: boolean } => {
    const p = policyOf(user, entitlementId, year);
    if (!p) return { days: null, unlimited: false };
    if (p.isUnlimited) return { days: null, unlimited: true };
    const amount = Number(p.accrual?.amount) || 0;
    return { days: p.accrual?.period === 'monthly' ? amount * 12 : amount, unlimited: false };
};

export interface BalanceInput {
    user: User;
    trips: Trip[];
    entitlements: EntitlementType[];
    today: string;
    ctx: LeaveContext;
}

const usedAndPlanned = ({ user, trips, today, ctx }: BalanceInput, entitlementId: string, year: number) => {
    let used = 0;
    let planned = 0;
    trips.forEach(t => {
        if (t.status === 'Cancelled' || !(t.participants || []).includes(user.id)) return;
        leaveUse(t, year, today, ctx).forEach(u => {
            if (u.entitlementId !== entitlementId) return;
            used += u.used;
            planned += u.planned;
        });
    });
    return { used, planned };
};

/**
 * Days carried into a leave type for a year: each policy of the year before that has carry-over on gives
 * what was left of it, up to its limit, to its target type (itself unless another is chosen).
 */
export const carryOverInto = (input: BalanceInput, entitlementId: string, year: number, depth = 0): number => {
    if (depth > 4) return 0;
    let carried = 0;
    (input.user.policies || []).forEach(p => {
        if (p.year !== year - 1 || !p.isActive || !p.carryOver?.enabled || p.isUnlimited) return;
        if ((p.carryOver.targetEntitlementId || p.entitlementId) !== entitlementId) return;
        const grant = policyDays(input.user, p.entitlementId, year - 1).days ?? 0;
        const { used, planned } = usedAndPlanned(input, p.entitlementId, year - 1);
        const left = grant + carryOverInto(input, p.entitlementId, year - 1, depth + 1) - used - planned;
        carried += Math.min(Math.max(0, left), Math.max(0, Number(p.carryOver.maxDays) || 0));
    });
    return carried;
};

/** One row per leave type the member has a policy for or has leave on, in the workspace's order. */
export const balancesFor = (input: BalanceInput, year: number): TypeBalance[] =>
    input.entitlements
        .map(entitlement => {
            const grant = policyDays(input.user, entitlement.id, year);
            const { used, planned } = usedAndPlanned(input, entitlement.id, year);
            const unlimited = grant.unlimited || Boolean(entitlement.isUnlimited && grant.days === null && used + planned > 0);
            const carryOver = carryOverInto(input, entitlement.id, year);
            const hasPolicy = grant.days !== null;
            const total = hasPolicy ? (grant.days as number) + carryOver : null;
            const remaining = total === null ? null : total - used - planned;
            return { entitlement, year, allowance: grant.days, carryOver, total, used, planned, remaining, unlimited } satisfies TypeBalance;
        })
        .filter(b => b.allowance !== null || b.unlimited || b.carryOver > 0 || b.used + b.planned > 0);

export interface LeaveSummary {
    year: number;
    used: number;
    planned: number;
    /** Days left in the year: from the leave types' policies, else the member's yearly allowance. */
    left: number;
    /** What the year offers in all (policies' totals, else the yearly allowance). */
    total: number;
    /** True when the figures come from the member's yearly allowance rather than per-type policies. */
    fallback: boolean;
}

/** The three headline numbers for a member and year. */
export const summarise = (balances: TypeBalance[], user: User, year: number): LeaveSummary => {
    const used = balances.reduce((n, b) => n + b.used, 0);
    const planned = balances.reduce((n, b) => n + b.planned, 0);
    const limited = balances.filter(b => b.total !== null && !b.unlimited);
    if (limited.length > 0) {
        const total = limited.reduce((n, b) => n + (b.total as number), 0);
        const taken = limited.reduce((n, b) => n + b.used + b.planned, 0);
        return { year, used, planned, left: Math.max(0, total - taken), total, fallback: false };
    }
    const allowance = Number(user.allowance ?? user.leaveBalance) || 0;
    const recorded = Number(user.takenLeave) || 0;
    // A member's recorded "taken" days stand in for trips that do not carry the leave.
    const taken = Math.max(recorded, used);
    return { year, used: taken, planned, left: Math.max(0, allowance - taken - planned), total: allowance, fallback: true };
};

/** Years worth showing: this year, the members' tracked years and the years of leave in their trips. */
export const calendarYears = (users: User[], trips: Trip[], thisYear: number): number[] => {
    const years = new Set<number>([thisYear, thisYear + 1]);
    users.forEach(u => (u.activeYears || []).forEach(y => years.add(y)));
    trips.forEach(t => {
        if (!hasLeave(t)) return;
        [yearOfISO(t.startDate), yearOfISO(t.endDate)].forEach(y => { if (y > 1900) years.add(y); });
    });
    return [...years].sort((a, b) => a - b);
};

/* ---------------------------------- the grid ------------------------------- */

export type ItemState = 'now' | 'confirmed' | 'planned' | 'past';

export interface CalendarItem {
    key: string;
    kind: 'trip' | 'holiday' | 'event';
    id: string;
    title: string;
    start: string;
    end: string;
    state: ItemState;
    /** A trip that uses leave. */
    leave: boolean;
    /** A holiday that is switched off, or any item that does not take a day off. */
    muted: boolean;
    trip?: Trip;
    holiday?: HolidayDay;
    event?: CustomEvent;
}

export const stateOf = (trip: Trip, today: string): ItemState => {
    if (isTravelling(trip, today)) return 'now';
    if (trip.status === 'Past' || (trip.endDate || trip.startDate) < today) return 'past';
    return trip.status === 'Upcoming' ? 'confirmed' : 'planned';
};

/** Standalone leave made on the calendar is a hidden trip with this id prefix. */
export const LEAVE_ID_PREFIX = 'leave-';
export const isStandaloneLeave = (trip: Trip): boolean => trip.id.startsWith(LEAVE_ID_PREFIX);

export interface ItemFilters {
    /** Member ids in view; empty means everyone. */
    memberIds: string[];
    leaveOnly: boolean;
    query: string;
}

/** Trips, holidays and events as calendar items. Cancelled trips and flight bundles are left out. */
export const buildItems = (
    trips: Trip[],
    holidays: HolidayDay[],
    events: CustomEvent[],
    filters: ItemFilters,
    today: string,
): CalendarItem[] => {
    const q = filters.query.trim().toLowerCase();
    const items: CalendarItem[] = [];
    trips.forEach(t => {
        if (t.status === 'Cancelled' || t.isBundleOnly || (t.hideInPlanner && !isStandaloneLeave(t)) || !t.startDate) return;
        if (filters.memberIds.length > 0 && !(t.participants || []).some(p => filters.memberIds.includes(p))) return;
        if (filters.leaveOnly && !hasLeave(t)) return;
        if (q && !`${t.name} ${t.location || ''}`.toLowerCase().includes(q)) return;
        items.push({ key: `trip:${t.id}`, kind: 'trip', id: t.id, title: t.name, start: t.startDate, end: t.endDate || t.startDate, state: stateOf(t, today), leave: hasLeave(t), muted: false, trip: t });
    });
    if (!filters.leaveOnly) {
        holidays.forEach(h => {
            if (q && !h.name.toLowerCase().includes(q)) return;
            items.push({ key: `holiday:${h.configId}:${h.id}`, kind: 'holiday', id: h.id, title: h.name, start: h.observed, end: h.observed, state: h.observed < today ? 'past' : 'planned', leave: false, muted: !h.counted, holiday: h });
        });
        events.forEach(e => {
            if (!e.date || (q && !e.name.toLowerCase().includes(q))) return;
            items.push({ key: `event:${e.id}`, kind: 'event', id: e.id, title: e.name, start: e.date, end: e.date, state: e.date < today ? 'past' : 'planned', leave: false, muted: Boolean(e.isWorkingDay), event: e });
        });
    }
    return items;
};

const KIND_ORDER = { trip: 0, holiday: 1, event: 2 } as const;

/** Orders items for a day or a lane: trips first, longer first, then by title. */
export const compareItems = (a: CalendarItem, b: CalendarItem): number =>
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.start.localeCompare(b.start) || b.end.localeCompare(a.end) || a.title.localeCompare(b.title);

export const itemsOn = (items: CalendarItem[], iso: string): CalendarItem[] =>
    items.filter(i => i.start <= iso && i.end >= iso).sort(compareItems);

export interface DaySlot { item: CalendarItem; /** First visible day of the item in this row. */ first: boolean; /** Last visible day of the item in this row. */ last: boolean }
export interface WeekDay { iso: string; slots: (DaySlot | null)[]; /** Items hidden below the visible lanes. */ more: number }

/** Lays a week out in lanes so a multi-day item keeps its row across the days, with `lanes` rows visible. */
export const layoutWeek = (items: CalendarItem[], days: string[], lanes: number): WeekDay[] => {
    const first = days[0];
    const last = days[days.length - 1];
    const inWeek = items.filter(i => i.start <= last && i.end >= first).sort(compareItems);
    const laneEnds: number[] = []; // index of the last column each lane is busy to
    const placed = inWeek.map(item => {
        const from = Math.max(0, daysBetween(first, item.start));
        const to = Math.min(days.length - 1, daysBetween(first, item.end));
        let lane = laneEnds.findIndex(end => end < from);
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(to); } else laneEnds[lane] = to;
        return { item, lane, from, to };
    });
    return days.map((iso, col) => {
        const slots: (DaySlot | null)[] = Array.from({ length: lanes }, () => null);
        let more = 0;
        placed.forEach(p => {
            if (col < p.from || col > p.to) return;
            if (p.lane < lanes) slots[p.lane] = { item: p.item, first: col === p.from, last: col === p.to };
            else more += 1;
        });
        return { iso, slots, more };
    });
};

/** The next leave to start (or under way) on or after today, soonest first. */
export const nextLeave = (trips: Trip[], memberIds: string[], today: string): Trip | null => {
    const mine = trips
        .filter(t => t.status !== 'Cancelled' && hasLeave(t) && (t.endDate || t.startDate) >= today && (memberIds.length === 0 || (t.participants || []).some(p => memberIds.includes(p))))
        .sort((a, b) => a.startDate.localeCompare(b.startDate));
    return mine[0] ?? null;
};
