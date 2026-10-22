const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { clearUpstreamCache } = require('../upstream.js');
const { parseFlightNumber, normalizeFlightStats, resolveFlight, resetBreakers, BREAKER_FAILURES } = require('../flightLookup.js');

const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', `${name}.json`), 'utf8'));
const json = (data, status = 200) => ({ ok: status < 400, status, headers: new Headers({ 'content-type': 'application/json' }), text: async () => JSON.stringify(data) });
const NOW = Date.parse('2026-10-22T10:00:00Z');

/** A fetch that answers by host, counting calls. */
const router = (routes) => {
  const calls = [];
  const fn = async (url) => {
    calls.push(String(url));
    for (const [needle, answer] of Object.entries(routes)) {
      if (String(url).includes(needle)) return typeof answer === 'function' ? answer(String(url)) : answer;
    }
    return json({}, 404);
  };
  fn.calls = calls;
  return fn;
};

describe('flight number parsing', () => {
  test('reads IATA, spaced, zero-padded and ICAO (callsign) forms', () => {
    for (const input of ['ME215', 'me 215', 'ME-0215', 'MEA215']) {
      assert.deepEqual(parseFlightNumber(input), { carrier: 'ME', number: '215', iata: 'ME215', icao: 'MEA215' }, input);
    }
    assert.equal(parseFlightNumber('6E 123').carrier, '6E');
    assert.equal(parseFlightNumber('U21234').number, '1234');
  });
  test('refuses what is not a flight number and never guesses an unknown ICAO carrier', () => {
    for (const input of ['', 'xx', '12345', 'AB', 'ZZZ123', null, undefined]) assert.equal(parseFlightNumber(input), null, String(input));
  });
});

describe('FlightStats normalisation', () => {
  test('a landed flight carries actual times, delay, aircraft and the last position', () => {
    const c = normalizeFlightStats(fixture('flightstats-landed'));
    assert.equal(c.flightIata, 'ME215');
    assert.equal(c.status, 'landed');
    assert.equal(c.departure.iata, 'BEY');
    assert.equal(c.arrival.iata, 'BRU');
    assert.equal(c.departure.scheduledLocal, '2026-10-21T07:05');
    assert.equal(c.departure.actualLocal, '2026-10-21T07:07');
    assert.equal(c.arrival.actualLocal, '2026-10-21T10:30');
    assert.equal(c.departure.timezone, 'Asia/Beirut');
    assert.equal(c.aircraft.registration, 'T7-ME8');
    assert.ok(c.durationMinutes > 240 && c.durationMinutes < 300);
    assert.ok(c.live && typeof c.live.lat === 'number');
  });
  test('a scheduled flight has times but no actuals and no position', () => {
    const c = normalizeFlightStats(fixture('flightstats-scheduled'));
    assert.equal(c.status, 'scheduled');
    assert.equal(c.departure.scheduledLocal, '2026-10-24T07:05');
    assert.equal(c.departure.actualLocal, null);
    assert.equal(c.live, null);
    assert.equal(c.durationMinutes, 270);
  });
  test('an airborne flight is active with altitude, speed and heading', () => {
    const c = normalizeFlightStats(fixture('flightstats-airborne'));
    assert.equal(c.status, 'active');
    assert.ok(c.live.altitudeFt > 0 && c.live.speedKn > 0 && c.live.heading >= 0 && c.live.heading < 360);
  });
  test('an empty answer is no flight', () => {
    assert.equal(normalizeFlightStats({ data: {} }), null);
    assert.equal(normalizeFlightStats(null), null);
  });
});

