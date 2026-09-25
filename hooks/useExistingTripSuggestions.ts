import { useMemo } from 'react';
import { useWanderSync } from './useWanderSync';
import { dataService } from '../services/mockDb';
import { Trip, Transport, Accommodation, TransportMode, RoadTripWaypoint, GeoCoordinates } from '../types';

export interface DiscoveredFlightItem {
    id: string;
    mode: 'Flight';
    origin: string;
    destination: string;
    departureDate: string;
    departureTime: string;
    arrivalDate?: string;
    arrivalTime?: string;
    provider: string;
    identifier: string;
    confirmationCode?: string;
    cost?: number;
    travelClass?: string;
    seatNumber?: string;
    isIndependent: boolean;
    tripId?: string;
    tripName?: string;
}

export interface DiscoveredRouteItem {
    id: string;
    mode: TransportMode;
    origin: string;
    destination: string;
    departureDate: string;
    departureTime: string;
    arrivalDate?: string;
    arrivalTime?: string;
    provider: string;
    identifier: string;
    confirmationCode?: string;
    cost?: number;
    travelClass?: string;
    seatNumber?: string;
    tripId: string;
    tripName: string;
    waypoints?: RoadTripWaypoint[];
    pickupLocation?: string;
    dropoffLocation?: string;
    vehicleModel?: string;
}

export interface DiscoveredStayItem {
    id: string;
    name: string;
    type: Accommodation['type'];
    address: string;
    checkInDate: string;
    checkInTime: string;
    checkOutDate: string;
    checkOutTime: string;
    confirmationCode?: string;
    cost?: number;
    coordinates?: GeoCoordinates;
    tripId: string;
    tripName: string;
}

export interface ExistingTripSuggestionsResult {
    flights: DiscoveredFlightItem[];
    routes: DiscoveredRouteItem[];
    stays: DiscoveredStayItem[];
    suggestedDestination?: string;
    totalCount: number;
    hasSuggestions: boolean;
    isLoading: boolean;
}

interface UseExistingTripSuggestionsProps {
    startDate?: string;
    endDate?: string;
    excludeTripId?: string;
    currentTransports?: Partial<Transport>[];
    currentAccommodations?: Partial<Accommodation>[];
}

/**
 * useExistingTripSuggestions
 * Detects flights and trips registered in WanderGrid that overlap with the selected dates,
 * extracting existing flights, routes (trains, rentals, etc.), and accommodations.
 */
