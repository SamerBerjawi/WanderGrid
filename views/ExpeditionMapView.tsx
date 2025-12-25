
import React, { useEffect, useState, useMemo } from 'react';
import { ExpeditionMap } from '../components/ExpeditionMap';
import { ExpeditionMap3D } from '../components/ExpeditionMap3D';
import { dataService } from '../services/mockDb';
import { Trip, Transport } from '../types';
import { Input, MultiSelect, Card } from '../components/ui';
import { calculateDistance } from '../services/geocoding';

interface ExpeditionMapViewProps {
    onTripClick: (tripId: string) => void;
}

const StatCard: React.FC<{ title: string; value: string | number; subtitle?: string; icon: string; color?: string }> = ({ title, value, subtitle, icon, color = 'blue' }) => (
    <div className={`p-6 rounded-[2rem] bg-white dark:bg-gray-800 border border-gray-100 dark:border-white/5 shadow-sm flex items-center gap-5 relative overflow-hidden group`}>
        <div className={`absolute right-0 top-0 w-32 h-32 bg-${color}-500/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/3 transition-all group-hover:bg-${color}-500/10`} />
        <div className={`w-14 h-14 rounded-2xl bg-${color}-50 dark:bg-${color}-900/20 text-${color}-600 dark:text-${color}-400 flex items-center justify-center text-3xl shadow-sm`}>
            <span className="material-icons-outlined">{icon}</span>
        </div>
        <div>
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{title}</div>
            <div className="text-3xl font-black text-gray-900 dark:text-white leading-none">{value}</div>
            {subtitle && <div className="text-xs font-bold text-gray-500 dark:text-gray-400 mt-1">{subtitle}</div>}
        </div>
    </div>
);

