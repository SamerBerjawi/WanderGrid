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
import { Trip, CountryResidenceStatus, PredefinedMapMode } from '../types';
import { Input, MultiSelect } from '../components/ui';
import { getCoordinates, getCoordinatesSync, STATIC_GEO_DATA } from '../services/geocoding';
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
    const [activeSidebarTab, setActiveSidebarTab] = useState<'atlas' | 'aviation' | 'atmosphere' | 'filters'>('atlas');

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
    const [countryStatusMap, setCountryStatusMap] = useState<Record<string, CountryResidenceStatus>>({});
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
                const statusMap: Record<string, CountryResidenceStatus> = {};
                const placeMap = new Map<string, { lat: number; lng: number; name: string }>();

                // 1. From database visited collection
                if (visited && visited.length > 0) {
                    visited.forEach(item => {
                        const code = item.code ? item.code.toUpperCase() : (item.countryCode ? item.countryCode.toUpperCase() : '');
                        const name = item.name ? item.name.toUpperCase() : (item.countryName ? item.countryName.toUpperCase() : '');

                        if (item.isTransit || item.residenceStatus === 'layover') {
                            if (code) statusMap[code] = 'layover';
                            if (name) statusMap[name] = 'layover';
                        } else {
                            if (item.type === 'country' && code && item.residenceStatus !== 'wishlist') {
                                countrySet.add(code);
                            } else if (item.countryCode && item.residenceStatus !== 'wishlist') {
                                countrySet.add(item.countryCode.toUpperCase());
                            }

                            if (item.residenceStatus) {
                                if (code) statusMap[code] = item.residenceStatus;
                                if (name) statusMap[name] = item.residenceStatus;
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

    const handleUpdateCountryStatus = async (countryCode: string, countryName: string, status: CountryResidenceStatus | 'none') => {
        try {
            const visitedList = await dataService.getVisited();
            const upperCode = (countryCode || '').toUpperCase();
            const upperName = (countryName || '').toUpperCase();

            const existing = (visitedList || []).find((v: any) => 
                (v.type === 'country' && v.code && v.code.toUpperCase() === upperCode) ||
                (v.name && v.name.toUpperCase() === upperName)
            );

            if (status === 'none') {
                if (existing) {
                    await dataService.deleteVisited(existing.id);
                }
            } else {
                if (existing) {
                    await dataService.updateVisited({
                        ...existing,
                        residenceStatus: status,
                        isTransit: status === 'layover',
                        name: countryName || existing.name
                    });
                } else {
                    await dataService.addVisited({
                        id: `visited-country-${upperCode || Date.now()}`,
                        type: 'country',
                        code: upperCode,
                        name: countryName,
                        residenceStatus: status,
                        isTransit: status === 'layover',
                        isManual: true,
                        visitDate: new Date().toISOString().split('T')[0]
                    });
                }
            }

            setCountryStatusMap(prev => {
                const next = { ...prev };
                if (status === 'none') {
                    if (upperCode) delete next[upperCode];
                    if (upperName) delete next[upperName];
                } else {
                    if (upperCode) next[upperCode] = status;
                    if (upperName) next[upperName] = status;
                }
                return next;
            });

            if (status === 'visited' || status === 'lived_current' || status === 'lived_past') {
                if (upperCode && !visitedCountryCodes.includes(upperCode)) {
                    setVisitedCountryCodes(prev => [...prev, upperCode]);
                }
            } else if (status === 'layover' || status === 'wishlist' || status === 'none') {
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
        <div className="relative w-full h-full overflow-hidden bg-light-bg dark:bg-[#050505] select-none">
            {/* 1. 100% FULL-SCREEN DECK.GL WEBGL MAP */}
            <div className="absolute inset-0 w-full h-full">
                <Suspense fallback={
                    <div className="w-full h-full flex flex-col items-center justify-center bg-light-bg dark:bg-[#050505] space-y-4">
                        <Compass className="w-10 h-10 text-primary-500 animate-[spin_4s_linear_infinite]" />
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
                    />
                </Suspense>
            </div>

            {/* 2. FLOATING TOP HUD BAR (Brand & Telemetry) */}
            <div className="absolute top-5 left-5 z-20 flex items-center gap-3 pointer-events-none">
                {/* Brand & Status Pill */}
                <div className="pointer-events-auto bg-white/80 dark:bg-dark-card/85 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl px-4 py-2.5 shadow-glass-card flex items-center gap-3.5 transition-all">
                    <div className="w-8 h-8 rounded-xl bg-primary-500/15 border border-primary-500/25 flex items-center justify-center text-primary-500 shrink-0">
                        <Compass className="w-4 h-4 animate-[spin_20s_linear_infinite]" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-light-text dark:text-dark-text tracking-tight leading-none">WanderGrid Atlas</span>
                            <span className="flex h-2 w-2 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                            </span>
                        </div>
                        <p className="text-[9px] font-semibold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider mt-0.5 leading-none">
                            {activeSectorsCount} Active Sectors • {totalDistanceKm.toLocaleString()} KM
                        </p>
                    </div>
                </div>
            </div>

            {/* 2.5 FLOATING TOP-CENTER PREDEFINED VIEW MODES SELECTOR */}
            <div className="absolute top-5 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
                <div className="flex p-1 bg-white/85 dark:bg-dark-card/90 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl shadow-glass-card gap-1">
                    {[
                        { id: 'flights', label: 'Flights', icon: Plane },
                        { id: 'land_sea', label: 'Land & Sea', icon: Compass },
                        { id: 'scratch', label: 'Scratch', icon: MapIcon },
                        { id: 'all', label: 'All Expeditions', icon: Globe }
                    ].map((m) => (
                        <button
                            key={m.id}
                            onClick={() => handleSelectViewMode(m.id as PredefinedMapMode)}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                                viewMode === m.id
                                    ? 'bg-primary-500 text-white shadow-sm'
                                    : 'text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text hover:bg-black/5 dark:hover:bg-white/5'
                            }`}
                        >
                            <m.icon className="w-3.5 h-3.5" />
                            <span>{m.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* 3. FLOATING TOP RIGHT CONTROLS TOGGLE */}
            <div className="absolute top-5 right-5 z-20 flex items-center gap-2">
                <button
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className={`px-4 py-2.5 rounded-2xl shadow-glass-card backdrop-blur-xl text-xs font-semibold flex items-center gap-2.5 cursor-pointer transition-all duration-150 active:scale-[0.98] border ${
                        isSidebarOpen 
                            ? 'bg-primary-500 text-white border-primary-400/40 shadow-primary-500/25 ring-2 ring-primary-500/30'
                            : 'bg-white/80 dark:bg-dark-card/85 hover:bg-white/95 dark:hover:bg-dark-card/95 text-light-text dark:text-dark-text border-black/10 dark:border-white/10'
                    }`}
                >
                    <SlidersHorizontal className={`w-4 h-4 ${isSidebarOpen ? 'text-white' : 'text-primary-500'} transition-transform duration-300 ${isSidebarOpen ? 'rotate-90' : ''}`} />
                    <span>Controls & Appearance</span>
                </button>
            </div>

            {/* 4. SLIDE-IN RIGHT SIDEBAR CONTROL PANEL */}
            <div 
                className={`fixed md:absolute top-0 right-0 h-full w-full sm:w-[420px] max-w-full bg-white/90 dark:bg-dark-card/90 backdrop-blur-2xl border-l border-black/10 dark:border-white/15 shadow-glass-modal z-40 flex flex-col transition-transform duration-300 ease-out select-none ${
                    isSidebarOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
                }`}
                style={{ WebkitBackdropFilter: 'blur(40px)' }}
            >
                {/* Sidebar Header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-black/5 dark:border-white/5 bg-gradient-to-r from-primary-500/5 to-transparent shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-primary-500/15 border border-primary-500/25 flex items-center justify-center text-primary-500">
                            <SlidersHorizontal className="w-4 h-4" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-light-text dark:text-dark-text tracking-tight">Mission Control</h2>
                            <p className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary font-medium">Map Telemetry & Controls</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={handleRefresh}
                            className="p-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text transition-colors cursor-pointer"
                            title="Sync coordinates & network"
                        >
                            <RefreshCw className="w-3.5 h-3.5 hover:rotate-180 transition-transform duration-500" />
                        </button>
                        <button
                            onClick={handleResetAll}
                            className="p-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text transition-colors cursor-pointer"
                            title="Reset to defaults"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={() => setIsSidebarOpen(false)}
                            className="p-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text transition-colors cursor-pointer"
                            title="Close sidebar"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Unified Segmented Navigation Tab Bar */}
                <div className="px-6 py-3 border-b border-black/5 dark:border-white/5 shrink-0">
                    <div className="flex p-1 bg-black/5 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/5 gap-1">
                        {[
                            { id: 'atlas', label: 'Atlas', icon: MapIcon },
                            { id: 'aviation', label: 'Aviation', icon: Plane },
                            { id: 'atmosphere', label: 'Atmosphere', icon: Layers },
                            { id: 'filters', label: 'Filters', icon: Filter }
                        ].map((tab) => {
                            const isSelected = activeSidebarTab === tab.id;
                            const IconComponent = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveSidebarTab(tab.id as 'atlas' | 'aviation' | 'atmosphere' | 'filters')}
                                    className={`flex-1 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all duration-150 flex items-center justify-center gap-1.5 cursor-pointer ${
                                        isSelected
                                            ? 'bg-white dark:bg-dark-card text-primary-500 shadow-sm font-bold border border-black/5 dark:border-white/10'
                                            : 'text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text opacity-70 hover:opacity-100'
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
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar text-light-text dark:text-dark-text">
                    {/* TAB 1: ATLAS (CARTOGRAPHY & PROJECTION) */}
                    {activeSidebarTab === 'atlas' && (
                        <div className="space-y-6">
                            {/* PROJECTION ENGINE */}
                            <div className="p-4 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 shadow-sm space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 rounded-xl bg-primary-500/10 text-primary-500 border border-primary-500/20">
                                            <Compass className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <h3 className="text-xs font-bold uppercase tracking-wider text-light-text dark:text-dark-text">Projection Engine</h3>
                                            <p className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary">Orbital WebGL 3D Globe or 2D Mercator</p>
                                        </div>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20">
                                        {appearance.projection === 'globe' ? '3D Orbital' : '2D Planar'}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2.5 pt-1">
                                    <button
                                        onClick={() => handleUpdateAppearance({ ...appearance, projection: 'globe' })}
                                        className={`p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer relative overflow-hidden flex flex-col justify-between h-20 active:scale-[0.98] ${
                                            appearance.projection === 'globe'
                                                ? 'bg-primary-500/10 border-primary-500 ring-2 ring-primary-500/30 text-primary-600 dark:text-primary-400 font-bold shadow-sm'
                                                : 'bg-white/70 dark:bg-dark-card/60 border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="material-icons-outlined text-lg text-primary-500">public</span>
                                            {appearance.projection === 'globe' && <div className="w-2 h-2 rounded-full bg-primary-500 shadow-[0_0_8px_#fa9a1d]" />}
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-light-text dark:text-dark-text">3D Celestial Globe</p>
                                            <p className="text-[9px] text-light-text-secondary dark:text-dark-text-secondary">True spherical geometry</p>
                                        </div>
                                    </button>

                                    <button
                                        onClick={() => handleUpdateAppearance({ ...appearance, projection: 'flat' })}
                                        className={`p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer relative overflow-hidden flex flex-col justify-between h-20 active:scale-[0.98] ${
                                            appearance.projection === 'flat'
                                                ? 'bg-primary-500/10 border-primary-500 ring-2 ring-primary-500/30 text-primary-600 dark:text-primary-400 font-bold shadow-sm'
                                                : 'bg-white/70 dark:bg-dark-card/60 border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="material-icons-outlined text-lg text-primary-500">map</span>
                                            {appearance.projection === 'flat' && <div className="w-2 h-2 rounded-full bg-primary-500 shadow-[0_0_8px_#fa9a1d]" />}
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-light-text dark:text-dark-text">2D Mercator Atlas</p>
                                            <p className="text-[9px] text-light-text-secondary dark:text-dark-text-secondary">High-speed flat navigation</p>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* BASEMAP PALETTE */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider uppercase">Cartographic Basemap</h3>
                                    <span className="text-[10px] font-medium text-light-text-secondary/70 dark:text-dark-text-secondary/70">4 Curated Tilesets</span>
                                </div>

                                <div className="grid grid-cols-2 gap-2.5">
                                    {[
                                        { 
                                            id: 'default', 
                                            label: 'Adaptive Atlas', 
                                            desc: 'Auto theme matching (Day/Night)',
                                            renderSwatch: () => (
                                                <div className="w-full h-8 rounded-xl border border-black/10 dark:border-white/15 flex items-center px-2.5 justify-between bg-gradient-to-r from-zinc-200 to-zinc-300 dark:from-zinc-950 dark:to-zinc-800 relative overflow-hidden">
                                                    <div className="flex items-center gap-1.5 z-10">
                                                        <span className="text-[10px]">🌙</span>
                                                        <span className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300">Dark</span>
                                                        <span className="text-[9px] text-zinc-400">/</span>
                                                        <span className="text-[10px]">☀️</span>
                                                        <span className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300">Light</span>
                                                    </div>
                                                    <div className="w-2 h-2 rounded-full border border-black/30 dark:border-white/40 z-10" />
                                                </div>
                                            )
                                        },
                                        { 
                                            id: 'citylights', 
                                            label: 'NASA Earth at Night', 
                                            desc: 'VIIRS HD city light radiance',
                                            renderSwatch: () => (
                                                <div className="w-full h-8 rounded-xl border border-amber-500/30 flex items-center px-2.5 justify-between bg-[#040711] relative overflow-hidden">
                                                    <div className="absolute top-2 left-10 w-1 h-1 rounded-full bg-amber-400 shadow-[0_0_4px_#f59e0b] animate-pulse" />
                                                    <div className="absolute bottom-2 left-20 w-1.5 h-1.5 rounded-full bg-amber-300 shadow-[0_0_6px_#f59e0b]" />
                                                    <div className="flex items-center gap-1.5 z-10">
                                                        <span className="text-[10px]">✨</span>
                                                        <span className="text-[10px] font-bold text-amber-200">NASA Lights</span>
                                                    </div>
                                                    <div className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b] z-10" />
                                                </div>
                                            )
                                        },
                                        { 
                                            id: 'satellite', 
                                            label: 'Earth Observation', 
                                            desc: 'High-res orbital imagery',
                                            renderSwatch: () => (
                                                <div className="w-full h-8 rounded-xl border border-emerald-500/20 flex items-center px-2.5 justify-between bg-gradient-to-r from-[#0a1a14] to-[#0d2a1f] relative overflow-hidden">
                                                    <div className="flex items-center gap-1.5 z-10">
                                                        <span className="text-[10px]">🛰️</span>
                                                        <span className="text-[10px] font-bold text-emerald-200">Satellite</span>
                                                    </div>
                                                    <div className="w-2 h-2 rounded-full border border-emerald-400/50 z-10" />
                                                </div>
                                            )
                                        },
                                        { 
                                            id: 'ocean', 
                                            label: 'Ocean Bathymetry', 
                                            desc: 'Marine sea floor topography',
                                            renderSwatch: () => (
                                                <div className="w-full h-8 rounded-xl border border-cyan-500/20 flex items-center px-2.5 justify-between bg-gradient-to-r from-[#041424] to-[#08223a] relative overflow-hidden">
                                                    <div className="flex items-center gap-1.5 z-10">
                                                        <span className="text-[10px]">🌊</span>
                                                        <span className="text-[10px] font-bold text-cyan-200">Bathymetry</span>
                                                    </div>
                                                    <div className="w-2 h-2 rounded-full border border-cyan-400/50 z-10" />
                                                </div>
                                            )
                                        }
                                    ].map(b => (
                                        <button
                                            key={b.id}
                                            onClick={() => handleUpdateAppearance({ ...appearance, basemap: b.id as any })}
                                            className={`p-3 rounded-2xl border transition-all duration-150 text-left flex flex-col justify-between gap-2 cursor-pointer active:scale-[0.98] ${
                                                appearance.basemap === b.id
                                                    ? 'border-primary-500 bg-primary-500/10 ring-2 ring-primary-500/30'
                                                    : 'border-black/5 dark:border-white/10 bg-white/70 dark:bg-dark-card/60 hover:border-black/15 dark:hover:border-white/20'
                                            }`}
                                        >
                                            {b.renderSwatch()}
                                            <div>
                                                <p className="text-xs font-bold text-light-text dark:text-dark-text">{b.label}</p>
                                                <p className="text-[9px] text-light-text-secondary dark:text-dark-text-secondary">{b.desc}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* PREDEFINED EXPEDITION VIEW MODES */}
                            <div className="p-4 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-2.5">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-light-text dark:text-dark-text">Expedition View Mode</h4>
                                    <span className="px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20">
                                        {viewMode}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { id: 'flights', label: 'Flights', desc: 'Aviation arcs & hubs', icon: Plane },
                                        { id: 'land_sea', label: 'Land & Sea', desc: 'Road trips & rail', icon: Compass },
                                        { id: 'scratch', label: 'Scratch Map', desc: 'Territory explorer', icon: MapIcon },
                                        { id: 'all', label: 'All Expeditions', desc: 'Full unified network', icon: Globe }
                                    ].map(m => (
                                        <button
                                            key={m.id}
                                            type="button"
                                            onClick={() => handleSelectViewMode(m.id as PredefinedMapMode)}
                                            className={`p-2.5 rounded-xl border text-left flex items-start gap-2 cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                                                viewMode === m.id
                                                    ? 'bg-primary-500/15 border-primary-500 text-primary-600 dark:text-primary-400 font-bold ring-1 ring-primary-500/30 shadow-sm'
                                                    : 'bg-white/70 dark:bg-dark-card/60 border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                            }`}
                                        >
                                            <m.icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${viewMode === m.id ? 'text-primary-500' : 'text-light-text-secondary dark:text-dark-text-secondary'}`} />
                                            <div>
                                                <p className="text-xs font-bold leading-tight">{m.label}</p>
                                                <p className="text-[9px] opacity-75 mt-0.5 leading-tight">{m.desc}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* SCRATCH EXPLORED CITIES & PINS */}
                            <div className="p-4 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-light-text dark:text-dark-text">Scratch City Pins</h4>
                                        <p className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary">Marker sizing & visibility on foil</p>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20 capitalize">
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
                                                    ? 'bg-primary-500 text-white font-bold border-primary-400 shadow-sm'
                                                    : 'bg-white/70 dark:bg-dark-card/60 border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text'
                                            }`}
                                        >
                                            {sz.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* SCRATCH HIGHLIGHT TOGGLES (LIVED & WISHLIST) */}
                            <div className="p-4 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-3">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-light-text dark:text-dark-text">Territory Highlights</h4>

                                {/* Lived Residences Toggle */}
                                <div className="flex items-center justify-between pt-1">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-sm">
                                            🏠
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-light-text dark:text-dark-text">Lived Residences</p>
                                            <p className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary">Current & past living territories</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleUpdateAppearance({ 
                                            ...appearance, 
                                            showLivedCountries: appearance.showLivedCountries === false ? true : false 
                                        })}
                                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                                            appearance.showLivedCountries !== false ? 'bg-emerald-500' : 'bg-black/20 dark:bg-white/20'
                                        }`}
                                    >
                                        <span
                                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
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
                                            <p className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary">Airport connections & transits</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleUpdateAppearance({ 
                                            ...appearance, 
                                            showLayoverCountries: appearance.showLayoverCountries === false ? true : false 
                                        })}
                                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                                            appearance.showLayoverCountries !== false ? 'bg-amber-500' : 'bg-black/20 dark:bg-white/20'
                                        }`}
                                    >
                                        <span
                                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
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
                                            <p className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary">Dream expedition targets</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleUpdateAppearance({ 
                                            ...appearance, 
                                            showWishlistCountries: appearance.showWishlistCountries === false ? true : false 
                                        })}
                                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                                            appearance.showWishlistCountries !== false ? 'bg-rose-500' : 'bg-black/20 dark:bg-white/20'
                                        }`}
                                    >
                                        <span
                                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                                appearance.showWishlistCountries !== false ? 'translate-x-5' : 'translate-x-0'
                                            }`}
                                        />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: AVIATION (FLIGHTS, RUNWAYS & ARCS) */}
                    {activeSidebarTab === 'aviation' && (
                        <div className="space-y-6">
                            {/* AERODROME RUNWAY INFRASTRUCTURE */}
                            <div className="p-4 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 shadow-sm space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-light-text dark:text-dark-text">Aerodrome Markings</h3>
                                        <p className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary">Physical runways & taxiway architecture</p>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20">
                                        {appearance.airportDetail === 'detailed' ? 'True Layout' : 'Beacon'}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2.5">
                                    <button
                                        onClick={() => handleUpdateAppearance({ ...appearance, airportDetail: 'standard' })}
                                        className={`p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                                            appearance.airportDetail === 'standard'
                                                ? 'border-primary-500 bg-primary-500/10 ring-2 ring-primary-500/30 text-primary-600 dark:text-primary-400 font-bold'
                                                : 'border-black/5 dark:border-white/10 bg-white/70 dark:bg-dark-card/60 text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                        }`}
                                    >
                                        <p className="text-xs font-bold text-light-text dark:text-dark-text">Minimal Beacon</p>
                                        <p className="text-[9px] text-light-text-secondary dark:text-dark-text-secondary mt-0.5">Clean circular hub nodes</p>
                                    </button>

                                    <button
                                        onClick={() => handleUpdateAppearance({ ...appearance, airportDetail: 'detailed' })}
                                        className={`p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                                            appearance.airportDetail === 'detailed'
                                                ? 'border-primary-500 bg-primary-500/10 ring-2 ring-primary-500/30 text-primary-600 dark:text-primary-400 font-bold'
                                                : 'border-black/5 dark:border-white/10 bg-white/70 dark:bg-dark-card/60 text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                        }`}
                                    >
                                        <p className="text-xs font-bold text-light-text dark:text-dark-text">True Runways</p>
                                        <p className="text-[9px] text-light-text-secondary dark:text-dark-text-secondary mt-0.5">Exact asphalt & taxiways</p>
                                    </button>
                                </div>
                            </div>

                            {/* AIRPORT HUB SIZING */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider uppercase">Airport Hub Nodes</h3>
                                    <span className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary capitalize">{appearance.airportSize} • {appearance.airportMode}</span>
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
                                                    ? 'bg-primary-500 text-white font-bold border-primary-400 shadow-sm'
                                                    : 'bg-white/70 dark:bg-dark-card/60 border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text'
                                            }`}
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
                                                ? 'border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-400 font-bold'
                                                : 'border-black/5 dark:border-white/10 bg-white/70 dark:bg-dark-card/60 text-light-text-secondary dark:text-dark-text-secondary'
                                        }`}
                                    >
                                        Weighted by Traffic
                                    </button>
                                    <button
                                        onClick={() => handleUpdateAppearance({ ...appearance, airportMode: 'uniform' })}
                                        className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                                            appearance.airportMode === 'uniform'
                                                ? 'border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-400 font-bold'
                                                : 'border-black/5 dark:border-white/10 bg-white/70 dark:bg-dark-card/60 text-light-text-secondary dark:text-dark-text-secondary'
                                        }`}
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
                                                        ? 'border-primary-500 bg-primary-500/10 ring-2 ring-primary-500/30 font-bold'
                                                        : 'border-black/5 dark:border-white/10 bg-white/70 dark:bg-dark-card/60 hover:border-black/15 dark:hover:border-white/20'
                                                }`}
                                            >
                                                <p className="text-xs font-bold text-light-text dark:text-dark-text">{cl.label}</p>
                                                <p className="text-[9px] text-light-text-secondary dark:text-dark-text-secondary">{cl.desc}</p>
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
                                                        ? 'border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-400 font-bold'
                                                        : 'border-black/5 dark:border-white/10 bg-white/70 dark:bg-dark-card/60 text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                                }`}
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
                                                ? 'bg-primary-500/15 border-primary-500/40 text-primary-600 dark:text-primary-400 font-bold'
                                                : 'bg-white/70 dark:bg-dark-card/60 border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary'
                                        }`}
                                    >
                                        <Plane className="w-3.5 h-3.5 text-primary-500" />
                                        <span className="text-xs font-bold">Flights Only</span>
                                    </button>

                                    <button
                                        onClick={() => setShowLandSeaRoutes(!showLandSeaRoutes)}
                                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2 cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                                            showLandSeaRoutes
                                                ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400 font-bold'
                                                : 'bg-white/70 dark:bg-dark-card/60 border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary'
                                        }`}
                                    >
                                        <Zap className="w-3.5 h-3.5 text-amber-500" />
                                        <span className="text-xs font-bold">Overland Transit</span>
                                    </button>

                                    <button
                                        onClick={() => setAnimateRoutes(!animateRoutes)}
                                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2 cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                                            animateRoutes
                                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-bold'
                                                : 'bg-white/70 dark:bg-dark-card/60 border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary'
                                        }`}
                                    >
                                        <Play className="w-3.5 h-3.5 text-emerald-500" />
                                        <span className="text-xs font-bold">Comet Flow</span>
                                    </button>

                                    <button
                                        onClick={() => setClusterMode(!clusterMode)}
                                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2 cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                                            clusterMode
                                                ? 'bg-primary-500/15 border-primary-500/40 text-primary-600 dark:text-primary-400 font-bold'
                                                : 'bg-white/70 dark:bg-dark-card/60 border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary'
                                        }`}
                                    >
                                        <Layers className="w-3.5 h-3.5 text-primary-500" />
                                        <span className="text-xs font-bold">Cluster Hubs</span>
                                    </button>
                                </div>

                                <button
                                    onClick={() => {
                                        const newVal = !showRoadTracing;
                                        setShowRoadTracing(newVal);
                                        localStorage.setItem('wandergrid_road_tracing', String(newVal));
                                    }}
                                    className={`w-full p-2.5 rounded-xl border text-left flex items-center gap-2.5 cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                                        showRoadTracing
                                            ? 'bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400 font-bold'
                                            : 'bg-white/70 dark:bg-dark-card/60 border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary'
                                    }`}
                                >
                                    <Radio className="w-4 h-4 text-rose-500 shrink-0" />
                                    <div className="min-w-0 flex-1 leading-none">
                                        <p className="text-xs font-bold">Highway Route Tracing (OSRM)</p>
                                        <p className="text-[9px] text-light-text-secondary dark:text-dark-text-secondary mt-1">Conform overland journeys to real roads</p>
                                    </div>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* TAB 3: ATMOSPHERE (SOLAR & WEATHER TELEMETRY) */}
                    {activeSidebarTab === 'atmosphere' && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider uppercase mb-3">
                                    Atmospheric Overlays
                                </h3>

                                <div className="space-y-3">
                                    {/* Time of Day */}
                                    <div className="p-4 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h4 className="text-xs font-bold text-light-text dark:text-dark-text flex items-center gap-1.5">
                                                    <span>Solar Twilight Shading</span>
                                                    {appearance.timeOfDay && (
                                                        <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20">
                                                            14-Band Penumbra
                                                        </span>
                                                    )}
                                                </h4>
                                                <p className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary mt-0.5">Atmospheric multi-band twilight gradient</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleUpdateAppearance({ ...appearance, timeOfDay: !appearance.timeOfDay })}
                                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                                                    appearance.timeOfDay ? 'bg-primary-500' : 'bg-black/20 dark:bg-white/20'
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
                                    <div className="p-4 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h4 className="text-xs font-bold text-light-text dark:text-dark-text flex items-center gap-1.5">
                                                    <span>Doppler Rain Radar</span>
                                                    {appearance.rainRadar && (
                                                        <span className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                            Live Stream
                                                        </span>
                                                    )}
                                                </h4>
                                                <p className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary mt-0.5">Global precipitation radar telemetry</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleUpdateAppearance({ ...appearance, rainRadar: !appearance.rainRadar })}
                                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                                                    appearance.rainRadar ? 'bg-primary-500' : 'bg-black/20 dark:bg-white/20'
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
                                            <div className="pt-2.5 border-t border-black/5 dark:border-white/5 space-y-3 animate-fade-in">
                                                {/* Opacity Slider */}
                                                <div>
                                                    <div className="flex items-center justify-between text-[10px] font-bold text-light-text dark:text-dark-text mb-1">
                                                        <span>Radar Intensity</span>
                                                        <span className="text-primary-500">{Math.round((appearance.rainRadarOpacity || 0.85) * 100)}%</span>
                                                    </div>
                                                    <input 
                                                        type="range" 
                                                        min="0.2" 
                                                        max="1.0" 
                                                        step="0.05"
                                                        value={appearance.rainRadarOpacity || 0.85}
                                                        onChange={(e) => handleUpdateAppearance({ ...appearance, rainRadarOpacity: parseFloat(e.target.value) })}
                                                        className="w-full accent-primary-500 cursor-pointer h-1.5 bg-black/10 dark:bg-white/10 rounded-lg"
                                                    />
                                                </div>
                                            </div>
                                        )}
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
                                <label className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider uppercase block mb-2">
                                    Trip Status
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['all', 'Past', 'Upcoming'].map((s) => (
                                        <button
                                            key={s}
                                            onClick={() => setStatusFilter(s as any)}
                                            className={`py-2 rounded-xl text-xs font-semibold tracking-wide transition-all duration-150 text-center cursor-pointer active:scale-[0.98] ${
                                                statusFilter === s
                                                    ? 'bg-primary-500 text-white font-bold shadow-sm border border-primary-400/30'
                                                    : 'bg-white/70 dark:bg-dark-card/60 border border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text'
                                            }`}
                                        >
                                            {s === 'all' ? 'All' : s}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Year Filter */}
                            <div>
                                <label className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider uppercase block mb-2">
                                    Operation Year
                                </label>
                                <select
                                    value={yearFilter}
                                    onChange={(e) => setYearFilter(e.target.value)}
                                    className="w-full bg-white dark:bg-dark-card border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 text-xs font-bold text-light-text dark:text-dark-text outline-none cursor-pointer focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
                                >
                                    <option value="all">All Years</option>
                                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>

                            {/* Departure Station */}
                            <div>
                                <label className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider uppercase block mb-2">
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
                                <label className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider uppercase block mb-2">
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
                                <label className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider uppercase block mb-2">
                                    Temporal Date Range
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <span className="text-[9px] text-light-text-secondary dark:text-dark-text-secondary uppercase font-bold block mb-1">From</span>
                                        <Input
                                            type="date"
                                            value={dateFrom}
                                            onChange={(e) => setDateFrom(e.target.value)}
                                            className="!py-1.5 !px-2.5 !text-xs !font-bold bg-white dark:bg-dark-card text-light-text dark:text-dark-text border border-black/10 dark:border-white/10 rounded-xl"
                                        />
                                    </div>
                                    <div>
                                        <span className="text-[9px] text-light-text-secondary dark:text-dark-text-secondary uppercase font-bold block mb-1">To</span>
                                        <Input
                                            type="date"
                                            value={dateTo}
                                            onChange={(e) => setDateTo(e.target.value)}
                                            className="!py-1.5 !px-2.5 !text-xs !font-bold bg-white dark:bg-dark-card text-light-text dark:text-dark-text border border-black/10 dark:border-white/10 rounded-xl"
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
