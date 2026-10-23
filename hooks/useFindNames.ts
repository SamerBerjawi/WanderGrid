import { useCallback, useMemo, useRef, useState } from 'react';
import type { VisitedItem } from '../types';
import type { AtlasData } from './useAtlasData';
import { useBatchRun } from './useBatchRun';
import { reverseGeocode, type ReversePlace } from '../services/reverseGeocode';
import { isUnknownPlaceName } from '../services/cityRegistry';
import { chunkNamePlan, namePlanSize, planNameWriteBack, undoNameChunks, type NameChoice, type NameChunk, type NamePlan } from '../utils/atlasSources';
import { dataService } from '../services/mockDb';
import { runBatch } from '../utils/batchRunner';
import { toast } from '../services/toast';

export interface NameProposal {
    city: VisitedItem;
    place: ReversePlace | null;
    /** What will be written; the person can edit it. */
    name: string;
    include: boolean;
}

/** Pause between lookups: polite to the geocoders and under the API's rate limit. */
const LOOKUP_PAUSE_MS = 350;

/**
 * "Find names" for all unknown places at once. Two steps, both chunked, cancellable and with progress:
 * 1. look up each place's coordinates (one at a time, fail-quiet per place), which gives proposals to review;
 * 2. write the accepted names into the atlas and the trips they come from, as one planned batch with Undo.
 * Nothing is written in step 1.
 */
export const useFindNames = (data: AtlasData) => {
    const lookup = useBatchRun<VisitedItem>();
    const apply = useBatchRun<NameChunk>();
    const [proposals, setProposals] = useState<NameProposal[]>([]);
    const [applied, setApplied] = useState<{ plan: NamePlan; chunks: NameChunk[] } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const planRef = useRef<{ plan: NamePlan; chunks: NameChunk[] } | null>(null);

    const candidates = useMemo(
        () => data.unknownCities.filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lng)),
        [data.unknownCities]
    );

    const find = useCallback(async () => {
        setProposals([]);
        setApplied(null);
        setError(null);
        apply.reset();
        const found = new Map<string, NameProposal>();
        await lookup.start(candidates, async city => {
            const place = await reverseGeocode(city.lat as number, city.lng as number);
            found.set(city.id, { city, place, name: place?.name || '', include: !!place && !isUnknownPlaceName(place.name) });
            setProposals(Array.from(found.values()));
        }, { pauseMs: LOOKUP_PAUSE_MS, retries: 1, retryDelayMs: 2000 });
    }, [candidates, lookup, apply]);

    const edit = useCallback((id: string, patch: Partial<Pick<NameProposal, 'name' | 'include'>>) => {
        setProposals(list => list.map(p => (p.city.id === id ? { ...p, ...patch } : p)));
    }, []);

    const chosen = useMemo(() => proposals.filter(p => p.include && p.name.trim() && !isUnknownPlaceName(p.name)), [proposals]);

    const buildPlan = useCallback(async () => {
        const records = await data.freshRecords();
        const choices: NameChoice[] = chosen.map(p => {
            const text = p.name.trim();
            const country = p.place && p.place.countryCode !== 'XX' ? { code: p.place.countryCode, name: p.place.countryName } : undefined;
            return {
                sources: data.sourcesFor(p.city), city: text, display: country ? `${text}, ${country.name}` : text, country,
                lat: p.city.lat, lng: p.city.lng,
            };
        });
        return planNameWriteBack(choices, records);
    }, [chosen, data]);

    const writeNames = useCallback(async () => {
        setError(null);
        try {
            const plan = await buildPlan();
            if (namePlanSize(plan) === 0) { setError('Nothing to change: these records have changed since. Look up the names again.'); return; }
            const chunks = chunkNamePlan(plan, 25);
            planRef.current = { plan, chunks };
            await dataService.runQuiet(() => apply.start(chunks, c => dataService.applyNameStep(c), { pauseMs: 100 }));
            setApplied({ plan, chunks });
            await data.reload();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not save the names.');
        }
    }, [buildPlan, apply, data]);

    const retry = useCallback(async () => {
        const ref = planRef.current;
        if (!ref) return;
        await dataService.runQuiet(() => apply.retry(ref.chunks, c => dataService.applyNameStep(c), { pauseMs: 100 }));
        await data.reload();
    }, [apply, data]);

    const undo = useCallback(async () => {
        const ref = planRef.current;
        if (!ref) return;
        const done = apply.state.doneChunks;
        const r = await dataService.runQuiet(() => runBatch(undoNameChunks(ref.plan, done), c => dataService.applyNameStep(c), { pauseMs: 100 }));
        if (r.failed.length > 0) toast.error(`Undo could not restore everything: ${r.failed[0].error}`);
        else toast.success('Names restored.');
        setApplied(null);
        apply.reset();
        await data.reload();
    }, [apply, data]);

    const reset = useCallback(() => {
        lookup.reset();
        apply.reset();
        setProposals([]);
        setApplied(null);
        setError(null);
        planRef.current = null;
    }, [lookup, apply]);

    return { candidates, lookup, apply, proposals, chosen, applied, error, find, edit, writeNames, retry, undo, reset };
};

export type FindNames = ReturnType<typeof useFindNames>;