const TopList: React.FC<{ title: string; items: { label: string; sub?: string; count: number; code?: string }[]; icon: string; color: string }> = ({ title, items, icon, color }) => {
    if (items.length === 0) return null;
    const max = items[0].count;
    
    return (
        <div className="p-6 rounded-[2rem] bg-white dark:bg-gray-800 border border-gray-100 dark:border-white/5 shadow-sm flex flex-col h-full">
            <div className="flex items-center gap-3 mb-6">
                <div className={`w-10 h-10 rounded-xl bg-${color}-50 dark:bg-${color}-900/20 text-${color}-600 dark:text-${color}-400 flex items-center justify-center`}>
                    <span className="material-icons-outlined">{icon}</span>
                </div>
                <h3 className="font-black text-lg text-gray-900 dark:text-white uppercase tracking-tight">{title}</h3>
            </div>
            <div className="space-y-4 flex-1 overflow-y-auto custom-scrollbar pr-2">
                {items.slice(0, 8).map((item, idx) => (
                    <div key={idx} className="relative group">
                        <div className="flex justify-between items-center mb-1.5 relative z-10">
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] font-black text-gray-300 w-4">{idx + 1}</span>
                                <div>
                                    <div className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                        {item.code && <span className="font-mono text-[10px] bg-gray-100 dark:bg-white/10 px-1.5 rounded text-gray-500">{item.code}</span>}
                                        <span className="truncate max-w-[140px]" title={item.label}>{item.label}</span>
                                    </div>
                                    {item.sub && <div className="text-[10px] text-gray-400 font-medium truncate max-w-[140px]">{item.sub}</div>}
                                </div>
                            </div>
                            <span className="text-xs font-black text-gray-900 dark:text-white">{item.count}</span>
                        </div>
                        <div className="h-1.5 w-full bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                            <div 
                                className={`h-full bg-${color}-500 rounded-full transition-all duration-500 opacity-50 group-hover:opacity-100`} 
                                style={{ width: `${(item.count / max) * 100}%` }} 
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export const ExpeditionMapView: React.FC<ExpeditionMapViewProps> = ({ onTripClick }) => {
    const [viewMode, setViewMode] = useState<'map' | 'stats'>('map');
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

    // Statistics Calculation
    const stats = useMemo(() => {
        let totalFlights = 0;
        let totalDistance = 0; // km
        let totalDurationMinutes = 0;
        
        const airports = new Map<string, number>(); // Code -> Count
        const airlines = new Map<string, number>();
        const aircraft = new Map<string, number>();
        const routes = new Map<string, number>();

        filteredTrips.forEach(t => {
            if (t.transports) {
                t.transports.forEach(tr => {
                    if (tr.mode === 'Flight') {
                        totalFlights++;
                        
                        // Distance
                        let dist = tr.distance || 0;
                        if (!dist && tr.originLat && tr.originLng && tr.destLat && tr.destLng) {
                            dist = calculateDistance(tr.originLat, tr.originLng, tr.destLat, tr.destLng);
                        }
                        totalDistance += dist;

                        // Duration
                        if (tr.departureDate && tr.departureTime && tr.arrivalDate && tr.arrivalTime) {
                            const start = new Date(`${tr.departureDate}T${tr.departureTime}`);
                            const end = new Date(`${tr.arrivalDate}T${tr.arrivalTime}`);
                            const diff = (end.getTime() - start.getTime()) / 60000;
                            if (diff > 0) totalDurationMinutes += diff;
                        }

                        // Airports
                        if (tr.origin) {
                            airports.set(tr.origin, (airports.get(tr.origin) || 0) + 1);
                        }
                        if (tr.destination) {
                            airports.set(tr.destination, (airports.get(tr.destination) || 0) + 1);
                        }

                        // Airline
                        if (tr.provider) {
                            airlines.set(tr.provider, (airlines.get(tr.provider) || 0) + 1);
                        }

                        // Aircraft
                        if (tr.vehicleModel) {
                            aircraft.set(tr.vehicleModel, (aircraft.get(tr.vehicleModel) || 0) + 1);
                        }

                        // Route
                        if (tr.origin && tr.destination) {
                            const key = `${tr.origin} → ${tr.destination}`;
                            routes.set(key, (routes.get(key) || 0) + 1);
                        }
                    }
                });
            }
        });

        // Sort Top Lists
        const topAirports = Array.from(airports.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([code, count]) => ({ label: code, count, code }));

        const topAirlines = Array.from(airlines.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => ({ label: name, count }));

        const topAircraft = Array.from(aircraft.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([model, count]) => ({ label: model, count }));

        const topRoutes = Array.from(routes.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([key, count]) => {
                const [o, d] = key.split(' → ');
                return { label: key, count, code: `${o}-${d}` };
            });

        return {
            totalFlights,
            totalDistance: Math.round(totalDistance),
            totalDurationHours: Math.round(totalDurationMinutes / 60),
            topAirports,
            topAirlines,
            topAircraft,
            topRoutes,
            earthCircumnavigations: (totalDistance / 40075).toFixed(1),
            daysInAir: (totalDurationMinutes / (60 * 24)).toFixed(1)
        };
    }, [filteredTrips]);

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

                    <div className="hidden md:block w-px h-12 bg-gray-200 dark:bg-white/10 mx-2"></div>

                    {/* View Switcher */}
                    <div className="flex p-1 bg-gray-100 dark:bg-black/30 rounded-2xl">
                        <button 
                            onClick={() => setViewMode('map')}
                            className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${viewMode === 'map' ? 'bg-white text-blue-600 shadow-md dark:bg-gray-800 dark:text-white' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                        >
                            <span className="material-icons-outlined text-sm">map</span> Map
                        </button>
                        <button 
                            onClick={() => setViewMode('stats')}
                            className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${viewMode === 'stats' ? 'bg-white text-purple-600 shadow-md dark:bg-gray-800 dark:text-white' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                        >
                            <span className="material-icons-outlined text-sm">pie_chart</span> Statistics
                        </button>
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

                        {viewMode === 'map' && (
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
                        )}
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
                {viewMode === 'map' ? (
                    <div className="w-full h-full rounded-[2.5rem] overflow-hidden border border-gray-200 dark:border-white/5 shadow-2xl relative bg-black">
                        {mapType === '2D' ? (
                            <ExpeditionMap 
                                trips={filteredTrips} 
                                onTripClick={onTripClick} 
                                showFrequencyWeight={showFrequencyWeight}
                                animateRoutes={animateRoutes}
                            />
                        ) : (
                            <ExpeditionMap3D
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
                ) : (
                    // STATISTICS DASHBOARD
                    <div className="h-full overflow-y-auto custom-scrollbar pr-1 animate-fade-in">
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
                            <StatCard 
                                title="Total Flights" 
                                value={stats.totalFlights} 
                                icon="flight_takeoff" 
                                color="blue" 
                            />
                            <StatCard 
                                title="Distance Flown" 
                                value={`${(stats.totalDistance / 1000).toFixed(1)}k km`} 
                                subtitle={`${stats.earthCircumnavigations}x around Earth`}
                                icon="public" 
                                color="emerald" 
                            />
                            <StatCard 
                                title="Time in Air" 
                                value={`${stats.totalDurationHours}h`} 
                                subtitle={`${stats.daysInAir} Days`}
                                icon="schedule" 
                                color="purple" 
                            />
                            <StatCard 
                                title="Top Airport" 
                                value={stats.topAirports[0]?.label || '-'} 
                                subtitle={`${stats.topAirports[0]?.count || 0} Visits`}
                                icon="location_on" 
                                color="amber" 
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 h-[500px]">
                            <TopList title="Top Airports" items={stats.topAirports} icon="flight_land" color="blue" />
                            <TopList title="Top Airlines" items={stats.topAirlines} icon="airlines" color="indigo" />
                            <TopList title="Top Routes" items={stats.topRoutes} icon="alt_route" color="emerald" />
                            <TopList title="Aircraft" items={stats.topAircraft} icon="airplane_ticket" color="gray" />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
