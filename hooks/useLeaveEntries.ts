import { useCallback, useEffect, useState } from 'react';
import type { LeaveEntry } from '../types';
import { dataService } from '../services/mockDb';
import { affectsCollections } from './useWanderSync';

/**
 * Every member's leave entries (leave Phase 1), for a page that shows or counts leave. Reloads when leave changes
 * anywhere (or after a restore). Failing to load leaves the list empty rather than blocking the page.
 */
export const useLeaveEntries = () => {
    const [leave, setLeave] = useState<LeaveEntry[]>([]);
    const [loaded, setLoaded] = useState(false);

    const load = useCallback(async () => {
        try { setLeave(await dataService.getLeave()); } catch (e) { console.warn('Leave: failed to load', e); }
        finally { setLoaded(true); }
    }, []);

    useEffect(() => {
        void load();
        const onUpdate = (e: Event) => { if (affectsCollections(e, ['leave', 'trips', 'users'])) void load(); };
        window.addEventListener('wandergrid_db_updated', onUpdate);
        return () => window.removeEventListener('wandergrid_db_updated', onUpdate);
    }, [load]);

    return { leave, loaded, reload: load, setLeave };
};
