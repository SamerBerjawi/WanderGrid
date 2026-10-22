import React, { useEffect, useState } from 'react';
import type { FlightStatusResponse, Transport } from '../../../types';
import { Airplane } from '../../ui/hugeicons';
import { formatMinutes, journeyProgress, journeyStatus, placeCode } from '../../../utils/journeysModel';
import { getFlightArrivalUtcDate, getFlightDepartureUtcDate } from '../../../utils/flightData';
import { cn } from '../../../utils/cn';

/**
 * A flight on a line from its origin to its destination: how far along it is by the clock, and what is
 * left ("Lands in 3h 20m", "Departs in 1h 5m"). Re-reads the clock every 30 seconds.
 */
export const FlightProgress: React.FC<{ flight: Transport; live?: FlightStatusResponse['live']; tone?: 'default' | 'onInk'; className?: string }> = ({ flight, tone = 'default', className }) => {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(id); }, []);
    const status = journeyStatus(flight, now);
    const progress = journeyProgress(flight, now);
    const toGo = status.state === 'scheduled'
        ? Math.round((getFlightDepartureUtcDate(flight).getTime() - now) / 60000)
        : Math.round((getFlightArrivalUtcDate(flight).getTime() - now) / 60000);
    const text = status.state === 'scheduled' ? `Departs in ${formatMinutes(Math.max(0, toGo))}` : status.state === 'done' ? 'Arrived' : `Lands in ${formatMinutes(Math.max(0, toGo))}`;
    const onInk = tone === 'onInk';
    return (
        <div className={cn('flex flex-col gap-1.5', className)}>
            <div className="flex items-center gap-3">
                <span className="rp-tabular text-sm font-semibold">{placeCode(flight.origin)}</span>
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
                <span className="rp-tabular text-sm font-semibold">{placeCode(flight.destination)}</span>
            </div>
            <p className={cn('rp-tabular text-center text-xs', onInk ? 'text-rp-on-ink/70' : 'text-rp-muted')}>{text}</p>
        </div>
    );
};
