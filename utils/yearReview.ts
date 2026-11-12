import type { Transport, Trip } from '../types';
import { getCoordinatesSync } from '../services/geocoding';
import { addDays, realTrips, type Leg, type LegKind } from './dashboardModel';
import { footprintKg, treeYears } from './footprint';
import { carrierLabel, journeyKm, journeyMinutes, journeyStatus, placeCode } from './journeysModel';
import { isFlightLeg } from './legMode';

/**
 * The figures behind Year in review: what a calendar year of travel added up to, and which story slides
 * have anything to say. Pure: the caller passes the trips, legs and flights it already has, so the
 * figures and the slide list are unit-tested without a screen.
 */

export interface ReviewInput {
    year: number;
    today: string;
    trips: Trip[];
    /** Every leg that has happened (utils/dashboardModel `legsOf`). */
    legs: Leg[];
    /** Every flight, from trips and independent (dataService.getFlights). */
    flights: Transport[];
    /** The home country code (from the workspace's starting airport). Coming back to it is not a visit. Without one, the country you most often set off from is used. */
    home?: string;
    /** Leave days used on trips this year, and what is left, when the member has a leave policy. */
    leave?: { days: number; allowance: number; left: number } | null;
}

export interface Tally { label: string; count: number }
export interface ReviewFlight { from: string; to: string; km: number; minutes: number; identifier: string; date: string }

export interface YearReview {
    year: number;
    trips: number;
    /** Nights away that fall in the year. */
    nights: number;
    km: number;
    /** Times round the Earth. */
    orbits: number;
    /** Kilometres by kind of leg (flight, rail, road, sea). */
    kmByKind: Record<LegKind, number>;
    flights: number;
    flightMinutes: number;
    /** Country codes visited this year, and the ones never seen before it. */
    countries: string[];
    newCountries: string[];
    /** Nights away in each month, January first. */
    monthNights: number[];
    busiestMonth: { month: number; nights: number } | null;
    longestTrip: { name: string; nights: number } | null;
    longestFlight: ReviewFlight | null;
    topRoute: (Tally & { from: string; to: string }) | null;
    topAirline: Tally | null;
    topAircraft: Tally | null;
    topAirport: Tally | null;
    co2Kg: number;
    trees: number;
    leave: { days: number; allowance: number; left: number } | null;
    /** The year before, for "up 24% on 2025"; null when it had no travel. */
    before: { km: number; trips: number; nights: number } | null;
}

const emptyKinds = (): Record<LegKind, number> => ({ flight: 0, rail: 0, road: 0, sea: 0 });

/** Nights of a trip by calendar month, for the days that fall in `year`, never counting past `today`. */
const nightsInYear = (trip: Trip, year: number, today: string): number[] => {
    const months = new Array(12).fill(0);
    if (!trip.startDate) return months;
    const lastNight = (trip.endDate || trip.startDate) < today ? trip.endDate || trip.startDate : today;
    for (let day = trip.startDate; day < lastNight; day = addDays(day, 1)) {
        if (day.startsWith(String(year))) months[Number(day.slice(5, 7)) - 1] += 1;
    }
    return months;
};

const top = (counts: Map<string, number>): Tally | null => {
    let best: Tally | null = null;
    for (const [label, count] of counts) if (!best || count > best.count || (count === best.count && label < best.label)) best = { label, count };
    return best;
};
const bump = (m: Map<string, number>, key: string) => m.set(key, (m.get(key) || 0) + 1);

const countryOf = (place?: string): string | undefined => {
    const code = place ? getCoordinatesSync(place)?.countryCode : undefined;
    return code ? code.toUpperCase() : undefined;
};

