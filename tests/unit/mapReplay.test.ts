import { describe, expect, it } from 'vitest';
import type { MapLeg, MapModel, MapPlace, MapRoute } from '../../components/new/map/mapModel';
import { replaySteps, revealRoutes, stepInterval } from '../../utils/mapReplay';

const leg = (key: string, date: string | undefined, status: MapLeg['status'] = 'past'): MapLeg => ({
    key, tripId: 't', tripName: 't', status, mode: 'flight', rawMode: 'Flight', origin: 'A', destination: 'B', from: [0, 0], to: [1, 1], date, corridorId: 'c', distanceKm: 100,
});
const route = (id: string, origin: string, destination: string, legs: MapLeg[], km = 100): MapRoute => ({
    id, corridorId: id, mode: 'flight', rawMode: 'Flight', from: [0, 0], to: [1, 1], origin, destination, count: legs.length, status: 'past', legs, distanceKm: km,
});
const place = (id: string): MapPlace => ({ id, label: id, coords: [0, 0], count: 1, kind: 'airport' });

const routes = [
    route('bru-lis', 'BRU', 'LIS', [leg('1', '2026-03-03'), leg('2', '2026-03-07'), leg('9', '2027-01-01', 'upcoming')]),
    route('bru-nrt', 'BRU', 'NRT', [leg('3', '2026-10-28')], 9500),
    route('lis-opo', 'LIS', 'OPO', [leg('4', '2026-03-03')], 300),
    route('later', 'NRT', 'KIX', [leg('5', '2026-11-01')], 400),
    route('undated', 'X', 'Y', [leg('6', undefined)]),
    route('future', 'P', 'Q', [leg('7', '2027-05-01', 'upcoming')]),
];
const model: MapModel = {
    legs: routes.flatMap(r => r.legs), routes,
    airports: ['BRU', 'LIS', 'NRT', 'OPO', 'KIX', 'X', 'Y', 'P', 'Q'].map(place), places: [],
    bounds: [[-10, 30], [140, 60]], totals: { routes: routes.length, distanceKm: 0 },
};

describe('replay steps', () => {
    it('lists each date once, oldest first, with the routes that first appear then, and leaves out undated and future routes', () => {
        const steps = replaySteps(routes);
        expect(steps).toEqual([
            { date: '2026-03-03', routeIds: ['bru-lis', 'lis-opo'] },
            { date: '2026-10-28', routeIds: ['bru-nrt'] },
            { date: '2026-11-01', routeIds: ['later'] },
        ]);
        expect(replaySteps([])).toEqual([]);
    });
});

describe('revealing routes', () => {
    const steps = replaySteps(routes);

    it('shows nothing before the first step', () => {
        const r = revealRoutes(model, steps, 0);
        expect(r.model.routes).toEqual([]);
        expect(r.model.airports).toEqual([]);
        expect(r.latest).toEqual([]);
        expect(r.date).toBeUndefined();
    });

    it('grows route by route, with only the legs flown by then and the places they touch', () => {
        const first = revealRoutes(model, steps, 1);
        expect(first.model.routes.map(r => r.id)).toEqual(['bru-lis', 'lis-opo']);
        // The 7 March leg and the upcoming one are not flown yet at the 3 March step.
        expect(first.model.routes[0].legs.map(l => l.key)).toEqual(['1']);
        expect(first.model.routes[0].count).toBe(1);
        expect(first.model.airports.map(p => p.id).sort()).toEqual(['BRU', 'LIS', 'OPO']);
        expect(first.date).toBe('2026-03-03');
        expect(first.model.totals).toEqual({ routes: 2, distanceKm: 400 });

        const second = revealRoutes(model, steps, 2);
        // By 28 October the repeat leg of BRU to LIS (7 March) has been flown too.
        expect(second.model.routes.find(r => r.id === 'bru-lis')!.legs.map(l => l.key)).toEqual(['1', '2']);
        expect(second.model.routes.map(r => r.id)).toContain('bru-nrt');
        expect(second.model.airports.map(p => p.id)).toContain('NRT');
        expect(second.model.airports.map(p => p.id)).not.toContain('KIX');
    });

    it('marks the newest two steps as the latest, and keeps the whole history\'s bounds', () => {
        expect(revealRoutes(model, steps, 3).latest).toEqual(['bru-nrt', 'later']);
        expect(revealRoutes(model, steps, 1).latest).toEqual(['bru-lis', 'lis-opo']);
        expect(revealRoutes(model, steps, 1).model.bounds).toEqual(model.bounds);
    });

    it('clamps the step count', () => {
        expect(revealRoutes(model, steps, 99).model.routes).toHaveLength(4);
        expect(revealRoutes(model, steps, -3).model.routes).toHaveLength(0);
    });
});

describe('pace', () => {
    it('takes about twenty seconds, within limits, and speeds up with the speed', () => {
        expect(stepInterval(40, 1)).toBe(500);
        expect(stepInterval(1000, 1)).toBe(120);
        expect(stepInterval(2, 1)).toBe(900);
        expect(stepInterval(40, 2)).toBe(250);
        expect(stepInterval(40, 4)).toBe(125);
        expect(stepInterval(0, 1)).toBe(900);
    });
});
