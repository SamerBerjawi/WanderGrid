import type { Trip, VisitedItem } from '../types';
import { cleanCityName } from '../services/geocoding';
import { cityKey, isUnknownPlaceName, splitCombinedPlaces } from '../services/cityRegistry';
import { distanceKm } from '../services/placeSearch';
import { normalizeCountryCode } from '../services/countryRegistry';

/**
 * Where an Atlas city comes from, and how to give it a name everywhere at once.
 *
 * The Atlas derives cities from the user's own records: stored visited cities, trip locations, route stops,
 * stops on a transport, road trip ends and waypoints, and the city a flight lands in. A place with no usable
 * name ("Unknown", "Dropped pin", bare coordinates) is therefore a field in one or more of those records.
 * `findCitySources` lists those fields and `planNameWriteBack` builds the edits that put a name in all of them
 * (plus the stored city), as plain data: the records to write, the originals for Undo, and what was skipped.
 * Coordinates are never touched. Pure; nothing here writes.
 */

export type SourceKind =
    | 'visited'
    | 'trip.location'
    | 'trip.stop'
    | 'trip.waypoint'
    | 'transport.origin'
    | 'transport.destination'
    | 'transport.waypoint'
    | 'flight.destCity';

export interface CitySource {
    /** Unique per field, stable between calls. */
    key: string;
    kind: SourceKind;
    /** The record that holds the field: visited id, trip id (trip.*), transport id (transport.*, flight.*). */
    recordId: string;
    /** The trip that holds the transport, when it is inside one (otherwise it is an independent record). */
    tripId?: string;
    /** The stop or waypoint inside the record. */
    entryId?: string;
    /** The text in the field now; a write only happens if it is still this. */
    current: string;
    /** For the list: "Trip: Summer in Porto · location". */
    label: string;
}

export interface AtlasRecords {
    visited: VisitedItem[];
    trips: Trip[];
    flights: any[];
    roadTrips: any[];
}

interface Spot { name: string; lat?: number; lng?: number; countryCode?: string }

const num = (v: unknown): number | undefined => {
    const n = typeof v === 'string' ? parseFloat(v) : (v as number);
    return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};

/** Sources closer than this to the city's coordinates are the same place. */
export const SAME_SPOT_KM = 2;

