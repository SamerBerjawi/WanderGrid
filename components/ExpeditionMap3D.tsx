
import React, { useEffect, useState, useMemo, useRef } from 'react';
import Globe from 'react-globe.gl';
import { Trip } from '../types';

interface ExpeditionMap3DProps {
    trips: Trip[];
    onTripClick?: (tripId: string) => void;
    animateRoutes?: boolean;
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
const getStatusColor = (trip: Trip, isDark: boolean) => {
    const today = new Date(Date.now());
    today.setHours(0,0,0,0);
    const endDate = new Date(trip.endDate);
    
    if (endDate < today) return '#3b82f6'; // Blue (Past)
    if (trip.status === 'Upcoming') return '#10b981'; // Green
    // Dark: White, Light: Dark Slate/Blue
    return isDark ? '#ffffff' : '#334155'; // White (Planning) vs Dark Slate
};

export const ExpeditionMap3D: React.FC<ExpeditionMap3DProps> = ({ trips, onTripClick, animateRoutes = true }) => {
    const globeEl = useRef<any>(null);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
    const containerRef = useRef<HTMLDivElement>(null);
    const isDark = useDarkMode();

    // Prepare Data
    const { arcs, points } = useMemo(() => {
        const arcList: ArcData[] = [];
        const pointMap = new Map<string, PointData>();

        trips.forEach(trip => {
            const color = getStatusColor(trip, isDark);

            if (trip.transports && trip.transports.length > 0) {
                trip.transports.forEach(t => {
                    if (t.originLat && t.originLng && t.destLat && t.destLng) {
                        // Arcs
                        arcList.push({
                            startLat: t.originLat,
                            startLng: t.originLng,
                            endLat: t.destLat,
                            endLng: t.destLng,
                            color: color,
                            name: `${t.origin} → ${t.destination}`,
                            tripId: trip.id,
                            tripName: trip.name,
                            status: trip.status
                        });

                        // Points (Unique by lat/lng roughly)
                        const originKey = `${t.originLat.toFixed(3)},${t.originLng.toFixed(3)}`;
                        const destKey = `${t.destLat.toFixed(3)},${t.destLng.toFixed(3)}`;

                        if (!pointMap.has(originKey)) {
                            pointMap.set(originKey, {
                                lat: t.originLat,
                                lng: t.originLng,
                                name: t.origin,
                                color: isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)',
                                radius: 0.3
                            });
                        }
                        if (!pointMap.has(destKey)) {
                            pointMap.set(destKey, {
                                lat: t.destLat,
                                lng: t.destLng,
                                name: t.destination,
                                color: isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)',
                                radius: 0.3
                            });
                        }
                    }
                });
            } else if (trip.coordinates) {
                // Point only for trips without transport
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
    }, [trips, isDark]);

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

    return (
        <div ref={containerRef} className={`w-full h-full overflow-hidden relative ${isDark ? 'bg-black' : 'bg-slate-50'}`}>
            <Globe
                ref={globeEl}
                width={dimensions.width}
                height={dimensions.height}
                globeImageUrl={isDark ? "//unpkg.com/three-globe/example/img/earth-night.jpg" : "//unpkg.com/three-globe/example/img/earth-day.jpg"}
                bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
                backgroundColor={isDark ? "#000000" : "#f8fafc"}
                atmosphereColor={isDark ? "#3a228a" : "#ffffff"}
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
                arcStroke={0.5}
                arcAltitudeAutoScale={0.4}
                
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
        </div>
    );
};
