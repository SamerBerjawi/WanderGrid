import { describe, expect, it } from 'vitest';
import { buildPlaceFlows, describeFlows, shortPlaceLabel } from '../../components/new/map/placeFlows';
import { layoutFlow, placeLabels } from '../../components/bklit/sankey-layout';
import type { MapLeg, MapRoute } from '../../components/new/map/mapModel';

const leg = (origin: string, destination: string, i: number): MapLeg => ({
    key: `${origin}${destination}${i}`, tripId: 't', tripName: 'T', status: 'past', mode: 'flight', rawMode: 'Flight',
    origin, destination, from: [0, 0], to: [1, 1], corridorId: origin < destination ? `${origin}<->${destination}` : `${destination}<->${origin}`, distanceKm: 100,
});
/** One route per corridor holding the given legs, as buildMapModel makes them. */
const route = (legs: MapLeg[]): MapRoute => ({
    id: `flight:${legs[0].corridorId}`, corridorId: legs[0].corridorId, mode: 'flight', rawMode: 'Flight', from: [0, 0], to: [1, 1],
    origin: legs[0].origin, destination: legs[0].destination, count: legs.length, status: 'past', legs, distanceKm: 100,
});
const pair = (a: string, b: string, out: number, back = 0) => route([
    ...Array.from({ length: out }, (_, i) => leg(a, b, i)),
    ...Array.from({ length: back }, (_, i) => leg(b, a, i)),
]);

describe('buildPlaceFlows', () => {
    it('counts arrivals and departures per direction', () => {
        const f = buildPlaceFlows('AMS', [pair('AMS', 'LHR', 3, 2), pair('FRA', 'AMS', 4)]);
        expect(f.totals).toEqual({ in: 6, out: 3, inRoutes: 2, outRoutes: 1 });
        expect(f.incoming.map(n => [n.label, n.count])).toEqual([['FRA', 4], ['LHR', 2]]);
        expect(f.outgoing.map(n => [n.label, n.count])).toEqual([['LHR', 3]]);
    });

    it('marks a place that is on both sides as a round trip', () => {
        const f = buildPlaceFlows('AMS', [pair('AMS', 'LHR', 1, 1), pair('FRA', 'AMS', 1)]);
        expect(f.incoming.find(n => n.label === 'LHR')?.roundTrip).toBe(true);
        expect(f.incoming.find(n => n.label === 'FRA')?.roundTrip).toBeUndefined();
        expect(f.outgoing[0].roundTrip).toBe(true);
    });

    it('renders a one-sided place', () => {
        const f = buildPlaceFlows('AMS', [pair('AMS', 'LHR', 2)]);
        expect(f.incoming).toEqual([]);
        expect(f.totals).toMatchObject({ in: 0, out: 2 });
    });

    it('groups the tail into one "+N others" node per side and keeps totals', () => {
        const routes = Array.from({ length: 20 }, (_, i) => pair('AMS', `X${String.fromCharCode(65 + i)}Z`, 20 - i));
        const f = buildPlaceFlows('AMS', routes);
        expect(f.outgoing).toHaveLength(9);
        const others = f.outgoing[8];
        expect(others.others).toBe(true);
        expect(others.groupSize).toBe(12);
        expect(others.label).toBe('+12');
        expect(others.route).toBeUndefined();
        expect(f.outgoing.reduce((s, n) => s + n.count, 0)).toBe(f.totals.out);
        expect(f.totals.outRoutes).toBe(20);
    });

    it('shows a single leftover route itself instead of "+1 others"', () => {
        const routes = Array.from({ length: 9 }, (_, i) => pair('AMS', `X${String.fromCharCode(65 + i)}Z`, 1));
        const f = buildPlaceFlows('AMS', routes);
        expect(f.outgoing).toHaveLength(9);
        expect(f.outgoing.every(n => !n.others)).toBe(true);
    });

    it('handles no routes', () => {
        const f = buildPlaceFlows('AMS', []);
        expect(f.totals).toEqual({ in: 0, out: 0, inRoutes: 0, outRoutes: 0 });
        expect(describeFlows('AMS', f)).toBe('Sankey of routes at AMS: no routes');
    });

    it('describes the chart for assistive technology', () => {
        const f = buildPlaceFlows('AMS', [pair('AMS', 'LHR', 3, 1), pair('FRA', 'AMS', 1)]);
        expect(describeFlows('AMS', f)).toBe('Sankey of routes at AMS: 2 arrivals from 2 places, 3 departures to 1 place');
    });
});

describe('shortPlaceLabel', () => {
    it('keeps an IATA code and shortens a long name', () => {
        expect(shortPlaceLabel('ams')).toBe('AMS');
        expect(shortPlaceLabel('AMSTERDAM CENTRAAL', 10).length).toBeLessThanOrEqual(10);
    });
});

describe('layoutFlow', () => {
    it('keeps both sides inside the width and node widths proportional above the floor', () => {
        const l = layoutFlow([10, 5, 1], [8, 8], 300);
        const right = (s: { node: { x: number; w: number } }[]) => Math.max(...s.map(i => i.node.x + i.node.w));
        expect(Math.min(...l.top.map(i => i.node.x))).toBeGreaterThanOrEqual(0);
        expect(right(l.top)).toBeLessThanOrEqual(300.0001);
        expect(l.top[0].node.w).toBeGreaterThan(l.top[1].node.w);
        expect(l.top[2].node.w).toBeGreaterThanOrEqual(8);
        // the same scale on both sides
        expect(l.bottom[0].node.w / 8).toBeCloseTo(l.top[1].node.w / 5, 5);
    });

    it('handles an empty side', () => {
        const l = layoutFlow([], [3, 2], 300);
        expect(l.top).toEqual([]);
        expect(l.bottom).toHaveLength(2);
    });

    it('packs band slots edge to edge as wide as their nodes', () => {
        const l = layoutFlow([4, 4], [], 200);
        expect(l.top[0].band.w).toBe(l.top[0].node.w);
        expect(l.top[1].band.x).toBeCloseTo(l.top[0].band.x + l.top[0].band.w, 5);
    });
});

describe('placeLabels', () => {
    it('staggers touching labels over two rows and drops those that fit neither', () => {
        const spots = placeLabels([10, 20, 30, 40], ['AAA', 'BBB', 'CCC', 'DDD'], [4, 3, 2, 1], 400);
        expect(spots.find(s => s.index === 0)?.row).toBe(0);
        expect(spots.find(s => s.index === 1)?.row).toBe(1);
        expect(spots.length).toBeLessThan(4);
    });
});
