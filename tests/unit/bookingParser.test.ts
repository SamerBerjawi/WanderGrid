import { describe, expect, it } from 'vitest';
import {
    decodeHeader, findDates, findReference, findTimes, looksLikeEmail, parseBookings, readEmail, splitIso,
} from '../../utils/bookingParser';

const flightJsonLd = JSON.stringify([
    {
        '@context': 'http://schema.org', '@type': 'FlightReservation', reservationNumber: 'k7q2zx',
        reservationStatus: 'http://schema.org/ReservationConfirmed', airplaneSeat: '14C', airplaneSeatClass: { '@type': 'AirplaneSeatClass', name: 'Economy' },
        reservationFor: {
            '@type': 'Flight', flightNumber: '1351', airline: { '@type': 'Airline', name: 'TAP Air Portugal', iataCode: 'TP' },
            departureAirport: { '@type': 'Airport', name: 'Brussels', iataCode: 'BRU' }, departureTime: '2026-03-03T10:15:00+01:00', departureTerminal: '1',
            arrivalAirport: { '@type': 'Airport', name: 'Lisbon', iataCode: 'LIS' }, arrivalTime: '2026-03-03T12:05:00+00:00',
        },
    },
    {
        '@context': 'http://schema.org', '@type': 'FlightReservation', reservationNumber: 'K7Q2ZX',
        reservationFor: {
            '@type': 'Flight', flightNumber: 'TP1352', airline: { '@type': 'Airline', name: 'TAP Air Portugal', iataCode: 'TP' },
            departureAirport: { '@type': 'Airport', iataCode: 'LIS' }, departureTime: '2026-03-07T18:40:00+00:00',
            arrivalAirport: { '@type': 'Airport', iataCode: 'BRU' }, arrivalTime: '2026-03-07T22:20:00+01:00',
        },
    },
]);

/** A quoted-printable HTML email, folded the way mail clients save it. */
const qp = (s: string) => s.replace(/=/g, '=3D').replace(/(.{70})/g, '$1=\n');
const flightEml = [
    'Return-Path: <noreply@flytap.example>',
    'From: TAP Air Portugal <noreply@flytap.example>',
    'To: traveller@example.com',
    'Subject: =?UTF-8?Q?Your_booking_K7Q2ZX_=E2=80=93_Brussels_to_Lisbon?=',
    'Date: Mon, 12 Jan 2026 09:30:00 +0000',
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="b1"',
    '',
    '--b1',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Your booking is confirmed.',
    '--b1',
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    qp(`<html><head><script type="application/ld+json">${flightJsonLd}</script></head><body><p>Your booking is confirmed.</p></body></html>`),
    '--b1--',
    '',
].join('\r\n');

describe('email unpacking', () => {
    it('recognises a raw email and not ordinary text', () => {
        expect(looksLikeEmail(flightEml)).toBe(true);
        expect(looksLikeEmail('Flight TP 1351\nBRU to LIS\n3 March 2026')).toBe(false);
        expect(looksLikeEmail('Note: bring passport\nTime: 10:00\n\nsee you')).toBe(false);
    });

    it('decodes encoded-word subjects', () => {
        expect(decodeHeader('=?UTF-8?B?Q29uZmlybWF0aW9u?= =?UTF-8?Q?_caf=C3=A9?=')).toBe('Confirmation café');
    });

    it('reads the subject, sent date and the quoted-printable HTML part', () => {
        const parts = readEmail(flightEml);
        expect(parts.subject).toBe('Your booking K7Q2ZX – Brussels to Lisbon');
        expect(parts.sentDate).toBe('2026-01-12');
        expect(parts.html).toContain('application/ld+json');
        expect(parts.html).toContain('"flightNumber":"1351"');
        expect(parts.text).toContain('Your booking is confirmed.');
    });

    it('reads a base64 part', () => {
        const html = '<p>Check-in: 3 March 2026</p>';
        const eml = `From: a@b.c\nSubject: x\nContent-Type: text/html; charset=utf-8\nContent-Transfer-Encoding: base64\n\n${btoa(html)}\n`;
        expect(readEmail(eml).html).toBe(html);
    });
});

