import React from 'react';
import type { ReplayStep } from '../../../utils/mapReplay';
import { SPEEDS } from '../../../utils/mapReplay';
import { formatDate } from '../../../utils/formatters';
import { ArrowCounterClockwise, Pause, Play, X } from '../../ui/hugeicons';
import { cn } from '../../../utils/cn';

/**
 * The replay controls at the bottom of the map: play and pause (restart once it has finished), a scrubber over
 * the dates your routes first appear, the speed, and the date, routes and distance reached so far. It stands in
 * for the mode tabs while a replay is open. Nothing here changes your data.
 */

const round = 'inline-flex size-11 shrink-0 items-center justify-center rounded-full outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-rp-muted';

export const ReplayBar: React.FC<{
    steps: ReplayStep[];
    index: number;
    playing: boolean;
    finished: boolean;
    speed: number;
    date?: string;
    routes: number;
    distanceKm: number;
    onPlay: () => void;
    onPause: () => void;
    onScrub: (to: number) => void;
    onSpeed: (speed: number) => void;
    onClose: () => void;
}> = ({ steps, index, playing, finished, speed, date, routes, distanceKm, onPlay, onPause, onScrub, onSpeed, onClose }) => (
    <section aria-label="Replay your travels" className="pointer-events-auto flex w-[min(34rem,100%)] flex-col gap-2 rounded-rp-tile bg-rp-surface p-3 text-rp-ink rp-shadow-raised">
        <div className="flex items-baseline justify-between gap-3 px-1">
            <p className="rp-tabular text-lg font-semibold leading-tight" aria-live="polite">{date ? formatDate(date, 'short-with-year') : 'Before your first trip'}</p>
            <p className="rp-tabular text-xs text-rp-muted">{routes.toLocaleString('en-US')} {routes === 1 ? 'route' : 'routes'} · {distanceKm.toLocaleString('en-US')} km</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 sm:flex-nowrap">
            {playing
                ? <button type="button" onClick={onPause} aria-label="Pause" className={cn(round, 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90')}><Pause size={18} aria-hidden /></button>
                : <button type="button" onClick={onPlay} aria-label={finished ? 'Replay from the start' : 'Play'} className={cn(round, 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90')}>{finished ? <ArrowCounterClockwise size={18} aria-hidden /> : <Play size={18} aria-hidden />}</button>}
            <input
                type="range"
                min={0}
                max={steps.length}
                value={index}
                onChange={e => onScrub(Number(e.target.value))}
                aria-label="Time"
                aria-valuetext={date ? formatDate(date, 'short-with-year') : 'Before your first trip'}
                className="order-last h-11 w-full min-w-0 cursor-pointer accent-rp-ink sm:order-none sm:w-auto sm:flex-1"
            />
            <div role="group" aria-label="Speed" className="ml-auto flex shrink-0 items-center rounded-full bg-rp-inset p-0.5 sm:ml-0">
                {SPEEDS.map(s => (
                    <button key={s} type="button" onClick={() => onSpeed(s)} aria-pressed={speed === s} className={cn('inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-2 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-rp-muted', speed === s ? 'bg-rp-ink text-rp-on-ink' : 'text-rp-muted hover:text-rp-ink')}>{s}×</button>
                ))}
            </div>
            <button type="button" onClick={onClose} aria-label="Close replay" className={cn(round, 'bg-rp-inset text-rp-ink hover:bg-rp-line')}><X size={18} aria-hidden /></button>
        </div>
    </section>
);
