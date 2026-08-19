// Solar Terminator Multi-Band Twilight Shading Gradient for WanderGrid
import * as d3 from 'd3';

export interface GeoJsonPolygonFeature {
    type: 'Feature';
    properties: { zenith: number; radiusDeg: number; stepIndex: number };
    geometry: {
        type: 'Polygon' | 'MultiPolygon';
        coordinates: any;
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
 * Clips a spherical circle at the ±180° antimeridian into a clean GeoJSON Polygon or MultiPolygon.
 * Uses D3-geo antimeridian clipping to prevent cross-meridian chord artifacts or triangle tears.
 */
function createClippedSphericalCap(
    centerLng: number,
    centerLat: number,
    radiusDeg: number,
    zenith: number,
    stepIndex: number
): GeoJsonPolygonFeature {
    const circle = d3.geoCircle()
        .center([centerLng, centerLat])
        .radius(radiusDeg)
        .precision(1)();

    const polygons: [number, number][][][] = [];
    let currentPolygon: [number, number][][] = [];
    let currentRing: [number, number][] = [];

    const sink = {
        point: (x: number, y: number) => {
            currentRing.push([x, y]);
        },
        lineStart: () => {
            currentRing = [];
        },
        lineEnd: () => {
            if (currentRing.length > 0) {
                // Ensure the linear ring is closed
                const first = currentRing[0];
                const last = currentRing[currentRing.length - 1];
                if (first[0] !== last[0] || first[1] !== last[1]) {
                    currentRing.push([first[0], first[1]]);
                }
                currentPolygon.push(currentRing);
            }
        },
        polygonStart: () => {
            currentPolygon = [];
        },
        polygonEnd: () => {
            if (currentPolygon.length > 0) {
                polygons.push(currentPolygon);
            }
        },
        sphere: () => {}
    };

    // Geographic identity stream with antimeridian clipping
    // Note: In D3 projections, y is inverted by default for screen coords; -phi preserves geographic latitude (+North, -South)
    const proj = d3.geoProjection((lam, phi) => [lam * 180 / Math.PI, -phi * 180 / Math.PI])
        .scale(1)
        .translate([0, 0]);

    d3.geoStream(circle as any, proj.stream(sink));

    const geometry = polygons.length === 1
        ? { type: 'Polygon' as const, coordinates: polygons[0] }
        : { type: 'MultiPolygon' as const, coordinates: polygons };

    return {
        type: 'Feature',
        properties: {
            zenith,
            radiusDeg,
            stepIndex
        },
        geometry
    };
}

/**
 * Generates an Ultra-Smooth Multi-Band Solar Twilight Shading FeatureCollection.
 * True spherical circular caps centered at the anti-solar point, cleanly clipped at the antimeridian.
 * Smoothly models civil, nautical, and astronomical twilight penumbra with correct orientation.
 */
export function getTwilightGradientGeoJSON(date: Date = new Date()): TwilightFeatureCollection {
    const sunPos = getSunPosition(date);
    const antiLat = -sunPos.sunLatDeg;
    const antiLng = (sunPos.sunLngDeg + 180 + 540) % 360 - 180;

    // Multi-band zenith steps (from 86° golden sunset down to 122° deep midnight)
    // Radius from anti-solar point: rho = 180° - zenith
    const zenithSteps = [86, 90, 94, 98, 102, 106, 110, 114, 118, 122];

    const features: GeoJsonPolygonFeature[] = zenithSteps.map((z, idx) => {
        const radiusDeg = Math.max(1, 180 - z);
        return createClippedSphericalCap(antiLng, antiLat, radiusDeg, z, idx);
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
    return createClippedSphericalCap(antiLng, antiLat, 90, 90, 0);
}
