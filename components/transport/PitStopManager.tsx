import React from 'react';
import {
    Plus,
    Trash,
    ArrowUp,
    ArrowDown,
    MapPin,
    Binoculars,
    ForkKnife,
    GasPump,
    Bed,
    Flag,
    CheckCircle,
    Compass
} from '@phosphor-icons/react';
import { RoadTripWaypoint } from '../../types';
import { Autocomplete, Input } from '../ui';
import GlassSelect from '../glass/GlassSelect';
import { searchLocations } from '../../services/geocoding';
import { INPUT_BASE_STYLE } from '../../constants';

interface PitStopManagerProps {
    waypoints: RoadTripWaypoint[];
    onChange: (waypoints: RoadTripWaypoint[]) => void;
    origin?: string;
    destination?: string;
}

const STOP_TYPES: Array<{
    type: RoadTripWaypoint['type'];
    label: string;
    icon: React.ElementType;
}> = [
    { type: 'Sightseeing', label: 'Sightseeing', icon: Binoculars },
    { type: 'Food', label: 'Food / Dining', icon: ForkKnife },
    { type: 'Fuel', label: 'Fuel / Charge', icon: GasPump },
    { type: 'Lodging', label: 'Lodging', icon: Bed },
    { type: 'Stop', label: 'Quick Stop', icon: Flag }
];

