import { useEffect, useState } from 'react';
import { PACKS_CHANGED, listPacks } from '../services/offlinePack';
import type { PackMeta } from '../utils/offlinePack';

/** The trips saved for offline, kept up to date as they are saved and removed (also from another tab). */
export const useOfflinePacks = (): { packs: PackMeta[]; has: (tripId: string) => boolean } => {
    const [packs, setPacks] = useState<PackMeta[]>(() => listPacks());
    useEffect(() => {
        const sync = () => setPacks(listPacks());
        window.addEventListener(PACKS_CHANGED, sync);
        window.addEventListener('storage', sync);
        return () => { window.removeEventListener(PACKS_CHANGED, sync); window.removeEventListener('storage', sync); };
    }, []);
    return { packs, has: id => packs.some(p => p.tripId === id) };
};

/** Whether the browser says it is online, updated as it changes. */
export const useOnline = (): boolean => {
    const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
    useEffect(() => {
        const on = () => setOnline(true), off = () => setOnline(false);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
    }, []);
    return online;
};
