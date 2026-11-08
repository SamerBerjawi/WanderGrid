import type { MapLeg, MapModel, MapPlace, MapRoute } from '../components/new/map/mapModel';

/**
 * Route replay: your past journeys drawn in the order you made them. Each step reveals the routes first
 * travelled on one date, so the map grows from your first trip to your latest and nothing waits through an empty
 * stretch. Pure: it takes the map model the page already has and returns a smaller one for the moment you are at.
 */

export interface ReplayStep {
    date: string;
    /** Routes first travelled on this date. */
    routeIds: string[];
}

const pastLegs = (route: MapRoute): MapLeg[] => route.legs.filter(l => l.status === 'past' && Boolean(l.date));

const firstDate = (route: MapRoute): string | undefined => {
    const dates = pastLegs(route).map(l => l.date as string).sort();
    return dates[0];
};

/** The dates, oldest first, and the routes that first appear on each. Routes with no dated past leg are not in the replay. */
export const replaySteps = (routes: MapRoute[]): ReplayStep[] => {
    const byDate = new Map<string, string[]>();
    for (const route of routes) {
        const date = firstDate(route);
        if (!date) continue;
        byDate.set(date, [...(byDate.get(date) ?? []), route.id]);
    }
    return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, routeIds]) => ({ date, routeIds }));
};

export interface Revealed {
    model: MapModel;
    /** The routes of the newest step (and the one before), shown strong while older ones are muted. */
    latest: string[];
    /** The date the replay has reached; undefined before the first step. */
    date?: string;
}

const touches = (routes: MapRoute[], placeId: string) => routes.some(r => r.origin === placeId || r.destination === placeId);

/**
 * The model after the first `count` steps: the routes that have started (with only the legs flown by then), the
 * airports and places they touch, and the whole history's bounds so the camera stays where it is.
 */
export const revealRoutes = (model: MapModel, steps: ReplayStep[], count: number): Revealed => {
    const shown = Math.max(0, Math.min(count, steps.length));
    if (shown === 0) return { model: { ...model, legs: [], routes: [], airports: [], places: [], totals: { routes: 0, distanceKm: 0 } }, latest: [] };
    const cutoff = steps[shown - 1].date;
    const started = new Set(steps.slice(0, shown).flatMap(s => s.routeIds));
    const routes: MapRoute[] = model.routes
        .filter(r => started.has(r.id))
        .map(r => {
            const legs = pastLegs(r).filter(l => (l.date as string) <= cutoff);
            return { ...r, legs, count: legs.length };
        });
    const legs = routes.flatMap(r => r.legs);
    const keep = (p: MapPlace) => touches(routes, p.id);
    const latest = steps.slice(Math.max(0, shown - 2), shown).flatMap(s => s.routeIds);
    return {
        model: {
            ...model,
            legs,
            routes,
            airports: model.airports.filter(keep),
            places: model.places.filter(keep),
            totals: { routes: routes.length, distanceKm: Math.round(routes.reduce((n, r) => n + r.distanceKm, 0)) },
        },
        latest,
        date: cutoff,
    };
};

/** Milliseconds between steps: the whole replay takes about twenty seconds at 1x, never faster than 120 ms a step or slower than 900. */
export const stepInterval = (steps: number, speed: number): number =>
    Math.round(Math.min(900, Math.max(120, 20_000 / Math.max(1, steps))) / Math.max(0.25, speed));

export const SPEEDS = [1, 2, 4] as const;
