import type { Transport, Trip } from '../types';
import { calculateDistance, getCoordinatesSync } from '../services/geocoding';
import { getAirportTimezone, getCarrierName, getCityName, getFlightArrivalUtcDate, getFlightDepartureUtcDate, getFlightStatusTags, parseLocalDateInTimezone } from './flightData';

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
const kmCache = new Map<string, number>();
export const journeyKm = (t: Transport): number => {
    if (t.distance && t.distance > 0) return t.distance;
    // Looking two places up for every row on every render is slow for a long log: remember the answer.
    const key = `${t.origin}|${t.destination}|${t.originLat}|${t.originLng}|${t.destLat}|${t.destLng}`;
    const hit = kmCache.get(key);
    if (hit !== undefined) return hit;
    const a = pointOf(t.origin, t.originLat, t.originLng);
    const b = pointOf(t.destination, t.destLat, t.destLng);
    const km = a && b ? calculateDistance(a.lat, a.lng, b.lat, b.lng) : 0;
    if (km > 0) kmCache.set(key, km);
    return km;
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
    cost: number;
}

const EARTH_KM = 40075;
export const aroundTheWorld = (km: number) => km / EARTH_KM;

/** The totals of a list of journeys. Cancelled ones don't count towards distance, time or places. */
export const journeyTotals = (items: JourneyRecord[], now = Date.now()): JourneyTotals => {
    const places = new Set<string>();
    const carriers = new Set<string>();
    const countries = new Set<string>();
    let km = 0, minutes = 0, upcoming = 0, cost = 0;
    for (const { flight: t } of items) {
        const cancelled = journeyStatus(t, now).state === 'cancelled';
        if (depMs(t) >= now && !cancelled) upcoming += 1;
        if (cancelled) continue;
        km += journeyKm(t);
        minutes += journeyMinutes(t);
        cost += t.cost || 0;
        [t.origin, t.destination].forEach(p => { if (p?.trim()) places.add(placeCode(p)); });
        if (t.provider?.trim()) carriers.add(carrierLabel(t).toLowerCase());
        const a = pointOf(t.origin, t.originLat, t.originLng);
        const b = pointOf(t.destination, t.destLat, t.destLng);
        [a, b].forEach(p => { if (p?.countryCode) countries.add(p.countryCode.toUpperCase()); });
    }
    return { count: items.length, upcoming, km, minutes, airports: places.size, carriers: carriers.size, countries: countries.size, cost };
};

/* ------------------------------------------------------------------ */
/* Years, journeys (flights that belong together) and layovers         */
/* ------------------------------------------------------------------ */

export const yearOf = (r: JourneyRecord): string => (r.flight.departureDate || '').slice(0, 4) || 'Undated';

export interface YearTotals { year: string; count: number; km: number; minutes: number; cost: number }

/** Flights, kilometres and time per year, oldest first, with the years in between that have none. */
export const totalsByYear = (items: JourneyRecord[]): YearTotals[] => {
    const map = new Map<string, YearTotals>();
    for (const r of items) {
        if (journeyStatus(r.flight).state === 'cancelled') continue;
        const year = yearOf(r);
        if (!/^\d{4}$/.test(year)) continue;
        const row = map.get(year) ?? { year, count: 0, km: 0, minutes: 0, cost: 0 };
        row.count += 1;
        row.km += journeyKm(r.flight);
        row.minutes += journeyMinutes(r.flight);
        row.cost += r.flight.cost || 0;
        map.set(year, row);
    }
    const years = [...map.keys()].map(Number).sort((a, b) => a - b);
    if (years.length === 0) return [];
    const out: YearTotals[] = [];
    for (let y = years[0]; y <= years[years.length - 1]; y++) out.push(map.get(String(y)) ?? { year: String(y), count: 0, km: 0, minutes: 0, cost: 0 });
    return out;
};

/** Minutes between one leg's arrival and the next leg's departure when they meet at the same place; 0 otherwise. */
export const layoverMinutes = (a: Transport, b: Transport): number => {
    if (!a.destination || !b.origin || a.destination.trim().toUpperCase() !== b.origin.trim().toUpperCase()) return 0;
    const gap = Math.floor((depMs(b) - arrMs(a)) / 60000);
    return Number.isFinite(gap) && gap > 0 ? gap : 0;
};

