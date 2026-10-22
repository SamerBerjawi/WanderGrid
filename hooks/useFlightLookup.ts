import { useCallback, useEffect, useRef, useState } from 'react';
import { lookupFlight, looksLikeFlightNumber, whyNotFound, type LookupResult } from '../services/flightLookup';
import { errorMessage } from '../services/toast';

/**
 * Looks a flight up from its number and date. In `auto` mode it searches by itself as soon as both look
 * right (after a short pause, so typing "ME2" never searches), cancelling a search that a newer one
 * replaces; in manual mode `run` does it. The result is dropped when the number or date changes.
 */

export type LookupStatus = 'idle' | 'loading' | 'done' | 'error';

export const useFlightLookup = (number: string, date: string, auto: boolean, pauseMs = 550) => {
    const [status, setStatus] = useState<LookupStatus>('idle');
    const [result, setResult] = useState<LookupResult | null>(null);
    const [message, setMessage] = useState('');
    const key = `${number.trim().toUpperCase().replace(/\s/g, '')}|${date}`;
    const valid = looksLikeFlightNumber(number) && /^\d{4}-\d{2}-\d{2}$/.test(date);
    const abort = useRef<AbortController | null>(null);
    const latest = useRef({ number, date });
    latest.current = { number, date };

    const run = useCallback(async () => {
        abort.current?.abort();
        const ctl = new AbortController();
        abort.current = ctl;
        const { number: n, date: d } = latest.current;
        setStatus('loading');
        setMessage('');
        try {
            const r = await lookupFlight(n, d, ctl.signal);
            if (ctl.signal.aborted) return;
            setResult(r);
            setStatus('done');
            if (!r.ok) setMessage(r.message || 'That flight could not be looked up.');
            else if (r.candidates.length === 0) setMessage(whyNotFound(r, d));
        } catch (e) {
            if (ctl.signal.aborted || (e as Error)?.name === 'AbortError') return;
            setResult(null);
            setStatus('error');
            setMessage(errorMessage(e, "Couldn't reach the flight data. Check the connection."));
        }
    }, []);

    // A new number or date: forget the old answer and, in auto mode, ask again after a pause.
    useEffect(() => {
        abort.current?.abort();
        setResult(null);
        setMessage('');
        setStatus('idle');
        if (!auto || !valid) return;
        const timer = window.setTimeout(() => { void run(); }, pauseMs);
        return () => window.clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, auto]);

    useEffect(() => () => abort.current?.abort(), []);

    return { status, result, message, valid, key, run };
};
