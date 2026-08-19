// Solar Terminator Multi-Band Twilight Shading Gradient for WanderGrid
// Production-grade implementation inspired by AirTrail (johanohly/AirTrail)
import * as d3 from 'd3';

export type TimeOfDaySeverity = 'civil' | 'nautical' | 'astronomical' | 'night';

export interface GeoJsonPolygonFeature {
    type: 'Feature';
    properties: {
        severity?: TimeOfDaySeverity;
        altitudeMax?: number;
        radiusDeg: number;
        stepIndex: number;
        zenith?: number;
    };
    geometry: {
        type: 'Polygon' | 'MultiPolygon';
        coordinates: any;
    };
}

export interface TwilightFeatureCollection {
    type: 'FeatureCollection';
    features: GeoJsonPolygonFeature[];
}

const DAY_IN_MS = 86_400_000;
const J2000 = 2_451_545;
const JD1970 = 2_440_588;
const CIRCLE_PRECISION_DEGREES = 0.5;
const POLE_EDGE_LATITUDE = 89.999;

const degreesToRadians = (degrees: number) => (degrees * Math.PI) / 180;
const radiansToDegrees = (radians: number) => (radians * 180) / Math.PI;

export const normalizeDegrees = (degrees: number): number => {
    const normalized = ((degrees + 180) % 360) - 180;
    return normalized < -180 ? normalized + 360 : normalized;
};

/**
 * Calculates exact subsolar point (latitude and longitude) for a given UTC Date.
 */
export function getSolarPosition(date: Date = new Date()): {
    subsolarLatitude: number;
    subsolarLongitude: number;
    declination: number;
    gha: number;
    sunLatDeg: number;
    sunLngDeg: number;
} {
    const julianDay = date.getTime() / DAY_IN_MS - 0.5 + JD1970;
    const days = julianDay - J2000;
    const meanLongitude = normalizeDegrees(280.459 + 0.98564736 * days);
    const meanAnomaly = degreesToRadians(
        normalizeDegrees(357.529 + 0.98560028 * days)
    );
    const eclipticLongitude = degreesToRadians(
        normalizeDegrees(
            meanLongitude +
                1.915 * Math.sin(meanAnomaly) +
                0.02 * Math.sin(2 * meanAnomaly)
        )
    );
    const obliquity = degreesToRadians(23.439 - 0.00000036 * days);
    const rightAscension = Math.atan2(
        Math.cos(obliquity) * Math.sin(eclipticLongitude),
        Math.cos(eclipticLongitude)
    );
    const declination = Math.asin(
        Math.sin(obliquity) * Math.sin(eclipticLongitude)
    );
    const greenwichSiderealTime =
        ((18.697374558 + 24.06570982441908 * days) % 24) * 15;
    const subsolarLongitude = normalizeDegrees(
        radiansToDegrees(rightAscension) - greenwichSiderealTime
    );
    const subsolarLatitude = radiansToDegrees(declination);

    return {
        subsolarLatitude,
        subsolarLongitude,
        declination,
        gha: -subsolarLongitude * (Math.PI / 180),
        sunLatDeg: subsolarLatitude,
        sunLngDeg: subsolarLongitude
    };
}

// Backwards compatibility alias
export const getSunPosition = getSolarPosition;

const closeRing = (ring: [number, number][]): [number, number][] => {
    const first = ring[0];
    if (!first) return ring;

    const last = ring[ring.length - 1];
    if (last && last[0] === first[0] && last[1] === first[1]) {
        return ring;
    }

    return [...ring, first];
};

const findDatelineJumpIndex = (ring: [number, number][]) =>
    ring.findIndex((coordinate, index) => {
        const next = ring[(index + 1) % ring.length];
        if (!next) return false;
        return Math.abs(next[0] - coordinate[0]) > 180;
    });

const findDatelineJumpIndexes = (ring: [number, number][]) => {
    const jumpIndexes: number[] = [];
    ring.forEach((coordinate, index) => {
        const next = ring[index + 1];
        if (!next) return;
        if (Math.abs(next[0] - coordinate[0]) > 180) {
            jumpIndexes.push(index);
        }
    });
    return jumpIndexes;
};

