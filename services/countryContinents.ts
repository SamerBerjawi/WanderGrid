import { featureCode, loadWorld } from '../components/new/atlas/AtlasMap';
import { normalizeCountryCode } from './countryRegistry';

/**
 * Each country's continent, from the `CONTINENT` property of the world map the Atlas already loads (so no extra
 * download and no hand-kept table). Natural Earth puts Russia and Turkey where it does; the map is the authority.
 */

let cache: Promise<Map<string, string>> | null = null;

export const loadContinents = (): Promise<Map<string, string>> => {
    if (!cache) {
        cache = loadWorld().then(fc => {
            const out = new Map<string, string>();
            for (const feature of fc.features) {
                const code = featureCode(feature);
                const continent = String((feature.properties as Record<string, unknown>)?.CONTINENT ?? '');
                if (code && continent) out.set(normalizeCountryCode(code), continent);
            }
            return out;
        }).catch(() => { cache = null; return new Map<string, string>(); });
    }
    return cache;
};
