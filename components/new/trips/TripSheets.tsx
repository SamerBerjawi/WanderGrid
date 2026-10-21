import React, { useEffect, useState } from 'react';
import type { Accommodation, Activity, EntitlementType, Transport, Trip, TripAllocation, TransportMode, User } from '../../../types';
import type { TripDraft } from '../../../hooks/useTripsData';
import { BUCKET_STATUS, tripDays, type TripBucket } from '../../../utils/tripsModel';
import { formatCurrency, formatDate } from '../../../utils/formatters';
import HoldButton from '../../kokonutui/hold-button';
import ParticleButton from '../../kokonutui/particle-button';
import {
    Airplane, ArrowLeft, ArrowRight, ArrowUpRight, Bed, Boat, Bus, CalendarBlank, CalendarCheck, Car, CarProfile, Check, CheckCircle, Clock, Globe, Lock, MapPin,
    Palette, Plus, Suitcase, Train, Users, X, type Icon,
} from '../../ui/hugeicons';
import { RP_FIELD, RpField } from '../fields';
import { IconPicker } from '../IconPicker';
import { PlaceField } from '../PlaceField';
import { RpHugeicon } from '../RpHugeicon';
import { RpChip, RpIconButton, RpLogo, RpSection, RpSheet, RpToggle } from '../ui';
import { TripMenu } from './TripMenu';
import { stayIcon } from './stayIcon';
import { STAY_ACCENT } from './accents';
import { modeLook } from './transportModes';
import { LegForm } from './LegForm';
import { calculateDistance } from '../../../services/geocoding';
import { cn } from '../../../utils/cn';

/**
 * Sheets of the New Trips page: a three-step New trip flow (Trip basics, Transport, Stays); an edit
 * sheet with the same plus Activities, where every leg, stay and activity can be changed or removed;
 * and the delete confirmation.
 */

/** `step` opens an edit on a given step: 0 Basics, 1 Transport, 2 Stays, 3 Activities. */
export type TripSheetTarget = { kind: 'create'; bucket: TripBucket } | { kind: 'edit'; trip: Trip; step?: number };

const STATUS_CHOICES: { status: Trip['status']; label: string; icon: Icon; on: string }[] = [
    { status: 'Planning', label: 'Planned', icon: Clock, on: 'bg-rp-mustard text-rp-on-mustard hover:bg-rp-mustard' },
    { status: 'Upcoming', label: 'Confirmed', icon: Suitcase, on: 'bg-rp-green text-rp-paper hover:bg-rp-green' },
    { status: 'Past', label: 'Past', icon: CheckCircle, on: 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink' },
];


const STAY_TYPES: Accommodation['type'][] = ['Hotel', 'Airbnb', 'Resort', 'Villa', 'Apartment', 'Hostel', 'Campground', 'Friends/Family'];
const ACTIVITY_TYPES = ['Activity', 'Dining', 'Tour', 'Sightseeing', 'Museum', 'Outdoor', 'Entertainment', 'Shopping', 'Wellness', 'Nightlife'];

const emptyDraft = (status: Trip['status']): TripDraft => ({
    name: '', destination: '', startDate: '', endDate: '', status, participants: [], notes: '', icon: undefined,
    privacy: 'Private', entitlementId: undefined, allocations: [], coordinates: undefined, transports: [], stays: [], activities: [],
});
const draftOf = (trip: Trip): TripDraft => ({
    name: trip.name,
    destination: trip.location || '',
    startDate: trip.startDate || '',
    endDate: trip.endDate || '',
    status: trip.status,
    participants: trip.participants || [],
    notes: trip.notes || '',
    icon: trip.hugeicon,
    privacy: trip.privacy || 'Private',
    entitlementId: trip.entitlementId,
    allocations: (trip.allocations || []).map(a => ({ ...a })),
    coordinates: trip.coordinates,
    transports: (trip.transports || []).map(t => ({ ...t })),
    stays: (trip.accommodations || []).map(a => ({ ...a })),
    activities: (trip.activities || []).map(a => ({ ...a })),
});

const num = (v: string): number | undefined => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
};
const costText = (n?: number) => (n != null ? String(n) : '');
const DATE = cn(RP_FIELD, 'rp-date rp-tabular');

type SetDraft = <K extends keyof TripDraft>(key: K, value: TripDraft[K]) => void;

/* ------------------------------------------------------------------ */
/* Leave */
/* ------------------------------------------------------------------ */

const yearOf = (d: string) => Number(d.slice(0, 4)) || undefined;

