import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
    INPUT_BASE_STYLE, 
    BTN_PRIMARY_STYLE, 
    BTN_SECONDARY_STYLE 
} from '../constants';
import Icon from './ui/Icon';
import { dataService } from '../services/mockDb';
import { Trip } from '../types';
import { searchLocationSuggestions, ParsedLocationItem, parseGoogleMapsUrl } from '../services/locationParser';

interface NewTripDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    onTripCreated?: (trip: Trip) => void;
    initialStatus?: 'Planning' | 'Upcoming' | 'Past';
}

export const NewTripDrawer: React.FC<NewTripDrawerProps> = ({
    isOpen,
    onClose,
    onTripCreated,
    initialStatus = 'Planning'
}) => {
    const [isVisible, setIsVisible] = useState(false);
    const [title, setTitle] = useState('');
    const [subtitle, setSubtitle] = useState('');
    const [status, setStatus] = useState<'Planning' | 'Upcoming' | 'Past'>(initialStatus);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    
    // Destinations list state
    const [destinations, setDestinations] = useState<ParsedLocationItem[]>([]);
    const [destinationInput, setDestinationInput] = useState('');
    const [suggestions, setSuggestions] = useState<ParsedLocationItem[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const destWrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            setStatus(initialStatus);
            const timer = setTimeout(() => setIsVisible(true), 20);
            return () => clearTimeout(timer);
        } else {
            setIsVisible(false);
        }
    }, [isOpen, initialStatus]);

    // Handle Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                handleClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    // Click outside suggestions dropdown
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (destWrapperRef.current && !destWrapperRef.current.contains(e.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Debounced location search
    useEffect(() => {
        const query = destinationInput.trim();
        if (query.length < 2) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        let isCancelled = false;
        setIsSearching(true);
        const timer = setTimeout(async () => {
            try {
                const results = await searchLocationSuggestions(query);
                if (!isCancelled) {
                    setSuggestions(results);
                    setShowSuggestions(results.length > 0);
                    setIsSearching(false);
                }
            } catch {
                if (!isCancelled) {
                    setIsSearching(false);
                }
            }
        }, 220);

        return () => {
            isCancelled = true;
            clearTimeout(timer);
        };
    }, [destinationInput]);

    const handleClose = () => {
        setIsVisible(false);
        setTimeout(() => {
            onClose();
            // Reset form
            setTitle('');
            setSubtitle('');
            setStartDate('');
            setEndDate('');
            setDestinations([]);
            setDestinationInput('');
            setErrorMsg(null);
            setIsSubmitting(false);
        }, 250);
    };

    const handleAddDestination = (item: ParsedLocationItem) => {
        if (!destinations.some(d => d.name.toLowerCase() === item.name.toLowerCase())) {
            setDestinations([...destinations, item]);
        }
        setDestinationInput('');
        setSuggestions([]);
        setShowSuggestions(false);
    };

    const handleRemoveDestination = (index: number) => {
        setDestinations(destinations.filter((_, i) => i !== index));
    };

    const handleKeyDownDestinationInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const trimmed = destinationInput.trim();
            if (!trimmed) return;

            // Check if it's a Google Maps URL
            const gmap = parseGoogleMapsUrl(trimmed);
            if (gmap.isGoogleMaps && gmap.placeName) {
                handleAddDestination({
                    id: `manual:${Date.now()}`,
                    name: gmap.placeName,
                    country: '',
                    flag: '📍',
                    displayName: `📍 ${gmap.placeName}`,
                    lat: gmap.lat,
                    lng: gmap.lng
                });
                return;
            }

            if (suggestions.length > 0) {
                handleAddDestination(suggestions[0]);
            } else {
                handleAddDestination({
                    id: `custom:${Date.now()}`,
                    name: trimmed,
                    country: '',
                    flag: '📍',
                    displayName: `📍 ${trimmed}`
                });
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg(null);

        if (!title.trim()) {
            setErrorMsg('Please enter a trip title.');
            return;
        }
        if (!startDate || !endDate) {
            setErrorMsg('Please select both a start date and an end date.');
            return;
        }
        if (new Date(endDate) < new Date(startDate)) {
            setErrorMsg('End date cannot be earlier than start date.');
            return;
        }

        setIsSubmitting(true);
        try {
            const locString = destinations.length > 0 
                ? destinations.map(d => d.name).join(', ') 
                : destinationInput.trim() || 'Undetermined';

            const newTrip: Trip = {
                id: `trip-${Date.now()}`,
                name: title.trim(),
                subtitle: subtitle.trim() || undefined,
                location: locString,
                startDate,
                endDate,
                status,
                participants: [],
                privacy: 'Private',
                locations: destinations.map((d, idx) => ({
                    id: `loc-${Date.now()}-${idx}`,
                    name: d.name,
                    startDate,
                    endDate,
                    coordinates: d.lat !== undefined && d.lng !== undefined ? { lat: d.lat, lng: d.lng } : undefined
                })),
                transports: [],
                accommodations: [],
                activities: []
            };

            const saved = await dataService.addTrip(newTrip);
            if (onTripCreated) {
                onTripCreated(saved);
            }
            handleClose();
        } catch (err: any) {
            setErrorMsg(err?.message || 'Failed to create trip. Please try again.');
            setIsSubmitting(false);
        }
    };

    if (!isOpen && !isVisible) return null;

    return createPortal(
        <div className="fixed inset-0 z-modal overflow-hidden font-sans">
            {/* 1. Frosted Backdrop */}
            <div 
                className={`fixed inset-0 bg-gray-900/50 dark:bg-black/80 backdrop-blur-md transition-opacity duration-300 ${
                    isVisible ? 'opacity-100' : 'opacity-0'
                }`}
                style={{ WebkitBackdropFilter: 'blur(12px)' }}
                onClick={handleClose}
            />

            {/* 2. Slide-out Drawer Shell */}
            <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
                <div 
                    className={`w-screen max-w-lg bg-white/95 dark:bg-dark-card/95 backdrop-blur-md shadow-glass-modal border-l border-black/10 dark:border-white/15 flex flex-col transform transition-transform duration-300 ease-out ${
                        isVisible ? 'translate-x-0' : 'translate-x-full'
                    }`}
                    style={{ WebkitBackdropFilter: 'blur(8px)' }}
                >
                    {/* Header */}
                    <div className="p-6 border-b border-black/5 dark:border-white/5 flex items-center justify-between bg-gradient-to-r from-emerald-500/5 to-transparent shrink-0">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white bg-gradient-to-br from-emerald-500 to-teal-600 shrink-0 shadow-md transition-transform hover:scale-105">
                                <Icon className="text-2xl" name="map"/>
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <h2 className="text-lg font-bold text-light-text dark:text-dark-text tracking-tight truncate">
                                        New Trip
                                    </h2>
                                    <span className="px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                        Planner
                                    </span>
                                </div>
                                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate mt-0.5 font-medium">
                                    Set up title, dates, and destinations
                                </p>
                            </div>
                        </div>
                        <button 
                            type="button"
                            onClick={handleClose}
                            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0 cursor-pointer"
                            aria-label="Close drawer"
                        >
                            <Icon className="text-lg" name="close"/>
                        </button>
                    </div>

                    {/* Form Content */}
                    <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
                        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">

                            {errorMsg && (
                                <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-2 animate-fade-in">
                                    <Icon name="warning" className="text-base shrink-0" />
                                    <span>{errorMsg}</span>
                                </div>
                            )}
                            
                            {/* Primary Identifier / Hero Input */}
                            <div className="space-y-1.5">
                                <label className="block text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                                    Trip Title <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className={`${INPUT_BASE_STYLE} h-14 !text-xl font-bold`}
                                    placeholder="e.g. Summer in Tokyo"
                                    required
                                    autoFocus
                                />
                            </div>

                            {/* Subtitle / Caption */}
                            <div className="space-y-1.5">
                                <label className="block text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                                    Subtitle / Caption
                                </label>
                                <input
                                    type="text"
                                    value={subtitle}
                                    onChange={(e) => setSubtitle(e.target.value)}
                                    className={`${INPUT_BASE_STYLE} min-h-[44px] text-xs font-semibold`}
                                    placeholder="e.g. Cherry blossoms, food tours & Bullet trains"
                                />
                            </div>

                            {/* Status Switcher Group */}
                            <div className="p-4 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
                                    Trip Stage
                                </span>
                                <div className="bg-black/5 dark:bg-white/5 p-1 rounded-2xl flex border border-black/5 dark:border-white/5">
                                    <button
                                        type="button"
                                        onClick={() => setStatus('Planning')}
                                        className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                            status === 'Planning'
                                                ? 'bg-white dark:bg-dark-card text-amber-600 dark:text-amber-400 shadow-sm'
                                                : 'text-light-text-secondary dark:text-dark-text-secondary opacity-70 hover:opacity-100'
                                        }`}
                                    >
                                        Planned
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setStatus('Upcoming')}
                                        className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                            status === 'Upcoming'
                                                ? 'bg-white dark:bg-dark-card text-emerald-600 dark:text-emerald-400 shadow-sm'
                                                : 'text-light-text-secondary dark:text-dark-text-secondary opacity-70 hover:opacity-100'
                                        }`}
                                    >
                                        Confirmed
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setStatus('Past')}
                                        className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                            status === 'Past'
                                                ? 'bg-white dark:bg-dark-card text-violet-600 dark:text-violet-400 shadow-sm'
                                                : 'text-light-text-secondary dark:text-dark-text-secondary opacity-70 hover:opacity-100'
                                        }`}
                                    >
                                        Past
                                    </button>
                                </div>
                            </div>

                            {/* Date Range Selection */}
                            <div className="p-4 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-3">
                                <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
                                    Timeline <span className="text-rose-500">*</span>
                                </span>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-light-text-secondary dark:text-dark-text-secondary">
                                            Start Date
                                        </label>
                                        <input
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            className={`${INPUT_BASE_STYLE} min-h-[44px] text-xs font-semibold`}
                                            required
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-light-text-secondary dark:text-dark-text-secondary">
                                            End Date
                                        </label>
                                        <input
                                            type="date"
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            className={`${INPUT_BASE_STYLE} min-h-[44px] text-xs font-semibold`}
                                            required
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Destination / Destinations Builder */}
                            <div ref={destWrapperRef} className="p-4 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                                        Destinations
                                    </span>
                                    <span className="text-[11px] text-light-text-secondary dark:text-dark-text-secondary font-medium">
                                        Type city or paste Google Maps link
                                    </span>
                                </div>

                                {/* Active Destination Badges / Chips */}
                                {destinations.length > 0 && (
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        {destinations.map((dest, idx) => (
                                            <span 
                                                key={idx}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-dark-card border border-black/10 dark:border-white/10 shadow-sm text-light-text dark:text-dark-text animate-fade-in"
                                            >
                                                <span>{dest.flag || '📍'}</span>
                                                <span>{dest.name}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveDestination(idx)}
                                                    className="p-0.5 hover:text-rose-500 rounded-md transition-colors cursor-pointer ml-0.5"
                                                    aria-label={`Remove ${dest.name}`}
                                                >
                                                    <Icon name="close" className="text-xs" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Destination Autocomplete Input */}
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={destinationInput}
                                        onChange={(e) => setDestinationInput(e.target.value)}
                                        onKeyDown={handleKeyDownDestinationInput}
                                        onFocus={() => {
                                            if (suggestions.length > 0) setShowSuggestions(true);
                                        }}
                                        className={`${INPUT_BASE_STYLE} pl-9 pr-12 min-h-[44px] text-xs font-semibold`}
                                        placeholder="Add destination (e.g. Rome, Tokyo or Google Maps link)..."
                                        autoComplete="off"
                                    />
                                    <Icon name="location_on" className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-500 text-sm pointer-events-none" />

                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                        {isSearching && (
                                            <div className="w-3.5 h-3.5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                                        )}
                                        {destinationInput && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setDestinationInput('');
                                                    setShowSuggestions(false);
                                                }}
                                                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
                                                aria-label="Clear destination input"
                                            >
                                                <Icon name="close" className="text-xs" />
                                            </button>
                                        )}
                                    </div>

                                    {/* Suggestions Flyout */}
                                    {showSuggestions && suggestions.length > 0 && (
                                        <div className="absolute top-full left-0 mt-1.5 w-full bg-white/95 dark:bg-dark-card/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 z-[70] max-h-48 overflow-y-auto py-1 custom-scrollbar">
                                            {suggestions.map((item, idx) => (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    onClick={() => handleAddDestination(item)}
                                                    className="w-full text-left px-3.5 py-2.5 text-xs hover:bg-black/5 dark:hover:bg-white/5 text-light-text dark:text-dark-text border-b border-black/5 dark:border-white/5 last:border-0 font-medium flex items-center justify-between gap-2 transition-colors cursor-pointer"
                                                >
                                                    <div className="flex items-center gap-2 truncate">
                                                        <span>{item.flag || '📍'}</span>
                                                        <span className="font-bold text-light-text dark:text-dark-text truncate">{item.name}</span>
                                                        {item.country && (
                                                            <span className="text-light-text-secondary dark:text-dark-text-secondary truncate text-[11px]">
                                                                · {item.country}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-2xs font-bold uppercase tracking-wider text-primary-500 px-1.5 py-0.5 rounded bg-primary-500/10 shrink-0">
                                                        Select
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                        </div>

                        {/* Sticky Frosted Footer */}
                        <div className="p-6 border-t border-black/5 dark:border-white/5 bg-light-card/80 dark:bg-dark-card/80 backdrop-blur-md flex items-center justify-between gap-3 shrink-0">
                            <button 
                                type="button" 
                                onClick={handleClose} 
                                className={`${BTN_SECONDARY_STYLE} h-12 px-6 text-xs font-bold uppercase tracking-wider`}
                                disabled={isSubmitting}
                            >
                                Cancel
                            </button>
                            <button 
                                type="submit" 
                                className={`${BTN_PRIMARY_STYLE} h-12 px-8 text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95`}
                                disabled={isSubmitting}
                            >
                                <span>{isSubmitting ? 'Creating...' : 'Create Trip'}</span>
                                <Icon className="text-base" name="check"/>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>,
        document.body
    );
};
