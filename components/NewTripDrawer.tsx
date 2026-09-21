import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
    MapTrifold, 
    X, 
    CalendarBlank, 
    MapPin, 
    Smiley, 
    XCircle, 
    Check, 
    Trash, 
    Warning, 
    Compass, 
    CalendarCheck, 
    Hourglass,
    Sparkle
} from '@phosphor-icons/react';
import GlassButton from './glass/GlassButton';
import GlassPanel from './glass/GlassPanel';
import { dataService } from '../services/mockDb';
import { Trip, User } from '../types';
import { searchLocationSuggestions, ParsedLocationItem, parseGoogleMapsUrl } from '../services/locationParser';

export interface NewTripDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit?: (trip: Trip, unassignedFlightsToRemove?: string[]) => Promise<void>;
    onTripCreated?: (trip: Trip) => void;
    onDelete?: (tripId: string) => Promise<void>;
    users?: User[];
    initialData?: Trip | null;
    initialStatus?: 'Planning' | 'Upcoming' | 'Past';
}

const EMOJI_PRESETS = ['✈️', '🏖️', '🏔️', '🚗', '🏙️', '🚢', '🧳', '🎒', '🏰', '🍷', '⛷️', '🌴', '🏕️', '🍜'];

const CATEGORY_ORDER = [
    "Smileys & Emotion",
    "People & Body",
    "Animals & Nature",
    "Food & Drink",
    "Travel & Places",
    "Activities",
    "Objects",
    "Symbols",
    "Flags"
];

