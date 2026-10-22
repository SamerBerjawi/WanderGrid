import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Accommodation, Activity, EntitlementType, GeoCoordinates, Transport, Trip, TripAllocation, User } from '../types';
import { dataService } from '../services/mockDb';
import { affectsCollections } from './useWanderSync';
import { BUCKET_STATUS, bucketOf, destinationsOf, todayISO, tripDays, type TripBucket } from '../utils/tripsModel';

/** What the New trip sheet collects. */
export interface TripDraft {
    name: string;
    destination: string;
    startDate: string;
    endDate: string;
    status: Trip['status'];
    participants: string[];
    notes?: string;
    /** A Hugeicons free icon name chosen for the trip. */
    icon?: string;
    /** Where the destination is, when it was picked from the place search. */
    coordinates?: GeoCoordinates;
    privacy?: 'Private' | 'Public';
    /** Leave type this trip counts against; empty means a general event with no leave impact. */
    entitlementId?: string;
    /** The days split across leave types (and years). The first one is the trip's main leave type. */
    allocations?: TripAllocation[];
    /** Legs, stays and activities. Items that already exist carry their ids and every other field. */
    transports?: Partial<Transport>[];
    stays?: Partial<Accommodation>[];
    activities?: Partial<Activity>[];
}

const uid = () => crypto.randomUUID();

/** A full leg from a form's partial one, keeping everything an existing leg already had. */
const toTransport = (t: Partial<Transport>, fallbackDate: string): Transport => ({
    type: 'One-Way',
    mode: 'Flight',
    provider: '',
    identifier: '',
    confirmationCode: '',
    origin: '',
    destination: '',
    departureDate: fallbackDate,
    departureTime: '10:00',
    arrivalDate: t.departureDate || fallbackDate,
    arrivalTime: '14:00',
    reason: 'Personal',
    ...t,
    id: t.id || uid(),
    itineraryId: t.itineraryId || uid(),
});

const toStay = (a: Partial<Accommodation>, destination: string, start: string, end: string): Accommodation => ({
    name: 'Stay',
    type: 'Hotel',
    address: destination,
    checkInDate: start,
    checkInTime: '15:00',
    checkOutDate: end,
    checkOutTime: '11:00',
    ...a,
    id: a.id || uid(),
});

const toActivity = (a: Partial<Activity>, fallbackDate: string): Activity => ({
    date: fallbackDate,
    time: '10:00',
    title: 'Activity',
    type: 'Activity',
    ...a,
    id: a.id || uid(),
});

/**
 * Data and actions for the New Trips page: trips and members, plus every write (create, edit, move
 * between columns, archive and restore, delete). Writes update the board at once and reload from the
 * server if they fail.
 */
