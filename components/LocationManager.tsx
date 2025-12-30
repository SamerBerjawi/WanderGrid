
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

const TRANSPORT_MODES: { mode: TransportMode; label: string; icon: string; speed: number }[] = [
    { mode: 'Car Rental', label: 'Rental', icon: 'key', speed: 80 },
    { mode: 'Personal Car', label: 'My Car', icon: 'directions_car', speed: 80 },
    { mode: 'Train', label: 'Train', icon: 'train', speed: 100 },
    { mode: 'Bus', label: 'Bus', icon: 'directions_bus', speed: 60 },
    { mode: 'Flight', label: 'Flight', icon: 'flight', speed: 800 },
    { mode: 'Cruise', label: 'Ship', icon: 'directions_boat', speed: 30 },
];

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
        const anchors = transports.filter(t => 
            ['Flight', 'Train', 'Bus', 'Cruise'].includes(t.mode)
        ).sort((a,b) => new Date(a.departureDate).getTime() - new Date(b.departureDate).getTime());

        const flexibleTransportsMap = new Map<string, Transport>();
        transports.filter(t => 
            ['Car Rental', 'Personal Car'].includes(t.mode) && !t.itineraryId?.startsWith('fixed-')
        ).forEach(t => {
            flexibleTransportsMap.set(`${t.origin}|${t.destination}`, t);
        });

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

            locations.forEach((l, idx) => {
                if (l.name !== stops[0].name) {
                    stops.push(createStop({
                        id: l.id,
                        name: l.name,
                        date: l.startDate,
                        endDate: l.endDate,
                        reason: 'Overnight'
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
                        reason: 'Overnight'
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
            // If arrival matches prev departure, link it visually
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
        
        // Re-evaluate End type
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
        
        // Fix Types after move
        newRoute.forEach((s, i) => {
            if (i === 0) s.type = 'Start';
            else if (i === newRoute.length - 1) s.type = 'End';
            else s.type = 'Stop';
            
            // Fix transport links
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
        
        // Optimistic Reorder (Visual)
        const newRoute = [...route];
        const item = newRoute[draggedItemIndex];
        newRoute.splice(draggedItemIndex, 1);
        newRoute.splice(index, 0, item);
        
        setDraggedItemIndex(index);
        setRoute(newRoute);
    };

    const handleDragEnd = () => {
        setDraggedItemIndex(null);
        // Fix types logic final pass
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
        
        // If updating Departure Date, auto-sync next Arrival if linked
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
                const modeDef = TRANSPORT_MODES.find(m => m.mode === start.transportToNext?.mode) || TRANSPORT_MODES[0];
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
            description: r.reason
        })).filter(l => l.name);

        const generatedTransports: Transport[] = [];
        route.forEach((r, idx) => {
            if (r.transportToNext && !r.transportToNext.isLocked && route[idx+1]) {
                const next = route[idx+1];
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
            <div className="p-8 max-w-7xl mx-auto w-full relative space-y-0">
                
                {route.map((stop, index) => {
                    const isLast = index === route.length - 1;
                    const nextStop = route[index + 1];
                    const isFlight = stop.transportToNext?.isLocked;
                    const isLinked = stop.isDateLinked;

                    return (
                        <div 
                            key={stop.id} 
                            className="relative group mb-2"
                            draggable={!stop.isLocked}
                            onDragStart={(e) => handleDragStart(e, index)}
                            onDragOver={(e) => handleDragOver(e, index)}
                            onDragEnd={handleDragEnd}
                        >
                            {/* Connector Line (Vertical) */}
                            {!isLast && (
                                <div className="absolute left-[39px] top-14 bottom-[-8px] w-0.5 z-0 bg-gradient-to-b from-gray-200 via-gray-300 to-gray-200 dark:from-white/10 dark:via-white/20 dark:to-white/10"></div>
                            )}

                            {/* Stop Card */}
                            <div className={`relative z-10 flex gap-4 items-center bg-white dark:bg-gray-800 border rounded-2xl p-2 pr-4 transition-all ${
                                draggedItemIndex === index 
                                ? 'opacity-50 border-blue-400 border-dashed scale-95' 
                                : 'border-gray-200 dark:border-white/10 shadow-sm hover:shadow-md'
                            }`}>
                                {/* Drag Handle & Order */}
                                <div className="flex flex-col items-center justify-center gap-1 w-12 shrink-0 cursor-grab active:cursor-grabbing text-gray-300 hover:text-blue-500">
                                    {!stop.isLocked && <span className="material-icons-outlined text-lg">drag_indicator</span>}
                                    <span className="text-[10px] font-black">{index + 1}</span>
                                </div>

                                {/* Reorder Arrows (Manual) */}
                                {!stop.isLocked && (
                                    <div className="flex flex-col gap-1 -ml-2 mr-2">
                                        <button onClick={() => handleMoveStop(index, -1)} disabled={index===0} className="w-5 h-5 flex items-center justify-center rounded bg-gray-50 dark:bg-white/5 hover:bg-blue-50 text-gray-400 hover:text-blue-600 disabled:opacity-20"><span className="material-icons-outlined text-sm">keyboard_arrow_up</span></button>
                                        <button onClick={() => handleMoveStop(index, 1)} disabled={isLast} className="w-5 h-5 flex items-center justify-center rounded bg-gray-50 dark:bg-white/5 hover:bg-blue-50 text-gray-400 hover:text-blue-600 disabled:opacity-20"><span className="material-icons-outlined text-sm">keyboard_arrow_down</span></button>
                                    </div>
                                )}

                                {/* Arrival Section (Left) */}
                                <div className="w-40 border-r border-gray-100 dark:border-white/5 pr-4 flex flex-col justify-center h-full relative">
                                    {stop.type !== 'Start' && (
                                        <>
                                            <div className="flex justify-between items-center mb-1">
                                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Arrival</label>
                                                {!stop.isLocked && (
                                                    <button 
                                                        onClick={() => updateStop(index, 'isDateLinked', !stop.isDateLinked)}
                                                        className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${stop.isDateLinked ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300 text-transparent'}`}
                                                        title="Link to Previous Departure"
                                                    >
                                                        <span className="material-icons-outlined text-[10px] font-bold">link</span>
                                                    </button>
                                                )}
                                            </div>
                                            <Input 
                                                type="date" 
                                                value={stop.date} 
                                                onChange={e => updateStop(index, 'date', e.target.value)} 
                                                disabled={stop.isLocked || stop.isDateLinked}
                                                className={`!py-1.5 !text-xs !font-bold !bg-gray-50 dark:!bg-black/20 !border-transparent ${stop.isDateLinked ? 'opacity-60 cursor-not-allowed' : ''}`}
                                            />
                                        </>
                                    )}
                                </div>

                                {/* Center: Location & Reason */}
                                <div className="flex-1 flex flex-col gap-2 min-w-[200px]">
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                            {stop.isLocked ? (
                                                <div className="text-lg font-black text-gray-900 dark:text-white">{stop.name}</div>
                                            ) : (
                                                <Autocomplete 
                                                    value={stop.name}
                                                    onChange={val => updateStop(index, 'name', val)}
                                                    fetchSuggestions={fetchLocationSuggestions}
                                                    placeholder="Search Location..."
                                                    className="!bg-transparent !border-none !p-0 !text-lg !font-black !text-gray-900 dark:!text-white placeholder:text-gray-300"
                                                />
                                            )}
                                        </div>
                                        {!stop.isLocked && (
                                            <button onClick={() => handleRemoveStop(index)} className="text-gray-300 hover:text-rose-500 p-1"><span className="material-icons-outlined text-lg">close</span></button>
                                        )}
                                    </div>
                                    
                                    {/* Reason Selector */}
                                    {stop.type !== 'Start' && stop.type !== 'End' && !stop.isLocked && (
                                        <div className="flex gap-1 overflow-x-auto no-scrollbar">
                                            {(Object.keys(REASON_ICONS) as StopReason[]).map(r => (
                                                <button
                                                    key={r}
                                                    onClick={() => updateStop(index, 'reason', r)}
                                                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
                                                        stop.reason === r 
                                                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                                                        : 'bg-white dark:bg-white/5 text-gray-500 border-gray-200 dark:border-white/10 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    <span className="material-icons-outlined text-[12px]">{REASON_ICONS[r]}</span>
                                                    {r}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Departure Section (Right) */}
                                <div className="w-40 border-l border-gray-100 dark:border-white/5 pl-4 flex flex-col justify-center h-full">
                                    {stop.type !== 'End' && (
                                        <>
                                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 block">Departure</label>
                                            <Input 
                                                type="date" 
                                                value={stop.endDate || stop.date} 
                                                min={stop.date}
                                                onChange={e => updateStop(index, 'endDate', e.target.value)} 
                                                className="!py-1.5 !text-xs !font-bold !bg-gray-50 dark:!bg-black/20 !border-transparent"
                                                disabled={stop.isLocked}
                                            />
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Transport Connector (Below Card) */}
                            {!isLast && stop.transportToNext && (
                                <div className="pl-20 pr-4 py-2">
                                    {isFlight ? (
                                        <div className="flex items-center gap-3 p-2 bg-blue-50/50 dark:bg-blue-900/10 rounded-lg border border-blue-100 dark:border-blue-900/30 w-fit text-xs font-bold text-blue-800 dark:text-blue-300">
                                            <span className="material-icons-outlined text-sm">flight</span>
                                            <span>Flight: {formatDuration(stop.transportToNext.duration)}</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-4 bg-gray-50 dark:bg-white/5 p-2 rounded-xl border border-gray-200 dark:border-white/10 shadow-inner">
                                            {/* Mode Select */}
                                            <div className="flex gap-1">
                                                {TRANSPORT_MODES.map(m => (
                                                    <button
                                                        key={m.mode}
                                                        onClick={() => updateTransport(index, 'mode', m.mode)}
                                                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                                                            stop.transportToNext?.mode === m.mode 
                                                            ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-white shadow-sm ring-1 ring-black/5' 
                                                            : 'text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10'
                                                        }`}
                                                        title={m.label}
                                                    >
                                                        <span className="material-icons-outlined text-lg">{m.icon}</span>
                                                    </button>
                                                ))}
                                            </div>
                                            
                                            <div className="h-6 w-px bg-gray-300 dark:bg-white/10"></div>

                                            {/* Metrics */}
                                            <div className="flex gap-2 items-center">
                                                <div className="relative group/input">
                                                    <input 
                                                        type="number"
                                                        value={stop.transportToNext.duration}
                                                        onChange={e => updateTransport(index, 'duration', parseInt(e.target.value))}
                                                        className="w-16 pl-2 pr-1 py-1 bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-lg text-xs font-bold text-center"
                                                        placeholder="min"
                                                    />
                                                    <span className="absolute -top-3 left-0 w-full text-center text-[8px] font-black uppercase text-gray-400">Mins</span>
                                                </div>
                                                <div className="relative group/input">
                                                    <input 
                                                        type="number"
                                                        value={stop.transportToNext.distance}
                                                        onChange={e => updateTransport(index, 'distance', parseInt(e.target.value))}
                                                        className="w-16 pl-2 pr-1 py-1 bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-lg text-xs font-bold text-center"
                                                        placeholder="km"
                                                    />
                                                    <span className="absolute -top-3 left-0 w-full text-center text-[8px] font-black uppercase text-gray-400">Km</span>
                                                </div>
                                                <button 
                                                    onClick={() => handleAutoCalc(index)}
                                                    disabled={loadingCalc === index}
                                                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 transition-colors"
                                                    title="Auto Calc"
                                                >
                                                    {loadingCalc === index ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"/> : <span className="material-icons-outlined text-sm">bolt</span>}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Add Stop Button (Hover Zone) */}
                            {!isLast && (
                                <div className="absolute left-[20px] bottom-[-16px] z-20 w-10 h-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                        onClick={() => handleAddStop(index)}
                                        className="w-6 h-6 rounded-full bg-blue-500 text-white shadow-lg flex items-center justify-center hover:scale-110 transition-transform"
                                        title="Insert Stop"
                                    >
                                        <span className="material-icons-outlined text-sm">add</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}

                <div className="pt-4 flex justify-center">
                    <button 
                        onClick={() => handleAddStop(route.length - 1)}
                        className="flex items-center gap-2 px-6 py-3 rounded-full bg-gray-100 dark:bg-white/5 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-300 font-bold uppercase tracking-widest text-xs transition-all border border-dashed border-gray-300 dark:border-white/10 hover:border-blue-300"
                    >
                        <span className="material-icons-outlined text-sm">add_location_alt</span>
                        Append Destination
                    </button>
                </div>
            </div>

            <div className="fixed bottom-6 right-6 z-40 flex gap-3">
                <Button variant="ghost" onClick={onCancel} className="bg-white/80 dark:bg-gray-900/80 backdrop-blur shadow-lg border border-gray-200 dark:border-white/10">Revert</Button>
                <Button variant="primary" onClick={handleSave} className="shadow-2xl shadow-blue-500/30 !px-8">Save Optimization</Button>
            </div>
        </div>
    );
};
