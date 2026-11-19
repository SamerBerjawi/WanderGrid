import { beforeEach } from 'vitest';
import fixture from '../fixtures/airports.json';
import { __setAirportIndexForTest, type AirportRef } from '../../services/airportIndex';
import { __setCarrierIndexForTest } from '../../services/carrierIndex';

// The app loads the airport and airline tables from the server when its modules load; unit tests stay offline.
globalThis.fetch = (async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => '' })) as unknown as typeof fetch;

// The live airport table (GET /api/airports/index) as a fixture: the airports these tests use, generated from the
// same join the server runs (backend_files/airportData.js downloadAirportRows). Rows follow the index format
// [iata, icao, name, city, lat, lng, countryCode, country, timezone, kind].
export const FIXTURE_AIRPORTS: AirportRef[] = (fixture.rows as Array<[string, string, string, string, number, number, string, string, string, string]>).map(r => ({
    iata: r[0], icao: r[1], name: r[2], city: r[3], lat: r[4], lng: r[5], countryCode: r[6], country: r[7], tz: r[8], kind: r[9],
}));

__setAirportIndexForTest(FIXTURE_AIRPORTS);
beforeEach(() => __setAirportIndexForTest(FIXTURE_AIRPORTS));

// The carrier table starts empty in each test (tests/unit/carrierIndex.test.ts fills it).
beforeEach(() => __setCarrierIndexForTest(null));
