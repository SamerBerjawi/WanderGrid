import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { Protocol as PmtilesProtocol } from 'pmtiles';
import {
    AIRPORT_SOURCE_ID,
    GLYPHS_URL,
    AIRPORT_ICON_DEFINITIONS,
    createAirportOverlaySource,
    createAirportOverlayLayers
} from '../services/airportOverlayStyle';
import {
    OPENAIP_AIRSPACE_SOURCE_ID,
    OPENAIP_PATTERN_IMAGES,
    OPENAIP_SYMBOL_IMAGE_IDS,
    getOpenAipOverlayLayers,
    ensureOpenAipIcons,
    OpenAipOverlayGroup
} from '../services/openAipStyle';

// Register PMTiles protocol globally once for MapLibre vector tile decoding
try {
    const protocol = new PmtilesProtocol();
    (maplibregl as any).addProtocol('pmtiles', protocol.tile);
} catch (e) {
    console.warn('[DeckFlightMap] PMTiles registration warning:', e);
}

// Explicitly register worker URL for Vite ESM bundling compatibility
if (typeof (maplibregl as any).setWorkerUrl === 'function') {
    (maplibregl as any).setWorkerUrl(maplibreWorkerUrl);
}

// Initialize MapLibre RTL text plugin for Arabic, Hebrew, and other RTL complex scripts
try {
    if (typeof (maplibregl as any).setRTLTextPlugin === 'function') {
        const rtlStatus = typeof (maplibregl as any).getRTLTextPluginStatus === 'function'
            ? (maplibregl as any).getRTLTextPluginStatus()
            : 'unavailable';
        if (rtlStatus === 'unavailable') {
            const pluginUrl = typeof window !== 'undefined' && window.location?.origin
                ? `${window.location.origin}/vendor/mapbox-gl-rtl-text.min.js`
                : '/vendor/mapbox-gl-rtl-text.min.js';
            (maplibregl as any).setRTLTextPlugin(pluginUrl, false);
        }
    }
} catch (e) {
    console.warn('[DeckFlightMap] RTL plugin initialization warning:', e);
}

import { MapboxOverlay } from '@deck.gl/mapbox';
import { ArcLayer, ScatterplotLayer, GeoJsonLayer, PathLayer, TextLayer } from '@deck.gl/layers';
import { TripsLayer } from '@deck.gl/geo-layers';
import { geoInterpolate } from 'd3';
import {
    CornersOut as Scan,
    Globe,
    ArrowLeft,
    ArrowRight,
    X,
    Airplane as Plane,
    CaretRight as ChevronRight,
    CaretLeft,
    Train,
    Boat as Ship,
    Car,
    List,
    Sparkle,
    Bus,
    SlidersHorizontal,
    Warning
} from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'motion/react';
import { FEATURE_FLAGS } from '../config/featureFlags';
import { Trip, CountryResidenceStatus, PredefinedMapMode, toggleCountryResidenceStatus, WorkspaceSettings } from '../types';
import { useWanderSync } from '../hooks/useWanderSync';
import { getCoordinatesSync, formatPlaceName, formatProperLocationName } from '../services/geocoding';
import {
    MapAppearanceSettings,
    EffectiveBasemap,
    loadMapAppearanceSettings,
    saveMapAppearanceSettings,
    getEffectiveBasemap,
    getYesterdayDateString,
    adjustDateString
} from '../types/mapAppearance';
import { getTwilightGradientGeoJSON } from '../services/solarTerminator';
import { getLatestRainRadarMetadata, RainRadarMetadata } from '../services/rainViewer';
import { getPhysicalRunways, getPhysicalRunwaysSync, generateAirportRunway, PhysicalRunway, isKnownAirport, getAllGlobalAirports, GlobalAirportNode } from '../services/airportRunways';
import { buildRouteCorridors, RouteCorridor, getApproxLocalTime, formatAirportDisplayName, resolveLocationMetadata, getRouteTransportSummary } from '../services/routeCorridor';
import { getFlagEmoji, getRegion } from '../services/geoData';
import { fetchMultiModalRoute, getCachedMultiModalRoute, getMultiModalRouteStatus, generateSmoothRailCorridor } from '../services/multiModalRouting';
import { dataService } from '../services/mockDb';
import { DataCreditsPopover } from './DataCreditsPopover';
import GlassPanel from './glass/GlassPanel';
import { globeHorizonCullExtension } from './GlobeHorizonCullExtension';
import { GlobeAtmosphericBackground } from './GlobeAtmosphericBackground';
import { MapAppearanceModal } from './MapAppearanceModal';
import { MAP_SETTINGS_LABELS } from './mapSettings/labels';

// --- Country Matching Helper for Scratch Map & Overlays ---
let geoJsonMemoryCache: any = null;

const isCountryVisited = (f: any, visitedList: string[]): boolean => {
    if (!visitedList || visitedList.length === 0) return false;
    const p = f.properties || {};
    const lookupSet = new Set(visitedList.map(c => (c || '').trim().toUpperCase()));

    // If UK is in visitedList, match UK subunits
    const isUKSubunit = p.GU_A3 === 'ENG' || p.GU_A3 === 'SCT' || p.GU_A3 === 'WLS' || p.GU_A3 === 'NIR' ||
        p.ISO_A2 === 'GB-ENG' || p.ISO_A2 === 'GB-SCT' || p.ISO_A2 === 'GB-WLS' || p.ISO_A2 === 'GB-NIR' ||
        p.NAME === 'England' || p.NAME === 'Scotland' || p.NAME === 'Wales' || p.NAME === 'Northern Ireland';
    if (isUKSubunit && (lookupSet.has('GB') || lookupSet.has('UK') || lookupSet.has('UNITED KINGDOM') || lookupSet.has('GREAT BRITAIN'))) {
        return true;
    }

    const candidates = [
        p.ISO_A2, p.ISO_A2_EH, p.wb_a2, p.POSTAL, p.iso_a2,
        p.ISO_A3, p.ISO_A3_EH, p.ADM0_A3, p.wb_a3, p.gu_a3, p.GU_A3,
        p.NAME, p.NAME_LONG, p.NAME_SORT, p.SOVEREIGNT, p.ADMIN, p.GEOUNIT
    ];

    for (const c of candidates) {
        if (typeof c === 'string' && lookupSet.has(c.trim().toUpperCase())) {
            return true;
        }
    }
    return false;
};

// --- Gradient Color Logic & Regional Poles ---
const COLOR_POLES = [
    { lat: 55, lng: -100, color: [56, 189, 248] },   // NA: Bright Sky Blue
    { lat: -15, lng: -60, color: [52, 211, 153] },    // SA: Bright Mint/Emerald
    { lat: 10, lng: 20, color: [251, 191, 36] },      // Africa: Bright Gold/Amber
    { lat: 50, lng: 15, color: [192, 132, 252] },     // Europe: Bright Lilac/Violet (high contrast on dark basemaps)
    { lat: 35, lng: 105, color: [251, 113, 133] },    // Asia: Bright Coral/Rose
    { lat: -25, lng: 135, color: [34, 211, 238] },    // Oceania: Electric Aqua
];

const geoGradientCache = new Map<string, [number, number, number]>();
const getGeoGradientRGB = (lat: number, lng: number): [number, number, number] => {
    const key = `${lat.toFixed(1)},${lng.toFixed(1)}`;
    const cached = geoGradientCache.get(key);
    if (cached) return cached;

    let totalWeight = 0;
    let r = 0, g = 0, b = 0;

    for (const pole of COLOR_POLES) {
        const dLat = lat - pole.lat;
        const dLng = lng - pole.lng;
        const distSq = dLat * dLat + dLng * dLng;
        const weight = 1 / Math.pow(distSq + 800, 1.5);

        totalWeight += weight;
        r += pole.color[0] * weight;
        g += pole.color[1] * weight;
        b += pole.color[2] * weight;
    }

    const rgb: [number, number, number] = [
        Math.min(255, Math.max(0, Math.round(r / totalWeight))),
        Math.min(255, Math.max(0, Math.round(g / totalWeight))),
        Math.min(255, Math.max(0, Math.round(b / totalWeight)))
    ];
    geoGradientCache.set(key, rgb);
    return rgb;
};

// High-contrast, vibrant thermal energy heatmap density color progression
const getFrequencyRGB = (freq: number): [number, number, number] => {
    if (freq <= 1) return [6, 182, 212];    // Electric Cyan / Teal (1 flight)
    if (freq === 2) return [16, 185, 129];  // Emerald Mint Green (2 flights)
    if (freq <= 4) return [234, 179, 8];    // Radiant Sun Gold (3-4 flights)
    if (freq <= 7) return [249, 115, 22];   // Vivid Blaze Orange (5-7 flights)
    if (freq <= 11) return [239, 68, 68];   // Hot Crimson Red (8-11 flights)
    return [236, 72, 153];                  // Intense Hyper Magenta / Plasma Pink (12+ flights)
};

/**
 * AirTrail Date Formatter (MM/DD/YYYY)
 * E.g. "06/18/2022", "04/05/2013"
 */
const formatAirTrailDate = (dateStr?: string): string => {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(d.getUTCDate()).padStart(2, '0');
        const yyyy = d.getUTCFullYear();
        return `${mm}/${dd}/${yyyy}`;
    } catch {
        return dateStr;
    }
};

/**
 * AirTrail Medium Date Formatter (MMM D, YYYY)
 * E.g. "Jun 18, 2022"
 */
const formatAirTrailDateMedium = (dateStr?: string): string => {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
    } catch {
        return dateStr;
    }
};

/**
 * AirTrail relative time difference string:
 * E.g. "LAX 9h behind", "AMM 8h ahead", "Same local time"
 */
const getRelativeTimeDiffString = (originLng: number, destLng: number, destCode: string): string => {
    const originOffset = Math.round(originLng / 15);
    const destOffset = Math.round(destLng / 15);
    const diff = destOffset - originOffset;
    if (diff === 0) return 'Same local time';
    const cleanDestCode = formatProperLocationName(destCode || '');
    if (diff > 0) return `${cleanDestCode} ${diff}h ahead`;
    return `${cleanDestCode} ${Math.abs(diff)}h behind`;
};

/**
 * Format City and Airport with dot separator matching AirTrail:
 * E.g. "Amsterdam · Amsterdam Airport Schiphol", "Los Angeles · Los Angeles Intl."
 */
const formatAirportCityDotName = (name: string, city?: string): string => {
    const properName = formatProperLocationName(name || '');
    const properCity = formatProperLocationName(city ? city.split(',')[0].trim() : '');
    if (properCity && properName) {
        if (properCity.toUpperCase() === properName.toUpperCase()) return properName;
        if (properName.toLowerCase().startsWith(properCity.toLowerCase())) return properName;
        if (properCity.toLowerCase().startsWith(properName.toLowerCase())) return properCity;
        return `${properCity} · ${properName}`;
    }
    return properCity || properName || '';
};

const renderRouteModeIcon = (mode: string, className = "w-4 h-4") => {
    const lower = (mode || '').toLowerCase();
    if (lower.includes('train') || lower.includes('rail')) {
        return <Train className={className} weight="duotone" />;
    }
    if (lower.includes('cruise') || lower.includes('ferry') || lower.includes('boat') || lower.includes('ship')) {
        return <Ship className={className} weight="duotone" />;
    }
    if (lower.includes('car') || lower.includes('drive') || lower.includes('taxi')) {
        return <Car className={className} weight="duotone" />;
    }
    if (lower.includes('bus')) {
        return <Bus className={className} weight="duotone" />;
    }
    if (lower.includes('multi') || lower.includes('mixed')) {
        return <Sparkle className={className} weight="duotone" />;
    }
    return <Plane className={className} weight="duotone" />;
};

// Calculate approximate polygon centroid for Scratch Map regional coloring
const getFeatureCentroid = (feature: any): { lat: number; lng: number } => {
    try {
        const geom = feature.geometry;
        if (!geom) return { lat: 20, lng: 0 };

        let sumLat = 0, sumLng = 0, count = 0;
        const extractCoords = (coords: any) => {
            if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
                sumLng += coords[0];
                sumLat += coords[1];
                count++;
            } else if (Array.isArray(coords)) {
                coords.forEach(extractCoords);
            }
        };
        extractCoords(geom.coordinates);
        if (count > 0) {
            return { lat: sumLat / count, lng: sumLng / count };
        }
    } catch {
        // Fallback
    }
    return { lat: 20, lng: 0 };
};

const LIGHT_BASEMAPS: ReadonlySet<EffectiveBasemap> = new Set(['liberty', 'bright', 'positron']);
const isLightEffectiveBasemap = (layer: EffectiveBasemap): boolean => LIGHT_BASEMAPS.has(layer);