const interpolateDatelineCrossing = (
    start: [number, number],
    end: [number, number]
) => {
    const endLongitude = start[0] > 0 && end[0] < 0 ? end[0] + 360 : end[0] - 360;
    const crossingLongitude = start[0] > 0 ? 180 : -180;
    const progress = (crossingLongitude - start[0]) / (endLongitude - start[0]);
    const latitude = start[1] + (end[1] - start[1]) * progress;

    return {
        east: [180, latitude] as [number, number],
        west: [-180, latitude] as [number, number]
    };
};

const createCircleGeometry = (
    center: [number, number],
    radius: number
): { type: 'Polygon'; coordinates: [number, number][][] } =>
    d3.geoCircle()
        .center(center)
        .radius(radius)
        .precision(CIRCLE_PRECISION_DEGREES)() as any;

const createPolarCapPolygon = (
    ring: [number, number][],
    pole: 'north' | 'south'
): { type: 'Polygon'; coordinates: [number, number][][] } => {
    const jumpIndex = findDatelineJumpIndex(ring);

    if (jumpIndex === -1) {
        return { type: 'Polygon', coordinates: [closeRing(ring)] };
    }

    const start = ring[jumpIndex] as [number, number];
    const end = ring[(jumpIndex + 1) % ring.length] as [number, number];
    const crossing = interpolateDatelineCrossing(start, end);
    const ringWithoutClosingPoint = ring.slice(0, -1);
    const boundary = [
        ...ringWithoutClosingPoint.slice(jumpIndex + 1),
        ...ringWithoutClosingPoint.slice(0, jumpIndex + 1)
    ];
    const boundaryWestToEast =
        start[0] > 0
            ? [crossing.west, ...boundary, crossing.east]
            : [crossing.west, ...boundary.slice().reverse(), crossing.east];
    const poleLatitude =
        pole === 'north' ? POLE_EDGE_LATITUDE : -POLE_EDGE_LATITUDE;
    const poleEdge = [180, 120, 60, 0, -60, -120, -180].map(
        (longitude) => [longitude, poleLatitude] as [number, number]
    );
    const closedRing = [
        ...boundaryWestToEast,
        ...poleEdge,
        boundaryWestToEast[0]
    ];

    return {
        type: 'Polygon',
        coordinates: [closeRing(closedRing)]
    };
};

const createAntimeridianSplitPolygon = (
    ring: [number, number][]
): { type: 'MultiPolygon'; coordinates: [number, number][][][] } | null => {
    const jumpIndexes = findDatelineJumpIndexes(ring);

    if (jumpIndexes.length !== 2) {
        return null;
    }

    const ringWithoutClosingPoint = ring.slice(0, -1);
    const [firstJumpIndex, secondJumpIndex] = jumpIndexes;
    const firstJumpNextIndex =
        (firstJumpIndex + 1) % ringWithoutClosingPoint.length;
    const secondJumpNextIndex =
        (secondJumpIndex + 1) % ringWithoutClosingPoint.length;
    const firstCrossing = interpolateDatelineCrossing(
        ringWithoutClosingPoint[firstJumpIndex],
        ringWithoutClosingPoint[firstJumpNextIndex]
    );
    const secondCrossing = interpolateDatelineCrossing(
        ringWithoutClosingPoint[secondJumpIndex],
        ringWithoutClosingPoint[secondJumpNextIndex]
    );
    const firstJumpIsEastToWest =
        ringWithoutClosingPoint[firstJumpIndex][0] > 0 &&
        ringWithoutClosingPoint[firstJumpNextIndex][0] < 0;
    const eastRing = firstJumpIsEastToWest
        ? closeRing([
                secondCrossing.east,
                ...ringWithoutClosingPoint.slice(secondJumpIndex + 1),
                ...ringWithoutClosingPoint.slice(0, firstJumpIndex + 1),
                firstCrossing.east
          ])
        : closeRing([
                firstCrossing.east,
                ...ringWithoutClosingPoint.slice(
                    firstJumpIndex + 1,
                    secondJumpIndex + 1
                ),
                secondCrossing.east
          ]);
    const westRing = firstJumpIsEastToWest
        ? closeRing([
                firstCrossing.west,
                ...ringWithoutClosingPoint.slice(
                    firstJumpIndex + 1,
                    secondJumpIndex + 1
                ),
                secondCrossing.west
          ])
        : closeRing([
                secondCrossing.west,
                ...ringWithoutClosingPoint.slice(secondJumpIndex + 1),
                ...ringWithoutClosingPoint.slice(0, firstJumpIndex + 1),
                firstCrossing.west
          ]);

    return {
        type: 'MultiPolygon',
        coordinates: [[eastRing], [westRing]]
    };
};

