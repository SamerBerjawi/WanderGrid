import React, { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { 
    Compass, 
    Globe, 
    SlidersHorizontal, 
    ArrowsClockwise as RefreshCw, 
    Play, 
    Pulse as Activity, 
    MapPin, 
    Stack as Layers, 
    CalendarBlank as Calendar,
    Sparkle as Sparkles,
    Lightning as Zap,
    MapTrifold as MapIcon,
    Airplane as Plane,
    X,
    Funnel as Filter,
    Radio,
    Eye,
    ArrowCounterClockwise as RotateCcw,
    Boat as Ship,
    Train,
    Car,
    ArrowsOut as Maximize,
    ArrowsIn as Minimize,
    Moon
} from '@phosphor-icons/react';
const DeckFlightMap = lazy(() => import('../components/DeckFlightMap').then(m => ({ default: m.DeckFlightMap || m.default })));
import { motion } from 'motion/react';
import GlassPanel from '../components/glass/GlassPanel';
import { dataService } from '../services/mockDb';
import { Trip, CountryResidenceStatus, PredefinedMapMode, getResidenceStatuses } from '../types';
import { Input, MultiSelect } from '../components/ui';
import { LiquidGlassSelect, LiquidGlassMultiSelect } from '../components/LiquidGlassSelect';
import { getCoordinates, getCoordinatesSync, STATIC_GEO_DATA } from '../services/geocoding';
import { runAfterFirstPaint, mapWithConcurrency } from '../services/utils';
import { 
    MapAppearanceSettings, 
    DEFAULT_MAP_APPEARANCE, 
    loadMapAppearanceSettings, 
    saveMapAppearanceSettings,
    getEffectiveBasemap
} from '../types/mapAppearance';

interface ExpeditionMapViewProps {
    onTripClick: (tripId: string) => void;
    isSidebarCollapsed?: boolean;
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

const MAP_MODE_THEMES: Record<PredefinedMapMode, {
    label: string;
    shortLabel: string;
    desc: string;
    icon: any;
    color: string;
    activeText: string;
    activeBg: string;
    activeBorder: string;
    activeShadow: string;
    badgeStyle: string;
    cardActiveBg: string;
    cardActiveBorder: string;
    cardActiveText: string;
    cardActiveShadow: string;
}> = {
    flights: {
        label: 'Flights',
        shortLabel: 'Flights',
        desc: 'Aviation arcs & hubs',
        icon: Plane,
        color: 'text-sky-500 dark:text-sky-400',
        activeText: 'text-sky-700 dark:text-sky-300',
        activeBg: 'bg-sky-500/20 dark:bg-sky-500/30',
        activeBorder: 'border-sky-500/40 dark:border-sky-400/50',
        activeShadow: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_2px_10px_rgba(14,165,233,0.3)]',
        badgeStyle: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
        cardActiveBg: 'bg-sky-500/15 dark:bg-sky-500/25',
        cardActiveBorder: 'border-sky-500/40 dark:border-sky-400/50',
        cardActiveText: 'text-sky-700 dark:text-sky-300',
        cardActiveShadow: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(14,165,233,0.2)]'
    },
    land_sea: {
        label: 'Land & Sea',
        shortLabel: 'Land',
        desc: 'Road trips & rail',
        icon: Compass,
        color: 'text-emerald-500 dark:text-emerald-400',
        activeText: 'text-emerald-700 dark:text-emerald-300',
        activeBg: 'bg-emerald-500/20 dark:bg-emerald-500/30',
        activeBorder: 'border-emerald-500/40 dark:border-emerald-400/50',
        activeShadow: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_2px_10px_rgba(16,185,129,0.3)]',
        badgeStyle: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
        cardActiveBg: 'bg-emerald-500/15 dark:bg-emerald-500/25',
        cardActiveBorder: 'border-emerald-500/40 dark:border-emerald-400/50',
        cardActiveText: 'text-emerald-700 dark:text-emerald-300',
        cardActiveShadow: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(16,185,129,0.2)]'
    },
    scratch: {
        label: 'Scratch',
        shortLabel: 'Scratch',
        desc: 'Territory explorer',
        icon: MapIcon,
        color: 'text-amber-500 dark:text-amber-400',
        activeText: 'text-amber-700 dark:text-amber-300',
        activeBg: 'bg-amber-500/20 dark:bg-amber-500/30',
        activeBorder: 'border-amber-500/40 dark:border-amber-400/50',
        activeShadow: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_2px_10px_rgba(245,158,11,0.3)]',
        badgeStyle: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
        cardActiveBg: 'bg-amber-500/15 dark:bg-amber-500/25',
        cardActiveBorder: 'border-amber-500/40 dark:border-amber-400/50',
        cardActiveText: 'text-amber-700 dark:text-amber-300',
        cardActiveShadow: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(245,158,11,0.2)]'
    },
    all: {
        label: 'All Expeditions',
        shortLabel: 'All',
        desc: 'Full unified network',
        icon: Globe,
        color: 'text-indigo-500 dark:text-indigo-400',
        activeText: 'text-indigo-700 dark:text-indigo-300',
        activeBg: 'bg-indigo-500/20 dark:bg-indigo-500/30',
        activeBorder: 'border-indigo-500/40 dark:border-indigo-400/50',
        activeShadow: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_2px_10px_rgba(99,102,241,0.3)]',
        badgeStyle: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
        cardActiveBg: 'bg-indigo-500/15 dark:bg-indigo-500/25',
        cardActiveBorder: 'border-indigo-500/40 dark:border-indigo-400/50',
        cardActiveText: 'text-indigo-700 dark:text-indigo-300',
        cardActiveShadow: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(99,102,241,0.2)]'
    }
};

