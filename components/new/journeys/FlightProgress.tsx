import React, { useEffect, useState } from 'react';
import type { Transport } from '../../../types';
import type { FlightCandidate } from '../../../services/flightLookup';
import { Airplane } from '../../ui/hugeicons';
import { formatMinutes, journeyStatus, liveProgress, placeCode } from '../../../utils/journeysModel';
import { getFlightDepartureUtcDate } from '../../../utils/flightData';
import { cn } from '../../../utils/cn';

/**
 * A flight on a line from its origin to its destination. With live data the plane sits where the aircraft
 * really is along the route and "Lands in…" counts to the real estimated arrival, with how late or early it
 * is; without it, the bar follows the schedule's clock. Re-reads the clock every 30 seconds.
 */
export const FlightProgress: React.FC<{ flight: Transport; candidate?: FlightCandidate | null; tone?: 'default' | 'onInk'; className?: string }> = ({ flight, candidate, tone = 'default', className }) => {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(id); }, []);
    const status = journeyStatus(flight, now);
    const lp = liveProgress(flight, candidate ? {
        position: candidate.live && !candidate.live.onGround ? { lat: candidate.live.lat, lng: candidate.live.lng } : null,
        departureUtc: candidate.departure.actualUtc || candidate.departure.estimatedUtc,
        arrivalUtc: candidate.arrival.actualUtc || candidate.arrival.estimatedUtc,
    } : undefined, now);
    const landed = candidate?.status === 'landed' || status.state === 'done';
    const toGo = status.state === 'scheduled' && !candidate?.live
        ? Math.round((getFlightDepartureUtcDate(flight).getTime() - now) / 60000)
        : Math.round(((lp.etaMs ?? now) - now) / 60000);
    const text = landed ? 'Arrived' : status.state === 'scheduled' && !candidate?.live ? `Departs in ${formatMinutes(Math.max(0, toGo))}` : `Lands in ${formatMinutes(Math.max(0, toGo))}`;
    const onInk = tone === 'onInk';
    const late = Math.abs(lp.delayMin) > 5 && lp.basis !== 'clock';
    const progress = landed ? 1 : lp.progress;
    return (
        <div className={cn('flex flex-col gap-1.5', className)}>
            <div className="flex items-center gap-3">
                <span className="rp-tabular text-sm font-semibold">{placeCode(flight.origin, flight.mode)}</span>
                <div className={cn('relative h-1.5 flex-1 rounded-full', onInk ? 'bg-rp-on-ink/20' : 'bg-rp-line')} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Progress">
                    <div className={cn('absolute inset-y-0 left-0 rounded-full', onInk ? 'bg-rp-mustard' : 'bg-rp-green')} style={{ width: `${progress * 100}%` }} />
                    <span
                        className={cn('absolute top-1/2 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full', onInk ? 'bg-rp-mustard text-rp-on-mustard' : 'bg-rp-green text-rp-paper')}
                        style={{ left: `${progress * 100}%` }}
                        aria-hidden
                    >
                        <Airplane size={14} />
                    </span>
                </div>
                <span className="rp-tabular text-sm font-semibold">{placeCode(flight.destination, flight.mode)}</span>
            </div>
            <p className={cn('rp-tabular flex items-center justify-center gap-2 text-center text-xs', onInk ? 'text-rp-on-ink/70' : 'text-rp-muted')}>
                {text}
                {late && !landed ? <span className={cn('rounded-full px-2 py-0.5 text-2xs font-semibold', lp.delayMin > 0 ? 'bg-rp-rust text-rp-paper' : 'bg-rp-green text-rp-paper')}>{lp.delayMin > 0 ? '+' : '−'}{Math.abs(lp.delayMin)} min</span> : null}
                {lp.basis === 'position' ? <span className="text-2xs opacity-80">live position</span> : null}
            </p>
        </div>
    );
};
