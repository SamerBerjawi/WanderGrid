import { useCallback, useEffect, useRef, useState } from 'react';
import type { FlightStatusResponse, Transport } from '../types';
import { candidateToStatus, lookupFlight, whyNotFound, type FlightCandidate } from '../services/flightLookup';
import { errorMessage } from '../services/toast';

/**
 * Follows one flight: asks the flight lookup (FlightStats first, then the workspace's AeroDataBox and
 * AviationStack keys; see services/flightLookup.ts) for its status, once on demand and, with `auto`,
 * again every minute while the page is visible. When a flight number has several legs that day the one
 * with this flight's airports is used. A new flight starts clean. `refresh` rejects on failure so a
 * button can show it.
 */

const pick = (list: FlightCandidate[], t: Transport): FlightCandidate | null => {
    const code = (s: string) => (s || '').trim().toUpperCase().slice(0, 3);
    return list.find(c => c.departure.iata === code(t.origin) && c.arrival.iata === code(t.destination)) ?? list.find(c => c.departure.iata === code(t.origin)) ?? list[0] ?? null;
};

export const useLiveFlight = (flight: Transport | null, auto: boolean, intervalMs = 60_000) => {
    const [data, setData] = useState<FlightStatusResponse | null>(null);
    const [source, setSource] = useState('');
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
            const ident = `${f.identifier || ''}`.replace(/\s/g, '');
            if (!ident) throw new Error('Add the flight number first.');
            // A number typed without its carrier ("215") takes the airline's code.
            const number = /^\d/.test(ident) && f.providerCode ? `${f.providerCode}${ident}` : ident;
            const r = await lookupFlight(number, f.departureDate);
            const c = pick(r.candidates.filter(x => x.confidence === 'schedule'), f);
            if (!c) throw new Error(r.candidates.length ? "Live status isn't available for this date yet." : whyNotFound(r, f.departureDate));
            setData(candidateToStatus(c));
            setSource(c.alsoFrom?.length ? `${c.sourceLabel} + ${c.alsoFrom.join(', ')}` : c.sourceLabel);
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
    useEffect(() => { setData(null); setError(''); setUpdatedAt(null); setSource(''); }, [id]);

    // Follow it: now, then every interval while the page is visible.
    useEffect(() => {
        if (!auto || !id) return;
        const run = () => { if (document.visibilityState === 'visible') void refresh().catch(() => undefined); };
        run();
        const timer = window.setInterval(run, intervalMs);
        document.addEventListener('visibilitychange', run);
        return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', run); };
    }, [auto, id, intervalMs, refresh]);

    return { data, source, error, loading, updatedAt, refresh };
};
