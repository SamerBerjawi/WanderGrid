import { useEffect, useMemo, useState } from 'react';
import type { SavedConfig, User } from '../types';
import { dataService } from '../services/mockDb';
import { affectsCollections } from './useWanderSync';
import { configsFor, holidayDays, leaveContext, memberWorkingDays, workingDaysOf, type HolidayDay, type LeaveContext } from '../utils/calendarModel';

/**
 * The rules that decide what a day of leave costs, for any page that counts leave: the saved holiday calendars
 * and the workspace's working week, with each member's own holidays (their calendars and weekend rule). Every
 * page that shows a leave figure goes through this and `utils/calendarModel.ts`, so the numbers agree.
 */
export interface LeaveRules {
    configs: SavedConfig[];
    workingDays: number[];
    /** False until the calendars and the working week have loaded (figures before that skip holidays). */
    ready: boolean;
    holidaysOf: (user: User) => HolidayDay[];
    contextFor: (user: User) => LeaveContext;
    /** The member's own working week, else the workspace's. */
    workingDaysOf: (user: User | undefined) => number[];
}

export const useLeaveRules = (): LeaveRules => {
    const [configs, setConfigs] = useState<SavedConfig[]>([]);
    const [workingDays, setWorkingDays] = useState<number[]>(workingDaysOf(null));
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let live = true;
        const load = () => {
            Promise.allSettled([
                dataService.getSavedConfigs().then(c => { if (live) setConfigs(c || []); }),
                dataService.getWorkspaceSettings().then(s => { if (live) setWorkingDays(workingDaysOf(s)); }),
            ]).then(() => { if (live) setReady(true); });
        };
        load();
        const onUpdate = (e: Event) => { if (affectsCollections(e, ['configs', 'settings'])) load(); };
        window.addEventListener('wandergrid_db_updated', onUpdate);
        return () => { live = false; window.removeEventListener('wandergrid_db_updated', onUpdate); };
    }, []);

    return useMemo<LeaveRules>(() => {
        const holidays = new Map<string, HolidayDay[]>();
        const weekOf = (u: User | undefined) => memberWorkingDays(u, workingDays);
        const holidaysOf = (u: User) => {
            const week = weekOf(u);
            const key = `${u.id}|${u.holidayWeekendRule || ''}|${(u.holidayConfigIds || []).join(',')}|${week.join('')}`;
            let h = holidays.get(key);
            if (!h) { h = holidayDays(configsFor(configs, [u]), u.holidayWeekendRule, week); holidays.set(key, h); }
            return h;
        };
        return { configs, workingDays, ready, holidaysOf, workingDaysOf: weekOf, contextFor: u => leaveContext(weekOf(u), holidaysOf(u)) };
    }, [configs, workingDays, ready]);
};
