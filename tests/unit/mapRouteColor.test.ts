import { describe, expect, it } from 'vitest';
import { staticRouteColor } from '../../components/new/map/mapGeoColor';
import type { LegStatus } from '../../components/new/map/mapModel';

type RGB = [number, number, number];
const lum = ([r, g, b]: RGB) => {
    const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a: RGB, b: RGB) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

const STATUSES: LegStatus[] = ['past', 'upcoming', 'planning'];

describe('staticRouteColor', () => {
    it.each(STATUSES)('contrasts with light basemaps for %s routes: Positron land and water', status => {
        const c = staticRouteColor(true, status);
        expect(contrast(c, [242, 242, 240])).toBeGreaterThanOrEqual(4.5);
        expect(contrast(c, [173, 211, 233])).toBeGreaterThanOrEqual(3);
    });
    it.each(STATUSES)('contrasts with dark basemaps for %s routes: dark style and night imagery', status => {
        const c = staticRouteColor(false, status);
        expect(contrast(c, [20, 24, 30])).toBeGreaterThanOrEqual(7);
        expect(contrast(c, [60, 70, 85])).toBeGreaterThanOrEqual(4.5);
    });
    it.each(STATUSES)('is a different colour per basemap lightness for %s routes', status => {
        expect(staticRouteColor(true, status)).not.toEqual(staticRouteColor(false, status));
    });
    it.each([true, false])('differentiates past, upcoming, and planning routes (lightBasemap=%s)', light => {
        const colors = STATUSES.map(status => staticRouteColor(light, status).join(','));
        expect(new Set(colors).size).toBe(3);
    });
});
