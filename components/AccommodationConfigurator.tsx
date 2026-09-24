import React, { useState, useEffect, useMemo } from 'react';
import {
    Bed,
    House,
    Buildings,
    Sparkle,
    PencilSimple,
    Trash,
    Plus,
    MapPin,
    MagnifyingGlass,
    X,
    WarningCircle,
    Check
} from '@phosphor-icons/react';
import { Input, Autocomplete, TimeInput, Badge } from './ui';
import GlassPanel from './glass/GlassPanel';
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
        // Native crypto.randomUUID()
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

    const handleSaveItem = () => {
        setDraftError(null);
        if (!form.name || !form.checkInDate || !form.checkOutDate) {
            setDraftError("Please fill in Name, Check-in date, and Check-out date.");
            return;
        }

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
        setDraftError(null);
    };

    const handleDeleteItem = (id: string) => {
        setItems(prev => prev.filter(i => i.id !== id));
        if (editingId === id) {
            setEditingId(null);
            setForm({});
            setDraftError(null);
        }
    };

    // Strict validation parity & prevent silent dropping
    const handleSaveAll = () => {
        setDraftError(null);
        if (editingId) {
            const hasDraftContent = Boolean(form.name || form.address || form.cost);
            if (hasDraftContent) {
                // Must pass strict parity check (name, checkInDate, checkOutDate)
                if (!form.name || !form.checkInDate || !form.checkOutDate) {
                    setDraftError("You have an unsaved accommodation in progress — finish Name, Check-In, and Check-Out or discard it before saving.");
                    return;
                }
                // Cleanly auto-commit the valid draft without dropping it!
                const newItem = form as Accommodation;
                const updatedItems = [...items.filter(i => i.id !== newItem.id), newItem];
                onSave(updatedItems);
                return;
            }
        }
        onSave(items);
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
    }; if (showDeleteConfirm) {
        return (
            <GlassPanel className="wg-glass-card w-full shadow-2xl overflow-hidden animate-fade-in my-4" overrides={{ borderRadius: 28 }} padding="0px">
                <div className="p-6 sm:p-8 rounded-3xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 text-center space-y-6">
                    <div className="w-20 h-20 bg-rose-500/15 border border-rose-500/20 rounded-2xl flex items-center justify-center mx-auto text-rose-500 shadow-inner">
                    <Trash className="w-10 h-10" weight="duotone" />
                </div>
                <div>
                    <h4 className="text-xl font-bold text-light-text dark:text-dark-text tracking-tight">Delete All Accommodations?</h4>
                    <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-1.5">
                        This will remove {items.length} stays from this trip.
                    </p>
                </div>
                    <div className="flex gap-3 pt-2 max-w-xs mx-auto">
                        <button
                            type="button"
                            className={`${BTN_SECONDARY_STYLE} flex-1 h-12 text-xs font-bold uppercase tracking-wider cursor-pointer`}
                            onClick={() => setShowDeleteConfirm(false)}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            className={`${BTN_DANGER_STYLE} flex-1 h-12 text-xs font-bold uppercase tracking-wider cursor-pointer flex items-center justify-center gap-2`}
                            onClick={() => { if (onDelete && initialData) onDelete(initialData.map(i => i.id)); }}
                        >
                            <Trash className="w-4 h-4" weight="duotone" />
                            <span>Confirm</span>
                        </button>
                    </div>
                </div>
            </GlassPanel>
        );
    }

    return (
        <GlassPanel className="wg-glass-card w-full shadow-2xl overflow-hidden animate-fade-in" overrides={{ borderRadius: 28 }} padding="0px">
            <div className="p-6 sm:p-8 space-y-6">

            {/* Inline Draft Error */}
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

            {/* List of Existing Accommodations */}
            <div className="space-y-3">
                {items.filter(i => i.id !== editingId).map((item) => (
                    <div key={item.id} className="relative p-4 bg-light-fill dark:bg-dark-fill/50 rounded-2xl border border-black/5 dark:border-white/5 shadow-xs flex justify-between items-center hover:border-black/15 dark:hover:border-white/20 transition-all">
                        <div className="flex items-center gap-4 min-w-0">
                            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center justify-center text-2xl shrink-0 shadow-sm overflow-hidden">
                                {item.logoUrl ? (
                                    <img src={item.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                                ) : (
                                    item.type === 'Hotel' ? <Bed className="w-6 h-6" weight="duotone" /> : item.type === 'Villa' ? <House className="w-6 h-6" weight="duotone" /> : <Buildings className="w-6 h-6" weight="duotone" />
                                )}
                            </div>
                            <div className="min-w-0">
                                <h4 className="font-bold text-sm text-light-text dark:text-dark-text truncate">{item.name}</h4>
                                <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-2 mt-0.5 font-medium">
                                    <span className="px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-black/5 dark:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary">
                                        {formatDateRange(item.checkInDate, item.checkOutDate)}
                                    </span>

                                    {item.cost && (
                                        <span className="text-emerald-500 font-bold ml-1">{formatCurrency(item.cost)}</span>
                                    )}
                                </div>
                                <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5 truncate max-w-[240px] font-medium">{item.address}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                            <button
                                type="button"
                                onClick={() => handleEditItem(item)}
                                className="w-11 h-11 wg-touch-target rounded-xl flex items-center justify-center text-primary-500 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                                title="Edit"
                                aria-label="Edit accommodation"
                            >
                                <PencilSimple className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => handleDeleteItem(item.id)}
                                className="w-11 h-11 wg-touch-target rounded-xl flex items-center justify-center text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                title="Delete"
                                aria-label="Delete accommodation"
                            >
                                <Trash className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Editor Form */}
            {(editingId || items.length === 0) && (
                <div className="p-5 sm:p-6 rounded-3xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 shadow-xs space-y-5 animate-fade-in relative">
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-1.5">
                            <MapPin className="w-4 h-4 text-amber-500" weight="duotone" />
                            {items.find(i => i.id === editingId) ? 'Edit Accommodation' : 'New Stay Details'}
                        </span>
                        {items.length > 0 && (
                            <button
                                type="button"
                                onClick={() => { setEditingId(null); setDraftError(null); }}
                                className="w-8 h-8 rounded-xl flex items-center justify-center text-light-text-secondary hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                                aria-label="Close form"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    {/* Visual Type Picker (Liquid Glass / Modern Segmented Cards) */}
                    <div className="space-y-1.5">
                        <label className="block text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
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
                                        className={`p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 text-center transition-all border min-h-[64px] cursor-pointer ${isSelected
                                                ? 'bg-amber-500/15 dark:bg-amber-500/25 border-amber-500/40 text-amber-700 dark:text-amber-300 shadow-sm backdrop-blur-md font-bold'
                                                : 'bg-black/5 dark:bg-white/5 border-transparent text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-white/40 dark:hover:bg-white/10'
                                            }`}
                                    >
                                        <IconComponent className="w-5 h-5" weight={isSelected ? "duotone" : "regular"} />
                                        <span className="text-2xs font-bold uppercase tracking-wider">{t.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="space-y-4">
                        {/* Name of Place with Brandfetch lookup */}
                        <div className="relative">
                            <Input
                                label="Property / Hotel Name"
                                placeholder="e.g. Canaves Oia Suites"
                                value={form.name || ''}
                                onChange={e => setForm({ ...form, name: e.target.value })}
                                className="!font-bold !text-base pr-10"
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
                                <div className="absolute top-8 right-12 w-7 h-7 rounded-lg overflow-hidden border border-black/10 shadow-sm bg-white">
                                    <img src={form.logoUrl} alt="Brand" className="w-full h-full object-cover" />
                                </div>
                            )}
                        </div>

                        {/* Address */}
                        <Autocomplete
                            label="Address / Location"
                            placeholder="e.g. Oia 847 02, Santorini, Greece"
                            value={form.address || ''}
                            onChange={val => setForm({ ...form, address: val })}
                            fetchSuggestions={fetchPlaceSuggestions}
                        />

                        {/* Check In / Out Dates */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative">
                            <Input
                                label="Check-In Date"
                                type="date"
                                value={form.checkInDate || ''}
                                onChange={e => setForm({ ...form, checkInDate: e.target.value })}
                            />
                            <Input
                                label="Check-Out Date"
                                type="date"
                                value={form.checkOutDate || ''}
                                min={form.checkInDate}
                                onChange={e => setForm({ ...form, checkOutDate: e.target.value })}
                            />
                            {nights > 0 && (
                                <div className="absolute top-0 right-0 -mt-2.5 mr-1">
                                    <span className="px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                        {nights} {nights === 1 ? 'Night' : 'Nights'}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Check In / Out Times & Conf Code */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                            <Input
                                label="Booking Reference"
                                placeholder="e.g. HTL-99824"
                                value={form.confirmationCode || ''}
                                onChange={e => setForm({ ...form, confirmationCode: e.target.value })}
                            />
                        </div>

                        {/* Financials & Website */}
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
                                label="Booking Website"
                                placeholder="e.g. booking.com"
                                value={form.website || ''}
                                onChange={e => setForm({ ...form, website: e.target.value })}
                            />
                        </div>

                        <Input
                            label="Check-In Notes & Instructions"
                            placeholder="Keybox code, parking instructions, front desk hours..."
                            value={form.notes || ''}
                            onChange={e => setForm({ ...form, notes: e.target.value })}
                        />

                        {/* Save Item Action */}
                        <div className="pt-2 flex justify-end">
                            <button
                                type="button"
                                onClick={handleSaveItem}
                                disabled={!form.name || !form.checkInDate || !form.checkOutDate}
                                className={`${BTN_PRIMARY_STYLE} px-7 h-11 text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer disabled:opacity-50`}
                            >
                                <span>{items.some(i => i.id === editingId) ? 'Update Stay' : 'Add Stay'}</span>
                                <Check className="w-4 h-4" weight="bold" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Another Accommodation Button */}
            {!editingId && (
                <button
                    type="button"
                    onClick={prepareNewItem}
                    className="w-full py-4 border-2 border-dashed border-black/10 dark:border-white/10 rounded-2xl text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider hover:border-amber-500/50 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-500/5 transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
                    aria-label="Add Another Accommodation"
                >
                    <Plus className="w-4 h-4" />
                    <span>Add Another Accommodation</span>
                </button>
            )}

            {/* Sticky Frosted Footer */}
            <div className="p-4 sm:p-5 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 mt-6 border-t border-black/5 dark:border-white/10 bg-white/40 dark:bg-white/[0.04] backdrop-blur-md flex items-center justify-between gap-3 sticky bottom-0 z-20 rounded-b-[28px]">
                {initialData && initialData.length > 0 && onDelete ? (
                    <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(true)}
                        className="text-rose-500 hover:bg-rose-500/10 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer min-h-[44px]"
                        aria-label="Delete All Accommodations"
                    >
                        <Trash className="w-4 h-4" weight="duotone" />
                        <span>Delete All</span>
                    </button>
                ) : <div />}

                <div className="flex gap-3 items-center">
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
                        className={`${BTN_PRIMARY_STYLE} px-7 h-11 text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-md`}
                    >
                        <span>Save Accommodations</span>
                        <Check className="w-4 h-4" weight="bold" />
                    </button>
                </div>
            </div>

            </div>
        </GlassPanel>
    );
};
export default AccommodationConfigurator;
