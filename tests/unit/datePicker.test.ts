import { afterEach, describe, expect, it } from 'vitest';
import { firstDayOfWeekFor, localeForDateFormat, readWeekStart, toDateValue, toIso, WEEK_START_KEY } from '../../utils/datePicker';

describe('date picker helpers', () => {
    afterEach(() => localStorage.removeItem(WEEK_START_KEY));

    it('round-trips stored ISO dates through DateValue', () => {
        const v = toDateValue('2026-09-21');
        expect(v?.year).toBe(2026);
        expect(v?.month).toBe(9);
        expect(v?.day).toBe(21);
        expect(toIso(v)).toBe('2026-09-21');
    });

    it('reads the date part of a longer ISO string', () => {
        expect(toIso(toDateValue('2026-02-03T10:00:00Z'))).toBe('2026-02-03');
    });

    it('treats empty and invalid values as no date', () => {
        expect(toDateValue('')).toBeNull();
        expect(toDateValue(undefined)).toBeNull();
        expect(toDateValue('21/09/2026')).toBeNull();
        expect(toDateValue('2026-02-31')).toBeNull();
        expect(toIso(null)).toBe('');
    });

    it('orders typed segments like the chosen date format', () => {
        expect(localeForDateFormat('MM/DD/YYYY')).toBe('en-US');
        expect(localeForDateFormat('DD/MM/YYYY')).toBe('en-GB');
        expect(localeForDateFormat('YYYY-MM-DD')).toBe('en-CA');
        expect(localeForDateFormat('ddd D MMM, YYYY')).toBe('en-GB');
    });

    it('maps the Calendar week start onto React Aria', () => {
        expect(firstDayOfWeekFor(0)).toBe('sun');
        expect(firstDayOfWeekFor(1)).toBe('mon');
        expect(firstDayOfWeekFor(6)).toBe('sat');
    });

    it('uses the week start saved on the Calendar page', () => {
        localStorage.setItem(WEEK_START_KEY, '6');
        expect(readWeekStart()).toBe(6);
        localStorage.setItem(WEEK_START_KEY, '0');
        expect(readWeekStart()).toBe(0);
    });
});
