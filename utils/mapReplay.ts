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

/** With flights and captions on, each step gets time to be read and flown: about 45 seconds at 1x, never under 450 ms or over 1.6 s a step. */
export const richStepInterval = (steps: number, speed: number): number =>
    Math.round(Math.min(1600, Math.max(450, 45_000 / Math.max(1, steps))) / Math.max(0.25, speed));

export const SPEEDS = [0.5, 1, 2, 4] as const;

/* ------------------------------------------------------------------ what you have reached */

export interface ReplayFacts {
    /** Country code to name, for every country reached so far. */
    countries: Map<string, string>;
    /** The places (cities and airports) reached, by their id. */
    places: Set<string>;
    airlines: Set<string>;
    flights: number;
    legs: number;
    distanceKm: number;
    /** The longest single route so far. */
    longest?: { origin: string; destination: string; km: number };
}

export type CountryOf = (lng: number, lat: number) => { code: string; name: string } | null;

const airlineOf = (leg: MapLeg): string => (leg.mode === 'flight' ? String(leg.provider || '').trim() : '');

/** Everything the replay has reached in a (revealed) model: countries, places, airlines, flights and distance. */
export const replayFacts = (model: MapModel, countryOf?: CountryOf): ReplayFacts => {
    const countries = new Map<string, string>();
    const places = new Set<string>();
    const airlines = new Set<string>();
    let flights = 0, legs = 0, longest: ReplayFacts['longest'];
    const note = (coords: [number, number]) => {
        const c = countryOf?.(coords[0], coords[1]);
        if (c) countries.set(c.code, c.name);
    };
    for (const place of [...model.airports, ...model.places]) { places.add(place.id); note(place.coords); }
    for (const route of model.routes) {
        if (!longest || route.distanceKm > longest.km) longest = { origin: route.origin, destination: route.destination, km: Math.round(route.distanceKm) };
        for (const leg of route.legs) {
            legs += 1;
            if (leg.mode === 'flight') flights += 1;
            const airline = airlineOf(leg);
            if (airline) airlines.add(airline);
        }
    }
    return { countries, places, airlines, flights, legs, distanceKm: Math.round(model.routes.reduce((n, r) => n + r.distanceKm, 0)), longest };
};

export interface StepRoute {
    id: string;
    from: string;
    to: string;
    mode: MapRoute['mode'];
    km: number;
    airlines: string[];
    legs: number;
}

export interface StepNews {
    date: string;
    routes: StepRoute[];
    newCountries: { code: string; name: string }[];
    newPlaces: string[];
    newAirlines: string[];
    /** Distance and country milestones crossed by this step ("Once round the world"). */
    milestones: string[];
}

export const ORBIT_KM = 40_075;
const DISTANCE_MARKS: [number, string][] = [[10_000, '10,000 km travelled'], [ORBIT_KM, 'Once round the world: 40,075 km'], [100_000, '100,000 km travelled'], [ORBIT_KM * 5, 'Five times round the world'], [500_000, '500,000 km travelled'], [1_000_000, 'A million kilometres']];
const COUNT_MARKS = [5, 10, 20, 30, 50, 75, 100];

/**
 * What the newest step brought: its routes, the countries, places and airlines reached for the first time,
 * and any milestone it crossed. `before` and `after` are the facts one step apart.
 */
export const stepNews = (step: ReplayStep, before: ReplayFacts, after: ReplayFacts, routes: MapRoute[], labelOf: (placeId: string) => string): StepNews => {
    const newCountries = [...after.countries].filter(([code]) => !before.countries.has(code)).map(([code, name]) => ({ code, name }));
    const newPlaces = [...after.places].filter(id => !before.places.has(id)).map(labelOf);
    const newAirlines = [...after.airlines].filter(a => !before.airlines.has(a));
    const milestones: string[] = [];
    for (const [mark, text] of DISTANCE_MARKS) if (before.distanceKm < mark && after.distanceKm >= mark) milestones.push(text);
    for (const n of COUNT_MARKS) if (before.countries.size < n && after.countries.size >= n) milestones.push(`${n} countries`);
    const mine = routes.filter(r => step.routeIds.includes(r.id)).map<StepRoute>(r => ({
        id: r.id, from: labelOf(r.origin), to: labelOf(r.destination), mode: r.mode, km: Math.round(r.distanceKm),
        airlines: [...new Set(r.legs.map(airlineOf).filter(Boolean))], legs: r.legs.length,
    }));
    return { date: step.date, routes: mine, newCountries, newPlaces, newAirlines, milestones };
};

/* ------------------------------------------------------------------ settings */

export type ReplayCamera = 'world' | 'follow' | 'close';

export interface ReplaySettings {
    /** Whole map: the camera stays put. Follow: it frames each new route. Close-up: it flies in to where the route ends. */
    camera: ReplayCamera;
    /** A plane flies each new route, drawing it as it goes. */
    fly: boolean;
    /** A card names each new route with its airline, distance and anything reached for the first time. */
    captions: boolean;
    /** Countries fill in as you first reach them. */
    countries: boolean;
    /** Running totals of countries, places, airlines, flights and distance. */
    stats: boolean;
}

export const DEFAULT_REPLAY: ReplaySettings = { camera: 'follow', fly: true, captions: true, countries: true, stats: true };
const CAMERAS: ReplayCamera[] = ['world', 'follow', 'close'];

/** Settings read back from storage, with anything missing or wrong replaced by its default. */
export const readReplaySettings = (raw: unknown): ReplaySettings => {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const flag = (k: keyof ReplaySettings) => (typeof o[k] === 'boolean' ? (o[k] as boolean) : (DEFAULT_REPLAY[k] as boolean));
    return {
        camera: CAMERAS.includes(o.camera as ReplayCamera) ? (o.camera as ReplayCamera) : DEFAULT_REPLAY.camera,
        fly: flag('fly'), captions: flag('captions'), countries: flag('countries'), stats: flag('stats'),
    };
};

/** The smallest box around some points, as [[west, south], [east, north]]; undefined for none. */
export const boundsOf = (points: [number, number][]): [[number, number], [number, number]] | undefined => {
    if (!points.length) return undefined;
    const lngs = points.map(p => p[0]), lats = points.map(p => p[1]);
    return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
};
