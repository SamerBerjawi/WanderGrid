
import React, { useState } from 'react';
import { Button, Input, Autocomplete } from './ui';
import { LocationEntry } from '../types';
import { searchLocations } from '../services/geocoding';

interface LocationManagerProps {
    locations: LocationEntry[];
    onSave: (locations: LocationEntry[]) => void;
    onCancel: () => void;
    defaultStartDate: string;
    defaultEndDate: string;
}

// Date helper to handle YYYY-MM-DD strings safely
const addDays = (dateStr: string, days: number): string => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const LocationManager: React.FC<LocationManagerProps> = ({ locations, onSave, onCancel, defaultStartDate, defaultEndDate }) => {
    const [entries, setEntries] = useState<LocationEntry[]>(locations.length > 0 ? locations : []);
    const [newEntry, setNewEntry] = useState<Partial<LocationEntry>>({
        name: '',
        startDate: defaultStartDate,
        endDate: defaultEndDate,
        description: ''
    });

    const handleAddEntry = () => {
        if (!newEntry.name || !newEntry.startDate || !newEntry.endDate) return;
        
        const newLocation: LocationEntry = {
            id: Math.random().toString(36).substr(2, 9),
            name: newEntry.name,
            startDate: newEntry.startDate!,
            endDate: newEntry.endDate!,
            description: newEntry.description
        };

        // Intelligent Merge/Split Logic to handle Overrides
        let updatedEntries: LocationEntry[] = [];
        const nStart = newLocation.startDate;
        const nEnd = newLocation.endDate;

        entries.forEach(existing => {
            const eStart = existing.startDate;
            const eEnd = existing.endDate;

            // Check if existing entry overlaps with new entry
            if (eEnd < nStart || eStart > nEnd) {
                // No overlap, keep as is
                updatedEntries.push(existing);
            } else {
                // Overlap detected: "Punch a hole" in existing entry or trim it
                
                // 1. Preserve part BEFORE new entry
                if (eStart < nStart) {
                    updatedEntries.push({
                        ...existing,
                        id: Math.random().toString(36).substr(2, 9), // New ID to avoid key conflicts
                        endDate: addDays(nStart, -1)
                    });
                }

                // 2. Preserve part AFTER new entry
                if (eEnd > nEnd) {
                    updatedEntries.push({
                        ...existing,
                        id: Math.random().toString(36).substr(2, 9),
                        startDate: addDays(nEnd, 1)
                    });
                }
            }
        });

        // Add the new overriding entry
        updatedEntries.push(newLocation);
        
        // Sort chronologically
        updatedEntries.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
        
        setEntries(updatedEntries);
        setNewEntry({
            name: '',
            startDate: newEntry.endDate, // Auto-advance to previous end date for convenience
            endDate: defaultEndDate,
            description: ''
        });
    };

    const handleDeleteEntry = (id: string) => {
        setEntries(prev => prev.filter(e => e.id !== id));
    };

    const fetchLocationSuggestions = async (query: string): Promise<string[]> => {
        return searchLocations(query);
    };

    return (
        <div className="space-y-6 animate-fade-in max-h-[80vh] overflow-y-auto custom-scrollbar p-1">
            <div className="bg-indigo-50 dark:bg-indigo-900/10 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-500 text-white flex items-center justify-center shrink-0">
                    <span className="material-icons-outlined">map</span>
                </div>
                <div>
                    <h4 className="font-bold text-gray-900 dark:text-white">Route Plan</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Define locations for dates. Adding an overlapping date will automatically override existing entries.
                    </p>
                </div>
            </div>

            <div className="space-y-3">
                {entries.map((entry, index) => (
                    <div key={entry.id} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-white/5 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
                                {index + 1}
                            </div>
                            <div>
                                <p className="font-bold text-sm text-gray-900 dark:text-white">{entry.name}</p>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    {new Date(entry.startDate).toLocaleDateString(undefined, {month:'short', day:'numeric'})} - {new Date(entry.endDate).toLocaleDateString(undefined, {month:'short', day:'numeric'})}
                                </p>
                            </div>
                        </div>
                        <button onClick={() => handleDeleteEntry(entry.id)} className="p-2 text-gray-400 hover:text-rose-500 transition-colors">
                            <span className="material-icons-outlined text-sm">close</span>
                        </button>
                    </div>
                ))}
                {entries.length === 0 && (
                    <div className="text-center py-4 text-xs text-gray-400 italic">No locations defined yet.</div>
                )}
            </div>

            <div className="p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5 space-y-4">
                <Autocomplete 
                    label="City / Location"
                    placeholder="e.g. Cairo"
                    value={newEntry.name || ''}
                    onChange={val => setNewEntry({...newEntry, name: val})}
                    fetchSuggestions={fetchLocationSuggestions}
                />
                <div className="grid grid-cols-2 gap-4">
                    <Input 
                        label="From" 
                        type="date" 
                        value={newEntry.startDate || ''} 
                        onChange={e => setNewEntry({...newEntry, startDate: e.target.value})} 
                    />
                    <Input 
                        label="To" 
                        type="date" 
                        value={newEntry.endDate || ''} 
                        min={newEntry.startDate}
                        onChange={e => setNewEntry({...newEntry, endDate: e.target.value})} 
                    />
                </div>
                <div className="flex justify-end">
                    <Button variant="secondary" size="sm" onClick={handleAddEntry} disabled={!newEntry.name || !newEntry.startDate || !newEntry.endDate}>
                        Add / Override
                    </Button>
                </div>
            </div>

            <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-white/5 justify-end">
                <Button variant="ghost" onClick={onCancel}>Cancel</Button>
                <Button variant="primary" onClick={() => onSave(entries)}>Save Locations</Button>
            </div>
        </div>
    );
};
