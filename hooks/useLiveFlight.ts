import { useCallback, useEffect, useRef, useState } from 'react';
import type { FlightStatusResponse, Transport } from '../types';
import { flightTracker } from '../services/flightTracker';
import { dataService } from '../services/mockDb';
import { errorMessage } from '../services/toast';

/**
 * Follows one flight: asks the flight data engines for its status (the free open radar first; AeroDataBox or
 * AviationStack when the workspace has a key), once on demand and, with `auto`, again every minute while
 * the page is visible. A new flight starts clean. `refresh` rejects on failure so a button can show it.
 */

type Provider = 'adsbdb' | 'aviationstack' | 'aerodatabox';
interface Engine { provider: Provider; key: string }

let engineCache: Promise<Engine> | null = null;
const loadEngine = (): Promise<Engine> => {
    if (!engineCache) {
        engineCache = dataService.getWorkspaceSettings().then(s => {
            // The server masks paid keys, so a non-empty value (or the configured flag) means "set up".
            const configured = (k: 'aviationStackApiKey' | 'aeroDataBoxApiKey') => s[k] || (s.configuredKeys?.[k] ? '••••••••' : '');
            const aero = configured('aeroDataBoxApiKey');
            const avi = configured('aviationStackApiKey');
            return aero ? { provider: 'aerodatabox' as const, key: aero } : avi ? { provider: 'aviationstack' as const, key: avi } : { provider: 'adsbdb' as const, key: '' };
        }).catch(() => ({ provider: 'adsbdb' as const, key: '' }));
    }
    return engineCache;
};

export const useLiveFlight = (flight: Transport | null, auto: boolean, intervalMs = 60_000) => {
    const [data, setData] = useState<FlightStatusResponse | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [updatedAt, setUpdatedAt] = useState<number | null>(null);
    const id = flight?.id;
    const flightRef = useRef(flight);
    flightRef.current = flight;
    const busy = useRef(false);

    const refresh = useCallback(async () => {
        const f = flightRef.current;
        if (!f || busy.current) return;
        busy.current = true;
        setLoading(true);
        setError('');
        try {
            const ident = `${f.providerCode || ''}${f.identifier || ''}`.replace(/\s/g, '') || f.identifier;
            if (!ident) throw new Error('Add the flight number first.');
            const engine = await loadEngine();
            setData(await flightTracker.getFlightStatus(engine.key, ident, f.departureDate, engine.provider));
            setUpdatedAt(Date.now());
        } catch (e) {
            setData(null);
            setError(errorMessage(e, "Couldn't reach the flight data. Try again."));
            throw e;
        } finally {
            busy.current = false;
            setLoading(false);
        }
    }, []);

    // A different flight starts clean.
    useEffect(() => { setData(null); setError(''); setUpdatedAt(null); }, [id]);

    // Follow it: now, then every interval while the page is visible.
    useEffect(() => {
        if (!auto || !id) return;
        const run = () => { if (document.visibilityState === 'visible') void refresh().catch(() => undefined); };
        run();
        const timer = window.setInterval(run, intervalMs);
        document.addEventListener('visibilitychange', run);
        return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', run); };
    }, [auto, id, intervalMs, refresh]);

    return { data, error, loading, updatedAt, refresh };
};
