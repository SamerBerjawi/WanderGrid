// Leave Phase 1: leave entries are their own records. Everyone reads them; only the member (or an admin) writes them.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('../helpers/testServer');

let srv, admin, partner;
before(async () => { srv = await startTestServer(); });
after(async () => { await srv.close(); });
beforeEach(async () => {
    await srv.reset();
    admin = (await srv.api('POST', '/api/auth/register', { body: { name: 'Admin', email: 'admin@test.dev', password: 'admin-pass-1' } })).json;
    partner = (await srv.api('POST', '/api/auth/register', { body: { name: 'Partner', email: 'partner@test.dev', password: 'partner-pass-1' } })).json;
});

const entry = (id, memberId, extra = {}) => ({ id, memberId, startDate: '2026-07-06', endDate: '2026-07-10', entitlementId: 'annual', state: 'planned', ...extra });

test('a member adds, changes and removes their own leave, and everyone can read it', async () => {
    const pid = partner.user.id;
    const created = await srv.api('POST', '/api/leave', { token: partner.token, body: entry('l1', pid) });
    assert.equal(created.status, 201);
    assert.equal(created.json.createdBy, pid);
    assert.equal(created.json.version, 1);
    const read = await srv.api('GET', '/api/leave', { token: admin.token });
    assert.deepEqual(read.json.map(e => e.id), ['l1']);
    const put = await srv.api('PUT', '/api/leave/l1', { token: partner.token, body: { ...created.json, state: 'approved' } });
    assert.equal(put.status, 200);
    assert.equal(put.json.version, 2);
    const stale = await srv.api('PUT', '/api/leave/l1', { token: partner.token, body: { ...created.json, state: 'draft' } });
    assert.equal(stale.status, 409);
    assert.equal((await srv.api('DELETE', '/api/leave/l1', { token: partner.token })).status, 200);
});

test('a member cannot add, change or take over someone else\'s leave; an admin can', async () => {
    const pid = partner.user.id, aid = admin.user.id;
    assert.equal((await srv.api('POST', '/api/leave', { token: partner.token, body: entry('x', aid) })).status, 403);
    assert.equal((await srv.api('POST', '/api/leave', { token: admin.token, body: entry('a1', aid) })).status, 201);
    assert.equal((await srv.api('PUT', '/api/leave/a1', { token: partner.token, body: entry('a1', aid, { state: 'draft' }) })).status, 403);
    assert.equal((await srv.api('DELETE', '/api/leave/a1', { token: partner.token })).status, 403);
    assert.equal((await srv.api('POST', '/api/leave', { token: partner.token, body: entry('p1', pid) })).status, 201);
    assert.equal((await srv.api('PUT', '/api/leave/p1', { token: partner.token, body: entry('p1', aid) })).status, 403, 'cannot hand it to someone else');
    assert.equal((await srv.api('POST', '/api/leave', { token: admin.token, body: entry('p2', pid) })).status, 201, 'an admin adds leave for a member');
});

test('leave is checked for shape', async () => {
    const pid = partner.user.id;
    const bad = [
        { id: 'b1', startDate: '2026-07-06' },
        entry('b2', pid, { startDate: 'soon' }),
        entry('b3', pid, { endDate: '2026-07-01' }),
        entry('b4', pid, { state: 'maybe' }),
        entry('b5', pid, { excludedDates: 'monday' }),
    ];
    for (const body of bad) assert.equal((await srv.api('POST', '/api/leave', { token: partner.token, body })).status, 400, body.id);
});

test('a trip and its leave change together in one batch', async () => {
    const pid = partner.user.id;
    const r = await srv.api('POST', '/api/batch', { token: partner.token, body: {
        upsertTrips: [{ id: 't1', name: 'Rome', startDate: '2026-07-06', endDate: '2026-07-10', status: 'Planning', participants: [pid] }],
        upsertLeave: [entry('l-t1', pid, { tripId: 't1' })],
    } });
    assert.equal(r.status, 200);
    assert.equal(r.json.versions.leave['l-t1'], 1);
    const failed = await srv.api('POST', '/api/batch', { token: partner.token, body: {
        upsertTrips: [{ id: 't2', name: 'Paris', startDate: '2026-08-03', endDate: '2026-08-05', status: 'Planning', participants: [pid] }],
        upsertLeave: [entry('l-t2', admin.user.id, { tripId: 't2' })],
    } });
    assert.equal(failed.status, 403);
    const trips = await srv.api('GET', '/api/trips', { token: partner.token });
    assert.equal(trips.json.some(t => t.id === 't2'), false, 'the trip was not saved without its leave');
});

test('deleting a member deletes their leave', async () => {
    const pid = partner.user.id;
    await srv.api('POST', '/api/leave', { token: partner.token, body: entry('l1', pid) });
    await srv.api('POST', '/api/leave', { token: admin.token, body: entry('l2', admin.user.id) });
    assert.equal((await srv.api('DELETE', `/api/users/${encodeURIComponent(pid)}`, { token: admin.token })).status, 200);
    assert.deepEqual((await srv.api('GET', '/api/leave', { token: admin.token })).json.map(e => e.id), ['l2']);
});

test('restoring an older backup moves leave off its trips', async () => {
    const pid = partner.user.id;
    const backup = {
        trips: [
            { id: 'leave-old', name: 'Time off', kind: 'timeoff', startDate: '2026-02-02', endDate: '2026-02-03', status: 'Planning', participants: [pid], entitlementId: 'annual' },
            { id: 'rome', name: 'Rome', startDate: '2026-05-04', endDate: '2026-05-08', status: 'Upcoming', participants: [pid], entitlementId: 'annual', transports: [] },
        ],
        restoreOptions: { mode: 'merge' },
    };
    const done = await srv.restore(admin.token, backup);
    assert.equal(done.json.status, 'Completed', JSON.stringify(done.json));
    const leave = (await srv.api('GET', '/api/leave', { token: admin.token })).json.map(e => e.id).sort();
    assert.deepEqual(leave, ['leave-old', `leave:rome:${pid}`]);
    const trips = (await srv.api('GET', '/api/trips', { token: admin.token })).json;
    assert.deepEqual(trips.map(t => t.id), ['rome']);
    assert.equal(trips[0].entitlementId, undefined);
});

test('a new member starts with each leave type\'s default allowance', async () => {
    const type = { id: 'annual', name: 'Annual leave', category: 'Annual', color: 'green', accrual: { period: 'yearly', amount: 26 }, carryOver: { enabled: false, maxDays: 0, expiryType: 'none' } };
    assert.equal((await srv.api('PUT', '/api/entitlements/annual', { token: admin.token, body: type })).status, 200);
    const added = await srv.api('POST', '/api/users', { token: admin.token, body: { id: 'new@test.dev', email: 'new@test.dev', name: 'New', role: 'Partner' } });
    assert.equal(added.status, 201);
    const year = new Date().getFullYear();
    assert.deepEqual(added.json.policies.map(p => [p.entitlementId, p.year, p.accrual.amount]), [['annual', year, 26]]);
    assert.equal(added.json.legacyLeaveConverted, true);
});
