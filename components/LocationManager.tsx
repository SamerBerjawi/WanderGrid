import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
    Plane, 
    Train, 
    Bus, 
    Navigation, 
    Calendar, 
    Trash2, 
    Plus, 
    MapPin, 
    ArrowUp, 
    ArrowDown, 
    ChevronDown, 
    ChevronUp, 
    DollarSign, 
    Award, 
    Compass,
    Settings,
    Shield,
    Info,
    Check,
    CloudDrizzle
} from 'lucide-react';
import { Button, Input, Autocomplete, Select, Card } from './ui';
import { LocationEntry, Transport, TransportMode, RoadTripWaypoint, GeoCoordinates } from '../types';
import { searchLocations, getCoordinates, getCoordinatesSync, calculateDistance } from '../services/geocoding';

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
    date: string;
    endDate?: string;
    type: 'Start' | 'Stop' | 'End';
    reason: StopReason;
    coordinates?: { lat: number; lng: number };
    
    // Transport TO the NEXT stop
    transportToNext?: {
        id: string;
        mode: TransportMode;
        isLocked?: boolean;
        provider: string;
        identifier: string;
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
        logoUrl?: string;
        departureTerminal?: string;
        departureGate?: string;
        arrivalTerminal?: string;
        arrivalGate?: string;
        tailNumber?: string;
    };
}

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