/** The leave a trip counts against: one type, or its days split across types (and years). */
const LeaveSection: React.FC<{ draft: TripDraft; set: SetDraft; entitlements: EntitlementType[] }> = ({ draft, set, entitlements }) => {
    const allocations = draft.allocations || [];
    const split = allocations.length > 0;
    const length = tripDays({ startDate: draft.startDate, endDate: draft.endDate || draft.startDate } as Trip);
    const assigned = allocations.reduce((sum, a) => sum + (Number(a.days) || 0), 0);
    const startYear = yearOf(draft.startDate);
    const endYear = yearOf(draft.endDate || draft.startDate);
    const years = startYear && endYear && endYear > startYear ? Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i) : [];
    const nameOf = (id: string) => entitlements.find(e => e.id === id)?.name || 'Leave type';

    const setAllocations = (next: TripAllocation[]) => set('allocations', next);
    const update = (i: number, patch: Partial<TripAllocation>) => setAllocations(allocations.map((a, j) => (j === i ? { ...a, ...patch } : a)));
    const toggleSplit = (on: boolean) => {
        if (on && draft.entitlementId) {
            setAllocations([{ entitlementId: draft.entitlementId, days: length }]);
        } else {
            // Back to one type: keep the first one as the trip's leave.
            if (allocations[0]) set('entitlementId', allocations[0].entitlementId);
            setAllocations([]);
        }
    };

    return (
        <RpSection title="Leave" icon={CalendarCheck}>
            {!split ? (
                <div role="group" aria-label="Leave type" className="flex flex-wrap gap-2 py-2">
                    <RpChip selected={!draft.entitlementId} onClick={() => set('entitlementId', undefined)}>No leave</RpChip>
                    {entitlements.map(e => (
                        <RpChip key={e.id} selected={draft.entitlementId === e.id} onClick={() => set('entitlementId', e.id)}>{e.name}</RpChip>
                    ))}
                </div>
            ) : null}

            {entitlements.length > 1 && (draft.entitlementId || split) ? (
                <RpToggle label="Split across leave types" hint={split ? undefined : 'Use more than one type, or more than one year.'} checked={split} onChange={toggleSplit} />
            ) : null}

            {split ? (
                <div className="flex flex-col gap-2 py-2">
                    {allocations.map((a, i) => (
                        <div key={i} className="flex flex-col gap-2 rounded-rp-inset bg-rp-surface p-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <TripMenu
                                    label={`Leave type for part ${i + 1}`}
                                    pill={{ label: nameOf(a.entitlementId), icon: CalendarCheck }}
                                    items={entitlements.map(e => ({ id: e.id, label: e.name, icon: CalendarCheck, selected: a.entitlementId === e.id, onSelect: () => update(i, { entitlementId: e.id }) }))}
                                />
                                <label className="ml-auto flex items-center gap-2 text-sm text-rp-muted">
                                    <span className="sr-only">Days for {nameOf(a.entitlementId)}</span>
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        min={0}
                                        step={0.5}
                                        value={a.days}
                                        onChange={e => update(i, { days: Math.max(0, Number(e.target.value) || 0) })}
                                        className={cn(RP_FIELD, 'rp-tabular w-20 text-right')}
                                    />
                                    days
                                </label>
                                {allocations.length > 1 ? (
                                    <RpIconButton label={`Remove ${nameOf(a.entitlementId)}`} tone="ghost" onClick={() => setAllocations(allocations.filter((_, j) => j !== i))}><X size={18} /></RpIconButton>
                                ) : null}
                            </div>
                            {years.length > 0 ? (
                                <div role="group" aria-label="Year this part counts in" className="flex flex-wrap gap-2">
                                    <RpChip selected={a.targetYear === undefined} onClick={() => update(i, { targetYear: undefined })}>Any year</RpChip>
                                    {years.map(y => <RpChip key={y} selected={a.targetYear === y} onClick={() => update(i, { targetYear: y })} className="rp-tabular">{y}</RpChip>)}
                                </div>
                            ) : null}
                        </div>
                    ))}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                            type="button"
                            onClick={() => setAllocations([...allocations, { entitlementId: entitlements.find(e => !allocations.some(a => a.entitlementId === e.id))?.id || entitlements[0].id, days: Math.max(0, length - assigned) }])}
                            className={GHOST_BUTTON}
                        >
                            <Plus size={16} aria-hidden /> Add a type
                        </button>
                        <p className={cn('rp-tabular text-xs', assigned > length && length > 0 ? 'text-rp-rust' : 'text-rp-muted')} role="status">
                            {assigned} of {length} {length === 1 ? 'day' : 'days'} assigned{assigned > length && length > 0 ? ` (${assigned - length} over)` : ''}
                        </p>
                    </div>
                </div>
            ) : (
                <p className="px-1 pb-2 text-xs text-rp-muted">{draft.entitlementId ? 'The days of this trip count against that leave.' : 'A general event: no leave is used.'}</p>
            )}
        </RpSection>
    );
};

