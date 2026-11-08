import type { Accommodation, Activity, Transport, Trip } from '../types';
import type { ParsedBooking } from './bookingParser';
import { TOP_AIRPORTS_BY_IATA } from './topAviationData';

/**
 * Where parsed bookings go: an existing trip whose dates they fall in, or a new trip named after the
 * destination. Pure, so the sheet and the tests share it.
 */

const uid = () => Math.random().toString(36).slice(2, 11);
const DAY = 86_400_000;
const toMs = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const norm = (s: string | undefined) => String(s || '').replace(/\s+/g, '').toUpperCase();

export const bookingStart = (b: ParsedBooking): string =>
    b.kind === 'transport' ? b.transport.departureDate : b.kind === 'stay' ? b.stay.checkInDate : b.activity.date;
export const bookingEnd = (b: ParsedBooking): string =>
    b.kind === 'transport' ? b.transport.arrivalDate || b.transport.departureDate : b.kind === 'stay' ? b.stay.checkOutDate || b.stay.checkInDate : b.activity.date;

/** The first and last day the bookings cover. */
export const bookingSpan = (bookings: ParsedBooking[]): { start: string; end: string } | null => {
    if (!bookings.length) return null;
    const starts = bookings.map(bookingStart).filter(Boolean).sort();
    const ends = bookings.map(bookingEnd).filter(Boolean).sort();
    return starts.length ? { start: starts[0], end: ends[ends.length - 1] || starts[0] } : null;
};

/**
 * The trip the bookings belong to: one that isn't archived or cancelled and whose dates (give or take a
 * day, for an evening flight out or a red-eye home) overlap them most.
 */
export const matchTrip = (trips: Trip[], bookings: ParsedBooking[]): Trip | undefined => {
    const span = bookingSpan(bookings);
    if (!span) return undefined;
    const s = toMs(span.start), e = toMs(span.end);
    let best: { trip: Trip; overlap: number; gap: number } | undefined;
    for (const trip of trips) {
        if (trip.archived || trip.status === 'Cancelled' || !trip.startDate) continue;
        const ts = toMs(trip.startDate) - DAY, te = toMs(trip.endDate || trip.startDate) + DAY;
        const overlap = Math.min(e, te) - Math.max(s, ts);
        if (overlap < 0) continue;
        const gap = Math.abs(toMs(trip.startDate) - s);
        if (!best || overlap > best.overlap || (overlap === best.overlap && gap < best.gap)) best = { trip, overlap, gap };
    }
    return best?.trip;
};

/** A place's display name: the city for a known airport code, otherwise the text as written. */
export const placeLabel = (place: string): string => {
    const code = place.trim().toUpperCase();
    return (/^[A-Z]{3}$/.test(code) && TOP_AIRPORTS_BY_IATA.get(code)?.city) || place.trim();
};

/** The town in an address ("Rua X 7, 1100-348 Lisboa, PT" → "Lisboa"). */
const townOf = (address: string): string => {
    const parts = address.split(',').map(p => p.trim()).filter(Boolean);
    const candidates = parts.slice(1).filter(p => !/^[A-Z]{2}$/.test(p)).map(p => p.replace(/^[\d\s-]+/, '').trim()).filter(p => p && !/\d/.test(p));
    return candidates[0] || '';
};

/**
 * Where the trip goes: the far end of the journey out (the stop where you stay a night or more before
 * moving on), else where the first stay is, else the first activity.
 */
export const destinationOf = (bookings: ParsedBooking[]): string => {
    const legs = bookings.filter((b): b is Extract<ParsedBooking, { kind: 'transport' }> => b.kind === 'transport').map(b => b.transport);
    if (legs.length) {
        const home = norm(legs[0].origin);
        for (let i = 0; i < legs.length; i++) {
            const leg = legs[i];
            const next = legs[i + 1];
            if (norm(leg.destination) === home) continue;
            const arrive = leg.arrivalDate || leg.departureDate;
            if (!next || toMs(next.departureDate) - toMs(arrive) >= DAY) return placeLabel(leg.destination);
        }
        return placeLabel(legs[0].destination);
    }
    const stay = bookings.find(b => b.kind === 'stay');
    if (stay?.kind === 'stay') return townOf(stay.stay.address) || stay.stay.name;
    const act = bookings.find(b => b.kind === 'activity');
    return act?.kind === 'activity' ? act.activity.location?.split(',').pop()?.trim() || act.activity.title : '';
};

/* ------------------------------------------------------------------ duplicates */

const transportKey = (t: Pick<Transport, 'origin' | 'destination' | 'departureDate' | 'identifier' | 'mode'>) =>
    [t.mode || 'Flight', norm(t.origin), norm(t.destination), t.departureDate, norm(t.identifier)].join('|');

export interface PlanItem {
    booking: ParsedBooking;
    /** Already in the target trip: left out. */
    inTrip: boolean;
    /** The same flight is in the log as an independent flight: it moves into the trip instead of being copied. */
    adopt?: Transport;
}

