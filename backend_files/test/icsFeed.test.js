// The shared iCalendar emitter: escaping, folding, time zones, UIDs, options, reminders and privacy.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../icsFeed.mjs');
const NOW = Date.UTC(2026, 9, 1);
const unfold = (s) => s.replace(/\r\n /g, '');
const events = (ics) => unfold(ics).split('BEGIN:VEVENT\r\n').slice(1).map((e) => e.split('END:VEVENT')[0]);
const prop = (event, name) => (new RegExp(`^${name}[;:](.*)$`, 'm').exec(event) || [])[1];

const flight = (over = {}) => ({ id: 'f1', mode: 'Flight', provider: 'KLM', identifier: 'KL1234', origin: 'AMS', destination: 'JFK', departureDate: '2026-11-01', departureTime: '10:00', arrivalDate: '2026-11-01', arrivalTime: '12:30', confirmationCode: 'ABC123', seatNumber: '12A', departureTerminal: '2', departureGate: 'D7', ...over });
const trip = (over = {}) => ({
    id: 't1', name: 'New York', location: 'New York, USA', status: 'Upcoming', startDate: '2026-11-01', endDate: '2026-11-05', participants: ['a'], version: 4,
    transports: [flight(), { id: 'tr1', mode: 'Train', provider: 'Amtrak', identifier: '171', origin: 'New York', destination: 'Boston', departureDate: '2026-11-03', departureTime: '09:00', arrivalDate: '2026-11-03', arrivalTime: '13:10' }],
    accommodations: [{ id: 'a1', name: 'Hotel Lex', address: '511 Lexington Ave', type: 'Hotel', checkInDate: '2026-11-01', checkInTime: '15:00', checkOutDate: '2026-11-05', checkOutTime: '11:00', confirmationCode: 'HX9' }],
    activities: [{ id: 'ac1', date: '2026-11-02', time: '19:30', title: 'Show', location: 'Broadway' }, { id: 'ac2', date: '2026-11-04', time: '', title: 'Free day' }],
    ...over,
});
const tz = { AMS: 'Europe/Amsterdam', JFK: 'America/New_York' };
const ctx = { now: NOW, baseUrl: 'https://wg.example', airportTz: (c) => tz[c] };

test('escapes backslash, semicolon, comma and newlines', async () => {
    const { icsEscape } = await load();
    assert.equal(icsEscape('a\\b;c,d\r\ne\nf'), String.raw`a\\b\;c\,d\ne\nf`);
});

test('folds at 75 octets without splitting UTF-8 characters, and unfolds back', async () => {
    const { icsFold } = await load();
    const line = `SUMMARY:${'é✈🛏'.repeat(40)}`;
    const folded = icsFold(line);
    for (const part of folded.split('\r\n')) assert.ok(Buffer.byteLength(part) <= 75, part);
    assert.equal(folded.replace(/\r\n /g, ''), line);
    assert.ok(!folded.includes('�'));
    assert.equal(icsFold('SHORT'), 'SHORT');
});

test('a flight is its own timed event in UTC using the airports\' time zones', async () => {
    const { buildFeed } = await load();
    const [, f] = events(buildFeed([trip()], {}, ctx)); // [trip span, flight, ...]
    assert.match(prop(f, 'SUMMARY'), /^✈ AMS → JFK · KL1234$/);
    // 10:00 in Amsterdam (UTC+1 in November) = 09:00Z; 12:30 in New York (UTC-5 on Nov 1 after DST ends) = 17:30Z
    assert.equal(prop(f, 'DTSTART'), '20261101T090000Z');
    assert.equal(prop(f, 'DTEND'), '20261101T173000Z');
    assert.match(f, /Confirmation: ABC123/);
    assert.match(f, /Departure: Terminal 2\\, Gate D7/);
    assert.match(f, /Seat: 12A/);
    assert.match(f, /URL:https:\/\/wg\.example\/trip\/t1/);
});

test('a leg that lands the next day keeps its real duration; DST is applied on the right date', async () => {
    const { buildFeed } = await load();
    const t = trip({ transports: [flight({ id: 'n', origin: 'JFK', destination: 'AMS', departureDate: '2026-10-24', departureTime: '19:00', arrivalDate: '2026-10-25', arrivalTime: '08:30' })] });
    const f = events(buildFeed([t], { trips: false }, ctx)).find((e) => prop(e, 'UID').startsWith('n@'));
    assert.equal(prop(f, 'DTSTART'), '20261024T230000Z'); // New York is still on EDT (UTC-4)
    assert.equal(prop(f, 'DTEND'), '20261025T073000Z');   // Amsterdam returned to CET (UTC+1) on Oct 25
});