/* ------------------------------------------------------------------ */
/* Basics */
/* ------------------------------------------------------------------ */

const Basics: React.FC<{
    draft: TripDraft;
    set: SetDraft;
    users: User[];
    entitlements: EntitlementType[];
    showErrors: boolean;
    autoFocus: boolean;
}> = ({ draft, set, users, entitlements, showErrors, autoFocus }) => {
    const [pickingIcon, setPickingIcon] = useState(false);
    const nameError = showErrors && !draft.name.trim() ? 'Give the trip a name.' : undefined;
    const startError = showErrors && !draft.startDate ? 'Pick a start date.' : undefined;
    const endError = draft.startDate && draft.endDate && draft.endDate < draft.startDate ? 'The trip ends before it starts.' : undefined;
    return (
        <div className="flex flex-col gap-5">
            <RpSection title="Status" icon={Clock}>
                <div role="group" aria-label="Status" className="flex flex-wrap gap-2 py-2">
                    {STATUS_CHOICES.map(c => (
                        <RpChip key={c.status} selected={draft.status === c.status} onClick={() => set('status', c.status)} className={cn(draft.status === c.status && c.on)}>
                            <c.icon size={16} aria-hidden /> {c.label}
                        </RpChip>
                    ))}
                </div>
            </RpSection>

            <RpSection title="Trip" icon={MapPin}>
                <RpField label="Name" error={nameError}>
                    {id => <input id={id} value={draft.name} onChange={e => set('name', e.target.value)} className={RP_FIELD} autoComplete="off" placeholder="Summer in Lisbon" autoFocus={autoFocus} />}
                </RpField>
                <RpField label="Destination">
                    {id => (
                        <PlaceField
                            id={id}
                            value={draft.destination}
                            located={Boolean(draft.coordinates)}
                            placeholder="Lisbon, Portugal"
                            onChange={text => { set('destination', text); if (draft.coordinates) set('coordinates', undefined); }}
                            onPick={(text, coordinates) => { set('destination', text); set('coordinates', coordinates); }}
                        />
                    )}
                </RpField>
            </RpSection>

            <RpSection title="Dates" icon={CalendarBlank}>
                <div className="grid gap-x-3 sm:grid-cols-2">
                    <RpField label="Start" error={startError}>
                        {id => <input id={id} type="date" value={draft.startDate} onChange={e => set('startDate', e.target.value)} className={DATE} />}
                    </RpField>
                    <RpField label="End" error={endError}>
                        {id => <input id={id} type="date" value={draft.endDate} min={draft.startDate || undefined} onChange={e => set('endDate', e.target.value)} className={DATE} />}
                    </RpField>
                </div>
            </RpSection>

            <RpSection title="Icon" icon={Palette}>
                <div className="flex items-center gap-3 py-2">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-rp-ink text-rp-on-ink">
                        <RpHugeicon name={draft.icon} size={22} fallback={<Suitcase size={22} aria-hidden />} />
                    </span>
                    <button
                        type="button"
                        aria-expanded={pickingIcon}
                        onClick={() => setPickingIcon(p => !p)}
                        className="min-h-11 rounded-full bg-rp-surface px-4 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted"
                    >
                        {pickingIcon ? 'Done' : draft.icon ? 'Change icon' : 'Choose an icon'}
                    </button>
                </div>
                {pickingIcon ? <IconPicker value={draft.icon} onChange={name => set('icon', name)} /> : null}
            </RpSection>

            {entitlements.length > 0 ? <LeaveSection draft={draft} set={set} entitlements={entitlements} /> : null}

            <RpSection title="Who can see it" icon={draft.privacy === 'Public' ? Globe : Lock}>
                <div role="group" aria-label="Privacy" className="flex flex-wrap gap-2 py-2">
                    <RpChip selected={draft.privacy !== 'Public'} onClick={() => set('privacy', 'Private')}><Lock size={16} aria-hidden /> Private</RpChip>
                    <RpChip selected={draft.privacy === 'Public'} onClick={() => set('privacy', 'Public')}><Globe size={16} aria-hidden /> Public</RpChip>
                </div>
            </RpSection>

            {users.length > 1 ? (
                <RpSection title="Members" icon={Users}>
                    <div role="group" aria-label="Members" className="flex flex-wrap gap-2 py-2">
                        {users.map(u => {
                            const on = draft.participants.includes(u.id);
                            return (
                                <RpChip key={u.id} selected={on} onClick={() => set('participants', on ? draft.participants.filter(p => p !== u.id) : [...draft.participants, u.id])}>
                                    {u.name}
                                </RpChip>
                            );
                        })}
                    </div>
                </RpSection>
            ) : null}

            <RpSection title="Notes">
                <textarea aria-label="Notes" value={draft.notes} onChange={e => set('notes', e.target.value)} rows={3} className={cn(RP_FIELD, 'my-2 resize-none py-2.5')} />
            </RpSection>
        </div>
    );
};

