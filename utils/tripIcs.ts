import type { Activity, Accommodation, Trip } from '../types';
import { fold, ics, stamp, transportEvent, wrapCalendar } from './flightShare';

/**
 * One trip as an iCalendar file: the trip itself (all days), every transport at its real time, every stay
 * (check-in to check-out, all day) and every activity with a time. Stable UIDs, so importing it again
 * updates the events instead of duplicating them.
 */

const day = (iso: string) => iso.slice(0, 10).replace(/-/g, '');
const validDay = (iso?: string): iso is string => typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}/.test(iso);
const nextDay = (iso: string) => {
    const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10).replace(/-/g, '');
};

const allDay = (uid: string, now: Date, from: string, to: string, summary: string, location = '', description = ''): string =>
    [
        'BEGIN:VEVENT', `UID:${uid}@wandergrid.app`, `DTSTAMP:${stamp(now)}`,
        `DTSTART;VALUE=DATE:${day(from)}`, `DTEND;VALUE=DATE:${nextDay(to >= from ? to : from)}`,
        `SUMMARY:${ics(summary)}`, ...(location ? [`LOCATION:${ics(location)}`] : []), ...(description ? [`DESCRIPTION:${ics(description)}`] : []),
        'END:VEVENT',
    ].map(fold).join('\r\n');

const stayEvent = (a: Accommodation, now: Date): string | null => {
    if (!validDay(a.checkInDate)) return null;
    const out = validDay(a.checkOutDate) ? a.checkOutDate : a.checkInDate;
    const lines = [
        a.checkInTime ? `Check-in: ${a.checkInTime}` : '', a.checkOutTime ? `Check-out: ${a.checkOutTime}` : '',
        a.confirmationCode ? `Confirmation: ${a.confirmationCode}` : '', a.website || '', a.notes || '',
    ].filter(Boolean).join('\n');
    return allDay(a.id, now, a.checkInDate, out, `🛏 ${a.name}`, a.address, lines);
};

const activityEvent = (a: Activity, now: Date): string | null => {
    if (!validDay(a.date)) return null;
    const time = /^(\d{2}):(\d{2})/.exec(a.time || '');
    const summary = a.title || 'Activity';
    if (!time) return allDay(a.id, now, a.date, a.date, summary, a.location, a.description);
    // Activities carry a local time without a zone: write them as floating local times (no Z), one hour long.
    const start = `${day(a.date)}T${time[1]}${time[2]}00`;
    const endHour = Math.min(23, Number(time[1]) + 1);
    const end = `${day(a.date)}T${String(endHour).padStart(2, '0')}${time[2]}00`;
    return [
        'BEGIN:VEVENT', `UID:${a.id}@wandergrid.app`, `DTSTAMP:${stamp(now)}`, `DTSTART:${start}`, `DTEND:${end}`,
        `SUMMARY:${ics(summary)}`, ...(a.location ? [`LOCATION:${ics(a.location)}`] : []), ...(a.description ? [`DESCRIPTION:${ics(a.description)}`] : []),
        'END:VEVENT',
    ].map(fold).join('\r\n');
};

export const tripToIcs = (trip: Trip, now = new Date()): string => {
    const events: string[] = [];
    if (validDay(trip.startDate) && validDay(trip.endDate)) {
        const description = [`Status: ${trip.status}`, trip.description || ''].filter(Boolean).join('\n');
        events.push(allDay(trip.id, now, trip.startDate, trip.endDate, `${trip.icon || '✈️'} ${trip.name}`, trip.location, description));
    }
    for (const t of trip.transports || []) {
        if (!validDay(t.departureDate)) continue;
        events.push(transportEvent({ flight: t, trip }, now));
    }
    for (const a of trip.accommodations || []) { const e = stayEvent(a, now); if (e) events.push(e); }
    for (const a of trip.activities || []) { const e = activityEvent(a, now); if (e) events.push(e); }
    return wrapCalendar(events, 'Trip');
};

/** A file name for the trip: letters, digits and hyphens. */
export const tripIcsName = (trip: Trip): string =>
    `${(trip.name || 'trip').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'trip'}.ics`;
