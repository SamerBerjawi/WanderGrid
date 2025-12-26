
import React, { useEffect, useState, useMemo } from 'react';
import { ExpeditionMap3D } from '../components/ExpeditionMap3D';
import { dataService } from '../services/mockDb';
import { Trip } from '../types';
import { resolvePlaceName, calculateDistance } from '../services/geocoding';
import { Tabs } from '../components/ui';

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
    region: string; // New field
}

const LEVEL_THRESHOLDS = [
    { level: 1, name: 'Backyard Explorer', countries: 0 },
    { level: 5, name: 'Wanderer', countries: 2 },
    { level: 10, name: 'Voyager', countries: 5 },
    { level: 20, name: 'Globetrotter', countries: 10 },
    { level: 30, name: 'Nomad', countries: 20 },
    { level: 50, name: 'Citizen of the World', countries: 30 },
];

// --- Regional Styling Configuration ---
const REGION_STYLES: Record<string, { bg: string, border: string, text: string, icon: string, accent: string, badge: string }> = {
    // Americas
    'North America': {
        bg: 'bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/20',
        border: 'border-blue-100 dark:border-blue-500/30',
        text: 'text-blue-900 dark:text-blue-100',
        icon: 'text-blue-500 dark:text-blue-400',
        accent: 'bg-blue-100 dark:bg-blue-500/20',
        badge: 'bg-white/60 dark:bg-black/20 text-blue-700 dark:text-blue-300'
    },
    'Central America': {
        bg: 'bg-gradient-to-br from-teal-50 to-cyan-100 dark:from-teal-900/30 dark:to-cyan-900/20',
        border: 'border-teal-100 dark:border-teal-500/30',
        text: 'text-teal-900 dark:text-teal-100',
        icon: 'text-teal-500 dark:text-teal-400',
        accent: 'bg-teal-100 dark:bg-teal-500/20',
        badge: 'bg-white/60 dark:bg-black/20 text-teal-700 dark:text-teal-300'
    },
    'South America': {
        bg: 'bg-gradient-to-br from-emerald-50 to-green-100 dark:from-emerald-900/30 dark:to-green-900/20',
        border: 'border-emerald-100 dark:border-emerald-500/30',
        text: 'text-emerald-900 dark:text-emerald-100',
        icon: 'text-emerald-500 dark:text-emerald-400',
        accent: 'bg-emerald-100 dark:bg-emerald-500/20',
        badge: 'bg-white/60 dark:bg-black/20 text-emerald-700 dark:text-emerald-300'
    },

    // Europe
    'Northern Europe': {
        bg: 'bg-gradient-to-br from-sky-50 to-slate-100 dark:from-sky-900/30 dark:to-slate-800',
        border: 'border-sky-100 dark:border-sky-500/30',
        text: 'text-slate-900 dark:text-white',
        icon: 'text-sky-500 dark:text-sky-400',
        accent: 'bg-sky-100 dark:bg-sky-500/20',
        badge: 'bg-white/60 dark:bg-black/20 text-sky-700 dark:text-sky-300'
    },
    'Western Europe': {
        bg: 'bg-gradient-to-br from-indigo-50 to-violet-100 dark:from-indigo-900/30 dark:to-violet-900/20',
        border: 'border-indigo-100 dark:border-indigo-500/30',
        text: 'text-indigo-900 dark:text-indigo-100',
        icon: 'text-indigo-500 dark:text-indigo-400',
        accent: 'bg-indigo-100 dark:bg-indigo-500/20',
        badge: 'bg-white/60 dark:bg-black/20 text-indigo-700 dark:text-indigo-300'
    },
    'Southern Europe': {
        bg: 'bg-gradient-to-br from-orange-50 to-amber-100 dark:from-orange-900/30 dark:to-amber-900/20',
        border: 'border-orange-100 dark:border-orange-500/30',
        text: 'text-orange-900 dark:text-orange-100',
        icon: 'text-orange-500 dark:text-orange-400',
        accent: 'bg-orange-100 dark:bg-orange-500/20',
        badge: 'bg-white/60 dark:bg-black/20 text-orange-700 dark:text-orange-300'
    },
    'Eastern Europe': {
        bg: 'bg-gradient-to-br from-rose-50 to-pink-100 dark:from-rose-900/30 dark:to-pink-900/20',
        border: 'border-rose-100 dark:border-rose-500/30',
        text: 'text-rose-900 dark:text-rose-100',
        icon: 'text-rose-500 dark:text-rose-400',
        accent: 'bg-rose-100 dark:bg-rose-500/20',
        badge: 'bg-white/60 dark:bg-black/20 text-rose-700 dark:text-rose-300'
    },

    // Africa
    'North Africa': {
        bg: 'bg-gradient-to-br from-stone-50 to-orange-100 dark:from-stone-800 dark:to-orange-900/20',
        border: 'border-stone-200 dark:border-orange-500/30',
        text: 'text-stone-900 dark:text-stone-100',
        icon: 'text-orange-600 dark:text-orange-400',
        accent: 'bg-orange-100 dark:bg-orange-500/20',
        badge: 'bg-white/60 dark:bg-black/20 text-stone-700 dark:text-stone-300'
    },
    'Sub-Saharan Africa': {
        bg: 'bg-gradient-to-br from-yellow-50 to-lime-100 dark:from-yellow-900/30 dark:to-lime-900/20',
        border: 'border-yellow-100 dark:border-yellow-500/30',
        text: 'text-yellow-900 dark:text-yellow-100',
        icon: 'text-yellow-600 dark:text-yellow-400',
        accent: 'bg-yellow-100 dark:bg-yellow-500/20',
        badge: 'bg-white/60 dark:bg-black/20 text-yellow-800 dark:text-yellow-300'
    },

    // Asia
    'East Asia': {
        bg: 'bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-900/20',
        border: 'border-red-100 dark:border-red-500/30',
        text: 'text-red-900 dark:text-red-100',
        icon: 'text-red-500 dark:text-red-400',
        accent: 'bg-red-100 dark:bg-red-500/20',
        badge: 'bg-white/60 dark:bg-black/20 text-red-700 dark:text-red-300'
    },
    'Southeast Asia': {
        bg: 'bg-gradient-to-br from-lime-50 to-emerald-100 dark:from-lime-900/30 dark:to-emerald-900/20',
        border: 'border-emerald-100 dark:border-emerald-500/30',
        text: 'text-emerald-900 dark:text-emerald-100',
        icon: 'text-emerald-500 dark:text-emerald-400',
        accent: 'bg-emerald-100 dark:bg-emerald-500/20',
        badge: 'bg-white/60 dark:bg-black/20 text-emerald-700 dark:text-emerald-300'
    },
    'South & West Asia': {
        bg: 'bg-gradient-to-br from-amber-50 to-yellow-100 dark:from-amber-900/30 dark:to-yellow-900/20',
        border: 'border-amber-100 dark:border-amber-500/30',
        text: 'text-amber-900 dark:text-amber-100',
        icon: 'text-amber-600 dark:text-amber-400',
        accent: 'bg-amber-100 dark:bg-amber-500/20',
        badge: 'bg-white/60 dark:bg-black/20 text-amber-700 dark:text-amber-300'
    },

    // Oceania
    'Oceania': {
        bg: 'bg-gradient-to-br from-cyan-50 to-sky-100 dark:from-cyan-900/30 dark:to-sky-900/20',
        border: 'border-cyan-100 dark:border-cyan-500/30',
        text: 'text-cyan-900 dark:text-cyan-100',
        icon: 'text-cyan-500 dark:text-cyan-400',
        accent: 'bg-cyan-100 dark:bg-cyan-500/20',
        badge: 'bg-white/60 dark:bg-black/20 text-cyan-700 dark:text-cyan-300'
    },
    
    // Fallback
    'Unknown': {
        bg: 'bg-gradient-to-br from-gray-50 to-slate-100 dark:from-gray-800 dark:to-slate-800',
        border: 'border-gray-200 dark:border-white/5',
        text: 'text-gray-900 dark:text-white',
        icon: 'text-gray-400',
        accent: 'bg-gray-100 dark:bg-white/10',
        badge: 'bg-white dark:bg-white/5 text-gray-500 dark:text-gray-400'
    }
};

