import type { Accommodation, Activity, LocationEntry, Transport, Trip } from '../types';
import { placeCode } from './journeysModel';

/**
 * The read-only page behind a public trip link. The server sends a sanitised snapshot (backend_files/sharedTrip.js
 * lists exactly what is in it); this turns it into days of things to show. Pure.
 */

export interface SharedSnapshot {
    trip: { name: string; subtitle?: string; location?: string; startDate?: string; endDate?: string; status?: string; coordinates?: { lat: number; lng: number } };
    /** First names only. */
    travellers: string[];
    transports: Transport[];
    stays: Accommodation[];
    activities: Activity[];
    places: LocationEntry[];
}

export type DayItemKind = 'flight' | 'transport' | 'check-in' | 'check-out' | 'activity';

export interface DayItem {
    id: string;
    kind: DayItemKind;
    time: string;
    title: string;
    detail: string;
    /** The leg, for the schedule status of a flight. */
    leg?: Transport;
}

export interface Day { date: string; items: DayItem[] }

const TOKEN_IN_PATH = /^\/s\/([A-Za-z0-9_-]{32,64})\/?$/;

/** The token of a public trip address (`/s/<token>`), or null for any other path. */
export const sharedTokenFrom = (pathname: string): string | null => pathname.match(TOKEN_IN_PATH)?.[1] ?? null;

const terminal = (term?: string, gate?: string) => [term && `Terminal ${term}`, gate && `Gate ${gate}`].filter(Boolean).join(', ');
const join = (parts: (string | undefined | false)[]) => parts.filter(Boolean).join(' · ');

const transportItem = (t: Transport): DayItem => {
    const flight = t.mode === 'Flight';
    const from = placeCode(t.origin, t.mode), to = placeCode(t.destination, t.mode);
    return {
        id: `t-${t.id}`,
        kind: flight ? 'flight' : 'transport',
        time: t.departureTime || '',
        title: flight ? `${from} → ${to}` : `${t.mode}: ${t.origin} → ${t.destination}`,
        detail: join([[t.provider, t.identifier].filter(Boolean).join(' '), t.arrivalTime && `arrives ${t.arrivalTime}${t.arrivalDate && t.arrivalDate !== t.departureDate ? ' next day' : ''}`, terminal(t.departureTerminal, t.departureGate) && `departs ${terminal(t.departureTerminal, t.departureGate)}`]),
        leg: flight ? t : undefined,
    };
};

/** Days that have something on them, in order; within a day the timed items come first by time, the untimed last. */
export const buildDays = (s: Pick<SharedSnapshot, 'transports' | 'stays' | 'activities'>): Day[] => {
    const byDate = new Map<string, DayItem[]>();
    const add = (date: string | undefined, item: DayItem) => {
        if (!date) return;
        const list = byDate.get(date) || [];
        list.push(item);
        byDate.set(date, list);
    };
    s.transports.filter(t => !t.isLayover).forEach(t => add(t.departureDate, transportItem(t)));
    s.stays.forEach(a => {
        add(a.checkInDate, { id: `in-${a.id}`, kind: 'check-in', time: a.checkInTime || '', title: `Check in to ${a.name}`, detail: join([a.address]) });
        add(a.checkOutDate, { id: `out-${a.id}`, kind: 'check-out', time: a.checkOutTime || '', title: `Check out of ${a.name}`, detail: '' });
    });
    s.activities.forEach(a => add(a.date, { id: `a-${a.id}`, kind: 'activity', time: a.time || '', title: a.title, detail: join([a.location]) }));
    return [...byDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, items]) => ({
            date,
            items: items.sort((x, y) => (x.time ? 0 : 1) - (y.time ? 0 : 1) || x.time.localeCompare(y.time)),
        }));
};

/** The snapshot as a Trip, so the trip map (which reads a Trip) can draw its route and stays. */
export const asTrip = (s: SharedSnapshot): Trip => ({
    id: 'shared',
    name: s.trip.name,
    location: s.trip.location || '',
    startDate: s.trip.startDate || '',
    endDate: s.trip.endDate || '',
    status: (s.trip.status as Trip['status']) || 'Upcoming',
    participants: [],
    coordinates: s.trip.coordinates,
    transports: s.transports,
    accommodations: s.stays,
    activities: s.activities,
    locations: s.places,
});

/** "Sam, Anna and Joe". */
export const namesText = (names: string[]): string =>
    names.length <= 1 ? names[0] || '' : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** The day to scroll to: today when it has something, else the next day with something, else the last. */
export const focusDay = (days: Day[], today: string): string | undefined =>
    (days.find(d => d.date >= today) ?? days[days.length - 1])?.date;
