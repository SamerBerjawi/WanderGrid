import { useState, useEffect, useCallback, useRef } from 'react';

// In-memory global SWR cache to eliminate redundant duplicate fetches and prevent re-render thrashing
const globalQueryCache = new Map<string, { data: any; expiry: number }>();
const inFlightPromises = new Map<string, Promise<any>>();
const CACHE_TTL_MS = 5000; // 5 seconds default TTL per AGENTS.md Section 5

export interface WanderSyncResult<T> {
    data: T | null;
    loading: boolean;
    error: Error | null;
    refetch: (force?: boolean) => Promise<T>;
}

export interface WanderSyncOptions {
    ttlMs?: number;
    enabled?: boolean;
}

/**
 * useWanderSync - A reactive, SWR-inspired cache-first hook for unified state synchronization.
 * It automatically deduplicates parallel requests, enforces in-memory caching with a 5s TTL,
 * stabilizes callback references against closures, and reactively synchronizes on 'wandergrid_db_updated' events.
 */
export function useWanderSync<T>(
    queryKey: string, 
    fetchFn: () => Promise<T>, 
    dependencies: any[] = [],
    options?: WanderSyncOptions
): WanderSyncResult<T> {
    const ttl = options?.ttlMs ?? CACHE_TTL_MS;
    const isEnabled = options?.enabled ?? true;

    // Use ref for fetchFn so inline arrow functions never destabilize executeFetch or trigger infinite re-renders
    const fetchFnRef = useRef(fetchFn);
    fetchFnRef.current = fetchFn;

    const [data, setData] = useState<T | null>(() => {
        const cached = globalQueryCache.get(queryKey);
        if (cached && cached.expiry > Date.now()) {
            return cached.data;
        }
        return null;
    });
    
    const [loading, setLoading] = useState<boolean>(() => !data && isEnabled);
    const [error, setError] = useState<Error | null>(null);

    // Request sequence tracking to guard against race conditions
    const activeRequestIdRef = useRef<number>(0);

    const executeFetch = useCallback(async (force = false): Promise<T> => {
        if (!isEnabled) {
            return (data as T) ?? null as unknown as T;
        }

        // Return valid cached entry immediately if not forced
        if (!force) {
            const cached = globalQueryCache.get(queryKey);
            if (cached && cached.expiry > Date.now()) {
                setData(cached.data);
                setLoading(false);
                return cached.data;
            }
        }
        
        // Deduplicate in-flight parallel network queries for the same key
        if (!force && inFlightPromises.has(queryKey)) {
            try {
                const sharedResult = await inFlightPromises.get(queryKey);
                setData(sharedResult);
                setLoading(false);
                return sharedResult;
            } catch (err) {
                // Allow fallback to individual retry on shared promise error
            }
        }

        const requestId = ++activeRequestIdRef.current;
        setLoading(true);

        const fetchPromise = (async () => {
            try {
                const result = await fetchFnRef.current();
                globalQueryCache.set(queryKey, { data: result, expiry: Date.now() + ttl });
                
                // Only update React state if this request is still the newest active request
                if (requestId === activeRequestIdRef.current) {
                    setData(result);
                    setError(null);
                }
                return result;
            } catch (err: any) {
                if (requestId === activeRequestIdRef.current) {
                    console.error(`[WanderSync] Query key "${queryKey}" fetch failed:`, err);
                    setError(err instanceof Error ? err : new Error(String(err)));
                }
                throw err;
            } finally {
                if (requestId === activeRequestIdRef.current) {
                    setLoading(false);
                }
                inFlightPromises.delete(queryKey);
            }
        })();

        inFlightPromises.set(queryKey, fetchPromise);
        return fetchPromise;
    }, [queryKey, ttl, isEnabled]);

    // Track standard component lifecycle dependencies
    useEffect(() => {
        if (isEnabled) {
            executeFetch(false).catch(() => {});
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [executeFetch, isEnabled, ...dependencies]);

    // Automatically synchronize when database mutations occur anywhere in the application
    useEffect(() => {
        if (!isEnabled) return;

        const handleDbUpdate = (event?: Event) => {
            const customEv = event as CustomEvent;
            // Support selective invalidation if a specific query key was passed in event detail
            if (customEv?.detail?.key && customEv.detail.key !== queryKey) {
                return;
            }
            executeFetch(true).catch(() => {});
        };

        window.addEventListener('wandergrid_db_updated', handleDbUpdate);
        return () => {
            window.removeEventListener('wandergrid_db_updated', handleDbUpdate);
        };
    }, [executeFetch, queryKey, isEnabled]);

    const refetch = useCallback((force = true) => executeFetch(force), [executeFetch]);

    return { data, loading, error, refetch };
}

/**
 * Triggers a global reactive update event to invalidate active useWanderSync cached query states.
 * Optionally pass a specific query key to perform selective cache invalidation.
 */
export function invalidateGlobalWanderCache(queryKey?: string) {
    if (queryKey) {
        globalQueryCache.delete(queryKey);
    } else {
        globalQueryCache.clear();
    }
    window.dispatchEvent(new CustomEvent('wandergrid_db_updated', { detail: { key: queryKey } }));
}

/**
 * Synchronously retrieves cached data if valid.
 */
export function getWanderSyncCachedData<T>(queryKey: string): T | null {
    const cached = globalQueryCache.get(queryKey);
    if (cached && cached.expiry > Date.now()) {
        return cached.data as T;
    }
    return null;
}