test('unknown zones give floating local times, never shifted', async () => {
    const { buildFeed } = await load();
    const [, , train] = events(buildFeed([trip()], { transport: true }, ctx));
    assert.equal(prop(train, 'SUMMARY'), '🚆 Train New York → Boston · 171');
    assert.equal(prop(train, 'DTSTART'), '20261103T090000');
    assert.equal(prop(train, 'DTEND'), '20261103T131000');
    const unknownAirport = events(buildFeed([trip({ transports: [flight({ origin: 'ZZZ' })] })], { trips: false }, ctx))[0];
    assert.equal(prop(unknownAirport, 'DTSTART'), '20261101T100000');
});

test('the trip is an all-day span with an exclusive end, and stays split into check-in and check-out', async () => {
    const { buildFeed } = await load();
    const ev = events(buildFeed([trip()], {}, ctx));
    assert.equal(prop(ev[0], 'DTSTART;VALUE=DATE'), '20261101');
    assert.equal(prop(ev[0], 'DTEND;VALUE=DATE'), '20261106');
    assert.match(prop(ev[0], 'SUMMARY'), /New York · New York\\, USA/);
    const inn = ev.find((e) => prop(e, 'UID') === 'a1-in@wandergrid.app');
    const out = ev.find((e) => prop(e, 'UID') === 'a1-out@wandergrid.app');
    assert.equal(prop(inn, 'DTSTART'), '20261101T150000');
    assert.equal(prop(out, 'DTSTART'), '20261105T110000');
    assert.match(inn, /SUMMARY:🛏 Check-in · Hotel Lex/);
    const span = events(buildFeed([trip()], { stay: 'span', trips: false, flights: false }, ctx));
    assert.equal(span.length, 1);
    assert.equal(prop(span[0], 'UID'), 'a1@wandergrid.app');
    assert.equal(prop(span[0], 'DTEND;VALUE=DATE'), '20261106');
});

test('activities: timed ones one hour long, untimed ones all day', async () => {
    const { buildFeed } = await load();
    const ev = events(buildFeed([trip()], { trips: false, flights: false, stays: false, activities: true }, ctx));
    assert.equal(ev.length, 2);
    assert.equal(prop(ev[0], 'DTSTART'), '20261102T193000');
    assert.equal(prop(ev[0], 'DTEND'), '20261102T203000');
    assert.equal(prop(ev[0], 'LOCATION'), 'Broadway');
    assert.equal(prop(ev[1], 'DTSTART;VALUE=DATE'), '20261104');
});

test('options switch each kind on or off', async () => {
    const { buildFeed } = await load();
    const count = (o) => events(buildFeed([trip()], o, ctx)).length;
    assert.equal(count({}), 4);                                   // trip, flight, check-in, check-out
    assert.equal(count({ trips: false }), 3);
    assert.equal(count({ flights: false, stays: false }), 1);
    assert.equal(count({ transport: true }), 5);
    assert.equal(count({ activities: true }), 6);
    assert.equal(count({ trips: false, flights: false, stays: false }), 0);
});

test('parseFeedOptions reads query parameters, ignores junk and round-trips through feedOptionsToQuery', async () => {
    const { parseFeedOptions, feedOptionsToQuery, DEFAULT_FEED_OPTIONS } = await load();
    assert.deepEqual(parseFeedOptions(''), DEFAULT_FEED_OPTIONS);
    const o = parseFeedOptions('flights=0&transport=1&stay=span&reminders=true&remindFlight=90&private=busy&bogus=1&remindStay=-5&cost=maybe');
    assert.equal(o.flights, false);
    assert.equal(o.transport, true);
    assert.equal(o.stay, 'span');
    assert.equal(o.reminders, true);
    assert.equal(o.remindFlight, 90);
    assert.equal(o.private, 'busy');
    assert.equal(o.remindStay, DEFAULT_FEED_OPTIONS.remindStay, 'a negative number is ignored');
    assert.equal(o.cost, false, 'an unknown value keeps the default');
    assert.deepEqual(parseFeedOptions(feedOptionsToQuery(o)), o);
    assert.equal(feedOptionsToQuery(DEFAULT_FEED_OPTIONS), '');
    assert.equal(parseFeedOptions({ remindFlight: '99999999' }).remindFlight, 60 * 24 * 14);
});

test('reminders are VALARMs only when asked for', async () => {
    const { buildFeed } = await load();
    assert.ok(!buildFeed([trip()], {}, ctx).includes('VALARM'));
    const r = events(buildFeed([trip()], { reminders: true }, ctx));
    const f = r.find((e) => prop(e, 'UID').startsWith('f1@'));
    assert.match(f, /BEGIN:VALARM[\s\S]*TRIGGER:-PT3H[\s\S]*END:VALARM/);
    assert.match(r.find((e) => prop(e, 'UID') === 'a1-in@wandergrid.app'), /TRIGGER:-P1D/);
    assert.ok(!/VALARM/.test(r.find((e) => prop(e, 'UID') === 'a1-out@wandergrid.app')));
});

