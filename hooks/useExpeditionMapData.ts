import { useEffect, useState, useMemo } from 'react';
import { resolveCountryCode, countryId, mergeCountryRecords, excludedCountryCodes, ukNationsFromCities } from '../services/countryRegistry';
import { affectsCollections } from './useWanderSync';
import { dataService } from '../services/mockDb';
import { runAfterFirstPaint, mapWithConcurrency } from '../services/utils';
import { Trip, CountryResidenceStatus, getResidenceStatuses } from '../types';
import { getCoordinates, getCoordinatesSync, STATIC_GEO_DATA, calculateDistance, formatProperLocationName, refineUKCountry } from '../services/geocoding';
import { asStatusList, isLayoverOnly } from '../components/new/map/mapScratch';

/**
 * Data loading for the Expedition Map (trips + flights + road trips with resolved coordinates, visited
 * countries, filters and per-mode metrics). Copied from views/ExpeditionMapView.tsx for the Golden Hour map.
 */

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

export const useExpeditionMapData = () => {
    const [trips, setTrips] = useState<Trip[]>([]);
    const [, setLoading] = useState(true);
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

                // 1. From database visited collection: one record per country, the UK as its nations,
                //    and countries the user explicitly cleared are remembered so trips don't re-mark them.
                const excludedCodes = excludedCountryCodes(visited);
                const ukNations = ukNationsFromCities(visited, n => refineUKCountry(n, 'United Kingdom', 'GB').countryCode);
                const records = [
                    ...mergeCountryRecords(visited, { ukConstituentsFor: () => ukNations }),
                    ...(visited || []).filter((i: any) => i.type !== 'country')
                ];
                if (records.length > 0) {
                    records.forEach(item => {
                        const code = item.code ? item.code.toUpperCase() : (item.countryCode ? item.countryCode.toUpperCase() : '');
                        const name = item.name ? item.name.toUpperCase() : (item.countryName ? item.countryName.toUpperCase() : '');
                        const statuses = getResidenceStatuses(item);

                        // A city's own record says nothing about its country's status: it must not overwrite what the
                        // country record says (a layover country stays a layover although a city in it is tracked).
                        const own = item.type === 'country';
                        if (code && (own || !statusMap[code])) statusMap[code] = statuses;
                        if (name && (own || !statusMap[name])) statusMap[name] = statuses;

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

                        // The origin of a connecting flight is the previous leg's layover, not a stay.
                        const prev = idx > 0 ? transports[idx - 1] : null;
                        const prevIsFlight = Boolean(prev) && (!prev!.mode || prev!.mode === 'Flight');
                        const isConnection = isFlight && prevIsFlight && prev!.destination?.toUpperCase() === originCode;
                        if (originGeo?.iso && !isConnection) {
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

                // Add all verified destination countries to countrySet (except ones the user cleared)
                excludedCodes.forEach(code => { statusMap[code] = []; countrySet.delete(code); });
                destinationCountries.forEach(code => { if (!excludedCodes.has(code)) countrySet.add(code); });
                // A country marked as a layover and nothing else is not visited, whatever trips or tracked cities say.
                Object.entries(statusMap).forEach(([key, value]) => { if (isLayoverOnly(asStatusList(value))) countrySet.delete(key); });

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

        const handleDbUpdate = (e: Event) => {
            if (affectsCollections(e, ['visited', 'trips', 'flights'])) processGeoData();
        };
        window.addEventListener('wandergrid_db_updated', handleDbUpdate);
        return () => window.removeEventListener('wandergrid_db_updated', handleDbUpdate);
    }, [trips]);

    const handleUpdateCountryStatus = async (countryCode: string, countryName: string, status: CountryResidenceStatus | CountryResidenceStatus[] | 'none') => {
        try {
            const visitedList = await dataService.getVisited();
            const upperCode = (countryCode || '').toUpperCase();
            const upperName = (countryName || '').toUpperCase();

            // Every stored record for this country, whatever id or spelling it was saved with.
            const matches = (visitedList || []).filter((v: any) => v.type === 'country' && resolveCountryCode(v) === resolveCountryCode({ code: countryCode, name: countryName }));
            const existing = matches[0];

            const isNone = status === 'none' || (Array.isArray(status) && status.length === 0);

            if (isNone) {
                // Keep a marker instead of deleting: otherwise trips (or a stored UK parent record) would
                // immediately mark the country as visited again.
                if (existing) {
                    await dataService.updateVisited({
                        ...existing,
                        excluded: true,
                        residenceStatus: undefined,
                        residenceStatuses: [],
                        isTransit: false
                    });
                    for (const dup of matches.slice(1)) {
                        await dataService.deleteVisited(dup.id);
                    }
                } else if (upperCode) {
                    await dataService.addVisited({
                        id: countryId(upperCode),
                        type: 'country',
                        code: upperCode,
                        name: countryName,
                        excluded: true,
                        residenceStatuses: [],
                        isManual: true
                    });
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
                        excluded: false,
                        name: countryName || existing.name
                    });
                    // Fold any stale copies into the surviving record.
                    for (const dup of matches.slice(1)) {
                        await dataService.deleteVisited(dup.id);
                    }
                } else {
                    await dataService.addVisited({
                        id: upperCode ? countryId(upperCode) : `visited-country-${Date.now()}`,
                        type: 'country',
                        code: upperCode,
                        name: countryName,
                        residenceStatus: primaryStatus,
                        residenceStatuses: statuses,
                        isTransit,
                        excluded: false,
                        isManual: true,
                        visitDate: new Date().toISOString().split('T')[0]
                    });
                }
            }

            setCountryStatusMap(prev => {
                const next = { ...prev };
                if (isNone) {
                    // An empty list is an explicit "cleared", distinct from "no entry" (which falls back to trips).
                    if (upperCode) next[upperCode] = [];
                    if (upperName) next[upperName] = [];
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

    return {
        trips, filteredTrips, expeditionTypeMetrics, years, uniqueAirports,
        visitedCountryCodes, countryStatusMap, visitedPlaces,
        statusFilter, setStatusFilter, yearFilter, setYearFilter, depFilter, setDepFilter, arrFilter, setArrFilter,
        dateFrom, setDateFrom, dateTo, setDateTo, activeFilterCount,
        handleClearFilters, handleRefresh, handleUpdateCountryStatus,
    };
};
