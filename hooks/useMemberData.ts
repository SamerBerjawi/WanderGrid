import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EntitlementType, Trip, User } from '../types';
import { dataService } from '../services/mockDb';
import { affectsCollections } from './useWanderSync';
import { countryCodeOf } from '../utils/countryCodes';
import { bucketOf, destinationsOf, tripDays, todayISO, isTravelling, type TripBucket } from '../utils/tripsModel';

/** The signed-in user as the app stored it at sign-in (id and role); never throws. */
export const readSessionUser = (): { id?: string; role?: string } | null => {
    try { return JSON.parse(localStorage.getItem('wandergrid_session_user') || 'null'); } catch { return null; }
};

/** The countries a trip visits: from the geocoded places, else the last part of "City, Country". */
export const countriesOf = (trip: Trip): string[] => {
    const geocoded = [trip.coordinates?.country, ...(trip.locations || []).map(l => l.coordinates?.country)].filter((c): c is string => Boolean(c));
    const names = geocoded.length > 0
        ? geocoded
        : [trip.location, ...(trip.locations || []).map(l => l.name)].map(t => (t || '').split(',').map(x => x.trim()).filter(Boolean)).filter(parts => parts.length > 1).map(parts => parts[parts.length - 1]);
    return Array.from(new Set(names));
}

export interface MemberTrip { trip: Trip; bucket: TripBucket; travelling: boolean }

/**
 * Data and actions for the New member page: the member, their trips, the workspace's leave types and
 * the writes (save profile, remove). The server decides who may edit whom (an admin anyone, everyone
 * else only themselves and never their own role); the page only hides what the server would refuse.
 */
export const useMemberData = (memberId: string) => {
    const [users, setUsers] = useState<User[]>([]);
    const [trips, setTrips] = useState<Trip[]>([]);
    const [entitlements, setEntitlements] = useState<EntitlementType[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const [u, t, ents] = await Promise.all([
                dataService.getUsers(),
                dataService.getTrips(),
                // Leave types are optional: a failure never blocks the page.
                dataService.getEntitlementTypes().catch(() => [] as EntitlementType[]),
            ]);
            setUsers(u || []);
            setTrips(t || []);
            setEntitlements(ents || []);
            setError(null);
        } catch (e) {
            console.error('Member: failed to load', e);
            setError("Couldn't load this member. Check your connection and try again.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => {
        const onUpdate = (e: Event) => { if (affectsCollections(e, ['trips', 'users', 'entitlements'])) void load(); };
        window.addEventListener('wandergrid_db_updated', onUpdate);
        return () => window.removeEventListener('wandergrid_db_updated', onUpdate);
    }, [load]);

    const member = useMemo(() => users.find(u => u.id === memberId), [users, memberId]);
    const session = readSessionUser();
    const me = useMemo(() => users.find(u => u.id === session?.id), [users, session?.id]);
    const isSelf = Boolean(session?.id && session.id === memberId);
    const isAdmin = (me?.role ?? session?.role) === 'Admin';
    const canEdit = isAdmin || isSelf;
    const canRemove = isAdmin && !isSelf;

    const today = todayISO();
    const memberTrips = useMemo<MemberTrip[]>(() => {
        const mine = trips.filter(t => (t.participants || []).includes(memberId) && !t.hideInPlanner && !t.isBundleOnly);
        const rows = mine.map(trip => ({ trip, bucket: bucketOf(trip, todayISO()), travelling: isTravelling(trip, todayISO()) }));
        // Under way and coming first (soonest first), then the past (newest first); cancelled last.
        const rank = (r: MemberTrip) => (r.trip.status === 'Cancelled' ? 2 : r.bucket === 'past' ? 1 : 0);
        return rows.sort((a, b) => rank(a) - rank(b) || (rank(a) === 1 ? (b.trip.startDate || '').localeCompare(a.trip.startDate || '') : (a.trip.startDate || '').localeCompare(b.trip.startDate || '')));
    }, [trips, memberId]);

    const stats = useMemo(() => {
        const live = memberTrips.filter(r => r.trip.status !== 'Cancelled');
        const past = live.filter(r => r.bucket === 'past');
        type Place = { name: string; date: string; code?: string };
        const lastCountry = new Map<string, Place>();
        const lastCity = new Map<string, Place>();
        const remember = (map: Map<string, Place>, name: string, date: string, code?: string) => {
            const prev = map.get(name);
            if (!prev) map.set(name, { name, date, code });
            else map.set(name, { name, date: date > prev.date ? date : prev.date, code: prev.code || code });
        };
        past.forEach(({ trip }) => {
            const end = trip.endDate || trip.startDate || '';
            // Codes from the geocoded places, else from the country's name.
            const codeByCountry = new Map<string, string | undefined>();
            [trip.coordinates, ...(trip.locations || []).map(l => l.coordinates)].forEach(c => { if (c?.country) codeByCountry.set(c.country, c.countryCode || countryCodeOf(c.country)); });
            const countries = countriesOf(trip);
            countries.forEach(name => remember(lastCountry, name, end, codeByCountry.get(name) || countryCodeOf(name)));
            const countryKeys = new Set(countries.map(c => c.toLowerCase()));
            const lone = countries.length === 1 ? (codeByCountry.get(countries[0]) || countryCodeOf(countries[0])) : undefined;
            destinationsOf(trip).forEach(name => {
                if (countryKeys.has(name.toLowerCase())) return;
                const loc = (trip.locations || []).find(l => l.name === name);
                remember(lastCity, name, end, loc?.coordinates?.countryCode || lone);
            });
        });
        const byDate = (a: Place, b: Place) => b.date.localeCompare(a.date);
        const countries = [...lastCountry.values()].sort(byDate);
        const cities = [...lastCity.values()].sort(byDate);
        const places = [...countries, ...cities];
        return {
            trips: live.length,
            coming: live.filter(r => r.bucket !== 'past').length,
            daysAway: past.reduce((sum, r) => sum + tripDays(r.trip), 0),
            flights: live.reduce((n, r) => n + (r.trip.transports || []).filter(x => x.mode === 'Flight').length, 0),
            places,
            cities,
            countries,
        };
    }, [memberTrips]);

    /** Saves the profile. The typed password (if any) is sent once and never kept. */
    const save = useCallback(async (next: User) => {
        await dataService.updateUser(next);
        const { password: _typed, ...stored } = next;
        // Keep the signed-in user's cached copy in step, as the original page does.
        try {
            const raw = localStorage.getItem('wandergrid_session_user');
            if (raw && JSON.parse(raw).id === next.id) localStorage.setItem('wandergrid_session_user', JSON.stringify({ ...JSON.parse(raw), ...stored }));
        } catch { /* unreadable session */ }
        setUsers(list => list.map(u => (u.id === next.id ? { ...u, ...stored } : u)));
        await load();
    }, [load]);

    const remove = useCallback(async () => { await dataService.deleteUser(memberId); }, [memberId]);

    return { member, users, trips, memberTrips, stats, entitlements, loading, error, isSelf, isAdmin, canEdit, canRemove, today, reload: load, save, remove };
};
