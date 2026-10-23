import { describe, expect, it } from 'vitest';
import { answerFromNager, buildConfig, configId, matchCountries, offeredYears } from '../../utils/holidayCalendar';

describe('buildConfig', () => {
    const cfg = buildConfig({ countryCode: 'be', year: 2026, source: 'nager', holidays: [{ date: '2026-01-01', name: "New Year's Day" }, { date: '2026-05-01', name: 'Labour Day' }] }, 'Belgium', new Date('2026-10-23T00:00:00Z'));
    it('uses the <country>-<year> id and starts every holiday as a day off', () => {
        expect(cfg.id).toBe('BE-2026');
        expect(configId('nl', 2027)).toBe('NL-2027');
        expect(cfg.holidays.every(h => h.isIncluded && h.configId === 'BE-2026' && h.countryCode === 'BE')).toBe(true);
        expect(new Set(cfg.holidays.map(h => h.id)).size).toBe(2);
    });
});

describe('matchCountries', () => {
    const list = [{ code: 'BE', name: 'Belgium' }, { code: 'BR', name: 'Brazil' }, { code: 'GB', name: 'United Kingdom' }, { code: 'US', name: 'United States' }, { code: 'KR', name: 'South Korea' }];
    it('ranks exact code, prefix, then word starts', () => {
        expect(matchCountries(list, 'be')[0].code).toBe('BE');
        expect(matchCountries(list, 'uni').map(c => c.code)).toEqual(['GB', 'US']);
        expect(matchCountries(list, 'korea').map(c => c.code)).toEqual(['KR']);
    });
    it('shows the first few when nothing is typed and nothing when nothing matches', () => {
        expect(matchCountries(list, '', 2)).toHaveLength(2);
        expect(matchCountries(list, 'zzz')).toEqual([]);
    });
});

describe('answerFromNager', () => {
    it('keeps nationwide public holidays of the year and sorts them', () => {
        const a = answerFromNager([
            { date: '2026-12-25', name: 'Christmas Day', global: true, types: ['Public'] },
            { date: '2026-01-01', name: 'New Year', global: true, types: ['Public'] },
            { date: '2026-03-04', name: 'Regional', global: false, counties: ['X'], types: ['Public'] },
            { date: '2025-12-31', name: 'Last year', global: true, types: ['Public'] },
        ], 2026, 'nl');
        expect(a?.holidays.map(h => h.date)).toEqual(['2026-01-01', '2026-12-25']);
        expect(a?.regionalSkipped).toBe(1);
        expect(a?.countryCode).toBe('NL');
    });
    it('answers null for nothing usable', () => {
        expect(answerFromNager({}, 2026, 'NL')).toBeNull();
        expect(answerFromNager([], 2026, 'NL')).toBeNull();
    });
});

describe('offeredYears', () => {
    it('is last year to two years ahead', () => expect(offeredYears(2026)).toEqual([2025, 2026, 2027, 2028]));
});
