import React, { useEffect, useState } from 'react';
import type { Accommodation, Transport, Trip, TransportMode, User } from '../../../types';
import type { TripDraft } from '../../../hooks/useTripsData';
import { BUCKET_STATUS, type TripBucket } from '../../../utils/tripsModel';
import { formatCurrency, formatDate } from '../../../utils/formatters';
import HoldButton from '../../kokonutui/hold-button';
import ParticleButton from '../../kokonutui/particle-button';
import {
    Airplane, ArrowLeft, ArrowRight, ArrowUpRight, Bed, Boat, Bus, CalendarBlank, Car, CarProfile, Check, CheckCircle, Clock, MapPin, Palette, Plus,
    Suitcase, Train, Users, X, type Icon,
} from '../../ui/hugeicons';
import { RP_FIELD, RpField } from '../fields';
import { IconPicker } from '../IconPicker';
import { RpHugeicon } from '../RpHugeicon';
import { stayIcon } from './stayIcon';
import { STAY_ACCENT, TRANSPORT_ACCENT } from './accents';
import { RpChip, RpIconButton, RpLogo, RpSection, RpSheet } from '../ui';
import { cn } from '../../../utils/cn';

/**
 * Sheets of the New Trips page: a three-step New trip flow (Trip basics, Transport, Stays), a single
 * editing sheet, and the delete confirmation.
 */

export type TripSheetTarget = { kind: 'create'; bucket: TripBucket } | { kind: 'edit'; trip: Trip };

const STATUS_CHOICES: { status: Trip['status']; label: string; icon: Icon; on: string }[] = [
    { status: 'Planning', label: 'Planned', icon: Clock, on: 'bg-rp-mustard text-rp-on-mustard hover:bg-rp-mustard' },
    { status: 'Upcoming', label: 'Confirmed', icon: Suitcase, on: 'bg-rp-green text-rp-paper hover:bg-rp-green' },
    { status: 'Past', label: 'Past', icon: CheckCircle, on: 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink' },
];

const MODES: { mode: TransportMode; label: string; icon: Icon; number: string }[] = [
    { mode: 'Flight', label: 'Flight', icon: Airplane, number: 'Flight number' },
    { mode: 'Train', label: 'Train', icon: Train, number: 'Train number' },
    { mode: 'Bus', label: 'Bus', icon: Bus, number: 'Route number' },
    { mode: 'Car Rental', label: 'Car rental', icon: Car, number: 'Booking number' },
    { mode: 'Personal Car', label: 'Own car', icon: CarProfile, number: 'Plate' },
    { mode: 'Cruise', label: 'Cruise', icon: Boat, number: 'Booking number' },
    { mode: 'Ferry', label: 'Ferry', icon: Boat, number: 'Booking number' },
];

const STAY_TYPES: Accommodation['type'][] = ['Hotel', 'Airbnb', 'Resort', 'Villa', 'Apartment', 'Hostel', 'Campground', 'Friends/Family'];

const emptyDraft = (status: Trip['status']): TripDraft => ({
    name: '', destination: '', startDate: '', endDate: '', status, participants: [], notes: '', icon: undefined, transports: [], stays: [],
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
});

const num = (v: string): number | undefined => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
};
const DATE = cn(RP_FIELD, 'rp-date rp-tabular');

type SetDraft = <K extends keyof TripDraft>(key: K, value: TripDraft[K]) => void;

/* ------------------------------------------------------------------ */
/* Step 1 / editing: the basics */
/* ------------------------------------------------------------------ */

