
import React, { useEffect, useState, useMemo } from 'react';
import { ExpeditionMap } from '../components/ExpeditionMap';
import { dataService } from '../services/mockDb';
import { Trip } from '../types';
import { Input, MultiSelect } from '../components/ui';

interface ExpeditionMapViewProps {
    onTripClick: (tripId: string) => void;
}

export const ExpeditionMapView: React.FC<ExpeditionMapViewProps> = ({ onTripClick }) => {
    const [trips, setTrips] = useState<Trip[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Visual Settings
    const [showFrequencyWeight, setShowFrequencyWeight] = useState(true);
    const [animateRoutes, setAnimateRoutes] = useState(true);

    // Filters
    const [statusFilter, setStatusFilter] = useState<'all' | 'Past' | 'Upcoming' | 'Planning'>('all');
    const [yearFilter, setYearFilter] = useState<string>('all');
    
    // New Filters (Arrays for Multi-Select)
    const [depFilter, setDepFilter] = useState<string[]>([]);
    const [arrFilter, setArrFilter] = useState<string[]>([]);
    const [dateFrom, setDateFrom] = useState<string>('');
    const [dateTo, setDateTo] = useState<string>('');

    useEffect(() => {
        dataService.getTrips().then(t => {
            // Filter to trips that have coordinates or transports with coordinates
            const mappable = t.filter(trip => 
                trip.coordinates || 
                (trip.transports && trip.transports.some(tr => tr.originLat && tr.destLat))
            );
            setTrips(mappable);
            setLoading(false);
        });
    }, []);

    // Derived Data
    const years = useMemo(() => {
        const y = new Set<number>();
        trips.forEach(t => y.add(new Date(t.startDate).getFullYear()));
        return Array.from(y).sort((a,b) => b - a);
    }, [trips]);

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

    const filteredTrips = useMemo(() => {
        const today = new Date();
        today.setHours(0,0,0,0);

        return trips.filter(t => {
            const tStart = new Date(t.startDate);
            const tEnd = new Date(t.endDate);
            let matchesStatus = true;
            
            // Status Logic mapping
            if (statusFilter === 'Past') {
                matchesStatus = tEnd < today;
            } else if (statusFilter === 'Upcoming') { // Confirmed
                matchesStatus = t.status === 'Upcoming' && tEnd >= today;
            } else if (statusFilter === 'Planning') { // Planned
                matchesStatus = t.status === 'Planning';
            }

            const matchesYear = yearFilter === 'all' || tStart.getFullYear().toString() === yearFilter;

            // Date Range
            const matchesFrom = !dateFrom || tEnd >= new Date(dateFrom);
            const matchesTo = !dateTo || tStart <= new Date(dateTo);

            // Airport Logic (Check if ANY flight in trip matches ANY selected filter)
            // If filter array is empty, it means 'All', so match everything.
            const matchesDep = depFilter.length === 0 || (t.transports?.some(tr => depFilter.includes(tr.origin)) ?? false);
            const matchesArr = arrFilter.length === 0 || (t.transports?.some(tr => arrFilter.includes(tr.destination)) ?? false);

            return matchesStatus && matchesYear && matchesFrom && matchesTo && matchesDep && matchesArr;
        });
    }, [trips, statusFilter, yearFilter, dateFrom, dateTo, depFilter, arrFilter]);

    const stats = useMemo(() => {
        let totalKm = 0;
        filteredTrips.forEach(t => {
            if (t.transports) {
                t.transports.forEach(tr => {
                    if (tr.distance) totalKm += tr.distance;
                });
            }
        });
        return {
            count: filteredTrips.length,
            distance: totalKm
        };
    }, [filteredTrips]);

    if (loading) return <div className="h-full flex items-center justify-center text-gray-500">Initializing Satellite Uplink...</div>;

    return (
        <div className="flex flex-col h-full w-full gap-6">
            
            {/* HERO HEADER / COMMAND CENTER - Distinct Card */}
            <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-6 shadow-xl border border-gray-100 dark:border-white/5 flex flex-col xl:flex-row items-start justify-between gap-6 shrink-0 relative overflow-visible z-20">
                
                {/* Background Decor */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

                {/* Left: Identity & Stats */}
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

                    <div className="hidden md:block w-px h-12 bg-gray-200 dark:bg-white/10 mx-2"></div>

                    <div className="flex gap-6">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Coverage</span>
                            <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-black text-gray-900 dark:text-white">{stats.distance.toLocaleString()}</span>
                                <span className="text-xs font-bold text-gray-500 dark:text-gray-400">km</span>
                            </div>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Missions</span>
                            <span className="text-2xl font-black text-gray-900 dark:text-white">{stats.count}</span>
                        </div>
                    </div>
                </div>

                {/* Right: Controls Grid */}
                <div className="flex flex-col gap-3 w-full xl:w-auto relative z-10">
                    
                    {/* Row 1: Primary Filters & Toggles */}
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

                        {/* Toggles */}
                        <div className="flex gap-2 w-full md:w-auto">
                            <button 
                                onClick={() => setAnimateRoutes(!animateRoutes)}
                                className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-3 py-2 rounded-2xl border transition-all ${
                                    animateRoutes 
                                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400' 
                                    : 'bg-transparent border-gray-200 dark:border-white/10 text-gray-400'
                                }`}
                                title="Toggle Animation"
                            >
                                <span className="material-icons-outlined text-lg">{animateRoutes ? 'blur_on' : 'blur_off'}</span>
                            </button>
                            
                            <button 
                                onClick={() => setShowFrequencyWeight(!showFrequencyWeight)}
                                className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-3 py-2 rounded-2xl border transition-all ${
                                    showFrequencyWeight 
                                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-900/50 text-blue-700 dark:text-blue-400' 
                                    : 'bg-transparent border-gray-200 dark:border-white/10 text-gray-400'
                                }`}
                                title="Toggle Route Frequency Weight"
                            >
                                <span className="material-icons-outlined text-lg">line_weight</span>
                            </button>
                        </div>
                    </div>

                    {/* Row 2: Detailed Filters */}
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
            
            {/* MAP CONTAINER - Strictly Below */}
            <div className="flex-1 min-h-0 w-full rounded-[2.5rem] overflow-hidden border border-gray-200 dark:border-white/5 shadow-2xl relative bg-black z-10">
                <ExpeditionMap 
                    trips={filteredTrips} 
                    onTripClick={onTripClick} 
                    showFrequencyWeight={showFrequencyWeight}
                    animateRoutes={animateRoutes}
                />
                
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
    );
};
