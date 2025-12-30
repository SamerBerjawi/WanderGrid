
import React, { useState, useEffect, useRef } from 'react';
import { Button, Input, Autocomplete } from './ui';
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

type StopReason = 'Stop' | 'Overnight' | 'Sightseeing' | 'Food' | 'Fuel' | 'Activity';

interface RouteStop {
    id: string;
    name: string;
    date: string; // Arrival Date (or Start Date for Origin)
    endDate?: string; // Departure Date
    type: 'Start' | 'Stop' | 'End';
    reason: StopReason;
    isLocked?: boolean; // Derived from fixed tickets
    isDateLinked?: boolean; // If true, Arrival matches prev Departure
    
    // Transport TO the NEXT stop
    transportToNext?: {
        mode: TransportMode;
        duration: number; // minutes
        distance: number; // km
        isLocked?: boolean; 
        refId?: string;
    };
}

const TRANSPORT_CONFIG: Record<TransportMode, { label: string, icon: string, speed: number, style: string, activeStyle: string }> = {
    'Car Rental': { 
        label: 'Rental', icon: 'key', speed: 80, 
        style: 'hover:bg-blue-50 text-gray-600 hover:text-blue-700 dark:text-gray-400 dark:hover:bg-blue-900/20',
        activeStyle: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-700'
    },
    'Personal Car': { 
        label: 'My Car', icon: 'directions_car', speed: 80,
        style: 'hover:bg-indigo-50 text-gray-600 hover:text-indigo-700 dark:text-gray-400 dark:hover:bg-indigo-900/20',
        activeStyle: 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-900/40 dark:text-indigo-200 dark:border-indigo-700'
    },
    'Train': { 
        label: 'Train', icon: 'train', speed: 100,
        style: 'hover:bg-orange-50 text-gray-600 hover:text-orange-700 dark:text-gray-400 dark:hover:bg-orange-900/20',
        activeStyle: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/40 dark:text-orange-200 dark:border-orange-700'
    },
    'Bus': { 
        label: 'Bus', icon: 'directions_bus', speed: 60,
        style: 'hover:bg-teal-50 text-gray-600 hover:text-teal-700 dark:text-gray-400 dark:hover:bg-teal-900/20',
        activeStyle: 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-900/40 dark:text-teal-200 dark:border-teal-700'
    },
    'Flight': { 
        label: 'Flight', icon: 'flight', speed: 800,
        style: 'hover:bg-sky-50 text-gray-600 hover:text-sky-700 dark:text-gray-400 dark:hover:bg-sky-900/20',
        activeStyle: 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-900/40 dark:text-sky-200 dark:border-sky-700'
    },
    'Cruise': { 
        label: 'Ship', icon: 'directions_boat', speed: 30,
        style: 'hover:bg-cyan-50 text-gray-600 hover:text-cyan-700 dark:text-gray-400 dark:hover:bg-cyan-900/20',
        activeStyle: 'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-900/40 dark:text-cyan-200 dark:border-cyan-700'
    },
};

