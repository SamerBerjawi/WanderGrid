import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Modal, Button, Input, Select, Autocomplete } from './ui';
import { Trip, User, Transport } from '../types';
import { searchLocations } from '../services/geocoding';
import { dataService } from '../services/mockDb';

interface TripModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (trip: Trip, unassignedFlightsToRemove?: string[]) => Promise<void>;
    onDelete?: (tripId: string) => Promise<void>;
    users: User[];
    initialData?: Trip | null;
}

const EMOJI_PRESETS = ['✈️', '🚗', '🏖️', '🏔️', '🏙️', '🚢', '🧳', '🎒', '🏰', '🍷', '⛷️', '🌴', '🏛️', '🏕️', '🍜'];

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

export const TripModal: React.FC<TripModalProps> = ({ isOpen, onClose, onSubmit, onDelete, users, initialData }) => {
    // Current Active Modal Tab
    const [modalTab, setModalTab] = useState<'logistics' | 'team' | 'flights'>('logistics');

    const [name, setName] = useState('');
    const [location, setLocation] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [icon, setIcon] = useState('✈️');
    const [participants, setParticipants] = useState<string[]>([]);
    const [privacy, setPrivacy] = useState<'Private' | 'Public'>('Private');
    const [isLoading, setIsLoading] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteFlightsGroup, setDeleteFlightsGroup] = useState(true);

    const associatedFlightsCount = useMemo(() => {
        return (initialData?.transports || []).filter(t => t.mode === 'Flight').length;
    }, [initialData]);

    // Emoji Picker State
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [emojiSearch, setEmojiSearch] = useState('');
    const [allEmojis, setAllEmojis] = useState<any[]>([]);
    const [groupedEmojis, setGroupedEmojis] = useState<Record<string, any[]>>({});
    const [filteredEmojis, setFilteredEmojis] = useState<any[]>([]);
    const [isLoadingEmojis, setIsLoadingEmojis] = useState(false);
    const [pickerPosition, setPickerPosition] = useState<{top: number, left: number} | null>(null);

    // Refs
    const emojiPickerButtonRef = useRef<HTMLButtonElement>(null);
    const emojiPickerMenuRef = useRef<HTMLDivElement>(null);

    const [unassignedFlights, setUnassignedFlights] = useState<Transport[]>([]);
    const [selectedFlights, setSelectedFlights] = useState<Transport[]>([]);
    const [showAllFlightsManual, setShowAllFlightsManual] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setShowDeleteConfirm(false);
            setModalTab('logistics');
            setShowAllFlightsManual(false);
            setDeleteFlightsGroup(true);
            if (initialData) {
                setName(initialData.name);
                setLocation(initialData.location);
                setStartDate(initialData.startDate);
                setEndDate(initialData.endDate);
                setIcon(initialData.icon || '✈️');
                setParticipants(initialData.participants || []);
                setPrivacy(initialData.privacy || 'Private');
                setSelectedFlights((initialData.transports || []).filter(t => t.mode === 'Flight'));
            } else {
                setName('');
                setLocation('');
                setStartDate('');
                setEndDate('');
                setIcon('✈️');
                setParticipants(users.length > 0 ? [users[0].id] : []);
                setPrivacy('Private');
                setSelectedFlights([]);
            }

            dataService.getFlights().then(flights => {
                setUnassignedFlights(flights || []);
            });
        }
    }, [isOpen, initialData, users]);

    // Compute suggested flights based on the dates
    const suggestedFlights = useMemo(() => {
        if (!startDate || !endDate || unassignedFlights.length === 0) return [];
        return unassignedFlights.filter(f => {
            const fDate = new Date(f.departureDate);
            const sDate = new Date(startDate);
            const eDate = new Date(endDate);
            return fDate >= sDate && fDate <= eDate;
        });
    }, [startDate, endDate, unassignedFlights]);

    // All available flights is the union of database unassigned flights and already selected flights
    const allAvailableFlights = useMemo(() => {
        const list = [...unassignedFlights];
        selectedFlights.forEach(sf => {
            if (!list.some(f => f.id === sf.id)) {
                list.push(sf);
            }
        });
        return list.sort((a, b) => new Date(a.departureDate).getTime() - new Date(b.departureDate).getTime());
    }, [unassignedFlights, selectedFlights]);

    // Emoji loading Logic
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
    }, [showEmojiPicker]);

    useEffect(() => {
        if (showEmojiPicker && emojiPickerButtonRef.current) {
            const rect = emojiPickerButtonRef.current.getBoundingClientRect();
            let top = rect.bottom + 5;
            let left = rect.right - 320; 
            if (top + 320 > window.innerHeight) top = rect.top - 320 - 5;
            if (left < 10) left = 10;
            setPickerPosition({ top, left });
        }
    }, [showEmojiPicker]);

    useEffect(() => {
        if (!emojiSearch) {
            setFilteredEmojis(allEmojis.slice(0, 100));
        } else {
            const query = emojiSearch.toLowerCase();
            const results = allEmojis.filter(e => e.name.toLowerCase().includes(query)).slice(0, 100);
            setFilteredEmojis(results);
        }
    }, [emojiSearch, allEmojis]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (
                emojiPickerButtonRef.current && 
                !emojiPickerButtonRef.current.contains(event.target as Node) &&
                emojiPickerMenuRef.current &&
                !emojiPickerMenuRef.current.contains(event.target as Node)
            ) {
                setShowEmojiPicker(false);
            }
        }
        if (showEmojiPicker) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [showEmojiPicker]);

    const toggleParticipant = (userId: string) => {
        setParticipants(prev => 
            prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
        );
    };

    const fetchLocationSuggestions = async (query: string): Promise<string[]> => {
        return searchLocations(query);
    };

    const handleSubmit = async () => {
        if (!name || !startDate || !endDate) return;
        setIsLoading(true);

        const previouslyAssignedFlights = (initialData?.transports || []).filter(t => t.mode === 'Flight');
        const currentlySelectedIds = selectedFlights.map(sf => sf.id);
        const releasedFlights = previouslyAssignedFlights.filter(f => !currentlySelectedIds.includes(f.id));

        // Re-add released flights back to the unassigned database
        for (const flight of releasedFlights) {
            await dataService.addFlight(flight);
        }

        const nonFlightTransports = (initialData?.transports || []).filter(t => t.mode !== 'Flight');
        const finalTransports = [...nonFlightTransports, ...selectedFlights];

        const tripData: Trip = {
            ...initialData,
            id: initialData?.id || 'trip-' + Math.random().toString(36).substr(2, 9),
            name,
            location,
            startDate,
            endDate,
            status: initialData?.status || 'Planning',
            participants,
            icon,
            privacy,
            transports: finalTransports
        };

        const newlySelectedFlights = selectedFlights.filter(f => !previouslyAssignedFlights.some(x => x.id === f.id));
        const flightIdsToRemove = newlySelectedFlights.map(f => f.id);
        
        await onSubmit(tripData, flightIdsToRemove);
        setIsLoading(false);
        onClose();
    };

    const handleDelete = async () => {
        if (initialData && onDelete) {
            setIsLoading(true);
            if (!deleteFlightsGroup) {
                const associatedFlights = (initialData.transports || []).filter(t => t.mode === 'Flight');
                for (const flight of associatedFlights) {
                    await dataService.addFlight({
                        ...flight,
                        itineraryId: '' // Clear custom grouping itinerary ID so it is independent
                    });
                }
            }
            await onDelete(initialData.id);
            setIsLoading(false);
            onClose();
        }
    };

    const formatFlightTime = (time?: string) => {
        if (!time) return '';
        const [h, m] = time.split(':');
        const hr = parseInt(h);
        if (isNaN(hr)) return time;
        const period = hr >= 12 ? 'PM' : 'AM';
        const hr12 = hr % 12 || 12;
        return `${hr12}:${m} ${period}`;
    };

    if (showDeleteConfirm) {
        return (
            <Modal isOpen={isOpen} onClose={onClose} title="Permanently Archive Trip?" maxWidth="max-w-md">
                <div className="text-center space-y-6 animate-fade-in p-4">
                    <div className="w-20 h-20 bg-rose-50 dark:bg-rose-950/20 rounded-full flex items-center justify-center mx-auto text-rose-500 animate-pulse border border-rose-150 dark:border-rose-900/30">
                        <span className="material-icons-outlined text-4xl">delete_forever</span>
                    </div>
                    <div>
                        <h4 className="text-xl font-black text-gray-900 dark:text-white">Conclude Journey?</h4>
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mt-2 px-4 leading-relaxed">
                            This will permanently remove <strong>{name}</strong> and any associated stops, accommodations, or activities. This action is final.
                        </p>
                    </div>

                    {associatedFlightsCount > 0 && (
                        <div className="flex items-start text-left gap-3 p-3.5 bg-zinc-50 dark:bg-zinc-950/40 rounded-2xl border border-zinc-200/50 dark:border-white/5 mx-4">
                            <input
                                type="checkbox"
                                id="deleteAssociatedFlights"
                                checked={deleteFlightsGroup}
                                onChange={(e) => setDeleteFlightsGroup(e.target.checked)}
                                className="mt-1 h-4 w-4 text-rose-500 rounded border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 focus:ring-rose-500 cursor-pointer accent-rose-500"
                            />
                            <label htmlFor="deleteAssociatedFlights" className="text-xs text-zinc-650 dark:text-zinc-400 leading-relaxed cursor-pointer select-none">
                                <span className="font-extrabold text-zinc-800 dark:text-zinc-250 block uppercase tracking-wider">
                                    Delete Associated Flights ({associatedFlightsCount})
                                </span>
                                If unchecked, these flights will be preserved as independent flights rather than permanently deleted.
                            </label>
                        </div>
                    )}

                    <div className="flex gap-3 pt-4">
                        <Button variant="ghost" className="flex-1 font-bold text-xs uppercase" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                        <Button variant="danger" className="flex-1 font-bold text-xs uppercase" onClick={handleDelete} isLoading={isLoading}>Permanently Delete</Button>
                    </div>
                </div>
            </Modal>
        );
    }

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={initialData ? `Configure ${initialData.name}` : "Establish Journey Blueprint"} 
            maxWidth="max-w-2xl"
        >
            <div className="space-y-6 relative">
                
                {/* Redesigned Premium Modal Tabs */}
                <div className="flex border-b border-gray-100 dark:border-white/5 bg-zinc-50/50 dark:bg-zinc-950/20 p-1 rounded-2xl">
                    <button
                        type="button"
                        onClick={() => setModalTab('logistics')}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                            modalTab === 'logistics' 
                            ? 'bg-white dark:bg-zinc-800 text-[#fa9a1d] shadow-sm' 
                            : 'text-zinc-400 hover:text-zinc-650 dark:hover:text-zinc-300'
                        }`}
                    >
                        <span className="material-icons-outlined text-sm">assignment</span>
                        <span>1 &bull; Logistics Scope</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setModalTab('team')}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                            modalTab === 'team' 
                            ? 'bg-white dark:bg-zinc-800 text-[#fa9a1d] shadow-sm' 
                            : 'text-zinc-400 hover:text-zinc-650 dark:hover:text-zinc-300'
                        }`}
                    >
                        <span className="material-icons-outlined text-sm">groups</span>
                        <span>2 &bull; Dates & Team</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setModalTab('flights')}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                            modalTab === 'flights' 
                            ? 'bg-white dark:bg-zinc-800 text-[#fa9a1d] shadow-sm' 
                            : 'text-zinc-400 hover:text-zinc-650 dark:hover:text-zinc-300'
                        }`}
                    >
                        <span className="material-icons-outlined text-sm">flight_takeoff</span>
                        <span>3 &bull; Flight Boarding</span>
                    </button>
                </div>

                {/* Tab content wrapper */}
                <div className="min-h-[290px] py-1">
                    <AnimatePresence mode="wait">
                        {/* PHASE 1: LOGISTICS */}
                        {modalTab === 'logistics' && (
                            <motion.div
                                key="phase-logistics"
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 10 }}
                                className="space-y-6"
                            >
                                <div className="flex flex-col md:flex-row gap-6 items-center md:items-start bg-zinc-50/40 dark:bg-zinc-900/20 p-5 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50">
                                    <div className="space-y-2.5 shrink-0 flex flex-col items-center">
                                        <label className="text-[10px] font-black tracking-widest text-[#fa9a1d] uppercase block">Selected Badge</label>
                                        
                                        {/* Giant premium icon preview */}
                                        <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-orange-400/10 to-[#fa9a1d]/5 dark:from-[#fa9a1d]/15 dark:to-zinc-800 border-2 border-[#fa9a1d]/30 dark:border-[#fa9a1d]/20 flex items-center justify-center text-4xl shadow-md relative group select-none">
                                            <span className="animate-scale-in">{icon}</span>
                                            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#fa9a1d] text-white rounded-lg flex items-center justify-center text-xs shadow-sm shadow-[#fa9a1d]/30">
                                                ★
                                            </div>
                                        </div>

                                        <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider text-center max-w-[120px]">
                                            Custom Cover Badge
                                        </p>
                                    </div>

                                    <div className="flex-1 w-full space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black tracking-widest text-zinc-400 dark:text-zinc-500 uppercase block">Quick Presets</label>
                                            <div className="flex flex-wrap gap-1.5">
                                                {EMOJI_PRESETS.slice(0, 10).map(e => (
                                                    <button 
                                                        key={e} 
                                                        type="button"
                                                        onClick={() => setIcon(e.trim())}
                                                        className={`w-9 h-9 flex items-center justify-center rounded-xl text-lg hover:scale-105 active:scale-95 transition-all ${
                                                            icon === e.trim() 
                                                            ? 'bg-[#fa9a1d] text-white shadow-md shadow-[#fa9a1d]/30 font-bold' 
                                                            : 'bg-white hover:bg-zinc-100 border border-zinc-200/60 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800'
                                                        }`}
                                                    >
                                                        {e.trim()}
                                                    </button>
                                                ))}
                                                <button
                                                    ref={emojiPickerButtonRef}
                                                    type="button"
                                                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                                    className={`w-9 h-9 flex items-center justify-center rounded-xl text-lg transition-all border border-dashed hover:scale-105 active:scale-95 ${
                                                        showEmojiPicker 
                                                        ? 'border-[#fa9a1d] bg-[#fef8f0] text-[#fa9a1d]' 
                                                        : 'border-zinc-300 text-zinc-400 hover:border-zinc-400 dark:border-white/10 dark:text-zinc-500'
                                                    }`}
                                                    title="Choose Custom Emoji"
                                                >
                                                    <span className="material-icons-outlined text-base">{showEmojiPicker ? 'close' : 'add_reaction'}</span>
                                                </button>
                                            </div>
                                        </div>

                                        {/* Emoji picker custom portal */}
                                        {showEmojiPicker && pickerPosition && createPortal(
                                            <div 
                                                ref={emojiPickerMenuRef}
                                                className="fixed w-80 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-zinc-150/40 dark:border-white/10 p-4 z-[9999] animate-fade-in"
                                                style={{ top: pickerPosition.top, left: pickerPosition.left }}
                                            >
                                                <div className="flex gap-2 mb-3">
                                                    <Input 
                                                        placeholder="Explore emojis..." 
                                                        autoFocus 
                                                        value={emojiSearch} 
                                                        onChange={e => setEmojiSearch(e.target.value)} 
                                                        className="!py-2 !text-xs !rounded-xl flex-1 focus:border-[#fa9a1d]" 
                                                    />
                                                </div>
                                                
                                                <div className="h-60 overflow-y-auto custom-scrollbar p-0.5">
                                                    {isLoadingEmojis ? (
                                                        <div className="flex justify-center py-10">
                                                            <div className="w-6 h-6 border-2 border-[#fa9a1d] border-t-transparent rounded-full animate-spin"/>
                                                        </div>
                                                    ) : emojiSearch ? (
                                                        <div className="grid grid-cols-6 gap-1 content-start">
                                                            {filteredEmojis.map((e, i) => (
                                                                <button key={i} type="button" onClick={() => { setIcon(e.char); setShowEmojiPicker(false); }} className="aspect-square flex items-center justify-center text-xl hover:bg-[#fdeed9] dark:hover:bg-zinc-800 rounded-lg transition-colors" title={e.name}>{e.char}</button>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-4">
                                                            {CATEGORY_ORDER.map(cat => {
                                                                const emojis = groupedEmojis[cat];
                                                                if (!emojis || emojis.length === 0) return null;
                                                                return (
                                                                    <div key={cat}>
                                                                        <h5 className="sticky top-0 bg-white dark:bg-zinc-900 py-1 mb-1 text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-zinc-100 dark:border-white/5">{cat}</h5>
                                                                        <div className="grid grid-cols-6 gap-1 content-start">
                                                                            {emojis.map((e, i) => (
                                                                                <button key={`${cat}-${i}`} type="button" onClick={() => { setIcon(e.char); setShowEmojiPicker(false); }} className="aspect-square flex items-center justify-center text-xl hover:bg-[#fdeed9] dark:hover:bg-zinc-800 rounded-lg transition-colors" title={e.name}>{e.char}</button>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>,
                                            document.body
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <Input 
                                        label="Journey Title" 
                                        placeholder="e.g. Autumn in Tokyo" 
                                        value={name} 
                                        onChange={e => setName(e.target.value)} 
                                        className="!text-lg font-black focus:border-[#fa9a1d] focus:ring-[#fa9a1d]/10"
                                    />
                                    <Autocomplete 
                                        label="General Destination" 
                                        placeholder="Search destinations (e.g. Tokyo, Shibuya)" 
                                        value={location} 
                                        onChange={setLocation}
                                        fetchSuggestions={fetchLocationSuggestions}
                                        className="focus:border-[#fa9a1d] font-bold"
                                    />
                                </div>
                            </motion.div>
                        )}

                        {/* PHASE 2: DATES & TEAM */}
                        {modalTab === 'team' && (
                            <motion.div
                                key="phase-team"
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 10 }}
                                className="space-y-6 animate-fade-in"
                            >
                                <div className="grid grid-cols-2 gap-4">
                                    <Input 
                                        label="Journey Begins" 
                                        type="date" 
                                        value={startDate} 
                                        onChange={e => setStartDate(e.target.value)} 
                                        className="font-bold focus:border-[#fa9a1d]"
                                    />
                                    <Input 
                                        label="Journey Concludes" 
                                        type="date" 
                                        value={endDate} 
                                        min={startDate}
                                        onChange={e => setEndDate(e.target.value)} 
                                        className="font-bold focus:border-[#fa9a1d]"
                                    />
                                </div>

                                <div className="space-y-3">
                                    <label className="text-xs font-black text-gray-500 uppercase ml-1 block">Co-travelers assigned to this scope</label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto">
                                        {users.map(u => {
                                            const selected = participants.includes(u.id);
                                            return (
                                                <button
                                                    key={u.id}
                                                    type="button"
                                                    onClick={() => toggleParticipant(u.id)}
                                                    className={`flex items-center justify-between px-4 py-3 rounded-2xl border transition-all text-left ${
                                                        selected 
                                                        ? 'bg-[#fa9a1d]/5 border-[#fa9a1d] text-[#fa9a1d] ring-2 ring-[#fa9a1d]/10 font-bold' 
                                                        : 'bg-white border-zinc-200 hover:bg-zinc-50 dark:bg-zinc-900/40 dark:border-white/5'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black text-white shrink-0 shadow-sm ${
                                                            u.role === 'Partner' ? 'bg-[#fa9a1d]' : u.role === 'Admin' ? 'bg-sky-500' : 'bg-emerald-500'
                                                        }`}>
                                                            {u.name.charAt(0)}
                                                        </div>
                                                        <div>
                                                            <div className="text-xs font-black text-zinc-850 dark:text-zinc-200">{u.name}</div>
                                                            <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mt-0.5">{u.role} Label</div>
                                                        </div>
                                                    </div>
                                                    {selected && (
                                                        <span className="material-icons-outlined text-sm font-bold text-[#fa9a1d]">check_circle</span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* PHASE 3: FLIGHT COUPLING */}
                        {modalTab === 'flights' && (
                            <motion.div
                                key="phase-flights"
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 10 }}
                                className="space-y-4"
                            >
                                {/* Suggesions segment based on selected range of travel dates */}
                                {startDate && endDate && suggestedFlights.length > 0 && (
                                    <div className="p-4 rounded-2xl bg-[#fa9a1d]/5 border border-[#fa9a1d]/20 text-[#fa9a1d] space-y-3.5">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5 leading-none">
                                                <span className="material-icons-outlined text-sm animate-pulse">auto_awesome</span>
                                                <span className="text-[10px] font-black uppercase tracking-wider">Matched independent flights found ({suggestedFlights.length})</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const batch = [...selectedFlights];
                                                    suggestedFlights.forEach(f => {
                                                        if (!batch.some(x => x.id === f.id)) {
                                                            batch.push(f);
                                                        }
                                                    });
                                                    setSelectedFlights(batch);
                                                }}
                                                className="text-[10px] font-black underline uppercase hover:text-[#e78310]"
                                            >
                                                Couple All
                                            </button>
                                        </div>
                                        <div className="text-[11px] text-zinc-500 dark:text-zinc-450 leading-relaxed font-bold">
                                            The system retrieved the following incoming flights occurring during the {startDate} to {endDate} scope:
                                        </div>
                                        
                                        <div className="grid gap-2.5 max-h-36 overflow-y-auto pr-1">
                                            {suggestedFlights.map(flight => {
                                                const isSelected = selectedFlights.some(f => f.id === flight.id);
                                                return (
                                                    <div
                                                        key={flight.id}
                                                        onClick={() => {
                                                            if (isSelected) {
                                                                setSelectedFlights(prev => prev.filter(f => f.id !== flight.id));
                                                            } else {
                                                                setSelectedFlights(prev => [...prev, flight]);
                                                            }
                                                        }}
                                                        className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer select-none transition-all ${
                                                            isSelected 
                                                            ? 'bg-[#fa9a1d]/10 border-[#fa9a1d] text-zinc-950 dark:text-white font-bold shadow-md' 
                                                            : 'bg-white border-zinc-150-10 hover:border-zinc-300 dark:bg-zinc-900/20'
                                                        }`}
                                                    >
                                                        <div className="flex-1 min-w-0 pr-4">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="text-xs font-black">{flight.provider} &bull; {flight.identifier}</span>
                                                                <span className="text-[9px] uppercase font-black px-1.5 py-0.5 rounded-sm bg-zinc-100 dark:bg-zinc-805 text-zinc-550">{flight.departureDate}</span>
                                                            </div>
                                                            <div className="text-[10px] font-mono tracking-wide flex items-center gap-1.5 mt-1.5 text-zinc-500">
                                                                <span className="font-extrabold">{flight.origin}</span>
                                                                <span>&rarr;</span>
                                                                <span className="font-extrabold">{flight.destination}</span>
                                                                <span className="text-zinc-400">&bull; {formatFlightTime(flight.departureTime)}</span>
                                                            </div>
                                                        </div>
                                                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                                                            isSelected ? 'bg-[#fa9a1d] border-[#fa9a1d] text-white shadow-sm' : 'border-zinc-300 dark:border-zinc-700'
                                                        }`}>
                                                            {isSelected && <span className="material-icons-outlined text-xs font-bold">check</span>}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Manual trigger toggle flights registry list */}
                                <div className="space-y-3 pt-2">
                                    <div className="flex justify-between items-center px-1">
                                        <button
                                            type="button"
                                            onClick={() => setShowAllFlightsManual(!showAllFlightsManual)}
                                            className="text-xs font-black uppercase text-[#fa9a1d] hover:underline flex items-center gap-1 leading-none"
                                        >
                                            <span className="material-icons-outlined text-sm">{showAllFlightsManual ? 'unfold_less' : 'unfold_more'}</span>
                                            <span>{showAllFlightsManual ? 'Minimize' : 'Explore Full Independent Flights List'}</span>
                                        </button>
                                        {selectedFlights.length > 0 && (
                                            <button 
                                                type="button"
                                                onClick={() => setSelectedFlights([])}
                                                className="text-[10px] font-black uppercase text-zinc-400 hover:text-rose-500"
                                            >
                                                Clear Linked ({selectedFlights.length})
                                            </button>
                                        )}
                                    </div>

                                    {showAllFlightsManual && (
                                        <div className="p-4 rounded-3xl bg-zinc-55 dark:bg-zinc-950/20 border border-zinc-150-10 space-y-3.5 animate-slide-down">
                                            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Available Independent Flights Registry ({allAvailableFlights.length})</div>
                                            {allAvailableFlights.length === 0 ? (
                                                <div className="text-center py-6 text-xs text-zinc-400 font-bold uppercase tracking-wider">No separate segments tracked</div>
                                            ) : (
                                                <div className="grid gap-2 max-h-44 overflow-y-auto pr-1">
                                                    {allAvailableFlights.map(flight => {
                                                        const isSelected = selectedFlights.some(f => f.id === flight.id);
                                                        return (
                                                            <div
                                                                key={flight.id}
                                                                onClick={() => {
                                                                    if (isSelected) {
                                                                        setSelectedFlights(prev => prev.filter(f => f.id !== flight.id));
                                                                    } else {
                                                                        setSelectedFlights(prev => [...prev, flight]);
                                                                    }
                                                                }}
                                                                className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer select-none transition-all ${
                                                                    isSelected 
                                                                    ? 'bg-[#fa9a1d]/10 border-[#fa9a1d] text-zinc-950 dark:text-white font-bold' 
                                                                    : 'bg-white border-zinc-200 hover:border-zinc-300 dark:bg-zinc-900/30 dark:border-white/5'
                                                                }`}
                                                            >
                                                                <div className="flex-1 min-w-0 pr-4">
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        <span className="text-xs font-black">{flight.provider} {flight.identifier}</span>
                                                                        <span className="text-[9px] uppercase font-black px-1.5 py-0.5 rounded-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-500">{flight.departureDate}</span>
                                                                    </div>
                                                                    <div className="text-[10px] font-mono tracking-wide flex items-center gap-1.5 mt-1.5 text-zinc-450">
                                                                        <span className="font-extrabold">{flight.origin}</span>
                                                                        <span>&rarr;</span>
                                                                        <span className="font-extrabold">{flight.destination}</span>
                                                                        <span className="text-zinc-400">&bull; {formatFlightTime(flight.departureTime)}</span>
                                                                    </div>
                                                                </div>
                                                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                                                                    isSelected ? 'bg-[#fa9a1d] border-[#fa9a1d] text-white shadow-sm' : 'border-zinc-300 dark:border-zinc-700'
                                                                }`}>
                                                                    {isSelected && <span className="material-icons-outlined text-xs font-bold text-white">check</span>}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}

                    </AnimatePresence>
                </div>

                {/* Footer buttons / Submission block */}
                <div className="flex gap-3 pt-5 border-t border-zinc-100 dark:border-white/5 justify-between">
                    {initialData && onDelete && (
                        <button 
                            type="button" 
                            onClick={() => setShowDeleteConfirm(true)} 
                            className="px-5 py-3 rounded-2xl border border-red-200/50 hover:border-red-300 bg-rose-500/5 hover:bg-rose-500/10 text-rose-600 dark:text-[#fb6b6b] text-xs font-extrabold uppercase transition-all flex items-center gap-1.5"
                        >
                            <span className="material-icons-outlined text-sm font-bold">delete</span>
                            <span>Archive Trip</span>
                        </button>
                    )}
                    <div className="flex gap-3 flex-1 justify-end items-center">
                        <Button variant="ghost" type="button" className="text-xs font-extrabold uppercase tracking-wide py-3" onClick={onClose}>Dismiss</Button>
                        
                        {modalTab !== 'flights' ? (
                            <button
                                type="button"
                                onClick={() => setModalTab(modalTab === 'logistics' ? 'team' : 'flights')}
                                className="px-6 py-3 bg-[#fa9a1d] hover:bg-[#e78310] text-zinc-950 hover:text-zinc-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md items-center gap-1 flex active:scale-95"
                            >
                                <span>Continue</span>
                                <span className="material-icons-outlined text-xs">arrow_forward</span>
                            </button>
                        ) : (
                            <button 
                                type="button" 
                                className="px-6 py-3 text-xs uppercase tracking-wider rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 transition-all font-black disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-500/20 active:scale-95 flex items-center gap-1.5" 
                                onClick={handleSubmit} 
                                disabled={isLoading || !name || !startDate || !endDate}
                            >
                                {isLoading ? (
                                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin inline-block mr-1 align-middle" />
                                ) : (
                                    <span className="material-icons-outlined text-sm">flight_takeoff</span>
                                )}
                                <span>{initialData ? 'Save Blueprint' : 'Establish Route Model'}</span>
                            </button>
                        )}
                    </div>
                </div>

            </div>
        </Modal>
    );
};
