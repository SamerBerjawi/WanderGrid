// WP-1.2b: record ownership and privacy (SEC-001 part 2).
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('../helpers/testServer');

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
const tripIds = async (who) => (await srv.api('GET', '/api/trips', as(who))).json.map((t) => t.id).sort();

test('private trips are visible only to participants (and admins); public trips to everyone', async () => {
    await srv.api('POST', '/api/trips', { ...as(ann), body: { id: 'ann-private', name: 'Ann', privacy: 'Private', participants: ['ann@test.dev'] } });
    await srv.api('POST', '/api/trips', { ...as(ann), body: { id: 'ann-public', name: 'Ann public', privacy: 'Public', participants: ['ann@test.dev'] } });
    assert.deepEqual(await tripIds(ann), ['ann-private', 'ann-public']);
    assert.deepEqual(await tripIds(bob), ['ann-public']);
    assert.deepEqual(await tripIds(admin), ['ann-private', 'ann-public']);
});

test('non-participants cannot change or delete a trip, even a public one', async () => {
    await srv.api('POST', '/api/trips', { ...as(ann), body: { id: 't', name: 'Ann', privacy: 'Public', participants: ['ann@test.dev'] } });
    assert.equal((await srv.api('PUT', '/api/trips/t', { ...as(bob), body: { id: 't', name: 'Bob was here', participants: ['bob@test.dev'] } })).status, 403);
    assert.equal((await srv.api('DELETE', '/api/trips/t', as(bob))).status, 403);
    assert.equal((await srv.api('POST', '/api/trips/bulk', { ...as(bob), body: [{ id: 't', name: 'x' }] })).status, 403);
    assert.equal((await srv.api('POST', '/api/batch', { ...as(bob), body: { deleteTrips: ['t'] } })).status, 403);
    assert.equal((await srv.api('PUT', '/api/trips/t', { ...as(ann), body: { id: 't', name: 'Renamed', privacy: 'Public', participants: ['ann@test.dev'] } })).status, 200);
    assert.equal((await srv.api('PUT', '/api/trips/t', { ...as(admin), body: { id: 't', name: 'Admin edit', privacy: 'Public', participants: ['ann@test.dev'] } })).status, 200);
});

test('a new trip always includes its creator as a participant', async () => {
    const r = await srv.api('POST', '/api/trips', { ...as(bob), body: { id: 'b', name: 'Bob', privacy: 'Private', participants: [] } });
    assert.deepEqual(r.json.participants, ['bob@test.dev']);
    assert.deepEqual(await tripIds(bob), ['b']);
});

test('flights and atlas records are shared to read but only the owner or an admin may change them', async () => {
    const created = await srv.api('POST', '/api/flights', { ...as(ann), body: { id: 'f1', origin: 'JFK', destination: 'LHR', ownerId: 'bob@test.dev' } });
    assert.equal(created.json.ownerId, 'ann@test.dev', 'owner comes from the session, not the body');
    assert.equal((await srv.api('GET', '/api/flights', as(bob))).json.length, 1, 'shared read');
    assert.equal((await srv.api('PUT', '/api/flights/f1', { ...as(bob), body: { id: 'f1', origin: 'XXX' } })).status, 403);
    assert.equal((await srv.api('DELETE', '/api/flights/f1', as(bob))).status, 403);
    const own = await srv.api('PUT', '/api/flights/f1', { ...as(ann), body: { id: 'f1', origin: 'BOS', ownerId: 'bob@test.dev' } });
    assert.equal(own.status, 200);
    assert.equal(own.json.ownerId, 'ann@test.dev', 'ownership cannot be transferred by the body');
    assert.equal((await srv.api('DELETE', '/api/flights/f1', as(admin))).status, 200);

    await srv.api('POST', '/api/visited', { ...as(ann), body: { id: 'country_PT', type: 'country', code: 'PT' } });
    assert.equal((await srv.api('DELETE', '/api/visited/country_PT', as(bob))).status, 403);
    assert.equal((await srv.api('POST', '/api/visited/bulk', { ...as(bob), body: [{ id: 'country_PT', code: 'XX' }] })).status, 403);
});

test('records created before ownership existed are admin-managed', async () => {
    await srv.pool.query('INSERT INTO flights (id, data) VALUES ($1, $2)', ['legacy', JSON.stringify({ id: 'legacy', origin: 'AMS' })]);
    assert.equal((await srv.api('PUT', '/api/flights/legacy', { ...as(ann), body: { id: 'legacy', origin: 'X' } })).status, 403);
    assert.equal((await srv.api('PUT', '/api/flights/legacy', { ...as(admin), body: { id: 'legacy', origin: 'Y' } })).status, 200);
});

test('a PUT body id that differs from the URL cannot write another record (REL-011)', async () => {
    await srv.api('POST', '/api/trips', { ...as(ann), body: { id: 'a', name: 'A', participants: ['ann@test.dev'] } });
    await srv.api('POST', '/api/trips', { ...as(bob), body: { id: 'b', name: 'B', participants: ['bob@test.dev'] } });
    const r = await srv.api('PUT', '/api/trips/a', { ...as(ann), body: { id: 'b', name: 'Overwrite B', participants: ['ann@test.dev'] } });
    assert.equal(r.json.id, 'a');
    const b = (await srv.api('GET', '/api/trips', as(admin))).json.find((t) => t.id === 'b');
    assert.equal(b.name, 'B');
});
