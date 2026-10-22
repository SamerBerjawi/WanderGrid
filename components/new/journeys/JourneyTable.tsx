import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Carrier } from '../../../types';
import { ArrowRight, ArrowUp, Check, CaretDown, Path, Stack } from '../../ui/hugeicons';
import { TripMenu, type TripMenuItem } from '../trips/TripMenu';
import { modeLook } from '../trips/transportModes';
import { CarrierCell, DelayChip, StatusPill, layoverTone } from './JourneyParts';
import { formatDate } from '../../../utils/formatters';
import {
    formatMinutes, groupJourneys, isIndependent, layoverMinutes, journeyKm, journeyMinutes, journeyRoute, journeyStatus, placeCode, placeName, yearOf,
    type JourneyGroup, type JourneyRecord, type JourneySortKey,
} from '../../../utils/journeysModel';
import { cn } from '../../../utils/cn';

/**
 * The journey table (the invoices table of the reference video): one row per journey with its carrier,
 * route, date and times, length, trip and status. Wide screens show every column; tablets drop the
 * length and the trip; phones show each row as a small card. Rows never scroll sideways. A long list
 * shows its first rows, a fade and "Show all N".
 */

export const TABLE_CAP = 10;

const GRID_MD = 'md:grid md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_minmax(0,1fr)_7.5rem_2.75rem] md:items-center md:gap-x-4';
const GRID_LG = 'lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,.8fr)_minmax(0,1fr)_7.5rem_2.75rem]';

const arrivesLater = (r: JourneyRecord) => Boolean(r.flight.arrivalDate && r.flight.departureDate && r.flight.arrivalDate > r.flight.departureDate);

const HeadButton: React.FC<{ label: string; sortKey: JourneySortKey; sort: JourneySortKey; asc: boolean; onSort: (k: JourneySortKey) => void; className?: string }> = ({ label, sortKey, sort, asc, onSort, className }) => {
    const active = sort === sortKey;
    return (
        <button
            type="button"
            onClick={() => onSort(sortKey)}
            aria-label={`Sort by ${label.toLowerCase()}`}
            className={cn('-ml-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-xs font-medium outline-none hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted', active ? 'text-rp-ink' : 'text-rp-muted', className)}
        >
            {label}
            <ArrowUp size={12} className={cn('transition-transform duration-150', active ? (asc ? '' : 'rotate-180') : 'opacity-0')} aria-hidden />
        </button>
    );
};

/** How many rows render at once once the whole log is shown; more load as you scroll, so a log of thousands stays quick. */
const CHUNK = 60;

/** A growing limit: starts at CHUNK, grows by CHUNK when the returned sentinel scrolls into view, resets when `reset` changes. */
const useChunk = (total: number, reset: unknown) => {
    const [limit, setLimit] = useState(CHUNK);
    const sentinel = useRef<HTMLDivElement>(null);
    useEffect(() => { setLimit(CHUNK); }, [reset]);
    useEffect(() => {
        const el = sentinel.current;
        if (!el || limit >= total || typeof IntersectionObserver === 'undefined') return;
        const io = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) setLimit(l => l + CHUNK); }, { rootMargin: '600px' });
        io.observe(el);
        return () => io.disconnect();
    }, [limit, total]);
    return { limit, sentinel, more: limit < total };
};

export type JourneyGrouping = 'none' | 'year' | 'journey';

interface RowProps {
    rec: JourneyRecord;
    now: number;
    selectedId?: string | null;
    onOpen: (record: JourneyRecord) => void;
    menu: (record: JourneyRecord) => TripMenuItem[];
    selecting?: boolean;
    selectedIds?: Set<string>;
    brandfetchApiKey?: string;
    carriers?: Carrier[];
    /** Inside an open journey: indented under its header. */
    nested?: boolean;
}

