import type { EntitlementType, LeaveEntry, LeaveReminderKind, User } from '../types';
import { addDaysISO, balancesFor, daysBetween, memberLeaveDays, summarise, tripDates, yearOfISO, type LeaveContext, type TypeBalance } from './calendarModel';
import { countsAsLeave } from './leaveEntry';

/**
 * Leave insights and reminders (leave Phase 2b): the years at a glance, how leave spreads over the months, what time off
 * the leave bought ("32 days off using only 18 leave days"), and the in-app reminders a member can switch off. Pure, so
 * the numbers are tested; pages only lay them out.
 */

export interface YearRow {
    year: number;
    /** What the year offered (allowance, carry-over, adjustments; 0 without an allowance). */
    total: number;
    used: number;
    planned: number;
    pending: number;
    left: number;
    /** Carried over into the year, and lost because it was not used in time. */
    carriedIn: number;
    expired: number;
    /** The year is still to come or under way: its figures are a forecast. */
    forecast: boolean;
}

/** One row per year: what was offered, taken, planned and left (types with an allowance; unlimited ones count as taken). */
export const yearHistory = (user: User, leave: LeaveEntry[], entitlements: EntitlementType[], ctx: LeaveContext, today: string, years: number[]): YearRow[] =>
    years.map(year => {
        const balances: TypeBalance[] = balancesFor({ user, leave, entitlements, today, ctx }, year);
        const s = summarise(balances, user, year);
        return {
            year, total: s.total, used: s.used, planned: s.planned, pending: s.pending, left: s.left,
            carriedIn: balances.reduce((n, b) => n + b.carryOver, 0),
            expired: balances.reduce((n, b) => n + b.expired, 0),
            forecast: year >= yearOfISO(today),
        };
    });

/** Leave days per month of a calendar year (twelve numbers, January first). */
export const leaveByMonth = (user: User, leave: LeaveEntry[], ctx: LeaveContext, today: string, year: number): number[] => {
    const out = Array.from({ length: 12 }, () => 0);
    memberLeaveDays(user, leave, ctx, today).forEach(d => {
        if (yearOfISO(d.iso) === year) out[Number(d.iso.slice(5, 7)) - 1] += d.days;
    });
    return out;
};

export interface TimeOff {
    /** Leave days taken or booked in the year. */
    leaveDays: number;
    /** Days away in all: each stretch of leave together with the weekends and holidays it joins up with. */
    daysOff: number;
    /** The longest of those stretches. */
    longest: number;
}

/**
 * What the year's leave bought: each run of leave days is widened to the weekends, holidays and company days next to it
 * (so a Friday off before a weekend is three days away), and the runs are added up once each.
 */
export const timeOffBought = (user: User, leave: LeaveEntry[], ctx: LeaveContext, today: string, year: number): TimeOff => {
    const days = memberLeaveDays(user, leave.filter(countsAsLeave), ctx, today).filter(d => yearOfISO(d.iso) === year);
    const leaveDays = days.reduce((n, d) => n + d.days, 0);
    // Every day the member is not at work because of leave, a weekend or a holiday, starting from the leave days.
    const away = new Set<string>();
    const dated = new Set(leave.filter(e => e.memberId === user.id && countsAsLeave(e)).flatMap(e => tripDates(e).filter(d => !(e.excludedDates || []).includes(d))));
    const rest = (iso: string) => ctx.offDays.has(iso) || (!ctx.workingDays.includes(new Date(`${iso}T00:00:00Z`).getUTCDay()) && !ctx.workDays?.has(iso));
    dated.forEach(iso => { if (yearOfISO(iso) === year) away.add(iso); });
    [...away].forEach(iso => {
        for (let d = addDaysISO(iso, -1); rest(d) && !away.has(d) && yearOfISO(d) === year; d = addDaysISO(d, -1)) away.add(d);
        for (let d = addDaysISO(iso, 1); rest(d) && !away.has(d) && yearOfISO(d) === year; d = addDaysISO(d, 1)) away.add(d);
    });
    const sorted = [...away].sort();
    let longest = 0;
    let run = 0;
    sorted.forEach((d, i) => { run = i > 0 && daysBetween(sorted[i - 1], d) === 1 ? run + 1 : 1; longest = Math.max(longest, run); });
    return { leaveDays, daysOff: leaveDays > 0 ? sorted.length : 0, longest: leaveDays > 0 ? longest : 0 };
};

/** "You've enjoyed 32 days off using only 18 leave days." (null when there is nothing worth saying) */
export const timeOffSentence = (t: TimeOff, future = false): string | null => {
    if (t.leaveDays <= 0 || t.daysOff <= t.leaveDays) return null;
    const leave = `${Number.isInteger(t.leaveDays) ? t.leaveDays : t.leaveDays.toFixed(1)} leave ${t.leaveDays === 1 ? 'day' : 'days'}`;
    return future ? `${t.daysOff} days off for only ${leave}.` : `You've enjoyed ${t.daysOff} days off using only ${leave}.`;
};