/* ------------------------------------------------------------------ */
/* Shared bits of the list steps */
/* ------------------------------------------------------------------ */

const ADD_BUTTON = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-rp-ink px-5 text-sm font-medium text-rp-on-ink outline-none transition-opacity hover:bg-rp-ink/90 focus-visible:ring-2 focus-visible:ring-rp-muted disabled:opacity-40';
const GHOST_BUTTON = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-rp-surface px-5 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted';

/** A row of the "added so far" list: tap it to edit, X to remove. */
const ItemRow: React.FC<{ logo: React.ReactNode; title: string; meta: string; active: boolean; onEdit: () => void; onRemove: () => void; removeLabel: string }> = ({
    logo, title, meta, active, onEdit, onRemove, removeLabel,
}) => (
    <li className={cn('flex items-center gap-2 rounded-rp-inset bg-rp-surface py-1 pr-1 pl-3', active && 'ring-2 ring-rp-ink')}>
        {logo}
        <button type="button" onClick={onEdit} aria-label={`Edit ${title}`} className="min-h-11 min-w-0 flex-1 rounded-rp-inset px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-rp-muted">
            <span className="block truncate text-sm font-medium text-rp-ink">{title}</span>
            {meta ? <span className="block truncate text-xs text-rp-muted">{meta}</span> : null}
        </button>
        <RpIconButton label={removeLabel} tone="ghost" onClick={onRemove}><X size={18} /></RpIconButton>
    </li>
);

const FormActions: React.FC<{ editing: boolean; valid: boolean; addLabel: string; onSave: () => void; onCancel: () => void }> = ({ editing, valid, addLabel, onSave, onCancel }) => (
    <div className="mt-2 mb-1 flex flex-wrap gap-2">
        <button type="button" onClick={onSave} disabled={!valid} className={ADD_BUTTON}>
            {editing ? <><Check size={16} aria-hidden /> Save changes</> : <><Plus size={16} aria-hidden /> {addLabel}</>}
        </button>
        {editing ? <button type="button" onClick={onCancel} className={GHOST_BUTTON}>Cancel</button> : null}
    </div>
);

const modeOf = modeLook;

/** Replace item `at` (when editing) or append, and give back the new list. */
const upsert = <T,>(list: T[], at: number | null, item: T): T[] => (at === null ? [...list, item] : list.map((x, i) => (i === at ? item : x)));

/* ------------------------------------------------------------------ */
/* Transport */
/* ------------------------------------------------------------------ */

