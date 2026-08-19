import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DeckGL } from '@deck.gl/react';
import { MapView, _GlobeView } from '@deck.gl/core';
import { ScatterplotLayer, GeoJsonLayer, PathLayer, BitmapLayer, TextLayer } from '@deck.gl/layers';
import { TileLayer, TripsLayer } from '@deck.gl/geo-layers';
import { Trip } from '../types';
import { getCoordinatesSync } from '../services/geocoding';

// --- Exact Gradient Color Logic & Regional Poles ---
const COLOR_POLES = [
    { lat: 55, lng: -100, color: [0, 122, 255] },    // NA: Vivid Blue (Apple Blue)
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
                const coords: [number, number][] = data.routes[0].geometry.coordinates; // [lng, lat]
                osrmCache.set(key, coords);
                onDone();
            }
        }
    } catch {
        // Fallback to straight line on network error
    } finally {
        pendingOsrmFetches.delete(key);
    }
};

// Spherical Geodesic (Great-Circle) Path Generator supporting 3D Elevation
const curvePointsCache = new Map<string, [number, number, number][]>();

const getGeodesicPoints = (
    startLat: number, 
    startLng: number, 
    endLat: number, 
    endLng: number, 
    elevated: boolean = false,
    isGlobe: boolean = false
): [number, number, number][] => {
    const key = `${startLat.toFixed(3)},${startLng.toFixed(3)}|${endLat.toFixed(3)},${endLng.toFixed(3)}|${elevated ? '1' : '0'}|${isGlobe ? '1' : '0'}`;
    const cached = curvePointsCache.get(key);
    if (cached) return cached;

    const lat1 = startLat * Math.PI / 180;
    const lng1 = startLng * Math.PI / 180;
    const lat2 = endLat * Math.PI / 180;
    const lng2 = endLng * Math.PI / 180;

    // 3D Cartesian Unit Vectors on Sphere
    const v1 = [
        Math.cos(lat1) * Math.cos(lng1),
        Math.cos(lat1) * Math.sin(lng1),
        Math.sin(lat1)
    ];
    const v2 = [
        Math.cos(lat2) * Math.cos(lng2),
        Math.cos(lat2) * Math.sin(lng2),
        Math.sin(lat2)
    ];

    // Dot product & true spherical angle (SLERP angle)
    const dot = Math.min(1, Math.max(-1, v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]));
    const d = Math.acos(dot);

    const points: [number, number, number][] = [];
    const steps = Math.min(96, Math.max(24, Math.ceil(d * 52)));

    // Real-world aviation tiered distance altitude scaling on 3D globe
    const distKm = d * 6371;
    let maxAlt = 0;
    if (elevated) {
        if (distKm < 800) {
            maxAlt = 200000 + (distKm / 800) * 350000;
        } else if (distKm < 3500) {
            maxAlt = 550000 + ((distKm - 800) / 2700) * 950000;
        } else {
            maxAlt = Math.min(2800000, 1500000 + Math.pow((distKm - 3500) / 9000, 0.75) * 1300000);
        }
    }

    if (d < 0.0001) {
        points.push([startLng, startLat, 0], [endLng, endLat, 0]);
        curvePointsCache.set(key, points);
        return points;
    }

    const sinD = Math.sin(d);
    let prevLngDeg = startLng;

    for (let i = 0; i <= steps; i++) {
        const f = i / steps;
        const A = Math.sin((1 - f) * d) / sinD;
        const B = Math.sin(f * d) / sinD;

        // Interpolated 3D unit vector on unit sphere
        const vx = A * v1[0] + B * v2[0];
        const vy = A * v1[1] + B * v2[1];
        const vz = A * v1[2] + B * v2[2];

        // Convert 3D vector back to exact spherical coordinates
        const latRad = Math.atan2(vz, Math.sqrt(vx * vx + vy * vy));
        const lngRad = Math.atan2(vy, vx);

        const latDeg = latRad * 180 / Math.PI;
        let lngDeg = lngRad * 180 / Math.PI;

        if (!isGlobe) {
            // Flat 2D unwrapping only when in 2D Mercator view
            let diff = lngDeg - prevLngDeg;
            while (diff > 180) {
                lngDeg -= 360;
                diff = lngDeg - prevLngDeg;
            }
            while (diff < -180) {
                lngDeg += 360;
                diff = lngDeg - prevLngDeg;
            }
            prevLngDeg = lngDeg;
        }

        // Smooth aerodynamic climb, cruise & descent altitude curve
        const alt = elevated ? Math.pow(Math.sin(f * Math.PI), 0.85) * maxAlt : 0;
        points.push([lngDeg, latDeg, alt]);
    }

    curvePointsCache.set(key, points);
    return points;
};