/* -------------------------------------- reminders -------------------------------------- */

export interface LeaveReminder {
    id: string;
    kind: LeaveReminderKind;
    tone: 'rust' | 'ochre' | 'green' | 'muted';
    text: string;
    /** The leave entry it is about, when there is one. */
    entryId?: string;
}

export const REMINDER_LABELS: Record<LeaveReminderKind, { label: string; hint: string }> = {
    upcoming: { label: 'Leave coming up', hint: 'Two weeks before your leave starts' },
    expiring: { label: 'Carried-over days expiring', hint: 'Two months before the date' },
    unused: { label: 'Leave left late in the year', hint: 'From October, what is left and what would be lost' },
    requests: { label: 'Requests waiting', hint: 'Leave still requested a month before it starts' },
    trips: { label: 'Trips without their leave', hint: 'Trips whose leave needs a look' },
};

const wants = (user: User, kind: LeaveReminderKind) => user.leaveReminders?.[kind] !== false;
const dayWord = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} ${n === 1 ? 'day' : 'days'}`;

/**
 * The reminders for a member today, most pressing first. `tripIssues` is how many of their trips need a look (from
 * utils/tripLeave); `name` names an entry for the text.
 */
export const leaveReminders = (
    user: User, leave: LeaveEntry[], entitlements: EntitlementType[], ctx: LeaveContext, today: string,
    { tripIssues = 0, name = (e: LeaveEntry) => e.name || 'Your leave' }: { tripIssues?: number; name?: (e: LeaveEntry) => string } = {},
): LeaveReminder[] => {
    const out: LeaveReminder[] = [];
    const year = yearOfISO(today);
    const mine = leave.filter(e => e.memberId === user.id);

    if (wants(user, 'upcoming')) {
        mine.filter(e => countsAsLeave(e) && e.startDate > today && daysBetween(today, e.startDate) <= 14)
            .sort((a, b) => a.startDate.localeCompare(b.startDate))
            .forEach(e => {
                const n = daysBetween(today, e.startDate);
                out.push({ id: `upcoming:${e.id}`, kind: 'upcoming', tone: 'green', entryId: e.id, text: `${name(e)} starts ${n === 1 ? 'tomorrow' : `in ${n} days`}.` });
            });
    }
    if (wants(user, 'requests')) {
        mine.filter(e => e.state === 'requested' && e.startDate >= today && daysBetween(today, e.startDate) <= 30)
            .forEach(e => out.push({ id: `requested:${e.id}`, kind: 'requests', tone: 'ochre', entryId: e.id, text: `${name(e)} is still waiting for an answer, ${daysBetween(today, e.startDate)} days before it starts.` }));
    }
    const balances = balancesFor({ user, leave, entitlements, today, ctx }, year);
    if (wants(user, 'expiring')) {
        balances.forEach(b => {
            if (b.expiring && daysBetween(today, b.expiring.on) <= 60) {
                out.push({ id: `expiring:${b.entitlement.id}:${year}`, kind: 'expiring', tone: 'rust', text: `${dayWord(b.expiring.days)} of ${b.entitlement.name} carried over will be lost after ${b.expiring.on}. Book them before then.` });
            }
        });
    }
    if (wants(user, 'unused') && Number(today.slice(5, 7)) >= 10) {
        balances.forEach(b => {
            if (b.unlimited || b.remaining === null || b.remaining <= 0) return;
            const policy = (user.policies || []).find(p => p.entitlementId === b.entitlement.id && p.year === year && p.isActive);
            const carries = policy?.carryOver?.enabled ? Math.min(b.remaining, Number(policy.carryOver.maxDays) || 0) : 0;
            const lost = b.remaining - carries;
            out.push({
                id: `unused:${b.entitlement.id}:${year}`, kind: 'unused', tone: lost > 0 ? 'rust' : 'muted',
                text: lost > 0
                    ? `${dayWord(b.remaining)} of ${b.entitlement.name} left this year; ${carries > 0 ? `${dayWord(carries)} carry over, ` : ''}${dayWord(lost)} would be lost.`
                    : `${dayWord(b.remaining)} of ${b.entitlement.name} left this year; all of it carries over.`,
            });
        });
    }
    if (wants(user, 'trips') && tripIssues > 0) {
        out.push({ id: 'trips', kind: 'trips', tone: 'ochre', text: `${tripIssues} ${tripIssues === 1 ? 'trip needs' : 'trips need'} a look at their leave.` });
    }
    const order = { rust: 0, ochre: 1, green: 2, muted: 3 } as const;
    return out.sort((a, b) => order[a.tone] - order[b.tone]);
};
