import { describe, expect, it } from 'vitest';
import { parseBookings, type ParsedBooking } from '../../utils/bookingParser';

const TODAY = '2026-01-15';
const legs = (input: string) => parseBookings(input, TODAY).bookings.filter((b): b is Extract<ParsedBooking, { kind: 'transport' }> => b.kind === 'transport').map(b => b.transport);
const stays = (input: string) => parseBookings(input, TODAY).bookings.filter((b): b is Extract<ParsedBooking, { kind: 'stay' }> => b.kind === 'stay').map(b => b.stay);
const brief = (t: { identifier: string; origin: string; destination: string; departureDate: string; departureTime: string; arrivalTime: string }) =>
    `${t.identifier.replace(/\s/g, '')} ${t.origin}-${t.destination} ${t.departureDate} ${t.departureTime}>${t.arrivalTime}`;

describe('flights in real-world confirmation text', () => {
    it('a low-cost airline: city and code, number, date, depart and arrive on labelled lines', () => {
        const email = `Your booking is confirmed
Booking reference: ABC123

Outbound flight
Brussels Charleroi (CRL) to Lisbon (LIS)
FR 1234
Mon, 03 Mar 2026
Depart: 06:05   Arrive: 07:50
`;
        expect(legs(email).map(brief)).toEqual(['FR1234 CRL-LIS 2026-03-03 06:05>07:50']);
    });

    it('a flag-carrier HTML table, where every cell is its own line', () => {
        const html = `<html><body><h2>Your trip</h2><p>Booking code: 4KLM9Z</p>
<table><tr><td>Wed 05 Mar 2026</td></tr>
<tr><td>KL1675</td><td>Amsterdam (AMS)</td><td>10:15</td><td>Lisbon (LIS)</td><td>12:30</td></tr>
<tr><td>Sun 09 Mar 2026</td></tr>
<tr><td>KL1676</td><td>Lisbon (LIS)</td><td>13:20</td><td>Amsterdam (AMS)</td><td>17:35</td></tr></table></body></html>`;
        expect(legs(html).map(brief)).toEqual(['KL1675 AMS-LIS 2026-03-05 10:15>12:30', 'KL1676 LIS-AMS 2026-03-09 13:20>17:35']);
    });

    it('an itinerary receipt with codes and short dates (03MAR)', () => {
        const email = `ELECTRONIC TICKET ITINERARY / RECEIPT
BOOKING REF: 6XYZQ2
PASSENGER: BERJAWI/SAMER MR
FLIGHT   DATE    FROM  TO   DEP   ARR
LH 1011  03MAR   BRU   FRA  0830  0945
LH 400   03MAR   FRA   JFK  1130  1405
`;
        expect(legs(email).map(brief)).toEqual(['LH1011 BRU-FRA 2026-03-03 08:30>09:45', 'LH400 FRA-JFK 2026-03-03 11:30>14:05']);
    });

    it('a date heading above each segment, with the airports on separate lines', () => {
        const email = `Outbound - Monday 3 March 2026
SN 3201
08:10 Brussels (BRU)
10:35 Lisbon (LIS)
Return - Friday 7 March 2026
SN 3202
11:20 Lisbon (LIS)
15:40 Brussels (BRU)
Booking reference: Q8T2LM
`;
        expect(legs(email).map(brief)).toEqual(['SN3201 BRU-LIS 2026-03-03 08:10>10:35', 'SN3202 LIS-BRU 2026-03-07 11:20>15:40']);
    });

    it('text pulled from a PDF e-ticket: labelled departure and arrival', () => {
        const email = `E-TICKET
Reservation code ZX81PQ
Departure Brussels BRU 03 Mar 2026 08:30
Arrival Frankfurt FRA 03 Mar 2026 09:45
Flight LH1011 Economy
`;
        expect(legs(email).map(brief)).toEqual(['LH1011 BRU-FRA 2026-03-03 08:30>09:45']);
    });

    it('an easyJet style segment with a long flight designator', () => {
        const email = `Flight EZY 8824
London Gatwick (LGW) → Lisbon (LIS)
Monday 3 March 2026
Departs 06:55 | Arrives 09:35
Booking reference: K3H7P9L
`;
        expect(legs(email).map(brief)).toEqual(['U28824 LGW-LIS 2026-03-03 06:55>09:35']);
    });

    it('a flight with the airports but no code of the airline, written as a route line', () => {
        const email = `Flight TP 1234 on 3 March 2026
BRU - LIS
08:10 - 10:25
`;
        expect(legs(email).map(brief)).toEqual(['TP1234 BRU-LIS 2026-03-03 08:10>10:25']);
    });
});

describe('stays in real-world confirmation text', () => {
    it('a booking site where each label sits above its date', () => {
        const email = `Your booking is confirmed
Hotel Avenida Palace
Rua 1º de Dezembro 123, 1200-359 Lisbon, Portugal
Confirmation number: 1234567890
Check-in
Tuesday, 3 March 2026
(from 15:00)
Check-out
Saturday, 7 March 2026
(until 11:00)
`;
        const [s] = stays(email);
        expect(s).toMatchObject({ name: 'Hotel Avenida Palace', checkInDate: '2026-03-03', checkOutDate: '2026-03-07', checkInTime: '15:00', checkOutTime: '11:00' });
    });

    it('a home-rental site: Check-in and Checkout with short dates and 12-hour times', () => {
        const email = `Reservation confirmed - Cosy flat in Alfama
Hosted by Maria
Check-in
Tue, Mar 3
3:00 PM
Checkout
Sat, Mar 7
11:00 AM
Confirmation code
HMABCD1234
`;
        const [s] = stays(email);
        expect(s).toMatchObject({ checkInDate: '2026-03-03', checkOutDate: '2026-03-07', checkInTime: '15:00', checkOutTime: '11:00' });
        expect(s.name).toMatch(/Cosy flat in Alfama/);
    });

    it('arrival and departure wording', () => {
        const email = `Reservation at Grand Hotel Europa
Arrival date: 3 March 2026
Departure date: 7 March 2026
`;
        const [s] = stays(email);
        expect(s).toMatchObject({ name: expect.stringContaining('Grand Hotel Europa'), checkInDate: '2026-03-03', checkOutDate: '2026-03-07' });
    });
});

describe('trains and flights that cannot be read in full', () => {
    it('a train: stations joined by an arrow, with a train number, date and times', () => {
        const email = `Eurostar - your tickets
Booking reference: ZQ4M8W
Train 9114
Brussels-Midi \u2192 London St Pancras
Tuesday 3 March 2026
Departs 08:56 Arrives 09:30
`;
        const [t] = legs(email);
        expect(t).toMatchObject({ mode: 'Train', provider: 'Eurostar', origin: 'Brussels-Midi', destination: 'London St Pancras', departureDate: '2026-03-03', departureTime: '08:56', arrivalTime: '09:30' });
    });

    it('a flight number and date without airports comes back to be completed', () => {
        const email = `Your booking is confirmed
Booking reference: ABC123
Flight TP 1234
Monday 3 March 2026
Departs 08:10
`;
        const result = parseBookings(email, TODAY).bookings;
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ kind: 'transport', incomplete: true, transport: { identifier: 'TP 1234', origin: '', destination: '', departureDate: '2026-03-03', departureTime: '08:10' } });
    });

    it('does not turn ordinary text into flights', () => {
        expect(parseBookings('Dear Sam, thanks for shopping with us. Order 1234 shipped on 3 March 2026. Room 12, PO 55.', TODAY).bookings).toEqual([]);
    });
});
