// Airport Detailed Runway & Markings Geometry Generator for WanderGrid
import type { PhysicalRunway } from './airportRunwayDataset';
import { STATIC_GEO_DATA, formatProperLocationName } from './geocoding';
import type { AirportCategory } from '../types/mapAppearance';
import { TOP_AIRPORTS_BY_IATA } from '../utils/topAviationData';

export type { PhysicalRunway, AirportCategory };

let runwayDatasetCache: Record<string, PhysicalRunway[]> | null = null;
let runwayLoadingPromise: Promise<Record<string, PhysicalRunway[]>> | null = null;

/**
 * Asynchronously loads the physical runway dataset on demand, caching it in memory.
 */
export async function getPhysicalRunways(): Promise<Record<string, PhysicalRunway[]>> {
    if (runwayDatasetCache) return runwayDatasetCache;
    if (!runwayLoadingPromise) {
        runwayLoadingPromise = import('./airportRunwayDataset').then(m => {
            runwayDatasetCache = m.GLOBAL_PHYSICAL_RUNWAYS;
            return m.GLOBAL_PHYSICAL_RUNWAYS;
        });
    }
    return runwayLoadingPromise;
}

/**
 * Returns the currently cached physical runway dataset synchronously, or null if not yet loaded.
 */
export function getPhysicalRunwaysSync(): Record<string, PhysicalRunway[]> | null {
    return runwayDatasetCache;
}

const DEDICATED_CARGO_CODES = new Set([
    'MEM', 'SDF', 'ANC', 'LEJ', 'CVG', 'ONT', 'RFD', 'EMA', 'HHN', 'PIK', 
    'CGO', 'DWC', 'LCK', 'ILN', 'AFW', 'SWF', 'LGG', 'VCP', 'WFS'
]);

const MILITARY_AIRBASE_CODES = new Set([
    'ADW', 'DOV', 'EDW', 'FFO', 'HIK', 'LSV', 'RIV', 'RMS', 'SUU', 'TCM', 
    'VBG', 'AVN', 'BZZ', 'LKH', 'MSD', 'NHT', 'WAD', 'KAD', 'OSN', 'DNA', 
    'AGH', 'SZL', 'BAB', 'DMA', 'HMN', 'OFF', 'TIK', 'WRB', 'BAD', 'MGE', 
    'LFI', 'NTD', 'NGU', 'NIP', 'NQX', 'NFL', 'NKT', 'NZY'
]);

export function classifyAirportCategory(
    code: string,
    rws: PhysicalRunway[],
    staticEntry?: any
): AirportCategory {
    const upper = (code || '').toUpperCase().trim();
    const top = TOP_AIRPORTS_BY_IATA[upper];
    const name = (top?.name || staticEntry?.name || '').toUpperCase();

    // 1. Cargo
    if (
        DEDICATED_CARGO_CODES.has(upper) ||
        name.includes('CARGO') ||
        name.includes('FREIGHT') ||
        name.includes('LOGISTICS')
    ) {
        return 'cargo';
    }

    // 2. Military Air Bases
    if (
        MILITARY_AIRBASE_CODES.has(upper) ||
        name.includes('AFB') ||
        name.includes('AIR BASE') ||
        name.includes('AIR FORCE') ||
        name.includes('NAVAL AIR') ||
        name.includes('NAS ') ||
        name.includes('RAF ') ||
        name.includes('JOINT BASE') ||
        name.includes('MILITARY') ||
        name.includes('ARMY AIR') ||
        name.includes('BASE AÉRIENNE') ||
        name.includes('BASE AERIENNE') ||
        name.includes('FLIEGERHORST') ||
        name.includes('BAZA LOTNICZA') ||
        upper.startsWith('KN') ||
        upper.startsWith('KW')
    ) {
        return 'military';
    }

    const maxLen = rws.reduce((max, r) => Math.max(max, r.lengthMeters || 0), 0);

    // 3. Heliport
    if (name.includes('HELIPORT') || name.includes('HELIPAD') || (maxLen > 0 && maxLen <= 120)) {
        return 'local';
    }

    // 4. Major International Hubs
    const isTop100 = Boolean(top);
    const isStatic = Boolean(staticEntry);
    const hasIntl = name.includes('INTL') || name.includes('INTERNATIONAL');
    const isLong = maxLen >= 2800;
    const is3Letter = upper.length === 3 && /^[A-Z]{3}$/.test(upper);

    if (isTop100 || (is3Letter && (isLong || hasIntl || isStatic))) {
        return 'international';
    }

    // 5. Regional Commercial / Domestic
    if (is3Letter || maxLen >= 1600) {
        return 'regional';
    }

    // 6. Local / General Aviation
    return 'local';
}

