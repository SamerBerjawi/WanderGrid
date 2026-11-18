import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildCountryIndex } from '../../utils/countryLookup';

const square = (x0: number, y0: number, x1: number, y1: number) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
const geo = {
    features: [
        { properties: { ISO_A2: 'BE', NAME: 'Belgium' }, geometry: { type: 'Polygon', coordinates: square(2, 49, 7, 52) } },
        // A country with a hole (a lake or enclave), and a second island in a multipolygon.
        { properties: { ISO_A2: 'XX', NAME: 'Ringland' }, geometry: { type: 'Polygon', coordinates: [square(10, 10, 20, 20)[0], square(13, 13, 17, 17)[0]] } },
        { properties: { ISO_A2: 'IS', NAME: 'Islands' }, geometry: { type: 'MultiPolygon', coordinates: [square(30, 0, 31, 1), square(40, 0, 41, 1)] } },
        { properties: { ISO_A2: '-99', ISO_A2_EH: 'FR', NAME: 'France' }, geometry: { type: 'Polygon', coordinates: square(-5, 42, 2, 51) } },
    ],
};

describe('which country a point is in', () => {
    const index = buildCountryIndex(geo);

    it('finds the country containing the point, in a polygon or any part of a multipolygon', () => {
        expect(index.find(4.35, 50.85)).toEqual({ code: 'BE', name: 'Belgium' });
        expect(index.find(40.5, 0.5)?.code).toBe('IS');
        expect(index.find(0, 45)?.code).toBe('FR'); // the code comes from ISO_A2_EH when ISO_A2 is -99
    });

    it('leaves a hole out, and finds a point just off the coast by its nearest border', () => {
        expect(index.find(15, 15)).not.toEqual({ code: 'XX', name: 'Ringland' });
        expect(index.find(7.4, 51)?.code).toBe('BE'); // 0.4 degrees off the edge
        expect(index.find(100, -40)).toBeNull();
    });

    it('copes with no data', () => {
        expect(buildCountryIndex(null).find(1, 1)).toBeNull();
        expect(buildCountryIndex({ features: [] }).size).toBe(0);
    });

    it('separates the UK into England, Scotland, Wales, and Northern Ireland across 110m, 50m, and 10m map borders', () => {
        for (const file of [
            'public/data/ne_110m_admin_0_countries.geojson',
            'public/data/ne_50m_admin_0_countries.geojson',
            'public/data/ne_10m_admin_0_countries.geojson',
        ]) {
            const geo = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), file), 'utf8'));
            const index = buildCountryIndex(geo);
            expect(index.find(-0.1278, 51.5074)).toEqual({ code: 'GB-ENG', name: 'England' });
            expect(index.find(-3.1883, 55.9533)).toEqual({ code: 'GB-SCT', name: 'Scotland' });
            expect(index.find(-3.1791, 51.4816)).toEqual({ code: 'GB-WLS', name: 'Wales' });
            expect(index.find(-5.9301, 54.5973)).toEqual({ code: 'GB-NIR', name: 'Northern Ireland' });
            expect(geo.features.some((f: any) => f.properties?.ISO_A2 === 'GB')).toBe(false);
        }
    });
});
