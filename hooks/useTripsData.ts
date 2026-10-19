import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Accommodation, Transport, Trip, User } from '../types';
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
    /** Legs and stays entered while creating the trip. */
    transports?: Partial<Transport>[];
    stays?: Partial<Accommodation>[];
}

/**
 * Data and actions for the New Trips page: trips and members, plus every write (create, edit, move
 * between columns, archive and restore, delete). Writes update the board at once and reload from the
 * server if they fail.
 */
export const useTripsData = () => {
    const [trips, setTrips] = useState<Trip[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [brandfetchApiKey, setBrandfetchApiKey] = useState<string | undefined>(undefined);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // Undo runs from an old render, so writes read the latest trips through a ref, never a closure.
    const tripsRef = useRef<Trip[]>([]);
    tripsRef.current = trips;

    const load = useCallback(async () => {
        try {
            const [t, u, settings] = await Promise.all([
                dataService.getTrips(),
                dataService.getUsers(),
                // Logos are optional: a settings failure never blocks the board.
                dataService.getWorkspaceSettings().catch(() => null),
            ]);
            setTrips(t || []);
            setUsers(u || []);
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

    // Cancelled trips and bundle-only records never appear on the board.
    const board = useMemo(() => trips.filter(t => t.status !== 'Cancelled' && !t.hideInPlanner), [trips]);
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
        const payload: Trip = {
            id: crypto.randomUUID(),
            name,
            location: destination,
            startDate: draft.startDate,
            endDate: draft.endDate || draft.startDate,
            status: draft.status,
            participants: draft.participants,
            notes: draft.notes?.trim() || undefined,
            hugeicon: draft.icon || undefined,
            locations: destination
                ? [{ id: crypto.randomUUID(), name: destination, startDate: draft.startDate, endDate: draft.endDate || draft.startDate }]
                : [],
            transports: (draft.transports || []).map(t => ({
                id: crypto.randomUUID(),
                itineraryId: crypto.randomUUID(),
                type: 'One-Way',
                mode: t.mode || 'Flight',
                provider: t.provider || '',
                identifier: t.identifier || '',
                confirmationCode: t.confirmationCode || '',
                origin: t.origin || '',
                destination: t.destination || '',
                departureDate: t.departureDate || draft.startDate,
                departureTime: t.departureTime || '10:00',
                arrivalDate: t.arrivalDate || t.departureDate || draft.startDate,
                arrivalTime: t.arrivalTime || '14:00',
                cost: t.cost,
                reason: 'Personal',
            })),
            accommodations: (draft.stays || []).map(a => ({
                id: crypto.randomUUID(),
                name: a.name || 'Stay',
                type: a.type || 'Hotel',
                address: a.address || destination,
                checkInDate: a.checkInDate || draft.startDate,
                checkInTime: a.checkInTime || '15:00',
                checkOutDate: a.checkOutDate || draft.endDate || draft.startDate,
                checkOutTime: a.checkOutTime || '11:00',
                confirmationCode: a.confirmationCode || '',
                cost: a.cost,
            })),
            activities: [],
        };
        const saved = await dataService.addTrip(payload);
        setTrips(prev => [...prev, saved]);
        return saved;
    }, []);

    const update = useCallback(async (trip: Trip, draft: TripDraft): Promise<Trip> => {
        const destination = draft.destination.trim();
        const locations = (trip.locations || []).length && trip.location.trim() === destination ? trip.locations : undefined;
        const next: Trip = {
            ...trip,
            name: draft.name.trim(),
            location: destination,
            startDate: draft.startDate,
            endDate: draft.endDate || draft.startDate,
            status: draft.status,
            participants: draft.participants,
            notes: draft.notes?.trim() || undefined,
            hugeicon: draft.icon || undefined,
            // A changed destination replaces the route with that one stop, which is geocoded on save.
            locations: locations ?? (destination
                ? [{ id: crypto.randomUUID(), name: destination, startDate: draft.startDate, endDate: draft.endDate || draft.startDate }]
                : []),
        };
        replace(next);
        const saved = await guarded(() => dataService.updateTrip(next));
        replace(saved);
        return saved;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]);

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

    return { trips, users, brandfetchApiKey, loading, error, reload: load, today, active, archived, columns, years, stats, create, update, setStatus, moveTo, setArchived, remove };
};

export type TripsData = ReturnType<typeof useTripsData>;
