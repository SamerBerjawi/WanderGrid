// Solar Terminator Multi-Band Twilight Shading Gradient for Deck.gl

export interface GeoJsonPolygonFeature {
    type: 'Feature';
    properties: { zenith: number; stepIndex: number };
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
export function getSunPosition(date: Date = new Date()): { declination: number; gha: number; sunLngDeg: number } {
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
        sunLngDeg
    };
}

/**
 * Computes a continuous spherical polygon contour for a specific solar zenith angle.
 */
function getZenithBandPolygon(
    zenithDeg: number, 
    stepIndex: number, 
    sunPos: { declination: number; sunLngDeg: number }
): GeoJsonPolygonFeature {
    const { declination, sunLngDeg } = sunPos;
    const rad = Math.PI / 180;
    const cosZ = Math.cos(zenithDeg * rad);
    const sinDec = Math.sin(declination);
    const cosDec = Math.cos(declination);
    const isSummerNorth = declination >= 0;

    const coords: [number, number][] = [];
    const step = 1.5; // High resolution 1.5-degree sampling

    for (let lng = -180; lng <= 180; lng += step) {
        const deltaLng = (lng - sunLngDeg) * rad;
        const A = sinDec;
        const B = cosDec * Math.cos(deltaLng);
        const R = Math.sqrt(A * A + B * B);
        const alpha = Math.atan2(B, A);
        const ratio = cosZ / R;

        let latDeg = 0;
        if (ratio >= 1) {
            latDeg = isSummerNorth ? -89.9 : 89.9;
        } else if (ratio <= -1) {
            latDeg = isSummerNorth ? 89.9 : -89.9;
        } else {
            const latRad = Math.asin(ratio) - alpha;
            latDeg = Math.max(-88.5, Math.min(88.5, latRad / rad));
        }
        coords.push([lng, latDeg]);
    }

    const polarLat = isSummerNorth ? -90 : 90;
    const ring: [number, number][] = [
        ...coords,
        [180, polarLat],
        [-180, polarLat],
        coords[0]
    ];

    return {
        type: 'Feature',
        properties: {
            zenith: zenithDeg,
            stepIndex
        },
        geometry: {
            type: 'Polygon',
            coordinates: [ring]
        }
    };
}

/**
 * Generates an Ultra-Smooth 14-Band Solar Twilight Gradient FeatureCollection.
 * Softly feathers daylight into dusk, nautical twilight, astronomical twilight, and midnight black.
 */
export function getTwilightGradientGeoJSON(date: Date = new Date()): TwilightFeatureCollection {
    const sunPos = getSunPosition(date);

    // 14 concentric twilight steps (from 82° golden hour to 122° deep midnight)
    const zenithSteps = [82, 85, 88, 91, 94, 97, 100, 103, 106, 109, 112, 115, 118, 122];
    const features: GeoJsonPolygonFeature[] = zenithSteps.map((z, idx) => 
        getZenithBandPolygon(z, idx, sunPos)
    );

    return {
        type: 'FeatureCollection',
        features
    };
}

export function getNightTerminatorGeoJSON(date: Date = new Date()): GeoJsonPolygonFeature {
    const sunPos = getSunPosition(date);
    return getZenithBandPolygon(90, 0, sunPos);
}