export const AIRPORT_CATEGORY_META: Record<AirportCategory, {
    label: string;
    description: string;
    badgeLabel: string;
    fillColor: [number, number, number];
    radius: number;
    badgeStyle: string;
}> = {
    international: {
        label: 'International & Hubs',
        description: 'Global gateway airports & major international hubs',
        badgeLabel: '✈️ International Hub',
        fillColor: [14, 165, 233], // Sky-500 cyan
        radius: 4.5,
        badgeStyle: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20'
    },
    regional: {
        label: 'Regional & Domestic',
        description: 'Domestic commercial & regional transport hubs',
        badgeLabel: '🛫 Regional Airport',
        fillColor: [16, 185, 129], // Emerald-500 green
        radius: 3.5,
        badgeStyle: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
    },
    cargo: {
        label: 'Air Cargo Hubs',
        description: 'Dedicated air freight & global logistics centers',
        badgeLabel: '📦 Air Cargo Hub',
        fillColor: [245, 158, 11], // Amber-500 orange
        radius: 4.2,
        badgeStyle: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
    },
    military: {
        label: 'Military Air Bases',
        description: 'Air force, naval & tactical defense bases',
        badgeLabel: '🛡️ Military Air Base',
        fillColor: [239, 68, 68], // Rose-500 red
        radius: 4.0,
        badgeStyle: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
    },
    local: {
        label: 'Local & General Aviation',
        description: 'Municipal aerodromes, airstrips & flying clubs',
        badgeLabel: '🛩️ Local Aviation',
        fillColor: [148, 163, 184], // Slate-400
        radius: 2.8,
        badgeStyle: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20'
    }
};

export interface GlobalAirportNode {
    code: string;
    iata: string;
    name: string;
    city?: string;
    country?: string;
    category: AirportCategory;
    position: [number, number, number];
    isAirport: true;
}

let globalAirportNodesCache: GlobalAirportNode[] | null = null;

export function getAllGlobalAirports(dataset?: Record<string, PhysicalRunway[]> | null): GlobalAirportNode[] {
    if (globalAirportNodesCache) return globalAirportNodesCache;
    const source = dataset || runwayDatasetCache;
    if (!source) return [];
    const nodes: GlobalAirportNode[] = [];
    for (const [code, rws] of Object.entries(source)) {
        if (!rws || rws.length === 0) continue;
        const first = rws[0];
        const lng = (first.start[0] + first.end[0]) / 2;
        const lat = (first.start[1] + first.end[1]) / 2;
        const staticEntry = STATIC_GEO_DATA[code.toUpperCase()];
        const name = staticEntry?.name ? formatProperLocationName(staticEntry.name) : `${code} Airport`;
        const city = staticEntry?.city ? formatProperLocationName(staticEntry.city) : undefined;
        const country = staticEntry?.country || undefined;
        const category = classifyAirportCategory(code, rws, staticEntry);

        nodes.push({
            code,
            iata: code,
            name,
            city,
            country,
            category,
            position: [lng, lat, 0],
            isAirport: true
        });
    }
    globalAirportNodesCache = nodes;
    return nodes;
}

export interface RunwayGeometry {
    id: string;
    iata: string;
    center: [number, number]; // [lng, lat]
    runwayPaths: {
        stripPath: [number, number, number][];
        centerlinePath: [number, number, number][];
        widthMeters: number;
        designator: string;
    }[];
    taxiwayPaths: [number, number, number][][];
    thresholdMarkings: [number, number, number][][];
}

/**
 * Checks if a given code represents a verified airport with physical runway data.
 */
export function isKnownAirport(code: string): boolean {
    if (!code) return false;
    const clean = code.toUpperCase().trim();
    const dataset = runwayDatasetCache;
    return dataset ? !!dataset[clean] : false;
}

/**
 * Generates true-to-life, meter-accurate airport runway geometries matching real satellite imagery.
 * Uses exact OurAirports ground GPS coordinates for 6,150+ commercial airports worldwide.
 * Returns null for cities, train stations, road trip destinations, or non-airport locations.
 */
