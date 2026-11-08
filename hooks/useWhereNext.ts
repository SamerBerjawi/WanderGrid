import { useEffect, useMemo, useState } from 'react';
import type { SavedConfig } from '../types';
import type { DashboardData } from './useDashboardData';
import { dataService } from '../services/mockDb';
import { getCoordinatesSync } from '../services/geocoding';
import { centroidOf, loadCentroids, type LatLng } from '../services/countryCentroids';
import { affectsCollections } from './useWanderSync';
import { configsFor, dayWeight, hasLeave, holidayDays, leaveContext, tripDates, workingDaysOf } from '../utils/calendarModel';
import { buildIdeas, type Candidate, type Idea } from '../utils/whereNext';

/**
 * Where next? ideas for the Dashboard: loads the holiday calendars and workspace settings, then pairs the member's
 * coming days off (utils/whereNext.ts) with the wishlist. Does nothing, and loads nothing, while `enabled` is false.
 */

const sessionUserId = (): string | undefined => {
    try { return JSON.parse(localStorage.getItem('wandergrid_session_user') || 'null')?.id; } catch { return undefined; }
};

export const useWhereNextIdeas = (data: DashboardData, enabled: boolean): Idea[] => {
    const [configs, setConfigs] = useState<SavedConfig[]>([]);
    const [workingDays, setWorkingDays] = useState<number[]>(workingDaysOf(null));
    const [startAirport, setStartAirport] = useState<string | undefined>();
    const [centroids, setCentroids] = useState<Map<string, LatLng>>(new Map());

    useEffect(() => {
        if (!enabled) return;
        let live = true;
        loadCentroids().then(c => { if (live) setCentroids(c); });
        const load = () => {
            dataService.getSavedConfigs().then(c => { if (live) setConfigs(c || []); }).catch(() => { /* no holidays: weekends are used */ });
            dataService.getWorkspaceSettings().then(s => { if (live) { setWorkingDays(workingDaysOf(s)); setStartAirport(s.defaultStartingAirport || undefined); } }).catch(() => { /* defaults */ });
        };
        load();
        const onUpdate = (e: Event) => { if (affectsCollections(e, ['configs', 'settings'])) load(); };
        window.addEventListener('wandergrid_db_updated', onUpdate);
        return () => { live = false; window.removeEventListener('wandergrid_db_updated', onUpdate); };
    }, [enabled]);

    return useMemo(() => {
        if (!enabled || data.wishlist.length === 0) return [];
        const me = data.users.find(u => u.id === sessionUserId()) ?? data.users[0];
        const holidays = me ? holidayDays(configsFor(configs, [me]), me.holidayWeekendRule, workingDays) : [];
        const ctx = leaveContext(workingDays, holidays);
        const booked = new Set<string>();
        data.trips.filter(t => t.status !== 'Cancelled' && hasLeave(t) && (!me || (t.participants || []).includes(me.id))).forEach(t => {
            tripDates(t).forEach(iso => { if (dayWeight(t, iso, ctx) > 0) booked.add(iso); });
        });
        const homePoint = startAirport ? getCoordinatesSync(startAirport) : undefined;
        const places: Candidate[] = data.wishlist.map(item => {
            const at = centroidOf(centroids, item.code) ?? getCoordinatesSync(item.name);
            return { id: item.id, name: item.name, code: item.code, notes: item.notes, lat: at?.lat, lng: at?.lng };
        });
        return buildIdeas({
            today: data.today, workingDays, holidays, booked, places,
            trips: data.trips.filter(t => !me || (t.participants || []).includes(me.id)),
            home: homePoint ? { lat: homePoint.lat, lng: homePoint.lng } : undefined,
        });
    }, [enabled, data.wishlist, data.users, data.trips, data.today, configs, workingDays, startAirport, centroids]);
};
