import React, { useState, useMemo } from 'react';
import { Button, Input, Select } from './ui';
import GlassPanel from './glass/GlassPanel';
import { INPUT_BASE_STYLE } from '../constants';
import { WorkspaceSettings, PackingItem } from '../types';
import { 
    Backpack, 
    TShirt, 
    Drop, 
    DeviceMobile, 
    FileText, 
    FirstAid, 
    DotsThreeCircle, 
    Plus, 
    X, 
    FloppyDisk 
} from '@phosphor-icons/react';

interface GearSettingsTabProps {
    config: WorkspaceSettings;
    setConfig: (config: WorkspaceSettings) => void;
    handleSaveOrgSettings: () => Promise<void>;
    isSavingOrg: boolean;
}

const CATEGORIES = [
    { id: 'Clothing', icon: TShirt, color: 'blue' },
    { id: 'Toiletries', icon: Drop, color: 'teal' },
    { id: 'Electronics', icon: DeviceMobile, color: 'purple' },
    { id: 'Documents', icon: FileText, color: 'amber' },
    { id: 'Health', icon: FirstAid, color: 'rose' },
    { id: 'Misc', icon: DotsThreeCircle, color: 'gray' },
];

export const GearSettingsTab: React.FC<GearSettingsTabProps> = ({ config, setConfig, handleSaveOrgSettings, isSavingOrg }) => {
    const [newItemText, setNewItemText] = useState('');
    const [newItemCategory, setNewItemCategory] = useState('Clothing');

    const handleAddGearItem = () => {
        if (!newItemText.trim()) return;
        const newItem: PackingItem = {
            id: Math.random().toString(36).substr(2, 9),
            text: newItemText.trim(),
            category: newItemCategory,
            isChecked: false
        };
        const updatedList = [...(config.masterPackingList || []), newItem];
        setConfig({ ...config, masterPackingList: updatedList });
        setNewItemText('');
    };

    const handleDeleteGearItem = (id: string) => {
        const updatedList = (config.masterPackingList || []).filter(i => i.id !== id);
        setConfig({ ...config, masterPackingList: updatedList });
    };

    const groupedGearItems = useMemo(() => {
        const groups: Record<string, PackingItem[]> = {};
        CATEGORIES.forEach(c => groups[c.id] = []);
        (config.masterPackingList || []).forEach(i => {
            const cat = groups[i.category] ? i.category : 'Misc';
            groups[cat].push(i);
        });
        return groups;
    }, [config.masterPackingList]);

    return (
        <div className="h-full animate-fade-in pb-4">
            <div className="flex flex-col overflow-hidden rounded-[28px]">
                <GlassPanel
                    className="wg-glass-card shadow-glass-card flex flex-col h-full overflow-hidden border border-black/5 dark:border-white/10"
                    overrides={{ borderRadius: 28 }}
                    padding="0px"
                >
                    <div className="flex flex-col h-full w-full overflow-hidden rounded-[28px]">
                        {/* Header Banner */}
                        <div className="p-5 sm:p-6 border-b border-black/5 dark:border-white/5 bg-gradient-to-r from-cyan-500/10 via-cyan-500/5 to-transparent shrink-0">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20 shrink-0">
                                        <Backpack className="w-5 h-5" weight="duotone" />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-bold text-light-text dark:text-dark-text tracking-tight">
                                            Master Inventory Catalog
                                        </h3>
                                        <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary font-medium truncate mt-0.5">
                                            Manage baseline gear and standard packing items for new expedition dossiers
                                        </p>
                                    </div>
                                </div>
                                <Button 
                                    variant="primary" 
                                    onClick={handleSaveOrgSettings}
                                    isLoading={isSavingOrg}
                                    className="shrink-0"
                                    icon={<FloppyDisk className="w-4 h-4" weight="duotone" />}
                                >
                                    Save Master List
                                </Button>
                            </div>
                        </div>

                        {/* Add Item Bar */}
                        <div className="p-4 sm:p-5 border-b border-black/5 dark:border-white/5 bg-light-fill/50 dark:bg-dark-fill/30 shrink-0">
                            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center max-w-3xl">
                                <div className="flex-1">
                                    <Input 
                                        type="text"
                                        placeholder="Add standard packing item (e.g. Universal Travel Adapter)..." 
                                        value={newItemText} 
                                        onChange={e => setNewItemText(e.target.value)} 
                                        onKeyDown={e => e.key === 'Enter' && handleAddGearItem()}
                                        className="text-xs font-semibold"
                                    />
                                </div>
                                <div className="w-full sm:w-48">
                                    <Select 
                                        value={newItemCategory}
                                        onChange={e => setNewItemCategory(e.target.value)}
                                        className="text-xs font-bold uppercase"
                                    >
                                        {CATEGORIES.map(c => (
                                            <option key={c.id} value={c.id}>{c.id}</option>
                                        ))}
                                    </Select>
                                </div>
                                <button 
                                    type="button"
                                    onClick={handleAddGearItem} 
                                    aria-label="Add item to master list"
                                    className="min-w-[44px] min-h-[44px] h-11 px-4 rounded-xl bg-primary-500 hover:bg-primary-600 active:scale-95 text-white flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider shadow-md shadow-primary-500/20 transition-all cursor-pointer shrink-0"
                                >
                                    <Plus className="w-4 h-4" />
                                    <span className="sm:hidden">Add Item</span>
                                </button>
                            </div>
                        </div>

                        {/* Inventory Categories Grid */}
                        <div className="flex-1 overflow-y-auto p-5 sm:p-6 custom-scrollbar">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                {CATEGORIES.map(cat => {
                                    const items = groupedGearItems[cat.id] || [];
                                    const IconComponent = cat.icon;

                                    const themeMap: Record<string, { bg: string; text: string; icon: string }> = {
                                        blue: { bg: 'bg-blue-500/5 dark:bg-blue-500/10 border-blue-500/15', text: 'text-blue-600 dark:text-blue-400', icon: 'text-blue-500' },
                                        teal: { bg: 'bg-teal-500/5 dark:bg-teal-500/10 border-teal-500/15', text: 'text-teal-600 dark:text-teal-400', icon: 'text-teal-500' },
                                        purple: { bg: 'bg-purple-500/5 dark:bg-purple-500/10 border-purple-500/15', text: 'text-purple-600 dark:text-purple-400', icon: 'text-purple-500' },
                                        amber: { bg: 'bg-amber-500/5 dark:bg-amber-500/10 border-amber-500/15', text: 'text-amber-600 dark:text-amber-400', icon: 'text-amber-500' },
                                        rose: { bg: 'bg-rose-500/5 dark:bg-rose-500/10 border-rose-500/15', text: 'text-rose-600 dark:text-rose-400', icon: 'text-rose-500' },
                                        gray: { bg: 'bg-zinc-500/5 dark:bg-zinc-500/10 border-zinc-500/15', text: 'text-zinc-600 dark:text-zinc-400', icon: 'text-zinc-400' }
                                    };
                                    const t = themeMap[cat.color] || themeMap.gray;

                                    return (
                                        <div key={cat.id} className={`p-4 sm:p-5 rounded-2xl border transition-all ${t.bg}`}>
                                            <div className="flex items-center gap-2.5 mb-3.5">
                                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center bg-white dark:bg-dark-card shadow-sm ${t.icon}`}>
                                                    <IconComponent className="w-4 h-4" weight="duotone" />
                                                </div>
                                                <h4 className="font-bold text-xs uppercase tracking-wider text-light-text dark:text-dark-text">
                                                    {cat.id}
                                                </h4>
                                                <span className="ml-auto text-2xs font-mono font-bold text-light-text-secondary dark:text-dark-text-secondary bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded-full">
                                                    {items.length}
                                                </span>
                                            </div>

                                            {items.length === 0 ? (
                                                <div className="text-center py-6 text-2xs text-light-text-secondary dark:text-dark-text-secondary font-medium">
                                                    No items in category
                                                </div>
                                            ) : (
                                                <div className="space-y-1.5 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                                                    {items.map(item => (
                                                        <div 
                                                            key={item.id} 
                                                            className="group flex items-center justify-between p-2.5 bg-white/70 dark:bg-dark-card/60 backdrop-blur-xs border border-black/5 dark:border-white/5 rounded-xl hover:border-black/10 dark:hover:border-white/15 transition-all"
                                                        >
                                                            <span className="text-xs font-semibold text-light-text dark:text-dark-text truncate">
                                                                {item.text}
                                                            </span>
                                                            <button 
                                                                type="button"
                                                                onClick={() => handleDeleteGearItem(item.id)}
                                                                aria-label={`Remove ${item.text}`}
                                                                className="min-w-[28px] min-h-[28px] w-7 h-7 rounded-lg flex items-center justify-center text-light-text-secondary hover:text-rose-500 hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                                                            >
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </GlassPanel>
            </div>
        </div>
    );
};
