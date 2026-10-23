import { canonicalCountryName, normalizeCountryCode } from './countryRegistry';

/**
 * Reverse geocoding: the place a coordinate is in. It goes through the backend (`/api/proxy/reverse-geocode`:
 * Photon, then Nominatim, cached and with a 3 s timeout there). It is for an explicit "Find the name" press, never for
 * typing, and it fails quiet: a miss, a timeout or an offline server is `null`, not an error.
 */

export interface ReversePlace {
    /** The city, town or village ("Porto"). */
    name: string;
    countryCode: string;
    countryName: string;
    region?: string;
    provider: string;
}

const cache = new Map<string, ReversePlace | null>();
const keyOf = (lat: number, lng: number) => `${lat.toFixed(3)},${lng.toFixed(3)}`;

/** Normalises a provider answer ({ name, country, country_code, admin1 }). Exported for tests. */
export const toReversePlace = (raw: any): ReversePlace | null => {
    const name = typeof raw?.name === 'string' ? raw.name.trim() : '';
    if (!name) return null;
    const code = normalizeCountryCode(String(raw.country_code || ''));
    const known = code && code !== 'XX';
    return {
        name,
        countryCode: known ? code : 'XX',
        countryName: known ? canonicalCountryName(code, raw.country || '') : String(raw.country || ''),
        region: raw.admin1 || undefined,
        provider: String(raw.provider || ''),
    };
};

export async function reverseGeocode(lat: number, lng: number, signal?: AbortSignal): Promise<ReversePlace | null> {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const key = keyOf(lat, lng);
    if (cache.has(key)) return cache.get(key) ?? null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);
    try {
        const token = localStorage.getItem('wandergrid_session_token');
        const local = !import.meta.env.PROD && import.meta.env.VITE_LOCAL_MODE === 'true';
        let raw: any = null;
        if (local) {
            // Local mode has no backend: ask Photon directly (dev only).
            const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat.toFixed(3)}&lon=${lng.toFixed(3)}&lang=en&limit=1`, { signal: controller.signal });
            const props = res.ok ? (await res.json())?.features?.[0]?.properties : null;
            if (props) raw = { name: props.city || props.town || props.village || props.municipality || props.district || props.county || props.name, country: props.country, country_code: props.countrycode, admin1: props.state, provider: 'photon' };
        } else {
            const res = await fetch(`/api/proxy/reverse-geocode?lat=${lat.toFixed(4)}&lon=${lng.toFixed(4)}`, {
                signal: controller.signal,
                headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            });
            if (res.status === 429) throw Object.assign(new Error('Too many requests'), { status: 429 });
            raw = res.ok ? (await res.json())?.result : null;
        }
        const place = toReversePlace(raw);
        // Only a found place is remembered; a miss may be a provider hiccup worth asking again.
        if (place) cache.set(key, place);
        return place;
    } catch (e) {
        if ((e as { status?: number })?.status === 429) throw e;
        return null;
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
    }
}