/** The fields that describe the place `city` (any atlas city; an unknown one is told apart by its coordinates), across all the user's records. */
export const findCitySources = (city: Spot, records: AtlasRecords): CitySource[] => {
    const unknown = isUnknownPlaceName(city.name);
    const wanted = cityKey(cleanCityName(city.name));
    const lat = num(city.lat);
    const lng = num(city.lng);
    const located = lat !== undefined && lng !== undefined;

    /** Same unknown place: nothing else says what it is, so the spot is the identity (no coordinates: also none). */
    const same = (raw: string | undefined, sLat?: unknown, sLng?: unknown, sCountry?: string) => {
        if (!raw) return false;
        if (!unknown) {
            // A named place is the same place by name (and country, when both say): "Amsterdam", "NRT".
            if (cityKey(cleanCityName(raw)) !== wanted) return false;
            const mine = normalizeCountryCode(city.countryCode || '');
            const theirs = normalizeCountryCode(sCountry || '');
            return !mine || mine === 'XX' || !theirs || theirs === 'XX' || mine === theirs;
        }
        if (!isUnknownPlaceName(cleanCityName(raw))) return false;
        const a = num(sLat);
        const b = num(sLng);
        if (!located) return a === undefined || b === undefined;
        if (a === undefined || b === undefined) return false;
        return distanceKm(lat!, lng!, a, b) <= SAME_SPOT_KM;
    };

    const out = new Map<string, CitySource>();
    const add = (s: CitySource) => { if (!out.has(s.key)) out.set(s.key, s); };

    records.visited.filter(v => v.type === 'city').forEach(v => {
        if (same(v.name, v.lat, v.lng, v.countryCode)) add({ key: `visited:${v.id}`, kind: 'visited', recordId: v.id, current: v.name, label: 'Saved in your atlas' });
    });

    const tripOf = new Map(records.trips.map(t => [t.id, t]));
    records.trips.filter(t => t.status !== 'Planning' && t.status !== 'Cancelled').forEach(t => {
        const tripName = t.name || t.location || 'Trip';
        const places = t.location ? splitCombinedPlaces(t.location) : [];
        places.forEach(place => {
            const single = places.length === 1;
            if (same(place, single ? t.coordinates?.lat : undefined, single ? t.coordinates?.lng : undefined, single ? t.coordinates?.countryCode : undefined)) {
                add({ key: `trip.location:${t.id}:${place}`, kind: 'trip.location', recordId: t.id, current: place, label: `Trip: ${tripName} · location` });
            }
        });
        t.locations?.forEach(l => {
            if (same(l.name, l.coordinates?.lat, l.coordinates?.lng)) {
                add({ key: `trip.stop:${t.id}:${l.id}`, kind: 'trip.stop', recordId: t.id, entryId: l.id, current: l.name, label: `Trip: ${tripName} · stop` });
            }
        });
        t.transports?.forEach(tr => tr.waypoints?.forEach(wp => {
            if (same(wp.name, wp.coordinates?.lat, wp.coordinates?.lng)) {
                add({ key: `trip.waypoint:${t.id}:${tr.id}:${wp.id}`, kind: 'trip.waypoint', recordId: t.id, tripId: t.id, entryId: wp.id, current: wp.name, label: `Trip: ${tripName} · stop on the way` });
            }
        }));
    });

    // Road trips and flights, as the atlas sees them (trip legs and independent records together).
    const holder = (r: any) => (r.tripId && tripOf.get(r.tripId)?.transports?.some(x => x.id === r.id) ? r.tripId as string : undefined);
    const where = (r: any) => (holder(r) ? `Trip: ${tripOf.get(r.tripId)?.name || 'trip'}` : r.name || 'Road trip');
    records.roadTrips.filter(r => r.status !== 'Cancelled').forEach(r => {
        const tripId = holder(r);
        if (same(r.origin, r.originLat ?? r.lat, r.originLng ?? r.lng)) {
            add({ key: `transport.origin:${r.id}`, kind: 'transport.origin', recordId: r.id, tripId, current: r.origin, label: `${where(r)} · start` });
        }
        if (same(r.destination, r.destLat ?? r.lat, r.destLng ?? r.lng)) {
            add({ key: `transport.destination:${r.id}`, kind: 'transport.destination', recordId: r.id, tripId, current: r.destination, label: `${where(r)} · destination` });
        }
        // A transport inside a trip is listed once, through the trip (trip.waypoint).
        if (!tripId) r.waypoints?.forEach((wp: any) => {
            if (same(wp.name, wp.coordinates?.lat, wp.coordinates?.lng)) {
                add({ key: `transport.waypoint:${r.id}:${wp.id}`, kind: 'transport.waypoint', recordId: r.id, tripId, entryId: wp.id, current: wp.name, label: `${where(r)} · stop` });
            }
        });
    });
    records.flights.filter(f => f.status !== 'Cancelled').forEach(f => {
        // Only a free-text city field is renamed; `destination` is an airport code and stays as it is.
        // The atlas uses destCity, or the destination's code when there is none; a new name goes into destCity either way.
        if ((f.destCity || f.destination) && same(f.destCity || f.destination, f.destLat, f.destLng, f.destCountryCode)) {
            add({ key: `flight.destCity:${f.id}`, kind: 'flight.destCity', recordId: f.id, tripId: holder(f), current: f.destCity || '', label: `Flight ${f.identifier || f.destination || ''}`.trim() });
        }
    });

    return Array.from(out.values());
};

/* ------------------------------------------------------------------ */
/* The write-back plan */
/* ------------------------------------------------------------------ */

export interface NameChoice {
    sources: CitySource[];
    /** The city name ("Porto"). */
    city: string;
    /** The name for free-text place fields ("Porto, Portugal"). */
    display: string;
    country?: { code: string; name: string };
    /** The person picked a real place: its country and coordinates replace the stored city's. */
    replace?: boolean;
    /** Coordinates of the place, for a stored city that has to be created or re-pointed. Never written into trips. */
    lat?: number;
    lng?: number;
}

export interface WriteBackContext {
    trips: Trip[];
    /** Records of the independent `flights` collection (flights and road trips that belong to no trip). */
    flights: any[];
    visited: VisitedItem[];
}

export interface NamePlan {
    trips: Trip[];
    flights: any[];
    visited: VisitedItem[];
    /** The records as they were, for Undo. */
    originals: { trips: Trip[]; flights: any[]; visited: VisitedItem[] };
    /** Stored cities the plan creates (Undo removes them). */
    createdVisitedIds: string[];
    /** Fields written. */
    written: number;
    /** Sources that no longer say what they said (changed since), so they were left alone. */
    skipped: CitySource[];
}

