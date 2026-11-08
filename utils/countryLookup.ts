/**
 * Which country a point is in, from the app's own country borders (a GeoJSON file). Used by the route replay to
 * say "first time in Portugal". Each feature is boxed first, then the point is tested against its rings;
 * a point just off the coast (airports on islands and spits often are, in simplified borders) falls back to the
 * nearest border within 150 km. Pure.
 */

type Ring = [number, number][];
interface Entry { code: string; name: string; polygons: Ring[][]; box: [number, number, number, number] }
export interface CountryHit { code: string; name: string }

const codeOf = (p: any): string => {
    const a2 = p?.ISO_A2 && p.ISO_A2 !== '-99' ? p.ISO_A2 : p?.ISO_A2_EH;
    return (a2 && a2 !== '-99' ? String(a2) : '').toUpperCase();
};

const inRing = (x: number, y: number, ring: Ring): boolean => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
};

/** A polygon is its outer ring minus its holes. */
const inPolygon = (x: number, y: number, rings: Ring[]): boolean =>
    rings.length > 0 && inRing(x, y, rings[0]) && !rings.slice(1).some(h => inRing(x, y, h));

const km = (lng1: number, lat1: number, lng2: number, lat2: number): number => {
    const r = Math.PI / 180;
    const dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
    return 12742 * Math.asin(Math.min(1, Math.sqrt(a)));
};

export const buildCountryIndex = (geo: { features?: any[] } | null | undefined) => {
    const entries: Entry[] = [];
    for (const f of geo?.features || []) {
        const code = codeOf(f.properties);
        if (!code || !f.geometry) continue;
        const polygons: Ring[][] = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
        let minX = 180, minY = 90, maxX = -180, maxY = -90;
        for (const poly of polygons) for (const [x, y] of poly[0] || []) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
        entries.push({ code, name: String(f.properties?.NAME || code), polygons, box: [minX, minY, maxX, maxY] });
    }
    const cache = new Map<string, CountryHit | null>();
    return {
        size: entries.length,
        find(lng: number, lat: number): CountryHit | null {
            const key = `${lng.toFixed(3)},${lat.toFixed(3)}`;
            const hit = cache.get(key);
            if (hit !== undefined) return hit;
            let found: CountryHit | null = null;
            for (const e of entries) {
                if (lng < e.box[0] || lng > e.box[2] || lat < e.box[1] || lat > e.box[3]) continue;
                if (e.polygons.some(p => inPolygon(lng, lat, p))) { found = { code: e.code, name: e.name }; break; }
            }
            if (!found) {
                let best = 150;
                for (const e of entries) {
                    if (lng < e.box[0] - 2 || lng > e.box[2] + 2 || lat < e.box[1] - 2 || lat > e.box[3] + 2) continue;
                    for (const poly of e.polygons) for (const [x, y] of poly[0] || []) {
                        const d = km(lng, lat, x, y);
                        if (d < best) { best = d; found = { code: e.code, name: e.name }; }
                    }
                }
            }
            cache.set(key, found);
            return found;
        },
    };
};

export type CountryIndex = ReturnType<typeof buildCountryIndex>;
