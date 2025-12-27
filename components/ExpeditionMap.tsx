
import React, { useEffect, useRef, useMemo, useState } from 'react';
import L from 'leaflet';
import { Trip, Transport } from '../types';
import html2canvas from 'html2canvas';
import { getRegion } from '../services/geocoding';

interface ExpeditionMapProps {
    trips: Trip[];
    onTripClick?: (tripId: string) => void;
    showFrequencyWeight?: boolean;
    animateRoutes?: boolean;
    visitedCountries?: string[]; // ISO-2 Country Codes
    showCountries?: boolean;
    viewMode?: 'network' | 'scratch';
    visitedPlaces?: { lat: number; lng: number; name: string }[];
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

// Region Color Mapping (Matching Dashboard Styles)
const REGION_HEX_COLORS: Record<string, string> = {
    'North America': '#3b82f6', // blue-500
    'Central America': '#14b8a6', // teal-500
    'South America': '#10b981', // emerald-500
    'Northern Europe': '#0ea5e9', // sky-500
    'Western Europe': '#6366f1', // indigo-500
    'Southern Europe': '#f97316', // orange-500
    'Eastern Europe': '#f43f5e', // rose-500
    'North Africa': '#d97706', // amber-600
    'Sub-Saharan Africa': '#eab308', // yellow-500
    'East Asia': '#ef4444', // red-500
    'Southeast Asia': '#84cc16', // lime-500
    'South & West Asia': '#f59e0b', // amber-500
    'Oceania': '#06b6d4', // cyan-500
    'Unknown': '#64748b' // slate-500
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

// Quadratic Bezier generator
const getCurvePoints = (start: L.LatLng, end: L.LatLng): L.LatLng[] => {
    let lat1 = start.lat;
    let lng1 = start.lng;
    let lat2 = end.lat;
    let lng2 = end.lng;

    // Detect Shortest Path (Pacific Crossing)
    const diff = lng2 - lng1;
    if (diff > 180) {
        lng2 -= 360;
    } else if (diff < -180) {
        lng2 += 360;
    }

    // Midpoint calculation
    const midLat = (lat1 + lat2) / 2;
    const midLng = (lng1 + lng2) / 2;

    const dist = Math.sqrt(Math.pow(lat2 - lat1, 2) + Math.pow(lng2 - lng1, 2));
    
    // Curvature Physics - Tweak for AirTrail look (higher arc on long flights)
    const curvatureDir = midLat >= 0 ? 1 : -1;
    
    // Dynamic curvature based on distance. 
    // Short flights (dist < 10) need less curve. Long flights need more.
    const curveIntensity = Math.min(0.2, Math.max(0.1, dist * 0.005)); 
    
    const controlLat = midLat + (dist * curveIntensity * curvatureDir);
    const controlLng = midLng;

    const points: L.LatLng[] = [];
    const steps = 100; 
    
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        // Quadratic Bezier Formula
        const lat = (1 - t) * (1 - t) * lat1 + 2 * (1 - t) * t * controlLat + t * t * lat2;
        const lng = (1 - t) * (1 - t) * lng1 + 2 * (1 - t) * t * controlLng + t * t * lng2;
        
        points.push(L.latLng(lat, lng));
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

type LayerType = 'standard' | 'satellite' | 'topography';

export const ExpeditionMap: React.FC<ExpeditionMapProps> = ({ 
    trips, 
    onTripClick, 
    showFrequencyWeight = true, 
    animateRoutes = true,
    visitedCountries = [],
    showCountries = false,
    viewMode = 'network',
    visitedPlaces = []
}) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const tileLayerRef = useRef<L.TileLayer | null>(null);
    const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
    const [isScreenshotting, setIsScreenshotting] = useState(false);
    const [activeLayer, setActiveLayer] = useState<LayerType>('standard');
    const [geoJsonData, setGeoJsonData] = useState<any>(cachedGeoJson);
    const [showCityMarkers, setShowCityMarkers] = useState(true);
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
            worldCopyJump: true
        }).setView([25, 10], 2); // Slightly centered for aesthetics

        mapInstance.current = map;

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

