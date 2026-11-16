import type { LeaveEntry, LeaveState, Trip, User } from '../types';

/**
 * Leave entries (leave Phase 1): states, labels and the conversion from leave stored on trips. The server copy of
 * `leaveFromTrip` is backend_files/leaveEntries.js; keep the two in step.
 */

export const LEAVE_STATES: LeaveState[] = ['draft', 'planned', 'requested', 'approved', 'rejected', 'cancelled'];

/** States that count against a balance (requested as pending). */
export const COUNTING_STATES: ReadonlySet<LeaveState> = new Set<LeaveState>(['planned', 'requested', 'approved']);
export const countsAsLeave = (e: Pick<LeaveEntry, 'state'>): boolean => COUNTING_STATES.has(e.state || 'planned');

export const STATE_LABEL: Record<LeaveState, string> = {
    draft: 'Idea',
    planned: 'Planned',
    requested: 'Requested',
    approved: 'Approved',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
};

/** The words for a state for this member: without approval tracking, approved reads as Confirmed. */
export const stateLabel = (state: LeaveState, user?: Pick<User, 'leaveApproval'>): string =>
    state === 'approved' && !user?.leaveApproval ? 'Confirmed' : STATE_LABEL[state];

/** The states offered when adding or editing leave: a light set by default, the request flow when the member tracks approval. */
export const statesFor = (user?: Pick<User, 'leaveApproval'>): LeaveState[] =>
    user?.leaveApproval ? ['draft', 'requested', 'approved', 'rejected', 'cancelled'] : ['draft', 'planned', 'approved', 'cancelled'];

/** The state a new entry starts in. */
export const defaultState = (user?: Pick<User, 'leaveApproval'>): LeaveState => (user?.leaveApproval ? 'requested' : 'planned');

export const LEAVE_ID_PREFIX = 'leave-';
export const newLeaveId = (): string => `${LEAVE_ID_PREFIX}${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;

/** A leave type is set (one type, or a split). An entry without one is time off that uses no balance. */
export const hasLeaveType = (e: Pick<LeaveEntry, 'entitlementId' | 'allocations'>): boolean =>
    Boolean(e.entitlementId || (e.allocations || []).some(a => a.entitlementId && Number(a.days) > 0));

/** The leave types an entry uses, first first. */
export const typesOf = (e: Pick<LeaveEntry, 'entitlementId' | 'allocations'>): string[] => {
    const split = (e.allocations || []).filter(a => a.entitlementId && Number(a.days) > 0).map(a => a.entitlementId);
    return split.length ? [...new Set(split)] : e.entitlementId ? [e.entitlementId] : [];
};

/* --------------------------- leave stored on trips -------------------------- */

const LEAVE_FIELDS = ['entitlementId', 'allocations', 'durationMode', 'startPortion', 'endPortion', 'excludedDates'] as const;

/** A trip that still carries leave (saved before leave had its own records). */
export const tripCarriesLeave = (t: Trip): boolean => Boolean(t.entitlementId || (t.allocations || []).some(a => a && a.entitlementId));
const isHiddenTimeOff = (t: Trip): boolean => t.id.startsWith(LEAVE_ID_PREFIX) || t.kind === 'timeoff';

const stateOfTrip = (t: Trip): LeaveState => {
    if (t.status === 'Cancelled' || t.intent === 'cancelled') return 'cancelled';
    if (t.status === 'Upcoming' || t.status === 'Past' || t.intent === 'confirmed') return 'approved';
    return 'planned';
};

const clean = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0))) as T;

/** The leave entries a trip carried: one per member on it. Hidden time off keeps its id. */
export const leaveFromTrip = (trip: Trip): LeaveEntry[] => {
    if (!trip || !trip.startDate) return [];
    const standalone = isHiddenTimeOff(trip);
    if (!standalone && !tripCarriesLeave(trip)) return [];
    const members = [...new Set((trip.participants || []).filter(p => typeof p === 'string' && p))];
    if (members.length === 0 && trip.createdBy) members.push(trip.createdBy);
    return members.map(memberId => clean<LeaveEntry>({
        id: standalone && members.length === 1 ? trip.id : `leave:${trip.id}:${memberId}`,
        memberId,
        name: trip.name || (standalone ? 'Time off' : undefined),
        startDate: trip.startDate.slice(0, 10),
        endDate: (trip.endDate || trip.startDate).slice(0, 10),
        entitlementId: trip.entitlementId,
        allocations: (trip.allocations || []).filter(a => a && a.entitlementId),
        durationMode: trip.durationMode,
        startPortion: trip.startPortion,
        endPortion: trip.endPortion,
        excludedDates: trip.excludedDates,
        state: stateOfTrip(trip),
        tripId: standalone ? undefined : trip.id,
        note: standalone ? (trip.notes || trip.description) : undefined,
        createdBy: trip.createdBy,
        version: 1,
        updatedAt: (trip as Trip & { updatedAt?: string }).updatedAt,
    }));
};

/** The trip without its leave fields. */
export const tripWithoutLeave = (trip: Trip): Trip => {
    const next = { ...trip } as Record<string, unknown>;
    LEAVE_FIELDS.forEach(f => { delete next[f]; });
    return next as unknown as Trip;
};

/**
 * Moves leave off trips (local mode and restores in the browser): the entries to add (skipping ids already present),
 * the trips to save without their leave, and the hidden time-off trips to delete.
 */
export const convertTripLeave = (trips: Trip[], existing: LeaveEntry[]): { add: LeaveEntry[]; save: Trip[]; remove: string[] } => {
    const have = new Set(existing.map(e => e.id));
    const add: LeaveEntry[] = [];
    const save: Trip[] = [];
    const remove: string[] = [];
    trips.forEach(t => {
        if (!t || !t.id) return;
        const standalone = isHiddenTimeOff(t);
        if (!standalone && !tripCarriesLeave(t)) return;
        leaveFromTrip(t).forEach(e => { if (!have.has(e.id)) { add.push(e); have.add(e.id); } });
        if (standalone) remove.push(t.id); else save.push(tripWithoutLeave(t));
    });
    return { add, save, remove };
};
