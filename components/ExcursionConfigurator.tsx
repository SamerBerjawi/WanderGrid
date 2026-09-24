import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
    Compass, 
    Ticket, 
    ForkKnife, 
    CalendarBlank, 
    Clock, 
    MapPin, 
    Check, 
    X, 
    Trash,
    WarningCircle
} from '@phosphor-icons/react';
import { Input, Autocomplete, TimeInput } from './ui';
import GlassPanel from './glass/GlassPanel';
import { Activity, GeoCoordinates } from '../types';
import { searchLocations, getCoordinates } from '../services/geocoding';
import { getCurrencySymbol } from '../utils/formatters';
import { 
    MODAL_SHELL_STYLE, 
    BTN_PRIMARY_STYLE, 
    BTN_SECONDARY_STYLE, 
    BTN_DANGER_STYLE,
    STATUS_DANGER_STYLE,
    CLOSE_BTN_STYLE 
} from '../constants';

export interface ExcursionConfiguratorProps {
    isOpen: boolean;
    initialData?: Activity | null;
    defaultDate?: string;
    tripStartDate?: string;
    tripEndDate?: string;
    currencySymbol?: string;
    onSave: (activity: Activity) => void;
    onDelete?: (activityId: string) => void;
    onClose: () => void;
}

const CATEGORIES: { type: 'Activity' | 'Reservation' | 'Tour'; label: string; icon: React.ElementType; description: string }[] = [
    { type: 'Tour', label: 'Guided Tour / Excursion', icon: Compass, description: 'Boat charters, guided walks, museum passes' },
    { type: 'Reservation', label: 'Dining & Reservation', icon: ForkKnife, description: 'Restaurants, wine tastings, lounges' },
    { type: 'Activity', label: 'Sightseeing & Adventure', icon: Ticket, description: 'Beaches, hiking, landmarks, attractions' },
];

