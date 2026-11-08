import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { EntitlementType, SavedConfig, Trip, User } from '../types';
import { dataService } from '../services/mockDb';
import { affectsCollections } from './useWanderSync';
import { configsFor, holidayDays, workingDaysOf, type HolidayDay } from '../utils/calendarModel';
import { defaultAnnualType, leaveFields, leaveNote, leaveStatus, planLeave, type LeavePlan, type LeaveState } from '../utils/leavePlan';
import { todayISO } from '../utils/tripsModel';

/**
 * Leave meets trips, for a page that already has the trips, members and leave types (the Trips board and a
 * trip's page): it adds the holiday calendars and the workspace's working week, then answers, for any trip,
 * what leave it costs and whether the leave is there. Answers are worked out once per change, not per render.
 */

export interface LeavePlanner {
    /** The member the trip's leave is for: the signed-in member if they travel, else the first traveller. */
    memberFor: (trip: Trip) => User | undefined;
    /** Everyone on the trip. */
    membersOf: (trip: Trip) => User[];
    statusFor: (trip: Trip) => LeaveState;
    noteFor: (trip: Trip) => ReturnType<typeof leaveNote>;
    planFor: (trip: Trip, member?: User) => LeavePlan | null;
}

const sessionUserId = (): string | undefined => {
    try { return JSON.parse(localStorage.getItem('wandergrid_session_user') || 'null')?.id; } catch { return undefined; }
};

export const useLeavePlanner = (trips: Trip[], users: User[], entitlements: EntitlementType[]): LeavePlanner => {
    const [configs, setConfigs] = useState<SavedConfig[]>([]);
    const [workingDays, setWorkingDays] = useState<number[]>(workingDaysOf(null));

    useEffect(() => {
        let live = true;
        const load = () => {
            dataService.getSavedConfigs().then(c => { if (live) setConfigs(c || []); }).catch(() => { /* holidays are optional */ });
            dataService.getWorkspaceSettings().then(s => { if (live) setWorkingDays(workingDaysOf(s)); }).catch(() => { /* the default week is used */ });
        };
        load();
        const onUpdate = (e: Event) => { if (affectsCollections(e, ['configs', 'settings'])) load(); };
        window.addEventListener('wandergrid_db_updated', onUpdate);
        return () => { live = false; window.removeEventListener('wandergrid_db_updated', onUpdate); };
    }, []);

    return useMemo<LeavePlanner>(() => {
        const today = todayISO();
        const me = sessionUserId();
        const holidays = new Map<string, HolidayDay[]>();
        const holidaysOf = (u: User) => {
            let h = holidays.get(u.id);
            if (!h) { h = holidayDays(configsFor(configs, [u]), u.holidayWeekendRule, workingDays); holidays.set(u.id, h); }
            return h;
        };
        const membersOf = (trip: Trip) => (trip.participants || []).map(id => users.find(u => u.id === id)).filter((u): u is User => Boolean(u));
        const memberFor = (trip: Trip) => {
            const members = membersOf(trip);
            return members.find(u => u.id === me) ?? members[0];
        };
        const input = (trip: Trip, user: User) => ({ trip, user, trips, entitlements, today, workingDays, holidays: holidaysOf(user) });
        const statuses = new Map<string, LeaveState>();
        const statusFor = (trip: Trip): LeaveState => {
            const key = `${trip.id}|${trip.startDate}|${trip.endDate}|${trip.entitlementId || ''}|${(trip.allocations || []).length}|${trip.status}|${trip.archived ? 1 : 0}`;
            const hit = statuses.get(key);
            if (hit) return hit;
            const user = memberFor(trip);
            const state: LeaveState = user && entitlements.length > 0 ? leaveStatus(input(trip, user)) : { kind: 'none' };
            statuses.set(key, state);
            return state;
        };
        return {
            memberFor,
            membersOf,
            statusFor,
            noteFor: trip => leaveNote(statusFor(trip)),
            planFor: (trip, member) => {
                const user = member ?? memberFor(trip);
                return user ? planLeave(input(trip, user)) : null;
            },
        };
    }, [trips, users, entitlements, configs, workingDays]);
};

/** The planner for the cards of a board or list, so a card reads its chip without a prop through every layer. */
export const LeavePlannerContext = createContext<LeavePlanner | null>(null);
export const useLeavePlannerContext = () => useContext(LeavePlannerContext);

/**
 * Puts a trip's leave on a leave type (or takes it off), then offers Undo. `patch` is useTripsData's: it saves
 * the trip and refreshes the board. Throws when the save fails, so the sheet can say so.
 */
export const takeLeave = async (
    trip: Trip,
    entitlementId: string | undefined,
    entitlements: EntitlementType[],
    patch: (id: string, changes: Partial<Trip>) => Promise<Trip | undefined>,
    undo: { show: (message: string, onUndo: () => void | Promise<void>, duration?: number) => void },
): Promise<void> => {
    const before = { entitlementId: trip.entitlementId, allocations: trip.allocations };
    await patch(trip.id, leaveFields(entitlementId));
    const type = entitlements.find(e => e.id === entitlementId)?.name;
    undo.show(entitlementId ? `${type || 'Leave'} taken for ${trip.name}` : `Leave taken off ${trip.name}`, async () => { await patch(trip.id, before); }, 8000);
};

/** Adds the starter leave type (Annual leave) for a workspace that has none, then refreshes the page's data. */
export const addStarterLeaveType = async (member: User | undefined, reload: () => unknown): Promise<void> => {
    await dataService.saveEntitlementType(defaultAnnualType(member));
    await reload();
};
