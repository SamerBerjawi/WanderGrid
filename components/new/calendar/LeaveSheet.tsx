import React, { useEffect, useMemo, useState } from 'react';
import type { EntitlementType, Trip, User } from '../../../types';
import type { LeaveFields, NewLeave } from '../../../hooks/useCalendarData';
import {
    countedDays, skippedDays, tripDates, hasLeave, isStandaloneLeave, weekdayOf, WEEKDAY_SHORT,
    type LeaveContext,
} from '../../../utils/calendarModel';
import { formatDateRange } from '../../../utils/formatters';
import HoldButton from '../../kokonutui/hold-button';
import ParticleButton from '../../kokonutui/particle-button';
import { ArrowUpRight, CalendarBlank, Check, Clock, Suitcase, SunHorizon, Users } from '../../ui/hugeicons';
import { RP_FIELD, RpField } from '../fields';
import { RpChip, RpSection, RpSheet } from '../ui';
import { LeaveSection } from '../trips/TripSheets';
import { TripMenu } from '../trips/TripMenu';
import { cn } from '../../../utils/cn';

/**
 * Create, change or remove leave. Leave lives on a trip: pick one, or make time off (a hidden trip) for
 * a member. The type section is the Trips sheet's own (one type or a split across types and years);
 * the day length and the days worked anyway are what decide how many days really count.
 */

export type LeaveTarget = { kind: 'new'; date?: string; memberId?: string } | { kind: 'edit'; trip: Trip };

type Mode = NonNullable<Trip['durationMode']>;
const DATE = cn(RP_FIELD, 'rp-date rp-tabular');
const MAX_WORK_CHIPS = 62;

interface Draft {
    mode: 'trip' | 'timeoff';
    tripId: string;
    name: string;
    startDate: string;
    endDate: string;
    status: Trip['status'];
    memberId: string;
    entitlementId?: string;
    allocations: NonNullable<Trip['allocations']>;
    durationMode: Mode;
    startPortion: 'full' | 'pm';
    endPortion: 'full' | 'am';
    excluded: string[];
}

const draftFor = (target: LeaveTarget, me: string, today: string): Draft => {
    if (target.kind === 'edit') {
        const t = target.trip;
        return {
            mode: isStandaloneLeave(t) ? 'timeoff' : 'trip',
            tripId: t.id,
            name: t.name,
            startDate: t.startDate,
            endDate: t.endDate || t.startDate,
            status: t.status,
            memberId: t.participants?.[0] ?? me,
            entitlementId: t.entitlementId,
            allocations: (t.allocations || []).map(a => ({ ...a })),
            durationMode: t.durationMode ?? 'all_full',
            startPortion: t.startPortion ?? 'full',
            endPortion: t.endPortion ?? 'full',
            excluded: [...(t.excludedDates || [])],
        };
    }
    const day = target.date ?? today;
    return {
        mode: 'timeoff', tripId: '', name: 'Time off', startDate: day, endDate: day, status: day < today ? 'Past' : 'Planning',
        memberId: target.memberId ?? me, entitlementId: undefined, allocations: [], durationMode: 'all_full', startPortion: 'full', endPortion: 'full', excluded: [],
    };
};

