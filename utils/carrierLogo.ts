import type { Carrier } from '../types';
import { getMerchantLogoUrl } from './brandfetch';

/**
 * Logo URLs for a carrier or operator, best first: Brandfetch (when a key is set), the airline-code
 * image, Clearbit, then the site favicon. Callers try them in order and fall back to an icon.
 */
export const carrierLogoSources = (provider: string | undefined, brandfetchApiKey?: string, carriers: Carrier[] = []): string[] => {
    if (!provider?.trim()) return [];
    const name = provider.trim().toLowerCase();
    const match = carriers.find(c => c.code?.toLowerCase().trim() === name || c.name?.toLowerCase().trim() === name);
    const domain = match?.domain?.trim() || `${name.replace(/[^a-z0-9]/g, '')}.com`;
    const overrides: Record<string, string> = {};
    carriers.forEach(c => {
        if (c.code) overrides[c.code.toLowerCase().trim()] = c.domain;
        if (c.name) overrides[c.name.toLowerCase().trim()] = c.domain;
    });
    const steps: string[] = [];
    if (brandfetchApiKey) {
        const bf = getMerchantLogoUrl(provider.trim(), brandfetchApiKey, overrides, { type: 'icon', fallback: '404' });
        if (bf) steps.push(bf);
    }
    const iata = (match?.code || (provider.trim().length === 2 ? provider.trim() : '')).toUpperCase();
    if (iata.length === 2) steps.push(`https://pics.avs.io/200/200/${iata}.png`);
    steps.push(`https://logo.clearbit.com/${domain}`, `https://www.google.com/s2/favicons?sz=128&domain=${domain}`);
    return steps;
};
