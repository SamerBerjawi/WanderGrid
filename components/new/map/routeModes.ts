import type { LegMode } from './mapModel';
import type { RGB, RpPalette } from './mapPalette';

/**
 * Route colour per transport mode on the New map (the "Transport" route colour, the default):
 * flights rust (as the Flights view tab), rail ink, road green (as Land & sea), sea mustard. Sea
 * routes are also dashed, so every mode reads apart even where colours meet. Rail's ink follows the
 * basemap, not the app theme: near-black on light basemaps, near-white on dark ones.
 */
export const ROUTE_MODES: LegMode[] = ['flight', 'rail', 'road', 'sea'];

/** The New map's route colour: the shared appearance choices plus `mode` (one colour per transport). */
export type RouteColorMode = 'mode' | 'gradient' | 'frequency' | 'default';
export const ROUTE_COLOR_MODES: RouteColorMode[] = ['mode', 'gradient', 'frequency', 'default'];

export const ROUTE_MODE_LABEL: Record<LegMode, string> = { flight: 'Flight', rail: 'Rail', road: 'Road', sea: 'Sea' };

/** Classes for legend swatches (same tokens as the map colours). */
export const ROUTE_MODE_SWATCH: Record<LegMode, string> = {
    flight: 'bg-rp-rust',
    rail: 'bg-rp-ink',
    road: 'bg-rp-green',
    sea: 'bg-rp-mustard',
};

const INK_DARK: RGB = [24, 26, 26];
const INK_LIGHT: RGB = [237, 234, 227];

export const routeModeColor = (mode: LegMode, p: RpPalette, lightBasemap: boolean): RGB => {
    if (mode === 'flight') return p.rust;
    if (mode === 'rail') return lightBasemap ? INK_DARK : INK_LIGHT;
    if (mode === 'road') return p.green;
    return p.mustard;
};
