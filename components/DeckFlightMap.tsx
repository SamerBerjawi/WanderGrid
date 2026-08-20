import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DeckGL } from '@deck.gl/react';
import { MapView, _GlobeView } from '@deck.gl/core';
import { ScatterplotLayer, GeoJsonLayer, PathLayer, BitmapLayer, TextLayer } from '@deck.gl/layers';
import { TileLayer, TripsLayer } from '@deck.gl/geo-layers';
import { Maximize2, Scan, Globe, ArrowLeft, ArrowRight, X, Plane, Clock, Calendar, ChevronRight, Train, Ship, Car } from 'lucide-react';
import { Trip, CountryResidenceStatus, PredefinedMapMode } from '../types';
import { getCoordinatesSync } from '../services/geocoding';
import { 
    MapAppearanceSettings, 
    DEFAULT_MAP_APPEARANCE, 
    loadMapAppearanceSettings, 
    saveMapAppearanceSettings 
} from '../types/mapAppearance';
import { getTwilightGradientGeoJSON } from '../services/solarTerminator';
import { getLatestRainRadarMetadata, RainRadarMetadata } from '../services/rainViewer';
import { generateAirportRunway, isKnownAirport, RunwayGeometry } from '../services/airportRunways';
import { buildRouteCorridors, RouteCorridor, getApproxLocalTime } from '../services/routeCorridor';
import { getFlagEmoji, getRegion } from '../services/geoData';
import { fetchMultiModalRoute, getCachedMultiModalRoute } from '../services/multiModalRouting';

// --- Enhanced Country Matching Helper for Scratch Map & Overlays ---
let geoJsonMemoryCache: any = null;

export const isCountryVisited = (f: any, visitedList: string[]): boolean => {
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

// --- Exact Gradient Color Logic & Regional Poles ---
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
// Smoothly ascends: Cool Electric Cyan -> Emerald Mint -> Radiant Sun Gold -> Vivid Blaze Orange -> Hot Crimson Red -> Intense Hyper Magenta
const getFrequencyRGB = (freq: number): [number, number, number] => {
    if (freq <= 1) return [6, 182, 212];    // Electric Cyan / Teal (1 flight) - #06b6d4
    if (freq === 2) return [16, 185, 129];  // Emerald Mint Green (2 flights) - #10b981
    if (freq <= 4) return [234, 179, 8];    // Radiant Sun Gold (3-4 flights) - #eab308
    if (freq <= 7) return [249, 115, 22];   // Vivid Blaze Orange (5-7 flights) - #f97316
    if (freq <= 11) return [239, 68, 68];   // Hot Crimson Red (8-11 flights) - #ef4444
    return [236, 72, 153];                  // Intense Hyper Magenta / Plasma Pink (12+ flights) - #ec4899
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

// OSRM in-memory cache for realistic road geometries
const osrmCache = new Map<string, [number, number][]>();
const pendingOsrmFetches = new Set<string>();

const fetchOsrmGeometry = async (startLat: number, startLng: number, endLat: number, endLng: number, onDone: () => void) => {
    const key = `${startLat.toFixed(3)},${startLng.toFixed(3)}|${endLat.toFixed(3)},${endLng.toFixed(3)}`;
    if (osrmCache.has(key) || pendingOsrmFetches.has(key)) return;

    pendingOsrmFetches.add(key);
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            if (data?.routes?.[0]?.geometry?.coordinates) {
                const coords: [number, number][] = data.routes[0].geometry.coordinates;
                osrmCache.set(key, coords);
                onDone();
            }
        }
    } catch {
        // Fallback
    } finally {
        pendingOsrmFetches.delete(key);
    }
};

// SLERP Great Circle Interpolation with 3D Altitude Parabolic Arch
const curvePointsCache = new Map<string, [number, number, number][]>();

