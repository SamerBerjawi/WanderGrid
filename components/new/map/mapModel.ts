import type { PredefinedMapMode, Trip } from '../../../types';
import { formatProperLocationName, calculateDistance, getCoordinatesSync } from '../../../services/geocoding';
import { resolveLegEnd } from '../../../utils/mapPoints';

/**
 * Turns trips (with resolved transport coordinates, from useExpeditionMapData) into what the map
 * draws: legs, routes aggregated per corridor, airports and other places, and the bounds to frame.
 */

export type LegMode = 'flight' | 'rail' | 'road' | 'sea';
export type LegStatus = 'past' | 'upcoming' | 'planning';
export type LngLat = [number, number];

export interface MapLeg {
    key: string;
    tripId: string;
    tripName: string;
    status: LegStatus;
    mode: LegMode;
    rawMode: string;
    origin: string;
    destination: string;
    from: LngLat;
    to: LngLat;
    date?: string;
    provider?: string;
    identifier?: string;
    corridorId: string;
    waypoints?: any[];
    distanceKm: number;
}

export interface MapRoute {
    id: string;
    corridorId: string;
    mode: LegMode;
    rawMode: string;
    from: LngLat;
    to: LngLat;
    origin: string;
    destination: string;
    count: number;
    status: LegStatus;
    legs: MapLeg[];
    waypoints?: any[];
    distanceKm: number;
}

export interface MapPlace {
    id: string;
    label: string;
    coords: LngLat;
    count: number;
    kind: 'airport' | 'place';
}

export interface MapModel {
    legs: MapLeg[];
    routes: MapRoute[];
    airports: MapPlace[];
    places: MapPlace[];
    bounds: [LngLat, LngLat] | null;
    totals: { routes: number; distanceKm: number };
}

const SEA = ['cruise', 'ferry', 'boat', 'ship'];
const ROAD = ['car', 'drive', 'driving', 'bus', 'road', 'taxi'];

export const legModeOf = (raw?: string): LegMode | null => {
    const m = (raw || 'Flight').trim().toLowerCase();
    if (m === 'flight' || m === 'air' || m === 'plane') return 'flight';
    if (m.includes('train') || m.includes('rail')) return 'rail';
    if (SEA.some(s => m.includes(s))) return 'sea';
    if (ROAD.some(s => m.includes(s))) return 'road';
    return null;
};

const STATUS_RANK: Record<LegStatus, number> = { past: 0, planning: 1, upcoming: 2 };

const statusOf = (trip: Trip, today: string): LegStatus | null => {
    if (trip.status === 'Cancelled') return null;
    const ended = Boolean(trip.endDate && trip.endDate < today) || trip.status === 'Past';
    if (ended) return 'past';
    return trip.status === 'Planning' ? 'planning' : 'upcoming';
};

const keyOf = (name: string) => name.trim().toUpperCase();

/** Greedy clustering of airports closer than `km`: the busiest one absorbs its neighbours. */
const clusterAirports = (airports: Map<string, MapPlace>, km: number) => {
    const sorted = Array.from(airports.values()).sort((a, b) => b.count - a.count);
    const parent = new Map<string, MapPlace>();
    const heads: MapPlace[] = [];
    sorted.forEach(a => {
        const head = heads.find(h => calculateDistance(h.coords[1], h.coords[0], a.coords[1], a.coords[0]) < km);
        if (head) {
            head.count += a.count;
            if (!head.label.includes(a.label)) head.label = `${head.label} · ${a.label}`;
            parent.set(a.id, head);
        } else {
            const copy = { ...a };
            heads.push(copy);
            parent.set(a.id, copy);
        }
    });
    return { heads, parent };
};

export interface MapModelOptions {
    mode: PredefinedMapMode;
    groupAirports: boolean;
    /** Route types drawn on the scratch map (it has none unless asked). */
    scratchRoutes?: ('flight' | 'land' | 'sea')[];
}

