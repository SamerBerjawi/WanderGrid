import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trip, VisitedItem } from '../types';
import { dataService } from '../services/mockDb';
import { affectsCollections } from './useWanderSync';
import { refineUKCountry } from '../services/geocoding';
import { mergeCountryRecords, planCountryCleanup, ukNationsFromCities } from '../services/countryRegistry';
import { planCityCleanup } from '../services/cityRegistry';
import {
    CityDraft, CountryDraft, ScanResult, buildTrackedCities, cityRecordFor, countryRecordFor, duplicateIdsOf, isLayoverCountry,
    isVisitedCountry, isWishlistCountry, promoteToVisited, resolveAirportCity, scanHistory, scanImportRecords, WORLD_COUNTRY_COUNT,
} from '../utils/atlasModel';

/**
 * Data and actions for the New Atlas page: visited records, the trips/flights/road trips they derive
 * from, the merged country and city lists, and every write (add, edit, promote, delete, merge, scan).
 */
export const useAtlasData = () => {
    const [visited, setVisited] = useState<VisitedItem[]>([]);
    const [trips, setTrips] = useState<Trip[]>([]);
    const [flights, setFlights] = useState<any[]>([]);
    const [roadTrips, setRoadTrips] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const [v, t, f, r] = await Promise.all([
                dataService.getVisited(), dataService.getTrips(), dataService.getFlights(), dataService.getRoadTrips(),
            ]);
            setVisited(v || []);
            setTrips(t || []);
            setFlights(f || []);
            setRoadTrips(r || []);
            setError(null);
        } catch (e) {
            console.error('Atlas: failed to load', e);
            setError("Couldn't load your atlas. Check your connection and try again.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => {
        const onUpdate = (e: Event) => { if (affectsCollections(e, ['visited', 'trips', 'flights'])) void load(); };
        window.addEventListener('wandergrid_db_updated', onUpdate);
        return () => window.removeEventListener('wandergrid_db_updated', onUpdate);
    }, [load]);

    const ukNations = useCallback(
        () => ukNationsFromCities(visited, name => refineUKCountry(name, 'United Kingdom', 'GB').countryCode),
        [visited]
    );
    const countries = useMemo(() => mergeCountryRecords(visited, { ukConstituentsFor: ukNations }), [visited, ukNations]);
    const cities = useMemo(() => buildTrackedCities(visited, trips, flights, roadTrips), [visited, trips, flights, roadTrips]);
    const visitedCountries = useMemo(() => countries.filter(isVisitedCountry), [countries]);
    const layovers = useMemo(() => countries.filter(isLayoverCountry), [countries]);
    const wishlist = useMemo(() => countries.filter(isWishlistCountry), [countries]);

    const cleanup = useMemo(() => {
        const c = planCountryCleanup(visited, { ukConstituentsFor: ukNations });
        const ci = planCityCleanup(visited, { resolveAirport: resolveAirportCity });
        return {
            upserts: [...c.upserts, ...ci.upserts],
            deleteIds: [...c.deleteIds, ...ci.deleteIds],
            count: c.upserts.length + c.deleteIds.length + ci.upserts.length + ci.deleteIds.length,
        };
    }, [visited, ukNations]);

    const worldShare = Math.round((visitedCountries.length / WORLD_COUNTRY_COUNT) * 1000) / 10;
    const cityCountryCount = useMemo(
        () => new Set(cities.map(c => (c.countryCode || '').toUpperCase()).filter(c => c && c !== 'XX')).size,
        [cities]
    );

    const changed = useCallback(async () => {
        await load();
        window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
    }, [load]);

    const removeDuplicates = useCallback(async (item: VisitedItem) => {
        for (const id of duplicateIdsOf(item, visited)) await dataService.deleteVisited(id);
    }, [visited]);

    const saveCountry = useCallback(async (draft: CountryDraft, editing?: VisitedItem) => {
        const { record, existing } = countryRecordFor(draft, visited, editing);
        if (existing) {
            await dataService.updateVisited(record);
            await removeDuplicates(existing);
        } else {
            await dataService.addVisited(record);
        }
        await changed();
        return record;
    }, [visited, removeDuplicates, changed]);

    const saveCity = useCallback(async (draft: CityDraft, editing?: VisitedItem) => {
        const record = await cityRecordFor(draft, editing);
        if (editing) {
            await dataService.updateVisited(record);
            await removeDuplicates(editing);
        } else {
            await dataService.addVisited(record);
        }
        await changed();
        return record;
    }, [removeDuplicates, changed]);

    const promote = useCallback(async (item: VisitedItem) => {
        await dataService.updateVisited(promoteToVisited(item, isLayoverCountry(item) && !isWishlistCountry(item)));
        await removeDuplicates(item);
        await changed();
    }, [removeDuplicates, changed]);

    const remove = useCallback(async (item: VisitedItem) => {
        await dataService.deleteVisited(item.id);
        await removeDuplicates(item);
        await changed();
    }, [removeDuplicates, changed]);

    const mergeDuplicates = useCallback(async () => {
        const stored = new Set(visited.map(v => v.id));
        for (const record of cleanup.upserts) {
            if (stored.has(record.id)) await dataService.updateVisited(record);
            else await dataService.addVisited(record);
        }
        for (const id of cleanup.deleteIds) await dataService.deleteVisited(id);
        await changed();
    }, [visited, cleanup, changed]);

    const scan = useCallback(
        () => scanHistory(visited, countries, trips, flights, roadTrips),
        [visited, countries, trips, flights, roadTrips]
    );

    const importScan = useCallback(async (result: ScanResult, chosenCountries: Set<string>, chosenCities: Set<string>) => {
        const records = await scanImportRecords(result, chosenCountries, chosenCities, countries);
        if (records.length > 0) {
            await dataService.addVisitedBulk(records);
            await changed();
        }
        return records.length;
    }, [countries, changed]);

    /** Stored record ids, to tell user-added cities from places derived from trips. */
    const storedIds = useMemo(() => new Set(visited.map(v => v.id)), [visited]);
    const hasHistory = trips.length > 0 || flights.length > 0 || roadTrips.length > 0;

    return {
        loading, error, reload: load,
        visited, countries, visitedCountries, layovers, wishlist, cities, storedIds,
        worldShare, cityCountryCount, cleanup, hasHistory,
        saveCountry, saveCity, promote, remove, mergeDuplicates, scan, importScan,
    };
};

export type AtlasData = ReturnType<typeof useAtlasData>;
