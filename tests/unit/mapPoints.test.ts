import { describe, expect, it } from 'vitest';
import { geoMercator } from 'd3';
import type { Trip } from '../../types';
import { fitView, isValidLngLat, kmBetween, nearLand, resolveLegEnd, tripPins, toLngLat } from '../../utils/mapPoints';
import { buildMapModel } from '../../components/new/map/mapModel';
import { profileQuery, scorePlace, type Place } from '../../services/placeSearch';

const box = (w: number, e: number, s: number, n: number) => ({
    type: 'Feature' as const, properties: {},
    geometry: { type: 'Polygon' as const, coordinates: [[[w, s], [w, n], [e, n], [e, s], [w, s]]] },
});

const LAX: [number, number] = [-118.41, 33.94];
const SFO: [number, number] = [-122.38, 37.62];
const HONDURAS: [number, number] = [-85.2, 12.9]; // the village "California" in Central America

const trip = (extra: Partial<Trip> & Record<string, any> = {}): Trip => ({
    id: 't1', name: 'California', location: 'California', startDate: '2024-05-01', endDate: '2024-05-10', status: 'Past', participants: [], transports: [],
    ...extra,
} as unknown as Trip);

const flightTo = (dest: [number, number], from: [number, number] = [4.76, 52.31]) => ({
    id: 'f1', mode: 'Flight', origin: 'AMS', destination: 'LAX', departureDate: '2024-05-01',
    originLat: from[1], originLng: from[0], destLat: dest[1], destLng: dest[0],
});

describe('point validity', () => {
    it('rejects missing, non-finite, out-of-range and (0, 0) coordinates', () => {
        expect(isValidLngLat(0, 0)).toBe(false);
        expect(isValidLngLat(NaN, 10)).toBe(false);
        expect(isValidLngLat(undefined, 10)).toBe(false);
        expect(isValidLngLat(181, 10)).toBe(false);
        expect(isValidLngLat(10, -91)).toBe(false);
    });
    it('keeps a real place on the equator or the prime meridian', () => {
        expect(isValidLngLat(0, 51.48)).toBe(true); // Greenwich
        expect(isValidLngLat(-0.2, 0)).toBe(true);
        expect(isValidLngLat(-118.4, 33.9)).toBe(true);
    });
});

describe('[lng, lat] order', () => {
    it('reads {lat, lng}, {lat, lon} and [lng, lat] as the same [lng, lat]', () => {
        expect(toLngLat({ lat: 33.94, lng: -118.41 })).toEqual([-118.41, 33.94]);
        expect(toLngLat({ latitude: 33.94, lon: -118.41 })).toEqual([-118.41, 33.94]);
        expect(toLngLat([-118.41, 33.94])).toEqual([-118.41, 33.94]);
        expect(toLngLat({ lat: '33.94', lng: '-118.41' })).toEqual([-118.41, 33.94]);
    });
    it('puts a swapped pair right and refuses (0, 0) and blanks', () => {
        expect(toLngLat({ lat: -118.41, lng: 33.94 })).toEqual([33.94, -118.41].reverse());
        expect(toLngLat({ lat: 0, lng: 0 })).toBeNull();
        expect(toLngLat({ lat: null, lng: null })).toBeNull();
        expect(toLngLat({})).toBeNull();
        expect(toLngLat(undefined)).toBeNull();
    });
});

describe('leg ends', () => {
    const lookup = (n: string) => (n === 'LAX' ? { lat: 33.94, lng: -118.41 } : undefined);
    it('repairs a stored end that disagrees with the exact lookup of its name', () => {
        expect(resolveLegEnd('LAX', 12.9, -85.2, lookup)).toEqual([-118.41, 33.94]);
    });
    it('keeps a stored end that agrees, and uses the lookup when nothing is stored', () => {
        expect(resolveLegEnd('LAX', 33.95, -118.4, lookup)).toEqual([-118.4, 33.95]);
        expect(resolveLegEnd('LAX', undefined, undefined, lookup)).toEqual([-118.41, 33.94]);
    });
    it('is null for a missing end with no lookup, never (0, 0)', () => {
        expect(resolveLegEnd('Nowhere', 0, 0, lookup)).toBeNull();
        expect(resolveLegEnd('Nowhere', undefined, undefined, lookup)).toBeNull();
    });
    it('the map model drops a leg that has an end at (0, 0)', () => {
        const t = trip({ transports: [{ ...flightTo([0, 0]), destination: 'Zzyzx Nowhere' } as any] });
        expect(buildMapModel([t], { mode: 'all', groupAirports: false }).routes).toHaveLength(0);
        // and with a name the offline lookup knows, the end is repaired instead of sitting at (0, 0)
        const known = trip({ transports: [flightTo([0, 0]) as any] });
        expect(buildMapModel([known], { mode: 'all', groupAirports: false }).routes[0].to[0]).toBeLessThan(-100);
    });
});

