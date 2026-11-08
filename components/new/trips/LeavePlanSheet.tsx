import React, { useEffect, useMemo, useState } from 'react';
import type { EntitlementType, Trip } from '../../../types';
import type { LeavePlanner } from '../../../hooks/useLeavePlanner';
import type { DayCell, DayKind, TypeOption } from '../../../utils/leavePlan';
import { WEEKDAY_SHORT, weekdayOf } from '../../../utils/calendarModel';
import { formatDate, formatDateRange } from '../../../utils/formatters';
import { errorMessage } from '../../../services/toast';
import ParticleButton from '../../kokonutui/particle-button';
import { ArrowUpRight, CalendarCheck, Check, Users } from '../../ui/hugeicons';
import { RpSection, RpSheet } from '../ui';
import { cn } from '../../../utils/cn';

/**
 * Plan leave for a trip: what it costs in leave days once weekends, public holidays and days you work anyway
 * are left out, which leave type to take it from (with what each would have left), and what it means for
 * everyone else on the trip. One button puts the leave on the trip; the figures come from the calendar's own
 * counting (utils/leavePlan.ts on utils/calendarModel.ts), so the calendar and this sheet always agree.
 */

const KIND: Record<DayKind, { cell: string; word: string }> = {
    leave: { cell: 'bg-rp-green text-rp-paper', word: 'leave day' },
    half: { cell: 'bg-rp-green/45 text-rp-ink', word: 'half a leave day' },
    weekend: { cell: 'bg-rp-inset text-rp-muted', word: 'weekend, no leave' },
    holiday: { cell: 'bg-rp-mustard text-rp-on-mustard', word: 'public holiday, no leave' },
    worked: { cell: 'border border-rp-line text-rp-muted', word: 'a day you work, no leave' },
};

const dayWord = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
const num = (n: number) => {
    const text = Number.isInteger(n) ? String(Math.abs(n)) : Math.abs(n).toFixed(1);
    return n < 0 ? `\u2212${text}` : text;
};

const DayStrip: React.FC<{ days: DayCell[] }> = ({ days }) => (
    <ul className="flex flex-wrap gap-1.5" aria-label="Days of the trip">
        {days.map(d => (
            <li
                key={d.iso}
                title={d.label || undefined}
                aria-label={`${WEEKDAY_SHORT[weekdayOf(d.iso)]} ${formatDate(d.iso, 'short')}${d.label ? `, ${d.label}` : ''}: ${KIND[d.kind].word}`}
                className={cn('flex size-11 flex-col items-center justify-center rounded-[10px] leading-none', KIND[d.kind].cell)}
            >
                <span className="text-2xs opacity-80" aria-hidden>{WEEKDAY_SHORT[weekdayOf(d.iso)].slice(0, 2)}</span>
                <span className="rp-tabular mt-0.5 text-sm font-semibold" aria-hidden>{Number(d.iso.slice(8, 10))}</span>
            </li>
        ))}
    </ul>
);

/** "Skips 2 weekend days, 1 public holiday (Good Friday) and 1 day you work." */
const skipSentence = (days: DayCell[], skipped: { weekend: number; holiday: number; worked: number }): string => {
    const parts: string[] = [];
    if (skipped.weekend) parts.push(`${skipped.weekend} weekend ${skipped.weekend === 1 ? 'day' : 'days'}`);
    if (skipped.holiday) {
        const names = [...new Set(days.filter(d => d.kind === 'holiday' && d.label).map(d => d.label as string))];
        parts.push(`${skipped.holiday} public ${skipped.holiday === 1 ? 'holiday' : 'holidays'}${names.length ? ` (${names.join(', ')})` : ''}`);
    }
    if (skipped.worked) parts.push(`${skipped.worked} ${skipped.worked === 1 ? 'day' : 'days'} you work`);
    if (parts.length === 0) return 'Every day of the trip is a working day.';
    return `Skips ${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]}.`;
};

