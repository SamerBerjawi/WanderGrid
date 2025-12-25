
import React, { useEffect, useState, useMemo } from 'react';
import { ExpeditionMap3D } from '../components/ExpeditionMap3D';
import { dataService } from '../services/mockDb';
import { Trip } from '../types';
import { resolvePlaceName, calculateDistance } from '../services/geocoding';

interface GamificationProps {
    onTripClick?: (tripId: string) => void;
}

interface VisitedCountry {
    code: string; // ISO Code
    name: string;
    cities: Set<string>;
    flag: string; // Emoji
    tripCount: number;
    lastVisit: Date;
}

const LEVEL_THRESHOLDS = [
    { level: 1, name: 'Backyard Explorer', countries: 0 },
    { level: 5, name: 'Wanderer', countries: 2 },
    { level: 10, name: 'Voyager', countries: 5 },
    { level: 20, name: 'Globetrotter', countries: 10 },
    { level: 30, name: 'Nomad', countries: 20 },
    { level: 50, name: 'Citizen of the World', countries: 30 },
];

const getFlagEmoji = (countryCode: string) => {
  if (!countryCode || countryCode.length !== 2) return '🏳️';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char =>  127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

export const Gamification: React.FC<GamificationProps> = ({ onTripClick }) => {
    const [trips, setTrips] = useState<Trip[]>([]);
    const [pastTrips, setPastTrips] = useState<Trip[]>([]);
    const [visitedData, setVisitedData] = useState<VisitedCountry[]>([]);
    const [totalCities, setTotalCities] = useState(0);
    const [totalDistance, setTotalDistance] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            const allTrips = await dataService.getTrips();
            setTrips(allTrips);
            
            // Filter only past/active trips for stats
            const validTrips = allTrips.filter(t => t.status !== 'Planning' && t.status !== 'Cancelled');
            setPastTrips(validTrips);

            await processTravelHistory(validTrips);
            setLoading(false);
        };
        load();
    }, []);

    const processTravelHistory = async (tripList: Trip[]) => {
        const countryMap = new Map<string, VisitedCountry>();
        let kmCount = 0;
        const placeCache = new Map<string, any>(); 

        for (const trip of tripList) {
            // 1. Calculate Distance
            if (trip.transports) {
                for (const t of trip.transports) {
                    if (t.distance) {
                        kmCount += t.distance;
                    } else if (t.originLat && t.originLng && t.destLat && t.destLng) {
                        kmCount += calculateDistance(t.originLat, t.originLng, t.destLat, t.destLng);
                    }
                }
            }

            // 2. Extract Locations
            const placesToResolve = new Set<string>();
            
            // Trip Location (The intended main destination) - Only add if not generic
            if (trip.location && !['Time Off', 'Remote', 'Trip', 'Vacation'].includes(trip.location)) {
                placesToResolve.add(trip.location);
            }
            
            // Accommodations (Places where user stayed are definitely visited)
            if (trip.accommodations) {
                trip.accommodations.forEach(a => placesToResolve.add(a.address));
            }

            // Transports: Smart filtering for layovers and returns
            if (trip.transports && trip.transports.length > 0) {
                // Sort chronologically
                const sortedTransports = [...trip.transports].sort((a, b) => {
                    const da = new Date(`${a.departureDate}T${a.departureTime || '00:00'}`).getTime();
                    const db = new Date(`${b.departureDate}T${b.departureTime || '00:00'}`).getTime();
                    return da - db;
                });

                // Identify Trip Origin (Home Base) to filter out return legs
                const tripOrigin = sortedTransports[0].origin.trim().toLowerCase();

                for (let i = 0; i < sortedTransports.length; i++) {
                    const current = sortedTransports[i];
                    const next = sortedTransports[i+1];
                    const dest = current.destination;
                    const destNorm = dest.trim().toLowerCase();

                    // Rule 1: Skip if returning to trip origin (Home)
                    // This prevents "Home Country" from appearing as a visited destination for every trip
                    if (destNorm === tripOrigin) continue;

                    // Rule 2: Layover Logic
                    if (next) {
                        const nextOriginNorm = next.origin.trim().toLowerCase();
                        
                        // Check if connecting from same place (e.g. LHR -> LHR or London -> London)
                        // If strict string match fails, we might miss some (LHR vs LGW), but geocoding every point here is too slow.
                        // Assuming data consistency for now.
                        const locationMatch = destNorm === nextOriginNorm;

                        if (locationMatch) {
                            // Calculate stopover duration
                            const arrT = new Date(`${current.arrivalDate}T${current.arrivalTime || '00:00'}`).getTime();
                            const depT = new Date(`${next.departureDate}T${next.departureTime || '00:00'}`).getTime();
                            
                            let isLayover = false;
                            
                            if (!isNaN(arrT) && !isNaN(depT)) {
                                const diffHours = (depT - arrT) / (3600000); // ms to hours
                                // If < 24h, it's a layover. 
                                if (diffHours < 24) isLayover = true;
                            } else {
                                // Fallback: If dates are invalid but it's a sequence in the same location, assume layover
                                isLayover = true; 
                            }

                            if (isLayover) continue; // Skip adding this destination
                        }
                    }
                    
                    // If we passed checks, it's a visit
                    placesToResolve.add(dest);
                }
            }

            // Resolve Places
            for (const place of placesToResolve) {
                let resolved;
                
                if (placeCache.has(place)) {
                    resolved = placeCache.get(place);
                } else {
                    resolved = await resolvePlaceName(place);
                    
                    // Throttle for Nominatim if needed
                    if (!placeCache.has(place) && place.length > 3) {
                        await new Promise(r => setTimeout(r, 100));
                    }
                    placeCache.set(place, resolved);
                }

                if (resolved && resolved.country && resolved.country !== 'Unknown') {
                    // Normalize Key: Use ISO code if available, else Name
                    const countryKey = resolved.countryCode || resolved.country;
                    
                    if (!countryMap.has(countryKey)) {
                        countryMap.set(countryKey, {
                            code: resolved.countryCode || 'XX', 
                            name: resolved.country,
                            cities: new Set(),
                            flag: resolved.countryCode ? getFlagEmoji(resolved.countryCode) : '🏳️',
                            tripCount: 0,
                            lastVisit: new Date(trip.endDate)
                        });
                    }

                    const entry = countryMap.get(countryKey)!;
                    entry.cities.add(resolved.city);
                    
                    // Update last visit if this trip is more recent
                    const tripEnd = new Date(trip.endDate);
                    if (tripEnd > entry.lastVisit) entry.lastVisit = tripEnd;
                }
            }
        }

        // Finalize Data
        const finalized: VisitedCountry[] = [];
        let totalC = 0;
        
        countryMap.forEach((val) => {
            totalC += val.cities.size;
            finalized.push(val);
        });

        setTotalCities(totalC);
        setTotalDistance(Math.round(kmCount));
        setVisitedData(finalized.sort((a, b) => a.name.localeCompare(b.name)));
    };

    const currentLevel = useMemo(() => {
        const count = visitedData.length;
        // Find highest level met
        const lvl = [...LEVEL_THRESHOLDS].reverse().find(t => count >= t.countries);
        return lvl || LEVEL_THRESHOLDS[0];
    }, [visitedData]);

    const nextLevel = useMemo(() => {
        const idx = LEVEL_THRESHOLDS.findIndex(t => t.name === currentLevel.name);
        return LEVEL_THRESHOLDS[idx + 1];
    }, [currentLevel]);

    const progressToNext = useMemo(() => {
        if (!nextLevel) return 100;
        const currentCount = visitedData.length;
        const prevThreshold = currentLevel.countries;
        const nextThreshold = nextLevel.countries;
        return Math.min(100, Math.max(0, ((currentCount - prevThreshold) / (nextThreshold - prevThreshold)) * 100));
    }, [currentLevel, nextLevel, visitedData]);

    if (loading) return <div className="p-8 text-gray-400 animate-pulse">Consulting the Archives...</div>;

    return (
        <div className="space-y-8 animate-fade-in max-w-[1600px] mx-auto pb-12">
            
            {/* HERO: 3D MAP & LEVEL */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 h-[500px]">
                {/* 3D Map Container */}
                <div className="xl:col-span-2 relative rounded-[2.5rem] overflow-hidden border border-gray-100 dark:border-white/5 shadow-2xl group">
                    <ExpeditionMap3D trips={pastTrips} animateRoutes={true} />
                    <div className="absolute top-6 left-6 z-10 bg-black/40 backdrop-blur-md p-4 rounded-2xl border border-white/10 text-white">
                        <h2 className="text-2xl font-black tracking-tight">World Exploration</h2>
                        <p className="text-xs font-bold text-gray-300 uppercase tracking-widest mt-1">
                            {visitedData.length} Countries • {totalCities} Cities
                        </p>
                    </div>
                </div>

                {/* Level Card */}
                <div className="xl:col-span-1 bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border border-gray-100 dark:border-white/5 shadow-xl flex flex-col justify-between relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-[80px] pointer-events-none -translate-y-1/2 translate-x-1/2" />
                    
                    <div>
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Traveler Rank</h3>
                        <h1 className="text-4xl lg:text-5xl font-black text-gray-900 dark:text-white mt-2 mb-1 tracking-tight leading-none">
                            {currentLevel.name}
                        </h1>
                        <div className="flex items-center gap-2 mt-2">
                            <div className="px-3 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-black uppercase tracking-wider border border-amber-200 dark:border-amber-900/50">
                                Level {currentLevel.level}
                            </div>
                            {nextLevel && (
                                <span className="text-xs text-gray-400 font-medium">
                                    {nextLevel.countries - visitedData.length} countries to {nextLevel.name}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="space-y-6 relative z-10">
                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5">
                                <div className="text-blue-500 mb-1"><span className="material-icons-outlined text-2xl">public</span></div>
                                <div className="text-2xl font-black text-gray-900 dark:text-white">{visitedData.length}</div>
                                <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Countries</div>
                            </div>
                            <div className="p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5">
                                <div className="text-purple-500 mb-1"><span className="material-icons-outlined text-2xl">flight_takeoff</span></div>
                                <div className="text-2xl font-black text-gray-900 dark:text-white">{Math.round(totalDistance).toLocaleString()}</div>
                                <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Km Traveled</div>
                            </div>
                        </div>

                        {/* Progress Bar */}
                        {nextLevel && (
                            <div>
                                <div className="flex justify-between items-end mb-2">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Progress</span>
                                    <span className="text-xs font-bold text-amber-500">{Math.round(progressToNext)}%</span>
                                </div>
                                <div className="h-3 w-full bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-1000 ease-out rounded-full relative"
                                        style={{ width: `${progressToNext}%` }}
                                    >
                                        <div className="absolute right-0 top-0 bottom-0 w-full bg-white/20 animate-pulse" />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* PASSPORT STAMPS GRID */}
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/30">
                        <span className="material-icons-outlined text-2xl">stars</span>
                    </div>
                    <div>
                        <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Passport Stamps</h2>
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Collection of visited territories.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {visitedData.map((country) => (
                        <div key={country.name} className="group relative bg-white dark:bg-gray-800 rounded-3xl p-6 border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-xl transition-all hover:-translate-y-1 overflow-hidden">
                            {/* Decorative Stamp Effect */}
                            <div className="absolute -right-6 -top-6 w-24 h-24 border-4 border-dashed border-gray-200 dark:border-white/5 rounded-full opacity-50 pointer-events-none group-hover:scale-110 transition-transform" />
                            <div className="absolute -right-6 -top-6 w-24 h-24 flex items-center justify-center pointer-events-none opacity-10 rotate-12">
                                <span className="material-icons-outlined text-6xl text-gray-900 dark:text-white">verified</span>
                            </div>

                            <div className="relative z-10">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="text-4xl filter drop-shadow-md">{country.flag}</div>
                                    <div className="bg-gray-50 dark:bg-white/5 px-2 py-1 rounded-lg border border-gray-100 dark:border-white/5">
                                        <span className="text-[10px] font-mono font-bold text-gray-400">{country.code}</span>
                                    </div>
                                </div>
                                
                                <h3 className="text-xl font-black text-gray-900 dark:text-white mb-1 leading-tight">{country.name}</h3>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
                                    Last visited {country.lastVisit.getFullYear()}
                                </p>

                                <div className="space-y-2">
                                    <div className="h-px w-full bg-gray-100 dark:bg-white/5" />
                                    <div className="flex flex-wrap gap-1.5">
                                        {Array.from(country.cities).slice(0, 5).map(city => (
                                            <span key={city} className="px-2 py-1 rounded-md bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold uppercase tracking-wider border border-indigo-100 dark:border-indigo-900/30">
                                                {city}
                                            </span>
                                        ))}
                                        {country.cities.size > 5 && (
                                            <span className="px-2 py-1 rounded-md bg-gray-50 dark:bg-white/5 text-gray-500 dark:text-gray-400 text-[10px] font-bold">
                                                +{country.cities.size - 5}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                    
                    {/* Empty State / Future Slot */}
                    <div className="rounded-3xl p-6 border-2 border-dashed border-gray-200 dark:border-white/10 flex flex-col items-center justify-center text-center opacity-50 min-h-[200px]">
                        <span className="material-icons-outlined text-4xl text-gray-300 mb-2">add_location_alt</span>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Next Adventure</p>
                        <p className="text-[10px] text-gray-300 mt-1">Book a trip to earn a new stamp</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
