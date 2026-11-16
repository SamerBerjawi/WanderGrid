import type { CustomEvent, EntitlementType, LeaveEntry, LeaveSpan, PublicHoliday, SavedConfig, Trip, User, UserPolicy, WorkspaceSettings } from '../types';
import { countsAsLeave } from './leaveEntry';
import { isPastTrip, isTravelling } from './tripsModel';
import { tripKind } from './tripKind';

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
    /** The day it is taken off: the date itself, or the next free working day under "Move to Monday". */
    observed: string;
    countryName: string;
    /** False when the holiday is switched off: shown, but not a day off. */
    counted: boolean;
    /** A weekend holiday under the "Day in lieu" rule: it stays on its date and earns a day to take later. */
    inLieu?: boolean;
}

/**
 * Where a holiday falls for a member: a weekend holiday moves to the next working day under the "monday" rule,
 * skipping the days in `taken` (other holidays already there), so two weekend holidays never share a Monday.
 */
export const observedDate = (date: string, rule: User['holidayWeekendRule'] | undefined, workingDays: number[], taken?: ReadonlySet<string>): string => {
    if (rule !== 'monday' || workingDays.length === 0 || !isWeekend(date, workingDays)) return date;
    let day = date;
    for (let i = 0; i < 31 && (isWeekend(day, workingDays) || taken?.has(day)); i++) day = addDaysISO(day, 1);
    return day;
};

/**
 * The holidays of the given calendars as days, each once, with the member's weekend rule applied.
 * Holidays on working days keep their date; weekend ones are then placed in date order, each on the next working
 * day that no counted holiday holds yet ("monday"), or left on their date and marked `inLieu` ("lieu").
 */
export const holidayDays = (configs: SavedConfig[], rule: User['holidayWeekendRule'] | undefined, workingDays: number[]): HolidayDay[] => {
    const seen = new Set<string>();
    const all: HolidayDay[] = [];
    configs.forEach(c => (c.holidays || []).forEach(h => {
        if (!h.date) return;
        const key = `${h.date}|${h.name}`;
        if (seen.has(key)) return;
        seen.add(key);
        all.push({ ...h, configId: c.id, observed: h.date, countryName: c.countryName, counted: h.isIncluded !== false });
    }));
    all.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
    const onWeekend = (h: HolidayDay) => workingDays.length > 0 && isWeekend(h.date, workingDays);
    // Days a counted holiday already holds: a moved holiday may not land on one of them.
    const taken = new Set(all.filter(h => h.counted && !onWeekend(h)).map(h => h.date));
    const out = all.map(h => {
        if (!onWeekend(h)) return h;
        if (rule === 'lieu') return h.counted ? { ...h, inLieu: true } : h;
        if (rule !== 'monday') return h;
        const observed = observedDate(h.date, rule, workingDays, taken);
        if (h.counted) taken.add(observed);
        return { ...h, observed };
    });
    // The same holiday from two calendars, moved to the same day, is still one day.
    const once = new Set<string>();
    return out
        .filter(h => { const k = `${h.observed}|${h.name}`; if (once.has(k)) return false; once.add(k); return true; })
        .sort((a, b) => a.observed.localeCompare(b.observed));
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
    /** Weekend holidays that earn a day in lieu (the member's "Day in lieu" rule), one per date. */
    lieuDates?: string[];
}

export const leaveContext = (workingDays: number[], holidays: HolidayDay[]): LeaveContext => ({
    workingDays,
    offDays: new Set(holidays.filter(h => h.counted).map(h => h.observed)),
    lieuDates: [...new Set(holidays.filter(h => h.counted && h.inLieu).map(h => h.observed))].sort(),
});

/** A leave entry (or, before leave Phase 1, a trip) with a leave type or a split of days across types. */
export const hasLeave = (x: Pick<LeaveEntry, 'entitlementId' | 'allocations'>): boolean => Boolean(x.entitlementId || (x.allocations && x.allocations.length > 0));

/**
 * What one date of a leave span takes from leave: 0 on a weekend, a public holiday or a day the member works
 * anyway, 0.5 for a half day (a morning or afternoon only, or the first day starting after lunch and the
 * last day ending before it), otherwise 1.
 */
