
import React, { useEffect, useState, useMemo } from 'react';
import { ExpeditionMap } from '../components/ExpeditionMap';
import { ExpeditionMap3D } from '../components/ExpeditionMap3D';
import { dataService } from '../services/mockDb';
import { Trip } from '../types';
import { Input, MultiSelect } from '../components/ui';
import { resolvePlaceName, getCoordinates } from '../services/geocoding';

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

// Coordinate Cache to prevent excessive API calls
const COORD_CACHE_KEY = 'wandergrid_coord_cache';
let coordCache: Map<string, { lat: number, lng: number }> | null = null;

const getCoordCache = () => {
    if (coordCache) return coordCache;
    try {
        const stored = localStorage.getItem(COORD_CACHE_KEY);
        coordCache = stored ? new Map(JSON.parse(stored)) : new Map();
    } catch {
        coordCache = new Map();
    }
    return coordCache!;
};

const saveCoordCache = (cache: Map<string, { lat: number, lng: number }>) => {
    try {
        localStorage.setItem(COORD_CACHE_KEY, JSON.stringify(Array.from(cache.entries())));
    } catch (e) {
        console.warn("Failed to save coord cache", e);
    }
};

export const ExpeditionMapView: React.FC<ExpeditionMapViewProps> = ({ onTripClick }) => {
    const [mapType, setMapType] = useState<'2D' | '3D'>('2D');
    const [viewMode, setViewMode] = useState<'network' | 'scratch'>('network');
    const [trips, setTrips] = useState<Trip[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Map Visual Settings
    const [showFrequencyWeight, setShowFrequencyWeight] = useState(true);
    const [animateRoutes, setAnimateRoutes] = useState(true);
    const [showCountries, setShowCountries] = useState(false); 

    // Data for Highlights
    const [visitedCountryCodes, setVisitedCountryCodes] = useState<string[]>([]);
    const [visitedPlaces, setVisitedPlaces] = useState<{lat: number, lng: number, name: string}[]>([]);

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

    // Calculate Visited Countries & Cities
    useEffect(() => {
        const processGeoData = async () => {
            const countryCodes = new Set<string>();
            // Reuse cache from LocalStorage if available (shared with Gamification)
            const placeCacheRaw = localStorage.getItem('wandergrid_geo_cache_v2');
            const placeDetailsCache = placeCacheRaw ? new Map(JSON.parse(placeCacheRaw)) : new Map();
            const coordinateCache = getCoordCache();
            let coordsDirty = false;
            
            const placesToCheckForCountry = new Set<string>();
            const placesToCheckForCoords = new Set<string>(); // Map Name -> LatLng
            const finalPlaces: { lat: number, lng: number, name: string }[] = [];
            const processedPlaceKeys = new Set<string>(); // "lat,lng"

            trips.forEach(t => {
                if (t.status === 'Cancelled') return;
                
                // 1. Main Trip Location
                if (t.location) {
                    placesToCheckForCountry.add(t.location);
                    if (t.coordinates) {
                        const key = `${t.coordinates.lat.toFixed(4)},${t.coordinates.lng.toFixed(4)}`;
                        if (!processedPlaceKeys.has(key)) {
                            finalPlaces.push({ lat: t.coordinates.lat, lng: t.coordinates.lng, name: t.location });
                            processedPlaceKeys.add(key);
                        }
                    } else {
                        placesToCheckForCoords.add(t.location);
                    }
                }

                // 2. Transports
                t.transports?.forEach(tr => {
                    // Countries
                    if (tr.origin) placesToCheckForCountry.add(tr.origin);
                    if (tr.destination) placesToCheckForCountry.add(tr.destination);
                    
                    // Cities (Use explicit Lat/Lng if available from transport data)
                    if (tr.originLat && tr.originLng) {
                        const key = `${tr.originLat.toFixed(4)},${tr.originLng.toFixed(4)}`;
                        if (!processedPlaceKeys.has(key)) {
                            finalPlaces.push({ lat: tr.originLat, lng: tr.originLng, name: tr.origin });
                            processedPlaceKeys.add(key);
                        }
                    } else if (tr.origin) {
                        placesToCheckForCoords.add(tr.origin);
                    }

                    if (tr.destLat && tr.destLng) {
                        const key = `${tr.destLat.toFixed(4)},${tr.destLng.toFixed(4)}`;
                        if (!processedPlaceKeys.has(key)) {
                            finalPlaces.push({ lat: tr.destLat, lng: tr.destLng, name: tr.destination });
                            processedPlaceKeys.add(key);
                        }
                    } else if (tr.destination) {
                        placesToCheckForCoords.add(tr.destination);
                    }
                });

                // 3. Locations (Route Manager)
                t.locations?.forEach(l => {
                    placesToCheckForCountry.add(l.name);
                    if (l.coordinates) {
                        const key = `${l.coordinates.lat.toFixed(4)},${l.coordinates.lng.toFixed(4)}`;
                        if (!processedPlaceKeys.has(key)) {
                            finalPlaces.push({ lat: l.coordinates.lat, lng: l.coordinates.lng, name: l.name });
                            processedPlaceKeys.add(key);
                        }
                    } else {
                        placesToCheckForCoords.add(l.name);
                    }
                });

                // 4. Accommodations
                t.accommodations?.forEach(a => {
                    // Usually we have full address, might be noisy for map country check but resolvePlaceName handles it
                    placesToCheckForCountry.add(a.address);
                    // For coords, full address is good
                    placesToCheckForCoords.add(a.address);
                });
            });

            // Resolve Countries
            for (const place of Array.from(placesToCheckForCountry)) {
                let code = '';
                if (placeDetailsCache.has(place)) {
                    code = placeDetailsCache.get(place).countryCode;
                } else {
                    const res = await resolvePlaceName(place);
                    if (res && res.countryCode) code = res.countryCode;
                }
                if (code && code.length === 2) countryCodes.add(code.toUpperCase());
            }

            // Resolve Coords for missing items
            for (const place of Array.from(placesToCheckForCoords)) {
                let coords = coordinateCache.get(place);
                
                if (!coords) {
                    // Try to fetch
                    const res = await getCoordinates(place);
                    if (res) {
                        coords = { lat: res.lat, lng: res.lng };
                        coordinateCache.set(place, coords);
                        coordsDirty = true;
                        // Throttle
                        await new Promise(r => setTimeout(r, 100));
                    }
                }

                if (coords) {
                    const key = `${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}`;
                    if (!processedPlaceKeys.has(key)) {
                        finalPlaces.push({ lat: coords.lat, lng: coords.lng, name: place });
                        processedPlaceKeys.add(key);
                    }
                }
            }

            if (coordsDirty) saveCoordCache(coordinateCache);

            setVisitedCountryCodes(Array.from(countryCodes));
            setVisitedPlaces(finalPlaces);
        };

        if (trips.length > 0) processGeoData();
    }, [trips]);

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
                        
                        {/* View Mode Toggle */}
                        <div className="flex p-1 bg-gray-100 dark:bg-black/30 rounded-2xl border border-gray-200 dark:border-white/5 w-full md:w-auto">
                            <button 
                                onClick={() => setViewMode('network')}
                                className={`flex-1 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                                    viewMode === 'network' 
                                    ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-white shadow-sm' 
                                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                                }`}
                            >
                                <span className="material-icons-outlined text-sm">hub</span> Flight Network
                            </button>
                            <button 
                                onClick={() => setViewMode('scratch')}
                                className={`flex-1 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                                    viewMode === 'scratch' 
                                    ? 'bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 shadow-sm' 
                                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                                }`}
                            >
                                <span className="material-icons-outlined text-sm">flag</span> Scratch Map
                            </button>
                        </div>

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

                        {viewMode === 'network' && (
                            <div className="flex gap-2 w-full md:w-auto">
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
                                    <>
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
                                        <button 
                                            onClick={() => setShowCountries(!showCountries)}
                                            className={`flex items-center justify-center gap-2 px-3 py-2 rounded-2xl border transition-all ${
                                                showCountries
                                                ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900/50 text-amber-700 dark:text-amber-400' 
                                                : 'bg-transparent border-gray-200 dark:border-white/10 text-gray-400'
                                            }`}
                                            title="Highlight Visited Countries"
                                        >
                                            <span className="material-icons-outlined text-lg">public_off</span>
                                        </button>
                                    </>
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
                <div className="w-full h-full rounded-[2.5rem] overflow-hidden border border-gray-200 dark:border-white/5 shadow-2xl relative bg-black">
                    {mapType === '2D' ? (
                        <ExpeditionMap 
                            key={`2d-${isDark ? 'dark' : 'light'}`}
                            trips={filteredTrips} 
                            onTripClick={onTripClick} 
                            showFrequencyWeight={showFrequencyWeight}
                            animateRoutes={animateRoutes}
                            visitedCountries={visitedCountryCodes}
                            showCountries={showCountries}
                            viewMode={viewMode}
                            visitedPlaces={visitedPlaces}
                        />
                    ) : (
                        <ExpeditionMap3D
                            key={`3d-${isDark ? 'dark' : 'light'}`}
                            trips={filteredTrips}
                            onTripClick={onTripClick}
                            animateRoutes={animateRoutes}
                        />
                    )}
                    
                    {/* Floating 2D/3D Toggle in Bottom Corner */}
                    <div className="absolute bottom-6 left-6 z-[5000]">
                        <div className="flex p-1 bg-white/90 dark:bg-black/80 backdrop-blur rounded-2xl border border-gray-200 dark:border-white/10 shadow-lg">
                            <button 
                                onClick={() => setMapType('2D')}
                                className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all ${mapType === '2D' ? 'bg-blue-600 text-white shadow' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white'}`}
                            >
                                2D Map
                            </button>
                            <button 
                                onClick={() => setMapType('3D')}
                                className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all ${mapType === '3D' ? 'bg-purple-600 text-white shadow' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white'}`}
                            >
                                3D Globe
                            </button>
                        </div>
                    </div>

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