const TransportStep: React.FC<{ draft: TripDraft; set: SetDraft; brandfetchApiKey?: string }> = ({ draft, set, brandfetchApiKey }) => {
    const blank = (): Partial<Transport> => ({
        mode: 'Flight', origin: '', destination: '', departureDate: draft.startDate, departureTime: '10:00',
        arrivalDate: draft.startDate, arrivalTime: '14:00', provider: '', identifier: '', confirmationCode: '',
    });
    const [leg, setLeg] = useState<Partial<Transport>>(blank);
    const [cost, setCost] = useState('');
    const [editing, setEditing] = useState<number | null>(null);
    const list = draft.transports || [];
    const m = modeOf(leg.mode);
    const patch = (p: Partial<Transport>) => setLeg(l => ({ ...l, ...p }));
    const valid = Boolean(leg.origin?.trim() && leg.destination?.trim());

    const reset = () => { setLeg(blank()); setCost(''); setEditing(null); };
    const save = () => {
        if (!valid) return;
        // Distance is worked out from the two places when it wasn't typed; empty stops are dropped.
        const distance = leg.distance ?? (leg.originLat != null && leg.originLng != null && leg.destLat != null && leg.destLng != null
            ? Math.round(calculateDistance(leg.originLat, leg.originLng, leg.destLat, leg.destLng))
            : undefined);
        const waypoints = (leg.waypoints || []).filter(w => w.name.trim()).map(w => ({ ...w, name: w.name.trim() }));
        set('transports', upsert(list, editing, { ...leg, origin: leg.origin!.trim(), destination: leg.destination!.trim(), cost: num(cost), distance, waypoints: waypoints.length ? waypoints : undefined }));
        reset();
    };
    const edit = (i: number) => { setLeg({ ...list[i] }); setCost(costText(list[i].cost)); setEditing(i); };
    const remove = (i: number) => {
        const removed = list[i];
        let next = list.filter((_, j) => j !== i);
        // A round trip's price may sit on one leg: removing that leg hands it to a remaining leg of the same booking.
        if (removed?.cost && removed.itineraryId) {
            const k = next.findIndex(t => t.itineraryId === removed.itineraryId);
            if (k >= 0) next = next.map((t, j) => (j === k ? { ...t, cost: (t.cost || 0) + removed.cost! } : t));
        }
        set('transports', next);
        if (editing === i) reset(); else if (editing !== null && editing > i) setEditing(editing - 1);
    };

    return (
        <div className="flex flex-col gap-5">
            {list.length > 0 ? (
                <RpSection title={`Added (${list.length})`} icon={Airplane}>
                    <ul className="flex flex-col gap-2 py-2">
                        {list.map((t, i) => {
                            const tm = modeOf(t.mode);
                            return (
                                <ItemRow
                                    key={t.id || i}
                                    active={editing === i}
                                    logo={<RpLogo name={t.provider} src={t.logoUrl} brandfetchApiKey={brandfetchApiKey} fallback={tm.icon} iconClassName={tm.text} />}
                                    title={`${t.origin} → ${t.destination}`}
                                    meta={[t.provider, t.departureDate ? formatDate(t.departureDate, 'short') : '', t.cost != null ? formatCurrency(t.cost) : ''].filter(Boolean).join(' · ') || tm.label}
                                    onEdit={() => edit(i)}
                                    onRemove={() => remove(i)}
                                    removeLabel={`Remove ${t.origin} to ${t.destination}`}
                                />
                            );
                        })}
                    </ul>
                </RpSection>
            ) : null}

            <RpSection title={editing !== null ? 'Edit transport' : list.length ? 'Add another' : 'Add a flight, train or ride'} icon={editing !== null ? Airplane : Plus}>
                <LegForm
                    leg={leg}
                    patch={patch}
                    cost={cost}
                    onCost={setCost}
                    brandfetchApiKey={brandfetchApiKey}
                    bias={draft.coordinates}
                    detailsKey={editing ?? 'new'}
                    detailsOpen={editing !== null && Boolean(leg.waypoints?.length)}
                />
                <FormActions editing={editing !== null} valid={valid} addLabel="Add transport" onSave={save} onCancel={reset} />
            </RpSection>
        </div>
    );
};

/* ------------------------------------------------------------------ */
/* Stays */
/* ------------------------------------------------------------------ */

