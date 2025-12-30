
import React, { useState, useEffect, useMemo } from 'react';
import { Button, Input, Autocomplete, Badge } from './ui';
import { LocationEntry, Transport, TransportMode } from '../types';
import { searchLocations, getCoordinates, calculateDistance } from '../services/geocoding';

interface RouteManagerProps {
    locations: LocationEntry[];
    transports: Transport[];
    onSave: (locations: LocationEntry[], transports: Transport[]) => void;
    onCancel: () => void;
    defaultStartDate: string;
    defaultEndDate: string;
}

interface RouteStop {
    id: string;
    name: string;
    date: string;
    endDate?: string;
    type: 'Start' | 'Stop' | 'End';
    isLocked?: boolean; // Derived from fixed tickets (Flight, Train, etc)
    
    // Transport TO the NEXT stop
    transportToNext?: {
        mode: TransportMode;
        duration: number; // minutes
        distance: number; // km
        isLocked?: boolean; // Derived from fixed tickets
        refId?: string;
    };
}

const TRANSPORT_MODES: { mode: TransportMode; label: string; icon: string; speed: number }[] = [
    { mode: 'Car Rental', label: 'Rental', icon: 'key', speed: 80 },
    { mode: 'Personal Car', label: 'My Car', icon: 'directions_car', speed: 80 },
    { mode: 'Train', label: 'Train', icon: 'train', speed: 100 },
    { mode: 'Bus', label: 'Bus', icon: 'directions_bus', speed: 60 },
    { mode: 'Flight', label: 'Flight', icon: 'flight', speed: 800 },
    { mode: 'Cruise', label: 'Ship', icon: 'directions_boat', speed: 30 },
];