/** The first date each country is seen on a trip or leg (a trip's own country, or where a leg went). */
const firstSeen = (trips: Trip[], legs: Leg[]): Map<string, string> => {
    const seen = new Map<string, string>();
    const note = (code: string | undefined, date: string | undefined) => {
        if (!code || !date) return;
        const prev = seen.get(code);
        if (!prev || date < prev) seen.set(code, date);
    };
    for (const t of realTrips(trips)) note(t.coordinates?.countryCode?.toUpperCase(), t.startDate);
    for (const l of legs) { note(countryOf(l.destination), l.date); note(countryOf(l.origin), l.date); }
    return seen;
};

/** Where most journeys set off from: home, for the purpose of "countries visited". */
export const homeCountryOf = (legs: Leg[]): string | undefined => {
    const counts = new Map<string, number>();
    for (const l of legs) { const c = countryOf(l.origin); if (c) bump(counts, c); }
    return top(counts)?.label;
};

/** The country code of a place such as the workspace's starting airport ("BRU" → "BE"). */
export const countryCodeOfPlace = (place?: string): string | undefined => countryOf(place);

const flightsIn = (flights: Transport[], year: number, today: string): Transport[] =>
    flights.filter(f => isFlightLeg(f) && (f.departureDate || '').startsWith(String(year)) && f.departureDate <= today && journeyStatus(f).state !== 'cancelled');

const totalsFor = (trips: Trip[], legs: Leg[], year: number, today: string) => {
    const nights = realTrips(trips).reduce((n, t) => n + nightsInYear(t, year, today).reduce((a, b) => a + b, 0), 0);
    const tripCount = realTrips(trips).filter(t => t.startDate.startsWith(String(year)) && t.startDate <= today).length;
    const km = legs.filter(l => l.date.startsWith(String(year))).reduce((n, l) => n + l.km, 0);
    return { nights, trips: tripCount, km: Math.round(km) };
};

export const buildReview = ({ year, today, trips, legs, flights, home: homeCode, leave = null }: ReviewInput): YearReview => {
    const ys = String(year);
    const mine = realTrips(trips).filter(t => t.startDate <= today);
    const monthNights = new Array(12).fill(0);
    let longestTrip: YearReview['longestTrip'] = null;
    for (const t of mine) {
        const m = nightsInYear(t, year, today);
        m.forEach((n, i) => { monthNights[i] += n; });
        const n = m.reduce((a, b) => a + b, 0);
        if (n > 0 && (!longestTrip || n > longestTrip.nights)) longestTrip = { name: t.name, nights: n };
    }
    const busiest = monthNights.reduce((best, n, i) => (n > best.nights ? { month: i, nights: n } : best), { month: -1, nights: 0 });

    const yearLegs = legs.filter(l => l.date.startsWith(ys));
    const kmByKind = emptyKinds();
    for (const l of yearLegs) kmByKind[l.kind] += l.km;
    const t = totalsFor(trips, legs, year, today);

    const seen = firstSeen(trips, legs);
    const home = homeCode?.toUpperCase() || homeCountryOf(legs);
    const countries = [...new Set([
        ...mine.filter(x => x.startDate.startsWith(ys) || (x.startDate < `${ys}-01-01` && (x.endDate || '') >= `${ys}-01-01`)).map(x => x.coordinates?.countryCode?.toUpperCase()),
        ...yearLegs.map(l => countryOf(l.destination)).filter(c => c !== home),
    ].filter((c): c is string => Boolean(c)))].sort();
    const newCountries = countries.filter(c => (seen.get(c) || '').startsWith(ys));

    const fl = flightsIn(flights, year, today);
    let longestFlight: ReviewFlight | null = null;
    const routes = new Map<string, { count: number; from: string; to: string }>();
    const airlines = new Map<string, number>();
    const aircraft = new Map<string, number>();
    const airports = new Map<string, number>();
    let flightMinutes = 0;
    let co2 = 0;
    for (const f of fl) {
        const km = journeyKm(f);
        const minutes = journeyMinutes(f);
        flightMinutes += minutes;
        co2 += footprintKg(f);
        if (km > 0 && (!longestFlight || km > longestFlight.km)) longestFlight = { from: placeCode(f.origin), to: placeCode(f.destination), km: Math.round(km), minutes, identifier: f.identifier || '', date: f.departureDate };
        const a = placeCode(f.origin), b = placeCode(f.destination);
        if (a !== b) {
            const [from, to] = a < b ? [a, b] : [b, a];
            const key = `${from}-${to}`;
            const row = routes.get(key) ?? { count: 0, from, to };
            row.count += 1;
            routes.set(key, row);
        }
        const airline = carrierLabel(f);
        if (airline) bump(airlines, airline);
        if (f.vehicleModel?.trim()) bump(aircraft, f.vehicleModel.trim());
        for (const p of [f.origin, f.destination]) if (p?.trim()) bump(airports, placeCode(p));
    }
    const bestRoute = [...routes.entries()].sort((x, y) => y[1].count - x[1].count || x[0].localeCompare(y[0]))[0];

    const prev = totalsFor(trips, legs, year - 1, today);
    return {
        year,
        trips: t.trips,
        nights: t.nights,
        km: t.km,
        orbits: t.km / 40_075,
        kmByKind,
        flights: fl.length,
        flightMinutes,
        countries,
        newCountries,
        monthNights,
        busiestMonth: busiest.month >= 0 ? busiest : null,
        longestTrip,
        longestFlight,
        topRoute: bestRoute ? { label: `${bestRoute[1].from} ↔ ${bestRoute[1].to}`, count: bestRoute[1].count, from: bestRoute[1].from, to: bestRoute[1].to } : null,
        topAirline: top(airlines),
        topAircraft: top(aircraft),
        topAirport: top(airports),
        co2Kg: Math.round(co2),
        trees: treeYears(co2),
        leave: leave && leave.days > 0 ? leave : null,
        before: prev.km > 0 || prev.trips > 0 || prev.nights > 0 ? prev : null,
    };
};

