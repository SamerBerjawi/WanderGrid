
import React, { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { 
    Compass, 
    Settings, 
    Radio, 
    Globe, 
    SlidersHorizontal, 
    RefreshCw, 
    Play, 
    Activity, 
    MapPin, 
    Layers, 
    Calendar,
    Sparkles,
    Sliders,
    Zap,
    Map as MapIcon,
    Info,
    Grid,
    SlidersHorizontal as ControlsIcon
} from 'lucide-react';
const ExpeditionMap = lazy(() => import('../components/ExpeditionMap').then(m => ({ default: m.ExpeditionMap })));
const ExpeditionMap3D = lazy(() => import('../components/ExpeditionMap3D').then(m => ({ default: m.ExpeditionMap3D })));
const DeckFlightMap = lazy(() => import('../components/DeckFlightMap').then(m => ({ default: m.DeckFlightMap || m.default })));
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
    const [mapType, setMapType] = useState<'GPU' | '2D' | '3D'>('GPU');
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
            if (!showLandSeaRoutes && t.id.startsWith('independent-road-trip-')) {
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
    }, [trips, statusFilter, yearFilter, dateFrom, dateTo, depFilter, arrFilter, showIndependentFlights, showLandSeaRoutes]);

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

    if (loading) return <div className="h-full flex items-center justify-center text-gray-500">Initializing Satellite Uplink...</div>;    return (
        <div className="relative overflow-visible pb-12 w-full space-y-8 animate-fade-in flex flex-col h-full min-h-0">
            {/* Modern Glassmorphic ambient backdrop blur accent fields */}
            <div className="absolute top-10 left-[10%] w-[45rem] h-[35rem] bg-gradient-to-tr from-blue-400/[0.08] to-indigo-500/[0.08] dark:from-blue-600/[0.12] dark:to-indigo-500/[0.08] rounded-full blur-[140px] pointer-events-none select-none -z-10 animate-[bounce_15s_infinite_alternate]" style={{ animationDuration: '20s' }} />
            <div className="absolute top-[35%] right-[5%] w-[40rem] h-[40rem] bg-gradient-to-bl from-amber-400/[0.06] to-pink-500/[0.06] dark:from-amber-400/[0.05] dark:to-orange-500/[0.05] rounded-full blur-[130px] pointer-events-none select-none -z-10 animate-[pulse_12s_infinite_alternate]" />
            <div className="absolute bottom-[15%] left-[5%] w-[50rem] h-[50rem] bg-gradient-to-tr from-purple-400/[0.04] to-blue-500/[0.04] dark:from-indigo-950/[0.08] dark:to-purple-950/[0.06] rounded-full blur-[160px] pointer-events-none select-none -z-10" />

            {/* HERO HEADER - OPERATIONS COMMAND DECK */}
            <div className="relative overflow-hidden bg-white/40 dark:bg-zinc-950/25 border border-white/60 dark:border-white/10 rounded-[2.5rem] p-6 backdrop-blur-3xl shadow-[0_8px_32px_0_rgba(31,38,135,0.06)] dark:shadow-[0_16px_48px_0_rgba(0,0,0,0.3)] flex flex-col gap-6 shrink-0 z-20 transition-all duration-300">
                <div className="absolute -top-12 -right-12 w-[350px] h-[350px] bg-gradient-to-bl from-blue-500/[0.12] via-indigo-500/[0.05] to-transparent blur-3xl pointer-events-none" />
                <div className="absolute -bottom-12 -left-12 w-[250px] h-[255px] bg-gradient-to-tr from-amber-500/[0.05] to-transparent blur-2xl pointer-events-none" />

                {/* ROW 1: Operations Header & Live Metrics Deck */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 w-full relative z-10">
                    <div className="flex items-center justify-between w-full lg:w-auto gap-4">
                        <div className="flex items-center gap-4">
                            <div className="relative group shrink-0">
                                <div className="absolute inset-0 bg-gradient-to-tr from-blue-500 via-indigo-550 to-amber-400 rounded-2xl blur-md opacity-40 group-hover:scale-105 transition-transform duration-500" />
                                <div className="relative w-14 h-14 rounded-2xl bg-zinc-900/10 dark:bg-zinc-800/20 backdrop-blur-xl text-zinc-900 dark:text-white flex items-center justify-center border border-white/40 dark:border-white/20 shadow-lg shrink-0">
                                    <Compass className="w-7 h-7 text-indigo-600 dark:text-indigo-400 animate-[spin_20s_linear_infinite]" />
                                </div>
                            </div>
                            <div>
                                <h2 className="text-xl md:text-2xl font-black text-zinc-905 dark:text-white tracking-tight leading-tight flex items-center gap-2">
                                    Operations Command Deck
                                    <Sparkles className="w-5 h-5 text-amber-500 animate-[pulse_1.5s_infinite]" />
                                </h2>
                                <p className="text-[10px] md:text-[11px] font-extrabold text-zinc-500 dark:text-indigo-450 uppercase tracking-[0.18em] mt-1.5 flex items-center gap-2">
                                    <span className="flex h-2.5 w-2.5 relative">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                                    </span>
                                    Telemetry Network Uplink
                                </p>
                            </div>
                        </div>

                        {/* Toggle Collapse Button */}
                        <button 
                            onClick={() => setIsCollapsed(!isCollapsed)}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/40 hover:bg-white/60 dark:bg-white/5 dark:hover:bg-white/10 border border-white/50 dark:border-white/10 text-zinc-800 dark:text-zinc-200 font-extrabold text-xs transition-all shadow-[0_2px_8px_rgba(31,38,135,0.04)] backdrop-blur-md hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                        >
                            <ControlsIcon className={`w-4 h-4 text-zinc-600 dark:text-zinc-400 transition-transform duration-300 ${isCollapsed ? '' : 'rotate-90'}`} />
                            {isCollapsed ? 'Configure Deck' : 'Hide Controls'}
                        </button>
                    </div>

                    {/* DYNAMIC OPERATION METRICS */}
                    <div className="grid grid-cols-2 md:flex md:flex-row items-center gap-4 w-full lg:w-auto">
                        <div className="bg-white/35 dark:bg-zinc-900/10 backdrop-blur-xl rounded-2xl px-5 py-3 border border-white/40 dark:border-white/5 flex items-center gap-3.5 shadow-sm hover:shadow-md transition-all duration-300 group">
                            <div className="w-10 h-10 rounded-xl bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/15 group-hover:scale-105 transition-transform">
                                <Globe className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 truncate">Total Sphere Range</p>
                                <p className="text-sm md:text-base font-black text-zinc-900 dark:text-white tracking-tight mt-0.5 truncate leading-none">
                                    {totalDistanceKm.toLocaleString()}<span className="text-[10px] font-bold text-indigo-500 ml-0.5">KM</span>
                                </p>
                                <p className="text-[9px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5 font-bold font-mono">
                                    {(Math.round(totalDistanceKm * 0.621371)).toLocaleString()} MI
                                </p>
                            </div>
                        </div>

                        <div className="bg-white/35 dark:bg-zinc-900/10 backdrop-blur-xl rounded-2xl px-5 py-3 border border-white/40 dark:border-white/5 flex items-center gap-3.5 shadow-sm hover:shadow-md transition-all duration-300 group">
                            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/15 group-hover:scale-105 transition-transform">
                                <Zap className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 truncate">Connected Hubs</p>
                                <p className="text-sm md:text-base font-black text-zinc-900 dark:text-white tracking-tight mt-0.5 truncate leading-none">
                                    {activeSectorsCount} <span className="text-[10px] font-bold text-indigo-500">Sectors</span>
                                </p>
                                <p className="text-[9px] text-indigo-550 dark:text-indigo-400 mt-0.5 font-extrabold flex items-center gap-1 leading-none">
                                    <Activity className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Vectors Live
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* REDESIGNED BENTO COMMAND HUB */}
                <div className={`transition-all duration-300 flex flex-col gap-6 relative z-10 ${isCollapsed ? 'hidden' : 'flex'}`}>
                    <div className="h-px bg-white/20 dark:bg-white/5 w-full" />
                    
                    {/* BENTO GRID: Fully adaptive grid across phones, tablets, and computers */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                                               {/* BENTO CARD 1: Projection & Presentation Engine (Merged & Streamlined) */}
                        <div className="md:col-span-2 xl:col-span-2 bg-white/30 dark:bg-zinc-950/20 p-5 rounded-[2.2rem] border border-white/60 dark:border-white/5 flex flex-col justify-between gap-4 shadow-sm backdrop-blur-2xl hover:border-blue-400/30 dark:hover:border-white/10 transition-all duration-300 min-h-[14rem]">
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-[10.5px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest block flex items-center gap-1.5">
                                        <SlidersHorizontal className="w-3.5 h-3.5" /> I. PROJECTION & PRESENTATION
                                    </span>
                                    <button 
                                        onClick={handleRefresh}
                                        className="text-[9px] font-black text-white hover:text-white/90 bg-gradient-to-r from-blue-600 to-indigo-650 px-2.5 py-1 rounded-lg transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-[0_2px_10px_rgba(37,99,235,0.2)] border border-white/20"
                                        title="Clear coordinate caches and reload all geocoding / route paths"
                                    >
                                        <RefreshCw className="w-3 h-3 hover:rotate-180 transition-transform duration-500" />
                                        Sync
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 lg:grid-cols-10 gap-5">
                                    {/* Projection Section (Left side) */}
                                    <div className="lg:col-span-4 flex flex-col gap-2.5">
                                        <p className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest leading-none">Projection Control</p>
                                        <div className="grid grid-cols-1 gap-2">
                                            {/* GPU / 3D / 2D Engine Selector */}
                                            <div className="flex p-0.5 bg-zinc-200/50 dark:bg-zinc-950/60 rounded-xl border border-white/30 dark:border-white/5 w-full justify-between">
                                                {[
                                                    { id: 'GPU', label: 'GPU (Deck.gl)', icon: Zap },
                                                    { id: '3D', label: '3D Globe', icon: Globe },
                                                    { id: '2D', label: 'Classic', icon: MapIcon }
                                                ].map((eng) => {
                                                    const IconComponent = eng.icon;
                                                    const isSelected = mapType === eng.id;
                                                    return (
                                                        <button
                                                            key={eng.id}
                                                            onClick={() => setMapType(eng.id as any)}
                                                            className={`px-2 py-1.5 rounded-lg text-[9.5px] font-black uppercase tracking-wider transition-all flex-1 flex items-center justify-center gap-1 cursor-pointer ${
                                                                isSelected 
                                                                ? 'bg-blue-600 text-white shadow-md font-black border border-blue-400/30' 
                                                                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                                                            }`}
                                                            title={`Switch to ${eng.label}`}
                                                        >
                                                            <IconComponent className="w-3 h-3" />
                                                            <span>{eng.label}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            {/* Network toggle */}
                                            <button
                                                onClick={() => setViewMode(viewMode === 'network' ? 'scratch' : 'network')}
                                                className={`p-2 rounded-xl border text-left font-bold transition-all duration-205 flex items-center gap-2 cursor-pointer ${
                                                    viewMode === 'network'
                                                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400 shadow-sm'
                                                    : 'bg-white/30 dark:bg-white/5 border-white/40 dark:border-white/5 text-zinc-450 hover:text-zinc-650 dark:hover:text-zinc-350'
                                                }`}
                                                title={viewMode === 'network' ? "Hide Network Routes & Plots" : "Display Network Routes & Plots"}
                                            >
                                                <Compass className={`w-4 h-4 ${viewMode === 'network' ? 'text-blue-500' : 'text-zinc-450'}`} />
                                                <div className="min-w-0 flex-1 leading-none">
                                                    <p className="text-[8px] font-black uppercase tracking-widest opacity-60">Network</p>
                                                    <p className="text-[9.5px] font-extrabold mt-0.5 truncate">{viewMode === 'network' ? 'Active' : 'Disabled'}</p>
                                                </div>
                                            </button>

                                            {/* Scratch toggle */}
                                            <button
                                                onClick={() => setShowCountries(!showCountries)}
                                                className={`p-2 rounded-xl border text-left font-bold transition-all duration-205 flex items-center gap-2 cursor-pointer ${
                                                    showCountries
                                                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 shadow-sm'
                                                    : 'bg-white/30 dark:bg-white/5 border-white/40 dark:border-white/5 text-zinc-450 hover:text-zinc-650 dark:hover:text-zinc-350'
                                                }`}
                                                title={showCountries ? "Hide Visited Lands layer" : "Display Visited Lands layer"}
                                            >
                                                <MapPin className={`w-4 h-4 ${showCountries ? 'text-amber-500' : 'text-zinc-450'}`} />
                                                <div className="min-w-0 flex-1 leading-none">
                                                    <p className="text-[8px] font-black uppercase tracking-widest opacity-60">Scratch</p>
                                                    <p className="text-[9.5px] font-extrabold mt-0.5 truncate">{showCountries ? 'Active' : 'Disabled'}</p>
                                                </div>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Presentation Section (Right side) */}
                                    <div className="lg:col-span-6 flex flex-col gap-2.5">
                                        <p className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest leading-none">Presentation Channels</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            {/* 1. FLIGHTS */}
                                            <button
                                                onClick={() => setShowIndependentFlights(!showIndependentFlights)}
                                                className={`p-2 rounded-xl border text-left font-bold transition-all duration-205 flex items-center gap-2 cursor-pointer ${
                                                    showIndependentFlights
                                                    ? 'bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400 shadow-sm'
                                                    : 'bg-white/30 dark:bg-white/5 border-white/40 dark:border-white/5 text-zinc-450 hover:text-zinc-650 dark:hover:text-zinc-350'
                                                }`}
                                                title="Toggle Independent Flights"
                                            >
                                                <Compass className="w-4 h-4 text-purple-500" />
                                                <div className="min-w-0 flex-1 leading-none">
                                                    <p className="text-[8px] font-black uppercase tracking-widest opacity-60">Flights</p>
                                                    <p className="text-[9.5px] font-extrabold mt-0.5 truncate">{showIndependentFlights ? 'Active' : 'Hidden'}</p>
                                                </div>
                                            </button>

                                            {/* 2. TRANSIT */}
                                            <button
                                                onClick={() => setShowLandSeaRoutes(!showLandSeaRoutes)}
                                                className={`p-2 rounded-xl border text-left font-bold transition-all duration-205 flex items-center gap-2 cursor-pointer ${
                                                    showLandSeaRoutes
                                                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 shadow-sm'
                                                    : 'bg-white/30 dark:bg-white/5 border-white/40 dark:border-white/5 text-zinc-450 hover:text-zinc-650 dark:hover:text-zinc-350'
                                                }`}
                                                title={showLandSeaRoutes ? "Hide Land/Sea vehicle paths" : "Display Land/Sea vehicle paths"}
                                            >
                                                <Zap className="w-4 h-4 text-amber-500" />
                                                <div className="min-w-0 flex-1 leading-none">
                                                    <p className="text-[8px] font-black uppercase tracking-widest opacity-60">Transit</p>
                                                    <p className="text-[9.5px] font-extrabold mt-0.5 truncate">{showLandSeaRoutes ? 'Active' : 'Hidden'}</p>
                                                </div>
                                            </button>

                                            {/* 3. CITIES */}
                                            <button
                                                onClick={() => setShowCityMarkers(!showCityMarkers)}
                                                className={`p-2 rounded-xl border text-left font-bold transition-all duration-205 flex items-center gap-2 cursor-pointer ${
                                                    showCityMarkers
                                                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400 shadow-sm'
                                                    : 'bg-white/30 dark:bg-white/5 border-white/40 dark:border-white/5 text-zinc-450 hover:text-zinc-650 dark:hover:text-zinc-350'
                                                }`}
                                                title={showCityMarkers ? "Hide City labels on the map" : "Display major city endpoints"}
                                            >
                                                <MapPin className="w-4 h-4 text-blue-500" />
                                                <div className="min-w-0 flex-1 leading-none">
                                                    <p className="text-[8px] font-black uppercase tracking-widest opacity-60">Cities</p>
                                                    <p className="text-[9.5px] font-extrabold mt-0.5 truncate">{showCityMarkers ? 'Visible' : 'Hidden'}</p>
                                                </div>
                                            </button>

                                            {/* 4. CLUSTER */}
                                            <button
                                                onClick={() => setClusterMode(!clusterMode)}
                                                className={`p-2 rounded-xl border text-left font-bold transition-all duration-205 flex items-center gap-2 cursor-pointer ${
                                                    clusterMode
                                                    ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 shadow-sm'
                                                    : 'bg-white/30 dark:bg-white/5 border-white/40 dark:border-white/5 text-zinc-450 hover:text-zinc-650 dark:hover:text-zinc-350'
                                                }`}
                                                title={clusterMode ? "Disable marker group combining" : "Group overlapping airport nodes"}
                                            >
                                                <Layers className="w-4 h-4 text-indigo-505" />
                                                <div className="min-w-0 flex-1 leading-none">
                                                    <p className="text-[8px] font-black uppercase tracking-widest opacity-60">Cluster</p>
                                                    <p className="text-[9.5px] font-extrabold mt-0.5 truncate">{clusterMode ? 'Active' : 'Off'}</p>
                                                </div>
                                            </button>

                                            {/* 5. COMET FLOW */}
                                            <button
                                                onClick={() => setAnimateRoutes(!animateRoutes)}
                                                className={`p-2 rounded-xl border text-left font-bold transition-all duration-205 flex items-center gap-2 cursor-pointer ${
                                                    animateRoutes
                                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shadow-sm'
                                                    : 'bg-white/30 dark:bg-white/5 border-white/40 dark:border-white/5 text-zinc-450 hover:text-zinc-650 dark:hover:text-zinc-350'
                                                }`}
                                                title="Toggle Animated Pulse Lines"
                                            >
                                                <Play className="w-4 h-4 text-emerald-555 animate-pulse" />
                                                <div className="min-w-0 flex-1 leading-none">
                                                    <p className="text-[8px] font-black uppercase tracking-widest opacity-60">Comet Flow</p>
                                                    <p className="text-[9.5px] font-extrabold mt-0.5 truncate">{animateRoutes ? 'Active' : 'Off'}</p>
                                                </div>
                                            </button>

                                            {/* 6. WEIGHT FLOW */}
                                            <button
                                                onClick={() => setShowFrequencyWeight(!showFrequencyWeight)}
                                                className={`p-2 rounded-xl border text-left font-bold transition-all duration-205 flex items-center gap-2 cursor-pointer ${
                                                    showFrequencyWeight
                                                    ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-600 dark:text-cyan-400 shadow-sm'
                                                    : 'bg-white/30 dark:bg-white/5 border-white/40 dark:border-white/5 text-zinc-450 hover:text-zinc-650 dark:hover:text-zinc-350'
                                                }`}
                                                title="Line thickness changes with route replication"
                                            >
                                                <Activity className="w-4 h-4 text-cyan-500" />
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
                                                className={`col-span-2 p-2 rounded-xl border text-left font-bold transition-all duration-205 flex items-center gap-2.5 cursor-pointer ${
                                                    showRoadTracing
                                                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-605 dark:text-rose-400 shadow-sm'
                                                    : 'bg-white/30 dark:bg-white/5 border-white/40 dark:border-white/5 text-zinc-450 hover:text-zinc-650 dark:hover:text-zinc-350'
                                                }`}
                                                title={showRoadTracing ? "Disable realistic land route tracing over OSRM" : "Trace land routes along actual roads using OpenStreetMap/OSRM"}
                                            >
                                                <Radio className="w-4 h-4 text-rose-500 shrink-0" />
                                                <div className="min-w-0 flex-1 leading-none">
                                                    <p className="text-[8px] font-black uppercase tracking-widest opacity-60">Realistic Land Trails (OSRM)</p>
                                                    <p className="text-[9.5px] font-extrabold mt-0.5 truncate">{showRoadTracing ? 'Enabled (Actual Roads)' : 'Disabled (Arcs Only)'}</p>
                                                </div>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* BENTO CARD 3: Location Connectivity Filter */}
                        <div className="bg-white/30 dark:bg-zinc-950/20 p-5 rounded-[2.2rem] border border-white/60 dark:border-white/5 flex flex-col justify-between gap-4 shadow-sm backdrop-blur-2xl hover:border-blue-400/30 dark:hover:border-white/10 transition-all duration-300 min-h-[14rem]">
                            <div>
                                <span className="text-[10.5px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest block mb-2.5 flex items-center gap-1.5">
                                    <Compass className="w-3.5 h-3.5" /> III. CONNECTIVITY
                                </span>
                                <div className="space-y-3">
                                    <div>
                                        <p className="text-[9px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">Departure Station</p>
                                        <MultiSelect 
                                            placeholder="Any Departure Hub"
                                            options={uniqueAirports.origins}
                                            value={depFilter}
                                            onChange={setDepFilter}
                                        />
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">Arrival Station</p>
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
                        <div className="bg-white/30 dark:bg-zinc-950/20 p-5 rounded-[2.2rem] border border-white/60 dark:border-white/5 flex flex-col justify-between gap-4 shadow-sm backdrop-blur-2xl hover:border-blue-400/30 dark:hover:border-white/10 transition-all duration-300 min-h-[14rem]">
                            <div>
                                <span className="text-[10.5px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest block mb-2.5 flex items-center gap-1.5">
                                    <Calendar className="w-3.5 h-3.5" /> IV. TEMPORAL RANGE
                                </span>
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-[9px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block mb-1">From Date</label>
                                            <Input 
                                                type="date" 
                                                value={dateFrom} 
                                                onChange={(e) => setDateFrom(e.target.value)} 
                                                className="!py-1 !px-2 !text-[11px] !font-bold !h-8 bg-white/55 dark:bg-zinc-950/40 text-zinc-850 dark:text-white border border-white/40 dark:border-white/5 focus:border-indigo-450 rounded-xl"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block mb-1">To Date</label>
                                            <Input 
                                                type="date" 
                                                value={dateTo} 
                                                onChange={(e) => setDateTo(e.target.value)} 
                                                className="!py-1 !px-2 !text-[11px] !font-bold !h-8 bg-white/55 dark:bg-zinc-950/40 text-zinc-850 dark:text-white border border-white/40 dark:border-white/5 focus:border-indigo-450 rounded-xl"
                                            />
                                        </div>
                                    </div>

                                    {/* Year Select & Timeline buttons */}
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-2 justify-between">
                                            <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Operation Year:</span>
                                            <select 
                                                value={yearFilter}
                                                onChange={(e) => setYearFilter(e.target.value)}
                                                className="bg-white/70 dark:bg-zinc-950 text-[10.5px] font-extrabold uppercase tracking-wider text-zinc-750 dark:text-zinc-300 outline-none px-2 py-1 cursor-pointer rounded-lg border border-white/40 dark:border-white/5"
                                            >
                                                <option value="all">All Years</option>
                                                {years.map(y => <option key={y} value={y}>{y}</option>)}
                                            </select>
                                        </div>

                                        <div className="flex p-0.5 bg-zinc-200/50 dark:bg-zinc-950/60 rounded-xl border border-white/30 dark:border-white/5 w-full justify-between">
                                            {['all', 'Upcoming', 'Past'].map((s) => (
                                                <button
                                                    key={s}
                                                    onClick={() => setStatusFilter(s as any)}
                                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex-1 text-center ${
                                                        statusFilter === s 
                                                        ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-sm font-black border border-white/10' 
                                                        : 'text-zinc-450 hover:text-zinc-650 dark:hover:text-zinc-300'
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
            <div className="flex-1 min-h-[36rem] w-full flex flex-col gap-6 relative z-10">
                {/* FULL-SCREEN GEOSPATIAL MAP COMMAND PANEL */}
                <div className="flex-1 min-h-[36rem] rounded-[2.5rem] overflow-hidden border border-white/50 dark:border-white/10 shadow-[0_24px_64px_rgba(0,0,0,0.08)] dark:shadow-[0_24px_64px_rgba(0,0,0,0.45)] relative bg-zinc-100/35 dark:bg-black/25 backdrop-blur-3xl flex flex-col">
                    <Suspense fallback={
                        <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950/70 border border-white/5 space-y-4">
                            <Compass className="w-10 h-10 text-indigo-500 animate-[spin_5s_linear_infinite]" />
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 font-mono">Booting Real-Time Vector Engine...</p>
                        </div>
                    }>
                        {mapType === 'GPU' ? (
                            <DeckFlightMap
                                key={`gpu-${isDark ? 'dark' : 'light'}`}
                                trips={filteredTrips}
                                onTripClick={onTripClick}
                                showFrequencyWeight={showFrequencyWeight}
                                animateRoutes={animateRoutes}
                                visitedCountries={visitedCountryCodes}
                                showCountries={showCountries}
                                viewMode={viewMode}
                                visitedPlaces={visitedPlaces}
                                activeLayer={activeLayer}
                                showFlightRoutes={showIndependentFlights}
                                showLandSeaRoutes={showLandSeaRoutes}
                                showCityMarkers={showCityMarkers}
                                showGradientRoutes={true}
                                clusterMode={clusterMode}
                                showRoadTracing={showRoadTracing}
                                focusTransportCoordinates={focusCoord}
                            />
                        ) : mapType === '2D' ? (
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
