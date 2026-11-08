import { describe, expect, it } from 'vitest';
import { countryCodeOf } from '../../utils/countryCodes';

describe('country names to codes', () => {
    it('picks the real code when several share a name', () => {
        expect(countryCodeOf('France')).toBe('FR');
        expect(countryCodeOf('United Kingdom')).toBe('GB');
    });

    it('still reads other names, aliases and codes', () => {
        expect(countryCodeOf('Germany')).toBe('DE');
        expect(countryCodeOf('USA')).toBe('US');
        expect(countryCodeOf('pt')).toBe('PT');
        expect(countryCodeOf('Martian')).toBeUndefined();
        expect(countryCodeOf('')).toBeUndefined();
    });
});