const slug = (s: string) => cityKey(s).replace(/\s+/g, '_') || 'city';

export const storedCityId = (city: string, countryCode: string) => `city_${slug(city)}_${countryCode.toLowerCase()}`;

const isUnknownCountry = (v: VisitedItem) => {
    const code = normalizeCountryCode(v.countryCode);
    return !code || code === 'XX';
};

export const planNameWriteBack = (choices: NameChoice[], ctx: WriteBackContext): NamePlan => {
    const originals = { trips: new Map<string, Trip>(), flights: new Map<string, any>(), visited: new Map<string, VisitedItem>() };
    const work = { trips: new Map<string, Trip>(), flights: new Map<string, any>(), visited: new Map<string, VisitedItem>() };
    const base = {
        trips: new Map(ctx.trips.map(t => [t.id, t])),
        flights: new Map(ctx.flights.map(f => [f.id, f])),
        visited: new Map(ctx.visited.map(v => [v.id, v])),
    };
    const createdVisitedIds: string[] = [];
    const skipped: CitySource[] = [];
    let written = 0;

    /** The record to edit: a private copy, made the first time it is touched, with the original kept. */
    const edit = <K extends 'trips' | 'flights' | 'visited'>(kind: K, id: string) => {
        const w = work[kind] as Map<string, any>;
        const have = w.get(id);
        if (have) return have;
        const orig = (base[kind] as Map<string, any>).get(id);
        if (!orig) return undefined;
        (originals[kind] as Map<string, any>).set(id, orig);
        const copy = structuredClone(orig);
        w.set(id, copy);
        return copy;
    };

    const findTransport = (trip: Trip | undefined, id: string) => trip?.transports?.find(t => t.id === id);

    choices.forEach(choice => {
        const { city, display } = choice;
        let hasStored = false;
        choice.sources.forEach(src => {
            const skip = () => { skipped.push(src); };
            if (src.kind === 'visited') {
                const rec = edit('visited', src.recordId) as VisitedItem | undefined;
                if (!rec || rec.name !== src.current) { skip(); return; }
                hasStored = true;
                rec.name = city;
                rec.code = city;
                if (choice.country && (choice.replace || isUnknownCountry(rec))) { rec.countryCode = choice.country.code; rec.countryName = choice.country.name; }
                if (choice.replace && Number.isFinite(choice.lat) && Number.isFinite(choice.lng)) { rec.lat = choice.lat; rec.lng = choice.lng; }
                written++;
                return;
            }
            if (src.kind.startsWith('trip.')) {
                const trip = edit('trips', src.recordId) as Trip | undefined;
                if (!trip) { skip(); return; }
                if (src.kind === 'trip.location') {
                    const places = trip.location ? splitCombinedPlaces(trip.location) : [];
                    if (!places.includes(src.current)) { skip(); return; }
                    trip.location = places.length > 1 ? trip.location.replace(src.current, city) : display;
                } else if (src.kind === 'trip.stop') {
                    const loc = trip.locations?.find(l => l.id === src.entryId);
                    if (!loc || loc.name !== src.current) { skip(); return; }
                    loc.name = display;
                } else {
                    const wp = trip.transports?.flatMap(t => t.waypoints || []).find(w => w.id === src.entryId);
                    if (!wp || wp.name !== src.current) { skip(); return; }
                    wp.name = display;
                }
                written++;
                return;
            }

            // A transport field: inside its trip when it has one, otherwise an independent record.
            const trip = src.tripId ? base.trips.get(src.tripId) : undefined;
            const inTrip = !!findTransport(trip, src.recordId);
            const holderRec = inTrip ? (edit('trips', src.tripId!) as Trip | undefined) : undefined;
            const record: any = inTrip ? findTransport(holderRec, src.recordId) : edit('flights', src.recordId);
            if (!record) { skip(); return; }
            if (src.kind === 'transport.origin') {
                if (record.origin !== src.current) { skip(); return; }
                record.origin = display;
            } else if (src.kind === 'transport.destination') {
                if (record.destination !== src.current) { skip(); return; }
                record.destination = display;
            } else if (src.kind === 'flight.destCity') {
                if ((record.destCity || '') !== src.current) { skip(); return; }
                record.destCity = city;
            } else {
                const wp = (record.waypoints || []).find((w: any) => w.id === src.entryId);
                if (!wp || wp.name !== src.current) { skip(); return; }
                wp.name = display;
            }
            written++;
        });

        // A place that lives only in trips gets a stored city too, so it keeps its country.
        if (!hasStored && choice.country && choice.sources.length > 0) {
            const id = storedCityId(city, choice.country.code);
            if (!base.visited.has(id) && !work.visited.has(id)) {
                const created: VisitedItem = {
                    id, type: 'city', code: city, name: city, countryCode: choice.country.code, countryName: choice.country.name,
                    lat: choice.lat, lng: choice.lng, isManual: false, notes: 'Named from your trips',
                };
                work.visited.set(id, created);
                createdVisitedIds.push(id);
            }
        }
    });

    // A source that only had its own copy touched and failed is not a change: drop records equal to the original.
    const changed = <T,>(kind: 'trips' | 'flights' | 'visited'): T[] =>
        Array.from((work[kind] as Map<string, any>).entries())
            .filter(([id, rec]) => !(originals[kind] as Map<string, any>).has(id) || JSON.stringify(rec) !== JSON.stringify((originals[kind] as Map<string, any>).get(id)))
            .map(([, rec]) => rec as T);

    return {
        trips: changed<Trip>('trips'),
        flights: changed<any>('flights'),
        visited: changed<VisitedItem>('visited'),
        originals: {
            trips: Array.from(originals.trips.values()).filter(o => work.trips.get(o.id) && JSON.stringify(work.trips.get(o.id)) !== JSON.stringify(o)),
            flights: Array.from(originals.flights.values()).filter(o => work.flights.get(o.id) && JSON.stringify(work.flights.get(o.id)) !== JSON.stringify(o)),
            visited: Array.from(originals.visited.values()).filter(o => work.visited.get(o.id) && JSON.stringify(work.visited.get(o.id)) !== JSON.stringify(o)),
        },
        createdVisitedIds,
        written,
        skipped,
    };
};