    // Handle Map Content (Flights, Markers, GeoJSON)
    useEffect(() => {
        if (!mapInstance.current) return;
        const map = mapInstance.current;

        // Clean up old layers except tiles
        map.eachLayer((layer) => {
            if (layer instanceof L.Marker || layer instanceof L.Polyline || layer instanceof L.CircleMarker || layer instanceof L.GeoJSON) {
                map.removeLayer(layer);
            }
        });

        // 1. Render Countries (Layer Logic)
        const shouldShowCountries = showCountries || viewMode === 'scratch';
        
        if (shouldShowCountries && geoJsonData) {
            geoJsonLayerRef.current = L.geoJSON(geoJsonData, {
                style: (feature) => {
                    const iso = feature?.properties?.ISO_A2 || feature?.properties?.ISO_A2_EH;
                    const isVisited = visitedCountries.includes(iso);
                    const region = getRegion(iso);
                    const regionColor = REGION_HEX_COLORS[region] || REGION_HEX_COLORS['Unknown'];
                    
                    if (viewMode === 'scratch') {
                        // Scratch Map Style (Regional Colors)
                        return {
                            color: isDark ? '#222' : '#e5e5e5', // Border color
                            weight: 1,
                            fillColor: isVisited ? regionColor : (isDark ? '#111' : '#f8fafc'), 
                            fillOpacity: isVisited ? 0.8 : 0.5,
                            className: isVisited ? 'transition-all duration-500' : ''
                        };
                    } else {
                        // Standard Highlight Style
                        return {
                            color: isDark ? '#333' : '#ddd',
                            weight: 1,
                            fillColor: isVisited ? (isDark ? '#3b82f6' : '#60a5fa') : 'transparent',
                            fillOpacity: isVisited ? 0.3 : 0,
                            className: isVisited ? 'transition-all duration-500' : ''
                        };
                    }
                }
            }).addTo(map);
        }

        // 2. SCRATCH MAP MARKERS
        if (viewMode === 'scratch') {
            const bounds = L.latLngBounds([]);
            
            if (showCityMarkers) {
                visitedPlaces.forEach(place => {
                    const marker = L.circleMarker([place.lat, place.lng], {
                        radius: 4,
                        fillColor: isDark ? '#ffffff' : '#000000',
                        color: isDark ? '#000000' : '#ffffff',
                        weight: 1,
                        opacity: 1,
                        fillOpacity: 1
                    }).addTo(map);
                    
                    marker.bindTooltip(place.name, {
                        direction: 'top',
                        className: 'bg-black/90 text-white border border-white/20 shadow-xl text-xs font-bold px-3 py-1.5 rounded-lg'
                    });
                });
            }
            
            visitedPlaces.forEach(place => {
                bounds.extend([place.lat, place.lng]);
            });

            if (visitedPlaces.length > 0) {
                map.fitBounds(bounds, { padding: [50, 50], maxZoom: 6 });
            } else {
                map.setView([20, 0], 2);
            }
            return; // Stop here for scratch mode
        }

        // 3. NETWORK MAP LOGIC
        const bounds = L.latLngBounds([]);
        let hasPoints = false;

        trips.forEach(trip => {
            const { color, className } = getStatusStyle(trip, isDark, activeLayer);

            if (trip.transports && trip.transports.length > 0) {
                trip.transports.forEach(t => {
                    if (t.originLat && t.originLng && t.destLat && t.destLng) {
                        const start = L.latLng(t.originLat, t.originLng);
                        const end = L.latLng(t.destLat, t.destLng);
                        
                        const curvedPath = getCurvePoints(start, end);
                        const key = getRouteKey(t.originLat, t.originLng, t.destLat, t.destLng);
                        const freq = routeFrequencies.get(key) || 1;
                        const dynamicWeight = showFrequencyWeight ? Math.min(10, 2 + ((freq - 1) * 1)) : 2;

                        // Static Track
                        const trackLine = L.polyline(curvedPath, {
                            color: color, 
                            weight: 1 + (dynamicWeight * 0.2), 
                            opacity: (isDark || activeLayer === 'satellite') ? 0.3 : 0.4,
                            className: `flight-path-track ${className}`,
                            interactive: false
                        }).addTo(map);

                        // Animated Flow
                        let flowLine: L.Polyline | null = null;
                        if (animateRoutes) {
                            flowLine = L.polyline(curvedPath, {
                                color: color,
                                weight: dynamicWeight,
                                opacity: 1,
                                className: `flight-path-flow ${className}`,
                                interactive: false,
                                lineCap: 'round'
                            }).addTo(map);
                        } else {
                            flowLine = L.polyline(curvedPath, {
                                color: color,
                                weight: dynamicWeight,
                                opacity: 0.8,
                                interactive: false
                            }).addTo(map);
                        }

                        // Interaction Line
                        const hitLine = L.polyline(curvedPath, {
                            color: 'transparent',
                            weight: Math.max(15, dynamicWeight + 10), 
                            opacity: 0,
                            interactive: true
                        }).addTo(map);

                        hitLine.bindTooltip(`
                            <div class="font-sans p-1">
                                <div class="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">${trip.name}</div>
                                <div class="font-bold text-sm text-white">${t.origin} <span class="text-gray-500">→</span> ${t.destination}</div>
                                <div class="text-[10px] text-gray-400 mt-1">${t.provider} • ${new Date(t.departureDate).toLocaleDateString()}</div>
                            </div>
                        `, { sticky: true, direction: 'top', className: 'bg-black/90 text-white border border-white/20 shadow-xl rounded-xl backdrop-blur-md px-0 py-0' });

                        hitLine.on('mouseover', () => {
                            if (flowLine?.getElement()) {
                                flowLine.getElement()?.classList.add('flight-path-selected');
                                flowLine.bringToFront();
                            }
                            if (trackLine?.getElement()) trackLine.setStyle({ opacity: 0.5 });
                        });
                        
                        hitLine.on('mouseout', () => {
                            if (flowLine?.getElement()) flowLine.getElement()?.classList.remove('flight-path-selected');
                            if (trackLine?.getElement()) trackLine.setStyle({ opacity: (isDark || activeLayer === 'satellite') ? 0.3 : 0.4 });
                        });

                        hitLine.on('click', () => onTripClick && onTripClick(trip.id));

                        // CITY MARKERS
                        L.circleMarker(start, {
                            radius: 3, 
                            fillColor: color,
                            color: 'transparent',
                            fillOpacity: 0.8
                        }).addTo(map);

                        const destMarker = L.circleMarker(end, {
                            radius: 4, 
                            fillColor: (isDark || activeLayer === 'satellite') ? '#000' : '#fff', 
                            color: color, 
                            weight: 2,
                            fillOpacity: 1
                        }).addTo(map);

                        destMarker.on('click', () => onTripClick && onTripClick(trip.id));
                        destMarker.bindTooltip(trip.name, { 
                            permanent: false, 
                            direction: 'top',
                            offset: [0, -5],
                            className: 'bg-black/90 text-white border border-white/20 shadow-xl text-xs font-bold px-3 py-1.5 rounded-lg'
                        });
                        
                        bounds.extend(start);
                        bounds.extend(end);
                        hasPoints = true;
                    }
                });
            } else if (trip.coordinates) {
                // Trip without transport
                const point = L.latLng(trip.coordinates.lat, trip.coordinates.lng);
                L.circleMarker(point, {
                    radius: 5,
                    fillColor: (isDark || activeLayer === 'satellite') ? '#000' : '#fff',
                    color: color,
                    weight: 2,
                    fillOpacity: 1
                }).addTo(map)
                .bindTooltip(trip.name, { 
                    direction: 'top', 
                    className: 'bg-black/90 text-white border border-white/20 shadow-xl text-xs font-bold px-3 py-1.5 rounded-lg' 
                })
                .on('click', () => onTripClick && onTripClick(trip.id));

                bounds.extend(point);
                hasPoints = true;
            }
        });

        if (hasPoints) {
            map.fitBounds(bounds, { padding: [80, 80], maxZoom: 6 });
        } else {
            map.setView([20, 0], 2);
        }

    }, [trips, onTripClick, routeFrequencies, showFrequencyWeight, animateRoutes, isDark, activeLayer, showCountries, visitedCountries, geoJsonData, viewMode, visitedPlaces, showCityMarkers]);

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
                        className={`w-10 h-10 flex items-center justify-center transition-colors ${activeLayer === 'topography' ? 'text-blue-500 bg-white/20' : isDark ? 'text-white hover:bg-white/20' : 'text-slate-600 hover:bg-slate-100'}`}
                        title="Topography View"
                    >
                        <span className="material-icons-outlined text-lg">terrain</span>
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

                {viewMode === 'scratch' && (
                   <button 
                       onClick={() => setShowCityMarkers(!showCityMarkers)} 
                       className={`w-10 h-10 rounded-2xl border shadow-2xl flex items-center justify-center transition-colors ${showCityMarkers ? (isDark ? 'bg-white/20 text-white border-white/20' : 'bg-blue-50 text-blue-600 border-blue-200') : (isDark ? 'bg-white/10 text-white/50 border-white/20 hover:text-white' : 'bg-white/80 text-slate-400 border-slate-200 hover:text-slate-600')}`}
                       title={showCityMarkers ? "Hide City Markers" : "Show City Markers"}
                   >
                       <span className="material-icons-outlined text-lg">location_city</span>
                   </button>
               )}

            </div>
        </div>
    );
};
