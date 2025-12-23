
import React, { useState, useEffect } from 'react';
import { Card, Button, Input, Select, Modal, Badge } from './ui';
import { dataService } from '../services/mockDb';
import { EntitlementType, AccrualPeriod, CarryOverExpiryType } from '../types';

const COLORS = ['blue', 'green', 'amber', 'purple', 'red', 'indigo', 'gray', 'pink', 'teal', 'cyan'];

const getColorClasses = (color: string) => {
    const maps: Record<string, string> = {
        blue: 'bg-blue-500 shadow-blue-500/40',
        green: 'bg-emerald-500 shadow-emerald-500/40',
        amber: 'bg-amber-500 shadow-amber-500/40',
        purple: 'bg-purple-500 shadow-purple-500/40',
        red: 'bg-rose-500 shadow-rose-500/40',
        indigo: 'bg-indigo-500 shadow-indigo-500/40',
        gray: 'bg-gray-500 shadow-gray-500/40',
        pink: 'bg-pink-500 shadow-pink-500/40',
        teal: 'bg-teal-500 shadow-teal-500/40',
        cyan: 'bg-cyan-500 shadow-cyan-500/40',
    };
    return maps[color] || maps.blue;
};

export const EntitlementsManager: React.FC = () => {
    const [entitlements, setEntitlements] = useState<EntitlementType[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<EntitlementType | null>(null);

    useEffect(() => {
        refreshData();
    }, []);

    const refreshData = async () => {
        const ents = await dataService.getEntitlementTypes();
        setEntitlements(ents);
        if (ents.length > 0 && !selectedId) {
            setSelectedId(ents[0].id);
        }
    };

    const selectedEntitlement = entitlements.find(e => e.id === selectedId);

    const handleUpdateEntitlement = async (updated: EntitlementType) => {
        await dataService.saveEntitlementType(updated);
        await refreshData();
    };

    const handleCreateEntitlement = async () => {
        const newEnt: EntitlementType = {
            id: Math.random().toString(36).substr(2, 9),
            name: 'New Leave Type',
            category: 'Custom',
            color: 'blue',
            accrual: { period: 'lump_sum', amount: 25 },
            carryOver: { 
                enabled: false, 
                maxDays: 0, 
                expiryType: 'none' 
            }
        };
        await dataService.saveEntitlementType(newEnt);
        await refreshData();
        setSelectedId(newEnt.id);
    };

    const initiateDelete = () => {
        if (selectedEntitlement) setItemToDelete(selectedEntitlement);
    };

    const handleConfirmDelete = async () => {
        if (!itemToDelete) return;
        setIsDeleting(true);
        try {
            await dataService.deleteEntitlementType(itemToDelete.id);
            setItemToDelete(null);
            if (selectedId === itemToDelete.id) setSelectedId(null);
            await refreshData();
        } catch (error) {
            console.error(error);
        } finally {
            setIsDeleting(false);
        }
    };

    const updateAccrual = (field: keyof EntitlementType['accrual'], value: any) => {
        if (!selectedEntitlement) return;
        handleUpdateEntitlement({
            ...selectedEntitlement,
            accrual: { ...selectedEntitlement.accrual, [field]: value }
        });
    };

    const updateCarryOver = (field: keyof EntitlementType['carryOver'], value: any) => {
        if (!selectedEntitlement) return;
        handleUpdateEntitlement({
            ...selectedEntitlement,
            carryOver: { ...selectedEntitlement.carryOver, [field]: value }
        });
    };

    const categoryOptions = entitlements
        .filter(e => e.id !== selectedId)
        .map(e => ({ label: e.name, value: e.id }));

    return (
        <Card noPadding className="rounded-[2rem] border-white/50 dark:border-white/10 shadow-2xl h-full flex flex-col overflow-hidden">
            <div className="flex h-full overflow-hidden">
                {/* CATEGORY SELECTOR SIDEBAR */}
                <div className="w-1/3 border-r border-gray-100 dark:border-white/5 bg-gray-50/30 dark:bg-black/20 flex flex-col h-full">
                    <div className="p-8 border-b border-gray-100 dark:border-white/5 bg-white/40 dark:bg-white/5">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-blue-500 text-white flex items-center justify-center shadow-lg">
                                <span className="material-icons-outlined">inventory_2</span>
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-gray-900 dark:text-white leading-none">Policy Nodes</h3>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">Active categories</p>
                            </div>
                        </div>
                        <Button 
                            variant="secondary" 
                            className="w-full !rounded-xl border-2 text-[10px] font-black uppercase tracking-[0.2em] py-3" 
                            onClick={handleCreateEntitlement}
                            icon={<span className="material-icons-outlined text-sm">add_circle</span>}
                        >
                            Deploy New Node
                        </Button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                        {entitlements.map(ent => (
                            <button
                                key={ent.id}
                                onClick={() => setSelectedId(ent.id)}
                                className={`group w-full text-left p-4 rounded-2xl transition-all flex items-center gap-4 border ${
                                    selectedId === ent.id 
                                    ? 'bg-white border-blue-200 shadow-xl dark:bg-white/10 dark:border-blue-900/50 scale-[1.02] z-10' 
                                    : 'hover:bg-white/50 border-transparent dark:hover:bg-white/5 opacity-70 hover:opacity-100'
                                }`}
                            >
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black text-white shadow-xl transition-transform group-hover:rotate-3 ${getColorClasses(ent.color)}`}>
                                    {ent.name.charAt(0)}
                                </div>
                                <div className="flex-1 overflow-hidden">
                                    <p className="font-black text-sm text-gray-800 dark:text-gray-200 truncate">{ent.name}</p>
                                    <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest mt-1.5">{ent.accrual.period} • {ent.isUnlimited ? '∞' : `${ent.accrual.amount} Days`}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* DETAIL EDITOR AREA */}
                <div className="flex-1 flex flex-col h-full bg-white dark:bg-transparent overflow-hidden">
                    {selectedEntitlement ? (
                        <div className="flex flex-col h-full">
                            {/* Editor Header */}
                            <div className="p-8 border-b border-gray-100 dark:border-white/5 bg-white/40 dark:bg-white/5 flex items-center gap-6">
                                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white text-3xl font-black shadow-2xl transition-all ${getColorClasses(selectedEntitlement.color)}`}>
                                    {selectedEntitlement.name.charAt(0)}
                                </div>
                                <div className="space-y-1">
                                    <h2 className="text-3xl font-black text-gray-900 dark:text-white leading-none">{selectedEntitlement.name}</h2>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Global Policy Configuration</p>
                                </div>
                            </div>

                            {/* Editor Body */}
                            <div className="flex-1 overflow-y-auto p-8 space-y-12 custom-scrollbar">
                                
                                {/* Identity Section */}
                                <div className="space-y-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 flex items-center justify-center">
                                            <span className="material-icons-outlined">fingerprint</span>
                                        </div>
                                        <h4 className="text-sm font-black text-gray-800 dark:text-white uppercase tracking-wider">Category Identity</h4>
                                    </div>
                                    
                                    <div className="p-8 rounded-[2rem] bg-gray-50/50 dark:bg-white/5 border border-gray-100 dark:border-white/5 space-y-8">
                                        <Input 
                                            label="Category Name" 
                                            className="!rounded-2xl"
                                            value={selectedEntitlement.name} 
                                            onChange={e => handleUpdateEntitlement({...selectedEntitlement, name: e.target.value})} 
                                        />
                                        
                                        <div>
                                            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4 block ml-1">Color Code Tag</label>
                                            <div className="flex flex-wrap gap-4">
                                                {COLORS.map(c => (
                                                     <button
                                                         key={c}
                                                         onClick={() => handleUpdateEntitlement({...selectedEntitlement, color: c as any})}
                                                         className={`w-12 h-12 rounded-2xl transition-all duration-300 flex items-center justify-center ${getColorClasses(c)} ${selectedEntitlement.color === c ? 'scale-110 ring-4 ring-offset-2 ring-blue-500/20 dark:ring-offset-gray-900 z-10' : 'opacity-40 hover:opacity-100 hover:scale-105'}`}
                                                         title={c.charAt(0).toUpperCase() + c.slice(1)}
                                                     >
                                                         {selectedEntitlement.color === c && <span className="material-icons-outlined text-white text-xl font-bold">check</span>}
                                                     </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Accrual Section */}
                                <div className="space-y-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                                            <span className="material-icons-outlined">event_repeat</span>
                                        </div>
                                        <h4 className="text-sm font-black text-gray-800 dark:text-white uppercase tracking-wider">Accrual Hierarchy</h4>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-8 rounded-[2rem] bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5">
                                        <Select 
                                            label="Frequency of Generation" 
                                            className="!rounded-2xl"
                                            value={selectedEntitlement.accrual.period} 
                                            onChange={e => updateAccrual('period', e.target.value as AccrualPeriod)}
                                            options={[
                                                { label: 'Lump Sum (Manual Provision)', value: 'lump_sum' },
                                                { label: 'Annual Cycle (Recurring)', value: 'yearly' },
                                                { label: 'Monthly Delta (Accrued)', value: 'monthly' },
                                            ]}
                                        />
                                        <div className="relative">
                                            <Input 
                                                label="Quota Volume (Days)" 
                                                type="number" 
                                                className="!rounded-2xl pr-12 font-bold"
                                                value={selectedEntitlement.accrual.amount} 
                                                onChange={e => updateAccrual('amount', Number(e.target.value))} 
                                            />
                                            <div className="absolute right-4 bottom-3 text-xs font-black text-gray-300 uppercase">Days</div>
                                        </div>
                                        
                                        <div className="md:col-span-2 flex items-center gap-4 p-4 rounded-2xl bg-white/50 dark:bg-black/20 border border-white dark:border-white/5">
                                            <button 
                                                onClick={() => handleUpdateEntitlement({...selectedEntitlement, isUnlimited: !selectedEntitlement.isUnlimited})}
                                                className={`w-12 h-6 rounded-full p-1 transition-all ${selectedEntitlement.isUnlimited ? 'bg-indigo-600 shadow-inner' : 'bg-gray-200 dark:bg-gray-700'}`}
                                            >
                                                <div className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ${selectedEntitlement.isUnlimited ? 'translate-x-6' : 'translate-x-0'}`} />
                                            </button>
                                            <div>
                                                <p className="text-xs font-black text-gray-800 dark:text-white leading-none">Infinite Allowance</p>
                                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Disables statutory checking for this category</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Carry Over Section */}
                                <div className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                                                <span className="material-icons-outlined">forward</span>
                                            </div>
                                            <h4 className="text-sm font-black text-gray-800 dark:text-white uppercase tracking-wider">Temporal Carry-Over</h4>
                                        </div>
                                        <Button 
                                            variant={selectedEntitlement.carryOver.enabled ? 'primary' : 'outline'} 
                                            size="sm" 
                                            className="!rounded-xl"
                                            onClick={() => updateCarryOver('enabled', !selectedEntitlement.carryOver.enabled)}
                                        >
                                            {selectedEntitlement.carryOver.enabled ? 'Active Logic' : 'Logic Inactive'}
                                        </Button>
                                    </div>

                                    {selectedEntitlement.carryOver.enabled ? (
                                        <div className="p-8 rounded-[2rem] bg-emerald-500/5 dark:bg-emerald-900/10 border border-emerald-500/10 dark:border-emerald-900/30 animate-fade-in space-y-6">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="relative">
                                                    <Input 
                                                        label="Max Transferable Load" 
                                                        type="number" 
                                                        className="!rounded-2xl pr-12 font-bold"
                                                        value={selectedEntitlement.carryOver.maxDays} 
                                                        onChange={e => updateCarryOver('maxDays', Number(e.target.value))} 
                                                    />
                                                    <div className="absolute right-4 bottom-3 text-xs font-black text-gray-300 uppercase">Days</div>
                                                </div>
                                                <Select 
                                                    label="Destination Policy Node" 
                                                    className="!rounded-2xl"
                                                    value={selectedEntitlement.carryOver.targetEntitlementId || 'self'} 
                                                    onChange={e => updateCarryOver('targetEntitlementId', e.target.value === 'self' ? undefined : e.target.value)}
                                                    options={[
                                                        { label: 'Origin Node (Self)', value: 'self' },
                                                        ...categoryOptions
                                                    ]}
                                                />
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                                                <Select 
                                                    label="Expiry Protocol" 
                                                    className="!rounded-2xl"
                                                    value={selectedEntitlement.carryOver.expiryType} 
                                                    onChange={e => updateCarryOver('expiryType', e.target.value as CarryOverExpiryType)}
                                                    options={[
                                                        { label: 'Permanent Persistence', value: 'none' },
                                                        { label: 'Rolling X Month Window', value: 'months' },
                                                        { label: 'Fixed Date Threshold', value: 'fixed_date' },
                                                    ]}
                                                />
                                                {selectedEntitlement.carryOver.expiryType === 'months' && (
                                                    <Input 
                                                        label="Temporal Window (Months)" 
                                                        type="number" 
                                                        className="!rounded-2xl font-bold"
                                                        value={selectedEntitlement.carryOver.expiryValue as number || 0} 
                                                        onChange={e => updateCarryOver('expiryValue', Number(e.target.value))} 
                                                    />
                                                )}
                                                {selectedEntitlement.carryOver.expiryType === 'fixed_date' && (
                                                    <Input 
                                                        label="Expiry Deadline (MM-DD)" 
                                                        placeholder="e.g. 06-30" 
                                                        className="!rounded-2xl font-bold"
                                                        value={selectedEntitlement.carryOver.expiryValue as string || ''} 
                                                        onChange={e => updateCarryOver('expiryValue', e.target.value)} 
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="p-16 border-2 border-dashed border-gray-100 dark:border-white/5 rounded-[2rem] text-center opacity-30 grayscale">
                                            <span className="material-icons-outlined text-4xl">do_not_disturb_on</span>
                                            <p className="text-[10px] font-black uppercase tracking-widest mt-4">Carry-over logic is currently bypassed</p>
                                        </div>
                                    )}
                                </div>
                                
                                {/* Danger Zone */}
                                <div className="pt-8 border-t border-gray-100 dark:border-white/5">
                                    <div className="flex items-center justify-between p-4 bg-rose-50 dark:bg-rose-900/10 rounded-2xl border border-rose-100 dark:border-rose-900/30">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center">
                                                <span className="material-icons-outlined">delete_forever</span>
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-black text-rose-900 dark:text-rose-200">Decommission Category</h4>
                                                <p className="text-[10px] text-rose-700/60 dark:text-rose-400/60 font-medium">Permanently remove this policy node and all associated data.</p>
                                            </div>
                                        </div>
                                        <Button 
                                            variant="danger" 
                                            size="sm"
                                            className="!rounded-xl"
                                            onClick={initiateDelete}
                                        >
                                            Delete
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center gap-6 py-20 opacity-20 grayscale">
                            <span className="material-icons-outlined text-8xl">account_tree</span>
                            <p className="text-xs font-black uppercase tracking-[0.3em] text-center max-w-xs leading-relaxed">Select a policy node from the matrix to modify operational parameters.</p>
                        </div>
                    )}
                </div>
            </div>

            <Modal isOpen={!!itemToDelete} onClose={() => setItemToDelete(null)} title="Confirm Policy Purge">
                <div className="text-center space-y-8">
                    <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto text-rose-600 animate-pulse">
                        <span className="material-icons-outlined text-4xl">warning_amber</span>
                    </div>
                    <div>
                        <h4 className="text-2xl font-black text-gray-900 dark:text-white leading-none">Decommission Node?</h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-4 leading-relaxed">
                            Removing <span className="font-bold text-gray-900 dark:text-white">{itemToDelete?.name}</span> will cascade deletions across all member records and historical trip allocations. This action is irreversible.
                        </p>
                    </div>
                    <div className="flex gap-4 pt-2">
                        <Button variant="ghost" className="flex-1 !rounded-xl" onClick={() => setItemToDelete(null)}>Abort</Button>
                        <Button variant="danger" className="flex-1 !rounded-xl shadow-xl shadow-rose-500/20" onClick={handleConfirmDelete} isLoading={isDeleting}>Confirm Purge</Button>
                    </div>
                </div>
            </Modal>
        </Card>
    );
};
    