import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

// Explicitly register worker URL for Vite ESM bundling compatibility
if (typeof (maplibregl as any).setWorkerUrl === 'function') {
    (maplibregl as any).setWorkerUrl(maplibreWorkerUrl);
}

import { MapboxOverlay } from '@deck.gl/mapbox';
import { ArcLayer, ScatterplotLayer, GeoJsonLayer, PathLayer, BitmapLayer, TextLayer } from '@deck.gl/layers';
import { TileLayer, TripsLayer } from '@deck.gl/geo-layers';
import { geoInterpolate } from 'd3';
import { 
    ArrowsOut as Maximize2, 
    CornersOut as Scan, 
    Globe, 
    ArrowLeft, 
    ArrowRight, 
    X, 
    Airplane as Plane, 
    Clock, 
    CalendarBlank as Calendar, 
    CaretRight as ChevronRight, 
    Train, 
    Boat as Ship, 
    Car,
    MagnifyingGlassPlus as ZoomIn,
    MagnifyingGlassMinus as ZoomOut,
    List
} from '@phosphor-icons/react';
import { Trip, CountryResidenceStatus, PredefinedMapMode, toggleCountryResidenceStatus, WorkspaceSettings } from '../types';
import { useWanderSync } from '../hooks/useWanderSync';
import { getCoordinatesSync, formatPlaceName, formatProperLocationName } from '../services/geocoding';
import { 
    MapAppearanceSettings, 
    DEFAULT_MAP_APPEARANCE, 
    loadMapAppearanceSettings, 
    saveMapAppearanceSettings,
    getEffectiveBasemap
} from '../types/mapAppearance';
import { getTwilightGradientGeoJSON } from '../services/solarTerminator';
import { getLatestRainRadarMetadata, RainRadarMetadata } from '../services/rainViewer';
import { generateAirportRunway, RunwayGeometry, getPhysicalRunways } from '../services/airportRunways';
import { buildRouteCorridors, RouteCorridor, getApproxLocalTime, formatAirportDisplayName, resolveLocationMetadata } from '../services/routeCorridor';
import { getFlagEmoji, getRegion } from '../services/geoData';
import { fetchMultiModalRoute, getCachedMultiModalRoute } from '../services/multiModalRouting';
import { dataService } from '../services/mockDb';
import { formatDate } from '../utils/formatters';
import GlassPanel from './glass/GlassPanel';

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
    const cleanDestCode = (destCode || '').toUpperCase();
    if (diff > 0) return `${cleanDestCode} ${diff}h ahead`;
    return `${cleanDestCode} ${Math.abs(diff)}h behind`;
};

/**
 * Format City and Airport with dot separator matching AirTrail:
 * E.g. "Amsterdam · Amsterdam Airport Schiphol", "Los Angeles · Los Angeles Intl."
 */
const formatAirportCityDotName = (name: string, city?: string): string => {
    const cleanCity = city ? city.split(',')[0].trim() : '';
    const cleanName = name ? name.trim() : '';
    if (cleanCity && cleanName) {
        if (cleanCity.toUpperCase() === cleanName.toUpperCase()) return cleanName;
        return `${cleanCity} · ${cleanName}`;
    }
    return cleanCity || cleanName || '';
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

const getStatusRGB = (trip: Trip): [number, number, number] => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(trip.endDate);

    if (endDate < today || trip.status === 'Past') {
        return [59, 130, 246]; // Blue
    }
    if (trip.status === 'Upcoming') {
        return [16, 185, 129]; // Emerald
    }
    return [255, 255, 255]; // White
};

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

