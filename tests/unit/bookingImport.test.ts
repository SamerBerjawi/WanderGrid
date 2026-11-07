import { describe, expect, it } from 'vitest';
import type { Transport, Trip } from '../../types';
import type { ParsedBooking } from '../../utils/bookingParser';
import { addToTrip, bookingSpan, describeBookings, destinationOf, matchTrip, newTripFrom, planItems } from '../../utils/bookingImport';

const flight = (origin: string, destination: string, date: string, identifier: string, extra: Partial<Transport> = {}): ParsedBooking => ({
    kind: 'transport', source: 'schema',
    transport: { mode: 'Flight', provider: 'TAP', identifier, confirmationCode: 'K7Q2ZX', origin, destination, departureDate: date, departureTime: '10:15', arrivalDate: date, arrivalTime: '12:05', ...extra },
});
const stay: ParsedBooking = {
    kind: 'stay', source: 'schema',
    stay: { name: 'Memmo Alfama', address: 'Travessa das Merceeiras 27, 1100-348 Lisboa, PT', type: 'Hotel', checkInDate: '2026-03-03', checkInTime: '15:00', checkOutDate: '2026-03-07', checkOutTime: '11:00', confirmationCode: 'H1' },
};
const dinner: ParsedBooking = { kind: 'activity', source: 'schema', activity: { title: 'Taberna', date: '2026-03-04', time: '20:30', type: 'Dining' } };
const trip = (over: Partial<Trip>): Trip => ({ id: 't1', name: 'Trip', location: '', startDate: '2026-03-02', endDate: '2026-03-06', status: 'Upcoming', participants: ['u1'], ...over });

const ret = [flight('BRU', 'LIS', '2026-03-03', 'TP 1351'), stay, dinner, flight('LIS', 'BRU', '2026-03-07', 'TP 1352')];

describe('booking span and destination', () => {
    it('covers the first departure to the last arrival or check-out', () => {
        expect(bookingSpan(ret)).toEqual({ start: '2026-03-03', end: '2026-03-07' });
        expect(bookingSpan([])).toBeNull();
    });

    it('names the far end of the journey out, not a connection', () => {
        expect(destinationOf(ret)).toBe('Lisbon');
        const viaMadrid = [flight('BRU', 'MAD', '2026-03-03', 'IB 1'), flight('MAD', 'LIS', '2026-03-03', 'IB 2'), flight('LIS', 'BRU', '2026-03-09', 'TP 3')];
        expect(destinationOf(viaMadrid)).toBe('Lisbon');
    });

    it('falls back to the stay town, then the activity', () => {
        expect(destinationOf([stay])).toBe('Lisboa');
        expect(destinationOf([{ kind: 'activity', source: 'text', activity: { title: 'Show', date: '2026-01-01', time: '', location: 'Teatro, Porto' } }])).toBe('Porto');
    });

    it('describes what was found', () => {
        expect(describeBookings(ret)).toBe('2 flights, 1 stay and 1 reservation');
        expect(describeBookings([stay])).toBe('1 stay');
    });
});

describe('matching a trip', () => {
    it('picks the active trip that overlaps most, allowing a day either side', () => {
        const trips = [
            trip({ id: 'a', startDate: '2026-03-04', endDate: '2026-03-05' }),
            trip({ id: 'b', startDate: '2026-03-03', endDate: '2026-03-06' }),
            trip({ id: 'c', startDate: '2026-03-03', endDate: '2026-03-07', archived: true }),
            trip({ id: 'd', startDate: '2026-03-03', endDate: '2026-03-07', status: 'Cancelled' }),
        ];
        expect(matchTrip(trips, ret)?.id).toBe('b');
        expect(matchTrip([trip({ id: 'e', startDate: '2026-03-08', endDate: '2026-03-12' })], ret)?.id).toBe('e');
        expect(matchTrip([trip({ id: 'f', startDate: '2026-04-01', endDate: '2026-04-05' })], ret)).toBeUndefined();
    });
});

describe('planning and applying', () => {
    it('marks what the trip already has and adopts matching independent flights', () => {
        const existing = trip({
            transports: [{ ...(ret[0] as any).transport, id: 'x', itineraryId: 'i', type: 'One-Way', identifier: 'TP1351' }],
            accommodations: [{ ...(stay as any).stay, id: 's', name: 'Other name' }],
        });
        const loose: Transport = { ...(ret[3] as any).transport, id: 'loose1', itineraryId: 'z', type: 'One-Way', track: [[0, 0]], confirmationCode: '', notes: 'window' };
        const items = planItems(ret, existing, [loose]);
        expect(items.map(i => i.inTrip)).toEqual([true, true, false, false]);
        expect(items[3].adopt?.id).toBe('loose1');

        const { trip: next, adoptedIds, added } = addToTrip(existing, items);
        expect(added).toBe(2);
        expect(adoptedIds).toEqual(['loose1']);
        expect(next.endDate).toBe('2026-03-07');
        expect(next.startDate).toBe('2026-03-02');
        expect(next.transports).toHaveLength(2);
        const moved = next.transports!.find(t => t.id === 'loose1')!;
        expect(moved).toMatchObject({ track: [[0, 0]], notes: 'window', confirmationCode: 'K7Q2ZX', itineraryId: 'itinerary-t1' });
        expect(next.activities).toHaveLength(1);
        expect(next.accommodations).toHaveLength(1);
    });

    it('builds a new trip from the bookings', () => {
        const { trip: made, added } = newTripFrom(planItems(ret, undefined, []), '', '2026-01-10');
        expect(added).toBe(4);
        expect(made).toMatchObject({ name: 'Lisbon', location: 'Lisbon', startDate: '2026-03-03', endDate: '2026-03-07', status: 'Upcoming' });
        expect(made.transports!.map(t => t.identifier)).toEqual(['TP 1351', 'TP 1352']);
        expect(made.transports!.every(t => t.itineraryId === `itinerary-${made.id}` && t.type === 'One-Way')).toBe(true);
        expect(made.locations).toHaveLength(1);
        expect(newTripFrom(planItems(ret, undefined, []), 'Spring in Lisbon', '2026-05-01').trip).toMatchObject({ name: 'Spring in Lisbon', status: 'Past' });
    });
});
