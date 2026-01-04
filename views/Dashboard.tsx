
import React, { useEffect, useState, useMemo } from 'react';
import { Card, Button, Tabs } from '../components/ui';
import { ExpeditionMap3D } from '../components/ExpeditionMap3D';
import { FlightTrackerModal } from '../components/FlightTrackerModal';
import { TimezoneSlider } from '../components/TimezoneSlider';
import { dataService } from '../services/mockDb';
import { User, Trip, EntitlementType, PublicHoliday } from '../types';
import { resolvePlaceName, calculateDistance } from '../services/geocoding';
import { getRegion, getFlagEmoji } from '../services/geoData';
import { REGION_STYLES } from './regionStyles';

interface DashboardProps {
    onUserClick?: (userId: string) => void;
    onTripClick?: (tripId: string) => void;
}

interface VisitedCountry {
    code: string; 
    name: string;
    cities: Set<string>;
    flag: string;
    tripCount: number;
    lastVisit: Date;
    region: string; 
}

interface ExtremeFlight {
    distance: number;
    origin: string;
    destination: string;
    carrier: string;
    date: string;
}

const LEVEL_THRESHOLDS = [
    { level: 1, name: 'Backyard Explorer', countries: 0 },
    { level: 5, name: 'Wanderer', countries: 2 },
    { level: 10, name: 'Voyager', countries: 5 },
    { level: 20, name: 'Globetrotter', countries: 10 },
    { level: 30, name: 'Nomad', countries: 20 },
    { level: 50, name: 'Citizen of the World', countries: 30 },
];

const DASHBOARD_CACHE_KEY = 'wandergrid_dashboard_cache_v1';
const GEO_CONCURRENCY_LIMIT = 6;

const hashString = (value: string) => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = ((hash << 5) - hash) + value.charCodeAt(i);
        hash |= 0;
    }
    return hash.toString(36);
};

const getTripsVersion = (tripList: Trip[]) => {
    const signature = tripList.map(trip => {
        const transports = trip.transports?.map(t => `${t.origin}-${t.destination}-${t.departureDate}`).join(',') || '';
        const accommodations = trip.accommodations?.map(a => a.address).join(',') || '';
        return [
            trip.id,
            trip.status,
            trip.startDate,
            trip.endDate,
            trip.location,
            transports,
            accommodations
        ].join('|');
    }).join('||');
    return hashString(signature);
};

const serializeVisitedData = (data: VisitedCountry[]) => data.map(entry => ({
    ...entry,
    cities: Array.from(entry.cities),
    lastVisit: entry.lastVisit.toISOString()
}));

const deserializeVisitedData = (data: Array<Omit<VisitedCountry, 'cities' | 'lastVisit'> & { cities: string[]; lastVisit: string }>) =>
    data.map(entry => ({
        ...entry,
        cities: new Set(entry.cities),
        lastVisit: new Date(entry.lastVisit)
    }));