describe('schema.org bookings', () => {
    it('reads both legs of a return flight from JSON-LD in an email', () => {
        const { bookings, subject } = parseBookings(flightEml);
        expect(subject).toContain('K7Q2ZX');
        expect(bookings).toHaveLength(2);
        const [out, back] = bookings.map(b => (b.kind === 'transport' ? b.transport : null));
        expect(out).toMatchObject({
            mode: 'Flight', provider: 'TAP Air Portugal', providerCode: 'TP', identifier: 'TP 1351', confirmationCode: 'K7Q2ZX',
            origin: 'BRU', destination: 'LIS', departureDate: '2026-03-03', departureTime: '10:15', arrivalDate: '2026-03-03', arrivalTime: '12:05',
            seatNumber: '14C', travelClass: 'Economy', departureTerminal: '1',
        });
        expect(back).toMatchObject({ identifier: 'TP 1352', origin: 'LIS', destination: 'BRU', departureDate: '2026-03-07', departureTime: '18:40' });
        expect(bookings.every(b => b.source === 'schema')).toBe(true);
    });

    it('reads hotel, train, car hire, restaurant and event reservations', () => {
        const items = [
            { '@type': 'LodgingReservation', reservationNumber: 'H-99812', checkinTime: '2026-03-03T15:00:00+00:00', checkoutTime: '2026-03-07T11:00:00+00:00', totalPrice: '612.40', priceCurrency: 'EUR',
              reservationFor: { '@type': 'LodgingBusiness', name: 'Memmo Alfama Hotel', address: { '@type': 'PostalAddress', streetAddress: 'Travessa das Merceeiras 27', addressLocality: 'Lisboa', postalCode: '1100-348', addressCountry: 'PT' } } },
            { '@type': 'TrainReservation', reservationNumber: 'tr8812', reservedTicket: { '@type': 'Ticket', ticketedSeat: { '@type': 'Seat', seatNumber: '45', seatRow: '' } },
              reservationFor: { '@type': 'TrainTrip', trainNumber: 'AP 133', provider: { '@type': 'Organization', name: 'CP' }, departureStation: { '@type': 'TrainStation', name: 'Lisboa Santa Apolónia' }, departureTime: '2026-03-05T08:00:00', arrivalStation: { '@type': 'TrainStation', name: 'Porto Campanhã' }, arrivalTime: '2026-03-05T10:49:00' } },
            { '@type': 'RentalCarReservation', reservationNumber: 'RC1', provider: { '@type': 'Organization', name: 'Sixt' }, pickupTime: '2026-03-05T11:00:00', dropoffTime: '2026-03-06T11:00:00',
              pickupLocation: { '@type': 'Place', name: 'Porto Airport', address: 'Aeroporto Francisco Sá Carneiro' }, reservationFor: { '@type': 'Car', name: 'Fiat 500', brand: { name: 'Fiat' }, model: '500' } },
            { '@type': 'FoodEstablishmentReservation', startTime: '2026-03-04T20:30:00', partySize: 2, reservationFor: { '@type': 'FoodEstablishment', name: 'Taberna da Rua das Flores', address: 'Rua das Flores 103, Lisboa' } },
            { '@type': 'EventReservation', reservationFor: { '@type': 'Event', name: 'Fado night', startDate: '2026-03-06T21:00:00', location: { '@type': 'Place', name: 'Clube de Fado', address: 'Lisboa' } } },
            { '@type': 'LodgingReservation', reservationStatus: 'http://schema.org/ReservationCancelled', checkinDate: '2026-03-03', reservationFor: { name: 'Cancelled Inn' } },
        ];
        const { bookings } = parseBookings(`<html><script type="application/ld+json">${JSON.stringify({ '@graph': items })}</script></html>`);
        expect(bookings.map(b => b.kind)).toEqual(['stay', 'activity', 'transport', 'transport', 'activity']);
        const stay = bookings.find(b => b.kind === 'stay');
        expect(stay?.kind === 'stay' && stay.stay).toMatchObject({
            name: 'Memmo Alfama Hotel', address: 'Travessa das Merceeiras 27, 1100-348 Lisboa, PT', type: 'Hotel',
            checkInDate: '2026-03-03', checkInTime: '15:00', checkOutDate: '2026-03-07', checkOutTime: '11:00', confirmationCode: 'H-99812', cost: 612.4,
        });
        const train = bookings.find(b => b.kind === 'transport' && b.transport.mode === 'Train');
        expect(train?.kind === 'transport' && train.transport).toMatchObject({ provider: 'CP', identifier: 'AP 133', origin: 'Lisboa Santa Apolónia', destination: 'Porto Campanhã', departureTime: '08:00', arrivalTime: '10:49', seatNumber: '45', confirmationCode: 'TR8812' });
        const car = bookings.find(b => b.kind === 'transport' && b.transport.mode === 'Car Rental');
        expect(car?.kind === 'transport' && car.transport).toMatchObject({ provider: 'Sixt', origin: 'Porto Airport', destination: 'Porto Airport', departureDate: '2026-03-05', arrivalDate: '2026-03-06', vehicleModel: 'Fiat 500', pickupLocation: 'Aeroporto Francisco Sá Carneiro' });
        const dinner = bookings.find(b => b.kind === 'activity' && b.activity.type === 'Dining');
        expect(dinner?.kind === 'activity' && dinner.activity).toMatchObject({ title: 'Taberna da Rua das Flores', date: '2026-03-04', time: '20:30', location: 'Rua das Flores 103, Lisboa', description: 'Table for 2' });
    });

    it('reads microdata markup', () => {
        const html = `<div itemscope itemtype="http://schema.org/FlightReservation">
            <meta itemprop="reservationNumber" content="ABC123"/>
            <div itemprop="reservationFor" itemscope itemtype="http://schema.org/Flight">
              <meta itemprop="flightNumber" content="LH 1234"/>
              <div itemprop="airline" itemscope itemtype="http://schema.org/Airline"><meta itemprop="name" content="Lufthansa"/><meta itemprop="iataCode" content="LH"/></div>
              <div itemprop="departureAirport" itemscope itemtype="http://schema.org/Airport"><meta itemprop="iataCode" content="FRA"/></div>
              <meta itemprop="departureTime" content="2026-05-01T07:05:00+02:00"/>
              <div itemprop="arrivalAirport" itemscope itemtype="http://schema.org/Airport"><meta itemprop="iataCode" content="MAD"/></div>
              <meta itemprop="arrivalTime" content="2026-05-01T09:40:00+02:00"/>
            </div></div>`;
        const { bookings } = parseBookings(html);
        expect(bookings).toHaveLength(1);
        expect(bookings[0].kind === 'transport' && bookings[0].transport).toMatchObject({ identifier: 'LH 1234', provider: 'Lufthansa', origin: 'FRA', destination: 'MAD', departureTime: '07:05', confirmationCode: 'ABC123' });
    });
});