const getGeodesicPoints = (
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
    elevated: boolean = false,
    isGlobe: boolean = false
): [number, number, number][] => {
    const key = `${lat1.toFixed(3)},${lng1.toFixed(3)}|${lat2.toFixed(3)},${lng2.toFixed(3)}|${elevated}|${isGlobe}`;
    const cached = curvePointsCache.get(key);
    if (cached) return cached;

    const rad = Math.PI / 180;
    const phi1 = lat1 * rad;
    const lambda1 = lng1 * rad;
    const phi2 = lat2 * rad;
    const lambda2 = lng2 * rad;

    const cosD = Math.sin(phi1) * Math.sin(phi2) + Math.cos(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);
    const d = Math.acos(Math.max(-1, Math.min(1, cosD)));

    if (d < 1e-6) {
        const pts: [number, number, number][] = [[lng1, lat1, 0], [lng2, lat2, 0]];
        curvePointsCache.set(key, pts);
        return pts;
    }

    const distKm = d * 6371;
    const maxAlt = elevated ? Math.min(1200000, Math.max(180000, distKm * 140)) : 0;
    const numPoints = Math.max(30, Math.min(120, Math.round(distKm / 120)));
    const sinD = Math.sin(d);

    const points: [number, number, number][] = [];
    let prevLngDeg = lng1;

    for (let i = 0; i <= numPoints; i++) {
        const f = i / numPoints;
        const A = Math.sin((1 - f) * d) / sinD;
        const B = Math.sin(f * d) / sinD;

        const x = A * Math.cos(phi1) * Math.cos(lambda1) + B * Math.cos(phi2) * Math.cos(lambda2);
        const y = A * Math.cos(phi1) * Math.sin(lambda1) + B * Math.cos(phi2) * Math.sin(lambda2);
        const z = A * Math.sin(phi1) + B * Math.sin(phi2);

        const latRad = Math.atan2(z, Math.sqrt(x * x + y * y));
        let lngRad = Math.atan2(y, x);

        let lngDeg = lngRad / rad;
        const latDeg = latRad / rad;

        if (!isGlobe) {
            while (lngDeg - prevLngDeg > 180) {
                lngDeg -= 360;
            }
            while (lngDeg - prevLngDeg < -180) {
                lngDeg += 360;
            }
            prevLngDeg = lngDeg;
        }

        const alt = elevated ? Math.pow(Math.sin(f * Math.PI), 0.85) * maxAlt : 0;
        points.push([lngDeg, latDeg, alt]);
    }

    curvePointsCache.set(key, points);
    return points;
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
    countryStatusMap?: Record<string, CountryResidenceStatus>;
    onUpdateCountryStatus?: (countryCode: string, countryName: string, status: CountryResidenceStatus | 'none') => void;
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

    const currentLayer = (activeLayerProp as DeckLayerType) || activeAppearance.basemap || 'standard';

    // Default Zoom: 0.35 on 3D Globe to view the entire spherical globe comfortably
    const [viewState, setViewState] = useState({
        longitude: 15,
        latitude: 25,
        zoom: effectiveProjection === 'globe' ? 0.35 : 2.0,
        pitch: 0,
        bearing: 0,
        maxZoom: 18,
        minZoom: 0.1
    });

    // Update zoom when projection changes
    useEffect(() => {
        setViewState(prev => ({
            ...prev,
            zoom: effectiveProjection === 'globe' ? Math.min(prev.zoom, 0.4) : Math.max(prev.zoom, 1.8),
            pitch: 0,
            bearing: 0
        }));
    }, [effectiveProjection]);

    // Configure Deck.gl Views with ultra-smooth mouse scroll zoom
    const views = useMemo(() => {
        const controllerConfig = {
            dragPan: true,
            scrollZoom: { speed: 0.04, smooth: true },
            doubleClickZoom: true,
            touchZoom: true,
            inertia: 250
        };

        if (effectiveProjection === 'globe') {
            return [
                new _GlobeView({
                    id: 'globe',
                    controller: {
                        ...controllerConfig,
                        dragRotate: true,
                        touchRotate: true
                    },
                    farZMultiplier: 5.0,
                    nearZMultiplier: 0.01,
                    resolution: 5
                })
            ];
        }
        return [
            new MapView({
                id: 'map',
                repeat: true,
                controller: {
                    ...controllerConfig,
                    dragRotate: false
                }
            })
        ];
    }, [effectiveProjection]);

    const [hoverInfo, setHoverInfo] = useState<any>(null);
    const [geoJsonData, setGeoJsonData] = useState<any>(null);
    const [selectedCorridor, setSelectedCorridor] = useState<RouteCorridor | null>(null);
    const [selectedCountry, setSelectedCountry] = useState<any | null>(null);
    const [previousViewState, setPreviousViewState] = useState<any | null>(null);

    // Load high-detail country & map-unit GeoJSON (50m detailed vector with England, Scotland, Wales, NI units)
    useEffect(() => {
        if (geoJsonMemoryCache) {
            setGeoJsonData(geoJsonMemoryCache);
            return;
        }

        const normalizeCountriesData = (countriesData: any, ukUnitsData?: any) => {
            if (!countriesData || !countriesData.features) return countriesData;

            // 1. Clean and normalize countries dataset
            const cleanedFeatures = countriesData.features
                .filter((f: any) => {
                    const p = f.properties || {};
                    // Exclude generic UK main country polygon if UK home nation subunits are provided
                    const isUKMain = ukUnitsData && (p.SOVEREIGNT === 'United Kingdom' || p.NAME === 'United Kingdom') && p.TYPE === 'Sovereign country';
                    return !isUKMain;
                })
                .map((f: any) => {
                    const p = f.properties || {};
                    // Fix -99 ISO codes with official 2-letter codes where available
                    if ((!p.ISO_A2 || p.ISO_A2 === '-99') && p.ISO_A2_EH && p.ISO_A2_EH !== '-99') {
                        p.ISO_A2 = p.ISO_A2_EH;
                    }
                    if (p.NAME === 'Norway' && (!p.ISO_A2 || p.ISO_A2 === '-99')) {
                        p.ISO_A2 = 'NO';
                    }
                    if (p.NAME === 'France' && (!p.ISO_A2 || p.ISO_A2 === '-99')) {
                        p.ISO_A2 = 'FR';
                    }
                    if (p.NAME === 'Kosovo' && (!p.ISO_A2 || p.ISO_A2 === '-99')) {
                        p.ISO_A2 = 'XK';
                    }
                    return f;
                });

            // 2. Inject UK home nations (England, Scotland, Wales, Northern Ireland) if loaded
            if (ukUnitsData && ukUnitsData.features) {
                ukUnitsData.features.forEach((f: any) => {
                    const p = f.properties || {};
                    const gu = (p.GU_A3 || '').toUpperCase();
                    const nm = (p.NAME || '').toLowerCase();

                    if (gu === 'ENG' || nm === 'england') {
                        p.ISO_A2 = 'GB-ENG';
                        p.ISO_A2_EH = 'GB-ENG';
                        p.wb_a2 = 'GB-ENG';
                        p.NAME = 'England';
                        p.NAME_LONG = 'England';
                        p.SOVEREIGNT = 'United Kingdom';
                        cleanedFeatures.push(f);
                    } else if (gu === 'SCT' || nm === 'scotland') {
                        p.ISO_A2 = 'GB-SCT';
                        p.ISO_A2_EH = 'GB-SCT';
                        p.wb_a2 = 'GB-SCT';
                        p.NAME = 'Scotland';
                        p.NAME_LONG = 'Scotland';
                        p.SOVEREIGNT = 'United Kingdom';
                        cleanedFeatures.push(f);
                    } else if (gu === 'WLS' || nm === 'wales') {
                        p.ISO_A2 = 'GB-WLS';
                        p.ISO_A2_EH = 'GB-WLS';
                        p.wb_a2 = 'GB-WLS';
                        p.NAME = 'Wales';
                        p.NAME_LONG = 'Wales';
                        p.SOVEREIGNT = 'United Kingdom';
                        cleanedFeatures.push(f);
                    } else if (gu === 'NIR' || nm === 'n. ireland' || nm === 'northern ireland') {
                        p.ISO_A2 = 'GB-NIR';
                        p.ISO_A2_EH = 'GB-NIR';
                        p.wb_a2 = 'GB-NIR';
                        p.NAME = 'Northern Ireland';
                        p.NAME_LONG = 'Northern Ireland';
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
                // Fetch unified countries dataset and map units (for UK constituent home nations) in parallel
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
                // Fallback to standard resolution countries
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
                console.warn('DeckGL: GeoJSON load failed', err);
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
    const handleSelectCorridor = (corridorId: string) => {
        const corridor = corridorMap.get(corridorId);
        if (!corridor) return;

        if (!selectedCorridor) {
            setPreviousViewState({ ...viewState });
        }

        const centerLng = (corridor.originCoords[0] + corridor.destCoords[0]) / 2;
        const centerLat = (corridor.originCoords[1] + corridor.destCoords[1]) / 2;

        let targetZoom = 5.2;
        if (corridor.distanceKm < 600) targetZoom = 6.6;
        else if (corridor.distanceKm < 1800) targetZoom = 5.3;
        else if (corridor.distanceKm < 4000) targetZoom = 4.2;
        else if (corridor.distanceKm < 8000) targetZoom = 3.2;
        else targetZoom = 2.4;

        setViewState(prev => ({
            ...prev,
            longitude: centerLng,
            latitude: centerLat,
            zoom: targetZoom,
            pitch: effectiveProjection === 'globe' ? 24 : 0,
            bearing: 0,
            transitionDuration: 1200
        }));

        setSelectedCorridor(corridor);
    };

    // Reset corridor focus and restore previous viewpoint
    const handleResetCorridor = () => {
        if (previousViewState) {
            setViewState(prev => ({
                ...prev,
                ...previousViewState,
                transitionDuration: 1000
            }));
            setPreviousViewState(null);
        }
        setSelectedCorridor(null);
    };

    // Request Multi-Modal geometries for routes (Highways, Rail, Maritime)
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
    }, [
        enrichedTrips, 
        showRoadTracing, 
        activeAppearance.routeTracing
    ]);

    // Focus camera on transport coordinates
    useEffect(() => {
        if (focusTransportCoordinates) {
            setViewState(prev => ({
                ...prev,
                longitude: focusTransportCoordinates.lng,
                latitude: focusTransportCoordinates.lat,
                zoom: Math.max(prev.zoom, 5)
            }));
        }
    }, [focusTransportCoordinates]);

    // Auto-fit initial bounds (Globe defaults to whole earth zoom 0.35)
    const fittedRef = useRef(false);
    useEffect(() => {
        if (fittedRef.current || enrichedTrips.length === 0) return;
        const pts: [number, number][] = [];
        enrichedTrips.forEach(trip => {
            trip.transports?.forEach(t => {
                if (t.originLat && t.originLng) pts.push([t.originLng, t.originLat]);
                if (t.destLat && t.destLng) pts.push([t.destLng, t.destLat]);
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
            setViewState(prev => ({
                ...prev,
                longitude: (minLng + maxLng) / 2,
                latitude: (minLat + maxLat) / 2,
                zoom: effectiveProjection === 'globe' ? 0.35 : Math.min(4, Math.max(1.8, Math.log2(360 / Math.max(maxLng - minLng, 30))))
            }));
        }
    }, [enrichedTrips, effectiveProjection]);

    // Basemap Tile URLs & Native Max Zoom Level
    const { tileUrl, maxZoomForLayer } = useMemo(() => {
        switch (currentLayer) {
            case 'satellite':
                return {
                    tileUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                    maxZoomForLayer: 19
                };
            case 'ocean':
                return {
                    tileUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
                    maxZoomForLayer: 10
                };
            case 'citylights':
                return {
                    tileUrl: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png',
                    maxZoomForLayer: 8
                };
            case 'default':
            default:
                return {
                    tileUrl: isDark
                        ? [
                            'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
                            'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
                            'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
                            'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'
                          ]
                        : [
                            'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
                            'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
                            'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
                            'https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png'
                          ],
                    maxZoomForLayer: 19
                };
        }
    }, [currentLayer, isDark]);

    // Build Routes, Comet Trips & Airport Hubs
    const isElevatedActive = effectiveProjection === 'globe' && elevatedRoutes;

    const { 
        routeSegments, 
        trackSegments, 
        hitTestPaths, 
        cometTrips, 
        airportPoints, 
        clusterNodes,
        detailedRunways 
    } = useMemo(() => {
        const flowSegs: any[] = [];
        const trackSegs: any[] = [];
        const hitPaths: any[] = [];
        const comets: any[] = [];
        const pointsMap = new Map<string, any>();
        const airportFreqMap = new Map<string, number>();
        const frequencies = new Map<string, number>();
        const runwayGeometries: RunwayGeometry[] = [];
        const processedRunwayKeys = new Set<string>();

        // 1. Compute route & airport frequencies
        enrichedTrips.forEach(trip => {
            trip.transports?.forEach(t => {
                if (t.originLat && t.originLng && t.destLat && t.destLng) {
                    const p1 = `${t.originLat.toFixed(3)},${t.originLng.toFixed(3)}`;
                    const p2 = `${t.destLat.toFixed(3)},${t.destLng.toFixed(3)}`;
                    const key = p1 < p2 ? `${p1}|${p2}` : `${p2}|${p1}`;
                    frequencies.set(key, (frequencies.get(key) || 0) + 1);

                    airportFreqMap.set(p1, (airportFreqMap.get(p1) || 0) + 1);
                    airportFreqMap.set(p2, (airportFreqMap.get(p2) || 0) + 1);

                    const oCode = (t.origin || '').toUpperCase().trim();
                    const dCode = (t.destination || '').toUpperCase().trim();
                    if (oCode) airportFreqMap.set(oCode, (airportFreqMap.get(oCode) || 0) + 1);
                    if (dCode) airportFreqMap.set(dCode, (airportFreqMap.get(dCode) || 0) + 1);
                }
            });
        });

        // Scale Multipliers
        const scaleMultiplier = activeAppearance.routeScale === 'thin' 
            ? 0.65 
            : activeAppearance.routeScale === 'thick' 
                ? 1.75 
                : 1.0;

        const isWidthByFreq = activeAppearance.routeWidthMode === 'frequency' || showFrequencyWeight;

        // 2. Build multi-segment gradient paths
        enrichedTrips.forEach(trip => {
            const fallbackRGB = getStatusRGB(trip);

            trip.transports?.forEach(t => {
                if (!t.originLat || !t.originLng || !t.destLat || !t.destLng) return;

                const isFlight = !t.mode || t.mode === 'Flight';
                const isTrain = (t.mode || '').toLowerCase().includes('train') || (t.mode || '').toLowerCase().includes('rail');
                const isCarBus = ['Car Rental', 'Personal Car', 'Bus', 'Road Trip', 'Driving', 'Car', 'Taxi'].some(m => (t.mode || '').toLowerCase().includes(m.toLowerCase()));
                const isSea = ['Cruise', 'Ferry', 'Boat', 'Ship'].some(m => (t.mode || '').toLowerCase().includes(m.toLowerCase()));

                const shouldRenderRoute = (isFlight && showFlightRoutes) || (!isFlight && showLandSeaRoutes);

                const p1Key = `${t.originLat.toFixed(3)},${t.originLng.toFixed(3)}`;
                const p2Key = `${t.destLat.toFixed(3)},${t.destLng.toFixed(3)}`;
                const freqKey = p1Key < p2Key ? `${p1Key}|${p2Key}` : `${p2Key}|${p1Key}`;
                const freq = frequencies.get(freqKey) || 1;

                const uniqueRouteKey = `${trip.id}_${t.origin}_${t.destination}_${t.departureDate || ''}_${t.identifier || ''}`;
                
                const baseStroke = isWidthByFreq 
                    ? Math.min(2.8, 1.0 + Math.log2(freq) * 0.45) 
                    : 1.2;
                const strokeWidth = baseStroke * scaleMultiplier;

                // Check for high-fidelity multi-modal route geometry (Rail & Highway only)
                const isTracingEnabled = showRoadTracing || activeAppearance.routeTracing !== false;
                const isTrackableOverland = isTrain || isCarBus;
                const cachedMultiModalCoords = (isTrackableOverland && isTracingEnabled) ? getCachedMultiModalRoute(
                    t.mode,
                    t.originLat,
                    t.originLng,
                    t.destLat,
                    t.destLng
                ) : null;

                // Coordinates
                let fullPath: [number, number, number][] = [];
                if (cachedMultiModalCoords && cachedMultiModalCoords.length > 0) {
                    fullPath = cachedMultiModalCoords;
                } else if (isFlight) {
                    fullPath = getGeodesicPoints(t.originLat, t.originLng, t.destLat, t.destLng, isElevatedActive, effectiveProjection === 'globe');
                } else {
                    // Maritime, Cruises, Ferries & Standard Land
                    fullPath = [[t.originLng, t.originLat, 0]];
                    if (t.waypoints) {
                        t.waypoints.forEach((w: any) => {
                            if (w.coordinates) fullPath.push([w.coordinates.lng, w.coordinates.lat, 0]);
                        });
                    }
                    fullPath.push([t.destLng, t.destLat, 0]);
                }

                // Determine Color (Distinct Palette per Modality)
                let modeRGB: [number, number, number] = isTrain
                    ? [168, 85, 247] // Vibrant High-Speed Rail Electric Purple / Indigo
                    : isCarBus
                        ? [245, 158, 11] // Warm Amber / Roadway Gold
                        : isSea 
                            ? [6, 182, 212] // Sea Teal / Maritime Cyan
                            : (activeAppearance.routeColorMode === 'frequency' 
                                ? getFrequencyRGB(freq)
                                : (activeAppearance.routeColorMode === 'default' 
                                    ? [59, 130, 246] 
                                    : fallbackRGB));

                // Process Route Geometries if route channel is active
                if (shouldRenderRoute) {
                    const oCode = (t.origin || '').toUpperCase().trim();
                    const dCode = (t.destination || '').toUpperCase().trim();
                    const corridorId = oCode < dCode ? `${oCode}<->${dCode}` : `${dCode}<->${oCode}`;

                    hitPaths.push({
                        path: fullPath,
                        routeKey: uniqueRouteKey,
                        corridorId,
                        tripId: trip.id,
                        tripName: trip.name,
                        origin: t.origin,
                        destination: t.destination,
                        provider: t.provider || (isFlight ? 'Flight' : t.mode),
                        identifier: t.identifier || '',
                        date: t.departureDate,
                        mode: t.mode || (isFlight ? 'Flight' : 'Transit')
                    });

                    if (animateRoutes && fullPath.length > 1) {
                        const timestamps = fullPath.map((_, idx) => (idx / (fullPath.length - 1)) * 1800);
                        const cometColor = isFlight
                            ? (activeAppearance.routeColorMode === 'gradient' 
                                ? getGeoGradientRGB(t.destLat, t.destLng) 
                                : modeRGB)
                            : modeRGB;

                        comets.push({
                            path: fullPath,
                            timestamps,
                            corridorId,
                            color: [...cometColor, 255],
                            width: strokeWidth + 2.0
                        });
                    }

                    const useRegionalGradient = activeAppearance.routeColorMode === 'gradient' && showGradientRoutes;

                    if (useRegionalGradient && isFlight && fullPath.length > 2) {
                        const numSections = 6;
                        const pointsPerSection = Math.ceil(fullPath.length / numSections);

                        for (let s = 0; s < numSections; s++) {
                            const startIdx = s * pointsPerSection;
                            const endIdx = Math.min(fullPath.length - 1, (s + 1) * pointsPerSection);
                            if (startIdx >= endIdx) break;

                            const sectionPoints = fullPath.slice(startIdx, endIdx + 1);
                            const midPt = sectionPoints[Math.floor(sectionPoints.length / 2)];
                            const sectionRGB = getGeoGradientRGB(midPt[1], midPt[0]);

                            flowSegs.push({
                                path: sectionPoints,
                                color: [...sectionRGB, 235],
                                rawColor: sectionRGB,
                                routeKey: uniqueRouteKey,
                                corridorId,
                                width: strokeWidth,
                                tripId: trip.id,
                                tripName: trip.name,
                                origin: t.origin,
                                destination: t.destination,
                                provider: t.provider || 'Flight',
                                identifier: t.identifier || '',
                                date: t.departureDate,
                                mode: t.mode || 'Flight'
                            });

                            trackSegs.push({
                                path: sectionPoints,
                                color: [...sectionRGB, isElevatedActive ? 60 : 40],
                                rawColor: sectionRGB,
                                routeKey: uniqueRouteKey,
                                corridorId,
                                width: strokeWidth + 1.2
                            });
                        }
                    } else {
                        flowSegs.push({
                            path: fullPath,
                            color: [...modeRGB, 225],
                            rawColor: modeRGB,
                            routeKey: uniqueRouteKey,
                            corridorId,
                            width: strokeWidth,
                            tripId: trip.id,
                            tripName: trip.name,
                            origin: t.origin,
                            destination: t.destination,
                            provider: t.provider || t.mode,
                            identifier: t.identifier || '',
                            date: t.departureDate,
                            mode: t.mode || 'Transit'
                        });

                        trackSegs.push({
                            path: fullPath,
                            color: [...modeRGB, 40],
                            rawColor: modeRGB,
                            routeKey: uniqueRouteKey,
                            corridorId,
                            width: strokeWidth + 1.2
                        });
                    }
                }

                // Airport Sizing (Independent of route line visibility)
                const baseAirportRadius = activeAppearance.airportSize === 'off' 
                    ? 0 
                    : activeAppearance.airportSize === 'small' 
                        ? 2.5 
                        : activeAppearance.airportSize === 'large' 
                            ? 7.2 
                            : 4.2;

                const getCalculatedRadius = (pKey: string, code?: string) => {
                    if (baseAirportRadius === 0) return 0;
                    if (activeAppearance.airportMode === 'frequency') {
                        const count = airportFreqMap.get(pKey) || (code ? airportFreqMap.get(code) : undefined) || 1;
                        const multiplier = 1 + 0.45 * Math.log2(count);
                        return Math.min(22, baseAirportRadius * multiplier);
                    }
                    return baseAirportRadius;
                };

                const useRegionalGradient = activeAppearance.routeColorMode === 'gradient' && showGradientRoutes;

                // Airport Hubs vs City Nodes (Distinct visual styling & runway exclusivity)
                const isOriginAirport = isKnownAirport(t.origin) || (isFlight && (t.origin?.length === 3 || t.origin?.length === 4));
                const isDestAirport = isKnownAirport(t.destination) || (isFlight && (t.destination?.length === 3 || t.destination?.length === 4));

                const oCode = (t.origin || '').toUpperCase().trim();
                const dCode = (t.destination || '').toUpperCase().trim();

                const oKey = `${t.originLat.toFixed(3)},${t.originLng.toFixed(3)}`;
                if (!pointsMap.has(oKey)) {
                    const oCount = airportFreqMap.get(oKey) || airportFreqMap.get(oCode) || 1;
                    const hubRGB = activeAppearance.routeColorMode === 'frequency'
                        ? getFrequencyRGB(oCount)
                        : (useRegionalGradient 
                            ? getGeoGradientRGB(t.originLat, t.originLng) 
                            : modeRGB);
                    const r = getCalculatedRadius(oKey, oCode);
                    
                    pointsMap.set(oKey, {
                        position: [t.originLng, t.originLat, 0],
                        name: t.origin,
                        iata: oCode,
                        flightCount: oCount,
                        isAirport: isOriginAirport,
                        type: isOriginAirport ? 'airport' : 'city',
                        color: isOriginAirport ? [...hubRGB, 255] : [245, 158, 11, 240], // Aviation gradient for airport, warm amber for city
                        strokeColor: isDark 
                            ? (isOriginAirport ? [255, 255, 255, 220] : [251, 191, 36, 220]) 
                            : (isOriginAirport ? [15, 23, 42, 220] : [180, 83, 9, 220]),
                        radius: isOriginAirport ? r : Math.max(2.2, r * 0.75),
                        tripId: trip.id
                    });

                    // ONLY generate runway geometry for verified airports
                    if (isOriginAirport && activeAppearance.airportDetail === 'detailed' && !processedRunwayKeys.has(oKey)) {
                        processedRunwayKeys.add(oKey);
                        const rw = generateAirportRunway(t.origin, t.originLat, t.originLng);
                        if (rw) runwayGeometries.push(rw);
                    }
                }

                const dKey = `${t.destLat.toFixed(3)},${t.destLng.toFixed(3)}`;
                if (!pointsMap.has(dKey)) {
                    const dCount = airportFreqMap.get(dKey) || airportFreqMap.get(dCode) || 1;
                    const hubRGB = activeAppearance.routeColorMode === 'frequency'
                        ? getFrequencyRGB(dCount)
                        : (useRegionalGradient 
                            ? getGeoGradientRGB(t.destLat, t.destLng) 
                            : modeRGB);
                    const r = getCalculatedRadius(dKey, dCode);

                    pointsMap.set(dKey, {
                        position: [t.destLng, t.destLat, 0],
                        name: t.destination,
                        iata: dCode,
                        flightCount: dCount,
                        isAirport: isDestAirport,
                        type: isDestAirport ? 'airport' : 'city',
                        color: isDestAirport ? [...hubRGB, 255] : [245, 158, 11, 240],
                        strokeColor: isDark 
                            ? (isDestAirport ? [255, 255, 255, 220] : [251, 191, 36, 220]) 
                            : (isDestAirport ? [15, 23, 42, 220] : [180, 83, 9, 220]),
                        radius: isDestAirport ? r : Math.max(2.2, r * 0.75),
                        tripId: trip.id
                    });

                    // ONLY generate runway geometry for verified airports
                    if (isDestAirport && activeAppearance.airportDetail === 'detailed' && !processedRunwayKeys.has(dKey)) {
                        processedRunwayKeys.add(dKey);
                        const rw = generateAirportRunway(t.destination, t.destLat, t.destLng);
                        if (rw) runwayGeometries.push(rw);
                    }
                }
            });
        });

        // 3. Cluster Markers Logic
        const allAirports = Array.from(pointsMap.values()).filter(pt => pt.radius > 0);
        const clusters: any[] = [];
        if (clusterMode) {
            const grid = new Map<string, any[]>();
            const gridSize = 1.8;
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
                        name: `${pts.length} Airports Cluster`,
                        color: [37, 99, 235, 240],
                        haloColor: [59, 130, 246, 80],
                        radius: Math.min(18, 9 + Math.log2(pts.length) * 3),
                        isCluster: true
                    });
                }
            });
        }

        return {
            routeSegments: flowSegs,
            trackSegments: trackSegs,
            hitTestPaths: hitPaths,
            cometTrips: comets,
            airportPoints: allAirports,
            clusterNodes: clusters,
            detailedRunways: runwayGeometries
        };
    }, [
        enrichedTrips, 
        showFrequencyWeight, 
        showGradientRoutes, 
        showFlightRoutes, 
        showLandSeaRoutes, 
        isDark, 
        isElevatedActive, 
        animateRoutes, 
        clusterMode, 
        showRoadTracing,
        activeAppearance
    ]);

    // Animation timer for Comet Flow TripsLayer (scoped after cometTrips is computed)
    const [animTime, setAnimTime] = useState(0);
    useEffect(() => {
        if (!animateRoutes || cometTrips.length === 0) return;
        let animationFrame: number;
        let lastUpdate = 0;
        const start = performance.now();
        const loopDuration = 1800;

        const animate = (now: number) => {
            // Throttle layer frame updates to ~30fps to cut CPU/GPU overhead by 50%
            if (now - lastUpdate >= 32) {
                setAnimTime((now - start) % loopDuration);
                lastUpdate = now;
            }
            animationFrame = requestAnimationFrame(animate);
        };
        animationFrame = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationFrame);
    }, [animateRoutes, cometTrips.length]);

    // Build Deck.gl Base Layers (static & interaction-driven, decoupled from animation frame clock)
    const baseLayers = useMemo(() => {
        const layerList: any[] = [];

        // 1. WebGL Basemap TileLayer (Dynamic multi-resolution vector/raster tile pyramid up to Zoom 19)
        layerList.push(
            new TileLayer({
                id: `basemap-tile-layer-${currentLayer}-${isDark ? 'dark' : 'light'}-${effectiveProjection}`,
                data: Array.isArray(tileUrl) ? tileUrl : [tileUrl],
                minZoom: 0,
                maxZoom: maxZoomForLayer,
                tileSize: 256,
                maxRequests: 20,
                refinementStrategy: 'best-available',
                extent: [-180, -85.051129, 180, 85.051129],
                renderSubLayers: (props: any) => {
                    const tile = props.tile;
                    const bbox = tile.bbox || {};
                    const west = bbox.west ?? tile.boundingBox?.[0]?.[0] ?? -180;
                    const south = bbox.south ?? tile.boundingBox?.[0]?.[1] ?? -85.051129;
                    const east = bbox.east ?? tile.boundingBox?.[1]?.[0] ?? 180;
                    const north = bbox.north ?? tile.boundingBox?.[1]?.[1] ?? 85.051129;

                    return new BitmapLayer(props, {
                        data: (null as any),
                        image: props.data,
                        bounds: [west, south, east, north],
                        textureParameters: {
                            minFilter: 'linear',
                            magFilter: 'linear'
                        }
                    } as any);
                }
            })
        );

        // 2. Solar Terminator Ultra-Smooth Spherical Twilight Shading
        if (activeAppearance.timeOfDay) {
            const twilightData = getTwilightGradientGeoJSON();
            layerList.push(
                new GeoJsonLayer({
                    id: 'solar-twilight-gradient-layer',
                    data: twilightData,
                    filled: true,
                    stroked: false,
                    wrapLongitude: true,
                    getFillColor: () => {
                        const isSatellite = activeAppearance.basemap === 'satellite';
                        const baseAlpha = isSatellite ? 26 : (isDark ? 16 : 22);
                        return [5, 8, 18, baseAlpha];
                    },
                    updateTriggers: {
                        getFillColor: [isDark, activeAppearance.basemap]
                    },
                    pickable: false,
                    parameters: {
                        blend: true,
                        blendFunc: [770, 771]
                    }
                })
            );
        }

        // 3. RainViewer Live Rain Radar Layer
        if (activeAppearance.rainRadar && radarMeta?.tileUrl) {
            const opacity = activeAppearance.rainRadarOpacity !== undefined ? activeAppearance.rainRadarOpacity : 0.85;
            layerList.push(
                new TileLayer({
                    id: `rain-radar-layer-${radarMeta.tileUrl}-${opacity}`,
                    data: radarMeta.tileUrl,
                    minZoom: 0,
                    maxZoom: 18,
                    tileSize: 256,
                    maxRequests: 20,
                    opacity,
                    renderSubLayers: (props: any) => {
                        const tile = props.tile;
                        const bbox = tile.bbox || {};
                        const west = bbox.west ?? tile.boundingBox?.[0]?.[0] ?? -180;
                        const south = bbox.south ?? tile.boundingBox?.[0]?.[1] ?? -85.051129;
                        const east = bbox.east ?? tile.boundingBox?.[1]?.[0] ?? 180;
                        const north = bbox.north ?? tile.boundingBox?.[1]?.[1] ?? 85.051129;

                        return new BitmapLayer(props, {
                            data: (null as any),
                            image: props.data,
                            bounds: [west, south, east, north]
                        } as any);
                    }
                })
            );
        }

        // 4. Detailed Airport Runway Markings Layer (Ground Truth GPS Coordinates)
        if (activeAppearance.airportDetail === 'detailed' && detailedRunways.length > 0) {
            const allStrips: { path: [number, number, number][]; width: number }[] = [];
            const allTaxiways: [number, number, number][][] = [];
            const allThresholds: [number, number, number][][] = [];

            detailedRunways.forEach(r => {
                r.runwayPaths.forEach(rp => {
                    allStrips.push({ path: rp.stripPath, width: rp.widthMeters });
                });
                r.taxiwayPaths.forEach(tp => allTaxiways.push(tp));
                r.thresholdMarkings.forEach(tm => allThresholds.push(tm));
            });

            // Runway Asphalt Pavement Strips
            layerList.push(
                new PathLayer({
                    id: 'runway-strips-layer',
                    data: allStrips,
                    getPath: (d: any) => d.path,
                    getColor: isDark ? [15, 23, 42, 255] : [51, 65, 85, 255],
                    getWidth: (d: any) => d.width || 45,
                    widthUnits: 'meters',
                    widthMinPixels: 2.0,
                    widthMaxPixels: 60,
                    capRounded: false,
                    wrapLongitude: true,
                    pickable: false
                })
            );

            // Taxiway Network Lines (Aviation Yellow #eab308)
            if (allTaxiways.length > 0) {
                layerList.push(
                    new PathLayer({
                        id: 'taxiway-lines-layer',
                        data: allTaxiways,
                        getPath: (d: any) => d,
                        getColor: [234, 179, 8, 230],
                        getWidth: 18,
                        widthUnits: 'meters',
                        widthMinPixels: 1.2,
                        widthMaxPixels: 15,
                        wrapLongitude: true,
                        pickable: false
                    })
                );
            }

            // Runway White Centerline
            layerList.push(
                new PathLayer({
                    id: 'runway-centerline-layer',
                    data: allStrips,
                    getPath: (d: any) => d.path,
                    getColor: [248, 250, 252, 230],
                    getWidth: 2.5,
                    widthUnits: 'meters',
                    widthMinPixels: 1.0,
                    widthMaxPixels: 5,
                    wrapLongitude: true,
                    pickable: false
                })
            );

            // Piano Keys White Markings at thresholds
            if (allThresholds.length > 0) {
                layerList.push(
                    new PathLayer({
                        id: 'runway-thresholds-layer',
                        data: allThresholds,
                        getPath: (d: any) => d,
                        getColor: [255, 255, 255, 240],
                        getWidth: 3.5,
                        widthUnits: 'meters',
                        widthMinPixels: 1.0,
                        widthMaxPixels: 8,
                        wrapLongitude: true,
                        pickable: false
                    })
                );
            }
        }

        // 5. Country Polygons (GeoJSON) - Scratch Map Regional Colors, Residence Tints & Detailed Boundaries
        if (geoJsonData && (showCountries || viewMode === 'scratch')) {
            const showLived = activeAppearance.showLivedCountries !== false;
            const showWishlist = activeAppearance.showWishlistCountries !== false;
            const showLayover = activeAppearance.showLayoverCountries !== false;

            layerList.push(
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
                        const status = (iso2 && countryStatusMap?.[iso2]) || (name && countryStatusMap?.[name]);

                        if (status === 'wishlist') {
                            if (showWishlist) {
                                return [244, 63, 94, 240];
                            }
                            return isDark ? [50, 60, 80, 160] : [195, 200, 215, 180];
                        }

                        if (status === 'layover') {
                            if (showLayover) {
                                return [245, 158, 11, 240]; // Vibrant Amber-Gold for Layover
                            }
                            return isDark ? [50, 60, 80, 160] : [195, 200, 215, 180];
                        }

                        if (showLived && (status === 'lived_current' || status === 'lived_past')) {
                            return status === 'lived_current' ? [16, 185, 129, 240] : [99, 102, 241, 240];
                        }

                        return isDark ? [50, 60, 80, 160] : [195, 200, 215, 180];
                    },
                    getLineWidth: (f: any) => {
                        const p = f.properties || {};
                        const iso2 = (p.ISO_A2 && p.ISO_A2 !== '-99' ? p.ISO_A2 : (p.ISO_A2_EH || p.wb_a2 || '')).toUpperCase();
                        const name = (p.NAME || p.NAME_LONG || '').toUpperCase();
                        const status = (iso2 && countryStatusMap?.[iso2]) || (name && countryStatusMap?.[name]);
                        const isSpecial = (showLived && (status === 'lived_current' || status === 'lived_past')) || 
                                          (showWishlist && status === 'wishlist') ||
                                          (showLayover && status === 'layover');
                        return isSpecial ? 1.4 : 0.8;
                    },
                    lineWidthUnits: 'pixels',
                    lineWidthMinPixels: 0.8,
                    getFillColor: (f: any) => {
                        const p = f.properties || {};
                        const iso2 = (p.ISO_A2 && p.ISO_A2 !== '-99' ? p.ISO_A2 : (p.ISO_A2_EH || p.wb_a2 || '')).toUpperCase();
                        const name = (p.NAME || p.NAME_LONG || '').toUpperCase();
                        const status = (iso2 && countryStatusMap?.[iso2]) || (name && countryStatusMap?.[name]);

                        if (status === 'wishlist') {
                            if (showWishlist) {
                                return isDark ? [244, 63, 94, 90] : [244, 63, 94, 80]; // Rose Shimmer for Wishlist
                            }
                            // If wishlist is toggled off, the country should NOT be colored (render as unvisited foil)
                            return viewMode === 'scratch'
                                ? (isDark ? [18, 22, 34, 230] : [232, 236, 242, 230])
                                : [0, 0, 0, 0];
                        }

                        if (status === 'layover') {
                            if (showLayover) {
                                return isDark ? [245, 158, 11, 140] : [245, 158, 11, 120]; // Warm Amber Tone for Transit
                            }
                            return viewMode === 'scratch'
                                ? (isDark ? [18, 22, 34, 230] : [232, 236, 242, 230])
                                : [0, 0, 0, 0];
                        }

                        if (showLived && status === 'lived_current') {
                            return [16, 185, 129, 225]; // Vibrant Emerald for Active Residence
                        }
                        if (showLived && status === 'lived_past') {
                            return [99, 102, 241, 225]; // Vibrant Indigo for Past Residence
                        }

                        const visited = isCountryVisited(f, visitedCountries);
                        if (visited) {
                            const center = getFeatureCentroid(f);
                            const rgb = getGeoGradientRGB(center.lat, center.lng);
                            return [...rgb, viewMode === 'scratch' ? 215 : 130];
                        }
                        return viewMode === 'scratch'
                            ? (isDark ? [18, 22, 34, 230] : [232, 236, 242, 230])
                            : [0, 0, 0, 0];
                    },
                    pickable: true,
                    autoHighlight: viewMode === 'scratch',
                    highlightColor: [250, 154, 29, 45],
                    onHover: (info: any) => {
                        if (viewMode === 'scratch' || showCountries) {
                            setHoverInfo(info.object ? info : null);
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

        // 6. Scratch Map Visited Place Pins (Customizable Size & Visibility)
        const scratchCitySizeSetting = activeAppearance.scratchCitySize !== undefined ? activeAppearance.scratchCitySize : 'medium';
        if (viewMode === 'scratch' && scratchCitySizeSetting !== 'off' && visitedPlaces.length > 0) {
            const sizeConfigs = {
                small: { radius: 3.5, minPixels: 2.5, maxPixels: 7, strokeWidth: 1.0 },
                medium: { radius: 5.5, minPixels: 4.5, maxPixels: 10, strokeWidth: 1.5 },
                large: { radius: 8.5, minPixels: 6.5, maxPixels: 14, strokeWidth: 2.0 },
            };
            const sizeCfg = sizeConfigs[scratchCitySizeSetting as 'small' | 'medium' | 'large'] || sizeConfigs.medium;

            layerList.push(
                new ScatterplotLayer({
                    id: 'scratch-visited-places',
                    data: visitedPlaces,
                    getPosition: (d: any) => [d.lng, d.lat, 0],
                    getFillColor: [250, 154, 29, 250],
                    getLineColor: [255, 255, 255, 240],
                    getRadius: sizeCfg.radius,
                    radiusUnits: 'pixels',
                    radiusMinPixels: sizeCfg.minPixels,
                    radiusMaxPixels: sizeCfg.maxPixels,
                    stroked: true,
                    lineWidthUnits: 'pixels',
                    getLineWidth: sizeCfg.strokeWidth,
                    wrapLongitude: true,
                    pickable: true,
                    onHover: (info: any) => info.object && setHoverInfo(info),
                    updateTriggers: {
                        getRadius: [scratchCitySizeSetting],
                        getLineWidth: [scratchCitySizeSetting]
                    }
                })
            );
        }

        // 7. Underlying Glow Track Layer
        if (viewMode !== 'scratch' && trackSegments.length > 0) {
            layerList.push(
                new PathLayer({
                    id: `route-track-glow-${isElevatedActive ? 'elevated' : 'flat'}`,
                    data: trackSegments,
                    getPath: (d: any) => d.path,
                    getColor: (d: any) => {
                        if (selectedCorridor) {
                            return d.corridorId === selectedCorridor.id
                                ? [52, 211, 153, 140]
                                : [100, 115, 135, 10];
                        }
                        const isHovered = hoveredRouteKey === d.routeKey;
                        if (isHovered) {
                            return [...(d.rawColor || [255, 255, 255]), 200];
                        }
                        return d.color;
                    },
                    getWidth: (d: any) => {
                        if (selectedCorridor) {
                            return d.corridorId === selectedCorridor.id ? d.width + 3.6 : 0.8;
                        }
                        const isHovered = hoveredRouteKey === d.routeKey;
                        return isHovered ? d.width + 3.2 : d.width;
                    },
                    widthUnits: 'pixels',
                    widthMinPixels: 1,
                    widthMaxPixels: 6,
                    capRounded: true,
                    jointRounded: true,
                    wrapLongitude: true,
                    pickable: false,
                    parameters: { depthTest: true },
                    updateTriggers: {
                        getColor: [hoveredRouteKey, selectedCorridor?.id],
                        getWidth: [hoveredRouteKey, selectedCorridor?.id]
                    }
                })
            );
        }

        // 8. Flight & Transit Flow Layer
        if (viewMode !== 'scratch' && routeSegments.length > 0) {
            layerList.push(
                new PathLayer({
                    id: `route-flow-lines-${isElevatedActive ? 'elevated' : 'flat'}`,
                    data: routeSegments,
                    getPath: (d: any) => d.path,
                    getColor: (d: any) => {
                        if (selectedCorridor) {
                            return d.corridorId === selectedCorridor.id
                                ? [52, 211, 153, 255]
                                : [120, 130, 145, 25];
                        }
                        const isHovered = hoveredRouteKey === d.routeKey;
                        if (isHovered) {
                            return [255, 255, 255, 255];
                        }
                        return d.color;
                    },
                    getWidth: (d: any) => {
                        if (selectedCorridor) {
                            return d.corridorId === selectedCorridor.id ? Math.max(3.8, d.width * 2.2) : 0.8;
                        }
                        const isHovered = hoveredRouteKey === d.routeKey;
                        return isHovered ? d.width + 1.2 : d.width;
                    },
                    widthUnits: 'pixels',
                    widthMinPixels: 1,
                    widthMaxPixels: 6.0,
                    capRounded: true,
                    jointRounded: true,
                    wrapLongitude: true,
                    pickable: false,
                    parameters: { depthTest: true },
                    updateTriggers: {
                        getColor: [hoveredRouteKey, selectedCorridor?.id],
                        getWidth: [hoveredRouteKey, selectedCorridor?.id]
                    }
                })
            );
        }

        // 9. Wide Hit-Test Layer
        if (viewMode !== 'scratch' && hitTestPaths.length > 0) {
            layerList.push(
                new PathLayer({
                    id: `route-hit-test-layer-${isElevatedActive ? 'elevated' : 'flat'}`,
                    data: hitTestPaths,
                    getPath: (d: any) => d.path,
                    getColor: [0, 0, 0, 0],
                    getWidth: 18,
                    widthUnits: 'pixels',
                    widthMinPixels: 14,
                    capRounded: true,
                    jointRounded: true,
                    wrapLongitude: true,
                    pickable: true,
                    onHover: (info: any) => {
                        if (info.object) {
                            setHoveredRouteKey(info.object.routeKey);
                            setHoverInfo(info);
                        } else {
                            setHoveredRouteKey(null);
                            setHoverInfo(null);
                        }
                    },
                    onClick: (info: any) => {
                        if (info.object?.corridorId) {
                            handleSelectCorridor(info.object.corridorId);
                        } else if (info.object?.tripId && onTripClick) {
                            onTripClick(info.object.tripId);
                        }
                    }
                })
            );
        }

        // 10. Airport & City Node Markers / Cluster Markers
        if (showCityMarkers && activeAppearance.airportSize !== 'off') {
            if (clusterMode && clusterNodes.length > 0) {
                layerList.push(
                    new ScatterplotLayer({
                        id: 'airport-cluster-halos',
                        data: clusterNodes.filter((c: any) => c.isCluster),
                        getPosition: (d: any) => d.position,
                        getFillColor: (d: any) => d.haloColor,
                        getRadius: (d: any) => d.radius * 1.5,
                        radiusUnits: 'pixels',
                        wrapLongitude: true,
                        pickable: false
                    })
                );
                layerList.push(
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
                    })
                );
                layerList.push(
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
                layerList.push(
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
                                return isDark ? [100, 115, 135, 30] : [160, 175, 195, 30];
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
                        radiusMinPixels: 1.5,
                        radiusMaxPixels: 24,
                        stroked: true,
                        lineWidthUnits: 'pixels',
                        getLineWidth: 1.2,
                        wrapLongitude: true,
                        pickable: true,
                        autoHighlight: true,
                        highlightColor: [255, 255, 255, 255],
                        onHover: (info: any) => {
                            if (info.object) {
                                setHoverInfo(info);
                            }
                        },
                        onClick: (info: any) => info.object && onTripClick && onTripClick(info.object.tripId),
                        updateTriggers: {
                            getFillColor: [selectedCorridor?.id, isDark, activeAppearance.routeColorMode, activeAppearance.airportMode],
                            getLineColor: [selectedCorridor?.id, isDark],
                            getRadius: [selectedCorridor?.id, activeAppearance.airportMode, activeAppearance.airportSize]
                        }
                    })
                );
            }
        }

        return layerList;
    }, [
        tileUrl, 
        currentLayer, 
        geoJsonData, 
        routeSegments, 
        trackSegments, 
        hitTestPaths, 
        airportPoints, 
        clusterNodes, 
        detailedRunways,
        showCountries, 
        viewMode, 
        showCityMarkers, 
        visitedCountries, 
        visitedPlaces, 
        isDark, 
        effectiveProjection, 
        isElevatedActive, 
        hoveredRouteKey, 
        clusterMode,
        activeAppearance,
        radarMeta,
        selectedCorridor
    ]);

    // Fast dynamic layer composition: only the lightweight TripsLayer rebuilds on animation frame ticks
    const layers = useMemo(() => {
        const list = [...baseLayers];
        if (viewMode !== 'scratch' && animateRoutes && cometTrips.length > 0) {
            list.push(
                new TripsLayer({
                    id: `comet-flow-trips-${isElevatedActive ? 'elevated' : 'flat'}`,
                    data: cometTrips,
                    getPath: (d: any) => d.path,
                    getTimestamps: (d: any) => d.timestamps,
                    getColor: (d: any) => {
                        if (selectedCorridor) {
                            return d.corridorId === selectedCorridor.id
                                ? [52, 211, 153, 255]
                                : [120, 130, 145, 12];
                        }
                        return d.color;
                    },
                    currentTime: animTime,
                    trailLength: 350,
                    getWidth: (d: any) => d.width,
                    widthUnits: 'pixels',
                    widthMinPixels: 2.2,
                    capRounded: true,
                    jointRounded: true,
                    wrapLongitude: true,
                    parameters: { depthTest: true }
                })
            );
        }
        return list;
    }, [
        baseLayers,
        viewMode,
        animateRoutes,
        cometTrips,
        isElevatedActive,
        selectedCorridor,
        animTime
    ]);

    // Reset to 100% standard baseline perspective
    const handleReset100 = () => {
        setViewState(prev => ({
            ...prev,
            longitude: 0,
            latitude: 20,
            zoom: effectiveProjection === 'globe' ? 0.35 : 1.5,
            pitch: 0,
            bearing: 0
        }));
    };

    // Fit view to all existing routes & destinations
    const handleFitBounds = () => {
        let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
        let hasCoords = false;

        enrichedTrips.forEach(trip => {
            trip.transports?.forEach(t => {
                if (t.originLat && t.originLng) {
                    minLat = Math.min(minLat, t.originLat);
                    maxLat = Math.max(maxLat, t.originLat);
                    minLng = Math.min(minLng, t.originLng);
                    maxLng = Math.max(maxLng, t.originLng);
                    hasCoords = true;
                }
                if (t.destLat && t.destLng) {
                    minLat = Math.min(minLat, t.destLat);
                    maxLat = Math.max(maxLat, t.destLat);
                    minLng = Math.min(minLng, t.destLng);
                    maxLng = Math.max(maxLng, t.destLng);
                    hasCoords = true;
                }
            });
        });

        if (hasCoords) {
            const fitZoom = effectiveProjection === 'globe' 
                ? 0.35 
                : Math.min(4, Math.max(1.5, Math.log2(360 / Math.max(maxLng - minLng, 30))));

            setViewState(prev => ({
                ...prev,
                longitude: (minLng + maxLng) / 2,
                latitude: (minLat + maxLat) / 2,
                zoom: fitZoom
            }));
        } else {
            handleReset100();
        }
    };

    return (
        <div className="relative w-full h-full overflow-hidden select-none bg-light-bg dark:bg-[#050505]">
            {/* Deck.gl 60 FPS WebGL Canvas with Mouse Scroll Zoom enabled */}
            <DeckGL
                views={views}
                viewState={viewState as any}
                controller={true}
                onViewStateChange={({ viewState: newViewState }: any) => {
                    setViewState(prev => ({
                        ...prev,
                        ...newViewState,
                        zoom: Math.min(18, Math.max(0, newViewState.zoom ?? prev.zoom))
                    }));
                }}
                onClick={(info: any) => {
                    if (info.object?.properties && (viewMode === 'scratch' || showCountries)) {
                        setSelectedCountry(info.object);
                    }
                }}
                layers={layers}
                pickingRadius={10}
                parameters={{
                    clearColor: isDark ? [0.0196, 0.0196, 0.0196, 1] : [0.98, 0.98, 0.98, 1]
                } as any}
                getCursor={({ isHovering, isDragging }) => (isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab')}
            />

            {/* Zoom & View Navigation Controls (Bottom Left) */}
            <div className="absolute bottom-6 left-6 z-20 flex flex-col gap-2">
                <div className="flex flex-col rounded-2xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-dark-card/85 backdrop-blur-xl shadow-glass-card overflow-hidden divide-y divide-black/10 dark:divide-white/10">
                    <button
                        onClick={() => setViewState(v => ({ ...v, zoom: Math.min(v.zoom + 0.8, 18) }))}
                        className="w-10 h-10 flex items-center justify-center text-light-text dark:text-dark-text hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer font-bold text-lg transition-colors active:scale-95"
                        title="Zoom In (+)"
                    >
                        +
                    </button>
                    <button
                        onClick={() => setViewState(v => ({ ...v, zoom: Math.max(v.zoom - 0.8, 0.1) }))}
                        className="w-10 h-10 flex items-center justify-center text-light-text dark:text-dark-text hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer font-bold text-lg transition-colors active:scale-95"
                        title="Zoom Out (−)"
                    >
                        −
                    </button>
                    <button
                        onClick={handleReset100}
                        className="w-10 h-10 flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer font-bold text-[10px] tracking-tight transition-colors active:scale-95"
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
                    className="absolute top-5 left-5 z-30 w-80 max-h-[calc(100%-2.5rem)] flex flex-col rounded-3xl bg-white/95 dark:bg-dark-card/95 backdrop-blur-2xl border border-black/10 dark:border-white/15 shadow-glass-modal overflow-hidden text-light-text dark:text-dark-text animate-fade-in"
                    style={{ WebkitBackdropFilter: 'blur(40px)' }}
                >
                    {(() => {
                        const p = selectedCountry.properties || {};
                        const name = p.NAME || p.NAME_LONG || p.ADMIN || p.SOVEREIGNT || 'Country';
                        const iso2 = (p.ISO_A2 && p.ISO_A2 !== '-99' ? p.ISO_A2 : (p.ISO_A2_EH || p.wb_a2 || '')).toUpperCase();
                        const isVisited = isCountryVisited(selectedCountry, visitedCountries);
                        const currentStatus: CountryResidenceStatus | 'unexplored' = 
                            (iso2 && countryStatusMap?.[iso2]) || 
                            (name && countryStatusMap?.[name.toUpperCase()]) || 
                            (isVisited ? 'visited' : 'unexplored');
                        const flag = iso2 ? getFlagEmoji(iso2) : '🏳️';
                        const region = p.REGION_UN || p.SUBREGION || p.CONTINENT || (iso2 ? getRegion(iso2) : '');

                        return (
                            <>
                                {/* Header */}
                                <div className="p-4 pb-3 flex items-center justify-between border-b border-black/5 dark:border-white/10 bg-gradient-to-r from-primary-500/5 to-transparent shrink-0">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <span className="text-2xl leading-none">{flag}</span>
                                        <div className="min-w-0">
                                            <h3 className="text-sm font-bold text-light-text dark:text-dark-text tracking-tight truncate">{name}</h3>
                                            <p className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary truncate">{region || 'Territory'}</p>
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
                                    {/* Status Readout Banner */}
                                    <div className="p-3 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 flex items-center justify-between">
                                        <span className="text-[10px] uppercase font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider">Classification</span>
                                        {currentStatus === 'lived_current' ? (
                                            <span className="px-2.5 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                                🏠 Current Residence
                                            </span>
                                        ) : currentStatus === 'lived_past' ? (
                                            <span className="px-2.5 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 flex items-center gap-1">
                                                🏛️ Past Residence
                                            </span>
                                        ) : currentStatus === 'layover' ? (
                                            <span className="px-2.5 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
                                                🛫 Layover Only
                                            </span>
                                        ) : currentStatus === 'wishlist' ? (
                                            <span className="px-2.5 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center gap-1">
                                                🌟 Wish List
                                            </span>
                                        ) : isVisited ? (
                                            <span className="px-2.5 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-primary-500/15 text-primary-600 dark:text-primary-400 border border-primary-500/30 flex items-center gap-1">
                                                ✨ Explored
                                            </span>
                                        ) : (
                                            <span className="px-2.5 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-black/5 dark:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary border border-black/10 dark:border-white/10">
                                                🧭 Unexplored
                                            </span>
                                        )}
                                    </div>

                                    {/* Interactive Label Selector */}
                                    <div className="space-y-2">
                                        <label className="block text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                                            Residence & Classification Tag
                                        </label>

                                        <div className="grid grid-cols-1 gap-2">
                                            {/* 1. Live Here */}
                                            <button
                                                type="button"
                                                onClick={() => onUpdateCountryStatus?.(iso2, name, currentStatus === 'lived_current' ? 'none' : 'lived_current')}
                                                className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                                                    currentStatus === 'lived_current'
                                                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold shadow-sm'
                                                        : 'bg-white/60 dark:bg-dark-card/60 border-black/5 dark:border-white/10 hover:border-black/15 text-light-text dark:text-dark-text'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <span className="text-lg">🏠</span>
                                                    <div>
                                                        <p className="text-xs font-bold">Currently Live Here</p>
                                                        <p className="text-[9px] text-light-text-secondary dark:text-dark-text-secondary">Active home / residence</p>
                                                    </div>
                                                </div>
                                                {currentStatus === 'lived_current' && <span className="text-xs font-bold text-emerald-500">✓</span>}
                                            </button>

                                            {/* 2. Lived in Past */}
                                            <button
                                                type="button"
                                                onClick={() => onUpdateCountryStatus?.(iso2, name, currentStatus === 'lived_past' ? 'none' : 'lived_past')}
                                                className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                                                    currentStatus === 'lived_past'
                                                        ? 'bg-indigo-500/15 border-indigo-500 text-indigo-600 dark:text-indigo-400 font-bold shadow-sm'
                                                        : 'bg-white/60 dark:bg-dark-card/60 border-black/5 dark:border-white/10 hover:border-black/15 text-light-text dark:text-dark-text'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <span className="text-lg">🏛️</span>
                                                    <div>
                                                        <p className="text-xs font-bold">Lived Here in the Past</p>
                                                        <p className="text-[9px] text-light-text-secondary dark:text-dark-text-secondary">Former home / study / work</p>
                                                    </div>
                                                </div>
                                                {currentStatus === 'lived_past' && <span className="text-xs font-bold text-indigo-500">✓</span>}
                                            </button>

                                            {/* 3. Visited / Explored */}
                                            <button
                                                type="button"
                                                onClick={() => onUpdateCountryStatus?.(iso2, name, currentStatus === 'visited' ? 'none' : 'visited')}
                                                className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                                                    currentStatus === 'visited'
                                                        ? 'bg-primary-500/15 border-primary-500 text-primary-600 dark:text-primary-400 font-bold shadow-sm'
                                                        : 'bg-white/60 dark:bg-dark-card/60 border-black/5 dark:border-white/10 hover:border-black/15 text-light-text dark:text-dark-text'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <span className="text-lg">✈️</span>
                                                    <div>
                                                        <p className="text-xs font-bold">Visited / Explored</p>
                                                        <p className="text-[9px] text-light-text-secondary dark:text-dark-text-secondary">Destination stay / trip</p>
                                                    </div>
                                                </div>
                                                {currentStatus === 'visited' && <span className="text-xs font-bold text-primary-500">✓</span>}
                                            </button>

                                            {/* 4. Layover Only */}
                                            <button
                                                type="button"
                                                onClick={() => onUpdateCountryStatus?.(iso2, name, currentStatus === 'layover' ? 'none' : 'layover')}
                                                className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                                                    currentStatus === 'layover'
                                                        ? 'bg-amber-500/15 border-amber-500 text-amber-600 dark:text-amber-400 font-bold shadow-sm'
                                                        : 'bg-white/60 dark:bg-dark-card/60 border-black/5 dark:border-white/10 hover:border-black/15 text-light-text dark:text-dark-text'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <span className="text-lg">🛫</span>
                                                    <div>
                                                        <p className="text-xs font-bold">Layover Only (Transit)</p>
                                                        <p className="text-[9px] text-light-text-secondary dark:text-dark-text-secondary">Airport connection / transfer</p>
                                                    </div>
                                                </div>
                                                {currentStatus === 'layover' && <span className="text-xs font-bold text-amber-500">✓</span>}
                                            </button>

                                            {/* 5. Wishlist Destination */}
                                            <button
                                                type="button"
                                                onClick={() => onUpdateCountryStatus?.(iso2, name, currentStatus === 'wishlist' ? 'none' : 'wishlist')}
                                                className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                                                    currentStatus === 'wishlist'
                                                        ? 'bg-rose-500/15 border-rose-500 text-rose-600 dark:text-rose-400 font-bold shadow-sm'
                                                        : 'bg-white/60 dark:bg-dark-card/60 border-black/5 dark:border-white/10 hover:border-black/15 text-light-text dark:text-dark-text'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <span className="text-lg">🌟</span>
                                                    <div>
                                                        <p className="text-xs font-bold">Wish List Destination</p>
                                                        <p className="text-[9px] text-light-text-secondary dark:text-dark-text-secondary">Dream expedition target</p>
                                                    </div>
                                                </div>
                                                {currentStatus === 'wishlist' && <span className="text-xs font-bold text-rose-500">✓</span>}
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
                <div className="absolute top-5 left-5 z-30 w-80 max-h-[calc(100%-2.5rem)] flex flex-col rounded-3xl bg-white/90 dark:bg-dark-card/90 backdrop-blur-2xl border border-black/10 dark:border-white/15 shadow-glass-modal overflow-hidden text-light-text dark:text-dark-text animate-fade-in" style={{ WebkitBackdropFilter: 'blur(40px)' }}>
                    {/* Top Control Header */}
                    <div className="p-4 pb-3 flex items-center justify-between border-b border-black/5 dark:border-white/10 bg-gradient-to-r from-primary-500/5 to-transparent shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-primary-500">Route Corridor</span>
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20">
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

                    {/* Origin & Destination Hubs with Live Times */}
                    <div className="p-4 space-y-3">
                        {/* Origin Hub */}
                        {(() => {
                            const originTime = getApproxLocalTime(selectedCorridor.originCoords[0]);
                            return (
                                <div className="p-3 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-1">
                                    <span className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary truncate block font-medium">
                                        {selectedCorridor.originName}
                                    </span>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xl leading-none">{selectedCorridor.originFlag}</span>
                                            <span className="text-lg font-bold tracking-tight text-light-text dark:text-dark-text">{selectedCorridor.originCode}</span>
                                            <ChevronRight className="w-3.5 h-3.5 text-light-text-secondary/60 dark:text-dark-text-secondary/60" />
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xs font-bold text-light-text dark:text-dark-text block">{originTime.timeStr}</span>
                                            <span className="text-[9px] text-light-text-secondary dark:text-dark-text-secondary">{originTime.dateStr} · {originTime.utcOffsetStr}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Distance & Timezone Separator */}
                        <div className="flex items-center justify-between px-2 text-[10px] text-light-text-secondary dark:text-dark-text-secondary font-medium">
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

                        {/* Destination Hub */}
                        {(() => {
                            const destTime = getApproxLocalTime(selectedCorridor.destCoords[0]);
                            return (
                                <div className="p-3 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-1">
                                    <span className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary truncate block font-medium">
                                        {selectedCorridor.destName}
                                    </span>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xl leading-none">{selectedCorridor.destFlag}</span>
                                            <span className="text-lg font-bold tracking-tight text-light-text dark:text-dark-text">{selectedCorridor.destCode}</span>
                                            <ChevronRight className="w-3.5 h-3.5 text-light-text-secondary/60 dark:text-dark-text-secondary/60" />
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xs font-bold text-light-text dark:text-dark-text block">{destTime.timeStr}</span>
                                            <span className="text-[9px] text-light-text-secondary dark:text-dark-text-secondary">{destTime.dateStr} · {destTime.utcOffsetStr}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>

                    {/* Operational Corridor Telemetry */}
                    {(() => {
                        const rawMode = selectedCorridor.flights[0]?.mode || 'Flight';
                        const modeStr = String(rawMode).toLowerCase();
                        const isFlight = modeStr.includes('flight') || rawMode === 'Flight';
                        const isTrain = modeStr.includes('train') || modeStr.includes('rail');
                        const isSea = ['cruise', 'ferry', 'boat', 'ship'].some(m => modeStr.includes(m));
                        const isRoad = ['car', 'drive', 'bus', 'road', 'taxi'].some(m => modeStr.includes(m));

                        const totalTitle = isTrain ? 'Total Journeys' : isSea ? 'Total Voyages' : isRoad ? 'Total Drives' : 'Total Flights';
                        const logTitle = isTrain ? 'Rail Log' : isSea ? 'Maritime Log' : isRoad ? 'Road Trip Log' : 'Flight Log';

                        return (
                            <div className="px-4 pb-4 space-y-2">
                                <div className="grid grid-cols-2 gap-2 text-center">
                                    <div className="p-2.5 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5">
                                        <span className="text-[9px] text-light-text-secondary dark:text-dark-text-secondary uppercase font-bold tracking-wider block">{totalTitle}</span>
                                        <span className="text-base font-bold text-primary-500">{selectedCorridor.flights.length}</span>
                                    </div>
                                    <div className="p-2.5 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5">
                                        <span className="text-[9px] text-light-text-secondary dark:text-dark-text-secondary uppercase font-bold tracking-wider block">Direct Distance</span>
                                        <span className="text-base font-bold text-light-text dark:text-dark-text">{selectedCorridor.distanceKm} km</span>
                                    </div>
                                </div>

                                {/* Journey Log Timeline */}
                                <div className="p-3 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-2">
                                    <span className="text-[9px] text-light-text-secondary dark:text-dark-text-secondary uppercase font-bold tracking-wider block">{logTitle} ({selectedCorridor.flights.length})</span>
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
                                                            <span className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary font-mono">#{f.identifier}</span>
                                                        )}
                                                    </div>
                                                    {f.departureDate && (
                                                        <span className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary font-mono shrink-0">
                                                            {new Date(f.departureDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
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
                        const isFlight = modeStr.includes('flight') || rawMode === 'Flight';
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
                            <div className="bg-white/90 dark:bg-dark-card/90 text-light-text dark:text-dark-text border border-black/10 dark:border-white/15 rounded-3xl shadow-glass-modal backdrop-blur-2xl p-4 min-w-[280px] text-xs animate-fade-in space-y-3" style={{ WebkitBackdropFilter: 'blur(30px)' }}>
                                {/* Header */}
                                <div className="flex items-center justify-between border-b border-black/5 dark:border-white/10 pb-2.5">
                                    <div className="flex items-center gap-2">
                                        <span className="text-base leading-none">{c.originFlag}</span>
                                        <span className="font-bold text-sm text-light-text dark:text-dark-text tracking-tight">{c.originCode}</span>
                                        <ArrowRight className="w-3.5 h-3.5 text-light-text-secondary dark:text-dark-text-secondary" />
                                        <span className="text-base leading-none">{c.destFlag}</span>
                                        <span className="font-bold text-sm text-light-text dark:text-dark-text tracking-tight">{c.destCode}</span>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20">
                                        {typeLabel}
                                    </span>
                                </div>

                                {/* Names */}
                                <div className="text-[11px] text-light-text-secondary dark:text-dark-text-secondary leading-snug">
                                    <span className="font-semibold text-light-text dark:text-dark-text">{c.originName}</span>
                                    <span className="opacity-50 mx-1">→</span>
                                    <span className="font-semibold text-light-text dark:text-dark-text">{c.destName}</span>
                                </div>

                                {/* Distance & Time Difference */}
                                <div className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 font-mono text-light-text-secondary dark:text-dark-text-secondary">
                                    <span>{c.distanceKm.toLocaleString()} km</span>
                                    <span>
                                        {Math.abs(Math.round((c.originCoords[0] - c.destCoords[0]) / 15)) === 0 ? 'Same timezone' : `${Math.abs(Math.round((c.originCoords[0] - c.destCoords[0]) / 15))}h time diff`}
                                    </span>
                                </div>

                                {/* Summary */}
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
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
                        const currentStatus: CountryResidenceStatus | 'unexplored' = 
                            (iso2 && countryStatusMap?.[iso2]) || 
                            (name && countryStatusMap?.[name.toUpperCase()]) || 
                            (isVisited ? 'visited' : 'unexplored');
                        const flag = iso2 ? getFlagEmoji(iso2) : '🏳️';
                        const region = p.REGION_UN || p.SUBREGION || p.CONTINENT || (iso2 ? getRegion(iso2) : '');

                        return (
                            <div className="bg-white/90 dark:bg-dark-card/90 text-light-text dark:text-dark-text border border-black/10 dark:border-white/15 rounded-3xl shadow-glass-modal backdrop-blur-2xl p-4 min-w-[240px] text-xs animate-fade-in space-y-2.5" style={{ WebkitBackdropFilter: 'blur(30px)' }}>
                                <div className="flex items-center justify-between border-b border-black/5 dark:border-white/10 pb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xl leading-none">{flag}</span>
                                        <span className="font-bold text-sm text-light-text dark:text-dark-text tracking-tight">{name}</span>
                                    </div>
                                    {currentStatus === 'lived_current' ? (
                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                            🏠 HOME
                                        </span>
                                    ) : currentStatus === 'lived_past' ? (
                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 flex items-center gap-1">
                                            🏛️ PAST HOME
                                        </span>
                                    ) : currentStatus === 'wishlist' ? (
                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center gap-1">
                                            🌟 WISHLIST
                                        </span>
                                    ) : isVisited ? (
                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-primary-500/15 text-primary-600 dark:text-primary-400 border border-primary-500/30 flex items-center gap-1">
                                            ✨ EXPLORED
                                        </span>
                                    ) : (
                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-black/5 dark:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary border border-black/10 dark:border-white/10">
                                            UNEXPLORED
                                        </span>
                                    )}
                                </div>
                                {region && (
                                    <div className="flex items-center justify-between text-[11px] text-light-text-secondary dark:text-dark-text-secondary">
                                        <span>Region</span>
                                        <span className="font-semibold text-light-text dark:text-dark-text">{region}</span>
                                    </div>
                                )}
                                <div className="pt-1 text-[10px] text-primary-500 font-bold flex items-center gap-1">
                                    <span>👆 Click territory to inspect & label</span>
                                </div>
                            </div>
                        );
                    })() : (
                        <div className="bg-white/90 dark:bg-dark-card/90 text-light-text dark:text-dark-text border border-black/10 dark:border-white/15 rounded-2xl shadow-glass-card backdrop-blur-xl p-3.5 min-w-[220px] text-xs animate-fade-in" style={{ WebkitBackdropFilter: 'blur(24px)' }}>
                            <div className="space-y-1">
                                <div className="flex items-center justify-between gap-3 pb-1 border-b border-black/5 dark:border-white/10">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                                        {hoverInfo.object.isAirport 
                                            ? '✈️ Airport Hub' 
                                            : hoverInfo.object.type === 'city' 
                                                ? '📍 City / Destination' 
                                                : (hoverInfo.object.count ? '🌐 Cluster' : 'Location')}
                                    </span>
                                    {hoverInfo.object.isAirport && (
                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20">
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
                                        <span className="text-sm text-light-text dark:text-dark-text truncate font-bold">
                                            {hoverInfo.object.name || (hoverInfo.object.count ? `${hoverInfo.object.count} Locations` : '')}
                                        </span>
                                    </div>
                                    {hoverInfo.object.flightCount && hoverInfo.object.flightCount > 0 && (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20 shrink-0">
                                            {hoverInfo.object.flightCount} {hoverInfo.object.flightCount === 1 ? 'flight' : 'flights'}
                                        </span>
                                    )}
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
