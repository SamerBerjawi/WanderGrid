import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DeckGL } from '@deck.gl/react';
import { MapView, _GlobeView } from '@deck.gl/core';
import { ScatterplotLayer, GeoJsonLayer, PathLayer, BitmapLayer, TextLayer } from '@deck.gl/layers';
import { TileLayer, TripsLayer } from '@deck.gl/geo-layers';
import { Trip } from '../types';
import { getCoordinatesSync } from '../services/geocoding';
import { 
    MapAppearanceSettings, 
    DEFAULT_MAP_APPEARANCE, 
    loadMapAppearanceSettings, 
    saveMapAppearanceSettings 
} from '../types/mapAppearance';
import { getTwilightGradientGeoJSON } from '../services/solarTerminator';
import { getLatestRainRadarMetadata, RainRadarMetadata } from '../services/rainViewer';
import { generateAirportRunway, RunwayGeometry } from '../services/airportRunways';

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

    const res: [number, number, number] = [
        Math.min(255, Math.max(0, Math.round(r / totalWeight))),
        Math.min(255, Math.max(0, Math.round(g / totalWeight))),
        Math.min(255, Math.max(0, Math.round(b / totalWeight)))
    ];
    geoGradientCache.set(key, res);
    return res;
};

// Frequency-based color palette progression
const getFrequencyRGB = (freq: number): [number, number, number] => {
    if (freq <= 1) return [56, 189, 248];  // Ice Cyan (1 flight)
    if (freq <= 3) return [168, 85, 247]; // Violet / Purple (2-3 flights)
    if (freq <= 6) return [244, 63, 94];   // Rose / Coral (4-6 flights)
    return [245, 158, 11];                 // Fiery Amber / Gold (7+ flights)
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
    viewMode?: 'network' | 'scratch';
    visitedPlaces?: { lat: number; lng: number; name: string }[];
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
    viewMode = 'network',
    visitedPlaces = [],
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

    // Animation timer for Comet Flow TripsLayer
    const [animTime, setAnimTime] = useState(0);
    useEffect(() => {
        if (!animateRoutes) return;
        let animationFrame: number;
        const start = performance.now();
        const loopDuration = 1800;

        const animate = (now: number) => {
            setAnimTime(((now - start) % loopDuration));
            animationFrame = requestAnimationFrame(animate);
        };
        animationFrame = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationFrame);
    }, [animateRoutes]);

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
                controller: {
                    ...controllerConfig,
                    dragRotate: false
                }
            })
        ];
    }, [effectiveProjection]);

    const [hoverInfo, setHoverInfo] = useState<any>(null);
    const [geoJsonData, setGeoJsonData] = useState<any>(null);

    // Load country GeoJSON
    useEffect(() => {
        fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson')
            .then(res => res.json())
            .then(data => setGeoJsonData(data))
            .catch(err => console.warn('DeckGL: GeoJSON load failed', err));
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

    // Request OSRM geometries for land trips
    useEffect(() => {
        if (!showRoadTracing) return;
        enrichedTrips.forEach(trip => {
            trip.transports?.forEach(t => {
                const isLand = ['Car Rental', 'Personal Car', 'Bus', 'Train'].includes(t.mode || '');
                if (isLand && t.originLat && t.originLng && t.destLat && t.destLng) {
                    fetchOsrmGeometry(t.originLat, t.originLng, t.destLat, t.destLng, () => {
                        setOsrmVersion(v => v + 1);
                    });
                }
            });
        });
    }, [enrichedTrips, showRoadTracing]);

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

    // Basemap Tile URLs
    const tileUrl = useMemo(() => {
        switch (currentLayer) {
            case 'satellite':
                return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
            case 'topography':
                return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}';
            case 'hillshade':
                return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}';
            case 'physical':
                return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}';
            case 'ocean':
                return 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}';
            case 'night':
                return 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png';
            case 'standard':
            case 'default':
            default:
                return isDark
                    ? 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'
                    : 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png';
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
                const isLand = ['Car Rental', 'Personal Car', 'Bus', 'Train'].includes(t.mode);
                const isSea = ['Cruise', 'Ferry'].includes(t.mode);

                if (isFlight && !showFlightRoutes) return;
                if (!isFlight && !showLandSeaRoutes) return;

                const p1Key = `${t.originLat.toFixed(3)},${t.originLng.toFixed(3)}`;
                const p2Key = `${t.destLat.toFixed(3)},${t.destLng.toFixed(3)}`;
                const freqKey = p1Key < p2Key ? `${p1Key}|${p2Key}` : `${p2Key}|${p1Key}`;
                const freq = frequencies.get(freqKey) || 1;

                const uniqueRouteKey = `${trip.id}_${t.origin}_${t.destination}_${t.departureDate || ''}_${t.identifier || ''}`;
                
                const baseStroke = isWidthByFreq 
                    ? Math.min(2.8, 1.0 + Math.log2(freq) * 0.45) 
                    : 1.2;
                const strokeWidth = baseStroke * scaleMultiplier;

                // Check for OSRM road geometry
                const osrmKey = `${t.originLat.toFixed(3)},${t.originLng.toFixed(3)}|${t.destLat.toFixed(3)},${t.destLng.toFixed(3)}`;
                const cachedRoadCoords = showRoadTracing && isLand ? osrmCache.get(osrmKey) : null;

                // Coordinates
                let fullPath: [number, number, number][] = [];
                if (isFlight) {
                    fullPath = getGeodesicPoints(t.originLat, t.originLng, t.destLat, t.destLng, isElevatedActive, effectiveProjection === 'globe');
                } else if (cachedRoadCoords && cachedRoadCoords.length > 0) {
                    fullPath = cachedRoadCoords.map(c => [c[0], c[1], 0]);
                } else {
                    fullPath = [[t.originLng, t.originLat, 0]];
                    if (t.waypoints) {
                        t.waypoints.forEach((w: any) => {
                            if (w.coordinates) fullPath.push([w.coordinates.lng, w.coordinates.lat, 0]);
                        });
                    }
                    fullPath.push([t.destLng, t.destLat, 0]);
                }

                // Determine Color
                let modeRGB: [number, number, number] = isLand 
                    ? [245, 158, 11] 
                    : isSea 
                        ? [6, 182, 212] 
                        : (activeAppearance.routeColorMode === 'frequency' 
                            ? getFrequencyRGB(freq)
                            : (activeAppearance.routeColorMode === 'default' 
                                ? [59, 130, 246] 
                                : fallbackRGB));

                hitPaths.push({
                    path: fullPath,
                    routeKey: uniqueRouteKey,
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
                            width: strokeWidth + 1.2
                        });
                    }
                } else {
                    flowSegs.push({
                        path: fullPath,
                        color: [...modeRGB, 225],
                        rawColor: modeRGB,
                        routeKey: uniqueRouteKey,
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
                        width: strokeWidth + 1.2
                    });
                }

                // Airport Sizing
                const baseAirportRadius = activeAppearance.airportSize === 'off' 
                    ? 0 
                    : activeAppearance.airportSize === 'small' 
                        ? 2.0 
                        : activeAppearance.airportSize === 'large' 
                            ? 6.2 
                            : 3.8;

                const getCalculatedRadius = (pKey: string) => {
                    if (baseAirportRadius === 0) return 0;
                    if (activeAppearance.airportMode === 'frequency') {
                        const count = airportFreqMap.get(pKey) || 1;
                        return Math.min(10, baseAirportRadius * (1 + 0.35 * Math.log2(count)));
                    }
                    return baseAirportRadius;
                };

                // Airport Hubs & Detailed Runways
                const oKey = `${t.originLng.toFixed(3)},${t.originLat.toFixed(3)}`;
                if (!pointsMap.has(oKey)) {
                    const hubRGB = useRegionalGradient 
                        ? getGeoGradientRGB(t.originLat, t.originLng) 
                        : modeRGB;
                    const r = getCalculatedRadius(oKey);
                    
                    pointsMap.set(oKey, {
                        position: [t.originLng, t.originLat, 0],
                        name: t.origin,
                        color: [...hubRGB, 255],
                        strokeColor: isDark ? [255, 255, 255, 220] : [15, 23, 42, 220],
                        radius: r,
                        tripId: trip.id
                    });

                    if (activeAppearance.airportDetail === 'detailed' && isFlight && !processedRunwayKeys.has(oKey)) {
                        processedRunwayKeys.add(oKey);
                        runwayGeometries.push(generateAirportRunway(t.origin, t.originLat, t.originLng, 90));
                    }
                }

                const dKey = `${t.destLng.toFixed(3)},${t.destLat.toFixed(3)}`;
                if (!pointsMap.has(dKey)) {
                    const hubRGB = useRegionalGradient 
                        ? getGeoGradientRGB(t.destLat, t.destLng) 
                        : modeRGB;
                    const r = getCalculatedRadius(dKey);

                    pointsMap.set(dKey, {
                        position: [t.destLng, t.destLat, 0],
                        name: t.destination,
                        color: [...hubRGB, 255],
                        strokeColor: isDark ? [255, 255, 255, 220] : [15, 23, 42, 220],
                        radius: r,
                        tripId: trip.id
                    });

                    if (activeAppearance.airportDetail === 'detailed' && isFlight && !processedRunwayKeys.has(dKey)) {
                        processedRunwayKeys.add(dKey);
                        runwayGeometries.push(generateAirportRunway(t.destination, t.destLat, t.destLng, 270));
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

    // Build Deck.gl Layers
    const layers = useMemo(() => {
        const layerList: any[] = [];

        // 1. WebGL Basemap TileLayer
        layerList.push(
            new TileLayer({
                id: `basemap-tile-layer-${currentLayer}-${isDark ? 'dark' : 'light'}-${effectiveProjection}`,
                data: tileUrl,
                minZoom: 0,
                maxZoom: 19,
                tileSize: 256,
                renderSubLayers: (props: any) => {
                    const { boundingBox } = props.tile;
                    return new BitmapLayer(props, {
                        data: null,
                        image: props.data,
                        bounds: [boundingBox[0][0], boundingBox[0][1], boundingBox[1][0], boundingBox[1][1]]
                    });
                }
            })
        );

        // 2. Solar Terminator Ultra-Smooth 14-Band Twilight Shading Gradient
        if (activeAppearance.timeOfDay) {
            const twilightData = getTwilightGradientGeoJSON();
            layerList.push(
                new GeoJsonLayer({
                    id: 'solar-twilight-gradient-layer',
                    data: twilightData,
                    filled: true,
                    stroked: false,
                    getFillColor: (f: any) => {
                        const idx = f.properties?.stepIndex ?? 0;
                        // Smooth progressive alpha shading
                        const alpha = Math.min(48, 12 + idx * 2.8);
                        return [2, 6, 23, alpha];
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
                    opacity,
                    renderSubLayers: (props: any) => {
                        const { boundingBox } = props.tile;
                        return new BitmapLayer(props, {
                            data: null,
                            image: props.data,
                            bounds: [boundingBox[0][0], boundingBox[0][1], boundingBox[1][0], boundingBox[1][1]]
                        });
                    }
                })
            );
        }

        // 4. Detailed Airport Runway Markings Layer (Meter-Accurate Layouts)
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
                    widthMinPixels: 2.5,
                    widthMaxPixels: 50,
                    capRounded: false,
                    pickable: false
                })
            );

            // Taxiway Network Lines (Yellow #eab308)
            if (allTaxiways.length > 0) {
                layerList.push(
                    new PathLayer({
                        id: 'taxiway-lines-layer',
                        data: allTaxiways,
                        getPath: (d: any) => d,
                        getColor: [234, 179, 8, 230],
                        getWidth: 20,
                        widthUnits: 'meters',
                        widthMinPixels: 1.5,
                        widthMaxPixels: 15,
                        pickable: false
                    })
                );
            }

            // Piano Keys & Centerline White Markings
            if (allThresholds.length > 0) {
                layerList.push(
                    new PathLayer({
                        id: 'runway-thresholds-layer',
                        data: allThresholds,
                        getPath: (d: any) => d,
                        getColor: [255, 255, 255, 240],
                        getWidth: 4,
                        widthUnits: 'meters',
                        widthMinPixels: 1.0,
                        widthMaxPixels: 8,
                        pickable: false
                    })
                );
            }
        }

        // 5. Country Polygons (GeoJSON) - Scratch Map Regional Colors
        if (geoJsonData && (showCountries || viewMode === 'scratch')) {
            layerList.push(
                new GeoJsonLayer({
                    id: 'country-polygons',
                    data: geoJsonData,
                    filled: true,
                    stroked: true,
                    getLineColor: isDark ? [65, 75, 95, 180] : [200, 205, 215, 200],
                    getLineWidth: 1,
                    lineWidthUnits: 'pixels',
                    getFillColor: (f: any) => {
                        let iso = f.properties?.ISO_A2;
                        if (!iso || iso === '-99') iso = f.properties?.ISO_A2_EH;
                        const isVisited = iso && visitedCountries.includes(iso);

                        if (isVisited) {
                            const center = getFeatureCentroid(f);
                            const rgb = getGeoGradientRGB(center.lat, center.lng);
                            return [...rgb, viewMode === 'scratch' ? 190 : 120];
                        }
                        return viewMode === 'scratch'
                            ? (isDark ? [15, 23, 42, 235] : [230, 235, 245, 235])
                            : [0, 0, 0, 0];
                    },
                    pickable: false,
                    updateTriggers: {
                        getFillColor: [visitedCountries, viewMode, isDark]
                    }
                })
            );
        }

        // 6. Scratch Map Visited Place Pins
        if (viewMode === 'scratch' && visitedPlaces.length > 0) {
            layerList.push(
                new ScatterplotLayer({
                    id: 'scratch-visited-places',
                    data: visitedPlaces,
                    getPosition: (d: any) => [d.lng, d.lat, 0],
                    getFillColor: [245, 158, 11, 240],
                    getLineColor: [255, 255, 255, 230],
                    getRadius: 4.5,
                    radiusUnits: 'pixels',
                    radiusMinPixels: 4,
                    stroked: true,
                    lineWidthUnits: 'pixels',
                    getLineWidth: 1.5,
                    pickable: true,
                    onHover: (info: any) => info.object && setHoverInfo(info)
                })
            );
        }

        // 7. Underlying Glow Track Layer
        if (viewMode === 'network' && trackSegments.length > 0) {
            layerList.push(
                new PathLayer({
                    id: `route-track-glow-${isElevatedActive ? 'elevated' : 'flat'}`,
                    data: trackSegments,
                    getPath: (d: any) => d.path,
                    getColor: (d: any) => {
                        const isHovered = hoveredRouteKey === d.routeKey;
                        if (isHovered) {
                            return [...(d.rawColor || [255, 255, 255]), 200];
                        }
                        return d.color;
                    },
                    getWidth: (d: any) => {
                        const isHovered = hoveredRouteKey === d.routeKey;
                        return isHovered ? d.width + 3.2 : d.width;
                    },
                    widthUnits: 'pixels',
                    widthMinPixels: 1,
                    widthMaxPixels: 6,
                    capRounded: true,
                    jointRounded: true,
                    pickable: false,
                    parameters: { depthTest: true },
                    updateTriggers: {
                        getColor: [hoveredRouteKey],
                        getWidth: [hoveredRouteKey]
                    }
                })
            );
        }

        // 8. Flight & Transit Flow Layer
        if (viewMode === 'network' && routeSegments.length > 0) {
            layerList.push(
                new PathLayer({
                    id: `route-flow-lines-${isElevatedActive ? 'elevated' : 'flat'}`,
                    data: routeSegments,
                    getPath: (d: any) => d.path,
                    getColor: (d: any) => {
                        const isHovered = hoveredRouteKey === d.routeKey;
                        if (isHovered) {
                            return [255, 255, 255, 255];
                        }
                        return d.color;
                    },
                    getWidth: (d: any) => {
                        const isHovered = hoveredRouteKey === d.routeKey;
                        return isHovered ? d.width + 1.2 : d.width;
                    },
                    widthUnits: 'pixels',
                    widthMinPixels: 1,
                    widthMaxPixels: 6.0,
                    capRounded: true,
                    jointRounded: true,
                    pickable: false,
                    parameters: { depthTest: true },
                    updateTriggers: {
                        getColor: [hoveredRouteKey],
                        getWidth: [hoveredRouteKey]
                    }
                })
            );
        }

        // 9. Comet Flow TripsLayer
        if (viewMode === 'network' && animateRoutes && cometTrips.length > 0) {
            layerList.push(
                new TripsLayer({
                    id: `comet-flow-trips-${isElevatedActive ? 'elevated' : 'flat'}`,
                    data: cometTrips,
                    getPath: (d: any) => d.path,
                    getTimestamps: (d: any) => d.timestamps,
                    getColor: (d: any) => d.color,
                    currentTime: animTime,
                    trailLength: 350,
                    getWidth: (d: any) => d.width,
                    widthUnits: 'pixels',
                    widthMinPixels: 2.2,
                    capRounded: true,
                    jointRounded: true,
                    parameters: { depthTest: true }
                })
            );
        }

        // 10. Wide Hit-Test Layer
        if (viewMode === 'network' && hitTestPaths.length > 0) {
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
                    onClick: (info: any) => info.object && onTripClick && onTripClick(info.object.tripId)
                })
            );
        }

        // 11. Airport & City Node Markers / Cluster Markers
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
                        pickable: false
                    })
                );
            } else if (airportPoints.length > 0) {
                layerList.push(
                    new ScatterplotLayer({
                        id: 'airport-markers',
                        data: airportPoints,
                        getPosition: (d: any) => d.position,
                        getFillColor: (d: any) => d.color,
                        getLineColor: (d: any) => d.strokeColor,
                        getRadius: (d: any) => d.radius,
                        radiusUnits: 'pixels',
                        radiusMinPixels: 2.0,
                        radiusMaxPixels: 10,
                        stroked: true,
                        lineWidthUnits: 'pixels',
                        getLineWidth: 1.2,
                        pickable: true,
                        autoHighlight: true,
                        highlightColor: [255, 255, 255, 255],
                        onHover: (info: any) => {
                            if (info.object) {
                                setHoverInfo(info);
                            }
                        },
                        onClick: (info: any) => info.object && onTripClick && onTripClick(info.object.tripId)
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
        cometTrips, 
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
        animTime, 
        animateRoutes, 
        clusterMode,
        activeAppearance,
        radarMeta
    ]);

    return (
        <div className="relative w-full h-full overflow-hidden bg-[#090d16] select-none">
            {/* Deck.gl 60 FPS WebGL Canvas with Mouse Scroll Zoom enabled */}
            <DeckGL
                views={views}
                viewState={viewState}
                controller={true}
                onViewStateChange={({ viewState: newViewState }: any) => {
                    setViewState(prev => ({
                        ...prev,
                        ...newViewState,
                        zoom: Math.min(18, Math.max(0, newViewState.zoom ?? prev.zoom))
                    }));
                }}
                layers={layers}
                pickingRadius={10}
                getCursor={({ isHovering, isDragging }) => (isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab')}
            />

            {/* Zoom Controls (Bottom Right) */}
            <div className="absolute bottom-6 right-6 z-20 flex flex-col gap-2">
                <div className="flex flex-col rounded-2xl border border-white/10 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl shadow-2xl overflow-hidden">
                    <button
                        onClick={() => setViewState(v => ({ ...v, zoom: Math.min(v.zoom + 0.8, 18) }))}
                        className="w-10 h-10 flex items-center justify-center text-zinc-700 dark:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 border-b border-zinc-200/50 dark:border-white/5 cursor-pointer font-black text-lg"
                        title="Zoom In"
                    >
                        +
                    </button>
                    <button
                        onClick={() => setViewState(v => ({ ...v, zoom: Math.max(v.zoom - 0.8, 0.1) }))}
                        className="w-10 h-10 flex items-center justify-center text-zinc-700 dark:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer font-black text-lg"
                        title="Zoom Out"
                    >
                        −
                    </button>
                </div>
            </div>

            {/* GPU Interactive Route Tooltip */}
            {hoverInfo?.object && (
                <div
                    className="absolute z-50 pointer-events-none transform -translate-x-1/2 -translate-y-full mb-3"
                    style={{ left: hoverInfo.x, top: hoverInfo.y }}
                >
                    <div className="bg-[#0f172a]/95 text-white border border-white/15 rounded-2xl shadow-2xl backdrop-blur-xl p-3.5 min-w-[220px] text-xs animate-fade-in">
                        {hoverInfo.object.origin && hoverInfo.object.destination ? (
                            <div>
                                <div className="flex items-center justify-between gap-4 mb-2 pb-1.5 border-b border-white/10">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                                        {hoverInfo.object.tripName}
                                    </span>
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                        {hoverInfo.object.mode}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 font-bold text-sm text-white mb-1.5">
                                    <span>{hoverInfo.object.origin}</span>
                                    <span className="material-icons-outlined text-xs text-zinc-500">arrow_forward</span>
                                    <span>{hoverInfo.object.destination}</span>
                                </div>
                                <div className="text-[11px] text-zinc-400">
                                    {hoverInfo.object.provider} {hoverInfo.object.identifier && `• ${hoverInfo.object.identifier}`}
                                </div>
                                {hoverInfo.object.date && (
                                    <div className="text-[10px] text-zinc-500 mt-1">
                                        {new Date(hoverInfo.object.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 font-bold">
                                <span className="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
                                <span className="text-sm">{hoverInfo.object.name || (hoverInfo.object.count ? `${hoverInfo.object.count} Airports` : '')}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default DeckFlightMap;
