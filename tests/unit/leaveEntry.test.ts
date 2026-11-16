import { describe, expect, it, vi } from 'vitest';
import type { LeaveEntry, Trip, User } from '../../types';
import { convertTripLeave, countsAsLeave, leaveFromTrip, stateLabel, statesFor, tripWithoutLeave } from '../../utils/leaveEntry';

vi.mock('../../services/mockDb', () => ({ dataService: {} }));
vi.mock('../../services/pitStopSync', () => ({ syncPitStopsToVisited: () => Promise.resolve() }));
const { leaveChangesFor } = await import('../../hooks/useTripsData');

const trip = (id: string, over: Partial<Trip> = {}): Trip => ({ id, name: id, location: '', startDate: '2026-05-04', endDate: '2026-05-08', status: 'Planning', participants: ['u1'], ...over });
const user = (id: string, over: Partial<User> = {}): User => ({ id, name: id, role: 'Admin', leaveBalance: 0, takenLeave: 0, allowance: 0, ...over });

describe('leave states', () => {
    it('counts planned, requested and approved only', () => {
        expect((['draft', 'planned', 'requested', 'approved', 'rejected', 'cancelled'] as const).map(state => countsAsLeave({ state }))).toEqual([false, true, true, true, false, false]);
    });
    it('offers the request flow only to members who track approval', () => {
        expect(statesFor(user('a'))).toEqual(['draft', 'planned', 'approved', 'cancelled']);
        expect(statesFor(user('a', { leaveApproval: true }))).toEqual(['draft', 'requested', 'approved', 'rejected', 'cancelled']);
        expect(stateLabel('approved', user('a'))).toBe('Confirmed');
        expect(stateLabel('approved', user('a', { leaveApproval: true }))).toBe('Approved');
    });
});

describe('leave stored on trips', () => {
    it('gives one entry per traveller, linked to the trip, and keeps hidden time off as it was', () => {
        const rome = trip('rome', { participants: ['u1', 'u2'], entitlementId: 'annual', status: 'Upcoming', excludedDates: ['2026-05-06'] });
        expect(leaveFromTrip(rome).map(e => [e.id, e.memberId, e.tripId, e.state])).toEqual([['leave:rome:u1', 'u1', 'rome', 'approved'], ['leave:rome:u2', 'u2', 'rome', 'approved']]);
        const off = trip('leave-x', { kind: 'timeoff', name: 'Dentist', notes: 'Bring the card' });
        expect(leaveFromTrip(off)).toEqual([expect.objectContaining({ id: 'leave-x', memberId: 'u1', name: 'Dentist', note: 'Bring the card', state: 'planned' })]);
        expect(leaveFromTrip(off)[0].tripId).toBeUndefined();
        expect(leaveFromTrip(trip('plain'))).toEqual([]);
        expect(tripWithoutLeave(rome)).not.toHaveProperty('excludedDates');
    });

    it('converts once: adds what is missing, strips trips and drops hidden time off', () => {
        const trips = [trip('rome', { entitlementId: 'annual' }), trip('leave-x', { kind: 'timeoff' }), trip('plain')];
        const out = convertTripLeave(trips, []);
        expect(out.add.map(e => e.id)).toEqual(['leave:rome:u1', 'leave-x']);
        expect(out.save.map(t => t.id)).toEqual(['rome']);
        expect(out.save[0].entitlementId).toBeUndefined();
        expect(out.remove).toEqual(['leave-x']);
        const again = convertTripLeave(trips, out.add);
        expect(again.add).toEqual([]);
    });
});

describe('the trip form keeps its leave in step', () => {
    const users = [user('u1'), user('u2')];
    const base = trip('t1', { participants: ['u1', 'u2'] });
    const entry = (memberId: string, over: Partial<LeaveEntry> = {}): LeaveEntry => ({ id: `e-${memberId}`, memberId, startDate: base.startDate, endDate: base.endDate as string, state: 'planned', entitlementId: 'annual', tripId: 't1', ...over });

    it('adds leave for the traveller when a type is chosen', () => {
        const { upsert, remove } = leaveChangesFor(base, undefined, { entitlementId: 'annual', participants: ['u1', 'u2'] }, [], users);
        expect(remove).toEqual([]);
        expect(upsert).toEqual([expect.objectContaining({ memberId: 'u1', tripId: 't1', entitlementId: 'annual', startDate: '2026-05-04', endDate: '2026-05-08' })]);
    });

    it('removes it with No leave, and changes the type otherwise', () => {
        expect(leaveChangesFor(base, base, { participants: ['u1', 'u2'] }, [entry('u1')], users)).toEqual({ upsert: [], remove: ['e-u1'] });
        expect(leaveChangesFor(base, base, { entitlementId: 'lieu', participants: ['u1', 'u2'] }, [entry('u1')], users).upsert[0].entitlementId).toBe('lieu');
    });

    it('moves leave that followed the trip\'s dates, and leaves leave with its own dates alone', () => {
        const moved = { ...base, startDate: '2026-05-11', endDate: '2026-05-15' };
        const own = entry('u2', { startDate: '2026-05-05', endDate: '2026-05-06' });
        const { upsert } = leaveChangesFor(moved, base, { entitlementId: 'annual', participants: ['u1', 'u2'] }, [entry('u1'), own], users);
        expect(upsert.find(e => e.memberId === 'u1')).toMatchObject({ startDate: '2026-05-11', endDate: '2026-05-15' });
        expect(upsert.find(e => e.memberId === 'u2')).toBeUndefined();
    });
});
