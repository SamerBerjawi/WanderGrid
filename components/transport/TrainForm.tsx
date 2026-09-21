import React, { useState } from 'react';
import { Train, Clock, Armchair, X } from '@phosphor-icons/react';
import { Input, Select, Autocomplete, TimeInput } from '../ui';
import { SegmentForm } from './transportTypes';
import { DurationInput } from './DurationInput';
import { searchStations, getCoordinates, calculateDistance } from '../../services/geocoding';

interface TrainFormProps {
    segment: SegmentForm;
    index: number;
    totalSegments: number;
    tripType: 'Round Trip' | 'One-Way' | 'Multi-City';
    onUpdate: (updates: Partial<SegmentForm>) => void;
    onRemove?: () => void;
}

export const TrainForm: React.FC<TrainFormProps> = ({
    segment,
    index,
    totalSegments,
    tripType,
    onUpdate,
    onRemove
}) => {
    const [isAutoCalc, setIsAutoCalc] = useState(false);

    const fetchStationSuggestions = async (query: string) => {
        if (!query || query.length < 2) return [];
        return searchStations(query);
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
                // Avg train speed ~100-160 km/h + 20 min station stop buffer
                const estMinutes = Math.round((dist / 110) * 60) + 15;
                onUpdate({ distance: dist, duration: estMinutes });
            }
        } catch (e) {
            console.warn("Could not calculate train distance:", e);
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
                        {tripType === 'Round Trip' ? (segment.section === 'return' ? 'Return Train' : 'Outbound Train') : `Train Leg ${index + 1}`}
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
                        aria-label="Remove train leg"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Stations row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Autocomplete 
                    label="Departure Station" 
                    placeholder="e.g. Paris Gare du Nord" 
                    value={segment.origin} 
                    onChange={val => onUpdate({ origin: val })} 
                    fetchSuggestions={fetchStationSuggestions} 
                />
                <Autocomplete 
                    label="Arrival Station" 
                    placeholder="e.g. London St Pancras Int." 
                    value={segment.destination} 
                    onChange={val => onUpdate({ destination: val })} 
                    fetchSuggestions={fetchStationSuggestions} 
                />
            </div>

            {/* Train Operator & Service / Train Number */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input 
                    label="Train Operator / Railway" 
                    placeholder="e.g. Eurostar, SNCF, Deutsche Bahn" 
                    value={segment.provider} 
                    onChange={e => onUpdate({ provider: e.target.value })} 
                />
                <Input 
                    label="Train Number / Service Code" 
                    placeholder="e.g. 9024 or ICE 125" 
                    value={segment.identifier} 
                    onChange={e => onUpdate({ identifier: e.target.value })} 
                />
            </div>

            {/* Schedule row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 rounded-2xl bg-white/70 dark:bg-dark-card/70 border border-black/5 dark:border-white/5 space-y-2">
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

                <div className="p-3 rounded-2xl bg-white/70 dark:bg-dark-card/70 border border-black/5 dark:border-white/5 space-y-2">
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

            {/* Seating, Class & Duration */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <Select 
                    label="Class" 
                    options={[
                        { label: 'Standard / 2nd Class', value: 'Economy' },
                        { label: 'Comfort / Premium', value: 'Premium Economy' },
                        { label: 'First / Business Premier', value: 'Business' }
                    ]} 
                    value={segment.travelClass} 
                    onChange={e => onUpdate({ travelClass: e.target.value })} 
                />
                <Input 
                    label="Coach & Seat" 
                    placeholder="e.g. Coach 4, Seat 21" 
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
