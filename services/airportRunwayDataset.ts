// Global airport physical runway coordinates (OurAirports ground truth) — type definitions
export interface PhysicalRunway {
    id: string;
    leIdent: string;
    heIdent: string;
    start: [number, number]; // [lng, lat]
    end: [number, number];   // [lng, lat]
    lengthMeters: number;
    widthMeters: number;
}

// The data itself (OurAirports, ~6k airports) lives in public/data/airport-runways.json and is fetched on
// demand by services/airportRunways.ts: parsing JSON is far cheaper than compiling a 2 MB JS module (PERF-014).
export const RUNWAY_DATASET_URL = '/data/airport-runways.json';
