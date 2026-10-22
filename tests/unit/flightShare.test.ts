import { describe, expect, it } from 'vitest';
import { flightsToIcs, flightsToText } from '../../utils/flightShare';
import { flight, record, tripOf } from './helpers';

const f = flight('1', 'AMS', 'JFK', '2026-11-01', '10:00', '2026-11-01', '12:30', { confirmationCode: 'ABC123', seatNumber: '12A', provider: 'KLM, Royal; Dutch' });

describe('flightsToIcs', () => {
    const raw = flightsToIcs([record(f, tripOf('t', 'New York'))], new Date('2026-10-22T00:00:00Z'));
    const out = raw.replace(/\r\n /g, '');
    it('wraps one event per flight in a calendar with CRLF lines', () => {
        expect(out.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
        expect(out.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
        expect(out.match(/BEGIN:VEVENT/g)).toHaveLength(1);
        expect(out).toContain('UID:1@wandergrid.app');
    });
    it('uses UTC times, a reminder and the booking details', () => {
        expect(out).toMatch(/DTSTART:20261101T\d{6}Z/);
        expect(out).toContain('TRIGGER:-PT3H');
        expect(out).toContain('Confirmation: ABC123');
        expect(out).toContain('Trip: New York');
    });
    it('escapes commas and semicolons and keeps lines within 75 characters', () => {
        expect(out).toContain('KLM\\, Royal\\; Dutch');
        raw.split('\r\n').forEach(l => expect(l.length).toBeLessThanOrEqual(75));
    });
});

describe('flightsToText', () => {
    it('lists flights in departure order with their details', () => {
        const b = flight('2', 'JFK', 'AMS', '2026-11-10', '18:00', '2026-11-11', '07:00');
        const text = flightsToText([record(b), record(f)]);
        expect(text.indexOf('AMS')).toBeLessThan(text.indexOf('2026-11-10'));
        expect(text).toContain('ABC123');
    });
});
