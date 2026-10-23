import type { Transport } from '../types';
import { getFlightDepartureUtcDate } from './flightData';
import { formatMinutes, journeyMinutes, placeCode, type JourneyRecord } from './journeysModel';
import { DEFAULT_FEED_OPTIONS, feedContext } from './icsContext';
import { transportEvent as emitTransport, wrapCalendar } from '../backend_files/icsFeed.mjs';

/**
 * Taking flights out of the app: an iCalendar file (one event per flight, at the real time in UTC, with the
 * booking details and a reminder three hours before; built by the subscription feed's emitter) and a plain-text itinerary to copy or share.
 */

/** One flight, journey leg or other transport as a calendar event (at its real time, with a 3 hour reminder). */
export const transportEvent = ({ flight: t, trip }: JourneyRecord, now = new Date()): string | null =>
    emitTransport(t, trip, { ...DEFAULT_FEED_OPTIONS, reminders: true, remindFlight: 180, cost: false }, feedContext({ now: now.getTime() }));

export const flightsToIcs = (records: JourneyRecord[], now = new Date()): string =>
    wrapCalendar(records.map(r => transportEvent(r, now)).filter((e): e is string => !!e), 'Flights', { refresh: false });

const details = (t: Transport): string[] => [
    t.confirmationCode ? `Confirmation: ${t.confirmationCode}` : '',
    t.seatNumber ? `Seat: ${t.seatNumber}${t.seatType ? ` (${t.seatType.toLowerCase()})` : ''}` : '',
    t.travelClass ? `Class: ${t.travelClass}` : '',
    t.departureTerminal || t.departureGate ? `Departure: ${[t.departureTerminal && `Terminal ${t.departureTerminal}`, t.departureGate && `Gate ${t.departureGate}`].filter(Boolean).join(', ')}` : '',
    t.arrivalTerminal || t.arrivalGate ? `Arrival: ${[t.arrivalTerminal && `Terminal ${t.arrivalTerminal}`, t.arrivalGate && `Gate ${t.arrivalGate}`].filter(Boolean).join(', ')}` : '',
    t.vehicleModel ? `Aircraft: ${t.vehicleModel}${t.tailNumber ? ` (${t.tailNumber})` : ''}` : '',
].filter(Boolean);

const when = (t: Transport) => `${t.departureDate} ${t.departureTime || ''}`.trim();

/** A plain itinerary: one line per flight, then its details; ready to paste into a message. */
export const flightsToText = (records: JourneyRecord[]): string => {
    const sorted = [...records].sort((a, b) => getFlightDepartureUtcDate(a.flight).getTime() - getFlightDepartureUtcDate(b.flight).getTime());
    return sorted.map(({ flight: t }) => {
        const head = `${t.identifier ? `${t.identifier}  ` : ''}${placeCode(t.origin, t.mode)} → ${placeCode(t.destination, t.mode)}  ${when(t)}${t.arrivalTime ? ` → ${t.arrivalTime}` : ''}${journeyMinutes(t) ? `  (${formatMinutes(journeyMinutes(t))})` : ''}`;
        return [head, ...details(t).map(d => `  ${d}`)].join('\n');
    }).join('\n\n');
};
