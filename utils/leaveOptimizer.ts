import { addDaysISO, daysBetween, isWeekend, type HolidayDay } from './calendarModel';

/**
 * The leave optimizer: where a few days of leave join public holidays and weekends into a longer break.
 *
 * It works on days off (a weekend day by the workspace's working days, or a public holiday that is switched
 * on), groups them into runs, and looks at each run that holds a public holiday on a working day. That run
 * on its own is a free long weekend when it is three days or more. Joining it to the run before and/or
 * after it costs the working days in between: those are the leave to take. Each holiday keeps its best
 * value (most days off per leave day) and its longest break within the limit, so the list stays short.
 */

export interface BreakSuggestion {
    id: string;
    /** First and last day of the whole break. */
    start: string;
    end: string;
    /** The working days to take as leave, in order (empty for a free long weekend). */
    leaveDates: string[];
    /** Days off in a row, leave included. */
    daysOff: number;
    /** Public holidays inside the break. */
    holidays: string[];
    /** Days off per leave day (infinite when no leave is needed). */
    ratio: number;
    kind: 'free' | 'value' | 'longest';
}

export interface OptimizerInput {
    from: string;
    to: string;
    workingDays: number[];
    /** The holidays that are a day off for the member (counted, observed). */
    holidays: HolidayDay[];
    /** Most leave days one break may need. */
    maxLeave?: number;
    /** Working days already booked as leave: they are not asked for again. */
    booked?: Set<string>;
}

interface Run { start: string; end: string; len: number; holidays: string[]; onWorkday: boolean }

const eachDay = (from: string, to: string): string[] => {
    const out: string[] = [];
    for (let d = from; d <= to; d = addDaysISO(d, 1)) out.push(d);
    return out;
};

/** Maximal runs of days off in [from, to]. `onWorkday`: a holiday that falls on a normal working day. */
export const daysOffRuns = (from: string, to: string, workingDays: number[], holidays: HolidayDay[]): Run[] => {
    const byDay = new Map<string, string[]>();
    holidays.filter(h => h.counted).forEach(h => byDay.set(h.observed, [...(byDay.get(h.observed) ?? []), h.name]));
    const runs: Run[] = [];
    let cur: Run | null = null;
    for (const iso of eachDay(from, to)) {
        const names = byDay.get(iso) ?? [];
        const off = isWeekend(iso, workingDays) || names.length > 0;
        if (off) {
            const workday = names.length > 0 && !isWeekend(iso, workingDays);
            if (cur) { cur.end = iso; cur.len++; cur.holidays.push(...names); cur.onWorkday = cur.onWorkday || workday; }
            else cur = { start: iso, end: iso, len: 1, holidays: [...names], onWorkday: workday };
        } else if (cur) { runs.push(cur); cur = null; }
    }
    if (cur) runs.push(cur);
    return runs;
};

const gapDays = (a: Run, b: Run): string[] => eachDay(addDaysISO(a.end, 1), addDaysISO(b.start, -1));

const KIND_ORDER: Record<BreakSuggestion['kind'], number> = { value: 0, longest: 1, free: 2 };

