import React, { useEffect, useMemo, useState } from 'react';
import { breakSentence, type BreakSuggestion, type PlannedBreak, type YearPlan } from '../../../utils/leaveOptimizer';
import { formatDate, formatDateRange } from '../../../utils/formatters';
import ParticleButton from '../../kokonutui/particle-button';
import { Flag, Minus, Plus, Sparkle, SunHorizon } from '../../ui/hugeicons';
import { RpChip, RpEmpty, RpIconButton, RpSection, RpSheet } from '../ui';
import { cn } from '../../../utils/cn';

/**
 * Leave optimizer (leave Phase 2a). **Year plan**: the best breaks for a leave budget over the coming months, ranked by
 * days off per leave day, with preferred months and a break length; each says "Take 4 days off to enjoy 9 days in a
 * row", and the whole plan can be added to the calendar as ideas (drafts that count for nothing until confirmed).
 * **Around holidays**: for each public holiday, the best-value and the longest break next to it.
 */

type Window = 3 | 6 | 12;
const WINDOWS: { id: Window; label: string }[] = [{ id: 3, label: '3 months' }, { id: 6, label: '6 months' }, { id: 12, label: '12 months' }];

export type BreakLength = 'short' | 'week' | 'long' | 'any';
export const BREAK_LENGTHS: Record<BreakLength, { label: string; min: number; max: number }> = {
    short: { label: 'Long weekends', min: 3, max: 5 },
    week: { label: 'About a week', min: 6, max: 10 },
    long: { label: 'Longer', min: 11, max: 16 },
    any: { label: 'Any length', min: 4, max: 16 },
};

