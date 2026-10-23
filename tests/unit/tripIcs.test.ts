import { describe, expect, it } from 'vitest';
import type { Trip } from '../../types';
import { tripIcsName, tripToIcs } from '../../utils/tripIcs';
import { flight } from './helpers';

const trip = {
    id: 'trip-1', name: 'Lisbon, Portugal', icon: '🌴', location: 'Lisbon', startDate: '2026-12-01', endDate: '2026-12-08', status: 'Upcoming', description: 'Winter sun',
    participants: [],
    transports: [flight('f1', 'AMS', 'LIS', '2026-12-01', '09:00', '2026-12-01', '11:30', { confirmationCode: 'XYZ789' })],
    accommodations: [{ id: 'a1', name: 'Hotel; Central', address: 'Rua 1, Lisbon', type: 'Hotel', checkInDate: '2026-12-01', checkInTime: '15:00', checkOutDate: '2026-12-08', checkOutTime: '11:00', confirmationCode: 'H123' }],
    activities: [
        { id: 'x1', date: '2026-12-03', time: '19:30', title: 'Fado dinner', location: 'Alfama' },
        { id: 'x2', date: '2026-12-04', time: '', title: 'Free day' },
    ],
} as unknown as Trip;

const out = tripToIcs(trip, new Date('2026-10-23T00:00:00Z')).replace(/\r\n /g, '');

describe('tripToIcs', () => {
    it('writes the trip, its flight, stay and activities as separate events', () => {
        expect(out.match(/BEGIN:VEVENT/g)).toHaveLength(5);
        expect(out).toContain('UID:trip-1@wandergrid.app');
        expect(out).toContain('UID:f1@wandergrid.app');
        expect(out).toContain('UID:a1@wandergrid.app');
        expect(out).toContain('UID:x1@wandergrid.app');
    });
    it('makes the trip and the stay all-day events with an exclusive end', () => {
        expect(out).toContain('DTSTART;VALUE=DATE:20261201');
        expect(out).toContain('DTEND;VALUE=DATE:20261209');
    });
    it('keeps the flight at its real UTC time and the activity at a floating local time', () => {
        expect(out).toMatch(/DTSTART:20261201T\d{6}Z/);
        expect(out).toContain('DTSTART:20261203T193000');
        expect(out).toContain('DTEND:20261203T203000');
    });
    it('treats an activity without a time as an all-day event', () => {
        expect(out).toContain('DTSTART;VALUE=DATE:20261204');
    });
    it('escapes text, folds long lines and ends every line with CRLF', () => {
        expect(out).toContain('Hotel\\; Central');
        tripToIcs(trip).split('\r\n').forEach(l => expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(80));
        expect(tripToIcs(trip).endsWith('END:VCALENDAR\r\n')).toBe(true);
    });
    it('skips records with no usable date instead of breaking the file', () => {
        const bad = { ...trip, startDate: '', activities: [{ id: 'z', date: 'soon', time: '', title: 'x' }], accommodations: [] } as unknown as Trip;
        const text = tripToIcs(bad);
        expect(text).not.toContain('UID:trip-1@');
        expect(text).not.toContain('UID:z@');
    });
});

describe('tripIcsName', () => {
    it('makes a safe file name', () => {
        expect(tripIcsName(trip)).toBe('lisbon-portugal.ics');
        expect(tripIcsName({ ...trip, name: '' } as Trip)).toBe('trip.ics');
    });
});