export const suggestBreaks = ({ from, to, workingDays, holidays, maxLeave = 5, booked = new Set() }: OptimizerInput): BreakSuggestion[] => {
    // Look a little beyond both ends so a break that starts before `from` or ends after `to` is measured whole.
    const runs = daysOffRuns(addDaysISO(from, -10), addDaysISO(to, 10), workingDays, holidays);
    const out: BreakSuggestion[] = [];

    runs.forEach((run, i) => {
        if (!run.onWorkday || run.end < from || run.start > to) return;
        const candidates: { start: string; end: string; leave: string[]; runs: Run[] }[] = [];
        const left = runs[i - 1];
        const right = runs[i + 1];
        const add = (a: Run, b: Run, parts: Run[], gaps: string[][]) => {
            const leave = gaps.flat();
            if (leave.length === 0 || leave.length > maxLeave) return;
            candidates.push({ start: a.start, end: b.end, leave, runs: parts });
        };
        if (left) add(left, run, [left, run], [gapDays(left, run)]);
        if (right) add(run, right, [run, right], [gapDays(run, right)]);
        if (left && right) add(left, right, [left, run, right], [gapDays(left, run), gapDays(run, right)]);

        const measured = candidates.map(c => {
            const days = daysBetween(c.start, c.end) + 1;
            const leave = c.leave.filter(d => !booked.has(d));
            return { ...c, days, leaveDates: leave, ratio: leave.length === 0 ? Infinity : days / leave.length, names: [...new Set(c.runs.flatMap(r => r.holidays))] };
        }).filter(c => c.days >= 4);

        const mk = (c: (typeof measured)[number], kind: BreakSuggestion['kind']): BreakSuggestion => ({
            id: `${kind}:${c.start}:${c.end}`, start: c.start, end: c.end, leaveDates: c.leaveDates, daysOff: c.days, holidays: c.names, ratio: c.ratio, kind,
        });

        if (run.len >= 3 && run.end >= from) out.push({ id: `free:${run.start}:${run.end}`, start: run.start, end: run.end, leaveDates: [], daysOff: run.len, holidays: [...new Set(run.holidays)], ratio: Infinity, kind: 'free' });

        const best = [...measured].sort((a, b) => b.ratio - a.ratio || b.days - a.days)[0];
        const longest = [...measured].filter(c => c.ratio >= 1.6).sort((a, b) => b.days - a.days || b.ratio - a.ratio)[0];
        if (best) out.push(mk(best, 'value'));
        if (longest && longest !== best && longest.days > (best?.days ?? 0)) out.push(mk(longest, 'longest'));
    });

    const seen = new Set<string>();
    return out
        .filter(s => s.end >= from && s.start <= to)
        .filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; })
        .sort((a, b) => a.start.localeCompare(b.start) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.daysOff - a.daysOff);
};

/* ------------------------------- the year planner ------------------------------- */

/** One break in a year plan. */
export interface PlannedBreak {
    id: string;
    start: string;
    end: string;
    /** The working days to take as leave, in order. */
    leaveDates: string[];
    /** Days off in a row, leave included. */
    daysOff: number;
    /** Public holidays (and company days) inside the break. */
    holidays: string[];
    /** Days off per leave day. */
    efficiency: number;
    /** Most of the break falls in a preferred month. */
    preferred: boolean;
}

export interface YearPlanInput {
    from: string;
    to: string;
    workingDays: number[];
    /** The member's holidays (counted ones are days off). */
    holidays: HolidayDay[];
    /** Other days off (company days) and working weekend days. */
    offDays?: Set<string>;
    workDays?: Set<string>;
    /** Days already booked as leave: never planned again, and a break may run into them. */
    booked?: Set<string>;
    /** Leave days to spend. */
    budget: number;
    /** Months (1–12) to favour. */
    months?: number[];
    /** Days a break may not touch (other plans, busy weeks). */
    avoid?: { from: string; to: string }[];
    /** Shortest and longest break, in days off in a row. */
    minDays?: number;
    maxDays?: number;
    /** Most leave days one break may take. */
    maxLeave?: number;
}

export interface YearPlan {
    breaks: PlannedBreak[];
    leaveUsed: number;
    daysOff: number;
    /** Days off per leave day over the whole plan (0 when nothing is planned). */
    efficiency: number;
    /** Long weekends that need no leave at all (holiday on a Monday or Friday, and the like). */
    free: PlannedBreak[];
}

/**
 * The best breaks for a leave budget over a period. Every stretch of days bounded by working days on both sides is a
 * candidate; its leave is the working days inside it that are not holidays or already booked. Candidates are ranked
 * by days off per leave day (preferred months count a quarter more, then longer first), and taken greedily while the
 * budget lasts, never overlapping or touching another chosen break. Pure and deterministic.
 */