export interface PlanPrefs {
    budget: number;
    months: number[];
    length: BreakLength;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PILL = 'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-rp-muted focus-visible:ring-offset-2 focus-visible:ring-offset-rp-surface active:scale-[0.97]';
const KIND_LABEL: Record<BreakSuggestion['kind'], string> = { free: 'No leave needed', value: 'Best value', longest: 'Longest break' };
const times = (n: number) => `${n.toFixed(1).replace(/\.0$/, '')}×`;

export const OptimizerSheet: React.FC<{
    open: boolean;
    onClose: () => void;
    suggestions: BreakSuggestion[];
    plan: YearPlan | null;
    prefs: PlanPrefs;
    onPrefs: (p: PlanPrefs) => void;
    today: string;
    /** Whose balance this is, and how many days they have left this year (null when unknown). */
    memberName?: string;
    daysLeft: number | null;
    window: Window;
    onWindow: (w: Window) => void;
    hasHolidays: boolean;
    canPlan: boolean;
    onPlan: (s: { leaveDates: string[]; start?: string; end?: string }) => void;
    /** Adds every planned break to the calendar as ideas. */
    onPlanAll?: (breaks: PlannedBreak[]) => Promise<void>;
    onOpenHolidays: () => void;
}> = ({ open, onClose, suggestions, plan, prefs, onPrefs, today, memberName, daysLeft, window: months, onWindow, hasHolidays, canPlan, onPlan, onPlanAll, onOpenHolidays }) => {
    const [tab, setTab] = useState<'plan' | 'holidays'>('plan');
    const [all, setAll] = useState(false);
    const shown = useMemo(() => (all ? suggestions : suggestions.slice(0, 6)), [all, suggestions]);
    useEffect(() => { if (open) setAll(false); }, [open]);
    const set = (patch: Partial<PlanPrefs>) => onPrefs({ ...prefs, ...patch });
    const toggleMonth = (m: number) => set({ months: prefs.months.includes(m) ? prefs.months.filter(x => x !== m) : [...prefs.months, m].sort((a, b) => a - b) });

    return (
        <RpSheet open={open} onClose={onClose} title="Leave optimizer" subtitle={memberName ? `Breaks for ${memberName.split(' ')[0]}` : undefined} width={480}>
            <div className="flex flex-col gap-4">
                <div role="tablist" aria-label="Optimizer view" className="flex gap-2">
                    <RpChip selected={tab === 'plan'} onClick={() => setTab('plan')}><Sparkle size={16} aria-hidden /> Year plan</RpChip>
                    <RpChip selected={tab === 'holidays'} onClick={() => setTab('holidays')}><Flag size={16} aria-hidden /> Around holidays</RpChip>
                </div>
                <div className="-m-3 flex gap-2 overflow-x-auto p-3 [scrollbar-width:none]" role="group" aria-label="Look ahead">
                    {WINDOWS.map(w => <RpChip key={w.id} selected={w.id === months} onClick={() => onWindow(w.id)}>{w.label}</RpChip>)}
                </div>

                {!hasHolidays ? (
                    <RpEmpty
                        title="No public holidays yet"
                        action={<button type="button" onClick={onOpenHolidays} className={cn(PILL, 'bg-rp-ink text-rp-on-ink')}><Flag size={16} aria-hidden /> Add a country calendar</button>}
                    >
                        The optimizer finds breaks around public holidays. Add a holiday calendar first{tab === 'plan' ? ', or plan around weekends only' : ''}.
                    </RpEmpty>
                ) : null}

                {tab === 'plan' ? (
                    <>
                        <RpSection title="What to plan" icon={SunHorizon}>
                            <div className="flex min-h-11 items-center justify-between gap-3">
                                <span className="flex flex-col">
                                    <span className="text-sm font-medium text-rp-ink">Leave days to spend</span>
                                    <span className="text-xs text-rp-muted">{daysLeft !== null ? `${daysLeft} left this year` : 'Set an allowance to see what is left'}</span>
                                </span>
                                <span className="flex items-center gap-1">
                                    <RpIconButton label="One day fewer" tone="ghost" onClick={() => set({ budget: Math.max(0, prefs.budget - 1) })}><Minus size={16} aria-hidden /></RpIconButton>
                                    <span className="rp-tabular w-8 text-center text-base font-semibold text-rp-ink" aria-live="polite">{prefs.budget}</span>
                                    <RpIconButton label="One day more" tone="ghost" onClick={() => set({ budget: Math.min(60, prefs.budget + 1) })}><Plus size={16} aria-hidden /></RpIconButton>
                                </span>
                            </div>
                            <div className="flex flex-col gap-1.5 py-1.5">
                                <span id="opt-length" className="text-xs text-rp-muted">Breaks</span>
                                <div role="group" aria-labelledby="opt-length" className="flex flex-wrap gap-2">
                                    {(Object.keys(BREAK_LENGTHS) as BreakLength[]).map(k => <RpChip key={k} selected={prefs.length === k} onClick={() => set({ length: k })}>{BREAK_LENGTHS[k].label}</RpChip>)}
                                </div>
                            </div>
                            <div className="flex flex-col gap-1.5 py-1.5">
                                <span id="opt-months" className="text-xs text-rp-muted">Favourite months (optional)</span>
                                <div role="group" aria-labelledby="opt-months" className="grid grid-cols-6 gap-1.5">
                                    {MONTHS.map((m, i) => <RpChip key={m} selected={prefs.months.includes(i + 1)} onClick={() => toggleMonth(i + 1)} className="justify-center px-0">{m}</RpChip>)}
                                </div>
                            </div>
                        </RpSection>

                        {plan && plan.breaks.length > 0 ? (
                            <>
                                <div className="flex flex-col gap-1 rounded-rp-inset bg-rp-green/15 px-4 py-3">
                                    <p className="text-sm text-rp-ink">
                                        <span className="rp-tabular text-2xl font-semibold text-rp-green">{plan.daysOff}</span> days off for <span className="rp-tabular font-semibold">{plan.leaveUsed}</span> leave {plan.leaveUsed === 1 ? 'day' : 'days'}
                                    </p>
                                    <p className="text-xs text-rp-muted">{plan.breaks.length} {plan.breaks.length === 1 ? 'break' : 'breaks'} · {times(plan.efficiency)} the days off you pay for</p>
                                </div>
                                <ul className="flex flex-col gap-3" aria-label="Planned breaks">
                                    {plan.breaks.map(b => (
                                        <li key={b.id} className="flex flex-col gap-2 rounded-rp-inset bg-rp-inset px-4 py-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <h3 className="rp-tabular text-base font-medium text-rp-ink">{formatDateRange(b.start, b.end)}</h3>
                                                    <p className="text-sm text-rp-ink">{breakSentence(b)}.</p>
                                                </div>
                                                <span className="rp-tabular shrink-0 rounded-full bg-rp-ink px-3 py-1 text-xs font-medium text-rp-on-ink">{times(b.efficiency)}</span>
                                            </div>
                                            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-rp-muted">
                                                <span>Leave: {b.leaveDates.length <= 3 ? b.leaveDates.map(d => formatDate(d, 'weekday-short')).join(', ') : formatDateRange(b.leaveDates[0], b.leaveDates[b.leaveDates.length - 1])}</span>
                                                {b.holidays.length ? <span className="inline-flex items-center gap-1"><Flag size={12} className="text-rp-ochre" aria-hidden /> {b.holidays.join(', ')}</span> : null}
                                                {b.preferred ? <span className="text-rp-green">In a favourite month</span> : null}
                                            </p>
                                            {canPlan ? (
                                                <div>
                                                    <button type="button" onClick={() => onPlan({ leaveDates: b.leaveDates, start: b.start, end: b.end })} className={cn(PILL, 'bg-rp-surface text-rp-ink hover:bg-rp-line')}>Plan this leave</button>
                                                </div>
                                            ) : null}
                                        </li>
                                    ))}
                                </ul>
                                {canPlan && onPlanAll ? (
                                    <div className="flex flex-col gap-1">
                                        <ParticleButton onClick={() => onPlanAll(plan.breaks)} pendingLabel="Adding" successLabel="Added" errorLabel="Try again">
                                            <Sparkle size={16} aria-hidden /> Add all to the calendar as ideas
                                        </ParticleButton>
                                        <p className="px-1 text-xs text-rp-muted">Ideas show on the calendar but use no leave until you plan or confirm them.</p>
                                    </div>
                                ) : null}
                            </>
                        ) : (
                            <RpEmpty title={prefs.budget <= 0 ? 'No leave to spend' : 'No break fits'}>
                                {prefs.budget <= 0 ? 'Add leave days to spend above.' : 'Try another break length, more days, or a longer look ahead.'}
                            </RpEmpty>
                        )}

                        {plan && plan.free.length > 0 ? (
                            <RpSection title="Long weekends with no leave needed" icon={Flag}>
                                <ul className="flex flex-col">
                                    {plan.free.slice(0, 8).map(f => (
                                        <li key={f.id} className="flex min-h-11 items-center justify-between gap-3 text-sm">
                                            <span className="rp-tabular text-rp-ink">{formatDateRange(f.start, f.end)}</span>
                                            <span className="truncate text-xs text-rp-muted">{f.daysOff} days · {f.holidays.join(', ')}</span>
                                        </li>
                                    ))}
                                </ul>
                            </RpSection>
                        ) : null}
                    </>
                ) : hasHolidays && suggestions.length === 0 ? (
                    <RpEmpty title="Nothing to improve">No holiday in the next {months} months sits where a few days of leave would make a longer break.</RpEmpty>
                ) : hasHolidays ? (
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
                                    <p className="text-sm text-rp-ink">{breakSentence(s)}.</p>
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
                ) : null}

                {tab === 'holidays' && suggestions.length > 6 ? (
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