export const PitStopManager: React.FC<PitStopManagerProps> = ({
    waypoints,
    onChange,
    origin,
    destination
}) => {
    const fetchLocationSuggestions = async (query: string) => {
        if (!query || query.length < 2) return [];
        return searchLocations(query);
    };

    const handleAddStop = () => {
        const newStop: RoadTripWaypoint = {
            id: `stop-${crypto.randomUUID()}`,
            name: '',
            type: 'Sightseeing',
            notes: '',
            addToVisited: true
        };
        onChange([...waypoints, newStop]);
    };

    const handleUpdateStop = (index: number, updates: Partial<RoadTripWaypoint>) => {
        const next = [...waypoints];
        next[index] = { ...next[index], ...updates };
        onChange(next);
    };

    const handleRemoveStop = (index: number) => {
        onChange(waypoints.filter((_, i) => i !== index));
    };

    const handleMoveStop = (index: number, direction: 'up' | 'down') => {
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= waypoints.length) return;
        const next = [...waypoints];
        const temp = next[index];
        next[index] = next[targetIndex];
        next[targetIndex] = temp;
        onChange(next);
    };

    return (
        <div className="space-y-3 pt-2">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                        <Compass className="w-4 h-4" weight="duotone" />
                    </div>
                    <div>
                        <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
                            Pit Stops Along the Route
                        </span>
                        <p className="text-2xs text-light-text-secondary/80 dark:text-dark-text-secondary/80 font-medium">
                            Stops will automatically be added to your visited places
                        </p>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={handleAddStop}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl bg-primary-500/10 hover:bg-primary-500/20 text-primary-600 dark:text-primary-400 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                    aria-label="Add pit stop"
                >
                    <Plus className="w-3.5 h-3.5" weight="bold" />
                    <span>Add Pit Stop</span>
                </button>
            </div>

            {/* Empty State */}
            {waypoints.length === 0 ? (
                <div className="p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-dashed border-black/10 dark:border-white/10 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <MapPin className="w-4 h-4 text-light-text-secondary dark:text-dark-text-secondary shrink-0" weight="duotone" />
                        <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary font-medium truncate">
                            Direct journey ({origin || 'Origin'} → {destination || 'Destination'}). No stops scheduled.
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={handleAddStop}
                        className="text-2xs font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400 hover:underline shrink-0 min-h-[44px] flex items-center"
                    >
                        + Add a stop
                    </button>
                </div>
            ) : (
                /* Pit Stops List */
                <div className="space-y-3">
                    {waypoints.map((stop, idx) => {
                        const isFirst = idx === 0;
                        const isLast = idx === waypoints.length - 1;
                        const isVisited = stop.addToVisited !== false;

                        return (
                            <div
                                key={stop.id || idx}
                                className="p-4 rounded-2xl bg-white/50 dark:bg-white/[0.04] backdrop-blur-md border border-black/8 dark:border-white/10 shadow-xs space-y-3 transition-all animate-fadeIn"
                            >
                                {/* Card Top Row: Stop number, type, visited toggle & reorder/delete actions */}
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 dark:border-white/5 pb-2.5">
                                    <div className="flex items-center gap-2">
                                        <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold text-xs flex items-center justify-center shrink-0">
                                            {idx + 1}
                                        </span>
                                        <span className="text-xs font-bold text-light-text dark:text-dark-text">
                                            Pit Stop #{idx + 1}
                                        </span>
                                    </div>

                                    {/* Action Buttons: Visited toggle, Reorder, Remove */}
                                    <div className="flex items-center gap-1">
                                        {/* Add to Visited Places Toggle */}
                                        <button
                                            type="button"
                                            onClick={() => handleUpdateStop(idx, { addToVisited: !isVisited })}
                                            className={`min-h-[44px] px-2.5 py-1 rounded-xl text-2xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
                                                isVisited
                                                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                                    : 'bg-black/5 dark:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary border border-black/10 dark:border-white/10 opacity-70 hover:opacity-100'
                                            }`}
                                            title="When active, this stop is saved to your Visited Places in Travel Atlas"
                                            aria-label="Toggle add to visited places"
                                        >
                                            <CheckCircle className="w-3.5 h-3.5" weight={isVisited ? 'fill' : 'regular'} />
                                            <span>{isVisited ? 'Add to Visited' : 'Skip Visited'}</span>
                                        </button>

                                        {/* Reorder Buttons */}
                                        <button
                                            type="button"
                                            disabled={isFirst}
                                            onClick={() => handleMoveStop(idx, 'up')}
                                            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                            title="Move stop earlier"
                                            aria-label="Move stop earlier"
                                        >
                                            <ArrowUp className="w-4 h-4" />
                                        </button>
                                        <button
                                            type="button"
                                            disabled={isLast}
                                            onClick={() => handleMoveStop(idx, 'down')}
                                            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                            title="Move stop later"
                                            aria-label="Move stop later"
                                        >
                                            <ArrowDown className="w-4 h-4" />
                                        </button>

                                        {/* Delete Button */}
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveStop(idx)}
                                            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-rose-500 hover:bg-rose-500/10 transition-colors"
                                            title="Remove pit stop"
                                            aria-label="Remove pit stop"
                                        >
                                            <Trash className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* Form Fields: Location & Stop Type */}
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                                    <div className="md:col-span-7">
                                        <Autocomplete
                                            label="Pit Stop Location / Place"
                                            placeholder="e.g. Neuschwanstein Castle, Heidelberg, Lucerne..."
                                            value={stop.name}
                                            onChange={val => handleUpdateStop(idx, { name: val })}
                                            fetchSuggestions={fetchLocationSuggestions}
                                        />
                                    </div>
                                    <div className="md:col-span-5">
                                        <GlassSelect
                                            label="Stop Type"
                                            value={stop.type}
                                            onChange={e => handleUpdateStop(idx, { type: e.target.value as any })}
                                        >
                                            {STOP_TYPES.map(st => (
                                                <option key={st.type} value={st.type}>
                                                    {st.label}
                                                </option>
                                            ))}
                                        </GlassSelect>
                                    </div>
                                </div>

                                {/* Stop Notes */}
                                <Input
                                    label="Stop Notes (optional)"
                                    placeholder="e.g. 1-hour scenic viewpoint, lunch break, castle tour ticket booked..."
                                    value={stop.notes || ''}
                                    onChange={e => handleUpdateStop(idx, { notes: e.target.value })}
                                />
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
export default PitStopManager;
