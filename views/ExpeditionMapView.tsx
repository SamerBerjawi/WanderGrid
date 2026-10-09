import React, { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import {
    Compass,
    Globe,
    SlidersHorizontal,
    MapPin,
    CalendarBlank as Calendar,
    MapTrifold as MapIcon,
    Airplane as Plane,
    X,
    ArrowsOut as Maximize,
    ArrowsIn as Minimize,
    EyeSlash
} from '@phosphor-icons/react';
const DeckFlightMap = lazy(() => import('../components/DeckFlightMap').then(m => ({ default: m.DeckFlightMap || m.default })));
import { MapAppearanceModal } from '../components/MapAppearanceModal';
import { motion } from 'motion/react';
import GlassPanel from '../components/glass/GlassPanel';
import { dataService } from '../services/mockDb';
import { runAfterFirstPaint, mapWithConcurrency } from '../services/utils';
import { Trip, CountryResidenceStatus, PredefinedMapMode, getResidenceStatuses } from '../types';
import { GlassSegmented } from '../components/glass/GlassSegmented';
import { GlassDatePicker } from '../components/glass/GlassDatePicker';
import { LiquidGlassSelect, LiquidGlassMultiSelect } from '../components/LiquidGlassSelect';
import { getCoordinates, getCoordinatesSync, STATIC_GEO_DATA, calculateDistance, formatProperLocationName } from '../services/geocoding';
import {
    MapAppearanceSettings,
    DEFAULT_MAP_APPEARANCE,
    loadMapAppearanceSettings,
    saveMapAppearanceSettings
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
    },
    none: {
        label: 'None',
        shortLabel: 'None',
        desc: 'Hiding all routes',
        icon: EyeSlash,
        color: 'text-zinc-500 dark:text-zinc-400',
        activeText: 'text-zinc-700 dark:text-zinc-300',
        activeBg: 'bg-zinc-500/20 dark:bg-zinc-500/30',
        activeBorder: 'border-zinc-500/40 dark:border-zinc-400/50',
        activeShadow: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_2px_10px_rgba(100,100,100,0.3)]',
        badgeStyle: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20',
        cardActiveBg: 'bg-zinc-500/15 dark:bg-zinc-500/25',
        cardActiveBorder: 'border-zinc-500/40 dark:border-zinc-400/50',
        cardActiveText: 'text-zinc-700 dark:text-zinc-300',
        cardActiveShadow: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(100,100,100,0.2)]'
    }
};

