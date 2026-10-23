import { geoContains } from 'd3';
import type { Trip } from '../types';

/**
 * Pure rules for which points a static map may draw (Dashboard World widget, and the interactive map's
 * leg endpoints): a point needs finite, in-range coordinates and is never the "null island" (0, 0) that a
 * missing value defaults to. Places stored as {lat, lng}, {lat, lon} or [lng, lat] all come out as
 * [lng, lat]. A trip's pin is a stop that fits the trip's own legs, not a lone geocoder guess.
 */

export type LngLat = [number, number];

/** Finite, within ±180° / ±90°, and not exactly (0, 0) (where a missing coordinate lands). */
export const isValidLngLat = (lng: unknown, lat: unknown): boolean =>
    typeof lng === 'number' && typeof lat === 'number' &&
    Number.isFinite(lng) && Number.isFinite(lat) &&
    Math.abs(lng) <= 180 && Math.abs(lat) <= 90 &&
    !(lng === 0 && lat === 0);

const num = (v: unknown): number => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '') return Number(v);
    return NaN;
};

/**
 * Any stored coordinate as a valid [lng, lat], or null. Accepts {lat, lng}, {lat, lon}, {latitude,
 * longitude} and a [lng, lat] pair. A latitude beyond ±90 with a longitude within it is a swapped pair
 * and is put right.
 */
export const toLngLat = (value: unknown): LngLat | null => {
    if (value == null) return null;
    let lng: number, lat: number;
    if (Array.isArray(value)) {
        lng = num(value[0]);
        lat = num(value[1]);
    } else if (typeof value === 'object') {
        const o = value as Record<string, unknown>;
        lat = num(o.lat ?? o.latitude);
        lng = num(o.lng ?? o.lon ?? o.longitude);
    } else {
        return null;
    }
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) [lng, lat] = [lat, lng];
    return isValidLngLat(lng, lat) ? [lng, lat] : null;
};

