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
    assert.match(r.text, /Evil\\nX-INJECT:1\;a\\,b/);
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
