import type { TransportMode } from '../types';
import { calculateDistance } from './geocoding';
import { CIRCUITY, MODE_SPEED_KMH } from '../utils/journeysModel';

/**
 * Distance and time between places for land and sea journeys, best source first:
 * the road (routing engine), the rail line (OpenRailRouting), the sea lane (searoute), and only then
 * the straight line stretched by how winding that kind of route usually is. Every answer says which
 * source it came from, so the page can say when it is an estimate.
 */

/** A coach is slower than the car time the road engine gives (limits, stops): the car time is scaled by this. */
const BUS_TIME_FACTOR = 1.25;

export type EstimateSource = 'road' | 'rail' | 'sea' | 'estimate';

export interface LegEstimate {
    km: number;
    minutes: number;
    source: EstimateSource;
}

const pathKm = (geometry: [number, number, number][]): number => {
    let km = 0;
    for (let i = 1; i < geometry.length; i++) km += calculateDistance(geometry[i - 1][1], geometry[i - 1][0], geometry[i][1], geometry[i][0]);
    return km;
};

const straightKm = (coords: [number, number][]): number => {
    let km = 0;
    for (let i = 1; i < coords.length; i++) km += calculateDistance(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
    return km;
};

/** A route can't be shorter than the straight line, and one many times longer is a bad snap: those answers are not trusted. */
const plausible = (km: number, straight: number): boolean => km >= straight * 0.98 && km <= straight * 3;

/** Minutes for a distance at the mode's average speed. */
export const minutesAtAverage = (mode: TransportMode | string | undefined, km: number): number => (km > 0 ? Math.round((km / (MODE_SPEED_KMH[mode || ''] || 80)) * 60) : 0);

/** `coords` are [lng, lat]: the origin, any stops along the way, the destination. */
export const estimateLeg = async (mode: TransportMode | string | undefined, coords: [number, number][]): Promise<LegEstimate> => {
    const straight = straightKm(coords);
    const estimate = (): LegEstimate => {
        const km = Math.round(straight * (CIRCUITY[mode || ''] ?? 1.25));
        return { km, minutes: minutesAtAverage(mode, km), source: 'estimate' };
    };
    if (coords.length < 2 || straight <= 0) return { km: 0, minutes: 0, source: 'estimate' };

    try {
        if (mode === 'Car Rental' || mode === 'Personal Car' || mode === 'Bus') {
            const { fetchRoute } = await import('./multiModalRouting');
            const route = await fetchRoute('car', coords);
            if (route && plausible(route.distanceKm, straight)) {
                const factor = mode === 'Bus' ? BUS_TIME_FACTOR : 1;
                return { km: Math.round(route.distanceKm), minutes: Math.round(route.durationMin * factor), source: 'road' };
            }
        } else if (mode === 'Train') {
            const { fetchRailGeometry } = await import('./multiModalRouting');
            const first = coords[0];
            const last = coords[coords.length - 1];
            const geometry = await fetchRailGeometry(first[1], first[0], last[1], last[0], coords.slice(1, -1).map(([lng, lat]) => ({ lat, lng })));
            if (geometry && geometry.length > 2) {
                const km = Math.round(pathKm(geometry));
                if (plausible(km, straight)) return { km, minutes: minutesAtAverage(mode, km), source: 'rail' };
            }
        } else if (mode === 'Ferry' || mode === 'Cruise') {
            const { fetchSeaRoute } = await import('./maritimeRouting');
            const first = coords[0];
            const last = coords[coords.length - 1];
            const geometry = await fetchSeaRoute(first[1], first[0], last[1], last[0], coords.slice(1, -1).map(([lng, lat]) => ({ lat, lng })), true);
            if (geometry && geometry.length > 2) {
                const km = pathKm(geometry);
                // The fallback curve between ports is the great circle itself: stretch it like any other estimate.
                if (km > straight * 1.02 && plausible(km, straight)) return { km: Math.round(km), minutes: minutesAtAverage(mode, km), source: 'sea' };
            }
        }
    } catch { /* fall through to the estimate */ }
    return estimate();
};

export const SOURCE_LABEL: Record<EstimateSource, string> = {
    road: 'by road', rail: 'along the rail line', sea: 'along the sea lane', estimate: 'an estimate from the straight line and the mode\'s average speed',
};
