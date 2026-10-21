import React from 'react';
import type { Carrier } from '../../../types';
import { ArrowRight, ArrowUp, Check, CaretDown } from '../../ui/hugeicons';
import { TripMenu, type TripMenuItem } from '../trips/TripMenu';
import { modeLook } from '../trips/transportModes';
import { CarrierCell, DelayChip, StatusPill } from './JourneyParts';
import { formatDate } from '../../../utils/formatters';
import {
    formatMinutes, isIndependent, journeyKm, journeyMinutes, journeyStatus, placeCode, placeName,
    type JourneyRecord, type JourneySortKey,
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
}> = ({ items, sort, asc, onSort, selectedId, onOpen, menu, selecting, selectedIds, brandfetchApiKey, carriers, expanded, onExpandedChange, filtering, carrierHead = 'Airline', noun }) => {
    const overCap = items.length > TABLE_CAP;
    const capped = overCap && !expanded && !filtering;
    const visible = capped ? items.slice(0, TABLE_CAP) : items;
    const now = Date.now();

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

            <div className={cn('flex flex-col', capped && '[mask-image:linear-gradient(to_bottom,black_68%,transparent)]')} role="rowgroup">
                {visible.map(rec => {
                    const t = rec.flight;
                    const look = modeLook(t.mode);
                    const status = journeyStatus(t, now);
                    const km = journeyKm(t);
                    const ticked = selectedIds?.has(t.id);
                    const label = `${t.origin} to ${t.destination}, ${formatDate(t.departureDate, 'short-with-year')}`;
                    return (
                        <div
                            key={t.id}
                            role="row"
                            aria-selected={selecting ? Boolean(ticked) : selectedId === t.id}
                            className={cn(
                                'group/row relative flex items-center gap-3 rounded-rp-inset border-t border-rp-line px-3 py-2.5 first:border-t-0 md:py-1',
                                GRID_MD, GRID_LG, 'transition-colors duration-150 hover:bg-rp-inset',
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
                                        <span className="rp-tabular text-base font-semibold text-rp-ink">{placeCode(t.origin)}</span>
                                        <ArrowRight size={14} className={look.text} aria-hidden />
                                        <span className="rp-tabular text-base font-semibold text-rp-ink">{placeCode(t.destination)}</span>
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
                                    <span className="rp-tabular text-base font-semibold text-rp-ink">{placeCode(t.origin)}</span>
                                    <ArrowRight size={14} className={look.text} aria-hidden />
                                    <span className="rp-tabular text-base font-semibold text-rp-ink">{placeCode(t.destination)}</span>
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
                })}
            </div>

            {overCap && !filtering ? (
                <button
                    type="button"
                    onClick={() => onExpandedChange(!expanded)}
                    className="mt-1 inline-flex min-h-11 items-center justify-center gap-1.5 self-center rounded-full px-4 text-sm font-medium text-rp-ink outline-none transition-colors duration-150 hover:bg-rp-inset focus-visible:ring-2 focus-visible:ring-rp-muted"
                >
                    {expanded ? 'Show fewer' : <>Show all {items.length} <CaretDown size={16} aria-hidden /></>}
                </button>
            ) : null}
        </div>
    );
};