const Basics: React.FC<{ draft: TripDraft; set: SetDraft; users: User[]; showErrors: boolean; autoFocus: boolean }> = ({ draft, set, users, showErrors, autoFocus }) => {
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
                    {id => <input id={id} value={draft.destination} onChange={e => set('destination', e.target.value)} className={RP_FIELD} autoComplete="off" placeholder="Lisbon, Portugal" />}
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
/* Step 2: transport */
/* ------------------------------------------------------------------ */

const modeOf = (mode?: TransportMode) => MODES.find(m => m.mode === mode) ?? MODES[0];

const ADD_BUTTON = 'mt-2 mb-1 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-rp-ink px-5 text-sm font-medium text-rp-on-ink outline-none transition-opacity hover:bg-rp-ink/90 focus-visible:ring-2 focus-visible:ring-rp-muted disabled:opacity-40';

const TransportStep: React.FC<{ draft: TripDraft; set: SetDraft; brandfetchApiKey?: string }> = ({ draft, set, brandfetchApiKey }) => {
    const blank = (): Partial<Transport> => ({
        mode: 'Flight', origin: '', destination: '', departureDate: draft.startDate, departureTime: '10:00',
        arrivalDate: draft.startDate, arrivalTime: '14:00', provider: '', identifier: '', confirmationCode: '',
    });
    const [leg, setLeg] = useState<Partial<Transport>>(blank);
    const [cost, setCost] = useState('');
    const list = draft.transports || [];
    const m = modeOf(leg.mode);
    const patch = (p: Partial<Transport>) => setLeg(l => ({ ...l, ...p }));
    const valid = Boolean(leg.origin?.trim() && leg.destination?.trim());

    const add = () => {
        if (!valid) return;
        set('transports', [...list, { ...leg, origin: leg.origin!.trim(), destination: leg.destination!.trim(), cost: num(cost) }]);
        setLeg(blank());
        setCost('');
    };

    return (
        <div className="flex flex-col gap-5">
            {list.length > 0 ? (
                <RpSection title={`Added (${list.length})`} icon={Airplane}>
                    <ul className="flex flex-col gap-2 py-2">
                        {list.map((t, i) => {
                            const tm = modeOf(t.mode);
                            return (
                                <li key={i} className="flex items-center gap-3 rounded-rp-inset bg-rp-surface py-1.5 pr-1 pl-3">
                                    <RpLogo name={t.provider} brandfetchApiKey={brandfetchApiKey} fallback={tm.icon} iconClassName={TRANSPORT_ACCENT} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-medium text-rp-ink">{t.origin} → {t.destination}</span>
                                        <span className="block truncate text-xs text-rp-muted">
                                            {[t.provider, t.departureDate ? formatDate(t.departureDate, 'short') : '', t.cost != null ? formatCurrency(t.cost) : ''].filter(Boolean).join(' · ') || tm.label}
                                        </span>
                                    </span>
                                    <RpIconButton label={`Remove ${t.origin} to ${t.destination}`} tone="ghost" onClick={() => set('transports', list.filter((_, j) => j !== i))}><X size={18} /></RpIconButton>
                                </li>
                            );
                        })}
                    </ul>
                </RpSection>
            ) : null}

            <RpSection title={list.length ? 'Add another' : 'Add a flight, train or ride'} icon={Plus}>
                <div role="group" aria-label="Type of transport" className="flex flex-wrap gap-2 py-2">
                    {MODES.map(o => (
                        <RpChip key={o.mode} selected={leg.mode === o.mode} onClick={() => patch({ mode: o.mode })}><o.icon size={16} aria-hidden /> {o.label}</RpChip>
                    ))}
                </div>
                <div className="grid gap-x-3 sm:grid-cols-2">
                    <RpField label="From">{id => <input id={id} value={leg.origin} onChange={e => patch({ origin: e.target.value })} className={RP_FIELD} placeholder={leg.mode === 'Flight' ? 'AMS' : 'Amsterdam'} autoComplete="off" />}</RpField>
                    <RpField label="To">{id => <input id={id} value={leg.destination} onChange={e => patch({ destination: e.target.value })} className={RP_FIELD} placeholder={leg.mode === 'Flight' ? 'LIS' : 'Lisbon'} autoComplete="off" />}</RpField>
                    <RpField label="Departs">{id => <input id={id} type="date" value={leg.departureDate} onChange={e => patch({ departureDate: e.target.value, arrivalDate: leg.arrivalDate && leg.arrivalDate >= e.target.value ? leg.arrivalDate : e.target.value })} className={DATE} />}</RpField>
                    <RpField label="Departure time">{id => <input id={id} type="time" value={leg.departureTime} onChange={e => patch({ departureTime: e.target.value })} className={DATE} />}</RpField>
                    <RpField label="Arrives">{id => <input id={id} type="date" value={leg.arrivalDate} min={leg.departureDate || undefined} onChange={e => patch({ arrivalDate: e.target.value })} className={DATE} />}</RpField>
                    <RpField label="Arrival time">{id => <input id={id} type="time" value={leg.arrivalTime} onChange={e => patch({ arrivalTime: e.target.value })} className={DATE} />}</RpField>
                </div>
                <RpField label={leg.mode === 'Flight' ? 'Airline' : 'Operator'}>
                    {id => (
                        <div className="flex items-center gap-2">
                            <RpLogo name={leg.provider} brandfetchApiKey={brandfetchApiKey} fallback={m.icon} iconClassName={TRANSPORT_ACCENT} />
                            <input id={id} value={leg.provider} onChange={e => patch({ provider: e.target.value })} className={RP_FIELD} placeholder={leg.mode === 'Flight' ? 'KLM' : ''} autoComplete="off" />
                        </div>
                    )}
                </RpField>
                <div className="grid gap-x-3 sm:grid-cols-2">
                    <RpField label={m.number}>{id => <input id={id} value={leg.identifier} onChange={e => patch({ identifier: e.target.value })} className={RP_FIELD} autoComplete="off" />}</RpField>
                    <RpField label="Confirmation">{id => <input id={id} value={leg.confirmationCode} onChange={e => patch({ confirmationCode: e.target.value })} className={RP_FIELD} autoComplete="off" />}</RpField>
                </div>
                <RpField label="Cost">{id => <input id={id} inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} className={cn(RP_FIELD, 'rp-tabular')} placeholder="0" autoComplete="off" />}</RpField>
                <button type="button" onClick={add} disabled={!valid} className={ADD_BUTTON}><Plus size={16} aria-hidden /> Add transport</button>
            </RpSection>
        </div>
    );
};

