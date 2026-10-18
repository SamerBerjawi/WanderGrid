import { CountryResidenceStatus, VisitedItem, getResidenceStatuses } from '../../../types';
import { mix, type RGB, type RpPalette } from '../map/mapPalette';

/**
 * Country status colours on the Atlas (decided 2026-10-18): visited = green, lived (past or current)
 * = ink, wishlist = mustard, layover only = a muted outline. One tone per country, strongest first.
 */
export type AtlasTone = 'lived' | 'visited' | 'wishlist' | 'layover';

export const toneOf = (item: Pick<VisitedItem, 'residenceStatus' | 'residenceStatuses' | 'isTransit'>): AtlasTone => {
    const s = getResidenceStatuses(item);
    if (s.includes('lived_current') || s.includes('lived_past')) return 'lived';
    if (s.includes('visited')) return 'visited';
    if (s.includes('wishlist')) return 'wishlist';
    return 'layover';
};

export const TONE_LABEL: Record<AtlasTone, string> = {
    lived: 'Lived',
    visited: 'Visited',
    wishlist: 'Wishlist',
    layover: 'Layover',
};

/** Chip and swatch classes per tone. */
export const TONE_CHIP: Record<AtlasTone, string> = {
    lived: 'bg-rp-ink text-rp-on-ink',
    visited: 'bg-rp-green text-rp-paper',
    wishlist: 'bg-rp-mustard text-rp-on-mustard',
    layover: 'bg-transparent text-rp-muted ring-1 ring-inset ring-rp-muted',
};

/** A small accent strip/dot on cards. */
export const TONE_DOT: Record<AtlasTone, string> = {
    lived: 'bg-rp-ink',
    visited: 'bg-rp-green',
    wishlist: 'bg-rp-mustard',
    layover: 'bg-transparent ring-1 ring-inset ring-rp-muted',
};

/** Map fill per tone, from the live palette (SVG attributes can't read CSS variables). */
export const toneFill = (tone: AtlasTone | null, p: RpPalette): RGB => {
    if (tone === 'lived') return p.ink;
    if (tone === 'visited') return p.green;
    if (tone === 'wishlist') return p.mustard;
    // Layover: a step darker than unvisited land, so it reads as "touched" without a colour.
    if (tone === 'layover') return mix(p.line, p.muted, 0.45);
    // Unvisited land sits on the card surface (the sea).
    return p.line;
};

/** Status names for the status picker, in display order, with the two groups that can't mix. */
export const STATUS_OPTIONS: { value: CountryResidenceStatus; label: string; group: 'stay' | 'plan' }[] = [
    { value: 'visited', label: 'Visited', group: 'stay' },
    { value: 'lived_past', label: 'Lived here', group: 'stay' },
    { value: 'lived_current', label: 'Live here now', group: 'stay' },
    { value: 'layover', label: 'Layover', group: 'plan' },
    { value: 'wishlist', label: 'Wishlist', group: 'plan' },
];
