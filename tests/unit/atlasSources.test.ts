import { describe, expect, it } from 'vitest';
import type { Trip, VisitedItem } from '../../types';
import { chunkNamePlan, findCitySources, namePlanSize, planNameWriteBack, undoNameChunks, type AtlasRecords } from '../../utils/atlasSources';
import { isUnknownPlaceName, mergeCityRecords } from '../../services/cityRegistry';
import { buildTrackedCities } from '../../utils/atlasModel';
import { toReversePlace } from '../../services/reverseGeocode';

const PORTO = { lat: 41.1496, lng: -8.611 };
const FAR = { lat: 48.85, lng: 2.35 };

const trip = (id: string, extra: Partial<Trip> = {}): Trip => ({
    id, name: `Trip ${id}`, location: '', startDate: '2024-05-01', endDate: '2024-05-08', status: 'Completed', participants: [], transports: [], ...extra,
} as unknown as Trip);

const records = (over: Partial<AtlasRecords> = {}): AtlasRecords => ({ visited: [], trips: [], flights: [], roadTrips: [], ...over });
const city = (name: string, c: { lat?: number; lng?: number } = PORTO): VisitedItem => ({ id: 'c', type: 'city', code: 'XX', name, countryCode: 'XX', ...c } as VisitedItem);

describe('isUnknownPlaceName', () => {
    it.each(['', 'Unknown', 'unknown location', 'Unnamed stop', 'Dropped pin', 'Stop 3', 'Waypoint', '41.1496', '41.1496, -8.6110', '-33.9, 151.2', '?'])('%j is unknown', n => {
        expect(isUnknownPlaceName(n)).toBe(true);
    });
    it.each(['Porto', 'Place Vendôme', 'Stop & Shop', 'Unknownville', 'Saint-Louis', 'Location Cove', 'A3'])('%j is a name', n => {
        expect(isUnknownPlaceName(n)).toBe(false);
    });
});

describe('unknown places stay apart', () => {
    it('does not fold two unknown places with different coordinates into one city', () => {
        const merged = mergeCityRecords([
            { id: 'a', type: 'city', code: 'XX', name: 'Unknown', countryCode: 'XX', ...PORTO },
            { id: 'b', type: 'city', code: 'XX', name: 'Unknown', countryCode: 'XX', ...FAR },
        ] as VisitedItem[]);
        expect(merged).toHaveLength(2);
    });
    it('still folds unknown places on the same spot', () => {
        const merged = mergeCityRecords([
            { id: 'a', type: 'city', code: 'XX', name: 'Unknown', countryCode: 'XX', lat: 41.1496, lng: -8.611 },
            { id: 'b', type: 'city', code: 'XX', name: 'Unknown', countryCode: 'XX', lat: 41.1499, lng: -8.6112 },
        ] as VisitedItem[]);
        expect(merged).toHaveLength(1);
    });
    it('derives one city per unknown stop', () => {
        const t = trip('t1', { locations: [
            { id: 'l1', name: 'Unknown', startDate: '', endDate: '', coordinates: PORTO },
            { id: 'l2', name: 'Unknown', startDate: '', endDate: '', coordinates: FAR },
        ] as any });
        const cities = buildTrackedCities([], [t], [], []);
        expect(cities.filter(c => isUnknownPlaceName(c.name))).toHaveLength(2);
    });
});