describe('text fallback', () => {
    it('finds flight segments in a plain confirmation', () => {
        const text = `Booking reference: QX7P2L
Thank you for flying with us.

Outbound - Tue 3 Mar 2026
Flight TP1351  Brussels (BRU) → Lisbon (LIS)
Departs 10:15   Arrives 12:05
Seat 14C  Economy

Return - Sat 7 Mar 2026
Flight TP1352  Lisbon (LIS) → Brussels (BRU)
Departs 18:40   Arrives 22:20

Total paid: EUR 289.50`;
        const { bookings } = parseBookings(text, '2026-01-10');
        expect(bookings).toHaveLength(2);
        expect(bookings[0].kind === 'transport' && bookings[0].transport).toMatchObject({
            identifier: 'TP 1351', origin: 'BRU', destination: 'LIS', departureDate: '2026-03-03', departureTime: '10:15', arrivalTime: '12:05', confirmationCode: 'QX7P2L', seatNumber: '14C', travelClass: 'Economy',
        });
        expect(bookings[1].kind === 'transport' && bookings[1].transport).toMatchObject({ identifier: 'TP 1352', origin: 'LIS', destination: 'BRU', departureDate: '2026-03-07' });
        expect(bookings.every(b => b.source === 'text')).toBe(true);
    });

    it('takes the arrival date from beside the arrival time, not from the next segment', () => {
        const text = `Booking reference: QX7P2L
Outbound - Tue 3 Mar 2026
Flight TP1351  Brussels (BRU) → Lisbon (LIS)
Departs 10:15   Arrives 12:05
Return - Sat 7 Mar 2026
Flight TP1352  Lisbon (LIS) → Brussels (BRU)
Departs 18:40   Arrives 22:20`;
        const [out, back] = parseBookings(text, '2026-01-10').bookings.map(b => (b.kind === 'transport' ? b.transport : null));
        expect(out).toMatchObject({ departureDate: '2026-03-03', arrivalDate: '2026-03-03' });
        expect(back).toMatchObject({ departureDate: '2026-03-07', arrivalDate: '2026-03-07' });
        const dated = 'Flight EK 30 LHR - DXB\nDeparts Fri 20 Feb 2026 21:40\nArrives Sat 21 Feb 2026 07:45';
        expect(parseBookings(dated, '2026-01-10').bookings[0].kind === 'transport' && (parseBookings(dated, '2026-01-10').bookings[0] as any).transport).toMatchObject({ departureDate: '2026-02-20', arrivalDate: '2026-02-21', arrivalTime: '07:45' });
    });

    it('rolls an overnight arrival to the next day and places a date without a year', () => {
        const text = 'Your flight\nEK 30 LHR - DXB\nDeparts Fri 20 Feb 21:40, arrives 07:45';
        const { bookings } = parseBookings(text, '2026-01-10');
        expect(bookings[0].kind === 'transport' && bookings[0].transport).toMatchObject({ origin: 'LHR', destination: 'DXB', departureDate: '2026-02-20', arrivalDate: '2026-02-21', departureTime: '21:40', arrivalTime: '07:45' });
    });

    it('does not treat ordinary capitals as airports', () => {
        const text = 'THE AND YOU\nRoom 12 for 2 guests\nCode NO 2 - ALL OUT\n3 March 2026';
        expect(parseBookings(text, '2026-01-10').bookings).toHaveLength(0);
    });

    it('finds a hotel stay from check-in and check-out', () => {
        const text = `Your reservation is confirmed
Hotel Lisboa Plaza
Address: Travessa do Salitre 7, 1269-066 Lisboa
Confirmation number: 4471823
Check-in: Tuesday, March 3, 2026 from 14:00
Check-out: Saturday, March 7, 2026 until 12:00`;
        const { bookings } = parseBookings(text, '2026-01-10');
        expect(bookings).toHaveLength(1);
        expect(bookings[0].kind === 'stay' && bookings[0].stay).toMatchObject({
            name: 'Hotel Lisboa Plaza', address: 'Travessa do Salitre 7, 1269-066 Lisboa', checkInDate: '2026-03-03', checkInTime: '14:00', checkOutDate: '2026-03-07', checkOutTime: '12:00', confirmationCode: '4471823',
        });
    });

    it('reads plain text out of an HTML-only email', () => {
        const html = '<table><tr><td>Flight</td><td>LH 1234</td></tr><tr><td>FRA to MAD</td></tr><tr><td>1 May 2026</td><td>07:05</td><td>09:40</td></tr></table>';
        const { bookings } = parseBookings(html, '2026-01-10');
        expect(bookings[0].kind === 'transport' && bookings[0].transport).toMatchObject({ identifier: 'LH 1234', origin: 'FRA', destination: 'MAD', departureDate: '2026-05-01', departureTime: '07:05', arrivalTime: '09:40' });
    });
});

describe('helpers', () => {
    it('splits ISO stamps without shifting the time zone', () => {
        expect(splitIso('2026-03-07T22:20:00+01:00')).toEqual({ date: '2026-03-07', time: '22:20' });
        expect(splitIso('2026-03-07')).toEqual({ date: '2026-03-07', time: '' });
        expect(splitIso('soon')).toEqual({ date: '', time: '' });
    });

    it('reads dates in common formats', () => {
        expect(findDates('3 March 2026, Mar 4 2026, 2026-03-05, 06/03/2026', '2026-01-01').map(d => d.date)).toEqual(['2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06']);
        expect(findDates('on 2 Jan', '2026-06-01').map(d => d.date)).toEqual(['2027-01-02']);
    });

    it('reads 24-hour and 12-hour times', () => {
        expect(findTimes('10:15 then 2:05 pm and 12:30am').map(t => t.time)).toEqual(['10:15', '14:05', '00:30']);
    });

    it('reads booking references but not plain counts', () => {
        expect(findReference('Your booking reference is AB12CD.')).toBe('AB12CD');
        expect(findReference('PNR: XK9QZ2')).toBe('XK9QZ2');
        expect(findReference('Confirmation #: 98765')).toBeUndefined();
    });
});
