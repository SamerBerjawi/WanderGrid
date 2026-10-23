import type { StyleSpecification } from 'maplibre-gl';

/**
 * The Night lights basemap: NASA GIBS "Black Marble" imagery with OpenFreeMap's dark vector detail on top.
 *
 * GIBS serves VIIRS_Black_Marble (Suomi NPP, 2016 composite, 500 m) as 256 px PNG tiles in the
 * GoogleMapsCompatible_Level8 tile matrix set: native levels 0 to 8 and nothing finer, so past zoom 8 the
 * picture can only be enlarged. Up to that level the imagery is requested at the best native level for the
 * screen (twice as many tiles per side on high-density displays, so it is not an enlarged coarser level);
 * beyond it the imagery fades back and the dark vector map (water edges, roads, rail, buildings, labels)
 * takes over, so cities and roads stay sharp with the lights still glowing underneath.
 */

export const NIGHT_LIGHTS_SOURCE_ID = 'rp-night-lights';
export const NIGHT_LIGHTS_LAYER_ID = 'rp-night-lights';
/** The finest level GIBS has for this layer. */
export const NIGHT_LIGHTS_MAX_NATIVE_ZOOM = 8;

export const NIGHT_LIGHTS_TILES = ['a', 'b', 'c'].map(s =>
    `https://gibs-${s}.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png`);

/** Tile size to declare: 128 makes MapLibre ask for the next native level on high-density screens (sharper, never enlarged). */
export const nightLightsTileSize = (devicePixelRatio: number): 128 | 256 => (devicePixelRatio >= 1.5 ? 128 : 256);

/** Vector layers that would paint over the imagery (land cover and use, the style's own background). */
const DROPPED = (id: string, sourceLayer?: string) =>
    id === 'background' || sourceLayer === 'landcover' || sourceLayer === 'landuse' || id === 'highway_motorway_subtle';

/**
 * OpenFreeMap's dark style cuts black roads into grey land. Over lit imagery that reads inverted, so the
 * vector detail is recoloured as light on dark: lit streets, dark water, soft building footprints.
 */
const STREET = 'rgba(255, 222, 168, 0.5)';
const CASING = 'rgba(3, 6, 15, 0.55)';
const RESTYLE: Record<string, Record<string, unknown>> = {
    water: { 'fill-color': '#02050f' },
    waterway: { 'line-color': '#02050f' },
    building: { 'fill-color': 'rgba(255, 230, 180, 0.16)', 'fill-outline-color': 'rgba(255, 230, 180, 0.28)' },
    highway_path: { 'line-color': 'rgba(255, 222, 168, 0.35)' },
    highway_minor: { 'line-color': STREET },
    highway_major_casing: { 'line-color': CASING },
    highway_major_inner: { 'line-color': 'rgba(255, 226, 178, 0.75)' },
    highway_major_subtle: { 'line-color': 'rgba(255, 226, 178, 0.5)' },
    highway_motorway_casing: { 'line-color': CASING },
    highway_motorway_inner: { 'line-color': 'rgba(255, 236, 200, 0.92)' },
    railway: { 'line-color': 'rgba(160, 170, 200, 0.55)' },
    railway_dashline: { 'line-color': 'rgba(3, 6, 15, 0.8)' },
    'aeroway-runway': { 'line-color': 'rgba(255, 240, 210, 0.9)' },
    'aeroway-taxiway': { 'line-color': 'rgba(255, 240, 210, 0.45)' },
    'aeroway-area': { 'fill-color': 'rgba(255, 240, 210, 0.12)' },
    boundary_state: { 'line-color': 'rgba(190, 200, 235, 0.35)' },
    'boundary_country_z0-4': { 'line-color': 'rgba(190, 200, 235, 0.5)' },
    'boundary_country_z5-': { 'line-color': 'rgba(190, 200, 235, 0.5)' },
    water_name: { 'text-color': 'rgba(130, 150, 205, 0.9)', 'text-halo-color': 'rgba(2, 5, 15, 0.9)' },
    highway_name_other: { 'text-color': 'rgba(215, 205, 185, 0.85)', 'text-halo-color': 'rgba(2, 5, 15, 0.9)' },
    highway_name_motorway: { 'text-color': 'rgba(235, 225, 205, 0.9)', 'text-halo-color': 'rgba(2, 5, 15, 0.9)' },
};
const PLACE_LABEL = { 'text-color': 'rgba(236, 232, 222, 0.95)', 'text-halo-color': 'rgba(2, 5, 15, 0.9)', 'text-halo-width': 1.4 };

