import React, { useMemo } from 'react';
import type { Carrier } from '../../../types';
import { useLiveFlight } from '../../../hooks/useLiveFlight';
import { CarrierCell, StatusPill } from './JourneyParts';
import { FlightProgress } from './FlightProgress';
import { formatDate } from '../../../utils/formatters';
import { isLiveWindow, journeyStatus, type JourneyRecord } from '../../../utils/journeysModel';
import { getFlightDepartureUtcDate } from '../../../utils/flightData';
import { cn } from '../../../utils/cn';

/**
 * "Now": the flight that is under way, or the next one leaving within three hours, as an ink card with
 * its progress. It follows the flight live (once a minute while the page is visible) and shows the gate
 * and terminal when the flight data has them. Tap it to open the flight. Nothing shows when no flight is close.
 */
export const LiveNow: React.FC<{ items: JourneyRecord[]; onOpen: (r: JourneyRecord) => void; brandfetchApiKey?: string; carriers?: Carrier[] }> = ({ items, onOpen, brandfetchApiKey, carriers }) => {
    const rec = useMemo(() => {
        const now = Date.now();
        const near = items.filter(r => r.flight.mode === 'Flight' && isLiveWindow(r.flight, 3, now) && journeyStatus(r.flight, now).state !== 'done');
        return near.sort((a, b) => getFlightDepartureUtcDate(a.flight).getTime() - getFlightDepartureUtcDate(b.flight).getTime())[0] ?? null;
    }, [items]);
    const { data } = useLiveFlight(rec?.flight ?? null, Boolean(rec));
    if (!rec) return null;
    const t = rec.flight;
    const status = journeyStatus(t);
    const gate = [data?.departure.terminal && `Terminal ${data.departure.terminal}`, data?.departure.gate && `Gate ${data.departure.gate}`].filter(Boolean).join(' · ');
    return (
        <button
            type="button"
            onClick={() => onOpen(rec)}
            aria-label={`${status.label}: ${t.origin} to ${t.destination}`}
            className={cn('flex w-full flex-col gap-3 rounded-rp-tile bg-rp-ink p-4 text-left text-rp-on-ink outline-none rp-shadow-rest transition-transform duration-150 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-rp-muted focus-visible:ring-offset-2 focus-visible:ring-offset-rp-canvas active:scale-[0.995] sm:p-5')}
        >
            <span className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-3">
                    <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-rp-mustard" aria-hidden />
                    <span className="text-xs font-semibold uppercase tracking-[0.16em]">Now</span>
                    <CarrierCell t={t} size="sm" tone="onInk" brandfetchApiKey={brandfetchApiKey} carriers={carriers} className="min-w-0" />
                </span>
                <span className="flex shrink-0 items-center gap-2">
                    {gate ? <span className="rp-tabular hidden text-xs text-rp-on-ink/70 sm:inline">{gate}</span> : null}
                    <StatusPill status={status} mode={t.mode} className="bg-rp-surface text-rp-ink" />
                </span>
            </span>
            <FlightProgress flight={t} tone="onInk" />
            <span className="rp-tabular text-center text-xs text-rp-on-ink/70 sm:hidden">{formatDate(t.departureDate, 'short')}{gate ? ` · ${gate}` : ''}</span>
        </button>
    );
};
