import type * as maplibregl from 'maplibre-gl';

/**
 * Place-label density for the vector basemaps. The Streets style (OpenFreeMap Liberty; Bright and
 * Light grey share its label layers) reveals labels gradually by zoom. The Dark and Dark blue styles
 * (OpenFreeMap dark / fiord) have no minimum zooms, so every country, town and village label is on at
 * every zoom. These are Streets' zoom ranges, keyed by the dark styles' place-label layer ids:
 *
 *   countries up to 9 (smaller ones from 2) · states 5–8 · cities 3+ · towns 6+ · villages 9+ · other 8+ · no continents
 */
const STREETS_RANGES: Record<string, { min?: number; max?: number; hidden?: boolean }> = {
    place_country_major: { max: 9 },
    place_country_minor: { min: 2, max: 9 },
    place_country_other: { min: 2, max: 9 },
    place_continent: { hidden: true },
    place_state: { min: 5, max: 8 },
    place_city_large: { min: 3 },
    place_city: { min: 3 },
    place_town: { min: 6 },
    place_village: { min: 9 },
    place_suburb: { min: 8 },
    place_other: { min: 8 },
};

/** Applies Streets' label zoom ranges to the current style's place labels (no-op for Streets itself). */
export const normalizePlaceLabels = (map: maplibregl.Map) => {
    const layers = map.getStyle()?.layers ?? [];
    for (const layer of layers) {
        const range = STREETS_RANGES[layer.id];
        if (!range || layer.type !== 'symbol') continue;
        try {
            if (range.hidden) {
                map.setLayoutProperty(layer.id, 'visibility', 'none');
                continue;
            }
            const current = layer as { minzoom?: number; maxzoom?: number };
            map.setLayerZoomRange(layer.id, range.min ?? current.minzoom ?? 0, range.max ?? current.maxzoom ?? 24);
        } catch { /* layer not in this style */ }
    }
};
