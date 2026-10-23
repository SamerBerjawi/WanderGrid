import React, { useMemo, useState } from 'react';
import type { BreakSuggestion } from '../../../utils/leaveOptimizer';
import { formatDate, formatDateRange } from '../../../utils/formatters';
import { Flag, SunHorizon } from '../../ui/hugeicons';
import { RpChip, RpEmpty, RpSheet } from '../ui';
import { cn } from '../../../utils/cn';

/**
 * Leave optimizer: breaks where a few days of leave join public holidays and weekends into a longer rest.
 * Each card says which days to take, how many days off that makes, and whether the member's balance covers
 * it; "Plan this leave" opens the leave sheet with those days filled in.
 */

type Window = 3 | 6 | 12;
const WINDOWS: { id: Window; label: string }[] = [{ id: 3, label: '3 months' }, { id: 6, label: '6 months' }, { id: 12, label: '12 months' }];

const PILL = 'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-rp-muted focus-visible:ring-offset-2 focus-visible:ring-offset-rp-surface active:scale-[0.97]';

const KIND_LABEL: Record<BreakSuggestion['kind'], string> = { free: 'No leave needed', value: 'Best value', longest: 'Longest break' };

export const OptimizerSheet: React.FC<{
    open: boolean;
    onClose: () => void;
    suggestions: BreakSuggestion[];
    today: string;
    /** Whose balance this is, and how many days they have left this year (null when unknown). */
    memberName?: string;
    daysLeft: number | null;
    window: Window;
    onWindow: (w: Window) => void;
    hasHolidays: boolean;
    canPlan: boolean;
    onPlan: (s: BreakSuggestion) => void;
    onOpenHolidays: () => void;
}> = ({ open, onClose, suggestions, today, memberName, daysLeft, window: months, onWindow, hasHolidays, canPlan, onPlan, onOpenHolidays }) => {
    const [all, setAll] = useState(false);
    const shown = useMemo(() => (all ? suggestions : suggestions.slice(0, 6)), [all, suggestions]);

    return (
        <RpSheet open={open} onClose={onClose} title="Leave optimizer" subtitle={memberName ? `Breaks for ${memberName.split(' ')[0]}` : undefined} width={460}>
            <div className="flex flex-col gap-4">
                <p className="px-1 text-sm text-rp-muted">Where a few days of leave join public holidays and weekends into a longer break.</p>
                <div className="-m-3 flex gap-2 overflow-x-auto p-3 [scrollbar-width:none]" role="group" aria-label="Look ahead">
                    {WINDOWS.map(w => <RpChip key={w.id} selected={w.id === months} onClick={() => onWindow(w.id)}>{w.label}</RpChip>)}
                </div>

                {!hasHolidays ? (
                    <RpEmpty
                        title="No public holidays yet"
                        action={<button type="button" onClick={onOpenHolidays} className={cn(PILL, 'bg-rp-ink text-rp-on-ink')}><Flag size={16} aria-hidden /> Add a country calendar</button>}
                    >
                        The optimizer needs a holiday calendar to find the breaks.
                    </RpEmpty>
                ) : suggestions.length === 0 ? (
                    <RpEmpty title="Nothing to improve">No holiday in the next {months} months sits where a few days of leave would make a longer break.</RpEmpty>
                ) : (
                    <ul className="flex flex-col gap-3" aria-label="Suggested breaks">
                        {shown.map(s => {
                            const cost = s.leaveDates.length;
                            const fits = daysLeft === null ? null : cost <= daysLeft;
                            return (
                                <li key={s.id} className="flex flex-col gap-2 rounded-rp-inset bg-rp-inset px-4 py-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-xs text-rp-muted">{KIND_LABEL[s.kind]}</p>
                                            <h3 className="rp-tabular text-base font-medium text-rp-ink">{formatDateRange(s.start, s.end)}</h3>
                                        </div>
                                        <span className="rp-tabular shrink-0 rounded-full bg-rp-ink px-3 py-1 text-xs font-medium text-rp-on-ink">{s.daysOff} days off</span>
                                    </div>
                                    <p className="text-sm text-rp-ink">
                                        {cost === 0
                                            ? 'A long weekend with no leave taken.'
                                            : `Take ${cost === 1 ? formatDate(s.leaveDates[0], 'weekday-long') : `${formatDateRange(s.leaveDates[0], s.leaveDates[cost - 1])}`} off (${cost} leave ${cost === 1 ? 'day' : 'days'}).`}
                                    </p>
                                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-rp-muted">
                                        <span className="inline-flex items-center gap-1"><Flag size={12} className="text-rp-ochre" aria-hidden /> {s.holidays.join(', ')}</span>
                                        {cost > 0 ? <span className="rp-tabular">{(s.daysOff / cost).toFixed(1)} days off per leave day</span> : null}
                                        {fits === true && cost > 0 ? <span className="inline-flex items-center gap-1 text-rp-green"><SunHorizon size={12} aria-hidden /> Fits your {daysLeft} days left</span> : null}
                                        {fits === false ? <span className="text-rp-rust">Needs {cost - (daysLeft ?? 0)} more than you have</span> : null}
                                    </p>
                                    {s.start < today ? <p className="text-xs text-rp-muted">Already under way.</p> : null}
                                    {cost > 0 && canPlan && s.end >= today ? (
                                        <div>
                                            <button type="button" onClick={() => onPlan(s)} className={cn(PILL, 'bg-rp-surface text-rp-ink hover:bg-rp-line')}>Plan this leave</button>
                                        </div>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                )}

                {suggestions.length > 6 ? (
                    <div className="flex justify-center">
                        <button type="button" onClick={() => setAll(v => !v)} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-rp-muted outline-none hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted">
                            {all ? 'Show fewer' : `Show all ${suggestions.length}`}
                        </button>
                    </div>
                ) : null}
            </div>
        </RpSheet>
    );
};
