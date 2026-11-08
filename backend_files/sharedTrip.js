'use strict';
const crypto = require('node:crypto');

/**
 * Public, read-only trip links. A trip's owner turns a link on; the link holds a long random token that is the
 * only key to a sanitised snapshot of the trip (`GET /api/public/trips/:token`, no account). The snapshot is
 * built from a whitelist, so anything added to a trip later stays private until it is named here. Costs,
 * confirmation codes, seats, notes, packing, expenses, leave and member ids never leave the server.
 * Tokens live in their own table so a trip saved from a stale copy cannot drop or leak one, and turning the
 * link off deletes the row.
 */

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;
const newToken = () => crypto.randomBytes(24).toString('base64url'); // 32 characters, 192 bits

const pick = (obj, keys) => {
    const out = {};
    for (const k of keys) if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') out[k] = obj[k];
    return out;
};
const coords = (c) => (c && Number.isFinite(c.lat) && Number.isFinite(c.lng) ? { lat: c.lat, lng: c.lng, ...(c.tz ? { tz: c.tz } : {}) } : undefined);
const list = (v) => (Array.isArray(v) ? v : []);

const TRANSPORT_KEYS = [
    'id', 'mode', 'provider', 'providerCode', 'identifier', 'origin', 'destination',
    'departureDate', 'departureTime', 'arrivalDate', 'arrivalTime', 'actualDepartureTime', 'actualArrivalTime',
    'departureTerminal', 'departureGate', 'arrivalTerminal', 'arrivalGate', 'duration', 'distance',
    'originLat', 'originLng', 'destLat', 'destLng', 'isLayover', 'isApproximate', 'logoUrl',
];
const STAY_KEYS = ['id', 'name', 'address', 'type', 'checkInDate', 'checkInTime', 'checkOutDate', 'checkOutTime', 'website'];
const ACTIVITY_KEYS = ['id', 'date', 'time', 'title', 'location', 'type'];

/** The first word of a name: enough for family to recognise who is travelling, nothing more. */
const firstName = (name) => String(name || '').trim().split(/\s+/)[0];

/** What the public page may see of a trip. `users` resolves the member ids to first names. */
const sanitizeTrip = (trip, users = []) => {
    const names = list(trip.participants)
        .map(id => users.find(u => u && (u.id === id || String(u.email || '').toLowerCase() === String(id).toLowerCase())))
        .map(u => firstName(u && u.name)).filter(Boolean);
    return {
        trip: { ...pick(trip, ['name', 'subtitle', 'location', 'startDate', 'endDate', 'status']), ...(coords(trip.coordinates) ? { coordinates: coords(trip.coordinates) } : {}) },
        travellers: names,
        transports: list(trip.transports).map(t => pick(t, TRANSPORT_KEYS)),
        stays: list(trip.accommodations).map(a => ({ ...pick(a, STAY_KEYS), ...(coords(a.coordinates) ? { coordinates: coords(a.coordinates) } : {}) })),
        activities: list(trip.activities).map(a => ({ ...pick(a, ACTIVITY_KEYS), ...(coords(a.coordinates) ? { coordinates: coords(a.coordinates) } : {}) })),
        places: list(trip.locations).map(l => ({ ...pick(l, ['id', 'name', 'startDate', 'endDate']), ...(coords(l.coordinates) ? { coordinates: coords(l.coordinates) } : {}) })),
    };
};

/**
 * Express handlers. `canWrite(trip, user)` is the app's own edit rule (an Admin or a traveller on the trip),
 * so only people who can change a trip can share it.
 */
const createHandlers = ({ pool, canWrite, sendError }) => {
    const loadTrip = async (id) => {
        const { rows } = await pool.query('SELECT data FROM trips WHERE id = $1', [id]);
        return rows[0]?.data;
    };
    const guard = async (req, res) => {
        const trip = await loadTrip(req.params.id);
        if (!trip) { res.status(404).json({ error: 'Trip not found' }); return null; }
        if (!canWrite(trip, req.user)) { res.status(403).json({ error: 'Forbidden' }); return null; }
        return trip;
    };

    return {
        /** GET /api/trips/:id/share → { token: string | null } */
        status: async (req, res) => {
            try {
                if (!(await guard(req, res))) return;
                const { rows } = await pool.query('SELECT token, created_at FROM trip_shares WHERE trip_id = $1', [req.params.id]);
                res.json({ token: rows[0]?.token ?? null, createdAt: rows[0]?.created_at ?? null });
            } catch (err) { sendError(res, err, 500, 'Could not read the share link'); }
        },
        /** POST /api/trips/:id/share → turns the link on (keeps the same link if it is already on). */
        create: async (req, res) => {
            try {
                if (!(await guard(req, res))) return;
                const existing = await pool.query('SELECT token, created_at FROM trip_shares WHERE trip_id = $1', [req.params.id]);
                if (existing.rows[0]) return res.json({ token: existing.rows[0].token, createdAt: existing.rows[0].created_at });
                const token = newToken();
                await pool.query('INSERT INTO trip_shares (token, trip_id, created_by) VALUES ($1, $2, $3)', [token, req.params.id, req.user.id]);
                res.status(201).json({ token, createdAt: new Date().toISOString() });
            } catch (err) { sendError(res, err, 500, 'Could not create the share link'); }
        },
        /** DELETE /api/trips/:id/share → turns the link off; the old address stops working at once. */
        revoke: async (req, res) => {
            try {
                if (!(await guard(req, res))) return;
                await pool.query('DELETE FROM trip_shares WHERE trip_id = $1', [req.params.id]);
                res.json({ token: null });
            } catch (err) { sendError(res, err, 500, 'Could not turn off the share link'); }
        },
        /** GET /api/public/trips/:token → the sanitised snapshot. No account. Unknown, malformed and revoked tokens all answer 404. */
        publicTrip: async (req, res) => {
            res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' });
            const { token } = req.params;
            if (!TOKEN_PATTERN.test(token)) return res.status(404).json({ error: 'Not found' });
            try {
                const { rows } = await pool.query('SELECT t.data FROM trip_shares s JOIN trips t ON t.id = s.trip_id WHERE s.token = $1', [token]);
                if (!rows[0]) return res.status(404).json({ error: 'Not found' });
                const trip = rows[0].data;
                const { rows: userRows } = await pool.query('SELECT data FROM users');
                res.json(sanitizeTrip(trip, userRows.map(r => r.data)));
            } catch (err) { sendError(res, err, 500, 'Could not load the trip'); }
        },
    };
};

module.exports = { TOKEN_PATTERN, newToken, sanitizeTrip, createHandlers };
