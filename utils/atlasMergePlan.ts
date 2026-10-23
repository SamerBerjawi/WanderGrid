import type { VisitedItem } from '../types';
import { planCountryCleanup, resolveCountryCode, type MergeOptions } from '../services/countryRegistry';
import { planCityCleanup, type CityMergeOptions } from '../services/cityRegistry';

/**
 * The Atlas merge as data. `buildMergePlan` runs once on the stored records and says which records survive,
 * which stored records fold into each, and which are removed; nothing else is computed while the merge is
 * applied, so a refetch in the middle of a merge can never change the plan. Pure and linear in the number of
 * records. `chunkMergePlan` cuts the plan into steps that each contain whole groups (a survivor together with
 * the records folded into it), `buildUndoChunks` turns a finished plan back into the steps that restore the
 * records as they were stored.
 */

export type MergeGroupKind = 'merge' | 'update' | 'remove';

export interface MergeGroup {
    id: string;
    kind: MergeGroupKind;
    /** The record that is written (or, for 'remove', the one that goes). */
    record: VisitedItem;
    /** The stored records behind it, the survivor first. */
    sources: VisitedItem[];
}

export interface MergePlan {
    upserts: VisitedItem[];
    deleteIds: string[];
    groups: MergeGroup[];
    /** Stored records before the merge: `before` of the plan, used for the summary and the undo. */
    storedCount: number;
    /** Records the atlas holds once the plan is applied. */
    afterCount: number;
    count: number;
}

export interface MergeChunk {
    groupIds: string[];
    upserts: VisitedItem[];
    deleteIds: string[];
}

export type MergePlanOptions = MergeOptions & CityMergeOptions;

const notesOf = (sources: VisitedItem[]) => sources.find(s => s.notes)?.notes;

export const buildMergePlan = (visited: VisitedItem[] | null | undefined, options: MergePlanOptions = {}): MergePlan => {
    const stored = (visited || []).filter(v => v && v.id);
    const byId = new Map(stored.map(v => [v.id, v]));
    const countries = planCountryCleanup(stored, options);
    const cities = planCityCleanup(stored, options);

    const folds: Record<string, string[]> = { ...countries.folds, ...cities.folds };
    const deleteSet = new Set([...countries.deleteIds, ...cities.deleteIds]);
    const covered = new Set<string>();
    const groups: MergeGroup[] = [];

    const upserts = [...countries.upserts, ...cities.upserts].map(record => {
        // A city keeps the notes of whichever folded record had them.
        if (record.type === 'city' && !record.notes) {
            const notes = notesOf((folds[record.id] || []).map(id => byId.get(id)).filter((s): s is VisitedItem => !!s));
            if (notes) return { ...record, notes };
        }
        return record;
    });

    upserts.forEach(record => {
        const sources: VisitedItem[] = [];
        const own = byId.get(record.id);
        if (own) sources.push(own);
        (folds[record.id] || []).forEach(id => { const s = byId.get(id); if (s && s !== own) sources.push(s); });
        // Records deleted without being listed as folded into this one (UK parents, renamed duplicates).
        sources.forEach(s => covered.add(s.id));
        groups.push({ id: record.id, kind: sources.length > 1 ? 'merge' : 'update', record, sources });
    });

    const upsertIds = new Set(upserts.map(u => u.id));
    const deleteIds = Array.from(deleteSet).filter(id => byId.has(id) && !upsertIds.has(id));
    deleteIds.filter(id => !covered.has(id)).forEach(id => {
        const s = byId.get(id)!;
        groups.push({ id: `remove_${id}`, kind: 'remove', record: s, sources: [s] });
    });

    const newCount = upserts.filter(u => !byId.has(u.id)).length;
    return {
        upserts, deleteIds, groups,
        storedCount: stored.length,
        afterCount: stored.length - deleteIds.length + newCount,
        count: upserts.length + deleteIds.length,
    };
};

/** Cuts a plan into steps of about `size` records. A group is never split, so a step is complete on its own. */
export const chunkMergePlan = (plan: MergePlan, size = 100): MergeChunk[] => {
    const upsertById = new Map(plan.upserts.map(u => [u.id, u]));
    const chunks: MergeChunk[] = [];
    let current: MergeChunk = { groupIds: [], upserts: [], deleteIds: [] };
    let weight = 0;
    const flush = () => {
        if (current.groupIds.length > 0) chunks.push(current);
        current = { groupIds: [], upserts: [], deleteIds: [] };
        weight = 0;
    };
    plan.groups.forEach(group => {
        const upsert = upsertById.get(group.id);
        const removes = group.kind === 'remove' ? [group.record.id] : group.sources.map(s => s.id).filter(id => id !== group.record.id && plan.deleteIds.includes(id));
        const w = (upsert ? 1 : 0) + removes.length;
        if (weight > 0 && weight + w > size) flush();
        current.groupIds.push(group.id);
        if (upsert) current.upserts.push(upsert);
        current.deleteIds.push(...removes);
        weight += w;
    });
    flush();
    return chunks;
};

/**
 * The steps that put the records back as they were stored: every folded record is written again, and a record
 * the merge created (a split UK nation) is removed. Versions are dropped so the restore is not a conflict with
 * the version the merge wrote.
 */
export const buildUndoChunks = (plan: MergePlan, done: MergeChunk[]): MergeChunk[] => {
    const storedById = new Map<string, VisitedItem>();
    plan.groups.forEach(g => g.sources.forEach(s => storedById.set(s.id, s)));
    return done.map(chunk => {
        const restore = new Map<string, VisitedItem>();
        const created: string[] = [];
        chunk.upserts.forEach(u => { if (!storedById.has(u.id)) created.push(u.id); });
        const ids = new Set<string>([...chunk.upserts.map(u => u.id), ...chunk.deleteIds]);
        ids.forEach(id => {
            const original = storedById.get(id);
            if (original) { const { version: _v, ...rest } = original as VisitedItem & { version?: number }; restore.set(id, rest as VisitedItem); }
        });
        return { groupIds: chunk.groupIds, upserts: Array.from(restore.values()), deleteIds: created };
    });
};

/** Review rows by country, so the drawer can show a handful of groups instead of hundreds of rows. */
export interface ReviewSection {
    key: string;
    label: string;
    code: string;
    type: 'country' | 'city';
    groups: MergeGroup[];
}

export const sectionMergeGroups = (groups: MergeGroup[], countryName: (code: string) => string): ReviewSection[] => {
    const sections = new Map<string, ReviewSection>();
    const add = (key: string, label: string, code: string, type: 'country' | 'city', g: MergeGroup) => {
        const section = sections.get(key);
        if (section) section.groups.push(g); else sections.set(key, { key, label, code, type, groups: [g] });
    };
    groups.forEach(g => {
        if (g.record.type === 'country') { add('countries', 'Countries', '', 'country', g); return; }
        const code = (g.record.countryCode || '').toUpperCase();
        const known = code && code !== 'XX' ? code : '';
        add(`city:${known || 'unknown'}`, known ? countryName(known) : 'Country not known', known, 'city', g);
    });
    const list = Array.from(sections.values());
    const rank = (s: ReviewSection) => (s.type === 'country' ? 0 : s.code ? 1 : 2);
    return list.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
};

export { resolveCountryCode };
