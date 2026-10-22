import React, { useMemo } from 'react';
import type { Carrier } from '../../../types';
import { useLiveFlight } from '../../../hooks/useLiveFlight';
import { Airport, ArrowRight, DoorOpen, Suitcase } from '../../ui/hugeicons';
import { CarrierCell, StatusPill } from './JourneyParts';
import { formatDate } from '../../../utils/formatters';
import { daysToDeparture, formatMinutes, isIndependent, isLiveWindow, journeyStatus, placeCode, type JourneyRecord } from '../../../utils/journeysModel';
import { getFlightDepartureUtcDate } from '../../../utils/flightData';
import { cn } from '../../../utils/cn';

/**
 * The next flight (or the one in the air) as a slim card: its route, a countdown, the trip it is on and, in
 * the last day, its gate and terminal from the live data. Used on a trip's page for that trip's flights, and
 * meant for the Dashboard's "next flight". Renders nothing when there is no flight to come.
 */

/** "in 3 days", "in 5h 20m", "now". */
export const countdown = (departureMs: number, now = Date.now()): string => {
    const minutes = Math.round((departureMs - now) / 60000);
    if (minutes <= 0) return 'now';
    if (minutes < 48 * 60) return `in ${formatMinutes(minutes)}`;
    return `in ${Math.round(minutes / 1440)} days`;
};

export const NextFlight: React.FC<{
    records: JourneyRecord[];
    onOpen?: (record: JourneyRecord) => void;
    brandfetchApiKey?: string;
    carriers?: Carrier[];
    /** Names the trip on the card; off on the trip's own page. */
    showTrip?: boolean;
    className?: string;
}> = ({ records, onOpen, brandfetchApiKey, carriers, showTrip = true, className }) => {
    const next = useMemo(() => {
        const now = Date.now();
        return records
            .filter(r => r.flight.mode === 'Flight' && journeyStatus(r.flight, now).state !== 'done' && journeyStatus(r.flight, now).state !== 'cancelled')
            .sort((a, b) => getFlightDepartureUtcDate(a.flight).getTime() - getFlightDepartureUtcDate(b.flight).getTime())[0] ?? null;
    }, [records]);
    const soon = Boolean(next && isLiveWindow(next.flight, 24));
    const { data } = useLiveFlight(next?.flight ?? null, soon);
    if (!next) return null;
    const t = next.flight;
    const status = journeyStatus(t);
    const terminal = data?.departure.terminal;
    const door = data?.departure.gate;
    const days = daysToDeparture(t);
    const body = (
        <>
            <span className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rp-ink text-rp-on-ink"><span className="rp-tabular text-xs font-semibold">{status.state === 'travelling' ? 'Now' : days <= 0 ? 'Today' : days}</span></span>
                <span className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-2 text-sm font-semibold text-rp-ink">
                        <span className="text-rp-muted font-normal">Next flight {countdown(getFlightDepartureUtcDate(t).getTime())}</span>
                    </span>
                    <span className="rp-tabular flex items-center gap-1.5 text-base font-semibold text-rp-ink">{placeCode(t.origin)} <ArrowRight size={14} className="text-rp-rust" aria-hidden /> {placeCode(t.destination)}
                        <span className="text-xs font-normal text-rp-muted">{formatDate(t.departureDate, 'short')} · {t.departureTime}</span>
                    </span>
                </span>
            </span>
            <span className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {terminal || door ? (
                    <span className="rp-tabular inline-flex items-center gap-3 text-xs text-rp-muted">
                        {terminal ? <span className="inline-flex items-center gap-1"><Airport size={14} className="text-rp-ochre" aria-hidden /><span className="sr-only">Terminal </span>{terminal}</span> : null}
                        {door ? <span className="inline-flex items-center gap-1"><DoorOpen size={14} className="text-rp-ochre" aria-hidden /><span className="sr-only">Gate </span>{door}</span> : null}
                    </span>
                ) : null}
                {showTrip && !isIndependent(next.trip.id) ? <span className="inline-flex min-h-6 max-w-[10rem] items-center gap-1 truncate rounded-full bg-rp-inset px-2.5 text-2xs font-medium text-rp-ink"><Suitcase size={12} aria-hidden /> <span className="truncate">{next.trip.name}</span></span> : null}
                <StatusPill status={status} mode={t.mode} />
            </span>
        </>
    );
    const shell = cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-rp-tile bg-rp-surface p-3 rp-shadow-rest sm:p-4', className);
    return onOpen ? (
        <button type="button" onClick={() => onOpen(next)} aria-label={`Next flight: ${t.origin} to ${t.destination}`} className={cn(shell, 'w-full text-left outline-none transition-colors duration-150 hover:bg-rp-inset focus-visible:ring-2 focus-visible:ring-rp-muted')}>{body}</button>
    ) : (
        <div className={shell}>{body}</div>
    );
};
