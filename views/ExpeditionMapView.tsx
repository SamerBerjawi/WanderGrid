import React, { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { 
    Compass, 
    Globe, 
    SlidersHorizontal, 
    RefreshCw, 
    Play, 
    Activity, 
    MapPin, 
    Layers, 
    Calendar,
    Sparkles,
    Zap,
    Map as MapIcon,
    Plane,
    X,
    Filter,
    Radio,
    Eye,
    RotateCcw
} from 'lucide-react';
const DeckFlightMap = lazy(() => import('../components/DeckFlightMap').then(m => ({ default: m.DeckFlightMap || m.default })));
import { dataService } from '../services/mockDb';
import { Trip } from '../types';
import { Input, MultiSelect } from '../components/ui';
import { getCoordinates, getCoordinatesSync } from '../services/geocoding';
import { runAfterFirstPaint, mapWithConcurrency } from '../services/utils';
import { 
    MapAppearanceSettings, 
    DEFAULT_MAP_APPEARANCE, 
    loadMapAppearanceSettings, 
    saveMapAppearanceSettings 
} from '../types/mapAppearance';

interface ExpeditionMapViewProps {
    onTripClick: (tripId: string) => void;
}

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

const GEO_CONCURRENCY_LIMIT = 6;
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

const getGreatCircleDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

export const ExpeditionMapView: React.FC<ExpeditionMapViewProps> = ({ onTripClick }) => {
    const [trips, setTrips] = useState<Trip[]>([]);
    const [loading, setLoading] = useState(true);

    // Sidebar state & tab
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [activeSidebarTab, setActiveSidebarTab] = useState<'map' | 'flights' | 'layers' | 'filters'>('map');

    // Appearance Settings State
    const [appearance, setAppearance] = useState<MapAppearanceSettings>(() => loadMapAppearanceSettings());

    // Additional Map Modes
    const [viewMode, setViewMode] = useState<'network' | 'scratch'>('network');
    const [elevatedProjection, setElevatedProjection] = useState<boolean>(true);
    const [animateRoutes, setAnimateRoutes] = useState(false);
    const [showCountries, setShowCountries] = useState(false);
    const [clusterMode, setClusterMode] = useState(false);
    const [showLandSeaRoutes, setShowLandSeaRoutes] = useState(true);
    const [showIndependentFlights, setShowIndependentFlights] = useState(true);
    const [showRoadTracing, setShowRoadTracing] = useState<boolean>(() => {
        return localStorage.getItem('wandergrid_road_tracing') === 'true';
    });

    // Visited Data
    const [visitedCountryCodes, setVisitedCountryCodes] = useState<string[]>([]);
    const [visitedPlaces, setVisitedPlaces] = useState<{ lat: number; lng: number; name: string }[]>([]);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Filters
    const [statusFilter, setStatusFilter] = useState<'all' | 'Past' | 'Upcoming' | 'Planning'>('all');
    const [yearFilter, setYearFilter] = useState<string>('all');
    const [depFilter, setDepFilter] = useState<string[]>([]);
    const [arrFilter, setArrFilter] = useState<string[]>([]);
    const [dateFrom, setDateFrom] = useState<string>('');
    const [dateTo, setDateTo] = useState<string>('');
    const [focusCoord, setFocusCoord] = useState<{ lat: number, lng: number } | null>(null);

    const isDark = useDarkMode();

    const handleUpdateAppearance = (newSettings: MapAppearanceSettings) => {
        setAppearance(newSettings);
        saveMapAppearanceSettings(newSettings);
    };

    const handleResetAll = () => {
        handleUpdateAppearance({ ...DEFAULT_MAP_APPEARANCE });
        setViewMode('network');
        setShowCountries(false);
        setAnimateRoutes(false);
        setClusterMode(false);
        setShowLandSeaRoutes(true);
        setShowIndependentFlights(true);
        setShowRoadTracing(false);
        setStatusFilter('all');
        setYearFilter('all');
        setDepFilter([]);
        setArrFilter([]);
        setDateFrom('');
        setDateTo('');
    };

    const handleRefresh = () => {
        setLoading(true);
        try {
            localStorage.removeItem('wandergrid_coord_cache');
            localStorage.removeItem('wandergrid_geo_cache_v3');
            localStorage.removeItem('wandergrid_geo_cache_v2');
            localStorage.removeItem('wandergrid_geo_cache_v1');
            if (coordCache) {
                coordCache.clear();
            }
        } catch (e) {
            console.warn(e);
        }
        setRefreshTrigger(prev => prev + 1);
    };

    // Load Data
    useEffect(() => {
        setLoading(true);
        Promise.all([
            dataService.getTrips(),
            dataService.getFlights(),
            dataService.getRoadTrips()
        ]).then(([loadedTrips, loadedFlights, loadedRoadTrips]) => {
            const coordCache = getCoordCache();

            const flightIds = new Set((loadedFlights || []).map(f => f.id));
            const combinedFlights = [...(loadedFlights || [])];
            (loadedRoadTrips || []).forEach(rt => {
                if (!flightIds.has(rt.id)) {
                    combinedFlights.push(rt);
                    flightIds.add(rt.id);
                }
            });
            const loadedFlightsCombined = combinedFlights;

            const getLocalCoordsSync = (place: string) => {
                if (!place) return null;
                const clean = place.trim();
                const uppercaseLoc = clean.toUpperCase();
                const cached = coordCache.get(clean) || coordCache.get(uppercaseLoc);
                if (cached) return { lat: cached.lat, lng: cached.lng };

                const syncRes = getCoordinatesSync(clean);
                if (syncRes) {
                    coordCache.set(clean, { lat: syncRes.lat, lng: syncRes.lng });
                    return { lat: syncRes.lat, lng: syncRes.lng };
                }
                return null;
            };

            const processTransportsSync = (transports: any[]) => {
                return (transports || []).map(tr => {
                    const enriched = { ...tr };
                    if (enriched.origin && (!enriched.originLat || !enriched.originLng)) {
                        const c = getLocalCoordsSync(enriched.origin);
                        if (c) {
                            enriched.originLat = c.lat;
                            enriched.originLng = c.lng;
                        }
                    }
                    if (enriched.destination && (!enriched.destLat || !enriched.destLng)) {
                        const c = getLocalCoordsSync(enriched.destination);
                        if (c) {
                            enriched.destLat = c.lat;
                            enriched.destLng = c.lng;
                        }
                    }
                    return enriched;
                });
            };

            const flightsByTripIdMap = new Map<string, any[]>();
            (loadedFlightsCombined || []).forEach(f => {
                const tId = f.tripId;
                if (tId && tId !== 'unassigned') {
                    if (!flightsByTripIdMap.has(tId)) {
                        flightsByTripIdMap.set(tId, []);
                    }
                    flightsByTripIdMap.get(tId)!.push(f);
                }
            });

            const initialTrips = (loadedTrips || []).map(t => {
                const assignedFlights = flightsByTripIdMap.get(t.id) || [];
                const existingTransports = t.transports || [];
                const mergedTransports = [...existingTransports];
                
                assignedFlights.forEach(af => {
                    const isDup = existingTransports.some(et => 
                        (et.id && et.id === af.id) || 
                        (et.identifier === af.identifier && et.departureDate === af.departureDate && et.origin === af.origin)
                    );
                    if (!isDup) {
                        mergedTransports.push(af);
                    }
                });

                return {
                    ...t,
                    transports: processTransportsSync(mergedTransports)
                };
            });

            const initialFlights = processTransportsSync(loadedFlightsCombined || []);

            const makeSyntheticTrips = (flightsList: any[]) => {
                const unassignedFlights = (flightsList || []).filter(f => !f.tripId || f.tripId === 'unassigned');
                return unassignedFlights.map((flight) => {
                    const date = flight.departureDate || '';
                    const todayStr = new Date().toISOString().split('T')[0];
                    const isPast = date < todayStr;
                    const isFlightMode = !flight.mode || flight.mode === 'Flight';

                    return {
                        id: isFlightMode ? `independent-flight-${flight.id}` : `independent-road-trip-${flight.id}`,
                        name: isFlightMode 
                            ? `Independent: ${flight.provider} ${flight.identifier || 'Flight'}`
                            : `Independent: ${flight.provider} ${flight.identifier || flight.mode || 'Road Trip'}`,
                        location: `${flight.origin} ➔ ${flight.destination}`,
                        startDate: date,
                        endDate: flight.arrivalDate || date,
                        status: (isPast ? 'Past' : 'Upcoming') as 'Past' | 'Upcoming',
                        participants: [],
                        transports: [{
                            ...flight,
                            mode: flight.mode || 'Flight'
                        }],
                        privacy: 'Public' as const,
                    };
                });
            };

            setTrips([...initialTrips, ...makeSyntheticTrips(initialFlights)]);
            setLoading(false);

            runAfterFirstPaint(async () => {
                let coordsDirty = false;

                const resolveCoordsAsync = async (locName: string) => {
                    if (!locName) return null;
                    let c = coordCache.get(locName);
                    if (!c) {
                        const res = await getCoordinates(locName);
                        if (res) {
                            c = { lat: res.lat, lng: res.lng };
                            coordCache.set(locName, c);
                            coordsDirty = true;
                        }
                    }
                    return c;
                };

                const asyncEnrichedFlights = await mapWithConcurrency(loadedFlightsCombined || [], async (f) => {
                    const enriched = { ...f };
                    if (enriched.origin && (!enriched.originLat || !enriched.originLng)) {
                        const c = await resolveCoordsAsync(enriched.origin);
                        if (c) {
                            enriched.originLat = c.lat;
                            enriched.originLng = c.lng;
                        }
                    }
                    if (enriched.destination && (!enriched.destLat || !enriched.destLng)) {
                        const c = await resolveCoordsAsync(enriched.destination);
                        if (c) {
                            enriched.destLat = c.lat;
                            enriched.destLng = c.lng;
                        }
                    }
                    return enriched;
                }, GEO_CONCURRENCY_LIMIT);

                const asyncEnrichedTrips = await mapWithConcurrency(loadedTrips || [], async (t) => {
                    if (!t.transports) return t;
                    const enrichedTransports = await mapWithConcurrency(t.transports, async (tr) => {
                        const enriched = { ...tr };
                        if (enriched.origin && (!enriched.originLat || !enriched.originLng)) {
                            const c = await resolveCoordsAsync(enriched.origin);
                            if (c) {
                                enriched.originLat = c.lat;
                                enriched.originLng = c.lng;
                            }
                        }
                        if (enriched.destination && (!enriched.destLat || !enriched.destLng)) {
                            const c = await resolveCoordsAsync(enriched.destination);
                            if (c) {
                                enriched.destLat = c.lat;
                                enriched.destLng = c.lng;
                            }
                        }
                        return enriched;
                    }, GEO_CONCURRENCY_LIMIT);
                    return { ...t, transports: enrichedTransports };
                }, GEO_CONCURRENCY_LIMIT);

                if (coordsDirty) {
                    saveCoordCache(coordCache);
                }

                const enrichedFlightsByTripId = new Map<string, any[]>();
                (asyncEnrichedFlights || []).forEach(f => {
                    const tId = f.tripId;
                    if (tId && tId !== 'unassigned') {
                        if (!enrichedFlightsByTripId.has(tId)) {
                            enrichedFlightsByTripId.set(tId, []);
                        }
                        enrichedFlightsByTripId.get(tId)!.push(f);
                    }
                });

                const asyncEnrichedTripsMerged = asyncEnrichedTrips.map(trip => {
                    const assignedFlights = enrichedFlightsByTripId.get(trip.id) || [];
                    const existingTransports = trip.transports || [];
                    const mergedTransports = [...existingTransports];
                    
                    assignedFlights.forEach(af => {
                        const isDup = existingTransports.some(et => 
                            (et.id && et.id === af.id) || 
                            (et.identifier === af.identifier && et.departureDate === af.departureDate && et.origin === af.origin)
                        );
                        if (!isDup) {
                            mergedTransports.push(af);
                        }
                    });

                    return {
                        ...trip,
                        transports: mergedTransports
                    };
                });

                setTrips([...asyncEnrichedTripsMerged, ...makeSyntheticTrips(asyncEnrichedFlights)]);
            });

        }).catch(err => {
            console.error("Failed to load map data", err);
            setLoading(false);
        });
    }, [refreshTrigger]);

    // Visited countries calculation
    useEffect(() => {
        const processGeoData = async () => {
            try {
                const visited = await dataService.getVisited();
                if (visited && visited.length > 0) {
                    const countryCodes = visited
                        .filter(item => item.type === 'country' && !item.isTransit)
                        .map(item => item.code.toUpperCase());
                    
                    const places = visited
                        .filter(item => item.type === 'city')
                        .map(item => ({
                            lat: item.lat || 0,
                            lng: item.lng || 0,
                            name: item.name
                        }));

                    setVisitedCountryCodes(countryCodes);
                    setVisitedPlaces(places);
                }
            } catch (err) {
                console.warn("Could not query Visited collection:", err);
            }
        };
        processGeoData();
    }, [trips]);

    // Unique filter options
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
            origins: Array.from(origins).sort().map(a => ({ label: a, value: a })),
            destinations: Array.from(destinations).sort().map(a => ({ label: a, value: a }))
        };
    }, [trips]);

    const years = useMemo(() => {
        const yearSet = new Set<string>();
        trips.forEach(t => {
            if (t.startDate) {
                const y = new Date(t.startDate).getFullYear().toString();
                if (!isNaN(Number(y))) yearSet.add(y);
            }
        });
        return Array.from(yearSet).sort((a, b) => b.localeCompare(a));
    }, [trips]);

    // Filter Trips
    const filteredTrips = useMemo(() => {
        return trips.filter(trip => {
            if (statusFilter !== 'all' && trip.status !== statusFilter) return false;

            if (yearFilter !== 'all') {
                const tripYear = trip.startDate ? new Date(trip.startDate).getFullYear().toString() : '';
                if (tripYear !== yearFilter) return false;
            }

            if (dateFrom && trip.startDate && trip.startDate < dateFrom) return false;
            if (dateTo && trip.endDate && trip.endDate > dateTo) return false;

            if (depFilter.length > 0) {
                const hasMatchingOrigin = trip.transports?.some(t => t.origin && depFilter.includes(t.origin));
                if (!hasMatchingOrigin) return false;
            }

            if (arrFilter.length > 0) {
                const hasMatchingDest = trip.transports?.some(t => t.destination && arrFilter.includes(t.destination));
                if (!hasMatchingDest) return false;
            }

            return true;
        });
    }, [trips, statusFilter, yearFilter, depFilter, arrFilter, dateFrom, dateTo]);

    // Summary Metrics
    const { totalDistanceKm, activeSectorsCount } = useMemo(() => {
        let totalDist = 0;
        let sectors = 0;

        filteredTrips.forEach(t => {
            t.transports?.forEach(tr => {
                if (tr.originLat && tr.originLng && tr.destLat && tr.destLng) {
                    totalDist += getGreatCircleDistance(tr.originLat, tr.originLng, tr.destLat, tr.destLng);
                    sectors++;
                }
            });
        });

        return {
            totalDistanceKm: Math.round(totalDist),
            activeSectorsCount: sectors
        };
    }, [filteredTrips]);

    return (
        <div className="relative w-full h-full overflow-hidden bg-[#090d16] select-none">
            {/* 1. 100% FULL-SCREEN DECK.GL WEBGL MAP */}
            <div className="absolute inset-0 w-full h-full">
                <Suspense fallback={
                    <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950 space-y-4">
                        <Compass className="w-10 h-10 text-blue-500 animate-[spin_4s_linear_infinite]" />
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Loading Geospatial Engine...</p>
                    </div>
                }>
                    <DeckFlightMap
                        key={`gpu-${isDark ? 'dark' : 'light'}`}
                        trips={filteredTrips}
                        onTripClick={onTripClick}
                        showFrequencyWeight={appearance.routeWidthMode === 'frequency'}
                        animateRoutes={animateRoutes}
                        visitedCountries={visitedCountryCodes}
                        showCountries={showCountries}
                        viewMode={viewMode}
                        visitedPlaces={visitedPlaces}
                        activeLayer={appearance.basemap}
                        onChangeActiveLayer={(layer) => handleUpdateAppearance({ ...appearance, basemap: layer })}
                        projection={appearance.projection}
                        elevatedRoutes={elevatedProjection}
                        onProjectionChange={(p) => handleUpdateAppearance({ ...appearance, projection: p })}
                        onElevatedRoutesChange={setElevatedProjection}
                        showFlightRoutes={showIndependentFlights}
                        showLandSeaRoutes={showLandSeaRoutes}
                        showCityMarkers={appearance.airportSize !== 'off'}
                        showGradientRoutes={appearance.routeColorMode === 'gradient'}
                        clusterMode={clusterMode}
                        showRoadTracing={showRoadTracing}
                        focusTransportCoordinates={focusCoord}
                        appearanceSettings={appearance}
                        onChangeAppearanceSettings={handleUpdateAppearance}
                    />
                </Suspense>
            </div>

            {/* 2. FLOATING TOP HUD BAR (Command & Live Telemetry) */}
            <div className="absolute top-5 left-5 z-20 flex items-center gap-3 pointer-events-none">
                {/* Brand & Status Pill */}
                <div className="pointer-events-auto bg-zinc-950/80 hover:bg-zinc-950/95 backdrop-blur-2xl border border-white/10 rounded-2xl px-4 py-2.5 shadow-2xl flex items-center gap-3.5 transition-all">
                    <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-400 shrink-0">
                        <Compass className="w-4 h-4 animate-[spin_20s_linear_infinite]" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-white tracking-tight leading-none">WanderGrid Atlas</span>
                            <span className="flex h-2 w-2 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                            </span>
                        </div>
                        <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5 leading-none">
                            {activeSectorsCount} Active Sectors • {totalDistanceKm.toLocaleString()} KM
                        </p>
                    </div>
                </div>
            </div>

            {/* 3. FLOATING TOP RIGHT CONTROLS TOGGLE */}
            <div className="absolute top-5 right-5 z-20 flex items-center gap-2">
                <button
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className={`px-4 py-2.5 rounded-2xl shadow-2xl backdrop-blur-2xl text-xs font-bold flex items-center gap-2.5 cursor-pointer transition-all active:scale-95 border ${
                        isSidebarOpen 
                            ? 'bg-blue-600 text-white border-blue-400/40 shadow-blue-500/25 ring-2 ring-blue-500/30'
                            : 'bg-zinc-950/85 hover:bg-zinc-900 text-white border-white/10'
                    }`}
                >
                    <SlidersHorizontal className={`w-4 h-4 ${isSidebarOpen ? 'text-white' : 'text-blue-400'} transition-transform duration-300 ${isSidebarOpen ? 'rotate-90' : ''}`} />
                    <span>Controls & Appearance</span>
                </button>
            </div>

            {/* 4. SLIDE-IN RIGHT SIDEBAR CONTROL PANEL */}
            <div 
                className={`fixed md:absolute top-0 right-0 h-full w-full sm:w-[420px] max-w-full bg-[#0e121a]/95 backdrop-blur-3xl border-l border-white/10 shadow-[-15px_0_45px_rgba(0,0,0,0.8)] z-40 flex flex-col transition-transform duration-300 ease-out select-none ${
                    isSidebarOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
                }`}
            >
                {/* Sidebar Header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/5">
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-blue-500/15 border border-blue-500/25 flex items-center justify-center text-blue-400">
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                        </div>
                        <h2 className="text-sm font-black text-white tracking-tight">Mission Control</h2>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleRefresh}
                            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                            title="Sync coordinates & network"
                        >
                            <RefreshCw className="w-3.5 h-3.5 hover:rotate-180 transition-transform duration-500" />
                        </button>
                        <button
                            onClick={handleResetAll}
                            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                            title="Reset to defaults"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={() => setIsSidebarOpen(false)}
                            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                            title="Close sidebar"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Unified Segmented Navigation Tab Bar */}
                <div className="px-6 py-3 border-b border-white/5">
                    <div className="flex p-1 bg-zinc-950/80 rounded-2xl border border-white/5 gap-1">
                        {[
                            { id: 'map', label: 'Map', icon: MapIcon },
                            { id: 'flights', label: 'Flights', icon: Plane },
                            { id: 'layers', label: 'Layers', icon: Layers },
                            { id: 'filters', label: 'Filters', icon: Filter }
                        ].map((tab) => {
                            const isSelected = activeSidebarTab === tab.id;
                            const IconComponent = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveSidebarTab(tab.id as any)}
                                    className={`flex-1 py-2 rounded-xl text-xs font-bold tracking-wide transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                        isSelected
                                            ? 'bg-zinc-800 text-white shadow-md font-black border border-white/10'
                                            : 'text-zinc-400 hover:text-zinc-200'
                                    }`}
                                >
                                    <IconComponent className="w-3.5 h-3.5" />
                                    <span>{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Sidebar Scrollable Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar text-white">
                    {/* TAB 1: MAP */}
                    {activeSidebarTab === 'map' && (
                        <div className="space-y-6">
                            {/* BASEMAP */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-[11px] font-black text-zinc-400 tracking-wider uppercase">Basemap Style</h3>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    {[
                                        { id: 'default', label: 'Default', bg: '#161a23', icon: 'grid' },
                                        { id: 'satellite', label: 'Satellite', bg: '#0f2316', icon: 'sat' },
                                        { id: 'topography', label: 'Topography', bg: '#1f2937', icon: 'topo' },
                                        { id: 'night', label: 'Dark Midnight', bg: '#090b10', icon: 'night' }
                                    ].map(b => (
                                        <button
                                            key={b.id}
                                            onClick={() => handleUpdateAppearance({ ...appearance, basemap: b.id as any })}
                                            className={`p-2.5 rounded-2xl border transition-all text-center flex flex-col items-center gap-2 cursor-pointer ${
                                                appearance.basemap === b.id
                                                    ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                                                    : 'border-white/10 bg-zinc-900/60 hover:border-white/20'
                                            }`}
                                        >
                                            <div className="w-full h-14 rounded-xl border border-white/5 flex items-center justify-center overflow-hidden" style={{ background: b.bg }}>
                                                {b.id === 'satellite' ? (
                                                    <svg className="w-full h-full" viewBox="0 0 100 50">
                                                        <rect width="100" height="50" fill="#1b3022" />
                                                        <circle cx="80" cy="15" r="25" fill="#2d4a36" />
                                                        <path d="M15,50 L60,0 L75,0 L30,50 Z" fill="#4a5568" />
                                                    </svg>
                                                ) : (
                                                    <svg className="w-full h-full opacity-60" viewBox="0 0 100 50">
                                                        <path d="M0,25 L100,25 M30,0 L30,50 M70,0 L70,50" stroke="#384252" strokeWidth="1.5" />
                                                    </svg>
                                                )}
                                            </div>
                                            <span className="text-xs font-bold text-zinc-200">{b.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* AIRPORT DETAIL */}
                            <div>
                                <h3 className="text-[11px] font-black text-zinc-400 tracking-wider uppercase mb-3">Airport Detail</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => handleUpdateAppearance({ ...appearance, airportDetail: 'standard' })}
                                        className={`p-2.5 rounded-2xl border transition-all text-center flex flex-col items-center gap-2 cursor-pointer ${
                                            appearance.airportDetail === 'standard'
                                                ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                                                : 'border-white/10 bg-zinc-900/60 hover:border-white/20'
                                        }`}
                                    >
                                        <div className="w-full h-14 rounded-xl bg-zinc-950 border border-white/5 flex items-center justify-center">
                                            <svg className="w-full h-full" viewBox="0 0 100 50">
                                                <path d="M35,45 L65,5" stroke="#334155" strokeWidth="14" strokeLinecap="round" />
                                                <path d="M35,45 L65,5" stroke="#f8fafc" strokeWidth="2" strokeDasharray="5 3" />
                                            </svg>
                                        </div>
                                        <span className="text-xs font-bold text-zinc-200">Standard</span>
                                    </button>

                                    <button
                                        onClick={() => handleUpdateAppearance({ ...appearance, airportDetail: 'detailed' })}
                                        className={`p-2.5 rounded-2xl border transition-all text-center flex flex-col items-center gap-2 cursor-pointer ${
                                            appearance.airportDetail === 'detailed'
                                                ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                                                : 'border-white/10 bg-zinc-900/60 hover:border-white/20'
                                        }`}
                                    >
                                        <div className="w-full h-14 rounded-xl bg-zinc-950 border border-white/5 flex items-center justify-center">
                                            <svg className="w-full h-full" viewBox="0 0 100 50">
                                                <path d="M30,48 L70,2" stroke="#1e293b" strokeWidth="18" />
                                                <path d="M45,50 L85,20 L92,10" fill="none" stroke="#eab308" strokeWidth="2" />
                                                <path d="M30,48 L70,2" stroke="#f8fafc" strokeWidth="1.5" strokeDasharray="4 2" />
                                                <line x1="55" y1="18" x2="65" y2="10" stroke="#f8fafc" strokeWidth="2" strokeDasharray="2 1" />
                                            </svg>
                                        </div>
                                        <span className="text-xs font-bold text-zinc-200">Detailed</span>
                                    </button>
                                </div>
                            </div>

                            {/* PROJECTION */}
                            <div>
                                <h3 className="text-[11px] font-black text-zinc-400 tracking-wider uppercase mb-3">Projection Engine</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => handleUpdateAppearance({ ...appearance, projection: 'flat' })}
                                        className={`p-2.5 rounded-2xl border transition-all text-center flex flex-col items-center gap-2 cursor-pointer ${
                                            appearance.projection === 'flat'
                                                ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                                                : 'border-white/10 bg-zinc-900/60 hover:border-white/20'
                                        }`}
                                    >
                                        <div className="w-full h-14 rounded-xl bg-zinc-950 border border-white/5 flex items-center justify-center">
                                            <svg className="w-full h-full" viewBox="0 0 100 50">
                                                <line x1="15" y1="18" x2="85" y2="18" stroke="#334155" strokeWidth="1" />
                                                <line x1="15" y1="34" x2="85" y2="34" stroke="#334155" strokeWidth="1" />
                                                <path d="M20,38 Q50,10 80,38" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
                                            </svg>
                                        </div>
                                        <span className="text-xs font-bold text-zinc-200">Flat Map</span>
                                    </button>

                                    <button
                                        onClick={() => handleUpdateAppearance({ ...appearance, projection: 'globe' })}
                                        className={`p-2.5 rounded-2xl border transition-all text-center flex flex-col items-center gap-2 cursor-pointer ${
                                            appearance.projection === 'globe'
                                                ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                                                : 'border-white/10 bg-zinc-900/60 hover:border-white/20'
                                        }`}
                                    >
                                        <div className="w-full h-14 rounded-xl bg-zinc-950 border border-white/5 flex items-center justify-center">
                                            <svg className="w-full h-full" viewBox="0 0 100 50">
                                                <circle cx="50" cy="25" r="20" fill="none" stroke="#334155" strokeWidth="1.5" />
                                                <ellipse cx="50" cy="25" rx="10" ry="20" fill="none" stroke="#334155" strokeWidth="1" />
                                                <path d="M35,28 Q50,12 65,28" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
                                            </svg>
                                        </div>
                                        <span className="text-xs font-bold text-zinc-200">3D Globe</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: FLIGHTS & ROUTES */}
                    {activeSidebarTab === 'flights' && (
                        <div className="space-y-6">
                            {/* AIRPORT MARKERS */}
                            <div className="space-y-3">
                                <h3 className="text-[11px] font-black text-zinc-400 tracking-wider uppercase">Airports Appearance</h3>
                                
                                <div>
                                    <span className="text-xs text-zinc-300 font-semibold mb-2 block">Size</span>
                                    <div className="grid grid-cols-4 gap-2">
                                        {[
                                            { id: 'off', label: 'Off' },
                                            { id: 'small', label: 'Small' },
                                            { id: 'medium', label: 'Medium' },
                                            { id: 'large', label: 'Large' }
                                        ].map((sz) => (
                                            <button
                                                key={sz.id}
                                                onClick={() => handleUpdateAppearance({ ...appearance, airportSize: sz.id as any })}
                                                className={`py-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                                                    appearance.airportSize === sz.id
                                                        ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                                                        : 'border-white/10 bg-zinc-900/60 hover:border-white/20'
                                                }`}
                                            >
                                                <span className="text-xs font-bold text-zinc-200">{sz.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <span className="text-xs text-zinc-300 font-semibold mb-2 block">Mode</span>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => handleUpdateAppearance({ ...appearance, airportMode: 'frequency' })}
                                            className={`p-2.5 rounded-xl border transition-all text-center cursor-pointer ${
                                                appearance.airportMode === 'frequency'
                                                    ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                                                    : 'border-white/10 bg-zinc-900/60 hover:border-white/20'
                                            }`}
                                        >
                                            <span className="text-xs font-bold text-zinc-200">By frequency</span>
                                        </button>

                                        <button
                                            onClick={() => handleUpdateAppearance({ ...appearance, airportMode: 'uniform' })}
                                            className={`p-2.5 rounded-xl border transition-all text-center cursor-pointer ${
                                                appearance.airportMode === 'uniform'
                                                    ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                                                    : 'border-white/10 bg-zinc-900/60 hover:border-white/20'
                                            }`}
                                        >
                                            <span className="text-xs font-bold text-zinc-200">Uniform</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* ROUTES APPEARANCE */}
                            <div className="space-y-4 pt-3 border-t border-white/5">
                                <h3 className="text-[11px] font-black text-zinc-400 tracking-wider uppercase">Routes Appearance</h3>

                                {/* Width */}
                                <div>
                                    <span className="text-xs text-zinc-300 font-semibold mb-2 block">Width</span>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => handleUpdateAppearance({ ...appearance, routeWidthMode: 'uniform' })}
                                            className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                                                appearance.routeWidthMode === 'uniform'
                                                    ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                                                    : 'border-white/10 bg-zinc-900/60 hover:border-white/20'
                                            }`}
                                        >
                                            <span className="text-xs font-bold text-zinc-200">Uniform</span>
                                        </button>
                                        <button
                                            onClick={() => handleUpdateAppearance({ ...appearance, routeWidthMode: 'frequency' })}
                                            className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                                                appearance.routeWidthMode === 'frequency'
                                                    ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                                                    : 'border-white/10 bg-zinc-900/60 hover:border-white/20'
                                            }`}
                                        >
                                            <span className="text-xs font-bold text-zinc-200">By frequency</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Scale */}
                                <div>
                                    <span className="text-xs text-zinc-300 font-semibold mb-2 block">Scale</span>
                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            { id: 'thin', label: 'Thin' },
                                            { id: 'normal', label: 'Normal' },
                                            { id: 'thick', label: 'Thick' }
                                        ].map((sc) => (
                                            <button
                                                key={sc.id}
                                                onClick={() => handleUpdateAppearance({ ...appearance, routeScale: sc.id as any })}
                                                className={`py-2 rounded-xl border text-center transition-all cursor-pointer ${
                                                    appearance.routeScale === sc.id
                                                        ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                                                        : 'border-white/10 bg-zinc-900/60 hover:border-white/20'
                                                }`}
                                            >
                                                <span className="text-xs font-bold text-zinc-200">{sc.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Color */}
                                <div>
                                    <span className="text-xs text-zinc-300 font-semibold mb-2 block">Color Mode</span>
                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            { id: 'default', label: 'Default' },
                                            { id: 'frequency', label: 'Frequency' },
                                            { id: 'gradient', label: 'Gradient' }
                                        ].map((cl) => (
                                            <button
                                                key={cl.id}
                                                onClick={() => handleUpdateAppearance({ ...appearance, routeColorMode: cl.id as any })}
                                                className={`py-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                                                    appearance.routeColorMode === cl.id
                                                        ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                                                        : 'border-white/10 bg-zinc-900/60 hover:border-white/20'
                                                }`}
                                            >
                                                <span className="text-[11px] font-bold text-zinc-200">{cl.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* PRESENTATION CHANNELS */}
                            <div className="space-y-3 pt-3 border-t border-white/5">
                                <h3 className="text-[11px] font-black text-zinc-400 tracking-wider uppercase">Active Channels</h3>

                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setShowIndependentFlights(!showIndependentFlights)}
                                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2 cursor-pointer ${
                                            showIndependentFlights
                                                ? 'bg-purple-500/15 border-purple-500/40 text-purple-300'
                                                : 'bg-zinc-900/60 border-white/10 text-zinc-400'
                                        }`}
                                    >
                                        <Plane className="w-3.5 h-3.5 text-purple-400" />
                                        <span className="text-xs font-bold">Flights</span>
                                    </button>

                                    <button
                                        onClick={() => setShowLandSeaRoutes(!showLandSeaRoutes)}
                                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2 cursor-pointer ${
                                            showLandSeaRoutes
                                                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                                                : 'bg-zinc-900/60 border-white/10 text-zinc-400'
                                        }`}
                                    >
                                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                                        <span className="text-xs font-bold">Transit</span>
                                    </button>

                                    <button
                                        onClick={() => setAnimateRoutes(!animateRoutes)}
                                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2 cursor-pointer ${
                                            animateRoutes
                                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                                : 'bg-zinc-900/60 border-white/10 text-zinc-400'
                                        }`}
                                    >
                                        <Play className="w-3.5 h-3.5 text-emerald-400" />
                                        <span className="text-xs font-bold">Comet Flow</span>
                                    </button>

                                    <button
                                        onClick={() => setClusterMode(!clusterMode)}
                                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2 cursor-pointer ${
                                            clusterMode
                                                ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                                                : 'bg-zinc-900/60 border-white/10 text-zinc-400'
                                        }`}
                                    >
                                        <Layers className="w-3.5 h-3.5 text-indigo-400" />
                                        <span className="text-xs font-bold">Cluster</span>
                                    </button>
                                </div>

                                <button
                                    onClick={() => {
                                        const newVal = !showRoadTracing;
                                        setShowRoadTracing(newVal);
                                        localStorage.setItem('wandergrid_road_tracing', String(newVal));
                                    }}
                                    className={`w-full p-2.5 rounded-xl border text-left flex items-center gap-2.5 cursor-pointer ${
                                        showRoadTracing
                                            ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                                            : 'bg-zinc-900/60 border-white/10 text-zinc-400'
                                    }`}
                                >
                                    <Radio className="w-4 h-4 text-rose-400 shrink-0" />
                                    <div className="min-w-0 flex-1 leading-none">
                                        <p className="text-xs font-bold">Realistic Land Trails (OSRM)</p>
                                        <p className="text-[9px] text-zinc-400 mt-1">Trace routes over actual roads</p>
                                    </div>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* TAB 3: LAYERS (ENVIRONMENT & SCRATCH) */}
                    {activeSidebarTab === 'layers' && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-[11px] font-black text-zinc-400 tracking-wider uppercase mb-3">
                                    Environment Overlays
                                </h3>

                                <div className="space-y-3">
                                    {/* Time of Day */}
                                    <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-white/10 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                                                    <span>Time of Day</span>
                                                    {appearance.timeOfDay && (
                                                        <span className="px-1.5 py-0.5 text-[9px] font-black rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                                            Twilight Gradient
                                                        </span>
                                                    )}
                                                </h4>
                                                <p className="text-[10px] text-zinc-400 mt-0.5">Atmospheric multi-band solar penumbra</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleUpdateAppearance({ ...appearance, timeOfDay: !appearance.timeOfDay })}
                                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                                                    appearance.timeOfDay ? 'bg-blue-600' : 'bg-zinc-700'
                                                }`}
                                            >
                                                <span
                                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                                        appearance.timeOfDay ? 'translate-x-5' : 'translate-x-0'
                                                    }`}
                                                />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Rain Radar */}
                                    <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-white/10 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                                                    <span>Rain Radar</span>
                                                    {appearance.rainRadar && (
                                                        <span className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-black rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                                            Live
                                                        </span>
                                                    )}
                                                </h4>
                                                <p className="text-[10px] text-zinc-400 mt-0.5">RainViewer global precipitation raster</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleUpdateAppearance({ ...appearance, rainRadar: !appearance.rainRadar })}
                                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                                                    appearance.rainRadar ? 'bg-blue-600' : 'bg-zinc-700'
                                                }`}
                                            >
                                                <span
                                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                                        appearance.rainRadar ? 'translate-x-5' : 'translate-x-0'
                                                    }`}
                                                />
                                            </button>
                                        </div>

                                        {/* Nested Rain Radar Configuration Options */}
                                        {appearance.rainRadar && (
                                            <div className="pt-2.5 border-t border-white/5 space-y-3 animate-fade-in">
                                                {/* Opacity Slider */}
                                                <div>
                                                    <div className="flex items-center justify-between text-[10px] font-bold text-zinc-300 mb-1">
                                                        <span>Radar Intensity / Opacity</span>
                                                        <span className="text-blue-400">{Math.round((appearance.rainRadarOpacity || 0.85) * 100)}%</span>
                                                    </div>
                                                    <input 
                                                        type="range" 
                                                        min="0.2" 
                                                        max="1.0" 
                                                        step="0.05"
                                                        value={appearance.rainRadarOpacity || 0.85}
                                                        onChange={(e) => handleUpdateAppearance({ ...appearance, rainRadarOpacity: parseFloat(e.target.value) })}
                                                        className="w-full accent-blue-500 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                                                    />
                                                </div>

                                                {/* Radar Color Palette */}
                                                <div>
                                                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">Color Palette</span>
                                                    <div className="grid grid-cols-3 gap-1.5">
                                                        {[
                                                            { id: 2, label: 'Universal' },
                                                            { id: 1, label: 'Classic' },
                                                            { id: 6, label: 'NEXRAD' }
                                                        ].map(p => (
                                                            <button
                                                                key={p.id}
                                                                onClick={() => handleUpdateAppearance({ ...appearance, rainRadarColorScheme: p.id })}
                                                                className={`py-1.5 px-1 rounded-lg text-[10px] font-bold text-center border transition-all cursor-pointer ${
                                                                    (appearance.rainRadarColorScheme || 2) === p.id
                                                                        ? 'bg-blue-600 text-white border-blue-400/40 shadow-sm'
                                                                        : 'bg-zinc-800/80 border-white/5 text-zinc-400 hover:text-white'
                                                                }`}
                                                            >
                                                                {p.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Visited Lands / Scratch Layer */}
                                    <div className="flex items-center justify-between p-3.5 rounded-2xl bg-zinc-900/60 border border-white/10">
                                        <div>
                                            <h4 className="text-xs font-bold text-white">Visited Lands (Scratch)</h4>
                                            <p className="text-[10px] text-zinc-400 mt-0.5">Highlight explored countries</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setShowCountries(!showCountries)}
                                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                                                showCountries ? 'bg-amber-600' : 'bg-zinc-700'
                                            }`}
                                        >
                                            <span
                                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                                    showCountries ? 'translate-x-5' : 'translate-x-0'
                                                }`}
                                            />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 4: FILTERS & TIMELINE */}
                    {activeSidebarTab === 'filters' && (
                        <div className="space-y-5">
                            {/* Status Filter */}
                            <div>
                                <label className="text-[11px] font-black text-zinc-400 tracking-wider uppercase block mb-2">
                                    Trip Status
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['all', 'Past', 'Upcoming'].map((s) => (
                                        <button
                                            key={s}
                                            onClick={() => setStatusFilter(s as any)}
                                            className={`py-2 rounded-xl text-xs font-bold tracking-wide transition-all text-center cursor-pointer ${
                                                statusFilter === s
                                                    ? 'bg-blue-600 text-white font-black shadow-md border border-blue-400/30'
                                                    : 'bg-zinc-900/60 border border-white/10 text-zinc-400 hover:text-white'
                                            }`}
                                        >
                                            {s === 'all' ? 'All' : s}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Year Filter */}
                            <div>
                                <label className="text-[11px] font-black text-zinc-400 tracking-wider uppercase block mb-2">
                                    Operation Year
                                </label>
                                <select
                                    value={yearFilter}
                                    onChange={(e) => setYearFilter(e.target.value)}
                                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-bold text-white outline-none cursor-pointer"
                                >
                                    <option value="all">All Years</option>
                                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>

                            {/* Departure Station */}
                            <div>
                                <label className="text-[11px] font-black text-zinc-400 tracking-wider uppercase block mb-2">
                                    Departure Station
                                </label>
                                <MultiSelect
                                    placeholder="Any Departure Hub"
                                    options={uniqueAirports.origins}
                                    value={depFilter}
                                    onChange={setDepFilter}
                                />
                            </div>

                            {/* Arrival Station */}
                            <div>
                                <label className="text-[11px] font-black text-zinc-400 tracking-wider uppercase block mb-2">
                                    Arrival Station
                                </label>
                                <MultiSelect
                                    placeholder="Any Arrival Hub"
                                    options={uniqueAirports.destinations}
                                    value={arrFilter}
                                    onChange={setArrFilter}
                                />
                            </div>

                            {/* Date Range */}
                            <div>
                                <label className="text-[11px] font-black text-zinc-400 tracking-wider uppercase block mb-2">
                                    Temporal Date Range
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <span className="text-[9px] text-zinc-400 uppercase font-bold block mb-1">From</span>
                                        <Input
                                            type="date"
                                            value={dateFrom}
                                            onChange={(e) => setDateFrom(e.target.value)}
                                            className="!py-1.5 !px-2.5 !text-xs !font-bold bg-zinc-900 text-white border border-white/10 rounded-xl"
                                        />
                                    </div>
                                    <div>
                                        <span className="text-[9px] text-zinc-400 uppercase font-bold block mb-1">To</span>
                                        <Input
                                            type="date"
                                            value={dateTo}
                                            onChange={(e) => setDateTo(e.target.value)}
                                            className="!py-1.5 !px-2.5 !text-xs !font-bold bg-zinc-900 text-white border border-white/10 rounded-xl"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ExpeditionMapView;