export const LeaveSheet: React.FC<{
    target: LeaveTarget | null;
    users: User[];
    trips: Trip[];
    entitlements: EntitlementType[];
    /** Counting rules for a member (their weekend rule and holiday calendars). */
    contextFor: (memberId: string) => LeaveContext;
    meId?: string;
    isAdmin: boolean;
    today: string;
    onClose: () => void;
    onSaveTrip: (trip: Trip, fields: LeaveFields, extra: Partial<Trip>) => Promise<void>;
    onCreate: (input: NewLeave) => Promise<void>;
    onRemove: (trip: Trip) => Promise<void>;
    onOpenTrip: (tripId: string) => void;
}> = ({ target, users, trips, entitlements, contextFor, meId, isAdmin, today, onClose, onSaveTrip, onCreate, onRemove, onOpenTrip }) => {
    const [draft, setDraft] = useState<Draft | null>(null);
    const [touched, setTouched] = useState(false);

    useEffect(() => {
        if (!target) { setDraft(null); return; }
        setTouched(false);
        setDraft(draftFor(target, meId ?? users[0]?.id ?? '', today));
    }, [target, meId, users, today]);

    const editing = target?.kind === 'edit' ? target.trip : undefined;
    const members = isAdmin ? users : users.filter(u => u.id === meId);

    // The trip the leave sits on (chosen, or the one being edited), and the dates it spans.
    const base = useMemo(() => {
        if (!draft) return undefined;
        if (draft.mode === 'trip') return trips.find(t => t.id === draft.tripId);
        return undefined;
    }, [draft, trips]);

    const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(d => (d ? { ...d, [key]: value } : d));

    // Keep the day length valid for the shape of the dates.
    const start = draft?.mode === 'trip' ? base?.startDate ?? '' : draft?.startDate ?? '';
    const end = draft?.mode === 'trip' ? (base?.endDate || base?.startDate) ?? '' : (draft?.endDate || draft?.startDate) ?? '';
    const single = Boolean(start) && start === end;
    useEffect(() => {
        if (!draft) return;
        if (single && (draft.durationMode === 'all_am' || draft.durationMode === 'all_pm' || draft.durationMode === 'custom')) setDraft(d => (d ? { ...d, durationMode: 'all_full' } : d));
        if (!single && (draft.durationMode === 'single_am' || draft.durationMode === 'single_pm')) setDraft(d => (d ? { ...d, durationMode: 'all_full' } : d));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [single]);

    const candidate = useMemo<Trip | null>(() => {
        if (!draft || !start || !end || end < start) return null;
        return {
            id: draft.tripId || 'draft', name: draft.name, location: '', startDate: start, endDate: end, status: draft.status, participants: [draft.memberId],
            entitlementId: draft.entitlementId, allocations: draft.allocations.length ? draft.allocations : undefined,
            durationMode: draft.durationMode, startPortion: draft.startPortion, endPortion: draft.endPortion, excludedDates: draft.excluded,
        };
    }, [draft, start, end]);

    const ctx = useMemo(() => (draft ? contextFor(base?.participants?.[0] ?? draft.memberId) : null), [draft, base, contextFor]);
    const counted = candidate && ctx ? countedDays(candidate, ctx) : 0;
    const skipped = candidate && ctx ? skippedDays(candidate, ctx) : { weekend: 0, holiday: 0, worked: 0 };

    // The trips a person can put leave on: the member's own, soonest first, then the past.
    const choices = useMemo(() => {
        if (!draft) return [];
        const mine = trips.filter(t => t.status !== 'Cancelled' && !t.isBundleOnly && !t.hideInPlanner && t.startDate && (t.participants || []).includes(draft.memberId));
        const future = mine.filter(t => (t.endDate || t.startDate) >= today).sort((a, b) => a.startDate.localeCompare(b.startDate));
        const past = mine.filter(t => (t.endDate || t.startDate) < today).sort((a, b) => b.startDate.localeCompare(a.startDate));
        return [...future, ...past].slice(0, 40);
    }, [draft, trips, today]);

    if (!target || !draft) return <RpSheet open={false} onClose={onClose} title="">{null}</RpSheet>;

    const noType = !draft.entitlementId && draft.allocations.length === 0;
    const dateError = draft.mode === 'timeoff' && (!draft.startDate || (draft.endDate && draft.endDate < draft.startDate)) ? 'Check the dates.' : undefined;
    const tripError = draft.mode === 'trip' && !base ? 'Choose a trip.' : undefined;
    const valid = !noType && !dateError && !tripError;

    const fields: LeaveFields = {
        entitlementId: draft.allocations.length > 0 ? draft.allocations[0].entitlementId : draft.entitlementId,
        allocations: draft.allocations.length > 0 ? draft.allocations : undefined,
        durationMode: draft.durationMode === 'all_full' ? undefined : draft.durationMode,
        startPortion: draft.durationMode === 'custom' && draft.startPortion !== 'full' ? draft.startPortion : undefined,
        endPortion: draft.durationMode === 'custom' && draft.endPortion !== 'full' ? draft.endPortion : undefined,
        excludedDates: draft.excluded.length ? draft.excluded : undefined,
    };

    const save = async () => {
        setTouched(true);
        if (!valid) throw new Error('invalid');
        if (editing || base) {
            const trip = (editing ?? base)!;
            const extra: Partial<Trip> = isStandaloneLeave(trip)
                ? { name: draft.name.trim() || 'Time off', startDate: draft.startDate, endDate: draft.endDate || draft.startDate, status: draft.endDate < today ? 'Past' : draft.status === 'Past' ? 'Planning' : draft.status }
                : {};
            await onSaveTrip(trip, fields, extra);
        } else {
            await onCreate({
                memberId: draft.memberId,
                name: draft.name,
                startDate: draft.startDate,
                endDate: draft.endDate || draft.startDate,
                status: (draft.endDate || draft.startDate) < today ? 'Past' : draft.status,
                fields,
            });
        }
        onClose();
    };

    const dayChips: { id: Mode; label: string }[] = single
        ? [{ id: 'all_full', label: 'Full day' }, { id: 'single_am', label: 'Morning' }, { id: 'single_pm', label: 'Afternoon' }]
        : [{ id: 'all_full', label: 'Full days' }, { id: 'all_am', label: 'Mornings only' }, { id: 'all_pm', label: 'Afternoons only' }, { id: 'custom', label: 'Half first or last day' }];

    const workDays = candidate ? tripDates(candidate).filter(iso => {
        const wd = weekdayOf(iso);
        return ctx!.workingDays.includes(wd) && !ctx!.offDays.has(iso);
    }) : [];
    const toggleWorked = (iso: string) => set('excluded', draft.excluded.includes(iso) ? draft.excluded.filter(d => d !== iso) : [...draft.excluded, iso]);

    const title = editing ? editing.name : 'Add leave';
    const subtitle = editing
        ? (
            <span className="flex flex-wrap items-center gap-x-3">
                <span className="rp-tabular">{formatDateRange(editing.startDate, editing.endDate || editing.startDate)}</span>
                {!isStandaloneLeave(editing) ? (
                    <button type="button" onClick={() => onOpenTrip(editing.id)} className="inline-flex min-h-11 items-center gap-1 rounded-full text-sm text-rp-ink underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-rp-muted">
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
                    {editing && (hasLeave(editing) || isStandaloneLeave(editing)) ? (
                        <HoldButton onHoldComplete={() => onRemove(editing)} resetAfter={0}>Hold to remove leave</HoldButton>
                    ) : <span />}
                    <ParticleButton onClick={save} pendingLabel="Saving" successLabel="Saved" errorLabel="Check the details">{editing ? 'Save' : 'Add leave'}</ParticleButton>
                </>
            }
        >
            <div className="flex flex-col gap-5">
                {!editing ? (
                    <RpSection title="Where" icon={Suitcase}>
                        <div role="group" aria-label="Where the leave sits" className="flex flex-wrap gap-2 py-2">
                            <RpChip selected={draft.mode === 'timeoff'} onClick={() => set('mode', 'timeoff')}><SunHorizon size={16} aria-hidden /> Time off</RpChip>
                            <RpChip selected={draft.mode === 'trip'} onClick={() => set('mode', 'trip')}><Suitcase size={16} aria-hidden /> On a trip</RpChip>
                        </div>
                        {members.length > 1 ? (
                            <div role="group" aria-label="Member" className="flex flex-wrap items-center gap-2 pb-2">
                                <Users size={16} className="text-rp-muted" aria-hidden />
                                {members.map(m => <RpChip key={m.id} selected={draft.memberId === m.id} onClick={() => setDraft(d => (d ? { ...d, memberId: m.id, tripId: '' } : d))}>{m.name.split(' ')[0]}</RpChip>)}
                            </div>
                        ) : null}
                        {draft.mode === 'trip' ? (
                            <div className="flex flex-col gap-1 pb-2">
                                <TripMenu
                                    label="Choose a trip"
                                    pill={{ label: base ? base.name : 'Choose a trip', icon: Suitcase }}
                                    items={choices.map(t => ({
                                        id: t.id,
                                        label: `${t.name} · ${formatDateRange(t.startDate, t.endDate || t.startDate)}`,
                                        icon: hasLeave(t) ? SunHorizon : Suitcase,
                                        selected: t.id === draft.tripId,
                                        onSelect: () => setDraft(d => (d ? { ...d, tripId: t.id, entitlementId: t.entitlementId, allocations: (t.allocations || []).map(a => ({ ...a })), durationMode: t.durationMode ?? 'all_full', startPortion: t.startPortion ?? 'full', endPortion: t.endPortion ?? 'full', excluded: [...(t.excludedDates || [])] } : d)),
                                    }))}
                                />
                                {touched && tripError ? <p role="alert" className="text-xs text-rp-rust">{tripError}</p> : choices.length === 0 ? <p className="text-xs text-rp-muted">No trips for this member yet.</p> : null}
                            </div>
                        ) : null}
                    </RpSection>
                ) : null}

                {draft.mode === 'timeoff' ? (
                    <RpSection title="Time off" icon={CalendarBlank}>
                        <RpField label="Name">
                            {id => <input id={id} value={draft.name} onChange={e => set('name', e.target.value)} className={RP_FIELD} autoComplete="off" placeholder="Time off" />}
                        </RpField>
                        <div className="grid gap-x-3 sm:grid-cols-2">
                            <RpField label="First day" error={touched ? dateError : undefined}>
                                {id => <input id={id} type="date" value={draft.startDate} onChange={e => { set('startDate', e.target.value); if (!draft.endDate || draft.endDate < e.target.value) set('endDate', e.target.value); }} className={DATE} />}
                            </RpField>
                            <RpField label="Last day">
                                {id => <input id={id} type="date" value={draft.endDate} min={draft.startDate || undefined} onChange={e => set('endDate', e.target.value)} className={DATE} />}
                            </RpField>
                        </div>
                        <div role="group" aria-label="Status" className="flex flex-wrap gap-2 pb-2">
                            <RpChip selected={draft.status !== 'Upcoming'} onClick={() => set('status', 'Planning')}><Clock size={16} aria-hidden /> Planned</RpChip>
                            <RpChip selected={draft.status === 'Upcoming'} onClick={() => set('status', 'Upcoming')}><Suitcase size={16} aria-hidden /> Confirmed</RpChip>
                        </div>
                    </RpSection>
                ) : null}

                {draft.mode === 'trip' && !base && !editing ? null : (
                    <>
                        <LeaveSection
                            draft={{ entitlementId: draft.entitlementId, allocations: draft.allocations, startDate: start, endDate: end }}
                            set={(key, value) => setDraft(d => (d ? { ...d, [key]: value } as Draft : d))}
                            entitlements={entitlements}
                            length={Math.round(counted * 2) / 2}
                        />
                        {touched && noType ? <p role="alert" className="-mt-3 px-1 text-xs text-rp-rust">Choose a leave type.</p> : null}

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

                        <p role="status" className="rp-tabular px-1 text-sm text-rp-muted">
                            <span className="font-medium text-rp-ink">{counted} {counted === 1 ? 'day' : 'days'}</span> {counted === 1 ? 'counts' : 'count'} as leave
                            {skipped.weekend + skipped.holiday + skipped.worked > 0
                                ? ` · left out: ${[skipped.weekend ? `${skipped.weekend} weekend` : '', skipped.holiday ? `${skipped.holiday} ${skipped.holiday === 1 ? 'holiday' : 'holidays'}` : '', skipped.worked ? `${skipped.worked} worked` : ''].filter(Boolean).join(', ')}`
                                : ''}
                        </p>
                    </>
                )}
            </div>
        </RpSheet>
    );
};
