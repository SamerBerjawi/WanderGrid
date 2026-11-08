import { describe, expect, it, vi } from 'vitest';
import type { Trip } from '../../types';
import type { Leg } from '../../utils/dashboardModel';
import { buildStamps, equatorCrossings, levelName, singular, monthStreak, nextUp, polarPlaces, totalsOf } from '../../utils/achievements';
import { TOP_100_AIRPORTS } from '../../utils/topAviationData';
import { flight } from './helpers';

// The offline place lookup knows airports like LHR and SYD but not every city: two places are added for the polar and equator cases.
vi.mock('../../services/geocoding', async importOriginal => {
    const real = await importOriginal<typeof import('../../services/geocoding')>();
    const extra: Record<string, { lat: number; lng: number }> = { 'Tromsø': { lat: 69.65, lng: 18.96 }, Nairobi: { lat: -1.29, lng: 36.82 } };
    return { ...real, getCoordinatesSync: (p: string) => extra[p] ?? real.getCoordinatesSync(p) };
});

const TODAY = '2026-11-20';
const CONTINENT: Record<string, string> = { PT: 'Europe', BE: 'Europe', JP: 'Asia', ZA: 'Africa', BR: 'South America', US: 'North America', AU: 'Oceania', AQ: 'Antarctica' };
const continentOf = (c: string) => CONTINENT[c];

const trip = (id: string, start: string, end: string, over: Partial<Trip> = {}): Trip => ({ id, name: id, location: '', startDate: start, endDate: end, status: 'Past', participants: [], ...over });
const leg = (key: string, kind: Leg['kind'], km: number, origin = 'BRU', destination = 'LIS'): Leg => ({ key, kind, km, origin, destination, date: '2026-03-03' });

const stampOf = (stamps: ReturnType<typeof buildStamps>, id: string) => stamps.find(s => s.id === id)!;
const input = (over: Partial<Parameters<typeof buildStamps>[0]> = {}) => ({ today: TODAY, countries: [], continentOf, trips: [], legs: [], flights: [], ...over });

describe('levels and progress', () => {
    it('counts the levels reached and how far the next is', () => {
        const s = stampOf(buildStamps(input({ countries: ['PT', 'BE', 'JP', 'ZA', 'BR', 'US', 'AU'] })), 'countries');
        // Seven countries: level I (5), halfway... (7 - 5) / (10 - 5) = 0.4 to level II.
        expect(s).toMatchObject({ value: 7, level: 1, next: 10 });
        expect(s.progress).toBeCloseTo(0.4, 5);
        expect(levelName(s.level)).toBe('I');
    });

    it('has nothing earned for an empty log, and full progress at the top', () => {
        const empty = buildStamps(input());
        expect(empty.every(s => s.level === 0 && s.value === 0)).toBe(true);
        expect(totalsOf(empty).earned).toBe(0);
        const top = stampOf(buildStamps(input({ countries: Array.from({ length: 100 }, (_, i) => `C${i}`) })), 'countries');
        expect(top).toMatchObject({ level: 5, next: null, progress: 1 });
    });
});