// MapLibre Style Specification Generator
export const createMapLibreStyle = (
    layer: string,
    isDark: boolean,
    cartoApiKey?: string
): maplibregl.StyleSpecification => {
    const keyParam = cartoApiKey ? `?key=${encodeURIComponent(cartoApiKey)}` : '';
    const getCartoTiles = (style: 'dark_all' | 'light_all' | 'voyager') => [
        `https://a.basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}.png${keyParam}`,
        `https://b.basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}.png${keyParam}`,
        `https://c.basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}.png${keyParam}`,
        `https://d.basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}.png${keyParam}`
    ];

    let tiles: string[] = [];
    let maxzoom = 20;
    let attribution = '© CARTO, © OpenStreetMap contributors';

    const effectiveLayer = getEffectiveBasemap(layer, isDark);

    switch (effectiveLayer) {
        case 'satellite':
            tiles = ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'];
            maxzoom = 19;
            attribution = 'Source: Esri, Maxar, Earthstar Geographics';
            break;
        case 'ocean':
            tiles = ['https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}'];
            maxzoom = 10;
            attribution = 'Source: Esri, GEBCO, NOAA';
            break;
        case 'citylights':
            tiles = ['https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png'];
            maxzoom = 8;
            attribution = 'NASA EOSDIS GIBS';
            break;
        case 'vibrant':
            tiles = getCartoTiles('voyager');
            break;
        case 'snow':
            tiles = getCartoTiles('light_all');
            break;
        case 'onyx':
        default:
            tiles = getCartoTiles('dark_all');
            break;
    }

    return {
        version: 8,
        sources: {
            'raster-basemap-source': {
                type: 'raster',
                tiles,
                tileSize: 256,
                maxzoom,
                attribution
            }
        },
        layers: [
            {
                id: 'raster-basemap-layer',
                type: 'raster',
                source: 'raster-basemap-source',
                minzoom: 0,
                maxzoom
            }
        ]
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

export function calculateAdaptiveWorldCamera(
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
    isSidebarCollapsed?: boolean;
    embedded?: boolean;
}

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
    onChangeActiveLayer,
    showFlightRoutes = true,
    showLandSeaRoutes = true,
    showCityMarkers = true,
    showGradientRoutes = true,
    clusterMode = false,
    showRoadTracing = false,
    focusTransportCoordinates,
    projection: projectionProp,
    elevatedRoutes: elevatedRoutesProp,
    onProjectionChange,
    onElevatedRoutesChange,
    initialProjection = 'flat',
    initialElevated = false,
    appearanceSettings: appearanceSettingsProp,
    onChangeAppearanceSettings,
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

    // Map Appearance State Management
    const [localAppearance, setLocalAppearance] = useState<MapAppearanceSettings>(() => {
        return appearanceSettingsProp || loadMapAppearanceSettings();
    });

    useEffect(() => {
        if (appearanceSettingsProp) {
            setLocalAppearance(appearanceSettingsProp);
        }
    }, [appearanceSettingsProp]);

    const activeAppearance = appearanceSettingsProp || localAppearance;

    // Projection & Layer Resolution
    const effectiveProjection = projectionProp !== undefined 
        ? projectionProp 
        : (activeAppearance.projection || initialProjection);

    const [localElevatedRoutes, setLocalElevatedRoutes] = useState<boolean>(
        elevatedRoutesProp !== undefined ? elevatedRoutesProp : initialElevated
    );
    const [hoveredRouteKey, setHoveredRouteKey] = useState<string | null>(null);
    const [, setOsrmVersion] = useState(0);

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
    const currentLayer = (activeLayerProp as DeckLayerType) || activeAppearance.basemap || 'default';

    // MapLibre Container & Instance Refs
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
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

    // Runway dataset demand loading
    const [runwayDatasetLoaded, setRunwayDatasetLoaded] = useState(false);
    useEffect(() => {
        if (activeAppearance.airportDetail === 'detailed') {
            getPhysicalRunways().then(() => {
                setRunwayDatasetLoaded(true);
            }).catch(err => {
                console.warn("[DeckFlightMap] Could not load physical runway dataset:", err);
            });
        }
    }, [activeAppearance.airportDetail]);

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
            const countriesHighResUrl = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';
            const mapUnitsHighResUrl = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_map_units.geojson';
            const countriesStdResUrl = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';

            try {
                const [countriesRes, mapUnitsRes] = await Promise.allSettled([
                    fetch(countriesHighResUrl),
                    fetch(mapUnitsHighResUrl)
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
                // Fallback to standard
            }

            try {
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

                    if (isTrain || isRoad) {
                        void fetchMultiModalRoute(
                            t.mode,
                            t.originLat,
                            t.originLng,
                            t.destLat,
                            t.destLng,
                            () => setOsrmVersion(v => v + 1)
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
        clusterNodes, 
        detailedRunways 
    } = useMemo(() => {
        const flightCorridorsMap = new Map<string, any>();
        const overlandRoutes: any[] = [];
        const pointsMap = new Map<string, any>();
        const airportFreqMap = new Map<string, number>();
        const runwayGeometries: RunwayGeometry[] = [];
        const processedRunwayKeys = new Set<string>();

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

                const isFlight = !t.mode || t.mode === 'Flight';
                const isTrain = (t.mode || '').toLowerCase().includes('train') || (t.mode || '').toLowerCase().includes('rail');
                const isCarBus = ['Car Rental', 'Personal Car', 'Bus', 'Road Trip', 'Driving', 'Car', 'Taxi'].some(m => (t.mode || '').toLowerCase().includes(m.toLowerCase()));
                const isSea = ['Cruise', 'Ferry', 'Boat', 'Ship'].some(m => (t.mode || '').toLowerCase().includes(m.toLowerCase()));

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
                    const isTrackable = isTrain || isCarBus;
                    const cachedCoords = (isTrackable && isTracingEnabled)
                        ? getCachedMultiModalRoute(t.mode, t.originLat, t.originLng, t.destLat, t.destLng)
                        : null;

                    let path: [number, number, number][] = [];
                    if (cachedCoords && cachedCoords.length > 0) {
                        path = cachedCoords;
                    } else {
                        path = [[t.originLng, t.originLat, 0]];
                        if (t.waypoints) {
                            t.waypoints.forEach((w: any) => {
                                if (w.coordinates) path.push([w.coordinates.lng, w.coordinates.lat, 0]);
                            });
                        }
                        path.push([t.destLng, t.destLat, 0]);
                    }

                    const modeRGB: [number, number, number] = isTrain
                        ? [168, 85, 247] // Purple
                        : isCarBus
                            ? [245, 158, 11] // Amber
                            : [6, 182, 212]; // Cyan

                    overlandRoutes.push({
                        path,
                        color: [...modeRGB, 235],
                        corridorId,
                        routeKey: `${trip.id}_${t.origin}_${t.destination}`,
                        tripId: trip.id,
                        tripName: trip.name,
                        origin: t.origin,
                        destination: t.destination,
                        provider: t.provider || t.mode,
                        identifier: t.identifier || '',
                        mode: t.mode
                    });
                }

                // Airport and Location Markers
                const isOriginAirport = oCode.length === 3 || oCode.length === 4;
                const isDestAirport = dCode.length === 3 || dCode.length === 4;
                const metaOrigin = isOriginAirport ? resolveLocationMetadata(oCode, t.originLat, t.originLng) : null;
                const metaDest = isDestAirport ? resolveLocationMetadata(dCode, t.destLat, t.destLng) : null;

                const origFreq = Math.max(airportFreqMap.get(p1) || 1, oCode ? (airportFreqMap.get(oCode) || 1) : 1);
                const destFreq = Math.max(airportFreqMap.get(p2) || 1, dCode ? (airportFreqMap.get(dCode) || 1) : 1);
                const scaleFactor = activeAppearance.airportSize === 'small' ? 1.5 : activeAppearance.airportSize === 'large' ? 3.5 : 2.5;

                if (!pointsMap.has(p1)) {
                    pointsMap.set(p1, {
                        position: [t.originLng, t.originLat, 0],
                        name: metaOrigin ? metaOrigin.name : t.origin,
                        city: metaOrigin ? metaOrigin.city : undefined,
                        iata: isOriginAirport ? oCode.toUpperCase() : undefined,
                        isAirport: isOriginAirport,
                        tripId: trip.id,
                        color: isOriginAirport ? [250, 154, 29, 240] : [251, 191, 36, 240],
                        strokeColor: [255, 255, 255, 230],
                        frequency: origFreq,
                        radius: isFreqMode
                            ? Math.min(24.0, baseOriginRadius + Math.log2(Math.max(1, origFreq)) * scaleFactor)
                            : baseOriginRadius
                    });
                }
                if (!pointsMap.has(p2)) {
                    pointsMap.set(p2, {
                        position: [t.destLng, t.destLat, 0],
                        name: metaDest ? metaDest.name : t.destination,
                        city: metaDest ? metaDest.city : undefined,
                        iata: isDestAirport ? dCode.toUpperCase() : undefined,
                        isAirport: isDestAirport,
                        tripId: trip.id,
                        color: isDestAirport ? [250, 154, 29, 240] : [251, 191, 36, 240],
                        strokeColor: [255, 255, 255, 230],
                        frequency: destFreq,
                        radius: isFreqMode
                            ? Math.min(24.0, baseOriginRadius + Math.log2(Math.max(1, destFreq)) * scaleFactor)
                            : baseOriginRadius
                    });
                }

                // Physical Runways
                if (isDestAirport && activeAppearance.airportDetail === 'detailed' && !processedRunwayKeys.has(p2)) {
                    processedRunwayKeys.add(p2);
                    const rw = generateAirportRunway(t.destination, t.destLat, t.destLng);
                    if (rw) runwayGeometries.push(rw);
                }
            });
        });

        // 2. Clusters logic
        const allAirports = Array.from(pointsMap.values());
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
            clusterNodes: clusters,
            detailedRunways: runwayGeometries
        };
    }, [
        enrichedTrips,
        showFlightRoutes,
        showLandSeaRoutes,
        showRoadTracing,
        showFrequencyWeight,
        activeAppearance,
        clusterMode,
        runwayDatasetLoaded
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
        }[] = [];

        const getPhase = (str: string) => {
            let h = 0;
            for (let i = 0; i < str.length; i++) {
                h = (h * 31 + str.charCodeAt(i)) >>> 0;
            }
            return h % COMET_LOOP_DURATION;
        };

        // 1. Flight routes: Generate smooth Great-Circle paths using d3.geoInterpolate
        if (showFlightRoutes && viewMode !== 'scratch' && flightArcs.length > 0) {
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
                        color: cometColor
                    });
                    result.push({
                        path: singlePath,
                        timestamps: singlePath.map((_, i) => phase + duration + (i / numPoints) * duration),
                        color: cometColor
                    });
                } catch {
                    // Ignore rare errors on degenerate points
                }
            });
        }

        // 2. Overland & Maritime routes: Trace multi-modal paths
        if (showLandSeaRoutes && viewMode !== 'scratch' && overlandSegments.length > 0) {
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
                    color: modeColor
                });
                result.push({
                    path: singlePath,
                    timestamps: singlePath.map((_, i) => phase + duration + (i / n) * duration),
                    color: modeColor
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
        if (activeAppearance.timeOfDay && twilightData) {
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
        if (geoJsonData && (showCountries || viewMode === 'scratch')) {
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
                    }
                })
            );
        }

        // 4. Scratch Map City / Place Pins
        if (viewMode === 'scratch' && activeAppearance.scratchCitySize !== 'off' && visitedPlaces.length > 0) {
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
                    onHover: (info: any) => info.object && setHoverInfo(info)
                })
            );
        }

        // 5. Overland & Maritime Routes (PathLayer for High-Speed Rail & Road Geometries)
        if (overlandSegments.length > 0 && viewMode !== 'scratch') {
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
                        const base = effectiveProjection === 'globe' ? 1.3 : 1.5;
                        if (selectedCorridor && d.corridorId === selectedCorridor.id) return base * 2.0;
                        return hoveredRouteKey === d.corridorId ? base + 1.0 : base;
                    },
                    widthUnits: 'pixels',
                    widthMinPixels: effectiveProjection === 'globe' ? 1.0 : 1.2,
                    widthMaxPixels: 6,
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
                    }
                })
            );
        }

        // 6. GPU Great-Circle Flight Arcs (AirTrail Benchmark Architecture)
        if (flightArcs.length > 0 && showFlightRoutes && viewMode !== 'scratch') {
            // Arc height elevation: on 3D globe, default to 0.25 (or 0.45 if elevated) to soar above sphere curvature
            const arcHeight = effectiveProjection === 'globe' ? (isElevatedActive ? 0.45 : 0.25) : 0;

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
                            ? (isWidthByFreq ? Math.min(3.2, 1.2 + Math.log2(d.count) * 0.45) : 1.3)
                            : (isWidthByFreq ? Math.min(4.5, 1.2 + Math.log2(d.count) * 0.75) : 1.5);
                        const strokeWidth = baseStroke * scaleMultiplier;
                        if (selectedCorridor && d.corridorId === selectedCorridor.id) return strokeWidth * 2.0;
                        if (hoveredRouteKey === d.corridorId) return strokeWidth + 1.0;
                        return strokeWidth;
                    },
                    widthUnits: 'pixels',
                    widthMinPixels: effectiveProjection === 'globe' ? 1.1 : 1.5,
                    widthMaxPixels: 8,
                    pickable: false, // Handled by wide ghost arc for effortless interaction
                    updateTriggers: {
                        getSourceColor: [selectedCorridor?.id, hoveredRouteKey, activeAppearance.routeColorMode],
                        getTargetColor: [selectedCorridor?.id, hoveredRouteKey, activeAppearance.routeColorMode],
                        getWidth: [selectedCorridor?.id, hoveredRouteKey, isWidthByFreq, scaleMultiplier, effectiveProjection],
                        getHeight: [arcHeight, effectiveProjection, isElevatedActive]
                    }
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
                    }
                })
            );
        }

        // 6.5 Animated Comet Flow Layer (Deck.gl TripsLayer)
        if (animateRoutes && animatedTripPaths.length > 0) {
            layers.push(
                new TripsLayer({
                    id: 'comet-flow-layer',
                    data: animatedTripPaths,
                    getPath: (d: any) => d.path,
                    getTimestamps: (d: any) => d.timestamps,
                    getColor: (d: any) => d.color,
                    opacity: 1,
                    widthUnits: 'pixels',
                    getWidth: 3.5,
                    trailLength: 160,
                    currentTime: currentTime,
                    fadeTrail: true,
                    capRounded: true,
                    jointRounded: true,
                    parameters: {
                        depthWriteEnabled: false,
                        depthCompare: 'always',
                        depthTest: false
                    }
                })
            );
        }

        // 7. Detailed Runways Markings
        if (activeAppearance.airportDetail === 'detailed' && detailedRunways.length > 0) {
            const allStrips: { path: [number, number, number][]; width: number }[] = [];
            detailedRunways.forEach(r => {
                r.runwayPaths.forEach(rp => allStrips.push({ path: rp.stripPath, width: rp.widthMeters }));
            });

            if (allStrips.length > 0) {
                layers.push(
                    new PathLayer({
                        id: 'runway-strips',
                        data: allStrips,
                        getPath: (d: any) => d.path,
                        getColor: isDark ? [15, 23, 42, 255] : [51, 65, 85, 255],
                        getWidth: (d: any) => d.width || 45,
                        widthUnits: 'meters',
                        widthMinPixels: 2.0,
                        wrapLongitude: true,
                        pickable: false
                    })
                );
            }
        }

        // 8. Airport & Destination Nodes
        if (showCityMarkers && activeAppearance.airportSize !== 'off') {
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
                        pickable: false
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
                        onClick: (info: any) => info.object?.tripId && onTripClick && onTripClick(info.object.tripId)
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
                        pickable: false
                    })
                );
            } else if (airportPoints.length > 0) {
                layers.push(
                    new ScatterplotLayer({
                        id: 'airport-markers',
                        data: airportPoints,
                        getPosition: (d: any) => d.position,
                        getFillColor: (d: any) => {
                            if (selectedCorridor) {
                                const code = (d.iata || d.name || '').toUpperCase().trim();
                                if (code === selectedCorridor.originCode || code === selectedCorridor.destCode) {
                                    return [52, 211, 153, 255];
                                }
                                return isDark ? [100, 115, 135, 60] : [160, 175, 195, 60];
                            }
                            return d.color;
                        },
                        getLineColor: (d: any) => {
                            if (selectedCorridor) {
                                const code = (d.iata || d.name || '').toUpperCase().trim();
                                if (code === selectedCorridor.originCode || code === selectedCorridor.destCode) {
                                    return [255, 255, 255, 255];
                                }
                            }
                            return d.strokeColor;
                        },
                        getRadius: (d: any) => {
                            const baseRadius = activeAppearance.airportSize === 'small' ? 3.0 : activeAppearance.airportSize === 'large' ? 8.0 : 5.0;
                            let r = baseRadius;
                            if (activeAppearance.airportMode === 'frequency') {
                                const freq = d.frequency || 1;
                                const scaleFactor = activeAppearance.airportSize === 'small' ? 1.5 : activeAppearance.airportSize === 'large' ? 3.5 : 2.5;
                                r = Math.min(24, baseRadius + Math.log2(Math.max(1, freq)) * scaleFactor);
                            }
                            if (selectedCorridor) {
                                const code = (d.iata || d.name || '').toUpperCase().trim();
                                if (code === selectedCorridor.originCode || code === selectedCorridor.destCode) {
                                    return r * 1.6;
                                }
                            }
                            return r;
                        },
                        radiusUnits: 'pixels',
                        radiusMinPixels: activeAppearance.airportSize === 'small' ? 1.0 : 2,
                        radiusMaxPixels: 24,
                        stroked: true,
                        lineWidthUnits: 'pixels',
                        getLineWidth: activeAppearance.airportSize === 'small' ? 0.75 : 1.2,
                        wrapLongitude: true,
                        pickable: true,
                        autoHighlight: true,
                        highlightColor: [255, 255, 255, 255],
                        onHover: (info: any) => info.object && setHoverInfo(info),
                        onClick: (info: any) => info.object?.tripId && onTripClick && onTripClick(info.object.tripId),
                        updateTriggers: {
                            getFillColor: [selectedCorridor?.id, isDark, activeAppearance.routeColorMode, activeAppearance.airportMode],
                            getRadius: [selectedCorridor?.id, activeAppearance.airportMode, activeAppearance.airportSize]
                        }
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
        detailedRunways,
        showCityMarkers,
        clusterMode,
        clusterNodes,
        airportPoints,
        animateRoutes,
        animatedTripPaths,
        currentTime,
        handleRouteHover,
        handleRouteClick,
        onTripClick
    ]);

    const deckLayersRef = useRef(deckLayers);
    deckLayersRef.current = deckLayers;

    // Initialize MapLibre GL Map & MapboxOverlay Bridge
    useEffect(() => {
        if (!mapContainerRef.current) return;

        const style = createMapLibreStyle(currentLayer, isDark, workspaceSettings?.cartoApiKey);

        const isGlobe = effectiveProjection === 'globe';
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

        map.on('load', () => {
            isMapLoadedRef.current = true;
            try {
                if (isGlobe && (map as any).setProjection) {
                    (map as any).setProjection({ type: 'globe' });
                }
                const curRect = mapContainerRef.current?.getBoundingClientRect();
                if (curRect && curRect.width && curRect.height) {
                    const freshCam = calculateAdaptiveWorldCamera(curRect.width, curRect.height, sidebarCollapsed, isGlobe, isEmbedded);
                    try {
                        map.setPadding(freshCam.padding);
                    } catch (e) {}
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

        // Forward MapLibre Canvas Mousemove to Deck.gl overlay for hover tooltips
        map.on('mousemove', (e) => {
            if (!overlayRef.current) return;
            const picked = overlayRef.current.pickObject({
                x: e.point.x,
                y: e.point.y,
                radius: 12
            });
            if (picked?.object) {
                map.getCanvas().style.cursor = 'pointer';
                handleRouteHoverRef.current(picked);
            } else {
                map.getCanvas().style.cursor = '';
                handleRouteHoverRef.current({ object: null });
            }
        });

        mapRef.current = map;
        overlayRef.current = overlay;

        return () => {
            isMapLoadedRef.current = false;
            try {
                map.removeControl(overlay as any);
                map.remove();
            } catch (e) {
                // Ignore cleanup errors
            }
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

    // Synchronize Basemap Style changes smoothly
    useEffect(() => {
        if (!mapRef.current) return;
        const nextStyle = createMapLibreStyle(currentLayer, isDark, workspaceSettings?.cartoApiKey);
        mapRef.current.setStyle(nextStyle);
    }, [currentLayer, isDark, workspaceSettings?.cartoApiKey]);

    // Synchronize RainViewer precipitation radar directly into MapLibre GL
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        const updateRadarLayer = () => {
            if (!map.isStyleLoaded()) return;

            const sourceId = 'rain-radar-source';
            const layerId = 'rain-radar-layer';
            const isEnabled = Boolean(activeAppearance.rainRadar && radarMeta?.tileUrl);
            const opacity = activeAppearance.rainRadarOpacity ?? 0.85;

            const existingLayer = map.getLayer(layerId);
            const existingSource = map.getSource(sourceId) as maplibregl.RasterTileSource | undefined;

            if (!isEnabled) {
                if (existingLayer) map.removeLayer(layerId);
                if (existingSource) map.removeSource(sourceId);
                return;
            }

            const currentTileUrl = existingSource?.tiles?.[0];
            if (existingSource && currentTileUrl !== radarMeta!.tileUrl) {
                if (existingLayer) map.removeLayer(layerId);
                map.removeSource(sourceId);
            }

            if (!map.getSource(sourceId)) {
                map.addSource(sourceId, {
                    type: 'raster',
                    tiles: [radarMeta!.tileUrl],
                    tileSize: 256,
                    attribution: 'RainViewer'
                });
            }

            if (!map.getLayer(layerId)) {
                map.addLayer({
                    id: layerId,
                    type: 'raster',
                    source: sourceId,
                    paint: {
                        'raster-opacity': opacity
                    }
                });
            } else {
                map.setPaintProperty(layerId, 'raster-opacity', opacity);
            }
        };

        if (map.isStyleLoaded()) {
            updateRadarLayer();
        }

        map.on('styledata', updateRadarLayer);
        return () => {
            map.off('styledata', updateRadarLayer);
        };
    }, [activeAppearance.rainRadar, activeAppearance.rainRadarOpacity, radarMeta?.tileUrl, currentLayer, isDark]);

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
                } catch (e) {}
                map.setMinZoom(0);
                map.easeTo({
                    center: cam.center,
                    zoom: cam.zoom,
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
            } catch (e) {}
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
        } catch (e) {}
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

    return (
        <div className="relative w-full h-full overflow-hidden select-none bg-white dark:bg-black">
            {/* MapLibre GL 60 FPS Canvas with Interleaved Deck.gl Engine */}
            <div ref={mapContainerRef} className="w-full h-full" />

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
                    </div>
                </GlassPanel>
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
                                                className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                                                    currentStatuses.includes('lived_current')
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
                                                className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                                                    currentStatuses.includes('lived_past')
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
                                                className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                                                    currentStatuses.includes('visited')
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
                                                className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                                                    currentStatuses.includes('layover')
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
                                                className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                                                    currentStatuses.includes('wishlist')
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
            {selectedCorridor && (
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
                                const originDisplay = formatAirportCityDotName(selectedCorridor.originName, selectedCorridor.originCity);
                                return (
                                    <div className="space-y-1">
                                        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium truncate block">
                                            {originDisplay}
                                        </span>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="text-2xl leading-none shrink-0">{selectedCorridor.originFlag}</span>
                                                <span className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white font-sans">
                                                    {selectedCorridor.originCode.toUpperCase()}
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
                                const destDisplay = formatAirportCityDotName(selectedCorridor.destName, selectedCorridor.destCity);
                                return (
                                    <div className="space-y-1">
                                        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium truncate block">
                                            {destDisplay}
                                        </span>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="text-2xl leading-none shrink-0">{selectedCorridor.destFlag}</span>
                                                <span className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white font-sans">
                                                    {selectedCorridor.destCode.toUpperCase()}
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
                                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Flights</div>
                                        <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1 tracking-tight">
                                            {selectedCorridor.totalFlights}
                                        </div>
                                    </div>
                                    <div className="bg-black/5 dark:bg-white/[0.06] rounded-2xl p-4 border border-black/5 dark:border-white/[0.06]">
                                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Airlines</div>
                                        <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1 tracking-tight">
                                            {selectedCorridor.airlines?.length || 1}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-3">
                                    {selectedCorridor.distanceKm.toLocaleString()} km
                                    {selectedCorridor.lastFlownDate && (
                                        <> · last flown <span className="text-gray-700 dark:text-gray-200 font-semibold">{formatAirTrailDateMedium(selectedCorridor.lastFlownDate)}</span></>
                                    )}
                                </div>
                            </div>

                            {/* Section Divider */}
                            <div className="border-t border-gray-100 dark:border-zinc-800 my-4" />

                            {/* Flights List Section */}
                            <div>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                                        <List className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                                        <span>FLIGHTS <span className="font-normal text-gray-400 dark:text-gray-500 ml-1">{selectedCorridor.totalFlights}</span></span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setIsFlightListExpanded(!isFlightListExpanded)}
                                        className="text-xs font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors cursor-pointer"
                                    >
                                        {isFlightListExpanded ? 'Collapse' : 'Open list'}
                                    </button>
                                </div>

                                <div className={`mt-3 space-y-3 overflow-y-auto custom-scrollbar pr-1 transition-all duration-200 ${isFlightListExpanded ? 'max-h-72' : 'max-h-48'}`}>
                                    {selectedCorridor.flights.map((f, idx) => (
                                        <div key={idx} className="flex items-start justify-between text-xs group">
                                            <div>
                                                <div className="flex items-center gap-3">
                                                    <span className="font-bold text-sm text-gray-900 dark:text-white font-sans">{f.origin.toUpperCase()}</span>
                                                    <span className="font-bold text-sm text-gray-900 dark:text-white font-sans">{f.destination.toUpperCase()}</span>
                                                    {(f.identifier || f.provider) && (
                                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                                            {f.identifier ? `${f.provider} ${f.identifier}` : f.provider}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-normal">
                                                    {f.provider || 'Flight'}
                                                </div>
                                            </div>
                                            {f.departureDate && (
                                                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 font-sans pt-0.5 shrink-0">
                                                    {formatAirTrailDate(f.departureDate)}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </GlassPanel>
                </div>
            )}

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

                        const airlineCount = c.airlines?.length || 1;
                        const latestFlight = c.flights[c.flights.length - 1] || c.flights[0];

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
                                    </div>
                                </div>

                                {/* Origin Row */}
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="text-xl leading-none shrink-0">{c.originFlag}</span>
                                    <span className="font-bold text-2xl tracking-tight text-gray-900 dark:text-white font-sans shrink-0">
                                        {c.originCode.toUpperCase()}
                                    </span>
                                    <span className="text-xs text-gray-500 dark:text-gray-400 font-normal truncate">
                                        {formatAirportDisplayName(c.originName, c.originCity)}
                                    </span>
                                </div>

                                {/* Middle Hairline Stats Divider */}
                                <div className="flex items-center gap-2.5 my-2.5">
                                    <div className="flex-1 h-px bg-gray-200 dark:bg-zinc-800" />
                                    <span className="text-2xs text-gray-400 dark:text-gray-500 font-medium whitespace-nowrap">
                                        {c.distanceKm.toLocaleString()} km · {c.flights.length} {c.flights.length === 1 ? 'trip' : 'trips'} · {airlineCount} {airlineCount === 1 ? 'airline' : 'airlines'}
                                    </span>
                                    <div className="flex-1 h-px bg-gray-200 dark:bg-zinc-800" />
                                </div>

                                {/* Destination Row */}
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="text-xl leading-none shrink-0">{c.destFlag}</span>
                                    <span className="font-bold text-2xl tracking-tight text-gray-900 dark:text-white font-sans shrink-0">
                                        {c.destCode.toUpperCase()}
                                    </span>
                                    <span className="text-xs text-gray-500 dark:text-gray-400 font-normal truncate">
                                        {formatAirportDisplayName(c.destName, c.destCity)}
                                    </span>
                                </div>

                                {/* Section Divider */}
                                <div className="border-t border-gray-100 dark:border-zinc-800 my-3" />

                                {/* Flights Section */}
                                <div>
                                    <div className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2.5 flex items-center gap-1.5">
                                        Flights <span className="font-normal text-gray-400 dark:text-gray-500">{c.totalFlights}</span>
                                    </div>
                                    {latestFlight && (
                                        <div className="flex items-start gap-2.5">
                                            <div className="pt-0.5 shrink-0 text-gray-400 dark:text-gray-500">
                                                <Plane className="w-4 h-4 transform -rotate-45" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <span className="font-bold text-sm text-gray-900 dark:text-white tracking-tight">
                                                            {formatProperLocationName(latestFlight.origin)}
                                                        </span>
                                                        <span className="font-bold text-sm text-gray-900 dark:text-white tracking-tight">
                                                            {formatProperLocationName(latestFlight.destination)}
                                                        </span>
                                                    </div>
                                                    {latestFlight.departureDate && (
                                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 font-sans shrink-0">
                                                            {formatAirTrailDate(latestFlight.departureDate)}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                                    {latestFlight.provider || 'Flight'}
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
                                            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                                hoverInfo.object.isAirport 
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
        </div>
    );
};

export default DeckFlightMap;