test('UIDs derive from record ids and stay the same when a flight changes; SEQUENCE follows the trip version', async () => {
    const { buildFeed } = await load();
    const a = events(buildFeed([trip()], {}, ctx));
    const b = events(buildFeed([trip({ version: 5, transports: [flight({ departureTime: '11:15' })] })], {}, ctx));
    const uid = (e) => prop(e, 'UID');
    assert.deepEqual(a.map(uid), ['t1@wandergrid.app', 'f1@wandergrid.app', 'a1-in@wandergrid.app', 'a1-out@wandergrid.app']);
    assert.equal(uid(b[1]), 'f1@wandergrid.app');
    assert.notEqual(prop(a[1], 'DTSTART'), prop(b[1], 'DTSTART'));
    assert.equal(prop(a[1], 'SEQUENCE'), '4');
    assert.equal(prop(b[1], 'SEQUENCE'), '5');
    assert.equal(new Set(a.map(uid)).size, a.length);
});

test('DTSTAMP and LAST-MODIFIED come from the trip\'s updatedAt, so an unchanged trip gives identical output', async () => {
    const { buildFeed } = await load();
    const t = trip({ updatedAt: '2026-10-20T08:00:00.000Z' });
    const [first] = events(buildFeed([t], {}, { ...ctx, now: 1 }));
    assert.equal(prop(first, 'DTSTAMP'), '20261020T080000Z');
    assert.equal(prop(first, 'LAST-MODIFIED'), '20261020T080000Z');
    assert.equal(buildFeed([t], {}, { ...ctx, now: 1 }), buildFeed([t], {}, { ...ctx, now: 1 }));
});

test('cancelled trips disappear from the feed, planning trips only with planning=1', async () => {
    const { buildFeed } = await load();
    assert.equal(events(buildFeed([trip({ status: 'Cancelled' })], {}, ctx)).length, 0);
    assert.equal(events(buildFeed([trip({ status: 'Planning' })], {}, ctx)).length, 0);
    const planned = events(buildFeed([trip({ status: 'Planning' })], { planning: true }, ctx));
    assert.ok(planned.length > 0);
    assert.equal(prop(planned[0], 'STATUS'), 'TENTATIVE');
});

test('Private trips: full by default (the feed only holds the owner\'s trips), busy block or hidden on request', async () => {
    const { buildFeed } = await load();
    const p = trip({ privacy: 'Private', name: 'Secret surprise' });
    assert.match(buildFeed([p], {}, ctx), /Secret surprise/);
    const busy = buildFeed([p], { private: 'busy' }, ctx);
    assert.equal(events(busy).length, 1);
    assert.doesNotMatch(busy, /Secret|Hotel|KL1234|ABC123|New York/);
    assert.equal(events(buildFeed([p], { private: 'hide' }, ctx)).length, 0);
});

test('leave and public holidays are separate, off by default, all-day layers', async () => {
    const { buildFeed } = await load();
    const leave = { id: 'leave-1', name: 'Time off', status: 'Upcoming', startDate: '2026-12-24', endDate: '2026-12-31', participants: ['a'], entitlementId: 'ann', hideInPlanner: true };
    const cal = [{ id: 'BE-2026', countryName: 'Belgium', year: 2026, holidays: [{ id: 'h1', name: 'Christmas Day', date: '2026-12-25', isIncluded: true }] }];
    const c = { ...ctx, entitlementName: () => 'Annual leave', holidayCalendars: cal };
    assert.equal(events(buildFeed([leave], {}, c)).length, 0);
    const on = events(buildFeed([leave], { leave: true, holidays: true }, c));
    assert.equal(on.length, 2);
    assert.match(prop(on[0], 'SUMMARY'), /Annual leave/);
    assert.equal(prop(on[0], 'DTEND;VALUE=DATE'), '20270101');
    assert.match(prop(on[1], 'SUMMARY'), /Christmas Day/);
});

test('the calendar is CRLF, folded, named and carries a refresh hint', async () => {
    const { buildFeed } = await load();
    const out = buildFeed([trip({ name: 'é'.repeat(80), description: 'x,y;z\nsecond line' })], {}, ctx);
    assert.ok(out.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
    assert.ok(out.endsWith('END:VCALENDAR\r\n'));
    assert.ok(!/[^\r]\n/.test(out), 'every line ends in CRLF');
    for (const l of out.split('\r\n')) assert.ok(Buffer.byteLength(l) <= 75, l);
    assert.match(out, /X-WR-CALNAME:WanderGrid Trips/);
    assert.match(out, /REFRESH-INTERVAL;VALUE=DURATION:PT1H/);
    assert.match(out, /X-PUBLISHED-TTL:PT1H/);
    assert.match(unfold(out), /x\\,y\\;z\\nsecond line/);
});

test('a broken record does not break the rest', async () => {
    const { buildFeed } = await load();
    const out = buildFeed([{ id: 'bad', name: 'Broken', status: 'Upcoming', startDate: '2026-13-45', endDate: '2026-13-46', transports: [{ id: 'x', departureDate: 'nope' }] }, trip()], {}, ctx);
    assert.doesNotMatch(out, /Broken/);
    assert.match(out, /UID:t1@/);
});
