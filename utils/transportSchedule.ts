import { Transport } from '../types';
import { formatProperLocationName } from '../services/geocoding';

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
        return `Dropoff ${t.mode}`;
    }

    if (isRental) {
        const hasProvider = t.provider && !['Car Rental', 'Private Car Rental', 'Rental Agency', 'Personal Vehicle'].includes(t.provider);
        return hasProvider ? `Rental Car Pickup (${t.provider})` : 'Rental Car Pickup';
    }

    // It is an excursion / route journey / transit leg
    const destName = formatProperLocationName(t.destination);

    if (t.mode === 'Car Rental' || t.mode === 'Personal Car' || t.mode === 'Road Trip' || (t.mode as string) === 'Drive') {
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
 * Extracts and tags transport events for a given calendar date.
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
        }
    });

    return events;
}