export const createCirclePolygon = (
    center: [number, number],
    radius: number
): { type: 'Polygon' | 'MultiPolygon'; coordinates: any } => {
    const geometry = createCircleGeometry(center, radius);
    const distanceToNorthPole = 90 - center[1];
    const distanceToSouthPole = 90 + center[1];

    if (distanceToNorthPole <= radius) {
        return createPolarCapPolygon(geometry.coordinates[0], 'north');
    }

    if (distanceToSouthPole <= radius) {
        return createPolarCapPolygon(geometry.coordinates[0], 'south');
    }

    const splitGeometry = createAntimeridianSplitPolygon(geometry.coordinates[0]);

    if (splitGeometry) {
        return splitGeometry;
    }

    return {
        ...geometry,
        coordinates: geometry.coordinates.map(closeRing)
    };
};

export const TIME_OF_DAY_SEVERITIES: Array<{
    severity: TimeOfDaySeverity;
    altitudeMax: number;
    lightOpacity: number;
    darkOpacity: number;
}> = [
    { severity: 'civil', altitudeMax: 0, lightOpacity: 0.1, darkOpacity: 0.035 },
    { severity: 'nautical', altitudeMax: -6, lightOpacity: 0.085, darkOpacity: 0.025 },
    { severity: 'astronomical', altitudeMax: -12, lightOpacity: 0.075, darkOpacity: 0.02 },
    { severity: 'night', altitudeMax: -18, lightOpacity: 0.07, darkOpacity: 0.02 }
];

// Multi-band twilight penumbra steps from sunset horizon down to deep midnight
const TWILIGHT_BAND_STEPS: Array<{ altitudeMax: number; severity: TimeOfDaySeverity }> = [
    { altitudeMax: 0, severity: 'civil' },
    { altitudeMax: -3, severity: 'civil' },
    { altitudeMax: -6, severity: 'nautical' },
    { altitudeMax: -9, severity: 'nautical' },
    { altitudeMax: -12, severity: 'astronomical' },
    { altitudeMax: -15, severity: 'astronomical' },
    { altitudeMax: -18, severity: 'night' },
    { altitudeMax: -22, severity: 'night' }
];

/**
 * Generates an Ultra-Smooth Multi-Band Solar Twilight Shading FeatureCollection.
 * True spherical circular caps centered at the anti-solar point, cleanly clipped at the antimeridian and poles.
 * Renders equally accurately from both east and west of the map without seam cuts or inversion artifacts.
 */
export function getTwilightGradientGeoJSON(date: Date = new Date()): TwilightFeatureCollection {
    const { subsolarLatitude, subsolarLongitude } = getSolarPosition(date);
    const antiSolarCenter: [number, number] = [
        normalizeDegrees(subsolarLongitude + 180),
        -subsolarLatitude
    ];

    const features: GeoJsonPolygonFeature[] = TWILIGHT_BAND_STEPS.map((step, stepIndex) => {
        const radiusDeg = Math.max(1, 90 + step.altitudeMax);
        const geometry = createCirclePolygon(antiSolarCenter, radiusDeg);

        return {
            type: 'Feature',
            properties: {
                severity: step.severity,
                altitudeMax: step.altitudeMax,
                radiusDeg,
                stepIndex,
                zenith: 90 - step.altitudeMax
            },
            geometry
        };
    });

    return {
        type: 'FeatureCollection',
        features
    };
}

/**
 * Generates a single GeoJSON Feature representing the standard Solar Night Terminator (Zenith = 90°).
 */
export function getNightTerminatorGeoJSON(date: Date = new Date()): GeoJsonPolygonFeature {
    const { subsolarLatitude, subsolarLongitude } = getSolarPosition(date);
    const antiSolarCenter: [number, number] = [
        normalizeDegrees(subsolarLongitude + 180),
        -subsolarLatitude
    ];
    const geometry = createCirclePolygon(antiSolarCenter, 90);

    return {
        type: 'Feature',
        properties: {
            severity: 'civil',
            altitudeMax: 0,
            radiusDeg: 90,
            stepIndex: 0,
            zenith: 90
        },
        geometry
    };
}
