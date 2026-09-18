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
import { 
    Maximize2, 
    Scan, 
    Globe, 
    ArrowLeft, 
    ArrowRight, 
    X, 
    Plane, 
    Clock, 
    Calendar, 
    ChevronRight, 
    Train, 
    Ship, 
    Car,
    ZoomIn,
    ZoomOut
} from 'lucide-react';
import { Trip, CountryResidenceStatus, PredefinedMapMode, toggleCountryResidenceStatus, WorkspaceSettings } from '../types';
import { useWanderSync } from '../hooks/useWanderSync';
import { getCoordinatesSync, formatPlaceName } from '../services/geocoding';
import { 
    MapAppearanceSettings, 
    DEFAULT_MAP_APPEARANCE, 
    loadMapAppearanceSettings, 
    saveMapAppearanceSettings 
} from '../types/mapAppearance';
import { getTwilightGradientGeoJSON } from '../services/solarTerminator';
import { getLatestRainRadarMetadata, RainRadarMetadata } from '../services/rainViewer';
import { generateAirportRunway, RunwayGeometry, getPhysicalRunways } from '../services/airportRunways';
import { buildRouteCorridors, RouteCorridor, getApproxLocalTime } from '../services/routeCorridor';
import { getFlagEmoji, getRegion } from '../services/geoData';
import { fetchMultiModalRoute, getCachedMultiModalRoute } from '../services/multiModalRouting';
import { dataService } from '../services/mockDb';
import { formatDate } from '../utils/formatters';

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
    { lat: 55, lng: -100, color: [0, 122, 255] },    // NA: Vivid Blue
    { lat: -15, lng: -60, color: [0, 200, 83] },     // SA: Vivid Emerald
    { lat: 10, lng: 20, color: [255, 179, 0] },      // Africa: Vivid Amber/Gold
    { lat: 50, lng: 15, color: [124, 58, 237] },     // Europe: Vivid Violet
    { lat: 35, lng: 105, color: [255, 23, 68] },     // Asia: Vivid Red
    { lat: -25, lng: 135, color: [0, 229, 255] },    // Oceania: Vivid Cyan
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

    switch (layer) {
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
            tiles = isDark ? getCartoTiles('dark_all') : getCartoTiles('voyager');
            break;
        case 'default':
        default:
            tiles = isDark ? getCartoTiles('dark_all') : getCartoTiles('light_all');
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
    onChangeAppearanceSettings
}) => {
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
        if (activeAppearance.rainRadar) {
            getLatestRainRadarMetadata(
                activeAppearance.rainRadarColorScheme || 2,
                1,
                1
            ).then(meta => {
                if (meta) setRadarMeta(meta);
            });
        }
    }, [activeAppearance.rainRadar, activeAppearance.rainRadarColorScheme]);

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
    }, [corridorMap]);

    const handleResetCorridor = useCallback(() => {
        if (mapRef.current) {
            mapRef.current.flyTo({
                center: [0, 20],
                zoom: effectiveProjection === 'globe' ? 1.0 : 1.3,
                duration: 1000,
                essential: true
            });
        }
        setSelectedCorridor(null);
    }, [effectiveProjection]);

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

    // Auto-fit initial bounds
    const fittedRef = useRef(false);
    useEffect(() => {
        if (fittedRef.current || enrichedTrips.length === 0 || !mapRef.current) return;
        const pts: [number, number][] = [];
        enrichedTrips.forEach(trip => {
            trip.transports?.forEach(t => {
                if (t.originLat && t.originLng && !isNaN(t.originLat) && !isNaN(t.originLng)) pts.push([t.originLng, t.originLat]);
                if (t.destLat && t.destLng && !isNaN(t.destLat) && !isNaN(t.destLng)) pts.push([t.destLng, t.destLat]);
            });
        });
        if (pts.length > 0) {
            fittedRef.current = true;
            let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
            pts.forEach(([lng, lat]) => {
                if (lng < minLng) minLng = lng;
                if (lng > maxLng) maxLng = lng;
                if (lat < minLat) minLat = lat;
                if (lat > maxLat) maxLat = lat;
            });

            if (effectiveProjection === 'globe') {
                mapRef.current.flyTo({
                    center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2],
                    zoom: 1.0,
                    duration: 800,
                    essential: true
                });
            } else {
                mapRef.current.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
                    padding: 60,
                    maxZoom: 4.5,
                    duration: 800
                });
            }
        }
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

        // 1. Calculate frequencies and deduplicate flight corridors
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
                airportFreqMap.set(p1, (airportFreqMap.get(p1) || 0) + 1);
                airportFreqMap.set(p2, (airportFreqMap.get(p2) || 0) + 1);
                if (oCode) airportFreqMap.set(oCode, (airportFreqMap.get(oCode) || 0) + 1);
                if (dCode) airportFreqMap.set(dCode, (airportFreqMap.get(dCode) || 0) + 1);

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
                const baseOriginRadius = activeAppearance.airportSize === 'small' ? 3.5 : activeAppearance.airportSize === 'large' ? 7.5 : 5.0;
                const origFreq = airportFreqMap.get(p1) || 1;
                const destFreq = airportFreqMap.get(p2) || 1;

                if (!pointsMap.has(p1)) {
                    pointsMap.set(p1, {
                        position: [t.originLng, t.originLat, 0],
                        name: t.origin,
                        iata: isOriginAirport ? oCode : undefined,
                        isAirport: isOriginAirport,
                        tripId: trip.id,
                        color: isOriginAirport ? [250, 154, 29, 240] : [251, 191, 36, 240],
                        strokeColor: [255, 255, 255, 230],
                        radius: activeAppearance.airportMode === 'frequency'
                            ? Math.min(16, baseOriginRadius + Math.log2(origFreq) * 1.6)
                            : baseOriginRadius
                    });
                }
                if (!pointsMap.has(p2)) {
                    pointsMap.set(p2, {
                        position: [t.destLng, t.destLat, 0],
                        name: t.destination,
                        iata: isDestAirport ? dCode : undefined,
                        isAirport: isDestAirport,
                        tripId: trip.id,
                        color: isDestAirport ? [250, 154, 29, 240] : [251, 191, 36, 240],
                        strokeColor: [255, 255, 255, 230],
                        radius: activeAppearance.airportMode === 'frequency'
                            ? Math.min(16, baseOriginRadius + Math.log2(destFreq) * 1.6)
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

    // Build Deck.gl Layers
    const deckLayers = useMemo(() => {
        const layers: any[] = [];
        const isElevatedActive = effectiveProjection === 'globe' && elevatedRoutes;

        // 1. Solar Twilight Shading
        if (activeAppearance.timeOfDay) {
            const twilightData = getTwilightGradientGeoJSON();
            layers.push(
                new GeoJsonLayer({
                    id: 'solar-twilight-gradient',
                    data: twilightData,
                    filled: true,
                    stroked: false,
                    wrapLongitude: true,
                    getFillColor: () => [5, 8, 18, isDark ? 20 : 28],
                    pickable: false,
                    parameters: { blend: true, blendFunc: [770, 771] }
                })
            );
        }

        // 2. RainViewer Live Radar Layer
        if (activeAppearance.rainRadar && radarMeta?.tileUrl) {
            const opacity = activeAppearance.rainRadarOpacity ?? 0.85;
            layers.push(
                new TileLayer({
                    id: `rain-radar-${radarMeta.tileUrl}-${opacity}`,
                    data: radarMeta.tileUrl,
                    minZoom: 0,
                    maxZoom: 18,
                    tileSize: 256,
                    maxRequests: 20,
                    opacity,
                    renderSubLayers: (props: any) => {
                        const bbox = props.tile.bbox || {};
                        const west = bbox.west ?? -180;
                        const south = bbox.south ?? -85.05;
                        const east = bbox.east ?? 180;
                        const north = bbox.north ?? 85.05;
                        return new BitmapLayer(props, {
                            image: props.data,
                            bounds: [west, south, east, north]
                        } as any);
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
                        if (selectedCorridor && d.corridorId === selectedCorridor.id) return 3.5;
                        return hoveredRouteKey === d.corridorId ? 2.5 : 1.5;
                    },
                    widthUnits: 'pixels',
                    widthMinPixels: 1.2,
                    widthMaxPixels: 8,
                    capRounded: true,
                    jointRounded: true,
                    wrapLongitude: true,
                    pickable: true,
                    onHover: handleRouteHover,
                    onClick: handleRouteClick,
                    updateTriggers: {
                        getColor: [hoveredRouteKey, selectedCorridor?.id],
                        getWidth: [hoveredRouteKey, selectedCorridor?.id]
                    }
                })
            );
        }

        // 6. GPU Great-Circle Flight Arcs (AirTrail Benchmark Architecture)
        if (flightArcs.length > 0 && showFlightRoutes && viewMode !== 'scratch') {
            // Visible Arc Layer
            layers.push(
                new ArcLayer({
                    id: 'flight-arcs-layer',
                    data: flightArcs,
                    getSourcePosition: (d: any) => [d.originLng, d.originLat],
                    getTargetPosition: (d: any) => [d.destLng, d.destLat],
                    greatCircle: true,
                    getHeight: isElevatedActive ? 0.35 : 0,
                    getSourceColor: (d: any) => {
                        if (selectedCorridor) {
                            return d.corridorId === selectedCorridor.id ? [52, 211, 153, 255] : [100, 115, 135, 15];
                        }
                        if (hoveredRouteKey === d.corridorId) return [255, 255, 255, 255];
                        if (activeAppearance.routeColorMode === 'gradient') {
                            return [...getGeoGradientRGB(d.originLat, d.originLng), 235];
                        }
                        if (activeAppearance.routeColorMode === 'frequency') {
                            return [...getFrequencyRGB(d.count), 235];
                        }
                        return [59, 130, 246, 235];
                    },
                    getTargetColor: (d: any) => {
                        if (selectedCorridor) {
                            return d.corridorId === selectedCorridor.id ? [52, 211, 153, 255] : [100, 115, 135, 15];
                        }
                        if (hoveredRouteKey === d.corridorId) return [255, 255, 255, 255];
                        if (activeAppearance.routeColorMode === 'gradient') {
                            return [...getGeoGradientRGB(d.destLat, d.destLng), 235];
                        }
                        if (activeAppearance.routeColorMode === 'frequency') {
                            return [...getFrequencyRGB(d.count), 235];
                        }
                        return [59, 130, 246, 235];
                    },
                    getWidth: (d: any) => {
                        const baseStroke = isWidthByFreq
                            ? Math.min(4.5, 1.2 + Math.log2(d.count) * 0.75)
                            : 1.5;
                        const strokeWidth = baseStroke * scaleMultiplier;
                        if (selectedCorridor && d.corridorId === selectedCorridor.id) return strokeWidth * 2.2;
                        if (hoveredRouteKey === d.corridorId) return strokeWidth + 1.5;
                        return strokeWidth;
                    },
                    widthUnits: 'pixels',
                    widthMinPixels: 1,
                    widthMaxPixels: 12,
                    pickable: false, // Handled by wide ghost arc for effortless interaction
                    updateTriggers: {
                        getSourceColor: [selectedCorridor?.id, hoveredRouteKey, activeAppearance.routeColorMode],
                        getTargetColor: [selectedCorridor?.id, hoveredRouteKey, activeAppearance.routeColorMode],
                        getWidth: [selectedCorridor?.id, hoveredRouteKey, isWidthByFreq, scaleMultiplier]
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
                    getHeight: isElevatedActive ? 0.35 : 0,
                    getSourceColor: [0, 0, 0, 0],
                    getTargetColor: [0, 0, 0, 0],
                    getWidth: 16,
                    widthUnits: 'pixels',
                    pickable: true,
                    onHover: handleRouteHover,
                    onClick: handleRouteClick
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
                            if (selectedCorridor) {
                                const code = (d.iata || d.name || '').toUpperCase().trim();
                                if (code === selectedCorridor.originCode || code === selectedCorridor.destCode) {
                                    return d.radius * 1.5;
                                }
                            }
                            return d.radius;
                        },
                        radiusUnits: 'pixels',
                        radiusMinPixels: 2,
                        radiusMaxPixels: 24,
                        stroked: true,
                        lineWidthUnits: 'pixels',
                        getLineWidth: 1.2,
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
        handleRouteHover,
        handleRouteClick,
        onTripClick
    ]);

    // Initialize MapLibre GL Map & MapboxOverlay Bridge
    useEffect(() => {
        if (!mapContainerRef.current) return;

        const style = createMapLibreStyle(currentLayer, isDark, workspaceSettings?.cartoApiKey);

        const map = new maplibregl.Map({
            container: mapContainerRef.current,
            style,
            center: [0, 20],
            zoom: effectiveProjection === 'globe' ? 1.0 : 1.3,
            pitch: 0,
            bearing: 0,
            dragRotate: effectiveProjection === 'globe',
            attributionControl: false
        });

        const overlay = new MapboxOverlay({
            interleaved: false,
            layers: deckLayers
        });

        map.on('load', () => {
            isMapLoadedRef.current = true;
            try {
                if (effectiveProjection === 'globe' && (map as any).setProjection) {
                    (map as any).setProjection({ type: 'globe' });
                }
                map.addControl(overlay as any);
            } catch (err) {
                console.warn('[MapLibre] Load init warning:', err);
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
        if (overlayRef.current) {
            overlayRef.current.setProps({
                layers: deckLayers
            });
        }
    }, [deckLayers]);

    // Synchronize Basemap Style changes smoothly
    useEffect(() => {
        if (!mapRef.current) return;
        const nextStyle = createMapLibreStyle(currentLayer, isDark, workspaceSettings?.cartoApiKey);
        mapRef.current.setStyle(nextStyle);
    }, [currentLayer, isDark, workspaceSettings?.cartoApiKey]);

    // Synchronize Projection dynamically (Flat Mercator vs 3D Globe)
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !(map as any).setProjection) return;

        const isGlobe = effectiveProjection === 'globe';
        const applyProj = () => {
            try {
                (map as any).setProjection({ type: isGlobe ? 'globe' : 'mercator' });
                map.easeTo({
                    zoom: isGlobe ? 1.0 : 1.3,
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
    }, [effectiveProjection]);

    // Navigation Controls Handlers
    const handleZoomIn = () => {
        mapRef.current?.zoomIn({ duration: 300 });
    };

    const handleZoomOut = () => {
        mapRef.current?.zoomOut({ duration: 300 });
    };

    const handleReset100 = () => {
        mapRef.current?.flyTo({
            center: [0, 20],
            zoom: effectiveProjection === 'globe' ? 1.0 : 1.3,
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
            if (effectiveProjection === 'globe') {
                mapRef.current.flyTo({
                    center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2],
                    zoom: 1.1,
                    duration: 800,
                    essential: true
                });
            } else {
                mapRef.current.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
                    padding: 60,
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

            {/* Zoom & View Navigation Controls (Bottom Left) */}
            <div className="absolute bottom-6 left-6 z-20 flex flex-col gap-2">
                <div className="flex flex-col rounded-2xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-dark-card/85 backdrop-blur-xl shadow-glass-card overflow-hidden divide-y divide-black/10 dark:divide-white/10">
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
            </div>

            {/* Top-Center Floating "Back to previous view" Button */}
            {selectedCorridor && (
                <button
                    onClick={handleResetCorridor}
                    className="absolute top-5 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-full bg-white/90 dark:bg-dark-card/90 hover:bg-white dark:hover:bg-dark-card backdrop-blur-xl border border-black/10 dark:border-white/15 hover:border-primary-500/50 text-light-text dark:text-dark-text shadow-glass-modal transition-all flex items-center gap-2 cursor-pointer text-xs font-bold group animate-fade-in active:scale-95"
                >
                    <ArrowLeft className="w-3.5 h-3.5 text-primary-500 group-hover:-translate-x-0.5 transition-transform" />
                    <span>Back to previous view</span>
                </button>
            )}

            {/* Left Scratch Map Country Inspector & Labeling Card */}
            {selectedCountry && (
                <div 
                    className="absolute top-5 left-5 z-30 w-80 max-h-[calc(100%-2.5rem)] flex flex-col rounded-3xl bg-white/95 dark:bg-dark-card/95 backdrop-blur-sm border border-black/10 dark:border-white/15 shadow-glass-modal overflow-hidden text-light-text dark:text-dark-text animate-fade-in"
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

            {/* Left Route Mission Control Corridor Inspector Card */}
            {selectedCorridor && (
                <div className="absolute top-5 left-5 z-30 w-80 max-h-[calc(100%-2.5rem)] flex flex-col rounded-3xl bg-white/90 dark:bg-dark-card/90 backdrop-blur-sm border border-black/10 dark:border-white/15 shadow-glass-modal overflow-hidden text-light-text dark:text-dark-text animate-fade-in" style={{ WebkitBackdropFilter: 'blur(4px)' }}>
                    <div className="p-4 pb-3 flex items-center justify-between border-b border-black/5 dark:border-white/10 bg-gradient-to-r from-primary-500/5 to-transparent shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-primary-500">Route Corridor</span>
                            <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20">
                                ACTIVE FOCUS
                            </span>
                        </div>
                        <button
                            onClick={handleResetCorridor}
                            className="p-1.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text transition-all cursor-pointer"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="p-4 space-y-3">
                        {(() => {
                            const originTime = getApproxLocalTime(selectedCorridor.originCoords[0]);
                            return (
                                <div className="p-3 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-1">
                                    <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate block font-medium">
                                        {formatPlaceName(selectedCorridor.originName)}
                                    </span>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xl leading-none">{selectedCorridor.originFlag}</span>
                                            <span className="text-lg font-bold tracking-tight text-light-text dark:text-dark-text">{formatPlaceName(selectedCorridor.originCode)}</span>
                                            <ChevronRight className="w-3.5 h-3.5 text-light-text-secondary/60 dark:text-dark-text-secondary/60" />
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xs font-bold text-light-text dark:text-dark-text block">{originTime.timeStr}</span>
                                            <span className="text-2xs text-light-text-secondary dark:text-dark-text-secondary">{originTime.dateStr} · {originTime.utcOffsetStr}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        <div className="flex items-center justify-between px-2 text-xs text-light-text-secondary dark:text-dark-text-secondary font-medium">
                            <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span>{selectedCorridor.distanceKm.toLocaleString()} km</span>
                            </div>
                            <span>
                                {Math.abs(Math.round((selectedCorridor.originCoords[0] - selectedCorridor.destCoords[0]) / 15)) === 0 
                                    ? 'same local time' 
                                    : `${Math.abs(Math.round((selectedCorridor.originCoords[0] - selectedCorridor.destCoords[0]) / 15))}h time diff`}
                            </span>
                        </div>

                        {(() => {
                            const destTime = getApproxLocalTime(selectedCorridor.destCoords[0]);
                            return (
                                <div className="p-3 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-1">
                                    <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate block font-medium">
                                        {formatPlaceName(selectedCorridor.destName)}
                                    </span>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xl leading-none">{selectedCorridor.destFlag}</span>
                                            <span className="text-lg font-bold tracking-tight text-light-text dark:text-dark-text">{formatPlaceName(selectedCorridor.destCode)}</span>
                                            <ChevronRight className="w-3.5 h-3.5 text-light-text-secondary/60 dark:text-dark-text-secondary/60" />
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xs font-bold text-light-text dark:text-dark-text block">{destTime.timeStr}</span>
                                            <span className="text-2xs text-light-text-secondary dark:text-dark-text-secondary">{destTime.dateStr} · {destTime.utcOffsetStr}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>

                    {(() => {
                        const rawMode = selectedCorridor.flights[0]?.mode || 'Flight';
                        const modeStr = String(rawMode).toLowerCase();
                        const isTrain = modeStr.includes('train') || modeStr.includes('rail');
                        const isSea = ['cruise', 'ferry', 'boat', 'ship'].some(m => modeStr.includes(m));
                        const isRoad = ['car', 'drive', 'bus', 'road', 'taxi'].some(m => modeStr.includes(m));

                        const totalTitle = isTrain ? 'Total Journeys' : isSea ? 'Total Voyages' : isRoad ? 'Total Drives' : 'Total Flights';
                        const logTitle = isTrain ? 'Rail Log' : isSea ? 'Maritime Log' : isRoad ? 'Road Trip Log' : 'Flight Log';

                        return (
                            <div className="px-4 pb-4 space-y-2">
                                <div className="grid grid-cols-2 gap-2 text-center">
                                    <div className="p-2.5 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5">
                                        <span className="text-2xs text-light-text-secondary dark:text-dark-text-secondary uppercase font-bold tracking-wider block">{totalTitle}</span>
                                        <span className="text-base font-bold text-primary-500">{selectedCorridor.flights.length}</span>
                                    </div>
                                    <div className="p-2.5 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5">
                                        <span className="text-2xs text-light-text-secondary dark:text-dark-text-secondary uppercase font-bold tracking-wider block">Direct Distance</span>
                                        <span className="text-base font-bold text-light-text dark:text-dark-text">{selectedCorridor.distanceKm} km</span>
                                    </div>
                                </div>

                                <div className="p-3 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-2">
                                    <span className="text-2xs text-light-text-secondary dark:text-dark-text-secondary uppercase font-bold tracking-wider block">{logTitle} ({selectedCorridor.flights.length})</span>
                                    <div className="max-h-40 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                                        {selectedCorridor.flights.map((f, idx) => {
                                            const fMode = String(f.mode || '').toLowerCase();
                                            const isF_Rail = fMode.includes('train') || fMode.includes('rail');
                                            const isF_Sea = ['cruise', 'ferry', 'boat', 'ship'].some(m => fMode.includes(m));
                                            const isF_Road = ['car', 'drive', 'bus', 'road', 'taxi'].some(m => fMode.includes(m));

                                            return (
                                                <div key={idx} className="flex items-center justify-between text-xs py-1 px-2 rounded-xl bg-white/50 dark:bg-white/[0.04] border border-black/5 dark:border-white/5 hover:bg-white/80 dark:hover:bg-white/[0.08] transition-colors">
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        {isF_Rail ? (
                                                            <Train className="w-3 h-3 text-purple-500 shrink-0" />
                                                        ) : isF_Sea ? (
                                                            <Ship className="w-3 h-3 text-cyan-500 shrink-0" />
                                                        ) : isF_Road ? (
                                                            <Car className="w-3 h-3 text-amber-500 shrink-0" />
                                                        ) : (
                                                            <Plane className="w-3 h-3 text-primary-500 shrink-0" />
                                                        )}
                                                        <span className="font-semibold text-light-text dark:text-dark-text truncate">{f.provider || (isF_Rail ? 'Train' : isF_Sea ? 'Ferry/Cruise' : isF_Road ? 'Drive' : 'Flight')}</span>
                                                        {f.identifier && (
                                                            <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary font-mono">#{f.identifier}</span>
                                                        )}
                                                    </div>
                                                    {f.departureDate && (
                                                        <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary font-mono shrink-0">
                                                            {formatDate(f.departureDate, 'short-with-year')}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* Interactive Object Hover HUD Tooltip */}
            {hoverInfo?.object && !selectedCorridor && !selectedCountry && (
                <div 
                    className="absolute pointer-events-none z-50 transition-all duration-75"
                    style={{ left: hoverInfo.x + 12, top: hoverInfo.y + 12 }}
                >
                    {hoverInfo.object.corridorId ? (() => {
                        const c = corridorMap.get(hoverInfo.object.corridorId);
                        if (!c) return null;

                        const rawMode = hoverInfo.object.mode || c.flights[0]?.mode || 'Flight';
                        const modeStr = String(rawMode).toLowerCase();
                        const isTrain = modeStr.includes('train') || modeStr.includes('rail');
                        const isSea = ['cruise', 'ferry', 'boat', 'ship'].some(m => modeStr.includes(m));
                        const isRoad = ['car', 'drive', 'bus', 'road', 'taxi'].some(m => modeStr.includes(m));

                        const typeLabel = isTrain 
                            ? '🚆 RAIL ROUTE' 
                            : isSea 
                                ? '🚢 MARITIME ROUTE' 
                                : isRoad 
                                    ? '🚗 ROAD ROUTE' 
                                    : '✈️ FLIGHT CORRIDOR';

                        const countLabel = isTrain
                            ? (c.totalFlights === 1 ? 'Train Journey' : 'Train Journeys')
                            : isSea
                                ? (c.totalFlights === 1 ? 'Voyage' : 'Voyages')
                                : isRoad
                                    ? (c.totalFlights === 1 ? 'Drive' : 'Drives')
                                    : (c.totalFlights === 1 ? 'Flight' : 'Flights');

                        return (
                            <div className="bg-white/90 dark:bg-dark-card/90 text-light-text dark:text-dark-text border border-black/10 dark:border-white/15 rounded-3xl shadow-glass-modal backdrop-blur-sm p-4 min-w-[280px] text-xs animate-fade-in space-y-3" style={{ WebkitBackdropFilter: 'blur(4px)' }}>
                                <div className="flex items-center justify-between border-b border-black/5 dark:border-white/10 pb-2.5">
                                    <div className="flex items-center gap-2">
                                        <span className="text-base leading-none">{c.originFlag}</span>
                                        <span className="font-bold text-sm text-light-text dark:text-dark-text tracking-tight">{formatPlaceName(c.originCode)}</span>
                                        <ArrowRight className="w-3.5 h-3.5 text-light-text-secondary dark:text-dark-text-secondary" />
                                        <span className="font-bold text-sm text-light-text dark:text-dark-text tracking-tight">{formatPlaceName(c.destCode)}</span>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20">
                                        {typeLabel}
                                    </span>
                                </div>

                                <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary leading-snug">
                                    <span className="font-semibold text-light-text dark:text-dark-text">{formatPlaceName(c.originName)}</span>
                                    <span className="opacity-50 mx-1">→</span>
                                    <span className="font-semibold text-light-text dark:text-dark-text">{formatPlaceName(c.destName)}</span>
                                </div>

                                <div className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 font-mono text-light-text-secondary dark:text-dark-text-secondary">
                                    <span>{c.distanceKm.toLocaleString()} km</span>
                                    <span>
                                        {Math.abs(Math.round((c.originCoords[0] - c.destCoords[0]) / 15)) === 0 ? 'Same timezone' : `${Math.abs(Math.round((c.originCoords[0] - c.destCoords[0]) / 15))}h time diff`}
                                    </span>
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                                            {countLabel} <span className="text-light-text dark:text-dark-text ml-1 font-bold">{c.totalFlights}</span>
                                        </span>
                                    </div>
                                </div>
                            </div>
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
                            <div className="bg-white/90 dark:bg-dark-card/90 text-light-text dark:text-dark-text border border-black/10 dark:border-white/15 rounded-3xl shadow-glass-modal backdrop-blur-sm p-4 min-w-[240px] text-xs animate-fade-in space-y-2.5" style={{ WebkitBackdropFilter: 'blur(4px)' }}>
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
                        );
                    })() : (
                        <div className="bg-white/90 dark:bg-dark-card/90 text-light-text dark:text-dark-text border border-black/10 dark:border-white/15 rounded-2xl shadow-glass-card backdrop-blur-xl p-3.5 min-w-[220px] text-xs animate-fade-in" style={{ WebkitBackdropFilter: 'blur(24px)' }}>
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
                                            {hoverInfo.object.iata || 'AERODROME'}
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
                                            {formatPlaceName(hoverInfo.object.name)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default DeckFlightMap;
