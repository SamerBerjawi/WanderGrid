import type { Transport, Trip } from '../types';
import { getCoordinatesSync } from '../services/geocoding';
import { addDays, realTrips, type Leg } from './dashboardModel';
import { carrierLabel, journeyKm, journeyStatus, placeCode } from './journeysModel';
import { TOP_100_AIRPORTS } from './topAviationData';

/**
 * Achievements: stamps earned by how you travel, each with levels. They are counted from what is already in the
 * app (countries, trips, legs and flights) by plain rules, never entered by hand, so they stay true when the
 * log changes. A stamp has a value, the targets for its levels, and how far the next level is. Pure.
 */

export type StampIcon = 'continents' | 'countries' | 'aircraft' | 'airlines' | 'hubs' | 'streak' | 'distance' | 'longest' | 'rail' | 'sea' | 'equator' | 'polar' | 'trips' | 'nights';
export type StampAccent = 'green' | 'navy' | 'plum' | 'rust' | 'sea' | 'ochre';

export interface Stamp {
    id: string;
    title: string;
    /** What it counts, as a sentence fragment ("countries you have been to"). */
    counts: string;
    icon: StampIcon;
    accent: StampAccent;
    /** The word after the figures ("countries", "km"). */
    unit: string;
    value: number;
    /** What each level asks for, ascending. */
    tiers: number[];
    /** Levels reached (0 when none yet). */
    level: number;
    /** The target of the next level; null at the top. */
    next: number | null;
    /** How far along the way to the next level, 0 to 1 (1 at the top). */
    progress: number;
}

export interface AchievementInput {
    today: string;
    /** Codes of the countries you have been to. */
    countries: string[];
    /** A country's continent ("PT" to "Europe"), from the world map. */
    continentOf: (code: string) => string | undefined;
    trips: Trip[];
    legs: Leg[];
    flights: Transport[];
}

export const ORBIT_KM = 40_075;
const CONTINENTS = new Set(['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania']);

/** The airports ranked by traffic, busiest first: the "big hubs". */
const BIG_HUBS = TOP_100_AIRPORTS.slice(0, 25).map(a => a.iata);

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Months in a row with a trip, longest run, counting every month a trip touches up to today. */
export const monthStreak = (trips: Trip[], today: string): number => {
    const months = new Set<number>();
    for (const t of realTrips(trips)) {
        if (t.startDate > today) continue;
        const end = (t.endDate || t.startDate) < today ? t.endDate || t.startDate : today;
        for (let day = t.startDate; day <= end; day = addDays(day, 28)) months.add(Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1);
        months.add(Number(end.slice(0, 4)) * 12 + Number(end.slice(5, 7)) - 1);
    }
    let best = 0, run = 0, prev = -2;
    for (const m of [...months].sort((a, b) => a - b)) {
        run = m === prev + 1 ? run + 1 : 1;
        prev = m;
        best = Math.max(best, run);
    }
    return best;
};

const latOf = (place: string, lat?: number): number | undefined => (lat != null ? lat : getCoordinatesSync(place)?.lat);

/** Flights and legs that crossed the equator: one end north, the other south. */
export const equatorCrossings = (legs: Leg[]): number =>
    legs.filter(l => {
        const a = latOf(l.origin), b = latOf(l.destination);
        return a != null && b != null && ((a > 0 && b < 0) || (a < 0 && b > 0));
    }).length;

/** Distinct places you went to within a polar circle (66.5 degrees from the equator). */
export const polarPlaces = (legs: Leg[]): number => {
    const places = new Set<string>();
    for (const l of legs) {
        const lat = latOf(l.destination);
        if (lat != null && Math.abs(lat) >= 66.5) places.add(norm(l.destination));
    }
    return places.size;
};

const ONE: Record<string, string> = {
    continents: 'continent', countries: 'country', trips: 'trip', nights: 'night', months: 'month', 'aircraft types': 'aircraft type',
    airlines: 'airline', hubs: 'hub', crossings: 'crossing', places: 'place',
};
/** The unit for a count of one ("1 crossing", "1 country"); units like "km" stay as they are. */
export const singular = (unit: string): string => ONE[unit] ?? unit;

const stamp = (s: Omit<Stamp, 'level' | 'next' | 'progress'>): Stamp => {
    const level = s.tiers.filter(t => s.value >= t).length;
    const next = level < s.tiers.length ? s.tiers[level] : null;
    const floor = level === 0 ? 0 : s.tiers[level - 1];
    const progress = next === null ? 1 : Math.max(0, Math.min(1, (s.value - floor) / (next - floor)));
    return { ...s, level, next, progress };
};

const flown = (flights: Transport[], today: string) =>
    flights.filter(f => f.mode === 'Flight' && (f.departureDate || '') <= today && journeyStatus(f).state !== 'cancelled');

