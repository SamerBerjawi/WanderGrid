import React, { useEffect, useState } from 'react';
import type { Trip, User } from '../../../types';
import type { TripDraft } from '../../../hooks/useTripsData';
import { BUCKET_STATUS, type TripBucket } from '../../../utils/tripsModel';
import HoldButton from '../../kokonutui/hold-button';
import ParticleButton from '../../kokonutui/particle-button';
import { ArrowUpRight, CalendarBlank, CheckCircle, Clock, MapPin, Suitcase, Users } from '../../ui/hugeicons';
import { RP_FIELD, RpField } from '../fields';
import { RpChip, RpSection, RpSheet } from '../ui';
import { cn } from '../../../utils/cn';

/** Sheets of the New Trips page: create or edit a trip, and confirm a delete. */

export type TripSheetTarget = { kind: 'create'; bucket: TripBucket } | { kind: 'edit'; trip: Trip };

const STATUS_CHOICES: { status: Trip['status']; label: string; icon: typeof Clock; on: string }[] = [
    { status: 'Planning', label: 'Planned', icon: Clock, on: 'bg-rp-mustard text-rp-on-mustard hover:bg-rp-mustard' },
    { status: 'Upcoming', label: 'Confirmed', icon: Suitcase, on: 'bg-rp-green text-rp-paper hover:bg-rp-green' },
    { status: 'Past', label: 'Past', icon: CheckCircle, on: 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink' },
];

const emptyDraft = (status: Trip['status']): TripDraft => ({ name: '', destination: '', startDate: '', endDate: '', status, participants: [], notes: '' });
const draftOf = (trip: Trip): TripDraft => ({
    name: trip.name,
    destination: trip.location || '',
    startDate: trip.startDate || '',
    endDate: trip.endDate || '',
    status: trip.status,
    participants: trip.participants || [],
    notes: trip.notes || '',
});

export const TripSheet: React.FC<{
    target: TripSheetTarget | null;
    users: User[];
    currentUserId?: string;
    onClose: () => void;
    onSave: (draft: TripDraft, trip?: Trip) => Promise<void>;
    onDelete: (trip: Trip) => void;
    onOpenTrip: (trip: Trip) => void;
}> = ({ target, users, currentUserId, onClose, onSave, onDelete, onOpenTrip }) => {
    const [draft, setDraft] = useState<TripDraft>(() => emptyDraft('Planning'));
    const [touched, setTouched] = useState(false);

    useEffect(() => {
        if (!target) return;
        setTouched(false);
        setDraft(target.kind === 'edit'
            ? draftOf(target.trip)
            : { ...emptyDraft(BUCKET_STATUS[target.bucket]), participants: currentUserId ? [currentUserId] : [] });
    }, [target, currentUserId]);

    if (!target) return <RpSheet open={false} onClose={onClose} title="">{null}</RpSheet>;
    const editing = target.kind === 'edit' ? target.trip : undefined;
    const set = <K extends keyof TripDraft>(key: K, value: TripDraft[K]) => setDraft(d => ({ ...d, [key]: value }));

    const nameError = touched && !draft.name.trim() ? 'Give the trip a name.' : undefined;
    const startError = touched && !draft.startDate ? 'Pick a start date.' : undefined;
    const endError = draft.startDate && draft.endDate && draft.endDate < draft.startDate ? 'The trip ends before it starts.' : undefined;
    const valid = Boolean(draft.name.trim() && draft.startDate && !endError);

    const save = async () => {
        setTouched(true);
        if (!valid) throw new Error('invalid');
        await onSave(draft, editing);
        onClose();
    };

    return (
        <RpSheet
            open
            onClose={onClose}
            title={editing ? editing.name : 'New trip'}
            subtitle={editing ? (
                <button type="button" onClick={() => onOpenTrip(editing)} className="inline-flex min-h-11 items-center gap-1 rounded-full text-sm text-rp-ink underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-rp-muted">
                    Open trip <ArrowUpRight size={14} aria-hidden />
                </button>
            ) : undefined}
            footer={
                <>
                    {editing ? (
                        <HoldButton onHoldComplete={() => onDelete(editing)} resetAfter={0}>Hold to delete</HoldButton>
                    ) : <span />}
                    <ParticleButton onClick={save} pendingLabel="Saving" successLabel="Saved" errorLabel="Check the details">
                        {editing ? 'Save' : 'Create trip'}
                    </ParticleButton>
                </>
            }
        >
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
                        {id => <input id={id} value={draft.name} onChange={e => set('name', e.target.value)} className={RP_FIELD} autoComplete="off" placeholder="Summer in Lisbon" autoFocus={!editing} />}
                    </RpField>
                    <RpField label="Destination">
                        {id => <input id={id} value={draft.destination} onChange={e => set('destination', e.target.value)} className={RP_FIELD} autoComplete="off" placeholder="Lisbon, Portugal" />}
                    </RpField>
                </RpSection>

                <RpSection title="Dates" icon={CalendarBlank}>
                    <div className="grid gap-x-3 sm:grid-cols-2">
                        <RpField label="Start" error={startError}>
                            {id => <input id={id} type="date" value={draft.startDate} onChange={e => set('startDate', e.target.value)} className={cn(RP_FIELD, 'rp-date rp-tabular')} />}
                        </RpField>
                        <RpField label="End" error={endError}>
                            {id => <input id={id} type="date" value={draft.endDate} min={draft.startDate || undefined} onChange={e => set('endDate', e.target.value)} className={cn(RP_FIELD, 'rp-date rp-tabular')} />}
                        </RpField>
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