/** Splits chronological legs into the way out and the way back: the turnaround is the longest stay before a leg that returns to the start. */
export const splitLegs = (legs: JourneyRecord[]): { outbound: JourneyRecord[]; returns: JourneyRecord[] } => {
    const sorted = [...legs].sort((a, b) => depMs(a.flight) - depMs(b.flight));
    if (sorted.length < 2) return { outbound: sorted, returns: [] };
    const home = sorted[0].flight.origin;
    if (!sorted.some((r, i) => i > 0 && r.flight.destination === home)) return { outbound: sorted, returns: [] };
    let best = 1;
    let longest = -1;
    for (let k = 1; k < sorted.length; k++) {
        if (!sorted.slice(k).some(r => r.flight.destination === home)) continue;
        const stay = depMs(sorted[k].flight) - arrMs(sorted[k - 1].flight);
        if (stay > longest) { longest = stay; best = k; }
    }
    return { outbound: sorted.slice(0, best), returns: sorted.slice(best) };
};

export interface JourneyGroup {
    id: string;
    trip: Trip;
    /** Chronological. */
    legs: JourneyRecord[];
    outbound: JourneyRecord[];
    returns: JourneyRecord[];
}

export type JourneyUnit = { kind: 'single'; rec: JourneyRecord } | { kind: 'journey'; group: JourneyGroup };

/**
 * Flights that belong together: the flights of one trip, or independent flights saved on the same
 * booking (same itinerary). Two or more make a journey; the rest stay single. The order of `items`
 * is kept, each journey sitting where its first flight was.
 */
export const groupJourneys = (items: JourneyRecord[]): JourneyUnit[] => {
    const keyOf = (r: JourneyRecord) => (isIndependent(r.trip.id) ? (r.flight.itineraryId ? `it:${r.flight.itineraryId}` : '') : `trip:${r.trip.id}`);
    const buckets = new Map<string, JourneyRecord[]>();
    for (const r of items) { const k = keyOf(r); if (k) buckets.set(k, [...(buckets.get(k) || []), r]); }
    const seen = new Set<string>();
    const out: JourneyUnit[] = [];
    for (const r of items) {
        const k = keyOf(r);
        const list = k ? buckets.get(k)! : [];
        if (list.length < 2) { out.push({ kind: 'single', rec: r }); continue; }
        if (seen.has(k)) continue;
        seen.add(k);
        const legs = [...list].sort((a, b) => depMs(a.flight) - depMs(b.flight));
        out.push({ kind: 'journey', group: { id: k, trip: r.trip, legs, ...(() => { const s = splitLegs(legs); return { outbound: s.outbound, returns: s.returns }; })() } });
    }
    return out;
};

/** The route of a journey as place codes: "AMS → JFK → AMS". */
export const journeyRoute = (legs: JourneyRecord[]): string[] => {
    const out: string[] = [];
    legs.forEach((r, i) => {
        if (i === 0) out.push(placeCode(r.flight.origin));
        else if (placeCode(legs[i - 1].flight.destination) !== placeCode(r.flight.origin)) out.push(placeCode(r.flight.origin));
        out.push(placeCode(r.flight.destination));
    });
    return out;
};

/** The two ends of a journey as [longitude, latitude], when both places are known. */
export const journeyEnds = (t: Transport): { from: [number, number]; to: [number, number] } | undefined => {
    const a = pointOf(t.origin, t.originLat, t.originLng);
    const b = pointOf(t.destination, t.destLat, t.destLng);
    return a && b ? { from: [a.lng, a.lat], to: [b.lng, b.lat] } : undefined;
};

export interface RouteLine { from: [number, number]; to: [number, number]; count: number; label: string }

/** Distinct routes (either direction counts as one) with how often they were flown. */
export const routeLines = (items: JourneyRecord[]): RouteLine[] => {
    const map = new Map<string, RouteLine>();
    for (const r of items) {
        if (journeyStatus(r.flight).state === 'cancelled') continue;
        const ends = journeyEnds(r.flight);
        if (!ends) continue;
        const a = placeCode(r.flight.origin), b = placeCode(r.flight.destination);
        const key = [a, b].sort().join('-');
        const row = map.get(key);
        if (row) row.count += 1; else map.set(key, { ...ends, count: 1, label: `${a} to ${b}` });
    }
    return [...map.values()];
};

