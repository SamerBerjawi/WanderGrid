import type { WorkspaceSettings } from '../types';

/** Which API keys the workspace has, and where each comes from. Pure helpers for the Settings page. */

export type KeyField = 'googleGeminiApiKey' | 'aviationStackApiKey' | 'aeroDataBoxApiKey' | 'openAipApiKey' | 'brandfetchApiKey' | 'cartoApiKey';

/** Paid keys are held by the server and only ever come back as a mask; Brandfetch and CARTO ids are public and readable. */
export const SERVER_HELD_KEYS = ['googleGeminiApiKey', 'aviationStackApiKey', 'aeroDataBoxApiKey', 'openAipApiKey'] as const;
export const ALL_KEY_FIELDS: KeyField[] = [...SERVER_HELD_KEYS, 'brandfetchApiKey', 'cartoApiKey'];

export type KeySource = 'workspace' | 'env' | 'none';

/** Show only the end of a key: never the whole value. */
export const maskKey = (value?: string) => {
    const v = (value || '').trim();
    if (!v || /^•+$/.test(v)) return '';
    return v.length > 8 ? `•••• ${v.slice(-4)}` : '••••';
};

export const keyInfo = (settings: WorkspaceSettings, field: KeyField): { has: boolean; source: KeySource; tail: string } => {
    const value = String(settings[field] || '');
    const serverHeld = (SERVER_HELD_KEYS as readonly string[]).includes(field);
    const known: KeySource | undefined = serverHeld
        ? settings.keySources?.[field as (typeof SERVER_HELD_KEYS)[number]] ?? (settings.configuredKeys?.[field as (typeof SERVER_HELD_KEYS)[number]] ? 'workspace' : undefined)
        : undefined;
    // Without the server's report (local mode, or an older server) the stored value itself says whether there is a key.
    if (known !== undefined) return { has: known !== 'none', source: known, tail: '' };
    return { has: Boolean(value), source: value ? 'workspace' : 'none', tail: maskKey(value) };
};

export const countKeys = (settings: WorkspaceSettings) => {
    const infos = ALL_KEY_FIELDS.map(f => keyInfo(settings, f));
    return { set: infos.filter(i => i.has).length, fromHost: infos.filter(i => i.source === 'env').length, total: ALL_KEY_FIELDS.length };
};
