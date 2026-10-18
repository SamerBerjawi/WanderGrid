import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { Protocol as PmtilesProtocol } from 'pmtiles';
import { AIRPORT_ICON_DEFINITIONS } from '../../../services/airportOverlayStyle';
import { OPENAIP_PATTERN_IMAGES, OPENAIP_SYMBOL_IMAGE_IDS } from '../../../services/openAipStyle';

/**
 * One-time MapLibre setup for the New map engine: the PMTiles protocol (airport overlay), the Vite
 * worker URL and the RTL text plugin. Idempotent, so it is safe alongside the original engine.
 */
let initialised = false;

export const initMapLibre = () => {
    if (initialised) return;
    initialised = true;
    const ml = maplibregl as any;
    try {
        ml.addProtocol('pmtiles', new PmtilesProtocol().tile);
    } catch {
        // Already registered by another engine.
    }
    if (typeof ml.setWorkerUrl === 'function') ml.setWorkerUrl(maplibreWorkerUrl);
    try {
        const status = typeof ml.getRTLTextPluginStatus === 'function' ? ml.getRTLTextPluginStatus() : 'unavailable';
        if (status === 'unavailable' && typeof ml.setRTLTextPlugin === 'function') {
            // .mjs is loaded with import(), so no eval (CSP). Lazy: fetched only when RTL text appears,
            // so the style never waits on it.
            ml.setRTLTextPlugin(`${window.location.origin}/vendor/mapbox-gl-rtl-text.mjs`, true);
        }
    } catch {
        // Plugin already set.
    }
};

/** Loads the airport-overlay and OpenAIP images on demand, when a layer asks for one. */
export const attachMissingImageLoader = (map: maplibregl.Map) => {
    const add = (id: string, path: string, pixelRatio: number) => {
        if (map.hasImage(id)) return;
        map.loadImage(path).then(res => {
            if (res?.data && !map.hasImage(id)) map.addImage(id, res.data, { pixelRatio });
        }).catch(() => undefined);
    };
    map.on('styleimagemissing', e => {
        const id = e.id;
        const airportIcon = AIRPORT_ICON_DEFINITIONS.find(def => def.id === id);
        if (airportIcon) return add(id, airportIcon.path, airportIcon.pixelRatio);
        if ((OPENAIP_PATTERN_IMAGES as readonly string[]).includes(id)) return add(id, `/openaip-style/patterns/${id}.svg`, 2);
        const symbol = id.replace(/^dark:/, '');
        if ((OPENAIP_SYMBOL_IMAGE_IDS as readonly string[]).includes(symbol)) add(id, `/openaip-style/symbols/${symbol}.svg`, 2);
    });
};
