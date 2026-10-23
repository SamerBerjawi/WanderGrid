import { describe, expect, it } from 'vitest';
import type { HolidayDay } from '../../utils/calendarModel';
import { daysOffRuns, suggestBreaks } from '../../utils/leaveOptimizer';

const WORK = [1, 2, 3, 4, 5];
const holiday = (date: string, name: string, counted = true): HolidayDay => ({ id: name, name, date, observed: date, countryCode: 'XX', isIncluded: counted, countryName: 'Testland', counted });
// 2026-04-02 is a Thursday, 2026-06-02 a Tuesday, 2026-05-27 a Wednesday, 2026-05-04 a Monday.
const input = (holidays: HolidayDay[], extra = {}) => ({ from: '2026-01-01', to: '2026-12-31', workingDays: WORK, holidays, ...extra });

describe('daysOffRuns', () => {
    it('joins a Thursday holiday and the weekend after it only through the Friday', () => {
        const runs = daysOffRuns('2026-03-30', '2026-04-12', WORK, [holiday('2026-04-02', 'Thursday')]);
        expect(runs.map(r => [r.start, r.end])).toEqual([['2026-04-02', '2026-04-02'], ['2026-04-04', '2026-04-05'], ['2026-04-11', '2026-04-12']]);
        expect(runs[0].onWorkday).toBe(true);
    });
});

describe('suggestBreaks', () => {
    it('suggests the Friday after a Thursday holiday: 1 leave day for 4 days off', () => {
        const s = suggestBreaks(input([holiday('2026-04-02', 'Founders Day')]));
        const best = s.find(x => x.kind === 'value')!;
        expect(best.leaveDates).toEqual(['2026-04-03']);
        expect(best.start).toBe('2026-04-02');
        expect(best.end).toBe('2026-04-05');
        expect(best.daysOff).toBe(4);
        expect(best.ratio).toBe(4);
        expect(best.holidays).toEqual(['Founders Day']);
    });
    it('suggests the Monday before a Tuesday holiday', () => {
        const best = suggestBreaks(input([holiday('2026-06-02', 'Republic Day')])).find(x => x.kind === 'value')!;
        expect(best.leaveDates).toEqual(['2026-06-01']);
        expect(best.daysOff).toBe(4);
    });
    it('offers the longer break around a Wednesday holiday too', () => {
        const s = suggestBreaks(input([holiday('2026-05-27', 'Midweek')]));
        const value = s.find(x => x.kind === 'value')!;
        const longest = s.find(x => x.kind === 'longest')!;
        expect(value.leaveDates.length).toBe(2);
        expect(value.daysOff).toBe(5);
        expect(longest.daysOff).toBeGreaterThan(value.daysOff);
        expect(longest.leaveDates.length).toBeLessThanOrEqual(5);
    });
    it('calls a Monday holiday a free long weekend', () => {
        const free = suggestBreaks(input([holiday('2026-05-04', 'Labour')])).find(x => x.kind === 'free')!;
        expect(free.leaveDates).toEqual([]);
        expect(free.daysOff).toBe(3);
        expect(free.start).toBe('2026-05-02');
    });
    it('ignores a holiday that is switched off and one inside the weekend', () => {
        expect(suggestBreaks(input([holiday('2026-04-02', 'Off', false)]))).toEqual([]);
        expect(suggestBreaks(input([holiday('2026-04-04', 'On a Saturday')]))).toEqual([]);
    });
    it('does not ask again for a day already booked as leave', () => {
        const s = suggestBreaks(input([holiday('2026-04-02', 'Founders Day')], { booked: new Set(['2026-04-03']) }));
        const best = s.find(x => x.kind === 'value')!;
        expect(best.leaveDates).toEqual([]);
        expect(best.daysOff).toBe(4);
    });
    it('respects the working week and the leave limit', () => {
        // Sunday to Thursday working week: the weekend is Friday and Saturday.
        const s = suggestBreaks({ from: '2026-01-01', to: '2026-12-31', workingDays: [0, 1, 2, 3, 4], holidays: [holiday('2026-04-02', 'Thursday')] });
        const free = s.find(x => x.kind === 'free')!;
        expect([free.start, free.end, free.daysOff]).toEqual(['2026-04-02', '2026-04-04', 3]);
        expect(suggestBreaks(input([holiday('2026-05-27', 'Midweek')], { maxLeave: 1 })).every(x => x.leaveDates.length <= 1)).toBe(true);
    });
    it('keeps to the requested window and sorts by date', () => {
        const s = suggestBreaks({ ...input([holiday('2026-04-02', 'A'), holiday('2026-06-02', 'B'), holiday('2027-01-07', 'Next year')]), from: '2026-05-01', to: '2026-12-31' });
        expect(s.every(x => x.end >= '2026-05-01' && x.start <= '2026-12-31')).toBe(true);
        expect(s.map(x => x.start)).toEqual([...s.map(x => x.start)].sort());
        expect(s.some(x => x.holidays.includes('B'))).toBe(true);
        expect(s.some(x => x.holidays.includes('A'))).toBe(false);
    });
});