const Row: React.FC<RowProps> = ({ rec, now, selectedId, onOpen, menu, selecting, selectedIds, brandfetchApiKey, carriers, nested }) => {
    const t = rec.flight;
    const look = modeLook(t.mode);
    const status = journeyStatus(t, now);
    const km = journeyKm(t);
    const ticked = selectedIds?.has(t.id);
    const label = `${t.origin} to ${t.destination}, ${formatDate(t.departureDate, 'short-with-year')}`;
    return (
        <div
            role="row"
            aria-selected={selecting ? Boolean(ticked) : selectedId === t.id}
            className={cn(
                'group/row relative flex items-center gap-3 rounded-rp-inset border-t border-rp-line px-3 py-2.5 first:border-t-0 md:py-1 [content-visibility:auto] [contain-intrinsic-size:auto_72px]',
                GRID_MD, GRID_LG, 'transition-colors duration-150 hover:bg-rp-inset',
                nested && 'ml-3 border-l-2 border-l-rp-line pl-3 sm:ml-5',
                (selectedId === t.id || ticked) && 'bg-rp-inset'
            )}
        >
            {selecting ? (
                <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full border-2 md:absolute md:left-4', ticked ? 'border-rp-ink bg-rp-ink text-rp-on-ink' : 'border-rp-line bg-rp-surface text-transparent')} aria-hidden>
                    <Check size={14} />
                </span>
            ) : null}

            {/* Phones: a small card per journey. */}
            <div role="cell" className="flex min-w-0 flex-1 flex-col gap-2 md:hidden">
                <div className="flex items-center gap-2">
                    <button type="button" onClick={() => onOpen(rec)} aria-label={label} className="flex min-w-0 flex-1 items-center text-left outline-none after:absolute after:inset-0 after:rounded-rp-inset focus-visible:after:ring-2 focus-visible:after:ring-rp-muted">
                        <CarrierCell t={t} brandfetchApiKey={brandfetchApiKey} carriers={carriers} className="min-w-0 flex-1" />
                    </button>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                        <StatusPill status={status} mode={t.mode} />
                        <DelayChip delay={status.delay} />
                    </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                        <span className="rp-tabular text-base font-semibold text-rp-ink">{placeCode(t.origin, t.mode)}</span>
                        <ArrowRight size={14} className={look.text} aria-hidden />
                        <span className="rp-tabular text-base font-semibold text-rp-ink">{placeCode(t.destination, t.mode)}</span>
                    </span>
                    <span className="rp-tabular truncate text-xs text-rp-muted">
                        {formatDate(t.departureDate, 'short')} · {t.departureTime || '--:--'}{journeyMinutes(t) ? ` · ${formatMinutes(journeyMinutes(t))}` : ''}
                    </span>
                </div>
            </div>

            {/* Tablet and up: one cell per column. */}
            <div role="cell" className={cn('hidden min-w-0 md:block', selecting && 'md:pl-10')}>
                <button type="button" onClick={() => onOpen(rec)} aria-label={label} className="flex min-w-0 max-w-full items-center text-left outline-none after:absolute after:inset-0 after:rounded-rp-inset focus-visible:after:ring-2 focus-visible:after:ring-rp-muted">
                    <CarrierCell t={t} brandfetchApiKey={brandfetchApiKey} carriers={carriers} />
                </button>
            </div>
            <div role="cell" className="hidden min-w-0 flex-col gap-0.5 md:flex">
                <span className="flex items-center gap-2">
                    <span className="rp-tabular text-base font-semibold text-rp-ink">{placeCode(t.origin, t.mode)}</span>
                    <ArrowRight size={14} className={look.text} aria-hidden />
                    <span className="rp-tabular text-base font-semibold text-rp-ink">{placeCode(t.destination, t.mode)}</span>
                </span>
                <span className="truncate text-xs text-rp-muted">{placeName(t.origin)} to {placeName(t.destination)}</span>
            </div>
            <div role="cell" className="hidden min-w-0 flex-col gap-0.5 md:flex">
                <span className="rp-tabular truncate text-sm font-medium text-rp-ink">{formatDate(t.departureDate, 'short-with-year')}</span>
                <span className="rp-tabular truncate text-xs text-rp-muted">{t.departureTime || '--:--'} → {t.arrivalTime || '--:--'}{arrivesLater(rec) ? ' +1' : ''}</span>
            </div>
            <div role="cell" className="hidden min-w-0 flex-col gap-0.5 lg:flex">
                <span className="rp-tabular truncate text-sm font-medium text-rp-ink">{formatMinutes(journeyMinutes(t))}</span>
                <span className="rp-tabular truncate text-xs text-rp-muted">{km ? `${km.toLocaleString('en-US')} km` : '—'}</span>
            </div>
            <div role="cell" className="hidden min-w-0 lg:block">
                {isIndependent(rec.trip.id)
                    ? <span className="inline-flex min-h-6 items-center rounded-full bg-rp-inset px-2.5 text-2xs font-medium text-rp-muted group-hover/row:bg-rp-surface">No trip</span>
                    : <span className="block truncate text-sm text-rp-ink">{rec.trip.name}</span>}
            </div>
            <div role="cell" className="hidden flex-col items-start gap-1 md:flex">
                <StatusPill status={status} mode={t.mode} />
                <DelayChip delay={status.delay} />
            </div>
            <div role="cell" className="relative z-raised shrink-0 self-start md:self-center">
                {selecting ? null : <TripMenu label={`More for ${label}`} items={menu(rec)} />}
            </div>
        </div>
    );
};

