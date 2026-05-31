import { useState, useEffect, useCallback } from 'react';

// In-memory global cache to eliminate redundant double-fetches and prevent infinite re-renders
const globalQueryCache = new Map<string, { data: any; expiry: number }>();
const CACHE_TTL_MS = 5000; // 5 seconds default TTL

export interface WanderSyncResult<T> {
    data: T | null;
    loading: boolean;
    error: Error | null;
    refetch: () => Promise<T>;
}

/**
 * useWanderSync - A reactive, local SWR-inspired cache-first hook for unified state synchronization.
 * It automatically debounces redundant render updates, keeps an in-memory cache,
 * and executes a full sync on any written 'wandergrid_db_updated' custom events.
 */
export function useWanderSync<T>(
    queryKey: string, 
    fetchFn: () => Promise<T>, 
    dependencies: any[] = []
): WanderSyncResult<T> {
    const [data, setData] = useState<T | null>(() => {
        const cached = globalQueryCache.get(queryKey);
        if (cached && cached.expiry > Date.now()) {
            return cached.data;
        }
        return null;
    });
    
    const [loading, setLoading] = useState<boolean>(() => !data);
    const [error, setError] = useState<Error | null>(null);

    const executeFetch = useCallback(async (force = false): Promise<T> => {
        if (!force) {
            const cached = globalQueryCache.get(queryKey);
            if (cached && cached.expiry > Date.now()) {
                setData(cached.data);
                setLoading(false);
                return cached.data;
            }
        }
        
        try {
            setLoading(true);
            const result = await fetchFn();
            globalQueryCache.set(queryKey, { data: result, expiry: Date.now() + CACHE_TTL_MS });
            setData(result);
            setError(null);
            return result;
        } catch (err: any) {
            console.error(`[WanderSync] Query key "${queryKey}" fetch failed:`, err);
            setError(err instanceof Error ? err : new Error(String(err)));
            throw err;
        } finally {
            setLoading(false);
        }
    }, [queryKey, fetchFn]);

    // Track standard component lifecycle dependencies
    useEffect(() => {
        executeFetch(false).catch(() => {});
    }, [executeFetch, ...dependencies]);

    // Automatically synchronize when database mutations occur anywhere in the application
    useEffect(() => {
        const handleDbUpdate = () => {
            console.log(`[WanderSync] Database mutation detected. Reactive prefetching query "${queryKey}"...`);
            executeFetch(true).catch(() => {});
        };

        window.addEventListener('wandergrid_db_updated', handleDbUpdate);
        return () => {
            window.removeEventListener('wandergrid_db_updated', handleDbUpdate);
        };
    }, [executeFetch, queryKey]);

    const refetch = useCallback(() => executeFetch(true), [executeFetch]);

    return { data, loading, error, refetch };
}

/**
 * Triggers a global reactive update event to invalidates active useWanderSync cached query states.
 */
export function invalidateGlobalWanderCache() {
    // Clear in-memory query cache immediately so fresh items are loaded
    globalQueryCache.clear();
    window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
}
