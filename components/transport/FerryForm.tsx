import React, { useState } from 'react';
import { Anchor, Clock, X } from '@phosphor-icons/react';
import { Input, Autocomplete, TimeInput, Select } from '../ui';
import { SegmentForm } from './transportTypes';
import { DurationInput } from './DurationInput';
import { searchLocations, getCoordinates, calculateDistance } from '../../services/geocoding';

interface FerryFormProps {
    segment: SegmentForm;
    index: number;
    totalSegments: number;
    tripType: 'Round Trip' | 'One-Way' | 'Multi-City';
    onUpdate: (updates: Partial<SegmentForm>) => void;
    onRemove?: () => void;
}

export const FerryForm: React.FC<FerryFormProps> = ({
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
                // Avg ferry speed ~35 km/h
                const estMinutes = Math.round((dist / 35) * 60) + 30;
                onUpdate({ distance: dist, duration: estMinutes });
            }
        } catch (e) {
            console.warn("Could not calculate ferry distance:", e);
        } finally {
            setIsAutoCalc(false);
        }
    };

    const sectionBadgeColor = segment.section === 'return' 
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' 
        : 'bg-primary-500/10 text-primary-600 dark:text-primary-400';

    return (
        <div className="p-5 rounded-3xl bg-light-fill dark:bg-dark-fill/50 border border-black/10 dark:border-white/5 space-y-4 relative">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-2xs font-bold uppercase tracking-wider ${sectionBadgeColor}`}>
                        {tripType === 'Round Trip' ? (segment.section === 'return' ? 'Return Ferry' : 'Outbound Ferry') : `Ferry Crossing ${index + 1}`}
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
                        aria-label="Remove ferry leg"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Ports row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Autocomplete 
                    label="Departure Port / Terminal" 
                    placeholder="e.g. Piraeus Port, Athens" 
                    value={segment.origin} 
                    onChange={val => onUpdate({ origin: val })} 
                    fetchSuggestions={fetchPortSuggestions} 
                />
                <Autocomplete 
                    label="Arrival Port / Island" 
                    placeholder="e.g. Thira Port, Santorini" 
                    value={segment.destination} 
                    onChange={val => onUpdate({ destination: val })} 
                    fetchSuggestions={fetchPortSuggestions} 
                />
            </div>

            {/* Ferry Line & Vessel Name */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input 
                    label="Ferry Line / Operator" 
                    placeholder="e.g. Blue Star Ferries, SeaJets, DFDS" 
                    value={segment.provider} 
                    onChange={e => onUpdate({ provider: e.target.value })} 
                />
                <Input 
                    label="Vessel / Ship Name" 
                    placeholder="e.g. Blue Star Delos or WorldChampion Jet" 
                    value={segment.identifier} 
                    onChange={e => onUpdate({ identifier: e.target.value })} 
                />
            </div>

            {/* Schedule row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 rounded-2xl bg-white/70 dark:bg-dark-card/70 border border-black/5 dark:border-white/5 space-y-2">
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

                <div className="p-3 rounded-2xl bg-white/70 dark:bg-dark-card/70 border border-black/5 dark:border-white/5 space-y-2">
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

            {/* Accommodation on board & Duration */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <Select 
                    label="Booking Tier" 
                    options={[
                        { label: 'Deck / Economy Seat', value: 'Economy' },
                        { label: 'Airplane Seat / Club Class', value: 'Premium Economy' },
                        { label: 'Private Cabin / Berth', value: 'Business' }
                    ]} 
                    value={segment.travelClass} 
                    onChange={e => onUpdate({ travelClass: e.target.value })} 
                />
                <Input 
                    label="Cabin / Seat Reference" 
                    placeholder="e.g. Cabin 304 or Seat 45" 
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
