
import React, { useEffect, useState, useMemo } from 'react';
import { ExpeditionMap } from '../components/ExpeditionMap';
import { ExpeditionMap3D } from '../components/ExpeditionMap3D';
import { dataService } from '../services/mockDb';
import { Trip } from '../types';
import { Input, MultiSelect } from '../components/ui';

interface ExpeditionMapViewProps {
    onTripClick: (tripId: string) => void;
}

// Custom Hook to detect Dark Mode changes from Tailwind class on HTML element
const useDarkMode = () => {
    const [isDark, setIsDark] = useState(document.documentElement.classList.contains('dark'));

    useEffect(() => {
        const observer = new MutationObserver(() => {
            setIsDark(document.documentElement.classList.contains('dark'));
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    return isDark;
};

export const ExpeditionMapView: React.FC<ExpeditionMapViewProps> = ({ onTripClick }) => {
    const [mapType, setMapType] = useState<'2D' | '3D'>('2D');
    const [trips, setTrips] = useState<Trip[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Map Visual Settings
    const [showFrequencyWeight, setShowFrequencyWeight] = useState(true);
    const [animateRoutes, setAnimateRoutes] = useState(true);

    // Filters
    const [statusFilter, setStatusFilter] = useState<'all' | 'Past' | 'Upcoming' | 'Planning'>('all');
    const [yearFilter, setYearFilter] = useState<string>('all');
    const [depFilter, setDepFilter] = useState<string[]>([]);
    const [arrFilter, setArrFilter] = useState<string[]>([]);
    const [dateFrom, setDateFrom] = useState<string>('');
    const [dateTo, setDateTo] = useState<string>('');

    const isDark = useDarkMode();

    useEffect(() => {
        dataService.getTrips().then(t => {
            setTrips(t);
            setLoading(false);
        });
    }, []);

    // Derived Data
    const years = useMemo(() => {
        const y = new Set<number>();
        trips.forEach(t => y.add(new Date(t.startDate).getFullYear()));
        return Array.from(y).sort((a,b) => b - a);
    }, [trips]);

    const filteredTrips = useMemo(() => {
        const today = new Date();
        today.setHours(0,0,0,0);

        return trips.filter(t => {
            const tStart = new Date(t.startDate);
            const tEnd = new Date(t.endDate);
            let matchesStatus = true;
            
            if (statusFilter === 'Past') matchesStatus = tEnd < today;
            else if (statusFilter === 'Upcoming') matchesStatus = t.status === 'Upcoming' && tEnd >= today;
            else if (statusFilter === 'Planning') matchesStatus = t.status === 'Planning';

            const matchesYear = yearFilter === 'all' || tStart.getFullYear().toString() === yearFilter;
            const matchesFrom = !dateFrom || tEnd >= new Date(dateFrom);
            const matchesTo = !dateTo || tStart <= new Date(dateTo);
            const matchesDep = depFilter.length === 0 || (t.transports?.some(tr => depFilter.includes(tr.origin)) ?? false);
            const matchesArr = arrFilter.length === 0 || (t.transports?.some(tr => arrFilter.includes(tr.destination)) ?? false);

            return matchesStatus && matchesYear && matchesFrom && matchesTo && matchesDep && matchesArr;
        });
    }, [trips, statusFilter, yearFilter, dateFrom, dateTo, depFilter, arrFilter]);

    const uniqueAirports = useMemo(() => {
        const origins = new Set<string>();
        const destinations = new Set<string>();
        trips.forEach(t => {
            t.transports?.forEach(tr => {
                if (tr.origin) origins.add(tr.origin);
                if (tr.destination) destinations.add(tr.destination);
            });
        });
        return {
            origins: Array.from(origins).sort().map(code => ({ label: code, value: code })),
            destinations: Array.from(destinations).sort().map(code => ({ label: code, value: code }))
        };
    }, [trips]);

    if (loading) return <div className="h-full flex items-center justify-center text-gray-500">Initializing Satellite Uplink...</div>;

    return (
        <div className="flex flex-col h-full w-full gap-6">
            
            {/* HERO HEADER */}
            <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-6 shadow-xl border border-gray-100 dark:border-white/5 flex flex-col xl:flex-row items-start justify-between gap-6 shrink-0 relative overflow-visible z-20">
                <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

                <div className="flex flex-col md:flex-row items-center gap-8 w-full xl:w-auto relative z-10 xl:py-2">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-[1.5rem] bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
                            <span className="material-icons-outlined text-3xl">public</span>
                        </div>
                        <div>
                            <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight leading-none">Global Ops</h2>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-[0.2em] mt-1.5">Expedition Logistics</p>
                        </div>
                    </div>
                </div>

                {/* Filters & Toggles */}
                <div className="flex flex-col gap-3 w-full xl:w-auto relative z-10">
                    <div className="flex flex-col md:flex-row items-center gap-3">
                        <div className="flex items-center p-1 bg-gray-100 dark:bg-black/30 rounded-2xl border border-gray-200 dark:border-white/5 w-full md:w-auto">
                            <select 
                                value={yearFilter}
                                onChange={(e) => setYearFilter(e.target.value)}
                                className="bg-transparent text-xs font-bold text-gray-700 dark:text-gray-200 outline-none px-3 py-2 cursor-pointer border-r border-gray-300 dark:border-white/10"
                            >
                                <option value="all">All Years</option>
                                {years.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>

                            <div className="flex gap-1 pl-2">
                                {['all', 'Upcoming', 'Past'].map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => setStatusFilter(s as any)}
                                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                                            statusFilter === s 
                                            ? 'bg-white dark:bg-gray-700 text-black dark:text-white shadow-sm' 
                                            : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                                        }`}
                                    >
                                        {s === 'all' ? 'All' : s}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex gap-2 w-full md:w-auto">
                            {/* 2D/3D Toggle */}
                            <div className="flex p-1 bg-gray-100 dark:bg-black/30 rounded-2xl border border-gray-200 dark:border-white/5">
                                <button 
                                    onClick={() => setMapType('2D')}
                                    className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase transition-all ${mapType === '2D' ? 'bg-white dark:bg-gray-700 shadow text-blue-600 dark:text-white' : 'text-gray-400 hover:text-gray-600'}`}
                                >
                                    2D
                                </button>
                                <button 
                                    onClick={() => setMapType('3D')}
                                    className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase transition-all ${mapType === '3D' ? 'bg-white dark:bg-gray-700 shadow text-purple-600 dark:text-white' : 'text-gray-400 hover:text-gray-600'}`}
                                >
                                    3D
                                </button>
                            </div>

                            <button 
                                onClick={() => setAnimateRoutes(!animateRoutes)}
                                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-2xl border transition-all ${
                                    animateRoutes 
                                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400' 
                                    : 'bg-transparent border-gray-200 dark:border-white/10 text-gray-400'
                                }`}
                                title="Toggle Animation"
                            >
                                <span className="material-icons-outlined text-lg">{animateRoutes ? 'blur_on' : 'blur_off'}</span>
                            </button>
                            
                            {mapType === '2D' && (
                                <button 
                                    onClick={() => setShowFrequencyWeight(!showFrequencyWeight)}
                                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-2xl border transition-all ${
                                        showFrequencyWeight 
                                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-900/50 text-blue-700 dark:text-blue-400' 
                                        : 'bg-transparent border-gray-200 dark:border-white/10 text-gray-400'
                                    }`}
                                    title="Toggle Route Frequency Weight"
                                >
                                    <span className="material-icons-outlined text-lg">line_weight</span>
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-3">
                        <div className="flex gap-2 w-full md:w-auto min-w-[300px]">
                            <div className="flex-1">
                                <MultiSelect 
                                    placeholder="Any Origin"
                                    options={uniqueAirports.origins}
                                    value={depFilter}
                                    onChange={setDepFilter}
                                />
                            </div>
                            <div className="flex-1">
                                <MultiSelect 
                                    placeholder="Any Dest"
                                    options={uniqueAirports.destinations}
                                    value={arrFilter}
                                    onChange={setArrFilter}
                                />
                            </div>
                        </div>

                        <div className="flex gap-2 w-full md:w-auto">
                            <Input 
                                type="date" 
                                value={dateFrom} 
                                onChange={(e) => setDateFrom(e.target.value)} 
                                className="!py-1.5 !text-[10px] !font-bold !h-[38px] w-full md:w-32"
                                placeholder="From"
                            />
                            <Input 
                                type="date" 
                                value={dateTo} 
                                onChange={(e) => setDateTo(e.target.value)} 
                                className="!py-1.5 !text-[10px] !font-bold !h-[38px] w-full md:w-32"
                                placeholder="To"
                            />
                        </div>
                    </div>
                </div>
            </div>
            
            {/* CONTENT AREA */}
            <div className="flex-1 min-h-0 w-full overflow-hidden relative z-10">
                <div className="w-full h-full rounded-[2.5rem] overflow-hidden border border-gray-200 dark:border-white/5 shadow-2xl relative bg-black">
                    {mapType === '2D' ? (
                        <ExpeditionMap 
                            key={`2d-${isDark ? 'dark' : 'light'}`}
                            trips={filteredTrips} 
                            onTripClick={onTripClick} 
                            showFrequencyWeight={showFrequencyWeight}
                            animateRoutes={animateRoutes}
                        />
                    ) : (
                        <ExpeditionMap3D
                            key={`3d-${isDark ? 'dark' : 'light'}`}
                            trips={filteredTrips}
                            onTripClick={onTripClick}
                            animateRoutes={animateRoutes}
                        />
                    )}
                    
                    {trips.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center z-[500] pointer-events-none">
                            <div className="bg-black/80 backdrop-blur-md p-8 rounded-3xl border border-white/10 text-center">
                                <span className="material-icons-outlined text-4xl text-gray-500 mb-4">public_off</span>
                                <h3 className="text-xl font-bold text-white">No Geospatial Data</h3>
                                <p className="text-gray-400 text-sm mt-2 max-w-xs">Add trips with valid locations to visualize them on the global map.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
