// Live airport reference data: parsing and joining the public datasets (airportData.js) and the
// post-refresh repair of saved flights (airportRepair.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv, parseOurAirports, parseTimezones, parseNames, buildAirportRows, countryOf, COLUMNS } = require('../airportData');
const { repairFlightLeg } = require('../airportRepair');

const OA_CSV = [
    '"id","ident","type","name","latitude_deg","longitude_deg","elevation_ft","continent","iso_country","iso_region","municipality","scheduled_service","icao_code","iata_code","gps_code","local_code","home_link","wikipedia_link","keywords"',
    '4427,"LMML","large_airport","Malta International Airport",35.845932,14.491546,300,"EU","MT","MT-25","Valletta","yes","LMML","MLA","LMML",,,,"Luqa Airport, Valletta"',
    '42864,"AR-0442","small_airport","Malabrigo Airport",-29.35,-59.9667,177,"SA","AR","AR-S","Malabrigo","no",,,,"MLA",,,',
    '30145,"LKMB","small_airport","Mladá Boleslav Airfield",50.3983,14.8983,781,"EU","CZ","CZ-ST","Mladá Boleslav","no","LKMB",,"LKMB",,,,',
    '1,"EGPH","large_airport","Edinburgh Airport",55.950145,-3.372288,135,"EU","GB","GB-SCT","Edinburgh","yes","EGPH","EDI","EGPH",,,,',
    '2,"XXXX","closed","Old Field",10,10,0,"EU","FR","FR-X","Nowhere","no","","OLD","",,,,',
    '3,"ZZZZ","small_airport","Only In OurAirports",1.5,2.5,0,"AF","TN","TN-1","Somewhere","yes","ZZZZ","ZZZ","",,,,',
].join('\n');

test('CSV parser handles quoted commas, doubled quotes and CRLF', () => {
    assert.deepEqual(parseCsv('a,"b, c","d ""q"""\r\n1,2,3'), [['a', 'b, c', 'd "q"'], ['1', '2', '3']]);
});

test('OurAirports: only real IATA codes, the scheduled airport wins, closed fields are dropped', () => {
    const oa = parseOurAirports(OA_CSV);
    assert.equal(oa.get('MLA').icao, 'LMML', 'a local code "MLA" in Argentina never shadows Malta');
    assert.ok(Math.abs(oa.get('MLA').lat - 35.85) < 0.01);
    assert.ok(!oa.has('OLD'));
    assert.ok(![...oa.values()].some((a) => a.icao === 'LKMB'), 'Mladá Boleslav has no IATA code');
});

test('UK airports carry their nation, other countries an English name', () => {
    assert.deepEqual(countryOf('GB', 'GB-SCT'), { country_code: 'GB-SCT', country: 'Scotland' });
    assert.deepEqual(countryOf('MT', 'MT-25'), { country_code: 'MT', country: 'Malta' });
});

test('join keeps every names row, adds position/country/timezone and OurAirports-only codes', () => {
    const { items } = parseNames([
        JSON.stringify({ iata: 'MLA', city_name: 'Malta', airport_name: 'Luqa International' }),
        JSON.stringify({ iata: 'EDI', city_name: 'Edinburgh', airport_name: 'Edinburgh Airport' }),
        JSON.stringify({ iata: 'LON', city_name: 'London', airport_name: 'Metropolitan Area' }),
    ].join('\n'));
    const tz = parseTimezones(JSON.stringify({ LMML: { icao: 'LMML', iata: 'MLA', tz: 'Europe/Malta' }, EGPH: { icao: 'EGPH', iata: 'EDI', tz: 'Europe/London' } }));
    const rows = buildAirportRows(items, parseOurAirports(OA_CSV), tz).map((r) => Object.fromEntries(COLUMNS.map((c, i) => [c, r[i]])));
    const mla = rows.find((r) => r.iata === 'MLA');
    assert.equal(mla.airport_name, 'Luqa International', 'the names the app always showed are kept');
    assert.equal(mla.timezone, 'Europe/Malta');
    assert.equal(mla.country_code, 'MT');
    assert.equal(rows.find((r) => r.iata === 'EDI').country_code, 'GB-SCT');
    assert.equal(rows.find((r) => r.iata === 'LON').latitude, null, 'city codes have no single position');
    assert.equal(rows.find((r) => r.iata === 'ZZZ').airport_name, 'Only In OurAirports');
});

test('unparsable enrichment sources yield nothing rather than throwing', () => {
    assert.equal(parseOurAirports('{"iata":"MLA"}\n').size, 0);
    assert.equal(parseTimezones('not json').byIcao.size, 0);
});

test('repair fixes missing and clearly wrong airport positions, keeps close ones and non-flights', () => {
    const ref = { MLA: { lat: 35.8459, lng: 14.4915 }, TUN: { lat: 36.851, lng: 10.2272 } };
    const lookup = (c) => ref[c] || null;
    const wrong = repairFlightLeg({ mode: 'Flight', origin: 'TUN', destination: 'MLA', destLat: 50.3983, destLng: 14.8983, destGeoKey: 'MLA' }, lookup);
    assert.equal(wrong.changed, true);
    assert.equal(wrong.leg.destLat, 35.8459);
    assert.equal(wrong.leg.originLat, 36.851, 'a missing position is filled in');
    const close = { mode: 'Flight', origin: 'MLA', destination: 'TUN', originLat: 35.857, originLng: 14.4775, destLat: 36.85, destLng: 10.22 };
    assert.equal(repairFlightLeg(close, lookup).changed, false, 'positions within 100 km are left as they are');
    assert.equal(repairFlightLeg({ mode: 'Car', origin: 'MLA', destination: 'TUN' }, lookup).changed, false);
});