export const useTripsData = () => {
    const [trips, setTrips] = useState<Trip[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [entitlements, setEntitlements] = useState<EntitlementType[]>([]);
    const [brandfetchApiKey, setBrandfetchApiKey] = useState<string | undefined>(undefined);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // Undo runs from an old render, so writes read the latest trips through a ref, never a closure.
    const tripsRef = useRef<Trip[]>([]);
    tripsRef.current = trips;

    const load = useCallback(async () => {
        try {
            const [t, u, settings, ents] = await Promise.all([
                dataService.getTrips(),
                dataService.getUsers(),
                // Logos and leave types are optional: a failure never blocks the board.
                dataService.getWorkspaceSettings().catch(() => null),
                dataService.getEntitlementTypes().catch(() => [] as EntitlementType[]),
            ]);
            setTrips(t || []);
            setUsers(u || []);
            setEntitlements(ents || []);
            setBrandfetchApiKey(settings?.brandfetchApiKey || undefined);
            setError(null);
        } catch (e) {
            console.error('Trips: failed to load', e);
            setError("Couldn't load your trips. Check your connection and try again.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => {
        const onUpdate = (e: Event) => { if (affectsCollections(e, ['trips', 'users'])) void load(); };
        window.addEventListener('wandergrid_db_updated', onUpdate);
        return () => window.removeEventListener('wandergrid_db_updated', onUpdate);
    }, [load]);

    const today = todayISO();

    // Bundle-only records never appear. Cancelled trips are kept out of the board and shown on their own.
    const board = useMemo(() => trips.filter(t => t.status !== 'Cancelled' && !t.hideInPlanner), [trips]);
    const cancelled = useMemo(() => trips.filter(t => t.status === 'Cancelled' && !t.hideInPlanner), [trips]);
    const active = useMemo(() => board.filter(t => !t.archived), [board]);
    const archived = useMemo(() => board.filter(t => t.archived), [board]);

    const columns = useMemo(() => {
        const out: Record<TripBucket, Trip[]> = { planned: [], confirmed: [], past: [] };
        active.forEach(t => out[bucketOf(t, today)].push(t));
        const byStart = (a: Trip, b: Trip) => (a.startDate || '').localeCompare(b.startDate || '');
        out.planned.sort(byStart);
        out.confirmed.sort(byStart);
        out.past.sort((a, b) => (b.endDate || b.startDate || '').localeCompare(a.endDate || a.startDate || ''));
        return out;
    }, [active, today]);

    const years = useMemo(() => {
        const set = new Set<string>();
        board.forEach(t => [t.startDate, t.endDate].forEach(d => { const y = (d || '').slice(0, 4); if (/^\d{4}$/.test(y)) set.add(y); }));
        return Array.from(set).sort((a, b) => b.localeCompare(a));
    }, [board]);

    const stats = useMemo(() => {
        const coming = columns.confirmed.length + columns.planned.length;
        const days = [...columns.confirmed, ...columns.planned].reduce((sum, t) => sum + tripDays(t), 0);
        const places = new Set<string>();
        active.forEach(t => destinationsOf(t).forEach(d => places.add(d.toLowerCase())));
        return { coming, days, places: places.size };
    }, [columns, active]);

    const replace = (next: Trip) => setTrips(prev => prev.map(t => (t.id === next.id ? next : t)));
    const guarded = async <T,>(run: () => Promise<T>): Promise<T> => {
        try {
            return await run();
        } catch (e) {
            void load();
            throw e;
        }
    };

    const create = useCallback(async (draft: TripDraft): Promise<Trip> => {
        const name = draft.name.trim();
        const destination = draft.destination.trim();
        const start = draft.startDate;
        const end = draft.endDate || draft.startDate;
        const payload: Trip = {
            id: uid(),
            name,
            location: destination,
            startDate: start,
            endDate: end,
            status: draft.status,
            participants: draft.participants,
            notes: draft.notes?.trim() || undefined,
            hugeicon: draft.icon || undefined,
            privacy: draft.privacy,
            entitlementId: draft.allocations?.[0]?.entitlementId || draft.entitlementId || undefined,
            allocations: draft.allocations?.length ? draft.allocations : undefined,
            coordinates: draft.coordinates,
            locations: destination
                ? [{ id: uid(), name: destination, startDate: start, endDate: end, coordinates: draft.coordinates }]
                : [],
            transports: (draft.transports || []).map(t => toTransport(t, start)),
            accommodations: (draft.stays || []).map(a => toStay(a, destination, start, end)),
            activities: (draft.activities || []).map(a => toActivity(a, start)),
        };
        const saved = await dataService.addTrip(payload);
        setTrips(prev => [...prev, saved]);
        return saved;
    }, []);

    const update = useCallback(async (trip: Trip, draft: TripDraft): Promise<Trip> => {
        const destination = draft.destination.trim();
        const start = draft.startDate;
        const end = draft.endDate || draft.startDate;
        const destinationChanged = trip.location.trim() !== destination || Boolean(draft.coordinates && draft.coordinates !== trip.coordinates);
        const stops = trip.locations || [];
        // A changed destination replaces the first stop (and is geocoded on save); later stops stay.
        const locations = destinationChanged
            ? [...(destination ? [{ id: uid(), name: destination, startDate: start, endDate: end, coordinates: draft.coordinates }] : []), ...stops.slice(1)]
            : stops;
        const next: Trip = {
            ...trip,
            name: draft.name.trim(),
            location: destination,
            startDate: start,
            endDate: end,
            status: draft.status,
            participants: draft.participants,
            notes: draft.notes?.trim() || undefined,
            hugeicon: draft.icon || undefined,
            privacy: draft.privacy ?? trip.privacy,
            entitlementId: draft.allocations?.[0]?.entitlementId || draft.entitlementId || undefined,
            allocations: draft.allocations?.length ? draft.allocations : undefined,
            coordinates: draft.coordinates ?? trip.coordinates,
            locations,
            transports: draft.transports ? draft.transports.map(t => toTransport(t, start)) : trip.transports,
            accommodations: draft.stays ? draft.stays.map(a => toStay(a, destination, start, end)) : trip.accommodations,
            activities: draft.activities ? draft.activities.map(a => toActivity(a, start)) : trip.activities,
        };
        replace(next);
        const saved = await guarded(() => dataService.updateTrip(next));
        replace(saved);
        return saved;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]);

    /** A copy of a trip as a new Planned trip, with new ids throughout. */
    const duplicate = useCallback(async (trip: Trip): Promise<Trip> => {
        const itineraries = new Map<string, string>();
        const copy: Trip = {
            ...trip,
            id: uid(),
            name: `${trip.name} (copy)`,
            originalName: undefined,
            version: undefined,
            status: 'Planning',
            archived: false,
            locations: (trip.locations || []).map(l => ({ ...l, id: uid() })),
            transports: (trip.transports || []).map(t => {
                const old = t.itineraryId;
                if (!itineraries.has(old)) itineraries.set(old, uid());
                return { ...t, id: uid(), itineraryId: itineraries.get(old)! };
            }),
            accommodations: (trip.accommodations || []).map(a => ({ ...a, id: uid() })),
            activities: (trip.activities || []).map(a => ({ ...a, id: uid() })),
            packingList: (trip.packingList || []).map(p => ({ ...p, id: uid() })),
        };
        const saved = await dataService.addTrip(copy);
        setTrips(prev => [...prev, saved]);
        return saved;
    }, []);

    /** Puts a trip in a column by changing its status. Returns the status it had, for undo. */
    const setStatus = useCallback(async (id: string, status: Trip['status']): Promise<Trip['status'] | undefined> => {
        const current = tripsRef.current.find(t => t.id === id);
        if (!current || current.status === status) return current?.status;
        const next = { ...current, status };
        replace(next);
        replace(await guarded(() => dataService.updateTrip(next)));
        return current.status;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]);

    const moveTo = useCallback((id: string, bucket: TripBucket) => setStatus(id, BUCKET_STATUS[bucket]), [setStatus]);

    const setArchived = useCallback(async (ids: string[], archivedFlag: boolean) => {
        const wanted = new Set(ids);
        setTrips(prev => prev.map(t => (wanted.has(t.id) ? { ...t, archived: archivedFlag } : t)));
        await guarded(() => dataService.setTripsArchived(ids, archivedFlag));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]);

    const remove = useCallback(async (id: string) => {
        setTrips(prev => prev.filter(t => t.id !== id));
        await guarded(() => dataService.deleteTrip(id));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]);

    return { trips, users, entitlements, brandfetchApiKey, loading, error, reload: load, today, active, archived, cancelled, columns, years, stats, create, update, duplicate, setStatus, moveTo, setArchived, remove };
};

export type TripsData = ReturnType<typeof useTripsData>;