/** Great-circle distance in km between two [lng, lat] points. */
export const kmBetween = (a: LngLat, b: LngLat): number => {
    const rad = (d: number) => (d * Math.PI) / 180;
    const dLat = rad(b[1] - a[1]);
    const dLng = rad(b[0] - a[0]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

/** Where the stored endpoint of a leg is, repaired by an exact offline lookup of its name when they disagree. */
export const resolveLegEnd = (
    name: string | undefined,
    lat: unknown,
    lng: unknown,
    lookup?: (name: string) => { lat: number; lng: number } | undefined,
    toleranceKm = 150,
): LngLat | null => {
    const stored = toLngLat({ lat, lng });
    const found = name && lookup ? toLngLat(lookup(name)) : null;
    if (!stored) return found;
    if (found && kmBetween(stored, found) > toleranceKm) return found;
    return stored;
};

/** A stop is plausible for a trip when it lies within `maxKm` of one of the trip's own leg ends. */
export const MAX_ANCHOR_KM = 2000;

/** Closer than this, two stops are one pin. */
const SAME_PIN_KM = 25;

export interface TripPin {
    id: string;
    lng: number;
    lat: number;
    label: string;
}

/** The ends of a trip's legs that carry valid coordinates. */
export const tripAnchors = (trip: Trip): LngLat[] => {
    const out: LngLat[] = [];
    (trip.transports || []).forEach((t: any) => {
        const o = toLngLat({ lat: t.originLat, lng: t.originLng });
        const d = toLngLat({ lat: t.destLat, lng: t.destLng });
        if (o) out.push(o);
        if (d) out.push(d);
    });
    return out;
};

/**
 * The pins for a trip: one per stop that has real coordinates (its own stops, else its stays, else the
 * trip's single coordinate), thinned to one per 25 km. When the trip has legs, a stop far from every leg
 * end (a name that the geocoder matched to some other place, such as a village called "California") is
 * not drawn; if that leaves nothing, the pin is where the trip's farthest leg arrives.
 */
export const tripPins = (trip: Trip, maxAnchorKm = MAX_ANCHOR_KM): TripPin[] => {
    if (trip.status === 'Cancelled' || trip.hideInPlanner) return [];
    const anchors = tripAnchors(trip);
    const cands: { at: LngLat; label: string }[] = [];
    (trip.locations || []).forEach(l => { const at = toLngLat(l.coordinates); if (at) cands.push({ at, label: l.name || trip.name }); });
    if (!cands.length) (trip.accommodations || []).forEach(a => { const at = toLngLat(a.coordinates); if (at) cands.push({ at, label: a.name || trip.name }); });
    if (!cands.length) { const at = toLngLat(trip.coordinates); if (at) cands.push({ at, label: trip.name }); }

    const kept: { at: LngLat; label: string }[] = [];
    cands.forEach(c => {
        if (anchors.length && !anchors.some(a => kmBetween(a, c.at) <= maxAnchorKm)) return;
        if (kept.some(k => kmBetween(k.at, c.at) < SAME_PIN_KM)) return;
        kept.push(c);
    });

    if (!kept.length && anchors.length) {
        // Where the trip goes: the leg end farthest from where it starts.
        const first = anchors[0];
        const far = anchors.reduce((best, a) => (kmBetween(first, a) > kmBetween(first, best) ? a : best), first);
        if (kmBetween(first, far) > SAME_PIN_KM) kept.push({ at: far, label: trip.name });
    }
    return kept.map((k, i) => ({ id: `${trip.id}:${i}`, lng: k.at[0], lat: k.at[1], label: kept.length > 1 ? `${trip.name}: ${k.label}` : trip.name }));
};

/** Pins for many trips. */
export const pinsOf = (trips: Trip[]): TripPin[] => trips.flatMap(t => tripPins(t));

/** True when the point is on land, or within about 45 km of it (a coast, a small island the map omits). */
export const nearLand = (features: { type: 'Feature'; geometry: any }[], p: LngLat, slackDeg = 0.4): boolean => {
    const offsets: LngLat[] = [[0, 0], [slackDeg, 0], [-slackDeg, 0], [0, slackDeg], [0, -slackDeg]];
    return features.some(f => offsets.some(([dx, dy]) => geoContains(f as any, [p[0] + dx, p[1] + dy])));
};

/* ------------------------------ the view ------------------------------ */

const rad = (d: number) => (d * Math.PI) / 180;
const mercY = (latDeg: number) => Math.log(Math.tan(Math.PI / 4 + rad(Math.max(-84, Math.min(84, latDeg))) / 2));

/**
 * The Mercator view that fits every point (route ends and the arcs between them, trips, visited
 * countries) in a box of the given size, centred, never zoomed past about 40° across and never
 * panned past the edge of the world, so the land always fills the box.
 */
export const fitView = (points: LngLat[], w: number, h: number) => {
    const pts = points.length ? points : [[-150, -50], [170, 75]] as LngLat[];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pts.forEach(([lng, lat]) => {
        const x = rad(lng), y = mercY(lat);
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    });
    const pad = 0.2;
    const spanX = Math.max(maxX - minX, rad(40)) * (1 + pad * 2);
    const spanY = Math.max(maxY - minY, mercY(25) - mercY(-25)) * (1 + pad * 2);
    const kMin = Math.max(w / (2 * Math.PI), h / (mercY(84) - mercY(-60)));
    const k = Math.max(kMin, Math.min(w / spanX, h / spanY));
    let tx = w / 2 - k * ((minX + maxX) / 2);
    let ty = h / 2 + k * ((minY + maxY) / 2);
    // Keep the box inside the world (longitudes ±180°, latitudes 84°N to 60°S).
    tx = Math.min(k * Math.PI, Math.max(w - k * Math.PI, tx));
    ty = Math.min(k * mercY(84), Math.max(h + k * mercY(-60), ty));
    return { scale: k, translate: [tx, ty] as [number, number] };
};

