import React from 'react';
import { Key, Clock } from '@phosphor-icons/react';
import { Input, Autocomplete, TimeInput } from '../ui';
import { CarForm } from './transportTypes';
import { searchLocations } from '../../services/geocoding';

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
    const fetchLocationSuggestions = async (query: string) => {
        if (!query || query.length < 2) return [];
        return searchLocations(query);
    };

    return (
        <div className="p-5 rounded-3xl bg-light-fill dark:bg-dark-fill/50 border border-black/10 dark:border-white/5 space-y-4">
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

            {/* Agency & Car Model */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
            </div>

            {/* Pickup & Dropoff Schedule */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 rounded-2xl bg-white/70 dark:bg-dark-card/70 border border-black/5 dark:border-white/5 space-y-2">
                    <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Pickup Date & Time
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
                        <Clock className="w-3 h-3" /> Dropoff Date & Time
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
