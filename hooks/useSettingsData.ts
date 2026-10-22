import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SavedConfig, User, WorkspaceSettings } from '../types';
import { dataService } from '../services/mockDb';
import { affectsCollections } from './useWanderSync';
import { readSessionUser } from './useMemberData';

/**
 * Data and writes for the New settings page: the workspace settings, the members and the saved
 * holiday calendars. The server decides who may change what (settings, members, backups and jobs are
 * admin-only; everyone may read settings and the roster); the page only hides what the server would refuse.
 */
export const useSettingsData = () => {
    const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const [s, u, c] = await Promise.all([
                dataService.getWorkspaceSettings(),
                dataService.getUsers(),
                // Holiday calendars are optional: a failure never blocks the page.
                dataService.getSavedConfigs().catch(() => [] as SavedConfig[]),
            ]);
            setSettings(s);
            setUsers(u || []);
            setSavedConfigs(c || []);
            setError(null);
        } catch (e) {
            console.error('Settings: failed to load', e);
            setError("Couldn't load the settings. Check your connection and try again.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => {
        const onUpdate = (e: Event) => { if (affectsCollections(e, ['settings', 'users', 'configs'])) void load(); };
        window.addEventListener('wandergrid_db_updated', onUpdate);
        return () => window.removeEventListener('wandergrid_db_updated', onUpdate);
    }, [load]);

    const session = readSessionUser();
    const me = useMemo(() => users.find(u => u.id === session?.id), [users, session?.id]);
    const isAdmin = (me?.role ?? session?.role) === 'Admin';

    /**
     * Saves only the fields passed (a PATCH), then reads the settings back so masked keys and where they
     * come from stay right. The page shows the change after the server accepted it.
     */
    const save = useCallback(async (changes: Partial<WorkspaceSettings>) => {
        await dataService.updateWorkspaceSettings(changes);
        setSettings(await dataService.getWorkspaceSettings());
    }, []);

    const saveUser = useCallback(async (next: User) => {
        await dataService.updateUser(next);
        await load();
    }, [load]);

    const addUser = useCallback(async (next: User) => {
        await dataService.addUser(next);
        await load();
    }, [load]);

    const removeUser = useCallback(async (id: string) => {
        await dataService.deleteUser(id);
        await load();
    }, [load]);

    return { settings, users, savedConfigs, loading, error, isAdmin, sessionUserId: session?.id ?? null, reload: load, save, saveUser, addUser, removeUser };
};

export type SettingsData = ReturnType<typeof useSettingsData>;
