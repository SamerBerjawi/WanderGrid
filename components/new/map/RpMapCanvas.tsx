import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { TripsLayer } from '@deck.gl/geo-layers';
import { ArcLayer } from '@deck.gl/layers';
import { GlobeHorizonCullExtension } from '../../GlobeHorizonCullExtension';
import { FEATURE_FLAGS } from '../../../config/featureFlags';
import type { CountryResidenceStatus, PredefinedMapMode } from '../../../types';
import { getEffectiveBasemap, normalizeAirportDetail, type MapAppearanceSettings, getYesterdayDateString } from '../../../types/mapAppearance';
import {
    AIRPORT_SOURCE_ID, GLYPHS_URL, createAirportOverlaySource, createAirportOverlayLayers, getAirportOverlayGroups,
} from '../../../services/airportOverlayStyle';
import { OPENAIP_AIRSPACE_SOURCE_ID, ensureOpenAipIcons, getOpenAipOverlayLayers } from '../../../services/openAipStyle';
import {
    OPENAIP_PROXY_TILES, OPENFREEMAP_STYLES, RAILROADS_GEOJSON_URL, COUNTRIES_GEOJSON_URL, TERRARIUM_DEM_TILES,
    getBasemapTileConfig, gibsDailyTiles, withApiAuth, isLightEffectiveBasemap,
} from '../../../services/mapStyle';
import { getCachedMultiModalRoute, fetchMultiModalRoute, getGeodesicArcPoints } from '../../../services/multiModalRouting';
import { getTwilightGradientGeoJSON } from '../../../services/solarTerminator';
import { calculateDistance } from '../../../services/geocoding';
import { getLatestRainRadarTileUrl } from '../../../services/rainViewer';
import { attachMissingImageLoader, initMapLibre } from './mapEngineInit';
import { normalizePlaceLabels } from './basemapLabels';
import { cn } from '../../../utils/cn';
import { readRpPalette, rpTokensReady, rgba, css, mix, type RGB, type RpPalette } from './mapPalette';
import type { LegMode, LegStatus, MapModel, MapPlace, MapRoute, LngLat } from './mapModel';
import { routeModeColor, type RouteColorMode } from './routeModes';

/**
 * The New map engine: MapLibre for the basemap and its native overlays (airport detail, aviation
 * charts, relief, 3D terrain, rail, rain radar, daily satellite), deck.gl for the travel data
 * (routes, airports, places, scratch countries, day/night). Colours come from the rp-* tokens.
 */

export interface RpMapHandle {
    zoomIn: () => void;
    zoomOut: () => void;
    fitAll: () => void;
    flyTo: (lng: number, lat: number, zoom?: number) => void;
    fitBounds: (bounds: [LngLat, LngLat]) => void;
}

export interface RpMapPadding { top: number; right: number; bottom: number; left: number }

export type RpMapHover =
    | { kind: 'route'; x: number; y: number; route: MapRoute }
    | { kind: 'place'; x: number; y: number; place: MapPlace }
    | { kind: 'country'; x: number; y: number; code: string; name: string; statuses: CountryResidenceStatus[] }
    | { kind: 'pin'; x: number; y: number; name: string };

export interface RpMapCanvasProps {
    model: MapModel;
    mode: PredefinedMapMode;
    appearance: MapAppearanceSettings;
    isDark: boolean;
    visitedCountryCodes: string[];
    countryStatusMap: Record<string, CountryResidenceStatus[] | CountryResidenceStatus>;
    visitedPlaces: { lat: number; lng: number; name: string }[];
    openAipAvailable: boolean;
    cartoKey?: string;
    defaultBasemapLight?: string;
    defaultBasemapDark?: string;
    padding: RpMapPadding;
    /** Route colour (New map setting); defaults to the shared appearance choice. */
    routeColorMode?: RouteColorMode;
    onRouteClick?: (route: MapRoute) => void;
    onPlaceClick?: (place: MapPlace) => void;
    onCountryClick?: (code: string, name: string) => void;
    onHover?: (hover: RpMapHover | null) => void;
    className?: string;
}

const FONT = '"Outfit Variable", Outfit, -apple-system, sans-serif';
const WORLD = { center: [12, 28] as LngLat, zoom: 1.4 };
const ROUTE_WIDTH = { thin: 1.25, normal: 2, thick: 3.25 } as const;
const MARKER_SIZE = { off: 0, small: 3, medium: 4.5, large: 6.5 } as const;
/** Animated routes move at one speed everywhere, so a long route takes longer than a short one. */
const PULSE_KM_PER_S = 2200;
/** Length of the moving pulse's tail, in km of route. */
const PULSE_TRAIL_KM = 900;

const countryCodeOf = (p: any): string => {
    const a2 = p?.ISO_A2 && p.ISO_A2 !== '-99' ? p.ISO_A2 : p?.ISO_A2_EH;
    return (a2 && a2 !== '-99' ? a2 : '').toUpperCase();
};

const asList = (s?: CountryResidenceStatus[] | CountryResidenceStatus): CountryResidenceStatus[] =>
    !s ? [] : Array.isArray(s) ? s : [s];

const beforeFirstSymbol = (map: maplibregl.Map) =>
    map.getStyle()?.layers?.find(l => l.type === 'symbol')?.id;

