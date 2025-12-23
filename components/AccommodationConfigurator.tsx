
import React, { useState, useEffect, useMemo } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Button, Input, Select, Autocomplete, Badge } from './ui';
import { Accommodation } from '../types';
import { dataService } from '../services/mockDb';

interface AccommodationConfiguratorProps {
    initialData?: Accommodation[];
    onSave: (items: Accommodation[]) => void;
    onDelete?: (ids: string[]) => void;
    onCancel: () => void;
    defaultStartDate?: string;
    defaultEndDate?: string;
}

const ACCOMMODATION_TYPES = [
    { label: 'Hotel', value: 'Hotel' },
    { label: 'Airbnb / Rental', value: 'Airbnb' },
    { label: 'Resort', value: 'Resort' },
    { label: 'Villa', value: 'Villa' },
    { label: 'Apartment', value: 'Apartment' },
    { label: 'Hostel', value: 'Hostel' },
    { label: 'Campground', value: 'Campground' },
    { label: 'Friends / Family', value: 'Friends/Family' },
];

const getCurrencySymbol = (code: string) => {
    const symbols: Record<string, string> = {
        'USD': '$',
        'EUR': '€',
        'GBP': '£',
        'AUD': 'A$',
        'JPY': '¥'
    };
    return symbols[code] || code || '$';
};

