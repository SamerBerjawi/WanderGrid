
import React, { useEffect, useRef, useMemo, useState } from 'react';
import L from 'leaflet';
import { Trip, Transport } from '../types';
import html2canvas from 'html2canvas';
import { getCoordinates, getCoordinatesSync } from '../services/geocoding';

export type LayerType = 'standard' | 'satellite' | 'topography' | 'hillshade';

interface ExpeditionMapProps {
    trips: Trip[];
    onTripClick?: (tripId: string) => void;
    showFrequencyWeight?: boolean;
    animateRoutes?: boolean;
    visitedCountries?: string[]; // ISO-2 Country Codes
    showCountries?: boolean;
    viewMode?: 'network' | 'scratch';
    visitedPlaces?: { lat: number; lng: number; name: string }[];
    activeLayer?: LayerType;
    onChangeActiveLayer?: (layer: LayerType) => void;
    clusterMode?: boolean;
    onToggleClusterMode?: (val: boolean) => void;
    hideAirportCircles?: boolean;
    airportCircleSize?: number;
    proportionalArcThickness?: boolean;
    showAviationCharts?: boolean;
    showLandSeaRoutes?: boolean;
    onToggleLandSeaRoutes?: (val: boolean) => void;
    showFlightRoutes?: boolean;
    showCityMarkers?: boolean;
    onToggleCityMarkers?: (val: boolean) => void;
    focusTransportCoordinates?: { lat: number; lng: number } | null;
    screenshotTrigger?: number;
    onScreenshotStarted?: () => void;
    onScreenshotCompleted?: () => void;
    showGradientRoutes?: boolean;
    onToggleGradientRoutes?: (val: boolean) => void;
    showRoadTracing?: boolean;
    onToggleRoadTracing?: (val: boolean) => void;
}

// Leaflet default icon fix
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Module-level cache for GeoJSON to prevent re-fetching during session
let cachedGeoJson: any = null;

function splitUKGeoJSON(data: any): any {
    if (!data || !data.features) return data;
    const gbIndex = data.features.findIndex((f: any) => {
        let iso = f.properties?.ISO_A2;
        if (!iso || iso === '-99') iso = f.properties?.ISO_A2_EH;
        return iso === 'GB' || iso === 'UK';
    });

    if (gbIndex === -1) return data;

    const gbFeature = data.features[gbIndex];
    const subNations = [
        { code: 'GB-ENG', name: 'England' },
        { code: 'GB-SCT', name: 'Scotland' },
        { code: 'GB-WLS', name: 'Wales' },
        { code: 'GB-NIR', name: 'Northern Ireland' }
    ];

    const gbGeom = gbFeature.geometry;
    const polys = gbGeom.type === 'Polygon' ? [gbGeom.coordinates] : gbGeom.coordinates;

    const engCoordinates: any[] = [];
    const sctCoordinates: any[] = [];
    const wlsCoordinates: any[] = [];
    const nirCoordinates: any[] = [];

    // Helper to check where a point/vertex lies
    const getPointNation = (lng: number, lat: number) => {
        // Northern Ireland is on the west island (island of Ireland, West of -5.4, South of 55.3)
        if (lng <= -5.4 && lat < 55.3) {
            return 'NIR';
        }
        // Scotland is North of latitude 55.765 (border with England)
        if (lat >= 55.765) {
            return 'SCT';
        }
        // Wales is West of -2.85, between latitude 51.35 and 53.45
        if (lng <= -2.85 && lat < 53.45 && lat > 51.35) {
            return 'WLS';
        }
        return 'ENG';
    };

    polys.forEach((polygon: any) => {
        polygon.forEach((ring: any) => {
            // Classify points in the ring
            const ptsByNation: Record<string, number[][]> = { ENG: [], SCT: [], WLS: [], NIR: [] };
            ring.forEach((pt: number[]) => {
                const nat = getPointNation(pt[0], pt[1]);
                ptsByNation[nat].push(pt);
            });

            const lengths = Object.entries(ptsByNation).map(([k, v]) => ({ nation: k, count: v.length }));
            lengths.sort((a, b) => b.count - a.count);
            const primaryNation = lengths[0].nation;

            // If the ring is predominantly or entirely inside one nation, keep it whole (e.g. islands, Hebrides, Northern Ireland polygon)
            if (lengths[0].count === ring.length || ring.length < 15) {
                if (primaryNation === 'ENG') engCoordinates.push([ring]);
                else if (primaryNation === 'SCT') sctCoordinates.push([ring]);
                else if (primaryNation === 'WLS') wlsCoordinates.push([ring]);
                else if (primaryNation === 'NIR') nirCoordinates.push([ring]);
            } else {
                // Otherwise, split the main ring into clean contiguous sub-nation loops
                const engPts = ring.filter((pt: number[]) => getPointNation(pt[0], pt[1]) === 'ENG');
                const sctPts = ring.filter((pt: number[]) => getPointNation(pt[0], pt[1]) === 'SCT');
                const wlsPts = ring.filter((pt: number[]) => getPointNation(pt[0], pt[1]) === 'WLS');

                if (engPts.length > 2) {
                    engCoordinates.push([engPts]);
                }
                if (sctPts.length > 2) {
                    sctCoordinates.push([sctPts]);
                }
                if (wlsPts.length > 2) {
                    wlsCoordinates.push([wlsPts]);
                }
            }
        });
    });

    const newFeatures = subNations.map(sn => {
        let coords: any[] = [];
        if (sn.code === 'GB-ENG') coords = engCoordinates;
        else if (sn.code === 'GB-SCT') coords = sctCoordinates;
        else if (sn.code === 'GB-WLS') coords = wlsCoordinates;
        else if (sn.code === 'GB-NIR') coords = nirCoordinates;

        return {
            type: "Feature",
            properties: {
                ...gbFeature.properties,
                ISO_A2: sn.code,
                ISO_A2_EH: sn.code,
                NAME: sn.name,
                NAME_LONG: sn.name,
                ADMIN: sn.name
            },
            geometry: {
                type: "MultiPolygon",
                coordinates: coords
            }
        };
    });

    const finalFeatures = [...data.features];
    finalFeatures.splice(gbIndex, 1, ...newFeatures);

    return {
        ...data,
        features: finalFeatures
    };
}

// --- Gradient Color Logic (Vibrant Edition) ---

const COLOR_POLES = [
    { lat: 55, lng: -100, color: [0, 122, 255] },    // NA: Vivid Blue (Apple Blue)
    { lat: -15, lng: -60, color: [0, 200, 83] },     // SA: Vivid Emerald
    { lat: 10, lng: 20, color: [255, 179, 0] },      // Africa: Vivid Amber/Gold
    { lat: 50, lng: 15, color: [124, 58, 237] },     // Europe: Vivid Violet
    { lat: 35, lng: 105, color: [255, 23, 68] },     // Asia: Vivid Red
    { lat: -25, lng: 135, color: [0, 229, 255] },    // Oceania: Vivid Cyan
];

const getGeoGradientColor = (lat: number, lng: number): string => {
    let totalWeight = 0;
    let r = 0, g = 0, b = 0;

    for (const pole of COLOR_POLES) {
        const dLat = lat - pole.lat;
        const dLng = lng - pole.lng;
        // Euclidean distance squared in lat/lng degree space
        const distSq = dLat * dLat + dLng * dLng;
        
        // Inverse Distance Weighting with Sharpening
        // Lower smoothing constant (800) + Power of 1.5 makes colors "stick" to their regions better
        // before blending, resulting in more vibrant core colors.
        const weight = 1 / Math.pow(distSq + 800, 1.5); 
        
        totalWeight += weight;
        r += pole.color[0] * weight;
        g += pole.color[1] * weight;
        b += pole.color[2] * weight;
    }

    r = Math.min(255, Math.max(0, Math.round(r / totalWeight)));
    g = Math.min(255, Math.max(0, Math.round(g / totalWeight)));
    b = Math.min(255, Math.max(0, Math.round(b / totalWeight)));

    return `rgb(${r}, ${g}, ${b})`;
};

const getFeatureCenter = (feature: any): { lat: number, lng: number } => {
    // Try Natural Earth label props first (most accurate for visual center)
    if (feature.properties?.LABEL_Y !== undefined && feature.properties?.LABEL_X !== undefined) {
        return { lat: feature.properties.LABEL_Y, lng: feature.properties.LABEL_X };
    }
    
    // Fallback: Quick centroid estimation
    let coords = feature.geometry.coordinates;
    
    // Handle Polygon vs MultiPolygon
    if (feature.geometry.type === 'MultiPolygon') {
        // Find largest polygon by finding the one with most points (heuristic)
        let maxPoints = 0;
        let bestPoly = coords[0];
        for (const poly of coords) {
            if (poly[0].length > maxPoints) {
                maxPoints = poly[0].length;
                bestPoly = poly;
            }
        }
        coords = bestPoly;
    } else if (feature.geometry.type === 'Polygon') {
        // coords is already the polygon rings
    } else {
        return { lat: 0, lng: 0 };
    }
    
    // Ring 0 is outer boundary
    const ring = coords[0];
    if (!ring || ring.length === 0) return { lat: 0, lng: 0 };

    let minX = 180, maxX = -180, minY = 90, maxY = -90;
    
    // Sampling for speed on complex coastlines
    const step = Math.max(1, Math.floor(ring.length / 50));
    
    for(let i=0; i<ring.length; i+=step) {
        const [lng, lat] = ring[i];
        if (lng < minX) minX = lng;
        if (lng > maxX) maxX = lng;
        if (lat < minY) minY = lat;
        if (lat > maxY) maxY = lat;
    }
    
    return { lat: (minY + maxY) / 2, lng: (minX + maxX) / 2 };
};

