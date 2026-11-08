import { describe, expect, it } from 'vitest';
import type { Trip } from '../../types';
import type { Leg } from '../../utils/dashboardModel';
import { buildReview, countryCodeOfPlace, countryName, homeCountryOf, hasTravel, monthName, percentChange, reviewYears, slidesFor } from '../../utils/yearReview';
import { flight } from './helpers';

const TODAY = '2026-11-20';

const trip = (id: string, name: string, start: string, end: string, cc?: string, extra: Partial<Trip> = {}): Trip => ({
    id, name, location: name, startDate: start, endDate: end, status: 'Past', participants: ['u1'],
    ...(cc ? { coordinates: { lat: 0, lng: 0, countryCode: cc } } : {}), ...extra,
});
const leg = (key: string, date: string, km: number, kind: Leg['kind'] = 'flight', origin = 'BRU', destination = 'LIS'): Leg => ({ key, kind, origin, destination, date, km });

const trips = [
    trip('a', 'Lisbon', '2026-03-03', '2026-03-07', 'PT'),
    trip('b', 'Tokyo', '2026-10-28', '2026-11-08', 'JP'),
    trip('c', 'Lisbon again', '2025-05-01', '2025-05-04', 'PT'),
    trip('d', 'Cancelled', '2026-06-01', '2026-06-05', 'ES', { status: 'Cancelled' }),
];
const legs = [leg('1', '2026-03-03', 1700), leg('2', '2026-03-07', 1700), leg('3', '2026-10-28', 9500), leg('4', '2026-11-08', 9500, 'flight', 'NRT', 'BRU'), leg('5', '2026-03-05', 300, 'rail'), leg('6', '2025-05-01', 1700)];
const flights = [
    flight('1', 'BRU', 'LIS', '2026-03-03', '10:15', '2026-03-03', '12:05', { provider: 'TP', vehicleModel: 'Airbus A320', distance: 1700, duration: 170 }),
    flight('2', 'LIS', 'BRU', '2026-03-07', '18:40', '2026-03-07', '22:20', { provider: 'TP', vehicleModel: 'Airbus A320', distance: 1700, duration: 160 }),
    flight('3', 'BRU', 'NRT', '2026-10-28', '12:00', '2026-10-29', '08:00', { provider: 'JL', vehicleModel: 'Boeing 787', distance: 9500, duration: 780 }),
    flight('4', 'NRT', 'BRU', '2026-11-08', '11:00', '2026-11-08', '17:00', { provider: 'JL', vehicleModel: 'Boeing 787', distance: 9500, duration: 840 }),
    flight('5', 'BRU', 'LIS', '2025-05-01', '10:00', '2025-05-01', '12:00', { distance: 1700, duration: 170 }),
    flight('6', 'BRU', 'MAD', '2026-12-20', '10:00', '2026-12-20', '12:00', { distance: 1300 }),
];

const review = (year = 2026) => buildReview({ year, today: TODAY, trips, legs, flights });

