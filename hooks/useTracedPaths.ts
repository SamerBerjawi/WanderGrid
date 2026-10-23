import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchMultiModalRoute, getCachedMultiModalRoute } from '../services/multiModalRouting';
import { loadMapAppearanceSettings } from '../types/mapAppearance';

/**
 * The real land and sea geometry for the still maps (journeys, trip header, dashboard). It reads the same
 * routing cache the interactive map draws from (road, rail and shipping lanes, resolved in batches by the
 * backend), asks for the legs it has not seen, and re-renders as each one arrives. A leg with no traced
 * path simply has no entry: the caller keeps its straight or great-circle line. Flights are never traced.
 */

export interface TraceRequest {
    id: string;
    /** The transport mode as saved ('Train', 'Car', 'Ferry'...). Empty or 'Flight' is never traced. */
    mode?: string;
    from: [number, number];
    to: [number, number];
    /** Stops along the way, [longitude, latitude]. */
    via?: [number, number][];
}

/** At most this many legs are asked for at once: more than any page shows, so a big history cannot storm the router. */
export const MAX_TRACE_REQUESTS = 60;

export const isTraceableMode = (mode?: string): boolean => Boolean(mode) && mode!.trim().toLowerCase() !== 'flight';

const waypointsOf = (via?: [number, number][]) => (via || []).map(([lng, lat]) => ({ lat, lng }));

export const useTracedPaths = (requests: TraceRequest[], enabled = true): Map<string, [number, number][]> => {
    const [version, setVersion] = useState(0);
    const on = enabled && loadMapAppearanceSettings().routeTracing !== false;
    // The router keeps one callback per pending leg, so it must outlive any single effect run: tie it to the mount.
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

    useEffect(() => {
        if (!on) return;
        const bump = () => { if (mounted.current) setVersion(v => v + 1); };
        requests.filter(r => isTraceableMode(r.mode)).slice(0, MAX_TRACE_REQUESTS).forEach(r => {
            const wp = waypointsOf(r.via);
            if (!getCachedMultiModalRoute(r.mode, r.from[1], r.from[0], r.to[1], r.to[0], wp)) {
                void fetchMultiModalRoute(r.mode, r.from[1], r.from[0], r.to[1], r.to[0], bump, wp);
            }
        });
    }, [requests, on]);

    // version re-reads the routing cache when a traced leg arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return useMemo(() => {
        const out = new Map<string, [number, number][]>();
        if (!on) return out;
        requests.filter(r => isTraceableMode(r.mode)).slice(0, MAX_TRACE_REQUESTS).forEach(r => {
            const cached = getCachedMultiModalRoute(r.mode, r.from[1], r.from[0], r.to[1], r.to[0], waypointsOf(r.via));
            if (cached) out.set(r.id, cached.map(([lng, lat]) => [lng, lat] as [number, number]));
        });
        return out;
    }, [requests, on, version]);
};
