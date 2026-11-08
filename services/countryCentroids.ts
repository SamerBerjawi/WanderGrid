import { geoCentroid } from 'd3';
import { featureCode, loadWorld } from '../components/new/atlas/AtlasMap';
import { normalizeCountryCode } from './countryRegistry';

/**
 * The middle of each country, from the world map the Atlas and Dashboard already load (no new download). Used
 * where a country needs a position, such as how far a wishlist place is from home.
 */

export interface LatLng { lat: number; lng: number }

let cache: Promise<Map<string, LatLng>> | null = null;

export const loadCentroids = (): Promise<Map<string, LatLng>> => {
    if (!cache) {
        cache = loadWorld().then(fc => {
            const out = new Map<string, LatLng>();
            for (const feature of fc.features) {
                const code = featureCode(feature);
                if (!code) continue;
                const [lng, lat] = geoCentroid(feature as any);
                if (Number.isFinite(lat) && Number.isFinite(lng)) out.set(normalizeCountryCode(code), { lat, lng });
            }
            return out;
        }).catch(() => { cache = null; return new Map<string, LatLng>(); });
    }
    return cache;
};

export const centroidOf = (centroids: Map<string, LatLng>, code?: string): LatLng | undefined =>
    code ? centroids.get(normalizeCountryCode(code)) : undefined;
