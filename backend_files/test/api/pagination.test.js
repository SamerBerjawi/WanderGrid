// F-17: limit/offset apply to what the caller may see, not to the table before the read policy runs.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('../helpers/testServer');

let srv, admin, member;
before(async () => { srv = await startTestServer(); });
after(async () => { await srv.close(); });

beforeEach(async () => {
    await srv.reset();
    admin = (await srv.api('POST', '/api/auth/register', { body: { name: 'Admin', email: 'admin@test.dev', password: 'admin-pass-1' } })).json;
    member = (await srv.api('POST', '/api/auth/register', { body: { name: 'Mia Member', email: 'mia@test.dev', password: 'member-pass-1' } })).json;
    // Trips alternate between the admin only (a) and the member (m), in date order.
    const plan = ['a1', 'm1', 'a2', 'm2', 'a3', 'm3', 'a4', 'm4'];
    for (let i = 0; i < plan.length; i++) {
        const id = plan[i];
        const owner = id.startsWith('m') ? member : admin;
        const day = String(i + 1).padStart(2, '0');
        const r = await srv.api('POST', '/api/trips', { token: owner.token, body: { id, name: id, status: 'Upcoming', privacy: 'Private', startDate: `2027-03-${day}`, endDate: `2027-03-${day}`, participants: [owner === member ? 'mia@test.dev' : 'admin@test.dev'] } });
        assert.equal(r.status, 201, id);
    }
});

const ids = (r) => r.json.map(t => t.id);

test('a member\'s page is full-sized and starts where it should', async () => {
    const all = await srv.api('GET', '/api/trips?sort=asc', { token: member.token });
    assert.deepEqual(ids(all), ['m1', 'm2', 'm3', 'm4']);
    assert.deepEqual(ids(await srv.api('GET', '/api/trips?sort=asc&limit=2', { token: member.token })), ['m1', 'm2']);
    assert.deepEqual(ids(await srv.api('GET', '/api/trips?sort=asc&limit=2&offset=1', { token: member.token })), ['m2', 'm3']);
    assert.deepEqual(ids(await srv.api('GET', '/api/trips?sort=asc&limit=2&offset=3', { token: member.token })), ['m4']);
    assert.deepEqual(ids(await srv.api('GET', '/api/trips?sort=asc&offset=2', { token: member.token })), ['m3', 'm4']);
});

test('an admin still pages through everything', async () => {
    assert.equal((await srv.api('GET', '/api/trips?sort=asc&limit=3&offset=2', { token: admin.token })).json.length, 3);
    assert.deepEqual(ids(await srv.api('GET', '/api/trips?sort=asc&limit=2', { token: admin.token })), ['a1', 'm1']);
});

test('tables without a read policy are still paged in the database', async () => {
    const r = await srv.api('GET', '/api/configs?limit=1', { token: member.token });
    assert.equal(r.status, 200);
    assert.ok(r.json.length <= 1);
});