const COUNTRY_REGION_MAP: Record<string, string> = {
    // North America
    'US': 'North America', 'CA': 'North America', 'MX': 'North America', // Mexico often grouped North or Central

    // Central America & Caribbean
    'CR': 'Central America', 'CU': 'Central America', 'JM': 'Central America', 
    'BS': 'Central America', 'DO': 'Central America', 'PA': 'Central America',
    'GT': 'Central America', 'BZ': 'Central America', 'HN': 'Central America',

    // South America
    'BR': 'South America', 'AR': 'South America', 'CL': 'South America', 
    'CO': 'South America', 'PE': 'South America', 'EC': 'South America',
    'UY': 'South America', 'PY': 'South America', 'BO': 'South America',

    // Northern Europe
    'NO': 'Northern Europe', 'SE': 'Northern Europe', 'DK': 'Northern Europe', 
    'FI': 'Northern Europe', 'IS': 'Northern Europe', 'EE': 'Northern Europe',
    'LV': 'Northern Europe', 'LT': 'Northern Europe',

    // Western Europe
    'GB': 'Western Europe', 'UK': 'Western Europe', 'FR': 'Western Europe', 
    'DE': 'Western Europe', 'BE': 'Western Europe', 'NL': 'Western Europe', 
    'CH': 'Western Europe', 'AT': 'Western Europe', 'IE': 'Western Europe',
    'LU': 'Western Europe',

    // Southern Europe
    'IT': 'Southern Europe', 'ES': 'Southern Europe', 'PT': 'Southern Europe', 
    'GR': 'Southern Europe', 'HR': 'Southern Europe', 'SI': 'Southern Europe',
    'MT': 'Southern Europe', 'CY': 'Southern Europe',

    // Eastern Europe
    'PL': 'Eastern Europe', 'CZ': 'Eastern Europe', 'HU': 'Eastern Europe', 
    'RU': 'Eastern Europe', 'RO': 'Eastern Europe', 'BG': 'Eastern Europe',
    'SK': 'Eastern Europe', 'UA': 'Eastern Europe', 'RS': 'Eastern Europe',

    // East Asia
    'JP': 'East Asia', 'CN': 'East Asia', 'KR': 'East Asia', 'TW': 'East Asia', 
    'HK': 'East Asia', 'MO': 'East Asia',

    // Southeast Asia
    'TH': 'Southeast Asia', 'VN': 'Southeast Asia', 'ID': 'Southeast Asia', 
    'MY': 'Southeast Asia', 'SG': 'Southeast Asia', 'PH': 'Southeast Asia',
    'KH': 'Southeast Asia', 'LA': 'Southeast Asia', 'MM': 'Southeast Asia',

    // South & West Asia (Middle East + India)
    'IN': 'South & West Asia', 'MV': 'South & West Asia', 'LK': 'South & West Asia',
    'NP': 'South & West Asia', 'AE': 'South & West Asia', 'SA': 'South & West Asia', 
    'IL': 'South & West Asia', 'QA': 'South & West Asia', 'TR': 'South & West Asia',
    'JO': 'South & West Asia', 'LB': 'South & West Asia',

    // North Africa
    'EG': 'North Africa', 'MA': 'North Africa', 'TN': 'North Africa', 'DZ': 'North Africa',

    // Sub-Saharan Africa
    'ZA': 'Sub-Saharan Africa', 'KE': 'Sub-Saharan Africa', 'TZ': 'Sub-Saharan Africa', 
    'GH': 'Sub-Saharan Africa', 'NG': 'Sub-Saharan Africa', 'MU': 'Sub-Saharan Africa', 
    'SC': 'Sub-Saharan Africa', 'ZW': 'Sub-Saharan Africa', 'NA': 'Sub-Saharan Africa',

    // Oceania
    'AU': 'Oceania', 'NZ': 'Oceania', 'FJ': 'Oceania', 'PF': 'Oceania', 'PG': 'Oceania'
};

