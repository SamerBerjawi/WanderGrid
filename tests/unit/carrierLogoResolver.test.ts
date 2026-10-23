import { describe, expect, it } from 'vitest';
import type { Carrier } from '../../types';
import { findCarrier, identifierPrefix, resolveCarrierLogo } from '../../utils/carrierLogoResolver';
import { carrierLogoSources } from '../../utils/carrierLogo';

const carriers: Carrier[] = [
    { id: '1', name: 'KLM', code: 'KL', domain: 'klm.com' },
    { id: '2', name: 'Delta Air Lines', code: 'DL', domain: 'delta.com' },
    { id: '3', name: 'Middle East Airlines', code: 'ME', domain: 'mea.com.lb' },
    { id: '4', name: 'Lufthansa', code: 'DLH', domain: 'lufthansa.com' },
];

describe('findCarrier', () => {
    it('matches the IATA code in the provider field', () => {
        expect(findCarrier({ provider: 'kl' }, carriers)?.id).toBe('1');
    });
    it('matches the ICAO code', () => {
        expect(findCarrier({ provider: 'DLH' }, carriers)?.id).toBe('4');
    });
    it('matches a name ignoring case, spacing and punctuation', () => {
        expect(findCarrier({ provider: 'delta air-lines' }, carriers)?.id).toBe('2');
        expect(findCarrier({ provider: 'Middle East Airlines' }, carriers)?.id).toBe('3');
    });
    it('finds "KLM" for "KLM Royal Dutch Airlines" and "Delta" for "Delta Airlines"', () => {
        expect(findCarrier({ provider: 'KLM Royal Dutch Airlines' }, carriers)?.id).toBe('1');
        expect(findCarrier({ provider: 'Delta Airlines' }, carriers)?.id).toBe('2');
    });
    it('does not match a different airline that shares a generic word', () => {
        expect(findCarrier({ provider: 'Air France' }, carriers)).toBeUndefined();
        expect(findCarrier({ provider: 'Qatar Airways' }, carriers)).toBeUndefined();
    });
    it('uses the journey number prefix when the provider says nothing', () => {
        expect(findCarrier({ provider: '', identifier: 'KL1234' }, carriers)?.id).toBe('1');
        expect(findCarrier({ provider: 'Unknown Air', identifier: 'DL 88' }, carriers)?.id).toBe('2');
    });
    it('keeps the provider over the number on a codeshare (the name shown decides the logo)', () => {
        expect(findCarrier({ provider: 'Delta Air Lines', identifier: 'KL6050' }, carriers)?.id).toBe('2');
    });
    it('returns nothing without a list or a match', () => {
        expect(findCarrier({ provider: 'KLM' }, [])).toBeUndefined();
        expect(findCarrier({ provider: 'Ryanair', identifier: 'FR100' }, carriers)).toBeUndefined();
    });
});

describe('identifierPrefix', () => {
    it('reads the carrier letters', () => {
        expect(identifierPrefix('KL1234')).toBe('KL');
        expect(identifierPrefix('4U 9525')).toBe('4U');
        expect(identifierPrefix('DLH400')).toBe('DLH');
        expect(identifierPrefix('ICE 123456')).toBe('');
        expect(identifierPrefix(undefined)).toBe('');
    });
});

describe('resolveCarrierLogo', () => {
    it('draws a configured carrier exactly as Settings > Carriers does', () => {
        const r = resolveCarrierLogo({ provider: 'KLM Royal Dutch Airlines', identifier: 'KL1' }, { carriers, brandfetchApiKey: 'key' });
        expect(r.configured).toBe(true);
        expect(r.sources).toEqual(carrierLogoSources('KLM', 'key', carriers));
        expect(r.sources[0]).toContain('cdn.brandfetch.io/klm.com');
    });
    it('prefers the configured carrier over a logo saved on the record', () => {
        const r = resolveCarrierLogo({ provider: 'KL' }, { carriers, saved: 'https://old.example/logo.png' });
        expect(r.sources).not.toContain('https://old.example/logo.png');
    });
    it('uses the saved logo, then Brandfetch, when the carrier is not configured', () => {
        const r = resolveCarrierLogo({ provider: 'Ryanair' }, { carriers, brandfetchApiKey: 'key', saved: 'https://x.example/r.png' });
        expect(r.configured).toBe(false);
        expect(r.sources[0]).toBe('https://x.example/r.png');
        expect(r.sources[1]).toContain('cdn.brandfetch.io/ryanair.com');
        expect(r.sources).toHaveLength(2);
    });
    it('guesses nothing from Clearbit or favicons: no key and no saved logo means no sources', () => {
        const r = resolveCarrierLogo({ provider: 'Ryanair' }, { carriers });
        expect(r.sources).toEqual([]);
    });
    it('returns no sources for an empty provider', () => {
        expect(resolveCarrierLogo({}, { carriers, brandfetchApiKey: 'key' }).sources).toEqual([]);
    });
});