// Custom Hook to detect Dark Mode changes from Tailwind class on HTML element
const useDarkMode = () => {
    const [isDark, setIsDark] = useState(document.documentElement.classList.contains('dark'));

    useEffect(() => {
        const observer = new MutationObserver(() => {
            setIsDark(document.documentElement.classList.contains('dark'));
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    return isDark;
};

// Helper to normalize route key
const getRouteKey = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const p1 = `${lat1.toFixed(3)},${lng1.toFixed(3)}`;
    const p2 = `${lat2.toFixed(3)},${lng2.toFixed(3)}`;
    return p1 < p2 ? `${p1}|${p2}` : `${p2}|${p1}`;
};

// Open-source OSRM route fetcher for land transit
const fetchOSRMRoute = async (lat1: number, lng1: number, lat2: number, lng2: number): Promise<L.LatLng[] | null> => {
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        if (data && data.routes && data.routes[0] && data.routes[0].geometry) {
            const coords = data.routes[0].geometry.coordinates; // Array of [lng, lat]
            return coords.map((c: [number, number]) => L.latLng(c[1], c[0]));
        }
    } catch (e) {
        console.error("OSRM route fetch failed", e);
    }
    return null;
};

// Spherical Geodesic (Great-Circle) Path Generator following Earth's curvature
const getCurvePoints = (start: L.LatLng, end: L.LatLng): L.LatLng[] => {
    const lat1 = start.lat * Math.PI / 180;
    const lng1 = start.lng * Math.PI / 180;
    let lat2 = end.lat * Math.PI / 180;
    let lng2 = end.lng * Math.PI / 180;

    // Detect Shortest Path (Pacific Crossing)
    let lng2Deg = end.lng;
    const diffDeg = end.lng - start.lng;
    if (diffDeg > 180) {
        lng2Deg -= 360;
    } else if (diffDeg < -180) {
        lng2Deg += 360;
    }
    lng2 = lng2Deg * Math.PI / 180;

    // Angular distance between points on sphere (Great Circle angle) using Haversine formula
    const d = 2 * Math.asin(Math.sqrt(
        Math.pow(Math.sin((lat2 - lat1) / 2), 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) * Math.sin((lng2 - lng1) / 2)
    ));

    const points: L.LatLng[] = [];
    // Dynamic sampling steps for beautiful geodesic curvature without over-density
    const steps = Math.min(80, Math.max(15, Math.ceil(d * 40)));

    // If points are virtually coincident, return a direct line interpolation
    if (d < 0.0001) {
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const lat = start.lat + t * (end.lat - start.lat);
            const lng = start.lng + t * (lng2Deg - start.lng);
            points.push(L.latLng(lat, lng));
        }
        return points;
    }

    let prevLngDeg = start.lng;

    for (let i = 0; i <= steps; i++) {
        const f = i / steps;

        // Spherical Interpolation formula (SLERP-like on Unit Sphere)
        const A = Math.sin((1 - f) * d) / Math.sin(d);
        const B = Math.sin(f * d) / Math.sin(d);

        // Cartesian coordinates of intermediate point on sphere
        const x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
        const y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
        const z = A * Math.sin(lat1) + B * Math.sin(lat2);

        // Convert back to latitude and longitude
        const latRad = Math.atan2(z, Math.sqrt(x * x + y * y));
        const lngRad = Math.atan2(y, x);

        const latDeg = latRad * 180 / Math.PI;
        let lngDeg = lngRad * 180 / Math.PI;

        // Unwrap longitudes: check if we crossed the 180/-180 boundary relative to previous step
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
        points.push(L.latLng(latDeg, lngDeg));
    }

    return points;
};

// Helper to determine styling
const getStatusStyle = (trip: Trip, isDark: boolean, activeLayer: string) => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const endDate = new Date(trip.endDate);
    
    // Adjust colors based on map layer for visibility
    const isSatellite = activeLayer === 'satellite';
    const baseWhite = isSatellite ? '#ffffff' : (isDark ? '#ffffff' : '#475569');
    
    // Determine base class suffix for colors defined in CSS
    if (endDate < today) {
         return { color: '#3b82f6', className: 'flight-path-blue' }; 
    }

    switch (trip.status) {
        case 'Past':
            return { color: '#3b82f6', className: 'flight-path-blue' }; 
        case 'Upcoming':
            return { color: '#10b981', className: 'flight-path-green' }; 
        case 'Planning':
        default:
            return { 
                color: baseWhite, 
                className: isSatellite || isDark ? 'flight-path-white' : 'flight-path-dark' 
            }; 
    }
};

