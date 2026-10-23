import { describe, expect, it } from 'vitest';
import type { VisitedItem } from '../../types';
import { buildMergePlan, buildUndoChunks, chunkMergePlan, sectionMergeGroups } from '../../utils/atlasMergePlan';
import { runBatch } from '../../utils/batchRunner';

const CODES = ['FR', 'DE', 'ES', 'IT', 'PT', 'NL', 'BE', 'AT', 'CH', 'SE'];
const cityPair = (i: number): VisitedItem[] => {
    const name = `Testville ${i}`;
    const code = CODES[i % CODES.length];
    return [
        { id: `city_${i}_a`, type: 'city', code: name, name, countryCode: code, lat: 40 + i / 100, lng: 2, visitDate: '2021-01-01', isManual: true, notes: i % 50 === 0 ? `note ${i}` : undefined },
        { id: `city_${i}_b`, type: 'city', code: name, name: name.toUpperCase(), countryCode: 'XX', lat: 40 + i / 100, lng: 2, visitDate: '2023-03-03' },
    ];
};
const countryTriple = (code: string): VisitedItem[] => [
    { id: `country_${code}`, type: 'country', code, name: code, residenceStatus: 'visited', visitDate: '2020-01-01' },
    { id: `dup_${code}_a`, type: 'country', code, name: code, residenceStatus: 'visited', visitDate: '2022-02-02' },
    { id: `dup_${code}_b`, type: 'country', code: code.toLowerCase(), name: code, residenceStatus: 'visited', visitDate: '2021-02-02' },
];

const dataset = (n = 260) => [
    ...CODES.flatMap(countryTriple),
    ...Array.from({ length: n }, (_, i) => cityPair(i)).flat(),
];

describe('buildMergePlan with 250+ duplicates', () => {
    const visited = dataset(260);
    const plan = buildMergePlan(visited);

    it('keeps one record per city and country', () => {
        expect(plan.storedCount).toBe(visited.length);
        expect(plan.afterCount).toBe(260 + CODES.length);
        expect(plan.deleteIds.length).toBe(visited.length - plan.afterCount);
        expect(plan.groups.filter(g => g.kind === 'merge').length).toBe(260 + CODES.length);
    });

    it('never deletes a survivor and never loses a source', () => {
        const upsertIds = new Set(plan.upserts.map(u => u.id));
        expect(plan.deleteIds.some(id => upsertIds.has(id))).toBe(false);
        const touched = new Set([...upsertIds, ...plan.deleteIds]);
        // every stored record is either kept untouched (not here) or folded into a survivor
        visited.forEach(v => expect(touched.has(v.id)).toBe(true));
        plan.groups.forEach(g => expect(g.sources.length).toBeGreaterThan(1));
    });

    it('combines dates, sources and notes in the survivor', () => {
        const c0 = plan.upserts.find(u => u.id === 'city_0_a')!;
        expect(c0.visitDate).toBe('2023-03-03');
        expect(c0.isManual).toBe(true);
        expect(c0.countryCode).toBe(CODES[0]);
        expect(c0.notes).toBe('note 0');
        expect(c0.lat).toBeCloseTo(40);
        const fr = plan.upserts.find(u => u.type === 'country' && u.code === 'FR')!;
        expect(fr.visitDate).toBe('2022-02-02');
    });

    it('groups sources linearly, with the survivor first', () => {
        const g = plan.groups.find(x => x.id === 'city_7_a')!;
        expect(g.sources.map(s => s.id)).toEqual(['city_7_a', 'city_7_b']);
    });

    it('is deterministic and does not mutate its input', () => {
        const before = JSON.stringify(visited);
        expect(buildMergePlan(visited).deleteIds).toEqual(plan.deleteIds);
        expect(JSON.stringify(visited)).toBe(before);
    });

    it('plans 2,000 records quickly', () => {
        const big = dataset(1000);
        const t = performance.now();
        buildMergePlan(big);
        expect(performance.now() - t).toBeLessThan(5000);
    });
});

describe('chunkMergePlan', () => {
    const plan = buildMergePlan(dataset(260));
    const chunks = chunkMergePlan(plan, 100);

    it('covers every upsert and delete exactly once, in steps that stay near the size', () => {
        expect(chunks.length).toBeGreaterThan(5);
        const ups = chunks.flatMap(c => c.upserts.map(u => u.id));
        const dels = chunks.flatMap(c => c.deleteIds);
        expect(new Set(ups).size).toBe(plan.upserts.length);
        expect(ups.length).toBe(plan.upserts.length);
        expect(dels.slice().sort()).toEqual(plan.deleteIds.slice().sort());
        chunks.forEach(c => expect(c.upserts.length + c.deleteIds.length).toBeLessThanOrEqual(100));
    });

    it('keeps a survivor with the records folded into it', () => {
        chunks.forEach(c => {
            const g = plan.groups.filter(x => c.groupIds.includes(x.id));
            g.forEach(group => group.sources.forEach(s => {
                if (s.id !== group.record.id) expect(c.deleteIds).toContain(s.id);
            }));
        });
    });
});

