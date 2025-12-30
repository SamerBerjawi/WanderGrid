
import React, { useState, useMemo, useEffect } from 'react';
import { Trip, PackingItem, WorkspaceSettings } from '../types';
import { Button, Input, Select, Badge } from './ui';
import { GoogleGenAI, Type } from "@google/genai";
import { dataService } from '../services/mockDb';

interface PackingListProps {
    trip: Trip;
    onUpdate: (items: PackingItem[]) => void;
}

const CATEGORIES = [
    { id: 'Clothing', icon: 'checkroom', color: 'blue' },
    { id: 'Toiletries', icon: 'soap', color: 'teal' },
    { id: 'Electronics', icon: 'cable', color: 'purple' },
    { id: 'Documents', icon: 'description', color: 'amber' },
    { id: 'Health', icon: 'medical_services', color: 'rose' },
    { id: 'Misc', icon: 'category', color: 'gray' },
];

export const PackingList: React.FC<PackingListProps> = ({ trip, onUpdate }) => {
    const [newItemText, setNewItemText] = useState('');
    const [newItemCategory, setNewItemCategory] = useState('Clothing');
    const [isGenerating, setIsGenerating] = useState(false);
    const [masterList, setMasterList] = useState<PackingItem[]>([]);

    useEffect(() => {
        dataService.getWorkspaceSettings().then(s => {
            if (s.masterPackingList) {
                setMasterList(s.masterPackingList);
            }
        });
    }, []);

    const items = trip.packingList || [];

    const handleToggle = (itemId: string) => {
        const updated = items.map(i => 
            i.id === itemId ? { ...i, isChecked: !i.isChecked } : i
        );
        onUpdate(updated);
    };

    const handleAdd = () => {
        if (!newItemText.trim()) return;
        const newItem: PackingItem = {
            id: Math.random().toString(36).substr(2, 9),
            text: newItemText,
            category: newItemCategory,
            isChecked: false
        };
        onUpdate([...items, newItem]);
        setNewItemText('');
    };

    const handleDelete = (itemId: string) => {
        onUpdate(items.filter(i => i.id !== itemId));
    };

    const handleImportMaster = () => {
        if (masterList.length === 0) return;
        
        // Filter out duplicates based on text (case insensitive)
        const currentTexts = new Set(items.map(i => i.text.toLowerCase()));
        const newItems: PackingItem[] = [];
        
        masterList.forEach(m => {
            if (!currentTexts.has(m.text.toLowerCase())) {
                newItems.push({
                    ...m,
                    id: Math.random().toString(36).substr(2, 9), // Fresh ID for trip instance
                    isChecked: false
                });
            }
        });

        if (newItems.length > 0) {
            onUpdate([...items, ...newItems]);
        } else {
            alert("All master list items are already added.");
        }
    };

    const handleAiGenerate = async () => {
        setIsGenerating(true);
        try {
            const settings = await dataService.getWorkspaceSettings();
            const apiKey = settings.googleGeminiApiKey || process.env.API_KEY;
            
            if (!apiKey) {
                alert("Please configure Google Gemini API Key in Settings.");
                setIsGenerating(false);
                return;
            }

            const ai = new GoogleGenAI({ apiKey });
            
            const prompt = `
                Generate a comprehensive packing list for a trip to ${trip.location}.
                Dates: ${trip.startDate} to ${trip.endDate}.
                Activities: ${trip.activities?.map(a => a.title).join(', ') || 'General sightseeing'}.
                Accommodation: ${trip.accommodations?.map(a => a.type).join(', ') || 'Hotel'}.
                
                Provide a list of 15-20 essential items grouped by category (Clothing, Toiletries, Electronics, Documents, Health, Misc).
                Return ONLY JSON.
            `;

            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                category: { type: Type.STRING },
                                item: { type: Type.STRING }
                            }
                        }
                    }
                }
            });

            const rawJson = JSON.parse(response.text || '[]');
            
            const newItems: PackingItem[] = rawJson.map((entry: any) => ({
                id: Math.random().toString(36).substr(2, 9),
                text: entry.item,
                category: entry.category,
                isChecked: false
            }));

            // Merge with existing
            onUpdate([...items, ...newItems]);

        } catch (e) {
            console.error("AI Generation failed", e);
            alert("Could not generate list. Please try again.");
        } finally {
            setIsGenerating(false);
        }
    };

    const progress = useMemo(() => {
        if (items.length === 0) return 0;
        const checked = items.filter(i => i.isChecked).length;
        return Math.round((checked / items.length) * 100);
    }, [items]);

    const groupedItems = useMemo(() => {
        const groups: Record<string, PackingItem[]> = {};
        CATEGORIES.forEach(c => groups[c.id] = []);
        items.forEach(i => {
            const cat = groups[i.category] ? i.category : 'Misc';
            groups[cat].push(i);
        });
        return groups;
    }, [items]);

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Header & Progress */}
            <div className="flex flex-col md:flex-row justify-between items-center bg-gradient-to-r from-blue-600 to-indigo-700 rounded-[2.5rem] p-8 text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                
                <div className="flex items-center gap-6 relative z-10 w-full md:w-auto">
                    <div className="relative w-20 h-20 flex-shrink-0">
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                            <path className="text-white/20" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                            <path className="text-white transition-all duration-1000 ease-out" strokeDasharray={`${progress}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center font-black text-lg">{progress}%</div>
                    </div>
                    <div>
                        <h2 className="text-3xl font-black tracking-tight">Smart Gear List</h2>
                        <p className="text-blue-100 font-medium text-sm">{items.filter(i => i.isChecked).length} of {items.length} items packed</p>
                    </div>
                </div>

                <div className="relative z-10 w-full md:w-auto mt-6 md:mt-0 flex gap-3 flex-wrap justify-end">
                    <Button 
                        onClick={() => onUpdate([])} 
                        variant="ghost" 
                        className="text-white/70 hover:text-white hover:bg-white/10"
                    >
                        Clear All
                    </Button>
                    {masterList.length > 0 && (
                        <Button 
                            onClick={handleImportMaster} 
                            className="bg-white/10 text-white hover:bg-white/20 border border-white/20 shadow-lg backdrop-blur-md"
                            icon={<span className="material-icons-outlined">backpack</span>}
                        >
                            Load Master List
                        </Button>
                    )}
                    <Button 
                        onClick={handleAiGenerate} 
                        isLoading={isGenerating}
                        className="bg-white text-blue-600 hover:bg-blue-50 border-none shadow-lg"
                        icon={<span className="material-icons-outlined">auto_awesome</span>}
                    >
                        Magic Generate
                    </Button>
                </div>
            </div>

            {/* Input Area */}
            <div className="flex gap-3 items-end bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm">
                <div className="flex-1">
                    <Input 
                        placeholder="Add new item..." 
                        value={newItemText} 
                        onChange={e => setNewItemText(e.target.value)} 
                        onKeyDown={e => e.key === 'Enter' && handleAdd()}
                        className="!bg-gray-50 dark:!bg-black/20"
                    />
                </div>
                <div className="w-40">
                    <Select 
                        options={CATEGORIES.map(c => ({ label: c.id, value: c.id }))} 
                        value={newItemCategory}
                        onChange={e => setNewItemCategory(e.target.value)}
                        className="!bg-gray-50 dark:!bg-black/20"
                    />
                </div>
                <Button onClick={handleAdd} className="h-[50px] w-[50px] !rounded-2xl !p-0" icon={<span className="material-icons-outlined">add</span>} />
            </div>

            {/* List Groups */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {CATEGORIES.map(cat => {
                    const catItems = groupedItems[cat.id];
                    // Only show populated categories or if user is editing
                    if (catItems.length === 0) return null;

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
                                <span className="ml-auto text-xs font-bold text-gray-400">{catItems.filter(i => i.isChecked).length}/{catItems.length}</span>
                            </div>
                            <div className="space-y-2">
                                {catItems.map(item => (
                                    <div 
                                        key={item.id} 
                                        onClick={() => handleToggle(item.id)}
                                        className="group flex items-center gap-3 p-3 bg-white/60 dark:bg-black/20 rounded-xl cursor-pointer hover:bg-white dark:hover:bg-white/5 transition-all"
                                    >
                                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${item.isChecked ? 'bg-green-500 border-green-500' : 'bg-transparent border-gray-300 dark:border-gray-600'}`}>
                                            {item.isChecked && <span className="material-icons-outlined text-white text-xs font-bold">check</span>}
                                        </div>
                                        <span className={`flex-1 text-sm font-medium transition-all ${item.isChecked ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-gray-200'}`}>
                                            {item.text}
                                        </span>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-rose-500 transition-opacity"
                                        >
                                            <span className="material-icons-outlined text-sm">close</span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
                {items.length === 0 && (
                    <div className="col-span-full py-12 text-center border-2 border-dashed border-gray-200 dark:border-white/10 rounded-[2.5rem]">
                        <span className="material-icons-outlined text-6xl text-gray-200 dark:text-gray-700">backpack</span>
                        <p className="text-gray-400 font-bold uppercase tracking-widest mt-4 text-xs">Your bag is empty</p>
                        <div className="flex gap-2 justify-center mt-2">
                            {masterList.length > 0 && <Button variant="ghost" onClick={handleImportMaster} className="text-cyan-500 hover:bg-cyan-50">Load Master List</Button>}
                            <Button variant="ghost" onClick={handleAiGenerate} className="text-blue-500 hover:bg-blue-50">Generate Suggestions</Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
