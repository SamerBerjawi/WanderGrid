import { useCallback, useEffect, useRef, useState } from 'react';
import { dataService } from '../services/mockDb';
import { DEFAULT_FEED_OPTIONS, type FeedOptions } from '../utils/icsContext';

/**
 * What the person syncs to their calendar app. Loads what was saved (per person on the server, on this device in
 * local mode), applies a change at once so the link updates live, and saves a moment after the last change.
 */
export const useCalendarFeedOptions = (active: boolean) => {
    const [options, setOptions] = useState<FeedOptions>({ ...DEFAULT_FEED_OPTIONS });
    const [ready, setReady] = useState(false);
    const latest = useRef(options);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    latest.current = options;

    useEffect(() => {
        if (!active || ready) return;
        let cancelled = false;
        dataService.getCalendarFeedOptions()
            .then(o => { if (!cancelled) { setOptions(o); setReady(true); } })
            .catch(() => { if (!cancelled) setReady(true); }); // the defaults still work
        return () => { cancelled = true; };
    }, [active, ready]);

    useEffect(() => () => clearTimeout(timer.current), []);

    const update = useCallback((patch: Partial<FeedOptions>) => {
        const next = { ...latest.current, ...patch };
        latest.current = next;
        setOptions(next);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => { void dataService.saveCalendarFeedOptions(latest.current).catch(() => undefined); }, 600);
    }, []);

    return { options, update, ready };
};
