import React, { useEffect, useMemo, useState } from 'react';
import type { Transport } from '../../../types';
import { parseLocalDateInTimezone } from '../../../utils/flightData';
import { placeName, zoneOf } from '../../../utils/journeysModel';
import { jetLagPlan, shiftText, zoneFacts, type Level, type PlanInput, type PlanStep } from '../../../utils/jetLag';
import { Clock, Moon, Sun } from '../../ui/hugeicons';
import { RpSection } from '../ui';
import { cn } from '../../../utils/cn';

/**
 * Time zones on the flight sheet: chips under the boarding pass (how far ahead or behind the destination is, the
 * time there now, and when it lands on both clocks) and a Jet lag card with a sleep and light plan for the days
 * after. The figures come from utils/jetLag.ts; both need a time zone for each end, and say nothing when a place
 * has none.
 */

/** The two zones and the two instants of a journey, or null when a zone or a time is missing. */
export const zonesOf = (t: Transport): PlanInput | null => {
    const fromTz = zoneOf(t.origin || ''), toTz = zoneOf(t.destination || '');
    if (!fromTz || !toTz || !t.departureDate) return null;
    const departure = parseLocalDateInTimezone(t.departureDate, t.departureTime || '00:00', fromTz);
    const arrival = parseLocalDateInTimezone(t.arrivalDate || t.departureDate, t.arrivalTime || t.departureTime || '00:00', toTz);
    return Number.isNaN(departure.getTime()) || Number.isNaN(arrival.getTime()) || arrival.getTime() <= departure.getTime() ? null : { fromTz, toTz, departure, arrival };
};

/** The current time, refreshed every half minute while mounted. */
const useNow = (ms = 30_000): Date => {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => { const id = window.setInterval(() => setNow(new Date()), ms); return () => window.clearInterval(id); }, [ms]);
    return now;
};

const chip = 'inline-flex min-h-8 items-center gap-1.5 rounded-full bg-rp-inset px-3 text-xs font-medium text-rp-ink';

export const TimeZoneChips: React.FC<{ t: Transport; /** The journey has landed: its "now" clock is no longer useful. */ done?: boolean }> = ({ t, done }) => {
    const zones = useMemo(() => zonesOf(t), [t]);
    const now = useNow();
    if (!zones) return null;
    const f = zoneFacts(zones, now);
    const there = placeName(t.destination);
    const here = placeName(t.origin);
    return (
        <ul className="flex flex-wrap gap-2" aria-label="Time zones">
            <li className={chip}><Clock size={14} className="text-rp-ochre" aria-hidden /> {f.shift === 0 ? `${there} is on the same time as ${here}` : `${there} is ${shiftText(f.shift)} of ${here}`}</li>
            {done ? null : <li className={cn(chip, 'rp-tabular')}>Now {f.nowThere} there</li>}
            <li className={cn(chip, 'rp-tabular')}>Lands {f.landsThere} there{f.shift !== 0 ? `, ${f.landsHere} at home` : ''}</li>
        </ul>
    );
};

const LEVEL: Record<Level, { label: string; pill: string }> = {
    none: { label: 'No jet lag', pill: 'bg-rp-green/15 text-rp-green' },
    mild: { label: 'Mild', pill: 'bg-rp-green/15 text-rp-green' },
    moderate: { label: 'Moderate', pill: 'bg-rp-mustard text-rp-on-mustard' },
    hard: { label: 'Hard', pill: 'bg-rp-rust text-rp-paper' },
};
const WHEN: Record<PlanStep['when'], string> = { before: 'Before', flight: 'On the flight', arrival: 'When you land', after: 'After' };

export const JetLagCard: React.FC<{ t: Transport }> = ({ t }) => {
    const zones = useMemo(() => zonesOf(t), [t]);
    if (!zones) return null;
    const plan = jetLagPlan(zones);
    const level = LEVEL[plan.level];
    return (
        <RpSection title="Jet lag" icon={Moon} action={<span className={cn('rounded-full px-2.5 py-0.5 text-2xs font-semibold', level.pill)}>{level.label}</span>}>
            <div className="flex flex-col gap-3 py-2">
                {plan.level === 'none' ? (
                    <p className="text-sm text-rp-muted">{placeName(t.destination)} is {plan.shift === 0 ? 'on the same time as' : `${shiftText(plan.shift)} of`} {placeName(t.origin)}: too little for a plan. Keep to your usual sleep.</p>
                ) : (
                    <>
                        <p className="text-sm text-rp-ink">
                            {placeName(t.destination)} is {shiftText(plan.shift)} of {placeName(t.origin)}, so you fly {plan.direction}. Your body clock needs about <span className="font-medium">{plan.recoveryDays} {plan.recoveryDays === 1 ? 'day' : 'days'}</span> to catch up.
                        </p>
                        <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-rp-inset bg-rp-inset px-2 py-2"><Moon size={14} className="mx-auto text-rp-plum" aria-hidden /><p className="rp-tabular mt-1 text-xs font-semibold text-rp-ink">{plan.sleep.bed}–{plan.sleep.wake}</p><p className="text-2xs text-rp-muted">Sleep there</p></div>
                            <div className="rounded-rp-inset bg-rp-inset px-2 py-2"><Sun size={14} className="mx-auto text-rp-ochre" aria-hidden /><p className="rp-tabular mt-1 text-xs font-semibold text-rp-ink">{plan.light.seek[0]}–{plan.light.seek[1]}</p><p className="text-2xs text-rp-muted">Seek light</p></div>
                            <div className="rounded-rp-inset bg-rp-inset px-2 py-2"><Sun size={14} className="mx-auto text-rp-muted" aria-hidden /><p className="rp-tabular mt-1 text-xs font-semibold text-rp-ink">{plan.light.avoid[0]}–{plan.light.avoid[1]}</p><p className="text-2xs text-rp-muted">Dim the light</p></div>
                        </div>
                        <ol className="flex flex-col gap-2" aria-label="Jet lag plan">
                            {plan.steps.map((s, i) => (
                                <li key={i} className="flex flex-col gap-0.5 border-t border-rp-line pt-2 first:border-t-0 first:pt-0">
                                    <span className="text-2xs font-medium uppercase tracking-wide text-rp-muted">{WHEN[s.when]}</span>
                                    <span className="text-sm font-medium text-rp-ink">{s.title}</span>
                                    <span className="text-xs text-rp-muted">{s.detail}</span>
                                </li>
                            ))}
                        </ol>
                    </>
                )}
                <p className="text-2xs text-rp-muted">A rule of thumb for healthy adults, not medical advice. Times are the destination's.</p>
            </div>
        </RpSection>
    );
};
