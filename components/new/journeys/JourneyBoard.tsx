import React, { useMemo } from 'react';
import type { Carrier } from '../../../types';
import { ArrowRight, CaretDown } from '../../ui/hugeicons';
import { CarrierCell, DelayChip, StatusPill } from './JourneyParts';
import { modeLook } from '../trips/transportModes';
import { formatDate } from '../../../utils/formatters';
import {
    daysToDeparture, formatMinutes, journeyMinutes, journeyStatus, placeCode, placeName, type JourneyRecord,
} from '../../../utils/journeysModel';
import { getFlightDepartureUtcDate } from '../../../utils/flightData';
import { cn } from '../../../utils/cn';

/**
 * The Departure Board: the next journey as a boarding pass on an ink panel, then every other journey
 * as a board row (departure time, route, carrier, status), upcoming first and earlier ones after.
 * In the video's colours and type: the ink panel flips in dark mode like every ink fill.
 */

export const BOARD_CAP = 10;

const depTime = (r: JourneyRecord) => getFlightDepartureUtcDate(r.flight).getTime();

export const JourneyBoard: React.FC<{
    items: JourneyRecord[];
    onOpen: (record: JourneyRecord) => void;
    brandfetchApiKey?: string;
    carriers?: Carrier[];
    expanded: boolean;
    onExpandedChange: (expanded: boolean) => void;
    filtering: boolean;
    noun: { one: string; many: string };
}> = ({ items, onOpen, brandfetchApiKey, carriers, expanded, onExpandedChange, filtering, noun }) => {
    const { next, rest } = useMemo(() => {
        const now = Date.now();
        const live = items.filter(r => journeyStatus(r.flight, now).state !== 'cancelled');
        const upcoming = live.filter(r => journeyStatus(r.flight, now).state !== 'done').sort((a, b) => depTime(a) - depTime(b));
        const earlier = items.filter(r => !upcoming.includes(r)).sort((a, b) => depTime(b) - depTime(a));
        const first = upcoming[0] ?? null;
        return { next: first, rest: [...upcoming.slice(1), ...earlier] };
    }, [items]);

    const overCap = rest.length > BOARD_CAP;
    const capped = overCap && !expanded && !filtering;
    const visible = capped ? rest.slice(0, BOARD_CAP) : rest;
    const now = Date.now();
    const sub = 'text-rp-on-ink/70';

    return (
        <section aria-label={`${noun.one} board`} className="flex flex-col gap-4 rounded-rp-card bg-rp-ink p-3 text-rp-on-ink sm:p-5 lg:p-6">
            <div className="flex items-center justify-between px-1 text-xs font-medium uppercase tracking-[0.18em]">
                <span>Departures</span>
                <span className={cn('rp-tabular', sub)}>{items.length}</span>
            </div>

            {next ? <NextUp rec={next} onOpen={onOpen} brandfetchApiKey={brandfetchApiKey} carriers={carriers} /> : null}

            <ul className={cn('flex flex-col', capped && '[mask-image:linear-gradient(to_bottom,black_68%,transparent)]')}>
                {visible.map(rec => {
                    const t = rec.flight;
                    const status = journeyStatus(t, now);
                    const done = status.state === 'done' || status.state === 'cancelled';
                    return (
                        <li key={t.id} className="border-t border-rp-on-ink/15 first:border-t-0">
                            <button
                                type="button"
                                onClick={() => onOpen(rec)}
                                aria-label={`${t.origin} to ${t.destination}, ${formatDate(t.departureDate, 'short-with-year')}`}
                                className="grid min-h-14 w-full grid-cols-[3.75rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-rp-inset px-2 py-2 text-left outline-none transition-colors duration-150 hover:bg-rp-on-ink/10 focus-visible:ring-2 focus-visible:ring-rp-muted sm:grid-cols-[4.5rem_minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:gap-x-4"
                            >
                                <span className="flex flex-col">
                                    <span className={cn('rp-tabular text-lg font-medium leading-tight', done && sub)}>{t.departureTime || '--:--'}</span>
                                    <span className={cn('rp-tabular text-xs', sub)}>{formatDate(t.departureDate, 'short')}</span>
                                </span>
                                <span className="flex min-w-0 flex-col gap-0.5">
                                    <span className={cn('flex items-center gap-2 text-base font-semibold', done && sub)}>
                                        <span className="rp-tabular">{placeCode(t.origin)}</span>
                                        <ArrowRight size={14} aria-hidden />
                                        <span className="rp-tabular">{placeCode(t.destination)}</span>
                                    </span>
                                    <span className={cn('truncate text-xs', sub)}>{placeName(t.origin)} to {placeName(t.destination)}</span>
                                </span>
                                <span className="hidden min-w-0 sm:block">
                                    <CarrierCell t={t} brandfetchApiKey={brandfetchApiKey} carriers={carriers} size="sm" tone="onInk" />
                                </span>
                                <span className="flex flex-col items-end gap-1">
                                    <StatusPill status={status} mode={t.mode} />
                                    <DelayChip delay={status.delay} />
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>

            {overCap && !filtering ? (
                <button
                    type="button"
                    onClick={() => onExpandedChange(!expanded)}
                    className="inline-flex min-h-11 items-center justify-center gap-1.5 self-center rounded-full px-4 text-sm font-medium text-rp-on-ink outline-none transition-colors duration-150 hover:bg-rp-on-ink/10 focus-visible:ring-2 focus-visible:ring-rp-muted"
                >
                    {expanded ? 'Show fewer' : <>Show all {items.length} <CaretDown size={16} aria-hidden /></>}
                </button>
            ) : null}
        </section>
    );
};

/** The next journey as a boarding pass: a paper card with a perforated stub that counts the days. */
const NextUp: React.FC<{ rec: JourneyRecord; onOpen: (r: JourneyRecord) => void; brandfetchApiKey?: string; carriers?: Carrier[] }> = ({ rec, onOpen, brandfetchApiKey, carriers }) => {
    const t = rec.flight;
    const look = modeLook(t.mode);
    const days = daysToDeparture(t);
    const status = journeyStatus(t);
    const travelling = status.state === 'travelling';
    return (
        <button
            type="button"
            onClick={() => onOpen(rec)}
            aria-label={`Next: ${t.origin} to ${t.destination}, ${formatDate(t.departureDate, 'short-with-year')}`}
            className="relative flex min-h-11 w-full overflow-hidden rounded-rp-tile bg-rp-surface text-left text-rp-ink outline-none transition-transform duration-150 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-rp-muted active:scale-[0.995]"
        >
            <span className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-5">
                <span className="flex items-center justify-between gap-2">
                    <CarrierCell t={t} brandfetchApiKey={brandfetchApiKey} carriers={carriers} className="min-w-0" />
                    <StatusPill status={status} mode={t.mode} />
                </span>
                <span className="flex items-center gap-3">
                    <span className="rp-tabular text-3xl font-medium leading-none sm:text-4xl">{placeCode(t.origin)}</span>
                    <span className="flex min-w-6 flex-1 items-center gap-1 text-rp-muted" aria-hidden>
                        <span className="h-px flex-1 border-t-2 border-dotted border-rp-line" />
                        <look.icon size={18} className={cn(look.text, t.mode === 'Flight' && 'rotate-90')} />
                        <span className="h-px flex-1 border-t-2 border-dotted border-rp-line" />
                    </span>
                    <span className="rp-tabular text-3xl font-medium leading-none sm:text-4xl">{placeCode(t.destination)}</span>
                </span>
                <span className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-rp-muted">
                    <span className="flex flex-col"><span>Date</span><b className="rp-tabular text-sm font-medium text-rp-ink">{formatDate(t.departureDate, 'short')}</b></span>
                    <span className="flex flex-col"><span>Departs</span><b className="rp-tabular text-sm font-medium text-rp-ink">{t.departureTime || '--:--'}</b></span>
                    <span className="flex flex-col"><span>Arrives</span><b className="rp-tabular text-sm font-medium text-rp-ink">{t.arrivalTime || '--:--'}</b></span>
                    {journeyMinutes(t) ? <span className="flex flex-col"><span>Length</span><b className="rp-tabular text-sm font-medium text-rp-ink">{formatMinutes(journeyMinutes(t))}</b></span> : null}
                    {t.seatNumber ? <span className="flex flex-col"><span>Seat</span><b className="rp-tabular text-sm font-medium text-rp-ink">{t.seatNumber}</b></span> : null}
                </span>
            </span>
            <span aria-hidden className="my-4 w-0 border-l-2 border-dashed border-rp-line" />
            <span className={cn('flex w-20 shrink-0 flex-col items-center justify-center gap-0.5 sm:w-28', travelling ? 'bg-rp-ink text-rp-on-ink' : 'bg-rp-mustard text-rp-on-mustard')}>
                <span className="text-2xs font-semibold uppercase tracking-wider">{travelling ? 'Now' : days <= 0 ? 'Today' : 'In'}</span>
                {!travelling && days > 0 ? <span className="rp-tabular text-3xl font-semibold leading-none">{days}</span> : null}
                {!travelling && days > 0 ? <span className="text-2xs font-semibold uppercase tracking-wider">{days === 1 ? 'day' : 'days'}</span> : null}
            </span>
            <span aria-hidden className="absolute -top-2 right-[4.5rem] size-4 rounded-full bg-rp-ink sm:right-[6.5rem]" />
            <span aria-hidden className="absolute -bottom-2 right-[4.5rem] size-4 rounded-full bg-rp-ink sm:right-[6.5rem]" />
        </button>
    );
};