describe('buildReview', () => {
    it('adds up trips, nights and distance for the year, leaving out cancelled trips and other years', () => {
        const r = review();
        expect(r.trips).toBe(2);
        expect(r.nights).toBe(4 + 11);
        expect(r.km).toBe(1700 + 1700 + 9500 + 9500 + 300);
        expect(r.orbits).toBeCloseTo(r.km / 40075, 5);
        expect(r.kmByKind).toMatchObject({ flight: 22400, rail: 300, road: 0, sea: 0 });
    });

    it('splits nights by month and names the busiest one and the longest trip', () => {
        const r = review();
        expect(r.monthNights[2]).toBe(4);
        expect(r.monthNights[9]).toBe(4);
        expect(r.monthNights[10]).toBe(7);
        expect(r.busiestMonth).toEqual({ month: 10, nights: 7 });
        expect(r.longestTrip).toEqual({ name: 'Tokyo', nights: 11 });
    });

    it('does not count coming home as a visit: the starting airport, or else where most journeys set off from', () => {
        const homeLegs = [leg('h1', '2026-03-03', 1700, 'flight', 'BRU', 'LIS'), leg('h2', '2026-03-07', 1700, 'flight', 'LIS', 'BRU'), leg('h3', '2026-10-28', 1700, 'flight', 'BRU', 'MAD')];
        expect(homeCountryOf(homeLegs)).toBe('BE');
        expect(buildReview({ year: 2026, today: TODAY, trips: [], legs: homeLegs, flights: [] }).countries).not.toContain('BE');
        // A trip abroad that starts elsewhere: an explicit home wins over the guess.
        const abroad = [leg('a1', '2026-04-01', 500, 'flight', 'LIS', 'BRU'), leg('a2', '2026-04-05', 500, 'flight', 'BRU', 'LIS')];
        expect(buildReview({ year: 2026, today: TODAY, trips: [], legs: abroad, flights: [], home: 'PT' }).countries).toEqual(['BE']);
        expect(countryCodeOfPlace('BRU')).toBe('BE');
        expect(countryCodeOfPlace(undefined)).toBeUndefined();
    });

    it('counts a trip that spans New Year in both years', () => {
        const winter = trip('w', 'Winter', '2025-12-28', '2026-01-04', 'AT');
        const r = buildReview({ year: 2026, today: TODAY, trips: [winter], legs: [], flights: [] });
        expect(r.nights).toBe(3);
        expect(r.trips).toBe(0);
        expect(buildReview({ year: 2025, today: TODAY, trips: [winter], legs: [], flights: [] }).nights).toBe(4);
    });

    it('does not count nights that have not happened yet', () => {
        const now = trip('n', 'Now', '2026-11-18', '2026-11-30', 'IT', { status: 'Upcoming' });
        expect(buildReview({ year: 2026, today: TODAY, trips: [now], legs: [], flights: [] }).nights).toBe(2);
    });

    it('finds countries visited and the ones new this year', () => {
        const r = review();
        expect(r.countries).toEqual(['JP', 'PT']);
        expect(r.newCountries).toEqual(['JP']);
        expect(review(2025).newCountries).toEqual(['PT']);
    });

    it('reads the flight figures: longest, favourites, hours and carbon', () => {
        const r = review();
        expect(r.flights).toBe(4);
        expect(r.flightMinutes).toBe(170 + 160 + 780 + 840);
        expect(r.longestFlight).toMatchObject({ from: 'BRU', to: 'NRT', km: 9500, minutes: 780 });
        expect(r.topRoute).toMatchObject({ label: 'BRU ↔ LIS', count: 2 });
        expect(r.topAirport).toEqual({ label: 'BRU', count: 4 });
        expect(r.topAircraft).toMatchObject({ count: 2 });
        expect(['Airbus A320', 'Boeing 787']).toContain(r.topAircraft?.label);
        expect(r.topAirline?.count).toBe(2);
        expect(r.co2Kg).toBeGreaterThan(1000);
        expect(r.trees).toBeGreaterThan(0);
    });

    it('ignores flights that are cancelled or still ahead', () => {
        // The December flight is after today (and is not in the 4); a cancelled one is marked by a custom field.
        const cancelled = flight('c', 'BRU', 'LIS', '2026-04-01', '10:00', '2026-04-01', '12:00', { distance: 1700, customFields: [{ key: 'canceled', value: 'TRUE' }] });
        const r = buildReview({ year: 2026, today: TODAY, trips: [], legs: [], flights: [...flights, cancelled] });
        expect(r.flights).toBe(4);
    });

    it('compares with the year before, and has no comparison for a first year', () => {
        expect(review().before).toEqual({ km: 1700, trips: 1, nights: 3 });
        expect(review(2025).before).toBeNull();
    });

    it('carries leave through only when days were used on trips', () => {
        const withLeave = buildReview({ year: 2026, today: TODAY, trips, legs, flights, leave: { days: 9, allowance: 25, left: 8 } });
        expect(withLeave.leave).toEqual({ days: 9, allowance: 25, left: 8 });
        // No leave used on trips is not worth a slide, even with an allowance.
        expect(buildReview({ year: 2026, today: TODAY, trips, legs, flights, leave: { days: 0, allowance: 25, left: 25 } }).leave).toBeNull();
    });
});

describe('slides', () => {
    it('gives a full year every slide', () => {
        const r = buildReview({ year: 2026, today: TODAY, trips, legs, flights, leave: { days: 9, allowance: 25, left: 8 } });
        expect(slidesFor(r)).toEqual(['intro', 'distance', 'time', 'places', 'longest', 'favourites', 'carbon', 'leave', 'outro']);
    });

    it('skips what a quiet year has no figures for', () => {
        const quiet = buildReview({ year: 2026, today: TODAY, trips: [trip('q', 'Weekend', '2026-05-01', '2026-05-03', 'FR')], legs: [], flights: [] });
        expect(slidesFor(quiet)).toEqual(['intro', 'time', 'places', 'outro']);
        expect(hasTravel(quiet)).toBe(true);
        const none = buildReview({ year: 2020, today: TODAY, trips, legs, flights });
        expect(hasTravel(none)).toBe(false);
        expect(slidesFor(none)).toEqual(['intro', 'outro']);
    });
});

describe('helpers', () => {
    it('lists the years with travel, newest first, never a future year', () => {
        expect(reviewYears(trips, legs, TODAY)).toEqual([2026, 2025]);
        expect(reviewYears([trip('f', 'Future', '2027-01-01', '2027-01-05')], [], TODAY)).toEqual([]);
    });

    it('reports a change only when it is at least 5%', () => {
        expect(percentChange(124, 100)).toBe(24);
        expect(percentChange(60, 100)).toBe(-40);
        expect(percentChange(102, 100)).toBeNull();
        expect(percentChange(5, 0)).toBeNull();
        expect(percentChange(5, undefined)).toBeNull();
    });

    it('names months and countries', () => {
        expect(monthName(10, 2026)).toBe('November');
        expect(countryName('PT')).toBe('Portugal');
    });
});
