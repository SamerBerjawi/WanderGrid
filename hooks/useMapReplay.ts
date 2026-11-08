import { useCallback, useEffect, useState } from 'react';
import { richStepInterval, stepInterval } from '../utils/mapReplay';

/**
 * Playback for the map replay: how many steps are showing, whether it is playing, and at what speed. It starts
 * from the first route and plays on its own when opened (that is the point), except for someone who prefers
 * reduced motion, who starts with everything showing and scrubs. Each step waits `stepInterval`, so a long
 * history still takes about twenty seconds, or about 45 when flights and captions are on.
 */
export const useMapReplay = (steps: number, open: boolean, rich = false) => {
    const [index, setIndex] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [speed, setSpeed] = useState(1);

    useEffect(() => {
        if (!open) { setPlaying(false); return; }
        const calm = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        setIndex(calm ? steps : 0);
        setPlaying(!calm && steps > 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        if (!open || !playing) return;
        if (index >= steps) { setPlaying(false); return; }
        const id = window.setTimeout(() => setIndex(i => Math.min(steps, i + 1)), (rich ? richStepInterval : stepInterval)(steps, speed));
        return () => window.clearTimeout(id);
    }, [open, playing, index, steps, speed, rich]);

    const play = useCallback(() => {
        if (index >= steps) setIndex(0);
        setPlaying(true);
    }, [index, steps]);
    const pause = useCallback(() => setPlaying(false), []);
    const scrub = useCallback((to: number) => { setPlaying(false); setIndex(Math.max(0, Math.min(steps, to))); }, [steps]);

    return { index, playing, speed, setSpeed, play, pause, scrub, finished: index >= steps && steps > 0 };
};
