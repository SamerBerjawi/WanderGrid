import React, { useMemo } from 'react';
import type { Accommodation, Activity, Transport, Trip } from '../../../types';
import { buildDays, type DayItem, type TripDay } from '../../../utils/tripItinerary';
import { formatDate } from '../../../utils/formatters';
import { Airplane, Bed, CalendarBlank, Moon, Plus } from '../../ui/hugeicons';
import { RpEmpty, RpLogo } from '../ui';
import { MODE_ICON, money, nights } from '../trips/TripDetailsModal';
import { stayIcon } from '../trips/stayIcon';
import { STAY_ACCENT, TRANSPORT_ACCENT } from '../trips/accents';
import type { EditStep } from './TripPanels';
import { cn } from '../../../utils/cn';

/**
 * Canvas: the whole plan on one page (UI_UX_DESIGN_REFERENCE.md §8). One row per day, and across it
 * Transport, Stay and Activities side by side. A stay is one bar that runs from its check-in
 * afternoon to its check-out morning, so the nights you have a bed (and the ones you don't) show at
 * a glance. Phones stack the same things in one card per day.
 */

const HEAD = 'sticky top-0 z-raised flex items-center gap-2 bg-rp-canvas/95 px-3 pb-3 text-xs font-medium text-rp-muted backdrop-blur-sm';
const CHIP = 'flex min-h-11 w-full min-w-0 items-center gap-2 rounded-rp-inset bg-rp-inset px-2.5 text-left outline-none transition-colors duration-150 hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted';
const ADD = 'inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-rp-muted outline-none transition-colors duration-150 hover:bg-rp-inset hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted';

interface StaySpan { stay: Accommodation; first: number; last: number; nights: number }
interface Gap { first: number; last: number; date: string }

/** The slots (two per day: morning, afternoon) each stay covers, and the uncovered stretches between. */
const layoutStays = (trip: Trip, days: TripDay[]): { spans: StaySpan[]; gaps: Gap[] } => {
    const index = new Map(days.map((d, i) => [d.date, i]));
    const total = days.length * 2;
    const covered = new Array<boolean>(total).fill(false);
    const spans: StaySpan[] = [];
    (trip.accommodations || []).forEach(stay => {
        const inIdx = index.get((stay.checkInDate || '').slice(0, 10));
        if (inIdx === undefined) return;
        const outIdx = index.get((stay.checkOutDate || '').slice(0, 10)) ?? inIdx;
        const first = 2 * inIdx + 1;
        const last = outIdx > inIdx ? 2 * outIdx : first;
        for (let s = first; s <= last && s < total; s++) covered[s] = true;
        spans.push({ stay, first, last: Math.min(last, total - 1), nights: Math.max(1, outIdx - inIdx) });
    });
    // The first morning and last afternoon are travel time, not a missing stay.
    const gaps: Gap[] = [];
    let start = -1;
    for (let s = 1; s <= total - 1; s++) {
        const open = s <= total - 2 && !covered[s];
        if (open && start < 0) start = s;
        if (!open && start >= 0) { gaps.push({ first: start, last: s - 1, date: days[Math.floor(start / 2)].date }); start = -1; }
    }
    return { spans, gaps };
};

const TransportChip: React.FC<{ item: Extract<DayItem, { kind: 'transport' }>; brandfetchApiKey?: string; onClick: () => void }> = ({ item, brandfetchApiKey, onClick }) => {
    const t: Transport = item.item;
    const Mode = MODE_ICON[t.mode] || Airplane;
    const arrive = item.part === 'arrive';
    return (
        <button type="button" onClick={onClick} className={CHIP}>
            <RpLogo size="sm" name={t.provider} src={t.logoUrl} brandfetchApiKey={brandfetchApiKey} fallback={Mode} iconClassName={TRANSPORT_ACCENT} />
            <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-rp-ink">{arrive ? `Arrive ${t.destination}` : `${t.origin} → ${t.destination}`}</span>
                <span className="block truncate text-2xs text-rp-muted">{[item.time, t.provider, t.identifier].filter(Boolean).join(' · ')}</span>
            </span>
            {!arrive && money(t.cost) ? <span className="rp-tabular text-xs text-rp-ink">{money(t.cost)}</span> : null}
        </button>
    );
};