const useDarkMode = () => {
    const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
    useEffect(() => {
        const observer = new MutationObserver(() => {
            setIsDark(document.documentElement.classList.contains('dark'));
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);
    return isDark;
};

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

export const computeStyleKey = (
    layer: string,
    dark: boolean,
    cartoKey?: string,
    proj?: string,
    airportDetail?: string
): string => {
    return [
        layer,
        dark ? 'dark' : 'light',
        cartoKey || '',
        proj || 'mercator',
        airportDetail || '',
    ].join('|');
};

// MapLibre Style Specification Generator
export const createMapLibreStyle = (
    layer: string,
    isDark: boolean,
    cartoApiKey?: string,
    isGlobe: boolean = false,
    detailedAirports: boolean = false,
    openAipOverlay: boolean = false,
    openAipKey?: string,
    openAipGroups?: OpenAipOverlayGroup[]
): string | maplibregl.StyleSpecification => {
    const effectiveLayer = getEffectiveBasemap(layer, isDark);

    // OpenFreeMap vector basemaps (P-04b)
    if (FEATURE_FLAGS.GEV_P04B_OPENFREEMAP) {
        if (effectiveLayer === 'liberty' || effectiveLayer === '3d') return 'https://tiles.openfreemap.org/styles/liberty';
        if (effectiveLayer === 'bright') return 'https://tiles.openfreemap.org/styles/bright';
        if (effectiveLayer === 'positron') return 'https://tiles.openfreemap.org/styles/positron';
        if (effectiveLayer === 'dark') return 'https://tiles.openfreemap.org/styles/dark';
        if (effectiveLayer === 'fiord') return 'https://tiles.openfreemap.org/styles/fiord';
    }

    // Synchronously resolve and sanitize CARTO API key from arguments or localStorage
    let resolvedCartoKey = (cartoApiKey || '').trim();
    if (!resolvedCartoKey && typeof localStorage !== 'undefined') {
        try {
            const raw = localStorage.getItem('wandergrid_workspace_settings') || localStorage.getItem('wandergrid_settings');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed.cartoApiKey && typeof parsed.cartoApiKey === 'string') {
                    resolvedCartoKey = parsed.cartoApiKey.trim();
                }
            }
        } catch {}
    }
    resolvedCartoKey = resolvedCartoKey.replace(/^['"]|['"]$/g, '').trim();
    if (resolvedCartoKey.startsWith('key=')) resolvedCartoKey = resolvedCartoKey.slice(4).trim();
    if (resolvedCartoKey.startsWith('?key=')) resolvedCartoKey = resolvedCartoKey.slice(5).trim();

    const { tiles, maxzoom, attribution } = getBasemapTileConfig(effectiveLayer, resolvedCartoKey);
    const basemapSourceId = `raster-basemap-source-${effectiveLayer}`;
    const isLightBasemap = isLightEffectiveBasemap(effectiveLayer);

    const sources: Record<string, any> = {
        [basemapSourceId]: {
            type: 'raster',
            tiles,
            tileSize: 256,
            maxzoom,
            attribution
        }
    };

    if (detailedAirports) {
        sources[AIRPORT_SOURCE_ID] = createAirportOverlaySource();
    }

    const sanitizedOpenAipKey = (openAipKey || '').trim();
    const canEnableOpenAip = Boolean(openAipOverlay && sanitizedOpenAipKey);

    if (canEnableOpenAip) {
        sources[OPENAIP_AIRSPACE_SOURCE_ID] = {
            type: 'vector',
            tiles: [`https://api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.pbf?apiKey=${encodeURIComponent(sanitizedOpenAipKey)}`],
            minzoom: 0,
            maxzoom: 14,
            attribution: '<a href="https://www.openaip.net" target="_blank" rel="noopener noreferrer">openAIP</a>'
        };
    }

    const layers: any[] = [
        ...(isGlobe ? [] : [
            {
                id: 'background-base-layer',
                type: 'background' as const,
                paint: {
                    'background-color': isLightBasemap ? '#f8fafc' : '#05070f'
                }
            }
        ]),
        {
            id: 'raster-basemap-layer',
            type: 'raster' as const,
            source: basemapSourceId,
            minzoom: 0,
            maxzoom: 24
        },
        ...(canEnableOpenAip ? getOpenAipOverlayLayers(openAipGroups, isDark ? 'dark' : 'light') : []),
        ...(detailedAirports ? createAirportOverlayLayers(isDark) : [])
    ];

    return {
        version: 8,
        glyphs: GLYPHS_URL,
        ...(isGlobe ? { projection: { type: 'globe' } as any } : {}),
        sources,
        layers
    };
};

export function getMapContentPadding(
    isSidebarCollapsed: boolean,
    width: number,
    height: number,
    embedded: boolean = false
) {
    if (embedded || width < 700) {
        return {
            top: 16,
            left: 16,
            right: 16,
            bottom: 16,
        };
    }
    const isMobile = width < 768;
    if (isMobile) {
        return {
            top: 16,
            left: 16,
            right: 16,
            bottom: 80, // Space for bottom navigation bar on mobile devices
        };
    }
    return {
        top: 24,
        left: isSidebarCollapsed ? 116 : 324, // Sidebar footprint (collapsed ~116px, expanded ~324px)
        right: 24,
        bottom: 24,
    };
}

function calculateAdaptiveWorldCamera(
    containerWidth: number,
    containerHeight: number,
    isSidebarCollapsed: boolean,
    isGlobe: boolean,
    embedded: boolean = false
) {
    const padding = getMapContentPadding(isSidebarCollapsed, containerWidth, containerHeight, embedded);
    const availW = Math.max(100, containerWidth - padding.left - padding.right);
    const availH = Math.max(100, containerHeight - padding.top - padding.bottom);

    if (isGlobe) {
        // Globe projection in MapLibre: scale globe diameter to fit within available space
        const targetDiameter = Math.min(availW, availH) * 0.86;
        const zoom = Math.max(0.1, Math.min(3.0, Math.log2(targetDiameter / 512) + 1.0));
        return {
            center: [0, 15] as [number, number],
            zoom: Number(zoom.toFixed(2)),
            padding,
        };
    }

    // Flat Mercator projection:
    // Earth spans longitude [-180, 180] (360 degrees = full tile width at zoom 0 = 512px).
    // The default zoom level is framed to show exactly ONE map view horizontally across the available width:
    // With world width = 512 * 2^zoom, setting scaleX = availW / 512 fits exactly one world map view
    // without repeating additional copies horizontally at the default zoom.
    const scaleX = availW / 512;
    const spanY = 0.58;
    const scaleY = availH / (spanY * 512);
    const scale = Math.max(scaleX, scaleY);
    const calculatedZoom = Math.log2(scale);
    const zoom = Math.max(0.1, Math.min(3.5, calculatedZoom));

    return {
        center: [0, 18] as [number, number],
        zoom: Number(zoom.toFixed(2)),
        padding,
    };
}

export type DeckLayerType = 'standard' | 'night' | 'satellite' | 'topography' | 'hillshade' | 'physical' | 'ocean';

export interface DeckFlightMapProps {
    trips: Trip[];
    onTripClick?: (tripId: string) => void;
    showFrequencyWeight?: boolean;
    animateRoutes?: boolean;
    visitedCountries?: string[];
    showCountries?: boolean;
    viewMode?: PredefinedMapMode | 'network' | 'scratch';
    visitedPlaces?: { lat: number; lng: number; name: string }[];
    countryStatusMap?: Record<string, CountryResidenceStatus[] | CountryResidenceStatus>;
    onUpdateCountryStatus?: (countryCode: string, countryName: string, status: CountryResidenceStatus[] | CountryResidenceStatus | 'none') => void;
    activeLayer?: DeckLayerType | string;
    onChangeActiveLayer?: (layer: DeckLayerType) => void;
    showFlightRoutes?: boolean;
    showLandSeaRoutes?: boolean;
    showCityMarkers?: boolean;
    showGradientRoutes?: boolean;
    clusterMode?: boolean;
    showRoadTracing?: boolean;
    focusTransportCoordinates?: { lat: number; lng: number } | null;
    projection?: 'flat' | 'globe';
    elevatedRoutes?: boolean;
    onProjectionChange?: (projection: 'flat' | 'globe') => void;
    onElevatedRoutesChange?: (elevated: boolean) => void;
    initialProjection?: 'flat' | 'globe';
    initialElevated?: boolean;
    appearanceSettings?: MapAppearanceSettings;
    onChangeAppearanceSettings?: (settings: MapAppearanceSettings) => void;
    onOpenMissionControl?: () => void;
    isSidebarCollapsed?: boolean;
    embedded?: boolean;
}

const syncAirportOverlayOnMap = (map: maplibregl.Map, isDetailedAirports: boolean, isDark: boolean) => {
    if (!map.isStyleLoaded()) {
        const retry = () => syncAirportOverlayOnMap(map, isDetailedAirports, isDark);
        map.once('styledata', retry);
        map.once('load', retry);
        return;
    }
    if (isDetailedAirports) {
        if (!map.getSource(AIRPORT_SOURCE_ID)) {
            try {
                map.addSource(AIRPORT_SOURCE_ID, createAirportOverlaySource());
            } catch (e) {
                console.warn('[DeckFlightMap] error adding airport source:', e);
            }
        }
        if (map.getSource(AIRPORT_SOURCE_ID)) {
            const airportLayers = createAirportOverlayLayers(isDark);
            airportLayers.forEach(layer => {
                if (!map.getLayer(layer.id)) {
                    try {
                        map.addLayer(layer);
                    } catch (e) {
                        console.warn(`[DeckFlightMap] error adding airport layer ${layer.id}:`, e);
                    }
                } else if (layer.paint) {
                    Object.entries(layer.paint).forEach(([prop, val]) => {
                        try {
                            map.setPaintProperty(layer.id, prop as any, val);
                        } catch {}
                    });
                }
            });
        }
    } else {
        const airportLayers = createAirportOverlayLayers(isDark);
        airportLayers.forEach(layer => {
            if (map.getLayer(layer.id)) {
                try { map.removeLayer(layer.id); } catch (e) {}
            }
        });
        if (map.getSource(AIRPORT_SOURCE_ID)) {
            try { map.removeSource(AIRPORT_SOURCE_ID); } catch (e) {}
        }
    }
};

const syncOpenAipOverlayOnMap = (
    map: maplibregl.Map,
    isOpenAipOverlay: boolean,
    isDark: boolean,
    openAipKey?: string,
    openAipGroups?: OpenAipOverlayGroup[],
    openAipOpacity: number = 0.85
) => {
    if (!map.isStyleLoaded()) return;
    const sanitizedKey = (openAipKey || '').trim();

    const allPotentialLayers = getOpenAipOverlayLayers(
        ['airspaces', 'airspaceLabels', 'airports', 'navaids', 'reportingPoints'],
        isDark ? 'dark' : 'light'
    );

    if (!isOpenAipOverlay || !sanitizedKey) {
        // Remove OpenAIP layers if disabled
        allPotentialLayers.forEach(layer => {
            if (map.getLayer(layer.id)) {
                try { map.removeLayer(layer.id); } catch (e) {}
            }
        });
        if (map.getSource(OPENAIP_AIRSPACE_SOURCE_ID)) {
            try { map.removeSource(OPENAIP_AIRSPACE_SOURCE_ID); } catch (e) {}
        }
        return;
    }

    if (!map.getSource(OPENAIP_AIRSPACE_SOURCE_ID)) {
        try {
            map.addSource(OPENAIP_AIRSPACE_SOURCE_ID, {
                type: 'vector',
                tiles: [`https://api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.pbf?apiKey=${encodeURIComponent(sanitizedKey)}`],
                minzoom: 0,
                maxzoom: 14,
                attribution: '<a href="https://www.openaip.net" target="_blank" rel="noopener noreferrer">openAIP</a>'
            });
        } catch (e) {}
    }

    if (map.getSource(OPENAIP_AIRSPACE_SOURCE_ID)) {
        const activeLayers = getOpenAipOverlayLayers(openAipGroups, isDark ? 'dark' : 'light');

        // Remove any existing OpenAIP layers so active ones are added cleanly in proper z-order with current theme
        allPotentialLayers.forEach(layer => {
            if (map.getLayer(layer.id)) {
                try { map.removeLayer(layer.id); } catch (e) {}
            }
        });

        // Add enabled layers in canonical order (fills -> borders -> symbols -> labels)
        activeLayers.forEach(layer => {
            try {
                map.addLayer(layer);
                if (layer.type === 'fill' && map.getLayer(layer.id)) {
                    map.setPaintProperty(layer.id, 'fill-opacity', openAipOpacity * 0.4);
                } else if (layer.type === 'line' && map.getLayer(layer.id)) {
                    map.setPaintProperty(layer.id, 'line-opacity', openAipOpacity);
                }
            } catch (e) {}
        });
    }
};

const simplifyRailroadLayers = (map: maplibregl.Map) => {
    if (!map.isStyleLoaded()) {
        const retry = () => simplifyRailroadLayers(map);
        map.once('styledata', retry);
        map.once('load', retry);
        return;
    }
    try {
        const style = map.getStyle();
        if (!style || !style.layers) return;
        style.layers.forEach((layer) => {
            const id = layer.id;
            const isRailLine = layer.type === 'line' && (
                id.includes('rail') || 
                id.includes('railway') || 
                (layer['source-layer'] && String(layer['source-layer']).includes('rail'))
            );
            if (!isRailLine) return;

            // Remove glow / fuzzy effects by hiding hatching, dashlines, halos, and casings
            const isAuxiliaryRailLayer = 
                id.includes('hatching') || 
                id.includes('dashline') || 
                id.includes('casing') || 
                id.includes('halo');

            if (isAuxiliaryRailLayer) {
                try {
                    map.setLayoutProperty(id, 'visibility', 'none');
                } catch {}
                return;
            }

            // Keep primary rail line as a clean, simple 1px hairline with zero glow
            try {
                map.setLayoutProperty(id, 'visibility', 'visible');
                map.setPaintProperty(id, 'line-width', 1);
                map.setPaintProperty(id, 'line-blur', 0);
                map.setPaintProperty(id, 'line-gap-width', 0);
                map.setPaintProperty(id, 'line-offset', 0);
                try {
                    map.setPaintProperty(id, 'line-dasharray', [1, 0]);
                } catch {}
            } catch {}
        });
    } catch (e) {
        // Ignore style access error
    }
};

export const DeckFlightMap: React.FC<DeckFlightMapProps> = ({
    trips,
    onTripClick,
    showFrequencyWeight = true,
    animateRoutes = false,
    visitedCountries = [],
    showCountries = false,
    viewMode = 'all',
    visitedPlaces = [],
    countryStatusMap = {},
    onUpdateCountryStatus,
    activeLayer: activeLayerProp,
    showFlightRoutes = true,
    showLandSeaRoutes = true,
    showCityMarkers = true,
    clusterMode = false,
    showRoadTracing = false,
    focusTransportCoordinates,
    projection: projectionProp,
    elevatedRoutes: elevatedRoutesProp,
    initialProjection = 'flat',
    initialElevated = false,
    appearanceSettings: appearanceSettingsProp,
    onChangeAppearanceSettings,
    onOpenMissionControl,
    isSidebarCollapsed,
    embedded
}) => {
    const isEmbedded = embedded !== undefined ? embedded : (isSidebarCollapsed === undefined);
    const sidebarCollapsed = isSidebarCollapsed ?? false;
    const isDark = useDarkMode();
    const { data: workspaceSettings } = useWanderSync<WorkspaceSettings>(
        'settings',
        () => dataService.getWorkspaceSettings(),
        []
    );

    // Synchronous & Reactive CARTO API Key Management
    const [dynamicCartoKey, setDynamicCartoKey] = useState<string>(() => {
        if (typeof localStorage === 'undefined') return '';
        try {
            const raw = localStorage.getItem('wandergrid_workspace_settings') || localStorage.getItem('wandergrid_settings');
            if (raw) {
                const parsed = JSON.parse(raw);
                return (parsed.cartoApiKey || '').trim();
            }
        } catch {}
        return '';
    });

    useEffect(() => {
        const handleSettingsUpdate = (e: Event) => {
            const detail = (e as CustomEvent)?.detail;
            if (detail?.cartoApiKey !== undefined) {
                setDynamicCartoKey(String(detail.cartoApiKey).trim());
            }
        };
        window.addEventListener('wandergrid_settings_updated', handleSettingsUpdate);
        return () => window.removeEventListener('wandergrid_settings_updated', handleSettingsUpdate);
    }, []);

    const effectiveCartoKey = (workspaceSettings?.cartoApiKey || dynamicCartoKey).trim();
    const effectiveOpenAipKey = useMemo(() => {
        const fromSettings = (workspaceSettings?.openAipApiKey || '').trim();
        if (fromSettings) return fromSettings;
        try {
            const raw = typeof localStorage !== 'undefined'
                ? (localStorage.getItem('wandergrid_workspace_settings') || localStorage.getItem('wandergrid_settings'))
                : null;
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed.openAipApiKey && typeof parsed.openAipApiKey === 'string') {
                    return parsed.openAipApiKey.trim();
                }
            }
        } catch {}
        return '';
    }, [workspaceSettings?.openAipApiKey]);

    // Map Appearance State Management & Customizer Modal
    const [isAppearanceModalOpen, setIsAppearanceModalOpen] = useState<boolean>(false);
    const [localAppearance, setLocalAppearance] = useState<MapAppearanceSettings>(() => {
        return appearanceSettingsProp || loadMapAppearanceSettings();
    });

    useEffect(() => {
        if (appearanceSettingsProp) {
            setLocalAppearance(appearanceSettingsProp);
        }
    }, [appearanceSettingsProp]);

    useEffect(() => {
        const handleAppearanceSync = (e: Event) => {
            const detail = (e as CustomEvent)?.detail;
            if (detail) {
                setLocalAppearance(prev => ({ ...prev, ...detail }));
            }
        };
        window.addEventListener('wandergrid_map_appearance_updated', handleAppearanceSync);
        return () => window.removeEventListener('wandergrid_map_appearance_updated', handleAppearanceSync);
    }, []);

    const activeAppearance = appearanceSettingsProp || localAppearance;

    const handleAppearanceChange = (nextSettings: MapAppearanceSettings) => {
        setLocalAppearance(nextSettings);
        saveMapAppearanceSettings(nextSettings);
        if (onChangeAppearanceSettings) {
            onChangeAppearanceSettings(nextSettings);
        }
    };

    // Projection & Layer Resolution
    const effectiveProjection = projectionProp !== undefined
        ? projectionProp
        : (activeAppearance.projection || initialProjection);

    const [localElevatedRoutes, setLocalElevatedRoutes] = useState<boolean>(
        elevatedRoutesProp !== undefined ? elevatedRoutesProp : initialElevated
    );
    const [hoveredRouteKey, setHoveredRouteKey] = useState<string | null>(null);
    const [osrmVersion, setOsrmVersion] = useState(0);
    const [currentZoom, setCurrentZoom] = useState<number>(2.5);
    const [runwayDataset, setRunwayDataset] = useState<Record<string, PhysicalRunway[]> | null>(() => getPhysicalRunwaysSync());

    // Weather Rain Radar Metadata
    const [radarMeta, setRadarMeta] = useState<RainRadarMetadata | null>(null);

    useEffect(() => {
        if (!activeAppearance.rainRadar) return;
        const fetchRadar = () => {
            getLatestRainRadarMetadata(
                activeAppearance.rainRadarColorScheme || 2,
                1,
                1
            ).then(meta => {
                if (meta) setRadarMeta(meta);
            });
        };
        fetchRadar();
        const interval = setInterval(fetchRadar, 5 * 60_000);
        return () => clearInterval(interval);
    }, [activeAppearance.rainRadar, activeAppearance.rainRadarColorScheme]);

    // Periodic solar terminator refresh (every 60s as the earth rotates)
    const [solarTerminatorTick, setSolarTerminatorTick] = useState(0);
    useEffect(() => {
        if (!activeAppearance.timeOfDay) return;
        const interval = setInterval(() => {
            setSolarTerminatorTick(t => t + 1);
        }, 60_000);
        return () => clearInterval(interval);
    }, [activeAppearance.timeOfDay]);

    const twilightData = useMemo(() => {
        if (!activeAppearance.timeOfDay) return null;
        return getTwilightGradientGeoJSON();
    }, [activeAppearance.timeOfDay, solarTerminatorTick]);

    useEffect(() => {
        if (elevatedRoutesProp !== undefined) {
            setLocalElevatedRoutes(elevatedRoutesProp);
        }
    }, [elevatedRoutesProp]);

    const elevatedRoutes = elevatedRoutesProp !== undefined ? elevatedRoutesProp : localElevatedRoutes;
    
    // P-04a Basemap Auto-Fallback state (swaps Esri -> OSM on tile failures)
    const [fallbackLayer, setFallbackLayer] = useState<string | null>(null);
    const [basemapToastMessage, setBasemapToastMessage] = useState<string | null>(null);
    const tileFailureCountRef = useRef<number>(0);
    const tileFailureTimerRef = useRef<any>(null);
    const hasFallenBackRef = useRef<boolean>(false);

    const baseRequestedLayer = (activeLayerProp as DeckLayerType) || activeAppearance.basemap || 'default';
    const currentLayer = fallbackLayer || baseRequestedLayer;

    const currentLayerRef = useRef(currentLayer);
    currentLayerRef.current = currentLayer;
    const isDarkRef = useRef(isDark);
    isDarkRef.current = isDark;
    const lastAppliedStyleKeyRef = useRef<string>('');
    const prevEffectiveLayerRef = useRef<string>(getEffectiveBasemap(currentLayer, isDark));

    // Reset fallback on manual basemap/appearance change
    useEffect(() => {
        tileFailureCountRef.current = 0;
        hasFallenBackRef.current = false;
        setFallbackLayer(null);
        setBasemapToastMessage(null);
    }, [baseRequestedLayer, activeAppearance.basemap]);

    // MapLibre Container & Instance Refs
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);
    const overlayRef = useRef<MapboxOverlay | null>(null);
    const isMapLoadedRef = useRef<boolean>(false);

    // UI state
    const [hoverInfo, setHoverInfo] = useState<any>(null);
    const [geoJsonData, setGeoJsonData] = useState<any>(null);
    const [selectedCorridor, setSelectedCorridor] = useState<RouteCorridor | null>(null);
    const [selectedCountry, setSelectedCountry] = useState<any | null>(null);
    const [isFlightListExpanded, setIsFlightListExpanded] = useState<boolean>(false);

    // View history and selection refs for click-outside dismissal
    const previousViewRef = useRef<{ center: [number, number]; zoom: number; pitch?: number; bearing?: number } | null>(null);
    const selectedCorridorRef = useRef(selectedCorridor);
    selectedCorridorRef.current = selectedCorridor;
    const selectedCountryRef = useRef(selectedCountry);
    selectedCountryRef.current = selectedCountry;

    // Runway & global aerodromes dataset demand loading
    useEffect(() => {
        const wantsAviationAirports = Boolean(activeAppearance.openAipOverlay && (activeAppearance.openAipGroups ? activeAppearance.openAipGroups.includes('airports') : true));
        const wantsDetailedRunways = activeAppearance.airportDetail === 'detailed';
        if ((wantsAviationAirports || wantsDetailedRunways) && !runwayDataset) {
            getPhysicalRunways().then(dataset => {
                setRunwayDataset(dataset);
            }).catch(err => {
                console.warn("[DeckFlightMap] Could not load physical runway dataset:", err);
            });
        }
    }, [activeAppearance.airportDetail, activeAppearance.openAipOverlay, activeAppearance.openAipGroups, runwayDataset]);

    // Load GeoJSON for Scratch Map
    useEffect(() => {
        if (geoJsonMemoryCache) {
            setGeoJsonData(geoJsonMemoryCache);
            return;
        }

        const normalizeCountriesData = (countriesData: any, ukUnitsData?: any) => {
            if (!countriesData || !countriesData.features) return countriesData;

            const cleanedFeatures = countriesData.features
                .filter((f: any) => {
                    const p = f.properties || {};
                    const isUKMain = ukUnitsData && (p.SOVEREIGNT === 'United Kingdom' || p.NAME === 'United Kingdom') && p.TYPE === 'Sovereign country';
                    return !isUKMain;
                })
                .map((f: any) => {
                    const p = f.properties || {};
                    if ((!p.ISO_A2 || p.ISO_A2 === '-99') && p.ISO_A2_EH && p.ISO_A2_EH !== '-99') {
                        p.ISO_A2 = p.ISO_A2_EH;
                    }
                    if (p.NAME === 'Norway' && (!p.ISO_A2 || p.ISO_A2 === '-99')) p.ISO_A2 = 'NO';
                    if (p.NAME === 'France' && (!p.ISO_A2 || p.ISO_A2 === '-99')) p.ISO_A2 = 'FR';
                    if (p.NAME === 'Kosovo' && (!p.ISO_A2 || p.ISO_A2 === '-99')) p.ISO_A2 = 'XK';
                    return f;
                });

            if (ukUnitsData && ukUnitsData.features) {
                ukUnitsData.features.forEach((f: any) => {
                    const p = f.properties || {};
                    const gu = (p.GU_A3 || '').toUpperCase();
                    const nm = (p.NAME || '').toLowerCase();

                    if (gu === 'ENG' || nm === 'england') {
                        p.ISO_A2 = 'GB-ENG';
                        p.NAME = 'England';
                        p.SOVEREIGNT = 'United Kingdom';
                        cleanedFeatures.push(f);
                    } else if (gu === 'SCT' || nm === 'scotland') {
                        p.ISO_A2 = 'GB-SCT';
                        p.NAME = 'Scotland';
                        p.SOVEREIGNT = 'United Kingdom';
                        cleanedFeatures.push(f);
                    } else if (gu === 'WLS' || nm === 'wales') {
                        p.ISO_A2 = 'GB-WLS';
                        p.NAME = 'Wales';
                        p.SOVEREIGNT = 'United Kingdom';
                        cleanedFeatures.push(f);
                    } else if (gu === 'NIR' || nm === 'n. ireland' || nm === 'northern ireland') {
                        p.ISO_A2 = 'GB-NIR';
                        p.NAME = 'Northern Ireland';
                        p.SOVEREIGNT = 'United Kingdom';
                        cleanedFeatures.push(f);
                    }
                });
            }

            return {
                ...countriesData,
                features: cleanedFeatures
            };
        };

        const loadGeoJson = async () => {
            // P-05: Vendored local Natural Earth datasets (zero GitHub raw network calls in production)
            const countriesLocalUrl = '/data/ne_110m_admin_0_countries.geojson';
            const mapUnitsLocalUrl = '/data/ne_50m_admin_0_map_units.geojson';

            try {
                const [countriesRes, mapUnitsRes] = await Promise.allSettled([
                    fetch(countriesLocalUrl),
                    fetch(mapUnitsLocalUrl)
                ]);

                if (countriesRes.status === 'fulfilled' && countriesRes.value.ok) {
                    const countriesRaw = await countriesRes.value.json();
                    let mapUnitsRaw = null;
                    if (mapUnitsRes.status === 'fulfilled' && mapUnitsRes.value.ok) {
                        mapUnitsRaw = await mapUnitsRes.value.json();
                    }
                    const data = normalizeCountriesData(countriesRaw, mapUnitsRaw);
                    geoJsonMemoryCache = data;
                    setGeoJsonData(data);
                    return;
                }
            } catch {
                // Fallback to remote if local dev server doesn't host static files
            }

            try {
                const countriesStdResUrl = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
                const res = await fetch(countriesStdResUrl);
                if (res.ok) {
                    const raw = await res.json();
                    const data = normalizeCountriesData(raw);
                    geoJsonMemoryCache = data;
                    setGeoJsonData(data);
                }
            } catch (err) {
                console.warn('GeoJSON load failed', err);
            }
        };

        loadGeoJson();
    }, []);

    // Enrich trips coordinates synchronously
    const enrichedTrips = useMemo(() => {
        return (trips || []).map(trip => {
            if (!trip.transports || trip.transports.length === 0) return trip;
            const enrichedTransports = trip.transports.map(t => {
                let originLat = t.originLat;
                let originLng = t.originLng;
                let destLat = t.destLat;
                let destLng = t.destLng;

                if (t.origin && (!originLat || !originLng || isNaN(originLat) || isNaN(originLng))) {
                    const coords = getCoordinatesSync(t.origin);
                    if (coords) {
                        originLat = coords.lat;
                        originLng = coords.lng;
                    }
                }
                if (t.destination && (!destLat || !destLng || isNaN(destLat) || isNaN(destLng))) {
                    const coords = getCoordinatesSync(t.destination);
                    if (coords) {
                        destLat = coords.lat;
                        destLng = coords.lng;
                    }
                }
                return { ...t, originLat, originLng, destLat, destLng };
            });
            return { ...trip, transports: enrichedTransports };
        });
    }, [trips]);

    // Build Route Corridors Index
    const corridorMap = useMemo(() => {
        return buildRouteCorridors(enrichedTrips);
    }, [enrichedTrips]);

    // Handle corridor selection & camera fly-to
    const handleSelectCorridor = useCallback((corridorId: string) => {
        const corridor = corridorMap.get(corridorId);
        if (!corridor || !mapRef.current) return;

        // Remember previous camera view before focusing on the corridor
        if (!selectedCorridor && mapRef.current) {
            previousViewRef.current = {
                center: [mapRef.current.getCenter().lng, mapRef.current.getCenter().lat],
                zoom: mapRef.current.getZoom(),
                pitch: mapRef.current.getPitch(),
                bearing: mapRef.current.getBearing()
            };
        }

        const centerLng = (corridor.originCoords[0] + corridor.destCoords[0]) / 2;
        const centerLat = (corridor.originCoords[1] + corridor.destCoords[1]) / 2;

        let targetZoom = 5.2;
        if (corridor.distanceKm < 600) targetZoom = 6.6;
        else if (corridor.distanceKm < 1800) targetZoom = 5.3;
        else if (corridor.distanceKm < 4000) targetZoom = 4.2;
        else if (corridor.distanceKm < 8000) targetZoom = 3.2;
        else targetZoom = 2.4;

        mapRef.current.flyTo({
            center: [centerLng, centerLat],
            zoom: targetZoom,
            duration: 1200,
            essential: true
        });

        setSelectedCorridor(corridor);
    }, [corridorMap, selectedCorridor]);

    const handleResetCorridor = useCallback(() => {
        if (mapRef.current) {
            if (previousViewRef.current) {
                mapRef.current.flyTo({
                    center: previousViewRef.current.center,
                    zoom: previousViewRef.current.zoom,
                    pitch: previousViewRef.current.pitch ?? 0,
                    bearing: previousViewRef.current.bearing ?? 0,
                    duration: 1000,
                    essential: true
                });
                previousViewRef.current = null;
            } else {
                const rect = mapContainerRef.current?.getBoundingClientRect();
                const width = rect?.width || window.innerWidth || 1200;
                const height = rect?.height || window.innerHeight || 800;
                const cam = calculateAdaptiveWorldCamera(width, height, sidebarCollapsed, effectiveProjection === 'globe', isEmbedded);
                try {
                    mapRef.current.setPadding(cam.padding);
                } catch (e) {
                    console.warn('[DeckFlightMap] reset setPadding error:', e);
                }
                mapRef.current.flyTo({
                    center: cam.center,
                    zoom: cam.zoom,
                    duration: 1000,
                    essential: true
                });
            }
        }
        setSelectedCorridor(null);
        setSelectedCountry(null);
    }, [effectiveProjection, sidebarCollapsed, isEmbedded]);

    // Multi-modal routes request (Rail & Highway)
    useEffect(() => {
        const isTracingEnabled = showRoadTracing || activeAppearance.routeTracing !== false;
        if (!isTracingEnabled) return;

        enrichedTrips.forEach(trip => {
            trip.transports?.forEach(t => {
                if (t.originLat && t.originLng && t.destLat && t.destLng) {
                    const mode = (t.mode || '').toLowerCase();
                    const isTrain = mode.includes('train') || mode.includes('rail');
                    const isRoad = mode.includes('car') || mode.includes('drive') || mode.includes('bus') || mode.includes('road') || mode.includes('taxi');
                    const isSea = ['cruise', 'ferry', 'boat', 'ship'].some(m => mode.includes(m));

                    if (isTrain || isRoad || isSea) {
                        void fetchMultiModalRoute(
                            t.mode,
                            t.originLat,
                            t.originLng,
                            t.destLat,
                            t.destLng,
                            () => setOsrmVersion(v => v + 1),
                            t.waypoints
                        );
                    }
                }
            });
        });
    }, [enrichedTrips, showRoadTracing, activeAppearance.routeTracing]);

    // Camera focus on transport coordinates
    useEffect(() => {
        if (focusTransportCoordinates && mapRef.current) {
            mapRef.current.flyTo({
                center: [focusTransportCoordinates.lng, focusTransportCoordinates.lat],
                zoom: Math.max(mapRef.current.getZoom(), 5),
                duration: 1000,
                essential: true
            });
        }
    }, [focusTransportCoordinates]);

    // Preserve initial adaptive full earth view on load without clustering into local trip bounding box
    const fittedRef = useRef<boolean>(false);
    useEffect(() => {
        if (fittedRef.current || enrichedTrips.length === 0 || !mapRef.current) return;
        fittedRef.current = true;
    }, [enrichedTrips, effectiveProjection]);

    // --- High-Performance Flight Arc Deduplication & Geometry Preparation (AirTrail Architecture) ---
    const scaleMultiplier = activeAppearance.routeScale === 'thin'
        ? 0.65
        : activeAppearance.routeScale === 'thick'
            ? 1.75
            : 1.0;
    const isWidthByFreq = activeAppearance.routeWidthMode === 'frequency' || showFrequencyWeight;

    const {
        flightArcs,
        overlandSegments,
        airportPoints,
        clusterNodes
    } = useMemo(() => {
        const flightCorridorsMap = new Map<string, any>();
        const overlandRoutes: any[] = [];
        const pointsMap = new Map<string, any>();
        const airportFreqMap = new Map<string, number>();

        // 1. First pass: Compute frequency of every airport and location across all trips and transports
        enrichedTrips.forEach(trip => {
            trip.transports?.forEach(t => {
                if (!t.originLat || !t.originLng || !t.destLat || !t.destLng) return;

                const oCode = (t.origin || '').toUpperCase().trim();
                const dCode = (t.destination || '').toUpperCase().trim();
                const p1 = `${t.originLat.toFixed(3)},${t.originLng.toFixed(3)}`;
                const p2 = `${t.destLat.toFixed(3)},${t.destLng.toFixed(3)}`;

                airportFreqMap.set(p1, (airportFreqMap.get(p1) || 0) + 1);
                airportFreqMap.set(p2, (airportFreqMap.get(p2) || 0) + 1);
                if (oCode) airportFreqMap.set(oCode, (airportFreqMap.get(oCode) || 0) + 1);
                if (dCode) airportFreqMap.set(dCode, (airportFreqMap.get(dCode) || 0) + 1);
            });
        });

        // 2. Second pass: Build flight corridors, overland routes, and airport hub points with accurate traffic weights
        const isFreqMode = activeAppearance.airportMode === 'frequency';
        const baseOriginRadius = activeAppearance.airportSize === 'small' ? 3.0 : activeAppearance.airportSize === 'large' ? 8.0 : 5.0;

        enrichedTrips.forEach(trip => {
            trip.transports?.forEach(t => {
                if (!t.originLat || !t.originLng || !t.destLat || !t.destLng) return;

                const cleanMode = (t.mode || '').toLowerCase();
                const isFlight = !t.mode || cleanMode === 'flight';
                const isTrain = cleanMode.includes('train') || cleanMode.includes('rail');
                const isCarBus = ['car', 'bus', 'drive', 'road', 'taxi', 'rental'].some(m => cleanMode.includes(m));
                const isSea = ['cruise', 'ferry', 'boat', 'ship'].some(m => cleanMode.includes(m));

                const oCode = (t.origin || '').toUpperCase().trim();
                const dCode = (t.destination || '').toUpperCase().trim();
                const corridorId = oCode < dCode ? `${oCode}<->${dCode}` : `${dCode}<->${oCode}`;

                const p1 = `${t.originLat.toFixed(3)},${t.originLng.toFixed(3)}`;
                const p2 = `${t.destLat.toFixed(3)},${t.destLng.toFixed(3)}`;

                if (isFlight) {
                    if (!flightCorridorsMap.has(corridorId)) {
                        flightCorridorsMap.set(corridorId, {
                            id: corridorId,
                            corridorId,
                            origin: t.origin,
                            destination: t.destination,
                            originCode: oCode,
                            destCode: dCode,
                            originLat: t.originLat,
                            originLng: t.originLng,
                            destLat: t.destLat,
                            destLng: t.destLng,
                            count: 0,
                            flights: [],
                            tripId: trip.id,
                            tripName: trip.name,
                            mode: 'Flight'
                        });
                    }
                    const c = flightCorridorsMap.get(corridorId)!;
                    c.count += 1;
                    c.flights.push({ ...t, tripId: trip.id, tripName: trip.name });
                } else if (showLandSeaRoutes) {
                    // Overland / Maritime multi-modal route
                    const isTracingEnabled = showRoadTracing || activeAppearance.routeTracing !== false;
                    const isTrackable = isTrain || isCarBus || isSea;
                    const cachedCoords = (isTrackable && isTracingEnabled)
                        ? getCachedMultiModalRoute(t.mode, t.originLat, t.originLng, t.destLat, t.destLng, t.waypoints)
                        : null;

                    let path: [number, number, number][] = [];
                    let isUntraced = false;
                    if (cachedCoords && cachedCoords.length > 0) {
                        path = cachedCoords;
                    } else if (isTrackable && isTracingEnabled) {
                        const status = getMultiModalRouteStatus(t.mode, t.originLat, t.originLng, t.destLat, t.destLng, t.waypoints);
                        // While the real road/rail/sea geometry is loading (or being retried) draw nothing instead of a
                        // misleading straight chord. Only after retries are exhausted show a faint estimated corridor.
                        if (status === 'failed') {
                            path = generateSmoothRailCorridor(t.originLat, t.originLng, t.destLat, t.destLng, t.waypoints);
                            isUntraced = true;
                        }
                    } else {
                        path = generateSmoothRailCorridor(t.originLat, t.originLng, t.destLat, t.destLng, t.waypoints);
                        isUntraced = true;
                    }

                    const modeRGB: [number, number, number] = isTrain
                        ? [168, 85, 247] // Purple for Rail
                        : isCarBus
                            ? [245, 158, 11] // Amber for Road
                            : [6, 182, 212]; // Cyan for Ferry / Sea / Cruise

                    if (path.length > 0) overlandRoutes.push({
                        path,
                        color: [...modeRGB, isUntraced ? 110 : 235],
                        corridorId,
                        routeKey: `${trip.id}_${t.origin}_${t.destination}`,
                        tripId: trip.id,
                        tripName: trip.name,
                        origin: t.origin,
                        destination: t.destination,
                        provider: t.provider || t.mode,
                        identifier: t.identifier || '',
                        mode: t.mode,
                        isTrain,
                        isSea
                    });
                }

                // Airport Markers: strictly limit to verified airports (flights or recognized aerodromes)
                const parseAirportCode = (raw: string): string => {
                    if (!raw) return '';
                    const trimmed = raw.trim();
                    if (/^[A-Za-z]{3,4}$/.test(trimmed)) return trimmed.toUpperCase();
                    const parenMatch = trimmed.match(/\(([A-Za-z]{3,4})\)/);
                    if (parenMatch) return parenMatch[1].toUpperCase();
                    const words = trimmed.match(/\b([A-Za-z]{3,4})\b/g);
                    if (words) {
                        for (const w of words) {
                            const upper = w.toUpperCase();
                            if (isKnownAirport(upper)) return upper;
                        }
                    }
                    return '';
                };

                const oAirportCode = parseAirportCode(t.origin || '');
                const dAirportCode = parseAirportCode(t.destination || '');

                const isOriginAirport = isFlight || Boolean(oAirportCode && isKnownAirport(oAirportCode));
                const isDestAirport = isFlight || Boolean(dAirportCode && isKnownAirport(dAirportCode));

                const scaleFactor = activeAppearance.airportSize === 'small' ? 1.5 : activeAppearance.airportSize === 'large' ? 3.5 : 2.5;

                if (isOriginAirport) {
                    const resolvedCode = oAirportCode || (oCode.length === 3 || oCode.length === 4 ? oCode : '');
                    const metaOrigin = resolvedCode ? resolveLocationMetadata(resolvedCode, t.originLat, t.originLng) : null;
                    const origFreq = Math.max(airportFreqMap.get(p1) || 1, resolvedCode ? (airportFreqMap.get(resolvedCode) || 1) : 1);

                    if (!pointsMap.has(p1)) {
                        pointsMap.set(p1, {
                            position: [t.originLng, t.originLat, 0],
                            name: metaOrigin ? metaOrigin.name : (resolvedCode ? `${resolvedCode} Airport` : formatProperLocationName(t.origin)),
                            city: metaOrigin ? metaOrigin.city : undefined,
                            iata: resolvedCode || undefined,
                            isAirport: true,
                            tripId: trip.id,
                            color: [250, 154, 29, 255],
                            strokeColor: [255, 255, 255, 255],
                            frequency: origFreq,
                            radius: isFreqMode
                                ? Math.min(24.0, baseOriginRadius + Math.log2(Math.max(1, origFreq)) * scaleFactor)
                                : baseOriginRadius
                        });
                    }
                }

                if (isDestAirport) {
                    const resolvedCode = dAirportCode || (dCode.length === 3 || dCode.length === 4 ? dCode : '');
                    const metaDest = resolvedCode ? resolveLocationMetadata(resolvedCode, t.destLat, t.destLng) : null;
                    const destFreq = Math.max(airportFreqMap.get(p2) || 1, resolvedCode ? (airportFreqMap.get(resolvedCode) || 1) : 1);

                    if (!pointsMap.has(p2)) {
                        pointsMap.set(p2, {
                            position: [t.destLng, t.destLat, 0],
                            name: metaDest ? metaDest.name : (resolvedCode ? `${resolvedCode} Airport` : formatProperLocationName(t.destination)),
                            city: metaDest ? metaDest.city : undefined,
                            iata: resolvedCode || undefined,
                            isAirport: true,
                            tripId: trip.id,
                            color: [250, 154, 29, 255],
                            strokeColor: [255, 255, 255, 255],
                            frequency: destFreq,
                            radius: isFreqMode
                                ? Math.min(24.0, baseOriginRadius + Math.log2(Math.max(1, destFreq)) * scaleFactor)
                                : baseOriginRadius
                        });
                    }
                }
            });
        });

        // 2. Clusters logic
        const allAirports = Array.from(pointsMap.values()).filter(p => p.isAirport);
        const clusters: any[] = [];
        if (clusterMode) {
            const grid = new Map<string, any[]>();
            const gridSize = 2.0;
            allAirports.forEach(pt => {
                const gKey = `${Math.floor(pt.position[1] / gridSize)},${Math.floor(pt.position[0] / gridSize)}`;
                if (!grid.has(gKey)) grid.set(gKey, []);
                grid.get(gKey)!.push(pt);
            });

            grid.forEach(pts => {
                if (pts.length === 1) {
                    clusters.push({ ...pts[0], isCluster: false });
                } else {
                    const avgLng = pts.reduce((acc, p) => acc + p.position[0], 0) / pts.length;
                    const avgLat = pts.reduce((acc, p) => acc + p.position[1], 0) / pts.length;
                    clusters.push({
                        position: [avgLng, avgLat, 0],
                        count: pts.length,
                        name: `${pts.length} Locations Cluster`,
                        color: [37, 99, 235, 240],
                        haloColor: [59, 130, 246, 80],
                        radius: Math.min(18, 9 + Math.log2(pts.length) * 3),
                        isCluster: true
                    });
                }
            });
        }

        return {
            flightArcs: Array.from(flightCorridorsMap.values()),
            overlandSegments: overlandRoutes,
            airportPoints: allAirports,
            clusterNodes: clusters
        };
    }, [
        enrichedTrips,
        showFlightRoutes,
        showLandSeaRoutes,
        showRoadTracing,
        showFrequencyWeight,
        activeAppearance,
        clusterMode,
        osrmVersion
    ]);

    // -------------------------------------------------------------------------
    // COMET FLOW (Deck.gl TripsLayer Perpetual Animation Engine)
    // -------------------------------------------------------------------------
    const COMET_LOOP_DURATION = 1200;
    const [currentTime, setCurrentTime] = useState(COMET_LOOP_DURATION);

    useEffect(() => {
        if (!animateRoutes) return;

        let animId: number;
        let lastTime = performance.now();
        let accumulatedTime = 0;

        const loop = (now: number) => {
            const delta = now - lastTime;
            lastTime = now;
            accumulatedTime += delta * 0.25; // Smooth sweeping speed: ~4.8s per cycle
            const t = COMET_LOOP_DURATION + (accumulatedTime % COMET_LOOP_DURATION);
            setCurrentTime(t);
            animId = requestAnimationFrame(loop);
        };

        animId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(animId);
    }, [animateRoutes]);

    const animatedTripPaths = useMemo(() => {
        if (!animateRoutes) return [];

        const result: {
            path: [number, number][];
            timestamps: number[];
            color: [number, number, number, number];
            corridorId?: string;
            isTrain?: boolean;
        }[] = [];

        const getPhase = (str: string) => {
            let h = 0;
            for (let i = 0; i < str.length; i++) {
                h = (h * 31 + str.charCodeAt(i)) >>> 0;
            }
            return h % COMET_LOOP_DURATION;
        };

        // 1. Flight routes: Generate smooth Great-Circle paths using d3.geoInterpolate
        if (showFlightRoutes && viewMode !== 'scratch' && viewMode !== 'none' && flightArcs.length > 0) {
            flightArcs.forEach(arc => {
                if (!arc.originLng || !arc.destLng) return;
                try {
                    const interp = geoInterpolate([arc.originLng, arc.originLat], [arc.destLng, arc.destLat]);
                    const numPoints = 40;
                    const singlePath: [number, number][] = [];
                    for (let i = 0; i <= numPoints; i++) {
                        const [lng, lat] = interp(i / numPoints);
                        singlePath.push([lng, lat]);
                    }

                    const phase = getPhase(arc.corridorId || `${arc.originLat}_${arc.destLng}`);
                    const duration = COMET_LOOP_DURATION;

                    // Comet color follows the active appearance routeColorMode (Aurora, Heatmap, Blue)
                    let cometColor: [number, number, number, number];
                    if (selectedCorridor) {
                        if (arc.corridorId === selectedCorridor.id) {
                            cometColor = [52, 211, 153, 255]; // Emerald highlight
                        } else {
                            cometColor = [100, 115, 135, 40]; // Dimmed
                        }
                    } else if (activeAppearance.routeColorMode === 'gradient') {
                        // Aurora: follow destination geographic gradient
                        const rgb = getGeoGradientRGB(arc.destLat, arc.destLng);
                        cometColor = [rgb[0], rgb[1], rgb[2], 255];
                    } else if (activeAppearance.routeColorMode === 'frequency') {
                        // Heatmap: follow route frequency
                        const rgb = getFrequencyRGB(arc.count || 1);
                        cometColor = [rgb[0], rgb[1], rgb[2], 255];
                    } else {
                        // Blue / classic sky
                        cometColor = [56, 189, 248, 255];
                    }

                    // Dual tiled cycles for seamless perpetual wrapping without frame jumps
                    result.push({
                        path: singlePath,
                        timestamps: singlePath.map((_, i) => phase + (i / numPoints) * duration),
                        color: cometColor,
                        corridorId: arc.corridorId
                    });
                    result.push({
                        path: singlePath,
                        timestamps: singlePath.map((_, i) => phase + duration + (i / numPoints) * duration),
                        color: cometColor,
                        corridorId: arc.corridorId
                    });
                } catch {
                    // Ignore rare errors on degenerate points
                }
            });
        }

        // 2. Overland & Maritime routes: Trace multi-modal paths
        if (showLandSeaRoutes && viewMode !== 'scratch' && viewMode !== 'none' && overlandSegments.length > 0) {
            overlandSegments.forEach(seg => {
                if (!seg.path || seg.path.length < 2) return;
                const singlePath: [number, number][] = seg.path.map((p: any) => [p[0], p[1]]);
                const n = singlePath.length - 1;
                const phase = getPhase(seg.routeKey || `${seg.origin}_${seg.destination}`);
                const duration = COMET_LOOP_DURATION;

                let modeColor: [number, number, number, number];
                if (selectedCorridor) {
                    if (seg.corridorId === selectedCorridor.id) {
                        modeColor = [52, 211, 153, 255];
                    } else {
                        modeColor = [100, 115, 135, 40];
                    }
                } else if (activeAppearance.routeColorMode === 'gradient') {
                    const lastPt = singlePath[singlePath.length - 1];
                    const rgb = getGeoGradientRGB(lastPt[1], lastPt[0]);
                    modeColor = [rgb[0], rgb[1], rgb[2], 255];
                } else {
                    modeColor = seg.color
                        ? [seg.color[0], seg.color[1], seg.color[2], 255]
                        : [245, 158, 11, 255];
                }

                result.push({
                    path: singlePath,
                    timestamps: singlePath.map((_, i) => phase + (i / n) * duration),
                    color: modeColor,
                    isTrain: Boolean(seg.isTrain)
                });
                result.push({
                    path: singlePath,
                    timestamps: singlePath.map((_, i) => phase + duration + (i / n) * duration),
                    color: modeColor,
                    isTrain: Boolean(seg.isTrain)
                });
            });
        }

        return result;
    }, [animateRoutes, flightArcs, overlandSegments, showFlightRoutes, showLandSeaRoutes, viewMode, activeAppearance.routeColorMode, selectedCorridor]);

    // Handle Hover & Click interactions
    const handleRouteHover = useCallback((info: any) => {
        if (info.object) {
            setHoveredRouteKey(info.object.corridorId || info.object.routeKey);
            setHoverInfo(info);
        } else {
            setHoveredRouteKey(null);
            setHoverInfo(null);
        }
    }, []);

    const handleRouteClick = useCallback((info: any) => {
        if (info.object?.corridorId) {
            handleSelectCorridor(info.object.corridorId);
        } else if (info.object?.tripId && onTripClick) {
            onTripClick(info.object.tripId);
        }
    }, [handleSelectCorridor, onTripClick]);

    const handleSelectCorridorRef = useRef(handleSelectCorridor);
    handleSelectCorridorRef.current = handleSelectCorridor;

    const handleResetCorridorRef = useRef(handleResetCorridor);
    handleResetCorridorRef.current = handleResetCorridor;

    const onTripClickRef = useRef(onTripClick);
    onTripClickRef.current = onTripClick;

    const handleRouteHoverRef = useRef(handleRouteHover);
    handleRouteHoverRef.current = handleRouteHover;

    // Build Deck.gl Layers
    const deckLayers = useMemo(() => {
        const layers: any[] = [];
        const isElevatedActive = effectiveProjection === 'globe' && elevatedRoutes;

        // 1. Solar Twilight Shading (High-Contrast Progressive Multi-Band Gradient)
        if (!activeAppearance.airportsOnly && activeAppearance.timeOfDay && twilightData) {
            const isSatellite = currentLayer === 'satellite' || currentLayer === 'ocean';
            layers.push(
                new GeoJsonLayer({
                    id: 'solar-twilight-gradient',
                    data: twilightData,
                    filled: true,
                    stroked: false,
                    wrapLongitude: true,
                    getFillColor: (f: any) => {
                        const step = typeof f?.properties?.stepIndex === 'number' ? f.properties.stepIndex : 0;
                        // Progressive multi-band twilight shading from dusk/dawn horizon (step 0) to deep midnight (step 7)
                        // Stacking 8 concentric spherical caps creates an ultra-smooth natural penumbra with rich night contrast.
                        if (isSatellite) {
                            const alpha = Math.min(255, Math.round(32 + step * 6.5));
                            return [2, 5, 18, alpha];
                        }
                        if (isDark) {
                            const alpha = Math.min(255, Math.round(34 + step * 7.0));
                            return [2, 4, 14, alpha];
                        }
                        const alpha = Math.min(255, Math.round(28 + step * 6.0));
                        return [8, 14, 32, alpha];
                    },
                    pickable: false,
                    parameters: { blend: true, blendFunc: [770, 771] },
                    updateTriggers: {
                        getFillColor: [isDark, currentLayer]
                    }
                })
            );
        }



        // 3. Country Residence Polygons (Scratch Map)
        if (!activeAppearance.airportsOnly && geoJsonData && (showCountries || viewMode === 'scratch')) {
            const showLived = activeAppearance.showLivedCountries !== false;
            const showWishlist = activeAppearance.showWishlistCountries !== false;
            const showLayover = activeAppearance.showLayoverCountries !== false;

            layers.push(
                new GeoJsonLayer({
                    id: 'country-polygons',
                    data: geoJsonData,
                    filled: true,
                    stroked: true,
                    wrapLongitude: true,
                    getLineColor: (f: any) => {
                        const p = f.properties || {};
                        const iso2 = (p.ISO_A2 && p.ISO_A2 !== '-99' ? p.ISO_A2 : (p.ISO_A2_EH || p.wb_a2 || '')).toUpperCase();
                        const name = (p.NAME || p.NAME_LONG || '').toUpperCase();
                        const rawStatus = (iso2 && countryStatusMap?.[iso2]) || (name && countryStatusMap?.[name]);
                        const statuses: CountryResidenceStatus[] = Array.isArray(rawStatus) ? rawStatus : rawStatus ? [rawStatus] : [];

                        if (showLived && statuses.includes('lived_current')) return [16, 185, 129, 240];
                        if (showLived && statuses.includes('lived_past')) return [99, 102, 241, 240];
                        if (showLayover && statuses.includes('layover')) return [245, 158, 11, 240];
                        if (showWishlist && statuses.includes('wishlist')) return [244, 63, 94, 240];
                        return isDark ? [55, 55, 58, 170] : [210, 210, 215, 180];
                    },
                    getLineWidth: (f: any) => {
                        const p = f.properties || {};
                        const iso2 = (p.ISO_A2 && p.ISO_A2 !== '-99' ? p.ISO_A2 : (p.ISO_A2_EH || p.wb_a2 || '')).toUpperCase();
                        const name = (p.NAME || p.NAME_LONG || '').toUpperCase();
                        const rawStatus = (iso2 && countryStatusMap?.[iso2]) || (name && countryStatusMap?.[name]);
                        const statuses: CountryResidenceStatus[] = Array.isArray(rawStatus) ? rawStatus : rawStatus ? [rawStatus] : [];
                        const isSpecial = statuses.length > 0;
                        return isSpecial ? 1.4 : 0.8;
                    },
                    lineWidthUnits: 'pixels',
                    lineWidthMinPixels: 0.8,
                    getFillColor: (f: any) => {
                        const p = f.properties || {};
                        const iso2 = (p.ISO_A2 && p.ISO_A2 !== '-99' ? p.ISO_A2 : (p.ISO_A2_EH || p.wb_a2 || '')).toUpperCase();
                        const name = (p.NAME || p.NAME_LONG || '').toUpperCase();
                        const rawStatus = (iso2 && countryStatusMap?.[iso2]) || (name && countryStatusMap?.[name]);
                        const statuses: CountryResidenceStatus[] = Array.isArray(rawStatus) ? rawStatus : rawStatus ? [rawStatus] : [];

                        if (showLived && statuses.includes('lived_current')) return [16, 185, 129, 225];
                        if (showLived && statuses.includes('lived_past')) return [99, 102, 241, 225];
                        if (statuses.includes('visited')) {
                            const center = getFeatureCentroid(f);
                            const rgb = getGeoGradientRGB(center.lat, center.lng);
                            return [...rgb, viewMode === 'scratch' ? 220 : 130];
                        }
                        if (showLayover && statuses.includes('layover')) return [245, 158, 11, 140];
                        if (showWishlist && statuses.includes('wishlist')) return [244, 63, 94, 90];

                        const visited = isCountryVisited(f, visitedCountries);
                        if (visited) {
                            const center = getFeatureCentroid(f);
                            const rgb = getGeoGradientRGB(center.lat, center.lng);
                            return [...rgb, viewMode === 'scratch' ? 220 : 130];
                        }
                        return [0, 0, 0, 0];
                    },
                    pickable: true,
                    autoHighlight: viewMode === 'scratch',
                    highlightColor: [250, 154, 29, 45],
                    onHover: (info: any) => {
                        if (viewMode === 'scratch' || showCountries) {
                            setHoverInfo(info.object ? info : null);
                        }
                    },
                    onClick: (info: any) => {
                        if (info.object?.properties) {
                            setSelectedCountry(info.object);
                        }
                    },
                    updateTriggers: {
                        getFillColor: [visitedCountries, countryStatusMap, viewMode, isDark, showLived, showWishlist, showLayover],
                        getLineColor: [countryStatusMap, isDark, showLived, showWishlist, showLayover],
                        getLineWidth: [countryStatusMap, showLived, showWishlist, showLayover]
                    },
                    extensions: [globeHorizonCullExtension]
                })
            );
        }

        // 4. Scratch Map City / Place Pins
        if (!activeAppearance.airportsOnly && viewMode === 'scratch' && activeAppearance.scratchCitySize !== 'off' && visitedPlaces.length > 0) {
            layers.push(
                new ScatterplotLayer({
                    id: 'scratch-visited-places',
                    data: visitedPlaces,
                    getPosition: (d: any) => [d.lng, d.lat, 0],
                    getFillColor: [250, 154, 29, 250],
                    getLineColor: [255, 255, 255, 240],
                    getRadius: activeAppearance.scratchCitySize === 'small' ? 3.5 : activeAppearance.scratchCitySize === 'large' ? 8.5 : 5.5,
                    radiusUnits: 'pixels',
                    radiusMinPixels: 3,
                    radiusMaxPixels: 12,
                    stroked: true,
                    lineWidthUnits: 'pixels',
                    getLineWidth: 1.5,
                    wrapLongitude: true,
                    pickable: true,
                    onHover: (info: any) => info.object && setHoverInfo(info),
                    extensions: [globeHorizonCullExtension]
                })
            );
        }

        // 5. Overland & Maritime Routes (PathLayer for High-Speed Rail & Road Geometries)
        if (!activeAppearance.airportsOnly && overlandSegments.length > 0 && showLandSeaRoutes && viewMode !== 'scratch' && viewMode !== 'none') {
            layers.push(
                new PathLayer({
                    id: 'overland-routes',
                    data: overlandSegments,
                    getPath: (d: any) => d.path,
                    getColor: (d: any) => {
                        if (selectedCorridor) {
                            return d.corridorId === selectedCorridor.id ? [52, 211, 153, 255] : [100, 115, 135, 25];
                        }
                        return hoveredRouteKey === d.corridorId ? [255, 255, 255, 255] : d.color;
                    },
                    getWidth: (d: any) => {
                        if (d.isTrain || (d.mode && ((d.mode.toLowerCase().includes('train') || d.mode.toLowerCase().includes('rail'))))) {
                            return 1.0;
                        }
                        if (d.isSea || (d.mode && ['cruise', 'ferry', 'boat', 'ship'].some(m => d.mode.toLowerCase().includes(m)))) {
                            return 1.2;
                        }
                        const base = effectiveProjection === 'globe' ? 2.2 : 1.8;
                        if (selectedCorridor && d.corridorId === selectedCorridor.id) return base * 1.8;
                        return hoveredRouteKey === d.corridorId ? base + 1.0 : base;
                    },
                    widthUnits: 'pixels',
                    widthMinPixels: 1.0,
                    widthMaxPixels: 8,
                    capRounded: true,
                    jointRounded: true,
                    wrapLongitude: true,
                    parameters: {
                        cullMode: 'none',
                        cull: false,
                        depthWriteEnabled: false,
                        depthCompare: 'always',
                        depthTest: false
                    },
                    pickable: true,
                    onHover: handleRouteHover,
                    onClick: handleRouteClick,
                    updateTriggers: {
                        getColor: [hoveredRouteKey, selectedCorridor?.id],
                        getWidth: [hoveredRouteKey, selectedCorridor?.id, effectiveProjection]
                    },
                    extensions: [globeHorizonCullExtension]
                })
            );
        }

        // 6. GPU Great-Circle Flight Arcs (AirTrail Benchmark Architecture)
        if (!activeAppearance.airportsOnly && flightArcs.length > 0 && showFlightRoutes && viewMode !== 'scratch' && viewMode !== 'none') {
            // Arc height elevation: on 3D globe, elevate flight arcs gracefully above the globe curvature
            const arcHeight = effectiveProjection === 'globe'
                ? (isElevatedActive ? 0.45 : 0.32)
                : (isElevatedActive ? 0.35 : 0);

            // Visible Arc Layer
            layers.push(
                new ArcLayer({
                    id: 'flight-arcs-layer',
                    data: flightArcs,
                    getSourcePosition: (d: any) => [d.originLng, d.originLat],
                    getTargetPosition: (d: any) => [d.destLng, d.destLat],
                    greatCircle: true,
                    getHeight: arcHeight,
                    parameters: {
                        cullMode: 'none',
                        cull: false,
                        depthWriteEnabled: false,
                        depthCompare: 'always',
                        depthTest: false
                    },
                    getSourceColor: (d: any) => {
                        if (selectedCorridor) {
                            return d.corridorId === selectedCorridor.id ? [52, 211, 153, 255] : [100, 115, 135, 15];
                        }
                        if (hoveredRouteKey === d.corridorId) return [255, 255, 255, 255];
                        if (activeAppearance.routeColorMode === 'gradient') {
                            return [...getGeoGradientRGB(d.originLat, d.originLng), 255];
                        }
                        if (activeAppearance.routeColorMode === 'frequency') {
                            return [...getFrequencyRGB(d.count), 255];
                        }
                        return [56, 189, 248, 255];
                    },
                    getTargetColor: (d: any) => {
                        if (selectedCorridor) {
                            return d.corridorId === selectedCorridor.id ? [52, 211, 153, 255] : [100, 115, 135, 15];
                        }
                        if (hoveredRouteKey === d.corridorId) return [255, 255, 255, 255];
                        if (activeAppearance.routeColorMode === 'gradient') {
                            return [...getGeoGradientRGB(d.destLat, d.destLng), 255];
                        }
                        if (activeAppearance.routeColorMode === 'frequency') {
                            return [...getFrequencyRGB(d.count), 255];
                        }
                        return [56, 189, 248, 255];
                    },
                    getWidth: (d: any) => {
                        const baseStroke = effectiveProjection === 'globe'
                            ? (isWidthByFreq ? Math.min(4.8, 2.0 + Math.log2(d.count) * 0.7) : 2.2)
                            : (isWidthByFreq ? Math.min(4.5, 1.2 + Math.log2(d.count) * 0.75) : 1.5);
                        const strokeWidth = baseStroke * scaleMultiplier;
                        if (selectedCorridor && d.corridorId === selectedCorridor.id) return strokeWidth * 2.2;
                        if (hoveredRouteKey === d.corridorId) return strokeWidth + 1.5;
                        return strokeWidth;
                    },
                    widthUnits: 'pixels',
                    widthMinPixels: effectiveProjection === 'globe' ? 2.0 : 1.5,
                    widthMaxPixels: 14,
                    pickable: false, // Handled by wide ghost arc for effortless interaction
                    updateTriggers: {
                        getSourceColor: [selectedCorridor?.id, hoveredRouteKey, activeAppearance.routeColorMode],
                        getTargetColor: [selectedCorridor?.id, hoveredRouteKey, activeAppearance.routeColorMode],
                        getWidth: [selectedCorridor?.id, hoveredRouteKey, isWidthByFreq, scaleMultiplier, effectiveProjection],
                        getHeight: [arcHeight, effectiveProjection, isElevatedActive]
                    },
                    extensions: [globeHorizonCullExtension]
                })
            );

            // Wide Invisible Ghost Arc for Effortless Hover & Click Interactivity (AirTrail Pattern)
            layers.push(
                new ArcLayer({
                    id: 'flight-arcs-ghost-interaction',
                    data: flightArcs,
                    getSourcePosition: (d: any) => [d.originLng, d.originLat],
                    getTargetPosition: (d: any) => [d.destLng, d.destLat],
                    greatCircle: true,
                    getHeight: arcHeight,
                    parameters: {
                        cullMode: 'none',
                        cull: false,
                        depthWriteEnabled: false,
                        depthCompare: 'always',
                        depthTest: false
                    },
                    getSourceColor: [0, 0, 0, 0],
                    getTargetColor: [0, 0, 0, 0],
                    getWidth: 20,
                    widthUnits: 'pixels',
                    pickable: true,
                    onHover: handleRouteHover,
                    onClick: handleRouteClick,
                    updateTriggers: {
                        getHeight: [arcHeight, effectiveProjection, isElevatedActive]
                    },
                    extensions: [globeHorizonCullExtension]
                })
            );
        }

        // 6.5 Animated Comet Flow Layer (Deck.gl TripsLayer)
        if (!activeAppearance.airportsOnly && animateRoutes && animatedTripPaths.length > 0) {
            layers.push(
                new TripsLayer({
                    id: 'comet-flow-layer',
                    data: animatedTripPaths,
                    getPath: (d: any) => d.path,
                    getTimestamps: (d: any) => d.timestamps,
                    getColor: (d: any) => d.color,
                    opacity: 1,
                    widthUnits: 'pixels',
                    getWidth: (d: any) => (d.isTrain ? 1.0 : 3.5),
                    trailLength: 160,
                    currentTime: currentTime,
                    fadeTrail: true,
                    capRounded: true,
                    jointRounded: true,
                    parameters: {
                        depthWriteEnabled: false,
                        depthCompare: 'always',
                        depthTest: false
                    },
                    extensions: [globeHorizonCullExtension]
                })
            );

            // 6.6 Live Smooth Flight Motion Interpolation (Default Aircraft Beacon & Position Tracker for Comet Mode)
            const activeAircraftNodes: any[] = [];
            animatedTripPaths.forEach((trip: any, idx: number) => {
                const ts = trip.timestamps;
                const pts = trip.path;
                if (!ts || !pts || ts.length < 2) return;

                for (let i = 0; i < ts.length - 1; i++) {
                    if (currentTime >= ts[i] && currentTime <= ts[i + 1]) {
                        const ratio = (currentTime - ts[i]) / (ts[i + 1] - ts[i] || 1);
                        const lng = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * ratio;
                        const lat = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * ratio;
                        activeAircraftNodes.push({
                            id: `plane-${idx}`,
                            position: [lng, lat],
                            color: trip.color,
                            corridorId: trip.corridorId
                        });
                        break;
                    }
                }
            });

            if (activeAircraftNodes.length > 0) {
                layers.push(
                    new ScatterplotLayer({
                        id: 'interpolated-aircraft-glow',
                        data: activeAircraftNodes,
                        getPosition: (d: any) => d.position,
                        getFillColor: (d: any) => [d.color[0], d.color[1], d.color[2], 120],
                        getRadius: 7,
                        radiusUnits: 'pixels',
                        pickable: false,
                        extensions: [globeHorizonCullExtension]
                    }),
                    new ScatterplotLayer({
                        id: 'interpolated-aircraft-nodes',
                        data: activeAircraftNodes,
                        getPosition: (d: any) => d.position,
                        getFillColor: [255, 255, 255, 255],
                        getLineColor: (d: any) => [d.color[0], d.color[1], d.color[2], 255],
                        getRadius: 3.5,
                        radiusUnits: 'pixels',
                        stroked: true,
                        lineWidthUnits: 'pixels',
                        getLineWidth: 1.5,
                        pickable: true,
                        onHover: (info: any) => {
                            if (info.object) {
                                setHoveredRouteKey(info.object.corridorId || null);
                            }
                        },
                        extensions: [globeHorizonCullExtension]
                    })
                );
            }
        }

        // 7. Physical Runway Details (Rendered directly via Deck.gl on ALL basemaps)
        if (activeAppearance.airportDetail === 'detailed' && runwayDataset && activeAppearance.airportSize !== 'off') {
            const effectiveLayer = getEffectiveBasemap(currentLayer, isDark);
            const isLight = isLightEffectiveBasemap(effectiveLayer);
            const stripColor: [number, number, number, number] = isLight ? [30, 41, 59, 255] : [71, 85, 105, 255];
            const centerlineColor: [number, number, number, number] = [255, 255, 255, 240];
            const taxiwayColor: [number, number, number, number] = [245, 158, 11, 230];

            const runwayStrips: { path: [number, number, number][]; width: number }[] = [];
            const centerlineStrips: { path: [number, number, number][] }[] = [];
            const taxiwayStrips: { path: [number, number, number][] }[] = [];
            const thresholdStrips: { path: [number, number, number][] }[] = [];
            const seenAirportCodes = new Set<string>();

            // Always render physical runway geometry for all airports from user's trips
            airportPoints.forEach((pt: any) => {
                const code = pt.iata || (pt.name ? (pt.name.match(/\b([A-Z]{3,4})\b/)?.[1] || pt.name) : '');
                if (!code) return;
                const clean = code.toUpperCase().trim();
                seenAirportCodes.add(clean);
                const geom = generateAirportRunway(clean, pt.position[1], pt.position[0]);
                if (!geom) return;

                geom.runwayPaths.forEach((rw: any) => {
                    runwayStrips.push({ path: rw.stripPath, width: rw.widthMeters });
                    centerlineStrips.push({ path: rw.centerlinePath });
                });
                geom.taxiwayPaths.forEach((tw: any) => {
                    taxiwayStrips.push({ path: tw });
                });
                geom.thresholdMarkings.forEach((th: any) => {
                    thresholdStrips.push({ path: th });
                });
            });

            // If zoomed in (zoom >= 8.0), also render physical runways for visible airports in current viewport
            if (mapRef.current && currentZoom >= 8.0 && runwayDataset) {
                try {
                    const bounds = mapRef.current.getBounds();
                    const west = bounds.getWest();
                    const east = bounds.getEast();
                    const south = bounds.getSouth();
                    const north = bounds.getNorth();

                    for (const [code, rws] of Object.entries(runwayDataset)) {
                        if (seenAirportCodes.has(code) || !rws || rws.length === 0) continue;
                        const first = rws[0];
                        const lng = first.start[0];
                        const lat = first.start[1];
                        if (lng >= west && lng <= east && lat >= south && lat <= north) {
                            seenAirportCodes.add(code);
                            const geom = generateAirportRunway(code, lat, lng);
                            if (!geom) continue;
                            geom.runwayPaths.forEach((rw: any) => {
                                runwayStrips.push({ path: rw.stripPath, width: rw.widthMeters });
                                centerlineStrips.push({ path: rw.centerlinePath });
                            });
                            geom.taxiwayPaths.forEach((tw: any) => {
                                taxiwayStrips.push({ path: tw });
                            });
                            geom.thresholdMarkings.forEach((th: any) => {
                                thresholdStrips.push({ path: th });
                            });
                        }
                    }
                } catch {}
            }

            if (runwayStrips.length > 0) {
                layers.push(
                    new PathLayer({
                        id: 'deck-runway-strips',
                        data: runwayStrips,
                        getPath: (d: any) => d.path,
                        getColor: stripColor,
                        getWidth: (d: any) => Math.max(30, d.width || 45),
                        widthUnits: 'meters',
                        widthMinPixels: 2.5,
                        widthMaxPixels: 60,
                        capRounded: false,
                        jointRounded: false,
                        wrapLongitude: true,
                        pickable: false,
                        parameters: { depthTest: false },
                        extensions: [globeHorizonCullExtension]
                    }),
                    new PathLayer({
                        id: 'deck-runway-taxiways',
                        data: taxiwayStrips,
                        getPath: (d: any) => d.path,
                        getColor: taxiwayColor,
                        getWidth: 12,
                        widthUnits: 'meters',
                        widthMinPixels: 1.2,
                        widthMaxPixels: 10,
                        capRounded: true,
                        jointRounded: true,
                        wrapLongitude: true,
                        pickable: false,
                        parameters: { depthTest: false },
                        extensions: [globeHorizonCullExtension]
                    }),
                    new PathLayer({
                        id: 'deck-runway-thresholds',
                        data: thresholdStrips,
                        getPath: (d: any) => d.path,
                        getColor: centerlineColor,
                        getWidth: 8,
                        widthUnits: 'meters',
                        widthMinPixels: 1.0,
                        widthMaxPixels: 8,
                        wrapLongitude: true,
                        pickable: false,
                        parameters: { depthTest: false },
                        extensions: [globeHorizonCullExtension]
                    }),
                    new PathLayer({
                        id: 'deck-runway-centerlines',
                        data: centerlineStrips,
                        getPath: (d: any) => d.path,
                        getColor: centerlineColor,
                        getWidth: 2.5,
                        widthUnits: 'meters',
                        widthMinPixels: 0.8,
                        widthMaxPixels: 4,
                        wrapLongitude: true,
                        pickable: false,
                        parameters: { depthTest: false },
                        extensions: [globeHorizonCullExtension]
                    })
                );
            }
        }

        // 8. ALL AIRPORTS (Aviation Chart Overlay)
        // When Aviation chart's airports toggle is active, show ALL global airports worldwide (not only visited ones)
        const showAllAviationAirports = Boolean(
            activeAppearance.openAipOverlay &&
            (activeAppearance.openAipGroups ? activeAppearance.openAipGroups.includes('airports') : true)
        );
        const aviationOpacity = Math.max(0.1, Math.min(1.0, activeAppearance.openAipOpacity ?? 0.85));

        if (showAllAviationAirports) {
            const allGlobalAirports = runwayDataset ? getAllGlobalAirports(runwayDataset) : airportPoints;
            if (allGlobalAirports.length > 0) {
                layers.push(
                    new ScatterplotLayer({
                        id: 'aviation-all-airports-markers',
                        data: allGlobalAirports,
                        getPosition: (d: any) => d.position,
                        filled: true,
                        stroked: true,
                        getFillColor: [14, 165, 233, Math.round(255 * aviationOpacity)], // Sky-500 aeronautical cyan/blue
                        getLineColor: isDark ? [255, 255, 255, Math.round(220 * aviationOpacity)] : [15, 23, 42, Math.round(220 * aviationOpacity)],
                        getRadius: 4.0,
                        radiusUnits: 'pixels',
                        radiusMinPixels: 3.5,
                        radiusMaxPixels: 16,
                        lineWidthUnits: 'pixels',
                        getLineWidth: 1.5,
                        lineWidthMinPixels: 1.0,
                        wrapLongitude: true,
                        pickable: true,
                        autoHighlight: true,
                        highlightColor: [255, 255, 255, 255],
                        onHover: (info: any) => info.object && setHoverInfo(info),
                        updateTriggers: {
                            getFillColor: [aviationOpacity],
                            getLineColor: [isDark, aviationOpacity],
                        },
                        parameters: { depthTest: false },
                        extensions: [globeHorizonCullExtension]
                    }),
                    new TextLayer({
                        id: 'aviation-all-airports-labels',
                        data: allGlobalAirports,
                        getPosition: (d: any) => d.position,
                        getText: (d: any) => d.code || d.iata || d.name,
                        getSize: 10,
                        getColor: isDark ? [224, 242, 254, Math.round(255 * aviationOpacity)] : [12, 74, 110, Math.round(255 * aviationOpacity)],
                        getTextAnchor: 'start',
                        getAlignmentBaseline: 'center',
                        pixelOffset: [8, 0],
                        fontWeight: 700,
                        background: true,
                        getBackgroundColor: isDark ? [15, 23, 42, Math.round(210 * aviationOpacity)] : [240, 249, 255, Math.round(210 * aviationOpacity)],
                        backgroundPadding: [4, 2],
                        wrapLongitude: true,
                        pickable: false,
                        updateTriggers: {
                            getColor: [isDark, aviationOpacity],
                            getBackgroundColor: [isDark, aviationOpacity],
                        },
                        parameters: { depthTest: false },
                        extensions: [globeHorizonCullExtension]
                    })
                );
            }
        }

        // 9. VISITED AIRPORT HUBS (Toggled from Airports Section under Trips)
        if ((showCityMarkers || activeAppearance.airportsOnly) && activeAppearance.airportSize !== 'off') {
            if (clusterMode && clusterNodes.length > 0) {
                layers.push(
                    new ScatterplotLayer({
                        id: 'airport-cluster-halos',
                        data: clusterNodes.filter((c: any) => c.isCluster),
                        getPosition: (d: any) => d.position,
                        getFillColor: (d: any) => d.haloColor,
                        getRadius: (d: any) => d.radius * 1.5,
                        radiusUnits: 'pixels',
                        wrapLongitude: true,
                        pickable: false,
                        extensions: [globeHorizonCullExtension]
                    }),
                    new ScatterplotLayer({
                        id: 'airport-cluster-nodes',
                        data: clusterNodes,
                        getPosition: (d: any) => d.position,
                        getFillColor: (d: any) => d.color,
                        getLineColor: isDark ? [255, 255, 255, 220] : [15, 23, 42, 220],
                        getRadius: (d: any) => d.radius,
                        radiusUnits: 'pixels',
                        stroked: true,
                        lineWidthUnits: 'pixels',
                        getLineWidth: 1.5,
                        wrapLongitude: true,
                        pickable: true,
                        onHover: (info: any) => info.object && setHoverInfo(info),
                        onClick: (info: any) => info.object?.tripId && onTripClick && onTripClick(info.object.tripId),
                        extensions: [globeHorizonCullExtension]
                    }),
                    new TextLayer({
                        id: 'airport-cluster-text',
                        data: clusterNodes.filter((c: any) => c.isCluster),
                        getPosition: (d: any) => d.position,
                        getText: (d: any) => String(d.count),
                        getSize: 11,
                        getColor: [255, 255, 255, 255],
                        getTextAnchor: 'middle',
                        getAlignmentBaseline: 'center',
                        fontWeight: 'bold',
                        wrapLongitude: true,
                        pickable: false,
                        extensions: [globeHorizonCullExtension]
                    })
                );
            } else if (airportPoints.length > 0) {
                // Airport marker dots (prominent & visible at any zoom level)
                layers.push(
                    new ScatterplotLayer({
                        id: 'airport-markers',
                        data: airportPoints,
                        getPosition: (d: any) => d.position,
                        filled: true,
                        stroked: true,
                        getFillColor: (d: any) => {
                            if (selectedCorridor) {
                                const code = (d.iata || d.name || '').toUpperCase().trim();
                                if (code === selectedCorridor.originCode || code === selectedCorridor.destCode) {
                                    return [52, 211, 153, 255];
                                }
                                return isDark ? [100, 115, 135, 90] : [160, 175, 195, 90];
                            }
                            return d.color || [250, 154, 29, 255];
                        },
                        getLineColor: (d: any) => {
                            if (selectedCorridor) {
                                const code = (d.iata || d.name || '').toUpperCase().trim();
                                if (code === selectedCorridor.originCode || code === selectedCorridor.destCode) {
                                    return [255, 255, 255, 255];
                                }
                            }
                            return [255, 255, 255, 255];
                        },
                        getRadius: (d: any) => {
                            const baseRadius = activeAppearance.airportSize === 'small' ? 4.5 : activeAppearance.airportSize === 'large' ? 8.5 : 6.0;
                            let r = baseRadius;
                            if (activeAppearance.airportMode === 'frequency') {
                                const freq = d.frequency || 1;
                                const scaleFactor = activeAppearance.airportSize === 'small' ? 1.5 : activeAppearance.airportSize === 'large' ? 3.5 : 2.5;
                                r = Math.min(24, baseRadius + Math.log2(Math.max(1, freq)) * scaleFactor);
                            }
                            if (selectedCorridor) {
                                const code = (d.iata || d.name || '').toUpperCase().trim();
                                if (code === selectedCorridor.originCode || code === selectedCorridor.destCode) {
                                    return r * 1.5;
                                }
                            }
                            return r;
                        },
                        radiusUnits: 'pixels',
                        radiusMinPixels: 4.5,
                        radiusMaxPixels: 28,
                        lineWidthUnits: 'pixels',
                        getLineWidth: 2,
                        lineWidthMinPixels: 1.5,
                        wrapLongitude: true,
                        pickable: true,
                        autoHighlight: true,
                        highlightColor: [255, 255, 255, 255],
                        onHover: (info: any) => info.object && setHoverInfo(info),
                        onClick: (info: any) => info.object?.tripId && onTripClick && onTripClick(info.object.tripId),
                        parameters: { depthTest: false },
                        updateTriggers: {
                            getFillColor: [selectedCorridor?.id, isDark, activeAppearance.routeColorMode, activeAppearance.airportMode],
                            getRadius: [selectedCorridor?.id, activeAppearance.airportMode, activeAppearance.airportSize]
                        },
                        extensions: [globeHorizonCullExtension]
                    })
                );


            }
        }

        return layers;
    }, [
        activeAppearance,
        isDark,
        currentLayer,
        twilightData,
        effectiveProjection,
        elevatedRoutes,
        radarMeta,
        geoJsonData,
        showCountries,
        viewMode,
        countryStatusMap,
        visitedCountries,
        visitedPlaces,
        overlandSegments,
        flightArcs,
        showFlightRoutes,
        isWidthByFreq,
        scaleMultiplier,
        selectedCorridor,
        hoveredRouteKey,
        showCityMarkers,
        clusterMode,
        clusterNodes,
        airportPoints,
        animateRoutes,
        animatedTripPaths,
        currentTime,
        handleRouteHover,
        handleRouteClick,
        onTripClick,
        runwayDataset,
        currentZoom
    ]);

    const deckLayersRef = useRef(deckLayers);
    deckLayersRef.current = deckLayers;

    // Initialize MapLibre GL Map & MapboxOverlay Bridge
    useEffect(() => {
        if (!mapContainerRef.current) return;

        const isGlobe = effectiveProjection === 'globe';
        const isDetailedAirports = activeAppearance.airportDetail === 'detailed';
        const isOpenAipOverlay = Boolean(activeAppearance.openAipOverlay && effectiveOpenAipKey);
        const style = createMapLibreStyle(
            currentLayer,
            isDark,
            effectiveCartoKey,
            isGlobe,
            isDetailedAirports,
            isOpenAipOverlay,
            effectiveOpenAipKey,
            activeAppearance.openAipGroups
        );

        lastAppliedStyleKeyRef.current = computeStyleKey(
            currentLayer,
            isDark,
            effectiveCartoKey,
            effectiveProjection,
            activeAppearance.airportDetail || ''
        );

        const rect = mapContainerRef.current.getBoundingClientRect();
        const width = rect.width || window.innerWidth || 1200;
        const height = rect.height || window.innerHeight || 800;
        const initialCamera = calculateAdaptiveWorldCamera(width, height, sidebarCollapsed, isGlobe, isEmbedded);

        const map = new maplibregl.Map({
            container: mapContainerRef.current,
            style,
            center: initialCamera.center,
            zoom: initialCamera.zoom,
            renderWorldCopies: true,
            pitch: 0,
            bearing: 0,
            dragRotate: isGlobe,
            attributionControl: false
        });

        const setupAirportIcons = () => {
            AIRPORT_ICON_DEFINITIONS.forEach(({ id, path, pixelRatio }) => {
                if (!map.hasImage(id)) {
                    map.loadImage(path).then((res) => {
                        if (res?.data && !map.hasImage(id)) {
                            map.addImage(id, res.data, { pixelRatio });
                        }
                    }).catch(() => {});
                }
            });
        };

        map.on('styleimagemissing', (e) => {
            const id = e.id;
            const iconDef = AIRPORT_ICON_DEFINITIONS.find(def => def.id === id);
            if (iconDef && !map.hasImage(id)) {
                map.loadImage(iconDef.path).then((res) => {
                    if (res?.data && !map.hasImage(id)) {
                        map.addImage(id, res.data, { pixelRatio: iconDef.pixelRatio });
                    }
                }).catch(() => {});
                return;
            }

            if ((OPENAIP_PATTERN_IMAGES as readonly string[]).includes(id) && !map.hasImage(id)) {
                map.loadImage(`/openaip-style/patterns/${id}.svg`).then((res) => {
                    if (res?.data && !map.hasImage(id)) {
                        map.addImage(id, res.data, { pixelRatio: 2 });
                    }
                }).catch(() => {});
                return;
            }

            const cleanSymbolId = id.startsWith('dark:') ? id.replace(/^dark:/, '') : id;
            if ((OPENAIP_SYMBOL_IMAGE_IDS as readonly string[]).includes(cleanSymbolId) && !map.hasImage(id)) {
                map.loadImage(`/openaip-style/symbols/${cleanSymbolId}.svg`).then((res) => {
                    if (res?.data && !map.hasImage(id)) {
                        map.addImage(id, res.data, { pixelRatio: 2 });
                    }
                }).catch(() => {});
                return;
            }
        });

        try {
            map.setPadding(initialCamera.padding);
        } catch (e) {
            console.warn('[DeckFlightMap] initial setPadding error:', e);
        }
        map.setMinZoom(0);

        const overlay = new MapboxOverlay({
            interleaved: false,
            layers: deckLayersRef.current
        });

        // P-04a Basemap Auto-Fallback on tile failures (swaps Esri Satellite -> OSM on 2 tile errors)
        map.on('error', (e: any) => {
            if (!FEATURE_FLAGS.GEV_P04A_BASEMAP_FALLBACK) return;
            if (hasFallenBackRef.current) return;

            const effectiveLayer = getEffectiveBasemap(currentLayerRef.current, isDarkRef.current);
            if (effectiveLayer !== 'satellite') return;

            const sourceId = String(e?.sourceId || '');
            const errObj = e?.error || {};
            const errMessage = String(errObj.message || '');
            const url = String(errObj.url || '');
            const status = Number(errObj.status);

            const isSatelliteOrEsriError =
                sourceId.includes('satellite') ||
                sourceId.includes('arcgis') ||
                errMessage.includes('arcgisonline') ||
                url.includes('arcgisonline') ||
                (sourceId.startsWith('raster-basemap-source') && (status >= 400 || errMessage.toLowerCase().includes('tile')));

            if (isSatelliteOrEsriError) {
                tileFailureCountRef.current += 1;
                if (tileFailureTimerRef.current) clearTimeout(tileFailureTimerRef.current);
                tileFailureTimerRef.current = setTimeout(() => {
                    tileFailureCountRef.current = 0;
                }, 10000);

                if (tileFailureCountRef.current >= 2) {
                    hasFallenBackRef.current = true;
                    console.warn('[DeckFlightMap] Satellite tile requests failed (2 errors). Triggering auto-fallback to base map.');
                    setFallbackLayer(isDarkRef.current ? 'citylights' : 'liberty');
                    setBasemapToastMessage('Satellite unavailable — using base map');
                    setTimeout(() => {
                        setBasemapToastMessage(null);
                    }, 6000);
                }
            }
        });

        map.on('load', () => {
            isMapLoadedRef.current = true;
            setupAirportIcons();
            syncAirportOverlayOnMap(map, isDetailedAirports, isDark);
            simplifyRailroadLayers(map);
            if (isOpenAipOverlay && effectiveOpenAipKey) {
                ensureOpenAipIcons(map, isDark ? 'dark' : 'light');
                syncOpenAipOverlayOnMap(map, isOpenAipOverlay, isDark, effectiveOpenAipKey, activeAppearance.openAipGroups);
            }
            try {
                setupAirportIcons();
                if (isGlobe && (map as any).setProjection) {
                    (map as any).setProjection({ type: 'globe' });
                }
                const curRect = mapContainerRef.current?.getBoundingClientRect();
                if (curRect && curRect.width && curRect.height) {
                    const freshCam = calculateAdaptiveWorldCamera(curRect.width, curRect.height, sidebarCollapsed, isGlobe, isEmbedded);
                    try {
                        map.setPadding(freshCam.padding);
                    } catch (e) { }
                    map.setMinZoom(0);
                    map.jumpTo({
                        center: freshCam.center,
                        zoom: freshCam.zoom,
                        pitch: 0,
                        bearing: 0
                    });
                }
                map.addControl(overlay as any);
                overlay.setProps({
                    layers: deckLayersRef.current
                });
                map.triggerRepaint();
            } catch (err) {
                console.warn('[MapLibre] Load init warning:', err);
            }
        });

        // Forward MapLibre Canvas Clicks to Deck.gl overlay for instant corridor selection or click-outside to reset
        map.on('click', (e) => {
            if (!overlayRef.current) return;
            const picked = overlayRef.current.pickObject({
                x: e.point.x,
                y: e.point.y,
                radius: 16
            });
            if (picked?.object?.corridorId) {
                handleSelectCorridorRef.current(picked.object.corridorId);
            } else if (picked?.object?.tripId && onTripClickRef.current) {
                onTripClickRef.current(picked.object.tripId);
            } else {
                // If user clicks on the map outside a route, return to previous view
                if (selectedCorridorRef.current || selectedCountryRef.current) {
                    handleResetCorridorRef.current();
                }
            }
        });

        // Forward MapLibre Canvas Mousemove to Deck.gl overlay for hover tooltips (Throttled via requestAnimationFrame)
        let pickRafId: number | null = null;
        const onMouseMove = (e: any) => {
            if (!overlayRef.current) return;
            if (pickRafId !== null) return;
            const pt = { x: e.point.x, y: e.point.y };
            pickRafId = requestAnimationFrame(() => {
                pickRafId = null;
                if (!overlayRef.current || !mapRef.current) return;
                const picked = overlayRef.current.pickObject({
                    x: pt.x,
                    y: pt.y,
                    radius: 12
                });
                if (picked?.object) {
                    mapRef.current.getCanvas().style.cursor = 'pointer';
                    handleRouteHoverRef.current(picked);
                } else {
                    mapRef.current.getCanvas().style.cursor = '';
                    handleRouteHoverRef.current({ object: null });
                }
            });
        };
        map.on('mousemove', onMouseMove);

        const onZoom = () => {
            setCurrentZoom(map.getZoom());
        };
        map.on('zoom', onZoom);
        setCurrentZoom(initialCamera.zoom);

        mapRef.current = map;
        setMapInstance(map);
        overlayRef.current = overlay;

        return () => {
            map.off('zoom', onZoom);
            map.off('mousemove', onMouseMove);
            if (pickRafId !== null) {
                cancelAnimationFrame(pickRafId);
                pickRafId = null;
            }
            isMapLoadedRef.current = false;
            try {
                map.removeControl(overlay as any);
                map.remove();
            } catch (e) {
                // Ignore cleanup errors
            }
            setMapInstance(null);
            mapRef.current = null;
            overlayRef.current = null;
        };
    }, []); // Init once on mount

    // Update Deck.gl Layers efficiently without rebuilding the map
    useEffect(() => {
        deckLayersRef.current = deckLayers;
        if (overlayRef.current) {
            overlayRef.current.setProps({
                layers: deckLayers
            });
            mapRef.current?.triggerRepaint();
        }
    }, [deckLayers]);

    // Synchronize Basemap Style changes smoothly without reverting 3D Globe projection
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        const isGlobe = effectiveProjection === 'globe';
        const isDetailedAirports = activeAppearance.airportDetail === 'detailed';
        const isOpenAipOverlay = Boolean(activeAppearance.openAipOverlay && effectiveOpenAipKey);
        const effectiveLayer = getEffectiveBasemap(currentLayer, isDark);

        const nextStyleKey = computeStyleKey(
            currentLayer,
            isDark,
            effectiveCartoKey,
            effectiveProjection,
            activeAppearance.airportDetail || ''
        );

        // Avoid re-applying unchanged style or triggering setStyle during initial mount
        if (lastAppliedStyleKeyRef.current === nextStyleKey) {
            return;
        }

        const basemapSourceId = `raster-basemap-source-${effectiveLayer}`;
        const isLightBasemap = isLightEffectiveBasemap(effectiveLayer);
        const { tiles, maxzoom, attribution } = getBasemapTileConfig(effectiveLayer, effectiveCartoKey);

        // If the map style is already loaded, update the basemap raster source seamlessly in-place (unless using OFM vector styles)
        const isOfmVector = effectiveLayer === 'liberty' || effectiveLayer === 'bright' || effectiveLayer === 'positron' || effectiveLayer === 'dark' || effectiveLayer === 'fiord' || effectiveLayer === '3d';
        const prevLayer = prevEffectiveLayerRef.current;
        prevEffectiveLayerRef.current = effectiveLayer;

        if (effectiveLayer === '3d') {
            if (map.getPitch() < 20) {
                map.easeTo({ pitch: 50, duration: 800 });
            }
        } else if (prevLayer === '3d' || map.getPitch() > 5 || Math.abs(map.getBearing()) > 0.5) {
            // Unskew map when switching back from 3D to a standard basemap view
            map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
        }
        if (map.isStyleLoaded() && !isOfmVector) {
            const currentLayerObj = map.getLayer('raster-basemap-layer') as any;
            const currentSourceId = currentLayerObj?.source;

            if (currentSourceId && currentSourceId !== basemapSourceId) {
                try {
                    // 1. Update background color for 2D flat maps
                    if (map.getLayer('background-base-layer')) {
                        map.setPaintProperty('background-base-layer', 'background-color', isLightBasemap ? '#f8fafc' : '#05070f');
                    }

                    // 2. Register new raster basemap source if not already registered
                    if (!map.getSource(basemapSourceId)) {
                        map.addSource(basemapSourceId, {
                            type: 'raster',
                            tiles,
                            tileSize: 256,
                            maxzoom,
                            attribution
                        });
                    }

                    // 3. Remove old layer and replace with new layer
                    if (map.getLayer('raster-basemap-layer')) {
                        map.removeLayer('raster-basemap-layer');
                    }
                    if (currentSourceId && currentSourceId !== basemapSourceId && map.getSource(currentSourceId)) {
                        map.removeSource(currentSourceId);
                    }

                    // 4. Insert before first overlay layer so basemap stays below all overlays
                    const existingLayers = map.getStyle().layers || [];
                    const overlayLayerIds = [
                        'terrain-hillshade-layer',
                        'transit-railway-layer',
                        'rain-radar-layer',
                        'airport-overlay-taxiway-outline',
                        'airport-overlay-apron',
                        'openaip-airspaces'
                    ];
                    const firstOverlay = existingLayers.find(l => 
                        overlayLayerIds.includes(l.id) || l.id.startsWith('airport-overlay-')
                    );
                    const beforeId = firstOverlay?.id || (existingLayers.length > 0 ? existingLayers[0].id : undefined);
                    map.addLayer({
                        id: 'raster-basemap-layer',
                        type: 'raster',
                        source: basemapSourceId,
                        minzoom: 0,
                        maxzoom: 24
                    }, beforeId);

                    lastAppliedStyleKeyRef.current = nextStyleKey;
                    map.triggerRepaint();
                    return;
                } catch (e) {
                    console.warn('[DeckFlightMap] direct basemap update fallback to setStyle:', e);
                }
            }
        }

        lastAppliedStyleKeyRef.current = nextStyleKey;
        const nextStyle = createMapLibreStyle(
            currentLayer,
            isDark,
            effectiveCartoKey,
            isGlobe,
            isDetailedAirports,
            isOpenAipOverlay,
            effectiveOpenAipKey,
            activeAppearance.openAipGroups
        );
        map.setStyle(nextStyle);

        // Re-assert projection, icons, overlays, and airport vector layers on styledata across style changes
        const onStyleData = () => {
            if (!map.isStyleLoaded()) return;
            if ((map as any).setProjection) {
                try {
                    (map as any).setProjection({ type: isGlobe ? 'globe' : 'mercator' });
                } catch (e) {
                    console.warn('[DeckFlightMap] style change setProjection warning:', e);
                }
            }
            AIRPORT_ICON_DEFINITIONS.forEach(({ id, path, pixelRatio }) => {
                if (!map.hasImage(id)) {
                    map.loadImage(path).then((res) => {
                        if (res?.data && !map.hasImage(id)) {
                            map.addImage(id, res.data, { pixelRatio });
                        }
                    }).catch(() => {});
                }
            });
            syncAirportOverlayOnMap(map, isDetailedAirports, isDark);
            simplifyRailroadLayers(map);
            if (isOpenAipOverlay && effectiveOpenAipKey) {
                ensureOpenAipIcons(map, isDark ? 'dark' : 'light');
                syncOpenAipOverlayOnMap(map, isOpenAipOverlay, isDark, effectiveOpenAipKey, activeAppearance.openAipGroups);
            }
            if (overlayRef.current) {
                try {
                    if (!(map as any)._controls?.includes(overlayRef.current)) {
                        map.addControl(overlayRef.current as any);
                    }
                    overlayRef.current.setProps({ layers: deckLayersRef.current });
                    map.triggerRepaint();
                } catch (e) {
                    // Ignore
                }
            }
        };

        map.on('styledata', onStyleData);
        map.on('idle', onStyleData);
        map.on('style.load', onStyleData);
        return () => {
            map.off('styledata', onStyleData);
            map.off('idle', onStyleData);
            map.off('style.load', onStyleData);
        };
    }, [
        currentLayer,
        isDark,
        effectiveCartoKey,
        effectiveProjection,
        activeAppearance.airportDetail,
    ]);

    // When switching view modes/tabs, if not in 3D basemap mode, unskew the map back to top-down
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        const effectiveLayer = getEffectiveBasemap(currentLayer, isDark);
        if (effectiveLayer === '3d') return;
        if (map.getPitch() > 5 || Math.abs(map.getBearing()) > 0.5) {
            map.easeTo({ pitch: 0, bearing: 0, duration: 500 });
        }
    }, [viewMode, currentLayer, isDark]);

    // Synchronize airport overlay details and dark/light theme palette
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        const isDetailedAirports = activeAppearance.airportDetail === 'detailed';
        const trySync = () => {
            if (!map.isStyleLoaded()) return;
            syncAirportOverlayOnMap(map, isDetailedAirports, isDark);
            map.triggerRepaint();
        };
        trySync();
        map.on('idle', trySync);
        return () => {
            map.off('idle', trySync);
        };
    }, [activeAppearance.airportDetail, isDark]);

    // Synchronize OpenAIP vector overlays (Airports, Navaids, Reporting Points, Airspaces, Airspace Labels)
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        const isOpenAipOverlay = Boolean(activeAppearance.openAipOverlay);
        const openAipGroups = activeAppearance.openAipGroups;
        const openAipOpacity = activeAppearance.openAipOpacity ?? 0.85;

        let isCancelled = false;
        const syncOpenAip = async () => {
            if (!map.isStyleLoaded() || isCancelled) return;
            if (isOpenAipOverlay && effectiveOpenAipKey) {
                await ensureOpenAipIcons(map, isDark ? 'dark' : 'light');
            }
            if (isCancelled) return;
            syncOpenAipOverlayOnMap(map, isOpenAipOverlay, isDark, effectiveOpenAipKey, openAipGroups, openAipOpacity);
            map.triggerRepaint();
        };

        syncOpenAip();
        map.on('idle', syncOpenAip);
        return () => {
            isCancelled = true;
            map.off('idle', syncOpenAip);
        };
    }, [
        activeAppearance.openAipOverlay,
        activeAppearance.openAipOpacity,
        JSON.stringify(activeAppearance.openAipGroups),
        isDark,
        effectiveOpenAipKey
    ]);

    // Synchronize Terrain Hillshade, Transit, NOAA Clouds and Precipitation Radar directly into MapLibre GL
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        const syncRasterOverlays = () => {
            if (!map.isStyleLoaded()) return;

            // 1. Terrain Hillshade Layer (GPU-rendered dynamic hillshade via Terrarium DEM or Esri relief fallback)
            const demSourceId = 'aws-terrarium-dem-source';
            const terrainLayerId = 'terrain-hillshade-layer';
            const isTerrainEnabled = Boolean(activeAppearance.terrainHillshade);
            const rawTerrainOpacity = activeAppearance.terrainHillshadeOpacity ?? 0.8;

            const existingTerrainLayer = map.getLayer(terrainLayerId);

            if (!isTerrainEnabled) {
                if (existingTerrainLayer) map.removeLayer(terrainLayerId);
                // Also clean up legacy Esri hillshade sources if present
                ['terrain-hillshade-source-dark', 'terrain-hillshade-source-light', 'terrain-hillshade-source'].forEach(id => {
                    if (map.getSource(id)) map.removeSource(id);
                });
            } else {
                // Ensure AWS Terrarium DEM source is registered
                if (!map.getSource(demSourceId)) {
                    map.addSource(demSourceId, {
                        type: 'raster-dem',
                        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
                        encoding: 'terrarium',
                        tileSize: 256,
                        maxzoom: 15,
                        attribution: 'Mapzen / AWS Elevation Tiles'
                    });
                }

                // Shading colors tailored for high-contrast non-destructive blending:
                // Highlights soft white/sky, shadows deep ink, accent transparent tone so flat ground/water is never washed out
                const highlightColor = isDark ? '#7dd3fc' : '#ffffff';
                const shadowColor = isDark ? '#020617' : '#1e293b';
                const accentColor = isDark ? '#0f172a' : '#334155';
                const hillshadeExaggeration = Math.min(1.0, Math.max(0.1, rawTerrainOpacity * 0.75));

                if (!map.getLayer(terrainLayerId)) {
                    // Intelligently insert hillshade below water, roads, and labels so it enhances relief without washing out vector basemaps
                    const styleLayers = map.getStyle().layers || [];
                    const belowLayer = styleLayers.find(l => 
                        l.id === 'water' || 
                        l.id === 'waterway-other' || 
                        l.id === 'waterway_tunnel' || 
                        l.id.startsWith('water') || 
                        l.id.startsWith('road') || 
                        l.id.startsWith('tunnel') || 
                        l.id.startsWith('highway') ||
                        l.type === 'symbol'
                    );
                    const beforeId = belowLayer?.id || (map.getLayer('transit-railway-layer') ? 'transit-railway-layer' : undefined);

                    try {
                        map.addLayer({
                            id: terrainLayerId,
                            type: 'hillshade',
                            source: demSourceId,
                            paint: {
                                'hillshade-exaggeration': hillshadeExaggeration,
                                'hillshade-shadow-color': shadowColor,
                                'hillshade-highlight-color': highlightColor,
                                'hillshade-accent-color': accentColor,
                                'hillshade-illumination-direction': 315,
                                'hillshade-illumination-anchor': 'viewport'
                            }
                        }, beforeId);
                    } catch (err) {
                        // If hillshade layer fails for any reason, fallback to clean low-opacity raster
                        console.warn('[DeckFlightMap] Failed to add native hillshade layer, trying fallback:', err);
                    }
                } else {
                    try {
                        map.setPaintProperty(terrainLayerId, 'hillshade-exaggeration', hillshadeExaggeration);
                        map.setPaintProperty(terrainLayerId, 'hillshade-shadow-color', shadowColor);
                        map.setPaintProperty(terrainLayerId, 'hillshade-highlight-color', highlightColor);
                        map.setPaintProperty(terrainLayerId, 'hillshade-accent-color', accentColor);
                    } catch (e) {
                        // Ignore property errors if layer type transitioned
                    }
                }
            }

            // 2. Global Transit & Railway Layer (Crisp 1px Vector Hairline - Zero Glow / Halo)
            const transitSourceId = 'transit-railway-source';
            const transitLayerId = 'transit-railway-layer';
            const isTransitEnabled = Boolean(activeAppearance.transitOverlay && !activeAppearance.airportsOnly);
            const transitOpacity = activeAppearance.transitOverlayOpacity ?? 0.65;
            const railColor = isDark ? 'rgba(217, 119, 6, 0.75)' : 'rgba(180, 83, 9, 0.8)';

            const existingTransitLayer = map.getLayer(transitLayerId);
            const existingTransitSource = map.getSource(transitSourceId);

            if (!isTransitEnabled) {
                if (existingTransitLayer) map.removeLayer(transitLayerId);
                if (existingTransitSource) map.removeSource(transitSourceId);
            } else {
                // Remove legacy raster layer/source if present to upgrade to clean vector lines
                if (existingTransitSource && (existingTransitSource as any).type !== 'geojson') {
                    if (existingTransitLayer) map.removeLayer(transitLayerId);
                    map.removeSource(transitSourceId);
                }

                if (!map.getSource(transitSourceId)) {
                    map.addSource(transitSourceId, {
                        type: 'geojson',
                        data: '/data/ne_railroads.geojson',
                        attribution: 'Natural Earth Global Railroads'
                    });
                }
                if (!map.getLayer(transitLayerId)) {
                    const beforeId = map.getLayer('rain-radar-layer') 
                        ? 'rain-radar-layer' 
                        : undefined;
                    map.addLayer({
                        id: transitLayerId,
                        type: 'line',
                        source: transitSourceId,
                        paint: {
                            'line-width': 1,
                            'line-color': railColor,
                            'line-opacity': transitOpacity,
                            'line-blur': 0
                        }
                    }, beforeId);
                } else {
                    map.setPaintProperty(transitLayerId, 'line-width', 1);
                    map.setPaintProperty(transitLayerId, 'line-color', railColor);
                    map.setPaintProperty(transitLayerId, 'line-opacity', transitOpacity);
                    map.setPaintProperty(transitLayerId, 'line-blur', 0);
                }
            }

            // 3. Clean up legacy NOAA clouds layer and source if still present in style
            if (map.getLayer('noaa-clouds-layer')) {
                map.removeLayer('noaa-clouds-layer');
            }
            if (map.getSource('noaa-clouds-source')) {
                map.removeSource('noaa-clouds-source');
            }

            // 4. Global Weather Radar (RainViewer Real-time Telemetry)
            const radarSourceId = 'rain-radar-source';
            const radarLayerId = 'rain-radar-layer';
            const targetRadarTileUrl = radarMeta?.tileUrl;
            const radarAttribution = 'RainViewer';
            const isRadarEnabled = Boolean(activeAppearance.rainRadar && targetRadarTileUrl && !activeAppearance.airportsOnly);
            const radarOpacity = activeAppearance.rainRadarOpacity ?? 0.85;

            const existingRadarLayer = map.getLayer(radarLayerId);
            const existingRadarSource = map.getSource(radarSourceId) as maplibregl.RasterTileSource | undefined;

            if (!isRadarEnabled) {
                if (existingRadarLayer) map.removeLayer(radarLayerId);
                if (existingRadarSource) map.removeSource(radarSourceId);
            } else {
                const currentRadarTileUrl = existingRadarSource?.tiles?.[0];
                if (existingRadarSource && currentRadarTileUrl !== targetRadarTileUrl) {
                    if (existingRadarLayer) map.removeLayer(radarLayerId);
                    map.removeSource(radarSourceId);
                }

                if (!map.getSource(radarSourceId)) {
                    map.addSource(radarSourceId, {
                        type: 'raster',
                        tiles: [targetRadarTileUrl!],
                        tileSize: 256,
                        attribution: radarAttribution
                    });
                }

                if (!map.getLayer(radarLayerId)) {
                    const beforeId = map.getLayer('airport-overlay-taxiway-outline')
                        ? 'airport-overlay-taxiway-outline'
                        : map.getLayer('airport-overlay-apron')
                        ? 'airport-overlay-apron'
                        : undefined;
                    map.addLayer({
                        id: radarLayerId,
                        type: 'raster',
                        source: radarSourceId,
                        paint: {
                            'raster-opacity': radarOpacity
                        }
                    }, beforeId);
                } else {
                    map.setPaintProperty(radarLayerId, 'raster-opacity', radarOpacity);
                }
            }

            // 5. NASA GIBS Daily Satellite Mosaic (P-04c)
            const gibsSourceId = 'nasa-gibs-daily-source';
            const gibsLayerId = 'nasa-gibs-daily-layer';
            const isGibsDailyEnabled = Boolean(FEATURE_FLAGS.GEV_P04C_GIBS_DAILY && activeAppearance.gibsDaily);
            const gibsDate = activeAppearance.gibsDailyDate || getYesterdayDateString();
            const gibsOpacity = activeAppearance.gibsDailyOpacity ?? 0.9;
            const gibsTileUrls = ['a', 'b', 'c'].map(
                s => `https://gibs-${s}.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA21_CorrectedReflectance_TrueColor/default/${gibsDate}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`
            );

            const existingGibsLayer = map.getLayer(gibsLayerId);
            const existingGibsSource = map.getSource(gibsSourceId) as maplibregl.RasterTileSource | undefined;

            if (!isGibsDailyEnabled) {
                if (existingGibsLayer) map.removeLayer(gibsLayerId);
                if (existingGibsSource) map.removeSource(gibsSourceId);
            } else {
                const currentGibsUrl = existingGibsSource?.tiles?.[0];
                if (existingGibsSource && currentGibsUrl !== gibsTileUrls[0]) {
                    if (existingGibsLayer) map.removeLayer(gibsLayerId);
                    map.removeSource(gibsSourceId);
                }

                if (!map.getSource(gibsSourceId)) {
                    map.addSource(gibsSourceId, {
                        type: 'raster',
                        tiles: gibsTileUrls,
                        tileSize: 256,
                        maxzoom: 9,
                        attribution: 'NASA EOSDIS GIBS'
                    });
                }

                if (!map.getLayer(gibsLayerId)) {
                    const beforeId = map.getLayer('transit-railway-layer')
                        ? 'transit-railway-layer'
                        : map.getLayer('rain-radar-layer')
                        ? 'rain-radar-layer'
                        : undefined;
                    map.addLayer({
                        id: gibsLayerId,
                        type: 'raster',
                        source: gibsSourceId,
                        paint: {
                            'raster-opacity': gibsOpacity,
                            'raster-resampling': 'linear'
                        }
                    }, beforeId);
                } else {
                    map.setPaintProperty(gibsLayerId, 'raster-opacity', gibsOpacity);
                }
            }
        };

        if (map.isStyleLoaded()) {
            syncRasterOverlays();
        }

        map.on('styledata', syncRasterOverlays);
        return () => {
            map.off('styledata', syncRasterOverlays);
        };
    }, [
        activeAppearance.rainRadar, 
        activeAppearance.rainRadarOpacity, 
        activeAppearance.terrainHillshade,
        activeAppearance.terrainHillshadeOpacity,
        activeAppearance.transitOverlay,
        activeAppearance.transitOverlayOpacity,
        activeAppearance.gibsDaily,
        activeAppearance.gibsDailyDate,
        activeAppearance.gibsDailyOpacity,
        activeAppearance.airportsOnly,
        radarMeta?.tileUrl, 
        currentLayer, 
        isDark
    ]);

    // P-04d: 3D Terrain Elevation Mesh (AWS Terrarium DEM)
    const prevTerrain3dRef = useRef<boolean>(false);
    useEffect(() => {
        const effectiveLayer = getEffectiveBasemap(currentLayer, isDark);
        if (activeAppearance.terrain3d && !prevTerrain3dRef.current && FEATURE_FLAGS.GEV_P04D_TERRAIN) {
            const map = mapRef.current;
            if (map && map.getPitch() < 15) {
                map.easeTo({ pitch: 45, duration: 800 });
            }
        } else if (!activeAppearance.terrain3d && prevTerrain3dRef.current && effectiveLayer !== '3d') {
            const map = mapRef.current;
            if (map && (map.getPitch() > 5 || Math.abs(map.getBearing()) > 0.5)) {
                map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
            }
        }
        prevTerrain3dRef.current = Boolean(activeAppearance.terrain3d);
    }, [activeAppearance.terrain3d, currentLayer, isDark]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !(map as any).setTerrain) return;

        const syncTerrain = () => {
            if (!map.isStyleLoaded()) return;

            const isTerrain3dEnabled = Boolean(FEATURE_FLAGS.GEV_P04D_TERRAIN && activeAppearance.terrain3d);
            const exaggeration = activeAppearance.terrain3dExaggeration ?? 1.0;
            const terrainSourceId = 'aws-terrarium-dem-source';

            try {
                if (isTerrain3dEnabled) {
                    if (!map.getSource(terrainSourceId)) {
                        map.addSource(terrainSourceId, {
                            type: 'raster-dem',
                            tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
                            encoding: 'terrarium',
                            tileSize: 256,
                            maxzoom: 15,
                            attribution: 'Mapzen / AWS Elevation Tiles'
                        });
                    }
                    (map as any).setTerrain({
                        source: terrainSourceId,
                        exaggeration: exaggeration
                    });
                } else {
                    if ((map as any).getTerrain?.()) {
                        (map as any).setTerrain(null);
                    }
                    if (map.getSource(terrainSourceId)) {
                        map.removeSource(terrainSourceId);
                    }
                }
            } catch (err) {
                console.warn('[DeckFlightMap] Failed to sync 3D terrain:', err);
            }
        };

        if (map.isStyleLoaded()) {
            syncTerrain();
        }

        map.on('styledata', syncTerrain);
        return () => {
            map.off('styledata', syncTerrain);
        };
    }, [activeAppearance.terrain3d, activeAppearance.terrain3dExaggeration, currentLayer]);

    const prevProjectionRef = useRef<string>(effectiveProjection);

    // Synchronize Projection dynamically (Flat Mercator vs 3D Globe)
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !(map as any).setProjection) return;
        if (prevProjectionRef.current === effectiveProjection) return;
        prevProjectionRef.current = effectiveProjection;

        const isGlobe = effectiveProjection === 'globe';
        const applyProj = () => {
            try {
                (map as any).setProjection({ type: isGlobe ? 'globe' : 'mercator' });
                const rect = mapContainerRef.current?.getBoundingClientRect();
                const width = rect?.width || window.innerWidth || 1200;
                const height = rect?.height || window.innerHeight || 800;
                const cam = calculateAdaptiveWorldCamera(width, height, sidebarCollapsed, isGlobe, isEmbedded);
                try {
                    map.setPadding(cam.padding);
                } catch (e) { }
                map.setMinZoom(0);
                const effectiveLayer = getEffectiveBasemap(currentLayer, isDark);
                map.easeTo({
                    center: cam.center,
                    zoom: cam.zoom,
                    pitch: effectiveLayer === '3d' ? 50 : 0,
                    bearing: 0,
                    duration: 600
                });
            } catch (e) {
                console.warn('[MapLibre] setProjection warning:', e);
            }
        };

        if (map.isStyleLoaded()) {
            applyProj();
        } else {
            map.once('load', applyProj);
        }
    }, [effectiveProjection, sidebarCollapsed, isEmbedded]);

    // Adaptive camera & padding synchronization on resize or sidebar collapse/expansion
    useEffect(() => {
        const map = mapRef.current;
        const container = mapContainerRef.current;
        if (!map || !container) return;

        const updateAdaptiveCamera = () => {
            if (!mapRef.current || !mapContainerRef.current) return;
            const rect = mapContainerRef.current.getBoundingClientRect();
            if (!rect.width || !rect.height) return;

            const isGlobe = effectiveProjection === 'globe';
            const cam = calculateAdaptiveWorldCamera(rect.width, rect.height, sidebarCollapsed, isGlobe, isEmbedded);

            try {
                mapRef.current.setPadding(cam.padding);
            } catch (e) { }
            mapRef.current.setMinZoom(0);

            // Only adapt zoom/center if user is not currently inspecting a corridor or country
            if (!selectedCorridor && !selectedCountry) {
                mapRef.current.easeTo({
                    center: cam.center,
                    zoom: cam.zoom,
                    duration: 350,
                    essential: true
                });
            }
        };

        const resizeObserver = new ResizeObserver(() => {
            map.resize();
            updateAdaptiveCamera();
        });
        resizeObserver.observe(container);

        // Immediate update when sidebar or embedded state changes
        updateAdaptiveCamera();

        return () => {
            resizeObserver.disconnect();
        };
    }, [sidebarCollapsed, isEmbedded, effectiveProjection, selectedCorridor, selectedCountry]);

    // Navigation Controls Handlers
    const handleZoomIn = () => {
        mapRef.current?.zoomIn({ duration: 300 });
    };

    const handleZoomOut = () => {
        mapRef.current?.zoomOut({ duration: 300 });
    };

    const handleReset100 = () => {
        if (!mapRef.current || !mapContainerRef.current) return;
        const rect = mapContainerRef.current.getBoundingClientRect();
        const width = rect.width || window.innerWidth || 1200;
        const height = rect.height || window.innerHeight || 800;
        const isGlobe = effectiveProjection === 'globe';
        const cam = calculateAdaptiveWorldCamera(width, height, sidebarCollapsed, isGlobe, isEmbedded);

        try {
            mapRef.current.setPadding(cam.padding);
        } catch (e) { }
        mapRef.current.flyTo({
            center: cam.center,
            zoom: cam.zoom,
            pitch: 0,
            bearing: 0,
            duration: 600,
            essential: true
        });
    };

    const handleFitBounds = () => {
        if (!mapRef.current) return;
        let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
        let hasCoords = false;

        enrichedTrips.forEach(trip => {
            trip.transports?.forEach(t => {
                if (t.originLat && t.originLng && !isNaN(t.originLat) && !isNaN(t.originLng)) {
                    minLat = Math.min(minLat, t.originLat);
                    maxLat = Math.max(maxLat, t.originLat);
                    minLng = Math.min(minLng, t.originLng);
                    maxLng = Math.max(maxLng, t.originLng);
                    hasCoords = true;
                }
                if (t.destLat && t.destLng && !isNaN(t.destLat) && !isNaN(t.destLng)) {
                    minLat = Math.min(minLat, t.destLat);
                    maxLat = Math.max(maxLat, t.destLat);
                    minLng = Math.min(minLng, t.destLng);
                    maxLng = Math.max(maxLng, t.destLng);
                    hasCoords = true;
                }
            });
        });

        if (hasCoords) {
            const rect = mapContainerRef.current?.getBoundingClientRect();
            const width = rect?.width || window.innerWidth || 1200;
            const height = rect?.height || window.innerHeight || 800;
            const padding = getMapContentPadding(sidebarCollapsed, width, height, isEmbedded);

            if (effectiveProjection === 'globe') {
                mapRef.current.flyTo({
                    center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2],
                    zoom: 1.1,
                    duration: 800,
                    essential: true
                });
            } else {
                mapRef.current.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
                    padding: {
                        top: padding.top + 30,
                        left: padding.left + 30,
                        right: padding.right + 30,
                        bottom: padding.bottom + 30,
                    },
                    maxZoom: 5,
                    duration: 800
                });
            }
        } else {
            handleReset100();
        }
    };

    const handleToggleAtmosphere = () => {
        const nextAtmosphere = activeAppearance.atmosphere === false ? true : false;
        const nextAppearance: MapAppearanceSettings = {
            ...activeAppearance,
            atmosphere: nextAtmosphere
        };
        saveMapAppearanceSettings(nextAppearance);
        setLocalAppearance(nextAppearance);
        if (onChangeAppearanceSettings) {
            onChangeAppearanceSettings(nextAppearance);
        }
    };

    return (
        <div className={`relative w-full h-full overflow-hidden select-none ${effectiveProjection === 'globe' ? (isDark ? 'bg-[#010206]' : 'bg-[#f8fafc]') : (isDark ? 'bg-black' : 'bg-white')}`}>
            {/* Atmospheric & Rotating Celestial Deep Space Canvas */}
            <GlobeAtmosphericBackground
                map={mapInstance || mapRef.current}
                isGlobe={effectiveProjection === 'globe'}
                enabled={activeAppearance.atmosphere !== false}
                isDark={isDark}
                basemap={currentLayer}
            />

            {/* MapLibre GL 60 FPS Canvas with Interleaved Deck.gl Engine */}
            <div ref={mapContainerRef} className="w-full h-full relative z-10 transition-opacity duration-300 ease-out" />

            {/* P-04a Basemap Fallback Toast (One toast per outage, liquid glass styling) */}
            <AnimatePresence>
                {basemapToastMessage && (
                    <motion.div
                        initial={{ opacity: 0, y: -20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -20, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="fixed top-4 left-1/2 -translate-x-1/2 z-toast pointer-events-auto"
                    >
                        <GlassPanel
                            padding="0px"
                            overrides={{ borderRadius: 999 }}
                            className="wg-glass-pill flex items-center gap-2.5 px-4 py-2 bg-amber-500/15 dark:bg-amber-950/40 border border-amber-500/30 text-amber-700 dark:text-amber-300 shadow-xl text-xs font-semibold select-none"
                        >
                            <Warning size={18} weight="bold" className="text-amber-500 shrink-0" />
                            <span>{basemapToastMessage}</span>
                            <button
                                type="button"
                                onClick={() => setBasemapToastMessage(null)}
                                className="ml-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-amber-600 dark:text-amber-400 cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
                                aria-label="Dismiss basemap notification"
                            >
                                <X size={14} weight="bold" />
                            </button>
                        </GlassPanel>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* P-04c NASA GIBS Recent Satellite Daily Date Stepper Pill */}
            {FEATURE_FLAGS.GEV_P04C_GIBS_DAILY && activeAppearance.gibsDaily && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-auto animate-fade-in">
                    <GlassPanel
                        padding="2px"
                        overrides={{ borderRadius: 999 }}
                        className="wg-glass-pill shadow-glass-modal flex items-center gap-1.5 px-3 py-1 bg-white/70 dark:bg-white/10 text-xs font-semibold"
                    >
                        <div className="flex items-center gap-1.5 text-emerald-500 font-bold pr-1 border-r border-black/10 dark:border-white/10">
                            <Globe className="w-3.5 h-3.5" weight="bold" />
                            <span className="hidden sm:inline">NASA GIBS</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                const cur = activeAppearance.gibsDailyDate || getYesterdayDateString();
                                handleAppearanceChange({
                                    ...activeAppearance,
                                    gibsDailyDate: adjustDateString(cur, -1)
                                });
                            }}
                            className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-light-text dark:text-dark-text transition-colors cursor-pointer"
                            title="Previous Day"
                            aria-label="Previous day"
                        >
                            <CaretLeft size={16} weight="bold" />
                        </button>
                        <span className="px-2 font-mono font-bold text-xs text-light-text dark:text-dark-text tracking-wide select-none">
                            {activeAppearance.gibsDailyDate || getYesterdayDateString()}
                        </span>
                        <button
                            type="button"
                            onClick={() => {
                                const cur = activeAppearance.gibsDailyDate || getYesterdayDateString();
                                const yesterday = getYesterdayDateString();
                                if (cur < yesterday) {
                                    handleAppearanceChange({
                                        ...activeAppearance,
                                        gibsDailyDate: adjustDateString(cur, 1)
                                    });
                                }
                            }}
                            disabled={(activeAppearance.gibsDailyDate || getYesterdayDateString()) >= getYesterdayDateString()}
                            className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-light-text dark:text-dark-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                            title="Next Day"
                            aria-label="Next day"
                        >
                            <ChevronRight size={16} weight="bold" />
                        </button>
                        <button
                            type="button"
                            onClick={() => handleAppearanceChange({ ...activeAppearance, gibsDaily: false })}
                            className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-light-text-secondary dark:text-dark-text-secondary transition-colors cursor-pointer ml-0.5"
                            title="Close NASA GIBS Overlay"
                            aria-label="Close NASA GIBS Overlay"
                        >
                            <X size={14} weight="bold" />
                        </button>
                    </GlassPanel>
                </div>
            )}

            {/* Top-Right Floating "Mission Control" Quick Config Pill (hidden when delegated to parent view) */}
            {!onOpenMissionControl && (
                <div className="absolute top-3 right-3 z-20 pointer-events-auto animate-fade-in">
                    <GlassPanel
                        padding="2px"
                        overrides={{ borderRadius: 999 }}
                        className="wg-glass-pill shadow-glass-modal"
                    >
                        <button
                            onClick={() => setIsAppearanceModalOpen(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer text-xs font-bold text-light-text dark:text-dark-text hover:text-primary-500 dark:hover:text-primary-400 transition-colors active:scale-95 rounded-full"
                            title={MAP_SETTINGS_LABELS.panelTitle}
                            aria-label={MAP_SETTINGS_LABELS.panelTitle}
                        >
                            <SlidersHorizontal className="w-3.5 h-3.5 text-primary-500" weight="bold" />
                            <span className="hidden sm:inline">{MAP_SETTINGS_LABELS.panelTitle}</span>
                        </button>
                    </GlassPanel>
                </div>
            )}

            {/* Zoom & View Navigation Controls with Liquid Glass (Bottom Left) */}
            <div className={`absolute bottom-3 md:bottom-6 z-20 flex flex-col gap-2 pointer-events-auto transition-all duration-300 ${isEmbedded ? 'left-3' : (sidebarCollapsed ? 'left-3 md:left-28' : 'left-3 md:left-80')}`}>
                <GlassPanel
                    padding="0px"
                    overrides={{ borderRadius: 20 }}
                    className="wg-glass-pill overflow-hidden shadow-glass-card"
                >
                    <div className="flex flex-col divide-y divide-black/10 dark:divide-white/10">
                        <button
                            onClick={handleZoomIn}
                            className="w-10 h-10 flex items-center justify-center text-light-text dark:text-dark-text hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer font-bold text-lg transition-colors active:scale-95"
                            title="Zoom In (+)"
                        >
                            +
                        </button>
                        <button
                            onClick={handleZoomOut}
                            className="w-10 h-10 flex items-center justify-center text-light-text dark:text-dark-text hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer font-bold text-lg transition-colors active:scale-95"
                            title="Zoom Out (−)"
                        >
                            −
                        </button>
                        <button
                            onClick={handleReset100}
                            className="w-10 h-10 flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer font-bold text-xs tracking-tight transition-colors active:scale-95"
                            title="100% Standard View"
                        >
                            100%
                        </button>
                        <button
                            onClick={handleFitBounds}
                            className="w-10 h-10 flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer transition-colors active:scale-95"
                            title="Fit View to All Routes"
                        >
                            <Scan className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => (onOpenMissionControl ? onOpenMissionControl() : setIsAppearanceModalOpen(true))}
                            className="w-10 h-10 flex items-center justify-center text-primary-500 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer transition-colors active:scale-95"
                            title="Mission Control: Basemaps, Flights, Radar & Telemetry Settings"
                            aria-label="Open Mission Control"
                        >
                            <SlidersHorizontal className="w-4 h-4" weight="bold" />
                        </button>
                        {effectiveProjection === 'globe' && (
                            <button
                                onClick={handleToggleAtmosphere}
                                className={`w-10 h-10 flex items-center justify-center cursor-pointer transition-colors active:scale-95 ${activeAppearance.atmosphere !== false
                                        ? 'text-sky-500 dark:text-sky-400 bg-sky-500/10 dark:bg-sky-400/10'
                                        : 'text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text hover:bg-black/5 dark:hover:bg-white/10'
                                    }`}
                                title={activeAppearance.atmosphere !== false ? 'Atmosphere & Stars: On (Click to turn off)' : 'Atmosphere & Stars: Off (Click to turn on)'}
                                aria-label="Toggle celestial atmosphere"
                            >
                                <Sparkle className="w-4 h-4" weight={activeAppearance.atmosphere !== false ? 'fill' : 'regular'} />
                            </button>
                        )}
                    </div>
                </GlassPanel>
            </div>

            {/* P-07: Dynamic Data Credits Popover (Bottom Right) */}
            <div className="absolute bottom-3 right-3 md:bottom-6 md:right-6 z-20 pointer-events-auto">
                <DataCreditsPopover
                    currentBasemap={currentLayer}
                    activeAppearance={activeAppearance}
                />
            </div>

            {/* Top-Center Floating "Back to previous view" Button with Liquid Glass (Positioned just below Tab Selector) */}
            {selectedCorridor && (
                <div className="absolute top-[74px] left-1/2 -translate-x-1/2 z-30 pointer-events-auto animate-fade-in">
                    <GlassPanel
                        padding="6px 14px"
                        overrides={{ borderRadius: 999 }}
                        className="wg-glass-pill shadow-glass-modal"
                    >
                        <button
                            onClick={handleResetCorridor}
                            className="flex items-center gap-2 cursor-pointer text-xs font-bold text-light-text dark:text-dark-text group active:scale-95"
                        >
                            <ArrowLeft className="w-3.5 h-3.5 text-primary-500 group-hover:-translate-x-0.5 transition-transform" />
                            <span>Back to previous view</span>
                        </button>
                    </GlassPanel>
                </div>
            )}

            {/* Left Scratch Map Country Inspector & Labeling Card */}
            {selectedCountry && (
                <div
                    className={`absolute top-5 z-30 w-80 max-h-[calc(100%-2.5rem)] flex flex-col rounded-3xl bg-white/95 dark:bg-dark-card/95 backdrop-blur-sm border border-black/10 dark:border-white/15 shadow-glass-modal overflow-hidden text-light-text dark:text-dark-text animate-fade-in transition-all duration-300 ${isEmbedded ? 'left-3 max-w-[calc(100%-1.5rem)]' : (sidebarCollapsed ? 'left-5 md:left-28' : 'left-5 md:left-80')}`}
                    style={{ WebkitBackdropFilter: 'blur(4px)' }}
                >
                    {(() => {
                        const p = selectedCountry.properties || {};
                        const name = p.NAME || p.NAME_LONG || p.ADMIN || p.SOVEREIGNT || 'Country';
                        const iso2 = (p.ISO_A2 && p.ISO_A2 !== '-99' ? p.ISO_A2 : (p.ISO_A2_EH || p.wb_a2 || '')).toUpperCase();
                        const isVisited = isCountryVisited(selectedCountry, visitedCountries);
                        const rawStatus = (iso2 && countryStatusMap?.[iso2]) || (name && countryStatusMap?.[name.toUpperCase()]);
                        const currentStatuses: CountryResidenceStatus[] = Array.isArray(rawStatus)
                            ? rawStatus
                            : rawStatus
                                ? [rawStatus]
                                : isVisited
                                    ? ['visited']
                                    : [];
                        const flag = iso2 ? getFlagEmoji(iso2) : '🏳️';
                        const region = p.REGION_UN || p.SUBREGION || p.CONTINENT || (iso2 ? getRegion(iso2) : '');

                        return (
                            <>
                                <div className="p-4 pb-3 flex items-center justify-between border-b border-black/5 dark:border-white/10 bg-gradient-to-r from-primary-500/5 to-transparent shrink-0">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <span className="text-2xl leading-none">{flag}</span>
                                        <div className="min-w-0">
                                            <h3 className="text-sm font-bold text-light-text dark:text-dark-text tracking-tight truncate">{name}</h3>
                                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate">{region || 'Territory'}</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedCountry(null)}
                                        className="p-1.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text transition-all cursor-pointer"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar flex-1">
                                    <div className="p-3 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 flex items-center justify-between flex-wrap gap-2">
                                        <span className="text-2xs uppercase font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider">Classification</span>
                                        <div className="flex flex-wrap items-center gap-1.5 justify-end">
                                            {currentStatuses.includes('lived_current') && (
                                                <span className="px-2.5 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                                    🏠 Current Residence
                                                </span>
                                            )}
                                            {currentStatuses.includes('lived_past') && (
                                                <span className="px-2.5 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 flex items-center gap-1">
                                                    🏛️ Past Residence
                                                </span>
                                            )}
                                            {currentStatuses.includes('visited') && (
                                                <span className="px-2.5 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-primary-500/15 text-primary-600 dark:text-primary-400 border border-primary-500/30 flex items-center gap-1">
                                                    ✨ Explored
                                                </span>
                                            )}
                                            {currentStatuses.includes('layover') && (
                                                <span className="px-2.5 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
                                                    🛫 Layover
                                                </span>
                                            )}
                                            {currentStatuses.includes('wishlist') && (
                                                <span className="px-2.5 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center gap-1">
                                                    🌟 Wish List
                                                </span>
                                            )}
                                            {currentStatuses.length === 0 && !isVisited && (
                                                <span className="px-2.5 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-black/5 dark:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary border border-black/10 dark:border-white/10">
                                                    🧭 Unexplored
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="block text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                                                Residence & Classification Tag
                                            </label>
                                            <span className="text-2xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
                                                {currentStatuses.includes('wishlist') || currentStatuses.includes('layover')
                                                    ? 'Wishlist & Layover combine'
                                                    : 'Visited & Past Home combine'}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-1 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const next = toggleCountryResidenceStatus(currentStatuses, 'lived_current');
                                                    onUpdateCountryStatus?.(iso2, name, next.length > 0 ? next : 'none');
                                                }}
                                                className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between cursor-pointer transition-all duration-150 active:scale-[0.98] ${currentStatuses.includes('lived_current')
                                                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold shadow-sm'
                                                        : 'bg-white/60 dark:bg-dark-card/60 border-black/5 dark:border-white/10 hover:border-black/15 text-light-text dark:text-dark-text'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <span className="text-lg">🏠</span>
                                                    <div>
                                                        <p className="text-xs font-bold">Currently Live Here</p>
                                                        <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary">Active home / residence</p>
                                                    </div>
                                                </div>
                                                {currentStatuses.includes('lived_current') && <span className="text-xs font-bold text-emerald-500">✓</span>}
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const next = toggleCountryResidenceStatus(currentStatuses, 'lived_past');
                                                    onUpdateCountryStatus?.(iso2, name, next.length > 0 ? next : 'none');
                                                }}
                                                className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between cursor-pointer transition-all duration-150 active:scale-[0.98] ${currentStatuses.includes('lived_past')
                                                        ? 'bg-indigo-500/15 border-indigo-500 text-indigo-600 dark:text-indigo-400 font-bold shadow-sm'
                                                        : 'bg-white/60 dark:bg-dark-card/60 border-black/5 dark:border-white/10 hover:border-black/15 text-light-text dark:text-dark-text'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <span className="text-lg">🏛️</span>
                                                    <div>
                                                        <p className="text-xs font-bold">Lived Here in the Past</p>
                                                        <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary">Former home / study / work</p>
                                                    </div>
                                                </div>
                                                {currentStatuses.includes('lived_past') && <span className="text-xs font-bold text-indigo-500">✓</span>}
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const next = toggleCountryResidenceStatus(currentStatuses, 'visited');
                                                    onUpdateCountryStatus?.(iso2, name, next.length > 0 ? next : 'none');
                                                }}
                                                className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between cursor-pointer transition-all duration-150 active:scale-[0.98] ${currentStatuses.includes('visited')
                                                        ? 'bg-primary-500/15 border-primary-500 text-primary-600 dark:text-primary-400 font-bold shadow-sm'
                                                        : 'bg-white/60 dark:bg-dark-card/60 border-black/5 dark:border-white/10 hover:border-black/15 text-light-text dark:text-dark-text'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <span className="text-lg">✈️</span>
                                                    <div>
                                                        <p className="text-xs font-bold">Visited / Explored</p>
                                                        <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary">Destination stay / trip</p>
                                                    </div>
                                                </div>
                                                {currentStatuses.includes('visited') && <span className="text-xs font-bold text-primary-500">✓</span>}
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const next = toggleCountryResidenceStatus(currentStatuses, 'layover');
                                                    onUpdateCountryStatus?.(iso2, name, next.length > 0 ? next : 'none');
                                                }}
                                                className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between cursor-pointer transition-all duration-150 active:scale-[0.98] ${currentStatuses.includes('layover')
                                                        ? 'bg-amber-500/15 border-amber-500 text-amber-600 dark:text-amber-400 font-bold shadow-sm'
                                                        : 'bg-white/60 dark:bg-dark-card/60 border-black/5 dark:border-white/10 hover:border-black/15 text-light-text dark:text-dark-text'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <span className="text-lg">🛫</span>
                                                    <div>
                                                        <p className="text-xs font-bold">Layover Only (Transit)</p>
                                                        <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary">Airport connection / transfer</p>
                                                    </div>
                                                </div>
                                                {currentStatuses.includes('layover') && <span className="text-xs font-bold text-amber-500">✓</span>}
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const next = toggleCountryResidenceStatus(currentStatuses, 'wishlist');
                                                    onUpdateCountryStatus?.(iso2, name, next.length > 0 ? next : 'none');
                                                }}
                                                className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between cursor-pointer transition-all duration-150 active:scale-[0.98] ${currentStatuses.includes('wishlist')
                                                        ? 'bg-rose-500/15 border-rose-500 text-rose-600 dark:text-rose-400 font-bold shadow-sm'
                                                        : 'bg-white/60 dark:bg-dark-card/60 border-black/5 dark:border-white/10 hover:border-black/15 text-light-text dark:text-dark-text'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <span className="text-lg">🌟</span>
                                                    <div>
                                                        <p className="text-xs font-bold">Wish List Destination</p>
                                                        <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary">Dream expedition target</p>
                                                    </div>
                                                </div>
                                                {currentStatuses.includes('wishlist') && <span className="text-xs font-bold text-rose-500">✓</span>}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </>
                        );
                    })()}
                </div>
            )}

            {/* AirTrail Style Route Corridor Inspector Card with Liquid Glass */}
            {selectedCorridor && (() => {
                const summary = getRouteTransportSummary(selectedCorridor);
                return (
                    <div
                        className={`absolute top-20 z-30 w-[360px] sm:w-[380px] max-h-[calc(100vh-6rem)] flex flex-col animate-airtrail-slide-in pointer-events-auto transition-all duration-300 ${isEmbedded ? 'left-3 max-w-[calc(100%-1.5rem)]' : (sidebarCollapsed ? 'left-5 md:left-28' : 'left-5 md:left-80')}`}
                    >
                        <GlassPanel
                            className="wg-glass-card w-full max-h-[calc(100vh-6.5rem)] flex flex-col shadow-2xl relative"
                            padding="18px"
                            overrides={{ borderRadius: 28 }}
                        >
                            {/* Top Header Bar with Colored Title & Prominent Close Button */}
                            <div className="flex items-center justify-between pb-3 mb-2.5 border-b border-black/5 dark:border-white/10 shrink-0">
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-primary-500 shadow-sm shadow-primary-500/50" />
                                    <span className="text-xs font-extrabold uppercase tracking-wider text-primary-600 dark:text-primary-400">
                                        Route
                                    </span>
                                    <span className="px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-1">
                                        {renderRouteModeIcon(summary.primaryMode, "w-3 h-3 text-primary-500")}
                                        <span>{summary.singleActivityLabel.toUpperCase()}</span>
                                    </span>
                                </div>
                                <button
                                    onClick={handleResetCorridor}
                                    className="w-8 h-8 wg-touch-target rounded-xl flex items-center justify-center text-gray-700 hover:text-gray-950 dark:text-gray-200 dark:hover:text-white bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20 border border-black/10 dark:border-white/15 transition-all cursor-pointer shrink-0 shadow-xs active:scale-95"
                                    aria-label="Close route details"
                                    title="Close route details"
                                >
                                    <X className="w-4 h-4 stroke-[2.5]" />
                                </button>
                            </div>

                            {/* Scrollable Container */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar -mr-1 pr-1">
                                {/* Origin Block */}
                                {(() => {
                                    const originTime = getApproxLocalTime(selectedCorridor.originCoords[0]);
                                    const originFormatted = formatProperLocationName(selectedCorridor.originCode);
                                    let originDisplay = formatAirportCityDotName(selectedCorridor.originName, selectedCorridor.originCity);
                                    if (originDisplay.toLowerCase() === originFormatted.toLowerCase()) {
                                        originDisplay = (selectedCorridor.originCountry && selectedCorridor.originCountry !== 'Global' && !originFormatted.toLowerCase().includes(selectedCorridor.originCountry.toLowerCase()))
                                            ? selectedCorridor.originCountry
                                            : '';
                                    }
                                    return (
                                        <div className="space-y-1">
                                            {originDisplay && (
                                                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium truncate block">
                                                    {originDisplay}
                                                </span>
                                            )}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-2xl leading-none shrink-0">{selectedCorridor.originFlag}</span>
                                                    <span className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white font-sans">
                                                        {originFormatted}
                                                    </span>
                                                    <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 ml-0.5" />
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white block font-sans">
                                                        {originTime.timeStr}
                                                    </span>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400 font-medium block">
                                                        {originTime.dateStr} · {originTime.utcOffsetStr}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Middle Hairline Distance & Relative Time Indicator */}
                                <div className="flex items-center gap-2.5 my-3">
                                    <div className="flex-1 h-px bg-gray-200 dark:bg-zinc-800" />
                                    <span className="text-2xs text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap">
                                        {selectedCorridor.distanceKm.toLocaleString()} km · {getRelativeTimeDiffString(selectedCorridor.originCoords[0], selectedCorridor.destCoords[0], selectedCorridor.destCode)}
                                    </span>
                                    <div className="flex-1 h-px bg-gray-200 dark:bg-zinc-800" />
                                </div>

                                {/* Destination Block */}
                                {(() => {
                                    const destTime = getApproxLocalTime(selectedCorridor.destCoords[0]);
                                    const destFormatted = formatProperLocationName(selectedCorridor.destCode);
                                    let destDisplay = formatAirportCityDotName(selectedCorridor.destName, selectedCorridor.destCity);
                                    if (destDisplay.toLowerCase() === destFormatted.toLowerCase()) {
                                        destDisplay = (selectedCorridor.destCountry && selectedCorridor.destCountry !== 'Global' && !destFormatted.toLowerCase().includes(selectedCorridor.destCountry.toLowerCase()))
                                            ? selectedCorridor.destCountry
                                            : '';
                                    }
                                    return (
                                        <div className="space-y-1">
                                            {destDisplay && (
                                                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium truncate block">
                                                    {destDisplay}
                                                </span>
                                            )}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-2xl leading-none shrink-0">{selectedCorridor.destFlag}</span>
                                                    <span className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white font-sans">
                                                        {destFormatted}
                                                    </span>
                                                    <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 ml-0.5" />
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white block font-sans">
                                                        {destTime.timeStr}
                                                    </span>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400 font-medium block">
                                                        {destTime.dateStr} · {destTime.utcOffsetStr}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Section Divider */}
                                <div className="border-t border-gray-100 dark:border-zinc-800 my-4" />

                                {/* Route Activity Section */}
                                <div>
                                    <div className="text-2xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
                                        ROUTE ACTIVITY
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-black/5 dark:bg-white/[0.06] rounded-2xl p-4 border border-black/5 dark:border-white/[0.06]">
                                            <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                                {summary.activityLabel}
                                            </div>
                                            <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1 tracking-tight">
                                                {selectedCorridor.flights.length}
                                            </div>
                                        </div>
                                        <div className="bg-black/5 dark:bg-white/[0.06] rounded-2xl p-4 border border-black/5 dark:border-white/[0.06]">
                                            <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                                {summary.providerLabel}
                                            </div>
                                            <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1 tracking-tight">
                                                {summary.providerCount}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-3">
                                        {selectedCorridor.distanceKm.toLocaleString()} km
                                        {selectedCorridor.lastFlownDate && (
                                            <> · {summary.verbPast} <span className="text-gray-700 dark:text-gray-200 font-semibold">{formatAirTrailDateMedium(selectedCorridor.lastFlownDate)}</span></>
                                        )}
                                    </div>
                                </div>

                                {/* Section Divider */}
                                <div className="border-t border-gray-100 dark:border-zinc-800 my-4" />

                                {/* Transports List Section */}
                                <div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                                            <List className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                                            <span>{summary.listTitle} <span className="font-normal text-gray-400 dark:text-gray-500 ml-1">{selectedCorridor.flights.length}</span></span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setIsFlightListExpanded(!isFlightListExpanded)}
                                            className="text-xs font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors cursor-pointer"
                                        >
                                            {isFlightListExpanded ? 'Collapse' : 'Open list'}
                                        </button>
                                    </div>

                                    <div className={`mt-3 space-y-2 overflow-y-auto custom-scrollbar pr-1 transition-all duration-200 ${isFlightListExpanded ? 'max-h-72' : 'max-h-48'}`}>
                                        {selectedCorridor.flights.map((f, idx) => {
                                            const legMode = f.mode || 'Flight';
                                            const hasCustomProvider = f.provider && f.provider.toLowerCase() !== 'flight' && f.provider.toLowerCase() !== legMode.toLowerCase();
                                            return (
                                                <div key={idx} className="p-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5 flex items-start justify-between text-xs group hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                                                    <div className="flex items-start gap-2.5 min-w-0">
                                                        <div className="mt-0.5 w-6 h-6 rounded-lg bg-black/5 dark:bg-white/5 flex items-center justify-center shrink-0 text-primary-600 dark:text-primary-400">
                                                            {renderRouteModeIcon(legMode, "w-3.5 h-3.5")}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <span className="font-bold text-sm text-gray-900 dark:text-white font-sans">{formatProperLocationName(f.origin)}</span>
                                                                <ArrowRight className="w-3 h-3 text-gray-400 dark:text-gray-500 shrink-0" />
                                                                <span className="font-bold text-sm text-gray-900 dark:text-white font-sans">{formatProperLocationName(f.destination)}</span>
                                                                {f.identifier && (
                                                                    <span className="text-2xs font-mono font-bold px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 text-primary-600 dark:text-primary-400 border border-black/5 dark:border-white/5 ml-1">
                                                                        {f.identifier}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-normal flex items-center gap-2 flex-wrap">
                                                                <span>{hasCustomProvider ? f.provider : legMode}</span>
                                                                {hasCustomProvider && (
                                                                    <span className="px-1.5 py-0.2 rounded text-3xs font-semibold uppercase tracking-wider bg-black/5 dark:bg-white/5 text-gray-400">
                                                                        {legMode}
                                                                    </span>
                                                                )}
                                                                {f.tripName && (
                                                                    <span className="truncate max-w-[130px] text-gray-400 dark:text-gray-500">· {f.tripName}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {f.departureDate && (
                                                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 font-sans pt-0.5 shrink-0 pl-2">
                                                            {formatAirTrailDate(f.departureDate)}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </GlassPanel>
                    </div>
                );
            })()}

            {/* Interactive Object Hover HUD Tooltip with Liquid Glass */}
            {hoverInfo?.object && !selectedCorridor && !selectedCountry && (
                <div
                    className="absolute z-50 transition-all duration-75 pointer-events-auto cursor-pointer"
                    style={{ left: hoverInfo.x + 12, top: hoverInfo.y + 12 }}
                    onClick={() => {
                        if (hoverInfo.object?.corridorId) {
                            handleSelectCorridor(hoverInfo.object.corridorId);
                        }
                    }}
                >
                    {hoverInfo.object.corridorId ? (() => {
                        const c = corridorMap.get(hoverInfo.object.corridorId);
                        if (!c) return null;

                        const summary = getRouteTransportSummary(c);
                        const latestFlight = c.flights[c.flights.length - 1] || c.flights[0];
                        const latestMode = latestFlight?.mode || 'Flight';

                        return (
                            <GlassPanel
                                className="wg-glass-card w-[320px] max-w-sm text-light-text dark:text-dark-text shadow-xl animate-airtrail-pop"
                                padding="16px"
                                overrides={{ borderRadius: 24 }}
                            >
                                {/* Header */}
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-primary-500 shadow-sm shadow-primary-500/50" />
                                        <span className="text-xs font-extrabold uppercase tracking-wider text-primary-600 dark:text-primary-400">
                                            Route
                                        </span>
                                        <span className="px-1.5 py-0.5 rounded-md text-3xs font-bold uppercase tracking-wider bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary ml-1">
                                            {summary.singleActivityLabel}
                                        </span>
                                    </div>
                                </div>

                                {/* Origin Row */}
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="text-xl leading-none shrink-0">{c.originFlag}</span>
                                    <span className="font-bold text-2xl tracking-tight text-gray-900 dark:text-white font-sans shrink-0">
                                        {formatProperLocationName(c.originCode)}
                                    </span>
                                    {(() => {
                                        const originDisplay = formatAirportDisplayName(c.originName, c.originCity);
                                        const originFormatted = formatProperLocationName(c.originCode);
                                        if (originDisplay && originDisplay.toLowerCase() !== originFormatted.toLowerCase()) {
                                            return (
                                                <span className="text-xs text-gray-500 dark:text-gray-400 font-normal truncate">
                                                    {originDisplay}
                                                </span>
                                            );
                                        }
                                        return null;
                                    })()}
                                </div>

                                {/* Middle Hairline Stats Divider */}
                                <div className="flex items-center gap-2.5 my-2.5">
                                    <div className="flex-1 h-px bg-gray-200 dark:bg-zinc-800" />
                                    <span className="text-2xs text-gray-400 dark:text-gray-500 font-medium whitespace-nowrap">
                                        {c.distanceKm.toLocaleString()} km · {c.flights.length} {c.flights.length === 1 ? summary.singleActivityLabel.toLowerCase() : summary.activityLabel.toLowerCase()} · {summary.providerCount} {summary.providerCount === 1 ? summary.singleProviderLabel.toLowerCase() : summary.providerLabel.toLowerCase()}
                                    </span>
                                    <div className="flex-1 h-px bg-gray-200 dark:bg-zinc-800" />
                                </div>

                                {/* Destination Row */}
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="text-xl leading-none shrink-0">{c.destFlag}</span>
                                    <span className="font-bold text-2xl tracking-tight text-gray-900 dark:text-white font-sans shrink-0">
                                        {formatProperLocationName(c.destCode)}
                                    </span>
                                    {(() => {
                                        const destDisplay = formatAirportDisplayName(c.destName, c.destCity);
                                        const destFormatted = formatProperLocationName(c.destCode);
                                        if (destDisplay && destDisplay.toLowerCase() !== destFormatted.toLowerCase()) {
                                            return (
                                                <span className="text-xs text-gray-500 dark:text-gray-400 font-normal truncate">
                                                    {destDisplay}
                                                </span>
                                            );
                                        }
                                        return null;
                                    })()}
                                </div>

                                {/* Section Divider */}
                                <div className="border-t border-gray-100 dark:border-zinc-800 my-3" />

                                {/* Activity Section */}
                                <div>
                                    <div className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2.5 flex items-center gap-1.5">
                                        {summary.activityLabel} <span className="font-normal text-gray-400 dark:text-gray-500">{c.flights.length}</span>
                                    </div>
                                    {latestFlight && (
                                        <div className="flex items-start gap-2.5">
                                            <div className="pt-0.5 shrink-0 text-gray-400 dark:text-gray-500">
                                                {renderRouteModeIcon(latestMode, "w-4 h-4")}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-sm text-gray-900 dark:text-white tracking-tight">
                                                            {formatProperLocationName(latestFlight.origin)}
                                                        </span>
                                                        <ArrowRight className="w-3 h-3 text-gray-400 dark:text-gray-500 shrink-0" />
                                                        <span className="font-bold text-sm text-gray-900 dark:text-white tracking-tight">
                                                            {formatProperLocationName(latestFlight.destination)}
                                                        </span>
                                                    </div>
                                                    {latestFlight.departureDate && (
                                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 font-sans shrink-0 pl-1">
                                                            {formatAirTrailDate(latestFlight.departureDate)}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                                    {latestFlight.provider && latestFlight.provider.toLowerCase() !== 'flight' && latestFlight.provider.toLowerCase() !== latestMode.toLowerCase()
                                                        ? `${latestFlight.provider} · ${latestMode}`
                                                        : latestMode}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Footer Prompt */}
                                <div className="border-t border-gray-100 dark:border-zinc-800 mt-3 pt-2.5 text-center">
                                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                        Click for route details
                                    </span>
                                </div>
                            </GlassPanel>
                        );
                    })() : hoverInfo.object.properties ? (() => {
                        const p = hoverInfo.object.properties;
                        const name = p.NAME || p.NAME_LONG || p.ADMIN || p.SOVEREIGNT || 'Country';
                        const iso2 = (p.ISO_A2 && p.ISO_A2 !== '-99' ? p.ISO_A2 : (p.ISO_A2_EH || p.wb_a2 || '')).toUpperCase();
                        const isVisited = isCountryVisited(hoverInfo.object, visitedCountries);
                        const rawStatus = (iso2 && countryStatusMap?.[iso2]) || (name && countryStatusMap?.[name.toUpperCase()]);
                        const currentStatuses: CountryResidenceStatus[] = Array.isArray(rawStatus)
                            ? rawStatus
                            : rawStatus
                                ? [rawStatus]
                                : isVisited
                                    ? ['visited']
                                    : [];
                        const flag = iso2 ? getFlagEmoji(iso2) : '🏳️';
                        const region = p.REGION_UN || p.SUBREGION || p.CONTINENT || (iso2 ? getRegion(iso2) : '');

                        return (
                            <GlassPanel
                                className="wg-glass-card min-w-[240px] text-xs animate-airtrail-pop shadow-xl"
                                padding="16px"
                                overrides={{ borderRadius: 22 }}
                            >
                                <div className="space-y-2.5">
                                    <div className="flex items-center justify-between border-b border-black/5 dark:border-white/10 pb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xl leading-none">{flag}</span>
                                            <span className="font-bold text-sm text-light-text dark:text-dark-text tracking-tight">{formatPlaceName(name)}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {currentStatuses.includes('lived_current') && (
                                                <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                                    🏠 HOME
                                                </span>
                                            )}
                                            {currentStatuses.includes('lived_past') && (
                                                <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 flex items-center gap-1">
                                                    🏛️ PAST HOME
                                                </span>
                                            )}
                                            {currentStatuses.includes('visited') && (
                                                <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-primary-500/15 text-primary-600 dark:text-primary-400 border border-primary-500/30 flex items-center gap-1">
                                                    ✨ EXPLORED
                                                </span>
                                            )}
                                            {currentStatuses.includes('layover') && (
                                                <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
                                                    🛫 LAYOVER
                                                </span>
                                            )}
                                            {currentStatuses.includes('wishlist') && (
                                                <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center gap-1">
                                                    🌟 WISHLIST
                                                </span>
                                            )}
                                            {currentStatuses.length === 0 && !isVisited && (
                                                <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-black/5 dark:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary border border-black/10 dark:border-white/10">
                                                    UNEXPLORED
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {region && (
                                        <div className="flex items-center justify-between text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                            <span>Region</span>
                                            <span className="font-semibold text-light-text dark:text-dark-text">{region}</span>
                                        </div>
                                    )}
                                    <div className="pt-1 text-xs text-primary-500 font-bold flex items-center gap-1">
                                        <span>👆 Click territory to inspect & label</span>
                                    </div>
                                </div>
                            </GlassPanel>
                        );
                    })() : (
                        <GlassPanel
                            className="wg-glass-card min-w-[220px] text-xs animate-airtrail-pop shadow-xl"
                            padding="14px"
                            overrides={{ borderRadius: 20 }}
                        >
                            <div className="space-y-1">
                                <div className="flex items-center justify-between gap-3 pb-1 border-b border-black/5 dark:border-white/10">
                                    <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                                        {hoverInfo.object.isAirport
                                            ? '✈️ Airport Hub'
                                            : hoverInfo.object.type === 'city'
                                                ? '📍 City / Destination'
                                                : (hoverInfo.object.count ? '🌐 Cluster' : 'Location')}
                                    </span>
                                    {hoverInfo.object.isAirport && (
                                        <span className="px-1.5 py-0.5 rounded text-2xs font-mono font-bold bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20">
                                            {hoverInfo.object.iata ? hoverInfo.object.iata.toUpperCase() : 'AERODROME'}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center justify-between gap-2 font-bold pt-0.5">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span
                                            className={`w-2.5 h-2.5 rounded-full shrink-0 ${hoverInfo.object.isAirport
                                                    ? 'bg-primary-500 shadow-[0_0_8px_rgba(250,154,29,0.8)]'
                                                    : 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                                                }`}
                                        />
                                        <span className="text-sm tracking-tight text-light-text dark:text-dark-text truncate">
                                            {hoverInfo.object.isAirport
                                                ? formatAirportDisplayName(hoverInfo.object.name, hoverInfo.object.city)
                                                : formatPlaceName(hoverInfo.object.name)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </GlassPanel>
                    )}
                </div>
            )}

            {/* Mission Control Drawer (when not externally managed by parent view) */}
            {!onOpenMissionControl && (
                <MapAppearanceModal
                    isOpen={isAppearanceModalOpen}
                    onClose={() => setIsAppearanceModalOpen(false)}
                    settings={activeAppearance}
                    onChangeSettings={handleAppearanceChange}
                />
            )}
        </div>
    );
};

export default DeckFlightMap;
