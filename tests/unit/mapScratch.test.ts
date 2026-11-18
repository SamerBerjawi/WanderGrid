import { describe, expect, it } from 'vitest';
import { asStatusList, countScratchCountries, isLayoverOnly, markerRadius, markerSizes, scratchKindOf, scratchToggles } from '../../components/new/map/mapScratch';
import { deriveScratchCountryData } from '../../hooks/useExpeditionMapData';
import type { CountryResidenceStatus, Trip, VisitedItem } from '../../types';
import { flight } from './helpers';

const on = { showLived: true, showVisited: true, showLayover: true, showWishlist: true };

describe('scratchKindOf', () => {
    it('lived countries are lived while the toggle is on, and stay scratched when it is off', () => {
        expect(scratchKindOf(['lived_current'], true, on)).toBe('lived');
        expect(scratchKindOf(['lived_past'], true, on)).toBe('lived');
        expect(scratchKindOf(['lived_current'], true, { ...on, showLived: false })).toBe('visited');
        expect(scratchKindOf(['lived_past'], false, { ...on, showLived: false })).toBe('visited');
    });
    it('layovers show only while the toggle is on', () => {
        expect(scratchKindOf(['layover'], false, on)).toBe('layover');
        expect(scratchKindOf(['layover'], false, { ...on, showLayover: false })).toBe('none');
    });
    it('wishlist is drawn over layover, and layover shows when wishlist is off', () => {
        expect(scratchKindOf(['layover', 'wishlist'], false, on)).toBe('wishlist');
        expect(scratchKindOf(['wishlist', 'layover'], false, { ...on, showWishlist: false })).toBe('layover');
        expect(scratchKindOf(['layover', 'wishlist'], false, { ...on, showLayover: false })).toBe('wishlist');
    });
    it('wishlist shows only while the toggle is on', () => {
        expect(scratchKindOf(['wishlist'], false, on)).toBe('wishlist');
        expect(scratchKindOf(['wishlist'], false, { ...on, showWishlist: false })).toBe('none');
    });
    it('a visited country stays scratched whatever the other toggles say', () => {
        const off = { showLived: false, showVisited: true, showLayover: false, showWishlist: false };
        expect(scratchKindOf(['visited'], true, off)).toBe('visited');
        expect(scratchKindOf(['layover', 'visited'], false, off)).toBe('visited');
        expect(scratchKindOf(['wishlist'], true, off)).toBe('visited');
    });
    it('Visited off hides visited countries but not lived ones while Lived in is on', () => {
        const t = { ...on, showVisited: false };
        expect(scratchKindOf(['visited'], true, t)).toBe('none');
        expect(scratchKindOf([], true, t)).toBe('none');
        expect(scratchKindOf(['lived_current'], true, t)).toBe('lived');
        expect(scratchKindOf(['lived_current'], true, { ...t, showLived: false })).toBe('none');
        expect(scratchKindOf(['layover'], false, t)).toBe('layover');
    });
    it('a country with no status and no trips is not drawn', () => {
        expect(scratchKindOf([], false, on)).toBe('none');
    });
});

describe('scratchToggles', () => {
    it('reads unset settings as on and false as off', () => {
        expect(scratchToggles({})).toEqual(on);
        expect(scratchToggles({ showLivedCountries: false, showVisitedCountries: false, showLayoverCountries: false, showWishlistCountries: false })).toEqual({ showLived: false, showVisited: false, showLayover: false, showWishlist: false });
    });
});

describe('marker sizes', () => {
    it('off is zero and unknown reads as medium', () => {
        expect(markerRadius('off')).toBe(0);
        expect(markerRadius('large')).toBeGreaterThan(markerRadius('small'));
        expect(markerRadius(undefined)).toBe(markerRadius('medium'));
    });
    it('on the scratch map city pins Off removes every marker, route ends included', () => {
        expect(markerSizes(true, { airportSize: 'large', citySize: 'large', scratchCitySize: 'off' })).toEqual({ airport: 0, city: 0, pins: 0 });
    });
    it('on the scratch map the pin size rules the route ends too', () => {
        const s = markerSizes(true, { airportSize: 'off', citySize: 'off', scratchCitySize: 'small' });
        expect(s.airport).toBe(markerRadius('small'));
        expect(s.city).toBe(markerRadius('small'));
    });
    it('on the other views airports and cities keep their own sizes and there are no pins', () => {
        expect(markerSizes(false, { airportSize: 'off', citySize: 'large', scratchCitySize: 'large' })).toEqual({ airport: 0, city: markerRadius('large'), pins: 0 });
    });
});

describe('isLayoverOnly', () => {
    it('is a layover with no visit or residence, wishlist allowed', () => {
        expect(isLayoverOnly(['layover'])).toBe(true);
        expect(isLayoverOnly(['layover', 'wishlist'])).toBe(true);
        expect(isLayoverOnly(['layover', 'visited'])).toBe(false);
        expect(isLayoverOnly(['lived_past', 'layover'])).toBe(false);
        expect(isLayoverOnly(['wishlist'])).toBe(false);
        expect(isLayoverOnly([])).toBe(false);
    });
    it('reads a single status as a list', () => {
        expect(asStatusList('layover')).toEqual(['layover']);
        expect(asStatusList(undefined)).toEqual([]);
    });
});

