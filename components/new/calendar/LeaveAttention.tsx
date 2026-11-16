import React from 'react';
import type { Trip } from '../../../types';
import { issueNote, type TripLeaveIssue } from '../../../utils/tripLeave';
import { formatDateRange } from '../../../utils/formatters';
import { ArrowUpRight, Warning } from '../../ui/hugeicons';
import { cn } from '../../../utils/cn';

/**
 * Trips whose leave needs a look (leave Phase 1d): working days with no leave, leave on other dates, refused or
 * still-requested leave, leave still counting for a cancelled trip. Each row opens the trip. Shown only when there is
 * something to say.
 */
export const LeaveAttention: React.FC<{
    items: { trip: Trip; issues: TripLeaveIssue[] }[];
    onOpenTrip: (id: string) => void;
}> = ({ items, onOpenTrip }) => {
    if (items.length === 0) return null;
    return (
        <section aria-label="Leave to look at" className="flex flex-col gap-2 rounded-rp-card bg-rp-surface p-4 rp-shadow-rest sm:p-5">
            <h2 className="flex items-center gap-2 text-base font-medium text-rp-ink"><Warning size={18} className="text-rp-rust" aria-hidden /> Leave to look at</h2>
            <ul className="flex flex-col gap-1">
                {items.slice(0, 5).map(({ trip, issues }) => {
                    const note = issueNote(issues[0]);
                    return (
                        <li key={trip.id}>
                            <button type="button" onClick={() => onOpenTrip(trip.id)} className="flex min-h-14 w-full items-center gap-3 rounded-rp-inset px-2 py-1.5 text-left outline-none hover:bg-rp-inset focus-visible:ring-2 focus-visible:ring-rp-muted">
                                <span className={cn('size-2.5 shrink-0 rounded-full', note.tone === 'rust' ? 'bg-rp-rust' : 'bg-rp-mustard')} aria-hidden />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-rp-ink">{trip.name}</span>
                                    <span className="block truncate text-xs text-rp-muted">{formatDateRange(trip.startDate, trip.endDate || trip.startDate)} · {note.text}{issues.length > 1 ? ` (+${issues.length - 1})` : ''}</span>
                                </span>
                                <ArrowUpRight size={16} className="shrink-0 text-rp-muted" aria-hidden />
                            </button>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
};
