import type { LocationEntry, Transport, TransportMode, Trip } from '../types';
import { calculateDistance, formatProperLocationName } from '../services/geocoding';
import { shiftDate } from './tripItinerary';

/**
 * A trip's route as the person plans it (UI_UX_DESIGN_REFERENCE.md decision 56): a main journey of
 * legs from place to place on given days, and day trips that start from a place on the way and
 * usually come back the same day. It is stored as ordinary transports (tagged with the sector they
 * belong to, so the original trip page still reads them) and as the trip's stops.
 */

export interface RouteSegment {
    id: string;
    mode: TransportMode;
    date: string;
    origin: string;
    originLat?: number;
    originLng?: number;
    destination: string;
    destLat?: number;
    destLng?: number;
    /** The saved transport this came from, so its times, cost and details survive an edit. */
    original?: Transport;
}

export interface RouteSector {
    id: string;
    title: string;
    kind: 'journey' | 'daytrip';
    segments: RouteSegment[];
}

const LEG_ID = 'legId';
const LEG_TITLE = 'legTitle';
export const ROUTE_LOCATION_PREFIX = 'route-';
const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

/** Ground and sea legs, and anything the planner tagged, belong to the route; flights stay with the bookings. */
export const isRouteTransport = (t: Transport): boolean =>
    t.mode !== 'Flight' || Boolean(t.isExcursion) || Boolean(t.customFields?.some(f => f.key === LEG_ID));

const same = (a?: string, b?: string) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
const tag = (t: Transport, key: string) => t.customFields?.find(f => f.key === key)?.value;

const segmentOf = (t: Transport): RouteSegment => ({
    id: t.id,
    mode: t.mode,
    date: (t.departureDate || '').slice(0, 10),
    origin: t.origin,
    originLat: t.originLat,
    originLng: t.originLng,
    destination: t.destination,
    destLat: t.destLat,
    destLng: t.destLng,
    original: t,
});

/** The route of a trip: its tagged journeys and day trips, or one seeded from its stops. */
export const loadRoute = (trip: Trip): RouteSector[] => {
    const legs = (trip.transports || []).filter(isRouteTransport);
    if (legs.length === 0) {
        const stops = trip.locations || [];
        if (stops.length < 2) return [{ id: 'journey', title: 'Journey', kind: 'journey', segments: [] }];
        return [{
            id: 'journey',
            title: 'Journey',
            kind: 'journey',
            segments: stops.slice(0, -1).map((s, i) => ({
                id: uid(),
                mode: 'Personal Car' as TransportMode,
                date: (s.endDate || s.startDate || trip.startDate || '').slice(0, 10),
                origin: s.name,
                originLat: s.coordinates?.lat,
                originLng: s.coordinates?.lng,
                destination: stops[i + 1].name,
                destLat: stops[i + 1].coordinates?.lat,
                destLng: stops[i + 1].coordinates?.lng,
            })),
        }];
    }
    const groups = new Map<string, { title: string; legs: Transport[] }>();
    legs.forEach(t => {
        const id = tag(t, LEG_ID) || (t.isExcursion ? `daytrip-${t.itineraryId || t.id}` : 'journey');
        const g = groups.get(id) || { title: tag(t, LEG_TITLE) || (t.isExcursion ? 'Day trip' : 'Journey'), legs: [] };
        g.legs.push(t);
        groups.set(id, g);
    });
    const sectors: RouteSector[] = Array.from(groups.entries()).map(([id, g]) => {
        const sorted = [...g.legs].sort((a, b) => `${a.departureDate}${a.departureTime}`.localeCompare(`${b.departureDate}${b.departureTime}`));
        return { id, title: g.title, kind: sorted.every(t => t.isExcursion) ? 'daytrip' : 'journey', segments: sorted.map(segmentOf) };
    });
    const first = (s: RouteSector) => s.segments[0]?.date || '';
    return sectors.sort((a, b) => (a.kind === b.kind ? first(a).localeCompare(first(b)) : a.kind === 'journey' ? -1 : 1));
};

/* ------------------------------------------------------------------ */
/* Estimates */
/* ------------------------------------------------------------------ */

