
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { GoogleGenAI } from "@google/genai";
import { Modal, Button, Input, Select, Autocomplete } from './ui';
import { Trip, User } from '../types';

interface TripModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (trip: Trip) => Promise<void>;
    onDelete?: (tripId: string) => Promise<void>;
    users: User[];
    initialData?: Trip | null;
}

const EMOJI_PRESETS = ['✈️', '🚗', '🏖️', '🏔️', '🏙️', '🚢', '🎒', '🏰', '🍷', '⛷️'];

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
    const [name, setName] = useState('');
    const [location, setLocation] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [icon, setIcon] = useState('✈️');
    const [participants, setParticipants] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

    useEffect(() => {
        if (isOpen) {
            setShowDeleteConfirm(false);
            if (initialData) {
                setName(initialData.name);
                setLocation(initialData.location);
                setStartDate(initialData.startDate);
                setEndDate(initialData.endDate);
                setIcon(initialData.icon || '✈️');
                setParticipants(initialData.participants);
            } else {
                setName('');
                setLocation('');
                setStartDate('');
                setEndDate('');
                setIcon('✈️');
                setParticipants(users.length > 0 ? [users[0].id] : []);
            }
        }
    }, [isOpen, initialData, users]);

    // Emoji Logic
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
        try {
            // Using GenAI to simulate Google Maps Autocomplete for travel destinations
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: `List 5 distinct cities or popular travel destinations that match "${query}". Return ONLY a raw JSON array of strings (e.g. ["Paris, France", "Paros, Greece"]).`,
                config: {
                    responseMimeType: 'application/json'
                }
            });
            const text = response.text;
            if (!text) return [];
            return JSON.parse(text);
        } catch (e) {
            console.error("GenAI autocomplete failed", e);
            return [];
        }
    };

    const handleSubmit = async () => {
        if (!name || !startDate || !endDate) return;
        setIsLoading(true);

        const tripData: Trip = {
            id: initialData?.id || Math.random().toString(36).substr(2, 9),
            name,
            location,
            startDate,
            endDate,
            status: initialData?.status || 'Planning',
            participants,
            icon,
            entitlementId: initialData?.entitlementId, 
            allocations: initialData?.allocations, 
            flights: initialData?.flights || []
        };

        await onSubmit(tripData);
        setIsLoading(false);
        onClose();
    };

    const handleDelete = async () => {
        if (initialData && onDelete) {
            setIsLoading(true);
            await onDelete(initialData.id);
            setIsLoading(false);
            onClose();
        }
    };

    if (showDeleteConfirm) {
        return (
            <Modal isOpen={isOpen} onClose={onClose} title="Delete Trip?" maxWidth="max-w-md">
                <div className="text-center space-y-6 animate-fade-in">
                    <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto text-rose-600 animate-pulse">
                        <span className="material-icons-outlined text-4xl">delete_forever</span>
                    </div>
                    <div>
                        <h4 className="text-xl font-bold text-gray-900 dark:text-white">Are you sure?</h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                            This will permanently remove <strong>{name}</strong> and all associated flights.
                        </p>
                    </div>
                    <div className="flex gap-3 pt-2">
                        <Button variant="ghost" className="flex-1" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                        <Button variant="danger" className="flex-1" onClick={handleDelete} isLoading={isLoading}>Yes, Delete</Button>
                    </div>
                </div>
            </Modal>
        );
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={initialData ? "Edit Trip Details" : "Plan New Adventure"} maxWidth="max-w-2xl">
            <div className="space-y-6">
                
                {/* Header Input Group */}
                <div className="flex gap-4 items-start">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase ml-1">Icon</label>
                        <div className="grid grid-cols-3 gap-2 w-32">
                             {EMOJI_PRESETS.slice(0, 8).map(e => (
                                 <button 
                                    key={e} 
                                    onClick={() => setIcon(e)}
                                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-lg transition-all ${icon === e ? 'bg-blue-600 text-white shadow-md scale-110' : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-white/10'}`}
                                 >
                                     {e}
                                 </button>
                             ))}
                             <button
                                ref={emojiPickerButtonRef}
                                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                className={`w-8 h-8 flex items-center justify-center rounded-lg text-lg transition-all border border-dashed ${showEmojiPicker ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-600 dark:border-white/20 dark:text-gray-500'}`}
                                title="More Icons"
                             >
                                <span className="material-icons-outlined text-sm">{showEmojiPicker ? 'close' : 'add_reaction'}</span>
                             </button>
                        </div>
                        
                        {/* Emoji Popover (Portal) */}
                        {showEmojiPicker && pickerPosition && createPortal(
                            <div 
                                ref={emojiPickerMenuRef}
                                className="fixed w-80 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-white/10 p-4 z-[9999] animate-fade-in origin-top-right"
                                style={{ top: pickerPosition.top, left: pickerPosition.left }}
                            >
                                <div className="flex gap-2 mb-3">
                                    <Input placeholder="Search..." autoFocus value={emojiSearch} onChange={e => setEmojiSearch(e.target.value)} className="!py-2 !text-xs !rounded-xl flex-1" />
                                </div>
                                
                                <div className="h-64 overflow-y-auto custom-scrollbar">
                                    {isLoadingEmojis ? (
                                        <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/></div>
                                    ) : emojiSearch ? (
                                        <div className="grid grid-cols-6 gap-1 content-start">
                                            {filteredEmojis.map((e, i) => (
                                                <button key={i} onClick={() => { setIcon(e.char); setShowEmojiPicker(false); }} className="aspect-square flex items-center justify-center text-xl hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors" title={e.name}>{e.char}</button>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {CATEGORY_ORDER.map(cat => {
                                                const emojis = groupedEmojis[cat];
                                                if (!emojis || emojis.length === 0) return null;
                                                return (
                                                    <div key={cat}>
                                                        <h5 className="sticky top-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm py-1 mb-1 text-[10px] font-black text-gray-400 uppercase tracking-widest z-10 border-b border-gray-100 dark:border-white/5">{cat}</h5>
                                                        <div className="grid grid-cols-6 gap-1 content-start">
                                                            {emojis.map((e, i) => (
                                                                <button key={`${cat}-${i}`} onClick={() => { setIcon(e.char); setShowEmojiPicker(false); }} className="aspect-square flex items-center justify-center text-xl hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors" title={e.name}>{e.char}</button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {groupedEmojis['Other'] && (
                                                <div>
                                                    <h5 className="sticky top-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm py-1 mb-1 text-[10px] font-black text-gray-400 uppercase tracking-widest z-10 border-b border-gray-100 dark:border-white/5">Others</h5>
                                                    <div className="grid grid-cols-6 gap-1 content-start">
                                                        {groupedEmojis['Other'].map((e, i) => (
                                                            <button key={`other-${i}`} onClick={() => { setIcon(e.char); setShowEmojiPicker(false); }} className="aspect-square flex items-center justify-center text-xl hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors" title={e.name}>{e.char}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {!isLoadingEmojis && filteredEmojis.length === 0 && emojiSearch && <div className="text-center text-[10px] text-gray-400 py-6 uppercase font-bold tracking-wider">No matches</div>}
                                </div>
                            </div>,
                            document.body
                        )}
                    </div>
                    <div className="flex-1 space-y-4">
                        <Input 
                            label="Trip Name" 
                            placeholder="e.g. Summer in Italy" 
                            value={name} 
                            onChange={e => setName(e.target.value)} 
                            className="!text-lg font-bold"
                        />
                        <Autocomplete 
                            label="Destination / Location" 
                            placeholder="e.g. Tuscany, Florence" 
                            value={location} 
                            onChange={setLocation}
                            fetchSuggestions={fetchLocationSuggestions}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                    <Input 
                        label="Start Date" 
                        type="date" 
                        value={startDate} 
                        onChange={e => setStartDate(e.target.value)} 
                        className="font-medium"
                    />
                    <Input 
                        label="End Date" 
                        type="date" 
                        value={endDate} 
                        min={startDate}
                        onChange={e => setEndDate(e.target.value)} 
                        className="font-medium"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase ml-1">Who is going?</label>
                    <div className="flex flex-wrap gap-2">
                        {users.map(u => {
                            const selected = participants.includes(u.id);
                            return (
                                <button
                                    key={u.id}
                                    onClick={() => toggleParticipant(u.id)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                                        selected 
                                        ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300' 
                                        : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50 dark:bg-white/5 dark:border-white/10 dark:text-gray-400'
                                    }`}
                                >
                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white ${u.role === 'Partner' ? 'bg-blue-500' : 'bg-emerald-500'}`}>
                                        {u.name.charAt(0)}
                                    </div>
                                    <span className="text-sm font-bold">{u.name}</span>
                                    {selected && <span className="material-icons-outlined text-sm">check</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-white/5 justify-between">
                    {initialData && onDelete && (
                        <Button variant="danger" onClick={() => setShowDeleteConfirm(true)} icon={<span className="material-icons-outlined">delete</span>}>
                            Delete
                        </Button>
                    )}
                    <div className="flex gap-3 flex-1 justify-end">
                        <Button variant="ghost" className="w-full md:w-auto" onClick={onClose}>Cancel</Button>
                        <Button variant="primary" className="w-full md:w-auto" onClick={handleSubmit} isLoading={isLoading} disabled={!name || !startDate || !endDate}>
                            {initialData ? 'Save Changes' : 'Create Trip Plan'}
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};
