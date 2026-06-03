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
    Check,
    Compass,
    Link2,
    Lock,
    Unlock,
    HelpCircle,
    Route,
    Earth,
    Shuffle,
    GripVertical
} from 'lucide-react';
import { Button, Input, Autocomplete, Select, Card, Badge } from './ui';
import { LocationEntry, Transport, TransportMode } from '../types';
import { searchLocations, getCoordinates, getCoordinatesSync, calculateDistance } from '../services/geocoding';

interface RouteManagerProps {
    locations: LocationEntry[];
    transports: Transport[];
    onSave: (locations: LocationEntry[], transports: Transport[]) => void;
    onCancel: () => void;
    defaultStartDate: string;
    defaultEndDate: string;
}

interface RouteSegment {
    id: string;
    startCity: string;
    destination: string;
    date: string;
    transportMode: TransportMode;
    linkStartToPrevDest?: boolean;
    linkDateToPrevDate?: boolean;
}

interface JourneyLeg {
    id: string;
    title: string;
    segments: RouteSegment[];
}

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
    const [legs, setLegs] = useState<JourneyLeg[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    
    // Coordinates caching state to allow immediate fluid updates on the mini map preview
    const [coordsCache, setCoordsCache] = useState<Record<string, { lat: number; lng: number }>>({});

    // Drag-and-drop leg state
    const [draggedLegIndex, setDraggedLegIndex] = useState<number | null>(null);
    const [dragOverLegIndex, setDragOverLegIndex] = useState<number | null>(null);

    // Populate local multi-leg segments from database transports/locations on mount
    useEffect(() => {
        initializeRoute();
    }, [locations, transports]);

    // Reactive coordinate geopopulator
    useEffect(() => {
        const uniqueCities = new Set<string>();
        legs.forEach(leg => {
            leg.segments.forEach(seg => {
                if (seg.startCity && seg.startCity.trim().length >= 3) {
                    uniqueCities.add(seg.startCity.trim());
                }
                if (seg.destination && seg.destination.trim().length >= 3) {
                    uniqueCities.add(seg.destination.trim());
                }
            });
        });

        uniqueCities.forEach(city => {
            if (!coordsCache[city]) {
                const syncC = getCoordinatesSync(city);
                if (syncC) {
                    setCoordsCache(prev => ({ ...prev, [city]: { lat: syncC.lat, lng: syncC.lng } }));
                } else {
                    getCoordinates(city).then(coords => {
                        if (coords) {
                            setCoordsCache(prev => ({ ...prev, [city]: { lat: coords.lat, lng: coords.lng } }));
                        }
                    }).catch(err => console.debug('MiniMap coordinate lazy resolve failure', err));
                }
            }
        });
    }, [legs]);

    const initializeRoute = () => {
        if (!transports || transports.length === 0) {
            if (locations && locations.length >= 2) {
                const segments: RouteSegment[] = [];
                for (let i = 0; i < locations.length - 1; i++) {
                    segments.push({
                        id: `seg-${Math.random().toString(36).substring(2, 9)}`,
                        startCity: locations[i].name,
                        destination: locations[i + 1].name,
                        date: locations[i].endDate || locations[i].startDate || defaultStartDate,
                        transportMode: 'Train',
                        linkStartToPrevDest: i > 0,
                        linkDateToPrevDate: false
                    });
                }
                setLegs([{
                    id: 'leg-1',
                    title: 'Leg 1',
                    segments
                }]);
            } else {
                setLegs([{
                    id: 'leg-1',
                    title: 'Leg 1',
                    segments: [{
                        id: 'seg-1',
                        startCity: 'Paris',
                        destination: 'Rome',
                        date: defaultStartDate,
                        transportMode: 'Train',
                        linkStartToPrevDest: false,
                        linkDateToPrevDate: false
                    }]
                }]);
            }
            return;
        }

        const legGroups: { [key: string]: { title: string; txs: Transport[] } } = {};
        const legacyTransports: Transport[] = [];

        transports.forEach(tx => {
            const legIdField = tx.customFields?.find(f => f.key === 'legId')?.value;
            const legTitleField = tx.customFields?.find(f => f.key === 'legTitle')?.value;

            if (legIdField) {
                if (!legGroups[legIdField]) {
                    legGroups[legIdField] = { title: legTitleField || 'Leg', txs: [] };
                }
                legGroups[legIdField].txs.push(tx);
            } else if (tx.itineraryId === 'route-gen' || tx.itineraryId === 'route-booked') {
                legacyTransports.push(tx);
            }
        });

        const parsedLegs: JourneyLeg[] = [];

        Object.entries(legGroups).forEach(([legId, group]) => {
            const sortedTxs = [...group.txs].sort((a, b) => new Date(a.departureDate).getTime() - new Date(b.departureDate).getTime());
            const segments: RouteSegment[] = sortedTxs.map((tx, idx) => {
                const prevTx = idx > 0 ? sortedTxs[idx - 1] : null;
                const linkStartToPrevDest = prevTx ? tx.origin.toLowerCase().trim() === prevTx.destination.toLowerCase().trim() : false;
                const linkDateToPrevDate = prevTx ? tx.departureDate === prevTx.departureDate : false;

                return {
                    id: tx.id || `seg-${Math.random().toString(36).substring(2, 9)}`,
                    startCity: tx.origin,
                    destination: tx.destination,
                    date: tx.departureDate || defaultStartDate,
                    transportMode: tx.mode || 'Train',
                    linkStartToPrevDest,
                    linkDateToPrevDate
                };
            });

            parsedLegs.push({
                id: legId,
                title: group.title,
                segments
            });
        });

        if (legacyTransports.length > 0) {
            const sortedLegacy = [...legacyTransports].sort((a, b) => new Date(a.departureDate).getTime() - new Date(b.departureDate).getTime());
            const segments: RouteSegment[] = sortedLegacy.map((tx, idx) => {
                const prevTx = idx > 0 ? sortedLegacy[idx - 1] : null;
                const linkStartToPrevDest = prevTx ? tx.origin.toLowerCase().trim() === prevTx.destination.toLowerCase().trim() : false;
                const linkDateToPrevDate = prevTx ? tx.departureDate === prevTx.departureDate : false;

                return {
                    id: tx.id || `seg-${Math.random().toString(36).substring(2, 9)}`,
                    startCity: tx.origin,
                    destination: tx.destination,
                    date: tx.departureDate || defaultStartDate,
                    transportMode: tx.mode || 'Train',
                    linkStartToPrevDest,
                    linkDateToPrevDate
                };
            });

            parsedLegs.push({
                id: 'leg-legacy',
                title: 'Main Route',
                segments
            });
        }

        if (parsedLegs.length === 0) {
            parsedLegs.push({
                id: 'leg-1',
                title: 'Leg 1',
                segments: [{
                    id: 'seg-1',
                    startCity: 'Paris',
                    destination: 'Rome',
                    date: defaultStartDate,
                    transportMode: 'Train',
                    linkStartToPrevDest: false,
                    linkDateToPrevDate: false
                }]
            });
        }

        setLegs(parsedLegs);
    };

    // Safe helper to parse local system date strings properly without offset deviations
    const parseDateString = (dStr: string) => {
        if (!dStr) return null;
        const parts = dStr.split('-');
        if (parts.length === 3) {
            return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        }
        return new Date(dStr);
    };

    // Calculate start date, end date, and total duration for a route leg
    const compileLegDates = (leg: JourneyLeg) => {
        if (!leg.segments || leg.segments.length === 0) {
            return { startDate: defaultStartDate, endDate: defaultEndDate, durationText: '0 days' };
        }
        
        const segsWithDates = leg.segments.filter(s => s.date);
        if (segsWithDates.length === 0) {
            return { startDate: defaultStartDate, endDate: defaultEndDate, durationText: '0 days' };
        }

        const dates = segsWithDates.map(s => s.date).sort();
        const startDateStr = dates[0];
        const endDateStr = dates[dates.length - 1];

        const dStart = parseDateString(startDateStr);
        const dEnd = parseDateString(endDateStr);

        let durationDays = 1;
        if (dStart && dEnd) {
            const diffTime = dEnd.getTime() - dStart.getTime();
            durationDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);
        }

        const durationText = durationDays === 1 ? '1 day' : `${durationDays} days`;
        return {
            startDate: startDateStr,
            endDate: endDateStr,
            durationDays,
            durationText
        };
    };

    // Compile validation states dynamically for consecutive leg constraints
    const legValidations = legs.map((leg, idx) => {
        const dates = compileLegDates(leg);
        let isValid = true;
        let errorMessage = '';

        if (idx > 0) {
            const prevLeg = legs[idx - 1];
            const prevDates = compileLegDates(prevLeg);
            
            const dCurrentStart = parseDateString(dates.startDate);
            const dPrevEnd = parseDateString(prevDates.endDate);

            if (dCurrentStart && dPrevEnd && dCurrentStart < dPrevEnd) {
                isValid = false;
                errorMessage = `Starts on ${dates.startDate}, but previous Leg ends on ${prevDates.endDate}.`;
            }
        }

        return {
            legId: leg.id,
            title: leg.title,
            startDate: dates.startDate,
            endDate: dates.endDate,
            durationText: dates.durationText,
            isValid,
            errorMessage
        };
    });

    const hasTimelineOverlaps = legValidations.some(v => !v.isValid);

    // Timeline solver: Shifts current leg and dependents forward recursively to fix conflicts instantly
    const autoResolveTimelineOverlap = (legIndex: number) => {
        if (legIndex <= 0) return;
        setLegs(prevLegs => {
            const list = JSON.parse(JSON.stringify(prevLegs)) as JourneyLeg[];
            
            for (let i = legIndex; i < list.length; i++) {
                const prev = list[i - 1];
                const current = list[i];
                
                const prevDates = compileLegDates(prev);
                const currentDates = compileLegDates(current);
                
                const dPrevEnd = parseDateString(prevDates.endDate);
                const dCurrentStart = parseDateString(currentDates.startDate);
                
                if (dPrevEnd && dCurrentStart && dCurrentStart < dPrevEnd) {
                    const msDiff = dPrevEnd.getTime() - dCurrentStart.getTime();
                    const daysToShift = Math.ceil(msDiff / (1000 * 60 * 60 * 24));
                    
                    current.segments.forEach(seg => {
                        const d = parseDateString(seg.date);
                        if (d) {
                            d.setDate(d.getDate() + daysToShift);
                            const y = d.getFullYear();
                            const m = String(d.getMonth() + 1).padStart(2, '0');
                            const day = String(d.getDate()).padStart(2, '0');
                            seg.date = `${y}-${m}-${day}`;
                        }
                    });
                }
            }
            return list;
        });
    };

    // Generalized reactive updater for safe linkage cascading
    const updateSegment = (legId: string, segmentId: string, field: keyof RouteSegment, value: any) => {
        setLegs(prevLegs => prevLegs.map(leg => {
            if (leg.id !== legId) return leg;
            
            let updatedSegments = leg.segments.map(seg => {
                if (seg.id !== segmentId) return seg;
                return { ...seg, [field]: value };
            });

            updatedSegments = updatedSegments.map((seg, idx) => {
                if (idx === 0) return seg;
                const prev = updatedSegments[idx - 1];
                let linkedSeg = { ...seg };

                if (linkedSeg.linkStartToPrevDest) {
                    linkedSeg.startCity = prev.destination;
                }
                if (linkedSeg.linkDateToPrevDate) {
                    linkedSeg.date = prev.date;
                }
                return linkedSeg;
            });

            return { ...leg, segments: updatedSegments };
        }));
    };

    // Toggle linkage locks
    const toggleLinkStart = (legId: string, segmentId: string, prevDest: string) => {
        setLegs(prevLegs => prevLegs.map(leg => {
            if (leg.id !== legId) return leg;
            const updatedSegments = leg.segments.map((seg, idx) => {
                if (seg.id !== segmentId) return seg;
                const linkNew = !seg.linkStartToPrevDest;
                return {
                    ...seg,
                    linkStartToPrevDest: linkNew,
                    startCity: linkNew ? prevDest : seg.startCity
                };
            });
            return { ...leg, segments: updatedSegments };
        }));
    };

    const toggleLinkDate = (legId: string, segmentId: string, prevDate: string) => {
        setLegs(prevLegs => prevLegs.map(leg => {
            if (leg.id !== legId) return leg;
            const updatedSegments = leg.segments.map((seg, idx) => {
                if (seg.id !== segmentId) return seg;
                const linkNew = !seg.linkDateToPrevDate;
                return {
                    ...seg,
                    linkDateToPrevDate: linkNew,
                    date: linkNew ? prevDate : seg.date
                };
            });
            return { ...leg, segments: updatedSegments };
        }));
    };

    const addSegment = (legId: string) => {
        setLegs(prevLegs => prevLegs.map(leg => {
            if (leg.id !== legId) return leg;
            const lastSeg = leg.segments[leg.segments.length - 1];
            const nextDate = lastSeg ? lastSeg.date : defaultStartDate;
            const nextStart = lastSeg ? lastSeg.destination : 'Rome';

            const newSeg: RouteSegment = {
                id: `seg-${Math.random().toString(36).substring(2, 9)}`,
                startCity: nextStart,
                destination: '',
                date: nextDate,
                transportMode: lastSeg ? lastSeg.transportMode : 'Train',
                linkStartToPrevDest: !!lastSeg,
                linkDateToPrevDate: false
            };

            return {
                ...leg,
                segments: [...leg.segments, newSeg]
            };
        }));
    };

    const deleteSegment = (legId: string, segmentId: string) => {
        setLegs(prevLegs => prevLegs.map(leg => {
            if (leg.id !== legId) return leg;
            if (leg.segments.length <= 1) return leg;

            const filtered = leg.segments.filter(seg => seg.id !== segmentId);
            
            const fixed = filtered.map((seg, idx) => {
                if (idx === 0) {
                    return { ...seg, linkStartToPrevDest: false, linkDateToPrevDate: false };
                }
                const prev = filtered[idx - 1];
                let linkedSeg = { ...seg };
                if (linkedSeg.linkStartToPrevDest) {
                    linkedSeg.startCity = prev.destination;
                }
                if (linkedSeg.linkDateToPrevDate) {
                    linkedSeg.date = prev.date;
                }
                return linkedSeg;
            });

            return { ...leg, segments: fixed };
        }));
    };

    const moveSegment = (legId: string, idx: number, direction: 'up' | 'down') => {
        setLegs(prevLegs => prevLegs.map(leg => {
            if (leg.id !== legId) return leg;
            const list = [...leg.segments];
            const target = direction === 'up' ? idx - 1 : idx + 1;
            if (target < 0 || target >= list.length) return leg;

            const temp = list[idx];
            list[idx] = list[target];
            list[target] = temp;

            const fixed = list.map((seg, i) => {
                if (i === 0) {
                    return { ...seg, linkStartToPrevDest: false, linkDateToPrevDate: false };
                }
                const prev = list[i - 1];
                let linkedSeg = { ...seg };
                if (linkedSeg.linkStartToPrevDest) {
                    linkedSeg.startCity = prev.destination;
                }
                if (linkedSeg.linkDateToPrevDate) {
                    linkedSeg.date = prev.date;
                }
                return linkedSeg;
            });

            return { ...leg, segments: fixed };
        }));
    };

    const addLeg = () => {
        const nextId = `leg-${Math.random().toString(36).substring(2, 9)}`;
        setLegs(prev => [
            ...prev,
            {
                id: nextId,
                title: `Leg ${prev.length + 1}`,
                segments: [{
                    id: `seg-${Math.random().toString(36).substring(2, 9)}`,
                    startCity: 'Paris',
                    destination: 'Berlin',
                    date: defaultStartDate,
                    transportMode: 'Train',
                    linkStartToPrevDest: false,
                    linkDateToPrevDate: false
                }]
            }
        ]);
    };

    const deleteLeg = (legId: string) => {
        if (legs.length <= 1) return;
        setLegs(prev => prev.filter(leg => leg.id !== legId));
    };

    const renameLeg = (legId: string, newTitle: string) => {
        setLegs(prev => prev.map(leg => {
            if (leg.id !== legId) return leg;
            return { ...leg, title: newTitle };
        }));
    };

    // Native Drag and Drop Legs handler
    const handleDropLeg = (targetIdx: number) => {
        if (draggedLegIndex === null || draggedLegIndex === targetIdx) return;
        setLegs(prevLegs => {
            const list = [...prevLegs];
            const [removed] = list.splice(draggedLegIndex, 1);
            list.splice(targetIdx, 0, removed);
            
            // Reindex names if they have standard names, e.g. "Leg X"
            return list.map((leg, idx) => {
                if (leg.title.startsWith('Leg ')) {
                    return { ...leg, title: `Leg ${idx + 1}` };
                }
                return leg;
            });
        });
        setDraggedLegIndex(null);
        setDragOverLegIndex(null);
    };

    const triggerSaveRoute = async () => {
        if (hasTimelineOverlaps) {
            return;
        }

        setIsSaving(true);
        try {
            const finalTransports: Transport[] = [];

            for (const leg of legs) {
                for (let idx = 0; idx < leg.segments.length; idx++) {
                    const seg = leg.segments[idx];
                    const startName = seg.startCity.trim();
                    const destName = seg.destination.trim();
                    if (!startName || !destName) continue;

                    const startCoords = coordsCache[startName] || getCoordinatesSync(startName) || await getCoordinates(startName);
                    const destCoords = coordsCache[destName] || getCoordinatesSync(destName) || await getCoordinates(destName);

                    let distance = 350;
                    if (startCoords && destCoords) {
                        distance = calculateDistance(startCoords.lat, startCoords.lng, destCoords.lat, destCoords.lng);
                    }

                    const speed = TRANSPORT_DETAILS[seg.transportMode]?.speed || 100;
                    const durationInMinutes = Math.round((distance / speed) * 60) || 120;

                    finalTransports.push({
                        id: seg.id || 'tx-' + Math.random().toString(36).substring(2, 11),
                        itineraryId: 'route-gen',
                        type: 'One-Way',
                        mode: seg.transportMode,
                        provider: `${TRANSPORT_DETAILS[seg.transportMode]?.label || 'Route Line'} Service`,
                        identifier: '',
                        confirmationCode: '',
                        origin: startName,
                        destination: destName,
                        departureDate: seg.date,
                        departureTime: '10:00',
                        arrivalDate: seg.date,
                        arrivalTime: '13:00',
                        travelClass: 'Economy',
                        cost: 0,
                        pickupLocation: startName,
                        dropoffLocation: destName,
                        duration: durationInMinutes,
                        distance: distance,
                        originLat: startCoords?.lat,
                        originLng: startCoords?.lng,
                        destLat: destCoords?.lat,
                        destLng: destCoords?.lng,
                        customFields: [
                            { key: 'legId', value: leg.id },
                            { key: 'legTitle', value: leg.title }
                        ]
                    });
                }
            }

            const finalLocations: LocationEntry[] = [];
            const addedLocations = new Set<string>();

            legs.forEach(leg => {
                leg.segments.forEach((seg, idx) => {
                    const sName = seg.startCity.trim();
                    const dName = seg.destination.trim();
                    if (!sName || !dName) return;

                    const sCoords = coordsCache[sName] || getCoordinatesSync(sName);
                    const dCoords = coordsCache[dName] || getCoordinatesSync(dName);

                    if (idx === 0) {
                        const startLocId = `${leg.id}-start`;
                        if (!addedLocations.has(startLocId)) {
                            finalLocations.push({
                                id: startLocId,
                                name: sName,
                                startDate: defaultStartDate,
                                endDate: seg.date,
                                description: 'Overnight',
                                coordinates: sCoords ? { lat: sCoords.lat, lng: sCoords.lng } : undefined
                            });
                            addedLocations.add(startLocId);
                        }
                    }

                    const nextSeg = leg.segments[idx + 1];
                    const nextDate = nextSeg ? nextSeg.date : defaultEndDate;
                    const destLocId = `${seg.id}-dest`;
                    if (!addedLocations.has(destLocId)) {
                        finalLocations.push({
                            id: destLocId,
                            name: dName,
                            startDate: seg.date,
                            endDate: nextDate,
                            description: 'Overnight',
                            coordinates: dCoords ? { lat: dCoords.lat, lng: dCoords.lng } : undefined
                        });
                        addedLocations.add(destLocId);
                    }
                });
            });

            onSave(finalLocations, finalTransports);
        } catch (err) {
            console.error('Error compiling separate route legs', err);
        } finally {
            setIsSaving(false);
        }
    };

    // Dynamic stats compilation
    const statsDistance = legs.reduce((overall, leg) => 
        overall + leg.segments.reduce((legAcc, seg) => {
            const startName = seg.startCity.trim();
            const destName = seg.destination.trim();
            const startC = coordsCache[startName] || getCoordinatesSync(startName);
            const destC = coordsCache[destName] || getCoordinatesSync(destName);
            if (startC && destC) {
                return legAcc + calculateDistance(startC.lat, startC.lng, destC.lat, destC.lng);
            }
            return legAcc + 320;
        }, 0)
    , 0);

    const statsCarbonEmissions = legs.reduce((overall, leg) => 
        overall + leg.segments.reduce((legAcc, seg) => {
            const startName = seg.startCity.trim();
            const destName = seg.destination.trim();
            const startC = coordsCache[startName] || getCoordinatesSync(startName);
            const destC = coordsCache[destName] || getCoordinatesSync(destName);
            const dist = startC && destC ? calculateDistance(startC.lat, startC.lng, destC.lat, destC.lng) : 320;
            const multiplier = ECO_MULTIPLIERS[seg.transportMode] || 100;
            return legAcc + Math.round((dist * multiplier) / 1000);
        }, 0)
    , 0);



    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 text-gray-900 dark:text-gray-100">
            {/* Top Stats Dashboard Section */}
            <div className="lg:col-span-12 flex flex-col md:flex-row md:items-center justify-between gap-6 p-8 bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-[2rem] shadow-2xl relative overflow-hidden border border-white/5">
                <div className="absolute top-[-20%] right-[-10%] w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="relative">
                    <div className="flex items-center gap-3">
                        <Route className="text-blue-400 w-8 h-8" />
                        <h2 className="text-3xl font-black tracking-tight font-sans">Route Planner</h2>
                    </div>
                    <p className="text-sm text-slate-400 mt-2 font-medium max-w-xl">
                        Reworked and simplified. Build independent legs with secure timelines, visual coordinate maps, and intelligent cascading alignment.
                    </p>
                </div>
                
                <div className="flex flex-wrap gap-4 items-center relative z-10">
                    <div className="bg-white/[0.04] backdrop-blur px-6 py-4 rounded-2xl border border-white/5 flex flex-col min-w-[120px]">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Distance</span>
                        <span className="text-2xl font-black tracking-tight mt-1 text-white">{statsDistance.toLocaleString()} km</span>
                    </div>
                    <div className="bg-white/[0.04] backdrop-blur px-6 py-4 rounded-2xl border border-white/5 flex flex-col min-w-[120px]">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-sans">Carbon Footprint</span>
                        <span className="text-2xl font-black tracking-tight mt-1 text-emerald-400 font-mono">{statsCarbonEmissions} kg</span>
                    </div>
                </div>
            </div>

            {/* Left Content Column - Legs & Rows Panel */}
            <div className="lg:col-span-8 space-y-8">
                <AnimatePresence initial={false}>
                    {legs.map((leg, legIdx) => {
                        const validation = legValidations[legIdx];
                        const isDragHighlighted = dragOverLegIndex === legIdx;

                        return (
                            <motion.div
                                key={leg.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.25 }}
                                className={`bg-white dark:bg-gray-900 border rounded-[2.5rem] shadow-lg p-6 relative transition-all duration-250 ${
                                    isDragHighlighted 
                                    ? 'border-indigo-500 ring-4 ring-indigo-500/10 scale-[1.01]' 
                                    : 'border-gray-200/60 dark:border-white/5'
                                }`}
                                draggable="true"
                                onDragStart={(e) => {
                                    setDraggedLegIndex(legIdx);
                                    e.dataTransfer.effectAllowed = 'move';
                                }}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    if (draggedLegIndex !== legIdx) {
                                        setDragOverLegIndex(legIdx);
                                    }
                                }}
                                onDragEnd={() => {
                                    setDraggedLegIndex(null);
                                    setDragOverLegIndex(null);
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    handleDropLeg(legIdx);
                                }}
                            >
                                {/* Leg Title Header with full customization inline */}
                                <div className="flex items-center justify-between border-b border-gray-100 dark:border-white/5 pb-4 mb-6">
                                    <div className="flex items-center gap-3 w-full max-w-md">
                                        {/* Drag Handle */}
                                        <div 
                                            className="p-1 text-gray-400 hover:text-gray-600 dark:text-zinc-650 dark:hover:text-zinc-400 cursor-grab active:cursor-grabbing shrink-0"
                                            title="Grab to reorder itinerary leg"
                                        >
                                            <GripVertical className="w-4 h-4" />
                                        </div>

                                        <Badge color={legIdx % 2 === 0 ? 'indigo' : 'purple'} className="py-1 px-3 rounded-xl">
                                            Leg {legIdx + 1}
                                        </Badge>
                                        <input
                                            type="text"
                                            value={leg.title}
                                            onChange={(e) => renameLeg(leg.id, e.target.value)}
                                            className="text-base font-black tracking-tight bg-transparent border-b border-transparent hover:border-gray-300 dark:hover:border-zinc-700 focus:border-blue-500 focus:ring-0 outline-none w-full text-gray-800 dark:text-gray-100 transition-colors py-0.5 px-1"
                                            placeholder="Name this journey sector..."
                                        />
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => addSegment(leg.id)}
                                            icon={<Plus className="w-4 h-4" />}
                                            className="h-9 font-semibold text-xs rounded-xl"
                                        >
                                            Add Segment
                                        </Button>

                                        {legs.length > 1 && (
                                            <Button
                                                variant="danger"
                                                size="sm"
                                                onClick={() => deleteLeg(leg.id)}
                                                icon={<Trash2 className="w-3.5 h-3.5" />}
                                                className="h-9 w-9 p-0 !rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
                                                title="Delete Entire Leg"
                                            />
                                        )}
                                    </div>
                                </div>

                                {/* Core simplified row table */}
                                <div className="space-y-6">
                                    {leg.segments.map((seg, idx) => {
                                        const isFirst = idx === 0;
                                        const isLast = idx === leg.segments.length - 1;
                                        const prevSegment = idx > 0 ? leg.segments[idx - 1] : null;

                                        return (
                                            <div 
                                                key={seg.id} 
                                                className="relative p-5 rounded-3xl bg-gray-50/50 dark:bg-gray-800/20 border border-gray-100 dark:border-white/[0.03] hover:border-gray-200 dark:hover:border-white/10 transition-all shadow-sm"
                                            >
                                                {/* Spacious flexible grid layout to maximize date fields and prevent truncate */}
                                                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                                                    
                                                    {/* Start City Selection with Inline Lock Toggle */}
                                                    <div className="md:col-span-3 space-y-1.5 relative">
                                                        <div className="flex items-center justify-between">
                                                            <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Start City</label>
                                                            {prevSegment && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleLinkStart(leg.id, seg.id, prevSegment.destination)}
                                                                    className={`p-1 rounded-lg transition-colors ${
                                                                        seg.linkStartToPrevDest 
                                                                        ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30' 
                                                                        : 'text-gray-400 hover:text-gray-600 dark:hover:text-zinc-350 hover:bg-gray-150 dark:hover:bg-zinc-800/50'
                                                                    }`}
                                                                    title={seg.linkStartToPrevDest ? "Unlock start destination" : `Link start destination to previous stop (${prevSegment.destination})`}
                                                                >
                                                                    {seg.linkStartToPrevDest ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                                                                </button>
                                                            )}
                                                        </div>
                                                        
                                                        {seg.linkStartToPrevDest && prevSegment ? (
                                                            <div className="w-full px-4 py-3 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/10 border border-indigo-100/50 dark:border-indigo-900/30 text-gray-700 dark:text-indigo-300 text-sm font-bold flex items-center justify-between h-[46px]">
                                                                <span className="truncate pr-1">{prevSegment.destination || "Pending destination..."}</span>
                                                                <Badge color="indigo" className="text-[8px] font-extrabold shrink-0">LINKED</Badge>
                                                            </div>
                                                        ) : (
                                                            <Autocomplete
                                                                placeholder="Where from?"
                                                                value={seg.startCity}
                                                                onChange={(val) => updateSegment(leg.id, seg.id, 'startCity', val)}
                                                                fetchSuggestions={searchLocations}
                                                            />
                                                        )}
                                                    </div>

                                                    {/* Destination Selector */}
                                                    <div className="md:col-span-3 space-y-1.5">
                                                        <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Destination</label>
                                                        <Autocomplete
                                                            placeholder="Where to?"
                                                            value={seg.destination}
                                                            onChange={(val) => updateSegment(leg.id, seg.id, 'destination', val)}
                                                            fetchSuggestions={searchLocations}
                                                        />
                                                    </div>

                                                    {/* Journey Date Picker with Link Toggle (WIDENED & STYLIZED) */}
                                                    <div className="md:col-span-3 space-y-1.5">
                                                        <div className="flex items-center justify-between">
                                                            <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Departure</label>
                                                            {prevSegment && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleLinkDate(leg.id, seg.id, prevSegment.date)}
                                                                    className={`p-1 rounded-lg transition-colors ${
                                                                        seg.linkDateToPrevDate 
                                                                        ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30' 
                                                                        : 'text-gray-400 hover:text-gray-600 dark:hover:text-zinc-350 hover:bg-gray-150 dark:hover:bg-zinc-800/50'
                                                                    }`}
                                                                    title={seg.linkDateToPrevDate ? "Unlock departure date" : `Link departure date to previous stop (${prevSegment.date})`}
                                                                >
                                                                    {seg.linkDateToPrevDate ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                                                                </button>
                                                            )}
                                                        </div>

                                                        {seg.linkDateToPrevDate && prevSegment ? (
                                                            <div className="w-full px-4 py-3 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/10 border border-indigo-100/50 dark:border-indigo-900/30 text-gray-700 dark:text-indigo-300 text-sm font-bold flex items-center justify-between h-[46px]">
                                                                <span className="truncate pr-1">{prevSegment.date}</span>
                                                                <Badge color="indigo" className="text-[8px] font-extrabold shrink-0">LINKED</Badge>
                                                            </div>
                                                        ) : (
                                                            <Input
                                                                type="date"
                                                                value={seg.date}
                                                                onChange={(e) => updateSegment(leg.id, seg.id, 'date', e.target.value)}
                                                                className="h-[46px]"
                                                            />
                                                        )}
                                                    </div>

                                                    {/* Transport Mode Selection */}
                                                    <div className="md:col-span-2 space-y-1.5">
                                                        <Select
                                                            label="Transport"
                                                            value={seg.transportMode}
                                                            onChange={(e) => updateSegment(leg.id, seg.id, 'transportMode', e.target.value as TransportMode)}
                                                            className="h-[46px]"
                                                            options={[
                                                                { label: '✈️ Flight', value: 'Flight' },
                                                                { label: '🚄 Train', value: 'Train' },
                                                                { label: '🚌 Bus', value: 'Bus' },
                                                                { label: '🚗 Rental Car', value: 'Car Rental' },
                                                                { label: '🚘 Own Car', value: 'Personal Car' },
                                                                { label: '🚢 Cruise', value: 'Cruise' }
                                                            ]}
                                                        />
                                                    </div>

                                                    {/* Reorders & Deletion controls */}
                                                    <div className="flex items-center gap-1.5 md:col-span-1 justify-end pb-1 inline-flex shrink-0">
                                                        <Button 
                                                            variant="ghost" 
                                                            size="sm" 
                                                            onClick={() => moveSegment(leg.id, idx, 'up')}
                                                            disabled={isFirst}
                                                            className="h-9 w-9 p-0 rounded-xl hover:bg-gray-150 dark:hover:bg-zinc-800"
                                                        >
                                                            <ArrowUp className="w-3.5 h-3.5" />
                                                        </Button>
                                                        
                                                        <Button 
                                                            variant="ghost" 
                                                            size="sm" 
                                                            onClick={() => moveSegment(leg.id, idx, 'down')}
                                                            disabled={isLast}
                                                            className="h-9 w-9 p-0 rounded-xl hover:bg-gray-150 dark:hover:bg-zinc-800"
                                                        >
                                                            <ArrowDown className="w-3.5 h-3.5" />
                                                        </Button>

                                                        {leg.segments.length > 1 && (
                                                            <Button 
                                                                variant="danger" 
                                                                size="sm" 
                                                                onClick={() => deleteSegment(leg.id, seg.id)}
                                                                className="h-9 w-9 p-0 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 border-0"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Micro-linking Interactive offerings below */}
                                                {prevSegment && (
                                                    <div className="flex flex-wrap gap-2.5 mt-3.5 border-t border-gray-150/50 dark:border-white/[0.02] pt-3.5 text-xs text-slate-405">
                                                        <span className="font-extrabold uppercase text-[8px] tracking-wider text-slate-400 flex items-center gap-1 mt-1 shrink-0">
                                                            🤝 Connections:
                                                        </span>
                                                        
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleLinkStart(leg.id, seg.id, prevSegment.destination)}
                                                            className={`px-3 py-1 rounded-full text-[9px] font-bold tracking-tight transition-all flex items-center gap-1 cursor-pointer ${
                                                                seg.linkStartToPrevDest 
                                                                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shadow-sm' 
                                                                : 'bg-zinc-100 dark:bg-zinc-800/40 hover:bg-zinc-200/60 text-gray-500 dark:text-gray-400'
                                                            }`}
                                                        >
                                                            {seg.linkStartToPrevDest ? (
                                                                <>🚀 Lock to {prevSegment.destination || "stop"}</>
                                                            ) : (
                                                                <>🔗 Link start to previous stop ({prevSegment.destination || "stop"}</>
                                                            )}
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => toggleLinkDate(leg.id, seg.id, prevSegment.date)}
                                                            className={`px-3 py-1 rounded-full text-[9px] font-bold tracking-tight transition-all flex items-center gap-1 cursor-pointer ${
                                                                seg.linkDateToPrevDate 
                                                                ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shadow-sm' 
                                                                : 'bg-zinc-100 dark:bg-zinc-800/40 hover:bg-zinc-200/60 text-gray-500 dark:text-gray-400'
                                                            }`}
                                                        >
                                                            {seg.linkDateToPrevDate ? (
                                                                <>📅 Synced to {prevSegment.date}</>
                                                            ) : (
                                                                <>📅 Link date to previous ({prevSegment.date})</>
                                                            )}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Timeline error/validation block */}
                                {!validation.isValid && (
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-red-500/10 p-4 border border-red-500/15 rounded-3xl text-xs mt-4">
                                        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold">
                                            <span>⚠️</span>
                                            <span>{validation.errorMessage}</span>
                                        </div>
                                        <Button 
                                            variant="secondary" 
                                            size="sm" 
                                            className="bg-white/90 dark:bg-zinc-800 text-[10px] font-extrabold py-1.5 px-3 rounded-xl border border-red-500/10 hover:bg-white dark:hover:bg-zinc-700 cursor-pointer shadow-sm text-red-500 hover:text-red-600"
                                            onClick={() => autoResolveTimelineOverlap(legIdx)}
                                        >
                                            Auto-Align Timeline
                                        </Button>
                                    </div>
                                )}

                                {/* Internal leg stats footer with duration */}
                                <div className="mt-5 flex justify-between items-center text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">
                                    <div className="flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                        <span>Duration: <span className="text-gray-700 dark:text-zinc-350">{validation.durationText}</span> ({validation.startDate} to {validation.endDate})</span>
                                    </div>
                                    <span>{leg.segments.length} segment{leg.segments.length > 1 ? 's' : ''} in Leg</span>
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>

                {/* Add Segment Leg button */}
                <div className="flex pt-2">
                    <button 
                        onClick={addLeg}
                        className="flex items-center gap-2.5 px-6 py-5 border-2 border-dashed border-slate-200 dark:border-white/10 hover:border-blue-500 dark:hover:border-blue-400 text-slate-550 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-300 rounded-[2.5rem] w-full justify-center transition-all bg-white/40 dark:bg-slate-900/10 font-bold uppercase tracking-wider text-xs shadow-inner cursor-pointer"
                    >
                        <Plus className="w-4 h-4 animate-bounce" /> Add Separate Journey Leg
                    </button>
                </div>
            </div>

            {/* Right Column - Save Panel */}
            <div className="lg:col-span-4 space-y-6">
                <Card title="Itinerary Dispatch" className="shadow-lg">
                    <div className="space-y-4">
                        <p className="text-xs text-gray-400 leading-normal">
                            Apply and lock all changed georoutes, separate legs, sequence linkages, and segment transit routes to the master trip database instantly.
                        </p>

                        {hasTimelineOverlaps && (
                            <div className="bg-red-500/10 p-3.5 border border-red-500/15 rounded-2xl text-[10px] text-red-600 dark:text-red-400 font-bold leading-normal">
                                🚫 Save Disabled: You must resolve timeline overlaps between consecutive route legs before saving. Use the auto-align alignment buttons to fix issues instantly.
                            </div>
                        )}

                        <div className="space-y-2 mt-4">
                            <Button 
                                variant="primary" 
                                className="w-full" 
                                size="lg" 
                                isLoading={isSaving}
                                disabled={hasTimelineOverlaps}
                                onClick={triggerSaveRoute}
                            >
                                Save Itinerary Changes
                            </Button>
                            <Button 
                                variant="outline" 
                                className="w-full !border-gray-200 hover:!border-gray-300 dark:!border-white/10 dark:hover:!border-white/15 text-gray-500 hover:text-gray-700" 
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
                        <div className="flex gap-3 bg-emerald-500/10 p-4 rounded-3xl border border-emerald-500/15">
                            <Earth className="w-6 h-6 text-emerald-500 shrink-0 animate-spin-slow" />
                            <div>
                                <div className="text-xs font-black text-emerald-800 dark:text-emerald-400 uppercase tracking-widest leading-none">Carbon Offset Registered</div>
                                <div className="text-[10px] text-gray-505 mt-1.5 leading-normal">
                                    This route produces a total estimated overhead of <span className="font-extrabold text-emerald-600 dark:text-emerald-450">{statsCarbonEmissions} kg CO2</span>.
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex justify-between items-center text-xs border-b border-gray-150/40 dark:border-white/5 pb-2.5 font-sans font-medium">
                                <span className="text-gray-400">Carbon offset rating</span>
                                <span className="font-extrabold text-emerald-600 dark:text-emerald-500">Gold Certified</span>
                            </div>
                            <div className="flex justify-between items-center text-xs border-b border-gray-150/40 dark:border-white/5 pb-2.5 font-sans font-medium">
                                <span className="text-gray-400 font-sans">Eco Contribution</span>
                                <span className="font-bold text-gray-600 dark:text-zinc-350">$0.00 (Sponsored)</span>
                            </div>
                            <div className="flex justify-between items-center text-xs font-sans font-medium">
                                <span className="text-gray-400">Mitigation projects</span>
                                <span className="font-bold text-gray-605 dark:text-zinc-310">Amazon Reforestation</span>
                            </div>
                        </div>
                        
                        <p className="text-[10px] text-zinc-400 leading-normal bg-zinc-50 dark:bg-zinc-950/40 p-3.5 rounded-2xl border border-gray-150/50 dark:border-white/5">
                            🌳 WanderGrid matches every flight, rail, and road trip emissions with GoldStandard carbon-offset investments. Enjoy carbon-neutral travel tracking automatically.
                        </p>
                    </div>
                </Card>
            </div>
        </div>
    );
};
