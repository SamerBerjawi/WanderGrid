'use strict';
const { tripKind } = require('../tripKind');

/** D-04: stamp every stored trip with `kind` (trip | timeoff | bundle), derived from the flags it used before. */
module.exports = {
    description: 'stamp trips with kind (trip, timeoff, bundle)',
    async up(client) {
        const { rows } = await client.query('SELECT id, data FROM trips');
        for (const row of rows) {
            const data = row.data;
            if (!data || typeof data !== 'object' || data.kind) continue;
            await client.query('UPDATE trips SET data = $2 WHERE id = $1', [row.id, JSON.stringify({ ...data, kind: tripKind({ ...data, id: row.id }) })]);
        }
    },
};