/** The wait between two legs of a journey: a layover for a connection, a stay for a longer gap. */
const GapRow: React.FC<{ a: JourneyRecord; b: JourneyRecord }> = ({ a, b }) => {
    const mins = layoverMinutes(a.flight, b.flight);
    if (mins <= 0) return null;
    const stay = mins > 24 * 60;
    const days = Math.round(mins / 1440);
    const place = placeName(a.flight.destination) || placeCode(a.flight.destination, a.flight.mode);
    return (
        <div role="row" className="ml-3 flex min-h-9 items-center border-l-2 border-dashed border-rp-line pl-3 sm:ml-5">
            <span role="cell" className={cn('rp-tabular inline-flex min-h-6 items-center rounded-full px-2.5 text-2xs font-semibold', layoverTone(mins))}>
                {stay ? `${days} ${days === 1 ? 'day' : 'days'} in ${place}` : `Layover ${formatMinutes(mins)} in ${placeCode(a.flight.destination, a.flight.mode)}`}
            </span>
        </div>
    );
};

/** The header row of a journey (flights that belong together): its route, dates, totals and status. Opens its legs. */
const JourneyHeader: React.FC<{ group: JourneyGroup; open: boolean; onToggle: () => void; onTimeline: (g: JourneyGroup) => void; now: number }> = ({ group, open, onToggle, onTimeline, now }) => {
    const first = group.legs[0].flight;
    const last = group.legs[group.legs.length - 1].flight;
    const minutes = group.legs.reduce((n, r) => n + journeyMinutes(r.flight), 0);
    const km = group.legs.reduce((n, r) => n + journeyKm(r.flight), 0);
    const states = group.legs.map(r => journeyStatus(r.flight, now));
    const state = states.some(s => s.state === 'travelling') ? states.find(s => s.state === 'travelling')! : states.find(s => s.state === 'scheduled') ?? states[states.length - 1];
    const route = journeyRoute(group.legs).join(' → ');
    const name = group.source === 'trip' ? group.trip.name : group.source === 'booking' ? 'One booking' : 'Found by matching';
    const waits = group.legs.slice(1).map((r, i) => layoverMinutes(group.legs[i].flight, r.flight)).filter(m => m > 0 && m <= 24 * 60);
    const kind = group.shape === 'round-trip' ? 'Round trip' : group.shape === 'multi-city' ? 'Multi-city' : group.stops > 0 ? `${group.stops} ${group.stops === 1 ? 'stop' : 'stops'}` : 'Connection';
    const layover = waits.length ? ` · ${formatMinutes(waits.reduce((n, m) => n + m, 0))} layover` : '';
    return (
        <div role="row" className={cn('group/row relative flex items-center gap-3 rounded-rp-inset border-t border-rp-line px-3 py-2.5 first:border-t-0 md:py-1.5', GRID_MD, GRID_LG, 'bg-rp-inset/50 hover:bg-rp-inset')}>
            <div role="cell" className="min-w-0 md:col-span-2">
                <button type="button" aria-expanded={open} onClick={onToggle} className="flex min-w-0 max-w-full items-center gap-3 text-left outline-none after:absolute after:inset-0 after:rounded-rp-inset focus-visible:after:ring-2 focus-visible:after:ring-rp-muted">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-rp-ink text-rp-on-ink"><Stack size={16} aria-hidden /></span>
                    <span className="flex min-w-0 flex-col">
                        <span className="rp-tabular truncate text-sm font-semibold text-rp-ink">{route}</span>
                        <span className="truncate text-xs text-rp-muted">{kind}{layover} · {group.legs.length} flights · {name}</span>
                    </span>
                    <CaretDown size={16} className={cn('shrink-0 text-rp-muted transition-transform duration-150', open && 'rotate-180')} aria-hidden />
                </button>
            </div>
            <div role="cell" className="hidden min-w-0 flex-col gap-0.5 md:flex">
                <span className="rp-tabular truncate text-sm font-medium text-rp-ink">{formatDate(first.departureDate, 'short')}{last.departureDate !== first.departureDate ? ` – ${formatDate(last.departureDate, 'short-with-year')}` : `, ${new Date(first.departureDate).getFullYear()}`}</span>
                <span className="rp-tabular truncate text-xs text-rp-muted">{group.outbound.length} out{group.returns.length ? ` · ${group.returns.length} back` : ''}</span>
            </div>
            <div role="cell" className="hidden min-w-0 flex-col gap-0.5 lg:flex">
                <span className="rp-tabular truncate text-sm font-medium text-rp-ink">{formatMinutes(minutes)}</span>
                <span className="rp-tabular truncate text-xs text-rp-muted">{km ? `${km.toLocaleString('en-US')} km` : '—'}</span>
            </div>
            <div role="cell" className="hidden min-w-0 lg:block" />
            <div role="cell" className="flex shrink-0 flex-col items-end gap-1 md:items-start"><StatusPill status={state} mode={first.mode} /></div>
            <div role="cell" className="relative z-raised shrink-0">
                <button type="button" onClick={() => onTimeline(group)} aria-label={`Timeline of ${route}`} title="Timeline" className="inline-flex size-11 items-center justify-center rounded-full text-rp-muted outline-none hover:bg-rp-line hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted">
                    <Path size={18} aria-hidden />
                </button>
            </div>
        </div>
    );
};