/* ------------------------------------------------------------------ */
/* Chunks */
/* ------------------------------------------------------------------ */

export interface NameChunk {
    trips: Trip[];
    flights: any[];
    visitedUpserts: VisitedItem[];
    visitedDeletes: string[];
}

export const namePlanSize = (plan: NamePlan) => plan.trips.length + plan.flights.length + plan.visited.length;

/** Cuts a plan into steps of about `size` records. Each record is in exactly one step, so steps never overlap. */
export const chunkNamePlan = (plan: NamePlan, size = 25): NameChunk[] => {
    const chunks: NameChunk[] = [];
    const items: { kind: 'trips' | 'flights' | 'visited'; rec: any }[] = [
        ...plan.trips.map(rec => ({ kind: 'trips' as const, rec })),
        ...plan.flights.map(rec => ({ kind: 'flights' as const, rec })),
        ...plan.visited.map(rec => ({ kind: 'visited' as const, rec })),
    ];
    for (let i = 0; i < items.length; i += size) {
        const slice = items.slice(i, i + size);
        chunks.push({
            trips: slice.filter(x => x.kind === 'trips').map(x => x.rec),
            flights: slice.filter(x => x.kind === 'flights').map(x => x.rec),
            visitedUpserts: slice.filter(x => x.kind === 'visited').map(x => x.rec),
            visitedDeletes: [],
        });
    }
    return chunks;
};

/** The steps that put the records back as they were: originals written again, created stored cities removed. */
export const undoNameChunks = (plan: NamePlan, done: NameChunk[]): NameChunk[] => {
    const trips = new Map(plan.originals.trips.map(t => [t.id, t]));
    const flights = new Map(plan.originals.flights.map(f => [f.id, f]));
    const visited = new Map(plan.originals.visited.map(v => [v.id, v]));
    const created = new Set(plan.createdVisitedIds);
    return done.map(c => ({
        trips: c.trips.map(t => trips.get(t.id)).filter((t): t is Trip => !!t),
        flights: c.flights.map(f => flights.get(f.id)).filter(Boolean),
        visitedUpserts: c.visitedUpserts.map(v => visited.get(v.id)).filter((v): v is VisitedItem => !!v),
        visitedDeletes: c.visitedUpserts.filter(v => created.has(v.id)).map(v => v.id),
    }));
};