const getRegion = (code: string) => COUNTRY_REGION_MAP[code] || 'Unknown';

const getFlagEmoji = (countryCode: string) => {
  if (!countryCode || countryCode.length !== 2) return '🏳️';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char =>  127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

// --- Statistics Components ---
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

// --- Caching ---
const CACHE_KEY = 'wandergrid_geo_cache_v2';
let memoryCache: Map<string, any> | null = null;

const getPersistentCache = (): Map<string, any> => {
    if (memoryCache) return memoryCache;
    try {
        const stored = localStorage.getItem(CACHE_KEY);
        if (stored) {
            memoryCache = new Map(JSON.parse(stored));
        } else {
            memoryCache = new Map();
        }
    } catch (e) {
        memoryCache = new Map();
    }
    return memoryCache!;
};

const savePersistentCache = (cache: Map<string, any>) => {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(Array.from(cache.entries())));
    } catch (e) {
        console.warn("Failed to save geo cache", e);
    }
};

export const Gamification: React.FC<GamificationProps> = ({ onTripClick }) => {
    const [trips, setTrips] = useState<Trip[]>([]);
    const [pastTrips, setPastTrips] = useState<Trip[]>([]);
    const [visitedData, setVisitedData] = useState<VisitedCountry[]>([]);
    const [totalCities, setTotalCities] = useState(0);
    const [totalDistance, setTotalDistance] = useState(0);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('stamps');

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
        
        // Load persistent cache
        const placeCache = getPersistentCache();
        let cacheDirty = false;

        // 1. Collect all unique locations first
        const placesToResolve = new Set<string>();

        for (const trip of tripList) {
            // Distance Calculation (No API needed)
            if (trip.transports) {
                for (const t of trip.transports) {
                    if (t.distance) {
                        kmCount += t.distance;
                    } else if (t.originLat && t.originLng && t.destLat && t.destLng) {
                        kmCount += calculateDistance(t.originLat, t.originLng, t.destLat, t.destLng);
                    }
                }
            }

            // Extract Places
            if (trip.location && !['Time Off', 'Remote', 'Trip', 'Vacation'].includes(trip.location)) {
                placesToResolve.add(trip.location);
            }
            if (trip.accommodations) {
                trip.accommodations.forEach(a => placesToResolve.add(a.address));
            }
            if (trip.transports && trip.transports.length > 0) {
                const sortedTransports = [...trip.transports].sort((a, b) => {
                    const da = new Date(`${a.departureDate}T${a.departureTime || '00:00'}`).getTime();
                    const db = new Date(`${b.departureDate}T${b.departureTime || '00:00'}`).getTime();
                    return da - db;
                });
                const tripOrigin = sortedTransports[0].origin.trim().toLowerCase();
                for (let i = 0; i < sortedTransports.length; i++) {
                    const current = sortedTransports[i];
                    const next = sortedTransports[i+1];
                    const dest = current.destination;
                    const destNorm = dest.trim().toLowerCase();
                    if (destNorm === tripOrigin) continue;
                    if (next) {
                        const nextOriginNorm = next.origin.trim().toLowerCase();
                        if (destNorm === nextOriginNorm) {
                            const arrT = new Date(`${current.arrivalDate}T${current.arrivalTime || '00:00'}`).getTime();
                            const depT = new Date(`${next.departureDate}T${next.departureTime || '00:00'}`).getTime();
                            if (!isNaN(arrT) && !isNaN(depT)) {
                                if ((depT - arrT) / 3600000 < 24) continue;
                            } else {
                                continue;
                            }
                        }
                    }
                    placesToResolve.add(dest);
                }
            }
        }

        // 2. Resolve Places (Optimized Loop)
        const uniquePlaces = Array.from(placesToResolve);
        
        for (const place of uniquePlaces) {
            if (!placeCache.has(place)) {
                // If checking API, throttle slightly unless it looks like an IATA code (fast local lookup)
                const isLikelyIata = place.length === 3 && /^[A-Za-z]{3}$/.test(place);
                
                const resolved = await resolvePlaceName(place);
                if (resolved) {
                    placeCache.set(place, resolved);
                    cacheDirty = true;
                }

                // Throttle only if it was likely an API call (non-IATA)
                if (!isLikelyIata && resolved) {
                    await new Promise(r => setTimeout(r, 50)); 
                }
            }
        }

        if (cacheDirty) {
            savePersistentCache(placeCache);
        }

        // 3. Map Data using Cache
        for (const trip of tripList) {
            const tripPlaces = new Set<string>();
            // Re-extract relevant places for THIS trip to map them correctly
            if (trip.location && !['Time Off', 'Remote', 'Trip', 'Vacation'].includes(trip.location)) tripPlaces.add(trip.location);
            trip.accommodations?.forEach(a => tripPlaces.add(a.address));
            
            // Simplified transport logic for mapping (we already have cache populated)
            if (trip.transports) {
                 trip.transports.forEach(t => {
                     // Simple heuristic: Destination is a place visited if not skipped by detailed logic earlier
                     // For mapping stats, checking all destinations is usually acceptable approx
                     if (placesToResolve.has(t.destination)) tripPlaces.add(t.destination);
                 });
            }

            for (const place of tripPlaces) {
                const resolved = placeCache.get(place);
                if (resolved && resolved.country && resolved.country !== 'Unknown') {
                    const countryKey = resolved.countryCode || resolved.country;
                    
                    if (!countryMap.has(countryKey)) {
                        countryMap.set(countryKey, {
                            code: resolved.countryCode || 'XX', 
                            name: resolved.country,
                            cities: new Set(),
                            flag: resolved.countryCode ? getFlagEmoji(resolved.countryCode) : '🏳️',
                            tripCount: 0,
                            lastVisit: new Date(trip.endDate),
                            region: getRegion(resolved.countryCode || 'XX')
                        });
                    }

                    const entry = countryMap.get(countryKey)!;
                    entry.cities.add(resolved.city);
                    
                    const tripEnd = new Date(trip.endDate);
                    if (tripEnd > entry.lastVisit) entry.lastVisit = tripEnd;
                }
            }
        }

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

    // Calculate Detailed Flight Stats
    const stats = useMemo(() => {
        // Use all trips (including upcoming) for the Flight Log to show full picture? 
        // Or just past trips? Let's use all 'valid' trips (Past + Upcoming) for the analytics tab to be more useful.
        const activeTrips = trips.filter(t => t.status !== 'Planning' && t.status !== 'Cancelled');
        
        let totalFlights = 0;
        let totalDist = 0;
        let totalDurationMinutes = 0;
        
        const airports = new Map<string, number>();
        const airlines = new Map<string, number>();
        const aircraft = new Map<string, number>();
        const routes = new Map<string, number>();

        activeTrips.forEach(t => {
            if (t.transports) {
                t.transports.forEach(tr => {
                    if (tr.mode === 'Flight') {
                        totalFlights++;
                        
                        let dist = tr.distance || 0;
                        if (!dist && tr.originLat && tr.originLng && tr.destLat && tr.destLng) {
                            dist = calculateDistance(tr.originLat, tr.originLng, tr.destLat, tr.destLng);
                        }
                        totalDist += dist;

                        if (tr.departureDate && tr.departureTime && tr.arrivalDate && tr.arrivalTime) {
                            const start = new Date(`${tr.departureDate}T${tr.departureTime}`);
                            const end = new Date(`${tr.arrivalDate}T${tr.arrivalTime}`);
                            const diff = (end.getTime() - start.getTime()) / 60000;
                            if (diff > 0) totalDurationMinutes += diff;
                        }

                        if (tr.origin) airports.set(tr.origin, (airports.get(tr.origin) || 0) + 1);
                        if (tr.destination) airports.set(tr.destination, (airports.get(tr.destination) || 0) + 1);
                        if (tr.provider) airlines.set(tr.provider, (airlines.get(tr.provider) || 0) + 1);
                        if (tr.vehicleModel) aircraft.set(tr.vehicleModel, (aircraft.get(tr.vehicleModel) || 0) + 1);
                        if (tr.origin && tr.destination) {
                            const key = `${tr.origin} → ${tr.destination}`;
                            routes.set(key, (routes.get(key) || 0) + 1);
                        }
                    }
                });
            }
        });

        const topAirports = Array.from(airports.entries()).sort((a, b) => b[1] - a[1]).map(([code, count]) => ({ label: code, count, code }));
        const topAirlines = Array.from(airlines.entries()).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ label: name, count }));
        const topAircraft = Array.from(aircraft.entries()).sort((a, b) => b[1] - a[1]).map(([model, count]) => ({ label: model, count }));
        const topRoutes = Array.from(routes.entries()).sort((a, b) => b[1] - a[1]).map(([key, count]) => { const [o, d] = key.split(' → '); return { label: key, count, code: `${o}-${d}` }; });

        return {
            totalFlights,
            totalDistance: Math.round(totalDist),
            totalDurationHours: Math.round(totalDurationMinutes / 60),
            topAirports,
            topAirlines,
            topAircraft,
            topRoutes,
            earthCircumnavigations: (totalDist / 40075).toFixed(1),
            daysInAir: (totalDurationMinutes / (60 * 24)).toFixed(1)
        };
    }, [trips]);

    const currentLevel = useMemo(() => {
        const count = visitedData.length;
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

            {/* MAIN CONTENT TABS */}
            <div className="flex flex-col gap-6">
                <Tabs 
                    activeTab={activeTab} 
                    onChange={setActiveTab} 
                    tabs={[
                        { id: 'stamps', label: 'Passport Stamps', icon: <span className="material-icons-outlined">verified</span> },
                        { id: 'analytics', label: 'Flight Log', icon: <span className="material-icons-outlined">data_usage</span> }
                    ]}
                />

                {activeTab === 'stamps' && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {visitedData.map((country) => {
                                const style = REGION_STYLES[country.region] || REGION_STYLES['Unknown'];
                                return (
                                    <div key={country.name} className={`group relative rounded-3xl p-6 border shadow-sm hover:shadow-xl transition-all hover:-translate-y-1 overflow-hidden ${style.bg} ${style.border}`}>
                                        <div className={`absolute -right-6 -top-6 w-24 h-24 border-4 border-dashed rounded-full opacity-50 pointer-events-none group-hover:scale-110 transition-transform ${style.border}`} />
                                        <div className="absolute -right-6 -top-6 w-24 h-24 flex items-center justify-center pointer-events-none opacity-10 rotate-12">
                                            <span className={`material-icons-outlined text-6xl ${style.text}`}>verified</span>
                                        </div>

                                        <div className="relative z-10">
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="text-4xl filter drop-shadow-md">{country.flag}</div>
                                                <div className={`px-2 py-1 rounded-lg border text-[10px] font-mono font-bold ${style.badge} ${style.border}`}>
                                                    {country.code}
                                                </div>
                                            </div>
                                            
                                            <h3 className={`text-xl font-black mb-1 leading-tight ${style.text}`}>{country.name}</h3>
                                            <p className={`text-xs font-bold uppercase tracking-widest mb-4 opacity-60 ${style.text}`}>
                                                {country.region} • {country.lastVisit.getFullYear()}
                                            </p>

                                            <div className="space-y-2">
                                                <div className={`h-px w-full opacity-20 ${style.text} bg-current`} />
                                                <div className="flex flex-wrap gap-1.5">
                                                    {Array.from(country.cities).slice(0, 5).map(city => (
                                                        <span key={city} className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${style.accent} ${style.text} ${style.border} bg-opacity-50`}>
                                                            {city}
                                                        </span>
                                                    ))}
                                                    {country.cities.size > 5 && (
                                                        <span className={`px-2 py-1 rounded-md text-[10px] font-bold ${style.accent} ${style.text}`}>
                                                            +{country.cities.size - 5}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            
                            {/* Empty State / Future Slot */}
                            <div className="rounded-3xl p-6 border-2 border-dashed border-gray-200 dark:border-white/10 flex flex-col items-center justify-center text-center opacity-50 min-h-[200px]">
                                <span className="material-icons-outlined text-4xl text-gray-300 mb-2">add_location_alt</span>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Next Adventure</p>
                                <p className="text-[10px] text-gray-300 mt-1">Book a trip to earn a new stamp</p>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'analytics' && (
                    <div className="space-y-8 animate-fade-in">
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
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
