import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EntitlementType, Trip, User, VisitedItem } from '../types';
import { dataService } from '../services/mockDb';
import { refineUKCountry } from '../services/geocoding';
import { mergeCountryRecords, ukNationsFromCities } from '../services/countryRegistry';
import { affectsCollections } from './useWanderSync';
import { buildTrackedCities, isVisitedCountry, isWishlistCountry, promoteToVisited, isLayoverCountry, WORLD_COUNTRY_COUNT } from '../utils/atlasModel';
import { loadStickersProgress, ICONIC_STICKERS } from '../utils/stickersData';
import {
    dayAxis, distanceSeries, flightToday, legsOf, nightsSeries, recentTrips, spendSeries, travelTotals, tripEvents, upNext, upcomingTrips, yearlyRows,
} from '../utils/dashboardModel';
import { todayISO } from '../utils/tripsModel';

/** Longest Metric Card period, in days; the chart needs the same again to compare with. */
const LONGEST_PERIOD = 365;

/**
 * Data for the New Dashboard: trips, flights, visited places, members and leave types, and everything
 * derived from them (totals, daily series, yearly rows, what is next). Refreshes when any of those
 * collections change.
 */
export const useDashboardData = () => {
    const [trips, setTrips] = useState<Trip[]>([]);
    const [flights, setFlights] = useState<any[]>([]);
    const [roadTrips, setRoadTrips] = useState<any[]>([]);
    const [visited, setVisited] = useState<VisitedItem[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [types, setTypes] = useState<EntitlementType[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const [t, f, r, v, u, e] = await Promise.all([
                dataService.getTrips(), dataService.getFlights(), dataService.getRoadTrips(), dataService.getVisited(),
                dataService.getUsers(), dataService.getEntitlementTypes(),
            ]);
            setTrips(t || []);
            setFlights(f || []);
            setRoadTrips(r || []);
            setVisited(v || []);
            setUsers(u || []);
            setTypes(e || []);
            setError(null);
        } catch (err) {
            console.error('Dashboard: failed to load', err);
            setError("Couldn't load your dashboard. Check your connection and try again.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => {
        const onUpdate = (e: Event) => { if (affectsCollections(e, ['trips', 'flights', 'visited', 'users', 'entitlements'])) void load(); };
        window.addEventListener('wandergrid_db_updated', onUpdate);
        return () => window.removeEventListener('wandergrid_db_updated', onUpdate);
    }, [load]);

    const today = todayISO();

    const legs = useMemo(() => legsOf(trips, flights, today), [trips, flights, today]);
    const totals = useMemo(() => travelTotals(trips, legs, today), [trips, legs, today]);

    const countries = useMemo(
        () => mergeCountryRecords(visited, { ukConstituentsFor: () => ukNationsFromCities(visited, name => refineUKCountry(name, 'United Kingdom', 'GB').countryCode) }),
        [visited]
    );
    const visitedCountries = useMemo(() => countries.filter(isVisitedCountry), [countries]);
    const wishlist = useMemo(() => countries.filter(isWishlistCountry), [countries]);
    const cities = useMemo(() => buildTrackedCities(visited, trips, flights, roadTrips), [visited, trips, flights, roadTrips]);

    const axis = useMemo(() => dayAxis(today, LONGEST_PERIOD * 2), [today]);
    const series = useMemo(() => ({
        distance: distanceSeries(legs, axis),
        nights: nightsSeries(trips, axis),
        spend: spendSeries(trips, axis),
    }), [legs, trips, axis]);
    const events = useMemo(() => tripEvents(trips, axis), [trips, axis]);
    const years = useMemo(() => yearlyRows(trips, legs, today), [trips, legs, today]);

    const next = useMemo(() => upNext(trips, today), [trips, today]);
    const upcoming = useMemo(() => upcomingTrips(trips, today), [trips, today]);
    const recent = useMemo(() => recentTrips(trips, today), [trips, today]);
    const flightNow = useMemo(() => flightToday(trips, today), [trips, today]);

    const stickers = useMemo(() => {
        try { return { unlocked: loadStickersProgress(trips).claimsMap.size, total: ICONIC_STICKERS.length }; }
        catch { return { unlocked: 0, total: ICONIC_STICKERS.length }; }
    }, [trips]);

    /** Marks a wishlist country as visited (the deck's "Been there"). */
    const markVisited = useCallback(async (item: VisitedItem) => {
        await dataService.updateVisited(promoteToVisited(item, isLayoverCountry(item) && !isWishlistCountry(item)));
        window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
        await load();
    }, [load]);

    return {
        loading, error, reload: load, today,
        trips, users, types,
        legs, totals,
        countries: visitedCountries, wishlist, cities,
        worldShare: Math.round((visitedCountries.length / WORLD_COUNTRY_COUNT) * 1000) / 10,
        series, events, years,
        next, upcoming, recent, flightNow, stickers,
        markVisited,
        isEmpty: trips.length === 0 && flights.length === 0 && visited.length === 0,
    };
};

export type DashboardData = ReturnType<typeof useDashboardData>;
