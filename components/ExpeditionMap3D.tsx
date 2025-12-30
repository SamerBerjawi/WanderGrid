
import React, { useEffect, useState, useMemo, useRef } from 'react';
import Globe from 'react-globe.gl';
import { Trip } from '../types';

interface ExpeditionMap3DProps {
    trips: Trip[];
    onTripClick?: (tripId: string) => void;
    animateRoutes?: boolean;
    showFrequencyWeight?: boolean;
}

interface ArcData {
    startLat: number;
    startLng: number;
    endLat: number;
    endLng: number;
    color: string;
    name: string; // Origin -> Dest
    tripId: string;
    tripName: string;
    status: string;
    alt: number; // Altitude for 3D visualization
}

interface PointData {
    lat: number;
    lng: number;
    name: string;
    color: string;
    radius: number;
}

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

// Helper to determine styling
const getStatusColor = (trip: Trip, isDark: boolean, activeLayer: string) => {
    const today = new Date(Date.now());
    today.setHours(0,0,0,0);
    const endDate = new Date(trip.endDate);
    
    if (endDate < today) return '#3b82f6'; // Blue (Past)
    if (trip.status === 'Upcoming') return '#10b981'; // Green
    
    // Adjust logic for satellite mode (white is best)
    const isSatellite = activeLayer === 'satellite' || activeLayer === 'night';
    return isSatellite || isDark ? '#ffffff' : '#334155'; // White (Planning) vs Dark Slate
};

const getModeColor = (mode: string, baseColor: string) => {
    if (['Car Rental', 'Personal Car', 'Bus', 'Train'].includes(mode)) return '#f59e0b'; // Amber for Land
    if (mode === 'Cruise') return '#06b6d4'; // Cyan for Sea
    return baseColor;
};

// Route Key Helper
const getRouteKey = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const p1 = `${lat1.toFixed(2)},${lng1.toFixed(2)}`;
    const p2 = `${lat2.toFixed(2)},${lng2.toFixed(2)}`;
    return p1 < p2 ? `${p1}|${p2}` : `${p2}|${p1}`;
};