export const dayWeight = (span: LeaveSpan, iso: string, ctx: LeaveContext): number => {
    const start = span.startDate;
    const end = span.endDate || span.startDate;
    if (iso < start || iso > end) return 0;
    if ((span.excludedDates || []).includes(iso)) return 0;
    if (isWeekend(iso, ctx.workingDays) || ctx.offDays.has(iso)) return 0;
    switch (span.durationMode) {
        case 'all_am':
        case 'all_pm':
            return 0.5;
        case 'single_am':
        case 'single_pm':
            return iso === start ? 0.5 : 1;
        case 'custom': {
            const startHalf = iso === start && span.startPortion === 'pm';
            const endHalf = iso === end && span.endPortion === 'am';
            return startHalf || endHalf ? 0.5 : 1;
        }
        default:
            return 1;
    }
};

/** The longest span the model walks day by day (a mistyped year never freezes the page). */
const MAX_SPAN = 800;

export const tripDates = (span: Pick<LeaveSpan, 'startDate' | 'endDate'>): string[] => {
    const start = span.startDate;
    const end = span.endDate || span.startDate;
    if (!start || !end || end < start) return [];
    const n = Math.min(daysBetween(start, end), MAX_SPAN);
    return Array.from({ length: n + 1 }, (_, i) => addDaysISO(start, i));
};

/** Days a span counts against leave, in total or within one year. */
export const countedDays = (span: LeaveSpan, ctx: LeaveContext, year?: number): number =>
    tripDates(span).reduce((sum, iso) => (year && yearOfISO(iso) !== year ? sum : sum + dayWeight(span, iso, ctx)), 0);

/** Why a span's length is not all leave: the weekend days, holidays and worked days left out. */
export const skippedDays = (span: LeaveSpan, ctx: LeaveContext): { weekend: number; holiday: number; worked: number } => {
    const out = { weekend: 0, holiday: 0, worked: 0 };
    const excluded = new Set(span.excludedDates || []);
    tripDates(span).forEach(iso => {
        if (excluded.has(iso)) out.worked += 1;
        else if (isWeekend(iso, ctx.workingDays)) out.weekend += 1;
        else if (ctx.offDays.has(iso)) out.holiday += 1;
    });
    return out;
};

/* ------------------------------ a member's leave ----------------------------- */

/** One piece of a member's leave: a dated day (or half day), or a split's days put on one date. */
export interface LeaveDay {
    iso: string;
    entitlementId: string;
    days: number;
    /** The leave entry it comes from. */
    entryId: string;
    /** Taken already (before today); otherwise planned. */
    used: boolean;
    /** Requested and not answered yet. */
    pending: boolean;
}

/**
 * Which entry owns a day when two overlap: booked leave (planned or approved) before a request still waiting for an
 * answer; then a split across types (its days are fixed); then the entry that starts first.
 */
const STATE_RANK: Record<string, number> = { approved: 0, planned: 0, requested: 1 };
const leaveOrder = (a: LeaveEntry, b: LeaveEntry): number =>
    (STATE_RANK[a.state || 'planned'] ?? 9) - (STATE_RANK[b.state || 'planned'] ?? 9)
    || Number(Boolean(b.allocations?.length)) - Number(Boolean(a.allocations?.length))
    || (a.startDate || '').localeCompare(b.startDate || '')
    || a.id.localeCompare(b.id);

/** The member's leave entries that count (planned, requested or approved), in the order they claim days. */
export const memberLeaveEntries = (user: Pick<User, 'id'>, entries: LeaveEntry[]): LeaveEntry[] =>
    entries.filter(e => e && e.memberId === user.id && countsAsLeave(e) && e.startDate).sort(leaveOrder);

/**
 * Every day of leave a member takes, each date counted once: when two entries cover the same working day, the day
 * costs at most one day in all, and the first entry in `leaveOrder` has it. Half days add up (a morning and an
 * afternoon make one day). A split across types keeps its own day counts and claims its dates. Entries with no
 * leave type claim their days too (they are time off) but put nothing on a balance.
 */