const balanceText = (o: TypeOption): { text: string; tone: 'muted' | 'short' | 'ok' } => {
    if (o.unlimited) return { text: 'Unlimited', tone: 'ok' };
    if (!o.tracked) return { text: 'No balance set', tone: 'muted' };
    const [first] = o.years;
    if (o.years.length === 1 && first && first.remaining !== null && first.after !== null) {
        return { text: `${num(first.remaining)} left, ${num(first.after)} after`, tone: o.covers ? 'muted' : 'short' };
    }
    return { text: o.covers ? 'Enough in each year' : `${num(o.shortBy)} short`, tone: o.covers ? 'muted' : 'short' };
};

export const LeavePlanSheet: React.FC<{
    trip: Trip | null;
    planner: LeavePlanner;
    entitlements: EntitlementType[];
    onClose: () => void;
    /** Saves the leave on the trip (undefined takes it off). */
    onApply: (trip: Trip, entitlementId: string | undefined) => Promise<void>;
    onOpenCalendar?: () => void;
}> = ({ trip, planner, entitlements, onClose, onApply, onOpenCalendar }) => {
    const member = trip ? planner.memberFor(trip) : undefined;
    const plan = useMemo(() => (trip ? planner.planFor(trip, member) : null), [trip, planner, member]);
    const [choice, setChoice] = useState<string | undefined>();
    const [error, setError] = useState('');

    useEffect(() => { setChoice(plan?.current ?? plan?.suggested); setError(''); }, [trip?.id, plan?.current, plan?.suggested]);

    const members = trip ? planner.membersOf(trip) : [];
    const picked = plan?.options.find(o => o.entitlement.id === choice);
    const hasLeave = Boolean(plan && (plan.current || plan.split));
    const same = Boolean(plan && !plan.split && plan.current && plan.current === choice);
    const free = Boolean(plan && plan.cost <= 0);

    const run = async () => {
        if (!trip || !choice) throw new Error('Choose a leave type.');
        try {
            await onApply(trip, choice);
            onClose();
        } catch (e) {
            setError(errorMessage(e, "The leave didn't save. Try again."));
            throw e;
        }
    };
    const remove = async () => {
        if (!trip) return;
        try { await onApply(trip, undefined); onClose(); } catch (e) { setError(errorMessage(e, "The leave didn't come off. Try again.")); }
    };

    const years = plan?.years || [];

    return (
        <RpSheet
            open={Boolean(trip && plan)}
            onClose={onClose}
            title="Plan leave"
            subtitle={trip?.name}
            width={440}
            footer={
                <>
                    <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center rounded-full bg-rp-inset px-5 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted">Close</button>
                    <ParticleButton onClick={run} disabled={!choice || free || same} pendingLabel="Saving" successLabel="Saved" errorLabel="Couldn't save">
                        {free ? 'No leave needed' : same ? 'Leave booked' : plan && picked ? `Take ${dayWord(plan.cost)} of ${picked.entitlement.name}` : 'Take leave'}
                    </ParticleButton>
                </>
            }
        >
            {trip && plan ? (
                <div className="flex flex-col gap-4">
                    {error ? <p role="alert" className="text-sm text-rp-rust">{error}</p> : null}

                    <div className="flex flex-col gap-1">
                        <p className="flex items-baseline gap-2">
                            <span className="rp-tabular text-5xl font-semibold leading-none tracking-tight text-rp-green">{num(plan.cost)}</span>
                            <span className="text-base text-rp-ink">{plan.cost === 1 ? 'leave day' : 'leave days'}{members.length > 1 && member ? ` for ${member.name.split(' ')[0]}` : ''}</span>
                        </p>
                        <p className="rp-tabular text-sm text-rp-muted">{formatDateRange(trip.startDate, trip.endDate || trip.startDate)} · {dayWord(plan.days.length)}</p>
                    </div>

                    {plan.days.length > 0 && plan.days.length <= 42 ? <DayStrip days={plan.days} /> : null}
                    <p className="text-sm text-rp-muted">{plan.days.length === 0 ? 'The trip has no dates yet.' : skipSentence(plan.days, plan.skipped)}</p>
                    {years.length > 1 ? <p className="text-sm text-rp-muted">It spans {years.map(y => y.year).join(' and ')}: {years.map(y => `${dayWord(y.cost)} from ${y.year}`).join(', ')}.</p> : null}

                    {!free ? (
                        <RpSection title="Take it from" icon={CalendarCheck}>
                            <div role="radiogroup" aria-label="Leave type" className="flex flex-col gap-2 py-1">
                                {plan.options.map(o => {
                                    const selected = choice === o.entitlement.id;
                                    const b = balanceText(o);
                                    return (
                                        <button
                                            key={o.entitlement.id}
                                            type="button"
                                            role="radio"
                                            aria-checked={selected}
                                            onClick={() => setChoice(o.entitlement.id)}
                                            className={cn('flex min-h-14 items-center justify-between gap-3 rounded-rp-inset px-4 py-2 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-rp-muted', selected ? 'bg-rp-inset ring-2 ring-rp-ink' : 'bg-rp-inset/60 hover:bg-rp-inset')}
                                        >
                                            <span className="flex min-w-0 flex-col">
                                                <span className="truncate text-sm font-medium text-rp-ink">{o.entitlement.name}</span>
                                                <span className={cn('rp-tabular text-xs', b.tone === 'short' ? 'text-rp-rust' : b.tone === 'ok' ? 'text-rp-green' : 'text-rp-muted')}>{b.text}</span>
                                            </span>
                                            <span className="flex shrink-0 items-center gap-2">
                                                {o.entitlement.id === plan.suggested && !hasLeave ? <span className="rounded-full bg-rp-green/15 px-2 py-0.5 text-2xs font-medium text-rp-green">Suggested</span> : null}
                                                {selected ? <Check size={16} className="text-rp-ink" aria-hidden /> : null}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                            {plan.split ? <p className="px-1 pb-2 text-xs text-rp-muted">This trip's leave is split across types. Taking it from one type here replaces the split.</p> : null}
                            {picked && !picked.covers ? <p role="status" className="px-1 pb-2 text-xs text-rp-rust">That is {dayWord(picked.shortBy)} more than {picked.entitlement.name} has left{picked.years.length > 1 ? ' in one of the years' : ''}.</p> : null}
                        </RpSection>
                    ) : null}

                    {members.length > 1 && choice && !free ? (
                        <RpSection title="Everyone on the trip" icon={Users}>
                            <ul className="flex flex-col py-1">
                                {members.map(u => {
                                    const their = planner.planFor(trip, u);
                                    const opt = their?.options.find(o => o.entitlement.id === choice);
                                    const text = !their || !opt ? '' : opt.unlimited ? `${num(their.cost)} days, unlimited` : !opt.tracked ? `${num(their.cost)} days, no balance set` : opt.covers ? `${num(their.cost)} days, enough left` : `${num(their.cost)} days, ${num(opt.shortBy)} short`;
                                    return (
                                        <li key={u.id} className="flex min-h-11 items-center justify-between gap-3 border-t border-rp-line first:border-t-0">
                                            <span className="truncate text-sm text-rp-ink">{u.name}</span>
                                            <span className={cn('rp-tabular shrink-0 text-xs', opt && opt.tracked && !opt.covers ? 'text-rp-rust' : 'text-rp-muted')}>{text}</span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </RpSection>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2">
                        {onOpenCalendar ? (
                            <button type="button" onClick={onOpenCalendar} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-rp-muted outline-none hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted">
                                Half days or days you work <ArrowUpRight size={14} aria-hidden />
                            </button>
                        ) : null}
                        {hasLeave ? (
                            <button type="button" onClick={() => void remove()} className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-rp-rust outline-none hover:bg-rp-rust/10 focus-visible:ring-2 focus-visible:ring-rp-muted">
                                Take the leave off this trip
                            </button>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </RpSheet>
    );
};
