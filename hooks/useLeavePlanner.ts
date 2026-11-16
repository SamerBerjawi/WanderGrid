import { createContext, useContext, useMemo } from 'react';
import type { EntitlementType, LeaveEntry, Trip, User } from '../types';
import { dataService } from '../services/mockDb';
import { useLeaveRules } from './useLeaveRules';
import { useLeaveEntries } from './useLeaveEntries';
import { defaultAnnualType, leaveNote, leaveStatus, linkedEntryFor, planLeave, type LeavePlan, type TripLeaveStatus } from '../utils/leavePlan';
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
    statusFor: (trip: Trip) => TripLeaveStatus;
    noteFor: (trip: Trip) => ReturnType<typeof leaveNote>;
    planFor: (trip: Trip, member?: User) => LeavePlan | null;
    /** Every leave entry (loaded by the planner). */
    leave: LeaveEntry[];
    reloadLeave: () => Promise<void>;
}

const sessionUserId = (): string | undefined => {
    try { return JSON.parse(localStorage.getItem('wandergrid_session_user') || 'null')?.id; } catch { return undefined; }
};

export const useLeavePlanner = (trips: Trip[], users: User[], entitlements: EntitlementType[]): LeavePlanner => {
    const rules = useLeaveRules();
    const { leave, reload } = useLeaveEntries();

    return useMemo<LeavePlanner>(() => {
        const today = todayISO();
        const me = sessionUserId();
        const { holidaysOf } = rules;
        const membersOf = (trip: Trip) => (trip.participants || []).map(id => users.find(u => u.id === id)).filter((u): u is User => Boolean(u));
        const memberFor = (trip: Trip) => {
            const members = membersOf(trip);
            return members.find(u => u.id === me) ?? members[0];
        };
        const input = (trip: Trip, user: User) => ({ trip, user, leave, entitlements, today, workingDays: rules.workingDaysOf(user), holidays: holidaysOf(user) });
        const statuses = new Map<string, TripLeaveStatus>();
        const statusFor = (trip: Trip): TripLeaveStatus => {
            const key = `${trip.id}|${trip.startDate}|${trip.endDate}|${trip.status}|${trip.archived ? 1 : 0}`;
            const hit = statuses.get(key);
            if (hit) return hit;
            const user = memberFor(trip);
            const state: TripLeaveStatus = user && entitlements.length > 0 ? leaveStatus(input(trip, user)) : { kind: 'none' };
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
            leave,
            reloadLeave: reload,
        };
        // trips is not read: statuses depend on the trip passed in, the leave, the members and the rules.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [users, entitlements, rules, leave, reload]);
};

/** The planner for the cards of a board or list, so a card reads its chip without a prop through every layer. */
export const LeavePlannerContext = createContext<LeavePlanner | null>(null);
export const useLeavePlannerContext = () => useContext(LeavePlannerContext);

/**
 * Puts a trip's leave on a leave type for the member it is for (or takes it off), then offers Undo. The leave is a
 * leave entry linked to the trip; its own dates are kept when it already exists. Throws when the save fails.
 */
export const takeLeave = async (
    trip: Trip,
    entitlementId: string | undefined,
    entitlements: EntitlementType[],
    planner: LeavePlanner,
    undo: { show: (message: string, onUndo: () => void | Promise<void>, duration?: number) => void },
    member?: User,
): Promise<void> => {
    const who = member ?? planner.memberFor(trip);
    if (!who) throw new Error('Add a traveller to the trip first.');
    const mine = planner.leave.filter(e => e.tripId === trip.id && e.memberId === who.id);
    if (entitlementId) {
        const existing = mine[0];
        const entry = linkedEntryFor(trip, who, entitlementId, existing);
        if (existing) await dataService.updateLeave(entry); else await dataService.addLeave(entry);
        await planner.reloadLeave();
        const type = entitlements.find(e => e.id === entitlementId)?.name;
        undo.show(`${type || 'Leave'} taken for ${trip.name}`, async () => {
            if (existing) await dataService.updateLeave({ ...existing, version: undefined });
            else await dataService.deleteLeave(entry.id);
            await planner.reloadLeave();
        }, 8000);
        return;
    }
    if (mine.length === 0) return;
    await dataService.applyBatch({ deleteLeave: mine.map(e => e.id) });
    await planner.reloadLeave();
    undo.show(`Leave taken off ${trip.name}`, async () => {
        await dataService.applyBatch({ upsertLeave: mine.map(e => ({ ...e, version: undefined })) });
        await planner.reloadLeave();
    }, 8000);
};

/** Adds the starter leave type (Annual leave) for a workspace that has none, then refreshes the page's data. */
export const addStarterLeaveType = async (member: User | undefined, reload: () => unknown): Promise<void> => {
    await dataService.saveEntitlementType(defaultAnnualType(member));
    await reload();
};