describe('applying a plan in chunks', () => {
    const visited = dataset(260);
    const plan = buildMergePlan(visited);
    const chunks = chunkMergePlan(plan, 100);

    /** An in-memory store with the same semantics as POST /visited/merge. */
    const store = () => {
        const m = new Map(visited.map(v => [v.id, v]));
        return {
            m,
            merge: async (c: { upserts: VisitedItem[]; deleteIds: string[] }) => {
                c.upserts.forEach(u => m.set(u.id, u));
                c.deleteIds.forEach(id => { if (!c.upserts.some(u => u.id === id)) m.delete(id); });
            },
        };
    };

    it('applies everything, reports progress, and leaves one record per place', async () => {
        const s = store();
        const seen: number[] = [];
        const r = await runBatch(chunks, c => s.merge(c), { onProgress: p => seen.push(p.completed) });
        expect(r.done.length).toBe(chunks.length);
        expect(r.failed).toHaveLength(0);
        expect(seen[seen.length - 1]).toBe(chunks.length);
        expect(s.m.size).toBe(plan.afterCount);
        expect(buildMergePlan(Array.from(s.m.values())).count).toBe(0);
    });

    it('tolerates a failed chunk: the rest merge, the failed one is untouched, and Retry finishes it', async () => {
        const s = store();
        let failIndex = 2;
        const apply = async (c: typeof chunks[number], i: number) => {
            if (i === failIndex) throw Object.assign(new Error('Invalid visited record'), { status: 400 });
            await s.merge(c);
        };
        const r = await runBatch(chunks, apply, { sleep: async () => {} });
        expect(r.failed.map(f => f.index)).toEqual([2]);
        expect(r.done.length).toBe(chunks.length - 1);
        // The failed chunk's duplicates are all still there, with no half-applied group.
        chunks[2].deleteIds.forEach(id => expect(s.m.has(id)).toBe(true));
        chunks[2].upserts.forEach(u => expect(s.m.get(u.id)).toEqual(visited.find(v => v.id === u.id)));
        expect(s.m.size).toBeGreaterThan(plan.afterCount);

        failIndex = -1;
        const retry = await runBatch(r.failed.map(f => f.chunk), c => s.merge(c));
        expect(retry.failed).toHaveLength(0);
        expect(s.m.size).toBe(plan.afterCount);
    });

    it('retries a rate-limited chunk before giving up', async () => {
        const s = store();
        let calls = 0;
        const r = await runBatch(chunks.slice(0, 1), async c => {
            calls++;
            if (calls < 3) throw Object.assign(new Error('Too many requests, please try again later.'), { status: 429 });
            await s.merge(c);
        }, { sleep: async () => {} });
        expect(calls).toBe(3);
        expect(r.done).toEqual([0]);
    });

    it('gives up on a persistent rate limit and reports it without losing data', async () => {
        const s = store();
        const r = await runBatch(chunks, async () => { throw Object.assign(new Error('Too many requests'), { status: 429 }); }, { sleep: async () => {} });
        expect(r.failed).toHaveLength(chunks.length);
        expect(s.m.size).toBe(visited.length);
    });

    it('stops when cancelled and reports what is left', async () => {
        const s = store();
        const ctl = new AbortController();
        const r = await runBatch(chunks, async (c, i) => { await s.merge(c); if (i === 1) ctl.abort(); }, { signal: ctl.signal });
        expect(r.cancelled).toBe(true);
        expect(r.done).toEqual([0, 1]);
        expect(r.skipped.length).toBe(chunks.length - 2);
    });

    it('undo restores every record as it was stored', async () => {
        const s = store();
        await runBatch(chunks, c => s.merge(c));
        const undo = buildUndoChunks(plan, chunks);
        await runBatch(undo, c => s.merge(c));
        expect(s.m.size).toBe(visited.length);
        visited.forEach(v => expect(s.m.get(v.id)).toEqual(v));
    });
});

describe('sectionMergeGroups', () => {
    it('shows a handful of sections rather than hundreds of rows', () => {
        const plan = buildMergePlan(dataset(260));
        const sections = sectionMergeGroups(plan.groups, code => code);
        expect(sections[0].type).toBe('country');
        expect(sections.length).toBeLessThanOrEqual(CODES.length + 2);
        expect(sections.reduce((n, s) => n + s.groups.length, 0)).toBe(plan.groups.length);
    });
});