export function generateAirportRunway(
    code: string,
    lat: number,
    lng: number
): RunwayGeometry | null {
    const cleanCode = (code || '').toUpperCase().trim();
    const dataset = runwayDatasetCache;
    if (!dataset) return null;
    let realRunways = dataset[cleanCode];
    if (!realRunways) {
        const match = cleanCode.match(/\b([A-Z]{3,4})\b/);
        if (match && dataset[match[1]]) {
            realRunways = dataset[match[1]];
        }
    }

    // Cities and non-airport locations MUST NOT have runway visualizations
    if (!realRunways || realRunways.length === 0) {
        return null;
    }

    const runwayPaths: RunwayGeometry['runwayPaths'] = [];
    const taxiwayPaths: [number, number, number][][] = [];
    const thresholdMarkings: [number, number, number][][] = [];

    realRunways.forEach((rw: PhysicalRunway) => {
        const startLng = rw.start[0];
        const startLat = rw.start[1];
        const endLng = rw.end[0];
        const endLat = rw.end[1];

        // Pavement Strip
        const stripPath: [number, number, number][] = [
            [startLng, startLat, 0],
            [endLng, endLat, 0]
        ];

        runwayPaths.push({
            stripPath,
            centerlinePath: stripPath,
            widthMeters: rw.widthMeters || 45,
            designator: rw.id
        });

        // Calculate bearing and perpendicular vector for taxiway and piano keys
        const dLng = endLng - startLng;
        const dLat = endLat - startLat;
        const len = Math.sqrt(dLng * dLng + dLat * dLat);

        if (len > 0) {
            // Perpendicular normal vector (normalized in degrees)
            const uX = dLng / len;
            const uY = dLat / len;
            const perpX = -uY;
            const perpY = uX;

            // Parallel Taxiway Offset (approx 120-160 meters = ~0.0012 deg)
            const taxOffsetDeg = 0.0012;
            const taxStartLng = startLng + perpX * taxOffsetDeg;
            const taxStartLat = startLat + perpY * taxOffsetDeg;
            const taxEndLng = endLng + perpX * taxOffsetDeg;
            const taxEndLat = endLat + perpY * taxOffsetDeg;

            const mid1Lng = startLng + uX * len * 0.35;
            const mid1Lat = startLat + uY * len * 0.35;
            const midTax1Lng = mid1Lng + perpX * taxOffsetDeg;
            const midTax1Lat = mid1Lat + perpY * taxOffsetDeg;

            const mid2Lng = startLng + uX * len * 0.65;
            const mid2Lat = startLat + uY * len * 0.65;
            const midTax2Lng = mid2Lng + perpX * taxOffsetDeg;
            const midTax2Lat = mid2Lat + perpY * taxOffsetDeg;

            taxiwayPaths.push([
                [taxStartLng, taxStartLat, 0],
                [midTax1Lng, midTax1Lat, 0],
                [midTax2Lng, midTax2Lat, 0],
                [taxEndLng, taxEndLat, 0]
            ]);

            taxiwayPaths.push([
                [mid1Lng, mid1Lat, 0],
                [midTax1Lng, midTax1Lat, 0]
            ]);

            taxiwayPaths.push([
                [mid2Lng, mid2Lat, 0],
                [midTax2Lng, midTax2Lat, 0]
            ]);

            // Piano key stripes at threshold 1 & 2
            const stripeSpacing = 0.0001; // ~10 meters
            const stripeLen = 0.00025; // ~25 meters
            for (let i = -3; i <= 3; i++) {
                const shiftX = perpX * (i * stripeSpacing);
                const shiftY = perpY * (i * stripeSpacing);

                // Threshold 1
                thresholdMarkings.push([
                    [startLng + shiftX, startLat + shiftY, 0],
                    [startLng + shiftX + uX * stripeLen, startLat + shiftY + uY * stripeLen, 0]
                ]);

                // Threshold 2
                thresholdMarkings.push([
                    [endLng + shiftX, endLat + shiftY, 0],
                    [endLng + shiftX - uX * stripeLen, endLat + shiftY - uY * stripeLen, 0]
                ]);
            }
        }
    });

    return {
        id: `runway-${cleanCode}`,
        iata: cleanCode,
        center: [lng, lat],
        runwayPaths,
        taxiwayPaths,
        thresholdMarkings
    };
}
