import type { Trip, TripKind } from '../types';

/** Standalone leave made on the calendar is a hidden trip with this id prefix (kept in step with calendarModel). */
const LEAVE_PREFIX = 'leave-';

/**
 * What a Trip record is (decision D-04): a real `trip`, a calendar `timeoff` entry, or a `bundle` (flights
 * grouped without a trip in the planner). New records store `kind`; older ones are read through the flags and
 * the id prefix they used before, until migration 0001 has stamped every stored trip. Keep
 * backend_files/tripKind.js in step with this file.
 */
export const tripKind = (t: Pick<Trip, 'id' | 'kind' | 'isBundleOnly' | 'hideInPlanner'>): TripKind => {
    if (t.kind === 'trip' || t.kind === 'timeoff' || t.kind === 'bundle') return t.kind;
    if (t.isBundleOnly) return 'bundle';
    if (typeof t.id === 'string' && t.id.startsWith(LEAVE_PREFIX)) return 'timeoff';
    if (t.hideInPlanner) return 'bundle';
    return 'trip';
};

/** A trip the person planned: shown in the planner, the map, the member's list and the totals. */
export const isRealTrip = (t: Pick<Trip, 'id' | 'kind' | 'isBundleOnly' | 'hideInPlanner'>): boolean => tripKind(t) === 'trip';
