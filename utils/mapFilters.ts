import type { Trip } from '../types';
import { canonicalCountryName } from '../services/countryRegistry';
import { isPastTrip } from './tripsModel';
import { resolveLegEnd, type LngLat } from './mapPoints';
import type { CountryIndex } from './countryLookup';

export interface CountryOption {
    label: string;
    value: string;
}

export interface MapFilterState {
    statusFilter: 'all' | 'Past' | 'Upcoming' | 'Planning';
    yearFilter: string;
    countryFilter: string[];
    depFilter: string[];
    arrFilter: string[];
    dateFrom: string;
    dateTo: string;
}

type CoordLookup = (name: string) => { lat: number; lng: number } | undefined;

const resolveCountryCodeAt = (
    name: string | undefined,
    lat: unknown,
    lng: unknown,
    countryIndex: CountryIndex,
    lookup: CoordLookup
): { code: string; label: string } | null => {
    const pt: LngLat | null = resolveLegEnd(name, lat, lng, lookup);
    if (!pt) return null;
    const hit = countryIndex.find(pt[0], pt[1]);
    if (!hit?.code) return null;
    return { code: hit.code, label: canonicalCountryName(hit.code, hit.name) };
};

/** Collect sorted unique countries (ISO2 code + canonical name) touched by any transport endpoint. */
export const collectTripCountries = (
    trips: Trip[],
    countryIndex: CountryIndex | null,
    lookup: CoordLookup
): CountryOption[] => {
    if (!countryIndex) return [];
    const byCode = new Map<string, string>();

    for (const trip of trips) {
        for (const tr of trip.transports || []) {
            const o = resolveCountryCodeAt(tr.origin, tr.originLat, tr.originLng, countryIndex, lookup);
            if (o && !byCode.has(o.code)) byCode.set(o.code, o.label);
            const d = resolveCountryCodeAt(tr.destination, tr.destLat, tr.destLng, countryIndex, lookup);
            if (d && !byCode.has(d.code)) byCode.set(d.code, d.label);
        }
    }

    return Array.from(byCode.entries())
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label));
};

/**
 * Filter trips for the map. When `countryFilter` is active, only transports whose origin OR destination
 * is in a selected country (routes from, to, or within the country) are kept.
 */
export const filterTripsForMap = (
    trips: Trip[],
    filters: MapFilterState,
    countryIndex: CountryIndex | null,
    lookup: CoordLookup,
    today: string = new Date().toISOString().split('T')[0]
): Trip[] => {
    const { statusFilter, yearFilter, countryFilter, depFilter, arrFilter, dateFrom, dateTo } = filters;
    const countrySet = countryFilter.length > 0 && countryIndex ? new Set(countryFilter) : null;

    const result: Trip[] = [];

    for (const trip of trips) {
        if (statusFilter !== 'all') {
            const isPast = isPastTrip(trip, today);
            if (statusFilter === 'Past' && !isPast) continue;
            if (statusFilter === 'Upcoming' && (isPast || trip.status !== 'Upcoming')) continue;
            if (statusFilter === 'Planning' && (isPast || trip.status !== 'Planning')) continue;
        }

        if (yearFilter !== 'all') {
            const tripYear = trip.startDate ? new Date(trip.startDate).getFullYear().toString() : '';
            if (tripYear !== yearFilter) continue;
        }

        if (dateFrom && trip.startDate && trip.startDate < dateFrom) continue;
        if (dateTo && trip.endDate && trip.endDate > dateTo) continue;

        let transports = trip.transports || [];

        if (countrySet && countryIndex) {
            transports = transports.filter(tr => {
                const o = resolveCountryCodeAt(tr.origin, tr.originLat, tr.originLng, countryIndex, lookup);
                const d = resolveCountryCodeAt(tr.destination, tr.destLat, tr.destLng, countryIndex, lookup);
                return (o != null && countrySet.has(o.code)) || (d != null && countrySet.has(d.code));
            });
            if (transports.length === 0) continue;
        }

        if (depFilter.length > 0) {
            const hasMatchingOrigin = transports.some(t => t.origin && depFilter.includes(t.origin));
            if (!hasMatchingOrigin) continue;
        }

        if (arrFilter.length > 0) {
            const hasMatchingDest = transports.some(t => t.destination && arrFilter.includes(t.destination));
            if (!hasMatchingDest) continue;
        }

        result.push(countrySet ? { ...trip, transports } : trip);
    }

    return result;
};
