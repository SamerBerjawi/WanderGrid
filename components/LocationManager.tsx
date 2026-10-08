import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
    Airplane as Plane, 
    Train, 
    Bus, 
    NavigationArrow as Navigation, 
    CalendarBlank as Calendar, 
    Trash as Trash2, 
    Plus, 
    MapPin, 
    ArrowUp, 
    ArrowDown, 
    Compass, 
    Lock, 
    LockOpen as Unlock, 
    Path as Route, 
    Globe as Earth, 
    DotsSixVertical as GripVertical 
} from '@phosphor-icons/react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Input, Autocomplete, Select, Card, Badge } from './ui';
import GlassPanel from './glass/GlassPanel';
import { LocationEntry, Transport, TransportMode } from '../types';
import { searchLocations, getCoordinates, getCoordinatesSync, calculateDistance } from '../services/geocoding';
import { syncPitStopsToVisited } from '../services/pitStopSync';

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
    originalTransport?: Transport;
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
    'Cruise': 150,
    'Ferry': 100
};

interface SortableLegCardProps {
    leg: JourneyLeg;
    legIdx: number;
    legsCount: number;
    legs: JourneyLeg[];
    validation: {
        legId: string;
        title: string;
        startDate: string;
        endDate: string;
        durationText: string;
        isValid: boolean;
        errorMessage: string;
    };
    renameLeg: (legId: string, newTitle: string) => void;
    addSegment: (legId: string) => void;
    deleteLeg: (legId: string) => void;
    deleteSegment: (legId: string, segmentId: string) => void;
    moveSegment: (legId: string, idx: number, direction: 'up' | 'down') => void;
    moveSegmentToLeg: (fromLegId: string, segmentId: string, toLegId: string) => void;
    updateSegment: (legId: string, segmentId: string, field: keyof RouteSegment, value: any) => void;
    toggleLinkStart: (legId: string, segmentId: string, prevDest: string) => void;
    toggleLinkDate: (legId: string, segmentId: string, prevDate: string) => void;
    autoResolveTimelineOverlap: (legIndex: number) => void;
}

