
import { Trip } from '../types';
import { tripIcsName, tripToIcs } from '../utils/tripIcs';
import { tripsToIcs, type FeedOptions } from '../utils/icsContext';

export const calendarService = {
    /**
     * Trips as a calendar file. The same emitter and options as the subscription feed (see backend_files/icsFeed.mjs),
     * so a download and the subscribed calendar agree; with no options it holds what the feed holds by default.
     */
    generateIcsContent: (trips: Trip[], appName: string = 'WanderGrid', options: Partial<FeedOptions> = {}): string =>
        tripsToIcs(trips, options, appName),

    downloadIcs: (content: string, filename: string) => {
        const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    /** One trip as a calendar file: the trip, its transports at their real times, stays and activities. */
    downloadTrip: (trip: Trip) => calendarService.downloadIcs(tripToIcs(trip), tripIcsName(trip)),
};
