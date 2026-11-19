import { describe, expect, it, beforeEach } from 'vitest';
import { createRequire } from 'module';
import { __setCarrierIndexForTest, carrierIataForIcao, getCarrier, searchCarriers, type CarrierRef } from '../../services/carrierIndex';
import { formatCommercialAirlineName, getCarrierName, getCarriersByQueryLocally } from '../../utils/flightData';

const { formatAirlineName, BRAND_NAMES } = createRequire(import.meta.url)('../../backend_files/carrierData.js');

const CARRIERS: CarrierRef[] = [
    { iata: 'KM', icao: 'KMM', name: 'KM Malta Airlines', country: 'Malta', active: true },
    { iata: 'ME', icao: 'MEA', name: 'Middle East Airlines', country: 'Lebanon', active: true },
    { iata: 'LX', icao: 'SWR', name: 'SWISS', country: 'Switzerland', active: true },
    { iata: 'MA', icao: 'MAH', name: 'Malev Hungarian Airlines', country: 'Hungary', active: false },
    { iata: '2A', icao: '', name: 'Air Astra', country: 'Bangladesh' },
];

describe('carrier index', () => {
    beforeEach(() => __setCarrierIndexForTest(CARRIERS));

    it('looks airlines up by IATA and ICAO code', () => {
        expect(getCarrier('km')?.name).toBe('KM Malta Airlines');
        expect(getCarrier('KMM')).toBeUndefined();
        expect(carrierIataForIcao('swr')).toBe('LX');
        expect(carrierIataForIcao('XXX')).toBeUndefined();
    });

    it('getCarrierName reads the table', () => {
        expect(getCarrierName('ME')).toBe('Middle East Airlines');
        expect(getCarrierName('lx')).toBe('SWISS');
    });

    it('search puts exact codes first and airlines still flying before defunct ones', () => {
        expect(searchCarriers('ma').map(c => c.iata)).toEqual(['MA', 'KM']);
        expect(searchCarriers('airlines').map(c => c.iata)).toEqual(['KM', 'ME', 'MA']);
        expect(searchCarriers('mea')[0].iata).toBe('ME');
        const local = getCarriersByQueryLocally('swiss');
        expect(local[0]).toMatchObject({ iata: 'LX', code: 'LX', company_name: 'SWISS', name: 'SWISS' });
    });

    it('an empty table returns nothing rather than guessing', () => {
        __setCarrierIndexForTest(null);
        expect(getCarrier('KM')).toBeUndefined();
        expect(searchCarriers('malta')).toEqual([]);
    });
});

describe('airline name cleaning', () => {
    // The server cleans names for the table (carrierData.js); the browser still cleans names from per-code lookups.
    it('server and browser clean names the same way', () => {
        for (const [raw, code] of [
            ['Delta Air Lines, Inc.', 'DL'], ['Astra Airways Limited dba Air Astra', '2A'], ['Middle East Airlines AirLiban Dba MEA', 'ME'],
            ['BA Euroflyer Limited dba British Airways', 'BA'], ['Star Up S.A. dba Star Peru', '2I'], ['AVIANCA', 'AV'],
            ['Air Malta (Malta) Ltd', 'KM'], ['Eastern Airlines, LLC', '2D'], ['Lufthansa AG', 'LH'],
        ]) {
            expect(formatAirlineName(raw, code)).toBe(formatCommercialAirlineName(raw, code));
        }
    });

    it('keeps the brand names the app has always shown for the busiest airlines', () => {
        expect(Object.keys(BRAND_NAMES)).toHaveLength(50);
        expect(BRAND_NAMES).toMatchObject({ LX: 'SWISS', SV: 'Saudia', AZ: 'ITA Airways', KL: 'KLM Royal Dutch Airlines', '6E': 'IndiGo' });
    });
});