/** Percent change from `before` to `now`, whole numbers; null when there is nothing to compare or it is under 5%. */
export const percentChange = (now: number, before: number | undefined): number | null => {
    if (!before || before <= 0) return null;
    const pct = Math.round(((now - before) / before) * 100);
    return Math.abs(pct) >= 5 ? pct : null;
};

export type SlideKind = 'intro' | 'distance' | 'time' | 'places' | 'longest' | 'favourites' | 'carbon' | 'leave' | 'outro';

/** The slides with something to say, in order: a quiet year skips what it has no figures for. */
export const slidesFor = (r: YearReview): SlideKind[] => {
    const slides: SlideKind[] = ['intro'];
    if (r.km > 0) slides.push('distance');
    if (r.nights > 0 || r.trips > 0) slides.push('time');
    if (r.countries.length > 0) slides.push('places');
    if (r.longestFlight) slides.push('longest');
    if (r.topRoute || r.topAirline || r.topAircraft || r.topAirport) slides.push('favourites');
    if (r.co2Kg > 0) slides.push('carbon');
    if (r.leave) slides.push('leave');
    slides.push('outro');
    return slides;
};

/** Whether the year has any travel to look back on. */
export const hasTravel = (r: YearReview): boolean => r.km > 0 || r.trips > 0 || r.nights > 0 || r.flights > 0;

/** Years with travel, newest first: the choices for Year in review. */
export const reviewYears = (trips: Trip[], legs: Leg[], today: string): number[] => {
    const years = new Set<number>();
    for (const t of realTrips(trips)) if (t.startDate <= today) years.add(Number(t.startDate.slice(0, 4)));
    for (const l of legs) if (l.km > 0) years.add(Number(l.date.slice(0, 4)));
    return [...years].filter(y => Number.isFinite(y) && y <= Number(today.slice(0, 4))).sort((a, b) => b - a);
};

/** The month's name in the browser's language, for "March was your busiest month". */
export const monthName = (month: number, year: number): string => new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month, 1)));

/** A country's name from its code ("PT" → "Portugal"). */
export const countryName = (code: string): string => {
    try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code; } catch { return code; }
};
