import { describe, expect, it } from 'vitest';
import type { SavedConfig, User } from '../../types';
import { answerFromNager, buildConfig, calendarKey, configId, followedKeys, keyOfConfigId, missingYears, withCustomHoliday, withoutHoliday } from '../../utils/holidayCalendar';
import { configsFor, countedDays, holidayDays, isRestDay, leaveContext } from '../../utils/calendarModel';

/** Leave Phase 1c: calendars by country or region, every year; days added by hand; company days. */

const WORK = [1, 2, 3, 4, 5];
const cfg = (id: string, year: number, extra: Partial<SavedConfig> = {}): SavedConfig => ({ id: `${id}-${year}`, countryCode: id.slice(0, 2), countryName: 'X', year, updatedAt: '', holidays: [], ...extra });
const user = (over: Partial<User> = {}): User => ({ id: 'u', name: 'U', role: 'Admin', leaveBalance: 0, takenLeave: 0, allowance: 0, ...over });

describe('calendars followed every year', () => {
    it('keys calendars by country or region', () => {
        expect(calendarKey({ countryCode: 'be' })).toBe('BE');
        expect(calendarKey({ countryCode: 'DE', region: 'de-by' })).toBe('DE-BY');
        expect(configId('DE', 2026, 'DE-BY')).toBe('DE-BY-2026');
        expect(keyOfConfigId('DE-BY-2026')).toBe('DE-BY');
        expect(keyOfConfigId('BE-2026')).toBe('BE');
    });

    it('reads the old one-year links as calendars followed every year', () => {
        expect(followedKeys(user({ holidayConfigIds: ['BE-2025', 'BE-2026', 'DE-BY-2026'] }))).toEqual(['BE', 'DE-BY']);
        expect(followedKeys(user({ holidayCalendars: ['fr'], holidayConfigIds: ['BE-2026'] }))).toEqual(['FR']);
    });

    it('shows a followed calendar in every year saved', () => {
        const configs = [cfg('BE', 2025), cfg('BE', 2026), cfg('FR', 2026, { countryCode: 'FR' }), cfg('DE-BY', 2026, { countryCode: 'DE', region: 'DE-BY' })];
        expect(configsFor(configs, [user({ holidayConfigIds: ['BE-2025'] })]).map(c => c.id)).toEqual(['BE-2025', 'BE-2026']);
        expect(configsFor(configs, [user({ holidayCalendars: ['DE-BY'] })]).map(c => c.id)).toEqual(['DE-BY-2026']);
        expect(configsFor(configs, [user()])).toHaveLength(4);
    });

    it('lists the years still to fetch for each calendar', () => {
        const configs = [cfg('BE', 2026, { countryName: 'Belgium' }), cfg('DE-BY', 2027, { countryCode: 'DE', region: 'DE-BY', countryName: 'Germany', regionName: 'Bavaria' })];
        expect(missingYears(['BE', 'DE-BY', 'NL'], configs, [2026, 2027])).toEqual([
            { key: 'BE', countryCode: 'BE', region: undefined, countryName: 'Belgium', regionName: undefined, year: 2027 },
            { key: 'DE-BY', countryCode: 'DE', region: 'DE-BY', countryName: 'Germany', regionName: 'Bavaria', year: 2026 },
        ]);
    });
});

describe('regions and days added by hand', () => {
    const rows = [
        { date: '2026-01-01', name: "New Year's Day", global: true, types: ['Public'] },
        { date: '2026-01-06', name: 'Epiphany', global: false, counties: ['DE-BY'], types: ['Public'] },
        { date: '2026-10-31', name: 'Reformation Day', global: false, counties: ['DE-SN'], types: ['Public'] },
    ];

    it('adds the region\'s own holidays in local mode too', () => {
        const a = answerFromNager(rows, 2026, 'DE', 'DE-BY')!;
        expect(a.region).toBe('DE-BY');
        expect(a.holidays.map(h => [h.name, Boolean(h.regional)])).toEqual([["New Year's Day", false], ['Epiphany', true]]);
        expect(a.regionalSkipped).toBe(1);
        expect(answerFromNager(rows, 2026, 'DE')!.holidays).toHaveLength(1);
    });

    it('builds a regional calendar and keeps switches and hand-added days on refresh', () => {
        const first = buildConfig(answerFromNager(rows, 2026, 'DE', 'DE-BY')!, 'Germany', new Date(0), 'Bavaria');
        expect(first).toMatchObject({ id: 'DE-BY-2026', region: 'DE-BY', regionName: 'Bavaria' });
        const switched = { ...first, holidays: first.holidays.map(h => (h.name === 'Epiphany' ? { ...h, isIncluded: false } : h)) };
        const withDay = withCustomHoliday(switched, '2026-07-14', 'Company day');
        expect(withDay.holidays.find(h => h.custom)).toMatchObject({ date: '2026-07-14', name: 'Company day', isIncluded: true });
        const refreshed = buildConfig(answerFromNager(rows, 2026, 'DE', 'DE-BY')!, 'Germany', new Date(0), 'Bavaria', withDay);
        expect(refreshed.holidays.map(h => [h.name, h.isIncluded, Boolean(h.custom)])).toEqual([
            ["New Year's Day", true, false], ['Epiphany', false, false], ['Company day', true, true],
        ]);
        const id = withDay.holidays.find(h => h.custom)!.id;
        expect(withoutHoliday(withDay, id).holidays).toHaveLength(2);
    });
});

describe('company days', () => {
    it('makes a company day off cost no leave, and a working Saturday a working day', () => {
        const ctx = leaveContext(WORK, holidayDays([], 'none', WORK), [
            { date: '2026-10-07', isWorkingDay: false },
            { date: '2026-10-10', isWorkingDay: true },
        ]);
        // Mon 5 – Sun 11 Oct: 5 working days, less the company day, plus the working Saturday.
        expect(countedDays({ startDate: '2026-10-05', endDate: '2026-10-11' }, ctx)).toBe(5);
        expect(isRestDay('2026-10-10', ctx)).toBe(false);
        expect(isRestDay('2026-10-11', ctx)).toBe(true);
        expect(ctx.offDays.has('2026-10-07')).toBe(true);
    });
});
