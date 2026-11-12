'use strict';

/**
 * F-07: a trip's `participants` are user ids. Older trips sometimes hold an email where the user's id is something
 * else, which the pages that compare ids only would miss. Swap each such email for the id of the user who has it.
 * Entries that match no user (a removed member, a free-text name) are left alone.
 */
module.exports = {
    description: 'replace member emails in trip participants with user ids',
    async up(client) {
        const users = await client.query('SELECT id, data FROM users');
        const idByEmail = new Map();
        for (const u of users.rows) {
            const email = String(u.data?.email || '').toLowerCase().trim();
            if (email) idByEmail.set(email, u.id);
        }
        const ids = new Set(users.rows.map(u => u.id));
        const trips = await client.query('SELECT id, data FROM trips');
        for (const row of trips.rows) {
            const d = row.data;
            if (!d || !Array.isArray(d.participants)) continue;
            const next = d.participants.map(p => (typeof p === 'string' && !ids.has(p) && idByEmail.get(p.toLowerCase().trim())) || p);
            const unique = next.filter((p, i) => next.indexOf(p) === i);
            if (unique.length === d.participants.length && unique.every((p, i) => p === d.participants[i])) continue;
            await client.query('UPDATE trips SET data = $2 WHERE id = $1', [row.id, JSON.stringify({ ...d, participants: unique })]);
        }
    },
};
