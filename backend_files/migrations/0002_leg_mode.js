'use strict';

/** F-05: every stored leg has a mode. A leg saved without one was a flight, so it becomes 'Flight'. */
module.exports = {
    description: 'fill a missing mode on flights and trip legs with Flight',
    async up(client) {
        const flights = await client.query('SELECT id, data FROM flights');
        for (const row of flights.rows) {
            const d = row.data;
            if (!d || typeof d !== 'object' || d.mode) continue;
            await client.query('UPDATE flights SET data = $2 WHERE id = $1', [row.id, JSON.stringify({ ...d, mode: 'Flight' })]);
        }
        const trips = await client.query('SELECT id, data FROM trips');
        for (const row of trips.rows) {
            const d = row.data;
            if (!d || !Array.isArray(d.transports) || d.transports.every(t => !t || t.mode)) continue;
            const transports = d.transports.map(t => (t && typeof t === 'object' && !t.mode ? { ...t, mode: 'Flight' } : t));
            await client.query('UPDATE trips SET data = $2 WHERE id = $1', [row.id, JSON.stringify({ ...d, transports })]);
        }
    },
};
