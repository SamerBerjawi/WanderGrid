
import React, { useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import { Trip, Transport } from '../types';

interface ExpeditionMapProps {
    trips: Trip[];
    onTripClick?: (tripId: string) => void;
    showFrequencyWeight?: boolean;
    animateRoutes?: boolean;
}

// Leaflet default icon fix for Webpack/React env
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Helper to normalize route key for undirected graph counting (A->B same as B->A)
const getRouteKey = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    // Round to 3 decimals (~100m precision) to group nearby airports/stations
    const p1 = `${lat1.toFixed(3)},${lng1.toFixed(3)}`;
    const p2 = `${lat2.toFixed(3)},${lng2.toFixed(3)}`;
    // Sort to treat direction equally
    return p1 < p2 ? `${p1}|${p2}` : `${p2}|${p1}`;
};

// Quadratic Bezier generator with Shortest Path logic (Dateline Crossing)
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

    // Calculate midpoint
    const midLat = (lat1 + lat2) / 2;
    const midLng = (lng1 + lng2) / 2;

    const dist = Math.sqrt(Math.pow(lat2 - lat1, 2) + Math.pow(lng2 - lng1, 2));
    
    // Curvature Physics
    const curvatureDir = midLat >= 0 ? 1 : -1;

    // Offset control point latitude to create the arc
    const controlLat = midLat + (dist * 0.15 * curvatureDir);
    const controlLng = midLng;

    const points: L.LatLng[] = [];
    const steps = 100; // High resolution for smoothness
    
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        // Quadratic Bezier Formula
        const lat = (1 - t) * (1 - t) * lat1 + 2 * (1 - t) * t * controlLat + t * t * lat2;
        const lng = (1 - t) * (1 - t) * lng1 + 2 * (1 - t) * t * controlLng + t * t * lng2;
        
        points.push(L.latLng(lat, lng));
    }
    
    return points;
};

// Helper to determine styling based on status and date
const getStatusStyle = (trip: Trip) => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const endDate = new Date(trip.endDate);
    
    if (endDate < today) {
         return { color: '#3b82f6', className: 'flight-path-base flight-path-blue' }; // Blue
    }

    switch (trip.status) {
        case 'Past':
            return { color: '#3b82f6', className: 'flight-path-base flight-path-blue' }; // Blue
        case 'Upcoming':
            return { color: '#10b981', className: 'flight-path-base flight-path-green' }; // Green
        case 'Planning':
        default:
            return { color: '#ffffff', className: 'flight-path-base flight-path-white' }; // White
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

    // Pre-calculate frequencies for route weighting
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

        // Initialize Map
        const map = L.map(mapContainer.current, {
            zoomControl: false,
            attributionControl: false,
            scrollWheelZoom: true,
            worldCopyJump: true
        }).setView([20, 0], 2);

        // Dark Matter Tiles (Voyager)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
            subdomains: 'abcd',
            maxZoom: 19,
            noWrap: false 
        }).addTo(map);

        L.control.zoom({ position: 'bottomright' }).addTo(map);

        mapInstance.current = map;

        return () => {
            map.remove();
            mapInstance.current = null;
        };
    }, []);

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
            const { color, className } = getStatusStyle(trip);

            // Process Transports for Flight Paths
            if (trip.transports && trip.transports.length > 0) {
                trip.transports.forEach(t => {
                    if (t.originLat && t.originLng && t.destLat && t.destLng) {
                        const start = L.latLng(t.originLat, t.originLng);
                        const end = L.latLng(t.destLat, t.destLng);
                        
                        const curvedPath = getCurvePoints(start, end);

                        // Calculate Frequency Weight
                        const key = getRouteKey(t.originLat, t.originLng, t.destLat, t.destLng);
                        const freq = routeFrequencies.get(key) || 1;
                        
                        // Enhanced Weight Calculation
                        // If showFrequencyWeight is false, force base weight (2)
                        const dynamicWeight = showFrequencyWeight 
                            ? Math.min(14, 2 + ((freq - 1) * 1.5))
                            : 2;

                        // Animation Logic
                        const activeClassName = animateRoutes ? className : '';
                        const activeDashArray = animateRoutes 
                            ? (trip.status === 'Planning' ? '4, 8' : '6, 12')
                            : undefined;

                        // 1. Visible Neon Line (Visuals)
                        const visualLine = L.polyline(curvedPath, {
                            color: color, 
                            weight: dynamicWeight, 
                            opacity: animateRoutes ? 0.8 : 0.6,
                            dashArray: activeDashArray, 
                            className: activeClassName, 
                            interactive: false,
                            lineCap: 'round'
                        }).addTo(map);

                        // 2. Invisible Hit-Test Line (Interaction)
                        const hitLine = L.polyline(curvedPath, {
                            color: 'transparent',
                            weight: Math.max(20, dynamicWeight + 12), // Ensure hit area covers thick lines
                            opacity: 0,
                            interactive: true
                        }).addTo(map);

                        // Bind Popup to Hit Line
                        hitLine.bindPopup(`
                            <div class="p-2">
                                <div class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">${trip.status} Trip</div>
                                <div class="font-bold text-sm text-white">${t.origin} <span class="text-gray-500">→</span> ${t.destination}</div>
                                <div class="text-xs opacity-70 text-gray-300">${t.provider}</div>
                                ${freq > 1 ? `<div class="mt-2 text-[9px] font-black bg-white/10 px-2 py-1 rounded w-fit text-blue-300 uppercase tracking-wider">Route Frequency: ${freq}</div>` : ''}
                            </div>
                        `);

                        // Hover Effect (JS based to respect dynamic weight)
                        hitLine.on('mouseover', () => {
                            if (visualLine.getElement()) {
                                // Add class for Glow Filter only
                                visualLine.getElement()?.classList.add('flight-path-selected');
                                // Manually set weight thicker relative to base weight
                                visualLine.setStyle({ weight: dynamicWeight + 4, opacity: 1 });
                                visualLine.bringToFront();
                            }
                        });
                        hitLine.on('mouseout', () => {
                            if (visualLine.getElement()) {
                                visualLine.getElement()?.classList.remove('flight-path-selected');
                                // Reset weight
                                visualLine.setStyle({ weight: dynamicWeight, opacity: animateRoutes ? 0.8 : 0.6 });
                            }
                        });

                        // Origin Dot
                        L.circleMarker(start, {
                            radius: 2, 
                            fillColor: color,
                            color: 'transparent',
                            fillOpacity: 0.6
                        }).addTo(map);

                        // Destination Dot
                        const destMarker = L.circleMarker(end, {
                            radius: 4, 
                            fillColor: '#000000', 
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
                            className: 'bg-black/80 text-white border-0 text-xs font-bold px-2 py-1 rounded'
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
                    fillColor: '#000000',
                    color: color,
                    weight: 2,
                    fillOpacity: 1
                }).addTo(map)
                .bindTooltip(trip.name, { 
                    direction: 'top', 
                    className: 'bg-black/80 text-white border-0 text-xs font-bold px-2 py-1 rounded' 
                })
                .on('click', () => onTripClick && onTripClick(trip.id));

                bounds.extend(point);
                hasPoints = true;
            }
        });

        if (hasPoints) {
            map.fitBounds(bounds, { padding: [100, 100], maxZoom: 6 });
        } else {
            map.setView([20, 0], 2);
        }

    }, [trips, onTripClick, routeFrequencies, showFrequencyWeight, animateRoutes]);

    return <div ref={mapContainer} className="w-full h-full bg-black" />;
};
