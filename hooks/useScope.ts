import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SCOPE, SCOPE_STORAGE_KEY, parseScope, type Scope, type ScopeUser } from '../utils/scope';

const CHANGED = 'wandergrid_scope_changed';

const readScope = (): Scope => {
    try { return parseScope(localStorage.getItem(SCOPE_STORAGE_KEY)); } catch { return DEFAULT_SCOPE; }
};

/** The signed-in member, from the stored session. */
export const readScopeUser = (): ScopeUser | null => {
    try {
        const u = JSON.parse(localStorage.getItem('wandergrid_session_user') || 'null');
        return u?.id ? { id: u.id, email: u.email, role: u.role } : null;
    } catch { return null; }
};

/**
 * "Mine" or "Everyone" (D-02): one choice for the Dashboard, Flights and Atlas, remembered on this device.
 * Pages that are open at the same time stay in step through a window event.
 */
export const useScope = () => {
    const [scope, setScopeState] = useState<Scope>(readScope);
    useEffect(() => {
        const sync = () => setScopeState(readScope());
        window.addEventListener(CHANGED, sync);
        window.addEventListener('storage', sync);
        return () => { window.removeEventListener(CHANGED, sync); window.removeEventListener('storage', sync); };
    }, []);
    const setScope = useCallback((next: Scope) => {
        try { localStorage.setItem(SCOPE_STORAGE_KEY, next); } catch { /* private mode: keep it for this page only */ }
        setScopeState(next);
        window.dispatchEvent(new Event(CHANGED));
    }, []);
    return { scope, setScope, user: readScopeUser() };
};
