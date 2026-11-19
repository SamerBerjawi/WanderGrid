// Live airline reference data: parsing and joining IATA's register with OpenFlights (carrierData.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    parseCarrierNames, parseOpenFlightsAirlines, buildCarrierRows, indexRows, recordFromRow, formatAirlineName, sameAirline, COLUMNS,
} = require('../carrierData');

const REGISTER = [
    { company_name: 'Accounting Centre Of China Aviation', country_or_territory: 'China', iata: '' },
    { company_name: 'KM Malta Airlines Limited', country_or_territory: 'Malta', iata: 'KM' },
    { company_name: 'Astra Airways Limited', country_or_territory: 'Bangladesh', iata: '2A' },
    { company_name: 'Astra Airways Limited dba Air Astra', country_or_territory: 'Bangladesh', iata: '2A' },
    { company_name: 'Norwegian Air Sweden AOC AB', country_or_territory: 'Sweden', iata: 'D8' },
    { company_name: 'SWISS International Air Lines Ltd dba SWISS', country_or_territory: 'Switzerland', iata: 'LX' },
    { company_name: 'Iberia Lineas Aereas de Espana S.A. Operadora', country_or_territory: 'Spain', iata: 'IB' },
].map((r) => JSON.stringify(r)).join('\n') + '\nnot json\n';

const OPENFLIGHTS = [
    '-1,"Unknown",\\N,"-","N/A",\\N,\\N,"Y"',
    '100,"KM Malta Airlines",\\N,"KM","KMM","KOMALTA","Malta","Y"',
    '2021,"Deutsche Bahn",\\N,"2A","","","Germany","Y"',
    '2041,"Djibouti Airlines",\\N,"D8","DJB","DJIBOUTI AIR","Djibouti","Y"',
    '200,"Swiss International Air Lines",\\N,"LX","SWR","SWISS","Switzerland","Y"',
    '201,"Crossair",\\N,"LX","CRX","CROSSAIR","Switzerland","N"',
    '300,"Iberia Airlines",\\N,"IB","IBE","IBERIA","Spain","Y"',
    '3638,"Neos",\\N,"NO","NOS","MOONFLOWER","Italy","N"',
    '18727,"North Pacific Airlines","","NO",\\N,"","United States","N"',
    '400,"No Code Airline",\\N,"ZZ","","","Nowhere","Y"',
].join('\n');

const rowsByCode = () => {
    const { items } = parseCarrierNames(REGISTER);
    return new Map(buildCarrierRows(items, parseOpenFlightsAirlines(OPENFLIGHTS)).map((r) => [r[0], r]));
};

test('register parser skips lines without a code or JSON', () => {
    const { items, skipped } = parseCarrierNames(REGISTER);
    assert.equal(items.length, 6);
    assert.equal(skipped, 2);
});

test('legal names become commercial names', () => {
    assert.equal(formatAirlineName('Delta Air Lines, Inc.', 'DL'), 'Delta Air Lines');
    assert.equal(formatAirlineName('Astra Airways Limited dba Air Astra', '2A'), 'Air Astra');
    assert.equal(formatAirlineName('Middle East Airlines AirLiban Dba MEA', 'ME'), 'Middle East Airlines');
    assert.equal(formatAirlineName('AVIANCA', 'AV'), 'Avianca');
});

test('names match on a distinctive word, not on "Air" or "Airlines"', () => {
    assert.ok(sameAirline('KM Malta Airlines Limited', 'KM Malta Airlines'));
    assert.ok(sameAirline('Iberia Lineas Aereas de Espana', 'Iberia Airlines'));
    assert.ok(!sameAirline('Astra Airways Limited', 'Deutsche Bahn'));
    assert.ok(!sameAirline('Norwegian Air Sweden AOC AB', 'Djibouti Airlines'));
});

test('join: IATA decides who holds a code, a matching OpenFlights row adds ICAO and the active flag', () => {
    const rows = rowsByCode();
    assert.deepEqual(rows.get('KM'), ['KM', 'KM Malta Airlines', 'Malta', 'KMM', true]);
    // The register's last entry is the current name; the stale OpenFlights holder (Deutsche Bahn) is ignored
    assert.deepEqual(rows.get('2A'), ['2A', 'Air Astra', 'Bangladesh', '', null]);
    // Curated brand name, and no ICAO code from the old Djibouti Airlines row
    assert.deepEqual(rows.get('D8'), ['D8', 'Norwegian Air', 'Sweden', '', null]);
    // The active matching row wins over a defunct one sharing the code
    assert.equal(rows.get('LX')[3], 'SWR');
    assert.equal(rows.get('LX')[1], 'SWISS');
    assert.equal(rows.get('IB')[1], 'Iberia');
});

test('join: codes only OpenFlights knows are kept when they have an ICAO code', () => {
    const rows = rowsByCode();
    assert.deepEqual(rows.get('NO'), ['NO', 'Neos', 'Italy', 'NOS', false]);
    assert.ok(!rows.has('ZZ'));
    assert.ok(!rows.has('-'));
    assert.ok([...rows.values()].every((r) => r.length === COLUMNS.length));
});

test('index rows are compact and sorted', () => {
    const { items } = parseCarrierNames(REGISTER);
    const out = indexRows(buildCarrierRows(items, parseOpenFlightsAirlines(OPENFLIGHTS)).map(recordFromRow));
    assert.deepEqual(out.map((r) => r[0]), ['2A', 'D8', 'IB', 'KM', 'LX', 'NO']);
    assert.deepEqual(out.find((r) => r[0] === 'KM'), ['KM', 'KMM', 'KM Malta Airlines', 'Malta', 1]);
    assert.equal(out.find((r) => r[0] === '2A')[4], null);
    assert.equal(out.find((r) => r[0] === 'NO')[4], 0);
});

test('without OpenFlights the register alone still builds the table', () => {
    const { items } = parseCarrierNames(REGISTER);
    const rows = buildCarrierRows(items, parseOpenFlightsAirlines(''));
    assert.equal(rows.length, 5);
    assert.ok(rows.every((r) => r[3] === '' && r[4] === null));
});
