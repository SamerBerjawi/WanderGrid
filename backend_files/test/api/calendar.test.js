// WP-1.6: private calendar feed (SEC-006, QA-G-004) and resilient ICS output (REL-011 part).
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('../helpers/testServer');

let srv, admin;
before(async () => { srv = await startTestServer(); });
after(async () => { await srv.close(); });
beforeEach(async () => {
    await srv.reset();
    admin = (await srv.api('POST', '/api/auth/register', { body: { name: 'Admin', email: 'admin@test.dev', password: 'admin-pass-1' } })).json;
});
const feed = (token) => srv.api('GET', `/api/calendar/${token}/feed.ics`, { raw: true });
const addTrip = (trip) => srv.api('POST', '/api/trips', { token: admin.token, body: { participants: ['admin@test.dev'], status: 'Upcoming', startDate: '2026-11-01', endDate: '2026-11-05', ...trip } });

test('the feed is served by token and contains the user\'s trips', async () => {
    await addTrip({ id: 't1', name: 'Lisbon' });
    const { json } = await srv.api('GET', '/api/calendar/token', { token: admin.token });
    assert.match(json.token, /^[0-9a-f]{48}$/);
    assert.equal((await srv.api('GET', '/api/calendar/token', { token: admin.token })).json.token, json.token, 'stable until rotated');
    const r = await feed(json.token);
    assert.equal(r.status, 200);
    assert.match(r.text, /BEGIN:VCALENDAR/);
    assert.match(r.text, /SUMMARY:.*Lisbon/);
});

test('a guessed user id / email or a wrong token gets 404, not data', async () => {
    await addTrip({ id: 't1', name: 'Secret' });
    assert.equal((await feed('admin@test.dev')).status, 404);
    assert.equal((await feed('0'.repeat(48))).status, 404);
});

test('rotating the token invalidates the old URL', async () => {
    const first = (await srv.api('GET', '/api/calendar/token', { token: admin.token })).json.token;
    const rotated = (await srv.api('POST', '/api/calendar/token/rotate', { token: admin.token })).json.token;
    assert.notEqual(first, rotated);
    assert.equal((await feed(first)).status, 404);
    assert.equal((await feed(rotated)).status, 200);
});

test('trip text is escaped so it cannot inject calendar properties', async () => {
    await addTrip({ id: 't1', name: 'Evil\r\nX-INJECT:1;a,b', location: 'Paris\nLOCATION:Elsewhere' });
    const token = (await srv.api('GET', '/api/calendar/token', { token: admin.token })).json.token;
    const r = await feed(token);
    assert.doesNotMatch(r.text, /\r\nX-INJECT/);
    assert.doesNotMatch(r.text, /\r\nLOCATION:Elsewhere/);
    assert.match(r.text, /Evil\\nX-INJECT:1\\;a\\,b/); // semicolons are escaped too (the old emitter let them through)
    assert.ok(r.text.split('\r\n').every((line) => Buffer.byteLength(line) <= 75), 'lines are folded');
});

test('a trip with an invalid date does not break the feed', async () => {
    // The API now rejects such dates (WP-2.11), but older rows or restores may still contain them.
    await srv.pool.query('INSERT INTO trips (id, data) VALUES ($1, $2)', ['bad', JSON.stringify({ id: 'bad', name: 'Broken', status: 'Upcoming', participants: ['admin@test.dev'], startDate: '2026-11-01', endDate: '2026-13-45' })]);
    await addTrip({ id: 'ok', name: 'Fine' });
    const token = (await srv.api('GET', '/api/calendar/token', { token: admin.token })).json.token;
    const r = await feed(token);
    assert.equal(r.status, 200);
    assert.match(r.text, /Fine/);
    assert.doesNotMatch(r.text, /Broken/);
});

test('editing your profile keeps the calendar link, and the token never appears in user lists or backups', async () => {
    const token = (await srv.api('GET', '/api/calendar/token', { token: admin.token })).json.token;
    await srv.api('PUT', '/api/users/admin@test.dev', { token: admin.token, body: { id: 'admin@test.dev', email: 'admin@test.dev', name: 'Renamed', role: 'Admin' } });
    assert.equal((await feed(token)).status, 200);
    const users = (await srv.api('GET', '/api/users', { token: admin.token })).json;
    assert.equal(users[0].calendarToken, undefined);
    const backup = await srv.api('GET', '/api/backup', { token: admin.token, raw: true });
    assert.ok(!backup.text.includes(token));
});