describe('findCitySources', () => {
    const t1 = trip('t1', {
        location: 'Unknown', coordinates: { ...PORTO, country: 'Portugal', countryCode: 'PT' } as any,
        locations: [{ id: 'l1', name: 'Unknown', startDate: '', endDate: '', coordinates: PORTO }, { id: 'l2', name: 'Unknown', startDate: '', endDate: '', coordinates: FAR }] as any,
        transports: [{ id: 'tr1', mode: 'Car', origin: 'Unknown', destination: 'Lisbon', originLat: PORTO.lat, originLng: PORTO.lng, waypoints: [{ id: 'w1', name: 'Dropped pin', type: 'Stop', coordinates: PORTO }] }] as any,
    });
    const rec = records({
        trips: [t1],
        visited: [{ id: 'v1', type: 'city', code: 'Unknown', name: 'Unknown', countryCode: 'XX', ...PORTO } as VisitedItem],
        roadTrips: [{ id: 'tr1', tripId: 't1', mode: 'Car', origin: 'Unknown', destination: 'Lisbon', originLat: PORTO.lat, originLng: PORTO.lng, waypoints: [{ id: 'w1', name: 'Dropped pin', coordinates: PORTO }] },
            { id: 'rt2', mode: 'Car', origin: 'Dropped pin', destination: 'Faro', originLat: FAR.lat, originLng: FAR.lng }],
        flights: [{ id: 'f1', destination: 'OPO', destCity: 'Unknown', destLat: PORTO.lat, destLng: PORTO.lng }],
    });

    it('lists every field that describes the place, and only those at its coordinates', () => {
        const kinds = findCitySources({ name: 'Unknown', ...PORTO }, rec).map(s => s.kind).sort();
        expect(kinds).toEqual(['flight.destCity', 'transport.origin', 'trip.location', 'trip.stop', 'trip.waypoint', 'visited']);
    });
    it('another place elsewhere has its own sources', () => {
        const other = findCitySources({ name: 'Unknown', ...FAR }, rec).map(s => s.kind).sort();
        expect(other).toEqual(['transport.origin', 'trip.stop']);
    });
    it('a named city is found by its name, and a flight by its airport code', () => {
        const named = records({
            trips: [trip('t9', { location: 'Amsterdam, Netherlands', coordinates: { lat: 52.37, lng: 4.9, countryCode: 'NL' } as any })],
            flights: [{ id: 'f9', destination: 'NRT', destLat: 35.77, destLng: 140.39 }],
            visited: [{ id: 'v9', type: 'city', code: 'Amsterdam', name: 'Amsterdam', countryCode: 'NL' } as VisitedItem],
        });
        expect(findCitySources({ name: 'Amsterdam', countryCode: 'NL' }, named).map(s => s.kind).sort()).toEqual(['trip.location', 'visited']);
        const nrt = findCitySources({ name: 'Nrt' }, named);
        expect(nrt.map(s => s.kind)).toEqual(['flight.destCity']);
        const plan = planNameWriteBack([{ sources: nrt, city: 'Tokyo', display: 'Tokyo, Japan', country: { code: 'JP', name: 'Japan' }, replace: true, lat: 35.68, lng: 139.69 }], { trips: [], flights: named.flights, visited: [] });
        expect(plan.flights[0]).toMatchObject({ destCity: 'Tokyo', destination: 'NRT' });
        expect(plan.visited[0]).toMatchObject({ name: 'Tokyo', countryCode: 'JP', lat: 35.68 });
    });
    it('does not match a same-named city in another country', () => {
        const r = records({ trips: [trip('t8', { location: 'Springfield', coordinates: { lat: 1, lng: 1, countryCode: 'GB' } as any })] });
        expect(findCitySources({ name: 'Springfield', countryCode: 'US' }, r)).toEqual([]);
    });
});

