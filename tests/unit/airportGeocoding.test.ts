import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    __setPhysicalRunwaysForTest,
    type PhysicalRunway,
} from '../../services/airportRunwayDataset';
import {
    __resetPlaceSearchCacheForTest,
    lookupPlaceByLabel,
    profileQuery,
    rememberPlaces,
    resolveAirportByIata,
    scorePlace,
    type Place,
} from '../../services/placeSearch';
import {
    __resetGeocodingCacheForTest,
    getCoordinates,
    getCoordinatesSync,
} from '../../services/geocoding';
import { journeyEnds, journeyKm } from '../../utils/journeysModel';
import { __setAirportIndexForTest } from '../../services/airportIndex';
import { buildMapModel } from '../../components/new/map/mapModel';
import { flight, tripOf } from './helpers';

const RUNWAY_FIXTURES: Record<string, PhysicalRunway[]> = {
    MLA: [{ id: '05-23', leIdent: '05', heIdent: '23', start: [14.4601, 35.8475], end: [14.4815, 35.859901], lengthMeters: 2373, widthMeters: 45 }],
    ALC: [{ id: '10-28', leIdent: '10', heIdent: '28', start: [-0.574997, 38.2845], end: [-0.541317, 38.2798], lengthMeters: 3000, widthMeters: 45 }],
    MUC: [{ id: '08L-26R', leIdent: '08L', heIdent: '26R', start: [11.7676, 48.362801], end: [11.8212, 48.366901], lengthMeters: 4000, widthMeters: 60 }],
    GVA: [{ id: '04-22', leIdent: '04', heIdent: '22', start: [6.09092, 46.2258], end: [6.12699, 46.250401], lengthMeters: 3900, widthMeters: 50 }],
    AMS: [{ id: '04-22', leIdent: '04', heIdent: '22', start: [4.78348, 52.3004], end: [4.80302, 52.313999], lengthMeters: 2020, widthMeters: 45 }],
    ULM: [{ id: '04-22', leIdent: '04', heIdent: '22', start: [-94.505798, 44.317501], end: [-94.497498, 44.322498], lengthMeters: 755, widthMeters: 49 }],
};

const mkPlace = (extra: Partial<Place>): Place => ({
    id: 'x',
    label: 'Place',
    name: 'Place',
    subtitle: '',
    kind: 'airport',
    lat: 0,
    lng: 0,
    country: '',
    countryCode: '',
    provider: 'photon',
    score: 0,
    ...extra,
});

const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

