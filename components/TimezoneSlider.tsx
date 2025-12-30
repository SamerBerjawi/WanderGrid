
import React, { useState, useEffect, useMemo } from 'react';
import { Card, Button, Input } from './ui';
import { resolvePlaceName, getCoordinates } from '../services/geocoding';

interface TimezoneLocation {
    id: string;
    name: string;
    timezone: string;
    offset: number; // hours from UTC
}

const DEFAULT_LOCATIONS = [
    { id: '1', name: 'New York', timezone: 'America/New_York' },
    { id: '2', name: 'London', timezone: 'Europe/London' },
    { id: '3', name: 'Bali', timezone: 'Asia/Makassar' },
];

export const TimezoneSlider: React.FC = () => {
    const [locations, setLocations] = useState<TimezoneLocation[]>([]);
    const [sliderValue, setSliderValue] = useState(14); // 2 PM default reference
    const [newCity, setNewCity] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    useEffect(() => {
        // Initialize with defaults + calculated offsets
        const init = async () => {
            const enriched = await Promise.all(DEFAULT_LOCATIONS.map(async (loc) => {
                const offset = getOffset(loc.timezone);
                return { ...loc, offset };
            }));
            setLocations(enriched);
        };
        init();
    }, []);

    const getOffset = (timeZone: string) => {
        try {
            const date = new Date();
            const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
            const tzDate = new Date(date.toLocaleString('en-US', { timeZone }));
            return (tzDate.getTime() - utcDate.getTime()) / 60000 / 60;
        } catch (e) { return 0; }
    };

    const handleAddLocation = async () => {
        if (!newCity) return;
        setIsAdding(true);
        try {
            const coords = await getCoordinates(newCity);
            const resolved = await resolvePlaceName(newCity);
            
            if (coords && coords.tz) {
                const offset = getOffset(coords.tz);
                setLocations(prev => [...prev, {
                    id: Math.random().toString(36).substr(2, 9),
                    name: resolved?.city || newCity,
                    timezone: coords.tz || 'UTC',
                    offset
                }]);
                setNewCity('');
            }
        } catch (e) {
            console.error("Failed to add city", e);
        } finally {
            setIsAdding(false);
        }
    };

    const removeLocation = (id: string) => {
        setLocations(prev => prev.filter(l => l.id !== id));
    };

    // Hours logic
    // We base the slider on UTC time (0-24) for easier calculation, but display relative to the first location (Home Base)
    // Actually, simpler: Slider represents UTC Hour.
    
    const renderHourBlock = (utcHour: number, offset: number) => {
        const localHour = (utcHour + offset + 24) % 24;
        const isBusiness = localHour >= 9 && localHour < 18;
        const isNight = localHour >= 22 || localHour < 7;
        
        let bgClass = 'bg-gray-100 dark:bg-white/5'; // Transition/Personal
        if (isBusiness) bgClass = 'bg-emerald-400 dark:bg-emerald-600';
        if (isNight) bgClass = 'bg-slate-300 dark:bg-slate-700 opacity-50';

        return (
            <div key={utcHour} className={`flex-1 h-8 first:rounded-l-lg last:rounded-r-lg mx-[1px] relative group ${bgClass}`}>
                <div className="hidden group-hover:flex absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-black text-white text-[10px] rounded whitespace-nowrap z-10">
                    {Math.floor(localHour)}:00
                </div>
            </div>
        );
    };

    const formatLocalTime = (utcSlider: number, offset: number) => {
        const local = (utcSlider + offset + 24) % 24;
        const h = Math.floor(local);
        const m = Math.floor((local - h) * 60);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
    };

    // Calculate overlap
    // "Golden Hour" = All locations are between 9 and 18? Or at least 8 and 20?
    // Let's visualize overlaps on the master slider track
    const overlapMap = useMemo(() => {
        const map = new Array(24).fill(0);
        for(let h=0; h<24; h++) {
            let isGood = true;
            for(const loc of locations) {
                const localH = (h + loc.offset + 24) % 24;
                if (localH < 9 || localH >= 18) { // Strict business hours
                    isGood = false;
                    break;
                }
            }
            if (isGood) map[h] = 1;
        }
        return map;
    }, [locations]);

    return (
        <Card noPadding className="rounded-[2.5rem] border-white/50 dark:border-white/10 shadow-2xl overflow-hidden flex flex-col h-full">
            <div className="p-6 border-b border-gray-100 dark:border-white/5 bg-gradient-to-r from-amber-500/10 to-orange-500/10">
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/20">
                        <span className="material-icons-outlined">schedule</span>
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-gray-900 dark:text-white leading-none">Timezone Sync</h3>
                        <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest mt-1">Golden Hour Calculator</p>
                    </div>
                </div>
                
                <div className="flex gap-2 mt-4">
                    <Input 
                        placeholder="Add City..." 
                        value={newCity} 
                        onChange={e => setNewCity(e.target.value)} 
                        onKeyDown={e => e.key === 'Enter' && handleAddLocation()}
                        className="!bg-white/60 dark:!bg-black/20 !border-transparent !h-10 !text-xs"
                    />
                    <Button size="sm" onClick={handleAddLocation} isLoading={isAdding} className="!h-10 !w-10 !p-0 rounded-xl bg-white dark:bg-white/10 text-gray-600 dark:text-white shadow-none hover:bg-gray-50">
                        <span className="material-icons-outlined text-sm">add</span>
                    </Button>
                </div>
            </div>

            <div className="flex-1 p-6 overflow-y-auto custom-scrollbar bg-white dark:bg-gray-900">
                <div className="space-y-6 relative">
                    
                    {/* Master Slider Indicator Line */}
                    <div 
                        className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-20 pointer-events-none transition-all duration-75"
                        style={{ left: `calc(${(sliderValue / 24) * 100}% + 120px)` }} // Offset for label width approx
                    >
                        <div className="absolute -top-1 -translate-x-1/2 bg-rose-500 text-white text-[9px] font-bold px-1.5 rounded">
                            UTC {Math.floor(sliderValue)}:00
                        </div>
                    </div>

                    {locations.map(loc => (
                        <div key={loc.id} className="flex items-center gap-4 relative group">
                            <div className="w-28 shrink-0">
                                <div className="flex justify-between items-center">
                                    <h4 className="font-bold text-gray-800 dark:text-white text-sm truncate">{loc.name}</h4>
                                    <button onClick={() => removeLocation(loc.id)} className="text-gray-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="material-icons-outlined text-xs">close</span>
                                    </button>
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                                    {formatLocalTime(sliderValue, loc.offset)}
                                </div>
                            </div>
                            
                            <div className="flex-1 flex h-8 rounded-lg overflow-hidden bg-gray-100 dark:bg-white/5 relative">
                                {Array.from({ length: 24 }).map((_, i) => renderHourBlock(i, loc.offset))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-white/5 border-t border-gray-100 dark:border-white/5">
                <div className="relative h-10 w-full flex items-center">
                    {/* Golden Hour Markers on Track */}
                    <div className="absolute inset-0 flex mx-[1px] pointer-events-none pl-[120px]">
                        {overlapMap.map((isGold, i) => (
                            <div key={i} className={`flex-1 h-2 mt-4 rounded-full mx-0.5 transition-all ${isGold ? 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.8)]' : 'bg-transparent'}`} />
                        ))}
                    </div>

                    <input 
                        type="range" 
                        min="0" 
                        max="24" 
                        step="0.5"
                        value={sliderValue}
                        onChange={(e) => setSliderValue(parseFloat(e.target.value))}
                        className="w-full absolute z-30 opacity-0 cursor-ew-resize h-full"
                    />
                    <div className="w-full h-10 flex items-center pl-[120px]">
                         <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full relative overflow-hidden">
                             <div className="absolute top-0 bottom-0 bg-blue-500 rounded-full" style={{ width: `${(sliderValue / 24) * 100}%` }} />
                         </div>
                    </div>
                </div>
                <div className="flex justify-between pl-[120px] text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                    <span>00:00</span>
                    <span>12:00</span>
                    <span>24:00</span>
                </div>
            </div>
        </Card>
    );
};