export const NewTripDrawer: React.FC<NewTripDrawerProps> = ({
    isOpen,
    onClose,
    onSubmit,
    onTripCreated,
    onDelete,
    users = [],
    initialData = null,
    initialStatus = 'Planning'
}) => {
    const [isVisible, setIsVisible] = useState(false);
    const [title, setTitle] = useState('');
    const [icon, setIcon] = useState('✈️');
    const [status, setStatus] = useState<'Planning' | 'Upcoming' | 'Past'>(initialStatus);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    
    // Destinations state
    const [destinations, setDestinations] = useState<ParsedLocationItem[]>([]);
    const [destinationInput, setDestinationInput] = useState('');
    const [suggestions, setSuggestions] = useState<ParsedLocationItem[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    
    // Emoji Explorer State
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [emojiSearch, setEmojiSearch] = useState('');
    const [allEmojis, setAllEmojis] = useState<any[]>([]);
    const [groupedEmojis, setGroupedEmojis] = useState<Record<string, any[]>>({});
    const [filteredEmojis, setFilteredEmojis] = useState<any[]>([]);
    const [isLoadingEmojis, setIsLoadingEmojis] = useState(false);
    const [pickerPosition, setPickerPosition] = useState<{ top: number; left: number } | null>(null);

    // Submission & Deletion State
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Refs
    const destWrapperRef = useRef<HTMLDivElement>(null);
    const emojiPickerButtonRef = useRef<HTMLButtonElement>(null);
    const emojiPickerMenuRef = useRef<HTMLDivElement>(null);

    // Initialize or Reset Form
    useEffect(() => {
        if (isOpen) {
            setErrorMsg(null);
            setShowDeleteConfirm(false);
            setShowEmojiPicker(false);
            setEmojiSearch('');

            if (initialData) {
                setTitle(initialData.name || '');
                setIcon(initialData.icon || '✈️');
                const resolvedStatus = initialData.status === 'Cancelled' ? 'Past' : (initialData.status || initialStatus);
                setStatus(resolvedStatus as 'Planning' | 'Upcoming' | 'Past');
                setStartDate(initialData.startDate || '');
                setEndDate(initialData.endDate || '');
                
                if (initialData.locations && initialData.locations.length > 0) {
                    setDestinations(initialData.locations.map(loc => ({
                        id: loc.id,
                        name: loc.name,
                        country: '',
                        displayName: loc.name,
                        lat: loc.coordinates?.lat,
                        lng: loc.coordinates?.lng
                    })));
                } else if (initialData.location) {
                    setDestinations(
                        initialData.location
                            .split(',')
                            .map((s, idx) => ({ 
                                id: `loc-${idx}`, 
                                name: s.trim(),
                                country: '',
                                displayName: s.trim()
                            }))
                            .filter(x => x.name.length > 0)
                    );
                } else {
                    setDestinations([]);
                }
            } else {
                setTitle('');
                setIcon('✈️');
                setStatus(initialStatus);
                setStartDate('');
                setEndDate('');
                setDestinations([]);
            }

            setDestinationInput('');
            const timer = setTimeout(() => setIsVisible(true), 20);
            return () => clearTimeout(timer);
        } else {
            setIsVisible(false);
        }
    }, [isOpen, initialData, initialStatus]);

    // Handle Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                if (showEmojiPicker) {
                    setShowEmojiPicker(false);
                } else if (showDeleteConfirm) {
                    setShowDeleteConfirm(false);
                } else {
                    handleClose();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, showEmojiPicker, showDeleteConfirm]);

    // Click outside suggestions dropdown
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (destWrapperRef.current && !destWrapperRef.current.contains(e.target as Node)) {
                setShowSuggestions(false);
            }
            if (
                emojiPickerButtonRef.current && 
                !emojiPickerButtonRef.current.contains(e.target as Node) &&
                emojiPickerMenuRef.current &&
                !emojiPickerMenuRef.current.contains(e.target as Node)
            ) {
                setShowEmojiPicker(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showEmojiPicker]);

    // Fetch Emojis on Demand
    useEffect(() => {
        if (showEmojiPicker && allEmojis.length === 0) {
            setIsLoadingEmojis(true);
            fetch('https://unpkg.com/emoji.json@12.1.0/emoji.json')
                .then(res => res.json())
                .then(data => {
                    setAllEmojis(data);
                    const groups: Record<string, any[]> = {};
                    data.forEach((e: any) => {
                         const rawCat = e.category || e.group || 'Other';
                         const mainCat = rawCat.split('(')[0].trim();
                         if (!groups[mainCat]) groups[mainCat] = [];
                         groups[mainCat].push(e);
                    });
                    setGroupedEmojis(groups);
                    setFilteredEmojis(data.slice(0, 100)); 
                    setIsLoadingEmojis(false);
                })
                .catch(err => {
                    console.error("Failed to fetch emojis", err);
                    setIsLoadingEmojis(false);
                });
        }
    }, [showEmojiPicker, allEmojis.length]);

    // Position Emoji Picker
    useEffect(() => {
        if (showEmojiPicker && emojiPickerButtonRef.current) {
            const rect = emojiPickerButtonRef.current.getBoundingClientRect();
            let top = rect.bottom + 8;
            let left = rect.left - 180;
            if (left < 16) left = 16;
            if (left + 330 > window.innerWidth) left = window.innerWidth - 340;
            if (top + 330 > window.innerHeight) top = rect.top - 335;
            setPickerPosition({ top, left });
        }
    }, [showEmojiPicker]);

    // Filter Emojis on Search
    useEffect(() => {
        if (!emojiSearch) {
            setFilteredEmojis(allEmojis.slice(0, 100));
        } else {
            const query = emojiSearch.toLowerCase();
            const results = allEmojis.filter(e => e.name.toLowerCase().includes(query)).slice(0, 100);
            setFilteredEmojis(results);
        }
    }, [emojiSearch, allEmojis]);

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
        setTimeout(onClose, 250);
    };

    const handleAddDestination = (item: ParsedLocationItem) => {
        if (!destinations.some(d => d.name.toLowerCase() === item.name.toLowerCase())) {
            setDestinations(prev => [...prev, item]);
        }
        setDestinationInput('');
        setShowSuggestions(false);
    };

    const handleRemoveDestination = (index: number) => {
        setDestinations(prev => prev.filter((_, i) => i !== index));
    };

    const handleKeyDownDestinationInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const text = destinationInput.trim();
            if (!text) return;

            if (text.includes('google.com/maps') || text.includes('maps.app.goo.gl')) {
                const parsed = parseGoogleMapsUrl(text);
                if (parsed.isGoogleMaps) {
                    handleAddDestination({
                        id: `dest-${Date.now()}`,
                        name: parsed.placeName || text,
                        country: '',
                        displayName: parsed.placeName || text,
                        lat: parsed.lat,
                        lng: parsed.lng,
                        flag: '📍'
                    });
                    return;
                }
            }

            if (suggestions.length > 0) {
                handleAddDestination(suggestions[0]);
            } else {
                handleAddDestination({
                    id: `dest-${Date.now()}`,
                    name: text,
                    country: '',
                    displayName: text,
                    flag: '📍'
                });
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) {
            setErrorMsg("Please provide a title for your trip.");
            return;
        }
        if (!startDate || !endDate) {
            setErrorMsg("Please specify both a start and end date.");
            return;
        }
        if (new Date(startDate) > new Date(endDate)) {
            setErrorMsg("The departure date cannot be later than the conclusion date.");
            return;
        }

        setIsSubmitting(true);
        setErrorMsg(null);

        try {
            const locString = destinations.length > 0 
                ? destinations.map(d => d.name).join(', ') 
                : destinationInput.trim() || 'Undetermined';

            const tripPayload: Trip = {
                ...(initialData || {}),
                id: initialData?.id || `trip-${Date.now()}`,
                name: title.trim(),
                icon,
                location: locString,
                startDate,
                endDate,
                status,
                participants: initialData?.participants || (users.length > 0 ? [users[0].id] : []),
                privacy: initialData?.privacy || 'Private',
                locations: destinations.map((d, idx) => ({
                    id: d.id || `loc-${Date.now()}-${idx}`,
                    name: d.name,
                    startDate,
                    endDate,
                    coordinates: d.lat !== undefined && d.lng !== undefined ? { lat: d.lat, lng: d.lng } : undefined
                })),
                transports: initialData?.transports || [],
                accommodations: initialData?.accommodations || [],
                activities: initialData?.activities || []
            };

            if (onSubmit) {
                await onSubmit(tripPayload);
            } else if (initialData) {
                await dataService.updateTrip(tripPayload);
            } else {
                const saved = await dataService.addTrip(tripPayload);
                if (onTripCreated) {
                    onTripCreated(saved);
                }
            }

            window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
            handleClose();
        } catch (err: any) {
            setErrorMsg(err?.message || 'Failed to save trip. Please try again.');
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!initialData?.id) return;
        setIsSubmitting(true);
        try {
            if (onDelete) {
                await onDelete(initialData.id);
            } else {
                await dataService.deleteTrip(initialData.id);
                window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
            }
            handleClose();
        } catch (err: any) {
            setErrorMsg(err?.message || 'Failed to archive trip.');
            setIsSubmitting(false);
        }
    };

    if (!isOpen && !isVisible) return null;

    const STAGE_CONFIGS = [
        {
            id: 'Planning' as const,
            label: 'Planned',
            Icon: Compass,
            activeStyle: 'bg-white dark:bg-dark-card text-amber-600 dark:text-amber-400 shadow-sm border border-amber-500/30'
        },
        {
            id: 'Upcoming' as const,
            label: 'Confirmed',
            Icon: CalendarCheck,
            activeStyle: 'bg-white dark:bg-dark-card text-emerald-600 dark:text-emerald-400 shadow-sm border border-emerald-500/30'
        },
        {
            id: 'Past' as const,
            label: 'Past',
            Icon: Hourglass,
            activeStyle: 'bg-white dark:bg-dark-card text-violet-600 dark:text-violet-400 shadow-sm border border-violet-500/30'
        }
    ];

    return createPortal(
        <div className="fixed inset-0 z-modal overflow-hidden font-sans">
            {/* 1. Frosted Backdrop */}
            <div 
                className={`fixed inset-0 bg-gray-900/40 dark:bg-black/80 backdrop-blur-md transition-opacity duration-300 ${
                    isVisible ? 'opacity-100' : 'opacity-0'
                }`}
                style={{ WebkitBackdropFilter: 'blur(12px)' }}
                onClick={handleClose}
            />

            {/* 2. Slide-out Shell with Full Liquid Glass */}
            <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
                <div 
                    className={`w-screen max-w-lg h-full border-l border-black/10 dark:border-white/15 flex flex-col transform transition-transform duration-300 ease-out ${
                        isVisible ? 'translate-x-0' : 'translate-x-full'
                    }`}
                >
                    <GlassPanel
                        className="wg-glass-card w-full h-full flex flex-col shadow-2xl overflow-hidden bg-white/90 dark:bg-dark-card/90"
                        padding="0px"
                        overrides={{ borderRadius: 0 }}
                    >
                        {/* Header: Streamlined without tag or subtitle */}
                        <div className="p-6 border-b border-black/5 dark:border-white/10 flex items-center justify-between bg-gradient-to-r from-primary-500/10 via-emerald-500/5 to-transparent shrink-0">
                            <div className="flex items-center gap-3.5 min-w-0">
                                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white bg-gradient-to-br from-primary-500 to-amber-500 shrink-0 shadow-lg shadow-primary-500/25 transition-transform hover:scale-105 border border-white/25">
                                    <MapTrifold weight="duotone" className="w-6 h-6" />
                                </div>
                                <div className="min-w-0">
                                    <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight truncate">
                                        {initialData ? 'Edit Trip' : 'New Trip'}
                                    </h2>
                                </div>
                            </div>
                            <button 
                                type="button"
                                onClick={handleClose}
                                className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-2xl flex items-center justify-center text-slate-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
                                aria-label="Close drawer"
                            >
                                <X weight="bold" className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Confirmation Dialog Overlay for Archive / Delete */}
                        {showDeleteConfirm ? (
                            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6 animate-fade-in">
                                <div className="w-20 h-20 rounded-3xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-500 shadow-lg shadow-rose-500/20">
                                    <Trash weight="duotone" className="w-10 h-10" />
                                </div>
                                <div className="space-y-2 max-w-sm">
                                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">Archive Journey?</h3>
                                    <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
                                        This will permanently remove <strong>{title || initialData?.name}</strong> and its registered stops, itineraries, and timeline bookings.
                                    </p>
                                </div>
                                <div className="flex gap-3 w-full max-w-xs pt-4">
                                    <GlassButton 
                                        type="button" 
                                        variant="ghost" 
                                        className="flex-1"
                                        onClick={() => setShowDeleteConfirm(false)}
                                    >
                                        Cancel
                                    </GlassButton>
                                    <GlassButton 
                                        type="button" 
                                        variant="danger" 
                                        className="flex-1"
                                        onClick={handleDelete}
                                        isLoading={isSubmitting}
                                        icon={<Trash weight="duotone" className="w-4 h-4" />}
                                    >
                                        Archive
                                    </GlassButton>
                                </div>
                            </div>
                        ) : (
                            /* Form Content */
                            <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
                                <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">

                                    {errorMsg && (
                                        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-2.5 animate-fade-in">
                                            <Warning weight="duotone" className="w-4 h-4 shrink-0" />
                                            <span>{errorMsg}</span>
                                        </div>
                                    )}

                                    {/* 1. Trip Title */}
                                    <div className="p-4 rounded-2xl bg-white dark:bg-dark-card border border-black/15 dark:border-white/10 shadow-xs focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/20 transition-all">
                                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-200 mb-1.5">
                                            Trip Title <span className="text-rose-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={title}
                                            onChange={(e) => setTitle(e.target.value)}
                                            className="w-full bg-transparent text-lg font-bold text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 outline-none"
                                            placeholder="e.g. Summer in Tokyo"
                                            required
                                            autoFocus
                                        />
                                    </div>

                                    {/* 2. Badge & Emoji Selector */}
                                    <div className="p-4 rounded-2xl bg-white dark:bg-dark-card border border-black/15 dark:border-white/10 shadow-xs flex items-center gap-4">
                                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-primary-500/25 to-primary-500/10 dark:from-primary-500/30 dark:to-dark-card border-2 border-primary-500/40 flex items-center justify-center text-3xl shadow-sm relative select-none transition-transform hover:scale-105 shrink-0">
                                            <span>{icon}</span>
                                            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-primary-500 text-white rounded-md flex items-center justify-center text-2xs shadow-sm">
                                                <Sparkle weight="duotone" className="w-3 h-3" />
                                            </div>
                                        </div>

                                        <div className="flex-1 space-y-1.5 min-w-0">
                                            <label className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-200 block">
                                                Badge & Icon
                                            </label>
                                            <div className="flex flex-wrap gap-1.5 items-center">
                                                {EMOJI_PRESETS.slice(0, 7).map(e => (
                                                    <button
                                                        key={e}
                                                        type="button"
                                                        onClick={() => setIcon(e.trim())}
                                                        className={`w-8 h-8 flex items-center justify-center rounded-xl text-base transition-all active:scale-95 cursor-pointer ${
                                                            icon === e.trim()
                                                                ? 'bg-primary-500 text-white shadow-md shadow-primary-500/30 font-bold scale-105 border border-white/30'
                                                                : 'bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 border border-black/12 dark:border-white/10 text-slate-900 dark:text-white shadow-2xs'
                                                        }`}
                                                    >
                                                        {e.trim()}
                                                    </button>
                                                ))}
                                                <button
                                                    ref={emojiPickerButtonRef}
                                                    type="button"
                                                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                                    className={`h-8 px-2.5 flex items-center gap-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer active:scale-95 ${
                                                        showEmojiPicker
                                                            ? 'border-primary-500 bg-primary-500/20 text-primary-600 dark:text-primary-400 shadow-sm'
                                                            : 'bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 border-black/12 dark:border-white/10 text-slate-800 dark:text-zinc-200 shadow-2xs'
                                                    }`}
                                                    title="Explore all emojis"
                                                >
                                                    <Smiley weight="duotone" className="w-4 h-4 text-primary-500" />
                                                    <span>More</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 3. Trip Stage (Segmented Controls) */}
                                    <div className="space-y-2">
                                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-200 ml-0.5">
                                            Stage
                                        </label>
                                        <div className="bg-slate-100/90 dark:bg-white/5 p-1.5 rounded-2xl flex gap-1.5 border border-black/12 dark:border-white/10 shadow-inner">
                                            {STAGE_CONFIGS.map(s => {
                                                const isSelected = status === s.id;
                                                const IconComponent = s.Icon;
                                                return (
                                                    <button
                                                        key={s.id}
                                                        type="button"
                                                        onClick={() => setStatus(s.id)}
                                                        className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer select-none active:scale-95 ${
                                                            isSelected
                                                                ? `${s.activeStyle} shadow-md`
                                                                : 'text-slate-700 dark:text-zinc-300 font-bold hover:text-slate-900 dark:hover:text-white hover:bg-white/80 dark:hover:bg-white/10'
                                                        }`}
                                                    >
                                                        <IconComponent weight="duotone" className="w-4 h-4 shrink-0" />
                                                        <span>{s.label}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* 4. Timeline Dates */}
                                    <div className="space-y-2">
                                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-200 ml-0.5">
                                            Timeline <span className="text-rose-500">*</span>
                                        </label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="p-3.5 rounded-2xl bg-white dark:bg-dark-card border border-black/15 dark:border-white/10 shadow-xs focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/20 transition-all">
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <CalendarBlank weight="duotone" className="w-4 h-4 text-primary-500 shrink-0" />
                                                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">
                                                        Departure
                                                    </span>
                                                </div>
                                                <input
                                                    type="date"
                                                    value={startDate}
                                                    onChange={(e) => setStartDate(e.target.value)}
                                                    className="w-full bg-transparent text-xs font-bold text-slate-900 dark:text-white outline-none cursor-pointer"
                                                    style={{ colorScheme: 'light dark' }}
                                                    required
                                                />
                                            </div>

                                            <div className="p-3.5 rounded-2xl bg-white dark:bg-dark-card border border-black/15 dark:border-white/10 shadow-xs focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/20 transition-all">
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <CalendarBlank weight="duotone" className="w-4 h-4 text-primary-500 shrink-0" />
                                                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">
                                                        Conclusion
                                                    </span>
                                                </div>
                                                <input
                                                    type="date"
                                                    value={endDate}
                                                    min={startDate}
                                                    onChange={(e) => setEndDate(e.target.value)}
                                                    className="w-full bg-transparent text-xs font-bold text-slate-900 dark:text-white outline-none cursor-pointer"
                                                    style={{ colorScheme: 'light dark' }}
                                                    required
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* 5. Destinations */}
                                    <div ref={destWrapperRef} className="space-y-2">
                                        <div className="flex items-center justify-between ml-0.5">
                                            <label className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-200 block">
                                                Destinations
                                            </label>
                                            <span className="text-xs text-slate-600 dark:text-zinc-400 font-medium">
                                                City name or Google Maps link
                                            </span>
                                        </div>

                                        {/* Active Destination Chips */}
                                        {destinations.length > 0 && (
                                            <div className="flex flex-wrap gap-2 pb-1">
                                                {destinations.map((dest, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="px-3 py-1.5 rounded-xl bg-white dark:bg-dark-card border border-black/15 dark:border-white/10 shadow-xs inline-flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white"
                                                    >
                                                        <span>{dest.flag || '📍'}</span>
                                                        <span>{dest.name}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveDestination(idx)}
                                                            className="p-0.5 hover:text-rose-500 rounded-md transition-colors cursor-pointer ml-0.5 text-slate-400 hover:text-rose-500"
                                                            aria-label={`Remove ${dest.name}`}
                                                        >
                                                            <XCircle weight="duotone" className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Destination Input */}
                                        <div className="relative">
                                            <div className="p-3.5 rounded-2xl bg-white dark:bg-dark-card border border-black/15 dark:border-white/10 shadow-xs focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all flex items-center gap-2.5">
                                                <MapPin weight="duotone" className="w-4 h-4 text-emerald-500 shrink-0" />
                                                <input
                                                    type="text"
                                                    value={destinationInput}
                                                    onChange={(e) => setDestinationInput(e.target.value)}
                                                    onKeyDown={handleKeyDownDestinationInput}
                                                    onFocus={() => {
                                                        if (suggestions.length > 0) setShowSuggestions(true);
                                                    }}
                                                    className="w-full bg-transparent text-xs font-bold text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 outline-none"
                                                    placeholder="Add destination (e.g. Rome, Tokyo)..."
                                                    autoComplete="off"
                                                />
                                                {isSearching && (
                                                    <div className="w-3.5 h-3.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin shrink-0" />
                                                )}
                                                {destinationInput && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setDestinationInput('');
                                                            setShowSuggestions(false);
                                                        }}
                                                        className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 cursor-pointer shrink-0"
                                                    >
                                                        <XCircle weight="duotone" className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>

                                            {/* Suggestions Flyout */}
                                            {showSuggestions && suggestions.length > 0 && (
                                                <div className="absolute top-full left-0 mt-2 w-full z-[70] bg-white dark:bg-dark-card border border-black/15 dark:border-white/15 rounded-2xl shadow-xl overflow-hidden max-h-52 overflow-y-auto custom-scrollbar p-1.5">
                                                    {suggestions.map((item, idx) => (
                                                        <button
                                                            key={idx}
                                                            type="button"
                                                            onClick={() => handleAddDestination(item)}
                                                            className="w-full text-left px-3.5 py-2.5 text-xs hover:bg-slate-100 dark:hover:bg-white/10 text-slate-800 dark:text-dark-text border-b border-black/5 dark:border-white/5 last:border-0 font-medium flex items-center justify-between gap-2 transition-colors cursor-pointer rounded-xl"
                                                        >
                                                            <div className="flex items-center gap-2 truncate">
                                                                <span>{item.flag || '📍'}</span>
                                                                <span className="font-bold text-slate-900 dark:text-white truncate">{item.name}</span>
                                                                {item.country && (
                                                                    <span className="text-slate-600 dark:text-zinc-400 truncate text-xs">
                                                                        · {item.country}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span className="text-2xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/20 shrink-0">
                                                                Select
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                </div>

                                {/* Sticky Frosted Footer with Liquid Glass Actions */}
                                <div className="p-6 border-t border-black/5 dark:border-white/10 bg-white/80 dark:bg-dark-card/80 backdrop-blur-md flex items-center justify-between gap-3 shrink-0">
                                    {initialData && (onDelete || initialData.id) ? (
                                        <GlassButton 
                                            type="button" 
                                            onClick={() => setShowDeleteConfirm(true)} 
                                            variant="danger"
                                            disabled={isSubmitting}
                                            icon={<Trash weight="duotone" className="w-4 h-4" />}
                                        >
                                            Archive
                                        </GlassButton>
                                    ) : (
                                        <GlassButton 
                                            type="button" 
                                            onClick={handleClose} 
                                            variant="secondary"
                                            disabled={isSubmitting}
                                        >
                                            Cancel
                                        </GlassButton>
                                    )}

                                    <div className="flex items-center gap-2.5">
                                        {initialData && (
                                            <GlassButton 
                                                type="button" 
                                                onClick={handleClose} 
                                                variant="secondary"
                                                disabled={isSubmitting}
                                            >
                                                Dismiss
                                            </GlassButton>
                                        )}
                                        <GlassButton 
                                            type="submit" 
                                            variant="primary"
                                            color="emerald"
                                            disabled={isSubmitting}
                                            isLoading={isSubmitting}
                                            icon={<Check weight="bold" className="w-4 h-4" />}
                                        >
                                            <span>{isSubmitting ? 'Saving...' : initialData ? 'Save Changes' : 'Create Trip'}</span>
                                        </GlassButton>
                                    </div>
                                </div>
                            </form>
                        )}
                    </GlassPanel>
                </div>
            </div>

            {/* Floating Custom Emoji Picker with Frosted Glass Portal */}
            {showEmojiPicker && pickerPosition && createPortal(
                <div 
                    ref={emojiPickerMenuRef}
                    className="fixed z-modal animate-fade-in"
                    style={{ top: pickerPosition.top, left: pickerPosition.left }}
                >
                    <GlassPanel
                        className="wg-glass-card bg-white/95 dark:bg-dark-card/95 w-80 shadow-2xl overflow-hidden p-4"
                        padding="16px"
                        overrides={{ borderRadius: 24 }}
                    >
                        <div className="mb-3">
                            <input 
                                placeholder="Explore emojis..." 
                                autoFocus 
                                value={emojiSearch} 
                                onChange={e => setEmojiSearch(e.target.value)} 
                                className="w-full py-2 px-3 text-xs rounded-xl bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 outline-none focus:border-primary-500 font-medium text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500" 
                            />
                        </div>
                        
                        <div className="h-60 overflow-y-auto custom-scrollbar p-0.5">
                            {isLoadingEmojis ? (
                                <div className="flex justify-center py-10">
                                    <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"/>
                                </div>
                            ) : emojiSearch ? (
                                <div className="grid grid-cols-6 gap-1 content-start">
                                    {filteredEmojis.map((e) => (
                                        <button 
                                            key={`${e.char}-${e.name}`} 
                                            type="button" 
                                            onClick={() => { setIcon(e.char); setShowEmojiPicker(false); }} 
                                            className="aspect-square flex items-center justify-center text-xl hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer" 
                                            title={e.name}
                                        >
                                            {e.char}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {CATEGORY_ORDER.map(cat => {
                                        const emojis = groupedEmojis[cat];
                                        if (!emojis || emojis.length === 0) return null;
                                        return (
                                            <div key={cat}>
                                                <h5 className="sticky top-0 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm py-1 mb-1 text-2xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest border-b border-black/5 dark:border-white/5">
                                                    {cat}
                                                </h5>
                                                <div className="grid grid-cols-6 gap-1 content-start">
                                                    {emojis.map((e, i) => (
                                                        <button 
                                                            key={`${cat}-${i}`} 
                                                            type="button" 
                                                            onClick={() => { setIcon(e.char); setShowEmojiPicker(false); }} 
                                                            className="aspect-square flex items-center justify-center text-xl hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer" 
                                                            title={e.name}
                                                        >
                                                            {e.char}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </GlassPanel>
                </div>,
                document.body
            )}
        </div>,
        document.body
    );
};

export default NewTripDrawer;
