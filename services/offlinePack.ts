import type { Trip } from '../types';
import { boxOf, packChanged, packTrip, tilesFor, tileUrl, type PackMeta, type PackSnapshot } from '../utils/offlinePack';

/**
 * Offline trip packs: a trip kept on this device so it can be read with no connection, with the map tiles of the
 * area fetched ahead.
 *
 * - The trip itself (dates, legs with their booking references, seats and terminals, stays, activities, notes) is
 *   saved as a snapshot in localStorage. It is the trip as it was, and it is refreshed whenever the trip changes
 *   while you are online (`syncPacks`), so it never goes stale unnoticed.
 * - The map tiles are simply requested. In the installed app the service worker already keeps what comes from
 *   tiles.openfreemap.org (vite.config.ts, the `openfreemap-tiles` cache), so requesting them is how they get
 *   kept; in a plain browser tab they are only fetched. A pack never needs a connection to be read: the map
 *   behind it is a bonus that works when the tiles were kept.
 */

const INDEX_KEY = 'wandergrid_offline_packs_v1';
const snapshotKey = (id: string) => `wandergrid_offline_pack_${id}`;
export const PACKS_CHANGED = 'wandergrid_offline_packs_changed';

const TILEJSON = 'https://tiles.openfreemap.org/planet';
const STYLES = ['liberty', 'dark', 'positron'].map(n => `https://tiles.openfreemap.org/styles/${n}`);
const TILE_CAP = 300;
const CONCURRENCY = 6;

const readIndex = (): PackMeta[] => {
    try {
        const v = JSON.parse(localStorage.getItem(INDEX_KEY) || '[]');
        return Array.isArray(v) ? v : [];
    } catch { return []; }
};
const writeIndex = (list: PackMeta[]) => {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(PACKS_CHANGED));
};

/** The saved packs, newest first. */
export const listPacks = (): PackMeta[] => readIndex().sort((a, b) => b.savedAt - a.savedAt);

export const getPack = (tripId: string): PackSnapshot | null => {
    try {
        const v = JSON.parse(localStorage.getItem(snapshotKey(tripId)) || 'null');
        return v && v.trip ? (v as PackSnapshot) : null;
    } catch { return null; }
};

export const hasPack = (tripId: string): boolean => readIndex().some(p => p.tripId === tripId);

const metaOf = (trip: Trip, tiles: number, savedAt = Date.now()): PackMeta => ({
    tripId: trip.id, name: trip.name, startDate: trip.startDate, endDate: trip.endDate || trip.startDate, savedAt, tiles,
});

const store = (trip: Trip, tiles: number, savedAt?: number): PackMeta => {
    const meta = metaOf(trip, tiles, savedAt);
    try {
        localStorage.setItem(snapshotKey(trip.id), JSON.stringify({ ...meta, trip: packTrip(trip) } satisfies PackSnapshot));
    } catch {
        throw new Error("There isn't room on this device to keep a copy. Remove another saved trip and try again.");
    }
    writeIndex([...readIndex().filter(p => p.tripId !== trip.id), meta]);
    return meta;
};

/** Requests the tiles (and the basemap styles) for the trip's area; returns how many tiles came back. */
export const warmTiles = async (trip: Trip, onProgress?: (done: number, total: number) => void): Promise<number> => {
    const box = boxOf(trip);
    if (!box || typeof navigator !== 'undefined' && navigator.onLine === false) return 0;
    let template = '';
    try {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 8000);
        const res = await fetch(TILEJSON, { signal: controller.signal });
        window.clearTimeout(timer);
        template = (await res.json())?.tiles?.[0] || '';
    } catch { /* no tile address: only the trip is saved */ }
    if (!template) return 0;
    await Promise.allSettled(STYLES.map(u => fetch(u)));
    const tiles = tilesFor(box, 3, 12, TILE_CAP);
    let done = 0, ok = 0, next = 0;
    const worker = async () => {
        while (next < tiles.length) {
            const tile = tiles[next++];
            try { const res = await fetch(tileUrl(template, tile)); if (res.ok) ok += 1; await res.arrayBuffer(); } catch { /* a missing tile is just a blank square offline */ }
            done += 1;
            onProgress?.(done, tiles.length);
        }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tiles.length) }, worker));
    return ok;
};

/** Keeps the trip offline: the snapshot first (so it exists even if the tiles fail), then the map tiles. */
export const savePack = async (trip: Trip, options: { warm?: boolean; onProgress?: (done: number, total: number) => void } = {}): Promise<PackMeta> => {
    const { warm = true, onProgress } = options;
    let meta = store(trip, 0);
    if (warm) {
        const tiles = await warmTiles(trip, onProgress);
        if (tiles > 0) meta = store(trip, tiles, meta.savedAt);
    }
    return meta;
};

/** Updates a saved copy to the trip as it is now, keeping the tiles it already has. */
export const refreshPack = (trip: Trip): void => {
    const current = readIndex().find(p => p.tripId === trip.id);
    if (current) store(trip, current.tiles);
};

/** Refreshes every saved copy whose live trip has changed. Returns how many it updated. */
export const syncPacks = (trips: Trip[]): number => {
    let updated = 0;
    for (const trip of trips) {
        const saved = getPack(trip.id);
        if (!saved || !packChanged(saved.trip, trip)) continue;
        try { refreshPack(trip); updated += 1; } catch { /* no room: the older copy stays */ }
    }
    return updated;
};

export const removePack = (tripId: string): void => {
    try { localStorage.removeItem(snapshotKey(tripId)); } catch { /* nothing to remove */ }
    writeIndex(readIndex().filter(p => p.tripId !== tripId));
};
