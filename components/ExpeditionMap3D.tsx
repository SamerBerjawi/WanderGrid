
import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
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

// Helper to determine styling (Shared logic with 2D)
const getStatusColor = (trip: Trip) => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const endDate = new Date(trip.endDate);
    
    if (endDate < today) return '#3b82f6'; // Blue (Past)
    if (trip.status === 'Upcoming') return '#10b981'; // Green
    return '#ffffff'; // White (Planning)
};

export const ExpeditionMap3D: React.FC<ExpeditionMap3DProps> = ({ trips, onTripClick, animateRoutes = true }) => {
    const globeEl = useRef<any>();
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
    const containerRef = useRef<HTMLDivElement>(null);

    // Prepare Data
    const { arcs, points } = useMemo(() => {
        const arcList: ArcData[] = [];
        const pointMap = new Map<string, PointData>();

        trips.forEach(trip => {
            const color = getStatusColor(trip);

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
                                color: 'rgba(255,255,255,0.8)',
                                radius: 0.3
                            });
                        }
                        if (!pointMap.has(destKey)) {
                            pointMap.set(destKey, {
                                lat: t.destLat,
                                lng: t.destLng,
                                name: t.destination,
                                color: 'rgba(255,255,255,0.8)',
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
    }, [trips]);

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
        <div ref={containerRef} className="w-full h-full bg-black overflow-hidden relative">
            <Globe
                ref={globeEl}
                width={dimensions.width}
                height={dimensions.height}
                globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
                bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
                backgroundColor="#000000"
                atmosphereColor="#3a228a"
                atmosphereAltitude={0.15}
                
                // Arcs
                arcsData={arcs}
                arcStartLat="startLat"
                arcStartLng="startLng"
                arcEndLat="endLat"
                arcEndLng="endLng"
                arcColor="color"
                arcDashLength={0.4}
                arcDashGap={0.2}
                arcDashAnimateTime={animateRoutes ? 2000 : 0}
                arcStroke={1.5}
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
            
            {/* Custom Overlay Controls could go here if needed, but Globe has built-in zoom/rotate */}
            <div className="absolute bottom-6 left-6 pointer-events-none">
                <div className="text-[10px] font-mono text-gray-500 bg-black/50 px-2 py-1 rounded">
                    3D Visualization • {arcs.length} Routes
                </div>
            </div>
        </div>
    );
};