export const memberLeaveDays = (user: Pick<User, 'id'>, entries: LeaveEntry[], ctx: LeaveContext, today: string): LeaveDay[] => {
    const claimed = new Map<string, number>();
    const out: LeaveDay[] = [];
    memberLeaveEntries(user, entries).forEach(e => {
        const pending = e.state === 'requested';
        const split = (e.allocations || []).filter(x => x.entitlementId && Number(x.days) > 0);
        if (split.length > 0) {
            const startYear = yearOfISO(e.startDate);
            const over = (e.endDate || e.startDate) < today;
            split.forEach(x => {
                const y = x.targetYear ?? startYear;
                out.push({ iso: y === startYear ? e.startDate : `${y}-01-01`, entitlementId: x.entitlementId, days: Number(x.days), entryId: e.id, used: over, pending });
            });
            tripDates(e).forEach(iso => {
                const w = dayWeight(e, iso, ctx);
                if (w > 0) claimed.set(iso, Math.min(1, (claimed.get(iso) || 0) + w));
            });
            return;
        }
        tripDates(e).forEach(iso => {
            const w = dayWeight(e, iso, ctx);
            if (w <= 0) return;
            const take = Math.min(w, 1 - (claimed.get(iso) || 0));
            if (take <= 0) return;
            claimed.set(iso, (claimed.get(iso) || 0) + take);
            if (e.entitlementId) out.push({ iso, entitlementId: e.entitlementId, days: take, entryId: e.id, used: iso < today, pending });
        });
    });
    return out;
};

/** What a single entry costs once the member's other leave has taken its share (the entry itself may be unsaved). */
export const entryCost = (entry: LeaveEntry, entries: LeaveEntry[], ctx: LeaveContext, today: string): number => {
    const withIt = [...entries.filter(e => e.id !== entry.id), { ...entry, state: entry.state && countsAsLeave(entry) ? entry.state : 'planned', entitlementId: entry.entitlementId || (entry.allocations?.length ? undefined : '__cost__') } as LeaveEntry];
    return memberLeaveDays({ id: entry.memberId }, withIt, ctx, today).filter(d => d.entryId === entry.id).reduce((n, d) => n + d.days, 0);
};

export interface LeaveOverlap {
    iso: string;
    /** The entries that cover the day, in the order they claim it. */
    entryIds: string[];
}

/**
 * Working days that two or more of a member's leave entries cover together for more than a day (two full days, or
 * a full day and a half day). Weekends, holidays and days worked cost nothing, so they never overlap.
 */
export const leaveOverlaps = (user: Pick<User, 'id'>, entries: LeaveEntry[], ctx: LeaveContext): LeaveOverlap[] => {
    const byDay = new Map<string, { weight: number; ids: string[] }>();
    memberLeaveEntries(user, entries).forEach(e => tripDates(e).forEach(iso => {
        const w = dayWeight(e, iso, ctx);
        if (w <= 0) return;
        const slot = byDay.get(iso) || { weight: 0, ids: [] };
        slot.weight += w;
        slot.ids.push(e.id);
        byDay.set(iso, slot);
    }));
    return [...byDay.entries()]
        .filter(([, v]) => v.ids.length > 1 && v.weight > 1)
        .map(([iso, v]) => ({ iso, entryIds: v.ids }))
        .sort((x, y) => x.iso.localeCompare(y.iso));
};

/* --------------------------------- balances -------------------------------- */

export interface TypeBalance {
    entitlement: EntitlementType;
    year: number;
    /** Days the policy grants for the year (monthly accrual runs twelve times); null without a policy. */
    allowance: number | null;
    /** Days carried over from the year before. */
    carryOver: number;
    /** Carried-over days lost because they were not used by their expiry date (counted once that date is past). */
    expired: number;
    /** Carried-over days that will be lost on `on` unless more leave is booked before then (null when none). */
    expiring: { days: number; on: string } | null;
    /** Days in lieu earned this year by weekend holidays (the member's "Day in lieu" rule). */
    lieu: number;
    /** Allowance plus carry-over plus days in lieu; null when unlimited or without a policy. */
    total: number | null;
    /** Days taken (approved or planned, before today). */
    used: number;
    /** Days booked from today on (approved or planned). */
    planned: number;
    /** Days requested and not answered yet (any date). */
    pending: number;
    /** Total minus expired, used, planned and pending; negative when over; null when unlimited or without a policy. */
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
    /** Every leave entry (the member's are picked out). */
    leave: LeaveEntry[];
    entitlements: EntitlementType[];
    today: string;
    ctx: LeaveContext;
}

