import type { Transport } from '../types';
import { getFlightArrivalUtcDate, getFlightDepartureUtcDate, getAirportName } from './flightData';
import { formatMinutes, journeyMinutes, placeCode, placeName, type JourneyRecord } from './journeysModel';

/**
 * Taking flights out of the app: an iCalendar file (one event per flight, at the real time in UTC, with the
 * booking details and a reminder three hours before) and a plain-text itinerary to copy or share.
 */

const ics = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

/** Lines longer than 75 octets are folded onto continuation lines that start with a space (RFC 5545). */
const fold = (line: string): string => {
    if (line.length <= 74) return line;
    const out: string[] = [];
    let rest = line;
    out.push(rest.slice(0, 74));
    rest = rest.slice(74);
    while (rest.length) { out.push(` ${rest.slice(0, 73)}`); rest = rest.slice(73); }
    return out.join('\r\n');
};

/** The little symbol in front of a journey: a plane for flights, the vehicle for land and sea. */
const SYMBOL: Record<string, string> = { Flight: '✈', Train: '🚆', Bus: '🚌', 'Car Rental': '🚗', 'Personal Car': '🚗', Cruise: '🛳', Ferry: '⛴' };
const symbol = (t: Transport) => SYMBOL[t.mode] ?? '✈';

const details = (t: Transport): string[] => [
    t.confirmationCode ? `Confirmation: ${t.confirmationCode}` : '',
    t.seatNumber ? `Seat: ${t.seatNumber}${t.seatType ? ` (${t.seatType.toLowerCase()})` : ''}` : '',
    t.travelClass ? `Class: ${t.travelClass}` : '',
    t.departureTerminal || t.departureGate ? `Departure: ${[t.departureTerminal && `Terminal ${t.departureTerminal}`, t.departureGate && `Gate ${t.departureGate}`].filter(Boolean).join(', ')}` : '',
    t.arrivalTerminal || t.arrivalGate ? `Arrival: ${[t.arrivalTerminal && `Terminal ${t.arrivalTerminal}`, t.arrivalGate && `Gate ${t.arrivalGate}`].filter(Boolean).join(', ')}` : '',
    t.vehicleModel ? `Aircraft: ${t.vehicleModel}${t.tailNumber ? ` (${t.tailNumber})` : ''}` : '',
].filter(Boolean);

export const flightsToIcs = (records: JourneyRecord[], now = new Date()): string => {
    const events = records.map(({ flight: t, trip }) => {
        const start = getFlightDepartureUtcDate(t);
        const end = getFlightArrivalUtcDate(t);
        const lines = [
            'BEGIN:VEVENT',
            `UID:${t.id}@wandergrid.app`,
            `DTSTAMP:${stamp(now)}`,
            `DTSTART:${stamp(start)}`,
            `DTEND:${stamp(end > start ? end : new Date(start.getTime() + 3_600_000))}`,
            `SUMMARY:${ics(`${symbol(t)} ${[t.identifier, `${placeCode(t.origin, t.mode)} → ${placeCode(t.destination, t.mode)}`].filter(Boolean).join(' ')}`)}`,
            `LOCATION:${ics((t.mode === 'Flight' && getAirportName(t.origin)) || placeName(t.origin))}`,
            `DESCRIPTION:${ics([t.provider, ...details(t), trip && trip.id !== 'unassigned' ? `Trip: ${trip.name}` : ''].filter(Boolean).join('\n'))}`,
            'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${ics(`${t.identifier || (t.mode === 'Flight' ? 'Flight' : t.mode)} leaves in 3 hours`)}`, 'TRIGGER:-PT3H', 'END:VALARM',
            'END:VEVENT',
        ];
        return lines.map(fold).join('\r\n');
    });
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//WanderGrid//Flights//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...events, 'END:VCALENDAR'].join('\r\n') + '\r\n';
};

const when = (t: Transport) => `${t.departureDate} ${t.departureTime || ''}`.trim();

/** A plain itinerary: one line per flight, then its details; ready to paste into a message. */
export const flightsToText = (records: JourneyRecord[]): string => {
    const sorted = [...records].sort((a, b) => getFlightDepartureUtcDate(a.flight).getTime() - getFlightDepartureUtcDate(b.flight).getTime());
    return sorted.map(({ flight: t }) => {
        const head = `${t.identifier ? `${t.identifier}  ` : ''}${placeCode(t.origin, t.mode)} → ${placeCode(t.destination, t.mode)}  ${when(t)}${t.arrivalTime ? ` → ${t.arrivalTime}` : ''}${journeyMinutes(t) ? `  (${formatMinutes(journeyMinutes(t))})` : ''}`;
        return [head, ...details(t).map(d => `  ${d}`)].join('\n');
    }).join('\n\n');
};
