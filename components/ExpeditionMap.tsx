
import React, { useEffect, useRef, useMemo, useState } from 'react';
import L from 'leaflet';
import { Trip, Transport } from '../types';
import html2canvas from 'html2canvas';

export type LayerType = 'standard' | 'satellite' | 'topography' | 'terrain' | 'hillshade';

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
    hideAirportCircles?: boolean;
    airportCircleSize?: number;
    proportionalArcThickness?: boolean;
    showAviationCharts?: boolean;
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
}

const performClustering = (map: L.Map, points: PointItem[], radiusPixels = 50) => {
    const clusters: { lat: number; lng: number; points: PointItem[]; id: string }[] = [];
    
    // De-duplicate points based on extremely close latitude and longitude (same city)
    const uniquePoints: PointItem[] = [];
    points.forEach(p => {
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
    hideAirportCircles = false,
    airportCircleSize = 6,
    proportionalArcThickness = true,
    showAviationCharts = false
}) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const tileLayerRef = useRef<L.TileLayer | null>(null);
    const openAipLayerRef = useRef<L.TileLayer | null>(null);
    const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
    const [isScreenshotting, setIsScreenshotting] = useState(false);
    
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

    // Marker Clustering state synchronizers
    const [localClusterMode, setLocalClusterMode] = useState(() => localStorage.getItem('wandergrid_cluster_markers') !== 'false');
    const clusterMode = clusterModeProp !== undefined ? clusterModeProp : localClusterMode;
    const setClusterMode = (mode: boolean) => {
        setLocalClusterMode(mode);
        localStorage.setItem('wandergrid_cluster_markers', String(mode));
    };
    useEffect(() => {
        if (clusterModeProp !== undefined) {
            setLocalClusterMode(clusterModeProp);
        }
    }, [clusterModeProp]);

    const lastFitRef = useRef<string>('');
    const [mapZoom, setMapZoom] = useState(2);
    const [geoJsonData, setGeoJsonData] = useState<any>(cachedGeoJson);
    const [showCityMarkers, setShowCityMarkers] = useState(true);
    const [showLandSeaRoutes, setShowLandSeaRoutes] = useState(false);
    const isDark = useDarkMode();

    // Pre-calculate frequencies
    const routeFrequencies = useMemo(() => {
        const counts = new Map<string, number>();
        trips.forEach(trip => {
            trip.transports?.forEach(t => {
                if (t.originLat && t.originLng && t.destLat && t.destLng) {
                    const key = getRouteKey(t.originLat, t.originLng, t.destLat, t.destLng);
                    counts.set(key, (counts.get(key) || 0) + 1);
                }
            });
        });
        return counts;
    }, [trips]);

    // Load GeoJSON once
    useEffect(() => {
        if (cachedGeoJson) {
            setGeoJsonData(cachedGeoJson);
            return;
        }

        fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson')
            .then(r => r.json())
            .then(data => {
                cachedGeoJson = data;
                setGeoJsonData(data);
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
            preferCanvas: false // Use high-fidelity native SVG vectors for ultra-smooth rendering, custom classes, animations, and zero-stagger zoom interactions
        }).setView([25, 10], 2); // Slightly centered for aesthetics

        mapInstance.current = map;

        // Force react update on zoom ending to recalculate spatial marker clustering grids
        map.on('zoomend', () => {
            setMapZoom(map.getZoom());
        });

        // Resize Observer to handle container size changes (e.g. sidebar toggle)
        const resizeObserver = new ResizeObserver(() => {
            map.invalidateSize();
        });
        resizeObserver.observe(mapContainer.current);

        return () => {
            resizeObserver.disconnect();
            map.remove();
            mapInstance.current = null;
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
        } else if (activeLayer === 'terrain') {
            tileUrl = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
            attribution = 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap (CC-BY-SA)';
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
            subdomains: activeLayer === 'terrain' ? 'abc' : 'abcd',
            maxZoom: activeLayer === 'terrain' ? 17 : 19,
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

    // Handle Map Content (Flights, Markers, GeoJSON)
    useEffect(() => {
        if (!mapInstance.current) return;
        const map = mapInstance.current;

        // Calculate unique key of the current state requiring fitting bounds
        const fitKey = `${viewMode}-${trips.length}-${visitedPlaces.length}-${JSON.stringify(trips.map(t => t.id))}`;
        const shouldFit = lastFitRef.current !== fitKey;
        if (shouldFit) {
            lastFitRef.current = fitKey;
        }

        // Clean up old layers except tiles
        map.eachLayer((layer) => {
            if (layer instanceof L.Marker || layer instanceof L.Polyline || layer instanceof L.CircleMarker || layer instanceof L.GeoJSON) {
                map.removeLayer(layer);
            }
        });

        // 1. Render Countries (Layer Logic)
        const shouldShowCountries = showCountries || viewMode === 'scratch' || viewMode === 'network'; // Always check visited in network mode now
        
        if (shouldShowCountries && geoJsonData) {
            geoJsonLayerRef.current = L.geoJSON(geoJsonData, {
                style: (feature) => {
                    const iso = feature?.properties?.ISO_A2 || feature?.properties?.ISO_A2_EH;
                    const isVisited = visitedCountries.includes(iso);
                    
                    // Determine Gradient Color for this country
                    let gradientColor = '#333';
                    if (isVisited) {
                        const center = getFeatureCenter(feature);
                        gradientColor = getGeoGradientColor(center.lat, center.lng);
                    }

                    if (viewMode === 'scratch') {
                        // SCRATCH MODE: High Opacity, Vibrant
                        let fillColor = isDark ? '#09090b' : '#f8fafc'; // Darker unvisited
                        
                        return {
                            color: isDark ? '#222' : '#e5e5e5', // Border color
                            weight: 1,
                            fillColor: isVisited ? gradientColor : fillColor, 
                            fillOpacity: isVisited ? 0.6 : 0.5,
                            className: isVisited ? 'transition-all duration-500' : ''
                        };
                    } else {
                        // NETWORK MODE: Low Opacity, Subtle Gradient
                        // We use the same gradient logic but with much lower opacity to let lines shine
                        const shouldFill = isVisited && showCountries;

                        return {
                            color: isDark ? '#333' : '#ddd',
                            weight: 1,
                            fillColor: shouldFill ? gradientColor : 'transparent',
                            fillOpacity: shouldFill ? 0.4 : 0, // Subtle glow
                            className: shouldFill ? 'transition-all duration-500' : ''
                        };
                    }
                }
            }).addTo(map);
        }

        // 2. SCRATCH MAP LOGIC (Gather points only)
        const rawPoints: PointItem[] = [];
        if (viewMode === 'scratch') {
            const bounds = L.latLngBounds([]);
            visitedPlaces.forEach(place => {
                rawPoints.push({ lat: place.lat, lng: place.lng, name: place.name });
                bounds.extend([place.lat, place.lng]);
            });

            if (shouldFit) {
                if (visitedPlaces.length > 0) {
                    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 6 });
                } else {
                    map.setView([20, 0], 2);
                }
            }
        } else {
            // 3. NETWORK MAP LOGIC
            const bounds = L.latLngBounds([]);
            let hasPoints = false;

            trips.forEach(trip => {
                const flightStyle = getStatusStyle(trip, isDark, activeLayer);

                if (trip.transports && trip.transports.length > 0) {
                    trip.transports.forEach(t => {
                        if (t.originLat && t.originLng && t.destLat && t.destLng) {
                            // Check Mode and Filter
                            const isFlight = t.mode === 'Flight';
                            const isLand = ['Car Rental', 'Personal Car', 'Bus', 'Train'].includes(t.mode);
                            const isSea = t.mode === 'Cruise';

                            if (!isFlight && !showLandSeaRoutes) return;

                            let color = flightStyle.color;
                            let className = flightStyle.className;

                            if (isLand) {
                                color = '#f59e0b'; // Amber
                                className = 'flight-path-land';
                            } else if (isSea) {
                                color = '#06b6d4'; // Cyan
                                className = 'flight-path-sea';
                            }

                            // Keep track of the points for later marker clustering
                            rawPoints.push({
                                lat: t.originLat,
                                lng: t.originLng,
                                name: t.origin,
                                tripId: trip.id,
                                color: color,
                                isEndpoint: true
                            });

                            // Determine the path points
                            const pathPoints: L.LatLng[] = [];
                            pathPoints.push(L.latLng(t.originLat, t.originLng));
                            
                            if (t.waypoints && t.waypoints.length > 0) {
                                t.waypoints.forEach(wp => {
                                    if (wp.coordinates) {
                                        pathPoints.push(L.latLng(wp.coordinates.lat, wp.coordinates.lng));
                                        rawPoints.push({
                                            lat: wp.coordinates.lat,
                                            lng: wp.coordinates.lng,
                                            name: wp.name,
                                            tripId: trip.id,
                                            color: color,
                                            isEndpoint: false
                                        });
                                    }
                                });
                            }
                            
                            pathPoints.push(L.latLng(t.destLat, t.destLng));
                            rawPoints.push({
                                lat: t.destLat,
                                lng: t.destLng,
                                name: t.destination,
                                tripId: trip.id,
                                color: color,
                                isEndpoint: true
                            });

                            // Generate curve for each segment
                            const fullCurvedPath: L.LatLng[] = [];
                            
                            for (let i = 0; i < pathPoints.length - 1; i++) {
                                const p1 = pathPoints[i];
                                const p2 = pathPoints[i+1];
                                const segmentCurve = getCurvePoints(p1, p2);
                                // Avoid duplicating points
                                if (i > 0) segmentCurve.shift();
                                fullCurvedPath.push(...segmentCurve);
                            }

                            const key = getRouteKey(t.originLat, t.originLng, t.destLat, t.destLng);
                            const freq = routeFrequencies.get(key) || 1;
                            const dynamicWeight = showFrequencyWeight && proportionalArcThickness ? Math.min(10, 2 + ((freq - 1) * 1)) : 2;

                            // Static Track
                            const trackLine = L.polyline(fullCurvedPath, {
                                color: color, 
                                weight: 1 + (dynamicWeight * 0.2), 
                                opacity: (isDark || activeLayer === 'satellite') ? 0.3 : 0.4,
                                className: `flight-path-track ${className}`,
                                interactive: false,
                                smoothFactor: 1.0
                            }).addTo(map);

                            // Animated Flow
                            let flowLine: L.Polyline | null = null;
                            if (animateRoutes) {
                                flowLine = L.polyline(fullCurvedPath, {
                                    color: color,
                                    weight: dynamicWeight,
                                    opacity: 1,
                                    className: `flight-path-flow ${className}`,
                                    interactive: false,
                                    lineCap: 'round',
                                    smoothFactor: 1.0
                                }).addTo(map);
                            } else {
                                flowLine = L.polyline(fullCurvedPath, {
                                    color: color,
                                    weight: dynamicWeight,
                                    opacity: 0.8,
                                    interactive: false,
                                    smoothFactor: 1.0
                                }).addTo(map);
                            }

                            // Interaction Line
                            const hitLine = L.polyline(fullCurvedPath, {
                                color: 'transparent',
                                weight: Math.max(15, dynamicWeight + 10), 
                                opacity: 0,
                                interactive: true,
                                smoothFactor: 1.0
                            }).addTo(map);

                            // Tooltip logic
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
                            } else if (t.mode === 'Cruise') {
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
                                if (flowLine) {
                                    flowLine.setStyle({
                                        weight: dynamicWeight + 2,
                                        opacity: 1
                                    });
                                    const el = flowLine.getElement();
                                    if (el) {
                                        el.classList.add('flight-path-selected');
                                        flowLine.bringToFront();
                                    }
                                }
                                if (trackLine) {
                                    trackLine.setStyle({
                                        opacity: (isDark || activeLayer === 'satellite') ? 0.6 : 0.7,
                                        weight: 2 + (dynamicWeight * 0.3)
                                    });
                                }
                            });
                             
                            hitLine.on('mouseout', () => {
                                if (flowLine) {
                                    flowLine.setStyle({
                                        weight: dynamicWeight,
                                        opacity: 1
                                    });
                                    const el = flowLine.getElement();
                                    if (el) el.classList.remove('flight-path-selected');
                                }
                                if (trackLine) {
                                    trackLine.setStyle({
                                        opacity: (isDark || activeLayer === 'satellite') ? 0.3 : 0.4,
                                        weight: 1 + (dynamicWeight * 0.2)
                                    });
                                }
                            });

                            hitLine.on('click', () => onTripClick && onTripClick(trip.id));
                            
                            pathPoints.forEach(pt => bounds.extend(pt));
                            hasPoints = true;
                        }
                    });
                } else if (trip.coordinates) {
                    // Trip without transport
                    const { color } = getStatusStyle(trip, isDark, activeLayer);
                    const point = L.latLng(trip.coordinates.lat, trip.coordinates.lng);
                    
                    rawPoints.push({
                        lat: trip.coordinates.lat,
                        lng: trip.coordinates.lng,
                        name: trip.location || trip.name,
                        tripId: trip.id,
                        color: color,
                        isEndpoint: true
                    });

                    bounds.extend(point);
                    hasPoints = true;
                }
            });

            if (shouldFit) {
                if (hasPoints) {
                    map.fitBounds(bounds, { padding: [80, 80], maxZoom: 6 });
                } else {
                    map.setView([20, 0], 2);
                }
            }
        }

        // 4. DRAW UNIFIED CLUSTERED / NON-CLUSTERED CITY MARKERS
        if (showCityMarkers && rawPoints.length > 0) {
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
                        }).addTo(map);

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
                        // Render cluster
                        const clusterIcon = L.divIcon({
                            html: `<div class="w-8 h-8 rounded-full bg-blue-600/35 text-blue-700 border-2 border-blue-600 dark:bg-blue-400/25 dark:text-blue-200 dark:border-blue-400 flex items-center justify-center text-xs font-black shadow-lg shadow-blue-500/15 hover:scale-110 transition-transform">
                                <span>${cluster.points.length}</span>
                            </div>`,
                            className: 'custom-cluster-icon',
                            iconSize: [32, 32],
                            iconAnchor: [16, 16]
                        });

                        const marker = L.marker([cluster.lat, cluster.lng], { icon: clusterIcon }).addTo(map);

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
                // Draw normal unclustered circles
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
                    }).addTo(map);

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
        }

    }, [trips, onTripClick, routeFrequencies, showFrequencyWeight, animateRoutes, isDark, activeLayer, showCountries, visitedCountries, geoJsonData, viewMode, visitedPlaces, showCityMarkers, showLandSeaRoutes, clusterMode, mapZoom]);

    const handleZoomIn = () => mapInstance.current?.zoomIn();
    const handleZoomOut = () => mapInstance.current?.zoomOut();
    
    const handleFitBounds = () => {
        if (!mapInstance.current) return;
        const bounds = L.latLngBounds([]);
        
        if (viewMode === 'scratch' && visitedPlaces.length > 0) {
            visitedPlaces.forEach(p => bounds.extend([p.lat, p.lng]));
        } else {
            let hasPoints = false;
            trips.forEach(trip => {
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
        try {
            await new Promise(r => setTimeout(r, 100));
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
                        onClick={() => setActiveLayer('terrain')} 
                        className={`w-10 h-10 flex items-center justify-center transition-colors border-b ${isDark ? 'border-white/10' : 'border-slate-100'} ${activeLayer === 'terrain' ? 'text-blue-500 bg-white/20' : isDark ? 'text-white hover:bg-white/20' : 'text-slate-600 hover:bg-slate-100'}`}
                        title="OpenTopo Terrain"
                    >
                        <span className="material-icons-outlined text-lg">terrain</span>
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

                {(viewMode === 'network') && (
                    <button 
                        onClick={() => setShowLandSeaRoutes(!showLandSeaRoutes)}
                        className={`w-10 h-10 rounded-2xl border shadow-2xl flex items-center justify-center transition-colors ${showLandSeaRoutes ? (isDark ? 'bg-white/20 text-white border-white/20' : 'bg-blue-50 text-blue-600 border-blue-200') : (isDark ? 'bg-white/10 text-white/50 border-white/20 hover:text-white' : 'bg-white/80 text-slate-400 border-slate-200 hover:text-slate-600')}`}
                        title={showLandSeaRoutes ? "Hide Land/Sea Routes" : "Show Land/Sea Routes"}
                    >
                        <span className="material-icons-outlined text-lg">commute</span>
                    </button>
                )}

                <button 
                    onClick={handleScreenshot} 
                    disabled={isScreenshotting}
                    className={`w-10 h-10 rounded-2xl border shadow-2xl flex items-center justify-center transition-colors disabled:opacity-50 group/shot ${isDark ? 'bg-white/10 backdrop-blur-md border-white/20 text-white hover:bg-white/20' : 'bg-white/80 backdrop-blur-md border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                    title="Take Screenshot"
                >
                    {isScreenshotting ? (
                        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                    ) : (
                        <span className="material-icons-outlined text-lg group-hover/shot:scale-110 transition-transform">photo_camera</span>
                    )}
                </button>

                {(viewMode === 'scratch' || viewMode === 'network') && (
                   <button 
                       onClick={() => setShowCityMarkers(!showCityMarkers)} 
                       className={`w-10 h-10 rounded-2xl border shadow-2xl flex items-center justify-center transition-colors ${showCityMarkers ? (isDark ? 'bg-white/20 text-white border-white/20' : 'bg-blue-50 text-blue-600 border-blue-200') : (isDark ? 'bg-white/10 text-white/50 border-white/20 hover:text-white' : 'bg-white/80 text-slate-400 border-slate-200 hover:text-slate-600')}`}
                       title={showCityMarkers ? "Hide City Markers" : "Show City Markers"}
                   >
                       <span className="material-icons-outlined text-lg">location_city</span>
                   </button>
               )}

                {(viewMode === 'scratch' || viewMode === 'network') && (
                   <button 
                       onClick={() => setClusterMode(!clusterMode)} 
                       className={`w-10 h-10 rounded-2xl border shadow-2xl flex items-center justify-center transition-colors ${clusterMode ? (isDark ? 'bg-white/20 text-white border-white/20' : 'bg-blue-50 text-blue-600 border-blue-200') : (isDark ? 'bg-white/10 text-white/50 border-white/20 hover:text-white' : 'bg-white/80 text-slate-400 border-slate-200 hover:text-slate-600')}`}
                       title={clusterMode ? "Disable Marker Clustering" : "Enable Marker Clustering"}
                   >
                       <span className="material-icons-outlined text-lg">{clusterMode ? 'grid_off' : 'grid_on'}</span>
                   </button>
               )}

            </div>
        </div>
    );
};
