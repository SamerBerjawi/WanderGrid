const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { clearUpstreamCache } = require('../upstream.js');
const { listHolidays, listCountries, fromNager, fromOpenHolidays } = require('../holidays.js');

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: new Headers({ 'content-type': 'application/json' }), text: async () => JSON.stringify(body) });
const route = table => async url => {
  const hit = Object.entries(table).find(([k]) => url.includes(k));
  if (!hit) throw new Error(`unexpected ${url}`);
  const v = hit[1];
  if (v instanceof Error) throw v;
  return typeof v === 'function' ? v(url) : json(v.status ?? 200, v.body);
};

describe('holiday calendars', () => {
  beforeEach(() => clearUpstreamCache());

  test('keeps only nationwide public holidays from Nager.Date', () => {
    const out = fromNager([
      { date: '2026-01-01', name: "New Year's Day", localName: 'Nieuwjaar', global: true, types: ['Public'] },
      { date: '2026-02-16', name: 'Carnival', localName: 'Carnaval', global: false, counties: ['NL-LI'], types: ['Public'] },
      { date: '2026-05-04', name: 'Remembrance', global: true, types: ['Observance'] },
      { date: '2025-12-31', name: 'Wrong year', global: true, types: ['Public'] },
    ], 2026, 'NL');
    assert.deepEqual(out.holidays.map(h => h.date), ['2026-01-01']);
    assert.equal(out.regionalSkipped, 1);
  });

  test('expands multi-day OpenHolidays entries and skips regional ones', () => {
    const out = fromOpenHolidays([
      { startDate: '2026-04-03', endDate: '2026-04-05', type: 'Public', nationwide: true, name: [{ language: 'DE', text: 'Ostern' }, { language: 'EN', text: 'Easter' }] },
      { startDate: '2026-06-04', endDate: '2026-06-04', type: 'Public', nationwide: false, name: [{ language: 'EN', text: 'Corpus Christi' }] },
    ], 2026);
    assert.deepEqual(out.holidays.map(h => h.date), ['2026-04-03', '2026-04-04', '2026-04-05']);
    assert.equal(out.holidays[0].name, 'Easter');
    assert.equal(out.regionalSkipped, 1);
  });

  test('answers from Nager.Date, sorted and de-duplicated', async () => {
    const fetchImpl = route({ 'nager.at': { body: [
      { date: '2026-12-25', name: 'Christmas Day', global: true, types: ['Public'] },
      { date: '2026-01-01', name: "New Year's Day", global: true, types: ['Public'] },
      { date: '2026-01-01', name: "New Year's Day", global: true, types: ['Public'] },
    ] } });
    const r = await listHolidays(2026, 'be', { fetchImpl });
    assert.equal(r.ok, true);
    assert.equal(r.source, 'nager');
    assert.equal(r.countryCode, 'BE');
    assert.deepEqual(r.holidays.map(h => h.date), ['2026-01-01', '2026-12-25']);
  });

  test('falls back to OpenHolidays when Nager.Date is down', async () => {
    const fetchImpl = route({
      'nager.at': { status: 503, body: {} },
      'openholidaysapi.org': { body: [{ startDate: '2026-01-01', endDate: '2026-01-01', type: 'Public', nationwide: true, name: [{ language: 'EN', text: 'New Year' }] }] },
    });
    const r = await listHolidays(2026, 'DE', { fetchImpl });
    assert.equal(r.ok, true);
    assert.equal(r.source, 'openholidays');
  });

  test('reports 502 when no provider can be reached and 404 when both know nothing', async () => {
    const down = await listHolidays(2026, 'FR', { fetchImpl: route({ 'nager.at': new Error('offline'), 'openholidaysapi.org': new Error('offline') }) });
    assert.equal(down.ok, false);
    assert.equal(down.status, 502);
    clearUpstreamCache();
    const none = await listHolidays(2026, 'ZZ', { fetchImpl: route({ 'nager.at': { status: 404, body: {} }, 'openholidaysapi.org': { body: [] } }) });
    assert.equal(none.status, 404);
  });

  test('rejects a bad year or country before any request', async () => {
    const fetchImpl = () => { throw new Error('should not fetch'); };
    assert.equal((await listHolidays(1800, 'BE', { fetchImpl })).status, 400);
    assert.equal((await listHolidays(2026, 'BEL', { fetchImpl })).status, 400);
    assert.equal((await listHolidays(2026, '../x', { fetchImpl })).status, 400);
  });

  test('lists countries sorted by name', async () => {
    const r = await listCountries({ fetchImpl: route({ 'nager.at': { body: [{ countryCode: 'NL', name: 'Netherlands' }, { countryCode: 'BE', name: 'Belgium' }] } }) });
    assert.deepEqual(r.countries.map(c => c.code), ['BE', 'NL']);
  });
});
