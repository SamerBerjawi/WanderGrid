import { mix, type RGB, type RpPalette } from './mapPalette';

/**
 * Regional colour gradient of the map, in the rp-* accents. Six poles, one per world region, blended by
 * inverse distance, so the colour drifts smoothly across the map instead of jumping at borders. It colours
 * visited countries on the scratch map and, from origin to destination, the flight routes.
 * (Same approach as the original map's getGeoGradientRGB, with the New pages' palette.)
 */
const poles = (p: RpPalette): { lat: number; lng: number; color: RGB }[] => [
    { lat: 55, lng: -100, color: p.mustard },              // North America
    { lat: -15, lng: -60, color: p.green },                // South America
    { lat: 10, lng: 20, color: p.rust },                   // Africa
    { lat: 50, lng: 15, color: p.green },                  // Europe
    { lat: 35, lng: 105, color: mix(p.rust, p.mustard, 0.5) }, // Asia
    { lat: -25, lng: 135, color: mix(p.green, p.mustard, 0.5) }, // Oceania
];

export const geoColor = (lat: number, lng: number, palette: RpPalette): RGB => {
    let total = 0;
    let r = 0, g = 0, b = 0;
    for (const pole of poles(palette)) {
        const dLat = lat - pole.lat;
        // Longitude wraps: 170°E and 170°W are close.
        let dLng = Math.abs(lng - pole.lng);
        if (dLng > 180) dLng = 360 - dLng;
        const w = 1 / Math.pow(dLat * dLat + dLng * dLng + 250, 2);
        total += w;
        r += pole.color[0] * w;
        g += pole.color[1] * w;
        b += pole.color[2] * w;
    }
    return [Math.round(r / total), Math.round(g / total), Math.round(b / total)];
};

/** Mean of a country's vertices: a cheap centroid that is good enough to pick its place in the gradient. */
export const featureCentroid = (geometry: any): { lat: number; lng: number } => {
    let lat = 0, lng = 0, n = 0;
    const walk = (c: any) => {
        if (typeof c[0] === 'number') { lng += c[0]; lat += c[1]; n++; } else c.forEach(walk);
    };
    try { if (geometry?.coordinates) walk(geometry.coordinates); } catch { /* malformed geometry */ }
    return n ? { lat: lat / n, lng: lng / n } : { lat: 20, lng: 0 };
};

/**
 * Splits a route path into runs of `chunk` segments, each coloured by blending the region colour of the
 * origin into that of the destination (the gradient follows the route, as on the original map).
 */
export const gradientRuns = (path: [number, number][], from: RGB, to: RGB, chunk = 1) => {
    const runs: { path: [number, number][]; color: RGB; t: number }[] = [];
    const last = path.length - 1;
    for (let i = 0; i < last; i += chunk) {
        const end = Math.min(last, i + chunk);
        const t = (i + end) / 2 / Math.max(1, last);
        runs.push({ path: path.slice(i, end + 1), color: mix(from, to, t), t });
    }
    return runs;
};
