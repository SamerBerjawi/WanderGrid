import type { Trip } from '../types';
import { oneTripToIcs } from './icsContext';

/**
 * One trip as an iCalendar file: the trip itself (all days), every transport at its real time, every stay
 * (check-in and check-out) and every activity. Built by the same emitter as the subscription feed, with stable
 * UIDs, so importing it again updates the events instead of duplicating them.
 */
export const tripToIcs = (trip: Trip, now = new Date()): string => oneTripToIcs(trip, now);

/** A file name for the trip: letters, digits and hyphens. */
export const tripIcsName = (trip: Trip): string =>
    `${(trip.name || 'trip').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'trip'}.ics`;
