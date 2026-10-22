import type { Transport, Trip } from '../types';
import { calculateDistance, getCoordinatesSync } from '../services/geocoding';
import { knownZone } from '../services/timezone';
import { footprintKg } from './footprint';
import { getAirportTimezone, getCarrierName, getCityName, getFlightArrivalUtcDate, getFlightDepartureUtcDate, getFlightStatusTags, parseLocalDateInTimezone } from './flightData';

/**
 * What the Flights and Road trips pages (and their sheet, table and board) need to know about one
 * journey: its status now, how long and how far it is, how a list sorts, and the totals shown in the
 * header. Mode-aware, so the same code serves flights, trains, buses, ferries and cars.
 */

export type JourneyRecord = { flight: Transport; trip: Trip };

export const isIndependent = (tripId: string) => tripId === 'unassigned' || tripId.startsWith('unassigned');

/**
 * IATA-style code when the value is short, otherwise the start of the place name. For a land or sea journey
 * (`mode` other than Flight) there are no codes: the label is the place's own name up to the first comma
 * ("Amsterdam", "Gare du Nord"), shortened with an ellipsis when it is long.
 */
export const placeCode = (value: string, mode?: string): string => {
    const v = (value || '').trim();
    if (!v) return '—';
    if (mode && mode !== 'Flight') {
        const name = v.split(/[,(]/)[0].trim() || v;
        return name.length <= 16 ? name : `${name.slice(0, 15)}…`;
    }
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
/** How much longer the real route is than the straight line, by mode (roads wind, rails less, sea lanes go round land). Flights fly the straight line. */
export const CIRCUITY: Record<string, number> = { Train: 1.2, Bus: 1.3, 'Car Rental': 1.3, 'Personal Car': 1.3, Ferry: 1.15, Cruise: 1.25 };

export const journeyKm = (t: Transport): number => {
    if (t.distance && t.distance > 0) return t.distance;
    // Looking two places up for every row on every render is slow for a long log: remember the answer.
    const key = `${t.origin}|${t.destination}|${t.originLat}|${t.originLng}|${t.destLat}|${t.destLng}`;
    const hit = kmCache.get(key);
    if (hit !== undefined) return hit;
    const a = pointOf(t.origin, t.originLat, t.originLng);
    const b = pointOf(t.destination, t.destLat, t.destLng);
    const km = a && b ? calculateDistance(a.lat, a.lng, b.lat, b.lng) * (t.mode === 'Flight' || !t.mode ? 1 : CIRCUITY[t.mode] ?? 1.25) : 0;
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
            case 'route': return `${placeCode(t.origin, t.mode)} ${placeCode(t.destination, t.mode)}`;
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
        [t.origin, t.destination].forEach(p => { if (p?.trim()) places.add(placeCode(p, t.mode)); });
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

export interface YearTotals { year: string; count: number; km: number; minutes: number; cost: number; co2: number }

/** A rule-of-thumb estimate (kg CO₂ for one passenger) from distance and cabin; not a measured figure. */
export const flightCo2 = (t: Transport): number => {
    if (journeyStatus(t).state === 'cancelled') return 0;
    return Math.round(footprintKg(t));
};

export const totalCo2 = (items: JourneyRecord[]): number => items.reduce((n, r) => n + flightCo2(r.flight), 0);

export interface RouteTally { key: string; from: string; to: string; count: number; km: number }

/** The route flown most often; a pair counts both ways (AMS→JFK and JFK→AMS are one route). */
export const mostFlownRoute = (items: JourneyRecord[]): RouteTally | null => {
    const map = new Map<string, RouteTally>();
    for (const r of items) {
        const { origin, destination } = r.flight;
        if (!origin?.trim() || !destination?.trim() || journeyStatus(r.flight).state === 'cancelled') continue;
        const a = placeCode(origin), b = placeCode(destination);
        if (a === b) continue;
        const [from, to] = a < b ? [a, b] : [b, a];
        const key = `${from}-${to}`;
        const row = map.get(key) ?? { key, from, to, count: 0, km: 0 };
        row.count += 1;
        row.km += journeyKm(r.flight);
        map.set(key, row);
    }
    return [...map.values()].sort((x, y) => y.count - x.count || y.km - x.km)[0] ?? null;
};

/** Percent change from the previous year to this one; null when there is nothing to compare with. */
export const yearChange = (years: YearTotals[], key: 'count' | 'km' | 'minutes' | 'cost' | 'co2', year: string): number | null => {
    const now = years.find(y => y.year === year);
    const before = years.find(y => y.year === String(Number(year) - 1));
    if (!now || !before || before[key] <= 0) return null;
    return Math.round(((now[key] - before[key]) / before[key]) * 100);
};

/** Flights, kilometres and time per year, oldest first, with the years in between that have none. */
export const totalsByYear = (items: JourneyRecord[]): YearTotals[] => {
    const map = new Map<string, YearTotals>();
    for (const r of items) {
        if (journeyStatus(r.flight).state === 'cancelled') continue;
        const year = yearOf(r);
        if (!/^\d{4}$/.test(year)) continue;
        const row = map.get(year) ?? { year, count: 0, km: 0, minutes: 0, cost: 0, co2: 0 };
        row.count += 1;
        row.co2 += flightCo2(r.flight);
        row.km += journeyKm(r.flight);
        row.minutes += journeyMinutes(r.flight);
        row.cost += r.flight.cost || 0;
        map.set(year, row);
    }
    const years = [...map.keys()].map(Number).sort((a, b) => a - b);
    if (years.length === 0) return [];
    const out: YearTotals[] = [];
    for (let y = years[0]; y <= years[years.length - 1]; y++) out.push(map.get(String(y)) ?? { year: String(y), count: 0, km: 0, minutes: 0, cost: 0, co2: 0 });
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

/** What a journey is: one-way flights joined by connections, there and back, or several cities. */
export type JourneyShape = 'connection' | 'round-trip' | 'multi-city';

export interface JourneyGroup {
    id: string;
    trip: Trip;
    /** Chronological. */
    legs: JourneyRecord[];
    outbound: JourneyRecord[];
    returns: JourneyRecord[];
    shape: JourneyShape;
    /** Changes of plane inside a leg of the journey (connections of 24 hours or less). */
    stops: number;
    /** Where the group came from: a trip, a shared booking or itinerary, or found by matching the flights up. */
    source: 'trip' | 'booking' | 'detected' | 'manual';
}

export type JourneyUnit = { kind: 'single'; rec: JourneyRecord } | { kind: 'journey'; group: JourneyGroup };

/** The longest wait that still counts as a connection, and the longest stay between legs of one multi-city or return journey. */
const CONNECTION_MS = 24 * 3_600_000;
const STAY_MS = 21 * 86_400_000;
const SAME = (a: string, b: string, mode?: string) => placeCode(a, mode).toLowerCase() === placeCode(b, mode).toLowerCase();

/**
 * Finds the journeys among flights that are on no trip and share no booking. Starting from the earliest
 * unplaced flight, the next leg is the first later flight that leaves from where the last one landed:
 * within 24 hours it is a connection; within three weeks it is a stay, and the chain is kept only if it
 * gets back to where it began (a return, or a multi-city loop). A chain that never gets home keeps just
 * its connections.
 */
const detect = (flights: JourneyRecord[]): JourneyRecord[][] => {
    const left = [...flights].sort((a, b) => depMs(a.flight) - depMs(b.flight));
    const used = new Set<string>();
    const out: JourneyRecord[][] = [];
    const nextLeg = (last: JourneyRecord, maxGap: number): JourneyRecord | undefined =>
        left.find(c => {
            if (used.has(c.flight.id) || c.flight.id === last.flight.id) return false;
            if (!SAME(c.flight.origin, last.flight.destination, c.flight.mode)) return false;
            const gap = depMs(c.flight) - arrMs(last.flight);
            return gap >= 0 && gap <= maxGap;
        });
    for (const first of left) {
        if (used.has(first.flight.id)) continue;
        const take = (list: JourneyRecord[]) => { list.forEach(r => used.add(r.flight.id)); out.push(list); };
        // Everything reachable within a stay, to see whether it gets home.
        const chain = [first];
        used.add(first.flight.id);
        let guard = 0;
        while (guard++ < 12) {
            const n = nextLeg(chain[chain.length - 1], STAY_MS);
            if (!n) break;
            chain.push(n);
            used.add(n.flight.id);
            if (SAME(n.flight.destination, first.flight.origin, n.flight.mode)) break;
        }
        chain.forEach(r => used.delete(r.flight.id));
        const home = chain.length > 1 && SAME(chain[chain.length - 1].flight.destination, first.flight.origin, chain[chain.length - 1].flight.mode);
        if (home) { take(chain); continue; }
        // No way home: only the connections stay together.
        const conn = [first];
        used.add(first.flight.id);
        for (;;) {
            const n = nextLeg(conn[conn.length - 1], CONNECTION_MS);
            if (!n) break;
            conn.push(n);
            used.add(n.flight.id);
        }
        conn.forEach(r => used.delete(r.flight.id));
        take(conn);
    }
    return out.filter(g => g.length > 1);
};

/** Shape and stop count of a chronological set of legs. */
const describe = (legs: JourneyRecord[]): { shape: JourneyShape; stops: number; outbound: JourneyRecord[]; returns: JourneyRecord[] } => {
    const s = splitLegs(legs);
    const home = legs.length > 1 && SAME(legs[legs.length - 1].flight.destination, legs[0].flight.origin, legs[legs.length - 1].flight.mode);
    let stops = 0;
    legs.forEach((r, i) => { if (i > 0 && SAME(r.flight.origin, legs[i - 1].flight.destination, r.flight.mode) && depMs(r.flight) - arrMs(legs[i - 1].flight) <= CONNECTION_MS) stops += 1; });
    // Where the person stayed: a leg's destination when the next leg leaves later than a connection (or there is no next leg).
    const stays = new Set<string>();
    legs.forEach((r, i) => {
        const next = legs[i + 1];
        const connects = next && SAME(next.flight.origin, r.flight.destination, next.flight.mode) && depMs(next.flight) - arrMs(r.flight) <= CONNECTION_MS;
        const end = placeCode(r.flight.destination, r.flight.mode);
        if (!connects && end !== placeCode(legs[0].flight.origin, legs[0].flight.mode)) stays.add(end);
    });
    const shape: JourneyShape = stays.size >= 2 ? 'multi-city' : home && s.returns.length ? 'round-trip' : 'connection';
    return { shape, stops, outbound: s.outbound, returns: s.returns };
};

/**
 * Flights that belong together, so a journey reads as one row: the flights of one trip; independent flights
 * on the same booking (itinerary or confirmation code); and, for the rest, connections, returns and
 * multi-city journeys found by matching airports and dates (see `detect`). Two or more make a journey; the
 * rest stay single. The order of `items` is kept, each journey sitting where its first flight was.
 */
export const groupJourneys = (items: JourneyRecord[]): JourneyUnit[] => {
    const keyOf = (r: JourneyRecord): { key: string; source: JourneyGroup['source'] } | null => {
        if (!isIndependent(r.trip.id)) return { key: `trip:${r.trip.id}`, source: 'trip' };
        if (r.flight.confirmationCode?.trim()) return { key: `pnr:${r.flight.confirmationCode.trim().toUpperCase()}`, source: 'booking' };
        if (r.flight.itineraryId) return { key: `it:${r.flight.itineraryId}`, source: 'booking' };
        return null;
    };
    // Choices made by hand come first: "alone" legs stay single, and legs sharing a `j:` key form one journey.
    const manual = new Map<string, JourneyRecord[]>();
    for (const r of items) { const k = r.flight.journeyKey; if (k?.startsWith('j:')) manual.set(k, [...(manual.get(k) || []), r]); }
    const joined = new Set<string>();
    for (const list of manual.values()) if (list.length >= 2) list.forEach(r => joined.add(r.flight.id));
    const pool = items.filter(r => r.flight.journeyKey !== 'alone' && !joined.has(r.flight.id));
    const buckets = new Map<string, { list: JourneyRecord[]; source: JourneyGroup['source'] }>();
    for (const r of pool) {
        const k = keyOf(r);
        if (k) { const b = buckets.get(k.key) ?? { list: [], source: k.source }; b.list.push(r); buckets.set(k.key, b); }
    }
    // Booking groups of one flight don't count: those flights go on to the matching step.
    const placed = new Set<string>();
    const groups: { id: string; list: JourneyRecord[]; source: JourneyGroup['source']; trip: Trip }[] = [];
    for (const [id, b] of buckets) {
        if (b.list.length < 2) continue;
        b.list.forEach(r => placed.add(r.flight.id));
        groups.push({ id, list: b.list, source: b.source, trip: b.list[0].trip });
    }
    for (const [id, list] of manual) {
        if (list.length < 2) continue;
        list.forEach(r => placed.add(r.flight.id));
        groups.push({ id, list, source: 'manual', trip: list[0].trip });
    }
    const loose = pool.filter(r => isIndependent(r.trip.id) && !placed.has(r.flight.id));
    for (const list of detect(loose)) {
        const sorted = [...list].sort((a, b) => depMs(a.flight) - depMs(b.flight));
        list.forEach(r => placed.add(r.flight.id));
        groups.push({ id: `auto:${sorted[0].flight.id}`, list, source: 'detected', trip: sorted[0].trip });
    }
    const byFlight = new Map<string, typeof groups[number]>();
    groups.forEach(g => g.list.forEach(r => byFlight.set(r.flight.id, g)));
    const seen = new Set<string>();
    const out: JourneyUnit[] = [];
    for (const r of items) {
        const g = byFlight.get(r.flight.id);
        if (!g) { out.push({ kind: 'single', rec: r }); continue; }
        if (seen.has(g.id)) continue;
        seen.add(g.id);
        const legs = [...g.list].sort((a, b) => depMs(a.flight) - depMs(b.flight));
        out.push({ kind: 'journey', group: { id: g.id, trip: g.trip, legs, source: g.source, ...describe(legs) } });
    }
    return out;
};

/** The route of a journey as place codes: "AMS → JFK → AMS". */
export const journeyRoute = (legs: JourneyRecord[]): string[] => {
    const out: string[] = [];
    legs.forEach((r, i) => {
        if (i === 0) out.push(placeCode(r.flight.origin, r.flight.mode));
        else if (placeCode(legs[i - 1].flight.destination, legs[i - 1].flight.mode) !== placeCode(r.flight.origin, r.flight.mode)) out.push(placeCode(r.flight.origin, r.flight.mode));
        out.push(placeCode(r.flight.destination, r.flight.mode));
    });
    return out;
};

/** The two ends of a journey as [longitude, latitude], when both places are known. */
export const journeyEnds = (t: Transport): { from: [number, number]; to: [number, number] } | undefined => {
    const a = pointOf(t.origin, t.originLat, t.originLng);
    const b = pointOf(t.destination, t.destLat, t.destLng);
    return a && b ? { from: [a.lng, a.lat], to: [b.lng, b.lat] } : undefined;
};

/** `sea` marks a ferry or cruise route (drawn along its shipping lane); `path` is that lane once found. */
export interface RouteLine { from: [number, number]; to: [number, number]; count: number; label: string; sea?: boolean; /** Stops along the way with a position, in order. */ via?: [number, number][]; path?: [number, number][] }

/** Distinct routes (either direction counts as one) with how often they were flown. */
export const routeLines = (items: JourneyRecord[]): RouteLine[] => {
    const map = new Map<string, RouteLine>();
    for (const r of items) {
        if (journeyStatus(r.flight).state === 'cancelled') continue;
        const ends = journeyEnds(r.flight);
        if (!ends) continue;
        const a = placeCode(r.flight.origin, r.flight.mode), b = placeCode(r.flight.destination, r.flight.mode);
        const via: [number, number][] = r.flight.mode === 'Flight' ? [] : (r.flight.waypoints || []).filter(w => w.coordinates).map(w => [w.coordinates!.lng, w.coordinates!.lat] as [number, number]);
        // Stops are part of what makes a route the same route: Stockholm to Helsinki direct is not the same as via Åland.
        const key = [[a, b].sort().join('-'), via.map(v => v.join(',')).join(';')].join('|');
        const row = map.get(key);
        if (row) row.count += 1;
        else map.set(key, { ...ends, count: 1, label: `${a} to ${b}`, sea: r.flight.mode === 'Ferry' || r.flight.mode === 'Cruise', via: via.length ? via : undefined });
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
    tally(items, r => [r.flight.origin, r.flight.destination].filter(p => p?.trim()).map(p => ({ key: placeCode(p, r.flight.mode), label: r.flight.mode && r.flight.mode !== 'Flight' ? placeName(p) : `${placeCode(p)} ${placeName(p)}`.trim() })));

/** Who flew a leg: the people marked on it, else everyone on its trip. */
export const passengersOf = (r: JourneyRecord): string[] =>
    r.flight.passengers ?? (isIndependent(r.trip.id) ? [] : r.trip.participants || []);

/** Flights per person, most flown first; empty when fewer than two people appear anywhere. */
export const byPassenger = (items: JourneyRecord[]): Tally[] => {
    const rows = tally(items, r => passengersOf(r).filter(n => n?.trim()).map(n => ({ key: n.trim().toLowerCase(), label: n.trim() })));
    return rows.length >= 2 ? rows : [];
};

/** Flights per cabin class. */
export const byClass = (items: JourneyRecord[]): Tally[] =>
    tally(items, r => [{ key: r.flight.travelClass || 'Unknown', label: r.flight.travelClass || 'No class' }]);

/**
 * An estimate of how long a flight takes (block time, gate to gate). The average speed rises with distance
 * because short hops spend most of the time climbing and descending: about 500 km/h over 100 km, 830 km/h
 * from roughly 2,700 km, plus 30 minutes of taxi and approach. Over 3,000 km the jet stream adds up to 7%
 * westbound and takes up to 7% off eastbound: `eastward` is the east-west share of the heading (+1 due east,
 * -1 due west). Checked against real schedules, it lands within about 10%.
 */
export const estimateMinutes = (km: number, eastward = 0): number => {
    if (!(km > 0)) return 0;
    const speed = Math.min(830, 500 + km * 0.12);
    const wind = 1 - 0.07 * Math.max(-1, Math.min(1, eastward)) * Math.min(1, Math.max(0, (km - 3000) / 3000));
    return Math.round(30 + (km / speed) * 60 * wind);
};

/** The east-west share of the initial heading from one place to another: +1 due east, -1 due west, 0 when unknown. */
export const eastwardShare = (t: Pick<Transport, 'origin' | 'destination' | 'originLat' | 'originLng' | 'destLat' | 'destLng'>): number => {
    const a = pointOf(t.origin, t.originLat, t.originLng);
    const b = pointOf(t.destination, t.destLat, t.destLng);
    if (!a || !b) return 0;
    const rad = Math.PI / 180;
    let dLon = (b.lng - a.lng) * rad;
    if (dLon > Math.PI) dLon -= 2 * Math.PI;
    if (dLon < -Math.PI) dLon += 2 * Math.PI;
    return Math.sin(Math.atan2(Math.sin(dLon) * Math.cos(b.lat * rad), Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos(dLon)));
};

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

const zoneOf = (iata: string): string | undefined => getAirportTimezone(iata.trim().toUpperCase()) || getCoordinatesSync(iata)?.tz || knownZone(iata);

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

/**
 * Minutes that really pass between a local departure and a local arrival, using the time zone of each
 * place when both are known (a train from London to Paris arrives an hour "later" on the clock), and
 * the plain clock gap when not.
 */
export const elapsedMinutes = (origin: string, destination: string, depDate: string, depTime: string, arrDate: string, arrTime: string): number => {
    const clock = (Date.parse(`${arrDate}T${arrTime || '00:00'}:00Z`) - Date.parse(`${depDate}T${depTime || '00:00'}:00Z`)) / 60000;
    if (!Number.isFinite(clock)) return 0;
    const from = zoneOf(origin), to = zoneOf(destination);
    if (from && to && from !== to) {
        const dep = parseLocalDateInTimezone(depDate, depTime || '00:00', from).getTime();
        const arr = parseLocalDateInTimezone(arrDate, arrTime || '00:00', to).getTime();
        if (Number.isFinite(dep) && Number.isFinite(arr)) return Math.max(0, Math.round((arr - dep) / 60000));
    }
    return Math.max(0, Math.round(clock));
};

/* ------------------------------------------------------------------ */
/* Land and sea (Road trips)                                            */
/* ------------------------------------------------------------------ */

/** Average speeds in km/h the old Road trips page used to guess a distance or a time. */
export const MODE_SPEED_KMH: Record<string, number> = { Train: 120, Bus: 70, 'Car Rental': 90, 'Personal Car': 95, Cruise: 30, Ferry: 40, Flight: 800 };

/** A guess of how long a land or sea journey takes from its distance: the distance at the mode's average speed. */
export const estimateMinutesFor = (mode: string | undefined, km: number): number =>
    km > 0 ? Math.round((km / (MODE_SPEED_KMH[mode || ''] || 80)) * 60) : 0;

/** Journeys per mode, most used first. */
export const byMode = (items: JourneyRecord[]): Tally[] =>
    tally(items, r => [{ key: r.flight.mode, label: r.flight.mode }]);

/* ------------------------------------------------------------------ */
/* Progress of a journey under way, from real data when there is any    */
/* ------------------------------------------------------------------ */

export interface LiveInput {
    /** Where the aircraft or vehicle is now. */
    position?: { lat: number; lng: number } | null;
    /** Estimated (or actual) departure and arrival from a live source, as UTC ISO strings. */
    departureUtc?: string | null;
    arrivalUtc?: string | null;
}

export interface LiveProgress {
    /** 0 to 1 along the route. */
    progress: number;
    /** Estimated arrival, epoch ms. */
    etaMs: number | null;
    /** Minutes later (positive) or earlier than scheduled; 0 when unknown. */
    delayMin: number;
    /** What the progress came from. */
    basis: 'position' | 'times' | 'clock';
}

const haversine = (a: [number, number], b: [number, number]) => calculateDistance(a[1], a[0], b[1], b[0]);

/**
 * How far along a journey is and when it will arrive. The best answer is the real position (how far the
 * aircraft is along the great circle between its two airports); next the live estimated times; last the
 * schedule. A late flight shows its real ETA and delay instead of the schedule's.
 */
export const liveProgress = (t: Transport, live: LiveInput | undefined, now = Date.now()): LiveProgress => {
    const schedDep = depMs(t), schedArr = arrMs(t);
    const dep = live?.departureUtc ? Date.parse(live.departureUtc) : schedDep;
    const arr = live?.arrivalUtc ? Date.parse(live.arrivalUtc) : schedArr;
    const etaMs = Number.isFinite(arr) ? arr : null;
    const delayMin = etaMs != null && Number.isFinite(schedArr) ? Math.round((etaMs - schedArr) / 60000) : 0;
    const clamp = (n: number) => Math.min(1, Math.max(0, n));

    const ends = journeyEnds(t);
    if (live?.position && ends) {
        const pos: [number, number] = [live.position.lng, live.position.lat];
        const done = haversine(ends.from, pos);
        const left = haversine(pos, ends.to);
        if (done + left > 0) return { progress: clamp(done / (done + left)), etaMs, delayMin, basis: 'position' };
    }
    const span = (Number.isFinite(dep) && Number.isFinite(arr)) ? arr - dep : 0;
    const progress = span > 0 ? clamp((now - dep) / span) : now >= arr ? 1 : 0;
    return { progress, etaMs, delayMin, basis: live?.departureUtc || live?.arrivalUtc ? 'times' : 'clock' };
};

/** Minutes a flight takes from its local departure and arrival times, using each airport's own time zone; null when a zone is unknown. */
export const durationBetween = (origin: string, destination: string, depDate: string, depTime: string, arrDate: string, arrTime: string): number | null => {
    const from = zoneOf(origin), to = zoneOf(destination);
    if (!from || !to) return null;
    const dep = parseLocalDateInTimezone(depDate, depTime || '00:00', from).getTime();
    const arr = parseLocalDateInTimezone(arrDate || depDate, arrTime || '00:00', to).getTime();
    const mins = Math.round((arr - dep) / 60000);
    return Number.isFinite(mins) && mins > 0 ? mins : null;
};
