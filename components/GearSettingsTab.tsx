import React, { useState, useMemo } from 'react';
import { Card, Button, Input, Select } from './ui';
import { WorkspaceSettings, PackingItem } from '../types';

interface GearSettingsTabProps {
    config: WorkspaceSettings;
    setConfig: (config: WorkspaceSettings) => void;
    handleSaveOrgSettings: () => Promise<void>;
    isSavingOrg: boolean;
}

const CATEGORIES = [
    { id: 'Clothing', icon: 'checkroom', color: 'blue' },
    { id: 'Toiletries', icon: 'soap', color: 'teal' },
    { id: 'Electronics', icon: 'cable', color: 'purple' },
    { id: 'Documents', icon: 'description', color: 'amber' },
    { id: 'Health', icon: 'medical_services', color: 'rose' },
    { id: 'Misc', icon: 'category', color: 'gray' },
];

export const GearSettingsTab: React.FC<GearSettingsTabProps> = ({ config, setConfig, handleSaveOrgSettings, isSavingOrg }) => {
    const [newItemText, setNewItemText] = useState('');
    const [newItemCategory, setNewItemCategory] = useState('Clothing');

    const handleAddGearItem = () => {
        if (!newItemText.trim()) return;
        const newItem: PackingItem = {
            id: Math.random().toString(36).substr(2, 9),
            text: newItemText,
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
        <div className="h-full animate-fade-in">
            <Card noPadding className="rounded-3xl border-white/50 dark:border-white/10 shadow-2xl h-full flex flex-col">
                <div className="p-8 border-b border-gray-100 dark:border-white/5 bg-gradient-to-br from-cyan-500/5 to-blue-500/5 rounded-t-3xl shrink-0">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-xl">
                                <span className="material-icons-outlined text-3xl">backpack</span>
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-gray-900 dark:text-white leading-none">Master Inventory</h3>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-2">Standard packing configurations</p>
                            </div>
                        </div>
                        <Button 
                            variant="primary" 
                            size="lg" 
                            className="!rounded-2xl shadow-xl shadow-cyan-500/20" 
                            onClick={handleSaveOrgSettings}
                            isLoading={isSavingOrg}
                            icon={<span className="material-icons-outlined">save</span>}
                        >
                            Save Master List
                        </Button>
                    </div>
                </div>

                <div className="flex-1 flex flex-col min-h-0 bg-gray-50/30 dark:bg-white/5">
                    <div className="p-6 border-b border-gray-100 dark:border-white/5 bg-white/50 dark:bg-black/20 shrink-0">
                        <div className="flex gap-4 items-end max-w-3xl">
                            <div className="flex-1">
                                <Input 
                                    placeholder="Add item to master list..." 
                                    value={newItemText} 
                                    onChange={e => setNewItemText(e.target.value)} 
                                    onKeyDown={e => e.key === 'Enter' && handleAddGearItem()}
                                    className="!bg-white dark:!bg-black/20 !border-transparent shadow-sm"
                                />
                            </div>
                            <div className="w-48">
                                <Select 
                                    options={CATEGORIES.map(c => ({ label: c.id, value: c.id }))} 
                                    value={newItemCategory}
                                    onChange={e => setNewItemCategory(e.target.value)}
                                    className="!bg-white dark:!bg-black/20 !border-transparent shadow-sm"
                                />
                            </div>
                            <Button 
                                onClick={handleAddGearItem} 
                                className="!rounded-2xl !w-12 !h-[50px] !p-0 shadow-lg" 
                                icon={<span className="material-icons-outlined">add</span>} 
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {CATEGORIES.map(cat => {
                                const items = groupedGearItems[cat.id] || [];
                                if (items.length === 0) return null;

                                const bgMap: Record<string, string> = {
                                    blue: 'bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/30',
                                    teal: 'bg-teal-50 dark:bg-teal-900/10 border-teal-100 dark:border-teal-900/30',
                                    purple: 'bg-purple-50 dark:bg-purple-900/10 border-purple-100 dark:border-purple-900/30',
                                    amber: 'bg-amber-50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-900/30',
                                    rose: 'bg-rose-50 dark:bg-rose-900/10 border-rose-100 dark:border-rose-900/30',
                                    gray: 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-white/10'
                                };
                                const iconMap: Record<string, string> = {
                                    blue: 'text-blue-500', teal: 'text-teal-500', purple: 'text-purple-500',
                                    amber: 'text-amber-500', rose: 'text-rose-500', gray: 'text-gray-400'
                                };

                                return (
                                    <div key={cat.id} className={`p-5 rounded-3xl border transition-all ${bgMap[cat.color]}`}>
                                        <div className="flex items-center gap-3 mb-4">
                                            <span className={`material-icons-outlined text-xl ${iconMap[cat.color]}`}>{cat.icon}</span>
                                            <h3 className="font-black text-gray-800 dark:text-gray-200">{cat.id}</h3>
                                            <span className="ml-auto text-xs font-bold text-gray-400 bg-white/50 dark:bg-black/20 px-2 py-1 rounded-lg">{items.length}</span>
                                        </div>
                                        <div className="space-y-2">
                                            {items.map(item => (
                                                <div key={item.id} className="group flex items-center justify-between p-3 bg-white/60 dark:bg-black/20 rounded-xl hover:bg-white dark:hover:bg-white/5 transition-all">
                                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{item.text}</span>
                                                    <button 
                                                        onClick={() => handleDeleteGearItem(item.id)}
                                                        className="text-gray-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                                                    >
                                                        <span className="material-icons-outlined text-sm">close</span>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    );
};
