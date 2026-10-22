import { describe, expect, it } from 'vitest';
import { durationBetween, byAirport, byCarrier, estimateMinutes, fromLog, groupJourneys, journeyRoute, journeyStatus, layoverMinutes, liveProgress, localArrival, placeCode, sortJourneys, splitLegs, totalsByYear } from '../../utils/journeysModel';
import { flight, record, tripOf } from './helpers';

const ids = (g: { legs: { flight: { id: string } }[] }) => g.legs.map(l => l.flight.id);
const journeys = (items: ReturnType<typeof record>[]) => groupJourneys(items).flatMap(u => (u.kind === 'journey' ? [u.group] : []));

describe('journey detection', () => {
    it('joins a connection of under 24 hours and counts the stop and layover', () => {
        const a = record(flight('1', 'AMS', 'FRA', '2027-03-02', '08:00', '2027-03-02', '09:20'));
        const b = record(flight('2', 'FRA', 'JFK', '2027-03-02', '11:30', '2027-03-02', '14:10'));
        const [g] = journeys([a, b]);
        expect(ids(g)).toEqual(['1', '2']);
        expect(g.stops).toBe(1);
        expect(g.shape).toBe('connection');
        expect(g.source).toBe('detected');
        // Lands 09:20 in Frankfurt, leaves 11:30 from Frankfurt.
        expect(layoverMinutes(a.flight, b.flight)).toBe(130);
    });

    it('does not join flights that merely share an airport days apart without a way home', () => {
        const a = record(flight('1', 'AMS', 'FRA', '2027-03-02', '08:00', '2027-03-02', '09:20'));
        const b = record(flight('2', 'FRA', 'JFK', '2027-03-06', '11:30', '2027-03-06', '14:10'));
        expect(journeys([a, b])).toHaveLength(0);
    });

    it('finds a round trip: there, a stay, and back', () => {
        const out = record(flight('1', 'BCN', 'LHR', '2027-05-04', '09:00', '2027-05-04', '10:50'));
        const back = record(flight('2', 'LHR', 'BCN', '2027-05-14', '18:00', '2027-05-14', '21:30'));
        const [g] = journeys([out, back]);
        expect(g.shape).toBe('round-trip');
        expect(g.outbound.map(l => l.flight.id)).toEqual(['1']);
        expect(g.returns.map(l => l.flight.id)).toEqual(['2']);
        expect(journeyRoute(g.legs)).toEqual(['BCN', 'LHR', 'BCN']);
    });

    it('finds a multi-city loop that gets home', () => {
        const legs = [
            record(flight('1', 'LHR', 'CDG', '2027-07-01', '09:00', '2027-07-01', '11:15')),
            record(flight('2', 'CDG', 'FCO', '2027-07-06', '10:00', '2027-07-06', '12:00')),
            record(flight('3', 'FCO', 'LHR', '2027-07-14', '15:00', '2027-07-14', '17:30')),
        ];
        const [g] = journeys(legs);
        expect(ids(g)).toEqual(['1', '2', '3']);
        expect(g.shape).toBe('multi-city');
    });

    it('keeps only the connections when a chain of stays never gets home', () => {
        const legs = [
            record(flight('1', 'AMS', 'FRA', '2027-03-02', '08:00', '2027-03-02', '09:20')),
            record(flight('2', 'FRA', 'JFK', '2027-03-02', '11:30', '2027-03-02', '14:10')),
            record(flight('3', 'JFK', 'LAX', '2027-03-08', '09:00', '2027-03-08', '12:00')),
        ];
        const found = journeys(legs);
        expect(found).toHaveLength(1);
        expect(ids(found[0])).toEqual(['1', '2']);
    });

    it('groups a trip\'s flights under the trip, and a shared confirmation code as one booking', () => {
        const trip = tripOf('t1', 'Lisbon');
        const t1 = record(flight('1', 'AMS', 'LIS', '2027-01-01', '10:00', '2027-01-01', '12:00'), trip);
        const t2 = record(flight('2', 'LIS', 'AMS', '2027-01-08', '10:00', '2027-01-08', '14:00'), trip);
        const p1 = record(flight('3', 'MAD', 'ROM', '2027-02-01', '10:00', '2027-02-01', '12:00', { confirmationCode: 'ABC123' }));
        const p2 = record(flight('4', 'LHR', 'JFK', '2027-04-01', '10:00', '2027-04-01', '14:00', { confirmationCode: 'abc123' }));
        const found = journeys([t1, t2, p1, p2]);
        expect(found.find(g => g.source === 'trip')?.trip.name).toBe('Lisbon');
        expect(found.find(g => g.source === 'booking') && ids(found.find(g => g.source === 'booking')!)).toEqual(['3', '4']);
    });

    it('keeps the order of the list and leaves loose flights single', () => {
        const lone = record(flight('9', 'SIN', 'BKK', '2027-09-01', '10:00', '2027-09-01', '12:00'));
        const units = groupJourneys([lone]);
        expect(units).toEqual([{ kind: 'single', rec: lone }]);
    });

    it('splits the way out from the way back at the longest stay', () => {
        const legs = [
            record(flight('1', 'AMS', 'FRA', '2027-03-02', '08:00', '2027-03-02', '09:20')),
            record(flight('2', 'FRA', 'JFK', '2027-03-02', '11:30', '2027-03-02', '14:10')),
            record(flight('3', 'JFK', 'AMS', '2027-03-12', '18:00', '2027-03-13', '07:30')),
        ];
        const s = splitLegs(legs);
        expect(s.outbound.map(l => l.flight.id)).toEqual(['1', '2']);
        expect(s.returns.map(l => l.flight.id)).toEqual(['3']);
    });
});