const ActivityChip: React.FC<{ item: Extract<DayItem, { kind: 'activity' }>; onClick: () => void }> = ({ item, onClick }) => {
    const a: Activity = item.item;
    return (
        <button type="button" onClick={onClick} className={CHIP}>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-[10px] bg-rp-surface text-rp-green"><CalendarBlank size={14} aria-hidden /></span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-rp-ink">{a.title}</span>
                <span className="block truncate text-2xs text-rp-muted">{[a.time, a.location].filter(Boolean).join(' · ')}</span>
            </span>
            {money(a.cost) ? <span className="rp-tabular text-xs text-rp-ink">{money(a.cost)}</span> : null}
        </button>
    );
};

const StayBar: React.FC<{ span: StaySpan; brandfetchApiKey?: string; onClick: () => void; className?: string; style?: React.CSSProperties }> = ({ span, brandfetchApiKey, onClick, className, style }) => {
    const a = span.stay;
    return (
        <button
            type="button"
            onClick={onClick}
            style={style}
            className={cn('flex min-h-11 min-w-0 flex-col justify-start gap-2 rounded-rp-inset border border-rp-mustard/50 bg-rp-mustard/20 p-2.5 text-left outline-none transition-colors duration-150 hover:bg-rp-mustard/30 focus-visible:ring-2 focus-visible:ring-rp-muted', className)}
        >
            <span className="flex min-w-0 items-center gap-2">
                <RpLogo size="sm" name={a.name} src={a.logoUrl} brandfetchApiKey={brandfetchApiKey} fallback={stayIcon(a.type)} iconClassName={STAY_ACCENT} />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-rp-ink">{a.name}</span>
                    <span className="block truncate text-2xs text-rp-muted">{a.type}</span>
                </span>
                {money(a.cost) ? <span className="rp-tabular text-xs text-rp-ink">{money(a.cost)}</span> : null}
            </span>
            <span className="flex items-center gap-1.5 text-2xs text-rp-muted">
                <Moon size={12} aria-hidden /> {nights(a.checkInDate, a.checkOutDate) ?? `${span.nights} night`}
                {a.checkInDate ? <span className="truncate">· {formatDate(a.checkInDate, 'short')}{a.checkOutDate ? ` – ${formatDate(a.checkOutDate, 'short')}` : ''}</span> : null}
            </span>
        </button>
    );
};

const GapBar: React.FC<{ onClick: () => void; style?: React.CSSProperties; className?: string }> = ({ onClick, style, className }) => (
    <button
        type="button"
        onClick={onClick}
        style={style}
        className={cn('flex min-h-11 items-center justify-center gap-2 rounded-rp-inset border border-dashed border-rp-line px-2 text-xs font-medium text-rp-muted outline-none transition-colors duration-150 hover:border-rp-muted hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted', className)}
    >
        <Bed size={14} aria-hidden /> No stay booked <Plus size={14} aria-hidden />
    </button>
);

const dayTitle = (d: TripDay) => (
    <>
        <span className="block text-xs text-rp-muted">{d.number > 0 ? `Day ${d.number}` : 'Outside the trip'}</span>
        <span className="block text-sm font-medium text-rp-ink">{formatDate(d.date, 'short')}</span>
    </>
);