describe('the stamps', () => {
    it('counts continents from the countries, leaving out Antarctica and the unknown', () => {
        const s = stampOf(buildStamps(input({ countries: ['PT', 'BE', 'JP', 'AQ', 'XX'] })), 'continents');
        expect(s.value).toBe(2);
        expect(s.level).toBe(1);
    });

    it('counts distinct aircraft and airlines among flights that have flown', () => {
        const flights = [
            flight('1', 'BRU', 'LIS', '2026-03-03', '10:00', '2026-03-03', '12:00', { provider: 'TAP', vehicleModel: 'Airbus A320' }),
            flight('2', 'LIS', 'BRU', '2026-03-07', '10:00', '2026-03-07', '12:00', { provider: 'TAP', vehicleModel: 'airbus  a320' }),
            flight('3', 'BRU', 'NRT', '2026-04-03', '10:00', '2026-04-04', '12:00', { provider: 'JL', vehicleModel: 'Boeing 787' }),
            flight('4', 'BRU', 'MAD', '2026-12-30', '10:00', '2026-12-30', '12:00', { provider: 'IB', vehicleModel: 'Airbus A321' }),
            flight('5', 'BRU', 'LIS', '2026-05-01', '10:00', '2026-05-01', '12:00', { provider: 'KL', vehicleModel: 'Embraer 190', customFields: [{ key: 'canceled', value: 'TRUE' }] }),
        ];
        const stamps = buildStamps(input({ flights }));
        // The same aircraft written two ways counts once; the flight still ahead and the cancelled one do not count.
        expect(stampOf(stamps, 'aircraft').value).toBe(2);
        expect(stampOf(stamps, 'airlines').value).toBe(2);
    });

    it('counts the busiest airports you have been through', () => {
        const [first, second, third] = TOP_100_AIRPORTS.slice(0, 3).map(a => a.iata);
        const flights = [flight('1', first, second, '2026-03-03', '10:00', '2026-03-03', '12:00'), flight('2', second, 'XYZ', '2026-03-04', '10:00', '2026-03-04', '12:00')];
        expect(stampOf(buildStamps(input({ flights })), 'hubs').value).toBe(2);
        expect(third).toBeTruthy();
    });

    it('measures distance in orbits, rail, sea, and the longest flight', () => {
        const legs = [leg('a', 'flight', 30000), leg('b', 'flight', 15000), leg('c', 'rail', 600), leg('d', 'sea', 100), leg('e', 'sea', 120)];
        const flights = [flight('1', 'BRU', 'SYD', '2026-03-03', '10:00', '2026-03-04', '12:00', { distance: 16500 })];
        const stamps = buildStamps(input({ legs, flights }));
        expect(stampOf(stamps, 'distance')).toMatchObject({ value: 45820, level: 1, next: 80150 });
        expect(stampOf(stamps, 'rail')).toMatchObject({ value: 600, level: 1 });
        expect(stampOf(stamps, 'sea')).toMatchObject({ value: 2, level: 1 });
        expect(stampOf(stamps, 'longest')).toMatchObject({ value: 16500, level: 3, next: null });
    });

    it('counts trips taken and nights away, not cancelled or future ones', () => {
        const trips = [trip('a', '2026-03-01', '2026-03-11'), trip('b', '2026-05-01', '2026-05-04'), trip('c', '2026-06-01', '2026-06-05', { status: 'Cancelled' }), trip('d', '2027-01-01', '2027-01-09', { status: 'Upcoming' })];
        const stamps = buildStamps(input({ trips }));
        expect(stampOf(stamps, 'trips').value).toBe(2);
        expect(stampOf(stamps, 'nights').value).toBe(13);
    });
});

describe('streaks and positions', () => {
    it('finds the longest run of months with a trip', () => {
        const trips = [
            trip('1', '2026-01-10', '2026-01-12'), trip('2', '2026-02-20', '2026-02-22'), trip('3', '2026-03-05', '2026-03-06'),
            trip('4', '2026-05-01', '2026-05-03'), trip('5', '2026-06-01', '2026-06-02'),
        ];
        expect(monthStreak(trips, TODAY)).toBe(3);
        expect(monthStreak([], TODAY)).toBe(0);
    });

    it('lets a trip that spans months keep the run going', () => {
        expect(monthStreak([trip('x', '2026-01-25', '2026-03-05')], TODAY)).toBe(3);
        expect(monthStreak([trip('y', '2026-12-01', '2026-12-10', { status: 'Upcoming' })], TODAY)).toBe(0);
    });

    it('counts crossings of the equator and places within a polar circle', () => {
        const legs = [
            leg('1', 'flight', 8000, 'London', 'Nairobi'), leg('2', 'flight', 8000, 'Nairobi', 'London'),
            leg('3', 'flight', 2000, 'London', 'Paris'), leg('4', 'flight', 2000, 'Oslo', 'Tromsø'), leg('5', 'flight', 17000, 'LHR', 'SYD'),
        ];
        expect(equatorCrossings(legs)).toBe(3); // London to Nairobi and back, and LHR to Sydney
        expect(polarPlaces(legs)).toBe(1);
        expect(polarPlaces([leg('x', 'flight', 1, 'A', 'Nowhere Land')])).toBe(0);
    });
});

describe('wording', () => {
    it('uses the singular for a count of one, and leaves km alone', () => {
        expect(singular('crossings')).toBe('crossing');
        expect(singular('countries')).toBe('country');
        expect(singular('aircraft types')).toBe('aircraft type');
        expect(singular('km')).toBe('km');
        expect(singular('km by rail')).toBe('km by rail');
    });
});

describe('next up', () => {
    it('lists the stamps nearest their next level, never one with nothing yet', () => {
        const stamps = buildStamps(input({ countries: ['PT', 'BE', 'JP', 'ZA', 'BR', 'US', 'AU', 'CA', 'MX'] }));
        const up = nextUp(stamps, 2);
        expect(up.length).toBeLessThanOrEqual(2);
        expect(up.every(s => s.value > 0 && s.next !== null)).toBe(true);
        expect(up[0].progress).toBeGreaterThanOrEqual(up[up.length - 1].progress);
        expect(nextUp(buildStamps(input()))).toEqual([]);
    });
});
