import React, { useMemo, useState } from 'react';
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import type { Accommodation, Activity, Transport, Trip } from '../../../types';
import { buildDays, type DayItem, type TripDay } from '../../../utils/tripItinerary';
import { formatDate } from '../../../utils/formatters';
import { Airplane, Bed, CalendarBlank, Moon, Plus } from '../../ui/hugeicons';
import { RpEmpty, RpLogo, useIsMobile } from '../ui';
import { MODE_ICON, money, nights } from '../trips/TripDetailsModal';
import { stayIcon } from '../trips/stayIcon';
import { STAY_ACCENT, TRANSPORT_ACCENT } from '../trips/accents';
import { modeLook } from '../trips/transportModes';
import type { EditStep } from './TripPanels';
import { cn } from '../../../utils/cn';

/**
 * Canvas: the whole plan on one page (UI_UX_DESIGN_REFERENCE.md §8). One row per day, and across it
 * Transport, Stay and Activities side by side. A stay is one bar that runs from its check-in
 * afternoon to its check-out morning, so the nights you have a bed (and the ones you don't) show at
 * a glance. Phones stack the same things in one card per day.
 *
 * Activities, transport legs and stays can be dragged to another day (mouse, a long press on touch, or
 * the keyboard); a leg or stay keeps its length and moves as a whole.
 */

export type CanvasKind = 'activity' | 'transport' | 'stay';
export interface CanvasMoves {
    /** Moves an activity to a day. */
    onMoveActivity: (id: string, date: string) => void;
    /** Moves a leg by whole days; its arrival moves with it. */
    onMoveTransport: (id: string, deltaDays: number) => void;
    /** Moves a stay by whole days; check-out moves with it. */
    onMoveStay: (id: string, deltaDays: number) => void;
}

interface DragData { kind: CanvasKind; id: string; dayIndex: number }
interface DropData { kind: CanvasKind; date: string; dayIndex: number }

/** Only a drop cell of the dragged thing's own kind counts, under the pointer. */
const collision: CollisionDetection = args => {
    const kind = (args.active.data.current as DragData | undefined)?.kind;
    return pointerWithin({ ...args, droppableContainers: args.droppableContainers.filter(c => (c.data.current as DropData | undefined)?.kind === kind) });
};

const Draggable: React.FC<{ id: string; data: DragData; label: string; className?: string; style?: React.CSSProperties; children: React.ReactNode }> = ({ id, data, label, className, style, children }) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data });
    return (
        <div ref={setNodeRef} {...attributes} {...listeners} aria-label={label} style={style} className={cn(className, isDragging && 'opacity-30')}>
            {children}
        </div>
    );
};

const DropCell: React.FC<{ id: string; data: DropData; className?: string; style?: React.CSSProperties; role?: string; children?: React.ReactNode }> = ({ id, data, className, style, role, children }) => {
    const { setNodeRef, isOver } = useDroppable({ id, data });
    return (
        <div ref={setNodeRef} role={role} style={style} className={cn(className, isOver && 'rounded-rp-inset bg-rp-mustard/20 ring-2 ring-rp-mustard')}>
            {children}
        </div>
    );
};

const HEAD = 'sticky top-0 z-raised flex items-center gap-2 bg-rp-canvas/95 px-3 pb-3 text-xs font-medium text-rp-muted backdrop-blur-sm';
const CHIP = 'flex min-h-11 w-full min-w-0 items-center gap-2 rounded-rp-inset bg-rp-inset px-2.5 text-left outline-none transition-colors duration-150 hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted';
const ADD = 'inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-rp-muted outline-none transition-colors duration-150 hover:bg-rp-inset hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted';

