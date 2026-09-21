import React, { useState } from 'react';
import { Car, Clock, Speedometer } from '@phosphor-icons/react';
import { Input, Autocomplete, TimeInput } from '../ui';
import { CarForm } from './transportTypes';
import { searchLocations, getCoordinates, calculateDistance } from '../../services/geocoding';

interface PersonalCarFormProps {
    form: CarForm;
    currencySymbol: string;
    onUpdate: (updates: Partial<CarForm>) => void;
}

export const PersonalCarForm: React.FC<PersonalCarFormProps> = ({
    form,
    currencySymbol,
    onUpdate
}) => {
    const [isCalculatingDistance, setIsCalculatingDistance] = useState(false);

    const fetchLocationSuggestions = async (query: string) => {
        if (!query || query.length < 2) return [];
        return searchLocations(query);
    };

    const handleAutoCalcDistance = async () => {
        if (!form.pickupLocation || !form.dropoffLocation) return;
        setIsCalculatingDistance(true);
        try {
            const [c1, c2] = await Promise.all([
                getCoordinates(form.pickupLocation),
                getCoordinates(form.dropoffLocation)
            ]);
            if (c1 && c2) {
                const dist = calculateDistance(c1.lat, c1.lng, c2.lat, c2.lng);
                // Driving estimate: ~80 km/h
                const estMinutes = Math.round((dist / 80) * 60) + 15;
                onUpdate({ distance: dist, duration: estMinutes });
            }
        } catch (e) {
            console.warn("Could not calculate driving distance:", e);
        } finally {
            setIsCalculatingDistance(false);
        }
    };

    return (
        <div className="p-5 rounded-3xl bg-light-fill dark:bg-dark-fill/50 border border-black/10 dark:border-white/5 space-y-4">
            <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
                Personal Vehicle Road Trip
            </span>

            {/* Route */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Autocomplete 
                    label="Departure Origin" 
                    placeholder="e.g. Munich, Germany" 
                    value={form.pickupLocation} 
                    onChange={val => onUpdate({ pickupLocation: val })} 
                    fetchSuggestions={fetchLocationSuggestions} 
                />
                <Autocomplete 
                    label="Destination" 
                    placeholder="e.g. Innsbruck, Austria" 
                    value={form.dropoffLocation} 
                    onChange={val => onUpdate({ dropoffLocation: val })} 
                    fetchSuggestions={fetchLocationSuggestions} 
                />
            </div>

            {/* Vehicle & Driving Distance */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <Input 
                    label="Vehicle Model / Name" 
                    placeholder="e.g. Tesla Model Y or Subaru Outback" 
                    value={form.model} 
                    onChange={e => onUpdate({ model: e.target.value })} 
                />
                <div className="flex gap-2 items-end">
                    <Input 
                        label="Estimated Distance (km)" 
                        type="number" 
                        placeholder="e.g. 165" 
                        value={form.distance !== undefined ? String(form.distance) : ''} 
                        onChange={e => onUpdate({ distance: parseFloat(e.target.value) || undefined })} 
                    />
                    <button 
                        type="button"
                        onClick={handleAutoCalcDistance}
                        disabled={isCalculatingDistance || !form.pickupLocation || !form.dropoffLocation}
                        className="min-h-[44px] px-3 py-2 rounded-xl bg-primary-500/10 hover:bg-primary-500/20 text-primary-600 dark:text-primary-400 font-bold text-xs flex items-center justify-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                        title="Estimate road distance"
                    >
                        <Speedometer className="w-3.5 h-3.5" weight="bold" />
                        <span>Auto</span>
                    </button>
                </div>
                <div className="relative">
                    <Input 
                        label="Fuel / Toll Budget" 
                        type="number" 
                        placeholder="0.00" 
                        value={form.cost !== undefined ? String(form.cost) : ''} 
                        onChange={e => onUpdate({ cost: parseFloat(e.target.value) || undefined })} 
                        className="pl-8 font-bold" 
                    />
                    <span className="absolute left-3 top-9 text-light-text-secondary font-bold text-xs">{currencySymbol}</span>
                </div>
            </div>

            {/* Schedule */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 rounded-2xl bg-white/70 dark:bg-dark-card/70 border border-black/5 dark:border-white/5 space-y-2">
                    <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Departure Date & Time
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                        <Input 
                            label="Date" 
                            type="date" 
                            value={form.pickupDate} 
                            onChange={e => onUpdate({ pickupDate: e.target.value })} 
                        />
                        <TimeInput 
                            label="Time" 
                            value={form.pickupTime} 
                            onChange={val => onUpdate({ pickupTime: val })} 
                        />
                    </div>
                </div>

                <div className="p-3 rounded-2xl bg-white/70 dark:bg-dark-card/70 border border-black/5 dark:border-white/5 space-y-2">
                    <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Arrival Date & Time
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                        <Input 
                            label="Date" 
                            type="date" 
                            value={form.dropoffDate} 
                            onChange={e => onUpdate({ dropoffDate: e.target.value })} 
                        />
                        <TimeInput 
                            label="Time" 
                            value={form.dropoffTime} 
                            onChange={val => onUpdate({ dropoffTime: val })} 
                        />
                    </div>
                </div>
            </div>

            <Input 
                label="Road Trip Notes" 
                placeholder="e.g. Scenic mountain pass, vignette stickers needed, charger stops..." 
                value={form.notes || ''} 
                onChange={e => onUpdate({ notes: e.target.value })} 
            />
        </div>
    );
};
