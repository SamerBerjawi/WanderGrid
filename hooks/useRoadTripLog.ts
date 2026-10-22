import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Transport, TransportMode, Trip, User, WorkspaceSettings } from '../types';
import { dataService } from '../services/mockDb';
import { syncPitStopsToVisited } from '../services/pitStopSync';
import { getFlightDepartureUtcDate } from '../utils/flightData';
import { isIndependent, type JourneyRecord } from '../utils/journeysModel';

/**
 * Data, filters and whole-record writes for the Road trips page: every land and sea journey (train, bus,
 * car rental, own car, cruise, ferry), whether it sits inside a trip or stands alone in the independent
 * list. The counterpart of useFlightLog for non-flight transports. Writes keep every field of a journey,
 * move it between a trip and "no trip" in one transaction, and sync its stops to the visited places.
 */

export const LAND_MODES: TransportMode[] = ['Train', 'Bus', 'Car Rental', 'Personal Car', 'Cruise', 'Ferry'];
export type RoadRecord = JourneyRecord;

const today = () => new Date().toISOString().slice(0, 10);
const newId = () => `land-${Math.random().toString(36).slice(2, 11)}`;
const unassignedTrip = (journeys: Transport[]): Trip => ({ id: 'unassigned', name: 'Independent journeys', location: 'Various', startDate: '', endDate: '', status: 'Planning', participants: [], transports: journeys });