interface PointItem {
    lat: number;
    lng: number;
    name: string;
    tripId?: string;
    color?: string;
    isEndpoint?: boolean;
    isFlight?: boolean;
}

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function normalizeCityName(name: string): string {
    if (!name) return '';
    return name
        .toLowerCase()
        .replace(/,/g, ' ')
        .replace(/\b(airport|city|intl|international|municipal|greater|ltd|corp)\b/gi, '')
        .replace(/\b(france|uk|usa|germany|spain|italy|canada|australia|japan|china|united kingdom|united states)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function areSameCity(name1: string, name2: string, lat1: number, lng1: number, lat2: number, lng2: number): boolean {
    const d = getDistanceKm(lat1, lng1, lat2, lng2);
    // If locations are within 35 km of each other, they are candidates for city amalgamation
    if (d < 35) {
        const norm1 = normalizeCityName(name1);
        const norm2 = normalizeCityName(name2);
        
        if (norm1 === norm2 || norm1.includes(norm2) || norm2.includes(norm1)) {
            return true;
        }
        
        // Match substantial words (length >= 3)
        const words1 = norm1.split(' ').filter(w => w.length >= 3);
        const words2 = norm2.split(' ').filter(w => w.length >= 3);
        for (const w1 of words1) {
            if (words2.includes(w1)) return true;
        }
    }
    return false;
}

function getShorterCleanerName(name1: string, name2: string): string {
    const n1 = name1.trim();
    const n2 = name2.trim();
    
    // Choose the name without a comma (typically cleaner city-only name like "Paris" versus "Paris, France")
    const hasComma1 = n1.includes(',');
    const hasComma2 = n2.includes(',');
    if (!hasComma1 && hasComma2) return n1;
    if (hasComma1 && !hasComma2) return n2;
    
    return n1.length <= n2.length ? n1 : n2;
}

const performClustering = (map: L.Map, points: PointItem[], radiusPixels = 50) => {
    const flightPoints = points.filter(p => p.isFlight);
    const landSeaPoints = points.filter(p => !p.isFlight);

    const clusterGroup = (ptsList: PointItem[]) => {
        const clusters: { lat: number; lng: number; points: PointItem[]; id: string }[] = [];
        
        // De-duplicate points based on extremely close latitude and longitude (same city)
        const uniquePoints: PointItem[] = [];
        ptsList.forEach(p => {
            const dup = uniquePoints.find(up => Math.abs(up.lat - p.lat) < 0.005 && Math.abs(up.lng - p.lng) < 0.005);
            if (dup) {
                // Merge labels
                if (!dup.name.includes(p.name)) {
                    dup.name += `, ${p.name}`;
                }
            } else {
                uniquePoints.push({ ...p });
            }
        });

        uniquePoints.forEach(p => {
            const lp = map.latLngToLayerPoint([p.lat, p.lng]);
            
            let foundCluster = false;
            for (const c of clusters) {
                const clp = map.latLngToLayerPoint([c.lat, c.lng]);
                const dist = Math.sqrt(Math.pow(lp.x - clp.x, 2) + Math.pow(lp.y - clp.y, 2));
                if (dist < radiusPixels) {
                    c.points.push(p);
                    // Recompute centroid
                    const sumLat = c.points.reduce((s, pt) => s + pt.lat, 0);
                    const sumLng = c.points.reduce((s, pt) => s + pt.lng, 0);
                    c.lat = sumLat / c.points.length;
                    c.lng = sumLng / c.points.length;
                    foundCluster = true;
                    break;
                }
            }
            
            if (!foundCluster) {
                clusters.push({
                    lat: p.lat,
                    lng: p.lng,
                    points: [p],
                    id: Math.random().toString(36).substr(2, 9)
                });
            }
        });
        
        return clusters;
    };

    const flightClusters = clusterGroup(flightPoints);
    const landSeaClusters = clusterGroup(landSeaPoints);

    return [...flightClusters, ...landSeaClusters];
};

export const ExpeditionMap: React.FC<ExpeditionMapProps> = ({ 
    trips, 
    onTripClick, 
    showFrequencyWeight = true, 
    animateRoutes = true,
    visitedCountries = [],
    showCountries = false,
    viewMode = 'network',
    visitedPlaces = [],
    activeLayer: activeLayerProp,
    onChangeActiveLayer,
    clusterMode: clusterModeProp,
    onToggleClusterMode,
    hideAirportCircles = false,
    airportCircleSize = 2,
    proportionalArcThickness = true,
    showAviationCharts = false,
    showLandSeaRoutes: showLandSeaRoutesProp,
    onToggleLandSeaRoutes,
    showFlightRoutes = true,
    showCityMarkers: showCityMarkersProp,
    onToggleCityMarkers,
    focusTransportCoordinates,
    screenshotTrigger,
    onScreenshotStarted,
    onScreenshotCompleted,
    showGradientRoutes: showGradientRoutesProp,
    onToggleGradientRoutes,
    showRoadTracing: showRoadTracingProp,
    onToggleRoadTracing
}) => {
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

                return {
                    ...t,
                    originLat,
                    originLng,
                    destLat,
                    destLng
                };
            });
            return {
                ...trip,
                transports: enrichedTransports
            };
        });
    }, [trips]);

    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const tileLayerRef = useRef<L.TileLayer | null>(null);
    const openAipLayerRef = useRef<L.TileLayer | null>(null);
    const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
    const routeLayerGroupRef = useRef<L.LayerGroup | null>(null);
    const markerLayerGroupRef = useRef<L.LayerGroup | null>(null);
    const customLayerGroupRef = useRef<L.LayerGroup | null>(null);
    const [isScreenshotting, setIsScreenshotting] = useState(false);
    
    // --- CUSTOM WAYPOINT AND PATH SEGMENTS PLACEMENT DECK ---
    const [manualWaypoints, setManualWaypoints] = useState<any[]>(() => {
        try {
            const saved = localStorage.getItem('wandergrid_manual_waypoints');
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });

    const [manualSegments, setManualSegments] = useState<any[]>(() => {
        try {
            const saved = localStorage.getItem('wandergrid_manual_segments');
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });

    const saveWaypoints = (wps: any[]) => {
        setManualWaypoints(wps);
        try {
            localStorage.setItem('wandergrid_manual_waypoints', JSON.stringify(wps));
        } catch (e) {
            console.warn(e);
        }
    };

    const saveSegments = (segs: any[]) => {
        setManualSegments(segs);
        try {
            localStorage.setItem('wandergrid_manual_segments', JSON.stringify(segs));
        } catch (e) {
            console.warn(e);
        }
    };

    const [isWaypointPanelOpen, setIsWaypointPanelOpen] = useState(false);
    const [pinningMode, setPinningMode] = useState(false);
    const pinningModeRef = useRef(false);
    useEffect(() => {
        pinningModeRef.current = pinningMode;
    }, [pinningMode]);

    const [pendingPinCoord, setPendingPinCoord] = useState<{ lat: number, lng: number } | null>(null);
    const [newPinName, setNewPinName] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchLoading, setSearchLoading] = useState(false);

    // Form inputs for segments
    const [segFromId, setSegFromId] = useState('');
    const [segToId, setSegToId] = useState('');
    const [segColor, setSegColor] = useState('#ec4899');
    const [segStyle, setSegStyle] = useState('animated');
    const [segModeRoad, setSegModeRoad] = useState(false);

    const handleMapClick = (lat: number, lng: number) => {
        setPendingPinCoord({ lat, lng });
        setNewPinName('');
        setIsWaypointPanelOpen(true);
    };

    const handleSavePendingPin = () => {
        if (!pendingPinCoord) return;
        const nameToSave = newPinName.trim() || `Pin at ${pendingPinCoord.lat.toFixed(3)}, ${pendingPinCoord.lng.toFixed(3)}`;
        
        const newWp = {
            id: `wp-${Math.random().toString(36).substring(2, 11)}`,
            name: nameToSave,
            lat: pendingPinCoord.lat,
            lng: pendingPinCoord.lng,
            timestamp: Date.now()
        };

        const updatedWps = [...manualWaypoints, newWp];
        saveWaypoints(updatedWps);
        setPendingPinCoord(null);
        setNewPinName('');
    };

    const handleSearchAndPin = async () => {
        if (!searchQuery.trim()) return;
        setSearchLoading(true);
        try {
            const loc = await getCoordinates(searchQuery);
            if (loc) {
                const newWp = {
                    id: `wp-${Math.random().toString(36).substring(2, 11)}`,
                    name: searchQuery.trim(),
                    lat: loc.lat,
                    lng: loc.lng,
                    timestamp: Date.now()
                };
                
                const updatedWps = [...manualWaypoints, newWp];
                saveWaypoints(updatedWps);
                
                if (mapInstance.current) {
                    mapInstance.current.flyTo([loc.lat, loc.lng], 7, { animate: true, duration: 1.5 });
                }
                
                setSearchQuery('');
            } else {
                alert(`Could not resolve location coordinates for "${searchQuery}"`);
            }
        } catch (e) {
            console.warn(e);
            alert("Geocoding lookup encountered an error.");
        } finally {
            setSearchLoading(false);
        }
    };

    const handleFlyToWaypoint = (wp: any) => {
        if (mapInstance.current) {
            mapInstance.current.flyTo([wp.lat, wp.lng], 8, { animate: true, duration: 1.5 });
        }
    };

    const handleDeleteWaypoint = (id: string) => {
        const updatedWps = manualWaypoints.filter(wp => wp.id !== id);
        saveWaypoints(updatedWps);

        const updatedSegs = manualSegments.filter(seg => seg.fromId !== id && seg.toId !== id);
        saveSegments(updatedSegs);
        
        if (segFromId === id) setSegFromId('');
        if (segToId === id) setSegToId('');
    };

    const handleClearAllWaypoints = () => {
        if (window.confirm("Are you sure you want to clear all manual waypoints and connection paths?")) {
            saveWaypoints([]);
            saveSegments([]);
            setSegFromId('');
            setSegToId('');
        }
    };

    const handleEstablishSegment = () => {
        if (!segFromId || !segToId) {
            alert("Please select both a Source and a Destination waypoint.");
            return;
        }
        if (segFromId === segToId) {
            alert("Source and Destination waypoints must be different.");
            return;
        }

        const newSeg = {
            id: `seg-${Math.random().toString(36).substring(2, 11)}`,
            fromId: segFromId,
            toId: segToId,
            color: segColor,
            style: segStyle,
            mode: segModeRoad ? 'road' : 'direct',
            timestamp: Date.now()
        };

        const updatedSegs = [...manualSegments, newSeg];
        saveSegments(updatedSegs);

        // Chain helper
        setSegFromId(segToId);
        setSegToId('');
    };

    const handleDeleteSegment = (id: string) => {
        const updatedSegs = manualSegments.filter(seg => seg.id !== id);
        saveSegments(updatedSegs);
    };

    // Calculate distance in kilometers
    const getDistanceKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
        const R = 6371; // Earth's radius
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = 
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };
    
    // Road tracing / OpenSource routing cache & toggles
    const [localEnableRoadTracing, setLocalEnableRoadTracing] = useState(() => {
        return localStorage.getItem('wandergrid_road_tracing') === 'true';
    });
    const enableRoadTracing = showRoadTracingProp !== undefined ? showRoadTracingProp : localEnableRoadTracing;
    const handleToggleRoadTracing = (val: boolean) => {
        setLocalEnableRoadTracing(val);
        localStorage.setItem('wandergrid_road_tracing', String(val));
        if (onToggleRoadTracing) {
            onToggleRoadTracing(val);
        }
    };
    const [osrmCache, setOsrmCache] = useState<Record<string, L.LatLng[]>>({});

    // Gradient routes local sync state variables
    const [localShowGradientRoutes, setLocalShowGradientRoutes] = useState(() => {
        return localStorage.getItem('wandergrid_gradient_routes') !== 'false';
    });
    const showGradientRoutes = showGradientRoutesProp !== undefined ? showGradientRoutesProp : localShowGradientRoutes;
    const handleToggleGradientRoutes = (val: boolean) => {
        setLocalShowGradientRoutes(val);
        localStorage.setItem('wandergrid_gradient_routes', String(val));
        if (onToggleGradientRoutes) {
            onToggleGradientRoutes(val);
        }
    };
    
    // Controlled state or fallback for showing land and sea routes (defaulting to true for full visibility)
    const [localShowLandSeaRoutes, setLocalShowLandSeaRoutes] = useState(true);
    const showLandSeaRoutes = showLandSeaRoutesProp !== undefined ? showLandSeaRoutesProp : localShowLandSeaRoutes;
    
    // Controlled and auto-synchronized state variables representing active map layers
    const [localActiveLayer, setLocalActiveLayer] = useState<LayerType>('standard');
    const activeLayer = activeLayerProp !== undefined ? activeLayerProp : localActiveLayer;
    const setActiveLayer = (layer: LayerType) => {
        setLocalActiveLayer(layer);
        if (onChangeActiveLayer) {
            onChangeActiveLayer(layer);
        }
    };
    useEffect(() => {
        if (activeLayerProp !== undefined) {
            setLocalActiveLayer(activeLayerProp);
        }
    }, [activeLayerProp]);

    // Fly to target when focusTransportCoordinates changes
    useEffect(() => {
        if (mapInstance.current && focusTransportCoordinates) {
            mapInstance.current.flyTo(
                [focusTransportCoordinates.lat, focusTransportCoordinates.lng],
                6,
                { animate: true, duration: 2.0 }
            );
        }
    }, [focusTransportCoordinates]);

    // Marker Clustering state synchronizers
    const [localClusterMode, setLocalClusterMode] = useState(() => localStorage.getItem('wandergrid_cluster_markers') !== 'false');
    const clusterMode = clusterModeProp !== undefined ? clusterModeProp : localClusterMode;
    const setClusterMode = (mode: boolean) => {
        setLocalClusterMode(mode);
        localStorage.setItem('wandergrid_cluster_markers', String(mode));
        if (onToggleClusterMode) {
            onToggleClusterMode(mode);
        }
    };
    useEffect(() => {
        if (clusterModeProp !== undefined) {
            setLocalClusterMode(clusterModeProp);
        }
    }, [clusterModeProp]);

    // City markers configuration
    const [localShowCityMarkers, setLocalShowCityMarkers] = useState(true);
    const showCityMarkers = showCityMarkersProp !== undefined ? showCityMarkersProp : localShowCityMarkers;

    const lastFitRef = useRef<string>('');
    const [mapZoom, setMapZoom] = useState(2);
    const [geoJsonData, setGeoJsonData] = useState<any>(cachedGeoJson);
    const isDark = useDarkMode();

    // Hook to capture screenshot on external trigger
    useEffect(() => {
        if (screenshotTrigger && screenshotTrigger > 0) {
            handleScreenshot();
        }
    }, [screenshotTrigger]);

    // Multi-segment OSRM route lazy fetcher
    useEffect(() => {
        if (!enableRoadTracing) return;

        const missingSegments: { key: string; p1: L.LatLng; p2: L.LatLng }[] = [];
        const seenKeys = new Set<string>();

        enrichedTrips.forEach(trip => {
            trip.transports?.forEach(t => {
                if (t.originLat && t.originLng && t.destLat && t.destLng) {
                    const isLand = ['Car Rental', 'Personal Car', 'Bus', 'Train'].includes(t.mode);
                    if (!isLand) return;

                    // Reconstruct pathPoints
                    const pts: L.LatLng[] = [L.latLng(t.originLat, t.originLng)];
                    if (t.waypoints && t.waypoints.length > 0) {
                        t.waypoints.forEach(wp => {
                            if (wp.coordinates) {
                                pts.push(L.latLng(wp.coordinates.lat, wp.coordinates.lng));
                            }
                        });
                    }
                    pts.push(L.latLng(t.destLat, t.destLng));

                    // Identify missing segments
                    for (let i = 0; i < pts.length - 1; i++) {
                        const p1 = pts[i];
                        const p2 = pts[i + 1];
                        const key = `${p1.lat.toFixed(4)},${p1.lng.toFixed(4)}|${p2.lat.toFixed(4)},${p2.lng.toFixed(4)}`;
                        if (!osrmCache[key] && !seenKeys.has(key)) {
                            seenKeys.add(key);
                            missingSegments.push({ key, p1, p2 });
                        }
                    }
                }
            });
        });

        if (missingSegments.length === 0) return;

        let active = true;
        const fetchAllMissing = async () => {
            const updates: Record<string, L.LatLng[]> = {};
            for (const item of missingSegments) {
                if (!active) break;
                const p1 = item.p1;
                const p2 = item.p2;
                const fetched = await fetchOSRMRoute(p1.lat, p1.lng, p2.lat, p2.lng);
                if (fetched && fetched.length > 0) {
                    updates[item.key] = fetched;
                }
                // Small gap between calls to be respectful of OSM's public router
                await new Promise(resolve => setTimeout(resolve, 150));
            }
            if (active && Object.keys(updates).length > 0) {
                setOsrmCache(prev => ({ ...prev, ...updates }));
            }
        };

        fetchAllMissing();
        return () => {
            active = false;
        };
    }, [enrichedTrips, enableRoadTracing, osrmCache]);

    // Pre-calculate frequencies
    const routeFrequencies = useMemo(() => {
        const counts = new Map<string, number>();
        enrichedTrips.forEach(trip => {
            trip.transports?.forEach(t => {
                if (t.originLat && t.originLng && t.destLat && t.destLng) {
                    const key = getRouteKey(t.originLat, t.originLng, t.destLat, t.destLng);
                    counts.set(key, (counts.get(key) || 0) + 1);
                }
            });
        });
        return counts;
    }, [enrichedTrips]);

    // Load GeoJSON once
    useEffect(() => {
        if (cachedGeoJson) {
            setGeoJsonData(cachedGeoJson);
            return;
        }

        fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson')
            .then(r => r.json())
            .then(data => {
                const splitData = splitUKGeoJSON(data);
                cachedGeoJson = splitData;
                setGeoJsonData(splitData);
            })
            .catch(e => console.warn("Failed to load country shapes", e));
    }, []);

    useEffect(() => {
        if (!mapContainer.current || mapInstance.current) return;

        const map = L.map(mapContainer.current, {
            zoomControl: false,
            attributionControl: false,
            scrollWheelZoom: true,
            worldCopyJump: true,
            preferCanvas: false, // Use high-fidelity native SVG vectors for ultra-smooth rendering, custom classes, animations, and zero-stagger zoom interactions
            zoomSnap: 0.1,
            zoomDelta: 0.1,
            minZoom: 0,
            maxZoom: 18
        }).setView([25, 10], 2); // Slightly centered for aesthetics

        mapInstance.current = map;

        // Initialize layer groups and add them to map
        routeLayerGroupRef.current = L.layerGroup().addTo(map);
        markerLayerGroupRef.current = L.layerGroup().addTo(map);
        customLayerGroupRef.current = L.layerGroup().addTo(map);

        // Map Click Listener for Pinning custom Waypoints
        map.on('click', (e: L.LeafletMouseEvent) => {
            if (pinningModeRef.current) {
                handleMapClick(e.latlng.lat, e.latlng.lng);
            }
        });

        // Force react update on zoom / zoom ending to recalculate spatial marker clustering grids
        map.on('zoom', () => {
            const z = map.getZoom();
            setMapZoom(Math.round(z * 10) / 10);
        });
        map.on('zoomend', () => {
            const z = map.getZoom();
            setMapZoom(Math.round(z * 10) / 10);
        });

        // Resize Observer to handle container size changes (e.g. sidebar toggle)
        const resizeObserver = new ResizeObserver(() => {
            map.invalidateSize();
        });
        resizeObserver.observe(mapContainer.current);

        return () => {
            resizeObserver.disconnect();
            if (mapInstance.current) {
                mapInstance.current.remove();
                mapInstance.current = null;
            }
            routeLayerGroupRef.current = null;
            markerLayerGroupRef.current = null;
            customLayerGroupRef.current = null;
        };
    }, []);

    // Handle Tile Layer Switching
    useEffect(() => {
        if (!mapInstance.current) return;
        const map = mapInstance.current;

        if (tileLayerRef.current) {
            map.removeLayer(tileLayerRef.current);
        }

        let tileUrl = '';
        let attribution = '';

        if (activeLayer === 'satellite') {
            tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
            attribution = '&copy; Esri';
        } else if (activeLayer === 'topography') {
            tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}';
            attribution = '&copy; Esri';
        } else if (activeLayer === 'hillshade') {
            tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}';
            attribution = 'Tiles &copy; Esri &mdash; Source: Esri';
        } else {
            tileUrl = isDark 
                ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
            attribution = '&copy; OpenStreetMap contributors &copy; CARTO';
        }

        const layer = L.tileLayer(tileUrl, {
            attribution,
            subdomains: 'abcd',
            maxZoom: 19,
            noWrap: false 
        }).addTo(map);

        tileLayerRef.current = layer;
    }, [isDark, activeLayer]);

    // Handle openAIP Aviation Overlay Tileset
    useEffect(() => {
        if (!mapInstance.current) return;
        const map = mapInstance.current;

        if (openAipLayerRef.current) {
            map.removeLayer(openAipLayerRef.current);
            openAipLayerRef.current = null;
        }

        if (showAviationCharts) {
            // openAIP public aeronautical web charts
            const url = 'https://{s}.tile.maps.openaip.net/geowebcache/service/tms/1.0.0/openaip_basemap_aerodromes@EPSG%3A900913@png/{z}/{x}/{y}.png';
            const layer = L.tileLayer(url, {
                maxZoom: 14,
                minZoom: 3,
                tms: true,
                detectRetina: true,
                subdomains: '12',
                opacity: 0.75
            }).addTo(map);
            openAipLayerRef.current = layer;
        }
    }, [showAviationCharts]);

    // Memoized collection of raw endpoints and places of interest (prevents map tearing on zoom)
    const rawPoints = useMemo<PointItem[]>(() => {
        const pts: PointItem[] = [];
        if (viewMode === 'scratch') {
            visitedPlaces.forEach(place => {
                pts.push({ lat: place.lat, lng: place.lng, name: place.name });
            });
        } else {
            enrichedTrips.forEach(trip => {
                const flightStyle = getStatusStyle(trip, isDark, activeLayer);

                if (trip.transports && trip.transports.length > 0) {
                    trip.transports.forEach(t => {
                        if (t.originLat && t.originLng && t.destLat && t.destLng) {
                            const isFlight = t.mode === 'Flight';
                            const isLand = ['Car Rental', 'Personal Car', 'Bus', 'Train'].includes(t.mode);
                            const isSea = ['Cruise', 'Ferry'].includes(t.mode);

                            if (isFlight && !showFlightRoutes) return;
                            if (!isFlight && !showLandSeaRoutes) return;

                            let color = flightStyle.color;
                            if (isLand) {
                                color = '#f59e0b';
                            } else if (isSea) {
                                color = '#06b6d4';
                            }

                            pts.push({
                                lat: t.originLat,
                                lng: t.originLng,
                                name: t.origin,
                                tripId: trip.id,
                                color: color,
                                isEndpoint: true,
                                isFlight: isFlight
                            });

                            if (t.waypoints && t.waypoints.length > 0) {
                                t.waypoints.forEach(wp => {
                                    if (wp.coordinates) {
                                        pts.push({
                                            lat: wp.coordinates.lat,
                                            lng: wp.coordinates.lng,
                                            name: wp.name,
                                            tripId: trip.id,
                                            color: color,
                                            isEndpoint: false,
                                            isFlight: isFlight
                                        });
                                    }
                                });
                            }

                            pts.push({
                                lat: t.destLat,
                                lng: t.destLng,
                                name: t.destination,
                                tripId: trip.id,
                                color: color,
                                isEndpoint: true,
                                isFlight: isFlight
                            });
                        }
                    });
                } else if (trip.coordinates) {
                    const { color } = getStatusStyle(trip, isDark, activeLayer);
                    pts.push({
                        lat: trip.coordinates.lat,
                        lng: trip.coordinates.lng,
                        name: trip.location || trip.name,
                        tripId: trip.id,
                        color: color,
                        isEndpoint: true,
                        isFlight: false
                    });
                }
            });
        }

        // Auto-group and consolidate separate locations that refer to the same logical city (e.g., "Paris" and "Paris, France")
        const mergedPts: PointItem[] = [];
        pts.forEach(p => {
            const dup = mergedPts.find(up => areSameCity(up.name, p.name, up.lat, up.lng, p.lat, p.lng));
            if (dup) {
                const cleanName = getShorterCleanerName(dup.name, p.name);
                if (cleanName === p.name) {
                    dup.lat = p.lat;
                    dup.lng = p.lng;
                }
                dup.name = cleanName;
                if (p.isEndpoint) dup.isEndpoint = true;
                if (p.isFlight) dup.isFlight = true;
            } else {
                mergedPts.push({ ...p });
            }
        });

        return mergedPts;
    }, [enrichedTrips, viewMode, visitedPlaces, isDark, activeLayer, showLandSeaRoutes, showFlightRoutes]);

    // Track last fitted state to prevent annoying resetting during active interactions
    const lastFittedPointsRef = useRef<string>('');

    // Handle Auto-Fitting Bounds (Only runs on initial paint or actual trips changes, NEVER on zoom)
    useEffect(() => {
        if (!mapInstance.current || rawPoints.length === 0) return;
        const map = mapInstance.current;

        const pointsKey = rawPoints.map(p => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|');
        if (lastFittedPointsRef.current === pointsKey) return;
        lastFittedPointsRef.current = pointsKey;

        const bounds = L.latLngBounds([]);
        rawPoints.forEach(pt => bounds.extend([pt.lat, pt.lng]));

        map.fitBounds(bounds, { padding: [80, 80], maxZoom: 6 });
    }, [rawPoints]);

    // Handle GeoJSON Countries Shape highlighting
    useEffect(() => {
        if (!mapInstance.current) return;
        const map = mapInstance.current;

        if (geoJsonLayerRef.current) {
            map.removeLayer(geoJsonLayerRef.current);
            geoJsonLayerRef.current = null;
        }

        const shouldShowCountries = showCountries || viewMode === 'scratch' || viewMode === 'network';
        if (shouldShowCountries && geoJsonData) {
            geoJsonLayerRef.current = L.geoJSON(geoJsonData, {
                style: (feature) => {
                    let iso = feature?.properties?.ISO_A2;
                    if (!iso || iso === '-99') {
                        iso = feature?.properties?.ISO_A2_EH;
                    }
                    const isVisited = visitedCountries.includes(iso);
                    
                    let gradientColor = '#333';
                    if (isVisited) {
                        const center = getFeatureCenter(feature);
                        gradientColor = getGeoGradientColor(center.lat, center.lng);
                    }

                    if (viewMode === 'scratch') {
                        let fillColor = isDark ? '#09090b' : '#f8fafc';
                        return {
                            color: isDark ? '#222' : '#e5e5e5',
                            weight: 1,
                            fillColor: isVisited ? gradientColor : fillColor, 
                            fillOpacity: isVisited ? 0.6 : 0.5,
                        };
                    } else {
                        const shouldFill = isVisited && showCountries;
                        return {
                            color: isDark ? '#333' : '#ddd',
                            weight: 1,
                            fillColor: shouldFill ? gradientColor : 'transparent',
                            fillOpacity: shouldFill ? 0.4 : 0,
                        };
                    }
                }
            }).addTo(map);
        }
    }, [geoJsonData, showCountries, visitedCountries, viewMode, isDark]);

    // Handle Route Lines drawing (curves, land trace paths & animated flows)
    useEffect(() => {
        if (!mapInstance.current || !routeLayerGroupRef.current) return;
        const map = mapInstance.current;
        const routeGroup = routeLayerGroupRef.current;

        routeGroup.clearLayers();

        if (viewMode === 'scratch') return;

        enrichedTrips.forEach(trip => {
            const flightStyle = getStatusStyle(trip, isDark, activeLayer);

            if (trip.transports && trip.transports.length > 0) {
                console.log("ExpeditionMap: drawing transports length:", trip.transports.length);
                trip.transports.forEach(t => {
                    console.log("ExpeditionMap info for transport:", t.origin, "->", t.destination, "mode:", t.mode, "coords:", {originLat: t.originLat, originLng: t.originLng, destLat: t.destLat, destLng: t.destLng});
                    if (t.originLat && t.originLng && t.destLat && t.destLng) {
                        const isFlight = t.mode === 'Flight';
                        const isLand = ['Car Rental', 'Personal Car', 'Bus', 'Train'].includes(t.mode);
                        const isSea = ['Cruise', 'Ferry'].includes(t.mode);

                        if (isFlight && !showFlightRoutes) return;
                        if (!isFlight && !showLandSeaRoutes) return;

                        let color = flightStyle.color;
                        let className = flightStyle.className;

                        if (isLand) {
                            color = '#f59e0b';
                            className = 'flight-path-land';
                        } else if (isSea) {
                            color = '#06b6d4';
                            className = 'flight-path-sea';
                        }

                        const pathPoints: L.LatLng[] = [L.latLng(t.originLat, t.originLng)];
                        
                        if (t.waypoints && t.waypoints.length > 0) {
                            t.waypoints.forEach(wp => {
                                if (wp.coordinates) {
                                    pathPoints.push(L.latLng(wp.coordinates.lat, wp.coordinates.lng));
                                }
                            });
                        }
                        
                        pathPoints.push(L.latLng(t.destLat, t.destLng));

                        const fullCurvedPath: L.LatLng[] = [];
                        
                        for (let i = 0; i < pathPoints.length - 1; i++) {
                            const p1 = pathPoints[i];
                            const p2 = pathPoints[i+1];
                            let segmentCurve: L.LatLng[] = [];
                            
                            const segmentKey = `${p1.lat.toFixed(4)},${p1.lng.toFixed(4)}|${p2.lat.toFixed(4)},${p2.lng.toFixed(4)}`;
                            if (enableRoadTracing && isLand && osrmCache[segmentKey]) {
                                segmentCurve = [...osrmCache[segmentKey]];
                            } else {
                                segmentCurve = getCurvePoints(p1, p2);
                            }
                            
                            if (i > 0 && segmentCurve.length > 0) segmentCurve.shift();
                            fullCurvedPath.push(...segmentCurve);
                        }

                        const key = getRouteKey(t.originLat, t.originLng, t.destLat, t.destLng);
                        const freq = routeFrequencies.get(key) || 1;
                        
                        const baseWeight = animateRoutes ? 2 : 1;
                        const freqIncrement = animateRoutes ? 0.8 : 0.4;
                        const maxWeight = animateRoutes ? 8 : 4;
                        const dynamicWeight = showFrequencyWeight && proportionalArcThickness 
                            ? Math.min(maxWeight, baseWeight + ((freq - 1) * freqIncrement)) 
                            : baseWeight;

                        const trackSections: L.Polyline[] = [];
                        const flowSections: L.Polyline[] = [];

                        if (showGradientRoutes) {
                            const numSections = 12;
                            const pointsPerSection = Math.ceil(fullCurvedPath.length / numSections);
                            
                            for (let s = 0; s < numSections; s++) {
                                const startIdx = s * pointsPerSection;
                                const endIdx = Math.min(fullCurvedPath.length - 1, (s + 1) * pointsPerSection);
                                if (startIdx >= endIdx) break;
                                
                                const sectionPoints = fullCurvedPath.slice(startIdx, endIdx + 1);
                                const midPt = sectionPoints[Math.floor(sectionPoints.length / 2)];
                                const sectionColor = getGeoGradientColor(midPt.lat, midPt.lng);
                                
                                const sectionTrack = L.polyline(sectionPoints, {
                                    color: sectionColor,
                                    weight: animateRoutes ? (1 + (dynamicWeight * 0.2)) : 0.5,
                                    opacity: (isDark || activeLayer === 'satellite') ? 0.35 : 0.45,
                                    className: `flight-path-track ${className}`,
                                    interactive: false,
                                    smoothFactor: 1.0
                                }).addTo(routeGroup);
                                trackSections.push(sectionTrack);
                                
                                const sectionFlow = L.polyline(sectionPoints, {
                                    color: sectionColor,
                                    weight: dynamicWeight,
                                    opacity: animateRoutes ? 0.9 : 0.65,
                                    className: animateRoutes ? `flight-path-flow ${className}` : '',
                                    interactive: false,
                                    lineCap: 'round',
                                    smoothFactor: 1.0
                                }).addTo(routeGroup);
                                flowSections.push(sectionFlow);
                            }
                        } else {
                            const trackLine = L.polyline(fullCurvedPath, {
                                color: color, 
                                weight: animateRoutes ? (1 + (dynamicWeight * 0.2)) : 0.5, 
                                opacity: (isDark || activeLayer === 'satellite') ? 0.2 : 0.3,
                                className: `flight-path-track ${className}`,
                                interactive: false,
                                smoothFactor: 1.0
                            }).addTo(routeGroup);
                            trackSections.push(trackLine);

                            const flowLine = L.polyline(fullCurvedPath, {
                                color: color,
                                weight: dynamicWeight,
                                opacity: animateRoutes ? 1 : 0.6,
                                className: animateRoutes ? `flight-path-flow ${className}` : '',
                                interactive: false,
                                lineCap: 'round',
                                smoothFactor: 1.0
                            }).addTo(routeGroup);
                            flowSections.push(flowLine);
                        }

                        const hitLine = L.polyline(fullCurvedPath, {
                            color: 'transparent',
                            weight: Math.max(15, dynamicWeight + 10), 
                            opacity: 0,
                            interactive: true,
                            smoothFactor: 1.0
                        }).addTo(routeGroup);

                        let modeIcon = 'flight';
                        let modeColor = 'text-blue-400';
                        if (t.mode === 'Train') {
                            modeIcon = 'directions_train';
                            modeColor = 'text-indigo-400';
                        } else if (t.mode === 'Car Rental' || t.mode === 'Personal Car') {
                            modeIcon = 'directions_car';
                            modeColor = 'text-amber-400';
                        } else if (t.mode === 'Bus') {
                            modeIcon = 'directions_bus';
                            modeColor = 'text-amber-500';
                        } else if (t.mode === 'Cruise' || t.mode === 'Ferry') {
                            modeIcon = 'directions_boat';
                            modeColor = 'text-cyan-400';
                        }

                        const formattedDate = new Date(t.departureDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                        const classBadge = t.travelClass ? `<span class="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-white/10 text-gray-300 ml-1.5 border border-white/5 align-middle">${t.travelClass}</span>` : '';
                        const stopoverText = t.waypoints && t.waypoints.length > 0 ? `<div class="text-[10px] text-amber-400/80 font-bold mt-1 inline-flex items-center"><span class="material-icons-outlined text-[11px] mr-1">schedule</span>Via ${t.waypoints.map(w => w.name).join(', ')}</div>` : '';
                        const codeText = t.identifier ? `<span class="text-xs text-gray-400 font-bold tracking-wider ml-1 px-1 py-0.5 bg-neutral-800 rounded text-[9px] border border-white/5 align-middle">${t.identifier}</span>` : '';
                        const distanceText = t.distance ? `<div class="text-[9px] text-gray-400 font-bold mt-0.5">Approx. ${t.distance} km</div>` : '';

                        hitLine.bindTooltip(`
                            <div class="font-sans p-3 min-w-[200px] select-none pointer-events-none">
                                <div class="flex items-center justify-between gap-4 mb-2">
                                    <span class="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">${trip.name}</span>
                                    <span class="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">${trip.status}</span>
                                </div>
                                <div class="flex items-center gap-1.5">
                                    <span class="material-icons-outlined text-base ${modeColor} align-middle">${modeIcon}</span>
                                    <span class="font-black text-sm text-white tracking-tight align-middle">${t.origin}</span>
                                    <span class="material-icons-outlined text-xs text-gray-500 align-middle">arrow_forward</span>
                                    <span class="font-black text-sm text-white tracking-tight align-middle">${t.destination}</span>
                                </div>
                                ${stopoverText}
                                <div class="mt-2 pt-2 border-t border-white/10 flex flex-col gap-0.5">
                                    <div class="text-[10px] text-gray-300 font-semibold">
                                        ${t.provider}${codeText}${classBadge}
                                    </div>
                                    <div class="text-[9px] text-gray-400 font-medium mt-0.5">${formattedDate} • ${t.departureTime || 'TBA'}</div>
                                    ${distanceText}
                                </div>
                            </div>
                        `, { sticky: true, direction: 'top', className: 'bg-[#0f0f12]/95 border border-white/10 shadow-[0_20px_40px_rgba(0,0,0,0.8)] rounded-2xl backdrop-blur-md p-0 overflow-hidden' });

                        hitLine.on('mouseover', () => {
                            flowSections.forEach(fs => {
                                fs.setStyle({
                                    weight: dynamicWeight + 2,
                                    opacity: 1
                                });
                                const el = fs.getElement();
                                if (el) {
                                    el.classList.add('flight-path-selected');
                                    fs.bringToFront();
                                }
                            });
                            trackSections.forEach(ts => {
                                ts.setStyle({
                                    opacity: (isDark || activeLayer === 'satellite') ? 0.6 : 0.7,
                                    weight: 2 + (dynamicWeight * 0.3)
                                });
                            });
                        });
                         
                        hitLine.on('mouseout', () => {
                            flowSections.forEach(fs => {
                                fs.setStyle({
                                    weight: dynamicWeight,
                                    opacity: animateRoutes ? 0.9 : 0.65
                                });
                                const el = fs.getElement();
                                if (el) el.classList.remove('flight-path-selected');
                            });
                            trackSections.forEach(ts => {
                                ts.setStyle({
                                    opacity: (isDark || activeLayer === 'satellite') ? 0.2 : 0.3,
                                    weight: animateRoutes ? (1 + (dynamicWeight * 0.2)) : 0.5
                                });
                            });
                        });

                        hitLine.on('click', () => onTripClick && onTripClick(trip.id));
                    }
                });
            }
        });
    }, [enrichedTrips, viewMode, onTripClick, routeFrequencies, showFrequencyWeight, animateRoutes, isDark, activeLayer, showGradientRoutes, enableRoadTracing, osrmCache, showLandSeaRoutes, showFlightRoutes, proportionalArcThickness]);

    // Handle City Markers & Clusters Rendering (Separated to enable zero-lag map panning and native zoom rendering)
    useEffect(() => {
        if (!mapInstance.current || !markerLayerGroupRef.current) return;
        const map = mapInstance.current;
        const markerGroup = markerLayerGroupRef.current;

        markerGroup.clearLayers();

        if (!showCityMarkers || rawPoints.length === 0) return;

        if (clusterMode) {
            const clusters = performClustering(map, rawPoints, 50);
            clusters.forEach(cluster => {
                if (cluster.points.length === 1) {
                    const pt = cluster.points[0];
                    const markerColor = pt.color || (isDark ? '#e2e8f0' : '#1e293b');
                    const markerRadius = hideAirportCircles ? 0.1 : (pt.isEndpoint ? airportCircleSize + 2 : airportCircleSize);
                    const markerOpacity = hideAirportCircles ? 0 : 1;
                    const marker = L.circleMarker([cluster.lat, cluster.lng], {
                        radius: markerRadius,
                        fillColor: pt.isEndpoint ? ((isDark || activeLayer === 'satellite') ? '#000000' : '#ffffff') : markerColor,
                        color: markerColor,
                        weight: hideAirportCircles ? 0 : 2,
                        fillOpacity: markerOpacity,
                        opacity: markerOpacity
                    }).addTo(markerGroup);

                    marker.bindTooltip(pt.name, {
                        direction: 'top',
                        className: 'bg-[#0f0f12]/95 text-white border border-white/10 shadow-xl text-xs font-bold px-3 py-1.5 rounded-lg'
                    });

                    marker.on('mouseover', () => {
                        marker.setStyle({
                            radius: pt.isEndpoint ? 9 : 7,
                            weight: 4,
                            color: isDark ? '#ffffff' : '#000000',
                        });
                    });

                    marker.on('mouseout', () => {
                        marker.setStyle({
                            radius: pt.isEndpoint ? 6 : 4,
                            weight: 2,
                            color: markerColor,
                        });
                    });

                    if (pt.tripId && onTripClick) {
                        marker.on('click', () => onTripClick(pt.tripId!));
                    }
                } else {
                    const isFlightCluster = cluster.points.some(p => p.isFlight);
                    const bgClass = isFlightCluster
                        ? 'bg-blue-600/35 text-blue-700 border border-blue-600 dark:bg-blue-400/25 dark:text-blue-200 dark:border-blue-400 shadow-blue-500/15'
                        : 'bg-amber-600/35 text-amber-700 border border-amber-600 dark:bg-amber-400/25 dark:text-amber-200 dark:border-amber-400 shadow-amber-500/15';

                    const clusterIcon = L.divIcon({
                        html: `<div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shadow-lg hover:scale-110 transition-transform ${bgClass}">
                            <span>${cluster.points.length}</span>
                        </div>`,
                        className: 'custom-cluster-icon',
                        iconSize: [32, 32],
                        iconAnchor: [16, 16]
                    });

                    const marker = L.marker([cluster.lat, cluster.lng], { icon: clusterIcon }).addTo(markerGroup);

                    const tooltipContent = `
                        <div class="font-sans p-2 select-none pointer-events-none text-left">
                            <div class="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 border-b border-white/10 pb-1">Cluster (${cluster.points.length} Locations)</div>
                            <div class="space-y-1 max-h-40 overflow-y-auto pr-1">
                                ${cluster.points.slice(0, 8).map(p => `<div class="text-xs font-bold text-white flex items-center gap-1.5">● ${p.name}</div>`).join('')}
                                ${cluster.points.length > 8 ? `<div class="text-[10px] text-gray-400 italic font-medium pl-3">+ ${cluster.points.length - 8} more</div>` : ''}
                            </div>
                            <div class="text-[9px] text-blue-400 font-extrabold uppercase mt-2">Click to Zoom Sector</div>
                        </div>
                    `;
                    marker.bindTooltip(tooltipContent, {
                        direction: 'top',
                        className: 'bg-black/95 text-white border border-white/10 shadow-2xl rounded-xl backdrop-blur-md px-1 py-1'
                    });

                    marker.on('click', () => {
                        map.setView([cluster.lat, cluster.lng], map.getZoom() + 2);
                    });
                }
            });
        } else {
            rawPoints.forEach(pt => {
                const markerColor = pt.color || (isDark ? '#e2e8f0' : '#1e293b');
                const markerRadius = hideAirportCircles ? 0.1 : (pt.isEndpoint ? airportCircleSize + 2 : airportCircleSize);
                const markerOpacity = hideAirportCircles ? 0 : 1;
                const marker = L.circleMarker([pt.lat, pt.lng], {
                    radius: markerRadius,
                    fillColor: pt.isEndpoint ? ((isDark || activeLayer === 'satellite') ? '#000000' : '#ffffff') : markerColor,
                    color: markerColor,
                    weight: hideAirportCircles ? 0 : 2,
                    fillOpacity: markerOpacity,
                    opacity: markerOpacity
                }).addTo(markerGroup);

                marker.bindTooltip(pt.name, {
                    direction: 'top',
                    className: 'bg-[#0f0f12]/95 text-white border border-white/10 shadow-xl text-xs font-bold px-3 py-1.5 rounded-lg'
                });

                marker.on('mouseover', () => {
                    marker.setStyle({
                        radius: pt.isEndpoint ? 9 : 7,
                        weight: 4,
                        color: isDark ? '#ffffff' : '#000000',
                    });
                });

                marker.on('mouseout', () => {
                    marker.setStyle({
                        radius: pt.isEndpoint ? 6 : 4,
                        weight: 2,
                        color: markerColor,
                    });
                });

                if (pt.tripId && onTripClick) {
                    marker.on('click', () => onTripClick(pt.tripId!));
                }
            });
        }
    }, [rawPoints, clusterMode, showCityMarkers, hideAirportCircles, airportCircleSize, isDark, activeLayer, mapZoom, onTripClick]);

    // Handle drawing custom/manual waypoints and path segments on the map
    useEffect(() => {
        if (!mapInstance.current || !customLayerGroupRef.current) return;
        const customGroup = customLayerGroupRef.current;
        customGroup.clearLayers();

        // 1. Draw manual waypoints
        manualWaypoints.forEach(wp => {
            const markerColor = '#ec4899'; // Hot Rose for custom pins
            const marker = L.circleMarker([wp.lat, wp.lng], {
                radius: 6,
                fillColor: '#ffffff',
                color: markerColor,
                weight: 3,
                fillOpacity: 1,
                opacity: 1
            }).addTo(customGroup);

            // Bind high-contrast text tooltip showing custom pin name
            marker.bindTooltip(`
                <div class="flex items-center gap-1 font-sans font-bold">
                    <span class="material-icons-outlined text-[10px] text-rose-500">place</span>
                    <span>${wp.name || 'Custom Pin'}</span>
                </div>
            `, {
                direction: 'top',
                className: 'leaflet-tooltip-custom bg-slate-900 border border-rose-500/30 text-white font-semibold rounded px-2.5 py-1 shadow-lg'
            });

            // Interactive hovering
            marker.on('mouseover', () => {
                marker.setStyle({
                    radius: 8,
                    weight: 4,
                    color: '#ffffff',
                    fillColor: markerColor
                });
            });

            marker.on('mouseout', () => {
                marker.setStyle({
                    radius: 6,
                    weight: 3,
                    color: markerColor,
                    fillColor: '#ffffff'
                });
            });

            // Standard popup for details
            marker.bindPopup(`
                <div class="p-2 font-sans text-xs">
                    <div class="font-bold text-gray-100 mb-1 flex items-center gap-1 font-semibold">
                        <span class="material-icons-outlined text-xs text-rose-500">place</span>
                        ${wp.name}
                    </div>
                    <div class="text-[9px] text-gray-400 font-mono">
                        Coordinates: ${wp.lat.toFixed(5)}, ${wp.lng.toFixed(5)}
                    </div>
                </div>
            `);
        });

        // 2. Draw manual path segments
        manualSegments.forEach(seg => {
            const fromWp = manualWaypoints.find(w => w.id === seg.fromId);
            const toWp = manualWaypoints.find(w => w.id === seg.toId);
            if (!fromWp || !toWp) return;

            const p1 = L.latLng(fromWp.lat, fromWp.lng);
            const p2 = L.latLng(toWp.lat, toWp.lng);

            // Generate curvated geodesic points
            let segPoints = getCurvePoints(p1, p2);

            const color = seg.color || '#ec4899';
            const style = seg.style || 'animated';
            const isAnimated = style === 'animated' && animateRoutes;

            // Track shadow line
            L.polyline(segPoints, {
                color: color,
                weight: 2,
                opacity: isDark ? 0.25 : 0.35,
                interactive: false,
                smoothFactor: 1.0
            }).addTo(customGroup);

            // Active trace line
            const flowLine = L.polyline(segPoints, {
                color: color,
                weight: 3,
                opacity: isAnimated ? 0.95 : 0.75,
                className: isAnimated ? 'flight-path-flow' : '',
                interactive: false,
                lineCap: 'round',
                dashArray: style === 'dashed' ? '6, 6' : undefined,
                smoothFactor: 1.0
            }).addTo(customGroup);

            // Wide transparent click/hover area
            const hitLine = L.polyline(segPoints, {
                color: 'transparent',
                weight: 15,
                opacity: 0,
                interactive: true,
                smoothFactor: 1.0
            }).addTo(customGroup);

            // Dynamic distance calculation
            const distance = Math.round(getDistanceKm(fromWp.lat, fromWp.lng, toWp.lat, toWp.lng));

            hitLine.bindTooltip(`
                <div class="p-2 font-sans select-none pointer-events-none min-w-[140px] text-zinc-100">
                    <p class="text-[8px] font-black tracking-wider uppercase text-rose-400 mb-0.5">MANUAL SEGMENT</p>
                    <p class="font-bold text-xs text-white">${fromWp.name} ➔ ${toWp.name}</p>
                    <p class="text-[9px] text-zinc-400 mt-1">Approx. Distance: <span class="font-bold text-rose-400 font-mono">${distance} km</span></p>
                </div>
            `, {
                sticky: true,
                direction: 'top',
                className: 'bg-zinc-950/95 border border-rose-500/35 rounded-xl shadow-2xl p-0'
            });

            // Interactive hovering effects
            hitLine.on('mouseover', () => {
                flowLine.setStyle({ weight: 5, opacity: 1 });
            });

            hitLine.on('mouseout', () => {
                flowLine.setStyle({ weight: 3, opacity: isAnimated ? 0.95 : 0.75 });
            });
        });
    }, [manualWaypoints, manualSegments, isDark, animateRoutes]);

    const handleZoomIn = () => mapInstance.current?.zoomIn();
    const handleZoomOut = () => mapInstance.current?.zoomOut();
    
    const handleFitBounds = () => {
        if (!mapInstance.current) return;
        const bounds = L.latLngBounds([]);
        
        if (viewMode === 'scratch' && visitedPlaces.length > 0) {
            visitedPlaces.forEach(p => bounds.extend([p.lat, p.lng]));
        } else {
            let hasPoints = false;
            enrichedTrips.forEach(trip => {
                if (trip.transports) {
                    trip.transports.forEach(t => {
                        if (t.originLat && t.originLng) bounds.extend([t.originLat, t.originLng]);
                        if (t.destLat && t.destLng) bounds.extend([t.destLat, t.destLng]);
                        t.waypoints?.forEach(wp => {
                            if (wp.coordinates) bounds.extend([wp.coordinates.lat, wp.coordinates.lng]);
                        });
                    });
                    hasPoints = true;
                } else if (trip.coordinates) {
                    bounds.extend([trip.coordinates.lat, trip.coordinates.lng]);
                    hasPoints = true;
                }
            });
            if (!hasPoints) return;
        }
        
        mapInstance.current.fitBounds(bounds, { padding: [80, 80], maxZoom: 6 });
    };

    const handleScreenshot = async () => {
        if (!mapContainer.current) return;
        setIsScreenshotting(true);
        if (onScreenshotStarted) {
            onScreenshotStarted();
        }
        try {
            await new Promise(r => setTimeout(r, 200));
            const canvas = await html2canvas(mapContainer.current, {
                useCORS: true,
                allowTaint: true,
                backgroundColor: isDark ? '#0a0a0a' : '#f8fafc',
                logging: false
            });
            const link = document.createElement('a');
            link.download = `expedition-map-${new Date().toISOString().split('T')[0]}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (e) {
            console.error("Screenshot failed", e);
            alert("Failed to capture map. Cross-origin restrictions may apply to map tiles.");
        } finally {
            setIsScreenshotting(false);
            if (onScreenshotCompleted) {
                onScreenshotCompleted();
            }
        }
    };

    return (
        <div className={`relative w-full h-full group overflow-hidden isolation-auto ${isDark ? 'bg-[#0a0a0a]' : 'bg-slate-50'}`}>
            <div ref={mapContainer} className={`w-full h-full z-0 ${isDark ? 'bg-[#0a0a0a]' : 'bg-slate-50'}`} />
            
            {/* Control Bar - Top Left */}
            <div className="absolute top-6 left-6 flex flex-col gap-3 z-[5000]">
                
                {/* Layer Control */}
                <div className={`flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${isDark ? 'bg-white/10 backdrop-blur-md border-white/20' : 'bg-white/80 backdrop-blur-md border-slate-200'}`}>
                    <button 
                        onClick={() => setActiveLayer('standard')} 
                        className={`w-10 h-10 flex items-center justify-center transition-colors border-b ${isDark ? 'border-white/10' : 'border-slate-100'} ${activeLayer === 'standard' ? 'text-blue-500 bg-white/20' : isDark ? 'text-white hover:bg-white/20' : 'text-slate-600 hover:bg-slate-100'}`}
                        title="Standard View"
                    >
                        <span className="material-icons-outlined text-lg">map</span>
                    </button>
                    <button 
                        onClick={() => setActiveLayer('satellite')} 
                        className={`w-10 h-10 flex items-center justify-center transition-colors border-b ${isDark ? 'border-white/10' : 'border-slate-100'} ${activeLayer === 'satellite' ? 'text-blue-500 bg-white/20' : isDark ? 'text-white hover:bg-white/20' : 'text-slate-600 hover:bg-slate-100'}`}
                        title="Satellite View"
                    >
                        <span className="material-icons-outlined text-lg">satellite_alt</span>
                    </button>
                    <button 
                        onClick={() => setActiveLayer('topography')} 
                        className={`w-10 h-10 flex items-center justify-center transition-colors border-b ${isDark ? 'border-white/10' : 'border-slate-100'} ${activeLayer === 'topography' ? 'text-blue-500 bg-white/20' : isDark ? 'text-white hover:bg-white/20' : 'text-slate-600 hover:bg-slate-100'}`}
                        title="Topography View"
                    >
                        <span className="material-icons-outlined text-lg">hiking</span>
                    </button>
                    <button 
                        onClick={() => setActiveLayer('hillshade')} 
                        className={`w-10 h-10 flex items-center justify-center transition-colors ${activeLayer === 'hillshade' ? 'text-blue-500 bg-white/20' : isDark ? 'text-white hover:bg-white/20' : 'text-slate-600 hover:bg-slate-100'}`}
                        title="3D Shaded Relief / Elevation"
                    >
                        <span className="material-icons-outlined text-lg">landscape</span>
                    </button>
                </div>

                <div className={`flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${isDark ? 'bg-white/10 backdrop-blur-md border-white/20' : 'bg-white/80 backdrop-blur-md border-slate-200'}`}>
                    <button 
                        onClick={handleZoomIn} 
                        className={`w-10 h-10 flex items-center justify-center transition-colors border-b ${isDark ? 'text-white hover:bg-white/20 border-white/10' : 'text-slate-600 hover:bg-slate-100 border-slate-100'}`}
                        title="Zoom In"
                    >
                        <span className="material-icons-outlined text-lg">add</span>
                    </button>
                    <button 
                        onClick={handleZoomOut} 
                        className={`w-10 h-10 flex items-center justify-center transition-colors ${isDark ? 'text-white hover:bg-white/20' : 'text-slate-600 hover:bg-slate-100'}`}
                        title="Zoom Out"
                    >
                        <span className="material-icons-outlined text-lg">remove</span>
                    </button>
                </div>

                <button 
                    onClick={handleFitBounds} 
                    className={`w-10 h-10 rounded-2xl border shadow-2xl flex items-center justify-center transition-colors group/fit ${isDark ? 'bg-white/10 backdrop-blur-md border-white/20 text-white hover:bg-white/20' : 'bg-white/80 backdrop-blur-md border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                    title="Fit to Screen"
                >
                    <span className="material-icons-outlined text-lg group-hover/fit:scale-110 transition-transform">center_focus_strong</span>
                </button>

                {/* Waypoint Dashboard Toggle */}
                <button 
                    onClick={() => setIsWaypointPanelOpen(!isWaypointPanelOpen)} 
                    className={`w-10 h-10 rounded-2xl border shadow-2xl flex items-center justify-center transition-all duration-200 ${
                        isWaypointPanelOpen
                        ? 'bg-rose-600 border-rose-500 text-white shadow-rose-500/10'
                        : isDark ? 'bg-white/10 backdrop-blur-md border-white/20 text-white hover:bg-white/20' : 'bg-white/80 backdrop-blur-md border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                    title="Waypoint Drawer Desk"
                >
                    <span className="material-icons-outlined text-lg">route</span>
                </button>

            </div>

            {/* Elegant Floating Zoom Level Slider - Bottom Center */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[5000] flex items-center gap-3 px-4 py-2 rounded-full border shadow-[0_20px_50px_rgba(0,0,0,0.3)] bg-white/80 dark:bg-zinc-900/90 backdrop-blur-md border-slate-200/80 dark:border-zinc-800/80 transition-all duration-300 hover:scale-[1.02] select-none">
                <button 
                    onClick={handleZoomOut} 
                    className="w-7 h-7 flex items-center justify-center rounded-full text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-800 dark:hover:text-white transition-all"
                    title="Zoom Out"
                >
                    <span className="material-icons-outlined text-base">remove</span>
                </button>
                
                <input 
                    type="range" 
                    min="0" 
                    max="18" 
                    step="0.1"
                    value={mapZoom} 
                    onChange={(e) => {
                        const newZoom = Number(e.target.value);
                        setMapZoom(newZoom);
                        mapInstance.current?.setZoom(newZoom);
                    }}
                    className="w-32 sm:w-44 h-1 rounded-lg appearance-none cursor-pointer bg-slate-200 dark:bg-zinc-700 accent-blue-600 dark:accent-indigo-500 outline-none"
                    style={{
                        background: `linear-gradient(to right, ${isDark ? '#6366f1' : '#2563eb'} ${(mapZoom / 18) * 100}%, ${isDark ? '#3f3f46' : '#cbd5e1'} ${(mapZoom / 18) * 100}%)`
                    }}
                />

                <button 
                    onClick={handleZoomIn} 
                    className="w-7 h-7 flex items-center justify-center rounded-full text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-800 dark:hover:text-white transition-all"
                    title="Zoom In"
                >
                    <span className="material-icons-outlined text-base">add</span>
                </button>

                <div className="h-4 w-px bg-slate-200 dark:bg-zinc-700 mx-1" />

                <span className="text-[10px] font-extrabold font-mono text-slate-600 dark:text-zinc-300 uppercase tracking-widest min-w-[50px] text-center">
                    x{mapZoom.toFixed(1)}
                </span>
            </div>

            {/* Waypoint Planner Overlay Panel - Glassy and Adaptive */}
            {isWaypointPanelOpen && (
                <div className={`absolute top-6 right-6 z-[6000] w-80 max-h-[88%] overflow-y-auto flex flex-col gap-4 p-4 rounded-3xl border shadow-2xl transition-all duration-300 no-scrollbar ${
                    isDark 
                    ? 'bg-zinc-950/95 border-zinc-900 text-white shadow-[0_20px_50px_rgba(0,0,0,0.8)]' 
                    : 'bg-white/95 border-slate-200 text-slate-800 shadow-[0_20px_50px_rgba(0,0,0,0.15)] bg-slate-50/50'
                }`}>
                    {/* Header */}
                    <div className="flex items-center justify-between border-b pb-2.5 border-dashed border-zinc-800 dark:border-zinc-800/80 border-slate-200">
                        <div className="flex items-center gap-2">
                            <span className="material-icons-outlined text-rose-500 text-xl font-bold">route</span>
                            <div>
                                <h3 className="font-black text-sm tracking-tight">Waypoint Draw Desk</h3>
                                <p className="text-[9px] text-slate-400 dark:text-zinc-500 font-bold uppercase tracking-wider">Manual Path Segments</p>
                            </div>
                        </div>
                        <button 
                            onClick={() => setIsWaypointPanelOpen(false)}
                            className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                        >
                            <span className="material-icons-outlined text-sm">close</span>
                        </button>
                    </div>

                    {/* Section 1: Pinning Controls */}
                    <div className="flex flex-col gap-2">
                        <span className="text-[9.5px] font-black text-rose-400 uppercase tracking-widest leading-none">
                            I. Pinning Engine
                        </span>
                        
                        {/* Toggle Pin tool */}
                        <button
                            onClick={() => {
                                setPinningMode(!pinningMode);
                                if (!pinningMode) {
                                    setPendingPinCoord(null);
                                }
                            }}
                            className={`w-full py-2.5 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                                pinningMode
                                ? 'bg-rose-500/20 border-rose-500 text-rose-400 shadow-md animate-pulse font-extrabold'
                                : isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800/80' : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                            }`}
                        >
                            <span className="material-icons-outlined text-sm">
                                {pinningMode ? 'gps_fixed' : 'add_location_alt'}
                            </span>
                            {pinningMode ? 'PINNING MODE: ACTIVE' : 'ACTIVATE PIN PLACEMENT'}
                        </button>
                        <p className="text-[9px] text-zinc-500 dark:text-zinc-400 text-center italic mt-0.5 leading-tight">
                            {pinningMode 
                                ? "Click anywhere on the map grid to place a custom Waypoint."
                                : "Pin tool is inactive. Turn on to drop pins directly."
                            }
                        </p>

                        {/* Pending Pin Modal Form inline */}
                        {pendingPinCoord && (
                            <div className="mt-2 p-3 rounded-2xl border border-rose-500/30 bg-rose-500/5 flex flex-col gap-2 animate-fade-in-up">
                                <span className="text-[9.5px] font-black text-rose-400 uppercase tracking-wider">Drop Pin Here</span>
                                <span className="text-[9px] font-mono text-zinc-400 leading-none">
                                    Lat: {pendingPinCoord.lat.toFixed(5)}, Lng: {pendingPinCoord.lng.toFixed(5)}
                                </span>
                                <input
                                    type="text"
                                    value={newPinName}
                                    onChange={(e) => setNewPinName(e.target.value)}
                                    placeholder="Enter descriptive label..."
                                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border focus:outline-none focus:ring-1 focus:ring-rose-500 bg-zinc-900 border-zinc-800 text-white font-medium"
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSavePendingPin();
                                        if (e.key === 'Escape') setPendingPinCoord(null);
                                    }}
                                />
                                <div className="grid grid-cols-2 gap-2 mt-1">
                                    <button
                                        onClick={() => setPendingPinCoord(null)}
                                        className="py-1 px-2 text-[10px] rounded bg-zinc-800/80 hover:bg-zinc-800 text-zinc-400 border border-zinc-700 font-bold"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSavePendingPin}
                                        className="py-1 px-2 text-[10px] rounded bg-rose-600 hover:bg-rose-500 text-white font-bold"
                                    >
                                        Save Waypoint
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Geocoding search input */}
                        <div className="mt-2 flex flex-col gap-1.5">
                            <span className="text-[9px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest block leading-none">
                                Quick Find Field
                            </span>
                            <div className="flex gap-1.5">
                                <input 
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search city to search and pin..."
                                    className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border focus:outline-none bg-zinc-900 border-zinc-800 text-white placeholder-zinc-500"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSearchAndPin();
                                    }}
                                />
                                <button 
                                    onClick={handleSearchAndPin}
                                    disabled={searchLoading}
                                    className="px-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center shrink-0"
                                >
                                    {searchLoading ? (
                                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <span className="material-icons-outlined text-sm">search</span>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Section 2: Waypoints List */}
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[9.5px] font-black text-rose-400 uppercase tracking-widest leading-none">
                                II. Pinned Locations ({manualWaypoints.length})
                            </span>
                            {manualWaypoints.length > 0 && (
                                <button
                                    onClick={handleClearAllWaypoints}
                                    className="text-[9px] text-red-400 font-extrabold hover:underline uppercase tracking-wide cursor-pointer"
                                    id="btn-clear-waypoints"
                                >
                                    Clear All
                                </button>
                            )}
                        </div>
                        {manualWaypoints.length === 0 ? (
                            <div className="text-[10px] text-zinc-500 dark:text-zinc-500 text-center py-3 bg-slate-100/30 dark:bg-black/25 rounded-2xl border border-dashed border-slate-200 dark:border-zinc-800/85">
                                No manually pinned places yet.
                            </div>
                        ) : (
                            <div className="max-h-36 overflow-y-auto flex flex-col gap-1.5 pr-1 no-scrollbar">
                                {manualWaypoints.map(wp => (
                                    <div 
                                        key={wp.id}
                                        className="p-1.5 px-2.5 rounded-xl bg-slate-100/50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800/80 flex items-center justify-between gap-2"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-bold truncate text-slate-800 dark:text-zinc-200">{wp.name}</p>
                                            <p className="text-[8.5px] font-mono text-slate-400 text-opacity-80 leading-none mt-0.5">
                                                {wp.lat.toFixed(4)}, {wp.lng.toFixed(4)}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                onClick={() => handleFlyToWaypoint(wp)}
                                                className="w-5 h-5 rounded-md hover:bg-slate-200 dark:hover:bg-white/10 flex items-center justify-center text-slate-500 hover:text-indigo-400"
                                                title="Center View"
                                            >
                                                <span className="material-icons-outlined text-[13px]">center_focus_strong</span>
                                            </button>
                                            <button
                                                onClick={() => handleDeleteWaypoint(wp.id)}
                                                className="w-5 h-5 rounded-md hover:bg-slate-200 dark:hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-red-400"
                                                title="Delete Pin"
                                            >
                                                <span className="material-icons-outlined text-[13px]">delete</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Section 3: Path Connector Form */}
                    <div className="flex flex-col gap-2 pt-2 border-t border-zinc-800/80 border-slate-200">
                        <span className="text-[9.5px] font-black text-rose-400 uppercase tracking-widest leading-none">
                            III. Segment Connector
                        </span>
                        
                        {manualWaypoints.length < 2 ? (
                            <p className="text-[10px] text-zinc-500 italic mt-0.5">
                                Add at least 2 pinned waypoints to establish custom connection segments.
                            </p>
                        ) : (
                            <div className="flex flex-col gap-2.5">
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[8.5px] text-slate-400 dark:text-zinc-500 font-bold uppercase tracking-wider">From Location</label>
                                        <select
                                            value={segFromId}
                                            onChange={(e) => setSegFromId(e.target.value)}
                                            className="text-xs px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 focus:outline-none"
                                        >
                                            <option value="">-- Start --</option>
                                            {manualWaypoints.map(wp => (
                                                <option key={wp.id} value={wp.id}>{wp.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[8.5px] text-slate-400 dark:text-zinc-500 font-bold uppercase tracking-wider">To Location</label>
                                        <select
                                            value={segToId}
                                            onChange={(e) => setSegToId(e.target.value)}
                                            className="text-xs px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 focus:outline-none"
                                        >
                                            <option value="">-- End --</option>
                                            {manualWaypoints.map(wp => (
                                                <option key={wp.id} value={wp.id}>{wp.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[8.5px] text-slate-400 dark:text-zinc-500 font-bold uppercase tracking-wider">Neon Hue</label>
                                        <select
                                            value={segColor}
                                            onChange={(e) => setSegColor(e.target.value)}
                                            className="text-xs px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 focus:outline-none"
                                        >
                                            <option value="#ec4899">Hot Rose</option>
                                            <option value="#10b981">Emerald</option>
                                            <option value="#3b82f6">Azure</option>
                                            <option value="#f59e0b">Gold</option>
                                            <option value="#a855f7">Purple</option>
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[8.5px] text-slate-400 dark:text-zinc-500 font-bold uppercase tracking-wider">Style</label>
                                        <select
                                            value={segStyle}
                                            onChange={(e) => setSegStyle(e.target.value)}
                                            className="text-xs px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 focus:outline-none"
                                        >
                                            <option value="animated">Animated Flow</option>
                                            <option value="dashed">Dashed Trace</option>
                                            <option value="solid">Solid Stream</option>
                                        </select>
                                    </div>
                                </div>

                                <button
                                    onClick={handleEstablishSegment}
                                    className="w-full py-2 px-3 mt-1 bg-gradient-to-r from-rose-500 to-indigo-600 hover:from-rose-600 hover:to-indigo-500 text-white font-extrabold text-xs rounded-xl shadow-lg hover:shadow-indigo-500/10 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                    id="btn-establish-segment"
                                >
                                    <span className="material-icons-outlined text-sm">polyline</span>
                                    Establish Path Segment
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Section 4: Connected Paths List */}
                    <div className="flex flex-col gap-2 pt-2 border-t border-zinc-800/80 border-slate-200">
                        <span className="text-[9.5px] font-black text-rose-400 uppercase tracking-widest leading-none">
                            IV. Connected Paths ({manualSegments.length})
                        </span>
                        
                        {manualSegments.length === 0 ? (
                            <div className="text-[10px] text-zinc-500 dark:text-zinc-500 text-center py-2 bg-slate-100/30 dark:bg-black/25 rounded-xl border border-dashed border-slate-200 dark:border-zinc-800/50">
                                No custom segments drawn.
                            </div>
                        ) : (
                            <div className="max-h-32 overflow-y-auto flex flex-col gap-1 pr-1 no-scrollbar">
                                {manualSegments.map(seg => {
                                    const fromWp = manualWaypoints.find(w => w.id === seg.fromId);
                                    const toWp = manualWaypoints.find(w => w.id === seg.toId);
                                    if (!fromWp || !toWp) return null;
                                    
                                    const colorDot = (
                                        <span 
                                            className="w-2 h-2 rounded-full inline-block shrink-0" 
                                            style={{ backgroundColor: seg.color }}
                                        />
                                    );

                                    return (
                                        <div 
                                            key={seg.id}
                                            className="p-1 px-2 rounded-lg bg-slate-100/50 dark:bg-zinc-900/40 border border-slate-200 dark:border-zinc-800/50 flex items-center justify-between gap-1.5"
                                        >
                                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                                {colorDot}
                                                <div className="truncate text-[11px] font-semibold text-slate-700 dark:text-zinc-300">
                                                    <span className="font-extrabold text-slate-900 dark:text-white truncate">{fromWp.name}</span>
                                                    <span className="mx-1 text-slate-400 dark:text-zinc-600 text-[9px]">➔</span>
                                                    <span className="font-extrabold text-slate-900 dark:text-white truncate">{toWp.name}</span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleDeleteSegment(seg.id)}
                                                className="w-5 h-5 rounded hover:bg-slate-200 dark:hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-red-400 shrink-0"
                                                title="Delete Segment"
                                            >
                                                <span className="material-icons-outlined text-[11px]">delete</span>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                </div>
            )}
        </div>
    );
};
