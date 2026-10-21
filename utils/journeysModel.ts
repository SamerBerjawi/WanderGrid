import type { Transport, Trip } from '../types';
import { calculateDistance, getCoordinatesSync } from '../services/geocoding';
import { getCarrierName, getCityName, getFlightArrivalUtcDate, getFlightDepartureUtcDate, getFlightStatusTags } from './flightData';

/**
 * What the Flights and Road trips pages (and their sheet, table and board) need to know about one
 * journey: its status now, how long and how far it is, how a list sorts, and the totals shown in the
 * header. Mode-aware, so the same code serves flights, trains, buses, ferries and cars.
 */

export type JourneyRecord = { flight: Transport; trip: Trip };

export const isIndependent = (tripId: string) => tripId === 'unassigned' || tripId.startsWith('unassigned');

/** IATA-style code when the value is short, otherwise the start of the place name. */
export const placeCode = (value: string): string => {
    const v = (value || '').trim();
    if (!v) return '—';
    if (/^[A-Za-z]{3,4}$/.test(v)) return v.toUpperCase();
    const head = v.split(/[,(\-–]/)[0].trim();
    return (head.length <= 4 ? head : head.slice(0, 3)).toUpperCase();
};

/** A readable place: the city for an airport code, the text itself otherwise. */
export const placeName = (value: string): string => {
    const v = (value || '').trim();
    if (!v) return '';
    return /^[A-Za-z]{3}$/.test(v) ? getCityName(v) || v : v;
};

export const carrierLabel = (t: Transport): string => (t.mode === 'Flight' ? getCarrierName(t.provider) || t.provider : t.provider) || '';

const depMs = (t: Transport) => getFlightDepartureUtcDate(t).getTime();
const arrMs = (t: Transport) => getFlightArrivalUtcDate(t).getTime();

/** Minutes the journey takes: the saved duration, or the gap between departure and arrival. */
export const journeyMinutes = (t: Transport): number => {
    if (t.duration && t.duration > 0) return t.duration;
    const gap = Math.round((arrMs(t) - depMs(t)) / 60000);
    return Number.isFinite(gap) && gap > 0 ? gap : 0;
};

export const formatMinutes = (minutes: number): string => {
    if (!minutes) return '—';
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    if (h === 0) return `${m}m`;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

type Point = { lat: number; lng: number; countryCode?: string };
const pointOf = (text: string, lat?: number, lng?: number): Point | undefined => {
    const known = getCoordinatesSync(text);
    if (lat != null && lng != null) return { lat, lng, countryCode: known?.countryCode };
    return known ? { lat: known.lat, lng: known.lng, countryCode: known.countryCode } : undefined;
};

/** Great-circle distance in km from the two places (saved distance first); 0 when a place can't be found. */
export const journeyKm = (t: Transport): number => {
    if (t.distance && t.distance > 0) return t.distance;
    const a = pointOf(t.origin, t.originLat, t.originLng);
    const b = pointOf(t.destination, t.destLat, t.destLng);
    return a && b ? calculateDistance(a.lat, a.lng, b.lat, b.lng) : 0;
};

export type JourneyState = 'scheduled' | 'travelling' | 'done' | 'cancelled';
export interface JourneyStatus {
    state: JourneyState;
    label: string;
    /** Minutes late (positive) or early (negative) against the schedule; 0 when on time or unknown. */
    delay: number;
}

const toMs = (date: string | undefined, time: string | undefined) => new Date(`${date || ''}T${time || '00:00'}:00`).getTime();

/** Minutes the arrival (or, failing that, the departure) differs from the schedule, when actual times are known. */
export const journeyDelay = (t: Transport): number => {
    if (t.actualArrivalTime) return Math.round((toMs(t.arrivalDate || t.departureDate, t.actualArrivalTime) - toMs(t.arrivalDate || t.departureDate, t.arrivalTime)) / 60000) || 0;
    if (t.actualDepartureTime) return Math.round((toMs(t.departureDate, t.actualDepartureTime) - toMs(t.departureDate, t.departureTime)) / 60000) || 0;
    return 0;
};

export const journeyStatus = (t: Transport, now = Date.now()): JourneyStatus => {
    const flight = t.mode === 'Flight';
    if (getFlightStatusTags(t).label === 'CANCELED') return { state: 'cancelled', label: 'Cancelled', delay: 0 };
    const delay = journeyDelay(t);
    const dep = depMs(t);
    const arr = arrMs(t);
    if (Number.isFinite(arr) && arr <= now) return { state: 'done', label: flight ? 'Landed' : 'Arrived', delay };
    if (Number.isFinite(dep) && dep <= now) return { state: 'travelling', label: flight ? 'In the air' : 'On the way', delay };
    return { state: 'scheduled', label: 'Scheduled', delay };
};

/** Days from now to departure (negative when it has left). */
export const daysToDeparture = (t: Transport, now = Date.now()): number => Math.ceil((depMs(t) - now) / 86_400_000);

export type JourneySortKey = 'date' | 'journey' | 'route' | 'duration' | 'distance' | 'cost';
export const SORT_LABEL: Record<JourneySortKey, string> = { date: 'Date', journey: 'Airline', route: 'Route', duration: 'Duration', distance: 'Distance', cost: 'Cost' };

/** Sorts records for the table and board. Date sorts by departure; everything else falls back to date. */
export const sortJourneys = (items: JourneyRecord[], key: JourneySortKey, asc: boolean): JourneyRecord[] => {
    const value = (r: JourneyRecord): number | string => {
        const t = r.flight;
        switch (key) {
            case 'journey': return `${carrierLabel(t).toLowerCase()} ${t.identifier || ''}`;
            case 'route': return `${placeCode(t.origin)} ${placeCode(t.destination)}`;
            case 'duration': return journeyMinutes(t);
            case 'distance': return journeyKm(t);
            case 'cost': return t.cost || 0;
            default: return depMs(t);
        }
    };
    const dir = asc ? 1 : -1;
    return [...items].sort((a, b) => {
        const va = value(a), vb = value(b);
        if (va < vb) return -dir;
        if (va > vb) return dir;
        return (depMs(a.flight) - depMs(b.flight)) * dir;
    });
};

export interface JourneyTotals {
    count: number;
    upcoming: number;
    km: number;
    minutes: number;
    airports: number;
    carriers: number;
    countries: number;
}

const EARTH_KM = 40075;
export const aroundTheWorld = (km: number) => km / EARTH_KM;

/** The totals of a list of journeys. Cancelled ones don't count towards distance, time or places. */
export const journeyTotals = (items: JourneyRecord[], now = Date.now()): JourneyTotals => {
    const places = new Set<string>();
    const carriers = new Set<string>();
    const countries = new Set<string>();
    let km = 0, minutes = 0, upcoming = 0;
    for (const { flight: t } of items) {
        const cancelled = journeyStatus(t, now).state === 'cancelled';
        if (depMs(t) >= now && !cancelled) upcoming += 1;
        if (cancelled) continue;
        km += journeyKm(t);
        minutes += journeyMinutes(t);
        [t.origin, t.destination].forEach(p => { if (p?.trim()) places.add(placeCode(p)); });
        if (t.provider?.trim()) carriers.add(carrierLabel(t).toLowerCase());
        const a = pointOf(t.origin, t.originLat, t.originLng);
        const b = pointOf(t.destination, t.destLat, t.destLng);
        [a, b].forEach(p => { if (p?.countryCode) countries.add(p.countryCode.toUpperCase()); });
    }
    return { count: items.length, upcoming, km, minutes, airports: places.size, carriers: carriers.size, countries: countries.size };
};
