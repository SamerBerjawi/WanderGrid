
import React, { useEffect, useRef, useMemo, useState } from 'react';
import L from 'leaflet';
import { Trip, Transport } from '../types';
import html2canvas from 'html2canvas';

interface ExpeditionMapProps {
    trips: Trip[];
    onTripClick?: (tripId: string) => void;
    showFrequencyWeight?: boolean;
    animateRoutes?: boolean;
}

// Leaflet default icon fix
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

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
const getStatusStyle = (trip: Trip, isDark: boolean) => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const endDate = new Date(trip.endDate);
    
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
            // Dark Mode: White, Light Mode: Slate-600
            return { 
                color: isDark ? '#ffffff' : '#475569', 
                className: isDark ? 'flight-path-white' : 'flight-path-dark' 
            }; 
    }
};

export const ExpeditionMap: React.FC<ExpeditionMapProps> = ({ 
    trips, 
    onTripClick, 
    showFrequencyWeight = true, 
    animateRoutes = true 
}) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const tileLayerRef = useRef<L.TileLayer | null>(null);
    const [isScreenshotting, setIsScreenshotting] = useState(false);
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

    useEffect(() => {
        if (!mapContainer.current || mapInstance.current) return;

        const map = L.map(mapContainer.current, {
            zoomControl: false,
            attributionControl: false,
            scrollWheelZoom: true,
            worldCopyJump: true
        }).setView([25, 10], 2); // Slightly centered for aesthetics

        mapInstance.current = map;

        return () => {
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

        const tileUrl = isDark 
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

        const layer = L.tileLayer(tileUrl, {
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
            subdomains: 'abcd',
            maxZoom: 19,
            noWrap: false 
        }).addTo(map);

        tileLayerRef.current = layer;
    }, [isDark]);

    useEffect(() => {
        if (!mapInstance.current) return;
        const map = mapInstance.current;

        // Clear existing layers
        map.eachLayer((layer) => {
            if (layer instanceof L.Marker || layer instanceof L.Polyline || layer instanceof L.CircleMarker) {
                map.removeLayer(layer);
            }
        });

        const bounds = L.latLngBounds([]);
        let hasPoints = false;

        trips.forEach(trip => {
            const { color, className } = getStatusStyle(trip, isDark);

            if (trip.transports && trip.transports.length > 0) {
                trip.transports.forEach(t => {
                    if (t.originLat && t.originLng && t.destLat && t.destLng) {
                        const start = L.latLng(t.originLat, t.originLng);
                        const end = L.latLng(t.destLat, t.destLng);
                        
                        const curvedPath = getCurvePoints(start, end);

                        const key = getRouteKey(t.originLat, t.originLng, t.destLat, t.destLng);
                        const freq = routeFrequencies.get(key) || 1;
                        
                        // Weight Logic
                        const dynamicWeight = showFrequencyWeight 
                            ? Math.min(10, 2 + ((freq - 1) * 1))
                            : 2;

                        // 1. STATIC TRACK (The base line)
                        // This creates the subtle path connection even when the "pulse" isn't there
                        const trackLine = L.polyline(curvedPath, {
                            color: color, 
                            weight: 1 + (dynamicWeight * 0.2), // Thinner than flow
                            opacity: isDark ? 0.2 : 0.4,
                            className: `flight-path-track ${className}`,
                            interactive: false
                        }).addTo(map);

                        // 2. ANIMATED FLOW (The moving dash)
                        let flowLine: L.Polyline | null = null;
                        if (animateRoutes) {
                            flowLine = L.polyline(curvedPath, {
                                color: color,
                                weight: dynamicWeight,
                                opacity: 1, // High opacity for glow
                                className: `flight-path-flow ${className}`,
                                interactive: false,
                                lineCap: 'round'
                            }).addTo(map);
                        } else {
                            // Solid line if animation disabled
                            flowLine = L.polyline(curvedPath, {
                                color: color,
                                weight: dynamicWeight,
                                opacity: 0.8,
                                interactive: false
                            }).addTo(map);
                        }

                        // 3. INVISIBLE INTERACTION LAYER (Hit area)
                        const hitLine = L.polyline(curvedPath, {
                            color: 'transparent',
                            weight: Math.max(15, dynamicWeight + 10), 
                            opacity: 0,
                            interactive: true
                        }).addTo(map);

                        // Tooltip on Hover
                        hitLine.bindTooltip(`
                            <div class="font-sans p-1">
                                <div class="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">${trip.name}</div>
                                <div class="font-bold text-sm text-white">${t.origin} <span class="text-gray-500">→</span> ${t.destination}</div>
                                <div class="text-[10px] text-gray-400 mt-1">${t.provider} • ${new Date(t.departureDate).toLocaleDateString()}</div>
                            </div>
                        `, {
                            sticky: true,
                            direction: 'top',
                            className: 'bg-black/90 text-white border border-white/20 shadow-xl rounded-xl backdrop-blur-md px-0 py-0'
                        });

                        hitLine.bindPopup(`
                            <div class="p-2">
                                <div class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">${trip.status} Trip</div>
                                <div class="font-bold text-sm text-white">${t.origin} <span class="text-gray-500">→</span> ${t.destination}</div>
                                <div class="text-xs opacity-70 text-gray-300">${t.provider}</div>
                                <div class="text-[10px] text-gray-500 mt-1">${new Date(t.departureDate).toLocaleDateString()}</div>
                            </div>
                        `);

                        // Hover Effects
                        hitLine.on('mouseover', () => {
                            // Highlight the flow line
                            if (flowLine && flowLine.getElement()) {
                                flowLine.getElement()?.classList.add('flight-path-selected');
                                flowLine.bringToFront();
                            }
                            // Also highlight track slightly
                            if (trackLine && trackLine.getElement()) {
                                trackLine.setStyle({ opacity: 0.5 });
                            }
                        });
                        
                        hitLine.on('mouseout', () => {
                            if (flowLine && flowLine.getElement()) {
                                flowLine.getElement()?.classList.remove('flight-path-selected');
                            }
                            if (trackLine && trackLine.getElement()) {
                                trackLine.setStyle({ opacity: isDark ? 0.2 : 0.4 });
                            }
                        });

                        hitLine.on('click', () => {
                            if (onTripClick) onTripClick(trip.id);
                        });

                        // Origin Dot
                        L.circleMarker(start, {
                            radius: 2, 
                            fillColor: color,
                            color: 'transparent',
                            fillOpacity: 0.5
                        }).addTo(map);

                        // Destination Dot
                        const destMarker = L.circleMarker(end, {
                            radius: 3, 
                            fillColor: isDark ? '#000' : '#fff', 
                            color: color, 
                            weight: 2,
                            fillOpacity: 1
                        }).addTo(map);

                        destMarker.on('click', () => {
                            if (onTripClick) onTripClick(trip.id);
                        });
                        
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
                // Fallback for trips without transport data
                const point = L.latLng(trip.coordinates.lat, trip.coordinates.lng);
                
                L.circleMarker(point, {
                    radius: 5,
                    fillColor: isDark ? '#000' : '#fff',
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

        // Fit initial bounds if points exist
        if (hasPoints) {
            map.fitBounds(bounds, { padding: [80, 80], maxZoom: 6 });
        } else {
            map.setView([20, 0], 2);
        }

    }, [trips, onTripClick, routeFrequencies, showFrequencyWeight, animateRoutes, isDark]);

    const handleZoomIn = () => mapInstance.current?.zoomIn();
    const handleZoomOut = () => mapInstance.current?.zoomOut();
    
    const handleFitBounds = () => {
        if (!mapInstance.current) return;
        const bounds = L.latLngBounds([]);
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
        if (hasPoints) {
            mapInstance.current.fitBounds(bounds, { padding: [80, 80], maxZoom: 6 });
        } else {
            mapInstance.current.setView([20, 0], 2);
        }
    };

    const handleScreenshot = async () => {
        if (!mapContainer.current) return;
        setIsScreenshotting(true);
        try {
            // Wait a tick to ensure state is rendered if we had loading indicators
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
        <div className={`relative w-full h-full group overflow-hidden ${isDark ? 'bg-[#0a0a0a]' : 'bg-slate-50'}`}>
            <div ref={mapContainer} className={`w-full h-full ${isDark ? 'bg-[#0a0a0a]' : 'bg-slate-50'}`} />
            
            {/* Control Bar */}
            <div className="absolute bottom-12 right-12 flex flex-col gap-3 z-[1000]">
                
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

            </div>
        </div>
    );
};