export function useExistingTripSuggestions({
    startDate,
    endDate,
    excludeTripId,
    currentTransports = [],
    currentAccommodations = []
}: UseExistingTripSuggestionsProps): ExistingTripSuggestionsResult {
    const { data: allTrips, loading: tripsLoading } = useWanderSync<Trip[]>('trips', () => dataService.getTrips());
    const { data: allFlights, loading: flightsLoading } = useWanderSync<Transport[]>('flights', () => dataService.getFlights());

    return useMemo(() => {
        const cleanStart = startDate?.trim();
        if (!cleanStart || cleanStart.length < 10) {
            return {
                flights: [],
                routes: [],
                stays: [],
                totalCount: 0,
                hasSuggestions: false,
                isLoading: tripsLoading || flightsLoading
            };
        }

        const cleanEnd = endDate?.trim() && endDate.trim().length >= 10 && endDate.trim() >= cleanStart
            ? endDate.trim()
            : cleanStart;

        const currentTransportIds = new Set<string>();
        const currentTransportKeys = new Set<string>();
        for (const t of currentTransports) {
            if (t.id) currentTransportIds.add(t.id);
            if (t.identifier && t.departureDate) {
                currentTransportKeys.add(`${t.identifier.trim().toUpperCase()}|${t.departureDate}`);
            }
        }

        const currentStayIds = new Set<string>();
        const currentStayKeys = new Set<string>();
        for (const a of currentAccommodations) {
            if (a.id) currentStayIds.add(a.id);
            if (a.name && a.checkInDate) {
                currentStayKeys.add(`${a.name.trim().toLowerCase()}|${a.checkInDate}`);
            }
        }

        const discoveredFlights: DiscoveredFlightItem[] = [];
        const seenFlightIds = new Set<string>();
        const seenFlightKeys = new Set<string>();

        let suggestedDestination: string | undefined;

        // 1. Scan all registered flights (both independent and associated with trips)
        if (allFlights && Array.isArray(allFlights)) {
            for (const f of allFlights) {
                if (f.mode && f.mode !== 'Flight') continue;
                if (excludeTripId && f.tripId === excludeTripId) continue;

                const dep = f.departureDate?.trim();
                const arr = (f.arrivalDate || f.departureDate)?.trim();
                if (!dep) continue;

                const overlaps = (dep >= cleanStart && dep <= cleanEnd) || (arr && arr >= cleanStart && arr <= cleanEnd);
                if (!overlaps) continue;

                // Check if already in current trip draft
                if (f.id && currentTransportIds.has(f.id)) continue;
                if (f.identifier && currentTransportKeys.has(`${f.identifier.trim().toUpperCase()}|${dep}`)) continue;

                const flightKey = `${(f.identifier || '').trim().toUpperCase()}|${dep}`;
                if (f.id && seenFlightIds.has(f.id)) continue;
                if (f.identifier && seenFlightKeys.has(flightKey)) continue;

                if (f.id) seenFlightIds.add(f.id);
                if (f.identifier) seenFlightKeys.add(flightKey);

                const isIndependent = !f.tripId || f.tripId === 'unassigned';

                discoveredFlights.push({
                    id: f.id || `flight-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                    mode: 'Flight',
                    origin: f.origin || '',
                    destination: f.destination || '',
                    departureDate: dep,
                    departureTime: f.departureTime || '10:00',
                    arrivalDate: arr || dep,
                    arrivalTime: f.arrivalTime || '14:00',
                    provider: f.provider || '',
                    identifier: f.identifier || '',
                    confirmationCode: f.confirmationCode || '',
                    cost: typeof f.cost === 'number' ? f.cost : undefined,
                    travelClass: f.travelClass,
                    seatNumber: f.seatNumber,
                    isIndependent,
                    tripId: f.tripId,
                    tripName: f.tripName
                });

                if (!suggestedDestination && f.destination) {
                    suggestedDestination = f.destination;
                }
            }
        }

        // 2. Scan registered trips overlapping this window for existing routes and stays
        const discoveredRoutes: DiscoveredRouteItem[] = [];
        const discoveredStays: DiscoveredStayItem[] = [];
        const seenRouteIds = new Set<string>();
        const seenStayIds = new Set<string>();

        if (allTrips && Array.isArray(allTrips)) {
            for (const t of allTrips) {
                if (excludeTripId && t.id === excludeTripId) continue;
                const tStart = t.startDate?.trim();
                const tEnd = (t.endDate || t.startDate)?.trim();
                if (!tStart || !tEnd) continue;

                // Overlap check
                const tripOverlaps = tStart <= cleanEnd && tEnd >= cleanStart;
                if (!tripOverlaps) continue;

                // A. Route legs / Land transports from overlapping trips
                if (t.transports && Array.isArray(t.transports)) {
                    for (const tr of t.transports) {
                        if (tr.mode === 'Flight') {
                            // Already handled or can be added to discoveredFlights if not yet seen
                            const dep = tr.departureDate?.trim();
                            if (dep && ((dep >= cleanStart && dep <= cleanEnd) || ((tr.arrivalDate || dep) >= cleanStart && (tr.arrivalDate || dep) <= cleanEnd))) {
                                const key = `${(tr.identifier || '').trim().toUpperCase()}|${dep}`;
                                if (!seenFlightIds.has(tr.id) && !seenFlightKeys.has(key) && !currentTransportIds.has(tr.id) && !currentTransportKeys.has(key)) {
                                    seenFlightIds.add(tr.id);
                                    if (tr.identifier) seenFlightKeys.add(key);
                                    discoveredFlights.push({
                                        id: tr.id,
                                        mode: 'Flight',
                                        origin: tr.origin || '',
                                        destination: tr.destination || '',
                                        departureDate: dep,
                                        departureTime: tr.departureTime || '10:00',
                                        arrivalDate: tr.arrivalDate || dep,
                                        arrivalTime: tr.arrivalTime || '14:00',
                                        provider: tr.provider || '',
                                        identifier: tr.identifier || '',
                                        confirmationCode: tr.confirmationCode || '',
                                        cost: typeof tr.cost === 'number' ? tr.cost : undefined,
                                        travelClass: tr.travelClass,
                                        seatNumber: tr.seatNumber,
                                        isIndependent: false,
                                        tripId: t.id,
                                        tripName: t.name
                                    });
                                    if (!suggestedDestination && tr.destination) {
                                        suggestedDestination = tr.destination;
                                    }
                                }
                            }
                            continue;
                        }

                        // Non-flight transport modes (Train, Rental, Bus, Ferry, Cruise)
                        const dep = tr.departureDate?.trim() || tStart;
                        const arr = tr.arrivalDate?.trim() || dep;
                        const inWindow = (dep >= cleanStart && dep <= cleanEnd) || (arr >= cleanStart && arr <= cleanEnd);
                        if (!inWindow) continue;

                        if (currentTransportIds.has(tr.id)) continue;
                        if (tr.identifier && currentTransportKeys.has(`${tr.identifier.trim().toUpperCase()}|${dep}`)) continue;

                        if (seenRouteIds.has(tr.id)) continue;
                        seenRouteIds.add(tr.id);

                        discoveredRoutes.push({
                            id: tr.id || `route-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                            mode: tr.mode || 'Train',
                            origin: tr.origin || '',
                            destination: tr.destination || '',
                            departureDate: dep,
                            departureTime: tr.departureTime || '10:00',
                            arrivalDate: arr,
                            arrivalTime: tr.arrivalTime || '14:00',
                            provider: tr.provider || '',
                            identifier: tr.identifier || '',
                            confirmationCode: tr.confirmationCode || '',
                            cost: typeof tr.cost === 'number' ? tr.cost : undefined,
                            travelClass: tr.travelClass,
                            seatNumber: tr.seatNumber,
                            tripId: t.id,
                            tripName: t.name,
                            waypoints: tr.waypoints,
                            pickupLocation: tr.pickupLocation,
                            dropoffLocation: tr.dropoffLocation,
                            vehicleModel: tr.vehicleModel
                        });

                        if (!suggestedDestination && tr.destination) {
                            suggestedDestination = tr.destination;
                        }
                    }
                }

                // B. Stays / Accommodations from overlapping trips
                if (t.accommodations && Array.isArray(t.accommodations)) {
                    for (const acc of t.accommodations) {
                        const inDate = acc.checkInDate?.trim() || tStart;
                        const outDate = acc.checkOutDate?.trim() || tEnd;

                        const stayOverlaps = inDate <= cleanEnd && outDate >= cleanStart;
                        if (!stayOverlaps) continue;

                        if (currentStayIds.has(acc.id)) continue;
                        if (acc.name && currentStayKeys.has(`${acc.name.trim().toLowerCase()}|${inDate}`)) continue;

                        if (seenStayIds.has(acc.id)) continue;
                        seenStayIds.add(acc.id);

                        discoveredStays.push({
                            id: acc.id || `stay-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                            name: acc.name || 'Stay',
                            type: acc.type || 'Hotel',
                            address: acc.address || '',
                            checkInDate: inDate,
                            checkInTime: acc.checkInTime || '15:00',
                            checkOutDate: outDate,
                            checkOutTime: acc.checkOutTime || '11:00',
                            confirmationCode: acc.confirmationCode || '',
                            cost: typeof acc.cost === 'number' ? acc.cost : undefined,
                            coordinates: acc.coordinates,
                            tripId: t.id,
                            tripName: t.name
                        });

                        if (!suggestedDestination && (acc.address || acc.name)) {
                            suggestedDestination = acc.address || acc.name;
                        }
                    }
                }

                if (!suggestedDestination && t.location) {
                    suggestedDestination = t.location;
                }
            }
        }

        const totalCount = discoveredFlights.length + discoveredRoutes.length + discoveredStays.length;

        return {
            flights: discoveredFlights,
            routes: discoveredRoutes,
            stays: discoveredStays,
            suggestedDestination,
            totalCount,
            hasSuggestions: totalCount > 0,
            isLoading: tripsLoading || flightsLoading
        };
    }, [
        startDate,
        endDate,
        excludeTripId,
        currentTransports,
        currentAccommodations,
        allTrips,
        allFlights,
        tripsLoading,
        flightsLoading
    ]);
}
