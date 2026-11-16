'use strict';
const { convertTripLeave } = require('../leaveEntries');

/** Leave Phase 1: leave moves off trips into the `leave` table (one entry per member, linked by tripId). */
module.exports = {
    description: 'move leave from trips into the leave table',
    async up(client) {
        // initDb creates the table first; probe, then create, for a database migrated on its own.
        try { await client.query('SELECT id FROM leave LIMIT 1'); }
        catch { await client.query(`CREATE TABLE leave (id TEXT PRIMARY KEY CHECK (id <> ''), data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'))`); }
        await convertTripLeave(client);
    },
};
