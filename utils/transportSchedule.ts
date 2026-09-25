import { Transport } from '../types';
import { formatProperLocationName } from '../services/geocoding';
import { 
    getAirportTimezone, 
    parseLocalDateInTimezone, 
    getFlightDepartureUtcDate, 
    getFlightArrivalUtcDate 
} from './flightData';

/**
 * Determines whether a Transport item represents an actual Car Rental booking
 * (e.g. booked vehicle rental from an agency with pickup and drop-off events)
 * vs an excursion / scenic drive / itinerary route segment.
 */
export function isCarRentalBooking(t: Transport): boolean {
    if (t.mode !== 'Car Rental') return false;

    // Explicit excursion marker
    if ((t as any).isExcursion) return false;

    // Generated route segments from Route Manager or Road Trips
    if (t.itineraryId === 'route-gen' || t.itineraryId === 'route-booked' || t.itineraryId === 'roadtrip-ref') {
        return false;
    }

    // Segments generated with customFields from LocationManager (multi-leg excursion journey)
    if (t.customFields?.some(f => f.key === 'legId' || f.key === 'legTitle' || f.key === 'isExcursion')) {
        return false;
    }

    // Notes identifying excursion / scenic drive / visual route segment
    if (t.notes?.toLowerCase().includes('excursion') || t.notes?.toLowerCase().includes('visual route segment')) {
        return false;
    }

    // Internal IDs generated for scenic drives / legs
    if (t.id?.startsWith('land-trip-') || t.id?.startsWith('seg-')) {
        return false;
    }

    // Waypoint road trips
    if (t.waypoints && t.waypoints.length > 0) {
        return false;
    }

    return true;
}

/**
 * Formats the user-facing title for a transport event on the trip schedule.
 * Excursions in a car or rental car are titled "Road Trip to [Destination]".
 * Other transport methods follow the same pattern: "[Mode] to [Destination]".
 * Car rental bookings are titled "Rental Car Pickup" and "Rental Car Dropoff".
 */
export function getTransportScheduleTitle(t: Transport, isDropoff?: boolean): string {
    const isRental = isCarRentalBooking(t);

    if (isDropoff) {
        if (t.mode === 'Car Rental') {
            const hasProvider = t.provider && !['Car Rental', 'Private Car Rental', 'Rental Agency', 'Personal Vehicle'].includes(t.provider);
            return hasProvider ? `Rental Car Dropoff (${t.provider})` : 'Rental Car Dropoff';
        }
        if (t.mode === 'Flight') {
            const destName = formatProperLocationName(t.destination);
            return destName ? `Flight Arrival at ${destName}` : 'Flight Arrival';
        }
        return `Dropoff ${t.mode}`;
    }

    if (isRental) {
        const hasProvider = t.provider && !['Car Rental', 'Private Car Rental', 'Rental Agency', 'Personal Vehicle'].includes(t.provider);
        return hasProvider ? `Rental Car Pickup (${t.provider})` : 'Rental Car Pickup';
    }

    // It is an excursion / route journey / transit leg
    const destName = formatProperLocationName(t.destination);

    if (t.mode === 'Car Rental' || t.mode === 'Personal Car' || (t.mode as string) === 'Road Trip' || (t.mode as string) === 'Drive') {
        return destName ? `Road Trip to ${destName}` : 'Road Trip';
    }

    if (t.mode === 'Train') {
        return destName ? `Train to ${destName}` : 'Train';
    }

    if (t.mode === 'Flight') {
        return destName ? `Flight to ${destName}` : 'Flight';
    }

    if (t.mode === 'Bus') {
        return destName ? `Bus to ${destName}` : 'Bus';
    }

    if (t.mode === 'Ferry') {
        return destName ? `Ferry to ${destName}` : 'Ferry';
    }

    if (t.mode === 'Cruise') {
        return destName ? `Cruise to ${destName}` : 'Cruise';
    }

    return destName ? `${t.mode} to ${destName}` : t.mode;
}

/**
 * Formats the location display for a transport item in the schedule.
 */
export function getTransportScheduleLocation(t: Transport, isDropoff?: boolean): string {
    if (isDropoff) {
        return formatProperLocationName(t.dropoffLocation || t.destination);
    }
    if (isCarRentalBooking(t)) {
        return formatProperLocationName(t.pickupLocation || t.origin);
    }
    if (t.origin && t.destination && t.origin.trim().toLowerCase() !== t.destination.trim().toLowerCase()) {
        return `${formatProperLocationName(t.origin)} → ${formatProperLocationName(t.destination)}`;
    }
    return formatProperLocationName(t.destination || t.origin);
}

/**
 * Calculates the exact UTC epoch timestamp for a transport event,
 * taking into account local timezone for the airport, station, or city.
 */
export function getTransportUtcTimestamp(t: Transport, isDropoff?: boolean): number {
    if (t.mode === 'Flight') {
        const utcDate = isDropoff ? getFlightArrivalUtcDate(t) : getFlightDepartureUtcDate(t);
        if (!isNaN(utcDate.getTime())) {
            return utcDate.getTime();
        }
    }

    const dateStr = isDropoff ? (t.arrivalDate || t.departureDate) : t.departureDate;
    const timeStr = (isDropoff ? t.arrivalTime : t.departureTime) || (isDropoff ? '18:00' : '09:00');
    
    // Resolve timezone from origin (or destination for dropoff)
    const code = isDropoff ? (t.dropoffLocation || t.destination) : (t.pickupLocation || t.origin);
    const tz = (code && getAirportTimezone(code)) || undefined;
    const parsed = parseLocalDateInTimezone(dateStr || '2026-01-01', timeStr, tz);
    return !isNaN(parsed.getTime()) ? parsed.getTime() : new Date(`${dateStr}T${timeStr}:00`).getTime();
}

/**
 * Extracts and tags transport events for a given calendar date,
 * strictly sorted chronologically taking into account time zone.
 * Accurately surfaces Rental Car Pickup on pickup date and Rental Car Dropoff on dropoff date,
 * including when both occur on the same day.
 */
export function getTransportScheduleEventsForDate(
    transports: Transport[] | undefined, 
    dateStr: string
): (Transport & { isDropoff?: boolean })[] {
    if (!transports || transports.length === 0) return [];
    const events: (Transport & { isDropoff?: boolean })[] = [];

    transports.forEach(t => {
        if (t.isApproximate) return;

        if (isCarRentalBooking(t)) {
            // Rental Car Booking:
            // 1. Pickup Event on departureDate
            if (t.departureDate === dateStr) {
                events.push({ ...t, isDropoff: false });
            }
            // 2. Dropoff Event on arrivalDate
            if (t.arrivalDate === dateStr) {
                events.push({ ...t, isDropoff: true });
            }
        } else {
            // Excursions / point-to-point route legs
            if (t.departureDate === dateStr) {
                events.push({ ...t, isDropoff: false });
            }
            // Flights or legs arriving on a different date
            if (t.mode === 'Flight' && t.arrivalDate && t.arrivalDate === dateStr && t.arrivalDate !== t.departureDate) {
                events.push({ ...t, isDropoff: true });
            }
        }
    });

    // Chronological sorting taking into account time zones
    events.sort((a, b) => {
        const timeA = getTransportUtcTimestamp(a, a.isDropoff);
        const timeB = getTransportUtcTimestamp(b, b.isDropoff);
        if (timeA !== timeB) return timeA - timeB;
        if (a.isDropoff !== b.isDropoff) return a.isDropoff ? 1 : -1;
        return 0;
    });

    return events;
}
