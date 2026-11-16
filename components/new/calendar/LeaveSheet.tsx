import React, { useEffect, useMemo, useState } from 'react';
import type { EntitlementType, LeaveEntry, LeaveState, Trip, User } from '../../../types';
import {
    balancesFor, countedDays, entryCost, leaveOverlaps, skippedDays, tripDates, weekdayOf, WEEKDAY_SHORT, type LeaveContext,
} from '../../../utils/calendarModel';
import { defaultState, hasLeaveType, newLeaveId, stateLabel, statesFor } from '../../../utils/leaveEntry';
import { formatDateRange } from '../../../utils/formatters';
import { isRealTrip } from '../../../utils/tripKind';
import HoldButton from '../../kokonutui/hold-button';
import ParticleButton from '../../kokonutui/particle-button';
import { ArrowUpRight, CalendarBlank, Check, Clock, PencilSimpleLine, Suitcase, SunHorizon, Users, Warning } from '../../ui/hugeicons';
import { RP_FIELD, RpField } from '../fields';
import { RpChip, RpSection, RpSheet } from '../ui';
import { LeaveSection } from '../trips/TripSheets';
import { TripMenu } from '../trips/TripMenu';
import { cn } from '../../../utils/cn';

/**
 * Create, change or remove a leave entry (leave Phase 1): who it is for, its dates, where it stands (an idea, planned,
 * requested, approved), the leave type (one, or a split across types and years), the day length, the days worked
 * anyway, an optional trip it is for, and a note. Before saving it shows what the days cost, what they overlap, and
 * what each balance would have left.
 */

export type LeaveTarget =
    | { kind: 'new'; date?: string; endDate?: string; memberId?: string; tripId?: string; entitlementId?: string }
    | { kind: 'edit'; entry: LeaveEntry };