const StaysStep: React.FC<{ draft: TripDraft; set: SetDraft; brandfetchApiKey?: string }> = ({ draft, set, brandfetchApiKey }) => {
    const blank = (): Partial<Accommodation> => ({
        name: '', type: 'Hotel', address: draft.destination, checkInDate: draft.startDate, checkInTime: '15:00',
        checkOutDate: draft.endDate || draft.startDate, checkOutTime: '11:00', confirmationCode: '',
    });
    const [stay, setStay] = useState<Partial<Accommodation>>(blank);
    const [cost, setCost] = useState('');
    const [editing, setEditing] = useState<number | null>(null);
    const list = draft.stays || [];
    const patch = (p: Partial<Accommodation>) => setStay(s => ({ ...s, ...p }));
    const valid = Boolean(stay.name?.trim());

    const reset = () => { setStay(blank()); setCost(''); setEditing(null); };
    const save = () => {
        if (!valid) return;
        set('stays', upsert(list, editing, { ...stay, name: stay.name!.trim(), cost: num(cost) }));
        reset();
    };
    const edit = (i: number) => { setStay({ ...list[i] }); setCost(costText(list[i].cost)); setEditing(i); };
    const remove = (i: number) => { set('stays', list.filter((_, j) => j !== i)); if (editing === i) reset(); else if (editing !== null && editing > i) setEditing(editing - 1); };

    return (
        <div className="flex flex-col gap-5">
            {list.length > 0 ? (
                <RpSection title={`Added (${list.length})`} icon={Bed}>
                    <ul className="flex flex-col gap-2 py-2">
                        {list.map((a, i) => (
                            <ItemRow
                                key={a.id || i}
                                active={editing === i}
                                logo={<RpLogo name={a.name} src={a.logoUrl} brandfetchApiKey={brandfetchApiKey} fallback={stayIcon(a.type)} iconClassName={STAY_ACCENT} />}
                                title={a.name || 'Stay'}
                                meta={[a.type, a.checkInDate && a.checkOutDate ? `${formatDate(a.checkInDate, 'short')} – ${formatDate(a.checkOutDate, 'short')}` : '', a.cost != null ? formatCurrency(a.cost) : ''].filter(Boolean).join(' · ')}
                                onEdit={() => edit(i)}
                                onRemove={() => remove(i)}
                                removeLabel={`Remove ${a.name}`}
                            />
                        ))}
                    </ul>
                </RpSection>
            ) : null}

            <RpSection title={editing !== null ? 'Edit stay' : list.length ? 'Add another' : 'Add a place to stay'} icon={editing !== null ? Bed : Plus}>
                <RpField label="Name">
                    {id => (
                        <div className="flex items-center gap-2">
                            <RpLogo name={stay.name} src={stay.logoUrl} brandfetchApiKey={brandfetchApiKey} fallback={stayIcon(stay.type)} iconClassName={STAY_ACCENT} />
                            <input id={id} value={stay.name} onChange={e => patch({ name: e.target.value })} className={RP_FIELD} placeholder="Hotel Avenida" autoComplete="off" />
                        </div>
                    )}
                </RpField>
                <div role="group" aria-label="Type of stay" className="flex flex-wrap gap-2 py-2">
                    {STAY_TYPES.map(t => <RpChip key={t} selected={stay.type === t} onClick={() => patch({ type: t })}>{t}</RpChip>)}
                </div>
                <RpField label="Address">{id => <input id={id} value={stay.address} onChange={e => patch({ address: e.target.value })} className={RP_FIELD} autoComplete="off" />}</RpField>
                <div className="grid gap-x-3 sm:grid-cols-2">
                    <RpField label="Check-in">{id => <input id={id} type="date" value={stay.checkInDate} onChange={e => patch({ checkInDate: e.target.value, checkOutDate: stay.checkOutDate && stay.checkOutDate >= e.target.value ? stay.checkOutDate : e.target.value })} className={DATE} />}</RpField>
                    <RpField label="Check-in time">{id => <input id={id} type="time" value={stay.checkInTime} onChange={e => patch({ checkInTime: e.target.value })} className={DATE} />}</RpField>
                    <RpField label="Check-out">{id => <input id={id} type="date" value={stay.checkOutDate} min={stay.checkInDate || undefined} onChange={e => patch({ checkOutDate: e.target.value })} className={DATE} />}</RpField>
                    <RpField label="Check-out time">{id => <input id={id} type="time" value={stay.checkOutTime} onChange={e => patch({ checkOutTime: e.target.value })} className={DATE} />}</RpField>
                    <RpField label="Confirmation">{id => <input id={id} value={stay.confirmationCode} onChange={e => patch({ confirmationCode: e.target.value })} className={RP_FIELD} autoComplete="off" />}</RpField>
                    <RpField label="Cost">{id => <input id={id} inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} className={cn(RP_FIELD, 'rp-tabular')} placeholder="0" autoComplete="off" />}</RpField>
                </div>
                <FormActions editing={editing !== null} valid={valid} addLabel="Add stay" onSave={save} onCancel={reset} />
            </RpSection>
        </div>
    );
};

/* ------------------------------------------------------------------ */
/* Activities (editing only) */
/* ------------------------------------------------------------------ */

const ActivitiesStep: React.FC<{ draft: TripDraft; set: SetDraft }> = ({ draft, set }) => {
    const blank = (): Partial<Activity> => ({ title: '', type: 'Activity', date: draft.startDate, time: '10:00', location: '', description: '' });
    const [item, setItem] = useState<Partial<Activity>>(blank);
    const [cost, setCost] = useState('');
    const [editing, setEditing] = useState<number | null>(null);
    const list = draft.activities || [];
    const patch = (p: Partial<Activity>) => setItem(a => ({ ...a, ...p }));
    const valid = Boolean(item.title?.trim());

    const reset = () => { setItem(blank()); setCost(''); setEditing(null); };
    const save = () => {
        if (!valid) return;
        set('activities', upsert(list, editing, { ...item, title: item.title!.trim(), cost: num(cost) }));
        reset();
    };
    const edit = (i: number) => { setItem({ ...list[i] }); setCost(costText(list[i].cost)); setEditing(i); };
    const remove = (i: number) => { set('activities', list.filter((_, j) => j !== i)); if (editing === i) reset(); else if (editing !== null && editing > i) setEditing(editing - 1); };

    return (
        <div className="flex flex-col gap-5">
            {list.length > 0 ? (
                <RpSection title={`Added (${list.length})`} icon={CalendarBlank}>
                    <ul className="flex flex-col gap-2 py-2">
                        {list.map((a, i) => (
                            <ItemRow
                                key={a.id || i}
                                active={editing === i}
                                logo={<span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-white"><CalendarBlank size={16} className="text-rp-muted" aria-hidden /></span>}
                                title={a.title || 'Activity'}
                                meta={[a.date ? formatDate(a.date, 'short') : '', a.time, a.location, a.cost != null && a.cost > 0 ? formatCurrency(a.cost) : ''].filter(Boolean).join(' · ')}
                                onEdit={() => edit(i)}
                                onRemove={() => remove(i)}
                                removeLabel={`Remove ${a.title}`}
                            />
                        ))}
                    </ul>
                </RpSection>
            ) : null}

            <RpSection title={editing !== null ? 'Edit activity' : list.length ? 'Add another' : 'Add an activity'} icon={editing !== null ? CalendarBlank : Plus}>
                <RpField label="Title">{id => <input id={id} value={item.title} onChange={e => patch({ title: e.target.value })} className={RP_FIELD} placeholder="Tea ceremony" autoComplete="off" />}</RpField>
                <div role="group" aria-label="Type of activity" className="flex flex-wrap gap-2 py-2">
                    {ACTIVITY_TYPES.map(t => <RpChip key={t} selected={item.type === t} onClick={() => patch({ type: t })}>{t}</RpChip>)}
                </div>
                <div className="grid gap-x-3 sm:grid-cols-2">
                    <RpField label="Date">{id => <input id={id} type="date" value={item.date} onChange={e => patch({ date: e.target.value })} className={DATE} />}</RpField>
                    <RpField label="Time">{id => <input id={id} type="time" value={item.time} onChange={e => patch({ time: e.target.value })} className={DATE} />}</RpField>
                    <RpField label="Where">{id => <input id={id} value={item.location} onChange={e => patch({ location: e.target.value })} className={RP_FIELD} autoComplete="off" />}</RpField>
                    <RpField label="Cost">{id => <input id={id} inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} className={cn(RP_FIELD, 'rp-tabular')} placeholder="0" autoComplete="off" />}</RpField>
                </div>
                <RpField label="Notes">{id => <textarea id={id} value={item.description} onChange={e => patch({ description: e.target.value })} rows={2} className={cn(RP_FIELD, 'resize-none py-2.5')} />}</RpField>
                <FormActions editing={editing !== null} valid={valid} addLabel="Add activity" onSave={save} onCancel={reset} />
            </RpSection>
        </div>
    );
};

