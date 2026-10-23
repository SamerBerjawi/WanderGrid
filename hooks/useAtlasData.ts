import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trip, VisitedItem } from '../types';
import { dataService } from '../services/mockDb';
import { affectsCollections } from './useWanderSync';
import { refineUKCountry } from '../services/geocoding';
import { mergeCountryRecords, normalizeCountryCode, ukNationsFromCities } from '../services/countryRegistry';
import { buildMergePlan, buildUndoChunks, chunkMergePlan, type MergeChunk } from '../utils/atlasMergePlan';
import { useBatchRun } from './useBatchRun';
import { toast } from '../services/toast';

import {
    CityDraft, CountryDraft, ScanResult, buildTrackedCities, cityRecordFor, countryRecordFor, duplicateIdsOf, isLayoverCountry,
    activityForCountry, isVisitedCountry, isWishlistCountry, promoteToVisited, resolveAirportCity, scanHistory, scanImportRecords, WORLD_COUNTRY_COUNT,
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
    // A batch (merge, find names) writes many records; it reloads once when it is done, not after each write.
    const busy = useRef(false);
    useEffect(() => {
        const onUpdate = (e: Event) => { if (!busy.current && affectsCollections(e, ['visited', 'trips', 'flights'])) void load(); };
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

    // One plan from the stored records. It is rebuilt only when they change, never between merge steps.
    const cleanup = useMemo(() => {
        const plan = buildMergePlan(visited, { ukConstituentsFor: ukNations, resolveAirport: resolveAirportCity });
        return { plan, count: plan.count, duplicates: plan.deleteIds.length, review: plan.groups };
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

    // Merge: the plan is cut into steps of whole groups once, each step is one atomic request, and the page reloads
    // once at the end. `frozen` keeps the plan the run started with, whatever the stored records do meanwhile.
    const mergeRun = useBatchRun<MergeChunk>();
    const frozen = useRef<{ chunks: MergeChunk[]; plan: typeof cleanup.plan; before: number } | null>(null);
    const [mergeUndoable, setMergeUndoable] = useState(false);
    const [mergeSummary, setMergeSummary] = useState<{ before: number; after: number; removed: number } | null>(null);
    const applyChunk = useCallback((chunk: MergeChunk) => dataService.mergeVisited(chunk.upserts, chunk.deleteIds), []);

    const finishBatch = useCallback(async () => {
        await load();
        busy.current = false;
        window.dispatchEvent(new CustomEvent('wandergrid_db_updated', { detail: { collections: ['visited'] } }));
    }, [load]);

    const startMerge = useCallback(async () => {
        if (busy.current) return;
        busy.current = true;
        const plan = cleanup.plan;
        const chunks = chunkMergePlan(plan, 100);
        frozen.current = { chunks, plan, before: plan.storedCount };
        setMergeUndoable(false);
        setMergeSummary({ before: plan.storedCount, after: plan.afterCount, removed: plan.deleteIds.length });
        try {
            await dataService.runQuiet(() => mergeRun.start(chunks, applyChunk, { pauseMs: 150 }));
        } finally { await finishBatch(); }
        setMergeUndoable(true);
    }, [cleanup.plan, mergeRun, applyChunk, finishBatch]);

    const retryMerge = useCallback(async () => {
        if (busy.current || !frozen.current) return;
        busy.current = true;
        try {
            await dataService.runQuiet(() => mergeRun.retry(frozen.current!.chunks, applyChunk, { pauseMs: 150 }));
        } finally { await finishBatch(); }
    }, [mergeRun, applyChunk, finishBatch]);

    const undoMerge = useCallback(async () => {
        const f = frozen.current;
        if (busy.current || !f) return;
        busy.current = true;
        const undo = buildUndoChunks(f.plan, mergeRun.state.doneChunks);
        try {
            const r = await dataService.runQuiet(() => mergeRun.start(undo, applyChunk, { pauseMs: 150 }));
            if (r.failed.length > 0) toast.error(`Undo could not restore ${r.failed.length} ${r.failed.length === 1 ? 'step' : 'steps'}: ${r.failed[0].error}`);
            else toast.success('Merge undone. Your records are back as they were.');
        } finally { await finishBatch(); }
        setMergeUndoable(false);
        setMergeSummary(null);
        frozen.current = null;
        mergeRun.reset();
    }, [mergeRun, applyChunk, finishBatch]);

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

    const activityFor = useCallback((code: string) => activityForCountry(code, trips, flights, roadTrips), [trips, flights, roadTrips]);

    /** Stored record ids, to tell user-added cities from places derived from trips. */
    const storedIds = useMemo(() => new Set(visited.map(v => v.id)), [visited]);
    const hasHistory = trips.length > 0 || flights.length > 0 || roadTrips.length > 0;

    return {
        loading, error, reload: load,
        visited, countries, visitedCountries, layovers, wishlist, cities, storedIds,
        worldShare, cityCountryCount, cleanup, hasHistory,
        saveCountry, saveCity, promote, remove, scan,
        merge: { run: mergeRun.state, start: startMerge, retry: retryMerge, cancel: mergeRun.cancel, undo: undoMerge, undoable: mergeUndoable, reset: mergeRun.reset, summary: mergeSummary }, importScan, activityFor,
    };
};

export type AtlasData = ReturnType<typeof useAtlasData>;