export const useRoadTripLog = () => {
    const [trips, setTrips] = useState<Trip[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [records, setRecords] = useState<RoadRecord[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [workspaceSettings, setWorkspaceSettings] = useState<WorkspaceSettings | null>(null);
    // Ids that exist both in a trip and in the independent list (the old page wrote both): the stale copy is removed on the next write.
    const stale = useRef<Set<string>>(new Set());

    const [searchQuery, setSearchQuery] = useState('');
    const [timeFilter, setTimeFilter] = useState<'all' | 'upcoming' | 'past'>('all');
    const [yearFilter, setYearFilter] = useState('all');

    const refreshData = useCallback(() => {
        setLoadError(null);
        Promise.all([dataService.getTrips(), dataService.getUsers(), dataService.getRoadTrips(), dataService.getWorkspaceSettings()])
            .then(([t, u, independent, s]) => {
                setTrips(t);
                setUsers(u);
                setWorkspaceSettings(s);
                let sessionUser: User | null = null;
                try {
                    const raw = localStorage.getItem('wandergrid_session_user');
                    if (raw) { const parsed = JSON.parse(raw); sessionUser = u.find(x => x.id === parsed.id) || parsed; }
                } catch { /* ignore */ }
                setCurrentUser(sessionUser || u[0] || null);

                const out: RoadRecord[] = [];
                const inTrips = new Set<string>();
                t.forEach(trip => (trip.transports || []).forEach(tr => { if (tr.mode && tr.mode !== 'Flight') { inTrips.add(tr.id); out.push({ flight: tr, trip }); } }));
                const loose = (independent || []).filter(r => r.mode && r.mode !== 'Flight');
                stale.current = new Set(loose.filter(r => inTrips.has(r.id)).map(r => r.id));
                const alone: Transport[] = loose
                    .filter(r => !inTrips.has(r.id) && (!r.tripId || r.tripId === 'unassigned' || !t.some(x => x.id === r.tripId)))
                    .map(({ tripId, tripName, ...rest }) => rest as Transport);
                const none = unassignedTrip(alone);
                alone.forEach(tr => out.push({ flight: tr, trip: none }));
                out.sort((a, b) => getFlightDepartureUtcDate(b.flight).getTime() - getFlightDepartureUtcDate(a.flight).getTime());
                setRecords(out);
                setLoaded(true);
            })
            .catch(err => { console.error('Failed to load road trips:', err); setLoadError(err?.message || 'The journeys could not be loaded.'); setLoaded(true); });
    }, []);

    useEffect(() => { refreshData(); }, [refreshData]);
    useEffect(() => {
        window.addEventListener('wandergrid_db_updated', refreshData);
        return () => window.removeEventListener('wandergrid_db_updated', refreshData);
    }, [refreshData]);

    const filtered = useMemo(() => {
        const t0 = new Date(); t0.setHours(0, 0, 0, 0);
        const q = searchQuery.trim().toLowerCase();
        return records.filter(({ flight: f, trip }) => {
            if (q && !`${f.provider} ${f.identifier} ${f.origin} ${f.destination} ${f.mode} ${trip.name} ${f.confirmationCode}`.toLowerCase().includes(q)) return false;
            const dep = getFlightDepartureUtcDate(f);
            if (timeFilter === 'upcoming' && dep < t0) return false;
            if (timeFilter === 'past' && dep >= t0) return false;
            if (yearFilter !== 'all' && (f.departureDate || '').slice(0, 4) !== yearFilter) return false;
            return true;
        });
    }, [records, searchQuery, timeFilter, yearFilter]);

    const uniqueYears = useMemo(() => {
        const yrs = new Set<string>();
        records.forEach(r => { const y = (r.flight.departureDate || '').slice(0, 4); if (/^\d{4}$/.test(y)) yrs.add(y); });
        return Array.from(yrs).sort().reverse();
    }, [records]);

    const resetFilters = () => { setSearchQuery(''); setTimeFilter('all'); setYearFilter('all'); };

    /** Stops that are new or changed count as visited places; this never blocks or fails a save. */
    const syncStops = (leg: Transport, before?: Transport) => {
        if (leg.waypoints?.length && JSON.stringify(before?.waypoints) !== JSON.stringify(leg.waypoints)) {
            void syncPitStopsToVisited(leg.waypoints, { date: leg.departureDate, origin: leg.origin, destination: leg.destination }).catch(() => undefined);
        }
    };

    /** Saves a journey with every field it has, moving it between a trip and "no trip" in one transaction. */
    const saveJourney = async (leg: Transport, tripId: string, original?: { flight: Transport; tripId: string }): Promise<void> => {
        const withPlaces: Transport = { ...leg };
        try {
            const { getCoordinates } = await import('../services/geocoding');
            if (withPlaces.origin?.trim() && (withPlaces.originLat == null || withPlaces.originGeoKey !== withPlaces.origin)) {
                const c = await getCoordinates(withPlaces.origin);
                if (c) { withPlaces.originLat = c.lat; withPlaces.originLng = c.lng; withPlaces.originGeoKey = withPlaces.origin; }
            }
            if (withPlaces.destination?.trim() && (withPlaces.destLat == null || withPlaces.destGeoKey !== withPlaces.destination)) {
                const c = await getCoordinates(withPlaces.destination);
                if (c) { withPlaces.destLat = c.lat; withPlaces.destLng = c.lng; withPlaces.destGeoKey = withPlaces.destination; }
            }
        } catch { /* positions are optional */ }

        const target = tripId !== 'unassigned' ? trips.find(t => t.id === tripId) : undefined;
        if (tripId !== 'unassigned' && !target) throw new Error('That trip no longer exists.');
        const from = original?.tripId ?? 'unassigned';
        const dropStale = stale.current.has(withPlaces.id) ? [withPlaces.id] : [];

        if (original && from === tripId) {
            if (tripId === 'unassigned') await dataService.updateFlight(withPlaces);
            else {
                await dataService.updateTrip({ ...target!, transports: (target!.transports || []).map(t => (t.id === withPlaces.id ? withPlaces : t)) });
                if (dropStale.length) await dataService.applyBatch({ deleteFlights: dropStale });
            }
        } else if (original) {
            const move: { upsertTrips: Trip[]; deleteFlights: string[]; upsertFlights: Transport[] } = { upsertTrips: [], deleteFlights: [...dropStale], upsertFlights: [] };
            if (from === 'unassigned') move.deleteFlights.push(original.flight.id);
            else {
                const old = trips.find(t => t.id === from);
                if (old) move.upsertTrips.push({ ...old, transports: (old.transports || []).filter(t => t.id !== original.flight.id) });
            }
            if (tripId === 'unassigned') move.upsertFlights.push(withPlaces);
            else move.upsertTrips.push({ ...target!, transports: [...(target!.transports || []), withPlaces] });
            await dataService.applyBatch(move);
        } else if (tripId === 'unassigned') {
            await dataService.addFlight(withPlaces);
        } else {
            await dataService.updateTrip({ ...target!, transports: [...(target!.transports || []), withPlaces] });
        }
        syncStops(withPlaces, original?.flight);
        refreshData();
    };

    /** Adds several new journeys to a trip (or to "no trip") in one write. */
    const addJourneys = async (list: Transport[], tripId: string): Promise<void> => {
        if (list.length === 0) return;
        if (tripId === 'unassigned') { for (const t of list) await dataService.addFlight(t); }
        else {
            const target = trips.find(t => t.id === tripId);
            if (!target) throw new Error('That trip no longer exists.');
            await dataService.updateTrip({ ...target, transports: [...(target.transports || []), ...list] });
        }
        refreshData();
    };

    /** Moves journeys to a trip, or to "no trip" (`'unassigned'`), in one transaction. */
    const assignJourneys = async (list: RoadRecord[], tripId: string): Promise<void> => {
        const target = tripId !== 'unassigned' ? trips.find(t => t.id === tripId) : undefined;
        if (tripId !== 'unassigned' && !target) throw new Error('That trip no longer exists.');
        const moving = list.filter(r => (isIndependent(r.trip.id) ? 'unassigned' : r.trip.id) !== tripId);
        if (moving.length === 0) return;
        const deleteFlights: string[] = [];
        const touched = new Map<string, Trip>();
        const edit = (id: string) => {
            if (!touched.has(id)) { const t = trips.find(x => x.id === id); if (t) touched.set(id, { ...t, transports: [...(t.transports || [])] }); }
            return touched.get(id);
        };
        for (const r of moving) {
            if (isIndependent(r.trip.id)) deleteFlights.push(r.flight.id);
            else { const t = edit(r.trip.id); if (t) t.transports = (t.transports || []).filter(x => x.id !== r.flight.id); }
        }
        const upsertFlights: Transport[] = [];
        if (tripId === 'unassigned') moving.forEach(r => upsertFlights.push({ ...r.flight, itineraryId: '' }));
        else { const t = edit(tripId)!; t.transports = [...(t.transports || []), ...moving.map(r => ({ ...r.flight }))]; }
        await dataService.applyBatch({ upsertTrips: Array.from(touched.values()), deleteFlights, upsertFlights });
        refreshData();
    };

    /** Deletes journeys (from their trips, or the independent list) in one transaction. */
    const deleteJourneys = async (list: RoadRecord[]): Promise<void> => {
        const ids = new Set(list.map(r => r.flight.id));
        const deleteFlights = list.filter(r => isIndependent(r.trip.id)).map(r => r.flight.id);
        stale.current.forEach(id => { if (ids.has(id)) deleteFlights.push(id); });
        const byTrip = new Map<string, Trip>();
        for (const r of list) {
            if (isIndependent(r.trip.id)) continue;
            const base = byTrip.get(r.trip.id) ?? trips.find(t => t.id === r.trip.id) ?? r.trip;
            byTrip.set(r.trip.id, { ...base, transports: (base.transports || []).filter(t => t.id !== r.flight.id) });
        }
        await dataService.applyBatch({ deleteFlights: Array.from(new Set(deleteFlights)), upsertTrips: Array.from(byTrip.values()) });
        refreshData();
    };

    /** Makes a trip of journeys, named for where the first leg goes. Gives back the trip and a function that undoes it. */
    const createTripFromJourneys = async (list: RoadRecord[]): Promise<{ tripId: string; name: string; undo: () => Promise<void> }> => {
        if (list.length === 0) throw new Error('Choose at least one journey.');
        const sorted = [...list].sort((a, b) => getFlightDepartureUtcDate(a.flight).getTime() - getFlightDepartureUtcDate(b.flight).getTime());
        const home = sorted[0].flight.origin.trim().toLowerCase();
        const away = sorted.find(r => r.flight.destination.trim().toLowerCase() !== home)?.flight.destination || sorted[0].flight.destination;
        const city = away.split(/[,(]/)[0].trim() || away;
        const start = sorted.map(r => r.flight.departureDate).filter(Boolean).sort()[0] || today();
        const end = sorted.map(r => r.flight.arrivalDate || r.flight.departureDate).filter(Boolean).sort().slice(-1)[0] || start;
        const id = `trip-${Math.random().toString(36).slice(2, 11)}`;
        const name = `Trip to ${city}`;
        const trip = {
            id, name, location: city, startDate: start, endDate: end, status: end < today() ? 'Past' : 'Planning',
            participants: currentUser ? [currentUser.id] : [], privacy: 'Private',
            locations: [{ id: `${id}-loc`, name: city, startDate: start, endDate: end }],
            transports: sorted.map(r => ({ ...r.flight, itineraryId: `itinerary-${id}` })), accommodations: [], activities: [],
        } as unknown as Trip;
        const snapshotJourneys = sorted.filter(r => isIndependent(r.trip.id)).map(r => r.flight);
        const touchedIds = Array.from(new Set(sorted.filter(r => !isIndependent(r.trip.id)).map(r => r.trip.id)));
        const snapshotTrips = touchedIds.map(tid => trips.find(t => t.id === tid)).filter(Boolean).map(t => JSON.parse(JSON.stringify(t)) as Trip);
        await dataService.addTrip(trip);
        const moved = new Set(sorted.map(r => r.flight.id));
        await dataService.applyBatch({
            deleteFlights: snapshotJourneys.map(f => f.id),
            upsertTrips: snapshotTrips.map(t => ({ ...t, transports: (t.transports || []).filter(x => !moved.has(x.id)) })),
        });
        refreshData();
        return {
            tripId: id, name,
            undo: async () => { await dataService.deleteTrip(id); await dataService.applyBatch({ upsertTrips: snapshotTrips, upsertFlights: snapshotJourneys }); refreshData(); },
        };
    };

    return {
        trips, users, currentUser, records, loaded, loadError, workspaceSettings, refreshData,
        searchQuery, setSearchQuery, timeFilter, setTimeFilter, yearFilter, setYearFilter, resetFilters,
        filtered, uniqueYears,
        saveJourney, addJourneys, assignJourneys, deleteJourneys, createTripFromJourneys, newId,
    };
};