describe('countScratchCountries', () => {
    const visited = ['FR', 'ES', 'DE']; // FR, ES visited by status/trip, DE also lived_past
    const byCode: Record<string, CountryResidenceStatus[]> = {
        FR: ['visited'],
        DE: ['lived_past'],
        QA: ['layover'],
        JP: ['wishlist'],
        TR: ['layover', 'wishlist'],
    };

    it('counts only categories enabled in map settings', () => {
        expect(countScratchCountries(visited, byCode, { showVisited: true, showLived: false, showLayover: false, showWishlist: false })).toBe(3);
        expect(countScratchCountries(visited, byCode, { showVisited: true, showLived: true, showLayover: false, showWishlist: false })).toBe(3);
        expect(countScratchCountries(visited, byCode, { showVisited: false, showLived: true, showLayover: false, showWishlist: false })).toBe(1);
        expect(countScratchCountries(visited, byCode, { showVisited: true, showLived: true, showLayover: true, showWishlist: false })).toBe(5);
        expect(countScratchCountries(visited, byCode, { showVisited: false, showLived: false, showLayover: true, showWishlist: false })).toBe(2);
        expect(countScratchCountries(visited, byCode, { showVisited: false, showLived: false, showLayover: false, showWishlist: true })).toBe(2);
        expect(countScratchCountries(visited, byCode, on)).toBe(6);
        expect(countScratchCountries(visited, byCode, { showVisited: false, showLived: false, showLayover: false, showWishlist: false })).toBe(0);
    });

    it('deduplicates repeated codes and ignores empty/XX codes', () => {
        expect(countScratchCountries(['fr', 'FR', 'XX', ''], { FR: ['visited'], XX: ['visited'] }, on)).toBe(1);
    });
});

describe('deriveScratchCountryData', () => {
    const trip = (overrides: Partial<Trip>): Trip => ({
        id: 't1',
        name: 'Trip',
        location: '',
        startDate: '2025-05-01',
        endDate: '2025-05-10',
        status: 'Past',
        participants: [],
        privacy: 'Private',
        ...overrides,
    });

    it('keeps layover countries (even with tracked cities or split independent flights) out of visitedCountryCodes', () => {
        const visited: VisitedItem[] = [
            { id: 'c-doh', type: 'city', code: 'DOH', name: 'Doha', countryCode: 'QA' },
        ];
        const trips: Trip[] = [
            trip({
                id: 'leg1',
                transports: [
                    flight('f1', 'CDG', 'DOH', '2025-05-01', '08:00', '2025-05-01', '15:00', { isLayover: true }),
                ],
            }),
            trip({
                id: 'leg2',
                transports: [
                    flight('f2', 'DOH', 'HND', '2025-05-01', '17:00', '2025-05-02', '04:00'),
                ],
            }),
        ];

        const data = deriveScratchCountryData(visited, trips, '2026-01-01');
        expect(data.visitedCountryCodes.sort()).toEqual(['FR', 'JP']);
        expect(data.countryStatusesByCode['QA']).toEqual(['layover']);
        expect(countScratchCountries(data.visitedCountryCodes, data.countryStatusesByCode, { showVisited: true, showLived: true, showLayover: false, showWishlist: false })).toBe(2);
        expect(countScratchCountries(data.visitedCountryCodes, data.countryStatusesByCode, { showVisited: true, showLived: true, showLayover: true, showWishlist: false })).toBe(3);
    });

    it('excludes cancelled, planning, and future trips from visited countries and deduplicates GB alongside GB-ENG', () => {
        const visited: VisitedItem[] = [
            { id: 'country_GB-ENG', type: 'country', code: 'GB-ENG', name: 'England', residenceStatus: 'lived_past' },
            { id: 'city-london', type: 'city', code: 'LON', name: 'London', countryCode: 'GB' },
            { id: 'city-unknown', type: 'city', code: 'UNK', name: 'Unknown', countryCode: 'XX' },
        ];
        const trips: Trip[] = [
            trip({ id: 'cancelled', status: 'Cancelled', transports: [flight('c1', 'CDG', 'DXB', '2025-01-01', '10:00', '2025-01-02', '06:00')] }),
            trip({ id: 'planning', status: 'Planning', transports: [flight('p1', 'CDG', 'JFK', '2025-02-01', '10:00', '2025-02-01', '13:00')] }),
            trip({ id: 'future', status: 'Upcoming', startDate: '2027-06-01', endDate: '2027-06-10', transports: [flight('u1', 'CDG', 'HND', '2027-06-01', '10:00', '2027-06-02', '18:00')] }),
        ];

        const data = deriveScratchCountryData(visited, trips, '2026-01-01');
        expect(data.visitedCountryCodes).toEqual(['GB-ENG']);
        expect(countScratchCountries(data.visitedCountryCodes, data.countryStatusesByCode, { showVisited: true, showLived: true, showLayover: true, showWishlist: true })).toBe(1);
    });
});