describe('resolveFlight', () => {
  beforeEach(() => { clearUpstreamCache(); resetBreakers(); });

  test('rejects a bad number or date without calling anything', async () => {
    const f = router({});
    assert.equal((await resolveFlight('hello', '2026-10-24', { fetchImpl: f, now: NOW })).error, 'invalid_flight');
    assert.equal((await resolveFlight('ME215', '24/10/2026', { fetchImpl: f, now: NOW })).error, 'invalid_date');
    assert.equal(f.calls.length, 0);
  });

  test('finds a flight in FlightStats with its schedule', async () => {
    const f = router({ 'flightstats.com': json(fixture('flightstats-scheduled')) });
    const r = await resolveFlight('ME215', '2026-10-24', { fetchImpl: f, now: NOW });
    assert.equal(r.candidates.length, 1);
    assert.equal(r.candidates[0].source, 'flightstats');
    assert.equal(r.candidates[0].confidence, 'schedule');
    assert.match(f.calls[0], /flight-tracker\/ME\/215\/2026\/10\/24$/);
    assert.deepEqual(r.attempts.map((a) => [a.source, a.state]), [['flightstats', 'found']]);
  });

  test('a callsign-style number is looked up under its IATA code', async () => {
    const f = router({ 'flightstats.com': json(fixture('flightstats-scheduled')) });
    await resolveFlight('MEA215', '2026-10-24', { fetchImpl: f, now: NOW });
    assert.match(f.calls[0], /flight-tracker\/ME\/215\//);
  });

  test('a date far outside FlightStats range is not sent there, and falls back to the route', async () => {
    const f = router({
      'api.adsbdb.com': json({ response: { flightroute: { callsign_iata: 'ME215', airline: { name: 'Middle East Airlines', iata: 'ME', icao: 'MEA' }, origin: { iata_code: 'BEY', name: 'Beirut', municipality: 'Beirut' }, destination: { iata_code: 'BRU', name: 'Brussels', municipality: 'Brussels' } } } }),
    });
    const r = await resolveFlight('ME215', '2027-03-01', { fetchImpl: f, now: NOW });
    assert.ok(!f.calls.some((u) => u.includes('flightstats')));
    assert.equal(r.candidates.length, 1);
    assert.equal(r.candidates[0].confidence, 'route-only');
    assert.equal(r.candidates[0].departure.iata, 'BEY');
    assert.equal(r.candidates[0].departure.scheduledLocal, null);
    assert.equal(r.attempts.find((a) => a.source === 'flightstats').state, 'skipped');
  });

  test('AeroDataBox answers a far date when its key is set', async () => {
    const adb = [{ number: 'ME 215', status: 'Expected', departure: { airport: { iata: 'BEY', name: 'Beirut', municipalityName: 'Beirut', timeZone: 'Asia/Beirut' }, scheduledTime: { utc: '2027-03-01 04:05Z', local: '2027-03-01 07:05+03:00' }, terminal: '1' }, arrival: { airport: { iata: 'BRU', name: 'Brussels', municipalityName: 'Brussels', timeZone: 'Europe/Brussels' }, scheduledTime: { utc: '2027-03-01 08:35Z', local: '2027-03-01 09:35+01:00' } }, aircraft: { model: 'Airbus A320' }, airline: { name: 'Middle East Airlines', iata: 'ME', icao: 'MEA' }, codeShareStatus: 'IsOperator' }];
    const f = router({ 'aerodatabox': json(adb) });
    const r = await resolveFlight('ME215', '2027-03-01', { fetchImpl: f, now: NOW, aerodatabox: { key: 'k', baseUrl: 'https://aerodatabox.p.rapidapi.com', authHeader: 'x-rapidapi-key', host: 'aerodatabox.p.rapidapi.com' } });
    assert.equal(r.candidates.length, 1);
    assert.equal(r.candidates[0].source, 'aerodatabox');
    assert.equal(r.candidates[0].departure.scheduledLocal, '2027-03-01T07:05');
    assert.equal(r.candidates[0].durationMinutes, 270);
  });

  test('two sources for the same leg are merged: the better answer wins and gaps are filled', async () => {
    const adb = [{ number: 'ME 215', status: 'Expected', departure: { airport: { iata: 'BEY' }, scheduledTime: { utc: '2026-10-24 04:05Z', local: '2026-10-24 07:05+03:00' }, gate: 'B7' }, arrival: { airport: { iata: 'BRU' }, scheduledTime: { utc: '2026-10-24 08:35Z', local: '2026-10-24 10:35+02:00' } }, codeShareStatus: 'IsOperator' }];
    const f = router({ 'flightstats.com': json(fixture('flightstats-scheduled')), aerodatabox: json(adb) });
    const r = await resolveFlight('ME215', '2026-10-24', { fetchImpl: f, now: NOW, aerodatabox: { key: 'k', baseUrl: 'https://aerodatabox.p.rapidapi.com', authHeader: 'x-rapidapi-key' } });
    assert.equal(r.candidates.length, 1);
    assert.equal(r.candidates[0].source, 'flightstats');
    assert.equal(r.candidates[0].departure.gate, 'B7');
    assert.deepEqual(r.candidates[0].alsoFrom, ['AeroDataBox']);
  });

  test('a flight number that does not exist answers with nothing, not an error', async () => {
    const f = router({ 'flightstats.com': json({ data: {} }), 'api.adsbdb.com': json({ response: 'unknown callsign' }, 404) });
    const r = await resolveFlight('ZZ1', '2026-10-22', { fetchImpl: f, now: NOW });
    assert.equal(r.ok, true);
    assert.equal(r.candidates.length, 0);
  });

  test('a source that errors does not stop the others, and the attempt says why', async () => {
    const f = router({ 'flightstats.com': json({}, 403), 'api.adsbdb.com': json({ response: { flightroute: { callsign_iata: 'ME215', airline: { name: 'MEA', iata: 'ME', icao: 'MEA' }, origin: { iata_code: 'BEY' }, destination: { iata_code: 'BRU' } } } }) });
    const r = await resolveFlight('ME215', '2026-10-22', { fetchImpl: f, now: NOW });
    assert.equal(r.candidates[0].source, 'adsbdb');
    const fs = r.attempts.find((a) => a.source === 'flightstats');
    assert.equal(fs.state, 'error');
  });

  test('a source that keeps failing is skipped for a while (circuit breaker)', async () => {
    const f = router({ 'flightstats.com': json({}, 403), 'api.adsbdb.com': json({}, 404) });
    for (let i = 0; i < BREAKER_FAILURES; i++) { clearUpstreamCache(); await resolveFlight('ME215', '2026-10-22', { fetchImpl: f, now: NOW }); }
    const before = f.calls.filter((u) => u.includes('flightstats')).length;
    clearUpstreamCache();
    const r = await resolveFlight('ME215', '2026-10-22', { fetchImpl: f, now: NOW });
    assert.equal(f.calls.filter((u) => u.includes('flightstats')).length, before, 'no further calls once open');
    assert.equal(r.attempts.find((a) => a.source === 'flightstats').state, 'skipped');
  });

  test('FlightStats can be turned off', async () => {
    const f = router({ 'api.adsbdb.com': json({}, 404) });
    await resolveFlight('ME215', '2026-10-22', { fetchImpl: f, now: NOW, flightstats: false });
    assert.ok(!f.calls.some((u) => u.includes('flightstats')));
  });
});