/** A numeric opacity that grows from 0 at `from` to its own value at `to` (expressions are left as they are). */
const fadeIn = (existing: unknown, from: number, to: number) =>
    (existing === undefined || typeof existing === 'number'
        ? ['interpolate', ['linear'], ['zoom'], from, 0, to, typeof existing === 'number' ? existing : 1]
        : existing);


/**
 * Builds the Night lights style from OpenFreeMap's dark style: land fills are dropped, the GIBS raster sits
 * under the water, roads, buildings and labels, and the vector detail fades in as the imagery runs out.
 */
export const composeNightLightsStyle = (
    dark: StyleSpecification,
    { tiles = NIGHT_LIGHTS_TILES, tileSize = 256, canvas = '#03060f' }: { tiles?: string[]; tileSize?: number; canvas?: string } = {},
): StyleSpecification => {
    const layers: any[] = [{ id: 'rp-background', type: 'background', paint: { 'background-color': canvas } }];
    layers.push({
        id: NIGHT_LIGHTS_LAYER_ID, type: 'raster', source: NIGHT_LIGHTS_SOURCE_ID,
        paint: {
            // Full strength up to the last native level, then back to a glow that shows through the vector map.
            'raster-opacity': ['interpolate', ['linear'], ['zoom'], NIGHT_LIGHTS_MAX_NATIVE_ZOOM, 1, 11, 0.9, 14, 0.8],
            // City cores are saturated white in the imagery: dim it as it is enlarged so the lit streets read on top.
            'raster-brightness-max': ['interpolate', ['linear'], ['zoom'], NIGHT_LIGHTS_MAX_NATIVE_ZOOM, 1, 11, 0.5, 14, 0.38],
            'raster-resampling': 'linear',
        },
    });
    (dark.layers as any[]).forEach(layer => {
        if (DROPPED(layer.id, layer['source-layer'])) return;
        const next = { ...layer, paint: { ...(layer.paint || {}), ...(RESTYLE[layer.id] || {}), ...(layer.id.startsWith('place_') ? PLACE_LABEL : {}) } };
        if (layer.id === 'water') {
            // Black ocean in the imagery is enough at world scale; crisp shorelines arrive as the imagery gets soft.
            next.paint['fill-opacity'] = fadeIn(layer.paint?.['fill-opacity'], 5, 8.5);
        } else if (layer.type === 'line' && layer['source-layer'] === 'transportation') {
            next.paint['line-opacity'] = fadeIn(layer.paint?.['line-opacity'], 5.5, 8);
        } else if (layer.type === 'line' && layer['source-layer'] === 'waterway') {
            next.paint['line-opacity'] = fadeIn(layer.paint?.['line-opacity'], 6, 9);
        } else if (layer.id === 'boundary_state') {
            next.paint['line-opacity'] = fadeIn(layer.paint?.['line-opacity'], 3, 5);
        } else if (layer.type === 'fill' && layer['source-layer'] === 'aeroway') {
            next.paint['fill-opacity'] = fadeIn(layer.paint?.['fill-opacity'], 8, 11);
        }
        layers.push(next);
    });
    return {
        ...dark,
        sources: {
            ...dark.sources,
            [NIGHT_LIGHTS_SOURCE_ID]: { type: 'raster', tiles, tileSize, maxzoom: NIGHT_LIGHTS_MAX_NATIVE_ZOOM, attribution: 'NASA EOSDIS GIBS · Black Marble' },
        },
        layers,
    };
};