describe('planNameWriteBack', () => {
    const t1 = trip('t1', {
        location: 'Unknown', coordinates: { ...PORTO, country: 'Portugal', countryCode: 'PT' } as any,
        locations: [{ id: 'l1', name: 'Unknown', startDate: '', endDate: '', coordinates: PORTO }] as any,
        transports: [{ id: 'tr1', mode: 'Car', origin: 'Unknown', destination: 'Lisbon', waypoints: [{ id: 'w1', name: 'Dropped pin', type: 'Stop', coordinates: PORTO }] }] as any,
    });
    const rawFlights = [
        { id: 'f1', mode: 'Flight', destination: 'OPO', destCity: 'Unknown', destLat: PORTO.lat, destLng: PORTO.lng },
        { id: 'rt2', mode: 'Car', origin: 'Dropped pin', destination: 'Faro', originLat: PORTO.lat, originLng: PORTO.lng },
    ];
    const visited = [{ id: 'v1', type: 'city', code: 'Unknown', name: 'Unknown', countryCode: 'XX', ...PORTO } as VisitedItem];
    const rec = records({
        trips: [t1], visited, flights: [rawFlights[0]],
        roadTrips: [{ id: 'tr1', tripId: 't1', mode: 'Car', origin: 'Unknown', destination: 'Lisbon', originLat: PORTO.lat, originLng: PORTO.lng, waypoints: [{ id: 'w1', name: 'Dropped pin', coordinates: PORTO }] }, rawFlights[1]],
    });
    const sources = findCitySources({ name: 'Unknown', ...PORTO }, rec);
    const choice = { sources, city: 'Porto', display: 'Porto, Portugal', country: { code: 'PT', name: 'Portugal' }, ...PORTO };

    it('writes the name into every source in one plan and keeps coordinates', () => {
        const plan = planNameWriteBack([choice], { trips: [t1], flights: rawFlights, visited });
        expect(plan.written).toBe(sources.length);
        const t = plan.trips[0];
        expect(t.location).toBe('Porto, Portugal');
        expect(t.locations![0].name).toBe('Porto, Portugal');
        expect(t.transports![0].origin).toBe('Porto, Portugal');
        expect(t.transports![0].waypoints![0].name).toBe('Porto, Portugal');
        expect(t.coordinates).toEqual(t1.coordinates);
        expect(t.locations![0].coordinates).toEqual(PORTO);
        expect(plan.flights.find(f => f.id === 'f1').destCity).toBe('Porto');
        expect(plan.flights.find(f => f.id === 'f1').destination).toBe('OPO');
        expect(plan.flights.find(f => f.id === 'rt2').origin).toBe('Porto, Portugal');
        expect(plan.visited[0]).toMatchObject({ id: 'v1', name: 'Porto', countryCode: 'PT', countryName: 'Portugal', lat: PORTO.lat, lng: PORTO.lng });
    });

    it('does not touch its input', () => {
        const before = JSON.stringify([t1, rawFlights, visited]);
        planNameWriteBack([choice], { trips: [t1], flights: rawFlights, visited });
        expect(JSON.stringify([t1, rawFlights, visited])).toBe(before);
    });

    it('updates only the sources that were chosen', () => {
        const only = sources.filter(s => s.kind === 'trip.location');
        const plan = planNameWriteBack([{ ...choice, sources: only }], { trips: [t1], flights: rawFlights, visited });
        expect(plan.written).toBe(1);
        expect(plan.trips[0].locations![0].name).toBe('Unknown');
        expect(plan.flights).toHaveLength(0);
    });

    it('creates a stored city when the place lives only in trips, with its country', () => {
        const tripOnly = sources.filter(s => s.kind !== 'visited');
        const plan = planNameWriteBack([{ ...choice, sources: tripOnly }], { trips: [t1], flights: rawFlights, visited: [] });
        expect(plan.createdVisitedIds).toEqual(['city_porto_pt']);
        expect(plan.visited[0]).toMatchObject({ name: 'Porto', countryCode: 'PT', lat: PORTO.lat });
    });

    it('replaces one segment of a combined location and leaves the rest', () => {
        const combined = trip('t2', { location: 'Unknown & Lisbon', coordinates: undefined });
        const src = [{ key: 'k', kind: 'trip.location' as const, recordId: 't2', current: 'Unknown', label: '' }];
        const plan = planNameWriteBack([{ sources: src, city: 'Porto', display: 'Porto, Portugal' }], { trips: [combined], flights: [], visited: [] });
        expect(plan.trips[0].location).toBe('Porto & Lisbon');
    });

    it('skips a source that changed since it was read', () => {
        const edited = { ...t1, location: 'Madrid' } as Trip;
        const plan = planNameWriteBack([choice], { trips: [edited], flights: rawFlights, visited });
        expect(plan.skipped.some(s => s.kind === 'trip.location')).toBe(true);
        expect(plan.trips[0].location).toBe('Madrid');
    });

    it('applies several places to one trip without losing an edit', () => {
        const two = trip('t3', { locations: [
            { id: 'a', name: 'Unknown', startDate: '', endDate: '', coordinates: PORTO },
            { id: 'b', name: 'Unknown', startDate: '', endDate: '', coordinates: FAR },
        ] as any });
        const r = records({ trips: [two] });
        const a = findCitySources({ name: 'Unknown', ...PORTO }, r);
        const b = findCitySources({ name: 'Unknown', ...FAR }, r);
        const plan = planNameWriteBack([
            { sources: a, city: 'Porto', display: 'Porto' }, { sources: b, city: 'Paris', display: 'Paris' },
        ], { trips: [two], flights: [], visited: [] });
        expect(plan.trips).toHaveLength(1);
        expect(plan.trips[0].locations!.map(l => l.name)).toEqual(['Porto', 'Paris']);
    });

    it('chunks without overlap and undoes to the originals', () => {
        const many = Array.from({ length: 120 }, (_, i) => trip(`m${i}`, { location: 'Unknown', coordinates: { lat: 40 + i / 10, lng: 0 } as any }));
        const r = records({ trips: many });
        const choices = many.map((t, i) => ({
            sources: findCitySources({ name: 'Unknown', lat: 40 + i / 10, lng: 0 }, r), city: `City ${i}`, display: `City ${i}`,
        }));
        const plan = planNameWriteBack(choices, { trips: many, flights: [], visited: [] });
        expect(plan.trips).toHaveLength(120);
        const chunks = chunkNamePlan(plan, 25);
        expect(chunks).toHaveLength(5);
        expect(chunks.flatMap(c => c.trips.map(t => t.id)).sort()).toEqual(many.map(t => t.id).sort());
        expect(namePlanSize(plan)).toBe(120);
        const undo = undoNameChunks(plan, chunks);
        undo.flatMap(c => c.trips).forEach(t => expect(t).toEqual(many.find(m => m.id === t.id)));
    });

    it('undo removes the stored city the plan created', () => {
        const tripOnly = sources.filter(s => s.kind !== 'visited');
        const plan = planNameWriteBack([{ ...choice, sources: tripOnly }], { trips: [t1], flights: rawFlights, visited: [] });
        const undo = undoNameChunks(plan, chunkNamePlan(plan, 50));
        expect(undo.flatMap(c => c.visitedDeletes)).toEqual(['city_porto_pt']);
    });

    it('after the write-back the place is no longer unknown', () => {
        const plan = planNameWriteBack([choice], { trips: [t1], flights: rawFlights, visited });
        const cities = buildTrackedCities(plan.visited, plan.trips, [], []);
        expect(cities.some(c => isUnknownPlaceName(c.name))).toBe(false);
        expect(cities.some(c => c.name === 'Porto')).toBe(true);
    });
});

describe('toReversePlace', () => {
    it('reads a provider answer and keeps the country', () => {
        expect(toReversePlace({ name: 'Porto', country: 'Portugal', country_code: 'PT', provider: 'photon' })).toMatchObject({ name: 'Porto', countryCode: 'PT' });
    });
    it('is null without a name', () => {
        expect(toReversePlace({ name: ' ' })).toBeNull();
        expect(toReversePlace(null)).toBeNull();
    });
});
