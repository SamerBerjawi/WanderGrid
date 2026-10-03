import React, { useState } from 'react';
import { Key, Clock, Speedometer } from '@phosphor-icons/react';
import { Input, Autocomplete, TimeInput, DateRangePicker } from '../ui';
import { CarForm } from './transportTypes';
import { searchLocations, getCoordinates, calculateDistance } from '../../services/geocoding';
import { PitStopManager } from './PitStopManager';

interface CarRentalFormProps {
    form: CarForm;
    currencySymbol: string;
    onUpdate: (updates: Partial<CarForm>) => void;
}

export const CarRentalForm: React.FC<CarRentalFormProps> = ({
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
            // Sequence: Pickup -> Pit Stops -> Dropoff
            const locations = [
                form.pickupLocation,
                ...(form.waypoints || []).map(w => w.name).filter(Boolean),
                form.dropoffLocation
            ];
            const coordsList = await Promise.all(locations.map(loc => getCoordinates(loc)));
            let totalDist = 0;
            for (let i = 0; i < coordsList.length - 1; i++) {
                const c1 = coordsList[i];
                const c2 = coordsList[i + 1];
                if (c1 && c2) {
                    totalDist += calculateDistance(c1.lat, c1.lng, c2.lat, c2.lng);
                }
            }

            if (totalDist > 0) {
                const stopsCount = (form.waypoints || []).length;
                const estMinutes = Math.round((totalDist / 80) * 60) + 15 + stopsCount * 20;
                onUpdate({ distance: Math.round(totalDist), duration: estMinutes });
            }
        } catch (e) {
            console.warn("Could not calculate rental driving distance:", e);
        } finally {
            setIsCalculatingDistance(false);
        }
    };

    return (
        <div className="p-5 sm:p-6 rounded-3xl bg-white/70 dark:bg-white/[0.05] backdrop-blur-md border border-black/8 dark:border-white/10 shadow-xs space-y-4">
            <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
                Rental Car Details
            </span>

            {/* Locations */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Autocomplete 
                    label="Pickup Location" 
                    placeholder="e.g. Milan Malpensa Airport (MXP)" 
                    value={form.pickupLocation} 
                    onChange={val => onUpdate({ pickupLocation: val })} 
                    fetchSuggestions={fetchLocationSuggestions} 
                />
                <Autocomplete 
                    label="Dropoff Location" 
                    placeholder="e.g. Florence Airport (FLR)" 
                    value={form.dropoffLocation} 
                    onChange={val => onUpdate({ dropoffLocation: val })} 
                    fetchSuggestions={fetchLocationSuggestions} 
                />
            </div>

            {/* Pit Stops Along the Road */}
            <PitStopManager 
                waypoints={form.waypoints || []} 
                onChange={waypoints => onUpdate({ waypoints })} 
                origin={form.pickupLocation} 
                destination={form.dropoffLocation} 
            />

            {/* Agency & Car Model */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <Input 
                    label="Rental Agency" 
                    placeholder="e.g. Sixt, Hertz, Avis" 
                    value={form.agency} 
                    onChange={e => onUpdate({ agency: e.target.value })} 
                />
                <Input 
                    label="Vehicle Model / Group" 
                    placeholder="e.g. Audi A4 Avant or Compact SUV" 
                    value={form.model} 
                    onChange={e => onUpdate({ model: e.target.value })} 
                />
                <Input 
                    label="Confirmation Code" 
                    placeholder="e.g. SXT-884219" 
                    value={form.confirmationCode} 
                    onChange={e => onUpdate({ confirmationCode: e.target.value })} 
                />
                <div className="flex gap-2 items-end">
                    <Input 
                        label="Est. Distance (km)" 
                        type="number" 
                        placeholder="e.g. 290" 
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
            </div>

            {/* Pickup & Dropoff Schedule */}
            <div className="space-y-3">
                <DateRangePicker 
                    accentColor="blue"
                    label="Rental Dates"
                    startLabel="Pickup Date"
                    endLabel="Dropoff Date"
                    startDate={form.pickupDate}
                    endDate={form.dropoffDate}
                    onChange={(start, end) => onUpdate({ pickupDate: start, dropoffDate: end })}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <TimeInput 
                        label="Pickup Time" 
                        value={form.pickupTime} 
                        onChange={val => onUpdate({ pickupTime: val })} 
                    />
                    <TimeInput 
                        label="Dropoff Time" 
                        value={form.dropoffTime} 
                        onChange={val => onUpdate({ dropoffTime: val })} 
                    />
                </div>
            </div>

            {/* Cost & Booking notes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative">
                    <Input 
                        label="Total Rental Cost" 
                        type="number" 
                        placeholder="0.00" 
                        value={form.cost !== undefined ? String(form.cost) : ''} 
                        onChange={e => onUpdate({ cost: parseFloat(e.target.value) || undefined })} 
                        className="pl-8 font-bold" 
                    />
                    <span className="absolute left-3 top-9 text-light-text-secondary font-bold text-xs">{currencySymbol}</span>
                </div>
                <Input 
                    label="Website / Notes" 
                    placeholder="e.g. Booking ref, insurance coverage, toll tags..." 
                    value={form.notes || ''} 
                    onChange={e => onUpdate({ notes: e.target.value })} 
                />
            </div>
        </div>
    );
};
