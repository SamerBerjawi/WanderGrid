import { dataService } from './mockDb';
import type { SharedSnapshot } from '../utils/sharedTrip';

/**
 * Public trip links. The owner's calls (status, turn on, turn off) use the session; the public page's single
 * call uses no session at all. Links need the server: in local mode there is nothing for anyone else to open.
 */

export interface ShareState { token: string | null; createdAt?: string | null }
export type SharedResult = { kind: 'ok'; snapshot: SharedSnapshot } | { kind: 'gone' } | { kind: 'error' };

const session = (): Record<string, string> => {
    try {
        const token = localStorage.getItem('wandergrid_session_token');
        return token ? { Authorization: `Bearer ${token}` } : {};
    } catch { return {}; }
};

const call = async (method: 'GET' | 'POST' | 'DELETE', tripId: string): Promise<ShareState> => {
    const res = await fetch(`/api/trips/${encodeURIComponent(tripId)}/share`, { method, headers: { ...session() } });
    if (!res.ok) {
        const message = await res.json().then(j => j?.error as string | undefined).catch(() => undefined);
        throw new Error(message || 'That did not work. Try again.');
    }
    return res.json();
};

export const linksAvailable = (): boolean => dataService.isDatabaseMode();
export const getShare = (tripId: string) => call('GET', tripId);
export const createShare = (tripId: string) => call('POST', tripId);
export const revokeShare = (tripId: string) => call('DELETE', tripId);

export const shareUrl = (token: string): string => `${window.location.origin}/s/${token}`;

export const loadShared = async (token: string, signal?: AbortSignal): Promise<SharedResult> => {
    try {
        const res = await fetch(`/api/public/trips/${encodeURIComponent(token)}`, { signal, credentials: 'omit' });
        if (res.status === 404) return { kind: 'gone' };
        if (!res.ok) return { kind: 'error' };
        return { kind: 'ok', snapshot: await res.json() };
    } catch (e) {
        if ((e as Error)?.name === 'AbortError') return { kind: 'error' };
        return { kind: 'error' };
    }
};
