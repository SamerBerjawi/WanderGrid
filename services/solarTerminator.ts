// Solar Terminator Multi-Band Twilight Shading Gradient for WanderGrid

export interface GeoJsonPolygonFeature {
    type: 'Feature';
    properties: { zenith: number; radiusDeg: number; stepIndex: number };
    geometry: {
        type: 'Polygon';
        coordinates: [number, number][][];
    };
}

export interface TwilightFeatureCollection {
    type: 'FeatureCollection';
    features: GeoJsonPolygonFeature[];
}

/**
 * Calculates the solar position (declination, GHA, subsolar point) for a given UTC Date.
 */
export function getSunPosition(date: Date = new Date()): { declination: number; gha: number; sunLatDeg: number; sunLngDeg: number } {
    const rad = Math.PI / 180;

    // Julian Day
    const time = date.getTime();
    const jd = (time / 86400000) + 2440587.5;
    const d = jd - 2451545.0; // days since J2000.0

    // Solar mean anomaly
    const g = (357.529 + 0.98560028 * d) % 360;
    // Mean longitude
    const q = (280.459 + 0.98564736 * d) % 360;
    // Ecliptic longitude
    const L = (q + 1.915 * Math.sin(g * rad) + 0.020 * Math.sin(2 * g * rad)) % 360;

    // Obliquity of the ecliptic
    const e = 23.439 - 0.00000036 * d;

    // Solar declination
    const sinDec = Math.sin(e * rad) * Math.sin(L * rad);
    const declination = Math.asin(sinDec); // radians

    // Greenwich Mean Sidereal Time in degrees
    const gmst = (280.46061837 + 360.98564736629 * d) % 360;
    // Right ascension
    const ra = Math.atan2(Math.cos(e * rad) * Math.sin(L * rad), Math.cos(L * rad));
    const raDeg = (ra / rad + 360) % 360;

    // Greenwich Hour Angle (GHA) in degrees
    let ghaDeg = (gmst - raDeg + 360) % 360;
    if (ghaDeg > 180) ghaDeg -= 360;

    const sunLngDeg = -ghaDeg;

    return {
        declination,
        gha: ghaDeg * rad,
        sunLatDeg: declination / rad,
        sunLngDeg
    };
}

/**
 * Computes a true spherical circle (great circle distance) on the Earth's surface.
 * Centered at (centerLat, centerLng) with angular radius radiusDeg.
 * Produces a closed, smooth spherical curve with NO vertical seams.
 */
function getSphericalCapRing(
    centerLatDeg: number,
    centerLngDeg: number,
    radiusDeg: number,
    steps: number = 180
): [number, number][] {
    const rad = Math.PI / 180;
    const phi1 = centerLatDeg * rad;
    const lam0 = centerLngDeg * rad;
    const d = radiusDeg * rad;
    const sinPhi1 = Math.sin(phi1);
    const cosPhi1 = Math.cos(phi1);
    const sinD = Math.sin(d);
    const cosD = Math.cos(d);

    const coords: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
        const brng = (i * 360 / steps) * rad;
        const sinPhi2 = sinPhi1 * cosD + cosPhi1 * sinD * Math.cos(brng);
        const phi2 = Math.asin(Math.max(-1, Math.min(1, sinPhi2)));
        const y = Math.sin(brng) * sinD * cosPhi1;
        const x = cosD - sinPhi1 * sinPhi2;
        const lam2 = lam0 + Math.atan2(y, x);

        let lngDeg = (lam2 / rad + 540) % 360 - 180;
        let latDeg = Math.max(-89.5, Math.min(89.5, phi2 / rad));
        coords.push([lngDeg, latDeg]);
    }
    return coords;
}

/**
 * Generates an Ultra-Smooth Multi-Band Solar Twilight Shading FeatureCollection.
 * True spherical circular caps centered at the anti-solar point.
 * Smoothly models civil, nautical, and astronomical twilight penumbra.
 */
export function getTwilightGradientGeoJSON(date: Date = new Date()): TwilightFeatureCollection {
    const sunPos = getSunPosition(date);
    const antiLat = -sunPos.sunLatDeg;
    const antiLng = (sunPos.sunLngDeg + 180 + 540) % 360 - 180;

    // Zenith angles from 86° (golden sunset) down to 120° (deep midnight)
    // Radius from anti-solar point: rho = 180° - zenith
    // 86° -> 94° radius (widest penumbra edge)
    // 90° -> 90° radius (geometric horizon)
    // 96° -> 84° radius (civil twilight)
    // 102° -> 78° radius (nautical twilight)
    // 108° -> 72° radius (astronomical twilight)
    // 114° -> 66° radius (night)
    // 120° -> 60° radius (midnight core)
    const zenithSteps = [86, 90, 94, 98, 102, 106, 110, 114, 118, 122];

    const features: GeoJsonPolygonFeature[] = zenithSteps.map((z, idx) => {
        const radiusDeg = Math.max(1, 180 - z);
        const ring = getSphericalCapRing(antiLat, antiLng, radiusDeg, 180);
        return {
            type: 'Feature',
            properties: {
                zenith: z,
                radiusDeg,
                stepIndex: idx
            },
            geometry: {
                type: 'Polygon',
                coordinates: [ring]
            }
        };
    });

    return {
        type: 'FeatureCollection',
        features
    };
}

export function getNightTerminatorGeoJSON(date: Date = new Date()): GeoJsonPolygonFeature {
    const sunPos = getSunPosition(date);
    const antiLat = -sunPos.sunLatDeg;
    const antiLng = (sunPos.sunLngDeg + 180 + 540) % 360 - 180;
    const ring = getSphericalCapRing(antiLat, antiLng, 90, 180);
    return {
        type: 'Feature',
        properties: { zenith: 90, radiusDeg: 90, stepIndex: 0 },
        geometry: { type: 'Polygon', coordinates: [ring] }
    };
}
