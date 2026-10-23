import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CustomEvent as CalendarEvent, EntitlementType, SavedConfig, Trip, User, WorkspaceSettings } from '../types';
import { dataService } from '../services/mockDb';
import { affectsCollections } from './useWanderSync';
import { readSessionUser } from './useMemberData';
import { todayISO } from '../utils/tripsModel';
import { LEAVE_ID_PREFIX } from '../utils/calendarModel';

/** The fields of a trip that make it leave: a type (or a split), how much of each day, and the days worked anyway. */
export type LeaveFields = Pick<Trip, 'entitlementId' | 'allocations' | 'durationMode' | 'startPortion' | 'endPortion' | 'excludedDates'>;

export const NO_LEAVE: LeaveFields = {
    entitlementId: undefined,
    allocations: undefined,
    durationMode: undefined,
    startPortion: undefined,
    endPortion: undefined,
    excludedDates: undefined,
};

export const leaveFieldsOf = (trip: Trip): LeaveFields => ({
    entitlementId: trip.entitlementId,
    allocations: trip.allocations,
    durationMode: trip.durationMode,
    startPortion: trip.startPortion,
    endPortion: trip.endPortion,
    excludedDates: trip.excludedDates,
});

export interface NewLeave {
    memberId: string;
    name: string;
    startDate: string;
    endDate: string;
    status: Trip['status'];
    fields: LeaveFields;
}

/**
 * Data and writes for the New calendar: trips, members, leave types, saved holiday calendars, events and
 * the workspace settings, refreshed whenever one of those collections changes. Leave is stored on trips
 * (a leave type, `allocations`, the day length and the days worked anyway); time off made on the calendar
 * is a hidden trip whose id starts with `leave-`, so it counts in every balance without cluttering Trips.
 */
