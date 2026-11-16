'use strict';
/**
 * Leave entries (leave Phase 1, decision 333): time off is its own record in the `leave` table, one per member,
 * optionally linked to a trip by `tripId`. Before, leave lived on trips (`entitlementId`, `allocations`, the day
 * length and the days worked anyway), and time off made on the calendar was a hidden trip with a `leave-` id.
 *
 * `leaveFromTrip` turns one such trip into its entries and `convertTripLeave` does it for the whole database: the
 * 0004 migration runs it once, and a restore runs it again so an older backup arrives in the new shape.
 * The client copy is utils/leaveEntry.ts (`leaveFromTrip`); keep the two in step.
 */

const LEAVE_FIELDS = ['entitlementId', 'allocations', 'durationMode', 'startPortion', 'endPortion', 'excludedDates'];
const LEAVE_STATES = ['draft', 'planned', 'requested', 'approved', 'rejected', 'cancelled'];

const hasTripLeave = (t) => Boolean(t && (t.entitlementId || (Array.isArray(t.allocations) && t.allocations.some(a => a && a.entitlementId))));
const isStandaloneLeave = (t) => Boolean(t) && (String(t.id || '').startsWith('leave-') || t.kind === 'timeoff');

/** What was decided about the trip, as a leave state. Leave on a past trip was taken, so it counts as approved. */
const stateOfTrip = (t) => {
    if (t.status === 'Cancelled' || t.intent === 'cancelled') return 'cancelled';
    if (t.status === 'Upcoming' || t.status === 'Past' || t.intent === 'confirmed') return 'approved';
    return 'planned';
};

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0)));

/** The leave entries a trip carried: one per member on it. Standalone time off keeps its id. */
function leaveFromTrip(trip) {
    if (!trip || typeof trip !== 'object' || !trip.startDate) return [];
    const standalone = isStandaloneLeave(trip);
    if (!standalone && !hasTripLeave(trip)) return [];
    const members = [...new Set((Array.isArray(trip.participants) ? trip.participants : []).filter(p => typeof p === 'string' && p))];
    if (members.length === 0 && trip.createdBy) members.push(trip.createdBy);
    return members.map(memberId => clean({
        id: standalone && members.length === 1 ? trip.id : `leave:${trip.id}:${memberId}`,
        memberId,
        name: trip.name || (standalone ? 'Time off' : undefined),
        startDate: String(trip.startDate).slice(0, 10),
        endDate: String(trip.endDate || trip.startDate).slice(0, 10),
        entitlementId: trip.entitlementId,
        allocations: Array.isArray(trip.allocations) ? trip.allocations.filter(a => a && a.entitlementId) : undefined,
        durationMode: trip.durationMode,
        startPortion: trip.startPortion,
        endPortion: trip.endPortion,
        excludedDates: trip.excludedDates,
        state: stateOfTrip(trip),
        tripId: standalone ? undefined : trip.id,
        note: standalone ? (trip.notes || trip.description) : undefined,
        createdBy: trip.createdBy,
        version: 1,
        updatedAt: trip.updatedAt,
    }));
}

/** The trip without its leave fields. */
const withoutLeave = (trip) => {
    const next = { ...trip };
    LEAVE_FIELDS.forEach(f => { delete next[f]; });
    return next;
};

/**
 * Moves every trip's leave into the `leave` table. Idempotent: an entry that already exists is kept as it is, and a
 * trip with no leave left is not touched. Standalone time off is deleted from trips once its entry exists.
 */
async function convertTripLeave(client) {
    const { rows } = await client.query('SELECT id, data FROM trips');
    const { rows: have } = await client.query('SELECT id FROM leave');
    const existing = new Set(have.map(r => r.id));
    let created = 0;
    let tripsChanged = 0;
    for (const row of rows) {
        const trip = row.data && typeof row.data === 'object' ? { ...row.data, id: row.id } : null;
        if (!trip) continue;
        const standalone = isStandaloneLeave(trip);
        if (!standalone && !hasTripLeave(trip)) continue;
        for (const entry of leaveFromTrip(trip)) {
            if (existing.has(entry.id)) continue;
            await client.query('INSERT INTO leave (id, data) VALUES ($1, $2)', [entry.id, JSON.stringify(entry)]);
            existing.add(entry.id);
            created += 1;
        }
        if (standalone) {
            await client.query('DELETE FROM trip_shares WHERE trip_id = $1', [row.id]);
            await client.query('DELETE FROM trips WHERE id = $1', [row.id]);
        } else {
            await client.query('UPDATE trips SET data = $2 WHERE id = $1', [row.id, JSON.stringify(withoutLeave(row.data))]);
        }
        tripsChanged += 1;
    }
    return { created, tripsChanged };
}

module.exports = { LEAVE_FIELDS, LEAVE_STATES, hasTripLeave, isStandaloneLeave, leaveFromTrip, withoutLeave, convertTripLeave };
