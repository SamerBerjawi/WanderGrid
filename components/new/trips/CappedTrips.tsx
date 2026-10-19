import React, { useMemo, useState } from 'react';
import type { Trip } from '../../../types';
import type { TripBucket } from '../../../utils/tripsModel';
import { CaretDown } from '../../ui/hugeicons';
import { cn } from '../../../utils/cn';

/**
 * Keeps a long status from growing the page without limit. A status shows its first few trips, with a
 * fade and "Show all N". Expanded, Past is grouped by year: the newest years are open until a screenful is
 * covered and older years are collapsed rows. A search or year filter lifts the cap, so a match is never hidden.
 */

/** How many trips each status shows before "Show all". */
export const CAP: Record<TripBucket, number> = { planned: 8, confirmed: 8, past: 5 };

const yearOf = (trip: Trip) => (trip.endDate || trip.startDate || '').slice(0, 4) || 'Undated';

const BUTTON = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium text-rp-ink outline-none transition-colors duration-150 hover:bg-rp-inset focus-visible:ring-2 focus-visible:ring-rp-muted';

export const CappedTrips: React.FC<{
    bucket: TripBucket;
    trips: Trip[];
    expanded: boolean;
    onExpandedChange: (expanded: boolean) => void;
    /** A search or year filter is on: show every match. */
    filtering: boolean;
    /** `stack`: items one under another. `grid`: items wrapping onto as many lines as they need. */
    layout: 'stack' | 'grid';
    renderItem: (trip: Trip, index: number) => React.ReactNode;
    /** Space between stacked items (a Tailwind gap class). */
    gap?: string;
}> = ({ bucket, trips, expanded, onExpandedChange, filtering, layout, renderItem, gap = 'gap-3' }) => {
    const cap = CAP[bucket];
    const overCap = trips.length > cap;
    const capped = overCap && !expanded && !filtering;
    const visible = capped ? trips.slice(0, cap) : trips;
    const hidden = trips.length - cap;

    const years = useMemo(() => {
        if (bucket !== 'past') return null;
        const groups = new Map<string, Trip[]>();
        trips.forEach(t => { const y = yearOf(t); groups.set(y, [...(groups.get(y) || []), t]); });
        return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([year, list]) => ({ year, list }));
    }, [bucket, trips]);

    const [closed, setClosed] = useState<Record<string, boolean>>({});
    // Open the newest years until the first screenful (the cap) is covered; the rest start collapsed.
    const openByDefault = useMemo(() => {
        let total = 0;
        let count = 0;
        for (const g of years || []) { count += 1; total += g.list.length; if (total >= cap) break; }
        return count;
    }, [years, cap]);
    const isOpen = (year: string, index: number) => (year in closed ? !closed[year] : index < openByDefault);
    const toggleYear = (year: string, index: number) => setClosed(c => ({ ...c, [year]: isOpen(year, index) }));

    const itemsLayout = (list: Trip[], offset = 0) => (
        <div className={layout === 'stack' ? cn('flex flex-col', gap) : 'grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-3'}>
            {list.map((t, i) => <React.Fragment key={t.id}>{renderItem(t, offset + i)}</React.Fragment>)}
        </div>
    );

    // Capped: the first few, then a fade and "Show all".
    if (capped) {
        return (
            <div className="flex flex-col gap-1">
                <div className="[mask-image:linear-gradient(to_bottom,black_72%,transparent)]">{itemsLayout(visible)}</div>
                <button type="button" onClick={() => onExpandedChange(true)} className={cn(BUTTON, 'self-center')}>
                    Show all {trips.length} <CaretDown size={16} aria-hidden />
                </button>
            </div>
        );
    }

    // Expanded Past: grouped by year, the newest open.
    if (years && overCap && !filtering) {
        return (
            <div className="flex flex-col gap-3">
                {years.map(({ year, list }, gi) => {
                    const open = isOpen(year, gi);
                    return (
                        <section key={year} aria-label={year} className="flex flex-col gap-3">
                            <button
                                type="button"
                                aria-expanded={open}
                                onClick={() => toggleYear(year, gi)}
                                className="flex min-h-11 w-full items-center justify-between gap-2 rounded-rp-inset px-3 text-left text-sm font-medium text-rp-ink outline-none hover:bg-rp-inset focus-visible:ring-2 focus-visible:ring-rp-muted"
                            >
                                <span className="rp-tabular">{year} <span className="font-normal text-rp-muted">· {list.length} {list.length === 1 ? 'trip' : 'trips'}</span></span>
                                <CaretDown size={16} className={cn('text-rp-muted transition-transform duration-150', open && 'rotate-180')} aria-hidden />
                            </button>
                            {open ? itemsLayout(list) : null}
                        </section>
                    );
                })}
                <button type="button" onClick={() => onExpandedChange(false)} className={cn(BUTTON, 'self-center')}>Show fewer</button>
            </div>
        );
    }

    // Expanded (or short, or filtered): everything.
    return (
        <div className="flex flex-col gap-3">
            {itemsLayout(visible)}
            {overCap && !filtering ? <button type="button" onClick={() => onExpandedChange(false)} className={cn(BUTTON, 'self-center')}>Show fewer</button> : null}
        </div>
    );
};
