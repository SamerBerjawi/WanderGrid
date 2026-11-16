import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CustomEvent as CalendarEvent, EntitlementType, LeaveEntry, SavedConfig, Trip, User, WorkspaceSettings } from '../types';
import { dataService } from '../services/mockDb';
import { affectsCollections } from './useWanderSync';
import { readSessionUser } from './useMemberData';
import { todayISO } from '../utils/tripsModel';

/**
 * Data and writes for the New calendar: trips, leave entries, members, leave types, saved holiday calendars, events
 * and the workspace settings, refreshed whenever one of those collections changes. Leave is its own record (leave
 * Phase 1): one entry per member, optionally linked to a trip.
 */
export const useCalendarData = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [trips, setTrips] = useState<Trip[]>([]);
    const [leave, setLeave] = useState<LeaveEntry[]>([]);
    const [entitlements, setEntitlements] = useState<EntitlementType[]>([]);
    const [configs, setConfigs] = useState<SavedConfig[]>([]);
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const [u, t, lv] = await Promise.all([dataService.getUsers(), dataService.getTrips(), dataService.getLeave()]);
            setUsers(u || []);
            setTrips(t || []);
            setLeave(lv || []);
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
        const onUpdate = (e: Event) => { if (affectsCollections(e, ['trips', 'leave', 'users', 'entitlements', 'configs', 'events', 'settings'])) void load(); };
        window.addEventListener('wandergrid_db_updated', onUpdate);
        return () => window.removeEventListener('wandergrid_db_updated', onUpdate);
    }, [load]);

    const session = readSessionUser();
    const me = useMemo(() => users.find(u => u.id === session?.id), [users, session?.id]);
    const isAdmin = (me?.role ?? session?.role) === 'Admin';
    const today = todayISO();

    const guarded = async <T,>(run: () => Promise<T>): Promise<T> => {
        try { return await run(); } catch (e) { void load(); throw e; }
    };

    /** Adds a leave entry, or saves a changed one (the list shows the change at once). */
    const saveLeave = useCallback(async (entry: LeaveEntry): Promise<LeaveEntry> => {
        const exists = leave.some(e => e.id === entry.id);
        setLeave(prev => (exists ? prev.map(e => (e.id === entry.id ? entry : e)) : [...prev, entry]));
        const saved = await guarded(() => (exists ? dataService.updateLeave(entry) : dataService.addLeave(entry)));
        setLeave(prev => prev.map(e => (e.id === saved.id ? saved : e)));
        return saved;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [leave, load]);

    /** Deletes a leave entry (the caller confirms with a hold and offers Undo). */
    const deleteLeave = useCallback(async (entry: LeaveEntry): Promise<void> => {
        setLeave(prev => prev.filter(e => e.id !== entry.id));
        await guarded(() => dataService.deleteLeave(entry.id));
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
        users, trips, leave, entitlements, configs, events, settings, loading, error, today,
        me, isAdmin, session,
        reload: load, saveLeave, deleteLeave, setHolidayIncluded, setMemberCalendar, addCalendar, removeCalendar, addEvent, deleteEvent,
    };
};

export type CalendarData = ReturnType<typeof useCalendarData>;
