
import React, { useEffect, useState, useMemo, useRef } from 'react';
import Globe from 'react-globe.gl';
import { Trip } from '../types';
import { getCoordinatesSync } from '../services/geocoding';

interface ExpeditionMap3DProps {
    trips: Trip[];
    onTripClick?: (tripId: string) => void;
    animateRoutes?: boolean;
    showFrequencyWeight?: boolean;
    autoPlay?: boolean; // Cinematic Mode Trigger
    activeLayer?: 'standard' | 'night' | 'satellite';
    onActiveLayerChange?: (layer: 'standard' | 'night' | 'satellite') => void;
    focusTransportCoordinates?: { lat: number; lng: number } | null;
    showGradientRoutes?: boolean;
    onToggleGradientRoutes?: (val: boolean) => void;
    showFlightRoutes?: boolean;
    showLandSeaRoutes?: boolean;
}

interface ArcData {
    startLat: number;
    startLng: number;
    endLat: number;
    endLng: number;
    color: string | string[];
    name: string;
    tripId: string;
    tripName: string;
    status: string;
    alt: number;
}

interface PointData {
    lat: number;
    lng: number;
    name: string;
    color: string;
    radius: number;
}

// --- Geographic Region Gradient Colors (Matching ExpeditionMap 2D) ---
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
        const distSq = dLat * dLat + dLng * dLng;
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

// Custom Hook to detect Dark Mode changes
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

// Colors & Helpers
const getStatusColor = (trip: Trip, isDark: boolean, activeLayer: string) => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const endDate = new Date(trip.endDate);
    if (endDate < today) return '#3b82f6'; 
    if (trip.status === 'Upcoming') return '#10b981';
    const isSatellite = activeLayer === 'satellite' || activeLayer === 'night';
    return isSatellite || isDark ? '#ffffff' : '#334155';
};

const getModeColor = (mode: string, baseColor: string) => {
    if (['Car Rental', 'Personal Car', 'Bus', 'Train'].includes(mode)) return '#f59e0b';
    if (mode === 'Cruise') return '#06b6d4';
    return baseColor;
};

const getRouteKey = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const p1 = `${lat1.toFixed(2)},${lng1.toFixed(2)}`;
    const p2 = `${lat2.toFixed(2)},${lng2.toFixed(2)}`;
    return p1 < p2 ? `${p1}|${p2}` : `${p2}|${p1}`;
};

const hexToRgba = (hex: string, alpha: number) => {
    if (hex.length === 4) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const getGreatCircleAngle = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const toRad = (n: number) => n * Math.PI / 180;
    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);
    const dPhi = toRad(lat2 - lat1);
    const dLambda = toRad(lng2 - lng1);
    const a = Math.sin(dPhi/2) * Math.sin(dPhi/2) + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda/2) * Math.sin(dLambda/2);
    return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