/** The member's leave days, worked out once per input (balances read them for every type and year). */
const dayCache = new WeakMap<BalanceInput, LeaveDay[]>();
const daysOf = (input: BalanceInput): LeaveDay[] => {
    let days = dayCache.get(input);
    if (!days) {
        days = memberLeaveDays(input.user, input.leave, input.ctx, input.today);
        dayCache.set(input, days);
    }
    return days;
};

const usedAndPlanned = (input: BalanceInput, entitlementId: string, year: number) => {
    let used = 0;
    let planned = 0;
    let pending = 0;
    daysOf(input).forEach(d => {
        if (d.entitlementId !== entitlementId || yearOfISO(d.iso) !== year) return;
        if (d.pending) pending += d.days;
        else if (d.used) used += d.days;
        else planned += d.days;
    });
    return { used, planned, pending };
};

/** Days of a type booked in a year up to and including a date (taken or planned). */
const bookedThrough = (input: BalanceInput, entitlementId: string, year: number, through: string) =>
    daysOf(input).reduce((n, d) => (d.entitlementId === entitlementId && yearOfISO(d.iso) === year && d.iso <= through ? n + d.days : n), 0);

/**
 * The last day carried-over days can be used, from the policy they were carried from: `months` after the start of
 * the year (3 = to 31 March), or a fixed `MM-DD` in the year. Null when they never expire.
 */
