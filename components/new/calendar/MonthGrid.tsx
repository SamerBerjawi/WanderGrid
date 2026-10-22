import React, { useEffect, useMemo, useRef } from 'react';
import {
    addDaysISO, isWeekend, itemsOn, layoutWeek, monthMatrix, weekdayOf, weekdayOrder, MONTH_NAMES, WEEKDAY_LONG, WEEKDAY_SHORT,
    type CalendarItem, type WeekStart,
} from '../../../utils/calendarModel';
import { chipClass, dotClass, itemIcon, itemWords } from './calendarStyles';
import { cn } from '../../../utils/cn';

/**
 * The month grid: a grid of day buttons with roving tabindex (arrow keys move by a day or a week, Home and
 * End go to the ends of the week, Page Up and Page Down change month, Enter opens the day). Wide screens
 * show the first three items of a day as bars that run across the days they cover, then "+N"; phones
 * show dots and leave the details to the agenda under the grid.
 */

const LANES = 3;

export const MonthGrid: React.FC<{
    year: number;
    month0: number;
    weekStart: WeekStart;
    items: CalendarItem[];
    workingDays: number[];
    today: string;
    /** The day whose detail is open. */
    selected: string | null;
    /** The day that takes the Tab stop. */
    focusISO: string;
    compact: boolean;
    onFocusISO: (iso: string) => void;
    onOpen: (iso: string) => void;
    /** Moves the shown month by this many months (arrow keys past the first or last day). */
    onShiftMonth: (by: number) => void;
}> = ({ year, month0, weekStart, items, workingDays, today, selected, focusISO, compact, onFocusISO, onOpen, onShiftMonth }) => {
    const weeks = useMemo(() => monthMatrix(year, month0, weekStart), [year, month0, weekStart]);
    const layouts = useMemo(
        () => weeks.map(w => layoutWeek(items, w.map(d => d.iso), LANES)),
        [weeks, items],
    );
    const gridRef = useRef<HTMLDivElement>(null);
    const wantFocus = useRef(false);

    const monthStartISO = weeks[0].find(d => d.inMonth)!.iso;
    const monthEndISO = [...weeks[weeks.length - 1]].reverse().find(d => d.inMonth)!.iso;
    // The focus stop must be a day of the shown month.
    const stop = focusISO >= monthStartISO && focusISO <= monthEndISO ? focusISO : (today >= monthStartISO && today <= monthEndISO ? today : monthStartISO);

    useEffect(() => {
        if (!wantFocus.current) return;
        wantFocus.current = false;
        gridRef.current?.querySelector<HTMLElement>(`[data-iso="${stop}"]`)?.focus();
    }, [stop, year, month0]);

    const move = (to: string) => {
        wantFocus.current = true;
        onFocusISO(to);
        if (to < monthStartISO) onShiftMonth(-1);
        else if (to > monthEndISO) onShiftMonth(1);
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        const key = e.key;
        let to: string | null = null;
        if (key === 'ArrowLeft') to = addDaysISO(stop, -1);
        else if (key === 'ArrowRight') to = addDaysISO(stop, 1);
        else if (key === 'ArrowUp') to = addDaysISO(stop, -7);
        else if (key === 'ArrowDown') to = addDaysISO(stop, 7);
        else if (key === 'Home') to = addDaysISO(stop, -((weekdayOf(stop) - weekStart + 7) % 7));
        else if (key === 'End') to = addDaysISO(stop, 6 - ((weekdayOf(stop) - weekStart + 7) % 7));
        else if (key === 'PageUp' || key === 'PageDown') {
            e.preventDefault();
            const by = key === 'PageUp' ? -1 : 1;
            const day = Number(stop.slice(8));
            const target = new Date(Date.UTC(year, month0 + by, 1));
            const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
            wantFocus.current = true;
            onFocusISO(`${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`);
            onShiftMonth(by);
            return;
        }
        if (to) {
            e.preventDefault();
            move(to);
        }
    };

    const order = weekdayOrder(weekStart);

    return (
        <div ref={gridRef} role="grid" aria-label={`${MONTH_NAMES[month0]} ${year}`} aria-readonly onKeyDown={onKeyDown} className="flex flex-col gap-px overflow-hidden rounded-rp-inset border border-rp-line bg-rp-line">
            <div role="row" className="grid grid-cols-7 gap-px">
                {order.map(d => (
                    <div key={d} role="columnheader" aria-label={WEEKDAY_LONG[d]} className="bg-rp-inset py-2 text-center text-xs font-medium text-rp-muted">
                        {compact ? WEEKDAY_SHORT[d][0] : WEEKDAY_SHORT[d]}
                    </div>
                ))}
            </div>
            {weeks.map((week, w) => (
                <div key={week[0].iso} role="row" className="grid grid-cols-7 gap-px">
                    {week.map((day, c) => {
                        const iso = day.iso;
                        const cell = layouts[w][c];
                        const here = itemsOn(items, iso);
                        const weekend = isWeekend(iso, workingDays);
                        const isToday = iso === today;
                        const dateWords = `${WEEKDAY_LONG[weekdayOf(iso)]} ${Number(iso.slice(8))} ${MONTH_NAMES[Number(iso.slice(5, 7)) - 1]}`;
                        const label = here.length === 0
                            ? `${dateWords}, nothing`
                            : `${dateWords}, ${here.length} ${here.length === 1 ? 'item' : 'items'}: ${here.slice(0, 4).map(itemWords).join('; ')}${here.length > 4 ? `; and ${here.length - 4} more` : ''}`;
                        return (
                            <div key={iso} role="gridcell" aria-selected={selected === iso} className={cn('relative min-w-0', weekend ? 'bg-rp-inset' : 'bg-rp-surface')}>
                                <button
                                    type="button"
                                    data-iso={iso}
                                    tabIndex={iso === stop ? 0 : -1}
                                    aria-label={label}
                                    aria-current={isToday ? 'date' : undefined}
                                    onFocus={() => onFocusISO(iso)}
                                    onClick={() => onOpen(iso)}
                                    className={cn(
                                        'flex w-full flex-col items-stretch text-left outline-none transition-colors hover:bg-rp-inset/70 focus-visible:z-raised focus-visible:ring-2 focus-visible:ring-rp-ink focus-visible:ring-inset',
                                        compact ? 'min-h-14 items-center gap-1 px-0.5 pt-1.5 pb-1.5' : 'min-h-[7.25rem] gap-1 pb-1.5',
                                        selected === iso && 'bg-rp-inset',
                                    )}
                                >
                                    <span className={cn(compact ? 'flex justify-center' : 'flex px-1.5 pt-1.5')}>
                                        <span
                                            className={cn(
                                                'rp-tabular inline-flex size-7 items-center justify-center rounded-full text-sm',
                                                isToday ? 'bg-rp-ink font-semibold text-rp-on-ink' : weekend || !day.inMonth ? 'text-rp-muted' : 'text-rp-ink',
                                                !day.inMonth && !isToday && 'opacity-60',
                                            )}
                                        >
                                            {Number(iso.slice(8))}
                                        </span>
                                    </span>
                                    {compact ? (
                                        <span className="flex h-3 items-center justify-center gap-0.5" aria-hidden>
                                            {here.slice(0, 3).map(i => <span key={i.key} className={cn('size-2', dotClass(i))} />)}
                                            {here.length > 3 ? <span className="rp-tabular text-2xs leading-none text-rp-muted">+{here.length - 3}</span> : null}
                                        </span>
                                    ) : (
                                        <span className="flex flex-col gap-0.5" aria-hidden>
                                            {cell.slots.map((slot, lane) => {
                                                if (!slot) return <span key={lane} className="h-6" />;
                                                const Icon = itemIcon(slot.item);
                                                const showLabel = slot.first || c === 0;
                                                return (
                                                    <span
                                                        key={lane}
                                                        className={cn(
                                                            'flex h-6 items-center gap-1 overflow-hidden text-xs leading-none font-medium',
                                                            chipClass(slot.item),
                                                            // A bar bridges the hairline between the days it covers.
                                                            slot.first ? 'ml-1 rounded-l-full pl-1.5' : '-ml-px',
                                                            slot.last ? 'mr-1 rounded-r-full pr-1.5' : '-mr-px',
                                                        )}
                                                    >
                                                        {showLabel ? <Icon size={12} className="shrink-0" aria-hidden /> : null}
                                                        {showLabel ? <span className="truncate">{slot.item.title}</span> : null}
                                                    </span>
                                                );
                                            })}
                                            {cell.more > 0 ? <span className="rp-tabular px-2 text-xs leading-none text-rp-muted">+{cell.more} more</span> : null}
                                        </span>
                                    )}
                                </button>
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
};