/** The style JSON is in, so sources and layers can be added (sources may still be fetching tiles). */
const styleParsed = (map: maplibregl.Map) => Boolean((map as any).style?._loaded);

const removeLayer = (map: maplibregl.Map, id: string) => { if (map.getLayer(id)) map.removeLayer(id); };
const removeSource = (map: maplibregl.Map, id: string) => { if (map.getSource(id)) map.removeSource(id); };

/** A flat great-circle path, or a raised arc for the globe. */
const geodesic = (from: LngLat, to: LngLat, raised: boolean): number[][] => {
    const pts = getGeodesicArcPoints(from[1], from[0], to[1], to[0], 64, raised ? 0.15 : 0);
    // Unwrap longitudes so a path across the antimeridian stays continuous.
    const out: number[][] = [];
    let prev: number | null = null;
    pts.forEach(([lng, lat, alt]) => {
        let x = lng;
        if (prev !== null) {
            while (x - prev > 180) x -= 360;
            while (x - prev < -180) x += 360;
        }
        prev = x;
        out.push(raised ? [x, lat, alt] : [x, lat]);
    });
    return out;
};

export const RpMapCanvas = forwardRef<RpMapHandle, RpMapCanvasProps>(function RpMapCanvas(props, ref) {
    const {
        model, mode, appearance, isDark, visitedCountryCodes, countryStatusMap, visitedPlaces,
        openAipAvailable, cartoKey, defaultBasemapLight, defaultBasemapDark, padding,
        onRouteClick, onPlaceClick, onCountryClick, onHover, className,
    } = props;

    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const overlayRef = useRef<MapboxOverlay | null>(null);
    const [styleVersion, setStyleVersion] = useState(0);
    const [zoom, setZoom] = useState(WORLD.zoom);
    const [routeVersion, setRouteVersion] = useState(0);
    const [now, setNow] = useState(() => new Date());
    const [animTime, setAnimTime] = useState(0);
    const pulseLoopKmRef = useRef(1);
    const [countries, setCountries] = useState<any>(null);
    const [radarUrl, setRadarUrl] = useState<string | null>(null);
    const [palette, setPalette] = useState<RpPalette>(() => readRpPalette(null));
    const fittedRef = useRef(false);
    const paddingRef = useRef(padding);
    paddingRef.current = padding;
    const modelRef = useRef(model);
    modelRef.current = model;

    const isGlobe = appearance.projection === 'globe';
    const airportsOnly = Boolean(appearance.airportsOnly);
    const reducedMotion = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);

    // Re-read the token colours whenever the theme flips, waiting for the stylesheet if it is still loading.
    useEffect(() => {
        let id = 0;
        let tries = 0;
        const read = () => {
            if (rpTokensReady(containerRef.current) || tries++ > 120) setPalette(readRpPalette(containerRef.current));
            else id = requestAnimationFrame(read);
        };
        id = requestAnimationFrame(read);
        return () => cancelAnimationFrame(id);
    }, [isDark]);

    /* ------------------------------------------------------------------ basemap style */

    const effectiveBasemap = getEffectiveBasemap(appearance.basemap, isDark, defaultBasemapLight, defaultBasemapDark);
    const lightBasemap = isLightEffectiveBasemap(effectiveBasemap);
    const baseStyle = useMemo<string | maplibregl.StyleSpecification>(() => {
        const vector = FEATURE_FLAGS.GEV_P04B_OPENFREEMAP ? OPENFREEMAP_STYLES[effectiveBasemap] : undefined;
        if (vector) return vector;
        const { tiles, maxzoom, attribution } = getBasemapTileConfig(effectiveBasemap, cartoKey);
        return {
            version: 8,
            glyphs: GLYPHS_URL,
            sources: { 'rp-base': { type: 'raster', tiles, tileSize: 256, maxzoom, attribution } },
            layers: [
                { id: 'rp-background', type: 'background', paint: { 'background-color': css(palette.canvas) } },
                { id: 'rp-base', type: 'raster', source: 'rp-base' },
            ],
        };
        // palette.canvas only matters for the raster fallback background
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effectiveBasemap, cartoKey, isDark]);

    /* ------------------------------------------------------------------ map lifecycle */

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        initMapLibre();
        const map = new maplibregl.Map({
            container,
            style: baseStyle,
            center: WORLD.center,
            zoom: WORLD.zoom,
            attributionControl: false,
            transformRequest: withApiAuth as any,
            renderWorldCopies: true,
            dragRotate: false,
            pitchWithRotate: false,
        });
        map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
        attachMissingImageLoader(map);
        map.touchZoomRotate.disableRotation();

        // Interleaved rendering fails against MapLibre 6's transform; deck draws on its own canvas above the map.
        const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
        map.addControl(overlay as unknown as maplibregl.IControl);
        overlayRef.current = overlay;
        mapRef.current = map;
        if (import.meta.env.DEV) (window as any).__rpMap = map;

        map.on('style.load', () => setStyleVersion(v => v + 1));
        map.on('zoomend', () => setZoom(map.getZoom()));

        const ro = new ResizeObserver(() => map.resize());
        ro.observe(container);
        return () => {
            ro.disconnect();
            overlayRef.current = null;
            mapRef.current = null;
            map.remove();
        };
        // The map is created once; style changes go through setStyle below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const firstStyle = useRef(true);
    useEffect(() => {
        if (firstStyle.current) { firstStyle.current = false; return; }
        mapRef.current?.setStyle(baseStyle as any, { diff: false });
    }, [baseStyle]);

    /* ------------------------------------------------------------------ projection & sky */

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !styleVersion) return;
        try {
            map.setProjection({ type: isGlobe ? 'globe' : 'mercator' });
            if (isGlobe && appearance.atmosphere !== false) {
                // A thin, soft glow that matches the basemap: warm haze on light maps, deep blue on dark ones.
                const glow: RGB = lightBasemap ? mix(palette.surface, palette.mustard, 0.25) : [70, 110, 170];
                map.setSky({
                    'sky-color': css(glow, lightBasemap ? 0.9 : 0.85),
                    'horizon-color': css(glow, 0.6),
                    'fog-color': css(lightBasemap ? palette.surface : [10, 14, 26], 0.9),
                    'sky-horizon-blend': 0.6,
                    'horizon-fog-blend': 0.4,
                    'fog-ground-blend': 0.6,
                    'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.55, 4, 0.35, 7, 0],
                } as any);
            } else {
                map.setSky(undefined as any);
            }
        } catch {
            // Older styles without projection support.
        }
        isGlobe ? map.dragRotate.enable() : map.dragRotate.disable();
    }, [styleVersion, isGlobe, appearance.atmosphere, palette, lightBasemap]);

    /* ------------------------------------------------------------------ native overlays */

    // Rain radar tiles are time-stamped: fetch the latest URL when the layer turns on.
    useEffect(() => {
        if (!appearance.rainRadar) { setRadarUrl(null); return; }
        let alive = true;
        getLatestRainRadarTileUrl(appearance.rainRadarColorScheme || 2).then(url => { if (alive) setRadarUrl(url); }).catch(() => undefined);
        return () => { alive = false; };
    }, [appearance.rainRadar, appearance.rainRadarColorScheme]);

    const airportLayerIds = useRef<string[]>([]);
    const openAipLayerIds = useRef<string[]>([]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !styleVersion) return;
        if (!styleParsed(map)) { map.once('idle', () => setStyleVersion(v => v + 1)); return; }
        const theme = isDark ? 'dark' : 'light';

        // Same place-label density on every vector basemap as on Streets.
        normalizePlaceLabels(map);

        // Airport detail (runways, taxiways, terminals...) from the local PMTiles archive.
        airportLayerIds.current.forEach(id => removeLayer(map, id));
        airportLayerIds.current = [];
        const detail = normalizeAirportDetail(appearance.airportDetail);
        if (detail !== 'none') {
            if (!map.getSource(AIRPORT_SOURCE_ID)) map.addSource(AIRPORT_SOURCE_ID, createAirportOverlaySource());
            createAirportOverlayLayers(isDark, getAirportOverlayGroups(detail)).forEach(layer => {
                try { map.addLayer(layer as any); airportLayerIds.current.push(layer.id); } catch { /* bad layer */ }
            });
        } else {
            removeSource(map, AIRPORT_SOURCE_ID);
        }

        // Aviation charts (OpenAIP), through the backend proxy.
        openAipLayerIds.current.forEach(id => removeLayer(map, id));
        openAipLayerIds.current = [];
        if (appearance.openAipOverlay && openAipAvailable && !airportsOnly) {
            if (!map.getSource(OPENAIP_AIRSPACE_SOURCE_ID)) {
                map.addSource(OPENAIP_AIRSPACE_SOURCE_ID, {
                    type: 'vector', tiles: [OPENAIP_PROXY_TILES], minzoom: 0, maxzoom: 14,
                    attribution: '<a href="https://www.openaip.net" target="_blank" rel="noopener noreferrer">openAIP</a>',
                });
            }
            void ensureOpenAipIcons(map, theme);
            const opacity = appearance.openAipOpacity ?? 0.85;
            getOpenAipOverlayLayers(appearance.openAipGroups as any, theme, appearance.openAipAirportCategories).forEach((layer: any) => {
                try {
                    map.addLayer(layer);
                    openAipLayerIds.current.push(layer.id);
                    const prop = layer.type === 'line' ? 'line-opacity' : layer.type === 'fill' ? 'fill-opacity' : layer.type === 'circle' ? 'circle-opacity' : null;
                    if (prop) map.setPaintProperty(layer.id, prop, opacity);
                    if (layer.type === 'symbol') { map.setPaintProperty(layer.id, 'text-opacity', opacity); map.setPaintProperty(layer.id, 'icon-opacity', opacity); }
                } catch { /* bad layer */ }
            });
        } else {
            removeSource(map, OPENAIP_AIRSPACE_SOURCE_ID);
        }

        const below = beforeFirstSymbol(map);

        // Daily satellite (NASA GIBS).
        removeLayer(map, 'rp-gibs'); removeSource(map, 'rp-gibs');
        if (appearance.gibsDaily && !airportsOnly) {
            map.addSource('rp-gibs', { type: 'raster', tiles: gibsDailyTiles(appearance.gibsDailyDate || getYesterdayDateString()), tileSize: 256, maxzoom: 9, attribution: 'NASA EOSDIS GIBS' });
            map.addLayer({ id: 'rp-gibs', type: 'raster', source: 'rp-gibs', paint: { 'raster-opacity': appearance.gibsDailyOpacity ?? 0.9 } }, below);
        }

        // Relief shading from the Terrarium elevation tiles.
        removeLayer(map, 'rp-hillshade');
        if (appearance.terrainHillshade) {
            if (!map.getSource('rp-dem')) map.addSource('rp-dem', { type: 'raster-dem', tiles: [TERRARIUM_DEM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 15, attribution: 'Mapzen / AWS Elevation Tiles' });
            const strength = Math.min(1, Math.max(0.1, (appearance.terrainHillshadeOpacity ?? 0.8) * 0.75));
            map.addLayer({
                id: 'rp-hillshade', type: 'hillshade', source: 'rp-dem',
                paint: {
                    'hillshade-exaggeration': strength,
                    'hillshade-shadow-color': lightBasemap ? css(palette.ink, 0.55) : css([255, 255, 255], 0.28),
                    'hillshade-highlight-color': lightBasemap ? css([255, 255, 255], 0.45) : css([255, 255, 255], 0.08),
                    'hillshade-accent-color': lightBasemap ? css(palette.ink, 0.25) : css([255, 255, 255], 0.18),
                },
            }, below);
        } else if (!appearance.terrain3d) {
            removeSource(map, 'rp-dem');
        }

        // 3D elevation.
        try {
            if (appearance.terrain3d) {
                if (!map.getSource('rp-dem-3d')) map.addSource('rp-dem-3d', { type: 'raster-dem', tiles: [TERRARIUM_DEM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 15 });
                map.setTerrain({ source: 'rp-dem-3d', exaggeration: appearance.terrain3dExaggeration ?? 1 });
            } else {
                map.setTerrain(null);
                removeSource(map, 'rp-dem-3d');
            }
        } catch { /* terrain unsupported in this projection */ }

        // Rail lines.
        removeLayer(map, 'rp-rail');
        if (appearance.transitOverlay && !airportsOnly) {
            if (!map.getSource('rp-rail')) map.addSource('rp-rail', { type: 'geojson', data: RAILROADS_GEOJSON_URL, attribution: 'Natural Earth Global Railroads' });
            map.addLayer({ id: 'rp-rail', type: 'line', source: 'rp-rail', paint: { 'line-color': css(palette.muted), 'line-width': 1, 'line-opacity': appearance.transitOverlayOpacity ?? 0.4 } }, below);
        } else {
            removeSource(map, 'rp-rail');
        }

        // Rain radar.
        removeLayer(map, 'rp-radar'); removeSource(map, 'rp-radar');
        if (appearance.rainRadar && radarUrl && !airportsOnly) {
            map.addSource('rp-radar', { type: 'raster', tiles: [radarUrl], tileSize: 256, maxzoom: 7, attribution: 'RainViewer' });
            map.addLayer({ id: 'rp-radar', type: 'raster', source: 'rp-radar', paint: { 'raster-opacity': appearance.rainRadarOpacity ?? 0.85 } }, below);
        }
    }, [
        styleVersion, isDark, palette, airportsOnly, radarUrl, openAipAvailable, lightBasemap,
        appearance.airportDetail, appearance.openAipOverlay, appearance.openAipGroups, appearance.openAipOpacity, appearance.openAipAirportCategories,
        appearance.gibsDaily, appearance.gibsDailyDate, appearance.gibsDailyOpacity,
        appearance.terrainHillshade, appearance.terrainHillshadeOpacity, appearance.terrain3d, appearance.terrain3dExaggeration,
        appearance.transitOverlay, appearance.transitOverlayOpacity, appearance.rainRadar, appearance.rainRadarOpacity,
    ]);

    /* ------------------------------------------------------------------ data for deck layers */

    // Countries for the scratch map, loaded once from the app's own copy.
    useEffect(() => {
        if (mode !== 'scratch' || countries) return;
        let alive = true;
        fetch(COUNTRIES_GEOJSON_URL).then(r => r.json()).then(d => { if (alive) setCountries(d); }).catch(() => undefined);
        return () => { alive = false; };
    }, [mode, countries]);

    // Day and night shading refreshes every minute.
    useEffect(() => {
        if (!appearance.timeOfDay) return;
        const id = window.setInterval(() => setNow(new Date()), 60_000);
        return () => window.clearInterval(id);
    }, [appearance.timeOfDay]);

    // Animated routes.
    useEffect(() => {
        if (!appearance.animateRoutes || reducedMotion) return;
        let frame = 0;
        const start = performance.now();
        const tick = (t: number) => {
            // The clock is in km travelled; every route restarts together once the longest has finished.
            setAnimTime((((t - start) / 1000) * PULSE_KM_PER_S) % pulseLoopKmRef.current);
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [appearance.animateRoutes, reducedMotion]);

    // Route geometry: great circles for flights, traced roads, rails and sea lanes for the rest.
    const routePaths = useMemo(() => {
        const traced = appearance.routeTracing !== false;
        return model.routes.map(r => {
            if (r.mode === 'flight') return { route: r, path: geodesic(r.from, r.to, false), traced: true };
            if (traced) {
                const cached = getCachedMultiModalRoute(r.rawMode, r.from[1], r.from[0], r.to[1], r.to[0], r.waypoints);
                if (cached) return { route: r, path: cached.map(([lng, lat]) => [lng, lat]), traced: true };
                void fetchMultiModalRoute(r.rawMode, r.from[1], r.from[0], r.to[1], r.to[0], () => setRouteVersion(v => v + 1), r.waypoints);
            }
            return { route: r, path: geodesic(r.from, r.to, false), traced: !traced };
        });
        // routeVersion re-reads the routing cache when a traced route arrives
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [model.routes, appearance.routeTracing, routeVersion]);

    const maxCount = useMemo(() => Math.max(1, ...model.routes.map(r => r.count)), [model.routes]);

    const statusColor = useCallback((s: LegStatus): RGB => (s === 'upcoming' ? palette.green : s === 'planning' ? palette.mustard : palette.ink), [palette]);
    const modeColor = useCallback((m: LegMode): RGB => routeModeColor(m, palette, lightBasemap), [palette, lightBasemap]);

    /* ------------------------------------------------------------------ travel data (native MapLibre layers) */

    // Drawn with MapLibre's own layers so they follow both the flat map and the globe.
    const hex = (c: RGB) => `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`;
    const showRoutes = !airportsOnly && mode !== 'scratch' && mode !== 'none';
    const colorMode: RouteColorMode = props.routeColorMode ?? appearance.routeColorMode ?? 'gradient';

    const routesGeo = useMemo(() => {
        const base = ROUTE_WIDTH[appearance.routeScale || 'normal'];
        const features = showRoutes ? routePaths.map(({ route: r, path, traced }) => {
            const color = colorMode === 'mode'
                ? modeColor(r.mode)
                : colorMode === 'frequency'
                    ? mix(palette.mustard, palette.rust, (r.count - 1) / Math.max(1, maxCount - 1))
                    : statusColor(r.status);
            const width = (appearance.routeWidthMode === 'frequency' ? base * (1 + Math.log2(r.count) * 0.6) : base) * (r.mode === 'flight' ? 1 : 0.85);
            return {
                type: 'Feature' as const,
                id: r.id,
                properties: { id: r.id, mode: r.mode, color: hex(color), width, opacity: traced ? (r.status === 'past' ? 0.85 : 0.95) : 0.35 },
                geometry: { type: 'LineString' as const, coordinates: path },
            };
        }) : [];
        return { type: 'FeatureCollection' as const, features };
    }, [showRoutes, routePaths, colorMode, palette, maxCount, statusColor, modeColor, appearance.routeScale, appearance.routeWidthMode]);

    const airportsGeo = useMemo(() => {
        const size = MARKER_SIZE[appearance.airportSize || 'medium'];
        const byTraffic = appearance.airportMode !== 'uniform';
        const features = (showRoutes || airportsOnly) && size > 0 ? model.airports.map(a => ({
            type: 'Feature' as const,
            id: `a:${a.id}`,
            properties: { key: a.id, label: a.id.length <= 4 ? a.id : a.label, radius: byTraffic ? size * Math.min(2.4, 0.8 + Math.sqrt(a.count) * 0.32) : size },
            geometry: { type: 'Point' as const, coordinates: a.coords },
        })) : [];
        return { type: 'FeatureCollection' as const, features };
    }, [showRoutes, airportsOnly, model.airports, appearance.airportSize, appearance.airportMode]);

    const placesGeo = useMemo(() => {
        const size = MARKER_SIZE[appearance.citySize || 'medium'];
        const features = showRoutes && size > 0 ? model.places.map(p => ({
            type: 'Feature' as const,
            id: `p:${p.id}`,
            properties: { key: p.id, radius: size * Math.min(1.8, 0.85 + Math.sqrt(p.count) * 0.2) },
            geometry: { type: 'Point' as const, coordinates: p.coords },
        })) : [];
        return { type: 'FeatureCollection' as const, features };
    }, [showRoutes, model.places, appearance.citySize]);

    const pinsGeo = useMemo(() => {
        const size = MARKER_SIZE[appearance.scratchCitySize || 'medium'];
        const features = mode === 'scratch' && !airportsOnly && size > 0 ? visitedPlaces.map((v, i) => ({
            type: 'Feature' as const,
            id: i,
            properties: { name: v.name, radius: size },
            geometry: { type: 'Point' as const, coordinates: [v.lng, v.lat] },
        })) : [];
        return { type: 'FeatureCollection' as const, features };
    }, [mode, airportsOnly, visitedPlaces, appearance.scratchCitySize]);

    const countriesGeo = useMemo(() => {
        if (mode !== 'scratch' || !countries || airportsOnly) return { type: 'FeatureCollection' as const, features: [] as any[] };
        const visited = new Set(visitedCountryCodes.map(c => c.toUpperCase()));
        const features = countries.features.map((f: any, i: number) => {
            const code = countryCodeOf(f.properties);
            const name = String(f.properties?.NAME || code);
            const statuses = asList(countryStatusMap[code] ?? countryStatusMap[name.toUpperCase()]);
            const lived = statuses.includes('lived_current') || statuses.includes('lived_past');
            let fill = hex(palette.surface);
            let opacity = 0.01; // not 0: MapLibre skips invisible features when querying clicks
            if (lived && appearance.showLivedCountries !== false) { fill = hex(palette.green); opacity = 0.85; }
            else if (visited.has(code)) { fill = hex(palette.green); opacity = 0.45; }
            else if (statuses.includes('layover') && appearance.showLayoverCountries !== false) { fill = hex(palette.mustard); opacity = 0.6; }
            else if (statuses.includes('wishlist') && appearance.showWishlistCountries !== false) { fill = hex(palette.rust); opacity = 0.35; }
            return { type: 'Feature', id: i, properties: { code, name, fill, opacity }, geometry: f.geometry };
        });
        return { type: 'FeatureCollection' as const, features };
    }, [mode, countries, airportsOnly, visitedCountryCodes, countryStatusMap, palette, appearance.showLivedCountries, appearance.showLayoverCountries, appearance.showWishlistCountries]);

    // Eight stacked caps (civil, nautical, astronomical twilight, then night): each adds a little shade,
    // so the edge fades from dusk into deep night instead of a hard line.
    const nightGeo = useMemo(() => (
        appearance.timeOfDay && !airportsOnly ? getTwilightGradientGeoJSON(now) : { type: 'FeatureCollection', features: [] }
    ), [appearance.timeOfDay, airportsOnly, now]);

    const DATA_LAYERS = ['rp-night', 'rp-country-fill', 'rp-country-line', 'rp-routes', 'rp-routes-sea', 'rp-places', 'rp-pins', 'rp-airports', 'rp-airport-labels'];

    // Create the sources and layers after each style load, then keep their data and paint current.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !styleVersion) return;
        if (!styleParsed(map)) { map.once('idle', () => setStyleVersion(v => v + 1)); return; }
        const p = palette;
        const source = (id: string, data: any, extra: Record<string, unknown> = {}) => {
            const s = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
            if (s) s.setData(data);
            else map.addSource(id, { type: 'geojson', data, ...extra } as any);
        };
        source('rp-night', nightGeo);
        source('rp-countries', countriesGeo);
        source('rp-routes', routesGeo, { lineMetrics: true, promoteId: 'id' });
        source('rp-places', placesGeo, { promoteId: 'key' });
        source('rp-pins', pinsGeo);
        source('rp-airports', airportsGeo, { promoteId: 'key' });

        const below = beforeFirstSymbol(map);
        const add = (layer: any, before?: string) => { if (!map.getLayer(layer.id)) map.addLayer(layer, before); };
        add({ id: 'rp-country-fill', type: 'fill', source: 'rp-countries', paint: { 'fill-color': ['get', 'fill'], 'fill-opacity': ['get', 'opacity'] } }, below);
        add({ id: 'rp-country-line', type: 'line', source: 'rp-countries', paint: { 'line-width': 0.5 } }, below);
        add({ id: 'rp-night', type: 'fill', source: 'rp-night', paint: {} });
        add({ id: 'rp-routes', type: 'line', source: 'rp-routes', filter: ['!=', ['get', 'mode'], 'sea'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {} });
        add({ id: 'rp-routes-sea', type: 'line', source: 'rp-routes', filter: ['==', ['get', 'mode'], 'sea'], layout: { 'line-join': 'round' }, paint: { 'line-dasharray': [2, 1.5] } });
        add({ id: 'rp-places', type: 'circle', source: 'rp-places', paint: {} });
        add({ id: 'rp-pins', type: 'circle', source: 'rp-pins', paint: {} });
        add({ id: 'rp-airports', type: 'circle', source: 'rp-airports', paint: {} });
        add({
            id: 'rp-airport-labels', type: 'symbol', source: 'rp-airports', minzoom: 3,
            layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-offset': [0, -1.4], 'text-anchor': 'bottom', 'text-optional': true },
            paint: {},
        });

        // Paint follows the palette, the theme and the settings.
        const hover = (on: any, off: any): any => ['case', ['boolean', ['feature-state', 'hover'], false], on, off];
        map.setPaintProperty('rp-country-line', 'line-color', css(p.ink, 0.25));
        map.setPaintProperty('rp-night', 'fill-color', lightBasemap ? hex(p.ink) : '#02050f');
        map.setPaintProperty('rp-night', 'fill-opacity', lightBasemap ? 0.055 : 0.085);
        ['rp-routes', 'rp-routes-sea'].forEach(id => {
            map.setPaintProperty(id, 'line-width', hover(['+', ['get', 'width'], 2], ['get', 'width']));
            map.setPaintProperty(id, 'line-opacity', ['get', 'opacity']);
            map.setPaintProperty(id, 'line-color', ['get', 'color']);
        });
        // A gradient needs line-progress, which dashed lines cannot use: only solid routes get it.
        map.setPaintProperty('rp-routes', 'line-gradient', colorMode === 'gradient'
            ? ['interpolate', ['linear'], ['line-progress'], 0, hex(p.green), 1, hex(p.rust)]
            : undefined);
        map.setPaintProperty('rp-places', 'circle-radius', ['get', 'radius']);
        map.setPaintProperty('rp-places', 'circle-color', hex(p.ink));
        map.setPaintProperty('rp-places', 'circle-stroke-color', hex(p.surface));
        map.setPaintProperty('rp-places', 'circle-stroke-width', 1.5);
        map.setPaintProperty('rp-pins', 'circle-radius', ['get', 'radius']);
        map.setPaintProperty('rp-pins', 'circle-color', hex(p.ink));
        map.setPaintProperty('rp-pins', 'circle-stroke-color', hex(p.surface));
        map.setPaintProperty('rp-pins', 'circle-stroke-width', 1.5);
        map.setPaintProperty('rp-airports', 'circle-radius', hover(['+', ['get', 'radius'], 2], ['get', 'radius']));
        map.setPaintProperty('rp-airports', 'circle-color', hover(hex(p.mustard), hex(p.surface)));
        map.setPaintProperty('rp-airports', 'circle-stroke-color', hex(p.ink));
        map.setPaintProperty('rp-airports', 'circle-stroke-width', 1.75);
        map.setPaintProperty('rp-airport-labels', 'text-color', hex(p.ink));
        map.setPaintProperty('rp-airport-labels', 'text-halo-color', hex(p.surface));
        map.setPaintProperty('rp-airport-labels', 'text-halo-width', 2);
        // Keep the travel data above any overlay added later (radar, charts...).
        DATA_LAYERS.slice(2).forEach(id => { if (map.getLayer(id)) map.moveLayer(id); });
        // On the globe, flights are raised deck.gl arcs (below); the flat lines would double them.
        map.setFilter('rp-routes', isGlobe ? ['all', ['!=', ['get', 'mode'], 'sea'], ['!=', ['get', 'mode'], 'flight']] : ['!=', ['get', 'mode'], 'sea']);
    }, [styleVersion, palette, isDark, lightBasemap, isGlobe, colorMode, routesGeo, airportsGeo, placesGeo, pinsGeo, countriesGeo, nightGeo]);

    /* ------------------------------------------------------------------ animated pulse (flat map only) */

    // Each vertex is timed by the distance travelled to reach it, in km.
    const pulseTimeline = useMemo(() => {
        let longest = 0;
        const routes = routePaths.map(({ route, path }) => {
            let km = 0;
            const timestamps = path.map((pt, i) => {
                if (i > 0) {
                    const prev = path[i - 1];
                    km += calculateDistance(prev[1], prev[0], pt[1], pt[0]);
                }
                return km;
            });
            longest = Math.max(longest, km);
            return { route, path, timestamps };
        });
        return { routes, loopKm: longest + PULSE_TRAIL_KM };
    }, [routePaths]);
    pulseLoopKmRef.current = Math.max(1, pulseTimeline.loopKm);

    const flightArcs = useMemo(() => (
        isGlobe && showRoutes ? routesGeo.features.filter(f => f.properties.mode === 'flight').map(f => {
            const route = routePaths.find(r => r.route.id === f.properties.id)!.route;
            return { route, color: f.properties.color, width: f.properties.width };
        }) : []
    ), [isGlobe, showRoutes, routesGeo, routePaths]);

    useEffect(() => {
        const layers: any[] = [];
        if (flightArcs.length) {
            const toRgb = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
            layers.push(new ArcLayer({
                id: 'rp-flight-arcs',
                data: flightArcs,
                getSourcePosition: (d: any) => d.route.from,
                getTargetPosition: (d: any) => d.route.to,
                getSourceColor: (d: any) => rgba(colorMode === 'gradient' ? palette.green : toRgb(d.color), 0.95),
                getTargetColor: (d: any) => rgba(colorMode === 'gradient' ? palette.rust : toRgb(d.color), 0.95),
                getWidth: (d: any) => d.width + 0.5,
                widthUnits: 'pixels',
                greatCircle: true,
                // Raised above the curvature like the original globe; the extension hides the far side.
                getHeight: 0.32,
                parameters: { cullMode: 'none', depthWriteEnabled: false, depthCompare: 'always' } as any,
                extensions: [new GlobeHorizonCullExtension()],
                pickable: true,
                autoHighlight: true,
                highlightColor: rgba(palette.mustard),
                updateTriggers: { getSourceColor: [colorMode, palette], getTargetColor: [colorMode, palette] },
            }));
        }
        if (appearance.animateRoutes && !reducedMotion && !isGlobe && showRoutes && routePaths.length) {
            layers.push(new TripsLayer({
                id: 'rp-route-pulse',
                data: pulseTimeline.routes,
                getPath: (d: any) => d.path,
                getTimestamps: (d: any) => d.timestamps,
                getColor: rgba(palette.mustard),
                widthMinPixels: ROUTE_WIDTH[appearance.routeScale || 'normal'] + 1,
                trailLength: PULSE_TRAIL_KM,
                currentTime: animTime,
                capRounded: true,
                jointRounded: true,
                fadeTrail: true,
            }));
        }
        overlayRef.current?.setProps({ layers, pickingRadius: 8 } as any);
    }, [flightArcs, colorMode, appearance.animateRoutes, appearance.routeScale, reducedMotion, isGlobe, showRoutes, routePaths, pulseTimeline, animTime, palette]);

    /* ------------------------------------------------------------------ interaction */

    const hoverRef = useRef(onHover);
    hoverRef.current = onHover;
    const clickRef = useRef({ onRouteClick, onPlaceClick, onCountryClick });
    clickRef.current = { onRouteClick, onPlaceClick, onCountryClick };
    const lookupRef = useRef({ model, countryStatusMap });
    lookupRef.current = { model, countryStatusMap };

    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        let hovered: { source: string; id: string | number } | null = null;
        const TOL = 8;
        const pick = (point: maplibregl.Point): RpMapHover | null => {
            const arc = (overlayRef.current as any)?.pickObject?.({ x: point.x, y: point.y, radius: TOL, layerIds: ['rp-flight-arcs'] });
            if (arc?.object?.route) return { kind: 'route', x: point.x, y: point.y, route: arc.object.route };
            const box: [maplibregl.PointLike, maplibregl.PointLike] = [[point.x - TOL, point.y - TOL], [point.x + TOL, point.y + TOL]];
            const layers = ['rp-airports', 'rp-places', 'rp-pins', 'rp-routes', 'rp-routes-sea', 'rp-country-fill'].filter(id => map.getLayer(id));
            if (!layers.length) return null;
            const hits = map.queryRenderedFeatures(box, { layers });
            const rank = (id: string) => layers.indexOf(id);
            const f = hits.sort((a, b) => rank(a.layer.id) - rank(b.layer.id))[0];
            if (!f) return null;
            const { model: m, countryStatusMap: csm } = lookupRef.current;
            const at = { x: point.x, y: point.y };
            if (f.layer.id === 'rp-airports' || f.layer.id === 'rp-places') {
                const list = f.layer.id === 'rp-airports' ? m.airports : m.places;
                const place = list.find(pl => pl.id === f.properties.key);
                return place ? { kind: 'place', ...at, place } : null;
            }
            if (f.layer.id === 'rp-pins') return { kind: 'pin', ...at, name: String(f.properties.name) };
            if (f.layer.id.startsWith('rp-routes')) {
                const route = m.routes.find(r => r.id === f.properties.id);
                return route ? { kind: 'route', ...at, route } : null;
            }
            const code = String(f.properties.code || '');
            const name = String(f.properties.name || code);
            return { kind: 'country', ...at, code, name, statuses: asList(csm[code] ?? csm[name.toUpperCase()]) };
        };
        const setHover = (next: { source: string; id: string | number } | null) => {
            if (hovered && map.getSource(hovered.source)) map.setFeatureState(hovered, { hover: false });
            hovered = next;
            if (hovered && map.getSource(hovered.source)) map.setFeatureState(hovered, { hover: true });
        };
        const onMove = (e: maplibregl.MapMouseEvent) => {
            const h = pick(e.point);
            map.getCanvas().style.cursor = h ? 'pointer' : '';
            if (h?.kind === 'route') setHover({ source: 'rp-routes', id: h.route.id });
            else if (h?.kind === 'place' && h.place.kind === 'airport') setHover({ source: 'rp-airports', id: h.place.id });
            else setHover(null);
            hoverRef.current?.(h);
        };
        const onLeave = () => { setHover(null); hoverRef.current?.(null); };
        const onClick = (e: maplibregl.MapMouseEvent) => {
            const h = pick(e.point);
            if (!h) return;
            if (h.kind === 'route') clickRef.current.onRouteClick?.(h.route);
            if (h.kind === 'place') clickRef.current.onPlaceClick?.(h.place);
            if (h.kind === 'country') clickRef.current.onCountryClick?.(h.code, h.name);
        };
        map.on('mousemove', onMove);
        map.on('mouseout', onLeave);
        map.on('click', onClick);
        return () => {
            map.off('mousemove', onMove);
            map.off('mouseout', onLeave);
            map.off('click', onClick);
        };
    }, []);

    /* ------------------------------------------------------------------ camera */

    const fitAll = useCallback(() => {
        const map = mapRef.current;
        if (!map) return;
        const b = modelRef.current.bounds;
        const pad = paddingRef.current;
        if (b && (b[1][0] - b[0][0] > 0.01 || b[1][1] - b[0][1] > 0.01)) {
            map.fitBounds(b as any, { padding: pad, maxZoom: 5.5, duration: reducedMotion ? 0 : 900 });
        } else if (b) {
            map.flyTo({ center: b[0], zoom: 5, padding: pad, duration: reducedMotion ? 0 : 900 });
        } else {
            map.flyTo({ center: WORLD.center, zoom: WORLD.zoom, padding: pad, duration: reducedMotion ? 0 : 900 });
        }
    }, [reducedMotion]);

    // Frame the travels once, when they first arrive.
    useEffect(() => {
        if (fittedRef.current || !model.bounds || !styleVersion) return;
        fittedRef.current = true;
        fitAll();
    }, [model.bounds, styleVersion, fitAll]);

    useImperativeHandle(ref, () => ({
        zoomIn: () => mapRef.current?.zoomIn(),
        zoomOut: () => mapRef.current?.zoomOut(),
        fitAll,
        flyTo: (lng, lat, z) => mapRef.current?.flyTo({ center: [lng, lat], zoom: z ?? 6, padding: paddingRef.current, duration: reducedMotion ? 0 : 1100 }),
        fitBounds: b => mapRef.current?.fitBounds(b as any, { padding: paddingRef.current, maxZoom: 7, duration: reducedMotion ? 0 : 900 }),
    }), [fitAll, reducedMotion]);

    // MapLibre sets `position: relative` on its container, so positioning lives on a wrapper.
    return (
        <div className={cn(className, isGlobe && appearance.atmosphere !== false && !lightBasemap && 'rp-stars')} aria-label="Travel map" role="region">
            <div ref={containerRef} className="h-full w-full" />
        </div>
    );
});
