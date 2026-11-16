import type { LeaveEntry, Trip, User } from '../types';
import { dayWeight, isRestDay, tripDates, type LeaveContext } from './calendarModel';
import { countsAsLeave } from './leaveEntry';
import { tracksLeave } from './leavePlan';

/**
 * Where a trip and a member's leave disagree (leave Phase 1d). Travel dates and leave dates may differ on purpose (a
 * weekend away needs no leave; leave can start a day before the flight), so these are notes, not errors: each says what
 * is off and the page offers the fix.
 */
export type TripLeaveIssue =
    /** Working days of the trip that no leave covers (the member would be at work). */
    | { kind: 'uncovered'; days: string[] }
    /** The trip's linked leave starts before it or ends after it (often on purpose). */
    | { kind: 'outside'; before: number; after: number }
    /** The linked leave does not touch the trip's dates at all (the trip moved). */
    | { kind: 'apart'; entryId: string }
    /** Leave still counts for a trip that was cancelled. */
    | { kind: 'cancelledTrip'; entryIds: string[] }
    /** The linked leave is still waiting for an answer, or was refused, while the trip goes ahead. */
    | { kind: 'requested'; entryIds: string[] }
    | { kind: 'rejected'; entryIds: string[] };

const daysApart = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export const tripLeaveIssues = (trip: Trip, user: User, leave: LeaveEntry[], ctx: LeaveContext, today: string): TripLeaveIssue[] => {
    if (!trip.startDate) return [];
    const end = trip.endDate || trip.startDate;
    const linked = leave.filter(e => e.tripId === trip.id && e.memberId === user.id);
    const issues: TripLeaveIssue[] = [];
    if (trip.status === 'Cancelled' || trip.intent === 'cancelled') {
        const still = linked.filter(countsAsLeave);
        if (still.length) issues.push({ kind: 'cancelledTrip', entryIds: still.map(e => e.id) });
        return issues;
    }
    if (end < today) return issues;

    const rejected = linked.filter(e => e.state === 'rejected');
    if (rejected.length) issues.push({ kind: 'rejected', entryIds: rejected.map(e => e.id) });
    const requested = linked.filter(e => e.state === 'requested');
    if (requested.length && trip.status === 'Upcoming') issues.push({ kind: 'requested', entryIds: requested.map(e => e.id) });

    const counting = linked.filter(countsAsLeave);
    counting.forEach(e => {
        const eEnd = e.endDate || e.startDate;
        if (eEnd < trip.startDate || e.startDate > end) issues.push({ kind: 'apart', entryId: e.id });
    });
    const touching = counting.filter(e => !((e.endDate || e.startDate) < trip.startDate || e.startDate > end));
    if (touching.length) {
        const first = touching.reduce((m, e) => (e.startDate < m ? e.startDate : m), touching[0].startDate);
        const last = touching.reduce((m, e) => ((e.endDate || e.startDate) > m ? (e.endDate || e.startDate) : m), touching[0].endDate || touching[0].startDate);
        const before = first < trip.startDate ? daysApart(first, trip.startDate) : 0;
        const after = last > end ? daysApart(end, last) : 0;
        if (before || after) issues.push({ kind: 'outside', before, after });
    }

    // Working days of the trip that none of the member's leave covers (a day marked as worked counts as covered).
    if (counting.length > 0 || tracksLeave(user, leave)) {
        const mine = leave.filter(e => e.memberId === user.id && countsAsLeave(e));
        const uncovered = tripDates({ startDate: trip.startDate, endDate: end }).filter(iso => {
            if (isRestDay(iso, ctx) || ctx.offDays.has(iso)) return false;
            return !mine.some(e => iso >= e.startDate && iso <= (e.endDate || e.startDate) && (dayWeight(e, iso, ctx) > 0 || (e.excludedDates || []).includes(iso)));
        });
        if (uncovered.length) issues.push({ kind: 'uncovered', days: uncovered });
    }
    return issues;
};

const dayWord = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/** The words for an issue, and how serious it is (rust: needs doing; ochre: worth a look; muted: for information). */
export const issueNote = (issue: TripLeaveIssue): { tone: 'rust' | 'ochre' | 'muted'; text: string } => {
    switch (issue.kind) {
        case 'uncovered': return { tone: 'rust', text: `${dayWord(issue.days.length)} of the trip ${issue.days.length === 1 ? 'is a working day' : 'are working days'} with no leave` };
        case 'apart': return { tone: 'rust', text: 'Its leave is on other dates than the trip' };
        case 'cancelledTrip': return { tone: 'rust', text: 'The trip is cancelled but its leave still counts' };
        case 'rejected': return { tone: 'rust', text: 'Its leave was refused' };
        case 'requested': return { tone: 'ochre', text: 'Its leave is still waiting for an answer' };
        case 'outside': return {
            tone: 'muted',
            text: `Leave runs ${[issue.before ? `${dayWord(issue.before)} before` : '', issue.after ? `${dayWord(issue.after)} after` : ''].filter(Boolean).join(' and ')} the trip`,
        };
    }
};

/** A member's trips with something to look at, soonest first (for the Calendar's attention list). */
export const tripsNeedingAttention = (trips: Trip[], user: User, leave: LeaveEntry[], ctx: LeaveContext, today: string, horizon = 366): { trip: Trip; issues: TripLeaveIssue[] }[] => {
    const until = new Date(Date.parse(`${today}T00:00:00Z`) + horizon * 86_400_000).toISOString().slice(0, 10);
    return trips
        .filter(t => (t.participants || []).includes(user.id) && t.startDate && t.startDate <= until && (t.kind === 'trip' || !t.kind) && !t.isBundleOnly && !t.archived)
        .map(t => ({ trip: t, issues: tripLeaveIssues(t, user, leave, ctx, today).filter(i => i.kind !== 'outside') }))
        .filter(x => x.issues.length > 0)
        .sort((a, b) => a.trip.startDate.localeCompare(b.trip.startDate));
};