export const JourneyTable: React.FC<{
    items: JourneyRecord[];
    sort: JourneySortKey;
    asc: boolean;
    onSort: (key: JourneySortKey) => void;
    selectedId?: string | null;
    onOpen: (record: JourneyRecord) => void;
    menu: (record: JourneyRecord) => TripMenuItem[];
    /** Rows show a tick box and a tap toggles the row instead of opening it. */
    selecting?: boolean;
    selectedIds?: Set<string>;
    brandfetchApiKey?: string;
    carriers?: Carrier[];
    expanded: boolean;
    onExpandedChange: (expanded: boolean) => void;
    /** A search or filter is on: show every match. */
    filtering: boolean;
    /** Names the carrier column ("Airline" for flights). */
    carrierHead?: string;
    noun: { one: string; many: string };
    grouping?: JourneyGrouping;
    /** Opens the timeline of a journey (grouping by journey). */
    onTimeline?: (group: JourneyGroup) => void;
}> = ({ items, sort, asc, onSort, selectedId, onOpen, menu, selecting, selectedIds, brandfetchApiKey, carriers, expanded, onExpandedChange, filtering, carrierHead = 'Airline', noun, grouping = 'none', onTimeline }) => {
    const now = Date.now();
    const rowProps = { now, selectedId, onOpen, menu, selecting, selectedIds, brandfetchApiKey, carriers };

    // Year groups: the two newest open, the rest folded; a year with the open flight stays open.
    const years = useMemo(() => {
        const map = new Map<string, JourneyRecord[]>();
        items.forEach(r => { const y = yearOf(r); map.set(y, [...(map.get(y) || []), r]); });
        return [...map.entries()];
    }, [items]);
    const [yearToggled, setYearToggled] = useState<Record<string, boolean>>({});
    const yearOpen = (year: string, index: number, list: JourneyRecord[]) =>
        year in yearToggled ? yearToggled[year] : index < 2 || filtering || list.some(r => r.flight.id === selectedId);
    const [journeyToggled, setJourneyToggled] = useState<Record<string, boolean>>({});

    const units = useMemo(() => (grouping === 'journey' ? groupJourneys(items) : []), [grouping, items]);
    const chunk = useChunk(grouping === 'journey' ? units.length : items.length, `${grouping}:${items.length}`);
    const count = grouping === 'journey' ? units.length : items.length;
    const overCap = grouping !== 'year' && count > TABLE_CAP;
    const capped = overCap && !expanded && !filtering;

    let body: React.ReactNode;
    if (grouping === 'year') {
        body = years.map(([year, list], i) => {
            const open = yearOpen(year, i, list);
            const km = list.reduce((n, r) => n + journeyKm(r.flight), 0);
            return (
                <section key={year} aria-label={year} className="flex flex-col">
                    <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setYearToggled(t => ({ ...t, [year]: !open }))}
                        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-rp-inset px-3 text-left outline-none hover:bg-rp-inset focus-visible:ring-2 focus-visible:ring-rp-muted"
                    >
                        <span className="rp-tabular text-sm font-semibold text-rp-ink">{year} <span className="font-normal text-rp-muted">· {list.length} {list.length === 1 ? noun.one.toLowerCase() : noun.many}{km ? ` · ${km.toLocaleString('en-US')} km` : ''}</span></span>
                        <CaretDown size={16} className={cn('text-rp-muted transition-transform duration-150', open && 'rotate-180')} aria-hidden />
                    </button>
                    {open ? list.map(rec => <Row key={rec.flight.id} rec={rec} {...rowProps} />) : null}
                </section>
            );
        });
    } else if (grouping === 'journey') {
        const shownUnits = capped ? units.slice(0, TABLE_CAP) : units.slice(0, chunk.limit);
        body = shownUnits.map(u => {
            if (u.kind === 'single') return <Row key={u.rec.flight.id} rec={u.rec} {...rowProps} />;
            const open = journeyToggled[u.group.id] ?? false;
            return (
                <React.Fragment key={u.group.id}>
                    <JourneyHeader group={u.group} open={open} onToggle={() => setJourneyToggled(t => ({ ...t, [u.group.id]: !open }))} onTimeline={g => onTimeline?.(g)} now={now} />
                    {open ? u.group.legs.map((rec, i) => (
                        <React.Fragment key={rec.flight.id}>
                            {i > 0 ? <GapRow a={u.group.legs[i - 1]} b={rec} /> : null}
                            <Row rec={rec} {...rowProps} nested />
                        </React.Fragment>
                    )) : null}
                </React.Fragment>
            );
        });
    } else {
        body = (capped ? items.slice(0, TABLE_CAP) : items.slice(0, chunk.limit)).map(rec => <Row key={rec.flight.id} rec={rec} {...rowProps} />);
    }

    return (
        <div role="table" aria-label={`Your ${noun.many}`} className="flex flex-col rounded-rp-card bg-rp-surface p-2 rp-shadow-rest sm:p-3 lg:p-4">
            <div role="row" className={cn('hidden px-3 pb-1', GRID_MD, GRID_LG, selecting && 'md:pl-14')}>
                <span role="columnheader"><HeadButton label={carrierHead} sortKey="journey" sort={sort} asc={asc} onSort={onSort} /></span>
                <span role="columnheader"><HeadButton label="Route" sortKey="route" sort={sort} asc={asc} onSort={onSort} /></span>
                <span role="columnheader"><HeadButton label="Date" sortKey="date" sort={sort} asc={asc} onSort={onSort} /></span>
                <span role="columnheader" className="hidden lg:block"><HeadButton label="Length" sortKey="duration" sort={sort} asc={asc} onSort={onSort} /></span>
                <span role="columnheader" className="hidden text-xs font-medium text-rp-muted lg:block">Trip</span>
                <span role="columnheader" className="text-xs font-medium text-rp-muted">Status</span>
                <span role="columnheader" className="sr-only">Actions</span>
            </div>

            <div className={cn('flex flex-col', capped && '[mask-image:linear-gradient(to_bottom,black_68%,transparent)]')} role="rowgroup">{body}</div>
            {grouping !== 'year' && !capped && chunk.more ? <div ref={chunk.sentinel} className="h-10" aria-hidden /> : null}

            {overCap && !filtering ? (
                <button
                    type="button"
                    onClick={() => onExpandedChange(!expanded)}
                    className="mt-1 inline-flex min-h-11 items-center justify-center gap-1.5 self-center rounded-full px-4 text-sm font-medium text-rp-ink outline-none transition-colors duration-150 hover:bg-rp-inset focus-visible:ring-2 focus-visible:ring-rp-muted"
                >
                    {expanded ? 'Show fewer' : <>Show all {count} <CaretDown size={16} aria-hidden /></>}
                </button>
            ) : null}
        </div>
    );
};