interface StaySpan { stay: Accommodation; first: number; last: number; nights: number; /** Side-by-side position when stays share nights. */ lane: number; lanes: number }
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
        spans.push({ stay, first, last: Math.min(last, total - 1), nights: Math.max(1, outIdx - inIdx), lane: 0, lanes: 1 });
    });
    // Stays that share nights sit side by side instead of on top of each other.
    spans.sort((a, b) => a.first - b.first || a.last - b.last);
    spans.forEach((sp, i) => {
        const taken = new Set(spans.slice(0, i).filter(o => o.last >= sp.first).map(o => o.lane));
        while (taken.has(sp.lane)) sp.lane += 1;
    });
    spans.forEach(sp => {
        const overlapping = spans.filter(o => o.first <= sp.last && o.last >= sp.first);
        sp.lanes = Math.max(...overlapping.map(o => o.lane)) + 1;
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
            <RpLogo size="sm" name={t.provider} src={t.logoUrl} brandfetchApiKey={brandfetchApiKey} fallback={Mode} iconClassName={modeLook(t.mode).text} />
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
    // Stays side by side are narrow: name and nights only, wrapped rather than cut off.
    const compact = span.lanes > 1;
    return (
        <button
            type="button"
            onClick={onClick}
            style={style}
            className={cn('flex min-h-11 min-w-0 flex-col justify-start gap-2 rounded-rp-inset border border-rp-mustard/50 bg-rp-mustard/20 p-2.5 text-left outline-none transition-colors duration-150 hover:bg-rp-mustard/30 focus-visible:ring-2 focus-visible:ring-rp-muted', className)}
        >
            <span className={cn('flex min-w-0 gap-2', compact ? 'flex-col items-start' : 'items-center')}>
                <RpLogo size="sm" name={a.name} src={a.logoUrl} brandfetchApiKey={brandfetchApiKey} fallback={stayIcon(a.type)} iconClassName={STAY_ACCENT} />
                <span className="min-w-0 flex-1">
                    <span className={cn('block text-xs font-medium text-rp-ink', compact ? 'break-words' : 'truncate')}>{a.name}</span>
                    {compact ? null : <span className="block truncate text-2xs text-rp-muted">{a.type}</span>}
                </span>
                {!compact && money(a.cost) ? <span className="rp-tabular text-xs text-rp-ink">{money(a.cost)}</span> : null}
            </span>
            <span className="flex items-center gap-1.5 text-2xs text-rp-muted">
                <Moon size={12} aria-hidden /> {nights(a.checkInDate, a.checkOutDate) ?? `${span.nights} night`}
                {!compact && a.checkInDate ? <span className="truncate">· {formatDate(a.checkInDate, 'short')}{a.checkOutDate ? ` – ${formatDate(a.checkOutDate, 'short')}` : ''}</span> : null}
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

export const TripCanvas: React.FC<{ trip: Trip; brandfetchApiKey?: string; onEdit: (step: EditStep) => void } & CanvasMoves> = ({
    trip, brandfetchApiKey, onEdit, onMoveActivity, onMoveTransport, onMoveStay,
}) => {
    const mobile = useIsMobile();
    const days = useMemo(() => buildDays(trip), [trip]);
    const { spans, gaps } = useMemo(() => layoutStays(trip, days), [trip, days]);
    const [dragging, setDragging] = useState<{ kind: CanvasKind; id: string; label: string } | null>(null);
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
        useSensor(KeyboardSensor)
    );
    if (days.length === 0) {
        return <div className="rounded-rp-card bg-rp-surface rp-shadow-rest"><RpEmpty title="No dates yet">Add the trip's dates and the canvas fills in.</RpEmpty></div>;
    }
    const dayIndex = new Map(days.map((d, i) => [d.date, i]));
    const transport = (d: TripDay) => d.items.filter((i): i is Extract<DayItem, { kind: 'transport' }> => i.kind === 'transport');
    const activities = (d: TripDay) => d.items.filter((i): i is Extract<DayItem, { kind: 'activity' }> => i.kind === 'activity');
    // The stay that holds the night after a day (afternoon slot), for the phone cards.
    const stayAfter = (i: number) => spans.find(s => s.first <= 2 * i + 1 && s.last >= 2 * i + 1);
    const gapAfter = (i: number) => gaps.find(g => g.first <= 2 * i + 1 && g.last >= 2 * i + 1);

    const onDragStart = (e: DragStartEvent) => {
        const d = e.active.data.current as DragData | undefined;
        if (d) setDragging({ kind: d.kind, id: d.id, label: String(e.active.id) });
    };
    const onDragEnd = (e: DragEndEvent) => {
        setDragging(null);
        const from = e.active.data.current as DragData | undefined;
        const to = e.over?.data.current as DropData | undefined;
        if (!from || !to || from.kind !== to.kind || from.dayIndex === to.dayIndex) return;
        const delta = to.dayIndex - from.dayIndex;
        if (from.kind === 'activity') onMoveActivity(from.id, to.date);
        else if (from.kind === 'transport') onMoveTransport(from.id, delta);
        else onMoveStay(from.id, delta);
    };

    // What follows the pointer: a copy of the chip being dragged.
    const overlay = (() => {
        if (!dragging) return null;
        if (dragging.kind === 'stay') {
            const sp = spans.find(x => x.stay.id === dragging.id);
            return sp ? <StayBar span={sp} brandfetchApiKey={brandfetchApiKey} onClick={() => undefined} className="w-64 rp-shadow-float" /> : null;
        }
        for (const d of days) {
            const it = d.items.find(x => x.kind === dragging.kind && (x.item as { id: string }).id === dragging.id);
            if (!it) continue;
            return (
                <div className="w-64 rp-shadow-float">
                    {it.kind === 'transport' ? <TransportChip item={it} brandfetchApiKey={brandfetchApiKey} onClick={() => undefined} />
                        : it.kind === 'activity' ? <ActivityChip item={it} onClick={() => undefined} /> : null}
                </div>
            );
        }
        return null;
    })();

    const transportChip = (it: Extract<DayItem, { kind: 'transport' }>, i: number) => it.part === 'depart' ? (
        <Draggable key={it.id} id={`transport:${it.item.id}`} data={{ kind: 'transport', id: it.item.id, dayIndex: i }} label={`Move ${it.item.origin} to ${it.item.destination}`}>
            <TransportChip item={it} brandfetchApiKey={brandfetchApiKey} onClick={() => onEdit(1)} />
        </Draggable>
    ) : <TransportChip key={it.id} item={it} brandfetchApiKey={brandfetchApiKey} onClick={() => onEdit(1)} />;
    const activityChip = (it: Extract<DayItem, { kind: 'activity' }>, i: number) => (
        <Draggable key={it.id} id={`activity:${it.item.id}`} data={{ kind: 'activity', id: it.item.id, dayIndex: i }} label={`Move ${it.item.title}`}>
            <ActivityChip item={it} onClick={() => onEdit(3)} />
        </Draggable>
    );

    return (
        <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
            <div className="rounded-rp-card bg-rp-surface p-3 rp-shadow-rest sm:p-5">
                {mobile ? (
                    /* Phones: one card per day. */
                    <ol className="flex flex-col gap-3" aria-label="Trip canvas">
                        {days.map((d, i) => {
                            const stay = stayAfter(i);
                            const gap = gapAfter(i);
                            return (
                                <li key={d.date} className="rounded-rp-tile bg-rp-inset p-3">
                                    <div className="mb-2 flex items-baseline justify-between gap-3">
                                        <h3 className="text-sm font-medium text-rp-ink">{formatDate(d.date, 'long')}</h3>
                                        <span className="text-xs text-rp-muted">{d.number > 0 ? `Day ${d.number}` : 'Outside the trip'}</span>
                                    </div>
                                    <DropCell id={`activity:${d.date}`} data={{ kind: 'activity', date: d.date, dayIndex: i }} className="flex flex-col gap-1.5">
                                        {activities(d).map(it => activityChip(it, i))}
                                    </DropCell>
                                    <DropCell id={`transport:${d.date}`} data={{ kind: 'transport', date: d.date, dayIndex: i }} className="mt-1.5 flex flex-col gap-1.5">
                                        {transport(d).map(it => transportChip(it, i))}
                                    </DropCell>
                                    <div className="mt-1.5 flex flex-col gap-1.5">
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
                ) : (
                    /* Tablets and up: rows are days, columns are Transport, Stay and Activities. */
                    <div
                        role="table"
                        aria-label="Trip canvas"
                        className="grid gap-x-3 md:grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.1fr)]"
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
                                    <DropCell id={`transport:${d.date}`} data={{ kind: 'transport', date: d.date, dayIndex: i }} role="cell" className="flex flex-col gap-1.5 border-t border-rp-line py-2" style={{ gridColumn: 2, gridRow: row }}>
                                        {transport(d).map(it => transportChip(it, i))}
                                        <button type="button" onClick={() => onEdit(1)} className={cn(ADD, 'self-start')} aria-label={`Add transport on ${formatDate(d.date, 'short')}`}><Plus size={14} aria-hidden /> Add</button>
                                    </DropCell>
                                    <DropCell id={`stay:${d.date}`} data={{ kind: 'stay', date: d.date, dayIndex: i }} role="cell" className="border-t border-rp-line" style={{ gridColumn: 3, gridRow: row }} />
                                    <DropCell id={`activity:${d.date}`} data={{ kind: 'activity', date: d.date, dayIndex: i }} role="cell" className="flex flex-col gap-1.5 border-t border-rp-line py-2" style={{ gridColumn: 4, gridRow: row }}>
                                        {activities(d).map(it => activityChip(it, i))}
                                        <button type="button" onClick={() => onEdit(3)} className={cn(ADD, 'self-start')} aria-label={`Add activity on ${formatDate(d.date, 'short')}`}><Plus size={14} aria-hidden /> Add</button>
                                    </DropCell>
                                </React.Fragment>
                            );
                        })}

                        {spans.map(sp => (
                            <Draggable
                                key={sp.stay.id}
                                id={`stay:${sp.stay.id}`}
                                data={{ kind: 'stay', id: sp.stay.id, dayIndex: Math.floor(sp.first / 2) }}
                                label={`Move ${sp.stay.name}`}
                                className="z-raised my-1 flex"
                                style={{ gridColumn: 3, gridRow: `${sp.first + 2} / ${sp.last + 3}`, width: `${100 / sp.lanes}%`, marginLeft: `${(100 / sp.lanes) * sp.lane}%` }}
                            >
                                <StayBar span={sp} brandfetchApiKey={brandfetchApiKey} onClick={() => onEdit(2)} className="w-full" />
                            </Draggable>
                        ))}
                        {gaps.map(g => (
                            <GapBar key={`${g.first}`} onClick={() => onEdit(2)} className="z-raised my-1" style={{ gridColumn: 3, gridRow: `${g.first + 2} / ${g.last + 3}` }} />
                        ))}
                    </div>
                )}
            </div>
            <DragOverlay>{overlay}</DragOverlay>
        </DndContext>
    );
};