const TRANSPORT_DETAILS: Record<TransportMode, { label: string; icon: any; colorText: string; colorBg: string; speed: number }> = {
    'Flight': { label: 'Flight Connecting', icon: Plane, colorText: 'text-sky-600 dark:text-sky-450', colorBg: 'bg-sky-50 dark:bg-sky-950/40', speed: 800 },
    'Train': { label: 'Express Railway', icon: Train, colorText: 'text-amber-600 dark:text-amber-400', colorBg: 'bg-amber-50 dark:bg-amber-950/40', speed: 120 },
    'Bus': { label: 'Coach Connection', icon: Bus, colorText: 'text-emerald-600 dark:text-emerald-400', colorBg: 'bg-emerald-50 dark:bg-emerald-950/40', speed: 70 },
    'Car Rental': { label: 'Private Car Rental', icon: Navigation, colorText: 'text-blue-600 dark:text-blue-400', colorBg: 'bg-blue-50 dark:bg-blue-950/40', speed: 90 },
    'Personal Car': { label: 'Road Trip Drive', icon: Navigation, colorText: 'text-indigo-600 dark:text-indigo-400', colorBg: 'bg-indigo-50 dark:bg-indigo-950/40', speed: 95 },
    'Cruise': { label: 'Ferry/Cruise Voyage', icon: Compass, colorText: 'text-cyan-600 dark:text-cyan-400', colorBg: 'bg-cyan-50 dark:bg-cyan-950/40', speed: 30 }
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
    const [isSaving, setIsSaving] = useState(false);
    const [expandedTransportId, setExpandedTransportId] = useState<string | null>(null);
    const geoUpdateTimersRef = useRef<{ [key: number]: any }>({});

    // Cleanup timers on unmount
    useEffect(() => {
        return () => {
            const timers = geoUpdateTimersRef.current;
            Object.values(timers).forEach(clearTimeout);
        };
    }, []);

    // Initial state population
    useEffect(() => {
        initializeRoute();
    }, [locations, transports]);

    const initializeRoute = () => {
        if (!locations || locations.length === 0) {
            // Setup minimum empty template
            setRoute([
                {
                    id: 'start-node',
                    name: 'Paris',
                    date: defaultStartDate,
                    endDate: defaultStartDate,
                    type: 'Start',
                    reason: 'Overnight',
                    coordinates: getCoordinatesSync('Paris') || { lat: 48.8566, lng: 2.3522 },
                    transportToNext: createDefaultTransport('Paris', 'Rome')
                },
                {
                    id: 'end-node',
                    name: 'Rome',
                    date: defaultEndDate,
                    endDate: defaultEndDate,
                    type: 'End',
                    reason: 'Overnight',
                    coordinates: getCoordinatesSync('Rome') || { lat: 41.9028, lng: 12.4964 }
                }
            ]);
            return;
        }

        // Sort incoming stops chronologically
        const sortedLocations = [...locations].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
        
        const mappedStops: RouteStop[] = sortedLocations.map((loc, idx) => {
            const stopType = idx === 0 ? 'Start' : idx === sortedLocations.length - 1 ? 'End' : 'Stop';
            const stop: RouteStop = {
                id: loc.id || Math.random().toString(36).substring(2, 11),
                name: loc.name,
                date: loc.startDate || defaultStartDate,
                endDate: loc.endDate || loc.startDate || defaultStartDate,
                type: stopType,
                reason: (loc.description as StopReason) || 'Overnight',
                coordinates: loc.coordinates
            };
            return stop;
        });

        // Link with matching transport elements
        for (let i = 0; i < mappedStops.length - 1; i++) {
            const current = mappedStops[i];
            const next = mappedStops[i + 1];
            
            // Find matched transport from origin to destination
            const matchedTx = transports.find(t => 
                t.origin.toLowerCase().trim() === current.name.toLowerCase().trim() && 
                t.destination.toLowerCase().trim() === next.name.toLowerCase().trim()
            );

            if (matchedTx) {
                current.transportToNext = {
                    id: matchedTx.id,
                    mode: matchedTx.mode || 'Flight',
                    isLocked: matchedTx.itineraryId !== 'route-gen',
                    provider: matchedTx.provider || '',
                    identifier: matchedTx.identifier || '',
                    confirmationCode: matchedTx.confirmationCode || '',
                    departureTime: matchedTx.departureTime || '10:00',
                    arrivalTime: matchedTx.arrivalTime || '12:00',
                    travelClass: matchedTx.travelClass || 'Economy',
                    seatNumber: matchedTx.seatNumber || '',
                    seatType: matchedTx.seatType,
                    isExitRow: matchedTx.isExitRow || false,
                    cost: matchedTx.cost ?? 0,
                    pickupLocation: matchedTx.pickupLocation || current.name,
                    dropoffLocation: matchedTx.dropoffLocation || next.name,
                    vehicleModel: matchedTx.vehicleModel || '',
                    waypoints: matchedTx.waypoints || [],
                    duration: matchedTx.duration || 120,
                    distance: matchedTx.distance || 0,
                    logoUrl: matchedTx.logoUrl,
                    departureTerminal: matchedTx.departureTerminal || '',
                    departureGate: matchedTx.departureGate || '',
                    arrivalTerminal: matchedTx.arrivalTerminal || '',
                    arrivalGate: matchedTx.arrivalGate || '',
                    tailNumber: matchedTx.tailNumber || ''
                };
            } else {
                current.transportToNext = createDefaultTransport(current.name, next.name);
            }
        }

        setRoute(mappedStops);
    };

    const createDefaultTransport = (origin: string, dest: string): RouteStop['transportToNext'] => {
        // Build coordinates calculation
        const oCoords = getCoordinatesSync(origin);
        const dCoords = getCoordinatesSync(dest);
        let dist = 350;
        if (oCoords && dCoords) {
            dist = calculateDistance(oCoords.lat, oCoords.lng, dCoords.lat, dCoords.lng);
        }

        return {
            id: 'tx-' + Math.random().toString(36).substring(2, 11),
            mode: dist > 700 ? 'Flight' : 'Train',
            isLocked: false,
            provider: '',
            identifier: '',
            confirmationCode: '',
            departureTime: '10:00',
            arrivalTime: '12:00',
            travelClass: 'Economy',
            cost: 0,
            duration: Math.round((dist / 100) * 60) || 120,
            distance: dist
        };
    };

    // Keep chronological integrity
    const enforceChronology = (updatedStops: RouteStop[]): RouteStop[] => {
        const result = [...updatedStops];
        for (let i = 0; i < result.length; i++) {
            // Parse and format dates
            if (i > 0) {
                const prev = result[i - 1];
                const prevDep = prev.endDate || prev.date;
                if (new Date(result[i].date) < new Date(prevDep)) {
                    result[i].date = prevDep;
                }
            }
            if (result[i].endDate && new Date(result[i].endDate!) < new Date(result[i].date)) {
                result[i].endDate = result[i].date;
            }
        }
        return result;
    };

    const handleStopNameChange = async (index: number, newName: string) => {
        // 1. Synchronously update the name so characters typed are not lost or reverted
        setRoute(prevRoute => {
            const updated = [...prevRoute];
            if (updated[index]) {
                updated[index] = { ...updated[index], name: newName };
            }
            return updated;
        });
        
        // 2. Clear coordinates first if they have cleared the text
        if (!newName.trim()) {
            setRoute(prevRoute => {
                const updated = [...prevRoute];
                if (updated[index]) {
                    updated[index].coordinates = undefined;
                }
                return updated;
            });
            return;
        }

        // 3. Clear existing debounce timer for this field to prevent intermediate re-renders/overlap during fast typing
        if (geoUpdateTimersRef.current[index]) {
            clearTimeout(geoUpdateTimersRef.current[index]);
        }

        // 4. Set a fresh 600ms debounce timer to let the user finish writing without interrupting their typing focus
        geoUpdateTimersRef.current[index] = setTimeout(async () => {
            const coords = getCoordinatesSync(newName);
            if (coords) {
                setRoute(prevRoute => {
                    const updated = [...prevRoute];
                    if (updated[index] && updated[index].name === newName) {
                        updated[index].coordinates = { lat: coords.lat, lng: coords.lng };
                        
                        // Recalculate distance to adjacent nodes
                        if (index > 0 && updated[index - 1].transportToNext) {
                            const prevStop = updated[index - 1];
                            if (prevStop.coordinates) {
                                const dist = calculateDistance(prevStop.coordinates.lat, prevStop.coordinates.lng, coords.lat, coords.lng);
                                const tx = { ...prevStop.transportToNext! };
                                tx.distance = dist;
                                tx.duration = Math.round((dist / TRANSPORT_DETAILS[tx.mode].speed) * 60) || 120;
                                updated[index - 1] = { ...prevStop, transportToNext: tx };
                            }
                        }
                        if (index < updated.length - 1 && updated[index].transportToNext) {
                            const nextStop = updated[index + 1];
                            const nextCoords = nextStop.coordinates || getCoordinatesSync(nextStop.name);
                            if (nextCoords) {
                                const dist = calculateDistance(coords.lat, coords.lng, nextCoords.lat, nextCoords.lng);
                                const tx = { ...updated[index].transportToNext! };
                                tx.distance = dist;
                                tx.duration = Math.round((dist / TRANSPORT_DETAILS[tx.mode].speed) * 60) || 120;
                                updated[index] = { ...updated[index], transportToNext: tx };
                            }
                        }
                    }
                    return updated;
                });
            } else {
                try {
                    const asyncCoords = await getCoordinates(newName);
                    if (asyncCoords) {
                        setRoute(prevRoute => {
                            const updated = [...prevRoute];
                            // Verify the input has not changed since the async request was launched
                            if (updated[index] && updated[index].name === newName) {
                                updated[index].coordinates = { lat: asyncCoords.lat, lng: asyncCoords.lng };
                                
                                // Recalculate distance to adjacent nodes
                                if (index > 0 && updated[index - 1].transportToNext) {
                                    const prevStop = updated[index - 1];
                                    if (prevStop.coordinates) {
                                        const dist = calculateDistance(prevStop.coordinates.lat, prevStop.coordinates.lng, asyncCoords.lat, asyncCoords.lng);
                                        const tx = { ...prevStop.transportToNext! };
                                        tx.distance = dist;
                                        tx.duration = Math.round((dist / TRANSPORT_DETAILS[tx.mode].speed) * 60) || 120;
                                        updated[index - 1] = { ...prevStop, transportToNext: tx };
                                    }
                                }
                                if (index < updated.length - 1 && updated[index].transportToNext) {
                                    const nextStop = updated[index + 1];
                                    const nextCoords = nextStop.coordinates || getCoordinatesSync(nextStop.name);
                                    if (nextCoords) {
                                        const dist = calculateDistance(asyncCoords.lat, asyncCoords.lng, nextCoords.lat, nextCoords.lng);
                                        const tx = { ...updated[index].transportToNext! };
                                        tx.distance = dist;
                                        tx.duration = Math.round((dist / TRANSPORT_DETAILS[tx.mode].speed) * 60) || 120;
                                        updated[index] = { ...updated[index], transportToNext: tx };
                                    }
                                }
                            }
                            return updated;
                        });
                    }
                } catch (err) {
                    console.error("Failed to fetch coordinates asynchronously:", err);
                }
            }
        }, 600);
    };

    const handleStopDateChange = (index: number, field: 'date' | 'endDate', val: string) => {
        const updated = [...route];
        updated[index] = { ...updated[index], [field]: val };
        setRoute(enforceChronology(updated));
    };

    const handleReasonChange = (index: number, newReason: StopReason) => {
        const updated = [...route];
        updated[index] = { ...updated[index], reason: newReason };
        setRoute(updated);
    };

    const handleTransportChange = (stopIndex: number, field: string, val: any) => {
        const updated = [...route];
        const stop = { ...updated[stopIndex] };
        if (stop.transportToNext) {
            const nextTx = { ...stop.transportToNext, [field]: val };
            
            // If mode changes, recalculate recommended duration
            if (field === 'mode') {
                const dist = nextTx.distance || 300;
                nextTx.duration = Math.round((dist / TRANSPORT_DETAILS[nextTx.mode as TransportMode].speed) * 60) || 120;
            }

            stop.transportToNext = nextTx;
            updated[stopIndex] = stop;
            setRoute(updated);
        }
    };

    const addStopNode = (afterIndex: number) => {
        const updated = [...route];
        const prevNode = updated[afterIndex];
        const insertionDate = prevNode.endDate || prevNode.date;

        const newId = Math.random().toString(36).substring(2, 11);
        const newStop: RouteStop = {
            id: newId,
            name: `${prevNode.name} Region`,
            date: insertionDate,
            endDate: insertionDate,
            type: 'Stop',
            reason: 'Sightseeing',
            coordinates: prevNode.coordinates ? { ...prevNode.coordinates } : undefined,
            transportToNext: createDefaultTransport(`${prevNode.name} Region`, updated[afterIndex + 1]?.name || 'Destination')
        };

        // Reroute preceding transport end point safely
        if (prevNode.transportToNext) {
            prevNode.transportToNext.destination = newStop.name;
        }

        updated.splice(afterIndex + 1, 0, newStop);
        
        // Re-assign types sequence
        const fixed = updated.map((s, idx) => {
            return {
                ...s,
                type: idx === 0 ? 'Start' : idx === updated.length - 1 ? 'End' : 'Stop'
            } as RouteStop;
        });

        setRoute(enforceChronology(fixed));
        setExpandedTransportId(newStop.transportToNext?.id || null);
    };

    const deleteStopNode = (index: number) => {
        if (route.length <= 2) return; // Must have at least start & end
        
        const updated = [...route];
        const deletedNode = updated[index];
        
        // Remap preceding transport link if existed
        if (index > 0 && updated[index - 1]) {
            const prev = updated[index - 1];
            const nextNode = updated[index + 1];
            if (prev.transportToNext && nextNode) {
                prev.transportToNext.destination = nextNode.name;
                // recalculate distance
                const oCoord = prev.coordinates;
                const dCoord = nextNode.coordinates;
                if (oCoord && dCoord) {
                    const dist = calculateDistance(oCoord.lat, oCoord.lng, dCoord.lat, dCoord.lng);
                    prev.transportToNext.distance = dist;
                    prev.transportToNext.duration = Math.round((dist / TRANSPORT_DETAILS[prev.transportToNext.mode].speed) * 60) || 120;
                }
            }
        }

        updated.splice(index, 1);

        const fixed = updated.map((s, idx) => {
            return {
                ...s,
                type: idx === 0 ? 'Start' : idx === updated.length - 1 ? 'End' : 'Stop'
            } as RouteStop;
        });

        setRoute(enforceChronology(fixed));
    };

    const moveStopNode = (index: number, direction: 'up' | 'down') => {
        if (index === 0 && direction === 'up') return;
        if (index === route.length - 1 && direction === 'down') return;
        
        const targetIdx = direction === 'up' ? index - 1 : index + 1;
        const updated = [...route];
        const temp = updated[index];
        updated[index] = updated[targetIdx];
        updated[targetIdx] = temp;

        // Reconnect transports origin & destination names sequentially
        const fixed = updated.map((s, idx) => {
            const node = {
                ...s,
                type: idx === 0 ? 'Start' : idx === updated.length - 1 ? 'End' : 'Stop'
            } as RouteStop;
            return node;
        });

        // Re-link consecutive stops
        for (let i = 0; i < fixed.length - 1; i++) {
            const curr = fixed[i];
            const nextNode = fixed[i + 1];
            if (curr.transportToNext) {
                curr.transportToNext.pickupLocation = curr.name;
                curr.transportToNext.dropoffLocation = nextNode.name;
            } else {
                curr.transportToNext = createDefaultTransport(curr.name, nextNode.name);
            }
        }

        setRoute(enforceChronology(fixed));
    };

    const triggerSaveRoute = async () => {
        setIsSaving(true);
        try {
            // Pre-resolve all coordinates synchronously or fall back asynchronously
            const stopsWithCoords = await Promise.all(route.map(async (stop) => {
                if (stop.coordinates) return stop;
                const solved = getCoordinatesSync(stop.name) || await getCoordinates(stop.name);
                return {
                    ...stop,
                    coordinates: solved ? { lat: solved.lat, lng: solved.lng } : undefined
                };
            }));

            const finalLocations: LocationEntry[] = stopsWithCoords.map(s => ({
                id: s.id,
                name: s.name,
                startDate: s.date,
                endDate: s.endDate || s.date,
                description: s.reason,
                coordinates: s.coordinates
            })).filter(l => l.name.trim() !== '');

            const finalTransports: Transport[] = [];
            stopsWithCoords.forEach((current, idx) => {
                const next = stopsWithCoords[idx + 1];
                if (current.transportToNext && next) {
                    const tx = current.transportToNext;
                    const originCoords = current.coordinates;
                    const destCoords = next.coordinates;

                    let resolvedLogoUrl = tx.logoUrl;
                    if (!resolvedLogoUrl && tx.provider) {
                        resolvedLogoUrl = `https://logo.clearbit.com/${tx.provider.toLowerCase().replace(/\s+/g, '')}.com`;
                    }

                    finalTransports.push({
                        id: tx.id || 'tx-' + Math.random().toString(36).substring(2, 11),
                        itineraryId: tx.isLocked ? 'route-booked' : 'route-gen',
                        type: 'One-Way',
                        mode: tx.mode,
                        provider: tx.provider || (tx.isLocked ? 'Commercial Line' : 'Flexible Driving'),
                        identifier: tx.identifier || '',
                        confirmationCode: tx.confirmationCode || '',
                        origin: current.name,
                        destination: next.name,
                        departureDate: current.endDate || current.date,
                        departureTime: tx.departureTime || '10:00',
                        arrivalDate: next.date,
                        arrivalTime: tx.arrivalTime || '12:00',
                        travelClass: tx.travelClass || 'Economy',
                        seatNumber: tx.seatNumber || '',
                        seatType: tx.seatType,
                        isExitRow: tx.isExitRow || false,
                        cost: Number(tx.cost) || 0,
                        pickupLocation: tx.pickupLocation || current.name,
                        dropoffLocation: tx.dropoffLocation || next.name,
                        vehicleModel: tx.vehicleModel || '',
                        waypoints: tx.waypoints || [],
                        duration: Number(tx.duration) || 120,
                        distance: Number(tx.distance) || 0,
                        logoUrl: resolvedLogoUrl,
                        
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
            });

            onSave(finalLocations, finalTransports);
        } catch (err) {
            console.error('Error pre-saving route sequence', err);
        } finally {
            setIsSaving(false);
        }
    };

    // Derived stats metrics
    const statsDistance = route.reduce((acc, current) => acc + (current.transportToNext?.distance || 0), 0);
    const statsDurationMinutes = route.reduce((acc, current) => acc + (current.transportToNext?.duration || 0), 0);
    const statsCost = route.reduce((acc, current) => acc + (Number(current.transportToNext?.cost) || 0), 0);

    const formatMinutes = (mCount: number) => {
        const hours = Math.floor(mCount / 60);
        const mins = mCount % 60;
        return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    };

    const statsCarbonEmissions = route.reduce((acc, current) => {
        if (!current.transportToNext) return acc;
        const tx = current.transportToNext;
        const multiplier = ECO_MULTIPLIERS[tx.mode] || 100;
        const distance = tx.distance || 0;
        return acc + Math.round((distance * multiplier) / 1000); // return kilograms of CO2
    }, 0);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 text-gray-900 dark:text-gray-100">
            {/* Top Stat Banner */}
            <div className="lg:col-span-12 flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-[2rem] shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl" />
                <div className="relative">
                    <div className="flex items-center gap-2">
                        <span className="material-icons-outlined text-amber-300 text-2xl animate-spin-slow">alt_route</span>
                        <h2 className="text-2xl font-black tracking-tight">Georoute Planner Engine</h2>
                    </div>
                    <p className="text-xs text-blue-100 mt-1 font-semibold max-w-lg">
                        Build your chronological coordinate itinerary with zero lag. Modify dates, sequence order, and log carrier specifications with real-time feedback.
                    </p>
                </div>
                
                <div className="flex flex-wrap gap-4 items-center">
                    <div className="bg-white/10 backdrop-blur px-5 py-3 rounded-2xl border border-white/10 flex flex-col min-w-[100px]">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-blue-200">Total Distance</span>
                        <span className="text-lg font-black tracking-tight">{statsDistance.toLocaleString()} km</span>
                    </div>
                    <div className="bg-white/10 backdrop-blur px-5 py-3 rounded-2xl border border-white/10 flex flex-col min-w-[100px]">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-blue-200">Total Transit</span>
                        <span className="text-lg font-black tracking-tight">{formatMinutes(statsDurationMinutes)}</span>
                    </div>
                    <div className="bg-white/10 backdrop-blur px-5 py-3 rounded-2xl border border-white/10 flex flex-col min-w-[100px]">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-blue-200">CO2 emissions</span>
                        <span className="text-lg font-black tracking-tight text-emerald-350">{statsCarbonEmissions} kg</span>
                    </div>
                </div>
            </div>

            {/* Left Column - Core Timeline / Stops */}
            <div className="lg:col-span-8 space-y-6">
                <AnimatePresence initial={false}>
                    {route.map((node, idx) => {
                        const isFirst = idx === 0;
                        const isLast = idx === route.length - 1;
                        const hasTransport = !!node.transportToNext;
                        const isTxExpanded = node.transportToNext && expandedTransportId === node.transportToNext.id;

                        return (
                            <React.Fragment key={node.id}>
                                {/* Timeline Stop Card */}
                                <motion.div 
                                    initial={{ opacity: 0, y: 15 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    transition={{ duration: 0.2 }}
                                    className="relative"
                                >
                                    {/* Vertical Timeline Ring Indicator */}
                                    <div className="absolute left-6 md:left-8 -top-3 bottom-0 w-0.5 bg-gradient-to-b from-indigo-500/20 to-indigo-500/20 z-0" />
                                    
                                    <Card className="!bg-white/70 dark:!bg-gray-900/70 border border-gray-100 dark:border-white/5 pl-14 md:pl-20 !rounded-[2rem] shadow-md hover:shadow-lg transition-all !overflow-visible" noPadding>
                                        <div className="p-6 relative">
                                            {/* Stop Marker Number */}
                                            <div className={`absolute left-3 md:left-5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full border-2 flex items-center justify-center font-black text-xs z-10 ${
                                                isFirst ? 'bg-blue-500 text-white border-blue-400' :
                                                isLast ? 'bg-indigo-600 text-white border-indigo-500' :
                                                'bg-white text-gray-500 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-white/10'
                                            }`}>
                                                {idx + 1}
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                                                {/* Autocomplete Name Field */}
                                                <div className="md:col-span-4">
                                                    <Autocomplete 
                                                        label={`Destination Stop ${idx + 1}`}
                                                        placeholder="Enter location or airport..."
                                                        value={node.name}
                                                        onChange={(name) => handleStopNameChange(idx, name)}
                                                        fetchSuggestions={searchLocations}
                                                    />
                                                </div>

                                                {/* Arrival date */}
                                                <div className="md:col-span-3">
                                                    <Input 
                                                        label={isFirst ? "Trip Departure" : "Arrival Date"}
                                                        type="date"
                                                        value={node.date}
                                                        onChange={(e) => handleStopDateChange(idx, 'date', e.target.value)}
                                                    />
                                                </div>

                                                {/* Departure/Checkout Date */}
                                                {!isLast && (
                                                    <div className="md:col-span-3">
                                                        <Input 
                                                            label="Departure Date"
                                                            type="date"
                                                            value={node.endDate || node.date}
                                                            onChange={(e) => handleStopDateChange(idx, 'endDate', e.target.value)}
                                                        />
                                                    </div>
                                                )}

                                                {/* Stop Reason badges (if not First, can choose food, sights etc) */}
                                                {!isFirst && (
                                                    <div className={isLast ? "md:col-span-5 flex flex-wrap gap-2 items-center" : "md:col-span-2 flex flex-col gap-1"}>
                                                        <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500 ml-1">Reason</label>
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            {(['Overnight', 'Sightseeing', 'Activity', 'Stop'] as StopReason[]).map((r) => (
                                                                <button
                                                                    key={r}
                                                                    onClick={() => handleReasonChange(idx, r)}
                                                                    className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-tight rounded-xl transition-all ${
                                                                        node.reason === r 
                                                                        ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-900/30' 
                                                                        : 'bg-gray-50 dark:bg-gray-800/50 text-gray-400 dark:text-gray-500 hover:text-gray-600 border border-transparent'
                                                                    }`}
                                                                    title={r}
                                                                >
                                                                    <span className="mr-0.5">{REASON_ICONS[r]}</span> {r}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Action controls (Move, delete, insertion) */}
                                                <div className={`flex items-center gap-1.5 md:col-span-2 md:justify-end ${isFirst ? 'md:col-span-5' : ''}`}>
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm" 
                                                        onClick={() => moveStopNode(idx, 'up')}
                                                        disabled={isFirst}
                                                        title="Move step chronological position back"
                                                        className="h-9 w-9 p-0 rounded-xl"
                                                    >
                                                        <ArrowUp className="w-4 h-4" />
                                                    </Button>
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm" 
                                                        onClick={() => moveStopNode(idx, 'down')}
                                                        disabled={isLast}
                                                        title="Move step chronological position forward"
                                                        className="h-9 w-9 p-0 rounded-xl"
                                                    >
                                                        <ArrowDown className="w-4 h-4" />
                                                    </Button>
                                                    {!isFirst && !isLast && (
                                                        <Button 
                                                            variant="danger" 
                                                            size="sm" 
                                                            onClick={() => deleteStopNode(idx)}
                                                            className="h-9 w-9 p-0 rounded-xl text-red-500 hover:bg-red-50"
                                                            title="Delete node from itinerary"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </Card>
                                </motion.div>

                                {/* Connector and Interactive Transport segment */}
                                {hasTransport && (
                                    <div className="relative pl-14 md:pl-20 py-1 select-none">
                                        <div className="absolute left-6 md:left-8 top-0 bottom-0 w-0.5 bg-dotted-line z-0" />
                                        
                                        <div className="flex flex-col gap-2">
                                            {/* Expandable Connecting Leg Selector */}
                                            <button 
                                                onClick={() => setExpandedTransportId(isTxExpanded ? null : node.transportToNext!.id)}
                                                className={`flex items-center justify-between w-full p-4 rounded-2xl border transition-all hover:bg-gray-50/50 dark:hover:bg-white/[0.02] text-left cursor-pointer ${
                                                    isTxExpanded 
                                                    ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/40 shadow-sm' 
                                                    : 'bg-[#fafafa]/40 dark:bg-gray-900/40 border-gray-150/50 dark:border-white/5'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2.5 rounded-xl flex items-center justify-center ${
                                                        TRANSPORT_DETAILS[node.transportToNext!.mode]?.colorBg || 'bg-gray-100'
                                                    } ${TRANSPORT_DETAILS[node.transportToNext!.mode]?.colorText || 'text-gray-500'}`}>
                                                        {React.createElement(TRANSPORT_DETAILS[node.transportToNext!.mode]?.icon || Plane, { className: 'w-4 h-4' })}
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-black uppercase tracking-wider text-gray-800 dark:text-gray-200">
                                                            {TRANSPORT_DETAILS[node.transportToNext!.mode]?.label || 'Connection'} to {route[idx + 1]?.name || 'Next stop'}
                                                        </div>
                                                        <div className="text-[10px] text-gray-400 font-semibold mt-0.5">
                                                            {node.transportToNext!.distance || 0} km • {formatMinutes(node.transportToNext!.duration || 120)} • {node.transportToNext!.provider || 'Flexible Provider'}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 pr-1">
                                                    {node.transportToNext!.cost ? (
                                                        <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 mr-2 bg-emerald-500/10 px-2.5 py-1 rounded-xl">
                                                            ${Number(node.transportToNext!.cost).toLocaleString()}
                                                        </span>
                                                    ) : null}
                                                    <span className="text-[10px] bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 font-extrabold uppercase tracking-tight px-2.5 py-1 rounded-xl">
                                                        {isTxExpanded ? 'Hide Booking' : 'Log Details'}
                                                    </span>
                                                    {isTxExpanded ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
                                                </div>
                                            </button>

                                            {/* Expanded Leg Configuration Panel */}
                                            {isTxExpanded && (
                                                <motion.div 
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    transition={{ duration: 0.18 }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="bg-white/40 dark:bg-zinc-950/30 border border-gray-100 dark:border-white/5 rounded-3xl p-5 space-y-5 animate-fade-in">
                                                        {/* Mode Selection Chips */}
                                                        <div>
                                                            <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500 ml-1 mb-2 block">Transit Method Mode</label>
                                                            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                                                                {(['Flight', 'Train', 'Bus', 'Car Rental', 'Personal Car', 'Cruise'] as TransportMode[]).map((m) => (
                                                                    <button
                                                                        key={m}
                                                                        onClick={() => handleTransportChange(idx, 'mode', m)}
                                                                        className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all select-none cursor-pointer ${
                                                                            node.transportToNext!.mode === m 
                                                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/20 font-bold' 
                                                                            : 'bg-white dark:bg-gray-900 border-gray-150 dark:border-white/5 text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                                                                        }`}
                                                                    >
                                                                        {React.createElement(TRANSPORT_DETAILS[m].icon, { className: 'w-4 h-4 shrink-0' })}
                                                                        <span className="text-[9px] font-black uppercase tracking-tight leading-none">{m}</span>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {/* Ticket Details inputs */}
                                                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                                                            <div className="md:col-span-4">
                                                                <Input 
                                                                    label="Carrier / operator" 
                                                                    placeholder="e.g. Delta Air Lines, Eurorail"
                                                                    value={node.transportToNext!.provider}
                                                                    onChange={(e) => handleTransportChange(idx, 'provider', e.target.value)}
                                                                />
                                                            </div>
                                                            <div className="md:col-span-4">
                                                                <Input 
                                                                    label="Code / Line ID" 
                                                                    placeholder="e.g. DL104, Train 9210"
                                                                    value={node.transportToNext!.identifier}
                                                                    onChange={(e) => handleTransportChange(idx, 'identifier', e.target.value)}
                                                                />
                                                            </div>
                                                            <div className="md:col-span-4">
                                                                <Input 
                                                                    label="Booking ID / Conf Code" 
                                                                    placeholder="e.g. GFX77L"
                                                                    value={node.transportToNext!.confirmationCode}
                                                                    onChange={(e) => handleTransportChange(idx, 'confirmationCode', e.target.value)}
                                                                />
                                                            </div>

                                                            <div className="md:col-span-3">
                                                                <Input 
                                                                    label="Booking Cost ($)" 
                                                                    type="number"
                                                                    placeholder="0.00"
                                                                    value={node.transportToNext!.cost || ''}
                                                                    onChange={(e) => handleTransportChange(idx, 'cost', Number(e.target.value))}
                                                                />
                                                            </div>

                                                            <div className="md:col-span-3">
                                                                <Select 
                                                                    label="Travel Cabin" 
                                                                    options={[
                                                                        { label: 'Economy Cabin', value: 'Economy' },
                                                                        { label: 'Premium Economy', value: 'Premium Economy' },
                                                                        { label: 'Business Cabin', value: 'Business' },
                                                                        { label: 'First Cabin', value: 'First' }
                                                                    ]}
                                                                    value={node.transportToNext!.travelClass || 'Economy'}
                                                                    onChange={(e) => handleTransportChange(idx, 'travelClass', e.target.value)}
                                                                />
                                                            </div>

                                                            <div className="md:col-span-3">
                                                                <Input 
                                                                    label="Seat Designation" 
                                                                    placeholder="e.g. 14F, Train Car 4"
                                                                    value={node.transportToNext!.seatNumber}
                                                                    onChange={(e) => handleTransportChange(idx, 'seatNumber', e.target.value)}
                                                                />
                                                            </div>

                                                            <div className="md:col-span-3">
                                                                <Input 
                                                                    label="Departure time" 
                                                                    type="text"
                                                                    placeholder="e.g. 10:00"
                                                                    value={node.transportToNext!.departureTime}
                                                                    onChange={(e) => handleTransportChange(idx, 'departureTime', e.target.value)}
                                                                />
                                                            </div>

                                                            <div className="md:col-span-4">
                                                                <Input 
                                                                    label="Leg Distance (km)" 
                                                                    type="number"
                                                                    value={node.transportToNext!.distance || ''}
                                                                    onChange={(e) => handleTransportChange(idx, 'distance', Number(e.target.value))}
                                                                />
                                                            </div>

                                                            <div className="md:col-span-4">
                                                                <Input 
                                                                    label="Leg Duration (mins)" 
                                                                    type="number"
                                                                    value={node.transportToNext!.duration || ''}
                                                                    onChange={(e) => handleTransportChange(idx, 'duration', Number(e.target.value))}
                                                                />
                                                            </div>

                                                            <div className="md:col-span-4 flex items-center justify-between p-3.5 bg-zinc-50 dark:bg-zinc-900/60 rounded-2xl border border-gray-150 dark:border-white/5 mt-5">
                                                                <div>
                                                                    <div className="text-[9px] font-black uppercase text-gray-400">Locked Booking</div>
                                                                    <div className="text-[10px] text-gray-500">Commercial reservation lock</div>
                                                                </div>
                                                                <input
                                                                    type="checkbox"
                                                                    className="w-4.5 h-4.5 rounded text-indigo-600 focus:ring-0 cursor-pointer"
                                                                    checked={node.transportToNext!.isLocked || false}
                                                                    onChange={(e) => handleTransportChange(idx, 'isLocked', e.target.checked)}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </div>

                                        {/* Insert mid-way stop button directly on connecting path */}
                                        <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center justify-center z-10">
                                            <button 
                                                onClick={() => addStopNode(idx)}
                                                className="w-10 h-10 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white flex items-center justify-center shadow-lg transition-all dark:bg-indigo-600 dark:hover:bg-indigo-500 cursor-pointer border border-indigo-400/30 scale-90 hover:scale-100"
                                                title="Inject mid-trip stop intermediate dest"
                                            >
                                                <Plus className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </React.Fragment>
                        );
                    })}
                </AnimatePresence>
                
                {/* Visual Add Stop Button at very end */}
                <div className="flex md:pl-20 py-2">
                    <button 
                        onClick={() => addStopNode(route.length - 1)}
                        className="flex items-center gap-2.5 px-6 py-4 border-2 border-dashed border-zinc-250 dark:border-white/10 hover:border-indigo-500 dark:hover:border-indigo-400 text-zinc-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-300 rounded-[2rem] w-full justify-center transition-all bg-white/40 dark:bg-zinc-950/20 font-bold uppercase tracking-wider text-xs shadow-inner cursor-pointer"
                    >
                        <Plus className="w-4 h-4" /> Add Destination Leg Stop
                    </button>
                </div>
            </div>

            {/* Right Column - Controls Sidebar & Carbon Offset scorecard */}
            <div className="lg:col-span-4 space-y-6">
                <Card title="Itinerary Dispatch" className="shadow-lg">
                    <div className="space-y-4">
                        <p className="text-xs text-gray-400">
                            Apply and lock all changed georoutes, intervals, and logistics to the master trip database.
                        </p>

                        <div className="space-y-2 mt-4">
                            <Button 
                                variant="primary" 
                                className="w-full" 
                                size="lg" 
                                isLoading={isSaving}
                                onClick={triggerSaveRoute}
                                icon={<Check className="w-4 h-4" />}
                            >
                                Save Itinerary Changes
                            </Button>
                            <Button 
                                variant="outline" 
                                className="w-full !border-gray-200 hover:!border-gray-300 dark:!border-white/15 dark:hover:!border-white/20" 
                                size="lg"
                                onClick={onCancel}
                            >
                                Discard Unsaved Changes
                            </Button>
                        </div>
                    </div>
                </Card>

                <Card title="WanderGrid Carbon Offset Program" className="shadow-lg">
                    <div className="space-y-4">
                        <div className="flex gap-3 bg-emerald-500/10 p-4 rounded-2xl border border-emerald-500/15">
                            <Award className="w-6 h-6 text-emerald-500 shrink-0" />
                            <div>
                                <div className="text-xs font-black text-emerald-800 dark:text-emerald-400 uppercase tracking-widest leading-none">Carbon Offset Registered</div>
                                <div className="text-[10px] text-gray-500 mt-1 leading-normal">
                                    This route produces a total estimated overhead of <span className="font-extrabold text-emerald-600 dark:text-emerald-450">{statsCarbonEmissions} kg CO2</span>.
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3.5">
                            <div className="flex justify-between items-center text-xs border-b border-gray-100 dark:border-white/5 pb-2.5">
                                <span className="text-gray-400">Carbon offset rating</span>
                                <span className="font-extrabold text-emerald-600">Gold Certified</span>
                            </div>
                            <div className="flex justify-between items-center text-xs border-b border-gray-100 dark:border-white/5 pb-2.5">
                                <span className="text-gray-400">Eco Contribution</span>
                                <span className="font-bold text-gray-600 dark:text-zinc-350">$0.00 (Sponsored)</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-gray-400">Mitigation projects</span>
                                <span className="font-bold text-gray-600 dark:text-zinc-350">Amazon Reforestation</span>
                            </div>
                        </div>
                        
                        <p className="text-[10px] text-zinc-400 leading-normal bg-zinc-50 dark:bg-zinc-950/40 p-3.5 rounded-xl border border-gray-150 dark:border-white/5">
                            🌳 WanderGrid matches every flight, rail, and road trip emissions with GoldStandard carbon-offset investments. Enjoy carbon-neutral travel tracking.
                        </p>
                    </div>
                </Card>
            </div>
        </div>
    );
};
