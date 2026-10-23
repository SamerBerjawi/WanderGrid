import { describe, expect, it } from 'vitest';
import { NIGHT_LIGHTS_LAYER_ID, NIGHT_LIGHTS_MAX_NATIVE_ZOOM, NIGHT_LIGHTS_SOURCE_ID, NIGHT_LIGHTS_TILES, composeNightLightsStyle, nightLightsTileSize } from '../../services/nightLights';

const dark: any = {
    version: 8,
    sources: { openmaptiles: { type: 'vector', url: 'x' } },
    layers: [
        { id: 'background', type: 'background', paint: { 'background-color': '#111' } },
        { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', paint: { 'fill-color': '#000' } },
        { id: 'landcover_wood', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover', paint: { 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0, 9, 1] } },
        { id: 'landuse_park', type: 'fill', source: 'openmaptiles', 'source-layer': 'landuse', paint: {} },
        { id: 'highway_motorway_inner', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', paint: { 'line-color': '#fff' } },
        { id: 'highway_path', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', paint: { 'line-opacity': 0.9 } },
        { id: 'highway_motorway_subtle', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', paint: {} },
        { id: 'place_city', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', layout: {} },
    ],
};

describe('GIBS tiles', () => {
    it('asks the Black Marble layer at its finest native level', () => {
        expect(NIGHT_LIGHTS_MAX_NATIVE_ZOOM).toBe(8);
        NIGHT_LIGHTS_TILES.forEach(t => expect(t).toContain('VIIRS_Black_Marble/default/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png'));
    });
    it('declares half-size tiles on high-density screens so the next native level is requested', () => {
        expect(nightLightsTileSize(1)).toBe(256);
        expect(nightLightsTileSize(2)).toBe(128);
    });
});

describe('composeNightLightsStyle', () => {
    const style: any = composeNightLightsStyle(dark, { tileSize: 128, canvas: '#010203' });
    const ids = style.layers.map((l: any) => l.id);
    it('puts the imagery right above the canvas and keeps the vector source', () => {
        expect(ids.slice(0, 2)).toEqual(['rp-background', NIGHT_LIGHTS_LAYER_ID]);
        expect(style.layers[0].paint['background-color']).toBe('#010203');
        expect(style.sources.openmaptiles).toBeDefined();
        expect(style.sources[NIGHT_LIGHTS_SOURCE_ID]).toMatchObject({ type: 'raster', tileSize: 128, maxzoom: 8 });
    });
    it('drops what would cover the imagery', () => {
        expect(ids).not.toContain('background');
        expect(ids).not.toContain('landcover_wood');
        expect(ids).not.toContain('landuse_park');
        expect(ids).not.toContain('highway_motorway_subtle');
    });
    it('keeps water, roads and labels, fading the first two in as the imagery runs out', () => {
        expect(ids).toEqual(expect.arrayContaining(['water', 'highway_motorway_inner', 'highway_path', 'place_city']));
        const get = (id: string) => style.layers.find((l: any) => l.id === id);
        expect(get('water').paint['fill-opacity'][0]).toBe('interpolate');
        expect(get('highway_motorway_inner').paint['line-opacity']).toEqual(['interpolate', ['linear'], ['zoom'], 5.5, 0, 8, 1]);
        expect(get('highway_path').paint['line-opacity']).toEqual(['interpolate', ['linear'], ['zoom'], 5.5, 0, 8, 0.9]);
    });
    it('keeps the imagery visible under the vector map', () => {
        const stops = style.layers[1].paint['raster-opacity'];
        expect(stops[3]).toBe(8);
        expect(stops[stops.length - 1]).toBeGreaterThan(0.3);
    });
    it('does not change the style it was given', () => {
        expect(dark.layers.map((l: any) => l.id)).toContain('background');
    });
});
