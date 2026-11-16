import React, { useEffect, useMemo, useRef } from 'react';
import type { LeaveEntry } from '../../../types';
import {
    addDaysISO, isWeekend, itemsOn, layoutWeek, weekOf, weekdayOf, MONTH_NAMES, WEEKDAY_LONG, WEEKDAY_SHORT,
    type CalendarItem, type WeekStart,
} from '../../../utils/calendarModel';
import { useDayDrag } from '../../../hooks/useDayDrag';
import { chipClass, itemWords } from './calendarStyles';
import { SunHorizon } from '../../ui/hugeicons';
import { ItemIcon } from './ItemIcon';
import { cn } from '../../../utils/cn';

/**
 * The week view (leave Phase 2c): the seven days around the focused day, with room for every item. Wide screens show
 * the days side by side with bars that run across the days they cover (up to eight, then "+N"); phones list the days
 * one under another. Arrow keys move by a day (into the next or last week), Enter opens the day. As on the month grid,
 * dragging across days picks them for new leave and a leave bar can be dragged to other days.
 */

const LANES = 8;

export const WeekGrid: React.FC<{
    weekStart: WeekStart;
    items: CalendarItem[];
    workingDays: number[];
    today: string;
    selected: string | null;
    /** The focused day: the week shown is the one it falls in. */
    focusISO: string;
    compact: boolean;
    onFocusISO: (iso: string) => void;
    onOpen: (iso: string) => void;
    wantFocus: React.MutableRefObject<boolean>;
    onSelectRange?: (start: string, end: string) => void;
    onMoveLeave?: (entry: LeaveEntry, by: number) => void;
    movable?: (key: string) => LeaveEntry | undefined;
}> = ({ weekStart, items, workingDays, today, selected, focusISO, compact, onFocusISO, onOpen, wantFocus, onSelectRange, onMoveLeave, movable }) => {
    const days = useMemo(() => weekOf(focusISO, weekStart), [focusISO, weekStart]);
    const layout = useMemo(() => layoutWeek(items, days, LANES), [items, days]);
    const gridRef = useRef<HTMLDivElement>(null);
    const dragging = useDayDrag({ enabled: !compact, onSelectRange, onMoveLeave, movable });
    const painted = dragging.range;

    useEffect(() => {
        if (!wantFocus.current) return;
        const cell = gridRef.current?.querySelector<HTMLElement>(`[data-iso="${focusISO}"]`);
        if (!cell) return;
        wantFocus.current = false;
        cell.focus();
    }, [focusISO, wantFocus]);

    const onKeyDown = (e: React.KeyboardEvent) => {
        const by = e.key === 'ArrowLeft' || (compact && e.key === 'ArrowUp') ? -1
            : e.key === 'ArrowRight' || (compact && e.key === 'ArrowDown') ? 1
            : e.key === 'PageUp' ? -7 : e.key === 'PageDown' ? 7 : 0;
        if (!by) return;
        e.preventDefault();
        wantFocus.current = true;
        onFocusISO(addDaysISO(focusISO, by));
    };

    const dateWords = (iso: string) => `${WEEKDAY_LONG[weekdayOf(iso)]} ${Number(iso.slice(8))} ${MONTH_NAMES[Number(iso.slice(5, 7)) - 1]}`;
    const labelOf = (iso: string, here: CalendarItem[]) => (here.length === 0
        ? `${dateWords(iso)}, nothing`
        : `${dateWords(iso)}, ${here.length} ${here.length === 1 ? 'item' : 'items'}: ${here.slice(0, 6).map(itemWords).join('; ')}${here.length > 6 ? `; and ${here.length - 6} more` : ''}`);

    if (compact) {
        return (
            <div ref={gridRef} role="list" aria-label="Week" onKeyDown={onKeyDown} className="flex flex-col gap-px overflow-hidden rounded-rp-inset border border-rp-line bg-rp-line">
                {days.map(iso => {
                    const here = itemsOn(items, iso);
                    const isToday = iso === today;
                    return (
                        <div key={iso} role="listitem" className={cn(isWeekend(iso, workingDays) ? 'bg-rp-inset' : 'bg-rp-surface')}>
                            <button
                                type="button"
                                data-iso={iso}
                                tabIndex={iso === focusISO ? 0 : -1}
                                aria-label={labelOf(iso, here)}
                                aria-current={isToday ? 'date' : undefined}
                                onFocus={() => onFocusISO(iso)}
                                onClick={() => onOpen(iso)}
                                className={cn('flex min-h-14 w-full items-start gap-3 px-3 py-2 text-left outline-none hover:bg-rp-inset/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rp-ink', selected === iso && 'bg-rp-inset')}
                            >
                                <span className="flex w-10 shrink-0 flex-col items-center">
                                    <span className="text-2xs font-semibold text-rp-muted">{WEEKDAY_SHORT[weekdayOf(iso)]}</span>
                                    <span className={cn('rp-tabular inline-flex size-8 items-center justify-center rounded-full text-sm', isToday ? 'bg-rp-ink font-semibold text-rp-on-ink' : 'text-rp-ink')}>{Number(iso.slice(8))}</span>
                                </span>
                                <span className="flex min-w-0 flex-1 flex-col gap-1 pt-1" aria-hidden>
                                    {here.length === 0 ? <span className="text-xs text-rp-muted">Nothing</span> : here.map(i => {
                                        return (
                                            <span key={i.key} className={cn('flex h-7 items-center gap-1.5 overflow-hidden rounded-full px-2.5 text-xs font-medium', chipClass(i))}>
                                                <ItemIcon item={i} size={12} className="shrink-0" />
                                                <span className="truncate">{i.title}</span>
                                            </span>
                                        );
                                    })}
                                </span>
                            </button>
                        </div>
                    );
                })}
            </div>
        );
    }

    return (
        <div
            ref={gridRef}
            role="grid"
            aria-label={`Week of ${dateWords(days[0])}`}
            aria-readonly
            onKeyDown={onKeyDown}
            onPointerDown={dragging.onPointerDown}
            onClickCapture={dragging.onClickCapture}
            className={cn('flex select-none flex-col gap-px overflow-hidden rounded-rp-inset border border-rp-line bg-rp-line', dragging.drag && (dragging.drag.mode === 'move' ? 'cursor-grabbing' : 'cursor-cell'))}
        >
            <div role="row" className="grid grid-cols-7 gap-px">
                {days.map(iso => {
                    const isToday = iso === today;
                    return (
                        <div key={iso} role="columnheader" aria-label={dateWords(iso)} className="flex flex-col items-center gap-0.5 bg-rp-inset py-2">
                            <span className="text-xs font-semibold text-rp-muted">{WEEKDAY_SHORT[weekdayOf(iso)]}</span>
                            <span className={cn('rp-tabular inline-flex size-8 items-center justify-center rounded-full text-base', isToday ? 'bg-rp-ink font-semibold text-rp-on-ink' : 'text-rp-ink')}>{Number(iso.slice(8))}</span>
                        </div>
                    );
                })}
            </div>
            <div role="row" className="grid grid-cols-7 gap-px">
                {days.map((iso, c) => {
                    const cell = layout[c];
                    const here = itemsOn(items, iso);
                    return (
                        <div key={iso} role="gridcell" aria-selected={selected === iso} className={cn('relative min-w-0', isWeekend(iso, workingDays) ? 'bg-rp-inset' : 'bg-rp-surface')}>
                            {painted && iso >= painted.start && iso <= painted.end ? (
                                <span className={cn('pointer-events-none absolute inset-0 z-raised ring-2 ring-inset', painted.mode === 'move' ? 'bg-rp-green/10 ring-rp-green' : 'bg-rp-ink/10 ring-rp-ink')} aria-hidden />
                            ) : null}
                            <button
                                type="button"
                                data-iso={iso}
                                tabIndex={iso === focusISO ? 0 : -1}
                                aria-label={labelOf(iso, here)}
                                aria-current={iso === today ? 'date' : undefined}
                                onFocus={() => onFocusISO(iso)}
                                onClick={() => onOpen(iso)}
                                className={cn('flex min-h-[22rem] w-full flex-col items-stretch gap-1 py-2 text-left outline-none transition-colors hover:bg-rp-inset/70 focus-visible:z-raised focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rp-ink', selected === iso && 'bg-rp-inset')}
                            >
                                <span className="flex flex-col gap-1" aria-hidden>
                                    {cell.slots.map((slot, lane) => {
                                        if (!slot) return <span key={lane} className="h-8" />;
                                        const showLabel = slot.first || c === 0;
                                        const grab = slot.item.kind === 'leave' && onMoveLeave && movable?.(slot.item.key) ? slot.item.key : undefined;
                                        return (
                                            <span
                                                key={lane}
                                                data-leave-key={grab}
                                                className={cn(
                                                    grab && 'cursor-grab',
                                                    'flex h-8 items-center gap-1.5 overflow-hidden text-xs leading-none font-medium',
                                                    chipClass(slot.item),
                                                    slot.first ? 'ml-1 rounded-l-full pl-2' : '-ml-px',
                                                    slot.last ? 'mr-1 rounded-r-full pr-2' : '-mr-px',
                                                )}
                                            >
                                                {showLabel ? <ItemIcon item={slot.item} size={14} className="shrink-0" /> : null}
                                                {showLabel ? <span className="truncate">{slot.item.title}</span> : null}
                                                {showLabel && slot.item.kind === 'trip' && slot.item.leave ? <SunHorizon size={14} className="shrink-0 opacity-70" aria-hidden /> : null}
                                            </span>
                                        );
                                    })}
                                    {cell.more > 0 ? <span className="rp-tabular px-2 text-xs leading-none text-rp-muted">+{cell.more} more</span> : null}
                                </span>
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
