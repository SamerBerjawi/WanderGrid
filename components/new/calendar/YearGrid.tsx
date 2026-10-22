import React, { useMemo } from 'react';
import {
    isWeekend, itemsOn, monthMatrix, weekdayOrder, MONTH_NAMES, WEEKDAY_SHORT, WEEKDAY_LONG, weekdayOf,
    type CalendarItem, type WeekStart,
} from '../../../utils/calendarModel';
import { STATE_CHIP } from './calendarStyles';
import { cn } from '../../../utils/cn';

/**
 * The year at a glance: twelve small months. A day is filled by what it holds, with the same colours as
 * the month (mustard planned, green confirmed, ink travelling, a quiet fill for past); a public holiday is
 * ringed in ochre and an event is underlined, so no day relies on colour alone. A month's name opens it.
 */

export const YearGrid: React.FC<{
    year: number;
    weekStart: WeekStart;
    items: CalendarItem[];
    workingDays: number[];
    today: string;
    onOpenDay: (iso: string) => void;
    onOpenMonth: (month0: number) => void;
}> = ({ year, weekStart, items, workingDays, today, onOpenDay, onOpenMonth }) => {
    const order = weekdayOrder(weekStart);
    const months = useMemo(() => Array.from({ length: 12 }, (_, m) => monthMatrix(year, m, weekStart)), [year, weekStart]);
    return (
        <div className="grid gap-x-6 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
            {months.map((weeks, m) => (
                <section key={m} aria-label={`${MONTH_NAMES[m]} ${year}`} className="mx-auto w-full max-w-[19.25rem]">
                    <h3 className="mb-1">
                        <button
                            type="button"
                            onClick={() => onOpenMonth(m)}
                            aria-label={`Open ${MONTH_NAMES[m]} ${year}`}
                            className="inline-flex min-h-11 items-center rounded-full px-3 text-base font-medium text-rp-ink outline-none hover:bg-rp-inset focus-visible:ring-2 focus-visible:ring-rp-muted"
                        >
                            {MONTH_NAMES[m]}
                        </button>
                    </h3>
                    <div role="grid" aria-label={`${MONTH_NAMES[m]} ${year}`} aria-readonly>
                        <div role="row" className="grid grid-cols-7">
                            {order.map(d => (
                                <div key={d} role="columnheader" aria-label={WEEKDAY_LONG[d]} className="py-1 text-center text-xs text-rp-muted">{WEEKDAY_SHORT[d][0]}</div>
                            ))}
                        </div>
                        {weeks.map(week => (
                            <div key={week[0].iso} role="row" className="grid grid-cols-7">
                                {week.map(day => {
                                    if (!day.inMonth) return <div key={day.iso} role="gridcell" className="size-11" />;
                                    const here = itemsOn(items, day.iso);
                                    const trip = here.find(i => i.kind === 'trip');
                                    const holiday = here.find(i => i.kind === 'holiday' && !i.muted);
                                    const event = here.find(i => i.kind === 'event');
                                    const weekend = isWeekend(day.iso, workingDays);
                                    const isToday = day.iso === today;
                                    const words = `${WEEKDAY_LONG[weekdayOf(day.iso)]} ${Number(day.iso.slice(8))} ${MONTH_NAMES[m]}${here.length ? `: ${here.map(i => i.title).slice(0, 3).join(', ')}` : ''}`;
                                    return (
                                        <div key={day.iso} role="gridcell" className="flex items-center justify-center">
                                            <button
                                                type="button"
                                                aria-label={words}
                                                aria-current={isToday ? 'date' : undefined}
                                                onClick={() => onOpenDay(day.iso)}
                                                className={cn(
                                                    'rp-tabular relative flex size-11 items-center justify-center rounded-full text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-rp-ink',
                                                    trip ? STATE_CHIP[trip.state] : weekend ? 'text-rp-muted hover:bg-rp-inset' : 'text-rp-ink hover:bg-rp-inset',
                                                    holiday && 'ring-2 ring-inset ring-rp-ochre',
                                                    isToday && !trip && 'bg-rp-ink font-semibold text-rp-on-ink hover:bg-rp-ink',
                                                    isToday && trip && 'underline decoration-2 underline-offset-4',
                                                )}
                                            >
                                                {Number(day.iso.slice(8))}
                                                {event ? <span className="absolute bottom-1.5 h-0.5 w-3 rounded-full bg-rp-navy" aria-hidden /> : null}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
};