describe('trip pins', () => {
    it('regression: "California" resolved to Central America is not drawn there; the pin goes where the trip flies', () => {
        const pins = tripPins(trip({ coordinates: { lat: HONDURAS[1], lng: HONDURAS[0] }, transports: [flightTo(LAX) as any] }));
        expect(pins).toHaveLength(1);
        expect(kmBetween([pins[0].lng, pins[0].lat], LAX)).toBeLessThan(5);
        expect(kmBetween([pins[0].lng, pins[0].lat], HONDURAS)).toBeGreaterThan(3000);
    });
    it('keeps the geocoded state when it fits the trip', () => {
        const pins = tripPins(trip({ coordinates: { lat: 37.2, lng: -119.7 }, transports: [flightTo(SFO) as any] }));
        expect(pins).toEqual([{ id: 't1:0', lng: -119.7, lat: 37.2, label: 'California' }]);
    });
    it('regression: a trip at (0, 0) has no pin', () => {
        expect(tripPins(trip({ coordinates: { lat: 0, lng: 0 } }))).toEqual([]);
        expect(tripPins(trip({ coordinates: { lat: NaN, lng: 5 } as any }))).toEqual([]);
    });
    it('prefers a trip\'s own stops over its single coordinate, one pin per stop', () => {
        const pins = tripPins(trip({
            coordinates: { lat: 12.9, lng: -85.2 },
            locations: [
                { id: 'a', name: 'San Francisco', startDate: '', endDate: '', coordinates: { lat: SFO[1], lng: SFO[0] } },
                { id: 'b', name: 'San Francisco again', startDate: '', endDate: '', coordinates: { lat: 37.63, lng: -122.4 } },
                { id: 'c', name: 'Los Angeles', startDate: '', endDate: '', coordinates: { lat: LAX[1], lng: LAX[0] } },
                { id: 'd', name: 'Unknown', startDate: '', endDate: '' },
            ],
        }));
        expect(pins.map(p => p.label)).toEqual(['California: San Francisco', 'California: Los Angeles']);
    });
    it('skips cancelled and hidden trips', () => {
        expect(tripPins(trip({ status: 'Cancelled', coordinates: { lat: 37, lng: -119 } }))).toEqual([]);
        expect(tripPins(trip({ hideInPlanner: true, coordinates: { lat: 37, lng: -119 } }))).toEqual([]);
    });
});

describe('land check and projection', () => {
    const usa = box(-125, -67, 25, 49);
    it('accepts a point on land or at the coast and refuses open ocean', () => {
        expect(nearLand([usa], LAX)).toBe(true);
        expect(nearLand([usa], [-124.8, 40])).toBe(true); // just off the coast
        expect(nearLand([usa], [-27, 28])).toBe(false); // mid-Atlantic
        expect(nearLand([usa], [0.5, 0.5])).toBe(false); // Gulf of Guinea
    });
    it('a known city projects to the right place on the map', () => {
        const w = 800, h = 400;
        const view = fitView([LAX, SFO], w, h);
        const proj = geoMercator().center([0, 0]).scale(view.scale).translate(view.translate);
        const [x, y] = proj(LAX)!;
        const [sx, sy] = proj(SFO)!;
        expect(x).toBeGreaterThan(0); expect(x).toBeLessThan(w);
        expect(y).toBeGreaterThan(0); expect(y).toBeLessThan(h);
        expect(sy).toBeLessThan(y); // San Francisco is north of Los Angeles, so higher on screen
        expect(sx).toBeLessThan(x); // and west of it
        // Honduras is far south-east of California on the same map
        const [hx, hy] = proj(HONDURAS)!;
        expect(hy).toBeGreaterThan(y); expect(hx).toBeGreaterThan(x);
    });
});

describe('geocoder ranking', () => {
    const place = (extra: Partial<Place>): Place => ({
        id: 'x', label: 'California', name: 'California', subtitle: '', kind: 'city', lat: 0, lng: 0, country: '', countryCode: '', provider: 'osm', score: 0, ...extra,
    });
    it('regression: the state "California" outranks a village of that name', () => {
        const q = profileQuery('California', 'auto');
        const state = place({ kind: 'region', country: 'United States', countryCode: 'US', lat: 37.2, lng: -119.7 });
        const village = place({ kind: 'city', rank: 10, country: 'Honduras', countryCode: 'HN', lat: 12.9, lng: -85.2 });
        expect(scorePlace(state, q)).toBeGreaterThan(scorePlace(village, q));
    });
    it('a city still beats an unrelated region', () => {
        const q = profileQuery('Paris', 'auto');
        const city = place({ name: 'Paris', label: 'Paris', kind: 'city', population: 2_100_000 });
        const region = place({ name: 'Paris Region', label: 'Paris Region', kind: 'region' });
        expect(scorePlace(city, q)).toBeGreaterThan(scorePlace(region, q));
    });
});