export const TripCanvas: React.FC<{ trip: Trip; brandfetchApiKey?: string; onEdit: (step: EditStep) => void }> = ({ trip, brandfetchApiKey, onEdit }) => {
    const days = useMemo(() => buildDays(trip), [trip]);
    const { spans, gaps } = useMemo(() => layoutStays(trip, days), [trip, days]);
    if (days.length === 0) {
        return <div className="rounded-rp-card bg-rp-surface rp-shadow-rest"><RpEmpty title="No dates yet">Add the trip's dates and the canvas fills in.</RpEmpty></div>;
    }
    const transport = (d: TripDay) => d.items.filter((i): i is Extract<DayItem, { kind: 'transport' }> => i.kind === 'transport');
    const activities = (d: TripDay) => d.items.filter((i): i is Extract<DayItem, { kind: 'activity' }> => i.kind === 'activity');
    // The stay that holds the night after a day (afternoon slot), for the phone cards.
    const stayAfter = (i: number) => spans.find(s => s.first <= 2 * i + 1 && s.last >= 2 * i + 1);
    const gapAfter = (i: number) => gaps.find(g => g.first <= 2 * i + 1 && g.last >= 2 * i + 1);

    return (
        <div className="rounded-rp-card bg-rp-surface p-3 rp-shadow-rest sm:p-5">
            {/* Tablets and up: rows are days, columns are Transport, Stay and Activities. */}
            <div
                role="table"
                aria-label="Trip canvas"
                className="hidden gap-x-3 md:grid md:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]"
                style={{ gridAutoRows: 'minmax(2.75rem, auto)' }}
            >
                <div role="columnheader" className={HEAD} style={{ gridColumn: 1, gridRow: 1 }}><CalendarBlank size={14} aria-hidden /> Day</div>
                <div role="columnheader" className={HEAD} style={{ gridColumn: 2, gridRow: 1 }}><Airplane size={14} className={TRANSPORT_ACCENT} aria-hidden /> Transport</div>
                <div role="columnheader" className={HEAD} style={{ gridColumn: 3, gridRow: 1 }}><Bed size={14} className={STAY_ACCENT} aria-hidden /> Stay</div>
                <div role="columnheader" className={HEAD} style={{ gridColumn: 4, gridRow: 1 }}><CalendarBlank size={14} className="text-rp-green" aria-hidden /> Activities</div>

                {days.map((d, i) => {
                    const row = `${2 * i + 2} / span 2`;
                    return (
                        <React.Fragment key={d.date}>
                            <div role="rowheader" className="border-t border-rp-line py-2 pr-2" style={{ gridColumn: 1, gridRow: row }}>{dayTitle(d)}</div>
                            <div role="cell" className="flex flex-col gap-1.5 border-t border-rp-line py-2" style={{ gridColumn: 2, gridRow: row }}>
                                {transport(d).map(it => <TransportChip key={it.id} item={it} brandfetchApiKey={brandfetchApiKey} onClick={() => onEdit(1)} />)}
                                <button type="button" onClick={() => onEdit(1)} className={cn(ADD, 'self-start')} aria-label={`Add transport on ${formatDate(d.date, 'short')}`}><Plus size={14} aria-hidden /> Add</button>
                            </div>
                            <div role="cell" className="border-t border-rp-line" style={{ gridColumn: 3, gridRow: row }} aria-hidden />
                            <div role="cell" className="flex flex-col gap-1.5 border-t border-rp-line py-2" style={{ gridColumn: 4, gridRow: row }}>
                                {activities(d).map(it => <ActivityChip key={it.id} item={it} onClick={() => onEdit(3)} />)}
                                <button type="button" onClick={() => onEdit(3)} className={cn(ADD, 'self-start')} aria-label={`Add activity on ${formatDate(d.date, 'short')}`}><Plus size={14} aria-hidden /> Add</button>
                            </div>
                        </React.Fragment>
                    );
                })}

                {spans.map(sp => (
                    <StayBar
                        key={sp.stay.id}
                        span={sp}
                        brandfetchApiKey={brandfetchApiKey}
                        onClick={() => onEdit(2)}
                        className="z-raised my-1"
                        style={{ gridColumn: 3, gridRow: `${sp.first + 2} / ${sp.last + 3}` }}
                    />
                ))}
                {gaps.map(g => (
                    <GapBar key={`${g.first}`} onClick={() => onEdit(2)} className="z-raised my-1" style={{ gridColumn: 3, gridRow: `${g.first + 2} / ${g.last + 3}` }} />
                ))}
            </div>

            {/* Phones: one card per day. */}
            <ol className="flex flex-col gap-3 md:hidden" aria-label="Trip canvas">
                {days.map((d, i) => {
                    const stay = stayAfter(i);
                    const gap = gapAfter(i);
                    return (
                        <li key={d.date} className="rounded-rp-tile bg-rp-inset p-3">
                            <div className="mb-2 flex items-baseline justify-between gap-3">
                                <h3 className="text-sm font-medium text-rp-ink">{formatDate(d.date, 'long')}</h3>
                                <span className="text-xs text-rp-muted">{d.number > 0 ? `Day ${d.number}` : 'Outside the trip'}</span>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                {transport(d).map(it => <TransportChip key={it.id} item={it} brandfetchApiKey={brandfetchApiKey} onClick={() => onEdit(1)} />)}
                                {activities(d).map(it => <ActivityChip key={it.id} item={it} onClick={() => onEdit(3)} />)}
                                {stay ? (
                                    stay.first === 2 * i + 1 ? <StayBar span={stay} brandfetchApiKey={brandfetchApiKey} onClick={() => onEdit(2)} /> : (
                                        <p className="flex min-h-11 items-center gap-2 px-1 text-xs text-rp-muted"><Moon size={14} aria-hidden /> Staying at {stay.stay.name}</p>
                                    )
                                ) : gap ? <GapBar onClick={() => onEdit(2)} /> : null}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1">
                                <button type="button" onClick={() => onEdit(1)} className={ADD}><Plus size={14} aria-hidden /> Transport</button>
                                <button type="button" onClick={() => onEdit(3)} className={ADD}><Plus size={14} aria-hidden /> Activity</button>
                            </div>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
};