export const ExpeditionMapView: React.FC<ExpeditionMapViewProps> = ({ onTripClick, isSidebarCollapsed = false }) => {
    const [trips, setTrips] = useState<Trip[]>([]);
    const [loading, setLoading] = useState(true);

    // Sidebar state & tab
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [activeSidebarTab, setActiveSidebarTab] = useState<'cartography' | 'aviation' | 'atmosphere' | 'filters'>('cartography');

    // Appearance Settings State
    const [appearance, setAppearance] = useState<MapAppearanceSettings>(() => loadMapAppearanceSettings());

    // Predefined Map View Mode ('flights' | 'land_sea' | 'scratch' | 'all')
    const [viewMode, setViewMode] = useState<PredefinedMapMode>('all');
    const [elevatedProjection, setElevatedProjection] = useState<boolean>(true);
    const [animateRoutes, setAnimateRoutes] = useState(false);
    const [showCountries, setShowCountries] = useState(false);
    const [clusterMode, setClusterMode] = useState(false);
    const [showLandSeaRoutes, setShowLandSeaRoutes] = useState(true);
    const [showIndependentFlights, setShowIndependentFlights] = useState(true);
    const [showRoadTracing, setShowRoadTracing] = useState<boolean>(() => {
        return localStorage.getItem('wandergrid_road_tracing') === 'true';
    });

    // Visited Data & Country Residence Status
    const [visitedCountryCodes, setVisitedCountryCodes] = useState<string[]>([]);
    const [countryStatusMap, setCountryStatusMap] = useState<Record<string, CountryResidenceStatus[] | CountryResidenceStatus>>({});
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

    const handleSelectViewMode = (mode: PredefinedMapMode) => {
        setViewMode(mode);
        if (mode === 'flights') {
            setShowIndependentFlights(true);
            setShowLandSeaRoutes(false);
            setShowCountries(false);
        } else if (mode === 'land_sea') {
            setShowIndependentFlights(false);
            setShowLandSeaRoutes(true);
            setShowCountries(false);
        } else if (mode === 'scratch') {
            setShowIndependentFlights(false);
            setShowLandSeaRoutes(false);
            setShowCountries(true);
        } else if (mode === 'all') {
            setShowIndependentFlights(true);
            setShowLandSeaRoutes(true);
            setShowCountries(false);
        }
    };

    const handleUpdateAppearance = (newSettings: MapAppearanceSettings) => {
        setAppearance(newSettings);
        saveMapAppearanceSettings(newSettings);
    };

    const handleResetAll = () => {
        handleUpdateAppearance({ ...DEFAULT_MAP_APPEARANCE });
        handleSelectViewMode('all');
        setAnimateRoutes(false);
        setClusterMode(false);
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
                const countrySet = new Set<string>();
                const statusMap: Record<string, CountryResidenceStatus[] | CountryResidenceStatus> = {};
                const placeMap = new Map<string, { lat: number; lng: number; name: string }>();

                // 1. From database visited collection
                if (visited && visited.length > 0) {
                    visited.forEach(item => {
                        const code = item.code ? item.code.toUpperCase() : (item.countryCode ? item.countryCode.toUpperCase() : '');
                        const name = item.name ? item.name.toUpperCase() : (item.countryName ? item.countryName.toUpperCase() : '');
                        const statuses = getResidenceStatuses(item);

                        if (code) statusMap[code] = statuses;
                        if (name) statusMap[name] = statuses;

                        const hasVisited = statuses.some(s => s === 'visited' || s === 'lived_current' || s === 'lived_past');
                        if (hasVisited) {
                            if (item.type === 'country' && code) {
                                countrySet.add(code);
                            } else if (item.countryCode) {
                                countrySet.add(item.countryCode.toUpperCase());
                            }
                        }

                        if (item.type === 'city' && item.lat && item.lng) {
                            placeMap.set(`${item.lat.toFixed(3)},${item.lng.toFixed(3)}`, {
                                lat: item.lat,
                                lng: item.lng,
                                name: item.name
                            });
                        }
                    });
                }

                // 2. Automatic Trip Analysis: Differentiate Destination stays vs Layover connections
                const destinationCountries = new Set<string>();
                const layoverCandidateCountries = new Set<string>();

                (trips || []).forEach(trip => {
                    // Stays and Trip destination anchors
                    if (trip.location) {
                        const res = STATIC_GEO_DATA[trip.location.toUpperCase()];
                        if (res?.iso) destinationCountries.add(res.iso.toUpperCase());
                    }
                    trip.locations?.forEach(l => {
                        if (l.name) {
                            const res = STATIC_GEO_DATA[l.name.toUpperCase()];
                            if (res?.iso) destinationCountries.add(res.iso.toUpperCase());
                        }
                    });

                    const transports = trip.transports || [];
                    transports.forEach((tr, idx) => {
                        const originCode = tr.origin?.toUpperCase() || '';
                        const destCode = tr.destination?.toUpperCase() || '';
                        const originGeo = originCode ? STATIC_GEO_DATA[originCode] : null;
                        const destGeo = destCode ? STATIC_GEO_DATA[destCode] : null;

                        const isFlight = !tr.mode || tr.mode === 'Flight';

                        if (originGeo?.iso) {
                            destinationCountries.add(originGeo.iso.toUpperCase());
                        }

                        if (isFlight) {
                            // Check if this flight leg is an explicit layover or intermediate transfer
                            const isIntermediateFlight = idx < transports.length - 1 && transports[idx + 1].origin?.toUpperCase() === destCode;
                            const isExplicitLayover = tr.isLayover === true;

                            if (destGeo?.iso) {
                                const iso = destGeo.iso.toUpperCase();
                                if (isIntermediateFlight || isExplicitLayover) {
                                    layoverCandidateCountries.add(iso);
                                } else {
                                    destinationCountries.add(iso);
                                }
                            }
                        } else {
                            // Ground / Sea transit counts as visited destination
                            if (destGeo?.iso) destinationCountries.add(destGeo.iso.toUpperCase());
                        }

                        // Collect place coordinates
                        if (tr.originLat && tr.originLng && tr.origin) {
                            placeMap.set(`${tr.originLat.toFixed(3)},${tr.originLng.toFixed(3)}`, {
                                lat: tr.originLat,
                                lng: tr.originLng,
                                name: tr.origin
                            });
                        }
                        if (tr.destLat && tr.destLng && tr.destination) {
                            placeMap.set(`${tr.destLat.toFixed(3)},${tr.destLng.toFixed(3)}`, {
                                lat: tr.destLat,
                                lng: tr.destLng,
                                name: tr.destination
                            });
                        }
                    });
                });

                // Add all verified destination countries to countrySet
                destinationCountries.forEach(code => countrySet.add(code));

                // Auto-detect layover-only countries: in layoverCandidateCountries, but NEVER stayed as a destination
                layoverCandidateCountries.forEach(code => {
                    if (!destinationCountries.has(code) && !statusMap[code]) {
                        statusMap[code] = 'layover';
                    }
                });

                setVisitedCountryCodes(Array.from(countrySet));
                setCountryStatusMap(statusMap);
                setVisitedPlaces(Array.from(placeMap.values()));
            } catch (err) {
                console.warn("Could not query Visited collection:", err);
            }
        };

        processGeoData();

        const handleDbUpdate = () => {
            processGeoData();
        };
        window.addEventListener('wandergrid_db_updated', handleDbUpdate);
        return () => window.removeEventListener('wandergrid_db_updated', handleDbUpdate);
    }, [trips]);

    const handleUpdateCountryStatus = async (countryCode: string, countryName: string, status: CountryResidenceStatus | CountryResidenceStatus[] | 'none') => {
        try {
            const visitedList = await dataService.getVisited();
            const upperCode = (countryCode || '').toUpperCase();
            const upperName = (countryName || '').toUpperCase();

            const existing = (visitedList || []).find((v: any) => 
                (v.type === 'country' && v.code && v.code.toUpperCase() === upperCode) ||
                (v.name && v.name.toUpperCase() === upperName)
            );

            const isNone = status === 'none' || (Array.isArray(status) && status.length === 0);

            if (isNone) {
                if (existing) {
                    await dataService.deleteVisited(existing.id);
                }
            } else {
                const statuses: CountryResidenceStatus[] = Array.isArray(status) ? status : [status];
                const isTransit = statuses.includes('layover');
                const primaryStatus = statuses[0] || 'visited';

                if (existing) {
                    await dataService.updateVisited({
                        ...existing,
                        residenceStatus: primaryStatus,
                        residenceStatuses: statuses,
                        isTransit,
                        name: countryName || existing.name
                    });
                } else {
                    await dataService.addVisited({
                        id: `visited-country-${upperCode || Date.now()}`,
                        type: 'country',
                        code: upperCode,
                        name: countryName,
                        residenceStatus: primaryStatus,
                        residenceStatuses: statuses,
                        isTransit,
                        isManual: true,
                        visitDate: new Date().toISOString().split('T')[0]
                    });
                }
            }

            setCountryStatusMap(prev => {
                const next = { ...prev };
                if (isNone) {
                    if (upperCode) delete next[upperCode];
                    if (upperName) delete next[upperName];
                } else {
                    const statuses: CountryResidenceStatus[] = Array.isArray(status) ? status : [status];
                    if (upperCode) next[upperCode] = statuses;
                    if (upperName) next[upperName] = statuses;
                }
                return next;
            });

            const statuses: CountryResidenceStatus[] = !isNone ? (Array.isArray(status) ? status : [status]) : [];
            const hasVisited = statuses.some(s => s === 'visited' || s === 'lived_current' || s === 'lived_past');

            if (hasVisited) {
                if (upperCode && !visitedCountryCodes.includes(upperCode)) {
                    setVisitedCountryCodes(prev => [...prev, upperCode]);
                }
            } else {
                setVisitedCountryCodes(prev => prev.filter(c => c !== upperCode));
            }

            window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
        } catch (e) {
            console.error("Failed to update country status:", e);
        }
    };

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
        const today = new Date().toISOString().split('T')[0];

        return trips.filter(trip => {
            if (statusFilter !== 'all') {
                const hasPastDates = Boolean(
                    (trip.endDate && trip.endDate < today) ||
                    (trip.startDate && trip.startDate < today && (!trip.endDate || trip.endDate < today))
                );
                const isPastTrip = trip.status === 'Past' || hasPastDates;

                if (statusFilter === 'Past') {
                    // Past should show previous trips
                    if (!isPastTrip) return false;
                } else if (statusFilter === 'Upcoming') {
                    // Upcoming should show future trips that are active/upcoming
                    if (isPastTrip || trip.status !== 'Upcoming') return false;
                } else if (statusFilter === 'Planning') {
                    // Planning should show future trips in planning stage
                    if (isPastTrip || trip.status !== 'Planning') return false;
                }
            }

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

    // Summary Metrics & Accurate Expedition Type Tallies (Counts & Distance)
    const expeditionTypeMetrics = useMemo(() => {
        let flightsCount = 0;
        let flightsDist = 0;

        let landSeaCount = 0;
        let landSeaDist = 0;

        filteredTrips.forEach(t => {
            (t.transports || []).forEach(tr => {
                const mode = (tr.mode || 'Flight').trim().toLowerCase();
                const isFlight = mode === 'flight' || mode === 'air' || mode === 'plane';
                const isLandSea = ['train', 'rail', 'bus', 'car', 'road', 'drive', 'driving', 'taxi', 'ferry', 'cruise', 'boat', 'ship'].some(m => mode.includes(m));

                let dist = tr.distance || 0;
                if (!dist && tr.originLat && tr.originLng && tr.destLat && tr.destLng) {
                    dist = getGreatCircleDistance(tr.originLat, tr.originLng, tr.destLat, tr.destLng);
                }

                if (isFlight) {
                    flightsCount++;
                    flightsDist += dist;
                } else if (isLandSea) {
                    landSeaCount++;
                    landSeaDist += dist;
                }
            });

            // Handle trips with extrapolated flight journeys or flight indicators where transports array is empty
            if (!t.transports?.length && (t as any).isExtrapolated) {
                flightsCount++;
            }
        });

        const allCount = flightsCount + landSeaCount;
        const allDist = flightsDist + landSeaDist;

        return {
            flights: {
                count: flightsCount,
                distanceStr: `${Math.round(flightsDist).toLocaleString()} km`
            },
            land_sea: {
                count: landSeaCount,
                distanceStr: `${Math.round(landSeaDist).toLocaleString()} km`
            },
            scratch: {
                count: visitedCountryCodes.length,
                distanceStr: `${visitedCountryCodes.length} countries`
            },
            all: {
                count: allCount,
                distanceStr: `${Math.round(allDist).toLocaleString()} km`
            },
            activeSectorsCount: allCount,
            totalDistanceKm: Math.round(allDist)
        };
    }, [filteredTrips, visitedCountryCodes]);

    const activeSectorsCount = expeditionTypeMetrics.activeSectorsCount;
    const totalDistanceKm = expeditionTypeMetrics.totalDistanceKm;

    const [isFullscreen, setIsFullscreen] = useState(false);
    const mapContainerRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
        };
    }, []);

    const handleToggleFullscreen = async () => {
        try {
            if (!document.fullscreenElement) {
                if (mapContainerRef.current) {
                    if (mapContainerRef.current.requestFullscreen) {
                        await mapContainerRef.current.requestFullscreen();
                    } else if ((mapContainerRef.current as any).webkitRequestFullscreen) {
                        await (mapContainerRef.current as any).webkitRequestFullscreen();
                    }
                }
            } else {
                if (document.exitFullscreen) {
                    await document.exitFullscreen();
                } else if ((document as any).webkitExitFullscreen) {
                    await (document as any).webkitExitFullscreen();
                }
            }
        } catch (e) {
            console.warn("Fullscreen toggle error", e);
        }
    };

    return (
        <div ref={mapContainerRef} className="relative w-full h-full overflow-hidden bg-light-bg dark:bg-[#050505] select-none">
            {/* 1. 100% FULL-SCREEN DECK.GL WEBGL MAP */}
            <div className="absolute inset-0 w-full h-full">
                <Suspense fallback={
                    <div className="w-full h-full flex flex-col items-center justify-center bg-light-bg dark:bg-[#050505] space-y-4">
                        <Compass className="w-10 h-10 text-primary-500 animate-[spin_4s_linear_infinite]" weight="duotone" />
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-light-text-secondary dark:text-dark-text-secondary">Loading Geospatial Engine...</p>
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
                        countryStatusMap={countryStatusMap}
                        onUpdateCountryStatus={handleUpdateCountryStatus}
                        visitedPlaces={visitedPlaces}
                        activeLayer={appearance.basemap}
                        onChangeActiveLayer={(layer) => handleUpdateAppearance({ ...appearance, basemap: layer as any })}
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
                        isSidebarCollapsed={isSidebarCollapsed}
                    />
                </Suspense>
            </div>

            {/* 2. FLOATING BOTTOM-CENTER PREDEFINED VIEW MODES SELECTOR (Desktop md+) */}
            <div className="hidden md:block absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
                <GlassPanel
                    className="wg-glass-pill shadow-glass-card"
                    padding="4px 6px"
                    overrides={{ borderRadius: 9999 }}
                >
                    <div className="flex gap-1 relative items-center">
                        {(['flights', 'land_sea', 'scratch', 'all'] as PredefinedMapMode[]).map((modeKey) => {
                            const config = MAP_MODE_THEMES[modeKey];
                            const isSelected = viewMode === modeKey;
                            const IconComponent = config.icon;
                            const metrics = expeditionTypeMetrics[modeKey];
                            return (
                                <button
                                    key={modeKey}
                                    onClick={() => handleSelectViewMode(modeKey)}
                                    title={`${config.label} (${metrics.count} expeditions • ${metrics.distanceStr})`}
                                    className={`relative rounded-full text-xs font-bold transition-all duration-200 flex flex-col items-center justify-center cursor-pointer select-none active:scale-95 ${
                                        isSelected
                                            ? `${config.activeText} px-4 sm:px-6 py-2`
                                            : `${config.color} hover:opacity-100 opacity-85 px-3 sm:px-5 py-2`
                                    }`}
                                >
                                    {isSelected && (
                                        <motion.div
                                            layoutId="kokonutSmoothTabActive"
                                            className={`absolute inset-0 rounded-full ${config.activeBg} backdrop-blur-md border ${config.activeBorder} ${config.activeShadow} z-0`}
                                            style={{ WebkitBackdropFilter: 'blur(12px)' }}
                                            transition={{ type: "spring", stiffness: 450, damping: 32 }}
                                        />
                                    )}
                                    <span className="relative z-10 flex flex-col items-center gap-0.5">
                                        <span className="flex items-center gap-1.5 sm:gap-2">
                                            <IconComponent className={`w-4.5 h-4.5 shrink-0 transition-colors duration-200 ${config.color}`} weight="duotone" />
                                            <span className={`tracking-tight ${isSelected ? 'inline' : 'hidden sm:inline'} ${isSelected ? config.activeText : config.color}`}>
                                                {config.label}
                                            </span>
                                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold border transition-colors ${config.badgeStyle} ${
                                                isSelected 
                                                    ? 'inline shadow-xs' 
                                                    : 'hidden sm:inline opacity-90 hover:opacity-100'
                                            }`}>
                                                {metrics.count}
                                            </span>
                                        </span>
                                        <span className="text-[10px] font-mono tracking-tight font-bold text-black dark:text-white">
                                            {metrics.distanceStr}
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </GlassPanel>
            </div>

            {/* 3. FLOATING TOP RIGHT CONTROLS TOGGLE & FULLSCREEN (Desktop md+) */}
            <div className="hidden md:flex absolute top-5 right-5 z-20 items-center gap-2 pointer-events-auto">
                <GlassPanel
                    className="wg-glass-pill shadow-glass-card"
                    padding="0px"
                    overrides={{ borderRadius: 20 }}
                >
                    <button
                        onClick={handleToggleFullscreen}
                        className={`p-2.5 text-xs font-semibold flex items-center justify-center cursor-pointer transition-all duration-150 active:scale-95 rounded-2xl ${
                            isFullscreen
                                ? 'bg-primary-500/20 dark:bg-primary-500/30 backdrop-blur-md text-primary-600 dark:text-primary-400 border border-primary-500/40 dark:border-primary-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)]'
                                : 'text-light-text dark:text-dark-text hover:bg-black/5 dark:hover:bg-white/5'
                        }`}
                        style={isFullscreen ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                        title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                        aria-label="Toggle Fullscreen"
                    >
                        {isFullscreen ? (
                            <Minimize className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                        ) : (
                            <Maximize className="w-4 h-4 text-primary-500" />
                        )}
                    </button>
                </GlassPanel>

                <GlassPanel
                    className="wg-glass-pill shadow-glass-card"
                    padding="0px"
                    overrides={{ borderRadius: 20 }}
                >
                    <button
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        className={`px-4 py-2.5 rounded-2xl text-xs font-semibold flex items-center gap-2.5 cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                            isSidebarOpen 
                                ? 'bg-primary-500/20 dark:bg-primary-500/30 backdrop-blur-md text-primary-700 dark:text-primary-300 border border-primary-500/40 dark:border-primary-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(234,88,12,0.2)]'
                                : 'text-light-text dark:text-dark-text hover:bg-black/5 dark:hover:bg-white/5'
                        }`}
                        style={isSidebarOpen ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                    >
                        <SlidersHorizontal className={`w-4 h-4 ${isSidebarOpen ? 'text-primary-600 dark:text-primary-400' : 'text-primary-500'} transition-transform duration-300 ${isSidebarOpen ? 'rotate-90' : ''}`} />
                        <span>Controls & Appearance</span>
                    </button>
                </GlassPanel>
            </div>

            {/* 3.5 MOBILE TOP BAR (< md): Telemetry on left, Fullscreen & Controls on right */}
            <div className="flex md:hidden absolute top-3 inset-x-3 z-20 items-center justify-between pointer-events-none">
                {/* Left: Compact Telemetry / Map Brand */}
                <div className="pointer-events-auto">
                    <GlassPanel
                        className="wg-glass-pill shadow-glass-card"
                        padding="0px"
                        overrides={{ borderRadius: 28 }}
                    >
                        <div className="flex items-center gap-2 px-3 py-1.5">
                            <div className="w-6 h-6 rounded-lg bg-primary-500/20 text-primary-500 flex items-center justify-center border border-primary-500/30 shrink-0">
                                <Globe className="w-3.5 h-3.5" />
                            </div>
                            <span className="text-xs font-bold tracking-tight text-light-text dark:text-dark-text">
                                {activeSectorsCount} Sectors
                            </span>
                        </div>
                    </GlassPanel>
                </div>

                {/* Right: Fullscreen & Controls buttons in a sleek unified glass pill */}
                <div className="flex items-center gap-1.5 pointer-events-auto">
                    <GlassPanel
                        className="wg-glass-pill shadow-glass-card"
                        padding="2px 4px"
                        overrides={{ borderRadius: 28 }}
                    >
                        <div className="flex items-center gap-1">
                            <button
                                onClick={handleToggleFullscreen}
                                className={`w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-150 active:scale-95 ${
                                    isFullscreen
                                        ? 'bg-primary-500/20 dark:bg-primary-500/30 text-primary-600 dark:text-primary-400'
                                        : 'text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text'
                                }`}
                                title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                                aria-label="Toggle Fullscreen"
                            >
                                {isFullscreen ? (
                                    <Minimize className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                                ) : (
                                    <Maximize className="w-4 h-4" />
                                )}
                            </button>
                            <div className="w-[1px] h-4 bg-black/10 dark:bg-white/10" />
                            <button
                                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                                className={`h-8 px-2.5 rounded-xl flex items-center gap-1.5 text-xs font-bold cursor-pointer transition-all duration-150 active:scale-95 ${
                                    isSidebarOpen 
                                        ? 'bg-primary-500/20 dark:bg-primary-500/30 text-primary-700 dark:text-primary-300'
                                        : 'text-light-text dark:text-dark-text hover:bg-black/5 dark:hover:bg-white/5'
                                }`}
                                title="Controls & Appearance"
                                aria-label="Controls & Appearance"
                            >
                                <SlidersHorizontal className={`w-3.5 h-3.5 ${isSidebarOpen ? 'text-primary-600 dark:text-primary-400' : 'text-primary-500'} transition-transform duration-300 ${isSidebarOpen ? 'rotate-90' : ''}`} />
                                <span className="text-2xs font-bold uppercase tracking-wider">Controls</span>
                            </button>
                        </div>
                    </GlassPanel>
                </div>
            </div>

            {/* 3.6 MOBILE BOTTOM FLOATING TAB SELECTOR (< md) - Floating just above bottom navbar */}
            <div className={`flex md:hidden fixed bottom-[4.85rem] inset-x-0 z-40 items-center justify-center px-4 pointer-events-none transition-opacity duration-200 ${
                isSidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}>
                <div className="pointer-events-auto w-full max-w-sm">
                    <GlassPanel
                        className="wg-glass-pill shadow-2xl w-full"
                        padding="4px"
                        overrides={{ borderRadius: 9999 }}
                    >
                        <div className="grid grid-cols-4 gap-1 w-full relative">
                            {(['flights', 'land_sea', 'scratch', 'all'] as PredefinedMapMode[]).map((modeKey) => {
                                const config = MAP_MODE_THEMES[modeKey];
                                const isSelected = viewMode === modeKey;
                                const IconComponent = config.icon;
                                const metrics = expeditionTypeMetrics[modeKey];
                                return (
                                    <button
                                        key={modeKey}
                                        onClick={() => handleSelectViewMode(modeKey)}
                                        className={`relative h-12 py-1 rounded-full text-xs font-bold transition-colors duration-200 flex flex-col items-center justify-center cursor-pointer select-none active:scale-95 min-w-0 ${
                                            isSelected
                                                ? config.activeText
                                                : `${config.color} opacity-85 hover:opacity-100`
                                        }`}
                                        title={`${config.label} (${metrics.count} • ${metrics.distanceStr})`}
                                    >
                                        {isSelected && (
                                            <motion.div
                                                layoutId="kokonutSmoothTabActiveMobile"
                                                className={`absolute inset-0 rounded-full ${config.activeBg} backdrop-blur-md border ${config.activeBorder} ${config.activeShadow} z-0`}
                                                style={{ WebkitBackdropFilter: 'blur(12px)' }}
                                                transition={{ type: "spring", stiffness: 450, damping: 32 }}
                                            />
                                        )}
                                        <span className="relative z-10 flex flex-col items-center justify-center truncate px-0.5">
                                            <span className="flex items-center gap-1 truncate">
                                                <IconComponent className={`w-3.5 h-3.5 shrink-0 transition-colors duration-200 ${config.color}`} weight="duotone" />
                                                <span className={`text-[11px] font-bold tracking-tight ${isSelected ? config.activeText : config.color}`}>{config.shortLabel}</span>
                                                <span className={`text-[8.5px] font-mono px-1 py-0.2 rounded-full font-bold border transition-colors ${config.badgeStyle}`}>
                                                    {metrics.count}
                                                </span>
                                            </span>
                                            <span className="text-[8.5px] font-mono tracking-tight font-bold text-black dark:text-white mt-0.5">
                                                {metrics.distanceStr}
                                            </span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </GlassPanel>
                </div>
            </div>

            {/* 4. SLIDE-IN RIGHT SIDEBAR CONTROL PANEL */}
            <div 
                className={`fixed md:absolute top-0 right-0 h-full w-full sm:w-[500px] md:w-[540px] max-w-full border-l border-black/10 dark:border-white/10 shadow-glass-modal z-modal flex flex-col transition-transform duration-300 ease-out select-none ${
                    isSidebarOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
                }`}
            >
                <GlassPanel
                    className="wg-glass-card h-full w-full text-light-text dark:text-dark-text flex flex-col"
                    padding="0px"
                    overrides={{ borderRadius: 0 }}
                >
                {/* Sidebar Header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-black/5 dark:border-white/5 bg-gradient-to-r from-primary-500/10 via-transparent to-transparent shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-primary-500/15 dark:bg-primary-500/25 border border-primary-500/30 dark:border-primary-400/40 flex items-center justify-center text-primary-600 dark:text-primary-400 shrink-0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_6px_rgba(234,88,12,0.15)] backdrop-blur-md">
                            <SlidersHorizontal className="w-4 h-4" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-light-text dark:text-dark-text tracking-tight">Mission Control</h2>
                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary font-medium">Map Telemetry & Controls</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={handleRefresh}
                            className="w-8 h-8 rounded-xl bg-white/50 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/15 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text transition-all duration-150 flex items-center justify-center cursor-pointer border border-black/5 dark:border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.25)] active:scale-95 backdrop-blur-md"
                            title="Reset Camera & Telemetry"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setIsSidebarOpen(false)}
                            className="w-8 h-8 rounded-xl bg-white/50 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/15 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text transition-all duration-150 flex items-center justify-center cursor-pointer border border-black/5 dark:border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.25)] active:scale-95 backdrop-blur-md"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Sidebar Navigation Tabs with Unique Accents */}
                <div className="grid grid-cols-4 border-b border-black/5 dark:border-white/5 px-4 pt-2 gap-1.5 bg-black/[0.02] dark:bg-white/[0.02] shrink-0">
                    {([
                        { 
                            id: 'cartography', 
                            label: 'Cartography', 
                            icon: Globe,
                            activeClass: 'text-sky-700 dark:text-sky-300 bg-sky-500/15 dark:bg-sky-500/25 backdrop-blur-md border border-sky-500/35 dark:border-sky-400/45 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(14,165,233,0.15)]',
                            iconColor: 'text-sky-600 dark:text-sky-400',
                        },
                        { 
                            id: 'aviation', 
                            label: 'Sectors & Arcs', 
                            icon: Plane,
                            activeClass: 'text-indigo-700 dark:text-indigo-300 bg-indigo-500/15 dark:bg-indigo-500/25 backdrop-blur-md border border-indigo-500/35 dark:border-indigo-400/45 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(99,102,241,0.15)]',
                            iconColor: 'text-indigo-600 dark:text-indigo-400',
                        },
                        { 
                            id: 'atmosphere', 
                            label: 'Atmosphere', 
                            icon: Moon,
                            activeClass: 'text-amber-700 dark:text-amber-300 bg-amber-500/15 dark:bg-amber-500/25 backdrop-blur-md border border-amber-500/35 dark:border-amber-400/45 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(245,158,11,0.15)]',
                            iconColor: 'text-amber-600 dark:text-amber-400',
                        },
                        { 
                            id: 'filters', 
                            label: 'Filters', 
                            icon: Filter,
                            activeClass: 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 dark:bg-emerald-500/25 backdrop-blur-md border border-emerald-500/35 dark:border-emerald-400/45 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(16,185,129,0.15)]',
                            iconColor: 'text-emerald-600 dark:text-emerald-400',
                        }
                    ] as const).map((tab) => {
                        const isActive = activeSidebarTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveSidebarTab(tab.id)}
                                className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-t-xl text-xs font-bold transition-all duration-200 cursor-pointer relative truncate ${
                                    isActive
                                        ? tab.activeClass
                                        : `${tab.iconColor} opacity-75 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5`
                                }`}
                                style={isActive ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                title={tab.label}
                            >
                                <tab.icon className={`w-4 h-4 shrink-0 ${tab.iconColor}`} />
                                <span className="truncate">{tab.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Sidebar Content (Scrollable) */}
                <div className="flex-1 overflow-y-auto p-6 pb-28 md:pb-6 space-y-6 custom-scrollbar">
                    {/* TAB 1: CARTOGRAPHY (PROJECTION & BASEMAPS) - SKY ACCENT */}
                    {activeSidebarTab === 'cartography' && (
                        <div className="space-y-6">
                            {/* PROJECTION */}
                            <div className="p-4 rounded-2xl bg-white/40 dark:bg-white/[0.03] backdrop-blur-sm border border-black/5 dark:border-white/5 shadow-sm space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-500 border border-sky-500/20 flex items-center justify-center shrink-0">
                                            <Compass className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <h3 className="text-xs font-bold uppercase tracking-wider text-light-text dark:text-dark-text">Projection Engine</h3>
                                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Orbital WebGL 3D Globe or 2D Mercator</p>
                                        </div>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-widest bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                                        {appearance.projection === 'globe' ? '3D Orbital' : '2D Planar'}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2.5 pt-1">
                                    <button
                                        onClick={() => handleUpdateAppearance({ ...appearance, projection: 'globe' })}
                                        className={`p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer relative overflow-hidden flex flex-col justify-between h-20 active:scale-[0.98] ${
                                            appearance.projection === 'globe'
                                                ? 'bg-sky-500/15 dark:bg-sky-500/25 backdrop-blur-md border-sky-500/40 dark:border-sky-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(14,165,233,0.15)] text-sky-700 dark:text-sky-300 font-bold'
                                                : 'bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                        }`}
                                        style={appearance.projection === 'globe' ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="material-icons-outlined text-lg text-sky-500">public</span>
                                            {appearance.projection === 'globe' && <div className="w-2 h-2 rounded-full bg-sky-500 shadow-[0_0_8px_#0284c7]" />}
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-light-text dark:text-dark-text">3D Celestial Globe</p>
                                            <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary">True spherical geometry</p>
                                        </div>
                                    </button>

                                    <button
                                        onClick={() => handleUpdateAppearance({ ...appearance, projection: 'flat' })}
                                        className={`p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer relative overflow-hidden flex flex-col justify-between h-20 active:scale-[0.98] ${
                                            appearance.projection === 'flat'
                                                ? 'bg-sky-500/15 dark:bg-sky-500/25 backdrop-blur-md border-sky-500/40 dark:border-sky-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(14,165,233,0.15)] text-sky-700 dark:text-sky-300 font-bold'
                                                : 'bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                        }`}
                                        style={appearance.projection === 'flat' ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="material-icons-outlined text-lg text-sky-500">map</span>
                                            {appearance.projection === 'flat' && <div className="w-2 h-2 rounded-full bg-sky-500 shadow-[0_0_8px_#0284c7]" />}
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-light-text dark:text-dark-text">2D Mercator Atlas</p>
                                            <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary">High-speed flat navigation</p>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* BASEMAP PALETTE */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider uppercase">Cartographic Basemap</h3>
                                    <span className="text-xs font-medium text-light-text-secondary/70 dark:text-dark-text-secondary/70">3 Curated Tilesets ({isDark ? 'Dark Mode' : 'Light Mode'})</span>
                                </div>

                                <div className="grid grid-cols-3 gap-2.5">
                                    {(isDark ? [
                                        { 
                                            id: 'onyx', 
                                            label: 'Onyx', 
                                            desc: 'High-contrast deep black',
                                            renderSwatch: () => (
                                                <div className="w-full h-8 rounded-xl border border-white/15 flex items-center px-2.5 justify-between bg-gradient-to-r from-black via-zinc-950 to-zinc-900 relative overflow-hidden">
                                                    <div className="flex items-center gap-1.5 z-10">
                                                        <span className="text-2xs">🌑</span>
                                                        <span className="text-2xs font-bold text-white drop-shadow">Onyx</span>
                                                    </div>
                                                    <div className="w-2 h-2 rounded-full border border-white/40 z-10" />
                                                </div>
                                            )
                                        },
                                        { 
                                            id: 'citylights', 
                                            label: 'NASA Lights', 
                                            desc: 'VIIRS night city lights',
                                            renderSwatch: () => (
                                                <div className="w-full h-8 rounded-xl border border-amber-500/30 flex items-center px-2.5 justify-between bg-[#040711] relative overflow-hidden">
                                                    <div className="absolute top-1.5 right-12 w-1.5 h-1.5 rounded-full bg-amber-400/90 shadow-[0_0_6px_#f59e0b] animate-pulse" />
                                                    <div className="absolute bottom-1.5 right-7 w-1 h-1 rounded-full bg-amber-300/80 shadow-[0_0_4px_#f59e0b]" />
                                                    <div className="flex items-center gap-1.5 z-10">
                                                        <span className="text-2xs">✨</span>
                                                        <span className="text-2xs font-bold text-amber-100 drop-shadow-sm">NASA</span>
                                                    </div>
                                                    <div className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b] z-10" />
                                                </div>
                                            )
                                        },
                                        { 
                                            id: 'satellite', 
                                            label: 'Satellite', 
                                            desc: 'High-res Earth observation',
                                            renderSwatch: () => (
                                                <div className="w-full h-8 rounded-xl border border-emerald-500/20 flex items-center px-2.5 justify-between bg-gradient-to-r from-[#0a1a14] to-[#0d2a1f] relative overflow-hidden">
                                                    <div className="flex items-center gap-1.5 z-10">
                                                        <span className="text-2xs">🛰️</span>
                                                        <span className="text-2xs font-bold text-emerald-200">Satellite</span>
                                                    </div>
                                                    <div className="w-2 h-2 rounded-full border border-emerald-400/50 z-10" />
                                                </div>
                                            )
                                        }
                                    ] : [
                                        { 
                                            id: 'snow', 
                                            label: 'Snow', 
                                            desc: 'Clean high-contrast white',
                                            renderSwatch: () => (
                                                <div className="w-full h-8 rounded-xl border border-black/10 flex items-center px-2.5 justify-between bg-gradient-to-r from-zinc-100 via-white to-zinc-200 relative overflow-hidden">
                                                    <div className="flex items-center gap-1.5 z-10">
                                                        <span className="text-2xs">❄️</span>
                                                        <span className="text-2xs font-bold text-zinc-800">Snow</span>
                                                    </div>
                                                    <div className="w-2 h-2 rounded-full border border-zinc-400 z-10" />
                                                </div>
                                            )
                                        },
                                        { 
                                            id: 'vibrant', 
                                            label: 'Vibrant', 
                                            desc: 'Parks, water & terrain',
                                            renderSwatch: () => (
                                                <div className="w-full h-8 rounded-xl border border-emerald-500/30 flex items-center px-2.5 justify-between bg-gradient-to-r from-[#e0f2fe] via-[#ecfdf5] to-[#fef3c7] relative overflow-hidden">
                                                    <div className="flex items-center gap-1.5 z-10">
                                                        <span className="text-2xs">🎨</span>
                                                        <span className="text-2xs font-bold text-emerald-800">Vibrant</span>
                                                    </div>
                                                    <div className="flex items-center gap-1 z-10">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_4px_#38bdf8]" title="Water" />
                                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_#34d399]" title="Parks" />
                                                    </div>
                                                </div>
                                            )
                                        },
                                        { 
                                            id: 'ocean', 
                                            label: 'Bathymetry', 
                                            desc: 'Marine sea floor topography',
                                            renderSwatch: () => (
                                                <div className="w-full h-8 rounded-xl border border-cyan-500/30 flex items-center px-2.5 justify-between bg-gradient-to-r from-[#e0f7fa] to-[#b2ebf2] relative overflow-hidden">
                                                    <div className="flex items-center gap-1.5 z-10">
                                                        <span className="text-2xs">🌊</span>
                                                        <span className="text-2xs font-bold text-cyan-900">Bathymetry</span>
                                                    </div>
                                                    <div className="w-2 h-2 rounded-full border border-cyan-500/60 z-10" />
                                                </div>
                                            )
                                        }
                                    ]).map(b => {
                                        const effectiveBasemap = getEffectiveBasemap(appearance.basemap, isDark);
                                        const isSelected = effectiveBasemap === b.id;
                                        return (
                                            <button
                                                key={b.id}
                                                onClick={() => handleUpdateAppearance({ ...appearance, basemap: b.id as any })}
                                                className={`p-2.5 rounded-2xl border transition-all duration-150 text-left flex flex-col justify-between gap-2 cursor-pointer active:scale-[0.98] ${
                                                    isSelected
                                                        ? 'border-sky-500/40 bg-sky-500/15 dark:bg-sky-500/25 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(14,165,233,0.15)] ring-1 ring-sky-500/30'
                                                        : 'border-black/5 dark:border-white/10 bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm hover:border-black/15 dark:hover:border-white/20'
                                                }`}
                                                style={isSelected ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                            >
                                                {b.renderSwatch()}
                                                <div>
                                                    <p className="text-xs font-bold text-light-text dark:text-dark-text truncate">{b.label}</p>
                                                    <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary line-clamp-1">{b.desc}</p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* PREDEFINED EXPEDITION VIEW MODES */}
                            <div className="p-4 rounded-2xl bg-white/40 dark:bg-white/[0.03] backdrop-blur-sm border border-black/5 dark:border-white/5 space-y-2.5">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-light-text dark:text-dark-text">Expedition View Mode</h4>
                                    <span className={`px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider border ${MAP_MODE_THEMES[viewMode]?.badgeStyle || 'bg-sky-500/10 text-sky-600 border-sky-500/20'}`}>
                                        {MAP_MODE_THEMES[viewMode]?.label || viewMode}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {(['flights', 'land_sea', 'scratch', 'all'] as PredefinedMapMode[]).map((modeKey) => {
                                        const config = MAP_MODE_THEMES[modeKey];
                                        const isSelected = viewMode === modeKey;
                                        const IconComponent = config.icon;
                                        return (
                                            <button
                                                key={modeKey}
                                                type="button"
                                                onClick={() => handleSelectViewMode(modeKey)}
                                                className={`p-2.5 rounded-xl border text-left flex items-start gap-2 cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                                                    isSelected
                                                        ? `${config.cardActiveBg} backdrop-blur-md border ${config.cardActiveBorder} ${config.cardActiveText} font-bold ${config.cardActiveShadow}`
                                                        : 'bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                                }`}
                                                style={isSelected ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                            >
                                                <IconComponent className={`w-4 h-4 mt-0.5 shrink-0 transition-colors duration-200 ${isSelected ? config.color : 'text-light-text-secondary dark:text-dark-text-secondary'}`} />
                                                <div>
                                                    <p className="text-xs font-bold leading-tight">{config.label}</p>
                                                    <p className="text-xs opacity-75 mt-0.5 leading-tight">{config.desc}</p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* SCRATCH EXPLORED CITIES & PINS */}
                            <div className="p-4 rounded-2xl bg-white/40 dark:bg-white/[0.03] backdrop-blur-sm border border-black/5 dark:border-white/5 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-light-text dark:text-dark-text">Scratch City Pins</h4>
                                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Marker sizing & visibility on foil</p>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                                        {appearance.scratchCitySize === 'off' ? 'Hidden' : appearance.scratchCitySize || 'Normal'}
                                    </span>
                                </div>

                                <div className="grid grid-cols-4 gap-1.5">
                                    {[
                                        { id: 'off', label: 'Hidden' },
                                        { id: 'small', label: 'Micro' },
                                        { id: 'medium', label: 'Normal' },
                                        { id: 'large', label: 'Expansive' }
                                    ].map(sz => (
                                        <button
                                            key={sz.id}
                                            type="button"
                                            onClick={() => handleUpdateAppearance({ ...appearance, scratchCitySize: sz.id as any })}
                                            className={`py-2 rounded-xl text-xs font-semibold text-center border transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                                                (appearance.scratchCitySize || 'medium') === sz.id
                                                    ? 'bg-sky-500/20 dark:bg-sky-500/30 backdrop-blur-md text-sky-700 dark:text-sky-300 font-bold border border-sky-500/40 dark:border-sky-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(14,165,233,0.15)]'
                                                    : 'bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text'
                                            }`}
                                            style={(appearance.scratchCitySize || 'medium') === sz.id ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                        >
                                            {sz.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* SCRATCH HIGHLIGHT TOGGLES (LIVED & WISHLIST) */}
                            <div className="p-4 rounded-2xl bg-white/40 dark:bg-white/[0.03] backdrop-blur-sm border border-black/5 dark:border-white/5 space-y-3">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-light-text dark:text-dark-text">Territory Highlights</h4>

                                {/* Lived Residences Toggle */}
                                <div className="flex items-center justify-between pt-1">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-sm">
                                            🏠
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-light-text dark:text-dark-text">Lived Residences</p>
                                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Current & past living territories</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleUpdateAppearance({ 
                                            ...appearance, 
                                            showLivedCountries: appearance.showLivedCountries === false ? true : false 
                                        })}
                                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-black/10 dark:border-white/15 transition-all duration-200 ease-in-out backdrop-blur-md ${
                                            appearance.showLivedCountries !== false 
                                                ? 'bg-emerald-500/85 dark:bg-emerald-500/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_0_10px_rgba(16,185,129,0.3)]' 
                                                : 'bg-black/15 dark:bg-white/15 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]'
                                        }`}
                                    >
                                        <span
                                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-white/95 shadow-[0_1px_3px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.8)] ring-0 transition duration-200 ease-in-out ${
                                                appearance.showLivedCountries !== false ? 'translate-x-5' : 'translate-x-0'
                                            }`}
                                        />
                                    </button>
                                </div>

                                <div className="h-px bg-black/5 dark:bg-white/5" />

                                {/* Layover Territories Toggle */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-sm">
                                            🛫
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-light-text dark:text-dark-text">Layover Territories</p>
                                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Airport connections & transits</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleUpdateAppearance({ 
                                            ...appearance, 
                                            showLayoverCountries: appearance.showLayoverCountries === false ? true : false 
                                        })}
                                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-black/10 dark:border-white/15 transition-all duration-200 ease-in-out backdrop-blur-md ${
                                            appearance.showLayoverCountries !== false 
                                                ? 'bg-amber-500/85 dark:bg-amber-500/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_0_10px_rgba(245,158,11,0.3)]' 
                                                : 'bg-black/15 dark:bg-white/15 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]'
                                        }`}
                                    >
                                        <span
                                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-white/95 shadow-[0_1px_3px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.8)] ring-0 transition duration-200 ease-in-out ${
                                                appearance.showLayoverCountries !== false ? 'translate-x-5' : 'translate-x-0'
                                            }`}
                                        />
                                    </button>
                                </div>

                                <div className="h-px bg-black/5 dark:bg-white/5" />

                                {/* Wishlist Destinations Toggle */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-7 h-7 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-sm">
                                            🌟
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-light-text dark:text-dark-text">Wishlist Destinations</p>
                                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Dream expedition targets</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleUpdateAppearance({ 
                                            ...appearance, 
                                            showWishlistCountries: appearance.showWishlistCountries === false ? true : false 
                                        })}
                                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-black/10 dark:border-white/15 transition-all duration-200 ease-in-out backdrop-blur-md ${
                                            appearance.showWishlistCountries !== false 
                                                ? 'bg-rose-500/85 dark:bg-rose-500/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_0_10px_rgba(244,63,94,0.3)]' 
                                                : 'bg-black/15 dark:bg-white/15 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]'
                                        }`}
                                    >
                                        <span
                                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-white/95 shadow-[0_1px_3px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.8)] ring-0 transition duration-200 ease-in-out ${
                                                appearance.showWishlistCountries !== false ? 'translate-x-5' : 'translate-x-0'
                                            }`}
                                        />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: AVIATION (FLIGHTS, RUNWAYS & ARCS) - INDIGO ACCENT */}
                    {activeSidebarTab === 'aviation' && (
                        <div className="space-y-6">
                            {/* AERODROME RUNWAY INFRASTRUCTURE */}
                            <div className="p-4 rounded-2xl bg-white/40 dark:bg-white/[0.03] backdrop-blur-sm border border-black/5 dark:border-white/5 shadow-sm space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-light-text dark:text-dark-text">Aerodrome Markings</h3>
                                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Physical runways & taxiway architecture</p>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-widest bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                                        {appearance.airportDetail === 'detailed' ? 'True Layout' : 'Beacon'}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2.5">
                                    <button
                                        onClick={() => handleUpdateAppearance({ ...appearance, airportDetail: 'standard' })}
                                        className={`p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                                            appearance.airportDetail === 'standard'
                                                ? 'bg-indigo-500/15 dark:bg-indigo-500/25 backdrop-blur-md border border-indigo-500/40 dark:border-indigo-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(99,102,241,0.15)] text-indigo-700 dark:text-indigo-300 font-bold'
                                                : 'border-black/5 dark:border-white/10 bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                        }`}
                                        style={appearance.airportDetail === 'standard' ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                    >
                                        <p className="text-xs font-bold text-light-text dark:text-dark-text">Minimal Beacon</p>
                                        <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">Clean circular hub nodes</p>
                                    </button>

                                    <button
                                        onClick={() => handleUpdateAppearance({ ...appearance, airportDetail: 'detailed' })}
                                        className={`p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                                            appearance.airportDetail === 'detailed'
                                                ? 'bg-indigo-500/15 dark:bg-indigo-500/25 backdrop-blur-md border border-indigo-500/40 dark:border-indigo-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(99,102,241,0.15)] text-indigo-700 dark:text-indigo-300 font-bold'
                                                : 'border-black/5 dark:border-white/10 bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                        }`}
                                        style={appearance.airportDetail === 'detailed' ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                    >
                                        <p className="text-xs font-bold text-light-text dark:text-dark-text">True Runways</p>
                                        <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">Exact asphalt & taxiways</p>
                                    </button>
                                </div>
                            </div>

                            {/* AIRPORT HUB SIZING */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider uppercase">Airport Hub Nodes</h3>
                                    <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary capitalize">{appearance.airportSize} • {appearance.airportMode}</span>
                                </div>

                                <div className="grid grid-cols-4 gap-1.5 mb-2.5">
                                    {[
                                        { id: 'off', label: 'Hidden' },
                                        { id: 'small', label: 'Micro' },
                                        { id: 'medium', label: 'Normal' },
                                        { id: 'large', label: 'Expansive' }
                                    ].map((sz) => (
                                        <button
                                            key={sz.id}
                                            onClick={() => handleUpdateAppearance({ ...appearance, airportSize: sz.id as any })}
                                            className={`py-2 rounded-xl text-xs font-semibold text-center border transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                                                appearance.airportSize === sz.id
                                                    ? 'bg-indigo-500/20 dark:bg-indigo-500/30 backdrop-blur-md text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-500/40 dark:border-indigo-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(99,102,241,0.15)]'
                                                : 'bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text'
                                            }`}
                                            style={appearance.airportSize === sz.id ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                        >
                                            {sz.label}
                                        </button>
                                    ))}
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => handleUpdateAppearance({ ...appearance, airportMode: 'frequency' })}
                                        className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                                            appearance.airportMode === 'frequency'
                                                ? 'bg-indigo-500/15 dark:bg-indigo-500/25 backdrop-blur-md border border-indigo-500/40 dark:border-indigo-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(99,102,241,0.15)] text-indigo-700 dark:text-indigo-300 font-bold'
                                                : 'border-black/5 dark:border-white/10 bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                        }`}
                                        style={appearance.airportMode === 'frequency' ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                    >
                                        Weighted by Traffic
                                    </button>
                                    <button
                                        onClick={() => handleUpdateAppearance({ ...appearance, airportMode: 'uniform' })}
                                        className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                                            appearance.airportMode === 'uniform'
                                                ? 'bg-indigo-500/15 dark:bg-indigo-500/25 backdrop-blur-md border border-indigo-500/40 dark:border-indigo-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(99,102,241,0.15)] text-indigo-700 dark:text-indigo-300 font-bold'
                                                : 'border-black/5 dark:border-white/10 bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                        }`}
                                        style={appearance.airportMode === 'uniform' ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                    >
                                        Uniform Scale
                                    </button>
                                </div>
                            </div>

                            {/* ROUTE ARCS STYLING */}
                            <div className="space-y-4 pt-3 border-t border-black/5 dark:border-white/5">
                                <h3 className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider uppercase">Route Presentation</h3>

                                {/* Color Palette */}
                                <div>
                                    <span className="text-xs text-light-text dark:text-dark-text font-semibold mb-2 block">Color Palette</span>
                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            { id: 'gradient', label: 'Aurora Gradient', desc: 'Regional spectrum' },
                                            { id: 'frequency', label: 'Heatmap Density', desc: 'Thermal energy spectrum' },
                                            { id: 'default', label: 'Warm Amber', desc: 'Brand accent' }
                                        ].map((cl) => (
                                            <button
                                                key={cl.id}
                                                onClick={() => handleUpdateAppearance({ ...appearance, routeColorMode: cl.id as any })}
                                                className={`p-2.5 rounded-xl border text-left transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                                                    appearance.routeColorMode === cl.id
                                                        ? 'bg-indigo-500/15 dark:bg-indigo-500/25 backdrop-blur-md border border-indigo-500/40 dark:border-indigo-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(99,102,241,0.15)] font-bold text-indigo-700 dark:text-indigo-300'
                                                        : 'border-black/5 dark:border-white/10 bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                                }`}
                                                style={appearance.routeColorMode === cl.id ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                            >
                                                <p className="text-xs font-bold text-light-text dark:text-dark-text">{cl.label}</p>
                                                <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary">{cl.desc}</p>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Scale */}
                                <div>
                                    <span className="text-xs text-light-text dark:text-dark-text font-semibold mb-2 block">Stroke Weight</span>
                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            { id: 'thin', label: 'Fine (1px)' },
                                            { id: 'normal', label: 'Balanced (2px)' },
                                            { id: 'thick', label: 'Bold (3.5px)' }
                                        ].map((sc) => (
                                            <button
                                                key={sc.id}
                                                onClick={() => handleUpdateAppearance({ ...appearance, routeScale: sc.id as any })}
                                                className={`py-2 rounded-xl border text-center transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                                                    appearance.routeScale === sc.id
                                                        ? 'bg-indigo-500/15 dark:bg-indigo-500/25 backdrop-blur-md border border-indigo-500/40 dark:border-indigo-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(99,102,241,0.15)] text-indigo-700 dark:text-indigo-300 font-bold'
                                                        : 'border-black/5 dark:border-white/10 bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                                }`}
                                                style={appearance.routeScale === sc.id ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                            >
                                                <span className="text-xs">{sc.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* ADVANCED ROUTE DYNAMICS */}
                            <div className="space-y-2.5 pt-3 border-t border-black/5 dark:border-white/5">
                                <h3 className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider uppercase">Motion & Dynamics</h3>

                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setShowIndependentFlights(!showIndependentFlights)}
                                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2 cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                                            showIndependentFlights
                                                ? 'bg-indigo-500/15 dark:bg-indigo-500/25 backdrop-blur-md border border-indigo-500/40 dark:border-indigo-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(99,102,241,0.15)] text-indigo-700 dark:text-indigo-300 font-bold'
                                                : 'bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                        }`}
                                        style={showIndependentFlights ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                    >
                                        <Plane className="w-4 h-4 text-indigo-500 shrink-0" />
                                        <span className="text-xs font-bold">Flights Only</span>
                                    </button>

                                    <button
                                        onClick={() => setShowLandSeaRoutes(!showLandSeaRoutes)}
                                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2 cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                                            showLandSeaRoutes
                                                ? 'bg-amber-500/15 dark:bg-amber-500/25 backdrop-blur-md border border-amber-500/40 dark:border-amber-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(245,158,11,0.15)] text-amber-700 dark:text-amber-300 font-bold'
                                                : 'bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                        }`}
                                        style={showLandSeaRoutes ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                    >
                                        <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                                        <span className="text-xs font-bold">Overland Transit</span>
                                    </button>

                                    <button
                                        onClick={() => setAnimateRoutes(!animateRoutes)}
                                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2 cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                                            animateRoutes
                                                ? 'bg-cyan-500/15 dark:bg-cyan-500/25 backdrop-blur-md border border-cyan-500/40 dark:border-cyan-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(6,182,212,0.15)] text-cyan-700 dark:text-cyan-300 font-bold'
                                                : 'bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                        }`}
                                        style={animateRoutes ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                    >
                                        <Play className="w-4 h-4 text-cyan-500 shrink-0" />
                                        <span className="text-xs font-bold">Comet Flow</span>
                                    </button>

                                    <button
                                        onClick={() => setClusterMode(!clusterMode)}
                                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2 cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                                            clusterMode
                                                ? 'bg-purple-500/15 dark:bg-purple-500/25 backdrop-blur-md border border-purple-500/40 dark:border-purple-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(168,85,247,0.15)] text-purple-700 dark:text-purple-300 font-bold'
                                                : 'bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                        }`}
                                        style={clusterMode ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                    >
                                        <Layers className="w-4 h-4 text-purple-500 shrink-0" />
                                        <span className="text-xs font-bold">Cluster Hubs</span>
                                    </button>
                                </div>

                                <div className="space-y-2 pt-2 border-t border-black/5 dark:border-white/5">
                                    {/* Unified Route Tracing (Road, Rail & Sea) */}
                                    <button
                                        onClick={() => {
                                             const newVal = !(showRoadTracing || appearance.routeTracing !== false);
                                             setShowRoadTracing(newVal);
                                             localStorage.setItem('wandergrid_road_tracing', String(newVal));
                                             handleUpdateAppearance({ ...appearance, routeTracing: newVal });
                                         }}
                                         className={`w-full p-2.5 rounded-xl border text-left flex items-center gap-2.5 cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                                             showRoadTracing || appearance.routeTracing !== false
                                                 ? 'bg-indigo-500/15 dark:bg-indigo-500/25 backdrop-blur-md border border-indigo-500/40 dark:border-indigo-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(99,102,241,0.15)] text-indigo-700 dark:text-indigo-300 font-bold'
                                                 : 'bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                         }`}
                                         style={(showRoadTracing || appearance.routeTracing !== false) ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                     >
                                         <Radio className="w-4 h-4 text-indigo-500 shrink-0" />
                                         <div className="min-w-0 flex-1 leading-none">
                                             <p className="text-xs font-bold">Route Tracing (Road & Rail)</p>
                                             <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary mt-1">Conforms driving and rail journeys to real roads and tracks</p>
                                         </div>
                                     </button>
                                 </div>
                             </div>
                         </div>
                     )}

                    {/* TAB 3: ATMOSPHERE (SOLAR & WEATHER TELEMETRY) - AMBER ACCENT */}
                    {activeSidebarTab === 'atmosphere' && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider uppercase mb-3">
                                    Atmospheric Overlays
                                </h3>

                                <div className="space-y-3">
                                    {/* Time of Day */}
                                    <div className="p-4 rounded-2xl bg-white/40 dark:bg-white/[0.03] backdrop-blur-sm border border-black/5 dark:border-white/5 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h4 className="text-xs font-bold text-light-text dark:text-dark-text flex items-center gap-1.5">
                                                    <span>Solar Twilight Shading</span>
                                                    {appearance.timeOfDay && (
                                                        <span className="px-2 py-0.5 text-2xs font-bold rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                                            14-Band Penumbra
                                                        </span>
                                                    )}
                                                </h4>
                                                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">Atmospheric multi-band twilight gradient</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleUpdateAppearance({ ...appearance, timeOfDay: !appearance.timeOfDay })}
                                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-black/10 dark:border-white/15 transition-all duration-200 ease-in-out backdrop-blur-md ${
                                                    appearance.timeOfDay 
                                                        ? 'bg-amber-500/85 dark:bg-amber-500/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_0_10px_rgba(245,158,11,0.3)]' 
                                                        : 'bg-black/15 dark:bg-white/15 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]'
                                                }`}
                                            >
                                                <span
                                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-white/95 shadow-[0_1px_3px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.8)] ring-0 transition duration-200 ease-in-out ${
                                                        appearance.timeOfDay ? 'translate-x-5' : 'translate-x-0'
                                                    }`}
                                                />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Rain Radar */}
                                    <div className="p-4 rounded-2xl bg-white/40 dark:bg-white/[0.03] backdrop-blur-sm border border-black/5 dark:border-white/5 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h4 className="text-xs font-bold text-light-text dark:text-dark-text flex items-center gap-1.5">
                                                    <span>Doppler Rain Radar</span>
                                                    {appearance.rainRadar && (
                                                        <span className="flex items-center gap-1 px-2 py-0.5 text-2xs font-bold rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                            Live Stream
                                                        </span>
                                                    )}
                                                </h4>
                                                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">Global precipitation radar telemetry</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleUpdateAppearance({ ...appearance, rainRadar: !appearance.rainRadar })}
                                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-black/10 dark:border-white/15 transition-all duration-200 ease-in-out backdrop-blur-md ${
                                                    appearance.rainRadar 
                                                        ? 'bg-amber-500/85 dark:bg-amber-500/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_0_10px_rgba(245,158,11,0.3)]' 
                                                        : 'bg-black/15 dark:bg-white/15 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]'
                                                }`}
                                            >
                                                <span
                                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-white/95 shadow-[0_1px_3px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.8)] ring-0 transition duration-200 ease-in-out ${
                                                        appearance.rainRadar ? 'translate-x-5' : 'translate-x-0'
                                                    }`}
                                                />
                                            </button>
                                        </div>

                                        {/* Nested Rain Radar Configuration Options */}
                                        {appearance.rainRadar && (
                                            <div className="pt-2.5 border-t border-black/5 dark:border-white/5 space-y-3 animate-fade-in">
                                                {/* Opacity Slider */}
                                                <div>
                                                    <div className="flex items-center justify-between text-2xs font-bold text-light-text dark:text-dark-text mb-1">
                                                        <span>Radar Intensity</span>
                                                        <span className="text-amber-500">{Math.round((appearance.rainRadarOpacity || 0.85) * 100)}%</span>
                                                    </div>
                                                    <input 
                                                        type="range" 
                                                        min="0.2" 
                                                        max="1.0" 
                                                        step="0.05"
                                                        value={appearance.rainRadarOpacity || 0.85}
                                                        onChange={(e) => handleUpdateAppearance({ ...appearance, rainRadarOpacity: parseFloat(e.target.value) })}
                                                        className="w-full accent-amber-500 cursor-pointer h-1.5 bg-black/10 dark:bg-white/10 rounded-lg"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 4: FILTERS & TIMELINE - EMERALD ACCENT */}
                    {activeSidebarTab === 'filters' && (
                        <div className="space-y-5">
                            {/* Status Filter */}
                            <div>
                                <label className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider uppercase block mb-2">
                                    Trip Status
                                </label>
                                <div className="grid grid-cols-4 gap-1.5">
                                    {[
                                        { id: 'all', label: 'All' },
                                        { id: 'Past', label: 'Past' },
                                        { id: 'Upcoming', label: 'Upcoming' },
                                        { id: 'Planning', label: 'Planning' }
                                    ].map((s) => (
                                        <button
                                            key={s.id}
                                            onClick={() => setStatusFilter(s.id as any)}
                                            className={`py-2 rounded-xl text-xs font-semibold tracking-wide transition-all duration-150 text-center cursor-pointer active:scale-[0.98] ${
                                                statusFilter === s.id
                                                    ? 'bg-emerald-500/20 dark:bg-emerald-500/30 backdrop-blur-md text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-500/40 dark:border-emerald-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(16,185,129,0.15)]'
                                                    : 'bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm border border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text'
                                            }`}
                                            style={statusFilter === s.id ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                        >
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Year Filter */}
                            <div>
                                <label className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider uppercase block mb-2">
                                    Operation Year
                                </label>
                                <LiquidGlassSelect
                                    value={yearFilter}
                                    onChange={setYearFilter}
                                    options={[
                                        { value: 'all', label: 'All Years' },
                                        ...years.map(y => ({ value: y, label: y }))
                                    ]}
                                    placeholder="All Years"
                                    icon={Calendar}
                                    fullWidth
                                />
                            </div>

                            {/* Departure Station */}
                            <div>
                                <label className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider uppercase block mb-2">
                                    Departure Hub
                                </label>
                                <LiquidGlassMultiSelect
                                    placeholder="Any Departure Hub"
                                    options={uniqueAirports.origins}
                                    value={depFilter}
                                    onChange={setDepFilter}
                                    icon={Plane}
                                    searchable
                                    fullWidth
                                />
                            </div>

                            {/* Arrival Station */}
                            <div>
                                <label className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider uppercase block mb-2">
                                    Arrival Hub
                                </label>
                                <LiquidGlassMultiSelect
                                    placeholder="Any Arrival Hub"
                                    options={uniqueAirports.destinations}
                                    value={arrFilter}
                                    onChange={setArrFilter}
                                    icon={MapPin}
                                    searchable
                                    fullWidth
                                />
                            </div>

                            {/* Date Range */}
                            <div>
                                <label className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider uppercase block mb-2">
                                    Temporal Date Range
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <span className="text-2xs text-light-text-secondary dark:text-dark-text-secondary uppercase font-bold block mb-1">From</span>
                                        <input
                                            type="date"
                                            value={dateFrom}
                                            onChange={(e) => setDateFrom(e.target.value)}
                                            className="w-full h-10 sm:h-11 px-3 text-xs font-bold bg-black/5 dark:bg-white/5 text-light-text dark:text-dark-text border border-black/5 dark:border-white/10 rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all cursor-pointer"
                                        />
                                    </div>
                                    <div>
                                        <span className="text-2xs text-light-text-secondary dark:text-dark-text-secondary uppercase font-bold block mb-1">To</span>
                                        <input
                                            type="date"
                                            value={dateTo}
                                            onChange={(e) => setDateTo(e.target.value)}
                                            className="w-full h-10 sm:h-11 px-3 text-xs font-bold bg-black/5 dark:bg-white/5 text-light-text dark:text-dark-text border border-black/5 dark:border-white/10 rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all cursor-pointer"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Reset Active Filters Action */}
                            {(statusFilter !== 'all' || yearFilter !== 'all' || depFilter.length > 0 || arrFilter.length > 0 || dateFrom || dateTo) && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setStatusFilter('all');
                                        setYearFilter('all');
                                        setDepFilter([]);
                                        setArrFilter([]);
                                        setDateFrom('');
                                        setDateTo('');
                                    }}
                                    className="w-full py-2.5 rounded-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98]"
                                >
                                    <X className="w-3.5 h-3.5" weight="bold" />
                                    <span>Reset All Filters</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>
                </GlassPanel>
            </div>
        </div>
    );
};

export default ExpeditionMapView;
