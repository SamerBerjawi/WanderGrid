import React, { useState } from 'react';
import { Boat, Clock, X } from '@phosphor-icons/react';
import { Input, Autocomplete, TimeInput, Select } from '../ui';
import { SegmentForm } from './transportTypes';
import { DurationInput } from './DurationInput';
import { searchLocations, getCoordinates, calculateDistance } from '../../services/geocoding';

interface CruiseFormProps {
    segment: SegmentForm;
    index: number;
    totalSegments: number;
    tripType: 'Round Trip' | 'One-Way' | 'Multi-City';
    onUpdate: (updates: Partial<SegmentForm>) => void;
    onRemove?: () => void;
}

export const CruiseForm: React.FC<CruiseFormProps> = ({
    segment,
    index,
    totalSegments,
    tripType,
    onUpdate,
    onRemove
}) => {
    const [isAutoCalc, setIsAutoCalc] = useState(false);

    const fetchPortSuggestions = async (query: string) => {
        if (!query || query.length < 2) return [];
        return searchLocations(`${query} port`);
    };

    const handleAutoCalcDuration = async () => {
        if (!segment.origin || !segment.destination) return;
        setIsAutoCalc(true);
        try {
            const [c1, c2] = await Promise.all([
                getCoordinates(segment.origin),
                getCoordinates(segment.destination)
            ]);
            if (c1 && c2) {
                const dist = calculateDistance(c1.lat, c1.lng, c2.lat, c2.lng);
                // Avg maritime speed ~35 km/h
                const estMinutes = Math.round((dist / 35) * 60) + 20;
                onUpdate({ distance: dist, duration: estMinutes });
            }
        } catch (e) {
            console.warn("Could not calculate maritime distance:", e);
        } finally {
            setIsAutoCalc(false);
        }
    };

    const sectionBadgeColor = segment.section === 'return' 
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' 
        : 'bg-primary-500/10 text-primary-600 dark:text-primary-400';

    return (
        <div className="p-5 rounded-3xl bg-white/50 dark:bg-white/[0.04] backdrop-blur-md border border-black/8 dark:border-white/10 space-y-4 relative shadow-xs">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-2xs font-bold uppercase tracking-wider ${sectionBadgeColor}`}>
                        {tripType === 'Round Trip' ? (segment.section === 'return' ? 'Return Voyage' : 'Outbound Voyage') : `Voyage ${index + 1}`}
                    </span>
                    {segment.distance ? (
                        <span className="text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary">
                            {segment.distance.toLocaleString()} km
                        </span>
                    ) : null}
                </div>
                {onRemove && totalSegments > 1 && (
                    <button 
                        type="button"
                        onClick={onRemove}
                        className="text-light-text-secondary hover:text-semantic-red p-1 rounded-lg transition-colors cursor-pointer"
                        aria-label="Remove voyage leg"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Line & Ship / Vessel Name */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input 
                    label="Ferry / Cruise Line" 
                    placeholder="e.g. Royal Caribbean, Blue Star Ferries, DFDS, MSC" 
                    value={segment.provider} 
                    onChange={e => onUpdate({ provider: e.target.value })} 
                />
                <Input 
                    label="Vessel / Ship Name" 
                    placeholder="e.g. Symphony of the Seas or Delos" 
                    value={segment.identifier} 
                    onChange={e => onUpdate({ identifier: e.target.value })} 
                />
            </div>

            {/* Ports row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Autocomplete 
                    label="Departure Port / Terminal" 
                    placeholder="e.g. PortMiami or Piraeus Port, Athens" 
                    value={segment.origin} 
                    onChange={val => onUpdate({ origin: val })} 
                    fetchSuggestions={fetchPortSuggestions} 
                />
                <Autocomplete 
                    label="Arrival Port / Island" 
                    placeholder="e.g. Barcelona or Thira Port, Santorini" 
                    value={segment.destination} 
                    onChange={val => onUpdate({ destination: val })} 
                    fetchSuggestions={fetchPortSuggestions} 
                />
            </div>

            {/* Schedule row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-2xl bg-white/60 dark:bg-white/[0.04] backdrop-blur-md border border-black/6 dark:border-white/10 space-y-2 shadow-xs">
                    <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Embarkation
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                        <Input 
                            label="Date" 
                            type="date" 
                            value={segment.date} 
                            onChange={e => onUpdate({ date: e.target.value })} 
                        />
                        <TimeInput 
                            label="Time" 
                            value={segment.time} 
                            onChange={val => onUpdate({ time: val })} 
                        />
                    </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/60 dark:bg-white/[0.04] backdrop-blur-md border border-black/6 dark:border-white/10 space-y-2 shadow-xs">
                    <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Disembarkation
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                        <Input 
                            label="Date" 
                            type="date" 
                            value={segment.arrivalDate || segment.date} 
                            onChange={e => onUpdate({ arrivalDate: e.target.value })} 
                        />
                        <TimeInput 
                            label="Time" 
                            value={segment.arrivalTime} 
                            onChange={val => onUpdate({ arrivalTime: val })} 
                        />
                    </div>
                </div>
            </div>

            {/* Stateroom / Cabin / Seat & Duration */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <Select 
                    label="Booking Tier / Category" 
                    options={[
                        { label: 'Deck / Economy Seat', value: 'Economy' },
                        { label: 'Club / Premium Seat', value: 'Premium Economy' },
                        { label: 'Interior / Ocean View Cabin', value: 'Business' },
                        { label: 'Balcony / Suite Cabin', value: 'First' }
                    ]} 
                    value={segment.travelClass} 
                    onChange={e => onUpdate({ travelClass: e.target.value })} 
                />
                <Input 
                    label="Cabin / Seat / Berth #" 
                    placeholder="e.g. Cabin 9214, Seat 45, Berth 12" 
                    value={segment.seatNumber} 
                    onChange={e => onUpdate({ seatNumber: e.target.value })} 
                />
                <DurationInput 
                    minutes={segment.duration} 
                    onChange={dur => onUpdate({ duration: dur })} 
                    onAutoCalc={handleAutoCalcDuration} 
                    canAutoCalc={Boolean(segment.origin && segment.destination)} 
                />
            </div>
        </div>
    );
};
