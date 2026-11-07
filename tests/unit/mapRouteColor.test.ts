import { describe, expect, it } from 'vitest';
import { staticRouteColor } from '../../components/new/map/mapGeoColor';

type RGB = [number, number, number];
const lum = ([r, g, b]: RGB) => {
    const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a: RGB, b: RGB) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

describe('staticRouteColor', () => {
    it('contrasts with light basemaps: Positron land and its darkest large area, water', () => {
        const c = staticRouteColor(true);
        expect(contrast(c, [242, 242, 240])).toBeGreaterThanOrEqual(4.5);
        expect(contrast(c, [173, 211, 233])).toBeGreaterThanOrEqual(3);
    });
    it('contrasts with dark basemaps: the dark style and night imagery', () => {
        const c = staticRouteColor(false);
        expect(contrast(c, [20, 24, 30])).toBeGreaterThanOrEqual(7);
        expect(contrast(c, [60, 70, 85])).toBeGreaterThanOrEqual(4.5);
    });
    it('is a different colour per basemap lightness', () => {
        expect(staticRouteColor(true)).not.toEqual(staticRouteColor(false));
    });
});