export const carryOverExpiry = (carryOver: UserPolicy['carryOver'] | undefined, year: number): string | null => {
    if (!carryOver) return null;
    if (carryOver.expiryType === 'months') {
        const n = Math.round(Number(carryOver.expiryValue));
        if (!Number.isFinite(n) || n <= 0) return null;
        const d = new Date(Date.UTC(year, n, 0));
        return isoOf(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
    if (carryOver.expiryType === 'fixed_date') {
        const m = /^(\d{2})-(\d{2})$/.exec(String(carryOver.expiryValue || ''));
        if (!m) return null;
        const month = Number(m[1]), day = Number(m[2]);
        if (month < 1 || month > 12 || day < 1) return null;
        const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
        return isoOf(year, month - 1, Math.min(day, last));
    }
    return null;
};

interface CarryIn {
    /** Days carried in. */
    days: number;
    /** Days that are lost at expiry, given what is booked now. */
    lost: number;
    /** The earliest expiry with days still at stake. */
    expiresOn: string | null;
}

/**
 * Days carried into a leave type for a year: each policy of the year before that has carry-over on gives what was
 * left of it, up to its limit, to its target type (itself unless another is chosen). Carried days are used first;
 * those not used by their expiry date are lost.
 */
const carryIn = (input: BalanceInput, entitlementId: string, year: number, depth: number): CarryIn => {
    if (depth > 4) return { days: 0, lost: 0, expiresOn: null };
    const sources: { days: number; expiry: string | null }[] = [];
    (input.user.policies || []).forEach(p => {
        if (p.year !== year - 1 || !p.isActive || !p.carryOver?.enabled || p.isUnlimited) return;
        if ((p.carryOver.targetEntitlementId || p.entitlementId) !== entitlementId) return;
        const left = leftAtYearEnd(input, p.entitlementId, year - 1, depth + 1);
        const days = Math.min(Math.max(0, left), Math.max(0, Number(p.carryOver.maxDays) || 0));
        if (days > 0) sources.push({ days, expiry: carryOverExpiry(p.carryOver, year) });
    });
    // The soonest-expiring days are used first.
    sources.sort((a, b) => (a.expiry ?? '9999').localeCompare(b.expiry ?? '9999'));
    let consumed = 0;
    let lost = 0;
    let expiresOn: string | null = null;
    sources.forEach(src => {
        if (!src.expiry) return;
        const usable = Math.max(0, bookedThrough(input, entitlementId, year, src.expiry) - consumed);
        const usedHere = Math.min(src.days, usable);
        consumed += usedHere;
        const gone = src.days - usedHere;
        if (gone > 0) { lost += gone; expiresOn = expiresOn ?? src.expiry; }
    });
    return { days: sources.reduce((n, x) => n + x.days, 0), lost, expiresOn };
};

/** Days in lieu a year earns for the type that takes them. */
const lieuFor = (input: BalanceInput, entitlementId: string, year: number): number => {
    const dates = (input.ctx.lieuDates || []).filter(d => yearOfISO(d) === year);
    if (dates.length === 0) return 0;
    return lieuTypeOf(input.entitlements)?.id === entitlementId ? dates.length : 0;
};

/** The type days in lieu go to: a "Lieu" type if there is one, else the first annual type, else the first type. */
export const lieuTypeOf = (entitlements: EntitlementType[]): EntitlementType | undefined =>
    entitlements.find(e => e.category === 'Lieu') ?? entitlements.find(e => e.category === 'Annual') ?? entitlements[0];

/** What a type has left once the year is over, given what is booked now (expired carry-over taken off). */
const leftAtYearEnd = (input: BalanceInput, entitlementId: string, year: number, depth: number): number => {
    const grant = policyDays(input.user, entitlementId, year).days ?? 0;
    const carried = carryIn(input, entitlementId, year, depth);
    const { used, planned, pending } = usedAndPlanned(input, entitlementId, year);
    return grant + carried.days - carried.lost + lieuFor(input, entitlementId, year) - used - planned - pending;
};

/** Days carried into a leave type for a year (before any expiry). */
export const carryOverInto = (input: BalanceInput, entitlementId: string, year: number, depth = 0): number =>
    carryIn(input, entitlementId, year, depth).days;

/** One row per leave type the member has a policy for or has leave on, in the workspace's order. */
export const balancesFor = (input: BalanceInput, year: number): TypeBalance[] =>
    input.entitlements
        .map(entitlement => {
            const grant = policyDays(input.user, entitlement.id, year);
            const { used, planned, pending } = usedAndPlanned(input, entitlement.id, year);
            const unlimited = grant.unlimited || Boolean(entitlement.isUnlimited && grant.days === null && used + planned + pending > 0);
            const carried = carryIn(input, entitlement.id, year, 0);
            const lieu = lieuFor(input, entitlement.id, year);
            const past = carried.expiresOn !== null && carried.expiresOn < input.today;
            const expired = past ? carried.lost : 0;
            const expiring = !past && carried.lost > 0 && carried.expiresOn ? { days: carried.lost, on: carried.expiresOn } : null;
            const hasGrant = grant.days !== null || carried.days > 0 || lieu > 0;
            const total = unlimited || !hasGrant ? null : (grant.days ?? 0) + carried.days + lieu;
            const remaining = total === null ? null : total - expired - used - planned - pending;
            return { entitlement, year, allowance: grant.days, carryOver: carried.days, expired, expiring, lieu, total, used, planned, pending, remaining, unlimited } satisfies TypeBalance;
        })
        .filter(b => b.allowance !== null || b.unlimited || b.carryOver > 0 || b.lieu > 0 || b.used + b.planned + b.pending > 0);

export interface LeaveSummary {
    year: number;
    used: number;
    planned: number;
    /** Days requested and not answered yet. */
    pending: number;
    /** Days left in the year: from the leave types' policies, else the member's yearly allowance. */
    left: number;
    /** What the year offers in all (policies' totals less expired carry-over, else the yearly allowance). */
    total: number;
    /** True when the figures come from the member's yearly allowance rather than per-type policies. */
    fallback: boolean;
}

/** The three headline numbers for a member and year. */
export const summarise = (balances: TypeBalance[], user: User, year: number): LeaveSummary => {
    const used = balances.reduce((n, b) => n + b.used, 0);
    const planned = balances.reduce((n, b) => n + b.planned, 0);
    const pending = balances.reduce((n, b) => n + b.pending, 0);
    const limited = balances.filter(b => b.total !== null && !b.unlimited);
    if (limited.length > 0) {
        const total = limited.reduce((n, b) => n + (b.total as number) - b.expired, 0);
        const taken = limited.reduce((n, b) => n + b.used + b.planned + b.pending, 0);
        return { year, used, planned, pending, left: Math.max(0, total - taken), total, fallback: false };
    }
    const allowance = Number(user.allowance ?? user.leaveBalance) || 0;
    const recorded = Number(user.takenLeave) || 0;
    // A member's recorded "taken" days stand in for trips that do not carry the leave.
    const taken = Math.max(recorded, used);
    return { year, used: taken, planned, pending, left: Math.max(0, allowance - taken - planned - pending), total: allowance, fallback: true };
};

/** Years worth showing: this year and next, the members' tracked years and the years of their leave. */
export const calendarYears = (users: User[], leave: LeaveEntry[], thisYear: number): number[] => {
    const years = new Set<number>([thisYear, thisYear + 1]);
    users.forEach(u => (u.activeYears || []).forEach(y => years.add(y)));
    leave.forEach(e => {
        [yearOfISO(e.startDate), yearOfISO(e.endDate)].forEach(y => { if (y > 1900) years.add(y); });
    });
    return [...years].sort((a, b) => a - b);
};

/* ---------------------------------- the grid ------------------------------- */

export type ItemState = 'now' | 'confirmed' | 'planned' | 'past';

export interface CalendarItem {
    key: string;
    kind: 'trip' | 'leave' | 'holiday' | 'event';
    id: string;
    title: string;
    start: string;
    end: string;
    state: ItemState;
    /** A leave entry, or a trip that has leave linked to it. */
    leave: boolean;
    /** A holiday that is switched off, or any item that does not take a day off. */
    muted: boolean;
    /** A leave request still waiting for an answer. */
    pending?: boolean;
    /** The leave type's colour, when the calendar colours leave by type (an entry's first type). */
    tint?: LeaveColor;
    trip?: Trip;
    entry?: LeaveEntry;
    holiday?: HolidayDay;
    event?: CustomEvent;
}

export const stateOf = (trip: Trip, today: string): ItemState => {
    if (isTravelling(trip, today)) return 'now';
    if (isPastTrip(trip, today)) return 'past';
    return trip.status === 'Upcoming' ? 'confirmed' : 'planned';
};

/** A leave entry on the grid: under way, over, approved (confirmed) or still planned or requested. */
export const leaveItemState = (e: LeaveEntry, today: string): ItemState => {
    const end = e.endDate || e.startDate;
    if (end < today) return 'past';
    if (e.startDate <= today) return 'now';
    return e.state === 'approved' ? 'confirmed' : 'planned';
};

export { LEAVE_ID_PREFIX } from './leaveEntry';

export type LeaveColor = EntitlementType['color'];
export type CalendarLayer = 'trip' | 'leave' | 'holiday' | 'event';
export const ALL_LAYERS: Record<CalendarLayer, boolean> = { trip: true, leave: true, holiday: true, event: true };

export interface ItemFilters {
    /** Member ids in view; empty means everyone. */
    memberIds: string[];
    /** Only leave (no trips, holidays or events). */
    leaveOnly: boolean;
    query: string;
    /** Which kinds of item are shown (default all). */
    layers?: Record<CalendarLayer, boolean>;
}

/** The colour of an entry's leave type (the first of a split), by leave-type id. */
export const tintOf = (x: Pick<LeaveEntry, 'entitlementId' | 'allocations'>, colors?: Record<string, LeaveColor>): LeaveColor | undefined => {
    if (!colors) return undefined;
    const id = x.entitlementId || x.allocations?.[0]?.entitlementId;
    return id ? colors[id] : undefined;
};

/** What a leave entry is called on the calendar: its own name, else its leave type's, else "Time off". */
export const leaveTitle = (e: LeaveEntry, typeName?: (id: string) => string | undefined): string => {
    const own = (e.name || '').trim();
    if (own && !/^time off$/i.test(own)) return own;
    const id = e.entitlementId || e.allocations?.[0]?.entitlementId;
    return (id && typeName?.(id)) || own || 'Time off';
};

export interface ItemSources {
    trips: Trip[];
    leave: LeaveEntry[];
    holidays: HolidayDay[];
    events: CustomEvent[];
    /** A leave type's name, for entries with no name of their own. */
    typeName?: (id: string) => string | undefined;
}

/**
 * Trips, leave, holidays and events as calendar items. Cancelled trips, flight bundles and leave that does not count
 * (an idea, a refusal, a cancellation) are left out, except that ideas show muted so they can be found again.
 */
export const buildItems = (
    { trips, leave, holidays, events, typeName }: ItemSources,
    filters: ItemFilters,
    today: string,
    leaveColors?: Record<string, LeaveColor>,
): CalendarItem[] => {
    const q = filters.query.trim().toLowerCase();
    const layers = filters.layers ?? ALL_LAYERS;
    const inView = (id: string) => filters.memberIds.length === 0 || filters.memberIds.includes(id);
    const items: CalendarItem[] = [];
    const linked = new Set(leave.filter(e => e.tripId && countsAsLeave(e) && inView(e.memberId)).map(e => e.tripId as string));
    if (layers.leave) leave.forEach(e => {
        if (!e.startDate || !inView(e.memberId)) return;
        if (!countsAsLeave(e) && e.state !== 'draft') return;
        const title = leaveTitle(e, typeName);
        if (q && !`${title} ${e.note || ''}`.toLowerCase().includes(q)) return;
        items.push({
            key: `leave:${e.id}`, kind: 'leave', id: e.id, title, start: e.startDate, end: e.endDate || e.startDate,
            state: leaveItemState(e, today), leave: true, muted: e.state === 'draft', pending: e.state === 'requested',
            tint: tintOf(e, leaveColors), entry: e,
        });
    });
    if (filters.leaveOnly) return items;
    if (layers.trip) trips.forEach(t => {
        if (t.status === 'Cancelled' || tripKind(t) !== 'trip' || !t.startDate) return;
        if (filters.memberIds.length > 0 && !(t.participants || []).some(p => filters.memberIds.includes(p))) return;
        if (q && !`${t.name} ${t.location || ''}`.toLowerCase().includes(q)) return;
        items.push({ key: `trip:${t.id}`, kind: 'trip', id: t.id, title: t.name, start: t.startDate, end: t.endDate || t.startDate, state: stateOf(t, today), leave: linked.has(t.id), muted: false, trip: t });
    });
    if (layers.holiday) holidays.forEach(h => {
        if (q && !h.name.toLowerCase().includes(q)) return;
        items.push({ key: `holiday:${h.configId}:${h.id}`, kind: 'holiday', id: h.id, title: h.name, start: h.observed, end: h.observed, state: h.observed < today ? 'past' : 'planned', leave: false, muted: !h.counted, holiday: h });
    });
    if (layers.event) events.forEach(e => {
        if (!e.date || (q && !e.name.toLowerCase().includes(q))) return;
        items.push({ key: `event:${e.id}`, kind: 'event', id: e.id, title: e.name, start: e.date, end: e.date, state: e.date < today ? 'past' : 'planned', leave: false, muted: Boolean(e.isWorkingDay), event: e });
    });
    return items;
};

const KIND_ORDER = { trip: 0, leave: 1, holiday: 2, event: 3 } as const;

/** Orders items for a day or a lane: trips, then leave, then holidays and events; earlier and longer first, then by title. */
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
export const nextLeave = (leave: LeaveEntry[], memberIds: string[], today: string): LeaveEntry | null => {
    const mine = leave
        .filter(e => countsAsLeave(e) && (e.endDate || e.startDate) >= today && (memberIds.length === 0 || memberIds.includes(e.memberId)))
        .sort((a, b) => a.startDate.localeCompare(b.startDate));
    return mine[0] ?? null;
};
