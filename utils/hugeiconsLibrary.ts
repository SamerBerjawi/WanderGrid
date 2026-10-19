import type { HugeiconsIcon } from '@hugeicons/react';

/**
 * The whole Hugeicons free set (about 4,000 icons), loaded on demand. The set is a separate chunk,
 * fetched the first time an icon is searched or a trip with a chosen icon is shown, and then cached.
 */
export type HugeiconData = React.ComponentProps<typeof HugeiconsIcon>['icon'];
export type HugeiconLibrary = Record<string, HugeiconData>;

let pending: Promise<HugeiconLibrary> | null = null;

export const loadHugeicons = (): Promise<HugeiconLibrary> => {
    if (!pending) {
        pending = import('@hugeicons/core-free-icons').then(mod => {
            const out: HugeiconLibrary = {};
            for (const [name, value] of Object.entries(mod as Record<string, unknown>)) {
                // Icons are exported as `NameIcon`; `…FreeIcons` re-exports are bundles, not icons.
                if (/Icon$/.test(name) && !/FreeIcons$/.test(name) && Array.isArray(value)) out[name] = value as HugeiconData;
            }
            return out;
        }).catch(err => { pending = null; throw err; });
    }
    return pending;
};

/** "Airplane01Icon" → "airplane" (words only, lower case), for matching what a person types. */
export const iconSearchKey = (name: string): string =>
    name.replace(/Icon$/, '').replace(/\d+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/\s+/g, ' ').trim();

/** Names matching every word typed, best matches (name starts with the query) first. */
export const searchHugeicons = (names: string[], query: string, limit = 72): string[] => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const scored: { name: string; score: number }[] = [];
    for (const name of names) {
        const key = iconSearchKey(name);
        if (!words.every(w => key.includes(w))) continue;
        scored.push({ name, score: (key.startsWith(words[0]) ? 0 : 1) * 1000 + key.length });
    }
    return scored.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name)).slice(0, limit).map(s => s.name);
};