const runAfterFirstPaint = (fn: () => void) => {
    if (typeof window === 'undefined') return;
    if ('requestIdleCallback' in window) {
        (window as Window & { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback(fn);
        return;
    }
    setTimeout(fn, 0);
};

const mapWithConcurrency = async <T, R>(
    items: T[],
    worker: (item: T) => Promise<R>,
    concurrency: number
) => {
    const results: R[] = new Array(items.length);
    let index = 0;
    const runner = async () => {
        while (index < items.length) {
            const current = index;
            index += 1;
            results[current] = await worker(items[current]);
        }
    };
    const runners = Array.from({ length: Math.min(concurrency, items.length) }, runner);
    await Promise.all(runners);
    return results;
};

const StatCard: React.FC<{ title: string; value: string | number; subtitle?: string; icon: string; color?: string }> = ({ title, value, subtitle, icon, color = 'blue' }) => (
    <div className={`p-6 rounded-[2rem] bg-white dark:bg-gray-800 border border-gray-100 dark:border-white/5 shadow-sm flex items-center gap-5 relative overflow-hidden group hover:shadow-lg transition-all`}>
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

const ExtremeFlightCard: React.FC<{ type: 'Longest' | 'Shortest'; flight: ExtremeFlight | null; color: string }> = ({ type, flight, color }) => {
    if (!flight) return null;
    return (
        <div className={`p-6 rounded-[2rem] bg-white dark:bg-gray-800 border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-lg transition-all relative overflow-hidden group`}>
            <div className={`absolute top-0 right-0 w-40 h-40 bg-${color}-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 transition-all group-hover:bg-${color}-500/10`} />
            <div className="flex justify-between items-start relative z-10">
                <div className={`p-3 rounded-2xl bg-${color}-50 dark:bg-${color}-900/20 text-${color}-600 dark:text-${color}-400`}>
                    <span className="material-icons-outlined text-xl">{type === 'Longest' ? 'public' : 'short_text'}</span>
                </div>
                <div className="text-right">
                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{type} Flight</div>
                    <div className={`text-2xl font-black text-${color}-600 dark:text-${color}-400`}>{flight.distance.toLocaleString()} km</div>
                </div>
            </div>
            <div className="mt-6 relative z-10">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-3xl font-black text-gray-900 dark:text-white">{flight.origin}</span>
                    <div className="flex-1 mx-4 relative h-0.5 bg-gray-200 dark:bg-white/10">
                        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-1 bg-white dark:bg-gray-800`}>
                            <span className="material-icons-outlined text-gray-300 text-xs transform rotate-90">flight</span>
                        </div>
                    </div>
                    <span className="text-3xl font-black text-gray-900 dark:text-white">{flight.destination}</span>
                </div>
                <div className="flex justify-between text-xs font-bold text-gray-500 dark:text-gray-400">
                    <span>{flight.carrier}</span>
                    <span>{new Date(flight.date).getFullYear()}</span>
                </div>
            </div>
        </div>
    );
};

const DonutChart: React.FC<{ data: { label: string; value: number; color: string }[]; title: string }> = ({ data, title }) => {
    const total = data.reduce((sum, item) => sum + item.value, 0);
    if (total === 0) return null;
    let cumulativePercent = 0;
    return (
        <div className="p-6 rounded-[2rem] bg-white dark:bg-gray-800 border border-gray-100 dark:border-white/5 shadow-sm flex flex-col items-center">
            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6 w-full text-left">{title}</h4>
            <div className="relative w-40 h-40">
                <svg viewBox="0 0 100 100" className="transform -rotate-90 w-full h-full">
                    {data.map((item, idx) => {
                        const percent = item.value / total;
                        const dashArray = `${percent * 314} 314`; 
                        const offset = -(cumulativePercent * 314);
                        cumulativePercent += percent;
                        return <circle key={idx} cx="50" cy="50" r="40" fill="transparent" strokeWidth="12" stroke={item.color} strokeDasharray={dashArray} strokeDashoffset={offset} className="transition-all duration-1000 ease-out" />;
                    })}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-black text-gray-900 dark:text-white">{total}</span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Flights</span>
                </div>
            </div>
            <div className="w-full mt-6 space-y-2">
                {data.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
                            <span className="font-bold text-gray-600 dark:text-gray-300">{item.label}</span>
                        </div>
                        <span className="font-bold text-gray-900 dark:text-white">{Math.round((item.value / total) * 100)}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

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
                            <div className={`h-full bg-${color}-500 rounded-full transition-all duration-500 opacity-50 group-hover:opacity-100`} style={{ width: `${(item.count / max) * 100}%` }} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export const Dashboard: React.FC<DashboardProps> = ({ onUserClick, onTripClick }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [entitlements, setEntitlements] = useState<EntitlementType[]>([]);
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [visitedData, setVisitedData] = useState<VisitedCountry[]>([]);
  const [totalCities, setTotalCities] = useState(0);
  const [totalDistance, setTotalDistance] = useState(0);
  const [activeStatsTab, setActiveStatsTab] = useState('stamps');

  const [isFlightTrackerOpen, setIsFlightTrackerOpen] = useState(false);
  const [todaysFlight, setTodaysFlight] = useState<{ iata: string; origin: string; destination: string; date: string } | undefined>(undefined);

  useEffect(() => {
    refreshData();
  }, []);

  useEffect(() => {
      const today = new Date().toISOString().split('T')[0];
      const activeTrip = trips.find(t => t.status !== 'Cancelled' && t.startDate <= today && t.endDate >= today);
      if (activeTrip?.transports) {
          const flight = activeTrip.transports
            .filter(t => t.mode === 'Flight' && t.departureDate === today)
            .sort((a,b) => (a.departureTime || '00:00').localeCompare(b.departureTime || '00:00'))[0];
          if (flight) {
              const iata = flight.providerCode && flight.identifier ? `${flight.providerCode}${flight.identifier}` : flight.identifier;
              if (iata) setTodaysFlight({ iata, origin: flight.origin, destination: flight.destination, date: today });
          }
      }
  }, [trips]);

  const refreshData = () => {
    Promise.all([
      dataService.getUsers(), dataService.getTrips(), dataService.getSavedConfigs(), dataService.getEntitlementTypes()
    ]).then(async ([u, t, configs, ents]) => {
      setUsers(u);
      setTrips(t);
      setHolidays(configs.flatMap(c => c.holidays.map(h => ({ ...h, configId: c.id }))));
      setEntitlements(ents);
      const activeTrips = t.filter(trip => trip.status !== 'Planning' && trip.status !== 'Cancelled');
      const version = getTripsVersion(activeTrips);
      const cachedRaw = localStorage.getItem(DASHBOARD_CACHE_KEY);
      if (cachedRaw) {
          try {
              const cached = JSON.parse(cachedRaw);
              if (cached.version === version) {
                  setVisitedData(deserializeVisitedData(cached.visitedData));
                  setTotalCities(cached.totalCities);
                  setTotalDistance(cached.totalDistance);
                  setLoading(false);
                  return;
              }
          } catch (e) {}
      }
      setLoading(false);
      runAfterFirstPaint(async () => {
          const processed = await processTravelHistory(activeTrips);
          localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify({
              version,
              totalCities: processed.totalCities,
              totalDistance: processed.totalDistance,
              visitedData: serializeVisitedData(processed.visitedData)
          }));
      });
    });
  };

  const processTravelHistory = async (tripList: Trip[]) => {
        const countryMap = new Map<string, VisitedCountry>();
        let kmCount = 0;
        const placesToResolve = new Set<string>();

        tripList.forEach(trip => {
            if (trip.transports) {
                trip.transports.forEach(t => {
                    kmCount += t.distance || (t.originLat && t.originLng && t.destLat && t.destLng ? calculateDistance(t.originLat, t.originLng, t.destLat, t.destLng) : 0);
                    placesToResolve.add(t.destination);
                });
            }
            if (trip.location && !['Time Off', 'Remote', 'Trip', 'Vacation'].includes(trip.location)) placesToResolve.add(trip.location);
            trip.accommodations?.forEach(a => placesToResolve.add(a.address));
        });

        // Optimized batch resolution
        const uniquePlaces = Array.from(placesToResolve);
        const resolvedResults = await mapWithConcurrency(uniquePlaces, resolvePlaceName, GEO_CONCURRENCY_LIMIT);
        const resolvedData = new Map<string, any>();
        uniquePlaces.forEach((p, i) => { if (resolvedResults[i]) resolvedData.set(p, resolvedResults[i]); });

        tripList.forEach(trip => {
            const tripPlaces = new Set<string>();
            if (trip.location && !['Time Off', 'Remote'].includes(trip.location)) tripPlaces.add(trip.location);
            trip.accommodations?.forEach(a => tripPlaces.add(a.address));
            trip.transports?.forEach(t => tripPlaces.add(t.destination)); 

            tripPlaces.forEach(place => {
                const resolved = resolvedData.get(place);
                if (resolved?.country && resolved.country !== 'Unknown') {
                    const countryKey = resolved.countryCode || resolved.country;
                    if (!countryMap.has(countryKey)) {
                        countryMap.set(countryKey, { code: resolved.countryCode || 'XX', name: resolved.country, cities: new Set(), flag: resolved.countryCode ? getFlagEmoji(resolved.countryCode) : '🏳️', tripCount: 0, lastVisit: new Date(trip.endDate), region: getRegion(resolved.countryCode || 'XX') });
                    }
                    const entry = countryMap.get(countryKey)!;
                    entry.cities.add(resolved.city);
                    const tripEnd = new Date(trip.endDate);
                    if (tripEnd > entry.lastVisit) entry.lastVisit = tripEnd;
                }
            });
        });

        let totalC = 0; const finalized: VisitedCountry[] = [];
        countryMap.forEach(val => { totalC += val.cities.size; finalized.push(val); });
        const totalDistance = Math.round(kmCount);
        const visitedData = finalized.sort((a, b) => a.name.localeCompare(b.name));
        setTotalCities(totalC);
        setTotalDistance(totalDistance);
        setVisitedData(visitedData);
        return { totalCities: totalC, totalDistance, visitedData };
  };

  const stats = useMemo(() => {
        const activeTrips = trips.filter(t => t.status !== 'Planning' && t.status !== 'Cancelled');
        let totalFlights = 0, totalDist = 0, totalDurationMinutes = 0;
        const airports = new Map<string, number>(), airlines = new Map<string, number>(), aircraft = new Map<string, number>(), routes = new Map<string, number>();
        const seatCounts: any = { Window: 0, Aisle: 0, Middle: 0 }, classCounts: any = { Economy: 0, Premium: 0, Business: 0, First: 0 };
        let longestFlight: ExtremeFlight | null = null, shortestFlight: ExtremeFlight | null = null;

        activeTrips.forEach(t => {
            t.transports?.forEach(tr => {
                if (tr.mode === 'Flight') {
                    totalFlights++;
                    let dist = tr.distance || (tr.originLat && tr.originLng && tr.destLat && tr.destLng ? calculateDistance(tr.originLat, tr.originLng, tr.destLat, tr.destLng) : 0);
                    totalDist += dist;
                    const flightInfo = { distance: dist, origin: tr.origin, destination: tr.destination, carrier: tr.provider, date: tr.departureDate };
                    if (!longestFlight || dist > longestFlight.distance) longestFlight = flightInfo;
                    if (!shortestFlight || (dist > 0 && dist < shortestFlight.distance)) shortestFlight = flightInfo;
                    if (tr.seatType) seatCounts[tr.seatType]++;
                    if (tr.travelClass) { const cls = tr.travelClass.toLowerCase(); if (cls.includes('economy')) classCounts['Economy']++; else if (cls.includes('premium')) classCounts['Premium']++; else if (cls.includes('business')) classCounts['Business']++; else if (cls.includes('first')) classCounts['First']++; }
                    if (tr.departureDate && tr.departureTime && tr.arrivalDate && tr.arrivalTime) { const diff = (new Date(`${tr.arrivalDate}T${tr.arrivalTime}`).getTime() - new Date(`${tr.departureDate}T${tr.departureTime}`).getTime()) / 60000; if (diff > 0) totalDurationMinutes += diff; }
                    if (tr.origin) airports.set(tr.origin, (airports.get(tr.origin) || 0) + 1);
                    if (tr.destination) airports.set(tr.destination, (airports.get(tr.destination) || 0) + 1);
                    if (tr.provider) airlines.set(tr.provider, (airlines.get(tr.provider) || 0) + 1);
                    if (tr.vehicleModel) aircraft.set(tr.vehicleModel, (aircraft.get(tr.vehicleModel) || 0) + 1);
                    if (tr.origin && tr.destination) { const key = `${tr.origin} → ${tr.destination}`; routes.set(key, (routes.get(key) || 0) + 1); }
                }
            });
        });

        return { totalFlights, totalDistance: Math.round(totalDist), totalDurationHours: Math.round(totalDurationMinutes / 60), topAirports: Array.from(airports.entries()).sort((a,b)=>b[1]-a[1]).map(([l,c])=>({label:l,count:c,code:l})), topAirlines: Array.from(airlines.entries()).sort((a,b)=>b[1]-a[1]).map(([l,c])=>({label:l,count:c})), earthCircumnavigations: (totalDist / 40075).toFixed(1), daysInAir: (totalDurationMinutes / 1440).toFixed(1), longestFlight, shortestFlight, seatCounts: [{ label: 'Window', value: seatCounts.Window, color: '#3b82f6' }, { label: 'Aisle', value: seatCounts.Aisle, color: '#8b5cf6' }, { label: 'Middle', value: seatCounts.Middle, color: '#94a3b8' }].filter(x => x.value > 0), classCounts: [{ label: 'Economy', value: classCounts.Economy, color: '#64748b' }, { label: 'Premium', value: classCounts.Premium, color: '#0ea5e9' }, { label: 'Business', value: classCounts.Business, color: '#f59e0b' }, { label: 'First', value: classCounts.First, color: '#a855f7' }].filter(x => x.value > 0) };
  }, [trips]);

  const currentLevel = useMemo(() => {
        const count = visitedData.length;
        return [...LEVEL_THRESHOLDS].reverse().find(t => count >= t.countries) || LEVEL_THRESHOLDS[0];
  }, [visitedData]);

  const nextLevel = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.findIndex(t => t.name === currentLevel.name) + 1];
  const progressToNext = nextLevel ? Math.min(100, Math.max(0, ((visitedData.length - currentLevel.countries) / (nextLevel.countries - currentLevel.countries)) * 100)) : 100;

  return (
    <div className="space-y-8 animate-fade-in max-w-[100rem] mx-auto pb-12">
        <div className="flex justify-between items-center bg-white/40 dark:bg-gray-900/40 p-4 rounded-[2rem] backdrop-blur-xl border border-white/50 dark:border-white/5 shadow-sm">
            <h2 className="text-2xl font-black text-gray-900 dark:text-white px-4">Command Center</h2>
            <Button variant="primary" className="bg-sky-500 hover:bg-sky-600 shadow-sky-500/20" icon={<span className="material-icons-outlined">flight</span>} onClick={() => setIsFlightTrackerOpen(true)}>Where's my Flight?</Button>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 h-[31.25rem]">
            <div className="xl:col-span-2 relative rounded-[2.5rem] overflow-hidden border border-gray-100 dark:border-white/5 shadow-2xl group">
                <ExpeditionMap3D trips={trips.filter(t => t.status !== 'Planning' && t.status !== 'Cancelled')} animateRoutes={true} onTripClick={onTripClick} />
                <div className="absolute top-6 left-6 z-10 bg-black/40 backdrop-blur-md p-4 rounded-2xl border border-white/10 text-white"><h2 className="text-2xl font-black tracking-tight">World Exploration</h2><p className="text-xs font-bold text-gray-300 uppercase tracking-widest mt-1">{visitedData.length} Countries • {totalCities} Cities</p></div>
            </div>
            <div className="xl:col-span-1"><TimezoneSlider /></div>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
             <div className="xl:col-span-2">
                <Tabs activeTab={activeStatsTab} onChange={setActiveStatsTab} tabs={[{ id: 'stamps', label: 'Passport Stamps', icon: <span className="material-icons-outlined">verified</span> },{ id: 'analytics', label: 'Flight Log', icon: <span className="material-icons-outlined">data_usage</span> }]} />
                {activeStatsTab === 'stamps' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">{visitedData.map(c => { const s = REGION_STYLES[c.region] || REGION_STYLES['Unknown']; return (<div key={c.name} className={`group relative rounded-3xl p-6 border shadow-sm hover:shadow-xl transition-all hover:-translate-y-1 overflow-hidden ${s.bg} ${s.border}`}><div className="relative z-10"><div className="flex justify-between items-start mb-4"><div className="text-4xl filter drop-shadow-md">{c.flag}</div><div className={`px-2 py-1 rounded-lg border text-[10px] font-mono font-bold ${s.badge} ${s.border}`}>{c.code}</div></div><h3 className={`text-xl font-black mb-1 leading-tight ${s.text}`}>{c.name}</h3><p className={`text-xs font-bold uppercase tracking-widest opacity-60 ${s.text}`}>{c.region} • {c.lastVisit.getFullYear()}</p></div></div>); })}</div>
                ) : (
                    <div className="space-y-8 animate-fade-in mt-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6"><StatCard title="Total Flights" value={stats.totalFlights} icon="flight_takeoff" color="blue" /><StatCard title="Distance" value={`${(stats.totalDistance / 1000).toFixed(1)}k km`} subtitle={`${stats.earthCircumnavigations}x Earth`} icon="public" color="emerald" /><StatCard title="Air Time" value={`${stats.totalDurationHours}h`} subtitle={`${stats.daysInAir} Days`} icon="schedule" color="purple" /><StatCard title="Top Airport" value={stats.topAirports[0]?.label || '-'} subtitle={`${stats.topAirports[0]?.count || 0} Visits`} icon="location_on" color="amber" /></div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><ExtremeFlightCard type="Longest" flight={stats.longestFlight} color="indigo" /><ExtremeFlightCard type="Shortest" flight={stats.shortestFlight} color="rose" /></div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><DonutChart title="Seat Preference" data={stats.seatCounts} /><DonutChart title="Cabin Class" data={stats.classCounts} /></div>
                    </div>
                )}
             </div>
             <div className="xl:col-span-1 bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border border-gray-100 dark:border-white/5 shadow-xl flex flex-col justify-between relative overflow-hidden h-fit">
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-[80px] pointer-events-none -translate-y-1/2 translate-x-1/2" />
                <div><h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Traveler Rank</h3><h1 className="text-4xl lg:text-5xl font-black text-gray-900 dark:text-white mt-2 mb-1 tracking-tight leading-none">{currentLevel.name}</h1><div className="flex items-center gap-2 mt-2"><div className="px-3 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-black uppercase tracking-wider border border-amber-200 dark:border-amber-900/50">Level {currentLevel.level}</div></div></div>
                <div className="space-y-6 relative z-10 mt-12"><div className="grid grid-cols-2 gap-4"><div className="p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5"><div className="text-blue-500 mb-1"><span className="material-icons-outlined text-2xl">public</span></div><div className="text-2xl font-black text-gray-900 dark:text-white">{visitedData.length}</div><div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Countries</div></div><div className="p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5"><div className="text-purple-500 mb-1"><span className="material-icons-outlined text-2xl">flight_takeoff</span></div><div className="text-2xl font-black text-gray-900 dark:text-white">{Math.round(totalDistance).toLocaleString()}</div><div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Km Traveled</div></div></div>{nextLevel && (<div><div className="flex justify-between items-end mb-2"><span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Progress</span><span className="text-xs font-bold text-amber-500">{Math.round(progressToNext)}%</span></div><div className="h-3 w-full bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-1000 ease-out rounded-full relative" style={{ width: `${progressToNext}%` }} /></div></div>)}</div>
            </div>
        </div>
        <FlightTrackerModal isOpen={isFlightTrackerOpen} onClose={() => setIsFlightTrackerOpen(false)} suggestedFlight={todaysFlight} />
    </div>
  );
};
