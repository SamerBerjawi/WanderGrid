import { describe, expect, it } from 'vitest';
import { buildCountryIndex } from '../../utils/countryLookup';
import { collectTripCountries, filterTripsForMap, type MapFilterState } from '../../utils/mapFilters';
import type { Trip, Transport } from '../../types';

const square = (x0: number, y0: number, x1: number, y1: number) => [
    [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]],
];

const index = buildCountryIndex({
    features: [
        { properties: { ISO_A2: 'GB', NAME: 'United Kingdom' }, geometry: { type: 'Polygon', coordinates: square(-6, 50, 2, 59) } },
        { properties: { ISO_A2: 'FR', NAME: 'France' }, geometry: { type: 'Polygon', coordinates: square(-4, 42, 7, 50) } },
        { properties: { ISO_A2: 'IT', NAME: 'Italy' }, geometry: { type: 'Polygon', coordinates: square(8, 37, 18, 47) } },
    ],
});

const COORDS: Record<string, { lat: number; lng: number }> = {
    LHR: { lat: 51.47, lng: -0.45 },
    CDG: { lat: 49.01, lng: 2.55 },
    FCO: { lat: 41.8, lng: 12.24 },
    MXP: { lat: 45.63, lng: 8.73 },
};
const lookup = (name: string) => COORDS[name];

const leg = (id: string, origin: string, destination: string): Transport => ({
    id,
    itineraryId: id,
    type: 'One-Way',
    mode: 'Flight',
    provider: 'Test',
    identifier: id,
    confirmationCode: '',
    origin,
    destination,
    departureDate: '2026-05-01',
    departureTime: '10:00',
    arrivalDate: '2026-05-01',
    arrivalTime: '12:00',
});

const trip = (id: string, transports: Transport[], overrides: Partial<Trip> = {}): Trip => ({
    id,
    name: `Trip ${id}`,
    location: '',
    startDate: '2026-05-01',
    endDate: '2026-05-10',
    status: 'Upcoming',
    participants: [],
    transports,
    ...overrides,
});

const baseFilters = (patch: Partial<MapFilterState> = {}): MapFilterState => ({
    statusFilter: 'all',
    yearFilter: 'all',
    countryFilter: [],
    depFilter: [],
    arrFilter: [],
    dateFrom: '',
    dateTo: '',
    ...patch,
});

describe('mapFilters', () => {
    const sampleTrips: Trip[] = [
        trip('t1', [
            leg('l1', 'LHR', 'CDG'), // GB -> FR (no Italy)
            leg('l2', 'CDG', 'FCO'), // FR -> IT (to Italy)
            leg('l3', 'FCO', 'MXP'), // IT -> IT (within Italy)
            leg('l4', 'MXP', 'LHR'), // IT -> GB (from Italy)
        ]),
        trip('t2', [
            leg('l5', 'LHR', 'CDG'), // GB -> FR only
        ]),
    ];

    it('collects sorted unique countries touched by trip transports', () => {
        const countries = collectTripCountries(sampleTrips, index, lookup);
        expect(countries).toEqual([
            { value: 'FR', label: 'France' },
            { value: 'IT', label: 'Italy' },
            { value: 'GB', label: 'United Kingdom' },
        ]);
    });

    it('shows only routes from, to, and within the selected country', () => {
        const filtered = filterTripsForMap(
            sampleTrips,
            baseFilters({ countryFilter: ['IT'] }),
            index,
            lookup,
            '2026-01-01'
        );

        expect(filtered).toHaveLength(1);
        expect(filtered[0].id).toBe('t1');
        expect(filtered[0].transports?.map(t => t.id)).toEqual(['l2', 'l3', 'l4']);
    });

    it('supports selecting multiple countries', () => {
        const filtered = filterTripsForMap(
            sampleTrips,
            baseFilters({ countryFilter: ['FR', 'IT'] }),
            index,
            lookup,
            '2026-01-01'
        );

        expect(filtered).toHaveLength(2);
        expect(filtered[0].transports?.map(t => t.id)).toEqual(['l1', 'l2', 'l3', 'l4']);
        expect(filtered[1].transports?.map(t => t.id)).toEqual(['l5']);
    });

    it('returns all trips and transports when countryFilter is empty', () => {
        const filtered = filterTripsForMap(sampleTrips, baseFilters(), index, lookup, '2026-01-01');
        expect(filtered).toHaveLength(2);
        expect(filtered[0].transports).toHaveLength(4);
    });

    it('combines countryFilter with origin/destination filters', () => {
        const filtered = filterTripsForMap(
            sampleTrips,
            baseFilters({ countryFilter: ['IT'], depFilter: ['LHR'] }),
            index,
            lookup,
            '2026-01-01'
        );
        // t1's IT-touching legs are l2 (CDG->FCO), l3 (FCO->MXP), l4 (MXP->LHR): none originate at LHR.
        expect(filtered).toHaveLength(0);
    });
});
