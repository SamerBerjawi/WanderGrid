import { describe, expect, it } from 'vitest';
import { build, cabinOf, detect, parseMoney, shape, splitStamp } from '../../components/new/journeys/JourneyTransfer';

describe('column detection', () => {
    it('matches common header names and does not use a column twice', () => {
        const m = detect(['Trip Day', 'Leaving', 'Arriving', 'Carrier', 'Ref', 'Fare', 'Seat']);
        expect(m).toMatchObject({ from: 'Leaving', to: 'Arriving', date: 'Trip Day', airline: 'Carrier', pnr: 'Ref', cost: 'Fare', seat: 'Seat' });
        expect(new Set(Object.values(m)).size).toBe(Object.values(m).length);
    });
    it('recognises the combined date-time columns of a flight diary export', () => {
        const m = detect(['Date', 'From', 'To', 'Gate Departure (Scheduled)', 'Gate Arrival (Scheduled)', 'Airline', 'Flight']);
        expect(m.depDateTime).toBe('Gate Departure (Scheduled)');
        expect(m.arrDateTime).toBe('Gate Arrival (Scheduled)');
        expect(m.flight).toBe('Flight');
    });
});

describe('dates and times', () => {
    it('reads ISO, Excel serial and slash dates', () => {
        expect(splitStamp('2026-03-05T14:30', false)).toEqual({ date: '2026-03-05', time: '14:30' });
        expect(splitStamp(46086, false).date).toBe('2026-03-05');
        expect(splitStamp('05/03/2026', true).date).toBe('2026-03-05');
        expect(splitStamp('05/03/2026', false).date).toBe('2026-05-03');
    });
    it('knows which way round a slash date must be when one part is over 12', () => {
        expect(splitStamp('20/03/2026', false).date).toBe('2026-03-20');
        expect(splitStamp('03/20/2026', true).date).toBe('2026-03-20');
    });
    it('normalises the cabin class', () => {
        expect(cabinOf('J')).toBe('Business');
        expect(cabinOf('Premium Economy')).toBe('Premium Economy');
        expect(cabinOf('first')).toBe('First');
        expect(cabinOf('')).toBeUndefined();
    });
});

describe('parseMoney', () => {
    it('reads amounts written either way round', () => {
        expect(parseMoney('89')).toBe(89);
        expect(parseMoney('€89,50')).toBe(89.5);
        expect(parseMoney('1,234.50')).toBe(1234.5);
        expect(parseMoney('1.234,50')).toBe(1234.5);
        expect(parseMoney('1,234')).toBe(1234);
        expect(Number.isNaN(parseMoney(''))).toBe(true);
    });
});

describe('building flights from rows', () => {
    const raw = [['Trip Day', 'Leaving', 'Arriving', 'Carrier', 'Ref', 'Fare'], ['05/03/2026', 'MAD', 'LIS', 'TAP', 'tp1021', '€89,50'], ['', 'MAD', 'FCO', 'Iberia', '', ''], ['20/03/2026', '', 'FCO', 'Iberia', '', '']];
    it('shapes rows with the first row as names, and without', () => {
        const { headers, rows } = shape(raw, true);
        expect(headers).toEqual(raw[0]);
        expect(rows).toHaveLength(3);
        expect(shape(raw, false).headers[0]).toBe('Column A');
    });
    it('leaves out rows with no places or no date and cleans values', () => {
        const { headers, rows } = shape(raw, true);
        const flights = build(rows, detect(headers), true);
        expect(flights).toHaveLength(1);
        expect(flights[0]).toMatchObject({ origin: 'MAD', destination: 'LIS', departureDate: '2026-03-05', provider: 'TAP', confirmationCode: 'TP1021', mode: 'Flight' });
        expect(flights[0].cost).toBe(89.5);
    });
});
