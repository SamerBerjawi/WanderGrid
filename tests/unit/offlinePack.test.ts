import { describe, expect, it } from 'vitest';
import type { Trip } from '../../types';
import { boxOf, describeAge, describePack, packChanged, packTrip, pointsOf, tileCountAt, tileOf, tilesFor, tileUrl } from '../../utils/offlinePack';

const trip = (over: Partial<Trip> = {}): Trip => ({
    id: 't', name: 'Lisbon', location: 'Lisbon', startDate: '2027-03-22', endDate: '2027-03-28', status: 'Upcoming', participants: [],
    transports: [{ id: 'a', itineraryId: 'i', type: 'One-Way', mode: 'Flight', provider: 'TP', identifier: 'TP 1351', confirmationCode: 'K7Q2ZX', origin: 'BRU', destination: 'LIS', departureDate: '2027-03-22', departureTime: '10:15', arrivalDate: '2027-03-22', arrivalTime: '12:05', originLat: 50.9, originLng: 4.48, destLat: 38.77, destLng: -9.13, track: [[4.4, 50.9], [-9.1, 38.7]] }],
    accommodations: [{ id: 's', name: 'Hotel', address: 'Rua 1', type: 'Hotel', checkInDate: '2027-03-22', checkInTime: '15:00', checkOutDate: '2027-03-28', checkOutTime: '11:00', coordinates: { lat: 38.71, lng: -9.13 } }],
    activities: [{ id: 'v', date: '2027-03-24', time: '20:30', title: 'Dinner', coordinates: { lat: 38.72, lng: -9.14 } }],
    ...over,
});

describe('where the trip is', () => {
    it('collects every position on the trip and ignores bad ones', () => {
        expect(pointsOf(trip())).toHaveLength(4);
        expect(pointsOf(trip({ transports: [], accommodations: [], activities: [] }))).toEqual([]);
        const bad = trip({ transports: [{ ...trip().transports![0], originLat: 999, originLng: 0, destLat: NaN, destLng: 0 }], accommodations: [], activities: [] });
        expect(pointsOf(bad)).toEqual([]);
    });

    it('makes a padded box around them, and none for a trip with no positions', () => {
        const box = boxOf(trip(), 1)!;
        expect(box.west).toBeCloseTo(-10.14, 1);
        expect(box.east).toBeCloseTo(5.48, 1);
        expect(box.south).toBeCloseTo(37.71, 1);
        expect(box.north).toBeCloseTo(51.9, 1);
        expect(boxOf(trip({ transports: [], accommodations: [], activities: [] }))).toBeNull();
    });
});

describe('map tiles', () => {
    it('finds the tile that holds a position', () => {
        // Greenwich is on the boundary of the middle column at zoom 1; the north pole side is row 0.
        expect(tileOf(51.48, 0, 1)).toEqual({ x: 1, y: 0 });
        expect(tileOf(-33.9, 151.2, 2)).toEqual({ x: 3, y: 2 });
        expect(tileOf(90, 200, 3)).toEqual({ x: 7, y: 0 });
    });

    it('counts tiles and keeps zooms while they fit under the cap', () => {
        const small = { west: -9.3, south: 38.6, east: -9.0, north: 38.8 };
        expect(tileCountAt(small, 3)).toBe(1);
        const tiles = tilesFor(small, 3, 12, 100);
        expect(new Set(tiles.map(t => t.z)).size).toBeGreaterThan(5);
        expect(tiles.length).toBeLessThanOrEqual(100);
        const wide = boxOf(trip(), 1)!;
        const some = tilesFor(wide, 3, 12, 60);
        // A trip across a continent gets fewer zooms than a town, never more than the cap (past the first zoom).
        expect(some.length).toBeLessThanOrEqual(60);
        expect(Math.max(...some.map(t => t.z))).toBeLessThan(Math.max(...tiles.map(t => t.z)));
        expect(some[0].z).toBe(3);
    });

    it('always keeps the first zoom, even over the cap, and never repeats a tile', () => {
        const world = { west: -179, south: -80, east: 179, north: 80 };
        const tiles = tilesFor(world, 3, 12, 5);
        expect(tiles.every(t => t.z === 3)).toBe(true);
        expect(new Set(tiles.map(t => `${t.z}/${t.x}/${t.y}`)).size).toBe(tiles.length);
    });

    it('fills in a tile template', () => {
        expect(tileUrl('https://t.example/planet/2025/{z}/{x}/{y}.pbf', { z: 5, x: 16, y: 12 })).toBe('https://t.example/planet/2025/5/16/12.pbf');
    });
});

describe('what is kept', () => {
    it('drops the long saved flight track and nothing else', () => {
        const kept = packTrip(trip());
        expect(kept.transports![0]).not.toHaveProperty('track');
        expect(kept.transports![0]).toMatchObject({ identifier: 'TP 1351', confirmationCode: 'K7Q2ZX', originLat: 50.9 });
        expect(kept.accommodations).toHaveLength(1);
    });

    it('notices a change in anything kept, but not in the track', () => {
        const a = trip();
        expect(packChanged(a, { ...a, transports: [{ ...a.transports![0], track: [[1, 1]] }] })).toBe(false);
        expect(packChanged(a, { ...a, transports: [{ ...a.transports![0], departureTime: '11:00' }] })).toBe(true);
        expect(packChanged(a, { ...a, notes: 'Bring a charger' })).toBe(true);
    });

    it('describes a pack and its age', () => {
        expect(describePack(trip())).toBe('1 leg, 1 stay, 1 activity');
        expect(describePack(trip({ transports: [], accommodations: [], activities: [] }))).toBe('Dates and notes');
        const now = 10_000_000_000;
        expect(describeAge(now, now)).toBe('just now');
        expect(describeAge(now - 5 * 60_000, now)).toBe('5 minutes ago');
        expect(describeAge(now - 60 * 60_000, now)).toBe('1 hour ago');
        expect(describeAge(now - 3 * 24 * 3_600_000, now)).toBe('3 days ago');
    });
});