/* ------------------------------------------------------------------ */
/* Step 3: stays */
/* ------------------------------------------------------------------ */

const StaysStep: React.FC<{ draft: TripDraft; set: SetDraft; brandfetchApiKey?: string }> = ({ draft, set, brandfetchApiKey }) => {
    const blank = (): Partial<Accommodation> => ({
        name: '', type: 'Hotel', address: draft.destination, checkInDate: draft.startDate, checkInTime: '15:00',
        checkOutDate: draft.endDate || draft.startDate, checkOutTime: '11:00', confirmationCode: '',
    });
    const [stay, setStay] = useState<Partial<Accommodation>>(blank);
    const [cost, setCost] = useState('');
    const list = draft.stays || [];
    const patch = (p: Partial<Accommodation>) => setStay(s => ({ ...s, ...p }));
    const valid = Boolean(stay.name?.trim());

    const add = () => {
        if (!valid) return;
        set('stays', [...list, { ...stay, name: stay.name!.trim(), cost: num(cost) }]);
        setStay(blank());
        setCost('');
    };

    return (
        <div className="flex flex-col gap-5">
            {list.length > 0 ? (
                <RpSection title={`Added (${list.length})`} icon={Bed}>
                    <ul className="flex flex-col gap-2 py-2">
                        {list.map((a, i) => (
                            <li key={i} className="flex items-center gap-3 rounded-rp-inset bg-rp-surface py-1.5 pr-1 pl-3">
                                <RpLogo name={a.name} brandfetchApiKey={brandfetchApiKey} fallback={stayIcon(a.type)} iconClassName={STAY_ACCENT} />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-rp-ink">{a.name}</span>
                                    <span className="block truncate text-xs text-rp-muted">
                                        {[a.type, a.checkInDate && a.checkOutDate ? `${formatDate(a.checkInDate, 'short')} – ${formatDate(a.checkOutDate, 'short')}` : '', a.cost != null ? formatCurrency(a.cost) : ''].filter(Boolean).join(' · ')}
                                    </span>
                                </span>
                                <RpIconButton label={`Remove ${a.name}`} tone="ghost" onClick={() => set('stays', list.filter((_, j) => j !== i))}><X size={18} /></RpIconButton>
                            </li>
                        ))}
                    </ul>
                </RpSection>
            ) : null}

            <RpSection title={list.length ? 'Add another' : 'Add a place to stay'} icon={Plus}>
                <RpField label="Name">
                    {id => (
                        <div className="flex items-center gap-2">
                            <RpLogo name={stay.name} brandfetchApiKey={brandfetchApiKey} fallback={stayIcon(stay.type)} iconClassName={STAY_ACCENT} />
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
                <button type="button" onClick={add} disabled={!valid} className={ADD_BUTTON}><Plus size={16} aria-hidden /> Add stay</button>
            </RpSection>
        </div>
    );
};

/* ------------------------------------------------------------------ */
/* The sheet */
/* ------------------------------------------------------------------ */

const STEPS = ['Trip basics', 'Transport', 'Stays'] as const;

const Stepper: React.FC<{ step: number; reached: number; onGo: (i: number) => void }> = ({ step, reached, onGo }) => (
    <ol aria-label="Steps" className="mb-5 flex items-center gap-2">
        {STEPS.map((label, i) => {
            const done = i < step;
            const active = i === step;
            return (
                <li key={label} className="flex min-w-0 flex-1 items-center">
                    <button
                        type="button"
                        aria-current={active ? 'step' : undefined}
                        disabled={i > reached}
                        onClick={() => onGo(i)}
                        className={cn(
                            'flex min-h-11 w-full min-w-0 items-center justify-center gap-2 rounded-full px-3 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-rp-muted',
                            active ? 'bg-rp-ink text-rp-on-ink' : done ? 'bg-rp-green text-rp-paper' : 'bg-rp-inset text-rp-muted',
                            i > reached && 'opacity-60'
                        )}
                    >
                        <span className={cn('rp-tabular flex size-5 shrink-0 items-center justify-center rounded-full text-2xs font-semibold', active ? 'bg-rp-on-ink text-rp-ink' : done ? 'bg-rp-paper text-rp-green' : 'bg-rp-line text-rp-muted')}>
                            {done ? <Check size={12} aria-hidden /> : i + 1}
                        </span>
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
    currentUserId?: string;
    brandfetchApiKey?: string;
    onClose: () => void;
    onSave: (draft: TripDraft, trip?: Trip) => Promise<void>;
    onDelete: (trip: Trip) => void;
    onOpenTrip: (trip: Trip) => void;
}> = ({ target, users, currentUserId, brandfetchApiKey, onClose, onSave, onDelete, onOpenTrip }) => {
    const [draft, setDraft] = useState<TripDraft>(() => emptyDraft('Planning'));
    const [touched, setTouched] = useState(false);
    const [step, setStep] = useState(0);
    const [reached, setReached] = useState(0);

    useEffect(() => {
        if (!target) return;
        setTouched(false);
        setStep(0);
        setReached(0);
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
        if (i > 0 && !basicsValid) { setTouched(true); return; }
        setStep(i);
        setReached(r => Math.max(r, i));
    };

    const save = async () => {
        setTouched(true);
        if (!basicsValid) { setStep(0); throw new Error('invalid'); }
        await onSave(draft, editing);
        onClose();
    };

    if (editing) {
        return (
            <RpSheet
                open
                onClose={onClose}
                title={editing.name}
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
                <Basics draft={draft} set={set} users={users} showErrors={touched} autoFocus={false} />
            </RpSheet>
        );
    }

    const last = step === STEPS.length - 1;
    return (
        <RpSheet
            open
            onClose={onClose}
            title="New trip"
            subtitle={`Step ${step + 1} of ${STEPS.length}${step > 0 ? ' · optional' : ''}`}
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
            <Stepper step={step} reached={reached} onGo={go} />
            {step === 0 ? <Basics draft={draft} set={set} users={users} showErrors={touched} autoFocus /> : null}
            {step === 1 ? <TransportStep draft={draft} set={set} brandfetchApiKey={brandfetchApiKey} /> : null}
            {step === 2 ? <StaysStep draft={draft} set={set} brandfetchApiKey={brandfetchApiKey} /> : null}
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
