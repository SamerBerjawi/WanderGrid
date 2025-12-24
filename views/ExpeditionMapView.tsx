
import React, { useEffect, useState, useMemo } from 'react';
import { ExpeditionMap } from '../components/ExpeditionMap';
import { dataService } from '../services/mockDb';
import { Trip } from '../types';

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

    const filteredTrips = useMemo(() => {
        const today = new Date();
        today.setHours(0,0,0,0);

        return trips.filter(t => {
            const tDate = new Date(t.endDate);
            let matchesStatus = true;
            
            // Status Logic mapping
            if (statusFilter === 'Past') {
                matchesStatus = tDate < today;
            } else if (statusFilter === 'Upcoming') { // Confirmed
                matchesStatus = t.status === 'Upcoming' && tDate >= today;
            } else if (statusFilter === 'Planning') { // Planned
                matchesStatus = t.status === 'Planning';
            }

            const matchesYear = yearFilter === 'all' || new Date(t.startDate).getFullYear().toString() === yearFilter;

            return matchesStatus && matchesYear;
        });
    }, [trips, statusFilter, yearFilter]);

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
        <div className="flex flex-col h-full w-full rounded-[2.5rem] overflow-hidden border border-gray-200 dark:border-white/5 shadow-2xl bg-black">
            
            {/* HERO HEADER / COMMAND CENTER */}
            <div className="z-10 bg-white/10 dark:bg-black/60 backdrop-blur-xl border-b border-white/10 p-4 md:p-6 flex flex-col xl:flex-row items-center justify-between gap-6 shrink-0">
                
                {/* Left: Title & Stats */}
                <div className="flex flex-col md:flex-row items-center gap-6 w-full xl:w-auto">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
                            <span className="material-icons-outlined text-xl">public</span>
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white tracking-tight leading-none">Expedition Map</h2>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Global Logistics View</p>
                        </div>
                    </div>

                    <div className="hidden md:block w-px h-10 bg-white/10"></div>

                    <div className="flex gap-4 w-full md:w-auto justify-center md:justify-start">
                        <div className="flex-1 md:flex-initial p-3 rounded-2xl bg-white/5 border border-white/5 flex flex-col min-w-[120px]">
                            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Distance</span>
                            <div className="mt-0.5">
                                <span className="text-xl font-black text-white">{stats.distance.toLocaleString()}</span>
                                <span className="text-[10px] font-bold text-gray-500 ml-1">km</span>
                            </div>
                        </div>
                        <div className="flex-1 md:flex-initial p-3 rounded-2xl bg-white/5 border border-white/5 flex flex-col min-w-[100px]">
                            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Missions</span>
                            <div className="mt-0.5">
                                <span className="text-xl font-black text-white">{stats.count}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right: Filters & Controls */}
                <div className="flex flex-col md:flex-row gap-4 items-center w-full xl:w-auto xl:max-w-[60%] bg-white/5 p-2 rounded-3xl border border-white/5">
                    
                    {/* Visual Toggles */}
                    <div className="flex items-center gap-3 px-3 py-1 border-r border-white/10 shrink-0">
                        <label className="flex items-center gap-2 cursor-pointer group" title="Thicker lines for frequently traveled routes">
                            <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${showFrequencyWeight ? 'bg-blue-600' : 'bg-gray-700'}`}>
                                <div className={`w-3 h-3 bg-white rounded-full shadow transform transition-transform ${showFrequencyWeight ? 'translate-x-4' : 'translate-x-0'}`} />
                            </div>
                            <input 
                                type="checkbox" 
                                className="hidden" 
                                checked={showFrequencyWeight} 
                                onChange={(e) => setShowFrequencyWeight(e.target.checked)} 
                            />
                            <span className="text-[10px] font-bold text-gray-400 uppercase group-hover:text-white transition-colors">Weight</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer group" title="Show animated dash paths">
                            <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${animateRoutes ? 'bg-emerald-600' : 'bg-gray-700'}`}>
                                <div className={`w-3 h-3 bg-white rounded-full shadow transform transition-transform ${animateRoutes ? 'translate-x-4' : 'translate-x-0'}`} />
                            </div>
                            <input 
                                type="checkbox" 
                                className="hidden" 
                                checked={animateRoutes} 
                                onChange={(e) => setAnimateRoutes(e.target.checked)} 
                            />
                            <span className="text-[10px] font-bold text-gray-400 uppercase group-hover:text-white transition-colors">Anim</span>
                        </label>
                    </div>

                    {/* Status Toggles */}
                    <div className="flex p-1 bg-black/40 rounded-2xl w-full md:w-auto shrink-0 overflow-x-auto scrollbar-hide">
                        {['all', 'Past', 'Upcoming', 'Planning'].map((status) => (
                             <button 
                                key={status}
                                onClick={() => setStatusFilter(status as any)}
                                className={`flex-1 md:flex-initial px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                                    statusFilter === status 
                                    ? (status === 'Past' ? 'bg-blue-600 text-white shadow-lg' : status === 'Upcoming' ? 'bg-emerald-600 text-white shadow-lg' : status === 'Planning' ? 'bg-white text-black shadow-lg' : 'bg-gray-700 text-white shadow-lg') 
                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                                }`}
                            >
                                {status === 'all' ? 'All' : status === 'Upcoming' ? 'Confirmed' : status === 'Planning' ? 'Planned' : 'Historic'}
                            </button>
                        ))}
                    </div>

                    {/* Year Selector */}
                    <div className="flex items-center gap-2 overflow-x-auto max-w-full min-w-0 px-2 scrollbar-hide mask-fade-right">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide hidden lg:block">Year:</span>
                        <button
                            onClick={() => setYearFilter('all')}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all whitespace-nowrap border ${yearFilter === 'all' ? 'bg-white text-black border-white' : 'bg-transparent text-gray-500 border-white/10 hover:border-white/30'}`}
                        >
                            All
                        </button>
                        {years.map(y => (
                            <button
                                key={y}
                                onClick={() => setYearFilter(y.toString())}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all whitespace-nowrap border ${yearFilter === y.toString() ? 'bg-white text-black border-white' : 'bg-transparent text-gray-500 border-white/10 hover:border-white/30'}`}
                            >
                                {y}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            
            {/* Map Container */}
            <div className="flex-1 relative w-full min-h-0">
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