export const LocationManager: React.FC<RouteManagerProps> = ({ 
    locations, 
    transports, 
    onSave, 
    onCancel, 
    defaultStartDate, 
    defaultEndDate 
}) => {
    const [route, setRoute] = useState<RouteStop[]>([]);
    const [loadingCalc, setLoadingCalc] = useState<number | null>(null);

    useEffect(() => {
        initializeRoute();
    }, []);

    const initializeRoute = () => {
        // 1. Identify Anchors (Fixed Tickets) vs Flexible Connectors
        const anchors = transports.filter(t => 
            ['Flight', 'Train', 'Bus', 'Cruise'].includes(t.mode)
        ).sort((a,b) => new Date(a.departureDate).getTime() - new Date(b.departureDate).getTime());

        // 2. Build a Lookup Map for Existing Flexible Transports (to persist choices)
        // Key: "Origin|Destination" -> Transport Object
        const flexibleTransportsMap = new Map<string, Transport>();
        transports.filter(t => 
            ['Car Rental', 'Personal Car'].includes(t.mode) && !t.itineraryId?.startsWith('fixed-')
        ).forEach(t => {
            flexibleTransportsMap.set(`${t.origin}|${t.destination}`, t);
        });

        // 3. Collect Migrated Waypoints from legacy format if necessary
        const carTransportsWithWaypoints = transports.filter(t => 
            ['Car Rental', 'Personal Car'].includes(t.mode) && t.waypoints && t.waypoints.length > 0
        );

        let stops: RouteStop[] = [];

        // Helper: Create a stop object
        const createStop = (base: Partial<RouteStop>): RouteStop => ({
            id: base.id || Math.random().toString(36).substr(2, 9),
            name: base.name || '',
            date: base.date || defaultStartDate,
            endDate: base.endDate,
            type: base.type || 'Stop',
            isLocked: base.isLocked || false,
            transportToNext: base.transportToNext
        });

        if (anchors.length === 0) {
            // SCENARIO A: No Fixed Tickets (Pure Road Trip / Flexible)
            
            // Seed Start
            stops.push(createStop({
                id: 'start',
                name: locations.length > 0 ? locations[0].name : '',
                type: 'Start'
            }));

            // Add Locations
            locations.forEach(l => {
                if (l.name !== stops[0].name) {
                    stops.push(createStop({
                        id: l.id,
                        name: l.name,
                        date: l.startDate,
                        endDate: l.endDate
                    }));
                }
            });

            // Ensure End
            const lastLocation = locations[locations.length - 1];
            const lastDate = lastLocation ? lastLocation.endDate : defaultEndDate;
            
            // Only add separate end node if dates/locations distinct enough implies a final leg
            // For MVP simplicity in Road Trip, we just list the stops. The last stop is the end.
            // But if there is an explicit return trip or separate end location logic, we'd add it.
            // Here we ensure the last item is marked End.
            if (stops.length > 0) stops[stops.length - 1].type = 'End';

        } else {
            // SCENARIO B: Hybrid (Flights + Road Trip Gaps)
            
            anchors.forEach((t, idx) => {
                // Add Origin (Departure)
                stops.push(createStop({
                    id: `origin-${t.id}`,
                    name: t.origin,
                    date: t.departureDate,
                    type: idx === 0 ? 'Start' : 'Stop',
                    isLocked: true,
                    transportToNext: {
                        mode: t.mode,
                        duration: t.duration || 0,
                        distance: t.distance || 0,
                        isLocked: true,
                        refId: t.id
                    }
                }));

                // Add Destination (Arrival)
                stops.push(createStop({
                    id: `dest-${t.id}`,
                    name: t.destination,
                    date: t.arrivalDate,
                    type: 'Stop',
                    isLocked: true
                }));
            });

            // Inject User Locations into Gaps
            // This logic puts locations that don't match anchor names into the flow based on date
            // Note: This is a simplified merge sort
            const anchorPoints = new Set(stops.map(s => s.name));
            locations.forEach(l => {
                // Determine insertion index based on date
                // Rough logic: Find the first stop that starts AFTER this location, insert before it
                if (!anchorPoints.has(l.name)) {
                    // Create stop
                    const newStop = createStop({
                        id: l.id,
                        name: l.name,
                        date: l.startDate,
                        endDate: l.endDate
                    });
                    stops.push(newStop);
                }
            });

            // Re-sort by date
            stops.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            
            // Fix types
            if (stops.length > 0) stops[0].type = 'Start';
            if (stops.length > 1) stops[stops.length - 1].type = 'End';
        }

        // 4. Inject Migrated Waypoints
        if (carTransportsWithWaypoints.length > 0) {
            carTransportsWithWaypoints.forEach(car => {
                car.waypoints?.forEach((wp, i) => {
                    stops.push(createStop({
                        id: `migrated-${car.id}-${i}`,
                        name: wp.name,
                        date: car.departureDate,
                        type: 'Stop'
                    }));
                });
            });
            stops.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        }

        // 5. HYDRATE CONNECTIONS (The Fix)
        // Loop through stops and fill transportToNext for non-locked items
        for (let i = 0; i < stops.length - 1; i++) {
            const current = stops[i];
            const next = stops[i+1];

            // If it's already a locked transport (Flight etc), skip
            if (current.transportToNext && current.transportToNext.isLocked) continue;

            // Check if we have a saved choice for this segment
            const key = `${current.name}|${next.name}`;
            const existing = flexibleTransportsMap.get(key);

            if (existing) {
                current.transportToNext = {
                    mode: existing.mode,
                    duration: existing.duration || 0,
                    distance: existing.distance || 0,
                    isLocked: false
                };
            } else {
                // Default
                current.transportToNext = {
                    mode: 'Car Rental',
                    duration: 0,
                    distance: 0,
                    isLocked: false
                };
            }
        }
        
        // Remove transport from last node
        if (stops.length > 0) delete stops[stops.length - 1].transportToNext;

        setRoute(stops);
    };

    const handleAddStop = (index: number) => {
        const prev = route[index];
        
        let newDate = prev.date;
        if (prev.endDate) newDate = prev.endDate;

        const newStop: RouteStop = {
            id: Math.random().toString(36).substr(2, 9),
            name: '',
            date: newDate,
            type: 'Stop',
            transportToNext: { mode: 'Car Rental', duration: 0, distance: 0 }
        };

        const newRoute = [...route];
        newRoute.splice(index + 1, 0, newStop);
        setRoute(newRoute);
    };

    const handleRemoveStop = (index: number) => {
        const newRoute = [...route];
        newRoute.splice(index, 1);
        
        // Re-link dates if needed or adjust types
        if (index === 0 && newRoute.length > 0) newRoute[0].type = 'Start';
        if (index === route.length - 1 && newRoute.length > 0) {
            newRoute[newRoute.length - 1].type = 'End';
            delete newRoute[newRoute.length - 1].transportToNext;
        }

        setRoute(newRoute);
    };

    const updateStop = (index: number, field: keyof RouteStop, value: any) => {
        const newRoute = [...route];
        newRoute[index] = { ...newRoute[index], [field]: value };
        setRoute(newRoute);
    };

    const updateTransport = (index: number, field: string, value: any) => {
        const newRoute = [...route];
        if (newRoute[index].transportToNext) {
            newRoute[index].transportToNext = { ...newRoute[index].transportToNext!, [field]: value };
        }
        setRoute(newRoute);
    };

    const handleAutoCalc = async (index: number) => {
        const start = route[index];
        const end = route[index + 1];
        if (!start || !end || !start.transportToNext) return;

        setLoadingCalc(index);
        try {
            const c1 = await getCoordinates(start.name);
            const c2 = await getCoordinates(end.name);
            
            if (c1 && c2) {
                const dist = calculateDistance(c1.lat, c1.lng, c2.lat, c2.lng);
                const roadDist = Math.round(dist * 1.3); // Road factor
                
                const modeDef = TRANSPORT_MODES.find(m => m.mode === start.transportToNext?.mode) || TRANSPORT_MODES[0];
                const speed = modeDef.speed;
                const duration = Math.round((roadDist / speed) * 60);

                const newRoute = [...route];
                if (newRoute[index].transportToNext) {
                    newRoute[index].transportToNext = { 
                        ...newRoute[index].transportToNext!, 
                        distance: roadDist, 
                        duration 
                    };
                }
                setRoute(newRoute);
            }
        } catch (e) {
            console.error("Auto calc failed", e);
        } finally {
            setLoadingCalc(null);
        }
    };

    const handleSave = () => {
        // 1. Generate Locations
        const newLocations: LocationEntry[] = route.map(r => {
            return {
                id: r.id.startsWith('origin-') || r.id.startsWith('dest-') || r.id.startsWith('migrated-') ? Math.random().toString(36).substr(2, 9) : r.id, 
                name: r.name,
                startDate: r.date,
                endDate: r.endDate || r.date,
                description: 'Route Stop'
            };
        }).filter(l => l.name);

        // 2. Generate Transports (Only for non-locked segments)
        const generatedTransports: Transport[] = [];
        
        route.forEach((r, idx) => {
            if (r.transportToNext && !r.transportToNext.isLocked && route[idx+1]) {
                const next = route[idx+1];
                // Always save even if 0 dist/duration to persist the *Connection* and *Mode*
                if (r.name && next.name) {
                    generatedTransports.push({
                        id: Math.random().toString(36).substr(2, 9),
                        itineraryId: 'route-gen',
                        type: 'One-Way',
                        mode: r.transportToNext.mode,
                        provider: r.transportToNext.mode === 'Car Rental' ? 'Rental' : 'Private',
                        identifier: '',
                        confirmationCode: '',
                        origin: r.name,
                        destination: next.name,
                        departureDate: r.endDate || r.date,
                        departureTime: '10:00',
                        arrivalDate: next.date,
                        arrivalTime: '14:00',
                        distance: r.transportToNext.distance,
                        duration: r.transportToNext.duration,
                        cost: 0
                    });
                }
            }
        });

        onSave(newLocations, generatedTransports);
    };

    const fetchLocationSuggestions = async (query: string): Promise<string[]> => {
        return searchLocations(query);
    };

    const formatDuration = (mins: number) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${h}h ${m}m`;
    };

    const totalDistance = route.reduce((acc, curr) => acc + (curr.transportToNext?.distance || 0), 0);
    const totalTime = route.reduce((acc, curr) => acc + (curr.transportToNext?.duration || 0), 0);

    return (
        <div className="flex flex-col h-full bg-white dark:bg-gray-900 animate-fade-in pb-20">
            {/* Header Stats */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/5 backdrop-blur-md sticky top-0 z-30">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20 flex items-center justify-center text-white">
                        <span className="material-icons-outlined text-2xl">alt_route</span>
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-gray-900 dark:text-white tracking-tight leading-none">Route Optimizer</h2>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Smart Logistics Engine</p>
                    </div>
                </div>
                
                <div className="flex gap-4">
                    <div className="px-4 py-2 bg-white dark:bg-black/20 rounded-xl border border-gray-200 dark:border-white/10 flex flex-col items-center min-w-[100px]">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Dist</span>
                        <span className="text-lg font-black text-gray-900 dark:text-white">{totalDistance} <span className="text-xs text-gray-400 font-bold">km</span></span>
                    </div>
                    <div className="px-4 py-2 bg-white dark:bg-black/20 rounded-xl border border-gray-200 dark:border-white/10 flex flex-col items-center min-w-[100px]">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Travel Time</span>
                        <span className="text-lg font-black text-gray-900 dark:text-white">{Math.floor(totalTime/60)}<span className="text-xs text-gray-400 font-bold">h</span> {totalTime%60}<span className="text-xs text-gray-400 font-bold">m</span></span>
                    </div>
                </div>
            </div>

            {/* Timeline */}
            <div className="p-8 max-w-5xl mx-auto w-full relative space-y-0">
                <div className="absolute left-[27px] top-12 bottom-12 w-0.5 bg-gradient-to-b from-blue-500/0 via-gray-300 dark:via-white/10 to-blue-500/0 z-0"></div>

                {route.map((stop, index) => {
                    const isLast = index === route.length - 1;
                    const nextStop = route[index + 1];
                    const isFlight = stop.transportToNext?.isLocked;

                    return (
                        <div key={stop.id} className="relative group">
                            
                            {/* Stop Node */}
                            <div className="relative z-10 flex gap-6 items-start">
                                {/* Marker */}
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border-4 shadow-xl transition-transform duration-300 group-hover:scale-110 ${
                                    stop.isLocked 
                                    ? 'bg-blue-600 border-white dark:border-gray-900 text-white' 
                                    : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-white/10 text-gray-400 group-hover:text-blue-500'
                                }`}>
                                    <span className="font-black text-lg">{index + 1}</span>
                                </div>

                                {/* Content Card */}
                                <div className="flex-1 bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl border border-gray-200/50 dark:border-white/5 p-5 rounded-[1.5rem] shadow-sm hover:shadow-lg transition-all relative">
                                    {!stop.isLocked && (
                                        <button 
                                            onClick={() => handleRemoveStop(index)}
                                            className="absolute top-4 right-4 text-gray-300 hover:text-rose-500 transition-colors p-1"
                                        >
                                            <span className="material-icons-outlined text-lg">close</span>
                                        </button>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                                        <div className="md:col-span-6">
                                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block ml-1">{stop.type === 'Start' ? 'Origin' : stop.type === 'End' ? 'Final Destination' : 'Stopover'}</label>
                                            {stop.isLocked ? (
                                                <div className="text-xl font-black text-gray-900 dark:text-white truncate">{stop.name}</div>
                                            ) : (
                                                <Autocomplete 
                                                    value={stop.name}
                                                    onChange={val => updateStop(index, 'name', val)}
                                                    fetchSuggestions={fetchLocationSuggestions}
                                                    placeholder="Search Location..."
                                                    className="!bg-transparent !border-none !p-0 !text-xl !font-black !text-gray-900 dark:!text-white placeholder:text-gray-300"
                                                />
                                            )}
                                        </div>
                                        <div className="md:col-span-3">
                                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block ml-1">Arrival</label>
                                            <Input 
                                                type="date" 
                                                value={stop.date} 
                                                onChange={e => updateStop(index, 'date', e.target.value)} 
                                                disabled={stop.isLocked}
                                                className="!bg-gray-50/50 dark:!bg-white/5 !border-transparent !text-xs !font-bold !py-2 !rounded-xl"
                                            />
                                        </div>
                                        <div className="md:col-span-3">
                                            {(stop.type === 'Stop' || (stop.type === 'Start' && stop.endDate)) && !stop.isLocked && (
                                                <>
                                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block ml-1">Departure</label>
                                                    <Input 
                                                        type="date" 
                                                        value={stop.endDate || stop.date} 
                                                        min={stop.date}
                                                        onChange={e => updateStop(index, 'endDate', e.target.value)} 
                                                        className="!bg-gray-50/50 dark:!bg-white/5 !border-transparent !text-xs !font-bold !py-2 !rounded-xl"
                                                    />
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Transport Connector (Edge) */}
                            {!isLast && stop.transportToNext && (
                                <div className="pl-[27px] ml-[27px] py-6 relative z-0">
                                    <div className="ml-10">
                                        {isFlight ? (
                                            // Flight Locked Card
                                            <div className="flex items-center gap-4 p-3 rounded-2xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 w-fit">
                                                <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-md">
                                                    <span className="material-icons-outlined text-sm">flight</span>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] font-black uppercase text-blue-600 dark:text-blue-300 tracking-wider">Booked Flight</div>
                                                    <div className="text-xs font-bold text-gray-600 dark:text-gray-300">{formatDuration(stop.transportToNext.duration)} • {stop.transportToNext.distance} km</div>
                                                </div>
                                            </div>
                                        ) : (
                                            // Editable Transport Card
                                            <div className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-white/10 shadow-sm flex flex-col md:flex-row gap-6 items-center w-full relative">
                                                
                                                {/* Dashed Line Connector Visual */}
                                                <div className="absolute -left-[30px] top-1/2 -translate-y-1/2 w-[30px] border-t-2 border-dashed border-gray-300 dark:border-white/20"></div>

                                                {/* Mode Selector */}
                                                <div className="flex p-1 bg-gray-100 dark:bg-black/30 rounded-xl overflow-x-auto max-w-full no-scrollbar">
                                                    {TRANSPORT_MODES.map(m => {
                                                        const isActive = stop.transportToNext?.mode === m.mode;
                                                        return (
                                                            <button
                                                                key={m.mode}
                                                                onClick={() => updateTransport(index, 'mode', m.mode)}
                                                                className={`group/btn relative px-3 py-2 rounded-lg flex items-center gap-2 transition-all ${
                                                                    isActive 
                                                                    ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-white shadow-sm' 
                                                                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                                                                }`}
                                                                title={m.label}
                                                            >
                                                                <span className="material-icons-outlined text-lg">{m.icon}</span>
                                                                {isActive && <span className="text-[10px] font-black uppercase tracking-wider hidden sm:inline-block">{m.label}</span>}
                                                            </button>
                                                        )
                                                    })}
                                                </div>

                                                <div className="h-8 w-px bg-gray-200 dark:bg-white/10 hidden md:block"></div>

                                                {/* Stats Inputs */}
                                                <div className="flex gap-3 items-center">
                                                    <div className="relative group/input">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 material-icons-outlined text-gray-400 text-sm">schedule</span>
                                                        <input 
                                                            type="number"
                                                            value={stop.transportToNext.duration}
                                                            onChange={e => updateTransport(index, 'duration', parseInt(e.target.value))}
                                                            className="w-20 pl-8 pr-2 py-2 bg-gray-50 dark:bg-white/5 border border-transparent hover:border-gray-200 dark:hover:border-white/10 rounded-xl text-xs font-bold text-gray-700 dark:text-white text-center outline-none transition-all focus:bg-white dark:focus:bg-black/40 focus:ring-2 focus:ring-blue-500/20"
                                                        />
                                                        <span className="absolute -bottom-4 left-0 w-full text-[8px] text-center font-black uppercase text-gray-300 opacity-0 group-hover/input:opacity-100 transition-opacity">Mins</span>
                                                    </div>
                                                    <div className="relative group/input">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 material-icons-outlined text-gray-400 text-sm">straighten</span>
                                                        <input 
                                                            type="number"
                                                            value={stop.transportToNext.distance}
                                                            onChange={e => updateTransport(index, 'distance', parseInt(e.target.value))}
                                                            className="w-20 pl-8 pr-2 py-2 bg-gray-50 dark:bg-white/5 border border-transparent hover:border-gray-200 dark:hover:border-white/10 rounded-xl text-xs font-bold text-gray-700 dark:text-white text-center outline-none transition-all focus:bg-white dark:focus:bg-black/40 focus:ring-2 focus:ring-blue-500/20"
                                                        />
                                                        <span className="absolute -bottom-4 left-0 w-full text-[8px] text-center font-black uppercase text-gray-300 opacity-0 group-hover/input:opacity-100 transition-opacity">Km</span>
                                                    </div>
                                                    
                                                    <button 
                                                        onClick={() => handleAutoCalc(index)}
                                                        disabled={loadingCalc === index}
                                                        className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 hover:scale-105 transition-all flex items-center justify-center dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40"
                                                        title="Auto-Calculate"
                                                    >
                                                        {loadingCalc === index ? (
                                                            <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                                        ) : (
                                                            <span className="material-icons-outlined text-lg">bolt</span>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Insert Stop Button (Hover State) */}
                                    <div className="absolute left-[38px] bottom-0 w-8 h-8 -ml-4 -mb-4 z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-110">
                                        <button 
                                            onClick={() => handleAddStop(index)}
                                            className="w-full h-full rounded-full bg-white dark:bg-gray-800 border-2 border-dashed border-gray-300 hover:border-blue-500 text-gray-400 hover:text-blue-500 shadow-sm flex items-center justify-center"
                                            title="Insert Stop Here"
                                        >
                                            <span className="material-icons-outlined text-sm">add</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Add Destination Button */}
                <div className="pl-[68px] pt-4">
                    <button 
                        onClick={() => handleAddStop(route.length - 1)}
                        className="flex items-center gap-3 px-6 py-4 rounded-2xl border-2 border-dashed border-gray-200 dark:border-white/10 text-gray-400 hover:text-blue-500 hover:border-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all w-full md:w-auto"
                    >
                        <span className="material-icons-outlined text-xl">add_location_alt</span>
                        <span className="font-bold uppercase tracking-widest text-xs">Append Destination</span>
                    </button>
                </div>
            </div>

            {/* Footer */}
            <div className="fixed bottom-6 right-6 z-40 flex gap-3">
                <Button variant="ghost" onClick={onCancel} className="bg-white/80 dark:bg-gray-900/80 backdrop-blur shadow-lg border border-gray-200 dark:border-white/10">Revert</Button>
                <Button variant="primary" onClick={handleSave} className="shadow-2xl shadow-blue-500/30 !px-8">Save Optimization</Button>
            </div>
        </div>
    );
};
