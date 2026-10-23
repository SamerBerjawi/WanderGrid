import type { Trip } from '../types';
import { DEFAULT_FEED_OPTIONS, TRIP_FILE_OPTIONS, buildFeed, feedOptionsToQuery, tripEvents, wrapCalendar } from '../backend_files/icsFeed.mjs';
import { getAirportName, getAirportTimezone } from './flightData';

/**
 * The app's own .ics files use the same emitter as the subscription feed (backend_files/icsFeed.mjs), with
 * the browser's airport data for time zones and names and this site's address for the link back to the trip.
 */

export type { FeedOptions, FeedContext } from '../backend_files/icsFeed.mjs';
import type { FeedOptions, FeedContext } from '../backend_files/icsFeed.mjs';
export { DEFAULT_FEED_OPTIONS, TRIP_FILE_OPTIONS, feedOptionsToQuery, parseFeedOptions } from '../backend_files/icsFeed.mjs';

export const feedContext = (extra: FeedContext = {}): FeedContext => ({
    now: Date.now(),
    baseUrl: typeof window !== 'undefined' ? window.location.origin : '',
    airportTz: (iata: string) => getAirportTimezone(iata),
    airportName: (iata: string) => getAirportName(iata) || '',
    ...extra,
});

/** Several trips as a calendar file with the chosen granularity. */
export const tripsToIcs = (trips: Trip[], options: Partial<FeedOptions> = {}, name = 'WanderGrid Trips', extra: FeedContext = {}): string =>
    buildFeed(trips, { ...DEFAULT_FEED_OPTIONS, ...options }, feedContext({ name, ...extra }));

/** One trip: the span, each leg, stay and activity. */
export const oneTripToIcs = (trip: Trip, now = new Date()): string =>
    wrapCalendar(tripEvents(trip, TRIP_FILE_OPTIONS, feedContext({ now: now.getTime() })), 'Trip', { refresh: false });

/** The address calendar apps subscribe to: one URL is one configuration (defaults are left out). */
export const calendarFeedUrl = (origin: string, token: string, options: Partial<FeedOptions> = {}): string => {
    const query = feedOptionsToQuery(options);
    return `${origin}/api/calendar/${token}/feed.ics${query ? `?${query}` : ''}`;
};
