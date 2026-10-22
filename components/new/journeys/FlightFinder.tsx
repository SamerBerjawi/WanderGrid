import React from 'react';
import type { Carrier } from '../../../types';
import type { FlightCandidate } from '../../../services/flightLookup';
import type { LookupStatus } from '../../../hooks/useFlightLookup';
import type { LookupResult } from '../../../services/flightLookup';
import { Airplane, ArrowRight, Check, Broadcast, WarningCircle } from '../../ui/hugeicons';
import { RpLogo } from '../ui';
import { StatusPill } from './JourneyParts';
import { formatDate } from '../../../utils/formatters';
import { formatMinutes, type JourneyStatus } from '../../../utils/journeysModel';
import { cn } from '../../../utils/cn';

/**
 * What the flight lookup found, under the flight number and date: one card per flight with its
 * airports, times, aircraft and status, and where the answer came from. One result is filled in by
 * itself (the editor does that); several are listed to choose from. A flight with no published times
 * (too far away for free sources) shows its route and asks for the times.
 */

const STATE_LABEL: Record<FlightCandidate['status'], JourneyStatus> = {
    scheduled: { state: 'scheduled', label: 'Scheduled', delay: 0 },
    active: { state: 'travelling', label: 'In the air', delay: 0 },
    landed: { state: 'done', label: 'Landed', delay: 0 },
    cancelled: { state: 'cancelled', label: 'Cancelled', delay: 0 },
    diverted: { state: 'cancelled', label: 'Diverted', delay: 0 },
    unknown: { state: 'scheduled', label: 'Scheduled', delay: 0 },
};

const clock = (local: string | null) => (local ? local.slice(11, 16) : '--:--');

