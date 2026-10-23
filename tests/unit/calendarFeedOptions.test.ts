import { describe, expect, it } from 'vitest';
import type { Trip } from '../../types';
import { calendarService } from '../../services/calendarExport';
import { DEFAULT_FEED_OPTIONS, calendarFeedUrl, feedOptionsToQuery, parseFeedOptions, tripsToIcs } from '../../utils/icsContext';
import { flight } from './helpers';

const trip = {
    id: 't1', name: 'Lisbon', location: 'Lisbon, Portugal', status: 'Upcoming', startDate: '2026-11-14', endDate: '2026-11-20', participants: [], version: 3,
    transports: [flight('f1', 'AMS', 'LIS', '2026-11-14', '07:30', '2026-11-14', '09:15', { confirmationCode: 'ZX81QP' })],
    accommodations: [{ id: 'a1', name: 'Hotel', address: 'Rua 1', type: 'Hotel', checkInDate: '2026-11-14', checkInTime: '15:00', checkOutDate: '2026-11-17', checkOutTime: '11:00' }],
    activities: [{ id: 'x1', date: '2026-11-15', time: '20:30', title: 'Fado', location: 'Alfama' }],
} as unknown as Trip;

const uids = (ics: string) => [...ics.matchAll(/^UID:(.*)$/gm)].map(m => m[1]);

describe('feed options and the feed link', () => {
    it('leaves defaults out of the link and reads it back', () => {
        expect(calendarFeedUrl('https://wg.test', 'abc')).toBe('https://wg.test/api/calendar/abc/feed.ics');
        const url = calendarFeedUrl('https://wg.test', 'abc', { ...DEFAULT_FEED_OPTIONS, activities: true, reminders: true, stay: 'span' });
        expect(url).toBe('https://wg.test/api/calendar/abc/feed.ics?activities=1&reminders=1&stay=span');
        expect(parseFeedOptions(url.split('?')[1])).toMatchObject({ activities: true, reminders: true, stay: 'span', flights: true });
        expect(feedOptionsToQuery(parseFeedOptions('flights=0'))).toBe('flights=0');
    });
});

describe('downloaded calendar files use the feed emitter and its options', () => {
    it('default: trip span, flight, check-in and check-out', () => {
        expect(uids(calendarService.generateIcsContent([trip]))).toEqual(['t1@wandergrid.app', 'f1@wandergrid.app', 'a1-in@wandergrid.app', 'a1-out@wandergrid.app']);
    });
    it('follows the chosen options', () => {
        expect(uids(tripsToIcs([trip], { trips: false, flights: false, stays: false, activities: true }))).toEqual(['x1@wandergrid.app']);
    });
    it('writes the flight in UTC using the airports\' zones (AMS is UTC+1 in November)', () => {
        const ics = tripsToIcs([trip], { trips: false, stays: false });
        expect(ics).toContain('DTSTART:20261114T063000Z');
        expect(ics).toContain('SEQUENCE:3');
    });
});
