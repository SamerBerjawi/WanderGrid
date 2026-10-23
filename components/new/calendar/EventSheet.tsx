import React, { useEffect, useState } from 'react';
import type { CustomEvent } from '../../../types';
import ParticleButton from '../../kokonutui/particle-button';
import { RP_FIELD, RpField } from '../fields';
import { RpSheet, RpToggle } from '../ui';

/**
 * A one-day event on the calendar (a company offsite, a school day, a work Saturday). Whether it counts as
 * a working day is the only thing it changes: an event on a working day takes nothing off, one marked
 * "not a working day" is shown like a day off. Only admins can add or remove events (the server decides).
 */

const newId = () => `event-${crypto.randomUUID()}`;

export const EventSheet: React.FC<{
    open: boolean;
    /** The day the sheet was opened from, if any. */
    date?: string;
    today: string;
    onClose: () => void;
    onSave: (event: CustomEvent) => Promise<void>;
}> = ({ open, date, today, onClose, onSave }) => {
    const [name, setName] = useState('');
    const [day, setDay] = useState(date ?? today);
    const [working, setWorking] = useState(false);
    const [touched, setTouched] = useState(false);

    useEffect(() => {
        if (!open) return;
        setName('');
        setDay(date ?? today);
        setWorking(false);
        setTouched(false);
    }, [open, date, today]);

    const nameError = touched && !name.trim() ? 'Give the event a name.' : undefined;
    const dayError = touched && !/^\d{4}-\d{2}-\d{2}$/.test(day) ? 'Choose a day.' : undefined;

    const save = async () => {
        setTouched(true);
        if (!name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Check the details.');
        await onSave({ id: newId(), name: name.trim(), date: day, isWorkingDay: working });
        onClose();
    };

    return (
        <RpSheet
            open={open}
            onClose={onClose}
            title="Add an event"
            width={420}
            footer={<><span /><ParticleButton onClick={save} pendingLabel="Saving" successLabel="Added" errorLabel="Check the details">Add event</ParticleButton></>}
        >
            <div className="flex flex-col gap-2">
                <RpField label="Name" error={nameError}>
                    {id => <input id={id} value={name} onChange={e => setName(e.target.value)} placeholder="Company offsite" maxLength={80} autoComplete="off" className={RP_FIELD} />}
                </RpField>
                <RpField label="Day" error={dayError}>
                    {id => <input id={id} type="date" value={day} onChange={e => setDay(e.target.value)} className={RP_FIELD} />}
                </RpField>
                <RpToggle label="A working day" hint={working ? 'Shown as a normal day' : 'Shown like a day off'} checked={working} onChange={setWorking} />
            </div>
        </RpSheet>
    );
};