export const ExcursionConfigurator: React.FC<ExcursionConfiguratorProps> = ({
    isOpen,
    initialData,
    defaultDate,
    tripStartDate,
    tripEndDate,
    currencySymbol = '$',
    onSave,
    onDelete,
    onClose
}) => {
    const [title, setTitle] = useState('');
    const [type, setType] = useState<'Tour' | 'Reservation' | 'Activity'>('Tour');
    const [date, setDate] = useState(defaultDate || '');
    const [time, setTime] = useState('10:00');
    const [location, setLocation] = useState('');
    const [cost, setCost] = useState<string>('');
    const [description, setDescription] = useState('');
    const [coordinates, setCoordinates] = useState<GeoCoordinates | undefined>(undefined);
    const [isResolvingCoords, setIsResolvingCoords] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    useEffect(() => {
        if (initialData) {
            setTitle(initialData.title || '');
            setType(initialData.type || 'Tour');
            setDate(initialData.date || defaultDate || '');
            setTime(initialData.time || '10:00');
            setLocation(initialData.location || '');
            setCost(initialData.cost !== undefined ? String(initialData.cost) : '');
            setDescription(initialData.description || '');
            setCoordinates(initialData.coordinates);
        } else {
            setTitle('');
            setType('Tour');
            setDate(defaultDate || '');
            setTime('10:00');
            setLocation('');
            setCost('');
            setDescription('');
            setCoordinates(undefined);
        }
        setErrorMsg(null);
        setShowDeleteConfirm(false);
    }, [initialData, defaultDate, isOpen]);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const fetchLocationSuggestions = async (query: string) => {
        if (!query || query.length < 2) return [];
        return searchLocations(query);
    };

    const handleLocationSelect = async (locName: string) => {
        setLocation(locName);
        if (!locName) return;
        setIsResolvingCoords(true);
        try {
            const coords = await getCoordinates(locName);
            if (coords) {
                setCoordinates(coords);
            }
        } catch (err) {
            console.warn("Could not resolve location coordinates:", err);
        } finally {
            setIsResolvingCoords(false);
        }
    };

    const handleSave = async () => {
        setErrorMsg(null);
        if (!title.trim()) {
            setErrorMsg("Please enter an activity or excursion title.");
            return;
        }
        if (!date) {
            setErrorMsg("Please select a valid date for this excursion.");
            return;
        }

        // Auto resolve coordinates if location is filled but coordinates are missing
        let resolvedCoords = coordinates;
        if (!resolvedCoords && location) {
            try {
                const fetched = await getCoordinates(location);
                if (fetched) resolvedCoords = fetched;
            } catch (e) {
                console.warn("Coordinate resolution fallback error:", e);
            }
        }

        const parsedCost = parseFloat(cost);
        const activityPayload: Activity = {
            id: initialData?.id || crypto.randomUUID(),
            title: title.trim(),
            type,
            date,
            time: time || '10:00',
            location: location.trim(),
            cost: isNaN(parsedCost) ? undefined : parsedCost,
            description: description.trim() || undefined,
            coordinates: resolvedCoords
        };

        onSave(activityPayload);
        onClose();
    };

    return createPortal(
        <div className="fixed inset-0 z-modal overflow-y-auto flex items-center justify-center p-4 sm:p-6 font-sans">
            {/* Backdrop */}
            <div 
                className="fixed inset-0 bg-black/40 dark:bg-black/60 transition-opacity duration-300"
                onClick={onClose}
            />

            {/* Modal Shell with Liquid Glass */}
            <GlassPanel className="wg-glass-card w-full max-w-2xl shadow-2xl overflow-hidden z-20 animate-fade-in" overrides={{ borderRadius: 28 }} padding="0px">
                <div className="p-6 sm:p-8 space-y-6">
                
                {/* Header */}
                <div className="flex items-center justify-between pb-4 border-b border-black/10 dark:border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-sm">
                            <Compass className="w-6 h-6" weight="duotone" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-light-text dark:text-dark-text tracking-tight">
                                {initialData ? 'Edit Excursion & Activity' : 'Add Excursion or Activity'}
                            </h3>
                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary font-medium">
                                Tours, experiences, dining reservations & sightseeing
                            </p>
                        </div>
                    </div>
                    <button 
                        type="button"
                        onClick={onClose}
                        className={CLOSE_BTN_STYLE}
                        aria-label="Close modal"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Inline Validation Error State */}
                {errorMsg && (
                    <div className={`p-3.5 rounded-2xl flex items-center justify-between text-xs font-semibold ${STATUS_DANGER_STYLE}`}>
                        <div className="flex items-center gap-2">
                            <WarningCircle className="w-4 h-4 shrink-0" weight="bold" />
                            <span>{errorMsg}</span>
                        </div>
                        <button type="button" onClick={() => setErrorMsg(null)} className="cursor-pointer">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}

                {/* Category Picker (3 Cards) */}
                <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                        Category Type
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {CATEGORIES.map(cat => {
                            const IconComponent = cat.icon;
                            const isSelected = type === cat.type;
                            return (
                                <button
                                    type="button"
                                    key={cat.type}
                                    onClick={() => setType(cat.type)}
                                    className={`p-3.5 rounded-2xl text-left transition-all border min-h-[72px] flex flex-col justify-between cursor-pointer ${
                                        isSelected
                                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 shadow-sm ring-1 ring-amber-500/30'
                                        : 'bg-black/5 dark:bg-white/5 border-transparent text-light-text dark:text-dark-text hover:bg-black/10 dark:hover:bg-white/10'
                                    }`}
                                >
                                    <div className="flex items-center justify-between w-full">
                                        <IconComponent className="w-5 h-5" weight={isSelected ? "duotone" : "regular"} />
                                        {isSelected && <Check className="w-4 h-4 text-amber-600 dark:text-amber-400" weight="bold" />}
                                    </div>
                                    <div className="mt-2">
                                        <span className="text-xs font-bold block">{cat.label}</span>
                                        <span className="text-2xs text-light-text-secondary dark:text-dark-text-secondary line-clamp-1 mt-0.5">
                                            {cat.description}
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Title */}
                <div className="space-y-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                        Activity / Tour Title <span className="text-semantic-red">*</span>
                    </label>
                    <Input 
                        placeholder="e.g. Sunset Catamaran Cruise to Oia" 
                        value={title} 
                        onChange={e => setTitle(e.target.value)} 
                        className="h-12 text-base font-bold"
                        autoFocus
                    />
                </div>

                {/* Schedule & Timing */}
                <div className="p-4 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-3">
                    <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
                        Schedule
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input 
                            label="Date" 
                            type="date" 
                            value={date} 
                            onChange={e => setDate(e.target.value)} 
                        />
                        <TimeInput 
                            label="Time" 
                            value={time} 
                            onChange={val => setTime(val)} 
                        />
                    </div>
                </div>

                {/* Geolocation & Destination */}
                <div className="p-4 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
                            Location & Coordinates
                        </span>
                        {coordinates && (
                            <span className="text-2xs font-mono font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded">
                                <Check className="w-3 h-3" /> Geocoded ({coordinates.lat.toFixed(2)}, {coordinates.lng.toFixed(2)})
                            </span>
                        )}
                    </div>
                    <Autocomplete 
                        label="Location / Meeting Point" 
                        placeholder="e.g. Ammoudi Bay, Santorini" 
                        value={location} 
                        onChange={handleLocationSelect} 
                        fetchSuggestions={fetchLocationSuggestions} 
                    />
                </div>

                {/* Pricing & Notes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="relative">
                        <Input 
                            label="Total Cost" 
                            type="number" 
                            placeholder="0.00" 
                            value={cost} 
                            onChange={e => setCost(e.target.value)} 
                            className="pl-8 font-bold" 
                        />
                        <span className="absolute left-3 top-9 text-light-text-secondary font-bold text-xs">{currencySymbol}</span>
                    </div>
                    <Input 
                        label="Notes / Instructions" 
                        placeholder="Confirmation #, voucher, gear needed..." 
                        value={description} 
                        onChange={e => setDescription(e.target.value)} 
                    />
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between pt-4 border-t border-black/10 dark:border-white/10">
                    {initialData && onDelete ? (
                        showDeleteConfirm ? (
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-semantic-red font-bold">Delete this activity?</span>
                                <button
                                    type="button"
                                    onClick={() => onDelete(initialData.id)}
                                    className={`${BTN_DANGER_STYLE} px-3 py-1.5 text-xs font-bold uppercase tracking-wider`}
                                >
                                    Confirm
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowDeleteConfirm(false)}
                                    className={`${BTN_SECONDARY_STYLE} px-3 py-1.5 text-xs font-bold uppercase tracking-wider`}
                                >
                                    No
                                </button>
                            </div>
                        ) : (
                            <button 
                                type="button"
                                onClick={() => setShowDeleteConfirm(true)}
                                className="text-semantic-red hover:bg-semantic-red/10 p-2.5 rounded-xl transition-colors flex items-center gap-1.5 font-bold text-xs min-h-[44px] cursor-pointer"
                            >
                                <Trash className="w-4 h-4" />
                                <span>Delete</span>
                            </button>
                        )
                    ) : <div />}

                    <div className="flex items-center gap-3">
                        <button 
                            type="button"
                            onClick={onClose}
                            className={`${BTN_SECONDARY_STYLE} px-5 h-11 text-xs font-bold uppercase tracking-wider cursor-pointer`}
                        >
                            Cancel
                        </button>
                        <button 
                            type="button"
                            onClick={handleSave}
                            className={`${BTN_PRIMARY_STYLE} px-6 h-11 text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-md`}
                        >
                            <span>Save Excursion</span>
                            <Check className="w-4 h-4" weight="bold" />
                        </button>
                    </div>
                </div>

                </div>
            </GlassPanel>
        </div>,
        document.body
    );
};
export default ExcursionConfigurator;
