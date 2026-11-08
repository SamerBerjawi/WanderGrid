import React, { useState } from 'react';
import type { ReplayCamera, ReplayFacts, ReplaySettings, ReplayStep } from '../../../utils/mapReplay';
import { SPEEDS } from '../../../utils/mapReplay';
import { formatDate } from '../../../utils/formatters';
import { ArrowCounterClockwise, Gear, Pause, Play, X } from '../../ui/hugeicons';
import { RpChip } from '../ui';
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
    /** Running totals; shown when the Totals option is on. */
    facts?: ReplayFacts | null;
    settings: ReplaySettings;
    onSettings: (patch: Partial<ReplaySettings>) => void;
}> = ({ steps, index, playing, finished, speed, date, routes, distanceKm, onPlay, onPause, onScrub, onSpeed, onClose, facts, settings, onSettings }) => {
    const [options, setOptions] = useState(false);
    const count = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
    return (
    <section aria-label="Replay your travels" className="pointer-events-auto flex w-[min(34rem,100%)] flex-col gap-2 rounded-rp-tile bg-rp-surface p-3 text-rp-ink rp-shadow-raised">
        <div className="flex items-baseline justify-between gap-3 px-1">
            <p className="rp-tabular text-lg font-semibold leading-tight" aria-live="polite">{date ? formatDate(date, 'short-with-year') : 'Before your first trip'}</p>
            <p className="rp-tabular text-xs text-rp-muted">{routes.toLocaleString('en-US')} {routes === 1 ? 'route' : 'routes'} · {distanceKm.toLocaleString('en-US')} km</p>
        </div>
        {settings.stats && facts ? (
            <ul aria-label="So far" className="flex flex-wrap gap-x-3 gap-y-1 px-1 text-xs text-rp-muted">
                <li><span className="rp-tabular font-semibold text-rp-ink">{facts.countries.size}</span> {facts.countries.size === 1 ? 'country' : 'countries'}</li>
                <li><span className="rp-tabular font-semibold text-rp-ink">{facts.places.size}</span> {facts.places.size === 1 ? 'place' : 'places'}</li>
                <li><span className="rp-tabular font-semibold text-rp-ink">{facts.airlines.size}</span> {facts.airlines.size === 1 ? 'airline' : 'airlines'}</li>
                <li><span className="rp-tabular font-semibold text-rp-ink">{facts.flights.toLocaleString('en-US')}</span> {facts.flights === 1 ? 'flight' : 'flights'}</li>
                {facts.longest ? <li>longest <span className="rp-tabular font-semibold text-rp-ink">{facts.longest.km.toLocaleString('en-US')} km</span></li> : null}
            </ul>
        ) : null}
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
            <button type="button" onClick={() => setOptions(o => !o)} aria-label="Replay options" aria-expanded={options} className={cn(round, options ? 'bg-rp-ink text-rp-on-ink' : 'bg-rp-inset text-rp-ink hover:bg-rp-line')}><Gear size={18} aria-hidden /></button>
            <button type="button" onClick={onClose} aria-label="Close replay" className={cn(round, 'bg-rp-inset text-rp-ink hover:bg-rp-line')}><X size={18} aria-hidden /></button>
        </div>
        {options ? (
            <div className="flex flex-col gap-2 border-t border-rp-line px-1 pt-2" role="group" aria-label="Replay options">
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Camera">
                    <span className="w-16 text-xs text-rp-muted">Camera</span>
                    {([['world', 'Whole map'], ['follow', 'Follow'], ['close', 'Close-up']] as [ReplayCamera, string][]).map(([id, label]) => (
                        <RpChip key={id} selected={settings.camera === id} onClick={() => onSettings({ camera: id })}>{label}</RpChip>
                    ))}
                </div>
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Show">
                    <span className="w-16 text-xs text-rp-muted">Show</span>
                    <RpChip selected={settings.fly} onClick={() => onSettings({ fly: !settings.fly })}>Flying plane</RpChip>
                    <RpChip selected={settings.captions} onClick={() => onSettings({ captions: !settings.captions })}>Captions</RpChip>
                    <RpChip selected={settings.countries} onClick={() => onSettings({ countries: !settings.countries })}>Countries</RpChip>
                    <RpChip selected={settings.stats} onClick={() => onSettings({ stats: !settings.stats })}>Totals</RpChip>
                </div>
            </div>
        ) : null}
    </section>
    );
};
