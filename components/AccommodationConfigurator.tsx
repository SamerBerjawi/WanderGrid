import React, { useState, useEffect, useMemo } from 'react';
import {
    Bed,
    House,
    Buildings,
    Sparkle,
    Trash,
    Plus,
    MapPin,
    MagnifyingGlass,
    X,
    WarningCircle,
    Check
} from '@/components/ui/hugeicons';
import { Input, Autocomplete, TimeInput, Badge, DateRangePicker } from './ui';
import { Accommodation } from '../types';
import { dataService } from '../services/mockDb';
import { formatDateRange, formatCurrency, getCurrencySymbol } from '../utils/formatters';
import { searchLocations } from '../services/geocoding';
import {
    STATUS_DANGER_STYLE,
    BTN_PRIMARY_STYLE,
    BTN_SECONDARY_STYLE,
    BTN_DANGER_STYLE
} from '../constants';

export interface AccommodationConfiguratorProps {
    initialData?: Accommodation[];
    onSave: (accommodations: Accommodation[]) => void;
    onDelete?: (ids: string[]) => void;
    onCancel: () => void;
    defaultStartDate?: string;
    defaultEndDate?: string;
}

interface AccTypeOption {
    label: string;
    value: string;
    icon: React.ElementType;
}

const ACCOMMODATION_TYPES: AccTypeOption[] = [
    { label: 'Hotel', value: 'Hotel', icon: Bed },
    { label: 'Apartment', value: 'Apartment', icon: Buildings },
    { label: 'Villa / Rental', value: 'Villa', icon: House },
    { label: 'Resort', value: 'Resort', icon: Sparkle },
    { label: 'Hostel', value: 'Hostel', icon: Buildings },
];

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
    const [draftError, setDraftError] = useState<string | null>(null);

    // Currency & Input State
    const [currencySymbol, setCurrencySymbol] = useState('$');
    const [brandfetchKey, setBrandfetchKey] = useState<string>('');
    const [isFetchingBrand, setIsFetchingBrand] = useState(false);
    const [perNightInput, setPerNightInput] = useState('');
    const [activeField, setActiveField] = useState<'total' | 'perNight' | null>(null);

    useEffect(() => {
        dataService.getWorkspaceSettings().then(s => {
            if (s) {
                if (s.currency) setCurrencySymbol(getCurrencySymbol(s.currency));
                if (s.brandfetchApiKey) setBrandfetchKey(s.brandfetchApiKey);
            }
        });

        if (initialData && initialData.length > 0) {
            setItems(initialData);
            setForm({ ...initialData[0] });
            setEditingId(initialData[0].id);
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
        if (activeField === 'perNight') return;

        if (form.cost && nights > 0) {
            const val = form.cost / nights;
            const formatted = Number.isInteger(val) ? val.toString() : val.toFixed(2);
            setPerNightInput(formatted);
        } else if (!form.cost) {
            setPerNightInput('');
        }
    }, [form.cost, nights, activeField]);

    const prepareNewItem = () => {
        // If current form is valid, commit to items before switching
        if (form.name && form.checkInDate && form.checkOutDate) {
            const currentItem = form as Accommodation;
            setItems(prev => {
                const idx = prev.findIndex(i => i.id === currentItem.id);
                return idx >= 0 ? prev.map(i => i.id === currentItem.id ? currentItem : i) : [...prev, currentItem];
            });
        }
        const newItemId = crypto.randomUUID();
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
            cost: undefined,
            logoUrl: undefined
        });
        setPerNightInput('');
        setEditingId(newItemId);
        setDraftError(null);
    };

    const handleEditItem = (item: Accommodation) => {
        // Commit current valid form before switching
        if (form.name && form.checkInDate && form.checkOutDate && form.id !== item.id) {
            const currentItem = form as Accommodation;
            setItems(prev => {
                const idx = prev.findIndex(i => i.id === currentItem.id);
                return idx >= 0 ? prev.map(i => i.id === currentItem.id ? currentItem : i) : [...prev, currentItem];
            });
        }
        setForm({ ...item });
        setEditingId(item.id);
        setDraftError(null);
    };

    const handleDeleteItem = (id: string) => {
        const remaining = items.filter(i => i.id !== id);
        setItems(remaining);
        if (remaining.length > 0) {
            setForm({ ...remaining[0] });
            setEditingId(remaining[0].id);
        } else {
            prepareNewItem();
        }
        setDraftError(null);
    };

    const handleSaveAll = () => {
        setDraftError(null);
        if (!form.name?.trim()) {
            setDraftError("Please enter a Property / Hotel name.");
            return;
        }
        if (!form.checkInDate || !form.checkOutDate) {
            setDraftError("Please enter Check-In and Check-Out dates.");
            return;
        }

        const currentItem = form as Accommodation;
        const exists = items.some(i => i.id === currentItem.id);
        const updatedItems = exists
            ? items.map(i => i.id === currentItem.id ? currentItem : i)
            : [...items.filter(i => i.id !== currentItem.id), currentItem];

        onSave(updatedItems);
    };

    const handlePerNightChange = (valStr: string) => {
        setPerNightInput(valStr);
        const val = parseFloat(valStr);
        if (!isNaN(val) && nights > 0) {
            setForm(prev => ({ ...prev, cost: val * nights }));
        } else if (valStr === '') {
            setForm(prev => ({ ...prev, cost: undefined }));
        }
    };

    const fetchPlaceSuggestions = async (query: string): Promise<string[]> => {
        return searchLocations(query);
    };

    const handleFetchBrand = async () => {
        if (!form.name || !brandfetchKey) return;
        setIsFetchingBrand(true);
        try {
            const response = await fetch(`https://api.brandfetch.io/v2/search/${encodeURIComponent(form.name)}?c=${brandfetchKey}`);
            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data) && data.length > 0) {
                    const firstResult = data[0];
                    if (firstResult.icon) {
                        setForm(prev => ({ ...prev, logoUrl: firstResult.icon }));
                    }
                }
            }
        } catch (e) {
            console.error("Brandfetch lookup error:", e);
        } finally {
            setIsFetchingBrand(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">

            {/* Multi-Stay Switcher (when multiple accommodations exist) */}
            {items.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar p-1 bg-black/5 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/5">
                    {items.map((it, idx) => {
                        const isCurrent = (editingId === it.id || form.id === it.id);
                        return (
                            <button
                                type="button"
                                key={it.id}
                                onClick={() => handleEditItem(it)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer min-h-[36px] ${
                                    isCurrent
                                        ? 'bg-sky-500/15 dark:bg-sky-500/25 text-sky-700 dark:text-sky-300 border border-sky-500/30 shadow-xs'
                                        : 'text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text hover:bg-black/5 dark:hover:bg-white/5'
                                }`}
                            >
                                <Bed className="w-4 h-4" weight={isCurrent ? "duotone" : "regular"} />
                                <span className="truncate max-w-[150px]">{it.name || `Stay ${idx + 1}`}</span>
                            </button>
                        );
                    })}
                    <button
                        type="button"
                        onClick={prepareNewItem}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold text-sky-600 dark:text-sky-400 hover:bg-sky-500/10 transition-colors flex items-center gap-1 shrink-0 cursor-pointer min-h-[36px]"
                    >
                        <Plus className="w-3.5 h-3.5" weight="bold" />
                        <span>Add Stay</span>
                    </button>
                </div>
            )}

            {/* Inline Validation Error State */}
            {draftError && (
                <div className={`p-3.5 rounded-2xl flex items-center justify-between text-xs font-semibold ${STATUS_DANGER_STYLE}`}>
                    <div className="flex items-center gap-2">
                        <WarningCircle className="w-4 h-4 shrink-0" weight="bold" />
                        <span>{draftError}</span>
                    </div>
                    <button type="button" onClick={() => setDraftError(null)} className="cursor-pointer">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {/* Accommodation Type Picker */}
            <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                    Accommodation Type
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {ACCOMMODATION_TYPES.map(t => {
                        const IconComponent = t.icon;
                        const isSelected = (form.type || 'Hotel') === t.value;
                        return (
                            <button
                                type="button"
                                key={t.value}
                                onClick={() => setForm({ ...form, type: t.value as any })}
                                className={`p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 text-center transition-all border min-h-[64px] cursor-pointer ${
                                    isSelected
                                        ? 'bg-sky-500/15 dark:bg-sky-500/25 border-sky-500/40 text-sky-700 dark:text-sky-300 shadow-sm font-bold ring-1 ring-sky-500/30'
                                        : 'bg-black/5 dark:bg-white/5 border-transparent text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text hover:bg-black/10 dark:hover:bg-white/10'
                                }`}
                            >
                                <IconComponent className="w-5 h-5" weight={isSelected ? "duotone" : "regular"} />
                                <span className="text-2xs font-bold uppercase tracking-wider">{t.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Property / Hotel Name */}
            <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                    Property / Hotel Name <span className="text-semantic-red">*</span>
                </label>
                <div className="relative">
                    <Input
                        placeholder="e.g. Canaves Oia Suites"
                        value={form.name || ''}
                        onChange={e => setForm({ ...form, name: e.target.value })}
                        className="h-12 text-base font-bold pr-10"
                        autoFocus
                        rightElement={
                            brandfetchKey && (
                                <button
                                    type="button"
                                    onClick={handleFetchBrand}
                                    disabled={isFetchingBrand || !form.name}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-light-text-secondary hover:text-amber-500 disabled:opacity-50 transition-colors cursor-pointer"
                                    title="Auto-fetch Brand Logo"
                                    aria-label="Auto-fetch Brand Logo"
                                >
                                    {isFetchingBrand ? (
                                        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin block" />
                                    ) : (
                                        <MagnifyingGlass className="w-4 h-4" />
                                    )}
                                </button>
                            )
                        }
                    />
                    {form.logoUrl && (
                        <div className="absolute top-2.5 right-12 w-7 h-7 rounded-lg overflow-hidden border border-black/10 shadow-sm bg-white">
                            <img src={form.logoUrl} alt="Brand" className="w-full h-full object-cover" />
                        </div>
                    )}
                </div>
            </div>

            {/* Stay Dates & Times (Schedule Group) */}
            <div className="p-4 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
                        Stay Dates & Schedule
                    </span>
                    {nights > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                            {nights} {nights === 1 ? 'Night' : 'Nights'}
                        </span>
                    )}
                </div>
                <DateRangePicker
                    accentColor="sky"
                    label="Stay Dates"
                    startLabel="Check-In"
                    endLabel="Check-Out"
                    startDate={form.checkInDate || ''}
                    endDate={form.checkOutDate || ''}
                    onChange={(start, end) => setForm({ ...form, checkInDate: start, checkOutDate: end })}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <TimeInput
                        label="Check-In Time"
                        value={form.checkInTime || '15:00'}
                        onChange={val => setForm({ ...form, checkInTime: val })}
                    />
                    <TimeInput
                        label="Check-Out Time"
                        value={form.checkOutTime || '11:00'}
                        onChange={val => setForm({ ...form, checkOutTime: val })}
                    />
                </div>
            </div>

            {/* Address & Destination (Location Group) */}
            <div className="p-4 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-3">
                <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
                    Location & Address
                </span>
                <Autocomplete
                    label="Address / Destination"
                    placeholder="e.g. Oia 847 02, Santorini, Greece"
                    value={form.address || ''}
                    onChange={val => setForm({ ...form, address: val })}
                    fetchSuggestions={fetchPlaceSuggestions}
                />
            </div>

            {/* Financials & Booking Details */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="relative">
                    <Input
                        label="Total Stay Cost"
                        type="number"
                        placeholder="0.00"
                        value={form.cost !== undefined ? String(form.cost) : ''}
                        onChange={e => setForm({ ...form, cost: parseFloat(e.target.value) || undefined })}
                        onFocus={() => setActiveField('total')}
                        onBlur={() => setActiveField(null)}
                        className="pl-8 font-bold"
                    />
                    <span className="absolute left-3 top-9 text-light-text-secondary font-bold text-xs">{currencySymbol}</span>
                </div>
                <div className="relative">
                    <Input
                        label="Nightly Rate"
                        type="number"
                        placeholder="0.00"
                        value={perNightInput}
                        onChange={e => handlePerNightChange(e.target.value)}
                        onFocus={() => setActiveField('perNight')}
                        onBlur={() => setActiveField(null)}
                        className="pl-8"
                        disabled={nights <= 0}
                    />
                    <span className="absolute left-3 top-9 text-light-text-secondary font-bold text-xs">{currencySymbol}</span>
                </div>
                <Input
                    label="Booking Reference"
                    placeholder="e.g. HTL-99824"
                    value={form.confirmationCode || ''}
                    onChange={e => setForm({ ...form, confirmationCode: e.target.value })}
                />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                    label="Booking Website"
                    placeholder="e.g. booking.com"
                    value={form.website || ''}
                    onChange={e => setForm({ ...form, website: e.target.value })}
                />
                <Input
                    label="Check-In Notes & Instructions"
                    placeholder="Keybox code, parking, front desk hours..."
                    value={form.notes || ''}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                />
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-black/10 dark:border-white/10 mt-6">
                {(initialData && initialData.length > 0 && onDelete) ? (
                    showDeleteConfirm ? (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-semantic-red font-bold">Delete this stay?</span>
                            <button
                                type="button"
                                onClick={() => {
                                    if (form.id) handleDeleteItem(form.id);
                                    else if (onDelete && initialData) onDelete(initialData.map(i => i.id));
                                    setShowDeleteConfirm(false);
                                }}
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
                        onClick={onCancel}
                        className={`${BTN_SECONDARY_STYLE} px-5 h-11 text-xs font-bold uppercase tracking-wider cursor-pointer`}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSaveAll}
                        className={`${BTN_PRIMARY_STYLE} px-6 h-11 text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-md`}
                    >
                        <span>Save Accommodation</span>
                        <Check className="w-4 h-4" weight="bold" />
                    </button>
                </div>
            </div>
        </div>
    );
};
export default AccommodationConfigurator;
