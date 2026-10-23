import type { CountryResidenceStatus } from '../../../types';
import type { MapAppearanceSettings } from '../../../types/mapAppearance';

/**
 * What the scratch map draws for a country, and how big its markers are. Pure, so every toggle has one
 * tested meaning (tests/unit/mapScratch.test.ts).
 *
 *  - Lived in: lived countries (current or past) keep the scratched colour and gain a heavy outline.
 *    Off removes the outline; the country stays scratched, because you have been there.
 *  - Layovers: countries you only changed planes in. Off hides them. A country you also visited stays scratched.
 *  - Wishlist: countries you want to go to. Off hides them. A visited country stays scratched.
 *  - City pins: the size of every marker on the scratch map: the visited-city pins and the endpoints of any
 *    routes drawn over it. Off draws none (no dots, no labels).
 */

export type ScratchKind = 'lived' | 'visited' | 'layover' | 'wishlist' | 'none';

export interface ScratchToggles {
    showLived: boolean;
    showLayover: boolean;
    showWishlist: boolean;
}

/** Settings that were never saved read as on, as the toggles do. */
export const scratchToggles = (a: Pick<MapAppearanceSettings, 'showLivedCountries' | 'showLayoverCountries' | 'showWishlistCountries'>): ScratchToggles => ({
    showLived: a.showLivedCountries !== false,
    showLayover: a.showLayoverCountries !== false,
    showWishlist: a.showWishlistCountries !== false,
});

export const scratchKindOf = (
    statuses: CountryResidenceStatus[],
    visitedByTrips: boolean,
    t: ScratchToggles,
): ScratchKind => {
    const lived = statuses.includes('lived_current') || statuses.includes('lived_past');
    if (lived && t.showLived) return 'lived';
    if (lived || visitedByTrips || statuses.includes('visited')) return 'visited';
    if (statuses.includes('layover') && t.showLayover) return 'layover';
    if (statuses.includes('wishlist') && t.showWishlist) return 'wishlist';
    return 'none';
};

export const MARKER_SIZE = { off: 0, small: 3, medium: 4.5, large: 6.5 } as const;
export type MarkerSizeName = keyof typeof MARKER_SIZE;

/** Radius in px for a size setting; unknown values read as medium, 'off' is 0 (draw nothing). */
export const markerRadius = (size?: string): number => (size && size in MARKER_SIZE ? MARKER_SIZE[size as MarkerSizeName] : MARKER_SIZE.medium);

/**
 * Sizes of the markers on the map. On the scratch map the city-pin setting rules all of them, so Off really
 * leaves no pins, even at the ends of the routes drawn over it; elsewhere airports and cities have their own.
 */
export const markerSizes = (scratch: boolean, a: Pick<MapAppearanceSettings, 'airportSize' | 'citySize' | 'scratchCitySize'>) => {
    const pins = markerRadius(a.scratchCitySize);
    return scratch
        ? { airport: pins, city: pins, pins }
        : { airport: markerRadius(a.airportSize), city: markerRadius(a.citySize), pins: 0 };
};
