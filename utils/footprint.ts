import type { Transport } from '../types';
import { journeyKm, type JourneyRecord } from './journeysModel';

/**
 * Carbon footprint of a journey, one traveller, in kilograms of CO2e. One place for flights and for land
 * and sea, so the two pages agree. These are estimates from distance, mode and (for flights) cabin; they
 * are rounded ballpark figures in the range published by UK DEFRA and the European Environment Agency,
 * not a measurement. Flights exclude the extra warming effect of high-altitude emissions (radiative
 * forcing), which would roughly double them.
 */

/** Grams of CO2e per traveller-kilometre for land and sea (cars assume 1.6 people in the car). */
export const LAND_G_PER_KM: Record<string, number> = { Train: 35, Bus: 27, 'Car Rental': 105, 'Personal Car': 105, Ferry: 115, Cruise: 250 };

/** A flight's grams per kilometre by length: short hops burn more per kilometre (take-off and climb). */
export const flightGramsPerKm = (km: number): number => (km < 500 ? 246 : km < 3700 ? 151 : 148);

/** Premium cabins take more of the plane: the multiplier on an economy seat. */
const CABIN: Record<string, { short: number; long: number }> = {
    Economy: { short: 1, long: 1 }, 'Premium Economy': { short: 1, long: 1.6 }, Business: { short: 1.5, long: 2.9 }, First: { short: 1.5, long: 4 },
};

/** Great-circle distance understates the flown route: DEFRA adds 8%. */
const ROUTING = 1.08;

export const flightKg = (km: number, cabin?: string): number => {
    if (km <= 0) return 0;
    const m = CABIN[cabin || 'Economy'] ?? CABIN.Economy;
    return (km * ROUTING * flightGramsPerKm(km) * (km < 3700 ? m.short : m.long)) / 1000;
};

/** The footprint of one journey in kg (0 when its distance is unknown). */
export const footprintKg = (t: Transport): number => {
    const km = journeyKm(t);
    if (km <= 0) return 0;
    return t.mode === 'Flight' ? flightKg(km, t.travelClass) : (km * (LAND_G_PER_KM[t.mode] ?? 105)) / 1000;
};

export interface FootprintRow { key: string; label: string; kg: number }

export interface Footprint {
    totalKg: number;
    /** By mode for land and sea, by cabin class for flights, biggest first. */
    rows: FootprintRow[];
    /** For land journeys of 100 km or more: what flying the same distance would have added, less what was emitted (never below 0). */
    savedVsFlyingKg: number;
}

export const footprintOf = (items: JourneyRecord[], by: 'mode' | 'cabin'): Footprint => {
    const rows = new Map<string, FootprintRow>();
    let total = 0;
    let saved = 0;
    for (const { flight: t } of items) {
        const kg = footprintKg(t);
        if (kg <= 0) continue;
        total += kg;
        const label = by === 'mode' ? t.mode : t.travelClass || 'Economy';
        const row = rows.get(label) ?? { key: label, label, kg: 0 };
        row.kg += kg;
        rows.set(label, row);
        const km = journeyKm(t);
        if (t.mode !== 'Flight' && km >= 100) saved += Math.max(0, flightKg(km) - kg);
    }
    return { totalKg: Math.round(total), rows: [...rows.values()].sort((a, b) => b.kg - a.kg), savedVsFlyingKg: Math.round(saved) };
};

/** "820 kg" below a tonne, "1.2 t" above. */
export const formatKg = (kg: number): string => (kg >= 1000 ? `${(kg / 1000).toFixed(kg >= 10000 ? 0 : 1)} t` : `${Math.round(kg).toLocaleString('en-US')} kg`);

/** A tree absorbs roughly 22 kg of CO2 a year. */
export const treeYears = (kg: number): number => Math.round(kg / 22);
