import { parseDate, type CalendarDate, type DateValue } from '@internationalized/date';
import type { WeekStart } from './calendarModel';

/**
 * Helpers for the date pickers (components/ui/date-picker). Stored dates stay ISO `YYYY-MM-DD` strings; the
 * pickers work in React Aria `DateValue`s, shown in the date format chosen in Settings and with the week
 * starting on the day chosen on the Calendar.
 */

/** An ISO `YYYY-MM-DD` string (or the date part of a longer ISO string) as a CalendarDate; null when empty or invalid. */
export const toDateValue = (iso: string | null | undefined): CalendarDate | null => {
    const day = (iso || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    try {
        return parseDate(day);
    } catch {
        return null;
    }
};

/** A DateValue back to the stored ISO `YYYY-MM-DD` string; '' for no date. */
export const toIso = (value: DateValue | null | undefined): string => (value ? value.toString().slice(0, 10) : '');

/**
 * The locale that orders the picker's typed date segments like the chosen format: month first for MM/DD/YYYY,
 * year first for YYYY-MM-DD, day first for DD/MM/YYYY and the default "Mon 21 Sep, 2026". All are English, so the
 * month names in the calendar heading stay the same.
 */
export const localeForDateFormat = (format: string): string => {
    if (format === 'MM/DD/YYYY') return 'en-US';
    if (format === 'YYYY-MM-DD') return 'en-CA';
    return 'en-GB';
};

export type FirstDayOfWeek = 'sun' | 'mon' | 'sat';

/** The Calendar page's week start (0 Sunday, 1 Monday, 6 Saturday) as React Aria's `firstDayOfWeek`. */
export const firstDayOfWeekFor = (weekStart: WeekStart): FirstDayOfWeek => (weekStart === 0 ? 'sun' : weekStart === 6 ? 'sat' : 'mon');

/** Where the Calendar page keeps the week-start choice (Calendar > Options). */
export const WEEK_START_KEY = 'wandergrid_calendar_new_week_start';

/** The week start chosen on the Calendar page, or the browser locale's, or Monday. */
export const readWeekStart = (): WeekStart => {
    try {
        const stored = localStorage.getItem(WEEK_START_KEY);
        const v = Number(stored);
        if (stored !== null && (v === 0 || v === 1 || v === 6)) return v;
        const first = (new Intl.Locale(navigator.language) as unknown as { weekInfo?: { firstDay?: number } }).weekInfo?.firstDay;
        if (first === 7) return 0;
        if (first === 6) return 6;
    } catch { /* storage or locale unavailable */ }
    return 1;
};