type Mode = NonNullable<LeaveEntry['durationMode']>;
const DATE = cn(RP_FIELD, 'rp-date rp-tabular');
const MAX_WORK_CHIPS = 62;
const days = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} ${Math.abs(n) === 1 ? 'day' : 'days'}`;

interface Draft {
    id: string;
    memberId: string;
    name: string;
    startDate: string;
    endDate: string;
    state: LeaveState;
    tripId?: string;
    entitlementId?: string;
    allocations: NonNullable<LeaveEntry['allocations']>;
    durationMode: Mode;
    startPortion: 'full' | 'pm';
    endPortion: 'full' | 'am';
    excluded: string[];
    note: string;
    version?: number;
}

const draftFor = (target: LeaveTarget, me: string, today: string, users: User[], trips: Trip[]): Draft => {
    if (target.kind === 'edit') {
        const e = target.entry;
        return {
            id: e.id, memberId: e.memberId, name: e.name || '', startDate: e.startDate, endDate: e.endDate || e.startDate, state: e.state || 'planned',
            tripId: e.tripId, entitlementId: e.entitlementId, allocations: (e.allocations || []).map(a => ({ ...a })),
            durationMode: e.durationMode ?? 'all_full', startPortion: e.startPortion ?? 'full', endPortion: e.endPortion ?? 'full',
            excluded: [...(e.excludedDates || [])], note: e.note || '', version: e.version,
        };
    }
    const memberId = target.memberId ?? me;
    const trip = target.tripId ? trips.find(t => t.id === target.tripId) : undefined;
    const start = trip?.startDate ?? target.date ?? today;
    const endRaw = trip ? (trip.endDate || trip.startDate) : target.endDate;
    const end = endRaw && endRaw >= start ? endRaw : start;
    const member = users.find(u => u.id === memberId);
    return {
        id: newLeaveId(), memberId, name: trip?.name ?? '', startDate: start, endDate: end,
        state: end < today ? 'approved' : trip?.status === 'Upcoming' ? 'approved' : defaultState(member),
        tripId: trip?.id, entitlementId: target.entitlementId, allocations: [], durationMode: 'all_full', startPortion: 'full', endPortion: 'full', excluded: [], note: '',
    };
};

const toEntry = (d: Draft): LeaveEntry => {
    const split = d.allocations.length > 0;
    const entry: LeaveEntry = {
        id: d.id,
        memberId: d.memberId,
        name: d.name.trim() || undefined,
        startDate: d.startDate,
        endDate: d.endDate && d.endDate >= d.startDate ? d.endDate : d.startDate,
        state: d.state,
        tripId: d.tripId || undefined,
        entitlementId: split ? d.allocations[0].entitlementId : d.entitlementId,
        allocations: split ? d.allocations : undefined,
        durationMode: d.durationMode === 'all_full' ? undefined : d.durationMode,
        startPortion: d.durationMode === 'custom' && d.startPortion !== 'full' ? d.startPortion : undefined,
        endPortion: d.durationMode === 'custom' && d.endPortion !== 'full' ? d.endPortion : undefined,
        excludedDates: d.excluded.length ? d.excluded : undefined,
        note: d.note.trim() || undefined,
        version: d.version,
    };
    return Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== undefined)) as unknown as LeaveEntry;
};

export const LeaveSheet: React.FC<{
    target: LeaveTarget | null;
    users: User[];
    trips: Trip[];
    leave: LeaveEntry[];
    entitlements: EntitlementType[];
    /** Counting rules for a member (their weekend rule and holiday calendars). */
    contextFor: (memberId: string) => LeaveContext;
    meId?: string;
    isAdmin: boolean;
    today: string;
    onClose: () => void;
    onSave: (entry: LeaveEntry, before?: LeaveEntry) => Promise<void>;
    onRemove: (entry: LeaveEntry) => Promise<void>;
    onOpenTrip: (tripId: string) => void;
}> = ({ target, users, trips, leave, entitlements, contextFor, meId, isAdmin, today, onClose, onSave, onRemove, onOpenTrip }) => {
    const [draft, setDraft] = useState<Draft | null>(null);
    const [touched, setTouched] = useState(false);

    useEffect(() => {
        if (!target) { setDraft(null); return; }
        setTouched(false);
        setDraft(draftFor(target, meId ?? users[0]?.id ?? '', today, users, trips));
        // Only a new target resets the form: later changes to the lists must not wipe what is being typed.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target]);

    const editing = target?.kind === 'edit' ? target.entry : undefined;
    const members = isAdmin ? users : users.filter(u => u.id === meId);
    const member = users.find(u => u.id === draft?.memberId);

    const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(d => (d ? { ...d, [key]: value } : d));

    const single = Boolean(draft?.startDate) && draft?.startDate === (draft?.endDate || draft?.startDate);
    useEffect(() => {
        if (!draft) return;
        if (single && (draft.durationMode === 'all_am' || draft.durationMode === 'all_pm' || draft.durationMode === 'custom')) setDraft(d => (d ? { ...d, durationMode: 'all_full' } : d));
        if (!single && (draft.durationMode === 'single_am' || draft.durationMode === 'single_pm')) setDraft(d => (d ? { ...d, durationMode: 'all_full' } : d));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [single]);

    const entry = useMemo(() => (draft && draft.startDate ? toEntry(draft) : null), [draft]);
    const ctx = useMemo(() => (draft ? contextFor(draft.memberId) : null), [draft, contextFor]);
    const counted = entry && ctx ? countedDays(entry, ctx) : 0;
    const skipped = entry && ctx ? skippedDays(entry, ctx) : { weekend: 0, holiday: 0, worked: 0 };
    const others = useMemo(() => leave.filter(e => e.id !== draft?.id), [leave, draft?.id]);
    // What it really costs once the member's other leave has taken its share.
    const cost = entry && ctx ? entryCost(entry, others, ctx, today) : 0;

    // Working days the member already has leave on from another entry: they count once, so say so before saving.
    const overlap = useMemo(() => {
        if (!entry || !ctx) return null;
        const self = { ...entry, state: 'planned' as const, entitlementId: entry.entitlementId || 'draft' };
        const hits = leaveOverlaps({ id: entry.memberId }, [self, ...others], ctx).filter(o => o.entryIds.includes(self.id));
        if (hits.length === 0) return null;
        const names = [...new Set(hits.flatMap(o => o.entryIds).filter(id => id !== self.id).map(id => others.find(e => e.id === id)?.name || 'Time off'))];
        return { days: hits.length, names };
    }, [entry, ctx, others]);

    // The balance of each type the entry uses, before and after it, for each year it touches.
    const impact = useMemo(() => {
        if (!entry || !ctx || !member || !hasLeaveType(entry)) return [];
        const years = [...new Set(tripDates(entry).map(d => Number(d.slice(0, 4))))].slice(0, 3);
        const counting: LeaveEntry = { ...entry, state: (['planned', 'requested', 'approved'] as LeaveState[]).includes(entry.state) ? entry.state : 'planned' };
        const types = new Set([entry.entitlementId, ...(entry.allocations || []).map(a => a.entitlementId)].filter(Boolean) as string[]);
        const rows: { key: string; name: string; year: number; before: number | null; after: number | null; unlimited: boolean }[] = [];
        years.forEach(year => {
            const without = balancesFor({ user: member, leave: others, entitlements, today, ctx }, year);
            const withIt = balancesFor({ user: member, leave: [...others, counting], entitlements, today, ctx }, year);
            types.forEach(id => {
                const a = without.find(b => b.entitlement.id === id);
                const b = withIt.find(x => x.entitlement.id === id);
                if (!b || (a && a.used + a.planned + a.pending === b.used + b.planned + b.pending)) return;
                rows.push({ key: `${id}:${year}`, name: b.entitlement.name, year, before: a?.remaining ?? b.total, after: b.remaining, unlimited: b.unlimited });
            });
        });
        return rows;
    }, [entry, ctx, member, others, entitlements, today]);

    // Trips the leave can be for: the member's own real trips, soonest first, then the past.
    const choices = useMemo(() => {
        if (!draft) return [];
        const mine = trips.filter(t => t.status !== 'Cancelled' && isRealTrip(t) && t.startDate && (t.participants || []).includes(draft.memberId));
        const future = mine.filter(t => (t.endDate || t.startDate) >= today).sort((a, b) => a.startDate.localeCompare(b.startDate));
        const past = mine.filter(t => (t.endDate || t.startDate) < today).sort((a, b) => b.startDate.localeCompare(a.startDate));
        return [...future, ...past].slice(0, 40);
    }, [draft, trips, today]);

    if (!target || !draft) return <RpSheet open={false} onClose={onClose} title="">{null}</RpSheet>;

    const trip = draft.tripId ? trips.find(t => t.id === draft.tripId) : undefined;
    const dateError = !draft.startDate || (draft.endDate && draft.endDate < draft.startDate) ? 'Check the dates.' : undefined;
    const valid = !dateError && Boolean(draft.memberId);

    const save = async () => {
        setTouched(true);
        if (!valid || !entry) throw new Error('invalid');
        await onSave(entry, editing);
        onClose();
    };

    const pickTrip = (t: Trip | undefined) => setDraft(d => {
        if (!d) return d;
        if (!t) return { ...d, tripId: undefined };
        // Picking a trip takes its dates and name; they can be changed after (leave dates may differ from travel dates).
        return { ...d, tripId: t.id, startDate: t.startDate, endDate: t.endDate || t.startDate, name: d.name || t.name, excluded: [] };
    });

    const dayChips: { id: Mode; label: string }[] = single
        ? [{ id: 'all_full', label: 'Full day' }, { id: 'single_am', label: 'Morning' }, { id: 'single_pm', label: 'Afternoon' }]
        : [{ id: 'all_full', label: 'Full days' }, { id: 'all_am', label: 'Mornings only' }, { id: 'all_pm', label: 'Afternoons only' }, { id: 'custom', label: 'Half first or last day' }];

    const workDays = entry && ctx ? tripDates(entry).filter(iso => ctx.workingDays.includes(weekdayOf(iso)) && !ctx.offDays.has(iso)) : [];
    const toggleWorked = (iso: string) => set('excluded', draft.excluded.includes(iso) ? draft.excluded.filter(d => d !== iso) : [...draft.excluded, iso]);
    const states = statesFor(member);
    const stateChoices = states.includes(draft.state) ? states : [...states, draft.state];

    const title = editing ? (editing.name || 'Leave') : 'Add leave';
    const subtitle = editing
        ? (
            <span className="flex flex-wrap items-center gap-x-3">
                <span className="rp-tabular">{formatDateRange(editing.startDate, editing.endDate || editing.startDate)}</span>
                {editing.tripId ? (
                    <button type="button" onClick={() => onOpenTrip(editing.tripId as string)} className="inline-flex min-h-11 items-center gap-1 rounded-full text-sm text-rp-ink underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-rp-muted">
                        Open trip <ArrowUpRight size={14} aria-hidden />
                    </button>
                ) : null}
            </span>
        )
        : undefined;

    return (
        <RpSheet
            open
            onClose={onClose}
            title={title}
            subtitle={subtitle}
            width={460}
            footer={
                <>
                    {editing ? <HoldButton onHoldComplete={() => onRemove(editing)} resetAfter={0}>Hold to remove leave</HoldButton> : <span />}
                    <ParticleButton onClick={save} pendingLabel="Saving" successLabel="Saved" errorLabel="Check the details">{editing ? 'Save' : 'Add leave'}</ParticleButton>
                </>
            }
        >
            <div className="flex flex-col gap-5">
                <RpSection title="When" icon={CalendarBlank}>
                    {members.length > 1 ? (
                        <div role="group" aria-label="Member" className="flex flex-wrap items-center gap-2 py-2">
                            <Users size={16} className="text-rp-muted" aria-hidden />
                            {members.map(m => <RpChip key={m.id} selected={draft.memberId === m.id} onClick={() => setDraft(d => (d ? { ...d, memberId: m.id, tripId: undefined } : d))}>{m.name.split(' ')[0]}</RpChip>)}
                        </div>
                    ) : null}
                    <div className="grid gap-x-3 sm:grid-cols-2">
                        <RpField label="First day" error={touched ? dateError : undefined}>
                            {id => <input id={id} type="date" value={draft.startDate} onChange={e => { const v = e.target.value; setDraft(d => (d ? { ...d, startDate: v, endDate: !d.endDate || d.endDate < v ? v : d.endDate } : d)); }} className={DATE} />}
                        </RpField>
                        <RpField label="Last day">
                            {id => <input id={id} type="date" value={draft.endDate} min={draft.startDate || undefined} onChange={e => set('endDate', e.target.value)} className={DATE} />}
                        </RpField>
                    </div>
                    <RpField label="Name (optional)">
                        {id => <input id={id} value={draft.name} onChange={e => set('name', e.target.value)} className={RP_FIELD} autoComplete="off" placeholder="Time off" />}
                    </RpField>
                    <div role="group" aria-label="Where it stands" className="flex flex-wrap gap-2 py-2">
                        {stateChoices.map(st => (
                            <RpChip key={st} selected={draft.state === st} onClick={() => set('state', st)}>
                                {st === 'approved' ? <Check size={16} aria-hidden /> : st === 'draft' ? <PencilSimpleLine size={16} aria-hidden /> : <Clock size={16} aria-hidden />} {stateLabel(st, member)}
                            </RpChip>
                        ))}
                    </div>
                    <p className="pb-1 text-xs text-rp-muted">
                        {draft.state === 'draft' ? 'An idea: shown on the calendar, not counted.'
                            : draft.state === 'requested' ? 'Waiting for an answer: counted as pending.'
                                : draft.state === 'rejected' || draft.state === 'cancelled' ? 'Kept for the record, not counted.'
                                    : 'Counted against the balance.'}
                    </p>
                </RpSection>

                <RpSection title="Trip" icon={Suitcase}>
                    <div className="flex flex-col gap-1 py-2">
                        <TripMenu
                            label="The trip this leave is for"
                            pill={{ label: trip ? trip.name : 'No trip', icon: Suitcase }}
                            items={[
                                { id: '', label: 'No trip', icon: SunHorizon, selected: !draft.tripId, onSelect: () => pickTrip(undefined) },
                                ...choices.map(t => ({
                                    id: t.id,
                                    label: `${t.name} · ${formatDateRange(t.startDate, t.endDate || t.startDate)}`,
                                    icon: Suitcase,
                                    selected: t.id === draft.tripId,
                                    onSelect: () => pickTrip(t),
                                })),
                            ]}
                        />
                        {trip && (trip.startDate !== draft.startDate || (trip.endDate || trip.startDate) !== draft.endDate) ? (
                            <p className="text-xs text-rp-muted">Travel {formatDateRange(trip.startDate, trip.endDate || trip.startDate)}; the leave has its own dates.</p>
                        ) : null}
                    </div>
                </RpSection>

                <LeaveSection
                    draft={{ entitlementId: draft.entitlementId, allocations: draft.allocations, startDate: draft.startDate, endDate: draft.endDate }}
                    set={(key, value) => setDraft(d => (d ? { ...d, [key]: value } as Draft : d))}
                    entitlements={entitlements}
                    length={Math.round(counted * 2) / 2}
                    noneLabel="No leave type"
                    hint={{ on: 'The days count against that type.', off: 'Time off that uses no balance (a day worked elsewhere, a gift day).' }}
                />

                <RpSection title="Day length" icon={Clock}>
                    <div role="group" aria-label="Day length" className="flex flex-wrap gap-2 py-2">
                        {dayChips.map(c => <RpChip key={c.id} selected={draft.durationMode === c.id} onClick={() => set('durationMode', c.id)}>{c.label}</RpChip>)}
                    </div>
                    {draft.durationMode === 'custom' ? (
                        <div className="flex flex-col gap-2 pb-2">
                            <div role="group" aria-label="First day" className="flex flex-wrap items-center gap-2">
                                <span className="w-20 text-xs text-rp-muted">First day</span>
                                <RpChip selected={draft.startPortion === 'full'} onClick={() => set('startPortion', 'full')}>Whole day</RpChip>
                                <RpChip selected={draft.startPortion === 'pm'} onClick={() => set('startPortion', 'pm')}>From the afternoon</RpChip>
                            </div>
                            <div role="group" aria-label="Last day" className="flex flex-wrap items-center gap-2">
                                <span className="w-20 text-xs text-rp-muted">Last day</span>
                                <RpChip selected={draft.endPortion === 'full'} onClick={() => set('endPortion', 'full')}>Whole day</RpChip>
                                <RpChip selected={draft.endPortion === 'am'} onClick={() => set('endPortion', 'am')}>Until lunch</RpChip>
                            </div>
                        </div>
                    ) : null}
                </RpSection>

                {workDays.length > 1 && workDays.length <= MAX_WORK_CHIPS ? (
                    <RpSection title="Days you work anyway" icon={Suitcase}>
                        <div role="group" aria-label="Days you work anyway" className="flex flex-wrap gap-2 py-2">
                            {workDays.map(iso => {
                                const on = draft.excluded.includes(iso);
                                return (
                                    <RpChip key={iso} selected={on} onClick={() => toggleWorked(iso)} className="rp-tabular">
                                        {on ? <Check size={14} aria-hidden /> : null}
                                        {WEEKDAY_SHORT[weekdayOf(iso)]} {Number(iso.slice(8))}
                                    </RpChip>
                                );
                            })}
                        </div>
                    </RpSection>
                ) : null}

                <RpSection title="Note" icon={PencilSimpleLine}>
                    <RpField label="Note (optional)">
                        {id => <textarea id={id} value={draft.note} onChange={e => set('note', e.target.value)} rows={2} maxLength={2000} className={cn(RP_FIELD, 'min-h-20 py-2')} placeholder="Reference number, who approved it, anything to remember" />}
                    </RpField>
                </RpSection>

                <div role="status" className="flex flex-col gap-2 px-1">
                    <p className="rp-tabular text-sm text-rp-muted">
                        <span className="font-medium text-rp-ink">{days(cost)}</span> {hasLeaveType(draft) ? 'of leave' : 'off, no leave type'}
                        {cost !== counted ? ` (${days(counted - cost)} already on other leave)` : ''}
                        {skipped.weekend + skipped.holiday + skipped.worked > 0
                            ? ` · left out: ${[skipped.weekend ? `${skipped.weekend} weekend` : '', skipped.holiday ? `${skipped.holiday} ${skipped.holiday === 1 ? 'holiday' : 'holidays'}` : '', skipped.worked ? `${skipped.worked} worked` : ''].filter(Boolean).join(', ')}`
                            : ''}
                    </p>
                    {impact.length > 0 ? (
                        <ul className="flex flex-col gap-1" aria-label="What the balance would have left">
                            {impact.map(r => {
                                const over = r.after !== null && r.after < 0;
                                return (
                                    <li key={r.key} className={cn('rp-tabular flex items-center justify-between gap-3 rounded-rp-inset px-3 py-2 text-sm', over ? 'bg-rp-rust/15 text-rp-ink' : 'bg-rp-inset text-rp-ink')}>
                                        <span className="min-w-0 truncate">{r.name}, {r.year}</span>
                                        <span className="shrink-0">
                                            {r.unlimited ? 'Unlimited' : r.after === null ? 'No allowance set' : over ? `Over by ${days(-r.after)}` : `${r.before === null ? '' : `${days(r.before)} → `}${days(r.after)} left`}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : null}
                    {overlap ? (
                        <p role="note" className="flex items-start gap-2 rounded-rp-inset bg-rp-mustard/25 px-3 py-2 text-sm text-rp-ink">
                            <Warning size={16} className="mt-0.5 shrink-0 text-rp-ochre" aria-hidden />
                            <span>Overlaps {overlap.names.join(', ')} on {overlap.days} working {overlap.days === 1 ? 'day' : 'days'}. Each day counts once in the balance.</span>
                        </p>
                    ) : null}
                </div>
            </div>
        </RpSheet>
    );
};
