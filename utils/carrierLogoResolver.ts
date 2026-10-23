import type { Carrier } from '../types';
import { carrierLogoSources } from './carrierLogo';

/**
 * One answer to "which logo does this flight's carrier get?", shared by every page. It finds the
 * entry in Settings > Carriers and builds the logo exactly as that section does, so the two agree.
 */

export interface CarrierSubject {
    /** The airline or operator as written on the record: a name ("KLM Royal Dutch Airlines") or a code ("KL"). */
    provider?: string;
    /** The journey number ("KL1234"); its letters are the marketing carrier's code. */
    identifier?: string;
}

export interface ResolvedCarrierLogo {
    /** The Carriers entry that matched, if any. */
    carrier?: Carrier;
    /** Logo URLs to try in order; empty when nothing is configured and there is no Brandfetch key. */
    sources: string[];
    /** True when the logo comes from a Settings > Carriers entry. */
    configured: boolean;
}

/** Words that do not tell two airlines apart ("Air France" vs "AIRFRANCE" vs "Air France Airlines"). */
const NOISE = new Set(['airlines', 'airline', 'airways', 'air', 'lines', 'royal', 'dutch', 'the', 'group', 'international', 'intl', 'co', 'ltd', 'inc', 'plc', 'sa', 'ag']);

const squash = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

/** Distinctive words of a name; falls back to every word when all are generic ("Air India" keeps "india", "Air Air" keeps both). */
const tokens = (s: string): string[] => {
    const all = s.toLowerCase().normalize('NFKD').split(/[^a-z0-9]+/).filter(Boolean);
    const strong = all.filter(w => !NOISE.has(w));
    return strong.length ? strong : all;
};

/** Letters at the start of a journey number: "KL1234" -> "KL", "AF 123" -> "AF", "4U9525" -> "4U". */
export const identifierPrefix = (identifier?: string): string => {
    const m = identifier?.trim().toUpperCase().match(/^([A-Z0-9]{2,3}?)\s*-?\s*\d{1,4}[A-Z]?$/);
    return m?.[1] ?? '';
};

const sameCode = (carrier: Carrier, code: string) => !!code && carrier.code?.trim().toUpperCase() === code;

/**
 * The Carriers entry for a flight: by code (IATA or ICAO) in the provider field, then by name (exact
 * once punctuation and generic words are ignored, so "KLM Royal Dutch Airlines" finds "KLM"), then by the
 * code in the journey number. The provider wins over the number so the logo matches the name shown
 * beside it on a codeshare.
 */
export const findCarrier = (subject: CarrierSubject, carriers: Carrier[] = []): Carrier | undefined => {
    if (carriers.length === 0) return undefined;
    const provider = subject.provider?.trim() ?? '';
    const upper = provider.toUpperCase();

    if (provider && provider.length <= 3) {
        const byCode = carriers.find(c => sameCode(c, upper));
        if (byCode) return byCode;
    }

    if (provider) {
        const flat = squash(provider);
        const exact = carriers.find(c => squash(c.name || '') === flat);
        if (exact) return exact;
        const want = tokens(provider);
        if (want.length) {
            const byName = carriers.find(c => {
                const have = tokens(c.name || '');
                return have.length > 0 && have.length === want.length && have.every(w => want.includes(w));
            });
            if (byName) return byName;
            // "KLM Royal Dutch Airlines" lists "KLM"; the shorter name must be whole words of the longer one.
            const subset = carriers.find(c => {
                const have = tokens(c.name || '');
                return have.length > 0 && have.every(w => want.includes(w)) && (have.length > 1 || have[0].length >= 3);
            });
            if (subset) return subset;
        }
    }

    const prefix = identifierPrefix(subject.identifier);
    if (prefix) return carriers.find(c => sameCode(c, prefix));
    return undefined;
};

/**
 * The logo for a flight's carrier. A Carriers entry wins and is drawn the way Settings draws it. With no
 * entry, a logo saved on the record is used, then Brandfetch by name when the workspace has a key (it answers
 * 404 for an unknown brand). Nothing is guessed from other services, so the caller shows its mode icon.
 */
export const resolveCarrierLogo = (
    subject: CarrierSubject,
    options: { carriers?: Carrier[]; brandfetchApiKey?: string; saved?: string } = {},
): ResolvedCarrierLogo => {
    const { carriers = [], brandfetchApiKey, saved } = options;
    const carrier = findCarrier(subject, carriers);
    if (carrier) return { carrier, sources: carrierLogoSources(carrier.name, brandfetchApiKey, carriers), configured: true };
    const sources: string[] = [];
    if (saved?.trim()) sources.push(saved.trim());
    const name = subject.provider?.trim();
    if (name && brandfetchApiKey) {
        const guessed = carrierLogoSources(name, brandfetchApiKey, []);
        if (guessed[0]?.startsWith('https://cdn.brandfetch.io/')) sources.push(guessed[0]);
    }
    return { sources, configured: false };
};
