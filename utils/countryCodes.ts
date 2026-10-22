/** Country names to ISO 3166 alpha-2 codes, built once from the browser's own region names (no data file, works offline). */

const ALIASES: Record<string, string> = {
    usa: 'US', 'u.s.': 'US', 'united states of america': 'US', america: 'US',
    uk: 'GB', 'u.k.': 'GB', england: 'GB', scotland: 'GB', wales: 'GB', 'great britain': 'GB',
    uae: 'AE', 'czech republic': 'CZ', czechia: 'CZ', turkey: 'TR', türkiye: 'TR', 'ivory coast': 'CI',
    holland: 'NL', 'south korea': 'KR', 'north korea': 'KP', russia: 'RU', vietnam: 'VN', laos: 'LA',
    burma: 'MM', 'cape verde': 'CV', swaziland: 'SZ', macedonia: 'MK', palestine: 'PS', 'hong kong': 'HK',
};

let byName: Map<string, string> | null = null;

const build = (): Map<string, string> => {
    const map = new Map<string, string>();
    try {
        const display = new Intl.DisplayNames(['en'], { type: 'region' });
        const A = 65;
        for (let i = 0; i < 26; i++) {
            for (let j = 0; j < 26; j++) {
                const code = String.fromCharCode(A + i, A + j);
                const name = display.of(code);
                if (name && name !== code) map.set(name.toLowerCase(), code);
            }
        }
    } catch { /* Intl.DisplayNames unavailable: only the aliases work */ }
    return map;
};

/** The two-letter code for a country name ("Italy" gives "IT"), or undefined when it isn't recognised. */
export const countryCodeOf = (name?: string): string | undefined => {
    const key = (name || '').trim().toLowerCase();
    if (!key) return undefined;
    if (/^[a-z]{2}$/.test(key)) return key.toUpperCase();
    byName ||= build();
    return ALIASES[key] || byName.get(key);
};
