import type { EffectiveBasemap } from '../types/mapAppearance';

/**
 * Basemap and tile plumbing shared by the map engines (components/DeckFlightMap.tsx and
 * components/new/map). Data only: tile URLs, attribution and request auth, no styling decisions.
 */

/** OpenAIP vector tiles go through the backend proxy, which adds the API key. */
export const OPENAIP_PROXY_TILES = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/proxy/openaip/{z}/{x}/{y}`;

/** MapLibre `transformRequest`: adds the session token to requests for this app's own /api. */
export const withApiAuth = (url: string) => {
    if (typeof window !== 'undefined' && url.startsWith(`${window.location.origin}/api/`)) {
        const token = localStorage.getItem('wandergrid_session_token');
        if (token) return { url, headers: { Authorization: `Bearer ${token}` } };
    }
    return { url };
};

const LIGHT_BASEMAPS: ReadonlySet<EffectiveBasemap> = new Set(['liberty', 'bright', 'positron']);
export const isLightEffectiveBasemap = (layer: EffectiveBasemap): boolean => LIGHT_BASEMAPS.has(layer);

/** OpenFreeMap vector styles, used for the street basemaps when GEV_P04B_OPENFREEMAP is on. */
export const OPENFREEMAP_STYLES: Partial<Record<EffectiveBasemap, string>> = {
    liberty: 'https://tiles.openfreemap.org/styles/liberty',
    '3d': 'https://tiles.openfreemap.org/styles/liberty',
    bright: 'https://tiles.openfreemap.org/styles/bright',
    positron: 'https://tiles.openfreemap.org/styles/positron',
    dark: 'https://tiles.openfreemap.org/styles/dark',
    fiord: 'https://tiles.openfreemap.org/styles/fiord',
};

/** Raster tile sources for each basemap (used directly for imagery, and as the fallback for street maps). */
export const getBasemapTileConfig = (
    effectiveLayer: EffectiveBasemap,
    resolvedCartoKey?: string
) => {
    let key = (resolvedCartoKey || '').trim().replace(/^['"]|['"]$/g, '');
    if (key.startsWith('key=')) key = key.slice(4).trim();
    if (key.startsWith('?key=')) key = key.slice(5).trim();
    const keyParam = key ? `?key=${encodeURIComponent(key)}` : '';

    const getCartoTiles = (style: 'dark_all' | 'light_all') => [
        `https://a.basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}.png${keyParam}`,
        `https://b.basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}.png${keyParam}`,
        `https://c.basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}.png${keyParam}`,
        `https://d.basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}.png${keyParam}`
    ];

    let tiles: string[] = [];
    let maxzoom = 20;
    let attribution = '© CARTO, © OpenStreetMap contributors';

    switch (effectiveLayer) {
        case 'liberty':
        case 'bright':
            attribution = 'OpenFreeMap Data © OpenStreetMap contributors';
            break;
        case 'satellite':
            tiles = [
                'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
            ];
            maxzoom = 19;
            attribution = 'Source: Esri, Maxar, Earthstar Geographics';
            break;
        case 'ocean':
            tiles = ['https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}'];
            maxzoom = 10;
            attribution = 'Source: Esri, GEBCO, NOAA';
            break;
        case 'citylights':
            tiles = [
                'https://gibs-a.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png',
                'https://gibs-b.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png',
                'https://gibs-c.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png'
            ];
            maxzoom = 8;
            attribution = 'NASA EOSDIS GIBS';
            break;
        case 'positron':
            if (key) {
                tiles = getCartoTiles('light_all');
                maxzoom = 20;
                attribution = '© CARTO, © OpenStreetMap contributors';
            } else {
                tiles = ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'];
                maxzoom = 16;
                attribution = 'Esri, HERE, Garmin, © OpenStreetMap contributors';
            }
            break;
        case 'dark':
        case 'fiord':
        case '3d':
        default:
            if (key) {
                tiles = getCartoTiles('dark_all');
                maxzoom = 20;
                attribution = '© CARTO, © OpenStreetMap contributors';
            } else {
                tiles = ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'];
                maxzoom = 16;
                attribution = 'Esri, HERE, Garmin, © OpenStreetMap contributors';
            }
            break;
    }

    return { tiles, maxzoom, attribution };
};

/** Overlay tile sources used by the Layers settings. */
export const TERRARIUM_DEM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const RAILROADS_GEOJSON_URL = '/data/ne_railroads.geojson';
export const COUNTRIES_GEOJSON_URL = '/data/ne_50m_admin_0_countries.geojson';
/** Natural Earth 10m borders, simplified topologically (shared borders stay shared: no gaps or slivers). Loaded only when the scratch map is zoomed in. */
export const COUNTRIES_FINE_GEOJSON_URL = '/data/ne_10m_admin_0_countries.geojson';
/** From this zoom the scratch map swaps the 50m borders for the 10m ones. */
export const COUNTRIES_FINE_MIN_ZOOM = 3.2;
export const gibsDailyTiles = (date: string) =>
    ['a', 'b', 'c'].map(s => `https://gibs-${s}.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA21_CorrectedReflectance_TrueColor/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`);