describe('airport IATA geocoding and ranking', () => {
    beforeEach(() => {
        localStorage.clear();
        __setPhysicalRunwaysForTest(RUNWAY_FIXTURES);
        __resetPlaceSearchCacheForTest();
        __resetGeocodingCacheForTest();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        __setPhysicalRunwaysForTest(null);
        __resetPlaceSearchCacheForTest();
        __resetGeocodingCacheForTest();
    });

    it('ranks verified IATA airports above Photon prefix-matched airfields (MLA, MUC, GVA, ALC)', () => {
        const mlaAirport = mkPlace({
            label: 'MLA - Luqa International, Malta',
            name: 'Luqa International',
            subtitle: 'Malta',
            country: 'Malta',
            countryCode: 'MT',
            lat: 35.8537,
            lng: 14.4708,
            iata: 'MLA',
            provider: 'airport-db',
        });
        const mladaBoleslav = mkPlace({
            label: 'Mladá Boleslav, Czechia',
            name: 'Mladá Boleslav',
            subtitle: 'Mladá Boleslav, Czechia',
            country: 'Czechia',
            countryCode: 'CZ',
            lat: 50.3981,
            lng: 14.8949,
        });

        for (const query of ['MLA', 'MLA airport', 'MLA - Luqa International']) {
            const mode = query === 'MLA airport' ? 'airport' : 'auto';
            const q = profileQuery(query, mode);
            expect(scorePlace(mlaAirport, q)).toBeGreaterThan(scorePlace(mladaBoleslav, q));
        }

        const muc = mkPlace({ label: 'MUC - Munich Airport, Munich, Germany', name: 'Munich Airport', iata: 'MUC', provider: 'local' });
        const mucuri = mkPlace({ label: 'Mucuri Airport, Brazil', name: 'Mucuri Airport' });
        expect(scorePlace(muc, profileQuery('MUC airport', 'airport'))).toBeGreaterThan(scorePlace(mucuri, profileQuery('MUC airport', 'airport')));

        const gva = mkPlace({ label: 'GVA - Geneva Airport, Geneva, Switzerland', name: 'Geneva Airport', iata: 'GVA', provider: 'local' });
        const gvardeyskoye = mkPlace({ label: 'Gvardeyskoye air base, Ukraine', name: 'Gvardeyskoye air base' });
        expect(scorePlace(gva, profileQuery('GVA airport', 'airport'))).toBeGreaterThan(scorePlace(gvardeyskoye, profileQuery('GVA airport', 'airport')));

        const alc = mkPlace({ label: 'ALC - Alicante Airport, Alicante, Spain', name: 'Alicante Airport', iata: 'ALC', provider: 'airport-db' });
        const alcantari = mkPlace({ label: 'Alcantarí International Airport, Bolivia', name: 'Alcantarí International Airport' });
        expect(scorePlace(alc, profileQuery('ALC airport', 'airport'))).toBeGreaterThan(scorePlace(alcantari, profileQuery('ALC airport', 'airport')));
    });

    it('preserves 3-letter city names under lowercase auto search while matching uppercase or airport-mode IATA codes', () => {
        const ulmCity = mkPlace({
            kind: 'city',
            label: 'Ulm, Germany',
            name: 'Ulm',
            subtitle: 'Baden-Württemberg, Germany',
            country: 'Germany',
            countryCode: 'DE',
            population: 126790,
            provider: 'open-meteo',
            lat: 48.3984,
            lng: 9.9916,
        });
        const ulmAirport = mkPlace({
            kind: 'airport',
            label: 'ULM - New Ulm Municipal Airport, New Ulm, United States',
            name: 'New Ulm Municipal Airport',
            subtitle: 'New Ulm, United States',
            country: 'United States',
            countryCode: 'US',
            iata: 'ULM',
            provider: 'airport-db',
            lat: 44.32,
            lng: -94.5016,
        });

        expect(scorePlace(ulmCity, profileQuery('ulm', 'auto'))).toBeGreaterThan(scorePlace(ulmAirport, profileQuery('ulm', 'auto')));
        expect(scorePlace(ulmAirport, profileQuery('ULM', 'auto'))).toBeGreaterThan(scorePlace(ulmCity, profileQuery('ULM', 'auto')));
        expect(scorePlace(ulmAirport, profileQuery('ulm', 'airport'))).toBeGreaterThan(scorePlace(ulmCity, profileQuery('ulm', 'airport')));
    });

    it('resolves codes from the live airport table synchronously without runways and guards Title-Case cities in getCoordinatesSync', () => {
        __setPhysicalRunwaysForTest(null);
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const muc = getCoordinatesSync('MUC');
        expect(muc).toBeDefined();
        expect(muc!.lat).toBeCloseTo(48.3538, 2);
        expect(muc!.lng).toBeCloseTo(11.7861, 2);
        expect(muc!.countryCode).toBe('DE');

        const gva = getCoordinatesSync('GVA');
        expect(gva).toBeDefined();
        expect(gva!.lat).toBeCloseTo(46.238, 2);
        expect(gva!.lng).toBeCloseTo(6.109, 2);
        expect(gva!.countryCode).toBe('CH');
        expect(fetchMock).not.toHaveBeenCalled();

        __setPhysicalRunwaysForTest(RUNWAY_FIXTURES);
        const mla = getCoordinatesSync('MLA');
        expect(mla).toBeDefined();
        expect(mla!.lat).toBeCloseTo(35.8459, 3); // Malta International (LMML), from the airport table
        expect(mla!.lng).toBeCloseTo(14.4915, 3);
        expect(mla!.countryCode).toBe('MT');

        // Title-Case city "Ulm" must not snap to New Ulm Municipal Airport
        expect(getCoordinatesSync('Ulm')).toBeUndefined();
    });

    it('resolves MLA to Malta International Airport even when Photon returns Mladá Boleslav', async () => {
        __setAirportIndexForTest([]); // the fallback chain, as before the airport table has loaded
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes('/api/airports/lookup/MLA')) {
                return jsonResponse({
                    iata: 'MLA',
                    city_name: 'Malta',
                    airport_name: 'Luqa International',
                    latitude: 35.8537005,
                    longitude: 14.4708,
                });
            }
            if (url.includes('provider=open-meteo') || url.includes('geocoding-api.open-meteo.com')) {
                return jsonResponse({
                    results: [
                        { name: 'Malta', latitude: 48.36, longitude: -107.87, country: 'United States', country_code: 'US', timezone: 'America/Denver' },
                        { name: 'Malta', latitude: 35.9167, longitude: 14.4333, country: 'Malta', country_code: 'MT', timezone: 'Europe/Malta' },
                    ],
                });
            }
            if (url.includes('photon')) {
                return jsonResponse({
                    results: [
                        { name: 'Mladá Boleslav', latitude: 50.3981, longitude: 14.8949, country: 'Czechia', country_code: 'CZ', osm_key: 'aeroway', osm_value: 'aerodrome', provider: 'photon' },
                    ],
                    features: [
                        { properties: { name: 'Mladá Boleslav', country: 'Czechia', countrycode: 'CZ', osm_key: 'aeroway', osm_value: 'aerodrome' }, geometry: { coordinates: [14.8949, 50.3981] } },
                    ],
                });
            }
            return jsonResponse({ results: [] });
        });
        vi.stubGlobal('fetch', fetchMock);

        const place = await resolveAirportByIata('MLA');
        expect(place).toBeDefined();
        expect(place!.iata).toBe('MLA');
        expect(place!.lat).toBeCloseTo(35.8537, 3);
        expect(place!.lng).toBeCloseTo(14.4708, 3);
        expect(place!.country).toBe('Malta');
        expect(place!.countryCode).toBe('MT');
        expect(place!.tz).toBe('Europe/Malta');

        __setPhysicalRunwaysForTest(null);
        __resetGeocodingCacheForTest();
        __resetPlaceSearchCacheForTest();
        const coords = await getCoordinates('MLA');
        expect(coords).toBeDefined();
        expect(coords!.lat).toBeCloseTo(35.8537, 3);
        expect(coords!.lng).toBeCloseTo(14.4708, 3);
        expect(coords!.countryCode).toBe('MT');
        // Never Mladá Boleslav (~50.40, 14.89)
        expect(coords!.lat).toBeLessThan(40);
    });

    it('resolves MLA offline from physical runways when backend and Open-Meteo fail', async () => {
        __setAirportIndexForTest([]); // the fallback chain, as before the airport table has loaded
        const fetchMock = vi.fn(async () => new Response('Server Error', { status: 500 }));
        vi.stubGlobal('fetch', fetchMock);

        const place = await resolveAirportByIata('MLA');
        expect(place).toBeDefined();
        expect(place!.lat).toBeCloseTo(35.8537, 3);
        expect(place!.lng).toBeCloseTo(14.4708, 3);
        expect(lookupPlaceByLabel('MLA')?.lat).toBeCloseTo(35.8537, 3);
    });

    it('resolves non-runway airports like DUR using airport name + city instead of bare IATA code', async () => {
        __setAirportIndexForTest([]); // the fallback chain, as before the airport table has loaded
        const seenUrls: string[] = [];
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            seenUrls.push(url);
            if (url.includes('/api/airports/lookup/DUR')) {
                return jsonResponse({
                    iata: 'DUR',
                    city_name: 'Durban',
                    airport_name: 'King Shaka Intl',
                });
            }
            if (url.includes('/api/airports/search')) {
                return jsonResponse([]);
            }
            if (url.includes('provider=photon') && url.includes('King%20Shaka%20Intl%20Durban')) {
                return jsonResponse({
                    results: [
                        {
                            name: 'King Shaka International Airport',
                            latitude: -29.6144,
                            longitude: 31.1197,
                            country: 'South Africa',
                            country_code: 'ZA',
                            osm_key: 'aeroway',
                            osm_value: 'aerodrome',
                            provider: 'photon',
                        },
                    ],
                });
            }
            return jsonResponse({ results: [] });
        });
        vi.stubGlobal('fetch', fetchMock);

        const place = await resolveAirportByIata('DUR');
        expect(place).toBeDefined();
        expect(place!.iata).toBe('DUR');
        expect(place!.lat).toBeCloseTo(-29.6144, 3);
        expect(place!.lng).toBeCloseTo(31.1197, 3);
        expect(place!.countryCode).toBe('ZA');
        expect(seenUrls.some(u => u.includes('provider=photon') && /q=dur(&|$)/i.test(u))).toBe(false);
    });

    it('remembers iata:XXX entries in lookupPlaceByLabel', () => {
        const mla = mkPlace({
            label: 'MLA - Luqa International, Malta',
            name: 'Luqa International',
            country: 'Malta',
            countryCode: 'MT',
            lat: 35.8537,
            lng: 14.4708,
            iata: 'MLA',
            provider: 'airport-db',
        });
        rememberPlaces([mla]);
        expect(lookupPlaceByLabel('MLA')?.lat).toBeCloseTo(35.8537, 3);
        expect(lookupPlaceByLabel('MLA - Luqa International, Malta')?.lng).toBeCloseTo(14.4708, 3);
    });

    it('self-heals stored Mladá Boleslav coordinates on MLA legs in journeysModel and buildMapModel', () => {
        __setAirportIndexForTest([]); // the fallback chain, as before the airport table has loaded
        const corruptedFlight = flight('f-mla', 'AMS', 'MLA', '2026-06-01', '09:00', '2026-06-01', '12:00', {
            originLat: 52.3086,
            originLng: 4.7639,
            destLat: 50.3981403,
            destLng: 14.8948651,
        });

        const ends = journeyEnds(corruptedFlight);
        expect(ends).toBeDefined();
        expect(ends!.to[1]).toBeCloseTo(35.8537, 3);
        expect(ends!.to[0]).toBeCloseTo(14.4708, 3);
        // AMS -> MLA is ~1980 km (AMS -> Mladá Boleslav is ~715 km)
        expect(journeyKm(corruptedFlight)).toBeGreaterThan(1800);

        const trip = tripOf('t-mla', 'Malta');
        trip.transports = [corruptedFlight];
        const model = buildMapModel([trip], { mode: 'all', groupAirports: false });
        expect(model.routes).toHaveLength(1);
        expect(model.routes[0].to[1]).toBeCloseTo(35.8537, 3);
        expect(model.routes[0].to[0]).toBeCloseTo(14.4708, 3);
    });
});