export const buildMapModel = (trips: Trip[], { mode, groupAirports, scratchRoutes = [] }: MapModelOptions): MapModel => {
    const today = new Date().toISOString().split('T')[0];
    const legs: MapLeg[] = [];
    const seen = new Set<string>();
    // A leg end is drawn only with real coordinates (never a missing value defaulted to 0, 0), and an exact
    // offline match for its name (IATA code, picked label) wins over a stored point that disagrees with it.
    const looked = new Map<string, { lat: number; lng: number } | undefined>();
    const lookup = (name: string) => {
        if (!looked.has(name)) looked.set(name, getCoordinatesSync(name));
        return looked.get(name);
    };

    trips.forEach(trip => {
        const status = statusOf(trip, today);
        if (!status) return;
        (trip.transports || []).forEach((t, i) => {
            const legMode = legModeOf(t.mode);
            if (!legMode) return;
            if (mode === 'none') return;
            if (mode === 'scratch' && !scratchRoutes.includes(legMode === 'flight' ? 'flight' : legMode === 'sea' ? 'sea' : 'land')) return;
            if (mode === 'flights' && legMode !== 'flight') return;
            if (mode === 'land_sea' && legMode === 'flight') return;
            if (!t.origin || !t.destination) return;
            const from = resolveLegEnd(t.origin, t.originLat, t.originLng, lookup);
            const to = resolveLegEnd(t.destination, t.destLat, t.destLng, lookup);
            if (!from || !to) return;
            const dedupe = `${t.id || ''}|${t.origin}|${t.destination}|${t.departureDate || ''}|${t.identifier || ''}`;
            if (seen.has(dedupe)) return;
            seen.add(dedupe);
            const o = keyOf(t.origin);
            const d = keyOf(t.destination);
            legs.push({
                key: `${trip.id}:${t.id || i}`,
                tripId: trip.id,
                tripName: trip.name,
                status,
                mode: legMode,
                rawMode: t.mode || 'Flight',
                origin: o,
                destination: d,
                from,
                to,
                date: t.departureDate,
                provider: t.provider,
                identifier: t.identifier,
                corridorId: o < d ? `${o}<->${d}` : `${d}<->${o}`,
                waypoints: t.waypoints,
                distanceKm: t.distance || calculateDistance(from[1], from[0], to[1], to[0]),
            });
        });
    });

    // Endpoints: airports for flights, places for land and sea.
    const airports = new Map<string, MapPlace>();
    const places = new Map<string, MapPlace>();
    const bump = (map: Map<string, MapPlace>, id: string, coords: LngLat, kind: MapPlace['kind']) => {
        const existing = map.get(id);
        if (existing) existing.count += 1;
        else map.set(id, { id, label: formatProperLocationName(id), coords, count: 1, kind });
    };
    legs.forEach(l => {
        const target = l.mode === 'flight' ? airports : places;
        const kind = l.mode === 'flight' ? 'airport' : 'place';
        bump(target, l.origin, l.from, kind);
        bump(target, l.destination, l.to, kind);
    });

    let airportList = Array.from(airports.values());
    if (groupAirports && airportList.length > 1) {
        const { heads, parent } = clusterAirports(airports, 60);
        airportList = heads;
        legs.forEach(l => {
            if (l.mode !== 'flight') return;
            const po = parent.get(l.origin);
            const pd = parent.get(l.destination);
            if (po) l.from = po.coords;
            if (pd) l.to = pd.coords;
        });
    }

    // Routes: one per corridor and mode; the most current status wins its colour.
    const routes = new Map<string, MapRoute>();
    legs.forEach(l => {
        const id = `${l.mode}:${l.corridorId}`;
        const r = routes.get(id);
        if (r) {
            r.count += 1;
            r.legs.push(l);
            if (STATUS_RANK[l.status] > STATUS_RANK[r.status]) r.status = l.status;
        } else {
            routes.set(id, {
                id,
                corridorId: l.corridorId,
                mode: l.mode,
                rawMode: l.rawMode,
                from: l.from,
                to: l.to,
                origin: l.origin,
                destination: l.destination,
                count: 1,
                status: l.status,
                legs: [l],
                waypoints: l.waypoints,
                distanceKm: l.distanceKm,
            });
        }
    });

    const pts: LngLat[] = legs.flatMap(l => [l.from, l.to]);
    let bounds: [LngLat, LngLat] | null = null;
    if (pts.length) {
        const lngs = pts.map(p => p[0]);
        const lats = pts.map(p => p[1]);
        bounds = [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
    }

    return {
        legs,
        routes: Array.from(routes.values()),
        airports: airportList,
        places: Array.from(places.values()),
        bounds,
        totals: { routes: legs.length, distanceKm: Math.round(legs.reduce((s, l) => s + (l.distanceKm || 0), 0)) },
    };
};