export const useCalendarData = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [trips, setTrips] = useState<Trip[]>([]);
    const [entitlements, setEntitlements] = useState<EntitlementType[]>([]);
    const [configs, setConfigs] = useState<SavedConfig[]>([]);
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const [u, t] = await Promise.all([dataService.getUsers(), dataService.getTrips()]);
            setUsers(u || []);
            setTrips(t || []);
            setError(null);
        } catch (e) {
            console.error('Calendar: failed to load', e);
            setError("Couldn't load the calendar. Check your connection and try again.");
        } finally {
            setLoading(false);
        }
        // The rest is optional: a failure leaves that layer empty and never blocks the page.
        const [ents, cfgs, evs, ws] = await Promise.all([
            dataService.getEntitlementTypes().catch(() => [] as EntitlementType[]),
            dataService.getSavedConfigs().catch(() => [] as SavedConfig[]),
            dataService.getCustomEvents().catch(() => [] as CalendarEvent[]),
            dataService.getWorkspaceSettings().catch(() => null),
        ]);
        setEntitlements(ents || []);
        setConfigs(cfgs || []);
        setEvents(evs || []);
        setSettings(ws);
    }, []);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => {
        const onUpdate = (e: Event) => { if (affectsCollections(e, ['trips', 'users', 'entitlements', 'configs', 'events', 'settings'])) void load(); };
        window.addEventListener('wandergrid_db_updated', onUpdate);
        return () => window.removeEventListener('wandergrid_db_updated', onUpdate);
    }, [load]);

    const session = readSessionUser();
    const me = useMemo(() => users.find(u => u.id === session?.id), [users, session?.id]);
    const isAdmin = (me?.role ?? session?.role) === 'Admin';
    const today = todayISO();

    const replaceTrip = (next: Trip) => setTrips(prev => (prev.some(t => t.id === next.id) ? prev.map(t => (t.id === next.id ? next : t)) : [...prev, next]));
    const guarded = async <T,>(run: () => Promise<T>): Promise<T> => {
        try { return await run(); } catch (e) { void load(); throw e; }
    };

    /** Sets (or, with NO_LEAVE, removes) the leave on a trip and keeps everything else on it. */
    const saveLeave = useCallback(async (trip: Trip, fields: LeaveFields, extra: Partial<Trip> = {}): Promise<Trip> => {
        const current = trips.find(t => t.id === trip.id) ?? trip;
        const next: Trip = { ...current, ...extra, ...fields };
        replaceTrip(next);
        const saved = await guarded(() => dataService.updateTrip(next));
        replaceTrip(saved);
        return saved;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [trips, load]);

    /** Time off made on the calendar: a hidden trip for one member. */
    const createLeave = useCallback(async (input: NewLeave): Promise<Trip> => {
        const payload: Trip = {
            id: `${LEAVE_ID_PREFIX}${crypto.randomUUID()}`,
            name: input.name.trim() || 'Time off',
            location: '',
            startDate: input.startDate,
            endDate: input.endDate || input.startDate,
            status: input.status,
            participants: [input.memberId],
            privacy: 'Private',
            hideInPlanner: true,
            ...input.fields,
        };
        let saved = await guarded(() => dataService.addTrip(payload));
        // Saving adds the signed-in user to every new trip; time off made for someone else stays theirs.
        if (!saved.participants.every(p => p === input.memberId) || !saved.participants.includes(input.memberId)) {
            saved = await guarded(() => dataService.updateTrip({ ...saved, participants: [input.memberId] }));
        }
        replaceTrip(saved);
        return saved;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]);

    /** Deletes time off made on the calendar (permanent: the caller confirms with a hold). */
    const deleteLeave = useCallback(async (trip: Trip): Promise<void> => {
        setTrips(prev => prev.filter(t => t.id !== trip.id));
        await guarded(() => dataService.deleteTrip(trip.id));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]);

    /** Switches a public holiday on or off as a day off in its saved calendar. */
    const setHolidayIncluded = useCallback(async (config: SavedConfig, holidayId: string, included: boolean): Promise<void> => {
        const next: SavedConfig = {
            ...config,
            holidays: config.holidays.map(h => (h.id === holidayId ? { ...h, isIncluded: included } : h)),
            updatedAt: new Date().toISOString(),
        };
        setConfigs(prev => prev.map(c => (c.id === config.id ? next : c)));
        await guarded(() => dataService.saveConfig(next));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]);

    /** Adds a one-day event (admins). */
    const addEvent = useCallback(async (event: CalendarEvent): Promise<CalendarEvent> => {
        setEvents(prev => [...prev.filter(e => e.id !== event.id), event]);
        await guarded(() => dataService.addCustomEvent(event));
        return event;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]);

    /** Removes an event (admins). */
    const deleteEvent = useCallback(async (id: string): Promise<void> => {
        setEvents(prev => prev.filter(e => e.id !== id));
        await guarded(() => dataService.deleteCustomEvent(id));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]);

    /** Saves a country calendar fetched from the holiday service (or refreshes one already saved: your day-off switches are kept). */
    const addCalendar = useCallback(async (config: SavedConfig): Promise<SavedConfig> => {
        const existing = configs.find(c => c.id === config.id);
        const merged: SavedConfig = existing
            ? { ...config, holidays: config.holidays.map(h => { const old = existing.holidays.find(o => o.date === h.date && o.name === h.name); return old ? { ...h, isIncluded: old.isIncluded } : h; }) }
            : config;
        setConfigs(prev => (prev.some(c => c.id === merged.id) ? prev.map(c => (c.id === merged.id ? merged : c)) : [...prev, merged]));
        await guarded(() => dataService.saveConfig(merged));
        return merged;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [configs, load]);

    /** Deletes a saved country calendar (admins only; members following it simply stop seeing it). */
    const removeCalendar = useCallback(async (config: SavedConfig): Promise<void> => {
        setConfigs(prev => prev.filter(c => c.id !== config.id));
        await guarded(() => dataService.deleteConfig(config.id));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]);

    /** Links or unlinks a saved holiday calendar for a member. */
    const setMemberCalendar = useCallback(async (member: User, configId: string, linked: boolean): Promise<void> => {
        const ids = member.holidayConfigIds || [];
        const next = linked ? Array.from(new Set([...ids, configId])) : ids.filter(id => id !== configId);
        const updated = { ...member, holidayConfigIds: next };
        setUsers(prev => prev.map(u => (u.id === member.id ? updated : u)));
        await guarded(() => dataService.updateUser(updated));
        await load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]);

    return {
        users, trips, entitlements, configs, events, settings, loading, error, today,
        me, isAdmin, session,
        reload: load, saveLeave, createLeave, deleteLeave, setHolidayIncluded, setMemberCalendar, addCalendar, removeCalendar, addEvent, deleteEvent,
    };
};

export type CalendarData = ReturnType<typeof useCalendarData>;