/** Road distance is longer than the straight line; these are rough, honest multipliers. */
const DETOUR: Record<TransportMode, number> = { Flight: 1.05, Train: 1.2, Bus: 1.3, 'Car Rental': 1.3, 'Personal Car': 1.3, Cruise: 1.15, Ferry: 1.15 };
/** Average speeds in km/h, door to door for a normal day. */
const SPEED: Record<TransportMode, number> = { Flight: 750, Train: 100, Bus: 65, 'Car Rental': 80, 'Personal Car': 80, Cruise: 30, Ferry: 35 };

/** The length and time of a leg, when both places are on the map. */
export const estimateSegment = (s: Pick<RouteSegment, 'mode' | 'originLat' | 'originLng' | 'destLat' | 'destLng'>): { km: number; minutes: number } | null => {
    if (s.originLat == null || s.originLng == null || s.destLat == null || s.destLng == null) return null;
    const km = Math.round(calculateDistance(s.originLat, s.originLng, s.destLat, s.destLng) * DETOUR[s.mode]);
    return { km, minutes: Math.max(10, Math.round((km / SPEED[s.mode]) * 60)) };
};

export const formatDuration = (minutes: number): string => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
};

const clock = (time: string, plusMinutes: number): { dayShift: number; time: string } => {
    const [h, m] = (time || '09:00').split(':').map(Number);
    const total = (h || 0) * 60 + (m || 0) + plusMinutes;
    const dayShift = Math.floor(total / 1440);
    const rest = ((total % 1440) + 1440) % 1440;
    return { dayShift, time: `${String(Math.floor(rest / 60)).padStart(2, '0')}:${String(rest % 60).padStart(2, '0')}` };
};

/* ------------------------------------------------------------------ */
/* Editing helpers */
/* ------------------------------------------------------------------ */

/** A new leg that starts where the last one ended, a day later. */
export const nextSegment = (sector: RouteSector, fallbackDate: string, fallbackOrigin?: { name: string; lat?: number; lng?: number }): RouteSegment => {
    const last = sector.segments[sector.segments.length - 1];
    return {
        id: uid(),
        mode: last?.mode ?? 'Personal Car',
        date: last ? shiftDate(last.date, 1) : fallbackDate,
        origin: last ? last.destination : fallbackOrigin?.name || '',
        originLat: last ? last.destLat : fallbackOrigin?.lat,
        originLng: last ? last.destLng : fallbackOrigin?.lng,
        destination: '',
    };
};

/** A day trip from a place: out in the morning, and the same way back. */
export const newDayTrip = (base: { name: string; lat?: number; lng?: number }, date: string, mode: TransportMode = 'Personal Car'): RouteSector => ({
    id: `daytrip-${uid()}`,
    title: 'Day trip',
    kind: 'daytrip',
    segments: [
        { id: uid(), mode, date, origin: base.name, originLat: base.lat, originLng: base.lng, destination: '' },
        { id: uid(), mode, date, origin: '', destination: base.name, destLat: base.lat, destLng: base.lng },
    ],
});

/** Whether a day trip's second leg is just the first one in reverse. */
export const returnsSameWay = (sector: RouteSector): boolean => {
    const [a, b] = sector.segments;
    return sector.segments.length === 2 && same(a.destination, b.origin) && same(a.origin, b.destination);
};

/** Keeps a day trip's return leg the mirror of its first leg (place, mode, day). */
export const mirrorReturn = (sector: RouteSector): RouteSector => {
    if (sector.segments.length !== 2) return sector;
    const [a, b] = sector.segments;
    return {
        ...sector,
        segments: [a, { ...b, mode: a.mode, date: a.date, origin: a.destination, originLat: a.destLat, originLng: a.destLng, destination: a.origin, destLat: a.originLat, destLng: a.originLng }],
    };
};

/** The title a day trip gets from where it goes. */
export const dayTripTitle = (sector: RouteSector): string => (sector.segments[0]?.destination ? `Day trip to ${formatProperLocationName(sector.segments[0].destination)}` : 'Day trip');

/* ------------------------------------------------------------------ */
/* Saving */
/* ------------------------------------------------------------------ */

const unchanged = (s: RouteSegment) => {
    const o = s.original;
    return Boolean(o && o.mode === s.mode && same(o.origin, s.origin) && same(o.destination, s.destination) && (o.departureDate || '').slice(0, 10) === s.date);
};

