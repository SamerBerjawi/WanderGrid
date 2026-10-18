import type { LegMode } from './mapModel';
import type { RGB, RpPalette } from './mapPalette';

/**
 * Route colour per transport mode on the New map (the "Transport" route colour, the default):
 * flights rust (as the Flights view tab), rail ink, road green (as Land & sea), sea mustard (dashed).
 * Rail and sea follow the basemap, not the app theme: rail is near-black on light basemaps and
 * near-white on dark ones; sea is ochre (the darker mustard) on light basemaps and mustard on dark.
 */

/** The New map's route colour: the shared appearance choices plus `mode` (one colour per transport). */
export type RouteColorMode = 'mode' | 'gradient' | 'frequency' | 'default';
export const ROUTE_COLOR_MODES: RouteColorMode[] = ['mode', 'gradient', 'frequency', 'default'];

const INK_DARK: RGB = [24, 26, 26];
const INK_LIGHT: RGB = [237, 234, 227];
/** rp-ochre in light mode: mustard dark enough to read on light basemaps. */
const OCHRE: RGB = [154, 116, 10];

export const routeModeColor = (mode: LegMode, p: RpPalette, lightBasemap: boolean): RGB => {
    if (mode === 'flight') return p.rust;
    if (mode === 'rail') return lightBasemap ? INK_DARK : INK_LIGHT;
    if (mode === 'road') return p.green;
    return lightBasemap ? OCHRE : p.mustard;
};
