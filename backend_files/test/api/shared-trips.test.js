// Public, read-only trip links: who may share, what the public page sees, and that turning a link off works.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('../helpers/testServer');

let srv, admin, partner, outsider;
before(async () => { srv = await startTestServer(); });
after(async () => { await srv.close(); });

const trip = {
    id: 'trip-1', name: 'Lisbon in May', subtitle: 'Long weekend', location: 'Lisbon', startDate: '2027-05-01', endDate: '2027-05-05', status: 'Upcoming',
    participants: [], notes: 'PRIVATE-NOTES', targetBudget: 4321, description: 'PRIVATE-DESC', packingList: [{ id: 'p', text: 'PRIVATE-PACK', category: 'x', isChecked: false }],
    expenses: [{ id: 'e', amount: 99 }], allocations: [{ entitlementId: 'leave', days: 3 }],
    transports: [{ id: 'f1', mode: 'Flight', provider: 'TAP', identifier: 'TP1234', origin: 'BRU', destination: 'LIS', departureDate: '2027-05-01', departureTime: '08:00', arrivalDate: '2027-05-01', arrivalTime: '10:00', confirmationCode: 'SECRETPNR', seatNumber: '14C', cost: 321, tailNumber: 'CS-TNA' }],
    accommodations: [{ id: 's1', name: 'Hotel Avenida', address: 'Av. da Liberdade', type: 'Hotel', checkInDate: '2027-05-01', checkInTime: '15:00', checkOutDate: '2027-05-05', checkOutTime: '11:00', confirmationCode: 'HOTELPNR', cost: 800 }],
    activities: [{ id: 'a1', date: '2027-05-02', time: '19:00', title: 'Dinner at Belcanto', cost: 250, description: 'PRIVATE-ACT' }],
};

beforeEach(async () => {
    await srv.reset();
    admin = (await srv.api('POST', '/api/auth/register', { body: { name: 'Admin Person', email: 'admin@test.dev', password: 'admin-pass-1' } })).json;
    partner = (await srv.api('POST', '/api/auth/register', { body: { name: 'Pat Partner', email: 'partner@test.dev', password: 'partner-pass-1' } })).json;
    outsider = (await srv.api('POST', '/api/auth/register', { body: { name: 'Olly Outsider', email: 'out@test.dev', password: 'outsider-pass-1' } })).json;
    const made = await srv.api('POST', '/api/trips', { token: partner.token, body: { ...trip, participants: [partner.user?.id || 'partner@test.dev'] } });
    assert.equal(made.status, 201);
});

test('a traveller can turn a link on, and it is the same link each time', async () => {
    const a = await srv.api('POST', '/api/trips/trip-1/share', { token: partner.token });
    assert.equal(a.status, 201);
    assert.match(a.json.token, /^[A-Za-z0-9_-]{32}$/);
    const b = await srv.api('POST', '/api/trips/trip-1/share', { token: partner.token });
    assert.equal(b.json.token, a.json.token);
    const status = await srv.api('GET', '/api/trips/trip-1/share', { token: partner.token });
    assert.equal(status.json.token, a.json.token);
});

test('only someone who can edit the trip can read, create or revoke its link', async () => {
    for (const [method] of [['GET'], ['POST'], ['DELETE']]) {
        const r = await srv.api(method, '/api/trips/trip-1/share', { token: outsider.token });
        assert.equal(r.status, 403, method);
        assert.equal((await srv.api(method, '/api/trips/trip-1/share')).status, 401, `${method} without a session`);
    }
    assert.equal((await srv.api('POST', '/api/trips/nope/share', { token: admin.token })).status, 404);
    assert.equal((await srv.api('POST', '/api/trips/trip-1/share', { token: admin.token })).status, 201, 'an Admin may');
});

test('the public page needs no account and shows the plan but none of the private details', async () => {
    const { json: { token } } = await srv.api('POST', '/api/trips/trip-1/share', { token: partner.token });
    const r = await srv.api('GET', `/api/public/trips/${token}`);
    assert.equal(r.status, 200);
    assert.equal(r.json.trip.name, 'Lisbon in May');
    assert.equal(r.json.transports[0].identifier, 'TP1234');
    assert.equal(r.json.stays[0].name, 'Hotel Avenida');
    assert.equal(r.json.activities[0].title, 'Dinner at Belcanto');
    assert.deepEqual(r.json.travellers, ['Pat']);
    const text = JSON.stringify(r.json);
    for (const secret of ['PRIVATE', 'SECRETPNR', 'HOTELPNR', '14C', 'CS-TNA', '4321', '321', '800', '250', 'partner@test.dev', 'allocations', 'expenses', 'password']) {
        assert.ok(!text.includes(secret), `leaked ${secret}`);
    }
});

test('turning the link off stops it at once, and a new link is a different address', async () => {
    const { json: { token } } = await srv.api('POST', '/api/trips/trip-1/share', { token: partner.token });
    assert.equal((await srv.api('DELETE', '/api/trips/trip-1/share', { token: partner.token })).status, 200);
    assert.equal((await srv.api('GET', `/api/public/trips/${token}`)).status, 404);
    assert.equal((await srv.api('GET', '/api/trips/trip-1/share', { token: partner.token })).json.token, null);
    const again = await srv.api('POST', '/api/trips/trip-1/share', { token: partner.token });
    assert.notEqual(again.json.token, token);
});

test('unknown, malformed and deleted-trip tokens all answer 404, and the response is not cached or indexed', async () => {
    assert.equal((await srv.api('GET', '/api/public/trips/short')).status, 404);
    assert.equal((await srv.api('GET', `/api/public/trips/${'a'.repeat(32)}`)).status, 404);
    const { json: { token } } = await srv.api('POST', '/api/trips/trip-1/share', { token: partner.token });
    const ok = await srv.api('GET', `/api/public/trips/${token}`);
    assert.equal(ok.headers.get('cache-control'), 'no-store');
    assert.match(ok.headers.get('x-robots-tag'), /noindex/);
    await srv.api('DELETE', '/api/trips/trip-1', { token: partner.token });
    assert.equal((await srv.api('GET', `/api/public/trips/${token}`)).status, 404);
});
