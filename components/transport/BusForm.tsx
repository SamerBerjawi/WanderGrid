import React, { useState } from 'react';
import { Bus, Clock, X } from '@phosphor-icons/react';
import { Input, Autocomplete, TimeInput } from '../ui';
import GlassPanel from '../glass/GlassPanel';
import { SegmentForm } from './transportTypes';
import { DurationInput } from './DurationInput';
import { searchLocations, getCoordinates, calculateDistance } from '../../services/geocoding';

interface BusFormProps {
    segment: SegmentForm;
    index: number;
    totalSegments: number;
    tripType: 'Round Trip' | 'One-Way' | 'Multi-City';
    onUpdate: (updates: Partial<SegmentForm>) => void;
    onRemove?: () => void;
}

export const BusForm: React.FC<BusFormProps> = ({
    segment,
    index,
    totalSegments,
    tripType,
    onUpdate,
    onRemove
}) => {
    const [isAutoCalc, setIsAutoCalc] = useState(false);

    const fetchBusStationSuggestions = async (query: string) => {
        if (!query || query.length < 2) return [];
        return searchLocations(query);
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
                // Avg coach speed ~65 km/h + 20 min buffer
                const estMinutes = Math.round((dist / 65) * 60) + 20;
                onUpdate({ distance: dist, duration: estMinutes });
            }
        } catch (e) {
            console.warn("Could not calculate bus distance:", e);
        } finally {
            setIsAutoCalc(false);
        }
    };

    const sectionBadgeColor = segment.section === 'return' 
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' 
        : 'bg-primary-500/10 text-primary-600 dark:text-primary-400';

    return (
        <GlassPanel className="wg-glass-card w-full shadow-2xl overflow-hidden relative" overrides={{ borderRadius: 28 }} padding="0px">
            <div className="p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-2xs font-bold uppercase tracking-wider ${sectionBadgeColor}`}>
                        {tripType === 'Round Trip' ? (segment.section === 'return' ? 'Return Bus' : 'Outbound Bus') : `Bus Leg ${index + 1}`}
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
                        aria-label="Remove bus leg"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Stations row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Autocomplete 
                    label="Departure Station / Stop" 
                    placeholder="e.g. Victoria Coach Station, London" 
                    value={segment.origin} 
                    onChange={val => onUpdate({ origin: val })} 
                    fetchSuggestions={fetchBusStationSuggestions} 
                />
                <Autocomplete 
                    label="Arrival Station / Stop" 
                    placeholder="e.g. Amsterdam Sloterdijk" 
                    value={segment.destination} 
                    onChange={val => onUpdate({ destination: val })} 
                    fetchSuggestions={fetchBusStationSuggestions} 
                />
            </div>

            {/* Carrier & Line/Service */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input 
                    label="Bus Company / Carrier" 
                    placeholder="e.g. FlixBus, Greyhound, Megabus" 
                    value={segment.provider} 
                    onChange={e => onUpdate({ provider: e.target.value })} 
                />
                <Input 
                    label="Line / Service Number" 
                    placeholder="e.g. Route N815" 
                    value={segment.identifier} 
                    onChange={e => onUpdate({ identifier: e.target.value })} 
                />
            </div>

            {/* Schedule row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-2 shadow-xs">
                    <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Departure
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

                <div className="p-3.5 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-2 shadow-xs">
                    <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Arrival
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

            {/* Seat & Duration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <Input 
                    label="Seat Number" 
                    placeholder="e.g. 12C (Optional)" 
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
        </GlassPanel>
    );
};
