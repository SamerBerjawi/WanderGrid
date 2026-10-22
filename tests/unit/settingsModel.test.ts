import { describe, expect, it } from 'vitest';
import type { WorkspaceSettings } from '../../types';
import { countKeys, keyInfo, maskKey } from '../../utils/settingsModel';

const base = { orgName: '', currency: 'USD', dateFormat: '', autoSync: false, theme: 'dark', workingDays: [] } as WorkspaceSettings;

describe('maskKey', () => {
    it('shows only the last four characters, never the whole key', () => {
        expect(maskKey('abcdefghijkl1234')).toBe('•••• 1234');
        expect(maskKey('abc')).toBe('••••');
        expect(maskKey('')).toBe('');
        expect(maskKey('••••••••')).toBe('');
    });
});

describe('keyInfo', () => {
    it('uses what the server says about where a held key comes from', () => {
        const s = { ...base, googleGeminiApiKey: '••••••••', keySources: { googleGeminiApiKey: 'env', aviationStackApiKey: 'workspace', aeroDataBoxApiKey: 'none', openAipApiKey: 'none' } } as WorkspaceSettings;
        expect(keyInfo(s, 'googleGeminiApiKey')).toMatchObject({ has: true, source: 'env' });
        expect(keyInfo(s, 'aviationStackApiKey')).toMatchObject({ has: true, source: 'workspace' });
        expect(keyInfo(s, 'aeroDataBoxApiKey')).toMatchObject({ has: false, source: 'none' });
    });
    it('falls back to the stored value when the server says nothing (local mode)', () => {
        expect(keyInfo({ ...base, googleGeminiApiKey: 'AIza1234567890' }, 'googleGeminiApiKey')).toMatchObject({ has: true, tail: '•••• 7890' });
        expect(keyInfo(base, 'googleGeminiApiKey').has).toBe(false);
    });
    it('reads public ids from the value and shows the end of them', () => {
        expect(keyInfo({ ...base, brandfetchApiKey: 'client-id-9999' }, 'brandfetchApiKey')).toMatchObject({ has: true, tail: '•••• 9999' });
        expect(keyInfo(base, 'cartoApiKey').has).toBe(false);
    });
});

describe('countKeys', () => {
    it('counts every key that is set, and those from the host', () => {
        const s = { ...base, brandfetchApiKey: 'abc', keySources: { googleGeminiApiKey: 'env', aviationStackApiKey: 'workspace', aeroDataBoxApiKey: 'none', openAipApiKey: 'none' } } as WorkspaceSettings;
        expect(countKeys(s)).toEqual({ set: 3, fromHost: 1, total: 6 });
    });
});