/** The trip's transports and stops once the route is saved: the route's legs replace the old route legs, everything else stays. */
export const compileRoute = (trip: Trip, sectors: RouteSector[]): { transports: Transport[]; locations: LocationEntry[] } => {
    const kept = (trip.transports || []).filter(t => !isRouteTransport(t));
    const route: Transport[] = [];

    sectors.forEach(sector => {
        const itineraryId = sector.kind === 'daytrip' ? uid() : undefined;
        sector.segments.forEach(seg => {
            if (!seg.origin.trim() || !seg.destination.trim() || !seg.date) return;
            const base: Transport = seg.original ?? {
                id: seg.id,
                itineraryId: itineraryId ?? uid(),
                type: sector.kind === 'daytrip' ? 'Round Trip' : 'One-Way',
                mode: seg.mode,
                provider: '',
                identifier: '',
                confirmationCode: '',
                origin: '',
                destination: '',
                departureDate: seg.date,
                departureTime: sector.kind === 'daytrip' ? (seg === sector.segments[0] ? '09:00' : '18:00') : '09:00',
                arrivalDate: seg.date,
                arrivalTime: '12:00',
                reason: 'Personal',
            };
            const est = estimateSegment(seg);
            const keepTimes = unchanged(seg);
            const arrival = !keepTimes && est ? clock(base.departureTime, est.minutes) : null;
            const customFields = [...(base.customFields || []).filter(f => f.key !== LEG_ID && f.key !== LEG_TITLE), { key: LEG_ID, value: sector.id }, { key: LEG_TITLE, value: sector.title }];
            route.push({
                ...base,
                mode: seg.mode,
                origin: seg.origin.trim(),
                destination: seg.destination.trim(),
                departureDate: seg.date,
                arrivalDate: keepTimes ? base.arrivalDate : arrival ? shiftDate(seg.date, arrival.dayShift) : seg.date,
                arrivalTime: keepTimes ? base.arrivalTime : arrival ? arrival.time : base.arrivalTime,
                distance: est?.km ?? base.distance,
                duration: est?.minutes ?? base.duration,
                originLat: seg.originLat, originLng: seg.originLng, originGeoKey: seg.originLat != null ? seg.origin.trim() : undefined,
                destLat: seg.destLat, destLng: seg.destLng, destGeoKey: seg.destLat != null ? seg.destination.trim() : undefined,
                isExcursion: sector.kind === 'daytrip' ? true : undefined,
                customFields,
            });
        });
    });

    // Stops: where the main journey spends its nights, and the places day trips go to.
    const locations: LocationEntry[] = [];
    sectors.filter(s => s.kind === 'journey').forEach(sector => {
        const segs = sector.segments.filter(s => s.origin.trim() && s.destination.trim() && s.date);
        segs.forEach((seg, i) => {
            if (i === 0) {
                locations.push({ id: `${ROUTE_LOCATION_PREFIX}${seg.id}-start`, name: seg.origin.trim(), startDate: seg.date, endDate: seg.date, coordinates: seg.originLat != null && seg.originLng != null ? { lat: seg.originLat, lng: seg.originLng } : undefined });
            }
            const next = segs[i + 1];
            const end = next ? next.date : trip.endDate && trip.endDate >= seg.date ? trip.endDate : seg.date;
            locations.push({ id: `${ROUTE_LOCATION_PREFIX}${seg.id}-end`, name: seg.destination.trim(), startDate: seg.date, endDate: end, coordinates: seg.destLat != null && seg.destLng != null ? { lat: seg.destLat, lng: seg.destLng } : undefined });
        });
    });
    sectors.filter(s => s.kind === 'daytrip').forEach(sector => {
        const out = sector.segments[0];
        if (!out?.destination.trim() || !out.date) return;
        locations.push({ id: `${ROUTE_LOCATION_PREFIX}${out.id}-end`, name: out.destination.trim(), startDate: out.date, endDate: out.date, description: 'Day trip', coordinates: out.destLat != null && out.destLng != null ? { lat: out.destLat, lng: out.destLng } : undefined });
    });

    return { transports: [...kept, ...route], locations };
};

/** 1-based day of the trip a date falls on, or 0 outside it. */
export const dayNumber = (trip: Trip, date: string): number => {
    if (!trip.startDate || !date) return 0;
    const n = Math.round((Date.parse(`${date.slice(0, 10)}T00:00:00Z`) - Date.parse(`${trip.startDate.slice(0, 10)}T00:00:00Z`)) / 86_400_000) + 1;
    return n >= 1 ? n : 0;
};