/* ------------------------------------------------------------------ */
/* The sheet */
/* ------------------------------------------------------------------ */

const CREATE_STEPS = ['Trip basics', 'Transport', 'Stays'] as const;
const EDIT_STEPS = ['Basics', 'Transport', 'Stays', 'Activities'] as const;

const Stepper: React.FC<{ labels: readonly string[]; step: number; reached: number; onGo: (i: number) => void; numbered: boolean }> = ({ labels, step, reached, onGo, numbered }) => (
    <ol aria-label="Steps" className={cn('mb-5 flex items-center', numbered ? 'gap-2' : 'gap-1 sm:gap-2')}>
        {labels.map((label, i) => {
            const done = numbered && i < step;
            const active = i === step;
            return (
                <li key={label} className="flex min-w-0 flex-1 items-center">
                    <button
                        type="button"
                        aria-current={active ? 'step' : undefined}
                        disabled={i > reached}
                        onClick={() => onGo(i)}
                        className={cn(
                            'flex min-h-11 w-full min-w-0 items-center justify-center gap-2 rounded-full text-sm font-medium outline-none', numbered ? 'px-3' : 'px-1.5 sm:px-3', ' transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-rp-muted',
                            active ? 'bg-rp-ink text-rp-on-ink' : done ? 'bg-rp-green text-rp-paper' : 'bg-rp-inset text-rp-muted',
                            i > reached && 'opacity-60'
                        )}
                    >
                        {numbered ? (
                            <span className={cn('rp-tabular flex size-5 shrink-0 items-center justify-center rounded-full text-2xs font-semibold', active ? 'bg-rp-on-ink text-rp-ink' : done ? 'bg-rp-paper text-rp-green' : 'bg-rp-line text-rp-muted')}>
                                {done ? <Check size={12} aria-hidden /> : i + 1}
                            </span>
                        ) : null}
                        <span className="truncate">{label}</span>
                    </button>
                </li>
            );
        })}
    </ol>
);