export const AccommodationConfigurator: React.FC<AccommodationConfiguratorProps> = ({
    initialData,
    onSave,
    onDelete,
    onCancel,
    defaultStartDate,
    defaultEndDate
}) => {
    const [items, setItems] = useState<Accommodation[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<Partial<Accommodation>>({});
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    
    // Currency & Input State
    const [currencySymbol, setCurrencySymbol] = useState('$');
    const [perNightInput, setPerNightInput] = useState('');
    const [activeField, setActiveField] = useState<'total' | 'perNight' | null>(null);

    useEffect(() => {
        dataService.getWorkspaceSettings().then(s => {
            setCurrencySymbol(getCurrencySymbol(s.currency));
        });

        if (initialData && initialData.length > 0) {
            setItems(initialData);
        } else {
            prepareNewItem();
        }
    }, [initialData]);

    // Calculate nights for cost computation
    const nights = useMemo(() => {
        if (!form.checkInDate || !form.checkOutDate) return 0;
        const start = new Date(form.checkInDate);
        const end = new Date(form.checkOutDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
        
        const diff = end.getTime() - start.getTime();
        const days = Math.ceil(diff / (1000 * 3600 * 24));
        return Math.max(0, days);
    }, [form.checkInDate, form.checkOutDate]);

    // Sync Per Night Input when Total Cost changes (unless editing Per Night)
    useEffect(() => {
        if (activeField === 'perNight') return; // Don't interrupt user typing
        
        if (form.cost && nights > 0) {
            const val = form.cost / nights;
            // Clean format: if integer, no decimals. If float, max 2.
            const formatted = Number.isInteger(val) ? val.toString() : val.toFixed(2);
            setPerNightInput(formatted);
        } else if (!form.cost) {
            setPerNightInput('');
        }
    }, [form.cost, nights, activeField]);

    const prepareNewItem = () => {
        const newItemId = Math.random().toString(36).substr(2, 9);
        setForm({
            id: newItemId,
            name: '',
            address: '',
            type: 'Hotel',
            checkInDate: defaultStartDate || '',
            checkOutDate: defaultEndDate || '',
            checkInTime: '15:00',
            checkOutTime: '11:00',
            confirmationCode: '',
            notes: '',
            website: '',
            cost: undefined
        });
        setPerNightInput('');
        setEditingId(newItemId);
    };

    const handleSaveItem = () => {
        if (!form.name || !form.checkInDate || !form.checkOutDate) return;

        const newItem = form as Accommodation;
        
        setItems(prev => {
            const existingIndex = prev.findIndex(i => i.id === newItem.id);
            if (existingIndex >= 0) {
                const updated = [...prev];
                updated[existingIndex] = newItem;
                return updated;
            }
            return [...prev, newItem];
        });

        setEditingId(null);
        setForm({});
    };

    const handleEditItem = (item: Accommodation) => {
        setForm({ ...item });
        setEditingId(item.id);
    };

    const handleDeleteItem = (id: string) => {
        setItems(prev => prev.filter(i => i.id !== id));
        if (editingId === id) {
            setEditingId(null);
            setForm({});
        }
    };

    const handleSaveAll = () => {
        if (editingId && form.name && form.checkInDate) {
             const newItem = form as Accommodation;
             const updatedItems = [...items.filter(i => i.id !== newItem.id), newItem];
             onSave(updatedItems);
        } else {
             onSave(items);
        }
    };

    const handlePerNightChange = (valStr: string) => {
        setPerNightInput(valStr); // Always update local input state to allow "1." or "0"
        const val = parseFloat(valStr);
        
        if (!isNaN(val) && nights > 0) {
            // Update total cost in background
            setForm(prev => ({ ...prev, cost: val * nights }));
        } else if (valStr === '') {
            setForm(prev => ({ ...prev, cost: undefined }));
        }
    };

    const fetchPlaceSuggestions = async (query: string): Promise<string[]> => {
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: `List 5 real hotels or accommodations that match "${query}". Return ONLY a raw JSON array of strings (e.g. ["Hilton London Metropole, London", "The Ritz, Paris"]).`,
                config: { responseMimeType: 'application/json' }
            });
            return response.text ? JSON.parse(response.text) : [];
        } catch (e) {
            console.error("Autocomplete failed", e);
            return [];
        }
    };

    if (showDeleteConfirm) {
        return (
            <div className="text-center space-y-6 animate-fade-in py-8">
                <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto text-rose-600 animate-pulse">
                    <span className="material-icons-outlined text-4xl">delete_forever</span>
                </div>
                <div>
                    <h4 className="text-xl font-bold text-gray-900 dark:text-white">Delete All Accommodations?</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                        This will remove {items.length} stays from this trip.
                    </p>
                </div>
                <div className="flex gap-3 pt-2 max-w-xs mx-auto">
                    <Button variant="ghost" className="flex-1" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                    <Button variant="danger" className="flex-1" onClick={() => { if (onDelete && initialData) onDelete(initialData.map(i => i.id)); }}>Confirm</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in max-h-[80vh] overflow-y-auto custom-scrollbar p-1">
            
            {/* List of Accommodations */}
            <div className="space-y-4">
                {items.filter(i => i.id !== editingId).map((item) => (
                    <div key={item.id} className="relative p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-white/10 group flex justify-between items-center hover:shadow-md transition-all">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center justify-center text-2xl">
                                <span className="material-icons-outlined">
                                    {item.type === 'Hotel' ? 'hotel' : item.type === 'Airbnb' ? 'house' : 'apartment'}
                                </span>
                            </div>
                            <div>
                                <h4 className="font-bold text-gray-900 dark:text-white">{item.name}</h4>
                                <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                    <span>{new Date(item.checkInDate).toLocaleDateString(undefined, {month:'short', day:'numeric'})}</span>
                                    <span className="material-icons-outlined text-[10px]">arrow_forward</span>
                                    <span>{new Date(item.checkOutDate).toLocaleDateString(undefined, {month:'short', day:'numeric'})}</span>
                                    {item.cost && (
                                        <>
                                            <span className="w-1 h-1 rounded-full bg-gray-300 mx-1"></span>
                                            <span className="text-emerald-600 font-bold">{currencySymbol}{item.cost}</span>
                                        </>
                                    )}
                                    <span className="w-1 h-1 rounded-full bg-gray-300 mx-1"></span>
                                    <span className="truncate max-w-[150px]">{item.address}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => handleEditItem(item)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg dark:hover:bg-white/5 transition-colors">
                                <span className="material-icons-outlined text-lg">edit</span>
                            </button>
                            <button onClick={() => handleDeleteItem(item.id)} className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg dark:hover:bg-white/5 transition-colors">
                                <span className="material-icons-outlined text-lg">close</span>
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Editor Form */}
            {(editingId || items.length === 0) && (
                <div className="p-6 bg-gray-50 dark:bg-white/5 rounded-3xl border border-gray-100 dark:border-white/5 animate-fade-in relative">
                    <div className="flex justify-between items-center mb-6">
                        <h4 className="text-sm font-black text-gray-500 uppercase tracking-widest">
                            {items.find(i => i.id === editingId) ? 'Edit Accommodation' : 'New Stay Details'}
                        </h4>
                        {items.length > 0 && (
                            <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600">
                                <span className="material-icons-outlined">close</span>
                            </button>
                        )}
                    </div>

                    <div className="space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input 
                                label="Name of Place" 
                                placeholder="e.g. The Grand Hotel"
                                value={form.name || ''}
                                onChange={e => setForm({...form, name: e.target.value})}
                                className="!font-bold"
                            />
                            <Select 
                                label="Type"
                                options={ACCOMMODATION_TYPES}
                                value={form.type || 'Hotel'}
                                onChange={e => setForm({...form, type: e.target.value as any})}
                            />
                        </div>

                        <Autocomplete 
                            label="Address / Location"
                            placeholder="e.g. 123 Ocean Drive, Miami"
                            value={form.address || ''}
                            onChange={val => setForm({...form, address: val})}
                            fetchSuggestions={fetchPlaceSuggestions}
                        />

                        <div className="grid grid-cols-2 gap-4 relative">
                            <Input 
                                label="Check In" 
                                type="date"
                                value={form.checkInDate || ''}
                                onChange={e => setForm({...form, checkInDate: e.target.value})}
                            />
                            <Input 
                                label="Check Out" 
                                type="date"
                                value={form.checkOutDate || ''}
                                min={form.checkInDate}
                                onChange={e => setForm({...form, checkOutDate: e.target.value})}
                            />
                            {nights > 0 && (
                                <div className="absolute top-0 right-0 -mt-2 -mr-2">
                                    <Badge color="blue" className="shadow-sm">{nights} Nights</Badge>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <Input 
                                label="Check In Time" 
                                type="time"
                                value={form.checkInTime || ''}
                                onChange={e => setForm({...form, checkInTime: e.target.value})}
                            />
                            <Input 
                                label="Check Out Time" 
                                type="time"
                                value={form.checkOutTime || ''}
                                onChange={e => setForm({...form, checkOutTime: e.target.value})}
                            />
                            <Input 
                                label="Conf. Code" 
                                placeholder="XYZ-123"
                                value={form.confirmationCode || ''}
                                onChange={e => setForm({...form, confirmationCode: e.target.value})}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="relative">
                                <Input 
                                    label="Total Cost" 
                                    type="number"
                                    placeholder="0.00"
                                    value={form.cost || ''}
                                    onChange={e => setForm({...form, cost: parseFloat(e.target.value)})}
                                    onFocus={() => setActiveField('total')}
                                    onBlur={() => setActiveField(null)}
                                    className="pl-8 font-bold"
                                />
                                <span className="absolute left-3 top-9 text-gray-400 font-bold">{currencySymbol}</span>
                            </div>
                            <div className="relative">
                                <Input 
                                    label="Cost / Night" 
                                    type="number"
                                    placeholder="0.00"
                                    value={perNightInput}
                                    onChange={e => handlePerNightChange(e.target.value)}
                                    onFocus={() => setActiveField('perNight')}
                                    onBlur={() => setActiveField(null)}
                                    className="pl-8"
                                    disabled={nights <= 0}
                                />
                                <span className="absolute left-3 top-9 text-gray-400 font-bold">{currencySymbol}</span>
                            </div>
                            <Input 
                                label="Booking Website" 
                                placeholder="e.g. Booking.com"
                                value={form.website || ''}
                                onChange={e => setForm({...form, website: e.target.value})}
                            />
                        </div>

                        <Input 
                            label="Notes" 
                            placeholder="Door codes, wifi passwords, etc."
                            value={form.notes || ''}
                            onChange={e => setForm({...form, notes: e.target.value})}
                        />

                        <div className="pt-2 flex justify-end">
                            <Button 
                                variant="primary" 
                                onClick={handleSaveItem}
                                disabled={!form.name || !form.checkInDate || !form.checkOutDate}
                                className="shadow-lg shadow-amber-500/20 bg-amber-500 hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-500 border-transparent"
                            >
                                {items.some(i => i.id === editingId) ? 'Update Stay' : 'Add Stay'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Button (only if not editing) */}
            {!editingId && (
                <Button 
                    variant="secondary" 
                    className="w-full border-dashed py-4" 
                    icon={<span className="material-icons-outlined">add_location</span>}
                    onClick={prepareNewItem}
                >
                    Add Another Accommodation
                </Button>
            )}

            {/* Footer Actions */}
            <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-white/5 sticky bottom-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur p-2 justify-between">
                {initialData && initialData.length > 0 && onDelete && (
                    <Button variant="danger" onClick={() => setShowDeleteConfirm(true)} icon={<span className="material-icons-outlined">delete</span>}>
                        Delete All
                    </Button>
                )}
                <div className="flex gap-3 flex-1 justify-end">
                    <Button variant="ghost" onClick={onCancel} className="w-full md:w-auto">Cancel</Button>
                    <Button variant="primary" onClick={handleSaveAll} className="w-full md:w-auto">
                        Save Accommodations
                    </Button>
                </div>
            </div>
        </div>
    );
};