const SortableLegCard: React.FC<SortableLegCardProps> = ({
    leg,
    legIdx,
    legsCount,
    legs,
    validation,
    renameLeg,
    addSegment,
    deleteLeg,
    deleteSegment,
    moveSegment,
    moveSegmentToLeg,
    updateSegment,
    toggleLinkStart,
    toggleLinkDate,
    autoResolveTimelineOverlap
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: leg.id });

    const style: React.CSSProperties = {
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 30 : 1,
        opacity: isDragging ? 0.75 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} className="relative">
            <GlassPanel
                className={`wg-glass-card rounded-[28px] overflow-hidden p-6 transition-all duration-200 border ${
                    isDragging ? 'ring-2 ring-primary-500 shadow-xl' : 'border-black/5 dark:border-white/10'
                }`}
                overrides={{ borderRadius: 28 }}
                padding="0px"
            >
                {/* Leg Title Header */}
                <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-4 mb-6">
                    <div className="flex items-center gap-3 w-full max-w-md">
                        {/* Accessible Drag Handle */}
                        <div 
                            {...attributes}
                            {...listeners}
                            className="p-2 rounded-xl text-light-text-secondary hover:text-light-text dark:hover:text-dark-text hover:bg-black/5 dark:hover:bg-white/5 cursor-grab active:cursor-grabbing shrink-0 touch-none transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                            title="Grab to reorder itinerary excursion"
                            aria-label={`Reorder ${leg.title}`}
                        >
                            <GripVertical className="w-4 h-4" />
                        </div>

                        <Badge color={legIdx % 2 === 0 ? 'indigo' : 'purple'} className="py-1 px-3 rounded-xl whitespace-nowrap shrink-0">
                            Excursion {legIdx + 1}
                        </Badge>
                        <input
                            type="text"
                            value={leg.title}
                            onChange={(e) => renameLeg(leg.id, e.target.value)}
                            className="text-base font-black tracking-tight bg-transparent border-b border-transparent hover:border-black/10 dark:hover:border-white/10 focus:border-primary-500 focus:ring-0 outline-none w-full text-light-text dark:text-dark-text transition-colors py-0.5 px-1"
                            placeholder="Name this journey sector..."
                        />
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => addSegment(leg.id)}
                            icon={<Plus className="w-4 h-4" />}
                            className="min-h-[44px] font-semibold text-xs rounded-xl"
                        >
                            Add Segment
                        </Button>

                        {legsCount > 1 && (
                            <Button
                                variant="danger"
                                size="sm"
                                onClick={() => deleteLeg(leg.id)}
                                icon={<Trash2 className="w-3.5 h-3.5" />}
                                className="min-h-[44px] min-w-[44px] p-0 !rounded-xl text-rose-500 hover:bg-rose-500/10"
                                title="Delete Entire Excursion"
                                aria-label="Delete Entire Excursion"
                            />
                        )}
                    </div>
                </div>

                {/* Segments table */}
                <div className="space-y-4">
                    {leg.segments.length === 0 ? (
                        <div className="p-6 text-center rounded-2xl bg-black/5 dark:bg-white/[0.02] border border-dashed border-black/10 dark:border-white/10 space-y-2">
                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary font-medium">
                                No transports in this excursion. Add a segment to begin.
                            </p>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => addSegment(leg.id)}
                                icon={<Plus className="w-4 h-4" />}
                                className="text-xs font-bold min-h-[44px]"
                            >
                                Add Segment
                            </Button>
                        </div>
                    ) : (
                        leg.segments.map((seg, idx) => {
                            const isFirst = idx === 0;
                            const isLast = idx === leg.segments.length - 1;
                            const prevSegment = idx > 0 ? leg.segments[idx - 1] : null;

                            return (
                                <div 
                                    key={seg.id} 
                                    className="relative p-5 rounded-2xl bg-white/50 dark:bg-white/[0.05] backdrop-blur-md border border-black/8 dark:border-white/10 hover:border-black/15 dark:hover:border-white/20 transition-all shadow-xs"
                                >
                                    {/* Top Excursion Grouping & Booking Reference Header */}
                                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-3 border-b border-black/5 dark:border-white/5 text-xs">
                                        <div className="flex items-center gap-2">
                                            <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-1">
                                                <Route className="w-3.5 h-3.5 text-primary-500" />
                                                Excursion:
                                            </span>
                                            <div className="w-48 sm:w-56">
                                                <Select
                                                    value={leg.id}
                                                    onChange={(e) => moveSegmentToLeg(leg.id, seg.id, e.target.value)}
                                                    options={[
                                                        ...legs.map((l, lIdx) => ({
                                                            value: l.id,
                                                            label: l.title || `Excursion ${lIdx + 1}`
                                                        })),
                                                        { value: 'new', label: '+ Move to New Excursion...' }
                                                    ]}
                                                />
                                            </div>
                                        </div>

                                        {seg.originalTransport && (
                                            <div className="flex items-center gap-2">
                                                {seg.originalTransport.provider && (
                                                    <span className="px-2.5 py-1 rounded-full text-2xs font-bold bg-black/5 dark:bg-white/5 text-light-text dark:text-dark-text border border-black/5 dark:border-white/5">
                                                        {seg.originalTransport.provider}
                                                    </span>
                                                )}
                                                {seg.originalTransport.confirmationCode && (
                                                    <span className="px-2.5 py-1 rounded-full text-2xs font-mono font-bold bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20">
                                                        {seg.originalTransport.confirmationCode}
                                                    </span>
                                                )}
                                                {seg.originalTransport.cost !== undefined && seg.originalTransport.cost > 0 && (
                                                    <span className="px-2.5 py-1 rounded-full text-2xs font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                                        ${seg.originalTransport.cost}
                                                    </span>
                                                )}
                                                {seg.originalTransport.distance !== undefined && seg.originalTransport.distance > 0 && (
                                                    <span className="px-2.5 py-1 rounded-full text-2xs font-mono font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                                        {seg.originalTransport.distance.toLocaleString()} km
                                                        {seg.originalTransport.duration ? ` · ${Math.floor(seg.originalTransport.duration / 60)}h ${seg.originalTransport.duration % 60}m` : ''}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>


                                    {/* Road Trip Pit Stops summary if available */}
                                    {seg.originalTransport?.waypoints && seg.originalTransport.waypoints.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-1.5 mb-3 p-2.5 rounded-2xl bg-primary-500/5 border border-primary-500/15 text-2xs">
                                            <span className="font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400 flex items-center gap-1">
                                                <MapPin className="w-3.5 h-3.5" />
                                                {seg.originalTransport.waypoints.length} Pit Stop{seg.originalTransport.waypoints.length > 1 ? 's' : ''}:
                                            </span>
                                            <span className="text-light-text dark:text-dark-text font-medium">
                                                {seg.originalTransport.waypoints.map(w => w.name).join(' → ')}
                                            </span>
                                        </div>
                                    )}

                                    {/* Grid layout */}
                                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 sm:gap-4 items-start">
                                    
                                        {/* Start City Selection with Inline Lock Toggle */}
                                        <div className="md:col-span-3 space-y-1.5 min-w-0 relative">
                                            <div className="flex items-center justify-between h-5">
                                                <label className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">Start City</label>
                                                {prevSegment ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleLinkStart(leg.id, seg.id, prevSegment.destination)}
                                                        className={`p-1 rounded-lg transition-colors cursor-pointer min-w-[32px] min-h-[32px] flex items-center justify-center ${
                                                            seg.linkStartToPrevDest 
                                                            ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30' 
                                                            : 'text-light-text-secondary hover:text-light-text dark:hover:text-dark-text hover:bg-black/5 dark:hover:bg-white/5'
                                                        }`}
                                                        title={seg.linkStartToPrevDest ? "Unlock start destination" : `Link start destination to previous stop (${prevSegment.destination})`}
                                                        aria-label="Toggle start destination link"
                                                    >
                                                        {seg.linkStartToPrevDest ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                                                    </button>
                                                ) : <span className="h-3.5 w-3.5" />}
                                            </div>
                                            
                                            {seg.linkStartToPrevDest && prevSegment ? (
                                                <div className="w-full px-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-light-text dark:text-dark-text text-xs font-bold flex items-center justify-between min-h-[44px]">
                                                    <span className="truncate pr-1">{prevSegment.destination || "Pending destination..."}</span>
                                                    <Badge color="indigo" className="text-2xs font-bold shrink-0 whitespace-nowrap">LINKED</Badge>
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
                                        <div className="md:col-span-3 space-y-1.5 min-w-0">
                                            <div className="flex items-center justify-between h-5">
                                                <label className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">Destination</label>
                                            </div>
                                            <Autocomplete
                                                placeholder="Where to?"
                                                value={seg.destination}
                                                onChange={(val) => updateSegment(leg.id, seg.id, 'destination', val)}
                                                fetchSuggestions={searchLocations}
                                            />
                                        </div>

                                        {/* Departure Date Picker with Link Toggle */}
                                        <div className="md:col-span-2 space-y-1.5 min-w-0">
                                            <div className="flex items-center justify-between h-5">
                                                <label className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">Departure</label>
                                                {prevSegment ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleLinkDate(leg.id, seg.id, prevSegment.date)}
                                                        className={`p-1 rounded-lg transition-colors cursor-pointer min-w-[32px] min-h-[32px] flex items-center justify-center ${
                                                            seg.linkDateToPrevDate 
                                                            ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30' 
                                                            : 'text-light-text-secondary hover:text-light-text dark:hover:text-dark-text hover:bg-black/5 dark:hover:bg-white/5'
                                                        }`}
                                                        title={seg.linkDateToPrevDate ? "Unlock departure date" : `Link departure date to previous stop (${prevSegment.date})`}
                                                        aria-label="Toggle departure date link"
                                                    >
                                                        {seg.linkDateToPrevDate ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                                                    </button>
                                                ) : <span className="h-3.5 w-3.5" />}
                                            </div>

                                            {seg.linkDateToPrevDate && prevSegment ? (
                                                <div className="w-full px-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-light-text dark:text-dark-text text-xs font-bold flex items-center justify-between min-h-[44px]">
                                                    <span className="truncate pr-1">{prevSegment.date}</span>
                                                    <Badge color="indigo" className="text-2xs font-bold shrink-0 whitespace-nowrap">LINKED</Badge>
                                                </div>
                                            ) : (
                                                <Input
                                                    type="date"
                                                    value={seg.date}
                                                    onChange={(e) => updateSegment(leg.id, seg.id, 'date', e.target.value)}
                                                />
                                            )}
                                        </div>

                                        {/* Transport Mode Selection */}
                                        <div className="md:col-span-2 space-y-1.5 min-w-0">
                                            <div className="flex items-center justify-between h-5">
                                                <label className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">Transport</label>
                                            </div>
                                            <Select
                                                value={seg.transportMode}
                                                onChange={(e) => updateSegment(leg.id, seg.id, 'transportMode', e.target.value as TransportMode)}
                                                options={[
                                                    { label: '✈️ Flight', value: 'Flight' },
                                                    { label: '🚄 Train', value: 'Train' },
                                                    { label: '🚌 Bus', value: 'Bus' },
                                                    { label: '🚗 Rental Car', value: 'Car Rental' },
                                                    { label: '🚘 Own Car', value: 'Personal Car' },
                                                    { label: '🚢 Ferry / Cruise', value: 'Cruise' }
                                                ]}
                                            />
                                        </div>

                                        {/* Reorders & Deletion controls */}
                                        <div className="md:col-span-2 space-y-1.5 min-w-0">
                                            <div className="flex items-center justify-end h-5">
                                                <span className="text-2xs font-bold uppercase tracking-wider text-transparent select-none">Actions</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 min-h-[44px] justify-end shrink-0">
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    onClick={() => moveSegment(leg.id, idx, 'up')}
                                                    disabled={isFirst}
                                                    className={`min-h-[44px] min-w-[44px] p-0 rounded-xl ${isFirst ? 'opacity-30 cursor-not-allowed' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}
                                                    title={isFirst ? undefined : "Move segment up"}
                                                    aria-label="Move segment up"
                                                >
                                                    <ArrowUp className="w-3.5 h-3.5" />
                                                </Button>
                                                
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    onClick={() => moveSegment(leg.id, idx, 'down')}
                                                    disabled={isLast}
                                                    className={`min-h-[44px] min-w-[44px] p-0 rounded-xl ${isLast ? 'opacity-30 cursor-not-allowed' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}
                                                    title={isLast ? undefined : "Move segment down"}
                                                    aria-label="Move segment down"
                                                >
                                                    <ArrowDown className="w-3.5 h-3.5" />
                                                </Button>

                                                {leg.segments.length > 1 && (
                                                    <Button 
                                                        variant="danger" 
                                                        size="sm" 
                                                        onClick={() => deleteSegment(leg.id, seg.id)}
                                                        className="min-h-[44px] min-w-[44px] p-0 rounded-xl text-rose-500 hover:bg-rose-500/10 border-0 shrink-0"
                                                        title="Delete segment"
                                                        aria-label="Delete segment"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Linking triggers */}
                                    {prevSegment && (
                                        <div className="flex flex-wrap gap-2.5 mt-3.5 border-t border-black/5 dark:border-white/5 pt-3.5 text-xs text-light-text-secondary">
                                            <span className="font-bold uppercase text-2xs tracking-wider flex items-center gap-1 mt-1 shrink-0">
                                                Connections:
                                            </span>
                                            
                                            <button
                                                type="button"
                                                onClick={() => toggleLinkStart(leg.id, seg.id, prevSegment.destination)}
                                                className={`px-3 py-1 rounded-full text-2xs font-bold tracking-tight transition-all flex items-center gap-1 cursor-pointer min-h-[32px] ${
                                                    seg.linkStartToPrevDest 
                                                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shadow-sm' 
                                                    : 'bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-light-text-secondary'
                                                }`}
                                            >
                                                {seg.linkStartToPrevDest ? (
                                                    <>Locked to {prevSegment.destination || "stop"}</>
                                                ) : (
                                                    <>Link start to previous stop ({prevSegment.destination || "stop"})</>
                                                )}
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => toggleLinkDate(leg.id, seg.id, prevSegment.date)}
                                                className={`px-3 py-1 rounded-full text-2xs font-bold tracking-tight transition-all flex items-center gap-1 cursor-pointer min-h-[32px] ${
                                                    seg.linkDateToPrevDate 
                                                    ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shadow-sm' 
                                                    : 'bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-light-text-secondary'
                                                }`}
                                            >
                                                {seg.linkDateToPrevDate ? (
                                                    <>Synced to {prevSegment.date}</>
                                                ) : (
                                                    <>Link date to previous ({prevSegment.date})</>
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Timeline error/validation block */}
                {!validation.isValid && (
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-rose-500/10 p-4 border border-rose-500/20 rounded-2xl text-xs mt-4">
                        <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold">
                            <span>⚠️</span>
                            <span>{validation.errorMessage}</span>
                        </div>
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            className="text-xs font-bold py-1.5 px-3 rounded-xl border border-rose-500/20 text-rose-500 hover:text-rose-600 min-h-[44px]"
                            onClick={() => autoResolveTimelineOverlap(legIdx)}
                        >
                            Auto-Align Timeline
                        </Button>
                    </div>
                )}

                {/* Internal leg stats footer with duration */}
                <div className="mt-5 flex justify-between items-center text-xs font-bold uppercase text-light-text-secondary dark:text-dark-text-secondary tracking-wider">
                    <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-light-text-secondary" />
                        <span>Duration: <span className="text-light-text dark:text-dark-text">{validation.durationText}</span> ({validation.startDate} to {validation.endDate})</span>
                    </div>
                    <span>{leg.segments.length} segment{leg.segments.length > 1 ? 's' : ''} in excursion</span>
                </div>
            </GlassPanel>
        </div>
    );
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
    const [coordsCache, setCoordsCache] = useState<Record<string, { lat: number; lng: number }>>({});

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    useEffect(() => {
        initializeRoute();
    }, [locations, transports]);

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
        const routeTransports = (transports || []).filter(tx => 
            tx.mode !== 'Flight' || tx.isExcursion || tx.customFields?.some(f => f.key === 'legId')
        );

        if (routeTransports.length === 0) {
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
                    title: 'Excursion 1',
                    segments
                }]);
            } else {
                setLegs([{
                    id: 'leg-1',
                    title: 'Excursion 1',
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
        const unassignedTransports: Transport[] = [];

        routeTransports.forEach(tx => {
            const legIdField = tx.customFields?.find(f => f.key === 'legId')?.value;
            const legTitleField = tx.customFields?.find(f => f.key === 'legTitle')?.value;

            if (legIdField) {
                if (!legGroups[legIdField]) {
                    legGroups[legIdField] = { title: legTitleField || 'Excursion', txs: [] };
                }
                legGroups[legIdField].txs.push(tx);
            } else if (legTitleField) {
                const derivedLegId = 'leg-' + legTitleField.toLowerCase().replace(/[^a-z0-9]/g, '-');
                if (!legGroups[derivedLegId]) {
                    legGroups[derivedLegId] = { title: legTitleField, txs: [] };
                }
                legGroups[derivedLegId].txs.push(tx);
            } else {
                unassignedTransports.push(tx);
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
                    linkDateToPrevDate,
                    originalTransport: tx
                };
            });

            parsedLegs.push({
                id: legId,
                title: group.title,
                segments
            });
        });

        if (unassignedTransports.length > 0) {
            const sortedUnassigned = [...unassignedTransports].sort((a, b) => new Date(a.departureDate).getTime() - new Date(b.departureDate).getTime());
            const segments: RouteSegment[] = sortedUnassigned.map((tx, idx) => {
                const prevTx = idx > 0 ? sortedUnassigned[idx - 1] : null;
                const linkStartToPrevDest = prevTx ? tx.origin.toLowerCase().trim() === prevTx.destination.toLowerCase().trim() : false;
                const linkDateToPrevDate = prevTx ? tx.departureDate === prevTx.departureDate : false;

                return {
                    id: tx.id || `seg-${Math.random().toString(36).substring(2, 9)}`,
                    startCity: tx.origin,
                    destination: tx.destination,
                    date: tx.departureDate || defaultStartDate,
                    transportMode: tx.mode || 'Train',
                    linkStartToPrevDest,
                    linkDateToPrevDate,
                    originalTransport: tx
                };
            });

            parsedLegs.push({
                id: 'leg-main',
                title: 'Main Route',
                segments
            });
        }

        if (parsedLegs.length === 0) {
            parsedLegs.push({
                id: 'leg-1',
                title: 'Excursion 1',
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

    const parseDateString = (dStr: string) => {
        if (!dStr) return null;
        const parts = dStr.split('-');
        if (parts.length === 3) {
            return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        }
        return new Date(dStr);
    };

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

    const legValidations = legs.map((leg) => {
        const dates = compileLegDates(leg);
        return {
            legId: leg.id,
            title: leg.title,
            startDate: dates.startDate,
            endDate: dates.endDate,
            durationText: dates.durationText,
            isValid: true,
            errorMessage: ''
        };
    });

    const hasTimelineOverlaps = legValidations.some(v => !v.isValid);

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

    const toggleLinkStart = (legId: string, segmentId: string, prevDest: string) => {
        setLegs(prevLegs => prevLegs.map(leg => {
            if (leg.id !== legId) return leg;
            const updatedSegments = leg.segments.map((seg) => {
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
            const updatedSegments = leg.segments.map((seg) => {
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
                title: `Excursion ${prev.length + 1}`,
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

    const moveSegmentToLeg = (fromLegId: string, segmentId: string, toLegId: string) => {
        setLegs(prevLegs => {
            let movingSeg: RouteSegment | null = null;
            const updatedLegs = prevLegs.map(leg => {
                if (leg.id === fromLegId) {
                    const seg = leg.segments.find(s => s.id === segmentId);
                    if (seg) movingSeg = seg;
                    return {
                        ...leg,
                        segments: leg.segments.filter(s => s.id !== segmentId)
                    };
                }
                return leg;
            });

            if (!movingSeg) return prevLegs;

            const detachedSeg: RouteSegment = {
                ...movingSeg,
                linkStartToPrevDest: false,
                linkDateToPrevDate: false
            };

            if (toLegId === 'new') {
                const nextLegId = `leg-${Math.random().toString(36).substring(2, 9)}`;
                return [
                    ...updatedLegs,
                    {
                        id: nextLegId,
                        title: `Excursion ${updatedLegs.length + 1}`,
                        segments: [detachedSeg]
                    }
                ];
            }

            return updatedLegs.map(leg => {
                if (leg.id === toLegId) {
                    return {
                        ...leg,
                        segments: [...leg.segments, detachedSeg]
                    };
                }
                return leg;
            });
        });
    };

    // dnd-kit DragEnd handler
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setLegs(items => {
                const oldIndex = items.findIndex(i => i.id === active.id);
                const newIndex = items.findIndex(i => i.id === over.id);
                if (oldIndex === -1 || newIndex === -1) return items;
                const updated = arrayMove(items, oldIndex, newIndex);
                return updated.map((leg, idx) => {
                    if (leg.title.startsWith('Leg ') || leg.title.startsWith('Excursion ')) {
                        return { ...leg, title: `Excursion ${idx + 1}` };
                    }
                    return leg;
                });
            });
        }
    };

    const triggerSaveRoute = async () => {
        if (hasTimelineOverlaps) return;

        setIsSaving(true);
        try {
            const preservedFlights = (transports || []).filter(tx => tx.mode === 'Flight' && !tx.isExcursion && !tx.customFields?.some(f => f.key === 'legId'));
            const finalTransports: Transport[] = [...preservedFlights];

            legs.forEach(leg => {
                leg.segments.forEach(seg => {
                    if (seg.originalTransport) {
                        const existing = finalTransports.find(t => t.id === seg.originalTransport?.id);
                        if (!existing) {
                            finalTransports.push({
                                ...seg.originalTransport,
                                origin: seg.startCity,
                                destination: seg.destination,
                                departureDate: seg.date,
                                mode: seg.transportMode,
                                customFields: [
                                    ...(seg.originalTransport.customFields?.filter(f => f.key !== 'legId' && f.key !== 'legTitle') || []),
                                    { key: 'legId', value: leg.id },
                                    { key: 'legTitle', value: leg.title }
                                ]
                            });
                        }
                    } else {
                        finalTransports.push({
                            id: `tr-${Math.random().toString(36).substring(2, 9)}`,
                            itineraryId: '',
                            confirmationCode: 'CONF-NEW',
                            origin: seg.startCity,
                            destination: seg.destination,
                            departureDate: seg.date,
                            departureTime: '12:00',
                            arrivalDate: seg.date,
                            arrivalTime: '14:00',
                            mode: seg.transportMode,
                            type: 'One-Way',
                            provider: seg.transportMode === 'Train' ? 'Railway Express' : seg.transportMode === 'Bus' ? 'Coach' : 'Rental Partner',
                            identifier: 'CONF-NEW',
                            cost: 0,
                            customFields: [
                                { key: 'legId', value: leg.id },
                                { key: 'legTitle', value: leg.title }
                            ]
                        });
                    }
                });
            });

            for (const t of finalTransports) {
                if (t.waypoints && t.waypoints.length > 0) {
                    void syncPitStopsToVisited(t.waypoints, {
                        date: t.departureDate,
                        origin: t.origin,
                        destination: t.destination
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
                                startDate: seg.date,
                                endDate: seg.date,
                                description: 'Overnight',
                                coordinates: sCoords ? { lat: sCoords.lat, lng: sCoords.lng } : undefined
                            });
                            addedLocations.add(startLocId);
                        }
                    }

                    const nextSeg = leg.segments[idx + 1];
                    const nextDate = nextSeg ? nextSeg.date : seg.date;
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-light-text dark:text-dark-text">
            {/* Top Stats Dashboard Section */}
            <div className="lg:col-span-12">
                <GlassPanel
                    className="wg-glass-card rounded-[28px] overflow-hidden p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 border border-black/5 dark:border-white/10"
                    overrides={{ borderRadius: 28 }}
                    padding="0px"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-primary-500/10 border border-primary-500/20 text-primary-500 flex items-center justify-center shrink-0 shadow-sm">
                            <Route className="w-6 h-6 text-primary-500" weight="duotone" />
                        </div>
                        <div>
                            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-light-text dark:text-dark-text">
                                Multi-Stop Route Builder
                            </h2>
                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary font-medium mt-0.5">
                                Drag to reorder excursions, connect stop destinations, and synchronize dates.
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-3 items-center">
                        <div className="bg-white/50 dark:bg-white/[0.05] backdrop-blur-md px-5 py-3 rounded-2xl border border-black/5 dark:border-white/10 flex flex-col min-w-[120px]">
                            <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">Total Distance</span>
                            <span className="text-xl font-black tracking-tight mt-0.5 text-light-text dark:text-dark-text">{statsDistance.toLocaleString()} km</span>
                        </div>
                        <div className="bg-white/50 dark:bg-white/[0.05] backdrop-blur-md px-5 py-3 rounded-2xl border border-black/5 dark:border-white/10 flex flex-col min-w-[120px]">
                            <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">Estimated CO2</span>
                            <span className="text-xl font-black tracking-tight mt-0.5 text-emerald-600 dark:text-emerald-400 font-mono">{statsCarbonEmissions} kg</span>
                        </div>
                    </div>
                </GlassPanel>
            </div>

            {/* Left Content Column - Legs & Rows Panel with dnd-kit Sortable */}
            <div className="lg:col-span-8 space-y-6">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={legs.map(l => l.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        <div className="space-y-6">
                            {legs.map((leg, legIdx) => (
                                <SortableLegCard
                                    key={leg.id}
                                    leg={leg}
                                    legIdx={legIdx}
                                    legsCount={legs.length}
                                    legs={legs}
                                    validation={legValidations[legIdx]}
                                    renameLeg={renameLeg}
                                    addSegment={addSegment}
                                    deleteLeg={deleteLeg}
                                    deleteSegment={deleteSegment}
                                    moveSegment={moveSegment}
                                    moveSegmentToLeg={moveSegmentToLeg}
                                    updateSegment={updateSegment}
                                    toggleLinkStart={toggleLinkStart}
                                    toggleLinkDate={toggleLinkDate}
                                    autoResolveTimelineOverlap={autoResolveTimelineOverlap}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>

                {/* Add Segment Leg button */}
                <div className="flex pt-2">
                    <button 
                        onClick={addLeg}
                        className="flex items-center gap-2.5 px-6 py-4 border-2 border-dashed border-black/10 dark:border-white/10 hover:border-primary-500/50 text-light-text-secondary hover:text-primary-600 dark:hover:text-primary-400 rounded-3xl w-full justify-center transition-all bg-white/30 dark:bg-white/[0.02] font-bold uppercase tracking-wider text-xs cursor-pointer min-h-[48px]"
                    >
                        <Plus className="w-4 h-4" /> Add Separate Excursion / Route Leg
                    </button>
                </div>
            </div>

            {/* Right Column - Save Panel & Eco info */}
            <div className="lg:col-span-4 space-y-6">
                <Card title="Route Synchronization" className="shadow-lg">
                    <div className="space-y-4">
                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary leading-normal">
                            Save linked destinations, transit segments, and sequence changes to your trip itinerary.
                        </p>

                        {hasTimelineOverlaps && (
                            <div className="bg-rose-500/10 p-3.5 border border-rose-500/20 rounded-2xl text-xs text-rose-600 dark:text-rose-400 font-bold leading-normal">
                                Resolve timeline conflicts before saving.
                            </div>
                        )}

                        <div className="space-y-2.5 mt-4">
                            <Button 
                                variant="primary" 
                                className="w-full min-h-[44px]" 
                                size="lg" 
                                isLoading={isSaving}
                                disabled={hasTimelineOverlaps}
                                onClick={triggerSaveRoute}
                            >
                                Save Route Changes
                            </Button>
                            <Button 
                                variant="outline" 
                                className="w-full min-h-[44px]" 
                                size="lg"
                                onClick={onCancel}
                            >
                                Discard Changes
                            </Button>
                        </div>
                    </div>
                </Card>

                <Card title="Carbon Footprint Analysis" className="shadow-lg">
                    <div className="space-y-4">
                        <div className="flex gap-3 bg-emerald-500/10 p-4 rounded-2xl border border-emerald-500/20">
                            <Earth className="w-6 h-6 text-emerald-500 shrink-0" weight="duotone" />
                            <div>
                                <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Estimated Emissions</div>
                                <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1">
                                    This route produces an estimated <span className="font-bold text-emerald-600 dark:text-emerald-400">{statsCarbonEmissions} kg CO2</span>.
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2.5 text-xs">
                            <div className="flex justify-between items-center border-b border-black/5 dark:border-white/5 pb-2">
                                <span className="text-light-text-secondary dark:text-dark-text-secondary">Rail & Bus Efficiency</span>
                                <span className="font-bold text-emerald-600 dark:text-emerald-400">High Reduction</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-black/5 dark:border-white/5 pb-2">
                                <span className="text-light-text-secondary dark:text-dark-text-secondary">Average Segment Distance</span>
                                <span className="font-bold text-light-text dark:text-dark-text">
                                    {legs.length > 0 ? Math.round(statsDistance / Math.max(1, legs.reduce((a, l) => a + l.segments.length, 0))) : 0} km
                                </span>
                            </div>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
};
