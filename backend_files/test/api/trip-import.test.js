// Importing a whole itinerary (docs/TRIP_INTERCHANGE.md) goes through /api/batch as one trip record. These tests save
// the importer's real output (test/fixtures/imported-trip.json, kept in sync by tests/unit/tripInterchange.test.ts)
// and check the server keeps it whole, refuses bad plans before writing, versions it, and applies ownership.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startTestServer } = require('../helpers/testServer');

const IMPORTED = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/imported-trip.json'), 'utf8'));
let srv, admin, ann, bob;
before(async () => { srv = await startTestServer(); });
after(async () => { await srv.close(); });
const reg = async (name) => (await srv.api('POST', '/api/auth/register', { body: { name, email: `${name}@test.dev`, password: `${name}-pass-1` } })).json;
beforeEach(async () => {
    await srv.reset();
    admin = await reg('admin');
    ann = await reg('ann');
    bob = await reg('bob');
});
const as = (who) => ({ token: who.token });
const batch = (who, body) => srv.api('POST', '/api/batch', { ...as(who), body });
const trips = async (who) => (await srv.api('GET', '/api/trips', as(who))).json;
const clone = (v) => JSON.parse(JSON.stringify(v));

test('an imported itinerary is saved whole as a new trip, plan and Unicode intact', async () => {
    const r = await batch(ann, { upsertTrips: [{ ...clone(IMPORTED), participants: ['ann@test.dev'] }] });
    assert.equal(r.status, 200);
    const [t] = await trips(ann);
    assert.equal(t.activities.length, 63);
    assert.equal(t.transports.length, 9);
    assert.equal(t.locations.length, 6);
    assert.deepEqual(t.accommodations, []);
    assert.equal(t.plan.stays.flatMap((s) => s.candidates).length, 18);
    assert.equal(t.plan.hiddenGems.length, 13);
    assert.equal(t.plan.days.length, 22);
    assert.equal(t.targetBudget, 10035);
    assert.equal(t.expenses, undefined);
    assert.ok(t.activities.some((a) => a.title === 'Sensō-ji'));
    assert.ok(t.plan.travellers.some((p) => p.label === 'Zoé'));
});

test('importing the same plan again into the trip is a versioned update, not a second trip', async () => {
    await batch(ann, { upsertTrips: [{ ...clone(IMPORTED), participants: ['ann@test.dev'] }] });
    const [saved] = await trips(ann);
    const r = await batch(ann, { upsertTrips: [{ ...saved, notes: `${saved.notes}\nExtra` }] });
    assert.equal(r.status, 200);
    const after = await trips(ann);
    assert.equal(after.length, 1);
    assert.equal(after[0].version, saved.version + 1);
    assert.equal(after[0].activities.length, 63);
});

test('a merge based on a stale copy of the trip is refused, so edits made meanwhile survive', async () => {
    await batch(ann, { upsertTrips: [{ ...clone(IMPORTED), participants: ['ann@test.dev'] }] });
    const [base] = await trips(ann);
    const booked = base.transports.map((t, i) => (i === 0 ? { ...t, identifier: 'TK1938', confirmationCode: 'QX7P2L' } : t));
    assert.equal((await srv.api('PUT', `/api/trips/${base.id}`, { ...as(ann), body: { ...base, transports: booked } })).status, 200);
    const stale = await batch(ann, { upsertTrips: [{ ...base, name: 'Merged from a stale copy' }] });
    assert.equal(stale.status, 409);
    const [t] = await trips(ann);
    assert.equal(t.transports[0].confirmationCode, 'QX7P2L');
    assert.notEqual(t.name, 'Merged from a stale copy');
});

test('a plan that fails validation is refused before anything is written (no partial import)', async () => {
    await srv.api('POST', '/api/flights', { ...as(admin), body: { id: 'f1', origin: 'A', destination: 'B' } });
    const bad = [
        { ...clone(IMPORTED), plan: [] },
        { ...clone(IMPORTED), plan: { ...IMPORTED.plan, stays: [{ checkIn: '2027-10-17' }] } },
        { ...clone(IMPORTED), plan: { ...IMPORTED.plan, budget: { currency: 'EUR', target: -1 } } },
        { ...clone(IMPORTED), activities: [{ ...IMPORTED.activities[0], plan: 'optional' }] },
        JSON.parse(JSON.stringify(IMPORTED).replace('"plan":{', '"plan":{"constructor":{"prototype":{"polluted":true}},')),
    ];
    for (const trip of bad) {
        const r = await batch(admin, { upsertTrips: [trip], deleteFlights: ['f1'] });
        assert.equal(r.status, 400, JSON.stringify(r.json));
    }
    assert.deepEqual(await trips(admin), []);
    assert.equal((await srv.api('GET', '/api/flights', as(admin))).json.length, 1, 'the rest of the batch did not run');
});

test('a failure while saving rolls the whole import back', async () => {
    const realConnect = srv.pool.connect.bind(srv.pool);
    srv.pool.connect = async (...args) => {
        if (typeof args[0] === 'function') return realConnect(...args);
        const client = await realConnect(...args);
        const q = client.query.bind(client);
        // Fail on the second trip's checks, after the first trip has been prepared in the same transaction.
        client.query = (text, ...rest) => (typeof text === 'string' && text.includes('trip_shares') && rest[0]?.[0] === 'second' ? Promise.reject(new Error('disk full')) : q(text, ...rest));
        return client;
    };
    try {
        const r = await batch(admin, { upsertTrips: [{ ...clone(IMPORTED), id: 'first' }, { ...clone(IMPORTED), id: 'second' }] });
        assert.equal(r.status, 500);
    } finally {
        srv.pool.connect = realConnect;
    }
    assert.deepEqual(await trips(admin), []);
});

test('importing needs a session, and only the trip’s participants (or an admin) may import into it', async () => {
    assert.equal((await srv.api('POST', '/api/batch', { body: { upsertTrips: [clone(IMPORTED)] } })).status, 401);
    await batch(ann, { upsertTrips: [{ ...clone(IMPORTED), participants: ['ann@test.dev'], privacy: 'Public' }] });
    const [t] = await trips(ann);
    const r = await batch(bob, { upsertTrips: [{ ...t, name: 'Bob’s import', participants: ['bob@test.dev'] }] });
    assert.equal(r.status, 403);
    assert.equal((await trips(ann))[0].name, IMPORTED.name);
    assert.equal((await batch(admin, { upsertTrips: [{ ...t, notes: 'Admin edit' }] })).status, 200);
});

test('trips without a plan are unaffected by the new rules', async () => {
    const r = await batch(admin, { upsertTrips: [{ id: 'old', name: 'Old trip', activities: [{ id: 'a', date: '2026-01-01', time: '', title: 'Museum' }], plan: null }] });
    assert.equal(r.status, 200);
});