export const buildStamps = ({ today, countries, continentOf, trips, legs, flights }: AchievementInput): Stamp[] => {
    const fl = flown(flights, today);
    const real = realTrips(trips).filter(t => t.startDate <= today);
    const continents = new Set(countries.map(continentOf).filter((c): c is string => Boolean(c) && CONTINENTS.has(c as string)));
    const aircraft = new Set(fl.map(f => norm(f.vehicleModel || '')).filter(Boolean));
    const airlines = new Set(fl.map(f => norm(carrierLabel(f))).filter(Boolean));
    const visitedAirports = new Set(fl.flatMap(f => [placeCode(f.origin), placeCode(f.destination)]).filter(c => /^[A-Z]{3}$/.test(c)));
    const hubs = BIG_HUBS.filter(code => visitedAirports.has(code)).length;
    const km = legs.reduce((n, l) => n + l.km, 0);
    const longest = fl.reduce((m, f) => Math.max(m, journeyKm(f)), 0);
    const railKm = legs.filter(l => l.kind === 'rail').reduce((n, l) => n + l.km, 0);
    const seaLegs = legs.filter(l => l.kind === 'sea').length;
    const nights = real.reduce((n, t) => {
        const end = (t.endDate || t.startDate) < today ? t.endDate || t.startDate : today;
        let count = 0;
        for (let day = t.startDate; day < end; day = addDays(day, 1)) count += 1;
        return n + count;
    }, 0);

    return [
        stamp({ id: 'continents', title: 'Continent hopper', counts: 'continents you have been to', icon: 'continents', accent: 'sea', unit: 'continents', value: continents.size, tiers: [2, 3, 4, 5, 6] }),
        stamp({ id: 'countries', title: 'Passport pages', counts: 'countries you have been to', icon: 'countries', accent: 'green', unit: 'countries', value: new Set(countries).size, tiers: [5, 10, 25, 50, 100] }),
        stamp({ id: 'trips', title: 'Frequent traveller', counts: 'trips taken', icon: 'trips', accent: 'navy', unit: 'trips', value: real.length, tiers: [5, 10, 25, 50, 100] }),
        stamp({ id: 'nights', title: 'Away from home', counts: 'nights away', icon: 'nights', accent: 'plum', unit: 'nights', value: nights, tiers: [30, 100, 365, 1000] }),
        stamp({ id: 'streak', title: 'On a roll', counts: 'months in a row with a trip', icon: 'streak', accent: 'ochre', unit: 'months', value: monthStreak(trips, today), tiers: [3, 6, 12, 24] }),
        stamp({ id: 'distance', title: 'Round the world', counts: 'kilometres travelled (40,075 is once round the Earth)', icon: 'distance', accent: 'navy', unit: 'km', value: Math.round(km), tiers: [ORBIT_KM, ORBIT_KM * 2, ORBIT_KM * 5, ORBIT_KM * 10] }),
        stamp({ id: 'longest', title: 'Long haul', counts: 'kilometres in your longest flight', icon: 'longest', accent: 'rust', unit: 'km', value: Math.round(longest), tiers: [5000, 10000, 15000] }),
        stamp({ id: 'aircraft', title: 'Plane spotter', counts: 'kinds of aircraft you have flown', icon: 'aircraft', accent: 'rust', unit: 'aircraft types', value: aircraft.size, tiers: [3, 6, 12, 25] }),
        stamp({ id: 'airlines', title: 'Frequent flyer', counts: 'airlines you have flown', icon: 'airlines', accent: 'sea', unit: 'airlines', value: airlines.size, tiers: [3, 6, 12, 25] }),
        stamp({ id: 'hubs', title: 'Hub collector', counts: 'of the 25 busiest airports you have been through', icon: 'hubs', accent: 'ochre', unit: 'hubs', value: hubs, tiers: [3, 5, 10, 15] }),
        stamp({ id: 'rail', title: 'Rail rover', counts: 'kilometres by train', icon: 'rail', accent: 'green', unit: 'km by rail', value: Math.round(railKm), tiers: [500, 2000, 5000, 10000] }),
        stamp({ id: 'sea', title: 'Sea legs', counts: 'crossings by ferry or cruise', icon: 'sea', accent: 'sea', unit: 'crossings', value: seaLegs, tiers: [1, 3, 10, 25] }),
        stamp({ id: 'equator', title: 'Line crosser', counts: 'times you crossed the equator', icon: 'equator', accent: 'rust', unit: 'crossings', value: equatorCrossings(legs), tiers: [1, 5, 15] }),
        stamp({ id: 'polar', title: 'Polar explorer', counts: 'places within a polar circle', icon: 'polar', accent: 'navy', unit: 'places', value: polarPlaces(legs), tiers: [1, 3, 6] }),
    ];
};

export interface StampTotals { earned: number; possible: number; stampsWithLevel: number }

/** Levels earned out of all the levels there are. */
export const totalsOf = (stamps: Stamp[]): StampTotals => ({
    earned: stamps.reduce((n, s) => n + s.level, 0),
    possible: stamps.reduce((n, s) => n + s.tiers.length, 0),
    stampsWithLevel: stamps.filter(s => s.level > 0).length,
});

/** The stamps closest to their next level, for "Next up" (nearest first, those with nothing yet last). */
export const nextUp = (stamps: Stamp[], limit = 3): Stamp[] =>
    stamps.filter(s => s.next !== null && s.value > 0).sort((a, b) => b.progress - a.progress).slice(0, limit);

/** Roman numerals for levels: I to X. */
export const levelName = (level: number): string => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][level] || String(level);