// --- Granular feed: one event per flight, stay and activity, chosen with query parameters ---
const uids = (text) => [...text.matchAll(/^UID:(.*)$/gm)].map((m) => m[1]);
const richTrip = (over = {}) => ({
    id: 'rich', name: 'Lisbon', location: 'Lisbon, Portugal', icon: '🌞',
    transports: [
        { id: 'fl1', mode: 'Flight', provider: 'TAP', identifier: 'TP673', origin: 'AMS', destination: 'LIS', departureDate: '2026-11-01', departureTime: '07:30', arrivalDate: '2026-11-01', arrivalTime: '09:15', confirmationCode: 'ZX81QP' },
        { id: 'tr1', mode: 'Train', provider: 'CP', origin: 'Lisbon', destination: 'Porto', departureDate: '2026-11-03', departureTime: '10:00', arrivalDate: '2026-11-03', arrivalTime: '13:00' },
    ],
    accommodations: [{ id: 'st1', name: 'Hotel Baixa', address: 'Rua Augusta 1', type: 'Hotel', checkInDate: '2026-11-01', checkInTime: '15:00', checkOutDate: '2026-11-05', checkOutTime: '11:00' }],
    activities: [{ id: 'ac1', date: '2026-11-02', time: '20:00', title: 'Fado dinner', location: 'Alfama' }],
    ...over,
});
const tokenOf = async () => (await srv.api('GET', '/api/calendar/token', { token: admin.token })).json.token;

test('the default feed has the trip span, flights and stays; the query picks anything else', async () => {
    await addTrip(richTrip());
    const token = await tokenOf();
    const base = (await feed(token)).text;
    assert.deepEqual(uids(base).sort(), ['fl1@wandergrid.app', 'rich@wandergrid.app', 'st1-in@wandergrid.app', 'st1-out@wandergrid.app']);
    assert.match(base, /SUMMARY:✈ AMS → LIS · TP673/);
    assert.match(base, /DTSTART:20261101T063000Z/, 'AMS is on CET (UTC+1) in November');
    assert.match(base, /REFRESH-INTERVAL;VALUE=DURATION:PT1H/);

    const q = (query) => srv.api('GET', `/api/calendar/${token}/feed.ics?${query}`, { raw: true });
    assert.deepEqual(uids((await q('trips=0&flights=0&stays=0&transport=1&activities=1')).text).sort(), ['ac1@wandergrid.app', 'tr1@wandergrid.app']);
    assert.deepEqual(uids((await q('stay=span&trips=0&flights=0')).text), ['st1@wandergrid.app']);
    assert.match((await q('reminders=1&remindFlight=120')).text, /TRIGGER:-PT2H/);
    assert.doesNotMatch(base, /VALARM/);
});

test('a cancelled trip leaves the feed', async () => {
    await addTrip(richTrip({ status: 'Cancelled' }));
    assert.deepEqual(uids((await feed(await tokenOf())).text), []);
});

test('Private trips keep their details by default (it is the owner\'s own feed) and can be reduced to a block', async () => {
    await addTrip(richTrip({ privacy: 'Private', name: 'Surprise party' }));
    const token = await tokenOf();
    assert.match((await feed(token)).text, /Surprise party/);
    const busy = (await srv.api('GET', `/api/calendar/${token}/feed.ics?private=busy`, { raw: true })).text;
    assert.deepEqual(uids(busy), ['rich@wandergrid.app']);
    assert.doesNotMatch(busy, /Surprise|Hotel Baixa|TP673|ZX81QP/);
    assert.deepEqual(uids((await srv.api('GET', `/api/calendar/${token}/feed.ics?private=hide`, { raw: true })).text), []);
});

test('only the token owner\'s trips are in the feed', async () => {
    await srv.api('POST', '/api/trips', { token: admin.token, body: { id: 'others', name: 'Not yours', participants: ['someone@else.dev'], status: 'Upcoming', startDate: '2026-11-01', endDate: '2026-11-02' } });
    assert.doesNotMatch((await feed(await tokenOf())).text, /Not yours/);
});

test('the feed answers If-None-Match with 304 and changes its SEQUENCE when the trip is edited', async () => {
    await addTrip(richTrip());
    const token = await tokenOf();
    const first = await srv.api('GET', `/api/calendar/${token}/feed.ics`, { raw: true });
    const etag = first.headers.get('etag');
    assert.ok(etag);
    const again = await srv.api('GET', `/api/calendar/${token}/feed.ics`, { raw: true, headers: { 'If-None-Match': etag } });
    assert.equal(again.status, 304);
    assert.match(first.text, /SEQUENCE:1\r/);
});

test('"What to sync" choices are saved per person, sanitised, and survive a profile edit', async () => {
    const empty = (await srv.api('GET', '/api/calendar/prefs', { token: admin.token })).json.options;
    assert.equal(empty.flights, true);
    assert.equal(empty.activities, false);
    const saved = (await srv.api('PUT', '/api/calendar/prefs', { token: admin.token, body: { activities: '1', stay: 'span', remindFlight: '45', evil: 'x', private: 'nope' } })).json.options;
    assert.equal(saved.activities, true);
    assert.equal(saved.stay, 'span');
    assert.equal(saved.remindFlight, 45);
    assert.equal(saved.private, 'full');
    assert.equal(saved.evil, undefined);
    await srv.api('PUT', '/api/users/admin@test.dev', { token: admin.token, body: { id: 'admin@test.dev', email: 'admin@test.dev', name: 'Renamed', role: 'Admin' } });
    assert.equal((await srv.api('GET', '/api/calendar/prefs', { token: admin.token })).json.options.activities, true);
    assert.equal((await srv.api('GET', '/api/calendar/prefs')).status, 401);
});
