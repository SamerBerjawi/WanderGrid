
import React, { useEffect, useState, useMemo, lazy, Suspense } from 'react';
const ExpeditionMap = lazy(() => import('../components/ExpeditionMap').then(m => ({ default: m.ExpeditionMap })));
const ExpeditionMap3D = lazy(() => import('../components/ExpeditionMap3D').then(m => ({ default: m.ExpeditionMap3D })));
import { dataService } from '../services/mockDb';
import { Trip } from '../types';
import { Input, MultiSelect } from '../components/ui';
import { resolvePlaceName, getCoordinates, getCoordinatesSync } from '../services/geocoding';
import { runAfterFirstPaint, mapWithConcurrency } from '../services/utils';

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

const GEO_CONCURRENCY_LIMIT = 6;

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

const getGreatCircleDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371; // Earth's radius in km
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
    const [mapType, setMapType] = useState<'2D' | '3D'>('2D');
    const [viewMode, setViewMode] = useState<'network' | 'scratch'>('network');
    const [trips, setTrips] = useState<Trip[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Map Visual Settings
    const [showFrequencyWeight, setShowFrequencyWeight] = useState(false);
    const [animateRoutes, setAnimateRoutes] = useState(false);
    const [showCountries, setShowCountries] = useState(false); 
    const [activeLayer, setActiveLayer] = useState<'standard' | 'satellite' | 'topography' | 'hillshade'>('standard');
    const [clusterMode, setClusterMode] = useState<boolean>(false);
    const [showLandSeaRoutes, setShowLandSeaRoutes] = useState<boolean>(true);
    const [showCityMarkers, setShowCityMarkers] = useState<boolean>(true);
    const [screenshotTrigger, setScreenshotTrigger] = useState<number>(0);
    const [isScreenshotting, setIsScreenshotting] = useState<boolean>(false);
    const [isCollapsed, setIsCollapsed] = useState(true);
    const [showIndependentFlights, setShowIndependentFlights] = useState(true);
    const [showRoadTracing, setShowRoadTracing] = useState<boolean>(() => {
        return localStorage.getItem('wandergrid_road_tracing') === 'true';
    });

    // AirTrail Visual Customizations
    const [hideAirportCircles, setHideAirportCircles] = useState(false);
    const [airportCircleSize, setAirportCircleSize] = useState(2);
    const [proportionalArcThickness, setProportionalArcThickness] = useState(false);
    const [showAviationCharts, setShowAviationCharts] = useState(false);

    // Data for Highlights
    const [visitedCountryCodes, setVisitedCountryCodes] = useState<string[]>([]);
    const [visitedPlaces, setVisitedPlaces] = useState<{lat: number, lng: number, name: string}[]>([]);

    const [refreshTrigger, setRefreshTrigger] = useState(0);

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

    // Filters
    const [statusFilter, setStatusFilter] = useState<'all' | 'Past' | 'Upcoming' | 'Planning'>('all');
    const [yearFilter, setYearFilter] = useState<string>('all');
    const [depFilter, setDepFilter] = useState<string[]>([]);
    const [arrFilter, setArrFilter] = useState<string[]>([]);
    const [dateFrom, setDateFrom] = useState<string>('');
    const [dateTo, setDateTo] = useState<string>('');
    const [focusCoord, setFocusCoord] = useState<{ lat: number, lng: number } | null>(null);

    const isDark = useDarkMode();

    useEffect(() => {
        setLoading(true);
        Promise.all([
            dataService.getTrips(),
            dataService.getFlights(),
            dataService.getRoadTrips()
        ]).then(([loadedTrips, loadedFlights, loadedRoadTrips]) => {
            const coordCache = getCoordCache();

            // Merge independent road trips into independent flights list safely to avoid duplicated IDs
            const flightIds = new Set((loadedFlights || []).map(f => f.id));
            const combinedFlights = [...(loadedFlights || [])];
            (loadedRoadTrips || []).forEach(rt => {
                if (!flightIds.has(rt.id)) {
                    combinedFlights.push(rt);
                    flightIds.add(rt.id);
                }
            });
            const loadedFlightsCombined = combinedFlights;

            // Try to resolve coordinates instantly using local cache only to prevent blocking the UI
            const getLocalCoordsSync = (place: string) => {
                if (!place) return null;
                const clean = place.trim();
                const uppercaseLoc = clean.toUpperCase();
                
                // Check if it is already in our local cache Map
                const cached = coordCache.get(clean) || coordCache.get(uppercaseLoc);
                if (cached) {
                    return { lat: cached.lat, lng: cached.lng };
                }

                // Fallback to fast synchronous database/IATA lookup before checking network
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

            // First draw: Render as much as possible instantly
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

                    return {
                        id: `independent-flight-${flight.id}`,
                        name: `Independent: ${flight.provider} ${flight.identifier || 'Flight'}`,
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

            // Display immediately to unblock UI
            setTrips([...initialTrips, ...makeSyntheticTrips(initialFlights)]);
            setLoading(false);

            // Now, run full asynchronous geocoding in the background to resolve any missing coords without blocking
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

    // Calculate Visited Countries & Cities
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
                    return;
                }
            } catch (err) {
                console.warn("Could not query Visited collection from database in Map View, using fallback resolution:", err);
            }

            const countryCodes = new Set<string>();
            // Reuse cache from LocalStorage if available (shared with Gamification and Goe-API)
            const placeCacheRaw = localStorage.getItem('wandergrid_geo_cache_v3') || localStorage.getItem('wandergrid_geo_cache_v2');
            const placeDetailsCache = placeCacheRaw ? new Map(JSON.parse(placeCacheRaw)) : new Map();
            const coordinateCache = getCoordCache();
            let coordsDirty = false;
            
            const placesToCheckForCountry = new Set<string>();
            const placesToCheckForCoords = new Set<string>(); // Map Name -> LatLng
            const finalPlaces: { lat: number, lng: number, name: string }[] = [];
            const processedPlaceKeys = new Set<string>(); // "lat,lng"

            trips.forEach(t => {
                if (t.status !== 'Past') return;
                
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

                    // Waypoints (Stops)
                    tr.waypoints?.forEach(wp => {
                        if (wp.name) placesToCheckForCountry.add(wp.name);
                        
                        if (wp.coordinates) {
                            const key = `${wp.coordinates.lat.toFixed(4)},${wp.coordinates.lng.toFixed(4)}`;
                            if (!processedPlaceKeys.has(key)) {
                                finalPlaces.push({ lat: wp.coordinates.lat, lng: wp.coordinates.lng, name: wp.name });
                                processedPlaceKeys.add(key);
                            }
                        } else if (wp.name) {
                            placesToCheckForCoords.add(wp.name);
                        }
                    });
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

            // Resolve Countries First (Fast update)
            const countryPlaces = Array.from(placesToCheckForCountry);
            const countryResults = await mapWithConcurrency(countryPlaces, async (place) => {
                if (placeDetailsCache.has(place)) {
                    return placeDetailsCache.get(place).countryCode as string | undefined;
                }
                const res = await resolvePlaceName(place);
                return res?.countryCode;
            }, GEO_CONCURRENCY_LIMIT);

            countryResults.forEach((code) => {
                if (code && code.length === 2) countryCodes.add(code.toUpperCase());
            });
            
            // UPDATE COUNTRIES IMMEDIATELY
            setVisitedCountryCodes(Array.from(countryCodes));

            // Resolve Coords for missing items (Slower update)
            const coordPlaces = Array.from(placesToCheckForCoords);
            const coordResults = await mapWithConcurrency(coordPlaces, async (place) => {
                let coords = coordinateCache.get(place);
                if (!coords) {
                    const res = await getCoordinates(place);
                    if (res) {
                        coords = { lat: res.lat, lng: res.lng };
                        coordinateCache.set(place, coords);
                        coordsDirty = true;
                    }
                }
                return { place, coords };
            }, GEO_CONCURRENCY_LIMIT);

            coordResults.forEach(({ place, coords }) => {
                if (!coords) return;
                const key = `${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}`;
                if (!processedPlaceKeys.has(key)) {
                    finalPlaces.push({ lat: coords.lat, lng: coords.lng, name: place });
                    processedPlaceKeys.add(key);
                }
            });

            if (coordsDirty) saveCoordCache(coordinateCache);

            // UPDATE CITY DOTS LATER
            setVisitedPlaces(finalPlaces);
        };

        if (trips.length > 0) {
            runAfterFirstPaint(() => {
                void processGeoData();
            });
        }
    }, [trips, refreshTrigger]);

    // Derived Data
    const years = useMemo(() => {
        const y = new Set<number>();
        trips.forEach(t => {
            if (t.startDate) {
                const year = new Date(t.startDate).getFullYear();
                if (!isNaN(year)) y.add(year);
            }
        });
        return Array.from(y).sort((a,b) => b - a);
    }, [trips]);

    const filteredTrips = useMemo(() => {
        const today = new Date();
        today.setHours(0,0,0,0);

        return trips.filter(t => {
            if (!showIndependentFlights && t.id.startsWith('independent-flight-')) {
                return false;
            }

            const tStart = t.startDate ? new Date(t.startDate) : null;
            const tEnd = t.endDate ? new Date(t.endDate) : (tStart || null);
            
            let matchesStatus = true;
            if (statusFilter === 'Past') {
                matchesStatus = tEnd ? tEnd < today : true;
            } else if (statusFilter === 'Upcoming') {
                matchesStatus = t.status === 'Upcoming' && (tEnd ? tEnd >= today : true);
            } else if (statusFilter === 'Planning') {
                matchesStatus = t.status === 'Planning';
            }

            let matchesYear = true;
            if (yearFilter !== 'all') {
                matchesYear = tStart ? tStart.getFullYear().toString() === yearFilter : false;
            }

            const matchesFrom = !dateFrom || (tEnd && tEnd >= new Date(dateFrom));
            const matchesTo = !dateTo || (tStart && tStart <= new Date(dateTo));
            const matchesDep = depFilter.length === 0 || (t.transports?.some(tr => depFilter.includes(tr.origin)) ?? false);
            const matchesArr = arrFilter.length === 0 || (t.transports?.some(tr => arrFilter.includes(tr.destination)) ?? false);

            return matchesStatus && matchesYear && matchesFrom && matchesTo && matchesDep && matchesArr;
        });
    }, [trips, statusFilter, yearFilter, dateFrom, dateTo, depFilter, arrFilter, showIndependentFlights]);

    const totalDistanceKm = useMemo(() => {
        let sum = 0;
        filteredTrips.forEach(t => {
            t.transports?.forEach(tr => {
                if (tr.originLat && tr.originLng && tr.destLat && tr.destLng) {
                    sum += getGreatCircleDistance(tr.originLat, tr.originLng, tr.destLat, tr.destLng);
                }
            });
        });
        return Math.round(sum);
    }, [filteredTrips]);

    const activeSectorsCount = useMemo(() => {
        let count = 0;
        filteredTrips.forEach(t => {
            if (t.transports) {
                count += t.transports.length;
            }
        });
        return count;
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
                     {/* HERO HEADER - OPERATIONS COMMAND DECK */}
            <div className="bg-white dark:bg-gray-900 rounded-[2rem] p-6 shadow-xl border border-gray-100 dark:border-white/5 flex flex-col gap-6 shrink-0 relative overflow-visible z-20 transition-all duration-300">
                <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

                {/* ROW 1: Operations Header & Live Metrics Deck */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 w-full relative z-10">
                    <div className="flex items-center justify-between w-full lg:w-auto gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-xl shadow-indigo-500/20 shrink-0">
                                <span className="material-icons-outlined text-2xl animate-pulse">explore</span>
                            </div>
                            <div>
                                <h2 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white tracking-tight leading-tight">
                                    Operations Command Deck
                                </h2>
                                <p className="text-[10px] md:text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mt-1 flex items-center gap-1.5">
                                    <span className="flex h-2 w-2 relative">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                    </span>
                                    Telemetry Network Uplink
                                </p>
                            </div>
                        </div>

                        {/* Toggle Collapse Button */}
                        <button 
                            onClick={() => setIsCollapsed(!isCollapsed)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200/60 dark:border-white/10 text-slate-700 dark:text-slate-300 font-extrabold text-xs transition-colors shadow-sm"
                        >
                            <span className="material-icons-outlined text-sm">{isCollapsed ? 'settings_suggest' : 'close'}</span>
                            {isCollapsed ? 'Configure' : 'Close'}
                        </button>
                    </div>

                    {/* DYNAMIC OPERATION METRICS */}
                    <div className="grid grid-cols-2 md:flex md:flex-row items-center gap-3 w-full lg:w-auto">
                        <div className="bg-slate-50/80 dark:bg-black/45 rounded-2xl px-4 py-3 border border-slate-100 dark:border-white/5 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow">
                            <div className="w-9 h-9 rounded-xl bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                                <span className="material-icons-outlined text-lg">public</span>
                            </div>
                            <div className="min-w-0">
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 truncate">Total Sphere Range</p>
                                <p className="text-sm md:text-base font-black text-slate-900 dark:text-white tracking-tight mt-0.5 truncate leading-none">
                                    {totalDistanceKm.toLocaleString()}<span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 ml-0.5">KM</span>
                                </p>
                                <p className="text-[9px] text-slate-400 dark:text-slate-500 truncate mt-0.5 font-medium">
                                    {(Math.round(totalDistanceKm * 0.621371)).toLocaleString()} MI
                                </p>
                            </div>
                        </div>

                        <div className="bg-slate-50/80 dark:bg-black/45 rounded-2xl px-4 py-3 border border-slate-100 dark:border-white/5 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow">
                            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                                <span className="material-icons-outlined text-lg">hub</span>
                            </div>
                            <div className="min-w-0">
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 truncate">Connected Hubs</p>
                                <p className="text-sm md:text-base font-black text-slate-900 dark:text-white tracking-tight mt-0.5 truncate leading-none">
                                    {activeSectorsCount} <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">Sectors</span>
                                </p>
                                <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1 font-semibold">Active Vectors</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* REDESIGNED BENTO COMMAND HUB */}
                <div className={`transition-all duration-300 flex flex-col gap-6 relative z-10 ${isCollapsed ? 'hidden' : 'flex'}`}>
                    <div className="h-px bg-slate-100 dark:bg-white/5 w-full" />
                    
                    {/* BENTO GRID: Fully adaptive grid across phones, tablets, and computers */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                        
                        {/* BENTO CARD 1: Projection & Coordinates Engine */}
                        <div className="bg-slate-50/50 dark:bg-black/20 p-4 rounded-2xl border border-slate-200/40 dark:border-white/5 flex flex-col justify-between gap-3 shadow-inner">
                            <div>
                                <span className="text-[10.5px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-2.5">
                                    I. Projection Engine
                                </span>
                                <div className="flex flex-col gap-2">
                                    {/* Projection Mode (2D / 3D) */}
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Projection:</span>
                                        <div className="flex p-0.5 bg-slate-200/50 dark:bg-black/30 rounded-xl border border-slate-300/30 dark:border-white/5 shrink-0">
                                            <button 
                                                onClick={() => setMapType('2D')}
                                                className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
                                                    mapType === '2D' 
                                                    ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-white shadow-sm' 
                                                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                                                }`}
                                            >
                                                <span className="material-icons-outlined text-xs">map</span> 2D
                                            </button>
                                            <button 
                                                onClick={() => setMapType('3D')}
                                                className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
                                                    mapType === '3D' 
                                                    ? 'bg-white dark:bg-gray-700 text-purple-600 dark:text-white shadow-sm' 
                                                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                                                }`}
                                            >
                                                <span className="material-icons-outlined text-xs">public</span> 3D
                                            </button>
                                        </div>
                                    </div>

                                    {/* Map overlay visualization style (Network / Scratch) */}
                                    {mapType === '2D' && (
                                        <div className="flex items-center justify-between gap-2 mt-1">
                                            <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Plot Type:</span>
                                            <div className="flex p-0.5 bg-slate-200/50 dark:bg-black/30 rounded-xl border border-slate-300/30 dark:border-white/5 shrink-0">
                                                <button 
                                                    onClick={() => setViewMode('network')}
                                                    className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
                                                        viewMode === 'network' 
                                                        ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-white shadow-sm' 
                                                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                                                    }`}
                                                >
                                                    <span className="material-icons-outlined text-xs">hub</span> Network
                                                </button>
                                                <button 
                                                    onClick={() => setViewMode('scratch')}
                                                    className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
                                                        viewMode === 'scratch' 
                                                        ? 'bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 shadow-sm' 
                                                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                                                    }`}
                                                >
                                                    <span className="material-icons-outlined text-xs">flag</span> Scratch
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Highlight Lands Toggles (only visible in 2D) */}
                                    {mapType === '2D' && (
                                        <div className="flex items-center justify-between gap-2 mt-1">
                                            <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Crossed Lands:</span>
                                            <div className="flex p-0.5 bg-slate-200/50 dark:bg-black/30 rounded-xl border border-slate-300/30 dark:border-white/5 shrink-0">
                                                <button 
                                                    onClick={() => setShowCountries(true)}
                                                    className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
                                                        showCountries 
                                                        ? 'bg-white dark:bg-gray-700 text-rose-600 dark:text-white shadow-sm' 
                                                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                                                    }`}
                                                >
                                                    Highlight
                                                </button>
                                                <button 
                                                    onClick={() => setShowCountries(false)}
                                                    className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
                                                        !showCountries 
                                                        ? 'bg-white dark:bg-gray-700 text-slate-600 dark:text-white shadow-sm' 
                                                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                                                    }`}
                                                >
                                                    Off
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* BENTO CARD 2: Map Presentation Toggles (Core request!) */}
                        <div className="bg-slate-50/50 dark:bg-black/20 p-4 rounded-2xl border border-slate-200/40 dark:border-white/5 flex flex-col justify-between gap-3 shadow-inner">
                            <div>
                                <div className="flex items-center justify-between mb-2.5">
                                    <span className="text-[10.5px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                                        II. Presentation Controls
                                    </span>
                                    <button 
                                        onClick={handleRefresh}
                                        className="text-[9px] font-extrabold text-blue-500 hover:text-blue-600 bg-blue-500/10 hover:bg-blue-500/20 px-2 py-0.5 rounded transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                                        title="Clear coordinate caches and reload all geocoding / route paths"
                                    >
                                        <span className="material-icons-outlined text-xs">refresh</span>
                                        Refresh Routes
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 gap-1.5">
                                    {/* 1. FLIGHTS */}
                                    <button
                                        onClick={() => setShowIndependentFlights(!showIndependentFlights)}
                                        className={`p-1.5 rounded-xl border text-left font-bold transition-all flex items-center gap-1.5 ${
                                            showIndependentFlights
                                            ? 'bg-purple-500/10 border-purple-500/20 text-purple-600 dark:text-purple-400 shadow-sm'
                                            : 'bg-white dark:bg-white/5 border-slate-200/60 dark:border-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                                        }`}
                                        title="Toggle Independent Flights"
                                    >
                                        <span className="material-icons-outlined text-sm">flight</span>
                                        <div className="min-w-0 flex-1 leading-none">
                                            <p className="text-[8px] font-black uppercase tracking-widest opacity-60">Flights</p>
                                            <p className="text-[9.5px] font-extrabold mt-0.5 truncate">{showIndependentFlights ? 'Routes On' : 'Hidden'}</p>
                                        </div>
                                    </button>

                                    {/* 2. TRANSIT */}
                                    <button
                                        onClick={() => setShowLandSeaRoutes(!showLandSeaRoutes)}
                                        className={`p-1.5 rounded-xl border text-left font-bold transition-all flex items-center gap-1.5 ${
                                            showLandSeaRoutes
                                            ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400 shadow-sm'
                                            : 'bg-white dark:bg-white/5 border-slate-200/60 dark:border-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                                        }`}
                                        title={showLandSeaRoutes ? "Hide Land/Sea vehicle paths" : "Display Land/Sea vehicle paths"}
                                    >
                                        <span className="material-icons-outlined text-sm">commute</span>
                                        <div className="min-w-0 flex-1 leading-none">
                                            <p className="text-[8px] font-black uppercase tracking-widest opacity-60">Transit</p>
                                            <p className="text-[9.5px] font-extrabold mt-0.5 truncate">{showLandSeaRoutes ? 'Routes On' : 'Hidden'}</p>
                                        </div>
                                    </button>

                                    {/* 3. CITIES */}
                                    <button
                                        onClick={() => setShowCityMarkers(!showCityMarkers)}
                                        className={`p-1.5 rounded-xl border text-left font-bold transition-all flex items-center gap-1.5 ${
                                            showCityMarkers
                                            ? 'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400 shadow-sm'
                                            : 'bg-white dark:bg-white/5 border-slate-200/60 dark:border-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                                        }`}
                                        title={showCityMarkers ? "Hide City labels on the map" : "Display major city endpoints"}
                                    >
                                        <span className="material-icons-outlined text-sm">location_city</span>
                                        <div className="min-w-0 flex-1 leading-none">
                                            <p className="text-[8px] font-black uppercase tracking-widest opacity-60">Cities</p>
                                            <p className="text-[9.5px] font-extrabold mt-0.5 truncate">{showCityMarkers ? 'Visible' : 'Hidden'}</p>
                                        </div>
                                    </button>

                                    {/* 4. CLUSTER */}
                                    <button
                                        onClick={() => setClusterMode(!clusterMode)}
                                        className={`p-1.5 rounded-xl border text-left font-bold transition-all flex items-center gap-1.5 ${
                                            clusterMode
                                            ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400 shadow-sm'
                                            : 'bg-white dark:bg-white/5 border-slate-200/60 dark:border-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                                        }`}
                                        title={clusterMode ? "Disable marker group combining" : "Group overlapping airport nodes"}
                                    >
                                        <span className="material-icons-outlined text-sm">layers</span>
                                        <div className="min-w-0 flex-1 leading-none">
                                            <p className="text-[8px] font-black uppercase tracking-widest opacity-60">Cluster</p>
                                            <p className="text-[9.5px] font-extrabold mt-0.5 truncate">{clusterMode ? 'Active' : 'Disabled'}</p>
                                        </div>
                                    </button>

                                    {/* 5. COMET FLOW */}
                                    <button
                                        onClick={() => setAnimateRoutes(!animateRoutes)}
                                        className={`p-1.5 rounded-xl border text-left font-bold transition-all flex items-center gap-1.5 ${
                                            animateRoutes
                                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400 shadow-sm'
                                            : 'bg-white dark:bg-white/5 border-slate-200/60 dark:border-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                                        }`}
                                        title="Toggle Animated Pulse Lines"
                                    >
                                        <span className="material-icons-outlined text-sm">play_arrow</span>
                                        <div className="min-w-0 flex-1 leading-none">
                                            <p className="text-[8px] font-black uppercase tracking-widest opacity-60">Comet Flow</p>
                                            <p className="text-[9.5px] font-extrabold mt-0.5 truncate">{animateRoutes ? 'Active' : 'Off'}</p>
                                        </div>
                                    </button>

                                    {/* 6. WEIGHT FLOW */}
                                    <button
                                        onClick={() => setShowFrequencyWeight(!showFrequencyWeight)}
                                        className={`p-1.5 rounded-xl border text-left font-bold transition-all flex items-center gap-1.5 ${
                                            showFrequencyWeight
                                            ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-600 dark:text-cyan-400 shadow-sm'
                                            : 'bg-white dark:bg-white/5 border-slate-200/60 dark:border-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                                        }`}
                                        title="Line thickness changes with route replication"
                                    >
                                        <span className="material-icons-outlined text-sm">line_weight</span>
                                        <div className="min-w-0 flex-1 leading-none">
                                            <p className="text-[8px] font-black uppercase tracking-widest opacity-60">Weight Flow</p>
                                            <p className="text-[9.5px] font-extrabold mt-0.5 truncate">{showFrequencyWeight ? 'Active' : 'Off'}</p>
                                        </div>
                                    </button>

                                    {/* 7. ROAD TRACING (OSRM) */}
                                    <button
                                        onClick={() => {
                                            const newVal = !showRoadTracing;
                                            setShowRoadTracing(newVal);
                                            localStorage.setItem('wandergrid_road_tracing', String(newVal));
                                        }}
                                        className={`col-span-2 p-1.5 rounded-xl border text-left font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                            showRoadTracing
                                            ? 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400 shadow-sm'
                                            : 'bg-white dark:bg-white/5 border-slate-200/60 dark:border-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                                        }`}
                                        title={showRoadTracing ? "Disable realistic land route tracing over OSRM" : "Trace land routes along actual roads using OpenStreetMap/OSRM"}
                                    >
                                        <span className="material-icons-outlined text-sm">alt_route</span>
                                        <div className="min-w-0 flex-1 leading-none">
                                            <p className="text-[8px] font-black uppercase tracking-widest opacity-60">Realistic Land Trails (OSRM)</p>
                                            <p className="text-[9.5px] font-extrabold mt-0.5 truncate">{showRoadTracing ? 'Enabled (Actual Roads)' : 'Disabled (Arcs Only)'}</p>
                                        </div>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* BENTO CARD 3: Location Connectivity Filter */}
                        <div className="bg-slate-50/50 dark:bg-black/20 p-4 rounded-2xl border border-slate-200/40 dark:border-white/5 flex flex-col justify-between gap-3 shadow-inner">
                            <div>
                                <span className="text-[10.5px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1.5">
                                    III. Global Hub Routing
                                </span>
                                <div className="space-y-2">
                                    <div>
                                        <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Departure Station</p>
                                        <MultiSelect 
                                            placeholder="Any Departure Hub"
                                            options={uniqueAirports.origins}
                                            value={depFilter}
                                            onChange={setDepFilter}
                                        />
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Arrival Station</p>
                                        <MultiSelect 
                                            placeholder="Any Arrival Hub"
                                            options={uniqueAirports.destinations}
                                            value={arrFilter}
                                            onChange={setArrFilter}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* BENTO CARD 4: Time Span & Quick Filters */}
                        <div className="bg-slate-50/50 dark:bg-black/20 p-4 rounded-2xl border border-slate-200/40 dark:border-white/5 flex flex-col justify-between gap-3 shadow-inner">
                            <div>
                                <span className="text-[10.5px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1.5">
                                    IV. Temporal Range
                                </span>
                                <div className="space-y-2.5">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">From Date</label>
                                            <Input 
                                                type="date" 
                                                value={dateFrom} 
                                                onChange={(e) => setDateFrom(e.target.value)} 
                                                className="!py-1 !px-2 !text-[11px] !font-bold !h-8 bg-white dark:bg-white/5 text-gray-800 dark:text-white border border-slate-200/60 dark:border-white/10"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">To Date</label>
                                            <Input 
                                                type="date" 
                                                value={dateTo} 
                                                onChange={(e) => setDateTo(e.target.value)} 
                                                className="!py-1 !px-2 !text-[11px] !font-bold !h-8 bg-white dark:bg-white/5 text-gray-800 dark:text-white border border-slate-200/60 dark:border-white/10"
                                            />
                                        </div>
                                    </div>

                                    {/* Year Select & Timeline buttons */}
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex items-center gap-2 justify-between">
                                            <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500">Operation Year:</span>
                                            <select 
                                                value={yearFilter}
                                                onChange={(e) => setYearFilter(e.target.value)}
                                                className="bg-white dark:bg-black text-[10.5px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 outline-none px-2 py-1 cursor-pointer rounded-lg border border-slate-200 dark:border-white/10"
                                            >
                                                <option value="all">All Years</option>
                                                {years.map(y => <option key={y} value={y}>{y}</option>)}
                                            </select>
                                        </div>

                                        <div className="flex p-0.5 bg-slate-200/50 dark:bg-black/30 rounded-xl border border-slate-300/30 dark:border-white/5 w-full justify-between">
                                            {['all', 'Upcoming', 'Past'].map((s) => (
                                                <button
                                                    key={s}
                                                    onClick={() => setStatusFilter(s as any)}
                                                    className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex-1 text-center ${
                                                        statusFilter === s 
                                                        ? 'bg-white dark:bg-gray-700 text-black dark:text-white shadow-sm font-black' 
                                                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                                                    }`}
                                                >
                                                    {s === 'all' ? 'All' : s}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
            
            {/* CONTENT AREA */}
            <div className="flex-1 min-h-0 w-full overflow-hidden flex flex-col gap-6 relative z-10">
                {/* FULL-SCREEN GEOSPATIAL MAP COMMAND PANEL */}
                <div className="flex-1 min-h-0 rounded-[2rem] lg:rounded-[2.5rem] overflow-hidden border border-gray-200 dark:border-white/5 shadow-2xl relative bg-black flex flex-col">
                    <Suspense fallback={
                        <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950/70 border border-white/5 space-y-4">
                            <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Booting Real-Time Vector Engine...</p>
                        </div>
                    }>
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
                                activeLayer={activeLayer}
                                onChangeActiveLayer={setActiveLayer}
                                clusterMode={clusterMode}
                                onToggleClusterMode={setClusterMode}
                                showLandSeaRoutes={showLandSeaRoutes}
                                onToggleLandSeaRoutes={setShowLandSeaRoutes}
                                showFlightRoutes={showIndependentFlights}
                                showCityMarkers={showCityMarkers}
                                onToggleCityMarkers={setShowCityMarkers}
                                hideAirportCircles={hideAirportCircles}
                                airportCircleSize={airportCircleSize}
                                proportionalArcThickness={proportionalArcThickness}
                                showAviationCharts={showAviationCharts}
                                focusTransportCoordinates={focusCoord}
                                screenshotTrigger={screenshotTrigger}
                                onScreenshotStarted={() => setIsScreenshotting(true)}
                                onScreenshotCompleted={() => setIsScreenshotting(false)}
                                showRoadTracing={showRoadTracing}
                                onToggleRoadTracing={setShowRoadTracing}
                            />
                        ) : (
                            <ExpeditionMap3D
                                key={`3d-${isDark ? 'dark' : 'light'}`}
                                trips={filteredTrips}
                                onTripClick={onTripClick}
                                animateRoutes={animateRoutes}
                                showFrequencyWeight={showFrequencyWeight}
                                activeLayer={activeLayer === 'topography' ? 'night' : (activeLayer === 'standard' ? 'standard' : 'satellite')}
                                onActiveLayerChange={(layer: 'standard' | 'night' | 'satellite') => {
                                    if (layer === 'night') {
                                        setActiveLayer('topography');
                                    } else {
                                        setActiveLayer(layer);
                                    }
                                }}
                                focusTransportCoordinates={focusCoord}
                                showFlightRoutes={showIndependentFlights}
                                showLandSeaRoutes={showLandSeaRoutes}
                            />
                        )}
                    </Suspense>
                    
                    {trips.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center z-[500] pointer-events-none">
                            <div className="bg-black/80 backdrop-blur-md p-8 rounded-3xl border border-white/10 text-center animate-pulse">
                                <span className="material-icons-outlined text-4xl text-gray-500 mb-4">public_off</span>
                                <h3 className="text-xl font-bold text-white">No Geospatial Data Loaded</h3>
                                <p className="text-gray-400 text-sm mt-2 max-w-xs">Add trips with aviation coordinates or airport endpoints in the main logs to display sectors.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const getStatusBadgeClass = (status: string) => {
    switch (status) {
        case 'Confirmed':
        case 'Upcoming':
            return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-900/40';
        case 'Past':
            return 'bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400 border border-blue-200/50 dark:border-blue-900/40';
        case 'Planning':
            return 'bg-amber-50 text-amber-700 dark:bg-[#1e150a] dark:text-amber-400 border border-amber-200/50 dark:border-amber-900/40';
        default:
            return 'bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-200 border border-slate-200/50 dark:border-white/10';
    }
};