const Card: React.FC<{ c: FlightCandidate; applied: boolean; onUse: (c: FlightCandidate) => void; brandfetchApiKey?: string; carriers?: Carrier[] }> = ({ c, applied, onUse, brandfetchApiKey, carriers }) => {
    const routeOnly = c.confidence === 'route-only';
    const next = c.arrival.scheduledLocal && c.departure.scheduledLocal && c.arrival.scheduledLocal.slice(0, 10) > c.departure.scheduledLocal.slice(0, 10);
    return (
        <li className={cn('flex flex-col gap-2 rounded-rp-inset p-3', applied ? 'bg-rp-green/10 ring-2 ring-rp-green' : 'bg-rp-surface')}>
            <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-3">
                    <RpLogo name={c.airline.name} brandfetchApiKey={brandfetchApiKey} carriers={carriers} fallback={Airplane} iconClassName="text-rp-rust" size="sm" />
                    <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium text-rp-ink">{c.airline.name || c.flightIata}</span>
                        <span className="rp-tabular truncate text-xs text-rp-muted">{c.flightIata}{c.aircraft.model ? ` · ${c.aircraft.model}` : ''}</span>
                    </span>
                </span>
                {routeOnly ? null : <StatusPill status={STATE_LABEL[c.status]} mode="Flight" />}
            </div>
            <div className="flex items-center gap-3">
                <span className="flex flex-col">
                    <span className="rp-tabular text-lg font-semibold leading-none text-rp-ink">{c.departure.iata}</span>
                    <span className="rp-tabular mt-1 text-xs text-rp-muted">{routeOnly ? c.departure.city : clock(c.departure.scheduledLocal)}</span>
                </span>
                <ArrowRight size={16} className="text-rp-rust" aria-hidden />
                <span className="flex flex-col">
                    <span className="rp-tabular text-lg font-semibold leading-none text-rp-ink">{c.arrival.iata}</span>
                    <span className="rp-tabular mt-1 text-xs text-rp-muted">{routeOnly ? c.arrival.city : `${clock(c.arrival.scheduledLocal)}${next ? ' +1' : ''}`}</span>
                </span>
                <span className="ml-auto flex flex-col items-end text-right">
                    {c.departure.scheduledLocal ? <span className="rp-tabular text-xs font-medium text-rp-ink">{formatDate(c.departure.scheduledLocal.slice(0, 10), 'short')}</span> : null}
                    {c.durationMinutes ? <span className="rp-tabular text-xs text-rp-muted">{formatMinutes(c.durationMinutes)}</span> : null}
                </span>
            </div>
            {routeOnly ? <p className="text-xs text-rp-muted">Times aren't published for this date. Add them below.</p> : null}
            {c.departure.delay > 5 ? <p className="text-xs font-medium text-rp-rust">Delayed {c.departure.delay} min</p> : null}
            <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-2xs text-rp-muted"><Broadcast size={12} aria-hidden /> {c.sourceLabel}{c.alsoFrom?.length ? ` + ${c.alsoFrom.join(', ')}` : ''}</span>
                {applied ? (
                    <span className="inline-flex min-h-6 items-center gap-1 rounded-full bg-rp-green px-2.5 text-2xs font-semibold text-rp-paper"><Check size={12} aria-hidden /> Filled in</span>
                ) : (
                    <button type="button" onClick={() => onUse(c)} className="inline-flex min-h-11 items-center rounded-full bg-rp-ink px-4 text-sm font-medium text-rp-on-ink outline-none hover:bg-rp-ink/90 focus-visible:ring-2 focus-visible:ring-rp-muted">
                        {routeOnly ? 'Use route' : 'Use this flight'}
                    </button>
                )}
            </div>
        </li>
    );
};

export const FlightFinder: React.FC<{
    status: LookupStatus;
    result: LookupResult | null;
    message: string;
    valid: boolean;
    /** Index of the candidate that is filled in, or -1. */
    appliedIndex: number;
    onUse: (c: FlightCandidate, index: number) => void;
    /** Manual mode: a button asks for the lookup. */
    onRun?: () => void;
    brandfetchApiKey?: string;
    carriers?: Carrier[];
}> = ({ status, result, message, valid, appliedIndex, onUse, onRun, brandfetchApiKey, carriers }) => {
    if (status === 'idle') {
        if (!onRun) return null;
        return (
            <button type="button" disabled={!valid} onClick={onRun} className="inline-flex min-h-11 items-center gap-2 self-start rounded-full bg-rp-inset px-4 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted disabled:opacity-40">
                <Broadcast size={16} aria-hidden /> Check flight data
            </button>
        );
    }
    if (status === 'loading') {
        return (
            <div role="status" aria-live="polite" className="flex min-h-14 items-center gap-3 rounded-rp-inset bg-rp-surface px-3 text-sm text-rp-muted">
                <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-rp-line border-t-rp-ink" aria-hidden /> Looking up the flight
            </div>
        );
    }
    const candidates = result?.candidates ?? [];
    if (status === 'error' || candidates.length === 0) {
        return (
            <div role="status" className="flex items-start gap-3 rounded-rp-inset bg-rp-surface p-3 text-sm text-rp-muted">
                <WarningCircle size={18} className="mt-0.5 shrink-0 text-rp-ochre" aria-hidden />
                <span className="flex flex-1 flex-col items-start gap-2">
                    {message}
                    {onRun || status === 'error' ? (
                        <button type="button" onClick={onRun} className="inline-flex min-h-11 items-center rounded-full bg-rp-inset px-4 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted">Try again</button>
                    ) : null}
                </span>
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-2" role="status" aria-live="polite">
            <p className="px-1 text-xs font-medium text-rp-muted">{candidates.length === 1 ? 'Found' : `${candidates.length} flights match. Choose yours`}</p>
            <ul className="flex flex-col gap-2">
                {candidates.map((c, i) => <Card key={`${c.source}-${c.departure.scheduledUtc}-${i}`} c={c} applied={appliedIndex === i} onUse={cand => onUse(cand, i)} brandfetchApiKey={brandfetchApiKey} carriers={carriers} />)}
            </ul>
        </div>
    );
};