const REASON_ICONS: Record<StopReason, string> = {
    'Stop': 'place',
    'Overnight': 'hotel',
    'Sightseeing': 'photo_camera',
    'Food': 'restaurant',
    'Fuel': 'local_gas_station',
    'Activity': 'hiking'
};

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
    const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);

    useEffect(() => {
        initializeRoute();
    }, []);

    const initializeRoute = () => {
        // 1. Identify Anchors (Fixed Tickets ONLY)
        // We exclude 'route-gen' items because those are flexible preferences saved by this tool
        const anchors = transports.filter(t => 
            ['Flight', 'Train', 'Bus', 'Cruise'].includes(t.mode) && 
            t.itineraryId !== 'route-gen'
        ).sort((a,b) => new Date(a.departureDate).getTime() - new Date(b.departureDate).getTime());

        // 2. Build Persistence Map for Flexible/Gen Items
        // This includes Car Rentals AND any public transport added via this tool (route-gen)
        const flexibleTransportsMap = new Map<string, Transport>();
        transports.filter(t => 
            t.itineraryId === 'route-gen' || ['Car Rental', 'Personal Car'].includes(t.mode)
        ).forEach(t => {
            flexibleTransportsMap.set(`${t.origin.trim()}|${t.destination.trim()}`, t);
        });

        // 3. Legacy Migrations
        const carTransportsWithWaypoints = transports.filter(t => 
            ['Car Rental', 'Personal Car'].includes(t.mode) && t.waypoints && t.waypoints.length > 0
        );

        let stops: RouteStop[] = [];

        const createStop = (base: Partial<RouteStop>): RouteStop => ({
            id: base.id || Math.random().toString(36).substr(2, 9),
            name: base.name || '',
            date: base.date || defaultStartDate,
            endDate: base.endDate || base.date || defaultStartDate,
            type: base.type || 'Stop',
            reason: base.reason || 'Stop',
            isLocked: base.isLocked || false,
            isDateLinked: base.isDateLinked !== undefined ? base.isDateLinked : true,
            transportToNext: base.transportToNext
        });

        if (anchors.length === 0) {
            stops.push(createStop({
                id: 'start',
                name: locations.length > 0 ? locations[0].name : '',
                type: 'Start',
                reason: 'Stop'
            }));

            locations.forEach((l) => {
                if (l.name !== stops[0].name) {
                    stops.push(createStop({
                        id: l.id,
                        name: l.name,
                        date: l.startDate,
                        endDate: l.endDate,
                        reason: (l.description as StopReason) || 'Overnight' // FIXED: Read reason from description
                    }));
                }
            });

            if (stops.length > 0) stops[stops.length - 1].type = 'End';
        } else {
            anchors.forEach((t, idx) => {
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

                stops.push(createStop({
                    id: `dest-${t.id}`,
                    name: t.destination,
                    date: t.arrivalDate,
                    type: 'Stop',
                    isLocked: true
                }));
            });

            const anchorPoints = new Set(stops.map(s => s.name));
            locations.forEach(l => {
                if (!anchorPoints.has(l.name)) {
                    stops.push(createStop({
                        id: l.id,
                        name: l.name,
                        date: l.startDate,
                        endDate: l.endDate,
                        reason: (l.description as StopReason) || 'Overnight' // FIXED
                    }));
                }
            });

            stops.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            
            if (stops.length > 0) stops[0].type = 'Start';
            if (stops.length > 1) stops[stops.length - 1].type = 'End';
        }

        if (carTransportsWithWaypoints.length > 0) {
            carTransportsWithWaypoints.forEach(car => {
                car.waypoints?.forEach((wp, i) => {
                    stops.push(createStop({
                        id: `migrated-${car.id}-${i}`,
                        name: wp.name,
                        date: car.departureDate,
                        type: 'Stop',
                        reason: 'Sightseeing'
                    }));
                });
            });
            stops.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        }

        for (let i = 0; i < stops.length - 1; i++) {
            const current = stops[i];
            const next = stops[i+1];

            if (current.transportToNext && current.transportToNext.isLocked) continue;

            // Robust Lookup
            const key = `${current.name.trim()}|${next.name.trim()}`;
            const existing = flexibleTransportsMap.get(key);

            if (existing) {
                current.transportToNext = {
                    mode: existing.mode,
                    duration: existing.duration || 0,
                    distance: existing.distance || 0,
                    isLocked: false
                };
            } else {
                current.transportToNext = {
                    mode: 'Car Rental',
                    duration: 0,
                    distance: 0,
                    isLocked: false
                };
            }
        }
        
        if (stops.length > 0) delete stops[stops.length - 1].transportToNext;

        // Auto-link logic check
        for (let i = 1; i < stops.length; i++) {
            const prev = stops[i-1];
            const curr = stops[i];
            if (curr.date === (prev.endDate || prev.date)) {
                curr.isDateLinked = true;
            } else {
                curr.isDateLinked = false;
            }
        }

        setRoute(stops);
    };

    const handleAddStop = (index: number) => {
        const prev = route[index];
        let newDate = prev.endDate || prev.date;

        const newStop: RouteStop = {
            id: Math.random().toString(36).substr(2, 9),
            name: '',
            date: newDate,
            endDate: newDate,
            type: 'Stop',
            reason: 'Stop',
            isDateLinked: true,
            transportToNext: { mode: 'Car Rental', duration: 0, distance: 0 }
        };

        const newRoute = [...route];
        newRoute.splice(index + 1, 0, newStop);
        
        if (index === route.length - 1) {
            newRoute[index].type = 'Stop';
            if (!newRoute[index].transportToNext) {
                newRoute[index].transportToNext = { mode: 'Car Rental', duration: 0, distance: 0 };
            }
            newStop.type = 'End';
            delete newStop.transportToNext;
        }

        setRoute(newRoute);
    };

    const handleRemoveStop = (index: number) => {
        const newRoute = [...route];
        newRoute.splice(index, 1);
        
        if (newRoute.length > 0) {
            newRoute[0].type = 'Start';
            newRoute[newRoute.length - 1].type = 'End';
            delete newRoute[newRoute.length - 1].transportToNext;
        }

        setRoute(newRoute);
    };

    const handleMoveStop = (index: number, direction: -1 | 1) => {
        if (index + direction < 0 || index + direction >= route.length) return;
        const newRoute = [...route];
        const temp = newRoute[index];
        newRoute[index] = newRoute[index + direction];
        newRoute[index + direction] = temp;
        
        newRoute.forEach((s, i) => {
            if (i === 0) s.type = 'Start';
            else if (i === newRoute.length - 1) s.type = 'End';
            else s.type = 'Stop';
            
            if (i === newRoute.length - 1) delete s.transportToNext;
            else if (!s.transportToNext) s.transportToNext = { mode: 'Car Rental', duration: 0, distance: 0 };
        });

        setRoute(newRoute);
    };

    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDraggedItemIndex(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedItemIndex === null || draggedItemIndex === index) return;
        
        const newRoute = [...route];
        const item = newRoute[draggedItemIndex];
        newRoute.splice(draggedItemIndex, 1);
        newRoute.splice(index, 0, item);
        
        setDraggedItemIndex(index);
        setRoute(newRoute);
    };

    const handleDragEnd = () => {
        setDraggedItemIndex(null);
        const newRoute = [...route];
        newRoute.forEach((s, i) => {
            if (i === 0) s.type = 'Start';
            else if (i === newRoute.length - 1) {
                s.type = 'End';
                delete s.transportToNext;
            } else {
                s.type = 'Stop';
                if (!s.transportToNext) s.transportToNext = { mode: 'Car Rental', duration: 0, distance: 0 };
            }
        });
        setRoute(newRoute);
    };

    const updateStop = (index: number, field: keyof RouteStop, value: any) => {
        const newRoute = [...route];
        const prev = newRoute[index];
        newRoute[index] = { ...prev, [field]: value };
        
        if (field === 'endDate') {
            const nextIndex = index + 1;
            if (nextIndex < newRoute.length && newRoute[nextIndex].isDateLinked) {
                newRoute[nextIndex].date = value;
            }
        }

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
                const roadDist = Math.round(dist * 1.3); 
                const modeDef = TRANSPORT_CONFIG[start.transportToNext.mode] || TRANSPORT_CONFIG['Car Rental'];
                const duration = Math.round((roadDist / modeDef.speed) * 60);

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
        } catch (e) { console.error(e); } 
        finally { setLoadingCalc(null); }
    };

    const handleSave = () => {
        const newLocations: LocationEntry[] = route.map(r => ({
            id: r.id.startsWith('origin') || r.id.startsWith('dest') || r.id.startsWith('migrated') ? Math.random().toString(36).substr(2, 9) : r.id, 
            name: r.name,
            startDate: r.date,
            endDate: r.endDate || r.date,
            description: r.reason // Persist Reason here
        })).filter(l => l.name);

        const generatedTransports: Transport[] = [];
        route.forEach((r, idx) => {
            if (r.transportToNext && !r.transportToNext.isLocked && route[idx+1]) {
                const next = route[idx+1];
                if (r.name && next.name) {
                    generatedTransports.push({
                        id: Math.random().toString(36).substr(2, 9),
                        itineraryId: 'route-gen', // Tag as generated to avoid anchor locking
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
        <div className="flex flex-col h-auto min-h-full bg-white dark:bg-gray-900 animate-fade-in pb-24 relative">
            {/* Header Stats */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/5 backdrop-blur-md sticky top-0 z-30">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20 flex items-center justify-center text-white">
                        <span className="material-icons-outlined text-2xl">alt_route</span>
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-gray-900 dark:text-white tracking-tight leading-none">Route Manager</h2>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-1">Smart Logistics Engine</p>
                    </div>
                </div>
                
                <div className="flex gap-4">
                    <div className="px-4 py-2 bg-white dark:bg-black/20 rounded-xl border border-gray-200 dark:border-white/10 flex flex-col items-center min-w-[100px]">
                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Total Dist</span>
                        <span className="text-lg font-black text-gray-900 dark:text-white">{totalDistance} <span className="text-xs text-gray-400 font-bold">km</span></span>
                    </div>
                    <div className="px-4 py-2 bg-white dark:bg-black/20 rounded-xl border border-gray-200 dark:border-white/10 flex flex-col items-center min-w-[100px]">
                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Travel Time</span>
                        <span className="text-lg font-black text-gray-900 dark:text-white">{Math.floor(totalTime/60)}<span className="text-xs text-gray-400 font-bold">h</span> {totalTime%60}<span className="text-xs text-gray-400 font-bold">m</span></span>
                    </div>
                </div>
            </div>

            {/* Timeline */}
            <div className="p-8 max-w-7xl mx-auto w-full relative space-y-0">
                
                {route.map((stop, index) => {
                    const isLast = index === route.length - 1;
                    const nextStop = route[index + 1];
                    const isFlight = stop.transportToNext?.isLocked;
                    
                    return (
                        <div 
                            key={stop.id} 
                            className="relative group mb-8" // Increased margin from mb-4 to mb-8
                            draggable={!stop.isLocked}
                            onDragStart={(e) => handleDragStart(e, index)}
                            onDragOver={(e) => handleDragOver(e, index)}
                            onDragEnd={handleDragEnd}
                        >
                            {/* Connector Line (Vertical) */}
                            {!isLast && (
                                <div className="absolute left-[39px] top-14 bottom-[-32px] w-0.5 z-0 bg-gradient-to-b from-gray-200 via-gray-300 to-gray-200 dark:from-white/10 dark:via-white/20 dark:to-white/10"></div>
                            )}

                            {/* Stop Card */}
                            <div className={`relative z-10 bg-white dark:bg-gray-800 border rounded-[1.5rem] p-4 pr-6 transition-all ${
                                draggedItemIndex === index 
                                ? 'opacity-50 border-blue-400 border-dashed scale-95' 
                                : 'border-gray-200 dark:border-white/10 shadow-sm hover:shadow-lg'
                            }`}>
                                <div className="flex gap-4 items-start">
                                    {/* Drag Handle & Order */}
                                    <div className="flex flex-col items-center justify-start gap-1 w-12 shrink-0 pt-2 cursor-grab active:cursor-grabbing text-gray-300 hover:text-blue-500">
                                        {!stop.isLocked && <span className="material-icons-outlined text-lg">drag_indicator</span>}
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs border-2 ${stop.type === 'Start' ? 'border-emerald-500 text-emerald-500' : stop.type === 'End' ? 'border-rose-500 text-rose-500' : 'border-gray-300 text-gray-400 dark:border-gray-600'}`}>
                                            {index + 1}
                                        </div>
                                    </div>

                                    {/* Main Content Area */}
                                    <div className="flex-1 space-y-4">
                                        {/* Row 1: Location & Controls */}
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                {stop.isLocked ? (
                                                    <div className="text-xl font-black text-gray-900 dark:text-white">{stop.name}</div>
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
                                            <div className="flex gap-2">
                                                {!stop.isLocked && (
                                                    <>
                                                        <div className="flex bg-gray-100 dark:bg-white/5 rounded-lg p-0.5">
                                                            <button onClick={() => handleMoveStop(index, -1)} disabled={index===0} className="w-6 h-6 flex items-center justify-center rounded hover:bg-white dark:hover:bg-gray-700 text-gray-400 hover:text-blue-600 disabled:opacity-20 transition-all"><span className="material-icons-outlined text-sm">keyboard_arrow_up</span></button>
                                                            <button onClick={() => handleMoveStop(index, 1)} disabled={isLast} className="w-6 h-6 flex items-center justify-center rounded hover:bg-white dark:hover:bg-gray-700 text-gray-400 hover:text-blue-600 disabled:opacity-20 transition-all"><span className="material-icons-outlined text-sm">keyboard_arrow_down</span></button>
                                                        </div>
                                                        <button onClick={() => handleRemoveStop(index)} className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"><span className="material-icons-outlined text-lg">close</span></button>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* Row 2: Dates */}
                                        <div className="flex gap-6 items-center bg-gray-50 dark:bg-white/5 p-3 rounded-xl border border-gray-100 dark:border-white/5">
                                            {stop.type !== 'Start' && (
                                                <div className="flex-1">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Arrival</label>
                                                        {!stop.isLocked && (
                                                            <button 
                                                                onClick={() => updateStop(index, 'isDateLinked', !stop.isDateLinked)}
                                                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border transition-all ${stop.isDateLinked ? 'bg-blue-100 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-400'}`}
                                                                title="Link to Previous Departure"
                                                            >
                                                                <span className="material-icons-outlined text-[10px]">link</span> {stop.isDateLinked ? 'Linked' : 'Unlinked'}
                                                            </button>
                                                        )}
                                                    </div>
                                                    <Input 
                                                        type="date" 
                                                        value={stop.date} 
                                                        onChange={e => updateStop(index, 'date', e.target.value)} 
                                                        disabled={stop.isLocked || stop.isDateLinked}
                                                        className={`!py-1.5 !text-xs !font-bold !bg-white dark:!bg-black/20 !border-gray-200 dark:!border-white/10 ${stop.isDateLinked ? 'opacity-60 cursor-not-allowed' : ''}`}
                                                    />
                                                </div>
                                            )}
                                            
                                            {stop.type !== 'Start' && stop.type !== 'End' && (
                                                <div className="w-px h-8 bg-gray-200 dark:bg-white/10" />
                                            )}

                                            {stop.type !== 'End' && (
                                                <div className="flex-1">
                                                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1 block">Departure</label>
                                                    <Input 
                                                        type="date" 
                                                        value={stop.endDate || stop.date} 
                                                        min={stop.date}
                                                        onChange={e => updateStop(index, 'endDate', e.target.value)} 
                                                        className="!py-1.5 !text-xs !font-bold !bg-white dark:!bg-black/20 !border-gray-200 dark:!border-white/10"
                                                        disabled={stop.isLocked}
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        {/* Row 3: Purpose Pills */}
                                        {stop.type !== 'Start' && stop.type !== 'End' && !stop.isLocked && (
                                            <div>
                                                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2 block">Stopover Reason</label>
                                                <div className="flex flex-wrap gap-2">
                                                    {(Object.keys(REASON_ICONS) as StopReason[]).map(r => (
                                                        <button
                                                            key={r}
                                                            onClick={() => updateStop(index, 'reason', r)}
                                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
                                                                stop.reason === r 
                                                                ? 'bg-gray-800 text-white border-gray-800 dark:bg-white dark:text-gray-900 dark:border-white shadow-md' 
                                                                : 'bg-white dark:bg-white/5 text-gray-500 border-gray-200 dark:border-white/10 hover:bg-gray-50'
                                                            }`}
                                                        >
                                                            <span className="material-icons-outlined text-sm">{REASON_ICONS[r]}</span>
                                                            {r}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Row 4: Transport to Next (Inside Card) */}
                                        {!isLast && stop.transportToNext && (
                                            <div className="mt-6 pt-4 border-t border-gray-100 dark:border-white/5">
                                                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-3 block flex items-center gap-2">
                                                    <span className="material-icons-outlined text-sm">arrow_downward</span>
                                                    Journey to {nextStop?.name || 'Next Destination'}
                                                </label>
                                                
                                                {isFlight ? (
                                                    <div className="flex items-center gap-3 p-3 bg-sky-50 dark:bg-sky-900/10 rounded-xl border border-sky-100 dark:border-sky-900/30 text-sky-800 dark:text-sky-300">
                                                        <span className="material-icons-outlined">flight</span>
                                                        <div className="text-xs font-bold">
                                                            Booked Flight • {formatDuration(stop.transportToNext.duration)} • {stop.transportToNext.distance} km
                                                        </div>
                                                        <div className="ml-auto px-2 py-0.5 bg-sky-200 dark:bg-sky-800 text-[9px] font-black uppercase rounded text-sky-800 dark:text-sky-200">Fixed</div>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col xl:flex-row gap-4">
                                                        {/* Transport Pills */}
                                                        <div className="flex flex-wrap gap-2">
                                                            {(Object.keys(TRANSPORT_CONFIG) as TransportMode[]).map(m => {
                                                                const conf = TRANSPORT_CONFIG[m];
                                                                const isActive = stop.transportToNext?.mode === m;
                                                                return (
                                                                    <button
                                                                        key={m}
                                                                        onClick={() => updateTransport(index, 'mode', m)}
                                                                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all ${
                                                                            isActive 
                                                                            ? `${conf.activeStyle} shadow-sm` 
                                                                            : `bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 ${conf.style}`
                                                                        }`}
                                                                    >
                                                                        <span className="material-icons-outlined text-sm">{conf.icon}</span>
                                                                        {conf.label}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>

                                                        {/* Stats Inputs - No Overlap Design */}
                                                        <div className="flex gap-2 items-center xl:ml-auto bg-gray-50 dark:bg-white/5 p-1 rounded-xl border border-gray-100 dark:border-white/10">
                                                            <div className="flex items-center bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-lg px-2 overflow-hidden">
                                                                <input 
                                                                    type="number"
                                                                    value={stop.transportToNext.duration}
                                                                    onChange={e => updateTransport(index, 'duration', parseInt(e.target.value))}
                                                                    className="w-14 py-1.5 bg-transparent border-none text-xs font-bold text-center outline-none"
                                                                    placeholder="0"
                                                                />
                                                                <span className="text-[10px] font-bold text-gray-400 uppercase border-l border-gray-100 dark:border-white/10 pl-2">Min</span>
                                                            </div>
                                                            <div className="flex items-center bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-lg px-2 overflow-hidden">
                                                                <input 
                                                                    type="number"
                                                                    value={stop.transportToNext.distance}
                                                                    onChange={e => updateTransport(index, 'distance', parseInt(e.target.value))}
                                                                    className="w-14 py-1.5 bg-transparent border-none text-xs font-bold text-center outline-none"
                                                                    placeholder="0"
                                                                />
                                                                <span className="text-[10px] font-bold text-gray-400 uppercase border-l border-gray-100 dark:border-white/10 pl-2">Km</span>
                                                            </div>
                                                            <button 
                                                                onClick={() => handleAutoCalc(index)}
                                                                disabled={loadingCalc === index}
                                                                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white dark:bg-white/10 border border-gray-200 dark:border-white/10 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20 transition-all shadow-sm"
                                                                title="Auto Calc"
                                                            >
                                                                {loadingCalc === index ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"/> : <span className="material-icons-outlined text-sm">bolt</span>}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Add Stop Button (Hover Zone) */}
                            {!isLast && (
                                <div className="absolute left-[24px] bottom-[-36px] z-20 w-8 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                        onClick={() => handleAddStop(index)}
                                        className="w-6 h-6 rounded-full bg-white dark:bg-gray-700 border-2 border-dashed border-gray-300 dark:border-gray-500 text-gray-400 hover:border-blue-500 hover:text-blue-500 hover:scale-110 transition-all flex items-center justify-center shadow-sm"
                                        title="Insert Stop"
                                    >
                                        <span className="material-icons-outlined text-xs">add</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}

                <div className="pt-6 flex justify-center">
                    <button 
                        onClick={() => handleAddStop(route.length - 1)}
                        className="flex items-center gap-2 px-8 py-4 rounded-2xl bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-300 font-bold uppercase tracking-widest text-xs transition-all border-2 border-dashed border-gray-200 dark:border-white/10 hover:border-blue-300 shadow-sm hover:shadow-md"
                    >
                        <span className="material-icons-outlined text-lg">add_location_alt</span>
                        Append Destination
                    </button>
                </div>
            </div>

            {/* Sticky Footer */}
            <div className="sticky bottom-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-t border-gray-100 dark:border-white/10 p-4">
                <div className="max-w-7xl mx-auto flex justify-end gap-3">
                    <Button variant="ghost" onClick={onCancel} className="bg-white/50 border border-gray-200 dark:border-white/10 shadow-sm">Revert Changes</Button>
                    <Button variant="primary" onClick={handleSave} className="shadow-xl shadow-blue-500/20 !px-8">Save Route</Button>
                </div>
            </div>
        </div>
    );
};