/** Each booking with whether the trip already has it, and any independent flight it matches. */
export const planItems = (bookings: ParsedBooking[], trip: Trip | undefined, independent: Transport[]): PlanItem[] => {
    const tripLegs = new Set((trip?.transports || []).map(transportKey));
    const tripStays = trip?.accommodations || [];
    const tripActs = new Set((trip?.activities || []).map(a => `${a.title.trim().toLowerCase()}|${a.date}`));
    const loose = new Map(independent.map(f => [transportKey(f), f]));
    return bookings.map(booking => {
        if (booking.kind === 'transport') {
            const k = transportKey(booking.transport);
            return { booking, inTrip: tripLegs.has(k), adopt: tripLegs.has(k) ? undefined : loose.get(k) };
        }
        if (booking.kind === 'stay') {
            const s = booking.stay;
            const inTrip = tripStays.some(a => (s.confirmationCode && norm(a.confirmationCode) === norm(s.confirmationCode)) || (a.name.trim().toLowerCase() === s.name.trim().toLowerCase() && a.checkInDate === s.checkInDate));
            return { booking, inTrip };
        }
        return { booking, inTrip: tripActs.has(`${booking.activity.title.trim().toLowerCase()}|${booking.activity.date}`) };
    });
};

/* ------------------------------------------------------------------ building the trip */

const toTransport = (t: Extract<ParsedBooking, { kind: 'transport' }>['transport'], tripId: string, adopt?: Transport): Transport => {
    const fresh: Transport = { ...t, id: uid(), itineraryId: `itinerary-${tripId}`, type: 'One-Way', departureTime: t.departureTime || '12:00' };
    if (!adopt) return fresh;
    // Keep what the log already knows (its id, track, live data, notes); fill the gaps from the booking.
    const merged: Transport = { ...adopt, itineraryId: `itinerary-${tripId}` };
    for (const [k, v] of Object.entries(fresh)) {
        if (k === 'id' || k === 'itineraryId') continue;
        const cur = (merged as any)[k];
        if ((cur === undefined || cur === '' || cur === null) && v !== undefined && v !== '') (merged as any)[k] = v;
    }
    delete (merged as any).tripId; delete (merged as any).tripName;
    return merged;
};
const toStay = (s: Extract<ParsedBooking, { kind: 'stay' }>['stay']): Accommodation => ({ ...s, id: uid() });
const toActivity = (a: Extract<ParsedBooking, { kind: 'activity' }>['activity']): Activity => ({ ...a, id: uid() });

const minDate = (a: string, b: string) => (!a ? b : !b ? a : a < b ? a : b);
const maxDate = (a: string, b: string) => (!a ? b : !b ? a : a > b ? a : b);

export interface BookingChanges {
    trip: Trip;
    /** Independent flights that moved into the trip, to delete from the flight log in the same batch. */
    adoptedIds: string[];
    added: number;
}

/** The chosen items added to an existing trip, whose dates widen to cover them. */
export const addToTrip = (trip: Trip, items: PlanItem[]): BookingChanges => {
    const chosen = items.filter(i => !i.inTrip);
    const transports = [...(trip.transports || [])];
    const accommodations = [...(trip.accommodations || [])];
    const activities = [...(trip.activities || [])];
    const adoptedIds: string[] = [];
    let start = trip.startDate, end = trip.endDate || trip.startDate;
    for (const item of chosen) {
        const b = item.booking;
        if (b.kind === 'transport') {
            transports.push(toTransport(b.transport, trip.id, item.adopt));
            if (item.adopt) adoptedIds.push(item.adopt.id);
        } else if (b.kind === 'stay') accommodations.push(toStay(b.stay));
        else activities.push(toActivity(b.activity));
        start = minDate(start, bookingStart(b));
        end = maxDate(end, bookingEnd(b));
    }
    const byTime = (a: Transport, b: Transport) => `${a.departureDate}T${a.departureTime}`.localeCompare(`${b.departureDate}T${b.departureTime}`);
    return {
        trip: { ...trip, startDate: start, endDate: end, transports: transports.sort(byTime), accommodations, activities },
        adoptedIds,
        added: chosen.length,
    };
};

/** A new trip holding the chosen items, booked (Upcoming) or Past by its dates. */
export const newTripFrom = (items: PlanItem[], name: string, today: string): BookingChanges => {
    const span = bookingSpan(items.map(i => i.booking)) || { start: today, end: today };
    const destination = destinationOf(items.map(i => i.booking));
    const id = uid();
    const shell: Trip = {
        id,
        name: name.trim() || destination || 'New trip',
        location: destination,
        startDate: span.start,
        endDate: span.end,
        status: span.end < today ? 'Past' : 'Upcoming',
        participants: [],
        locations: destination ? [{ id: uid(), name: destination, startDate: span.start, endDate: span.end }] : [],
        transports: [], accommodations: [], activities: [],
    };
    return addToTrip(shell, items.map(i => ({ ...i, inTrip: false })));
};

/** A short line describing what was found ("2 flights, 1 stay and 1 activity"). */
export const describeBookings = (bookings: ParsedBooking[]): string => {
    const count = (n: number, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : '');
    const legs = bookings.filter(b => b.kind === 'transport').map(b => (b.kind === 'transport' ? b.transport.mode : 'Flight'));
    const parts = [
        count(legs.filter(m => m === 'Flight').length, 'flight', 'flights'),
        count(legs.filter(m => m === 'Train').length, 'train', 'trains'),
        count(legs.filter(m => m === 'Bus').length, 'bus', 'buses'),
        count(legs.filter(m => m === 'Ferry' || m === 'Cruise').length, 'crossing', 'crossings'),
        count(legs.filter(m => m === 'Car Rental').length, 'car hire', 'car hires'),
        count(bookings.filter(b => b.kind === 'stay').length, 'stay', 'stays'),
        count(bookings.filter(b => b.kind === 'activity').length, 'reservation', 'reservations'),
    ].filter(Boolean);
    return parts.length <= 1 ? parts[0] || '' : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
};