describe('status, progress and times', () => {
    it('is scheduled before, travelling during and done after the flight', () => {
        const f = flight('1', 'AMS', 'JFK', '2027-03-02', '10:30', '2027-03-02', '12:45');
        const dep = Date.parse('2027-03-02T09:30:00Z');
        expect(journeyStatus(f, dep - 3_600_000).state).toBe('scheduled');
        expect(journeyStatus(f, dep + 3_600_000).state).toBe('travelling');
        expect(journeyStatus(f, dep + 24 * 3_600_000).state).toBe('done');
    });

    it('marks a flight cancelled from its custom field', () => {
        const f = flight('1', 'AMS', 'JFK', '2027-03-02', '10:30', '2027-03-02', '12:45', { customFields: [{ key: 'canceled', value: 'TRUE' }] });
        expect(journeyStatus(f).state).toBe('cancelled');
    });

    it('uses the real position for progress when there is one, and the live ETA for the delay', () => {
        const f = flight('1', 'FRA', 'JFK', '2027-03-02', '10:55', '2027-03-02', '13:35');
        const sched = Date.parse('2027-03-02T18:35:00Z');
        // Roughly mid-way along the great circle, 40 minutes late.
        const mid = liveProgress(f, { position: { lat: 58, lng: -30 }, arrivalUtc: new Date(sched + 40 * 60000).toISOString() }, Date.parse('2027-03-02T14:00:00Z'));
        expect(mid.basis).toBe('position');
        expect(mid.progress).toBeGreaterThan(0.3);
        expect(mid.progress).toBeLessThan(0.7);
        expect(mid.delayMin).toBe(40);
    });

    it('falls back to the clock without live data', () => {
        const f = flight('1', 'FRA', 'JFK', '2027-03-02', '10:55', '2027-03-02', '13:35');
        const half = (Date.parse('2027-03-02T09:55:00Z') + Date.parse('2027-03-02T18:35:00Z')) / 2;
        const p = liveProgress(f, undefined, half);
        expect(p.basis).toBe('clock');
        expect(p.progress).toBeCloseTo(0.5, 1);
        expect(p.delayMin).toBe(0);
    });

    it('works out local arrival with each airport\'s own time zone', () => {
        expect(localArrival('FCO', 'MAD', '2027-03-27', '10:00', 130)).toEqual({ date: '2027-03-27', time: '12:10' });
        expect(localArrival('AMS', 'JFK', '2027-10-28', '10:30', 460)).toEqual({ date: '2027-10-28', time: '12:10' });
        expect(localArrival('ZZZ', 'JFK', '2027-10-28', '10:30', 460)).toBeNull();
    });

    it('works out the real duration across time zones, and says when it cannot', () => {
        expect(durationBetween('BEY', 'BRU', '2026-10-24', '07:05', '2026-10-24', '10:35')).toBe(270);
        expect(durationBetween('AMS', 'JFK', '2026-10-28', '10:30', '2026-10-28', '13:10')).toBe(460);
        expect(durationBetween('ZZZ', 'JFK', '2026-10-28', '10:30', '2026-10-28', '13:10')).toBeNull();
    });

    it('estimates a flight at 30 minutes plus 800 km/h', () => {
        expect(estimateMinutes(800)).toBe(90);
        expect(estimateMinutes(0)).toBe(0);
    });
});

describe('totals, breakdowns and lookups from the log', () => {
    const items = [
        record(flight('1', 'AMS', 'JFK', '2025-03-02', '10:30', '2025-03-02', '12:45', { cost: 400, provider: 'KLM', travelClass: 'Economy' })),
        record(flight('2', 'JFK', 'AMS', '2026-03-12', '18:00', '2026-03-13', '07:30', { cost: 600, provider: 'KLM', travelClass: 'Business' })),
        record(flight('3', 'AMS', 'LHR', '2026-05-12', '08:00', '2026-05-12', '08:20', { cost: 100, provider: 'British Airways', travelClass: 'Economy' })),
    ];

    it('totals per year fill the gaps and add cost', () => {
        const years = totalsByYear(items.filter(i => i.flight.id !== '2'));
        expect(years.map(y => y.year)).toEqual(['2025', '2026']);
        expect(years[0].cost).toBe(400);
        expect(totalsByYear(items).find(y => y.year === '2026')?.count).toBe(2);
    });

    it('counts airlines and airports, most first', () => {
        expect(byCarrier(items)[0]).toMatchObject({ label: 'KLM', count: 2 });
        expect(byAirport(items)[0]).toMatchObject({ key: 'AMS', count: 3 });
    });

    it('offers the times of the same flight number logged before', () => {
        const hit = fromLog(items, 'kl 2');
        expect(hit?.id).toBe('2');
        expect(fromLog(items, 'XX999')).toBeNull();
    });

    it('sorts by date either way', () => {
        expect(sortJourneys(items, 'date', true).map(r => r.flight.id)).toEqual(['1', '2', '3']);
        expect(sortJourneys(items, 'date', false).map(r => r.flight.id)).toEqual(['3', '2', '1']);
    });

    it('shortens places to codes', () => {
        expect(placeCode('amsterdam, netherlands')).toBe('AMS');
        expect(placeCode('JFK')).toBe('JFK');
    });
});