// Status fallback styling matching Classic ExpeditionMap
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

export interface DeckFlightMapProps {
    trips: Trip[];
    onTripClick?: (tripId: string) => void;
    showFrequencyWeight?: boolean;
    animateRoutes?: boolean;
    visitedCountries?: string[];
    showCountries?: boolean;
    viewMode?: 'network' | 'scratch';
    visitedPlaces?: { lat: number; lng: number; name: string }[];
    activeLayer?: 'standard' | 'satellite' | 'topography' | 'hillshade' | 'night';
    showFlightRoutes?: boolean;
    showLandSeaRoutes?: boolean;
    showCityMarkers?: boolean;
    showGradientRoutes?: boolean;
    clusterMode?: boolean;
    showRoadTracing?: boolean;
    focusTransportCoordinates?: { lat: number; lng: number } | null;
    initialProjection?: 'flat' | 'globe';
    initialElevated?: boolean;
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
    activeLayer: activeLayerProp = 'standard',
    showFlightRoutes = true,
    showLandSeaRoutes = true,
    showCityMarkers = true,
    showGradientRoutes = true,
    clusterMode = false,
    showRoadTracing = false,
    focusTransportCoordinates,
    initialProjection = 'flat',
    initialElevated = false
}) => {
    const isDark = useDarkMode();
    const [localLayer, setLocalLayer] = useState<'standard' | 'satellite' | 'topography' | 'night'>(activeLayerProp as any);
    const [projection, setProjection] = useState<'flat' | 'globe'>(initialProjection);
    const [elevatedRoutes, setElevatedRoutes] = useState<boolean>(initialElevated);
    const [hoveredRouteKey, setHoveredRouteKey] = useState<string | null>(null);
    const [, setOsrmVersion] = useState(0);

    // Animation timer for Comet Flow TripsLayer (60 FPS)
    const [animTime, setAnimTime] = useState(0);
    useEffect(() => {
        if (!animateRoutes) return;
        let animationFrame: number;
        const start = performance.now();
        const loopDuration = 1800; // Loop every 1.8 seconds

        const animate = (now: number) => {
            setAnimTime(((now - start) % loopDuration));
            animationFrame = requestAnimationFrame(animate);
        };
        animationFrame = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationFrame);
    }, [animateRoutes]);

    useEffect(() => {
        if (activeLayerProp) setLocalLayer(activeLayerProp as any);
    }, [activeLayerProp]);

    const currentLayer = activeLayerProp || localLayer;

    // View state supporting both Flat Mercator and 3D Globe
    const [viewState, setViewState] = useState({
        longitude: 15,
        latitude: 35,
        zoom: initialProjection === 'globe' ? 0.8 : 2.2,
        pitch: 0,
        bearing: 0,
        maxZoom: 18,
        minZoom: 0
    });

    // Handle projection toggle
    const handleToggleProjection = () => {
        const nextProjection = projection === 'flat' ? 'globe' : 'flat';
        setProjection(nextProjection);
        setViewState(prev => ({
            ...prev,
            zoom: nextProjection === 'globe' ? Math.min(prev.zoom, 1.2) : Math.max(prev.zoom, 2.0),
            pitch: 0,
            bearing: 0
        }));
    };

    // Configure Deck.gl Views (MapView vs _GlobeView)
    const views = useMemo(() => {
        if (projection === 'globe') {
            return [
                new _GlobeView({ 
                    id: 'globe', 
                    controller: {
                        dragPan: true,
                        dragRotate: true,
                        scrollZoom: { speed: 0.015, smooth: true },
                        doubleClickZoom: true,
                        touchZoom: true,
                        touchRotate: true,
                        inertia: 350
                    },
                    farZMultiplier: 5.0, // Extend frustum far plane to prevent clipping 3D elevated arcs
                    nearZMultiplier: 0.01,
                    resolution: 5
                })
            ];
        }
        return [
            new MapView({ 
                id: 'map', 
                controller: { 
                    dragPan: true,
                    scrollZoom: { speed: 0.015, smooth: true },
                    doubleClickZoom: true, 
                    touchZoom: true,
                    dragRotate: false,
                    inertia: 350
                } 
            })
        ];
    }, [projection]);

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

    // Request OSRM geometries for land trips when showRoadTracing is enabled
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

    // Auto-fit initial bounds
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
                zoom: projection === 'globe' ? 0.8 : Math.min(4, Math.max(1.8, Math.log2(360 / Math.max(maxLng - minLng, 30))))
            }));
        }
    }, [enrichedTrips, projection]);

    // Basemap Tile URL
    const tileUrl = useMemo(() => {
        if (currentLayer === 'satellite') {
            return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
        }
        if (currentLayer === 'topography') {
            return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}';
        }
        if (isDark || currentLayer === 'night') {
            return 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png';
        }
        return 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png';
    }, [currentLayer, isDark]);

    // Build Multi-Segment Gradient Routes, Wide Hit-Test Paths, Comet Trips & Airport Hubs
    const isElevatedActive = projection === 'globe' && elevatedRoutes;

    const { routeSegments, trackSegments, hitTestPaths, cometTrips, airportPoints, clusterNodes } = useMemo(() => {
        const flowSegs: any[] = [];
        const trackSegs: any[] = [];
        const hitPaths: any[] = [];
        const comets: any[] = [];
        const pointsMap = new Map<string, any>();
        const frequencies = new Map<string, number>();

        // 1. Compute route frequencies
        enrichedTrips.forEach(trip => {
            trip.transports?.forEach(t => {
                if (t.originLat && t.originLng && t.destLat && t.destLng) {
                    const p1 = `${t.originLat.toFixed(3)},${t.originLng.toFixed(3)}`;
                    const p2 = `${t.destLat.toFixed(3)},${t.destLng.toFixed(3)}`;
                    const key = p1 < p2 ? `${p1}|${p2}` : `${p2}|${p1}`;
                    frequencies.set(key, (frequencies.get(key) || 0) + 1);
                }
            });
        });

        // 2. Build multi-segment gradient paths & wide hit-test targets
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
                const strokeWidth = showFrequencyWeight ? Math.min(2.4, 1.0 + Math.log2(freq) * 0.4) : 1.1;

                // Check for OSRM road geometry
                const osrmKey = `${t.originLat.toFixed(3)},${t.originLng.toFixed(3)}|${t.destLat.toFixed(3)},${t.destLng.toFixed(3)}`;
                const cachedRoadCoords = showRoadTracing && isLand ? osrmCache.get(osrmKey) : null;

                // Generate 3D elevated or surface coordinates
                let fullPath: [number, number, number][] = [];
                if (isFlight) {
                    fullPath = getGeodesicPoints(t.originLat, t.originLng, t.destLat, t.destLng, isElevatedActive, projection === 'globe');
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

                const modeRGB: [number, number, number] = isLand ? [245, 158, 11] : isSea ? [6, 182, 212] : fallbackRGB;

                // Hit-test payload
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

                // Comet Flow Trips payload (timed 0 to 1800ms)
                if (animateRoutes && fullPath.length > 1) {
                    const timestamps = fullPath.map((_, idx) => (idx / (fullPath.length - 1)) * 1800);
                    const cometColor = isFlight 
                        ? (showGradientRoutes ? getGeoGradientRGB(t.destLat, t.destLng) : fallbackRGB)
                        : modeRGB;

                    comets.push({
                        path: fullPath,
                        timestamps,
                        color: [...cometColor, 255],
                        width: strokeWidth + 2.0
                    });
                }

                if (showGradientRoutes && isFlight && fullPath.length > 2) {
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
                        color: [...modeRGB, 220],
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
                        color: [...modeRGB, 35],
                        rawColor: modeRGB,
                        routeKey: uniqueRouteKey,
                        width: strokeWidth + 1.2
                    });
                }

                // Airport & City Node Hubs
                const oKey = `${t.originLng.toFixed(3)},${t.originLat.toFixed(3)}`;
                if (!pointsMap.has(oKey)) {
                    const hubRGB = showGradientRoutes ? getGeoGradientRGB(t.originLat, t.originLng) : modeRGB;
                    pointsMap.set(oKey, {
                        position: [t.originLng, t.originLat, 0],
                        name: t.origin,
                        color: [...hubRGB, 255],
                        strokeColor: isDark ? [255, 255, 255, 220] : [15, 23, 42, 220],
                        radius: 3.2,
                        tripId: trip.id
                    });
                }

                const dKey = `${t.destLng.toFixed(3)},${t.destLat.toFixed(3)}`;
                if (!pointsMap.has(dKey)) {
                    const hubRGB = showGradientRoutes ? getGeoGradientRGB(t.destLat, t.destLng) : modeRGB;
                    pointsMap.set(dKey, {
                        position: [t.destLng, t.destLat, 0],
                        name: t.destination,
                        color: [...hubRGB, 255],
                        strokeColor: isDark ? [255, 255, 255, 220] : [15, 23, 42, 220],
                        radius: 3.2,
                        tripId: trip.id
                    });
                }
            });
        });

        // 3. Cluster Markers Logic
        const allAirports = Array.from(pointsMap.values());
        const clusters: any[] = [];
        if (clusterMode) {
            const grid = new Map<string, any[]>();
            const gridSize = 1.8; // Degrees grid bucket
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
            clusterNodes: clusters
        };
    }, [enrichedTrips, showFrequencyWeight, showGradientRoutes, showFlightRoutes, showLandSeaRoutes, isDark, isElevatedActive, animateRoutes, clusterMode, showRoadTracing]);

    // Build Deck.gl Layers
    const layers = useMemo(() => {
        const layerList: any[] = [];

        // 1. WebGL Hardware-Accelerated Basemap TileLayer
        layerList.push(
            new TileLayer({
                id: `basemap-tile-layer-${currentLayer}-${isDark ? 'dark' : 'light'}-${projection}`,
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

        // 2. Country Polygons (GeoJSON) - Scratch Map Regional Colors
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
                            // Regional Gradient Colors (Europe: Violet, NA: Blue, SA: Emerald, Asia: Red, Africa: Gold, Oceania: Cyan)
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

        // 3. Scratch Map Visited Place Pins
        if (viewMode === 'scratch' && visitedPlaces.length > 0) {
            layerList.push(
                new ScatterplotLayer({
                    id: 'scratch-visited-places',
                    data: visitedPlaces,
                    getPosition: (d: any) => [d.lng, d.lat, 0],
                    getFillColor: [245, 158, 11, 240], // Vivid Amber Pin
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

        // 4. Underlying Glow Track Layer (Whole-Route Highlight Glow)
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

        // 5. Vibrant Multi-Segment Gradient Flight & Transit Flow Layer
        if (viewMode === 'network' && routeSegments.length > 0) {
            layerList.push(
                new PathLayer({
                    id: `route-flow-lines-${isElevatedActive ? 'elevated' : 'flat'}`,
                    data: routeSegments,
                    getPath: (d: any) => d.path,
                    getColor: (d: any) => {
                        const isHovered = hoveredRouteKey === d.routeKey;
                        if (isHovered) {
                            return [255, 255, 255, 255]; // Crisp whole-route brilliant white highlight
                        }
                        return d.color;
                    },
                    getWidth: (d: any) => {
                        const isHovered = hoveredRouteKey === d.routeKey;
                        return isHovered ? d.width + 1.2 : d.width;
                    },
                    widthUnits: 'pixels',
                    widthMinPixels: 1,
                    widthMaxPixels: 4.5,
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

        // 6. Comet Flow TripsLayer (Animated Neon Pulses along routes)
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

        // 7. Invisible Wide Hit-Test Layer (Generous 18px cursor picking tolerance)
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

        // 8. Airport & City Node Markers / Cluster Markers
        if (showCityMarkers) {
            if (clusterMode && clusterNodes.length > 0) {
                // Cluster Halos
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
                // Cluster Nodes
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
                // Cluster Text Count
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
                        radiusMinPixels: 2.8,
                        radiusMaxPixels: 6,
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
    }, [tileUrl, currentLayer, geoJsonData, routeSegments, trackSegments, cometTrips, hitTestPaths, airportPoints, clusterNodes, showCountries, viewMode, showCityMarkers, visitedCountries, visitedPlaces, isDark, projection, isElevatedActive, hoveredRouteKey, animTime, animateRoutes, clusterMode]);

    return (
        <div className="relative w-full h-full overflow-hidden bg-[#090d16] select-none">
            {/* Deck.gl 60 FPS WebGL Canvas with smooth inertia & 10px picking tolerance */}
            <DeckGL
                views={views}
                viewState={viewState}
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

            {/* Layer View Mode Controls (Top Left) */}
            <div className="absolute top-6 left-6 flex flex-col gap-2 z-20">
                <div className="flex flex-col rounded-2xl border border-white/10 dark:border-white/10 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl shadow-2xl overflow-hidden">
                    {[
                        { id: 'standard', label: 'Standard', icon: 'public' },
                        { id: 'night', label: 'Dark Mode', icon: 'nights_stay' },
                        { id: 'satellite', label: 'Satellite', icon: 'satellite_alt' },
                        { id: 'topography', label: 'Topography', icon: 'terrain' }
                    ].map(layer => (
                        <button
                            key={layer.id}
                            onClick={() => setLocalLayer(layer.id as any)}
                            className={`w-10 h-10 flex items-center justify-center transition-all border-b last:border-0 border-zinc-200/50 dark:border-white/5 cursor-pointer ${
                                currentLayer === layer.id
                                    ? 'text-blue-500 bg-blue-500/15 font-black'
                                    : 'text-zinc-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/10'
                            }`}
                            title={layer.label}
                        >
                            <span className="material-icons-outlined text-lg">{layer.icon}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Projection & Elevation Controls (Top Right) */}
            <div className="absolute top-6 right-6 z-20 flex items-center gap-2.5">
                {/* 3D Elevated Arcs Toggle (Visible when in 3D Globe mode) */}
                {projection === 'globe' && (
                    <button
                        onClick={() => setElevatedRoutes(!elevatedRoutes)}
                        className={`px-3.5 py-2.5 rounded-2xl shadow-2xl backdrop-blur-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all active:scale-95 border ${
                            elevatedRoutes
                                ? 'bg-indigo-600 text-white border-indigo-400/40 shadow-indigo-500/20'
                                : 'bg-white/85 dark:bg-zinc-950/85 hover:bg-white dark:hover:bg-zinc-900 text-zinc-750 dark:text-zinc-300 border-zinc-200/70 dark:border-white/10'
                        }`}
                        title={elevatedRoutes ? 'Switch to Surface Routes on Globe' : 'Elevate Flight Arcs above 3D Globe'}
                    >
                        <span className="material-icons-outlined text-base">
                            {elevatedRoutes ? 'flight_takeoff' : 'flight'}
                        </span>
                        <span>{elevatedRoutes ? 'Elevated Arcs: ON' : 'Elevated: OFF'}</span>
                    </button>
                )}

                {/* 2D Flat Map vs 3D Globe Projection Switcher */}
                <button
                    onClick={handleToggleProjection}
                    className="px-4 py-2.5 bg-white/85 dark:bg-zinc-950/85 hover:bg-white dark:hover:bg-zinc-900 text-zinc-850 dark:text-zinc-100 border border-zinc-200/70 dark:border-white/10 rounded-2xl shadow-2xl backdrop-blur-xl text-xs font-black uppercase tracking-wider flex items-center gap-2.5 cursor-pointer transition-all active:scale-95 group"
                    title={projection === 'flat' ? 'Switch to 3D Globe Projection' : 'Switch to 2D Flat Map'}
                >
                    <span className={`material-icons-outlined text-base transition-transform duration-300 ${projection === 'globe' ? 'text-purple-400 rotate-180' : 'text-blue-500 group-hover:rotate-45'}`}>
                        {projection === 'globe' ? 'public' : 'map'}
                    </span>
                    <span>{projection === 'globe' ? '3D Globe' : 'Flat Map'}</span>
                </button>
            </div>

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
                        onClick={() => setViewState(v => ({ ...v, zoom: Math.max(v.zoom - 0.8, 0) }))}
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