/** How far along a journey is, 0 to 1, by the clock; 0 before departure and 1 after arrival. */
export const journeyProgress = (t: Transport, now = Date.now()): number => {
    const dep = depMs(t), arr = arrMs(t);
    if (!Number.isFinite(dep) || !Number.isFinite(arr) || arr <= dep) return now >= arr ? 1 : 0;
    return Math.min(1, Math.max(0, (now - dep) / (arr - dep)));
};

/** True while a journey is under way, or leaves within `hours` (the time to start following it live). */
export const isLiveWindow = (t: Transport, hours = 3, now = Date.now()): boolean => {
    if (journeyStatus(t, now).state === 'cancelled') return false;
    const dep = depMs(t), arr = arrMs(t);
    return now >= dep - hours * 3_600_000 && now <= arr + 3_600_000;
};


/* ------------------------------------------------------------------ */
/* Breakdowns, filters and estimates                                    */
/* ------------------------------------------------------------------ */

export interface Tally { label: string; count: number; km: number; cost: number; key: string }

const tally = (items: JourneyRecord[], keysOf: (r: JourneyRecord) => { key: string; label: string }[]): Tally[] => {
    const map = new Map<string, Tally>();
    for (const r of items) {
        if (journeyStatus(r.flight).state === 'cancelled') continue;
        for (const { key, label } of keysOf(r)) {
            if (!key) continue;
            const row = map.get(key) ?? { key, label, count: 0, km: 0, cost: 0 };
            row.count += 1;
            row.km += journeyKm(r.flight);
            row.cost += r.flight.cost || 0;
            map.set(key, row);
        }
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
};

/** Flights per airline, most flown first. */
export const byCarrier = (items: JourneyRecord[]): Tally[] =>
    tally(items, r => { const name = carrierLabel(r.flight).trim(); return name ? [{ key: name.toLowerCase(), label: name }] : []; });

/** Visits per airport (each end of a flight counts), most visited first. */
export const byAirport = (items: JourneyRecord[]): Tally[] =>
    tally(items, r => [r.flight.origin, r.flight.destination].filter(p => p?.trim()).map(p => ({ key: placeCode(p), label: `${placeCode(p)} ${placeName(p)}`.trim() })));

/** Flights per cabin class. */
export const byClass = (items: JourneyRecord[]): Tally[] =>
    tally(items, r => [{ key: r.flight.travelClass || 'Unknown', label: r.flight.travelClass || 'No class' }]);

/** Great-circle estimate of how long a flight takes: 30 minutes on the ground plus the distance at 800 km/h. */
export const estimateMinutes = (km: number): number => (km > 0 ? Math.round(30 + (km / 800) * 60) : 0);

/**
 * The same flight number logged before: its times are the best guess for another day (airlines keep a flight's
 * schedule for a season). Gives the newest earlier entry with times, or null.
 */
export const fromLog = (items: JourneyRecord[], flightNumber: string): Transport | null => {
    const want = flightNumber.replace(/\s|-/g, '').toUpperCase();
    if (!want) return null;
    const same = items
        .map(r => r.flight)
        .filter(t => (t.identifier || '').replace(/\s|-/g, '').toUpperCase() === want && t.departureTime && t.arrivalTime && t.origin && t.destination)
        .sort((a, b) => (b.departureDate || '').localeCompare(a.departureDate || ''));
    return same[0] ?? null;
};

const zoneOf = (iata: string): string | undefined => getAirportTimezone(iata.trim().toUpperCase()) || getCoordinatesSync(iata)?.tz;

/**
 * Local arrival date and time at the destination for a flight that leaves at a local time and takes
 * `minutes`, using each airport's own time zone. Null when a time zone can't be found.
 */
export const localArrival = (origin: string, destination: string, date: string, time: string, minutes: number): { date: string; time: string } | null => {
    const from = zoneOf(origin), to = zoneOf(destination);
    if (!from || !to || !date || !time) return null;
    const leaves = parseLocalDateInTimezone(date, time, from).getTime();
    if (!Number.isFinite(leaves)) return null;
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: to, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(leaves + minutes * 60000));
    const get = (t: string) => parts.find(p => p.type === t)?.value || '';
    return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
};