export const TripSheet: React.FC<{
    target: TripSheetTarget | null;
    users: User[];
    entitlements: EntitlementType[];
    currentUserId?: string;
    brandfetchApiKey?: string;
    onClose: () => void;
    onSave: (draft: TripDraft, trip?: Trip) => Promise<void>;
    onDelete: (trip: Trip) => void;
    onOpenTrip: (trip: Trip) => void;
}> = ({ target, users, entitlements, currentUserId, brandfetchApiKey, onClose, onSave, onDelete, onOpenTrip }) => {
    const [draft, setDraft] = useState<TripDraft>(() => emptyDraft('Planning'));
    const [touched, setTouched] = useState(false);
    const [step, setStep] = useState(0);
    const [reached, setReached] = useState(0);

    useEffect(() => {
        if (!target) return;
        setTouched(false);
        setStep(target.kind === 'edit' ? target.step ?? 0 : 0);
        setReached(target.kind === 'edit' ? EDIT_STEPS.length - 1 : 0);
        setDraft(target.kind === 'edit'
            ? draftOf(target.trip)
            : { ...emptyDraft(BUCKET_STATUS[target.bucket]), participants: currentUserId ? [currentUserId] : [] });
    }, [target, currentUserId]);

    if (!target) return <RpSheet open={false} onClose={onClose} title="">{null}</RpSheet>;
    const editing = target.kind === 'edit' ? target.trip : undefined;
    const set: SetDraft = (key, value) => setDraft(d => ({ ...d, [key]: value }));

    const endError = Boolean(draft.startDate && draft.endDate && draft.endDate < draft.startDate);
    const basicsValid = Boolean(draft.name.trim() && draft.startDate && !endError);

    const go = (i: number) => {
        if (i > 0 && !basicsValid) { setTouched(true); setStep(0); return; }
        setStep(i);
        setReached(r => Math.max(r, i));
    };

    const save = async () => {
        setTouched(true);
        if (!basicsValid) { setStep(0); throw new Error('invalid'); }
        await onSave(draft, editing);
        onClose();
    };

    const pane = (
        <>
            {step === 0 ? (
                <Basics
                    draft={draft}
                    set={set}
                    users={users}
                    entitlements={entitlements}
                    showErrors={touched}
                    autoFocus={!editing}
                />
            ) : null}
            {step === 1 ? <TransportStep draft={draft} set={set} brandfetchApiKey={brandfetchApiKey} /> : null}
            {step === 2 ? <StaysStep draft={draft} set={set} brandfetchApiKey={brandfetchApiKey} /> : null}
            {step === 3 && editing ? <ActivitiesStep draft={draft} set={set} /> : null}
        </>
    );

    if (editing) {
        return (
            <RpSheet
                open
                onClose={onClose}
                title={editing.name}
                width={460}
                subtitle={(
                    <button type="button" onClick={() => onOpenTrip(editing)} className="inline-flex min-h-11 items-center gap-1 rounded-full text-sm text-rp-ink underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-rp-muted">
                        Open trip <ArrowUpRight size={14} aria-hidden />
                    </button>
                )}
                footer={
                    <>
                        <HoldButton onHoldComplete={() => onDelete(editing)} resetAfter={0}>Hold to delete</HoldButton>
                        <ParticleButton onClick={save} pendingLabel="Saving" successLabel="Saved" errorLabel="Check the details">Save</ParticleButton>
                    </>
                }
            >
                <Stepper labels={EDIT_STEPS} step={step} reached={reached} onGo={go} numbered={false} />
                {pane}
            </RpSheet>
        );
    }

    const last = step === CREATE_STEPS.length - 1;
    return (
        <RpSheet
            open
            onClose={onClose}
            title="New trip"
            subtitle={`Step ${step + 1} of ${CREATE_STEPS.length}${step > 0 ? ' · optional' : ''}`}
            width={460}
            footer={
                <>
                    {step > 0 ? (
                        <button type="button" onClick={() => go(step - 1)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-inset px-5 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted">
                            <ArrowLeft size={16} aria-hidden /> Back
                        </button>
                    ) : <span />}
                    {last ? (
                        <ParticleButton onClick={save} pendingLabel="Creating" successLabel="Created" errorLabel="Check the details">Create trip</ParticleButton>
                    ) : (
                        <button type="button" onClick={() => go(step + 1)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-ink px-5 text-sm font-medium text-rp-on-ink outline-none hover:bg-rp-ink/90 focus-visible:ring-2 focus-visible:ring-rp-muted">
                            Next <ArrowRight size={16} aria-hidden />
                        </button>
                    )}
                </>
            }
        >
            <Stepper labels={CREATE_STEPS} step={step} reached={reached} onGo={go} numbered />
            {pane}
        </RpSheet>
    );
};

/** Dropping a trip on the Delete zone ends here: a permanent delete always needs a hold. */
export const DeleteTripSheet: React.FC<{ trip: Trip | null; onClose: () => void; onConfirm: (trip: Trip) => void }> = ({ trip, onClose, onConfirm }) => (
    <RpSheet
        open={Boolean(trip)}
        onClose={onClose}
        title={trip ? `Delete ${trip.name}?` : ''}
        footer={
            trip ? (
                <>
                    <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center rounded-full bg-rp-inset px-5 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted">
                        Keep trip
                    </button>
                    <HoldButton onHoldComplete={() => onConfirm(trip)} resetAfter={0}>Hold to delete</HoldButton>
                </>
            ) : null
        }
    >
        <p className="text-sm text-rp-muted">Its stays, activities and packing list go with it. This can't be undone. To keep it, archive it instead.</p>
    </RpSheet>
);