export const ExpeditionMap3D: React.FC<ExpeditionMap3DProps> = ({ 
    trips, 
    onTripClick, 
    animateRoutes = true, 
    showFrequencyWeight = true, 
    autoPlay = false,
    activeLayer: activeLayerProp,
    onActiveLayerChange,
    focusTransportCoordinates,
    showGradientRoutes: showGradientRoutesProp,
    onToggleGradientRoutes,
    showFlightRoutes = true,
    showLandSeaRoutes = true
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

    const globeEl = useRef<any>(null);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
    const containerRef = useRef<HTMLDivElement>(null);
    const [localActiveLayer, setLocalActiveLayer] = useState<'standard' | 'night' | 'satellite'>('standard');
    
    const activeLayer = activeLayerProp !== undefined ? activeLayerProp : localActiveLayer;
    
    useEffect(() => {
        if (activeLayerProp !== undefined) {
            setLocalActiveLayer(activeLayerProp);
        }
    }, [activeLayerProp]);

    const setActiveLayer = (val: 'standard' | 'night' | 'satellite') => {
        setLocalActiveLayer(val);
        if (onActiveLayerChange) onActiveLayerChange(val);
    };

    const isDark = useDarkMode();
    
    // Gradient Routes synchronized or local state
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

    // Custom Globe Controls States
    const [autoRotate, setAutoRotate] = useState(true);
    const [autoRotateSpeed, setAutoRotateSpeed] = useState(0.5);
    const [showGraticules, setShowGraticules] = useState(false);
    const [atmosphereAltitude, setAtmosphereAltitude] = useState(0.35);
    const [showAtmosphere, setShowAtmosphere] = useState(true);
    const [showControlsPanel, setShowControlsPanel] = useState(false);
    
    // Cinematic State
    const [currentLegLabel, setCurrentLegLabel] = useState<string>('');
    const [isPlaying, setIsPlaying] = useState(false);

    // Prepare Data
    const { arcs, points, sequentialPoints } = useMemo(() => {
        const arcList: ArcData[] = [];
        const pointMap = new Map<string, PointData>();
        const routeFrequencies = new Map<string, number>();
        const seqPoints: { lat: number, lng: number, label: string }[] = [];

        // 1. Frequencies
        enrichedTrips.forEach(trip => {
            trip.transports?.forEach(t => {
                if (t.originLat && t.originLng && t.destLat && t.destLng) {
                    const key = getRouteKey(t.originLat, t.originLng, t.destLat, t.destLng);
                    routeFrequencies.set(key, (routeFrequencies.get(key) || 0) + 1);
                }
            });
        });

        // 2. Build Objects
        enrichedTrips.forEach(trip => {
            const statusColor = getStatusColor(trip, isDark, activeLayer);
            
            // Build Sequential Points for AutoPlay (Only if single trip provided to prevent chaos)
            if (enrichedTrips.length === 1 && trip.transports) {
                // Sort transports
                const sorted = [...trip.transports].sort((a, b) => new Date(a.departureDate).getTime() - new Date(b.departureDate).getTime());
                if (sorted.length > 0) {
                    // Start
                    seqPoints.push({ lat: sorted[0].originLat || 0, lng: sorted[0].originLng || 0, label: `Start: ${sorted[0].origin}` });
                    sorted.forEach(t => {
                        seqPoints.push({ lat: t.destLat || 0, lng: t.destLng || 0, label: `${t.mode} to ${t.destination}` });
                    });
                }
            }

            if (trip.transports && trip.transports.length > 0) {
                trip.transports.forEach(t => {
                    const isFlight = t.mode === 'Flight';
                    const isLand = ['Car Rental', 'Personal Car', 'Bus', 'Train'].includes(t.mode);
                    const isSea = t.mode === 'Cruise';

                    if (isFlight && !showFlightRoutes) return;
                    if (!isFlight && !showLandSeaRoutes) return;

                    const modeColor = getModeColor(t.mode, statusColor);
                    const isSurface = ['Car Rental', 'Personal Car', 'Bus', 'Train', 'Cruise'].includes(t.mode);

                    if (t.originLat && t.originLng && t.destLat && t.destLng) {
                        const segments = [];
                        let currentStart = { lat: t.originLat, lng: t.originLng, name: t.origin };
                        
                        const ptColor = (isDark || activeLayer !== 'standard') ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)';
                        const oKey = `${t.originLat.toFixed(3)},${t.originLng.toFixed(3)}`;
                        if (!pointMap.has(oKey)) pointMap.set(oKey, { ...currentStart, color: ptColor, radius: 0.3 });

                        if (t.waypoints) {
                            t.waypoints.forEach(wp => {
                                if (wp.coordinates) {
                                    const wpPt = { lat: wp.coordinates.lat, lng: wp.coordinates.lng, name: wp.name };
                                    segments.push({ start: currentStart, end: wpPt });
                                    currentStart = wpPt;
                                    const wKey = `${wpPt.lat.toFixed(3)},${wpPt.lng.toFixed(3)}`;
                                    if (!pointMap.has(wKey)) pointMap.set(wKey, { ...wpPt, color: ptColor, radius: 0.2 });
                                }
                            });
                        }
                        const endPt = { lat: t.destLat, lng: t.destLng, name: t.destination };
                        segments.push({ start: currentStart, end: endPt });
                        const dKey = `${t.destLat.toFixed(3)},${t.destLng.toFixed(3)}`;
                        if (!pointMap.has(dKey)) pointMap.set(dKey, { ...endPt, color: ptColor, radius: 0.3 });

                        segments.forEach(seg => {
                             const key = getRouteKey(seg.start.lat, seg.start.lng, seg.end.lat, seg.end.lng);
                             const freq = routeFrequencies.get(key) || 1;
                             let finalColor = modeColor;
                             if (showFrequencyWeight) {
                                 const opacity = Math.min(1, 0.4 + (Math.log(freq) * 0.3));
                                 finalColor = hexToRgba(modeColor, opacity);
                             }
                             const angularDist = getGreatCircleAngle(seg.start.lat, seg.start.lng, seg.end.lat, seg.end.lng);
                             const alt = isSurface ? 0.001 : (angularDist * 0.4); 

                             // Compute high-fidelity visual gradients connecting regional color spaces
                             const stColor = showGradientRoutes ? getGeoGradientColor(seg.start.lat, seg.start.lng) : finalColor;
                             const edColor = showGradientRoutes ? getGeoGradientColor(seg.end.lat, seg.end.lng) : finalColor;
                             const arcColorValue = showGradientRoutes ? [stColor, edColor] : finalColor;

                             arcList.push({
                                startLat: seg.start.lat, startLng: seg.start.lng, endLat: seg.end.lat, endLng: seg.end.lng,
                                color: arcColorValue, name: `${seg.start.name} → ${seg.end.name}`,
                                tripId: trip.id, tripName: trip.name, status: trip.status, alt: alt
                            });
                        });
                    }
                });
            } else if (trip.coordinates) {
                const color = getStatusColor(trip, isDark, activeLayer);
                const key = `${trip.coordinates.lat.toFixed(3)},${trip.coordinates.lng.toFixed(3)}`;
                if (!pointMap.has(key)) {
                    pointMap.set(key, { lat: trip.coordinates.lat, lng: trip.coordinates.lng, name: trip.location, color: color, radius: 0.5 });
                }
            }
        });

        return { arcs: arcList, points: Array.from(pointMap.values()), sequentialPoints: seqPoints };
    }, [enrichedTrips, isDark, activeLayer, showFrequencyWeight, showGradientRoutes, showFlightRoutes, showLandSeaRoutes]);

    // Resize Observer
    useEffect(() => {
        const resizeObserver = new ResizeObserver((entries) => {
            if (entries.length > 0) {
                const { width, height } = entries[0].contentRect;
                setDimensions({ width, height });
            }
        });
        if (containerRef.current) resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    // Control Updates for AutoRotate
    useEffect(() => {
        if (globeEl.current) {
            globeEl.current.controls().autoRotate = autoPlay ? false : autoRotate;
            globeEl.current.controls().autoRotateSpeed = autoRotateSpeed;
        }
    }, [autoPlay, autoRotate, autoRotateSpeed]);

    // Initial Camera Placement
    useEffect(() => {
        if (globeEl.current && !autoPlay) {
            globeEl.current.pointOfView({ lat: 20, lng: 0, altitude: 2.5 });
        }
    }, [autoPlay]);

    // Focus camera on focusTransportCoordinates
    useEffect(() => {
        if (globeEl.current && focusTransportCoordinates) {
            if (autoRotate) setAutoRotate(false);
            globeEl.current.pointOfView({
                lat: focusTransportCoordinates.lat,
                lng: focusTransportCoordinates.lng,
                altitude: 1.5
            }, 2500);
        }
    }, [focusTransportCoordinates]);

    // Fly to region helper
    const flyToRegion = (lat: number, lng: number, altitude: number) => {
        if (globeEl.current) {
            setAutoRotate(false); // Pause so they can look
            globeEl.current.pointOfView({ lat, lng, altitude }, 3000);
        }
    };

    const REGION_PRESETS = [
        { name: '🌎 Americas', lat: 15, lng: -90, altitude: 2.0 },
        { name: '🇪🇺 Europe & Africa', lat: 30, lng: 15, altitude: 2.0 },
        { name: '🌏 Asia & India', lat: 30, lng: 90, altitude: 2.0 },
        { name: '🐨 Oceania', lat: -25, lng: 135, altitude: 2.0 },
    ];

    // Cinematic Sequence Logic
    useEffect(() => {
        if (!autoPlay || !globeEl.current || sequentialPoints.length === 0) return;
        setIsPlaying(true);
        setActiveLayer('satellite'); // Enforce satellite for cinematic feel

        let currentIndex = 0;
        let timeoutId: any;

        const animateToNext = () => {
            if (currentIndex >= sequentialPoints.length) {
                // Loop or stop
                currentIndex = 0; 
                // Alternatively stop: setIsPlaying(false); return;
            }

            const pt = sequentialPoints[currentIndex];
            setCurrentLegLabel(pt.label);

            // 1. Move Camera
            globeEl.current.pointOfView({
                lat: pt.lat,
                lng: pt.lng,
                altitude: 1.5 // Zoom level
            }, 3000); // 3s transition

            // 2. Wait then next
            timeoutId = setTimeout(() => {
                currentIndex++;
                animateToNext();
            }, 6000); // 3s transition + 3s dwell
        };

        // Start delay
        timeoutId = setTimeout(animateToNext, 1000);

        return () => clearTimeout(timeoutId);
    }, [autoPlay, sequentialPoints]);

    const getGlobeImage = () => {
        if (activeLayer === 'satellite') return "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg";
        if (activeLayer === 'night') return "https://unpkg.com/three-globe/example/img/earth-night.jpg";
        return isDark ? "https://unpkg.com/three-globe/example/img/earth-night.jpg" : "https://unpkg.com/three-globe/example/img/earth-day.jpg";
    };

    return (
        <div ref={containerRef} className="w-full h-full overflow-hidden relative bg-transparent">
            <Globe
                ref={globeEl}
                width={dimensions.width}
                height={dimensions.height}
                globeImageUrl={getGlobeImage()}
                bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png"
                backgroundColor="rgba(0,0,0,0)"
                showAtmosphere={showAtmosphere}
                atmosphereColor={isDark || activeLayer !== 'standard' ? "#3a228a" : "#ffffff"}
                atmosphereAltitude={atmosphereAltitude}
                showGraticules={showGraticules}
                arcsData={arcs}
                arcStartLat="startLat" arcStartLng="startLng" arcEndLat="endLat" arcEndLng="endLng"
                arcColor="color" arcDashLength={animateRoutes ? 0.4 : 1} arcDashGap={animateRoutes ? 0.2 : 0}
                arcDashAnimateTime={animateRoutes ? 2000 : 0} arcStroke={showFrequencyWeight ? 0.45 : 0.3} arcAltitude="alt"
                arcResolution={32}
                pointsData={points} pointLat="lat" pointLng="lng" pointColor="color" pointRadius="radius" pointAltitude={0.01} pointResolution={2}
                onArcClick={(arc: any) => onTripClick && onTripClick(arc.tripId)}
                arcLabel={(arc: any) => `<div style="background: rgba(0,0,0,0.8); color: white; padding: 4px 8px; border-radius: 4px; font-family: sans-serif; font-size: 12px; border: 1px solid rgba(255,255,255,0.2);"><strong>${arc.tripName}</strong><br/>${arc.name}</div>`}
                pointLabel="name"
            />
            
            {/* Cinematic Overlay */}
            {autoPlay && isPlaying && (
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50">
                    <div className="bg-black/60 backdrop-blur-md text-white px-8 py-4 rounded-full border border-white/20 shadow-2xl flex items-center gap-4 animate-fade-in-up">
                        <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Cinematic Replay</p>
                            <p className="text-lg font-bold leading-none mt-1">{currentLegLabel}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Standard Controls (Hidden in Cinematic Mode) */}
            {!autoPlay && (
                <div className="absolute top-6 left-6 flex flex-col gap-3 z-[5000]">
                    <div className={`flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${isDark ? 'bg-white/10 backdrop-blur-md border-white/20' : 'bg-white/80 backdrop-blur-md border-slate-200'}`}>
                        {['standard', 'night', 'satellite'].map(layer => (
                            <button 
                                key={layer}
                                onClick={() => setActiveLayer(layer as any)} 
                                className={`w-10 h-10 flex items-center justify-center transition-colors border-b last:border-0 ${isDark ? 'border-white/10' : 'border-slate-100'} ${activeLayer === layer ? 'text-blue-500 bg-white/20' : isDark ? 'text-white hover:bg-white/20' : 'text-slate-600 hover:bg-slate-100'}`}
                                title={`${layer.charAt(0).toUpperCase() + layer.slice(1)} View`}
                            >
                                <span className="material-icons-outlined text-lg">{layer === 'standard' ? 'public' : layer === 'night' ? 'nights_stay' : 'satellite_alt'}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Customizable Sidebar Controls Header on the Right side */}
            {!autoPlay && (
                <div className="absolute top-6 right-6 flex flex-col items-end gap-3 z-[5000]">
                    <button
                        onClick={() => setShowControlsPanel(!showControlsPanel)}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl ${showControlsPanel ? 'bg-blue-600 text-white rotate-45' : isDark ? 'bg-[#1e293b]/90 text-white hover:bg-slate-800' : 'bg-white/90 text-slate-700 hover:bg-slate-100'} border ${isDark ? 'border-white/10' : 'border-slate-200'}`}
                        title="Globe Controls"
                    >
                        <span className="material-icons-outlined text-lg">{showControlsPanel ? 'close' : 'tune'}</span>
                    </button>

                    {showControlsPanel && (
                        <div className={`p-5 rounded-2xl border shadow-2xl flex flex-col gap-5 w-72 text-xs transition-all duration-300 animate-fade-in ${isDark ? 'bg-[#0f172a]/95 backdrop-blur-md border-white/10 text-white' : 'bg-white/95 backdrop-blur-md border-slate-200 text-slate-800'}`}>
                            <div className="flex items-center gap-2 border-b pb-2.5 border-slate-700/20 dark:border-white/10">
                                <span className="material-icons-outlined text-blue-500 text-base">explore</span>
                                <span className="font-bold uppercase tracking-wider text-[11px]">3D Globe Customization</span>
                            </div>

                            {/* Rotation control */}
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-slate-400 dark:text-slate-300">Continuous Auto-Spin</span>
                                    <button 
                                        onClick={() => setAutoRotate(!autoRotate)}
                                        className={`w-11 h-6 px-1 rounded-full transition-all flex items-center ${autoRotate ? 'bg-blue-500 justify-end' : 'bg-slate-600/40 dark:bg-slate-800/60 justify-start'}`}
                                    >
                                        <div className="w-4 h-4 bg-white rounded-full shadow-md" />
                                    </button>
                                </div>
                                {autoRotate && (
                                    <div className="flex flex-col gap-1 mt-1 pl-1">
                                        <div className="flex justify-between text-[10px] text-slate-400">
                                            <span>Spin Velocity</span>
                                            <span>{autoRotateSpeed.toFixed(1)}x</span>
                                        </div>
                                        <input 
                                            type="range"
                                            min="0.1"
                                            max="3"
                                            step="0.1"
                                            value={autoRotateSpeed}
                                            onChange={(e) => setAutoRotateSpeed(parseFloat(e.target.value))}
                                            className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Shading/Atmosphere overlay toggles */}
                            <div className="flex flex-col gap-2.5 border-t border-b py-3 border-slate-700/10 dark:border-white/10">
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-slate-400 dark:text-slate-300">Atmosphere Shield Glow</span>
                                    <button 
                                        onClick={() => setShowAtmosphere(!showAtmosphere)}
                                        className={`w-8 h-4 rounded-full transition-all duration-200 relative ${showAtmosphere ? 'bg-blue-500' : 'bg-slate-600/30'}`}
                                    >
                                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow-md transition-all ${showAtmosphere ? 'right-0.5' : 'left-0.5'}`} />
                                    </button>
                                </div>
                                {showAtmosphere && (
                                    <div className="flex flex-col gap-1 pl-1">
                                        <div className="flex justify-between text-[10px] text-slate-400">
                                            <span>Glow Altitude</span>
                                            <span>{(atmosphereAltitude * 100).toFixed(0)}%</span>
                                        </div>
                                        <input 
                                            type="range"
                                            min="0.05"
                                            max="0.50"
                                            step="0.01"
                                            value={atmosphereAltitude}
                                            onChange={(e) => setAtmosphereAltitude(parseFloat(e.target.value))}
                                            className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                        />
                                    </div>
                                )}
                                <div className="flex items-center justify-between mt-1">
                                    <span className="font-medium text-slate-400 dark:text-slate-300">Grid Overlay (Graticules)</span>
                                    <button 
                                        onClick={() => setShowGraticules(!showGraticules)}
                                        className={`w-8 h-4 rounded-full transition-all duration-200 relative ${showGraticules ? 'bg-blue-500' : 'bg-slate-600/30'}`}
                                    >
                                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow-md transition-all ${showGraticules ? 'right-0.5' : 'left-0.5'}`} />
                                    </button>
                                </div>
                                <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-slate-700/10 dark:border-white/5">
                                    <span className="font-medium text-slate-400 dark:text-slate-300">Route Gradients</span>
                                    <button 
                                        onClick={() => handleToggleGradientRoutes(!showGradientRoutes)}
                                        className={`w-8 h-4 rounded-full transition-all duration-200 relative ${showGradientRoutes ? 'bg-blue-500' : 'bg-slate-600/30'}`}
                                        title="Color routes using geographical country highlighting gradients"
                                    >
                                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow-md transition-all ${showGradientRoutes ? 'right-0.5' : 'left-0.5'}`} />
                                    </button>
                                </div>
                            </div>

                            {/* Camera Presets / Fly to preset */}
                            <div className="flex flex-col gap-2">
                                <span className="font-semibold text-[10px] uppercase tracking-wider text-slate-400">Region Snap-to-Fly</span>
                                <div className="grid grid-cols-2 gap-2">
                                    {REGION_PRESETS.map((preset) => (
                                        <button
                                            key={preset.name}
                                            onClick={() => flyToRegion(preset.lat, preset.lng, preset.altitude)}
                                            className={`p-2 py-1.5 rounded-xl border font-semibold text-left truncate transition-all flex items-center gap-1 ${isDark ? 'bg-white/5 border-white/5 text-slate-300 hover:bg-slate-800/80 hover:text-white' : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100/80 hover:text-slate-800'}`}
                                        >
                                            <span className="text-[10px] md:text-xs truncate">{preset.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
