import React from 'react';
import { WEEKDAY_SHORT, weekdayOf, MONTH_NAMES, type CalendarItem } from '../../../utils/calendarModel';
import { formatDateRange } from '../../../utils/formatters';
import { RpEmpty } from '../ui';
import { chipClass, itemIcon, STATE_LABEL, tripChip } from './calendarStyles';
import { cn } from '../../../utils/cn';

/**
 * A list of what is on, soonest first: the agenda under the phone's month grid and the Schedule tab.
 * Each row is a button that opens its first day. Items that span days show their dates.
 */

const SHOWN = 12;

export const AgendaList: React.FC<{
    items: CalendarItem[];
    /** Heading groups by month ("October 2026") when true. */
    grouped?: boolean;
    empty: string;
    /** Rows that begin before this day show it as their day (a month's agenda starts on the 1st). */
    from?: string;
    onOpen: (item: CalendarItem, iso: string) => void;
    today: string;
    /** Shows only the first rows with "Show all". */
    cap?: boolean;
}> = ({ items, grouped, empty, from, onOpen, today, cap }) => {
    const [all, setAll] = React.useState(false);
    const rows = [...items].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.title.localeCompare(b.title));
    const shown = cap && !all ? rows.slice(0, SHOWN) : rows;
    if (rows.length === 0) return <RpEmpty title={empty} />;

    let lastGroup = '';
    return (
        <div>
            <ul className="flex flex-col">
                {shown.map(item => {
                    const day = from && item.start < from ? from : item.start;
                    const Icon = itemIcon(item);
                    const group = `${MONTH_NAMES[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;
                    const heading = grouped && group !== lastGroup ? group : null;
                    lastGroup = group;
                    const range = item.start === item.end ? '' : formatDateRange(item.start, item.end);
                    const meta = item.kind === 'holiday'
                        ? `${item.holiday?.countryName ?? 'Public holiday'}${item.muted ? ' · Not a day off' : ''}`
                        : item.kind === 'event'
                            ? (item.event?.isWorkingDay ? 'Working day' : 'Event')
                            : [range, item.leave ? 'Leave' : null].filter(Boolean).join(' · ');
                    return (
                        <li key={item.key}>
                            {heading ? <h3 className="px-2 pt-3 pb-1 text-xs font-medium text-rp-muted">{heading}</h3> : null}
                            <button
                                type="button"
                                onClick={() => onOpen(item, day)}
                                className="flex min-h-14 w-full items-center gap-3 rounded-rp-inset px-2 py-1.5 text-left outline-none transition-colors hover:bg-rp-inset focus-visible:ring-2 focus-visible:ring-rp-muted"
                            >
                                <span className={cn('flex size-11 shrink-0 flex-col items-center justify-center rounded-full leading-none', day === today ? 'bg-rp-ink text-rp-on-ink' : 'bg-rp-inset text-rp-ink')}>
                                    <span className="rp-tabular text-base font-semibold">{Number(day.slice(8))}</span>
                                    <span className="mt-0.5 text-2xs opacity-70">{WEEKDAY_SHORT[weekdayOf(day)]}</span>
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-rp-ink">{item.title}</span>
                                    {meta ? <span className="rp-tabular block truncate text-xs text-rp-muted">{meta}</span> : null}
                                </span>
                                {item.kind === 'trip' ? (
                                    <span className={cn('inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium', tripChip(item))}>
                                        <Icon size={12} aria-hidden /> {STATE_LABEL[item.state]}
                                    </span>
                                ) : (
                                    <span className={cn('inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium', chipClass(item))}>
                                        <Icon size={12} aria-hidden /> {item.kind === 'holiday' ? 'Holiday' : 'Event'}
                                    </span>
                                )}
                            </button>
                        </li>
                    );
                })}
            </ul>
            {cap && rows.length > SHOWN ? (
                <div className="flex justify-center pt-1">
                    <button type="button" onClick={() => setAll(v => !v)} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-rp-muted outline-none hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted">
                        {all ? 'Show fewer' : `Show all ${rows.length}`}
                    </button>
                </div>
            ) : null}
        </div>
    );
};