// Hex to RGBA Helper
const hexToRgba = (hex: string, alpha: number) => {
    // Handle short hex
    if (hex.length === 4) {
        hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    }
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// Great Circle Distance (Angle in Radians) for Altitude Scaling
const getGreatCircleAngle = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const toRad = (n: number) => n * Math.PI / 180;
    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);
    const dPhi = toRad(lat2 - lat1);
    const dLambda = toRad(lng2 - lng1);
    const a = Math.sin(dPhi/2) * Math.sin(dPhi/2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(dLambda/2) * Math.sin(dLambda/2);
    return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

export const ExpeditionMap3D: React.FC<ExpeditionMap3DProps> = ({ trips, onTripClick, animateRoutes = true, showFrequencyWeight = true }) => {
    const globeEl = useRef<any>(null);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
    const containerRef = useRef<HTMLDivElement>(null);
    const [activeLayer, setActiveLayer] = useState<'standard' | 'night' | 'satellite'>('standard');
    const isDark = useDarkMode();

    // Prepare Data
    const { arcs, points } = useMemo(() => {
        const arcList: ArcData[] = [];
        const pointMap = new Map<string, PointData>();
        const routeFrequencies = new Map<string, number>();

        // 1. Calculate Frequencies
        trips.forEach(trip => {
            trip.transports?.forEach(t => {
                if (t.originLat && t.originLng && t.destLat && t.destLng) {
                    // Check segments including waypoints
                    let currentLat = t.originLat;
                    let currentLng = t.originLng;
                    
                    const pointsToCheck = [];
                    if (t.waypoints) {
                        t.waypoints.forEach(wp => {
                            if (wp.coordinates) pointsToCheck.push({ lat: wp.coordinates.lat, lng: wp.coordinates.lng });
                        });
                    }
                    pointsToCheck.push({ lat: t.destLat, lng: t.destLng });

                    pointsToCheck.forEach(pt => {
                        const key = getRouteKey(currentLat, currentLng, pt.lat, pt.lng);
                        routeFrequencies.set(key, (routeFrequencies.get(key) || 0) + 1);
                        currentLat = pt.lat;
                        currentLng = pt.lng;
                    });
                }
            });
        });

        // 2. Build Arcs and Points
        trips.forEach(trip => {
            const statusColor = getStatusColor(trip, isDark, activeLayer);

            if (trip.transports && trip.transports.length > 0) {
                trip.transports.forEach(t => {
                    const modeColor = getModeColor(t.mode, statusColor);
                    const isSurface = ['Car Rental', 'Personal Car', 'Bus', 'Train', 'Cruise'].includes(t.mode);

                    if (t.originLat && t.originLng && t.destLat && t.destLng) {
                        
                        // Construct path segments including waypoints
                        const segments = [];
                        const startPoint = { lat: t.originLat, lng: t.originLng, name: t.origin };
                        
                        let currentStart = startPoint;
                        
                        // Add point for Origin
                        const originKey = `${t.originLat.toFixed(3)},${t.originLng.toFixed(3)}`;
                        const ptColor = (isDark || activeLayer !== 'standard') ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)';
                        
                        if (!pointMap.has(originKey)) {
                            pointMap.set(originKey, { ...startPoint, color: ptColor, radius: 0.3 });
                        }

                        // Process Waypoints
                        if (t.waypoints && t.waypoints.length > 0) {
                            t.waypoints.forEach(wp => {
                                if (wp.coordinates) {
                                    const wpPoint = { lat: wp.coordinates.lat, lng: wp.coordinates.lng, name: wp.name };
                                    segments.push({ start: currentStart, end: wpPoint });
                                    currentStart = wpPoint;
                                    
                                    // Add point for Waypoint
                                    const wpKey = `${wpPoint.lat.toFixed(3)},${wpPoint.lng.toFixed(3)}`;
                                    if (!pointMap.has(wpKey)) {
                                        pointMap.set(wpKey, { ...wpPoint, color: ptColor, radius: 0.2 }); // Slightly smaller radius for stops
                                    }
                                }
                            });
                        }

                        const endPoint = { lat: t.destLat, lng: t.destLng, name: t.destination };
                        // Add final segment to destination
                        segments.push({ start: currentStart, end: endPoint });
                        
                        // Add point for Dest
                        const destKey = `${t.destLat.toFixed(3)},${t.destLng.toFixed(3)}`;
                        if (!pointMap.has(destKey)) {
                            pointMap.set(destKey, { ...endPoint, color: ptColor, radius: 0.3 });
                        }

                        // Create Arcs from segments
                        segments.forEach(seg => {
                             const key = getRouteKey(seg.start.lat, seg.start.lng, seg.end.lat, seg.end.lng);
                             const freq = routeFrequencies.get(key) || 1;
                             
                             // Calculate opacity based on frequency if enabled
                             let finalColor = modeColor;
                             if (showFrequencyWeight) {
                                 // Base opacity 0.4, max 1.0. Scale logarithmically or linearly.
                                 const opacity = Math.min(1, 0.4 + (Math.log(freq) * 0.3));
                                 finalColor = hexToRgba(modeColor, opacity);
                             }

                             // Calculate Altitude
                             // Surface routes get 0 (flat), Flights scale based on distance
                             const angularDist = getGreatCircleAngle(seg.start.lat, seg.start.lng, seg.end.lat, seg.end.lng);
                             // Use very small non-zero for surface to prevent z-fighting with the globe surface mesh
                             const alt = isSurface ? 0.001 : (angularDist * 0.4); 

                             arcList.push({
                                startLat: seg.start.lat,
                                startLng: seg.start.lng,
                                endLat: seg.end.lat,
                                endLng: seg.end.lng,
                                color: finalColor,
                                name: `${seg.start.name} → ${seg.end.name}`,
                                tripId: trip.id,
                                tripName: trip.name,
                                status: trip.status,
                                alt: alt
                            });
                        });
                    }
                });
            } else if (trip.coordinates) {
                // Point only for trips without transport
                const color = getStatusColor(trip, isDark, activeLayer);
                const key = `${trip.coordinates.lat.toFixed(3)},${trip.coordinates.lng.toFixed(3)}`;
                if (!pointMap.has(key)) {
                    pointMap.set(key, {
                        lat: trip.coordinates.lat,
                        lng: trip.coordinates.lng,
                        name: trip.location,
                        color: color,
                        radius: 0.5
                    });
                }
            }
        });

        return { arcs: arcList, points: Array.from(pointMap.values()) };
    }, [trips, isDark, activeLayer, showFrequencyWeight]);

    // Resize Observer
    useEffect(() => {
        const resizeObserver = new ResizeObserver((entries) => {
            if (entries.length > 0) {
                const { width, height } = entries[0].contentRect;
                setDimensions({ width, height });
            }
        });

        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }

        return () => resizeObserver.disconnect();
    }, []);

    // Initial Auto-Rotate & Focus
    useEffect(() => {
        if (globeEl.current) {
            // Auto-rotate
            globeEl.current.controls().autoRotate = true;
            globeEl.current.controls().autoRotateSpeed = 0.5;
            
            // Set initial point of view slightly offset
            globeEl.current.pointOfView({ lat: 20, lng: 0, altitude: 2.5 });
        }
    }, []);

    const getGlobeImage = () => {
        if (activeLayer === 'satellite') return "//unpkg.com/three-globe/example/img/earth-blue-marble.jpg";
        if (activeLayer === 'night') return "//unpkg.com/three-globe/example/img/earth-night.jpg";
        
        // Standard follows theme
        return isDark ? "//unpkg.com/three-globe/example/img/earth-night.jpg" : "//unpkg.com/three-globe/example/img/earth-day.jpg";
    };

    return (
        <div ref={containerRef} className={`w-full h-full overflow-hidden relative ${isDark ? 'bg-black' : 'bg-slate-50'}`}>
            <Globe
                ref={globeEl}
                width={dimensions.width}
                height={dimensions.height}
                globeImageUrl={getGlobeImage()}
                bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
                backgroundColor={isDark ? "#000000" : "#f8fafc"}
                atmosphereColor={isDark || activeLayer !== 'standard' ? "#3a228a" : "#ffffff"}
                atmosphereAltitude={0.15}
                
                // Arcs
                arcsData={arcs}
                arcStartLat="startLat"
                arcStartLng="startLng"
                arcEndLat="endLat"
                arcEndLng="endLng"
                arcColor="color"
                arcDashLength={animateRoutes ? 0.4 : 1}
                arcDashGap={animateRoutes ? 0.2 : 0}
                arcDashAnimateTime={animateRoutes ? 2000 : 0}
                arcStroke={showFrequencyWeight ? 0.5 : 0.2}
                arcAltitude="alt"
                
                // Points
                pointsData={points}
                pointLat="lat"
                pointLng="lng"
                pointColor="color"
                pointRadius="radius"
                pointAltitude={0.01}
                pointResolution={2}

                // Interactions
                onArcClick={(arc: any) => onTripClick && onTripClick(arc.tripId)}
                arcLabel={(arc: any) => `
                    <div style="background: rgba(0,0,0,0.8); color: white; padding: 4px 8px; border-radius: 4px; font-family: sans-serif; font-size: 12px; border: 1px solid rgba(255,255,255,0.2);">
                        <strong>${arc.tripName}</strong><br/>
                        ${arc.name}
                    </div>
                `}
                
                onPointClick={() => {}} // Could zoom to point
                pointLabel="name"
            />
            
            {/* Custom Overlay Controls */}
            <div className="absolute bottom-6 left-6 pointer-events-none">
                <div className={`text-[10px] font-mono px-2 py-1 rounded ${isDark ? 'text-gray-500 bg-black/50' : 'text-slate-500 bg-white/50'}`}>
                    3D Visualization • {arcs.length} Routes
                </div>
            </div>

            {/* Layer Controls - Top Left */}
            <div className="absolute top-6 left-6 flex flex-col gap-3 z-[5000]">
                <div className={`flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${isDark ? 'bg-white/10 backdrop-blur-md border-white/20' : 'bg-white/80 backdrop-blur-md border-slate-200'}`}>
                    <button 
                        onClick={() => setActiveLayer('standard')} 
                        className={`w-10 h-10 flex items-center justify-center transition-colors border-b ${isDark ? 'border-white/10' : 'border-slate-100'} ${activeLayer === 'standard' ? 'text-blue-500 bg-white/20' : isDark ? 'text-white hover:bg-white/20' : 'text-slate-600 hover:bg-slate-100'}`}
                        title="Standard View"
                    >
                        <span className="material-icons-outlined text-lg">public</span>
                    </button>
                    <button 
                        onClick={() => setActiveLayer('night')} 
                        className={`w-10 h-10 flex items-center justify-center transition-colors border-b ${isDark ? 'border-white/10' : 'border-slate-100'} ${activeLayer === 'night' ? 'text-blue-500 bg-white/20' : isDark ? 'text-white hover:bg-white/20' : 'text-slate-600 hover:bg-slate-100'}`}
                        title="Night View"
                    >
                        <span className="material-icons-outlined text-lg">nights_stay</span>
                    </button>
                    <button 
                        onClick={() => setActiveLayer('satellite')} 
                        className={`w-10 h-10 flex items-center justify-center transition-colors ${activeLayer === 'satellite' ? 'text-blue-500 bg-white/20' : isDark ? 'text-white hover:bg-white/20' : 'text-slate-600 hover:bg-slate-100'}`}
                        title="Satellite View"
                    >
                        <span className="material-icons-outlined text-lg">satellite_alt</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
