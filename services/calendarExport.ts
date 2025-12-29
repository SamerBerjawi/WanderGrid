
import { Trip } from '../types';

export const calendarService = {
    generateIcsContent: (trips: Trip[], appName: string = 'WanderGrid'): string => {
        const events: string[] = [];
        const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

        const formatDate = (dateStr: string) => dateStr.replace(/-/g, '');
        
        // Helper: Add 1 day to date string for exclusive end dates in iCal
        const getExclusiveEndDate = (dateStr: string) => {
            const date = new Date(dateStr);
            date.setDate(date.getDate() + 1);
            return date.toISOString().split('T')[0].replace(/-/g, '');
        };

        trips.forEach(trip => {
            if (trip.status === 'Cancelled') return;

            // Basic details
            const start = formatDate(trip.startDate);
            const end = getExclusiveEndDate(trip.endDate); // iCal end dates are exclusive
            const summary = `${trip.icon || '✈️'} ${trip.name}`;
            const location = trip.location || '';
            const uid = `${trip.id}@wandergrid.app`;
            
            // Build Description
            let description = `Status: ${trip.status}\\n`;
            if (trip.transports && trip.transports.length > 0) {
                description += `\\nTransports:${trip.transports.map(t => `\\n- ${t.mode}: ${t.provider} (${t.departureTime})`).join('')}`;
            }
            if (trip.accommodations && trip.accommodations.length > 0) {
                description += `\\n\\nStays:${trip.accommodations.map(a => `\\n- ${a.name}`).join('')}`;
            }

            const eventBlock = [
                'BEGIN:VEVENT',
                `UID:${uid}`,
                `DTSTAMP:${now}`,
                `DTSTART;VALUE=DATE:${start}`,
                `DTEND;VALUE=DATE:${end}`,
                `SUMMARY:${summary}`,
                `LOCATION:${location}`,
                `DESCRIPTION:${description}`,
                'END:VEVENT'
            ].join('\r\n');

            events.push(eventBlock);
        });

        return [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            `PRODID:-//${appName}//Travel Calendar//EN`,
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'X-WR-CALNAME:' + appName,
            ...events,
            'END:VCALENDAR'
        ].join('\r\n');
    },

    downloadIcs: (content: string, filename: string) => {
        const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};
