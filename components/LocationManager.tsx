import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
    Route, 
    ArrowRight, 
    Trash2, 
    Plus, 
    MapPin, 
    Plane, 
    Train, 
    Bus,
    Navigation,
    Calendar,
    ChevronUp,
    ChevronDown,
    Link as LinkIcon,
    Link2Off,
    Check,
    Milestone,
    Leaf,
    Armchair,
    DollarSign,
    Car,
    Ship,
    Luggage,
    Eye,
    Sliders,
    Award,
    Info,
    Compass
} from 'lucide-react';
import { Button, Input, Autocomplete } from './ui';
import { LocationEntry, Transport, TransportMode, RoadTripWaypoint } from '../types';
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
    isDateLinked?: boolean; // If true, Arrival matches prev Departure
    coordinates?: { lat: number; lng: number };
    
    // Transport TO the NEXT stop
    transportToNext?: {
        id: string;
        mode: TransportMode;
        isLocked?: boolean; // true = commercial booking, false = flexible driving/unbooked
        provider: string; // operator name (e.g. Delta, Eurostar, Hertz)
        identifier: string; // flight number, train code, plate no
        confirmationCode: string;
        departureTime: string;
        arrivalTime: string;
        travelClass?: 'Economy' | 'Premium Economy' | 'Business' | 'First';
        seatNumber?: string;
        seatType?: 'Window' | 'Aisle' | 'Middle';
        isExitRow?: boolean;
        cost?: number;
        pickupLocation?: string;
        dropoffLocation?: string;
        vehicleModel?: string;
        waypoints?: RoadTripWaypoint[];
        duration?: number; // minutes
        distance?: number; // km
        logoUrl?: string; // Clearbit logo identifier
        departureTerminal?: string;
        departureGate?: string;
        arrivalTerminal?: string;
        arrivalGate?: string;
        tailNumber?: string;
    };
}

/**
 * Robust chronological sequence manager. Ensures that:
 * 1. dates never flow backwards.
 * 2. linked dates cascade automatically across subsequent timeline nodes.
 * 3. departure dates are always >= arrival dates.
 */
const cascadeRouteDates = (newRoute: RouteStop[], defaultStart: string): RouteStop[] => {
    const updated = [...newRoute];
    for (let i = 0; i < updated.length; i++) {
        const curr = { ...updated[i] };
        
        // Ensure date exists
        if (!curr.date) {
            curr.date = i > 0 ? (updated[i-1].endDate || updated[i-1].date) : defaultStart;
        }

        // If index > 0 and isDateLinked is true, copy prev check-out automatically
        if (i > 0 && curr.isDateLinked) {
            const prev = updated[i-1];
            curr.date = prev.endDate || prev.date;
        }

        // Ensure chronological monotonicity (no working backwards in time)
        if (i > 0) {
            const prev = updated[i-1];
            const minAllowedArrival = prev.endDate || prev.date;
            if (curr.date < minAllowedArrival) {
                curr.date = minAllowedArrival;
            }
        }

        // Ensure checkout is never prior to arrival
        if (!curr.endDate) {
            curr.endDate = curr.date;
        }
        if (curr.endDate < curr.date) {
            curr.endDate = curr.date;
        }

        updated[i] = curr;
    }
    return updated;
};

const TRANSPORT_CONFIG: Record<TransportMode, { label: string, icon: any, speed: number, color: string, ringColor: string }> = {
    'Flight': { label: 'Flight', icon: Plane, speed: 800, color: 'sky', ringColor: 'ring-sky-500/20' },
    'Train': { label: 'Train', icon: Train, speed: 100, color: 'amber', ringColor: 'ring-amber-500/20' },
    'Bus': { label: 'Bus', icon: Bus, speed: 60, color: 'emerald', ringColor: 'ring-emerald-500/20' },
    'Car Rental': { label: 'Rental Car', icon: Car, speed: 80, color: 'blue', ringColor: 'ring-blue-500/20' },
    'Personal Car': { label: 'My Car', icon: Navigation, speed: 80, color: 'indigo', ringColor: 'ring-indigo-500/20' },
    'Cruise': { label: 'Cruise/Ferry', icon: Ship, speed: 32, color: 'cyan', ringColor: 'ring-cyan-500/20' },
};

const getTransportColorClasses = (mode: TransportMode) => {
    switch (mode) {
        case 'Flight':
            return {
                gradient: 'from-sky-400 to-sky-600 dark:from-sky-400 dark:to-sky-600',
                border: 'border-sky-500 dark:border-sky-400',
                shadow: 'shadow-[0_0_12px_rgba(56,189,248,0.45)]',
                bg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-4 ring-sky-500/10'
            };
        case 'Train':
            return {
                gradient: 'from-amber-400 to-amber-600 dark:from-amber-400 dark:to-amber-600',
                border: 'border-amber-500 dark:border-amber-400',
                shadow: 'shadow-[0_0_12px_rgba(245,158,11,0.45)]',
                bg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-4 ring-amber-500/10'
            };
        case 'Bus':
            return {
                gradient: 'from-emerald-450 to-emerald-600 dark:from-emerald-450 dark:to-emerald-600',
                border: 'border-emerald-500 dark:border-emerald-400',
                shadow: 'shadow-[0_0_12px_rgba(16,185,129,0.45)]',
                bg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-4 ring-emerald-500/10'
            };
        case 'Car Rental':
            return {
                gradient: 'from-blue-450 to-blue-600 dark:from-blue-450 dark:to-blue-600',
                border: 'border-blue-500 dark:border-blue-400',
                shadow: 'shadow-[0_0_12px_rgba(59,130,246,0.45)]',
                bg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-4 ring-blue-500/10'
            };
        case 'Personal Car':
            return {
                gradient: 'from-indigo-400 to-indigo-600 dark:from-indigo-400 dark:to-indigo-600',
                border: 'border-indigo-500 dark:border-indigo-400',
                shadow: 'shadow-[0_0_12px_rgba(99,102,241,0.45)]',
                bg: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 ring-4 ring-indigo-500/10'
            };
        case 'Cruise':
            return {
                gradient: 'from-cyan-400 to-cyan-600 dark:from-cyan-400 dark:to-cyan-600',
                border: 'border-cyan-500 dark:border-cyan-400',
                shadow: 'shadow-[0_0_12px_rgba(6,182,212,0.45)]',
                bg: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 ring-4 ring-cyan-500/10'
            };
        default:
            return {
                gradient: 'from-zinc-400 to-zinc-500 dark:from-zinc-400 dark:to-zinc-500',
                border: 'border-zinc-400 dark:border-zinc-500',
                shadow: 'shadow-none',
                bg: 'bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 ring-4 ring-zinc-500/10'
            };
    }
};

const REASON_ICONS: Record<StopReason, string> = {
    'Stop': '📍',
    'Overnight': '🏨',
    'Sightseeing': '📸',
    'Food': '🍕',
    'Fuel': '⛽',
    'Activity': '🥾'
};