export const planYear = (input: YearPlanInput): YearPlan => {
    const { from, to, workingDays, holidays, budget } = input;
    const minDays = Math.max(3, input.minDays ?? 4);
    const maxDays = Math.max(minDays, Math.min(input.maxDays ?? 16, 31));
    const maxLeave = Math.max(1, input.maxLeave ?? 10);
    const booked = input.booked ?? new Set<string>();
    const months = new Set(input.months ?? []);
    const names = new Map<string, string[]>();
    holidays.filter(h => h.counted).forEach(h => names.set(h.observed, [...(names.get(h.observed) ?? []), h.name]));
    (input.offDays ?? new Set()).forEach(d => { if (!names.has(d)) names.set(d, ['Company day off']); });
    const isOff = (iso: string) => (isWeekend(iso, workingDays) && !input.workDays?.has(iso)) || names.has(iso);
    const isRest = (iso: string) => isOff(iso) || booked.has(iso);
    const avoided = (s: string, e: string) => (input.avoid ?? []).some(r => !(e < r.from || s > r.to));

    const days = eachDay(addDaysISO(from, -1), addDaysISO(to, 1));
    const candidates: PlannedBreak[] = [];
    for (let i = 1; i < days.length - 1; i++) {
        const s = days[i];
        // A break starts after a working day (so it is not a slice of a longer rest that started earlier).
        if (isRest(days[i - 1])) continue;
        for (let len = minDays; len <= maxDays && i + len - 1 < days.length - 1; len++) {
            const e = days[i + len - 1];
            const after = days[i + len];
            if (isRest(after)) continue; // it should end before a working day
            const inside = days.slice(i, i + len);
            const leaveDates = inside.filter(d => !isRest(d));
            if (leaveDates.length === 0 || leaveDates.length > maxLeave) continue;
            if (avoided(s, e)) continue;
            const inMonths = months.size > 0 && inside.filter(d => months.has(Number(d.slice(5, 7)))).length * 2 >= inside.length;
            candidates.push({
                id: `${s}:${e}`, start: s, end: e, leaveDates, daysOff: len,
                holidays: [...new Set(inside.flatMap(d => names.get(d) ?? []))],
                efficiency: len / leaveDates.length, preferred: inMonths,
            });
        }
    }
    // Real breaks only: a stretch that is mostly working days is not worth suggesting.
    const worth = candidates.filter(c => c.efficiency >= 1.4);
    const score = (c: PlannedBreak) => c.efficiency * (c.preferred ? 1.25 : 1);
    worth.sort((a, b) => score(b) - score(a) || b.daysOff - a.daysOff || a.start.localeCompare(b.start));

    const chosen: PlannedBreak[] = [];
    let left = Math.max(0, budget);
    for (const c of worth) {
        if (c.leaveDates.length > left) continue;
        // Not overlapping or touching another break (a working day between them).
        if (chosen.some(x => !(addDaysISO(c.end, 1) < x.start || addDaysISO(x.end, 1) < c.start))) continue;
        chosen.push(c);
        left -= c.leaveDates.length;
        if (left <= 0) break;
    }
    chosen.sort((a, b) => a.start.localeCompare(b.start));
    const leaveUsed = chosen.reduce((n, c) => n + c.leaveDates.length, 0);
    const daysOff = chosen.reduce((n, c) => n + c.daysOff, 0);

    // Free long weekends: maximal rests of three days or more that hold a holiday, within the period.
    const free = daysOffRuns(from, to, workingDays, holidays)
        .filter(r => r.len >= 3 && r.holidays.length > 0)
        .map(r => ({ id: `free:${r.start}`, start: r.start, end: r.end, leaveDates: [], daysOff: r.len, holidays: [...new Set(r.holidays)], efficiency: Infinity, preferred: months.has(Number(r.start.slice(5, 7))) }));

    return { breaks: chosen, leaveUsed, daysOff, efficiency: leaveUsed ? daysOff / leaveUsed : 0, free };
};

/** "Take 4 days off to enjoy 9 days in a row." */
export const breakSentence = (b: Pick<PlannedBreak, 'leaveDates' | 'daysOff'>): string =>
    b.leaveDates.length === 0
        ? `${b.daysOff} days off in a row, no leave needed`
        : `Take ${b.leaveDates.length} ${b.leaveDates.length === 1 ? 'day' : 'days'} off to enjoy ${b.daysOff} days in a row`;
