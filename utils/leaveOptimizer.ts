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
