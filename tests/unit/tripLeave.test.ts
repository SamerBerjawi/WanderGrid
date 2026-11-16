import { describe, expect, it } from 'vitest';
import type { LeaveEntry, Trip, User } from '../../types';
import { leaveContext } from '../../utils/calendarModel';
import { issueNote, tripLeaveIssues, tripsNeedingAttention } from '../../utils/tripLeave';

const WORK = [1, 2, 3, 4, 5];
const ctx = leaveContext(WORK, []);
const TODAY = '2026-01-01';
const policy = { entitlementId: 'annual', year: 2026, isActive: true, accrual: { period: 'yearly' as const, amount: 25 }, carryOver: { enabled: false, maxDays: 0, expiryType: 'none' as const } };
const user: User = { id: 'u', name: 'U', role: 'Admin', leaveBalance: 0, takenLeave: 0, allowance: 0, policies: [policy] };
// Wed 7 – Tue 13 Oct 2026: five working days (7, 8, 9, 12, 13).
const trip = (over: Partial<Trip> = {}): Trip => ({ id: 't', name: 'Lisbon', location: '', startDate: '2026-10-07', endDate: '2026-10-13', status: 'Upcoming', participants: ['u'], ...over });
const entry = (over: Partial<LeaveEntry> = {}): LeaveEntry => ({ id: 'e', memberId: 'u', startDate: '2026-10-07', endDate: '2026-10-13', state: 'approved', entitlementId: 'annual', tripId: 't', ...over });
const kinds = (t: Trip, leave: LeaveEntry[]) => tripLeaveIssues(t, user, leave, ctx, TODAY).map(i => i.kind);

describe('a trip and its leave', () => {
    it('is fine when leave covers every working day', () => {
        expect(kinds(trip(), [entry()])).toEqual([]);
    });

    it('counts working days with no leave, other leave included', () => {
        const issues = tripLeaveIssues(trip(), user, [entry({ endDate: '2026-10-09' })], ctx, TODAY);
        expect(issues).toEqual([{ kind: 'uncovered', days: ['2026-10-12', '2026-10-13'] }]);
        // Time off of its own over those days covers them.
        expect(kinds(trip(), [entry({ endDate: '2026-10-09' }), entry({ id: 'x', tripId: undefined, startDate: '2026-10-12', endDate: '2026-10-13' })])).toEqual([]);
        // A day marked as worked is covered on purpose.
        expect(kinds(trip(), [entry({ excludedDates: ['2026-10-12', '2026-10-13'] })])).toEqual([]);
    });

    it('notes leave beyond the trip and leave on other dates', () => {
        expect(tripLeaveIssues(trip(), user, [entry({ startDate: '2026-10-06' })], ctx, TODAY)).toEqual([{ kind: 'outside', before: 1, after: 0 }]);
        expect(kinds(trip(), [entry({ startDate: '2026-11-02', endDate: '2026-11-06' })])).toEqual(['apart', 'uncovered']);
    });

    it('flags refused, pending and cancelled-trip leave', () => {
        expect(kinds(trip(), [entry({ state: 'rejected' })])).toEqual(['rejected', 'uncovered']);
        expect(kinds(trip(), [entry({ state: 'requested' })])).toEqual(['requested']);
        expect(kinds(trip({ status: 'Planning' }), [entry({ state: 'requested' })])).toEqual([]);
        expect(kinds(trip({ status: 'Cancelled' }), [entry()])).toEqual(['cancelledTrip']);
        expect(kinds(trip({ status: 'Cancelled' }), [entry({ state: 'cancelled' })])).toEqual([]);
    });

    it('says nothing about past trips or members who do not track leave', () => {
        expect(kinds(trip({ startDate: '2025-10-07', endDate: '2025-10-13' }), [])).toEqual([]);
        expect(tripLeaveIssues(trip(), { ...user, policies: [] }, [], ctx, TODAY)).toEqual([]);
    });

    it('words each issue and lists the trips to look at, without the notes', () => {
        expect(issueNote({ kind: 'uncovered', days: ['a', 'b'] })).toEqual({ tone: 'rust', text: '2 days of the trip are working days with no leave' });
        expect(issueNote({ kind: 'outside', before: 1, after: 2 }).text).toBe('Leave runs 1 day before and 2 days after the trip');
        const list = tripsNeedingAttention([trip(), trip({ id: 'ok' }), trip({ id: 'far', startDate: '2028-01-03', endDate: '2028-01-04' })], user,
            [entry({ startDate: '2026-10-06' }), entry({ id: 'ok-e', tripId: 'ok' })], ctx, TODAY);
        expect(list.map(x => x.trip.id)).toEqual([]);
        expect(tripsNeedingAttention([trip()], user, [], ctx, TODAY).map(x => x.issues.map(i => i.kind))).toEqual([['uncovered']]);
    });
});