const ECO_MULTIPLIERS: Record<TransportMode, number> = {
    'Flight': 115,      // g CO2 per km
    'Train': 14,
    'Bus': 28,
    'Car Rental': 120,
    'Personal Car': 125,
    'Cruise': 150
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
    const [loadingCalc, setLoadingCalc] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedType, setSelectedType] = useState<'stop' | 'transport'>('stop');
    const [activeTab, setActiveTab] = useState<'ticket' | 'comfort' | 'route-stops'>('ticket');
    const [isSimplifiedMode, setIsSimplifiedMode] = useState(true);

    useEffect(() => {
        initializeRoute();
    }, []);

    const initializeRoute = () => {
        // Build Persistence Map of all incoming transports to restore their exact details
        const tMap = new Map<string, Transport>();
        transports.forEach(t => {
            const key = `${t.origin.trim().toLowerCase()}|${t.destination.trim().toLowerCase()}`;
            tMap.set(key, t);
        });

        // Collect all distinct places and their timelines to build a seamless timeline
        const stopsMap = new Map<string, { start: string, end: string, reason: StopReason, coordinates?: { lat: number; lng: number } }>();
        
        // Add dates & coordinates from locations
        locations.forEach(l => {
            if (l.name.trim()) {
                stopsMap.set(l.name.trim(), {
                    start: l.startDate,
                    end: l.endDate || l.startDate,
                    reason: (l.description as StopReason) || 'Overnight',
                    coordinates: l.coordinates
                });
            }
        });

        // Add dates & coordinates from transports origins / destinations
        transports.forEach(t => {
            const o = t.origin.trim();
            const d = t.destination.trim();
            if (o && !stopsMap.has(o)) {
                stopsMap.set(o, { 
                    start: t.departureDate, 
                    end: t.departureDate, 
                    reason: 'Stop',
                    coordinates: (t.originLat && t.originLng) ? { lat: t.originLat, lng: t.originLng } : undefined
                });
            }
            if (d && !stopsMap.has(d)) {
                stopsMap.set(d, { 
                    start: t.arrivalDate, 
                    end: t.arrivalDate, 
                    reason: 'Overnight',
                    coordinates: (t.destLat && t.destLng) ? { lat: t.destLat, lng: t.destLng } : undefined
                });
            }
        });

        // Chronologically index place visits
        const placeNames = Array.from(stopsMap.keys()).sort((a, b) => {
            const d1 = new Date(stopsMap.get(a)!.start).getTime();
            const d2 = new Date(stopsMap.get(b)!.start).getTime();
            return d1 - d2;
        });

        let stops: RouteStop[] = [];

        if (placeNames.length === 0) {
            // Provide a starting empty template
            stops = [
                {
                    id: 'start-node',
                    name: 'Paris',
                    date: defaultStartDate,
                    endDate: defaultStartDate,
                    type: 'Start',
                    reason: 'Stop',
                    isDateLinked: false
                },
                {
                    id: 'end-node',
                    name: 'Rome',
                    date: defaultEndDate,
                    endDate: defaultEndDate,
                    type: 'End',
                    reason: 'Overnight',
                    isDateLinked: true
                }
            ];
        } else {
            stops = placeNames.map((name, idx) => {
                const dates = stopsMap.get(name)!;
                return {
                    id: Math.random().toString(36).substr(2, 9),
                    name: name,
                    date: dates.start,
                    endDate: dates.end,
                    type: idx === 0 ? 'Start' : idx === placeNames.length - 1 ? 'End' : 'Stop',
                    reason: dates.reason,
                    isDateLinked: idx > 0,
                    coordinates: dates.coordinates
                };
            });
        }

        // Connect the steps with their transport configuration
        for (let i = 0; i < stops.length - 1; i++) {
            const current = stops[i];
            const next = stops[i+1];
            
            const key = `${current.name.trim().toLowerCase()}|${next.name.trim().toLowerCase()}`;
            const existingTx = tMap.get(key);

            if (existingTx) {
                current.transportToNext = {
                    id: existingTx.id,
                    mode: existingTx.mode,
                    isLocked: existingTx.itineraryId !== 'route-gen',
                    provider: existingTx.provider || '',
                    identifier: existingTx.identifier || '',
                    confirmationCode: existingTx.confirmationCode || '',
                    departureTime: existingTx.departureTime || '10:00',
                    arrivalTime: existingTx.arrivalTime || '14:00',
                    travelClass: existingTx.travelClass,
                    seatNumber: existingTx.seatNumber,
                    seatType: existingTx.seatType,
                    isExitRow: existingTx.isExitRow || false,
                    cost: existingTx.cost || 0,
                    pickupLocation: existingTx.pickupLocation || current.name,
                    dropoffLocation: existingTx.dropoffLocation || next.name,
                    vehicleModel: existingTx.vehicleModel,
                    waypoints: existingTx.waypoints || [],
                    duration: existingTx.duration || 0,
                    distance: existingTx.distance || 0,
                    logoUrl: existingTx.logoUrl,
                    departureTerminal: existingTx.departureTerminal,
                    departureGate: existingTx.departureGate,
                    arrivalTerminal: existingTx.arrivalTerminal,
                    arrivalGate: existingTx.arrivalGate,
                    tailNumber: existingTx.tailNumber
                };
            } else {
                current.transportToNext = {
                    id: Math.random().toString(36).substr(2, 9),
                    mode: 'Car Rental',
                    isLocked: false,
                    provider: '',
                    identifier: '',
                    confirmationCode: '',
                    departureTime: '10:00',
                    arrivalTime: '12:00',
                    cost: 0,
                    duration: 0,
                    distance: 0,
                    waypoints: []
                };
            }
        }

        // Safe setup links and cascade chronologically
        const cascaded = cascadeRouteDates(stops, defaultStartDate);

        setRoute(cascaded);
        if (cascaded.length > 0) {
            setSelectedId(cascaded[0].id);
            setSelectedType('stop');
        }
    };

    const handleAddStop = (index: number) => {
        const prev = route[index];
        const newDate = prev.endDate || prev.date;

        const newStop: RouteStop = {
            id: Math.random().toString(36).substr(2, 9),
            name: '',
            date: newDate,
            endDate: newDate,
            type: 'Stop',
            reason: 'Stop',
            isDateLinked: true,
            transportToNext: {
                id: Math.random().toString(36).substr(2, 9),
                mode: 'Car Rental',
                isLocked: false,
                provider: '',
                identifier: '',
                confirmationCode: '',
                departureTime: '10:00',
                arrivalTime: '11:00',
                cost: 0,
                duration: 0,
                distance: 0,
                waypoints: []
            }
        };

        let newRoute = [...route];
        newRoute.splice(index + 1, 0, newStop);
        
        // Normalize stops types
        newRoute.forEach((s, idx) => {
            s.type = idx === 0 ? 'Start' : idx === newRoute.length - 1 ? 'End' : 'Stop';
            if (idx === newRoute.length - 1) {
                delete s.transportToNext;
            } else if (!s.transportToNext) {
                s.transportToNext = {
                    id: Math.random().toString(36).substr(2, 9),
                    mode: 'Car Rental',
                    isLocked: false,
                    provider: '',
                    identifier: '',
                    confirmationCode: '',
                    departureTime: '10:00',
                    arrivalTime: '11:00',
                    cost: 0,
                    duration: 0,
                    distance: 0,
                    waypoints: []
                };
            }
        });

        newRoute = cascadeRouteDates(newRoute, defaultStartDate);
        setRoute(newRoute);
        setSelectedId(newStop.id);
        setSelectedType('stop');
    };

    const handleRemoveStop = (index: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (route.length <= 1) return;
        
        let newRoute = [...route];
        newRoute.splice(index, 1);
        
        newRoute.forEach((s, idx) => {
            s.type = idx === 0 ? 'Start' : idx === newRoute.length - 1 ? 'End' : 'Stop';
            if (idx === newRoute.length - 1) {
                delete s.transportToNext;
            }
        });

        newRoute = cascadeRouteDates(newRoute, defaultStartDate);
        setRoute(newRoute);
        if (newRoute.length > 0) {
            setSelectedId(newRoute[Math.max(0, index - 1)].id);
            setSelectedType('stop');
        }
    };

    const handleMoveStop = (index: number, direction: -1 | 1, e: React.MouseEvent) => {
        e.stopPropagation();
        if (index + direction < 0 || index + direction >= route.length) return;
        
        let newRoute = [...route];
        const temp = newRoute[index];
        newRoute[index] = newRoute[index + direction];
        newRoute[index + direction] = temp;
        
        newRoute.forEach((s, idx) => {
            s.type = idx === 0 ? 'Start' : idx === newRoute.length - 1 ? 'End' : 'Stop';
            if (idx === newRoute.length - 1) {
                delete s.transportToNext;
            } else if (!s.transportToNext) {
                s.transportToNext = {
                    id: Math.random().toString(36).substr(2, 9),
                    mode: 'Car Rental',
                    isLocked: false,
                    provider: '',
                    identifier: '',
                    confirmationCode: '',
                    departureTime: '10:00',
                    arrivalTime: '11:00',
                    cost: 0,
                    duration: 0,
                    distance: 0,
                    waypoints: []
                };
            }
        });

        newRoute = cascadeRouteDates(newRoute, defaultStartDate);
        setRoute(newRoute);
    };

    const updateStop = (index: number, field: keyof RouteStop, value: any) => {
        let newRoute = [...route];
        const prev = newRoute[index];
        newRoute[index] = { ...prev, [field]: value };
        
        // Trigger background geocoding so its coordinates are fully cached by the time they save
        if (field === 'name') {
            const trimmed = value?.trim();
            if (trimmed) {
                getCoordinates(trimmed).then(coords => {
                    if (coords) {
                        setRoute(currentRoute => {
                            const updated = [...currentRoute];
                            if (updated[index] && updated[index].name === value) {
                                updated[index] = { 
                                    ...updated[index], 
                                    coordinates: { lat: coords.lat, lng: coords.lng } 
                                };
                            }
                            return updated;
                        });
                    }
                });
            }
        }

        const cascaded = cascadeRouteDates(newRoute, defaultStartDate);
        setRoute(cascaded);
    };

    const updateTransport = (index: number, field: string, value: any) => {
        const newRoute = [...route];
        if (newRoute[index].transportToNext) {
            newRoute[index].transportToNext = { 
                ...newRoute[index].transportToNext!, 
                [field]: value 
            };
        }
        setRoute(newRoute);
    };

    const handleAutoCalc = async (index: number) => {
        const start = route[index];
        const end = route[index + 1];
        if (!start || !end || !start.transportToNext) return;

        setLoadingCalc(start.id);
        try {
            const c1 = await getCoordinates(start.name);
            const c2 = await getCoordinates(end.name);
            
            if (c1 && c2) {
                const dist = calculateDistance(c1.lat, c1.lng, c2.lat, c2.lng);
                const realisticDistance = Math.round(dist * 1.25); 
                const modeDef = TRANSPORT_CONFIG[start.transportToNext.mode] || TRANSPORT_CONFIG['Car Rental'];
                const estimatedTime = Math.round((realisticDistance / modeDef.speed) * 60);

                const newRoute = [...route];
                if (newRoute[index].transportToNext) {
                    newRoute[index].transportToNext = { 
                        ...newRoute[index].transportToNext!, 
                        distance: realisticDistance, 
                        duration: estimatedTime 
                    };
                }
                setRoute(newRoute);
            }
        } catch (e) { 
            console.error("Dist calc failure:", e); 
        } finally { 
            setLoadingCalc(null); 
        }
    };

    const fetchLocationSuggestions = async (query: string): Promise<string[]> => {
        return searchLocations(query);
    };

    const formatDuration = (mins: number) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    const handleSave = async () => {
        if (isSaving) return;
        setIsSaving(true);
        try {
            // Coordinate resolution utilizes the background-pre-resolved coordinates first for instant (0ms) save times.
            const stopsWithCoords = await Promise.all(route.map(async (stop) => {
                if (stop.coordinates) {
                    return stop;
                }
                const rawCoords = getCoordinatesSync(stop.name) || await getCoordinates(stop.name);
                return {
                    ...stop,
                    coordinates: rawCoords ? { lat: rawCoords.lat, lng: rawCoords.lng } : undefined
                };
            }));

            const newLocations: LocationEntry[] = stopsWithCoords.map(r => ({
                id: r.id, 
                name: r.name,
                startDate: r.date,
                endDate: r.endDate || r.date,
                description: r.reason,
                coordinates: r.coordinates
            })).filter(l => l.name);

            const finalTransports: Transport[] = [];
            
            stopsWithCoords.forEach((currentStop, idx) => {
                if (currentStop.transportToNext && stopsWithCoords[idx+1]) {
                    const nextStop = stopsWithCoords[idx+1];
                    if (currentStop.name && nextStop.name) {
                        const tx = currentStop.transportToNext;
                        const originCoords = currentStop.coordinates;
                        const destCoords = nextStop.coordinates;

                        // Automatically deduce high-precision clean logo when empty
                        let resolvedLogo = tx.logoUrl;
                        if (!resolvedLogo && tx.provider) {
                            resolvedLogo = `https://logo.clearbit.com/${tx.provider.toLowerCase().replace(/\s+/g, '')}.com`;
                        }

                        finalTransports.push({
                            id: tx.id || Math.random().toString(36).substr(2, 9),
                            itineraryId: tx.isLocked ? 'route-booked' : 'route-gen',
                            type: 'One-Way',
                            mode: tx.mode,
                            provider: tx.provider || (tx.isLocked ? 'Commercial Line' : 'Private Connection'),
                            identifier: tx.identifier || '',
                            confirmationCode: tx.confirmationCode || '',
                            origin: currentStop.name,
                            destination: nextStop.name,
                            departureDate: currentStop.endDate || currentStop.date,
                            departureTime: tx.departureTime || '10:00',
                            arrivalDate: nextStop.date,
                            arrivalTime: tx.arrivalTime || '12:00',
                            travelClass: tx.travelClass || 'Economy',
                            seatNumber: tx.seatNumber || '',
                            seatType: tx.seatType,
                            isExitRow: tx.isExitRow || false,
                            cost: Number(tx.cost) || 0,
                            pickupLocation: tx.pickupLocation || currentStop.name,
                            dropoffLocation: tx.dropoffLocation || nextStop.name,
                            vehicleModel: tx.vehicleModel || '',
                            waypoints: tx.waypoints || [],
                            duration: Number(tx.duration) || 0,
                            distance: Number(tx.distance) || 0,
                            logoUrl: resolvedLogo,
                            
                            originLat: originCoords?.lat,
                            originLng: originCoords?.lng,
                            destLat: destCoords?.lat,
                            destLng: destCoords?.lng,
                            
                            departureTerminal: tx.departureTerminal || '',
                            departureGate: tx.departureGate || '',
                            arrivalTerminal: tx.arrivalTerminal || '',
                            arrivalGate: tx.arrivalGate || '',
                            tailNumber: tx.tailNumber || ''
                        });
                    }
                }
            });

            onSave(newLocations, finalTransports);
        } catch (e) {
            console.error("Failed to save route:", e);
        } finally {
            setIsSaving(false);
        }
    };

    // Calculate aggregated stats
    const totalDistance = route.reduce((acc, curr) => acc + (curr.transportToNext?.distance || 0), 0);
    const totalMinutes = route.reduce((acc, curr) => acc + (curr.transportToNext?.duration || 0), 0);
    const totalCost = route.reduce((acc, curr) => acc + (curr.transportToNext?.cost || 0), 0);
    
    // Carbon calculations
    const co2FootprintKg = route.reduce((acc, curr) => {
        if (!curr.transportToNext) return acc;
        const dist = curr.transportToNext.distance || 0;
        const factor = ECO_MULTIPLIERS[curr.transportToNext.mode] || 100;
        return acc + ((dist * factor) / 1000);
    }, 0);

    // Active state parsing
    const activeStopIndex = route.findIndex(s => s.id === selectedId);
    const activeStop = activeStopIndex !== -1 ? route[activeStopIndex] : null;

    return (
        <div className="flex flex-col h-screen max-h-[85vh] bg-zinc-50 dark:bg-zinc-950 font-sans border border-zinc-200/60 dark:border-zinc-800 rounded-[2.5rem] overflow-hidden shadow-2xl">
            
            {/* Top Dashboard Widget / Control Bar */}
            <div className="flex flex-col lg:flex-row items-center justify-between p-6 px-8 border-b border-zinc-200/80 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/40 backdrop-blur-xl shrink-0 gap-6">
                <div className="flex items-center gap-4.5 self-start lg:self-auto">
                    <div className="w-13 h-13 rounded-[1.25rem] bg-gradient-to-tr from-purple-500 via-indigo-500 to-blue-600 shadow-xl shadow-indigo-500/10 flex items-center justify-center text-white shrink-0">
                        <Route className="w-6 h-6 stroke-[1.75]" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-zinc-900 dark:text-white leading-tight tracking-tight">Route & Transit Overlord</h2>
                        <p className="text-[10px] font-black tracking-[0.16em] text-zinc-400 uppercase mt-0.5">Consolidated Smart Logistics Deck</p>
                    </div>
                </div>

                {/* Sub-Layout Toggle Selection */}
                <div className="flex bg-zinc-100/85 dark:bg-zinc-850 p-1 rounded-2xl gap-1 shrink-0 border border-zinc-200/40 dark:border-zinc-700/60 shadow-inner select-none mx-auto lg:mx-0">
                    <button
                        type="button"
                        onClick={() => setIsSimplifiedMode(true)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                            isSimplifiedMode 
                            ? 'bg-white dark:bg-zinc-900 text-zinc-850 dark:text-white shadow-sm' 
                            : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-250'
                        }`}
                    >
                        <span className="material-icons-outlined text-sm font-bold">visibility</span>
                        <span>Simplified Mode</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsSimplifiedMode(false)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                            !isSimplifiedMode 
                            ? 'bg-[#fa9a1d] text-white shadow-md font-black' 
                            : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-250'
                        }`}
                    >
                        <span className="material-icons-outlined text-sm font-bold">explore</span>
                        <span>Advanced Mode</span>
                    </button>
                </div>

                {/* Dashboard Metrics Cards */}
                <div className="flex flex-wrap gap-4 items-center w-full lg:w-auto">
                    <div className="px-5 py-2.5 bg-white dark:bg-zinc-900 rounded-[1.15rem] border border-zinc-200/60 dark:border-zinc-800/80 flex flex-col justify-center min-w-[110px] shadow-sm">
                        <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest leading-none">Total Distance</span>
                        <span className="text-base font-black text-zinc-900 dark:text-zinc-100 mt-1.5">{totalDistance} <span className="text-xs text-zinc-400 font-medium font-mono">km</span></span>
                    </div>
                    <div className="px-5 py-2.5 bg-white dark:bg-zinc-900 rounded-[1.15rem] border border-zinc-200/60 dark:border-zinc-800/80 flex flex-col justify-center min-w-[110px] shadow-sm">
                        <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest leading-none">Total Transit</span>
                        <span className="text-base font-black text-zinc-900 dark:text-zinc-100 mt-1.5">{Math.floor(totalMinutes / 60)}h <span className="text-sm text-zinc-400 font-medium font-mono">{totalMinutes % 60}m</span></span>
                    </div>
                    <div className="px-5 py-2.5 bg-white dark:bg-zinc-900 rounded-[1.15rem] border border-zinc-200/60 dark:border-zinc-800 flex flex-col justify-center min-w-[110px] shadow-sm">
                        <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest leading-none">Budget Total</span>
                        <span className="text-base font-black text-teal-600 dark:text-teal-400 mt-1.5">${totalCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                    </div>
                    <div className="px-5 py-2.5 bg-emerald-500/5 dark:bg-emerald-500/10 rounded-[1.15rem] border border-emerald-500/20 flex flex-col justify-center min-w-[110px] shadow-sm">
                        <div className="flex items-center gap-1.5">
                            <Leaf className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest leading-none">CO₂ Score</span>
                        </div>
                        <span className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-1.5">{co2FootprintKg.toFixed(1)} <span className="text-xs text-emerald-500/70 font-bold font-mono">kg</span></span>
                    </div>
                </div>
            </div>

            {isSimplifiedMode ? (
                <div className="flex-1 overflow-y-auto p-6 md:p-8 max-w-7xl mx-auto w-full custom-scroll space-y-6">
                    <div className="space-y-4 relative font-sans">
                        <style dangerouslySetInnerHTML={{ __html: `
                            @keyframes travelSequence {
                                0% {
                                    top: 0%;
                                    opacity: 0;
                                    transform: translate(-50%, -50%) scale(0.85);
                                }
                                10% {
                                    opacity: 1;
                                    transform: translate(-50%, -50%) scale(1.15);
                                }
                                90% {
                                    opacity: 1;
                                    transform: translate(-50%, -50%) scale(1.15);
                                }
                                100% {
                                    top: 100%;
                                    opacity: 0;
                                    transform: translate(-50%, -50%) scale(0.85);
                                }
                            }
                            .animate-travel-vehicle {
                                animation: travelSequence 3.8s infinite cubic-bezier(0.4, 0, 0.2, 1);
                            }
                        `}} />

                        {route.map((stop, idx) => {
                            const isLast = idx === route.length - 1;
                            const transitMode = stop.transportToNext?.mode || 'Car Rental';
                            const colorClasses = getTransportColorClasses(transitMode);
                            
                            return (
                                <div key={stop.id} className="relative flex items-start gap-4 animate-fade-in animate-duration-300">
                                    {/* Number Circle Badge & Elegant Animated Route Line segment */}
                                    <div className="relative z-10 w-24 flex flex-col items-center shrink-0 self-stretch min-h-[140px]">
                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-sm border-2 bg-white dark:bg-zinc-900 transition-all duration-300 shadow-md ${
                                            stop.type === 'Start'
                                            ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 ring-4 ring-emerald-500/10'
                                            : stop.type === 'End'
                                            ? 'border-rose-500 text-rose-600 dark:text-rose-455 ring-4 ring-rose-500/10'
                                            : 'border-zinc-300 dark:border-zinc-700 text-zinc-650 dark:text-zinc-300 hover:border-[#fa9a1d] dark:hover:border-[#fa9a1d]'
                                        }`}>
                                            {idx + 1}
                                        </div>
                                        
                                        {!isLast && (
                                            <div className="absolute top-14 bottom-[-16px] left-1/2 -translate-x-1/2 w-1.5 pointer-events-none">
                                                {/* Glowing route segment with dynamic gradient matching transit method */}
                                                <div className={`w-full h-full bg-gradient-to-b ${colorClasses.gradient} rounded-full opacity-80 shadow-[0_0_8px_rgba(250,154,29,0.15)] transition-all duration-500`} />
                                                
                                                {/* Sparkling floating dash indicator matching transit method */}
                                                <div className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white dark:bg-zinc-900 border-2 ${colorClasses.border} rounded-full ${colorClasses.shadow} z-20 flex items-center justify-center animate-travel-vehicle transition-all duration-500`}>
                                                    <span className="text-sm select-none">
                                                        {transitMode === 'Flight' ? '✈️' :
                                                         transitMode === 'Train' ? '🚆' :
                                                         transitMode === 'Bus' ? '🚌' :
                                                         transitMode === 'Cruise' ? '🚢' : '🚗'}
                                                    </span>
                                                </div>
                                            </div>
                                        )}

                                        <span className="text-[9px] font-black text-gray-400 dark:text-gray-400 uppercase tracking-widest mt-2 text-center shrink-0">
                                            {stop.type === 'Start' ? 'Start' : stop.type === 'End' ? 'Finish' : `Stop ${idx + 1}`}
                                        </span>
                                    </div>

                                    {/* Stop Card */}
                                    <div className="flex-1 bg-white/70 dark:bg-zinc-900/60 p-5 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/80 hover:border-[#fa9a1d] dark:hover:border-[#fa9a1d] hover:shadow-lg transition-all duration-300">
                                        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-end">
                                            {/* City Search */}
                                            <div className="col-span-12 lg:col-span-3 md:col-span-12">
                                                <Autocomplete
                                                    label="City / Location"
                                                    value={stop.name}
                                                    onChange={val => updateStop(idx, 'name', val)}
                                                    fetchSuggestions={fetchLocationSuggestions}
                                                    placeholder="Search city (e.g., London)"
                                                    className="font-bold focus:border-[#fa9a1d]"
                                                />
                                            </div>

                                            {/* Arrival Date */}
                                            <div className="col-span-12 md:col-span-6 lg:col-span-2">
                                                <div className="flex justify-between items-center mr-1 mb-1">
                                                    <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide ml-1">Arrival</label>
                                                    {idx > 0 && (
                                                        <button 
                                                            type="button"
                                                            onClick={() => updateStop(idx, 'isDateLinked', !stop.isDateLinked)}
                                                            className={`text-[8px] font-black uppercase tracking-widest border transition-all cursor-pointer px-1.5 py-0.5 rounded ${
                                                                stop.isDateLinked 
                                                                ? 'bg-indigo-50/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400' 
                                                                : 'bg-white border-zinc-200 text-zinc-400 dark:bg-zinc-800'
                                                            }`}
                                                            title={stop.isDateLinked ? "Linked to previous departure" : "Manual configuration"}
                                                        >
                                                            {stop.isDateLinked ? "🔗 Match" : "Manual"}
                                                        </button>
                                                    )}
                                                </div>
                                                <Input
                                                    type="date"
                                                    value={stop.date}
                                                    onChange={e => updateStop(idx, 'date', e.target.value)}
                                                    disabled={idx > 0 && stop.isDateLinked}
                                                    className={idx > 0 && stop.isDateLinked ? 'opacity-50 cursor-not-allowed font-mono text-center' : 'font-mono text-center'}
                                                />
                                            </div>

                                            {/* Departure Date */}
                                            <div className="col-span-12 md:col-span-6 lg:col-span-2">
                                                {stop.type !== 'End' ? (
                                                    <Input
                                                        label="Departure"
                                                        type="date"
                                                        value={stop.endDate || stop.date}
                                                        min={stop.date}
                                                        onChange={e => updateStop(idx, 'endDate', e.target.value)}
                                                        className="font-mono text-center"
                                                    />
                                                ) : (
                                                    <div className="w-full flex flex-col gap-1.5">
                                                        <label className="text-xs font-bold text-transparent select-none uppercase tracking-wide">Finish</label>
                                                        <div className="w-full h-12 flex items-center justify-center text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase italic border border-dashed border-zinc-200/60 dark:border-zinc-800 rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/30">
                                                            End of Tour
                                                        </div>
                                                     </div>
                                                )}
                                            </div>

                                            {/* Transport Method to NEXT */}
                                            <div className="col-span-12 md:col-span-9 lg:col-span-3">
                                                {!isLast && stop.transportToNext ? (
                                                    <div className="flex flex-col gap-1.5 w-full">
                                                        <label className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide ml-1">Transit to Next</label>
                                                        <select
                                                            value={stop.transportToNext.mode || 'Car Rental'}
                                                            onChange={e => updateTransport(idx, 'mode', e.target.value)}
                                                            className="w-full h-12 px-4 rounded-2xl bg-zinc-50 border border-zinc-200 focus:bg-white focus:border-[#fa9a1d] focus:ring-4 focus:ring-[#fa9a1d]/15 transition-all outline-none text-zinc-800 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100 cursor-pointer text-sm font-bold animate-fade-in animate-duration-150"
                                                        >
                                                            <option value="Flight" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100">✈️ Flight</option>
                                                            <option value="Train" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100">🚆 Train</option>
                                                            <option value="Bus" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100">🚌 Bus</option>
                                                            <option value="Car Rental" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100">🚗 Rental Car</option>
                                                            <option value="Personal Car" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100">🗺️ My Car</option>
                                                            <option value="Cruise" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100">🚢 Cruise/Ferry</option>
                                                        </select>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col gap-1.5 w-full">
                                                        <label className="text-xs font-bold text-transparent select-none uppercase tracking-wide">Stop</label>
                                                        <div className="w-full h-12 flex items-center justify-center text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase border border-zinc-200/60 dark:border-zinc-800 rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/30 select-none">
                                                            Final Station
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Delete Button */}
                                            <div className="col-span-12 md:col-span-3 lg:col-span-2">
                                                <div className="w-full flex flex-col gap-1.5">
                                                    <label className="text-xs font-bold text-transparent select-none uppercase tracking-wide">Actions</label>
                                                    {route.length > 2 ? (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => handleRemoveStop(idx, e)}
                                                            className="w-full h-12 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-rose-500 dark:hover:text-rose-450 hover:bg-rose-505/10 dark:hover:bg-rose-500/10 rounded-2xl border border-zinc-200 dark:border-zinc-800 hover:border-rose-500/20 dark:hover:border-rose-500/20 transition-all cursor-pointer shadow-sm text-xs font-bold gap-1.5"
                                                            title="Delete this location"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                            <span>Remove</span>
                                                        </button>
                                                    ) : (
                                                        <div className="w-full h-12" />
                                                    )}
                                                 </div>
                                            </div>
                                        </div>

                                        {/* Minimal Transport Leg info bar */}
                                        {!isLast && stop.transportToNext && (
                                            <div className="mt-4 pt-3.5 border-t border-zinc-200/50 dark:border-zinc-800/50 flex flex-col sm:flex-row items-start sm:items-center justify-between text-[11px] font-bold text-zinc-400 dark:text-zinc-500 font-mono gap-2">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <span>🗺️ Route Distance:</span>
                                                    <span className="text-zinc-800 dark:text-zinc-300 font-extrabold">{stop.transportToNext.distance || 0} km</span>
                                                    <span className="text-zinc-300">&bull;</span>
                                                    <span>⏱️ Travel Duration:</span>
                                                    <span className="text-zinc-800 dark:text-zinc-300 font-extrabold">{formatDuration(stop.transportToNext.duration || 0)}</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleAutoCalc(idx)}
                                                    disabled={loadingCalc === stop.id}
                                                    className="text-[9px] font-black uppercase text-[#fa9a1d] hover:underline flex items-center gap-1 cursor-pointer"
                                                >
                                                    {loadingCalc === stop.id ? "Calculating..." : "⚡ Recalculate Leg distance & CO₂"}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                        {/* Append destination button */}
                        <div className="pt-4 flex justify-center pl-20 animate-fade-in">
                            <button
                                type="button"
                                onClick={() => handleAddStop(route.length - 1)}
                                className="flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 border-2 border-dashed border-zinc-200 hover:border-[#fa9a1d] dark:border-zinc-800 text-zinc-500 hover:text-[#fa9a1d] dark:text-zinc-400 font-black text-xs uppercase tracking-wider shadow-sm transition-all active:scale-[0.98] cursor-pointer"
                            >
                                <Plus className="w-4 h-4" />
                                <span>Add Next Leg</span>
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex flex-col lg:flex-row h-full min-h-0 overflow-hidden bg-zinc-50 dark:bg-zinc-950">
                    
                    {/* Left Column: Visual Operational Pipeline */}
                    <div className="w-full lg:w-[45%] h-full overflow-y-auto border-r border-zinc-200/40 dark:border-zinc-800 p-6 space-y-5 custom-scroll select-none">
                    
                    {route.map((stop, index) => {
                        const isLast = index === route.length - 1;
                        const isSelected = selectedId === stop.id && selectedType === 'stop';
                        const isTransportSelected = selectedId === stop.id && selectedType === 'transport';
                        const nextStop = route[index + 1];

                        return (
                            <div key={stop.id} className="relative">
                                
                                {/* Stop Node Card Box */}
                                <div 
                                    onClick={() => {
                                        setSelectedId(stop.id);
                                        setSelectedType('stop');
                                    }}
                                    className={`relative z-10 w-full rounded-[1.75rem] bg-white dark:bg-zinc-900 border p-5 transition-all duration-300 cursor-pointer ${
                                        isSelected 
                                        ? 'border-indigo-500 shadow-xl ring-2 ring-indigo-500/15 dark:ring-indigo-400/20' 
                                        : 'border-zinc-200/70 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700 hover:shadow-md'
                                    }`}
                                >
                                    <div className="flex gap-4.5 items-start">
                                        
                                        {/* Status Marker Box */}
                                        <div className="flex flex-col items-center shrink-0">
                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs border leading-none shrink-0 ${
                                                stop.type === 'Start' 
                                                ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400' 
                                                : stop.type === 'End' 
                                                ? 'bg-rose-500/10 border-rose-505 text-rose-600 dark:text-rose-400' 
                                                : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400'
                                            }`}>
                                                {index + 1}
                                            </div>
                                        </div>

                                        {/* Name & Dates Segment */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-base font-extrabold text-zinc-900 dark:text-zinc-100 truncate leading-tight block">
                                                    {stop.name || <em className="text-zinc-400 dark:text-zinc-500 font-medium font-sans">Unassigned Location</em>}
                                                </span>
                                                <div className="flex items-center gap-1.5 py-0.5 px-2.5 rounded-full bg-zinc-100 dark:bg-zinc-805 text-[10px] font-bold text-zinc-500 dark:text-zinc-400 border border-zinc-200/40 dark:border-zinc-700/60 shadow-sm shrink-0">
                                                    <span>{REASON_ICONS[stop.reason]}</span>
                                                    <span>{stop.reason}</span>
                                                </div>
                                            </div>

                                            {/* Stay Duration Display */}
                                            <div className="flex items-center gap-3.5 text-xs text-zinc-500 dark:text-zinc-400 font-medium mt-1.5 select-none font-mono">
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <Calendar className="w-3.5 h-3.5 text-zinc-400 hover:text-indigo-500" />
                                                    <span>{stop.date}</span>
                                                </div>
                                                {stop.endDate && stop.endDate !== stop.date && (
                                                    <div className="flex items-center gap-1 px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/15 text-[10px] font-bold text-indigo-500 dark:text-indigo-400 rounded-md border border-indigo-100/30">
                                                        <span>Stay Days: {Math.max(1, Math.round((new Date(stop.endDate).getTime() - new Date(stop.date).getTime()) / 86400000))}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Context Actions Block */}
                                        <div className="flex gap-1.5 shrink-0 ml-1">
                                            <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5 border border-zinc-200/20">
                                                <button 
                                                    onClick={(e) => handleMoveStop(index, -1, e)} 
                                                    disabled={index === 0} 
                                                    className="w-5.5 h-5.5 flex items-center justify-center rounded hover:bg-white dark:hover:bg-zinc-700 text-zinc-400 hover:text-indigo-600 disabled:opacity-20 transition-all cursor-pointer"
                                                >
                                                    <ChevronUp className="w-4 h-4" />
                                                </button>
                                                <button 
                                                    onClick={(e) => handleMoveStop(index, 1, e)} 
                                                    disabled={isLast} 
                                                    className="w-5.5 h-5.5 flex items-center justify-center rounded hover:bg-white dark:hover:bg-zinc-700 text-zinc-400 hover:text-indigo-600 disabled:opacity-20 transition-all cursor-pointer"
                                                >
                                                    <ChevronDown className="w-4 h-4" />
                                                </button>
                                            </div>
                                            {route.length > 2 && (
                                                <button 
                                                    onClick={(e) => handleRemoveStop(index, e)} 
                                                    className="w-7 h-7 flex items-center justify-center text-zinc-400 dark:text-zinc-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg transition-all cursor-pointer border border-transparent hover:border-rose-100/25"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>

                                    </div>
                                </div>

                                {/* Active Connecting Transport Bridge */}
                                {!isLast && stop.transportToNext && (
                                    <div className="relative pl-4.5 py-4 border-l-2 border-dashed border-zinc-300 dark:border-zinc-800 ml-[18px]">
                                        
                                        {/* Add Node Quick Hover Trigger */}
                                        <div className="absolute left-[-16px] top-1/2 -translate-y-1/2 z-20 group">
                                            <button 
                                                onClick={() => handleAddStop(index)}
                                                className="w-7 h-7 rounded-lg bg-white dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:border-indigo-500 hover:text-indigo-500 hover:scale-[1.12] transition-all flex items-center justify-center shadow shadow-zinc-300/10 cursor-pointer"
                                                title="Inject Middle Destination"
                                            >
                                                <Plus className="w-4 h-4 stroke-[2.2]" />
                                            </button>
                                        </div>

                                        {/* Connected Journey Card Button */}
                                        <div 
                                            onClick={() => {
                                                setSelectedId(stop.id);
                                                setSelectedType('transport');
                                                setActiveTab('ticket');
                                            }}
                                            className={`flex items-center gap-3.5 py-3.5 px-5 rounded-2xl border cursor-pointer select-none transition-all duration-300 ${
                                                isTransportSelected 
                                                ? 'border-indigo-500 bg-indigo-50/20 dark:bg-indigo-950/15 shadow' 
                                                : 'border-zinc-200/50 dark:border-zinc-800/60 bg-white/40 dark:bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-900/40 hover:border-zinc-300/60'
                                            }`}
                                        >
                                            {(() => {
                                                const tx = stop.transportToNext;
                                                const conf = TRANSPORT_CONFIG[tx.mode] || TRANSPORT_CONFIG['Car Rental'];
                                                const Icon = conf.icon;
                                                return (
                                                    <>
                                                        <div className={`w-8.5 h-8.5 rounded-xl flex items-center justify-center bg-${conf.color}-500/10 text-${conf.color}-500 border border-${conf.color}-500/20 shadow-sm shrink-0`}>
                                                            <Icon className="w-4.5 h-4.5" />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                 <span className="text-xs font-black text-zinc-900 dark:text-zinc-100">
                                                                    {conf.label}
                                                                </span>
                                                                {tx.isLocked ? (
                                                                    <span className="text-[8px] bg-indigo-100/50 dark:bg-indigo-950/40 border border-indigo-200/40 text-indigo-700 dark:text-indigo-300 font-black uppercase tracking-widest px-1.5 py-0.5 rounded">Booked Ticket</span>
                                                                ) : (
                                                                    <span className="text-[8px] bg-zinc-200/40 dark:bg-zinc-800/40 text-zinc-500 dark:text-zinc-400 font-extrabold uppercase tracking-widest px-1.5 py-0.5 rounded">Estimated Connection</span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-3.5 text-[10px] text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-wider mt-1.5 font-mono">
                                                                {tx.provider && <span className="truncate max-w-[120px]">{tx.provider}</span>}
                                                                {tx.identifier && <span>• {tx.identifier}</span>}
                                                                <span>• {formatDuration(tx.duration || 0)}</span>
                                                                <span>• {tx.distance || 0} km</span>
                                                            </div>
                                                        </div>
                                                        
                                                        {tx.cost ? (
                                                            <span className="text-xs font-black text-teal-600 dark:text-teal-400 font-mono shadow-inner py-1 px-2.5 bg-teal-500/5 rounded-lg border border-teal-500/10 shrink-0">
                                                                ${tx.cost}
                                                            </span>
                                                        ) : null}
                                                    </>
                                                );
                                            })()}
                                        </div>

                                    </div>
                                  )}

                            </div>
                        );
                    })}

                    {/* Bottom Append Card Trigger */}
                    <div className="pt-6 flex justify-center">
                        <button 
                            onClick={() => handleAddStop(route.length - 1)}
                            className="flex items-center gap-2.5 px-10 py-4 rounded-[1.65rem] bg-zinc-100 dark:bg-zinc-900 border-2 border-dashed border-zinc-300 hover:border-[#fa9a1d] dark:border-zinc-800 dark:hover:border-[#fa9a1d] text-zinc-500 hover:text-[#fa9a1d] dark:text-zinc-400 font-black text-[10px] uppercase tracking-widest leading-none shadow-sm shadow-zinc-100 dark:shadow-none hover:shadow-lg transition-all"
                        >
                            <MapPin className="w-4 h-4" />
                            Append Destination
                        </button>
                    </div>

                </div>

                {/* Right Column: High Fidelity Operational Workspace Pane */}
                <div className="flex-1 h-full overflow-y-auto bg-white dark:bg-zinc-900/60 p-8 custom-scroll">
                    
                    <AnimatePresence mode="wait">
                        
                        {activeStop && selectedType === 'stop' && (
                            <motion.div 
                                key={`stop-${activeStop.id}`}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >
                                <div className="border-b border-zinc-200/80 dark:border-zinc-800 pb-5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 flex items-center justify-center">
                                            <MapPin className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-base font-black text-zinc-900 dark:text-white leading-none">Destination Node</h3>
                                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 mt-1">Configure Geographical Stop Settings</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-5">
                                    
                                    {/* Name Input Autocomplete */}
                                    <Autocomplete 
                                        label="City Name / Address"
                                        value={activeStop.name}
                                        onChange={val => updateStop(activeStopIndex, 'name', val)}
                                        fetchSuggestions={fetchLocationSuggestions}
                                        placeholder="Type city (e.g., Paris, London, Sydney...)"
                                    />

                                    {/* Stopover Reason Pill Config */}
                                    {activeStop.type !== 'Start' && activeStop.type !== 'End' && (
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1 block">Stopover Objective</label>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 py-0.5">
                                                {(Object.keys(REASON_ICONS) as StopReason[]).map(r => (
                                                    <button
                                                        key={r}
                                                        onClick={() => updateStop(activeStopIndex, 'reason', r)}
                                                        className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all border outline-none cursor-pointer ${
                                                            activeStop.reason === r 
                                                            ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 border-zinc-900 dark:border-white shadow' 
                                                            : 'bg-zinc-50 dark:bg-zinc-900/40 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800/40'
                                                        }`}
                                                    >
                                                        <span className="text-sm">{REASON_ICONS[r]}</span>
                                                        <span>{r}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Dates Grid block with Link Logic */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-5 bg-zinc-50 dark:bg-zinc-900/30 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                                        
                                        {activeStop.type !== 'Start' && (
                                            <div className="space-y-2">
                                                <div className="flex justify-between items-center mr-1">
                                                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1 leading-none">Arrival Date</label>
                                                    <button 
                                                        onClick={() => updateStop(activeStopIndex, 'isDateLinked', !activeStop.isDateLinked)}
                                                        className={`flex items-center gap-1 py-1 px-2.5 rounded-lg text-[9px] font-extrabold uppercase tracking-widest border transition-all cursor-pointer ${
                                                            activeStop.isDateLinked 
                                                            ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400' 
                                                            : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500'
                                                        }`}
                                                        title="Automatically link with previous departure timing"
                                                    >
                                                        {activeStop.isDateLinked ? (
                                                            <>
                                                                <LinkIcon className="w-3 h-3" />
                                                                <span>Linked</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Link2Off className="w-3 h-3 text-zinc-400 dark:text-zinc-500" />
                                                                <span>Unlinked</span>
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
                                                <Input 
                                                    type="date"
                                                    value={activeStop.date}
                                                    onChange={e => updateStop(activeStopIndex, 'date', e.target.value)}
                                                    disabled={activeStop.isDateLinked}
                                                    className={activeStop.isDateLinked ? 'opacity-50 cursor-not-allowed font-mono' : 'font-mono'}
                                                />
                                            </div>
                                        )}

                                        {activeStop.type !== 'End' && (
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1 leading-none block">Departure Date</label>
                                                <Input 
                                                    type="date"
                                                    value={activeStop.endDate || activeStop.date}
                                                    min={activeStop.date}
                                                    onChange={e => updateStop(activeStopIndex, 'endDate', e.target.value)}
                                                    className="font-mono"
                                                />
                                            </div>
                                        )}

                                    </div>

                                    {/* Helpful Information Summary Box */}
                                    <div className="p-4.5 bg-indigo-500/5 rounded-2xl border border-indigo-500/15 flex gap-3 text-xs leading-relaxed text-indigo-750 dark:text-indigo-400">
                                        <Milestone className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                                        <p>
                                            {activeStop.type === 'Start' 
                                                ? 'This is the departure hub of your trip. Dates and transportation will flow out from this coordinate.' 
                                                : activeStop.type === 'End' 
                                                ? 'This represents your final target destination. No departing transportation configurations can exist here.' 
                                                : 'Intermediate waypoint. Changing stay length and check-out date will shift subsequent arrival estimates. Toggle date links to anchor dates.'
                                            }
                                        </p>
                                    </div>

                                </div>
                            </motion.div>
                        )}

                        {activeStop && selectedType === 'transport' && activeStop.transportToNext && (
                            <motion.div 
                                key={`tx-${activeStop.id}-${activeStop.transportToNext.id}`}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >
                                {/* Header Details Panel */}
                                <div className="border-b border-zinc-200/80 dark:border-zinc-800 pb-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center">
                                            <Compass className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-base font-black text-zinc-900 dark:text-white leading-none">Connection Settings</h3>
                                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 mt-1">
                                                Transit: {activeStop.name || 'Stop'} ➔ {route[activeStopIndex + 1]?.name || 'Next destination'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Booking Type Toggle Badge */}
                                    <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-xl border border-zinc-200/50 dark:border-zinc-700/60 shadow-inner">
                                        <button 
                                            onClick={() => updateTransport(activeStopIndex, 'isLocked', false)}
                                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                                                !activeStop.transportToNext.isLocked 
                                                ? 'bg-white dark:bg-zinc-700 text-zinc-800 dark:text-white shadow-sm border border-zinc-200/40 dark:border-zinc-750' 
                                                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700'
                                            }`}
                                        >
                                            Flexible Path
                                        </button>
                                        <button 
                                            onClick={() => updateTransport(activeStopIndex, 'isLocked', true)}
                                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                                                activeStop.transportToNext.isLocked 
                                                ? 'bg-white dark:bg-zinc-700 text-zinc-800 dark:text-white shadow-sm border border-zinc-200/40 dark:border-zinc-750' 
                                                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700'
                                            }`}
                                        >
                                            Booked Tickets
                                        </button>
                                    </div>
                                </div>

                                {/* Custom Sub Navigation Tabs inside editor */}
                                <div className="flex items-center border-b border-zinc-200/60 dark:border-zinc-800 gap-1 mt-2 shrink-0">
                                    <button 
                                        onClick={() => setActiveTab('ticket')}
                                        className={`px-4 py-2 text-xs font-black uppercase tracking-widest border-b-2 font-sans transition-all cursor-pointer ${
                                            activeTab === 'ticket' 
                                            ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' 
                                            : 'border-transparent text-zinc-450 hover:text-zinc-700 dark:text-zinc-500'
                                        }`}
                                    >
                                        Booking Metrics
                                    </button>
                                    {activeStop.transportToNext.isLocked && ['Flight', 'Train', 'Bus', 'Cruise'].includes(activeStop.transportToNext.mode) && (
                                        <button 
                                            onClick={() => setActiveTab('comfort')}
                                            className={`px-4 py-2 text-xs font-black uppercase tracking-widest border-b-2 font-sans transition-all cursor-pointer ${
                                                activeTab === 'comfort' 
                                                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' 
                                                : 'border-transparent text-zinc-450 hover:text-zinc-700 dark:text-zinc-500'
                                            }`}
                                        >
                                            Comfort & Seat
                                        </button>
                                    )}
                                    {['Car Rental', 'Personal Car'].includes(activeStop.transportToNext.mode) && (
                                        <button 
                                            onClick={() => setActiveTab('route-stops')}
                                            className={`px-4 py-2 text-xs font-black uppercase tracking-widest border-b-2 font-sans transition-all cursor-pointer ${
                                                activeTab === 'route-stops' 
                                                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' 
                                                : 'border-transparent text-zinc-450 hover:text-zinc-700 dark:text-zinc-500'
                                            }`}
                                        >
                                            Stops & Scenic Nodes
                                        </button>
                                    )}
                                </div>

                                <div className="space-y-6">
                                    
                                    {activeTab === 'ticket' && (
                                        <div className="space-y-5">
                                            
                                            {/* Choose Mode Layout Row */}
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1 leading-none">Transport Mode</label>
                                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 py-0.5">
                                                    {(Object.keys(TRANSPORT_CONFIG) as TransportMode[]).map(m => {
                                                        const conf = TRANSPORT_CONFIG[m];
                                                        const Icon = conf.icon;
                                                        const isModeActive = activeStop.transportToNext?.mode === m;
                                                        return (
                                                            <button
                                                                key={m}
                                                                onClick={() => {
                                                                    updateTransport(activeStopIndex, 'mode', m);
                                                                    // Default select matching logic
                                                                    if (m === 'Car Rental' || m === 'Personal Car') {
                                                                        setActiveTab('route-stops');
                                                                    } else {
                                                                        setActiveTab('ticket');
                                                                    }
                                                                }}
                                                                className={`flex items-center gap-3.5 px-4 py-3 rounded-xl text-xs font-black transition-all border outline-none cursor-pointer ${
                                                                    isModeActive
                                                                    ? `bg-zinc-900 border-zinc-900 text-white dark:bg-white dark:text-zinc-950 dark:border-white shadow`
                                                                    : `bg-zinc-50 dark:bg-zinc-900/40 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800/40`
                                                                }`}
                                                            >
                                                                <Icon className="w-4 h-4" />
                                                                <span>{conf.label}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* Cost / Financial Budget Section */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-5 bg-zinc-50 dark:bg-zinc-900/30 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1 leading-none">Travel Cost ($)</label>
                                                    <Input 
                                                        type="number" 
                                                        placeholder="Booking fare cost (e.g. 350)"
                                                        value={activeStop.transportToNext.cost || ''}
                                                        onChange={e => updateTransport(activeStopIndex, 'cost', parseFloat(e.target.value) || 0)}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1 leading-none">Confirmation reference</label>
                                                    <Input 
                                                        type="text" 
                                                        placeholder="Booking pin code (e.g. G29KXW)"
                                                        value={activeStop.transportToNext.confirmationCode || ''}
                                                        onChange={e => updateTransport(activeStopIndex, 'confirmationCode', e.target.value)}
                                                    />
                                                </div>
                                            </div>

                                            {/* Carrier / Line Info */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1 leading-none">Operator / Provider</label>
                                                    <Input 
                                                        type="text" 
                                                        placeholder="e.g. Delta Air Lines, Amtrak, Hertz"
                                                        value={activeStop.transportToNext.provider || ''}
                                                        onChange={e => updateTransport(activeStopIndex, 'provider', e.target.value)}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1 leading-none">
                                                        {activeStop.transportToNext.mode === 'Flight' ? 'Flight Number' : activeStop.transportToNext.mode === 'Train' ? 'Train Route Code' : 'Vessel / Route identifier'}
                                                    </label>
                                                    <Input 
                                                        type="text" 
                                                        placeholder="e.g. DL158, EST9104, License code"
                                                        value={activeStop.transportToNext.identifier || ''}
                                                        onChange={e => updateTransport(activeStopIndex, 'identifier', e.target.value)}
                                                    />
                                                </div>
                                            </div>

                                            {/* Times & Timings Input block */}
                                            {activeStop.transportToNext.isLocked && (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-5 bg-zinc-50 dark:bg-zinc-900/30 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1 leading-none">Departure Local Time</label>
                                                        <Input 
                                                            type="time" 
                                                            value={activeStop.transportToNext.departureTime || '10:00'}
                                                            onChange={e => updateTransport(activeStopIndex, 'departureTime', e.target.value)}
                                                            className="font-mono"
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1 leading-none">Arrival Local Time</label>
                                                        <Input 
                                                            type="time" 
                                                            value={activeStop.transportToNext.arrivalTime || '12:00'}
                                                            onChange={e => updateTransport(activeStopIndex, 'arrivalTime', e.target.value)}
                                                            className="font-mono"
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {/* Manual overrides for Distance & Durations */}
                                            <div className="p-5 bg-zinc-50 dark:bg-zinc-900/30 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-4">
                                                <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
                                                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1 mr-1">Transit Estimates (Distance & Time)</label>
                                                    
                                                    <button 
                                                        onClick={() => handleAutoCalc(activeStopIndex)}
                                                        disabled={loadingCalc === activeStop.id}
                                                        className="px-3.5 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1 shadow cursor-pointer active:scale-95 disabled:opacity-40 transition-all shrink-0"
                                                    >
                                                        {loadingCalc === activeStop.id ? (
                                                            <div className="w-3.5 h-3.5 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                                                        ) : (
                                                            <>
                                                                <span>⚡</span>
                                                                <span>Calculated Georoute</span>
                                                            </>
                                                        )}
                                                    </button>
                                                </div>

                                                <div className="grid grid-cols-2 gap-5 pt-1">
                                                    <div className="space-y-2">
                                                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 leading-none block ml-1">Distance (Km)</span>
                                                        <Input 
                                                            type="number" 
                                                            value={activeStop.transportToNext.distance || 0}
                                                            onChange={e => updateTransport(activeStopIndex, 'distance', parseInt(e.target.value) || 0)}
                                                            className="font-mono text-center"
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 leading-none block ml-1">Travel Minutes (Min)</span>
                                                        <Input 
                                                            type="number" 
                                                            value={activeStop.transportToNext.duration || 0}
                                                            onChange={e => updateTransport(activeStopIndex, 'duration', parseInt(e.target.value) || 0)}
                                                            className="font-mono text-center"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                        </div>
                                    )}

                                    {activeTab === 'comfort' && (
                                        <div className="space-y-5">
                                            
                                            {/* Travel class & comfort settings */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1 leading-none block">Cabin Class / Tier</label>
                                                    <select 
                                                        value={activeStop.transportToNext.travelClass || 'Economy'}
                                                        onChange={e => updateTransport(activeStopIndex, 'travelClass', e.target.value)}
                                                        className="w-full px-4 py-3 rounded-2xl bg-zinc-50 border border-zinc-200 text-sm font-bold outline-none text-zinc-800 dark:bg-zinc-850 dark:border-white/10 dark:text-zinc-100"
                                                    >
                                                        <option value="Economy">Economy</option>
                                                        <option value="Premium Economy">Premium Economy</option>
                                                        <option value="Business">Business Class</option>
                                                        <option value="First">First Class</option>
                                                    </select>
                                                </div>

                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1 leading-none">Seat Number / Allocation</label>
                                                    <Input 
                                                        type="text" 
                                                        placeholder="e.g. 18D, Coach 4 Seat 11"
                                                        value={activeStop.transportToNext.seatNumber || ''}
                                                        onChange={e => updateTransport(activeStopIndex, 'seatNumber', e.target.value)}
                                                        className="font-mono"
                                                    />
                                                </div>
                                            </div>

                                            {/* Seat Choice Prefs */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-5 bg-zinc-50 dark:bg-zinc-900/30 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1 leading-none block">Seat Type Preference</label>
                                                    <div className="flex bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-xl border border-zinc-200/40 border-dashed">
                                                        {(['Window', 'Aisle', 'Middle'] as const).map(seat => (
                                                            <button 
                                                                key={seat}
                                                                onClick={() => updateTransport(activeStopIndex, 'seatType', seat)}
                                                                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                                                    activeStop.transportToNext?.seatType === seat 
                                                                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' 
                                                                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800'
                                                                }`}
                                                            >
                                                                {seat}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-3.5 pt-5 ml-1">
                                                    <input 
                                                        type="checkbox" 
                                                        id="isExitRowChk"
                                                        checked={activeStop.transportToNext.isExitRow || false}
                                                        onChange={e => updateTransport(activeStopIndex, 'isExitRow', e.target.checked)}
                                                        className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                    />
                                                    <label htmlFor="isExitRowChk" className="text-xs font-bold text-zinc-600 dark:text-zinc-300 uppercase tracking-wide cursor-pointer select-none">
                                                        Emergency Exit Row Seat
                                                    </label>
                                                </div>
                                            </div>

                                            {/* Airport specific Terminal / gate details mapping */}
                                            {activeStop.transportToNext.mode === 'Flight' && (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-5 bg-zinc-50 dark:bg-zinc-900/30 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                                                    <div className="space-y-3">
                                                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block ml-1 leading-none">Departure Board Info</span>
                                                        <div className="grid grid-cols-2 gap-3">
                                                            <Input 
                                                                label="Terminal" 
                                                                placeholder="T2"
                                                                value={activeStop.transportToNext.departureTerminal || ''}
                                                                onChange={e => updateTransport(activeStopIndex, 'departureTerminal', e.target.value)}
                                                            />
                                                            <Input 
                                                                label="Gate" 
                                                                placeholder="B22"
                                                                value={activeStop.transportToNext.departureGate || ''}
                                                                onChange={e => updateTransport(activeStopIndex, 'departureGate', e.target.value)}
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="space-y-3">
                                                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block ml-1 leading-none">Arrival Airport Info</span>
                                                        <div className="grid grid-cols-2 gap-3">
                                                            <Input 
                                                                label="Terminal" 
                                                                placeholder="T3"
                                                                value={activeStop.transportToNext.arrivalTerminal || ''}
                                                                onChange={e => updateTransport(activeStopIndex, 'arrivalTerminal', e.target.value)}
                                                            />
                                                            <Input 
                                                                label="Gate" 
                                                                placeholder="A14"
                                                                value={activeStop.transportToNext.arrivalGate || ''}
                                                                onChange={e => updateTransport(activeStopIndex, 'arrivalGate', e.target.value)}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                        </div>
                                    )}

                                    {activeTab === 'route-stops' && (
                                        <div className="space-y-5">
                                            
                                            {/* Sub-Stops and Road trip Waypoints manager */}
                                            <div className="p-5 bg-zinc-50 dark:bg-zinc-900/30 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-4">
                                                <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
                                                    <div>
                                                        <h4 className="text-xs font-black text-zinc-800 dark:text-zinc-100 uppercase tracking-wider leading-none">Scenic waypoints</h4>
                                                        <p className="text-[9px] font-bold text-zinc-400 mt-1 uppercase tracking-widest leading-none">Intermediate sight spots along drive</p>
                                                    </div>
                                                    
                                                    <button 
                                                        onClick={() => {
                                                            const wpList = [...(activeStop.transportToNext?.waypoints || [])];
                                                            wpList.push({
                                                                id: Math.random().toString(36).substr(2, 9),
                                                                name: '',
                                                                type: 'Sightseeing',
                                                                notes: ''
                                                            });
                                                            updateTransport(activeStopIndex, 'waypoints', wpList);
                                                        }}
                                                        className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-850 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all outline-none"
                                                    >
                                                        <Plus className="w-3.5 h-3.5 font-bold" />
                                                        <span>Insert Stop</span>
                                                    </button>
                                                </div>

                                                {(!activeStop.transportToNext.waypoints || activeStop.transportToNext.waypoints.length === 0) ? (
                                                    <div className="text-center py-10">
                                                        <p className="text-xs italic text-zinc-400 font-medium">No waypoints established yet. Add points of interest to planning.</p>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-4">
                                                        {activeStop.transportToNext.waypoints.map((wp, wIdx) => {
                                                            return (
                                                                <div key={wp.id} className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl space-y-3 relative group">
                                                                    
                                                                    <button 
                                                                        onClick={() => {
                                                                            const wpList = [...(activeStop.transportToNext?.waypoints || [])];
                                                                            wpList.splice(wIdx, 1);
                                                                            updateTransport(activeStopIndex, 'waypoints', wpList);
                                                                        }}
                                                                        className="absolute right-3 top-3 w-6 h-6 flex items-center justify-center text-zinc-350 hover:text-rose-500 rounded hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all cursor-pointer"
                                                                    >
                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                    </button>

                                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                                        
                                                                        <Autocomplete 
                                                                            label="Waypoint Area" 
                                                                            value={wp.name}
                                                                            onChange={val => {
                                                                                const wpList = [...(activeStop.transportToNext?.waypoints || [])];
                                                                                wpList[wIdx] = { ...wpList[wIdx], name: val };
                                                                                updateTransport(activeStopIndex, 'waypoints', wpList);
                                                                            }}
                                                                            fetchSuggestions={fetchLocationSuggestions}
                                                                            placeholder="Search station or viewpoint..."
                                                                        />

                                                                        <div className="space-y-2">
                                                                            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block ml-1 leading-none">Stop category</span>
                                                                            <select 
                                                                                value={wp.type}
                                                                                onChange={e => {
                                                                                    const wpList = [...(activeStop.transportToNext?.waypoints || [])];
                                                                                    wpList[wIdx] = { ...wpList[wIdx], type: e.target.value as any };
                                                                                    updateTransport(activeStopIndex, 'waypoints', wpList);
                                                                                }}
                                                                                className="w-full px-4 py-3 rounded-2xl bg-zinc-50 border border-zinc-200 text-sm font-bold outline-none text-zinc-800 dark:bg-zinc-850 dark:border-white/10 dark:text-zinc-100"
                                                                            >
                                                                                <option value="Stop">Rest Stop</option>
                                                                                <option value="Sightseeing">Scenic Spot</option>
                                                                                <option value="Food">Restaurant</option>
                                                                                <option value="Lodging">Hotel / Motel</option>
                                                                                <option value="Fuel">Gas Station</option>
                                                                            </select>
                                                                        </div>

                                                                    </div>

                                                                    <Input 
                                                                        label="Notes / Sight Info" 
                                                                        placeholder="e.g. Scenic viewing point, refuel stop, great local coffee"
                                                                        value={wp.notes || ''}
                                                                        onChange={e => {
                                                                            const wpList = [...(activeStop.transportToNext?.waypoints || [])];
                                                                            wpList[wIdx] = { ...wpList[wIdx], notes: e.target.value };
                                                                            updateTransport(activeStopIndex, 'waypoints', wpList);
                                                                        }}
                                                                    />

                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                            </div>

                                        </div>
                                    )}

                                </div>
                            </motion.div>
                        )}

                    </AnimatePresence>

                </div>

            </div>
            )}

            {/* Sticky Dual-Pane Save Board Controls */}
            <div className="sticky bottom-0 z-40 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-xl border-t border-zinc-200/80 dark:border-zinc-800/80 p-5 px-8 shrink-0 flex items-center justify-between">
                
                {/* Visual guidelines */}
                <div className="text-zinc-400 text-xs hidden sm:flex items-center gap-2">
                    <Info className="w-4 h-4 text-indigo-500" />
                    <span>Manage coordinates and ticket nodes together. Press Save to lock trip timeline.</span>
                </div>

                <div className="flex gap-4.5 w-full sm:w-auto ml-auto">
                    <Button 
                        variant="secondary" 
                        onClick={onCancel} 
                        className="bg-white/60 dark:bg-zinc-900 dark:text-zinc-300 dark:border-white/5 border border-zinc-200/80 shadow-sm leading-none !px-6"
                    >
                        Revert Changes
                    </Button>
                    <Button 
                        variant="primary" 
                        onClick={handleSave} 
                        className="shadow-xl shadow-indigo-500/10 leading-none !px-8 text-black dark:text-zinc-950 bg-[#fa9a1d] dark:bg-[#fa9a1d] hover:bg-[#e78310] dark:hover:bg-[#e78310] text-sm font-black border-none"
                    >
                        Save Unified Route
                    </Button>
                </div>
            </div>

        </div>
    );
};
