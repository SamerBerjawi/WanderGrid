
import React, { useEffect, useState, useMemo, useRef } from 'react';
import Globe from 'react-globe.gl';
import { Trip } from '../types';

interface ExpeditionMap3DProps {
    trips: Trip[];
    onTripClick?: (tripId: string) => void;
    animateRoutes?: boolean;
    showFrequencyWeight?: boolean;
    autoPlay?: boolean; // Cinematic Mode Trigger
}

interface ArcData {
    startLat: number;
    startLng: number;
    endLat: number;
    endLng: number;
    color: string;
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

export const ExpeditionMap3D: React.FC<ExpeditionMap3DProps> = ({ trips, onTripClick, animateRoutes = true, showFrequencyWeight = true, autoPlay = false }) => {
    const globeEl = useRef<any>(null);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
    const containerRef = useRef<HTMLDivElement>(null);
    const [activeLayer, setActiveLayer] = useState<'standard' | 'night' | 'satellite'>('standard');
    const isDark = useDarkMode();
    
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
        trips.forEach(trip => {
            trip.transports?.forEach(t => {
                if (t.originLat && t.originLng && t.destLat && t.destLng) {
                    const key = getRouteKey(t.originLat, t.originLng, t.destLat, t.destLng);
                    routeFrequencies.set(key, (routeFrequencies.get(key) || 0) + 1);
                }
            });
        });

        // 2. Build Objects
        trips.forEach(trip => {
            const statusColor = getStatusColor(trip, isDark, activeLayer);
            
            // Build Sequential Points for AutoPlay (Only if single trip provided to prevent chaos)
            if (trips.length === 1 && trip.transports) {
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

                             arcList.push({
                                startLat: seg.start.lat, startLng: seg.start.lng, endLat: seg.end.lat, endLng: seg.end.lng,
                                color: finalColor, name: `${seg.start.name} → ${seg.end.name}`,
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
    }, [trips, isDark, activeLayer, showFrequencyWeight]);

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

    // Initial Setup
    useEffect(() => {
        if (globeEl.current) {
            globeEl.current.controls().autoRotate = !autoPlay;
            globeEl.current.controls().autoRotateSpeed = 0.5;
            if (!autoPlay) globeEl.current.pointOfView({ lat: 20, lng: 0, altitude: 2.5 });
        }
    }, [autoPlay]);

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
        if (activeLayer === 'satellite') return "//unpkg.com/three-globe/example/img/earth-blue-marble.jpg";
        if (activeLayer === 'night') return "//unpkg.com/three-globe/example/img/earth-night.jpg";
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
                arcsData={arcs}
                arcStartLat="startLat" arcStartLng="startLng" arcEndLat="endLat" arcEndLng="endLng"
                arcColor="color" arcDashLength={animateRoutes ? 0.4 : 1} arcDashGap={animateRoutes ? 0.2 : 0}
                arcDashAnimateTime={animateRoutes ? 2000 : 0} arcStroke={showFrequencyWeight ? 0.5 : 0.2} arcAltitude="alt"
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
        </div>
    );
};
