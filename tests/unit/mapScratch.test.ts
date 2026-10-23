import { describe, expect, it } from 'vitest';
import { asStatusList, isLayoverOnly, markerRadius, markerSizes, scratchKindOf, scratchToggles } from '../../components/new/map/mapScratch';

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
