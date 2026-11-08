import type { Trip } from '../types';

/**
 * Offline trip pack, the pure parts: where the trip is on the map, which map tiles to keep for it, what of the
 * trip is worth saving, and whether a saved copy is out of date. The browser parts (saving, the tile requests)
 * are in services/offlinePack.ts.
 */

export interface Box { west: number; south: number; east: number; north: number }
export interface Tile { z: number; x: number; y: number }

export interface PackMeta {
    tripId: string;
    name: string;
    startDate: string;
    endDate: string;
    /** When the copy was made (ms since the epoch). */
    savedAt: number;
    /** Map tiles kept for it. */
    tiles: number;
}
export interface PackSnapshot extends PackMeta { trip: Trip }

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Every place on the trip that has a position: the stops, legs, stays, activities and waypoints. */
export const pointsOf = (trip: Trip): { lat: number; lng: number }[] => {
    const out: { lat: number; lng: number }[] = [];
    const add = (lat: unknown, lng: unknown) => { if (finite(lat) && finite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) out.push({ lat, lng }); };
    add(trip.coordinates?.lat, trip.coordinates?.lng);
    (trip.locations || []).forEach(l => add(l.coordinates?.lat, l.coordinates?.lng));
    (trip.transports || []).forEach(t => {
        add(t.originLat, t.originLng);
        add(t.destLat, t.destLng);
        (t.waypoints || []).forEach(w => add(w.coordinates?.lat, w.coordinates?.lng));
    });
    (trip.accommodations || []).forEach(a => add(a.coordinates?.lat, a.coordinates?.lng));
    (trip.activities || []).forEach(a => add(a.coordinates?.lat, a.coordinates?.lng));
    return out;
};

/** The box around the trip's places, with room around it; null when nothing has a position. */
export const boxOf = (trip: Trip, padDegrees = 0.5): Box | null => {
    const pts = pointsOf(trip);
    if (!pts.length) return null;
    const lats = pts.map(p => p.lat), lngs = pts.map(p => p.lng);
    return {
        west: Math.max(-180, Math.min(...lngs) - padDegrees), east: Math.min(180, Math.max(...lngs) + padDegrees),
        south: Math.max(-85, Math.min(...lats) - padDegrees), north: Math.min(85, Math.max(...lats) + padDegrees),
    };
};

/** The slippy-map tile that holds a position at a zoom. */
export const tileOf = (lat: number, lng: number, z: number): { x: number; y: number } => {
    const n = 2 ** z;
    const x = Math.floor(((lng + 180) / 360) * n);
    const rad = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
    const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
    return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
};

/** How many tiles a box covers at a zoom. */
export const tileCountAt = (box: Box, z: number): number => {
    const a = tileOf(box.north, box.west, z), b = tileOf(box.south, box.east, z);
    return (Math.abs(b.x - a.x) + 1) * (Math.abs(b.y - a.y) + 1);
};

/**
 * The tiles to keep for a box: every zoom from `minZoom` up while the running total stays within `cap`, so a
 * trip across a country gets wide views plus as much street detail as fits, and a trip within a town gets deep
 * ones. The first zoom is always kept, even when it is over the cap on its own.
 */
export const tilesFor = (box: Box, minZoom = 3, maxZoom = 12, cap = 300): Tile[] => {
    const out: Tile[] = [];
    for (let z = minZoom; z <= maxZoom; z++) {
        const count = tileCountAt(box, z);
        if (z > minZoom && out.length + count > cap) break;
        const a = tileOf(box.north, box.west, z), b = tileOf(box.south, box.east, z);
        for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) {
            for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) out.push({ z, x, y });
        }
    }
    return out;
};

/** A tile's address from a TileJSON template ("…/{z}/{x}/{y}.pbf"). */
export const tileUrl = (template: string, t: Tile): string => template.replace('{z}', String(t.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y));

/** The trip as it is kept offline: everything you read on the road, without the long saved flight tracks. */
export const packTrip = (trip: Trip): Trip => ({
    ...trip,
    transports: (trip.transports || []).map(t => { const { track: _track, ...rest } = t; return rest; }),
});

/** Whether the live trip differs from the saved copy in anything that is kept (so the copy needs refreshing). */
export const packChanged = (saved: Trip, live: Trip): boolean => JSON.stringify(packTrip(saved)) !== JSON.stringify(packTrip(live));

/** "just now", "5 minutes ago", "2 hours ago", "3 days ago". */
export const describeAge = (savedAt: number, now = Date.now()): string => {
    const minutes = Math.floor(Math.max(0, now - savedAt) / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
    const days = Math.floor(hours / 24);
    return `${days} ${days === 1 ? 'day' : 'days'} ago`;
};

/** What is in a pack, for one line of text ("3 flights, 2 stays, 4 activities"). */
export const describePack = (trip: Trip): string => {
    const part = (n: number, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : '');
    return [
        part((trip.transports || []).length, 'leg', 'legs'),
        part((trip.accommodations || []).length, 'stay', 'stays'),
        part((trip.activities || []).length, 'activity', 'activities'),
    ].filter(Boolean).join(', ') || 'Dates and notes';
};