export const ExpeditionMapView: React.FC<ExpeditionMapViewProps> = ({ onTripClick, isSidebarCollapsed = false }) => {
    const [trips, setTrips] = useState<Trip[]>([]);
    const [, setLoading] = useState(true);

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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

    const isDark = useDarkMode();

    const handleSelectViewMode = (mode: PredefinedMapMode) => {
        let targetMode = mode;
        if (mode === 'all' && viewMode === 'all') {
            targetMode = 'none';
        } else if (mode === 'all' && viewMode === 'none') {
            targetMode = 'all';
        } else if (mode === 'none' && viewMode === 'none') {
            targetMode = 'all';
        }

        setViewMode(targetMode);
        if (targetMode === 'flights') {
            setShowIndependentFlights(true);
            setShowLandSeaRoutes(false);
            setShowCountries(false);
        } else if (targetMode === 'land_sea') {
            setShowIndependentFlights(false);
            setShowLandSeaRoutes(true);
            setShowCountries(false);
        } else if (targetMode === 'scratch') {
            setShowIndependentFlights(false);
            setShowLandSeaRoutes(false);
            setShowCountries(true);
        } else if (targetMode === 'all') {
            setShowIndependentFlights(true);
            setShowLandSeaRoutes(true);
            setShowCountries(false);
        } else if (targetMode === 'none') {
            setShowIndependentFlights(false);
            setShowLandSeaRoutes(false);
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
        handleClearFilters();
    };

    const handleClearFilters = () => {
        setStatusFilter('all');
        setYearFilter('all');
        setDepFilter([]);
        setArrFilter([]);
        setDateFrom('');
        setDateTo('');
    };

    const activeFilterCount =
        (statusFilter !== 'all' ? 1 : 0) +
        (yearFilter !== 'all' ? 1 : 0) +
        (depFilter.length > 0 ? 1 : 0) +
        (arrFilter.length > 0 ? 1 : 0) +
        (dateFrom || dateTo ? 1 : 0);

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
                        location: `${formatProperLocationName(flight.origin)} ➔ ${formatProperLocationName(flight.destination)}`,
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
                                name: formatProperLocationName(item.name)
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
                                name: formatProperLocationName(tr.origin)
                            });
                        }
                        if (tr.destLat && tr.destLng && tr.destination) {
                            placeMap.set(`${tr.destLat.toFixed(3)},${tr.destLng.toFixed(3)}`, {
                                lat: tr.destLat,
                                lng: tr.destLng,
                                name: formatProperLocationName(tr.destination)
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
            origins: Array.from(origins).sort().map(a => ({ label: formatProperLocationName(a), value: a })),
            destinations: Array.from(destinations).sort().map(a => ({ label: formatProperLocationName(a), value: a }))
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
                    dist = calculateDistance(tr.originLat, tr.originLng, tr.destLat, tr.destLng);
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
            none: {
                count: 0,
                distanceStr: '0 km'
            },
            activeSectorsCount: allCount,
            totalDistanceKm: Math.round(allDist)
        };
    }, [filteredTrips, visitedCountryCodes]);

    const activeSectorsCount = expeditionTypeMetrics.activeSectorsCount;

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
                        appearanceSettings={appearance}
                        onChangeAppearanceSettings={handleUpdateAppearance}
                        onOpenMissionControl={() => setIsSidebarOpen(true)}
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
                            const isAllNoneActive = modeKey === 'all' && viewMode === 'none';
                            const config = isAllNoneActive ? MAP_MODE_THEMES.none : MAP_MODE_THEMES[modeKey];
                            const isSelected = viewMode === modeKey || isAllNoneActive;
                            const IconComponent = config.icon;
                            const metrics = expeditionTypeMetrics[modeKey];
                            return (
                                <button
                                    key={modeKey}
                                    onClick={() => handleSelectViewMode(modeKey)}
                                    title={`${config.label} (${metrics.count} expeditions • ${metrics.distanceStr})`}
                                    className={`relative min-h-[44px] min-w-[44px] rounded-full text-xs font-bold transition-all duration-200 flex flex-col items-center justify-center cursor-pointer select-none active:scale-95 ${isSelected
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
                                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold border transition-colors ${config.badgeStyle} ${isSelected
                                                    ? 'inline shadow-xs'
                                                    : 'hidden sm:inline opacity-90 hover:opacity-100'
                                                }`}>
                                                {metrics.count}
                                            </span>
                                        </span>
                                        <span className="text-[10px] font-mono tracking-tight font-bold text-light-text dark:text-dark-text">
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
                        className={`p-2.5 text-xs font-semibold flex items-center justify-center cursor-pointer transition-all duration-150 active:scale-95 rounded-2xl ${isFullscreen
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
                        className={`px-4 py-2.5 rounded-2xl text-xs font-semibold flex items-center gap-2.5 cursor-pointer transition-all duration-150 active:scale-[0.98] ${isSidebarOpen
                                ? 'bg-primary-500/20 dark:bg-primary-500/30 backdrop-blur-md text-primary-700 dark:text-primary-300 border border-primary-500/40 dark:border-primary-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(234,88,12,0.2)]'
                                : 'text-light-text dark:text-dark-text hover:bg-black/5 dark:hover:bg-white/5'
                            }`}
                        style={isSidebarOpen ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                    >
                        <SlidersHorizontal className={`w-4 h-4 ${isSidebarOpen ? 'text-primary-600 dark:text-primary-400' : 'text-primary-500'} transition-transform duration-300 ${isSidebarOpen ? 'rotate-90' : ''}`} />
                        <span>Controls & Appearance</span>
                        {activeFilterCount > 0 && !isSidebarOpen && (
                            <span className="px-1.5 py-0.5 rounded-full text-3xs font-bold bg-primary-500 text-white leading-none">
                                {activeFilterCount}
                            </span>
                        )}
                    </button>
                </GlassPanel>
            </div>

            {/* 3.5 MOBILE TOP BAR (< md): Telemetry on left, Fullscreen & Controls on right */}
            <div className="flex md:hidden absolute top-[calc(0.75rem+env(safe-area-inset-top,0px))] inset-x-3 z-20 items-center justify-between pointer-events-none safe-x">
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
                                className={`w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-150 active:scale-95 ${isFullscreen
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
                                className={`h-8 px-2.5 rounded-xl flex items-center gap-1.5 text-xs font-bold cursor-pointer transition-all duration-150 active:scale-95 ${isSidebarOpen
                                        ? 'bg-primary-500/20 dark:bg-primary-500/30 text-primary-700 dark:text-primary-300'
                                        : 'text-light-text dark:text-dark-text hover:bg-black/5 dark:hover:bg-white/5'
                                    }`}
                                title="Controls & Appearance"
                                aria-label="Controls & Appearance"
                            >
                                <SlidersHorizontal className={`w-3.5 h-3.5 ${isSidebarOpen ? 'text-primary-600 dark:text-primary-400' : 'text-primary-500'} transition-transform duration-300 ${isSidebarOpen ? 'rotate-90' : ''}`} />
                                <span className="text-2xs font-bold uppercase tracking-wider">Controls</span>
                                {activeFilterCount > 0 && !isSidebarOpen && (
                                    <span className="px-1.5 py-0.5 rounded-full text-3xs font-bold bg-primary-500 text-white leading-none">
                                        {activeFilterCount}
                                    </span>
                                )}
                            </button>
                        </div>
                    </GlassPanel>
                </div>
            </div>

            {/* 3.6 MOBILE BOTTOM FLOATING TAB SELECTOR (< md) - Floating just above bottom navbar */}
            <div className={`flex md:hidden fixed bottom-[calc(4.85rem+env(safe-area-inset-bottom,0px))] inset-x-0 z-40 items-center justify-center px-4 pointer-events-none transition-opacity duration-200 ${isSidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
                }`}>
                <div className="pointer-events-auto w-full max-w-sm">
                    <GlassPanel
                        className="wg-glass-pill shadow-2xl w-full"
                        padding="4px"
                        overrides={{ borderRadius: 9999 }}
                    >
                        <div className="grid grid-cols-4 gap-1 w-full relative">
                            {(['flights', 'land_sea', 'scratch', 'all'] as PredefinedMapMode[]).map((modeKey) => {
                                const isAllNoneActive = modeKey === 'all' && viewMode === 'none';
                                const config = isAllNoneActive ? MAP_MODE_THEMES.none : MAP_MODE_THEMES[modeKey];
                                const isSelected = viewMode === modeKey || isAllNoneActive;
                                const IconComponent = config.icon;
                                const metrics = expeditionTypeMetrics[modeKey];
                                return (
                                    <button
                                        key={modeKey}
                                        onClick={() => handleSelectViewMode(modeKey)}
                                        className={`relative h-12 py-1 rounded-full text-xs font-bold transition-colors duration-200 flex flex-col items-center justify-center cursor-pointer select-none active:scale-95 min-w-0 ${isSelected
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
                                            <span className="text-[8.5px] font-mono tracking-tight font-bold text-light-text dark:text-dark-text mt-0.5">
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

            {/* 4. UNIFIED MISSION CONTROL DRAWER */}
            <MapAppearanceModal
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                settings={appearance}
                onChangeSettings={handleUpdateAppearance}
                onResetCamera={handleRefresh}
                onResetAll={handleResetAll}
                viewMode={viewMode}
                onSelectViewMode={handleSelectViewMode}
                animateRoutes={animateRoutes}
                onToggleAnimateRoutes={() => setAnimateRoutes(!animateRoutes)}
                clusterMode={clusterMode}
                onToggleClusterMode={() => setClusterMode(!clusterMode)}
                showRoadTracing={showRoadTracing}
                onToggleRoadTracing={() => {
                    const newVal = !(showRoadTracing || appearance.routeTracing !== false);
                    setShowRoadTracing(newVal);
                    localStorage.setItem('wandergrid_road_tracing', String(newVal));
                    handleUpdateAppearance({ ...appearance, routeTracing: newVal });
                }}
                activeFilterCount={activeFilterCount}
                onClearFilters={handleClearFilters}
                filterTabContent={
                    <div className="space-y-3">
                        {/* Status Filter */}
                        <div>
                            <label className="text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider uppercase block mb-1.5">
                                Trip Status
                            </label>
                            <GlassSegmented<'all' | 'Past' | 'Upcoming' | 'Planning'>
                                options={[
                                    { id: 'all', label: 'All', accentColor: 'emerald' },
                                    { id: 'Past', label: 'Past', accentColor: 'emerald' },
                                    { id: 'Upcoming', label: 'Upcoming', accentColor: 'emerald' },
                                    { id: 'Planning', label: 'Planning', accentColor: 'emerald' }
                                ]}
                                value={statusFilter}
                                onChange={(val) => setStatusFilter(val)}
                                columns={4}
                                accentColor="emerald"
                            />
                        </div>

                        {/* Year Filter */}
                        <div>
                            <label className="text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider uppercase block mb-1.5">
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
                            <label className="text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider uppercase block mb-1.5">
                                Departure Hub
                            </label>
                            <LiquidGlassMultiSelect
                                placeholder="Any airport"
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
                            <label className="text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider uppercase block mb-1.5">
                                Arrival Hub
                            </label>
                            <LiquidGlassMultiSelect
                                placeholder="Any airport"
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
                            <label className="text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider uppercase block mb-1.5">
                                Date Range
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <span className="text-3xs text-light-text-secondary dark:text-dark-text-secondary uppercase font-bold block mb-0.5">From</span>
                                    <GlassDatePicker
                                        value={dateFrom}
                                        onChange={setDateFrom}
                                        placeholder="Select date"
                                        accentColor="emerald"
                                    />
                                </div>
                                <div>
                                    <span className="text-3xs text-light-text-secondary dark:text-dark-text-secondary uppercase font-bold block mb-0.5">To</span>
                                    <GlassDatePicker
                                        value={dateTo}
                                        onChange={setDateTo}
                                        placeholder="Select date"
                                        accentColor="emerald"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Reset Active Filters Action */}
                        {activeFilterCount > 0 && (
                            <button
                                type="button"
                                onClick={handleClearFilters}
                                className="w-full py-2.5 rounded-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98]"
                            >
                                <X className="w-3.5 h-3.5" weight="bold" />
                                <span>Reset All Filters</span>
                            </button>
                        )}
                    </div>
                }
            />
        </div>
    );
};

export default ExpeditionMapView;
