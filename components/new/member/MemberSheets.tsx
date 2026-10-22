import React, { useEffect, useRef, useState } from 'react';
import type { User } from '../../../types';
import { RpChip, RpSection, RpSheet } from '../ui';
import { RP_FIELD, RpField } from '../fields';
import HoldButton from '../../kokonutui/hold-button';
import ParticleButton from '../../kokonutui/particle-button';
import { Camera, Trash } from '../../ui/hugeicons';
import { errorMessage, toast } from '../../../services/toast';
import { cn } from '../../../utils/cn';
import { Avatar } from './Avatar';

/** Which part of the profile a sheet edits. */
export type MemberTopic = 'profile' | 'passport' | 'account' | 'leave';

export const TOPIC_TITLE: Record<MemberTopic, string> = { profile: 'Edit profile', passport: 'Passport', account: 'Change password', leave: 'Leave allowance' };

const DATE = cn(RP_FIELD, 'rp-date rp-tabular');
const ROLES: User['role'][] = ['Admin', 'Partner', 'Child'];

/** Avatars live inside the user record, so a photo is shrunk to a 512px JPEG (well under the 1 MB limit). */
const shrinkImage = (file: File): Promise<string> => new Promise((resolve, reject) => {
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) { reject(new Error('Choose a PNG, JPEG, WebP or GIF image.')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
        const scale = Math.min(1, 512 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That image could not be read.')); };
    img.src = url;
});

const toNumber = (v: string) => Math.max(0, Math.round(Number(v) || 0));

/** One sheet for every part of the profile; `topic` picks the fields. Saving goes through `onSave`. */
export const MemberSheet: React.FC<{
    member: User;
    topic: MemberTopic | null;
    isAdmin: boolean;
    isSelf: boolean;
    onClose: () => void;
    onSave: (next: User) => Promise<void>;
}> = ({ member, topic, isAdmin, isSelf, onClose, onSave }) => {
    const [draft, setDraft] = useState<User>(member);
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);

    // A fresh copy each time the sheet opens, so a cancelled edit never lingers.
    useEffect(() => {
        if (topic) { setDraft(member); setPassword(''); setError(''); }
    }, [topic, member]);

    const set = <K extends keyof User>(key: K, value: User[K]) => setDraft(d => ({ ...d, [key]: value }));
    const pickPhoto = async (file?: File) => {
        if (!file) return;
        try { set('profilePicture', await shrinkImage(file)); setError(''); } catch (e) { setError(errorMessage(e, 'That image could not be read.')); }
    };

    const save = async () => {
        if (!draft.name.trim()) { setError('Name is required.'); throw new Error('Name is required.'); }
        if (password.trim() && password.trim().length < 8) { setError('Password must be at least 8 characters.'); throw new Error('Password too short'); }
        setError('');
        try {
            await onSave({ ...draft, name: draft.name.trim(), password: password.trim() });
            onClose();
        } catch (e) {
            setError(errorMessage(e, "That didn't save. Try again."));
            throw e;
        }
    };

    return (
        <RpSheet
            open={topic !== null}
            onClose={onClose}
            title={topic ? TOPIC_TITLE[topic] : ''}
            subtitle={member.name}
            footer={
                <>
                    <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center rounded-full bg-rp-inset px-5 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted">
                        Cancel
                    </button>
                    <ParticleButton onClick={save} successDuration={700} onError={() => undefined} className="!min-h-11">Save changes</ParticleButton>
                </>
            }
        >
            <div className="flex flex-col gap-4">
                {topic === 'profile' ? (
                    <>
                        <div className="flex items-center gap-4">
                            <Avatar user={draft} size={72} />
                            <div className="flex flex-wrap gap-2">
                                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" tabIndex={-1} aria-label="Photo file" onChange={e => { void pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
                                <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-inset px-4 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted">
                                    <Camera size={16} aria-hidden /> {draft.profilePicture ? 'Change photo' : 'Add photo'}
                                </button>
                                {draft.profilePicture ? (
                                    <button type="button" onClick={() => set('profilePicture', '')} className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium text-rp-muted outline-none hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted">
                                        <Trash size={16} aria-hidden /> Remove
                                    </button>
                                ) : null}
                            </div>
                        </div>
                        <RpSection title="Profile">
                        <RpField label="Name">{id => <input id={id} value={draft.name} onChange={e => set('name', e.target.value)} className={RP_FIELD} autoComplete="name" autoFocus />}</RpField>
                        {isAdmin ? (
                            <div className="flex flex-col gap-1.5 py-1.5">
                                <span className="text-xs text-rp-muted" id="member-role-label">Role</span>
                                <div role="group" aria-labelledby="member-role-label" className="flex flex-wrap gap-2">
                                    {ROLES.map(r => <RpChip key={r} selected={draft.role === r} onClick={() => set('role', r)}>{r}</RpChip>)}
                                </div>
                                {isSelf && member.role === 'Admin' && draft.role !== 'Admin' ? <p className="text-xs text-rp-rust">You won't be able to manage members after this.</p> : null}
                            </div>
                        ) : null}
                        </RpSection>
                    </>
                ) : null}

                {topic === 'passport' ? (
                    <RpSection title="Passport">
                        <RpField label="Nationality">{id => <input id={id} value={draft.nationality || ''} onChange={e => set('nationality', e.target.value)} className={RP_FIELD} placeholder="Lebanese" autoComplete="off" />}</RpField>
                        <RpField label="Date of birth">{id => <input id={id} type="date" value={draft.dateOfBirth || ''} max={new Date().toISOString().slice(0, 10)} onChange={e => set('dateOfBirth', e.target.value)} className={DATE} />}</RpField>
                        <RpField label="Passport number">{id => <input id={id} value={draft.passportNumber || ''} onChange={e => set('passportNumber', e.target.value)} className={RP_FIELD} placeholder="RL1234567" autoComplete="off" />}</RpField>
                        <RpField label="Issued by">{id => <input id={id} value={draft.passportIssuingEntity || ''} onChange={e => set('passportIssuingEntity', e.target.value)} className={RP_FIELD} placeholder="General Security" autoComplete="off" />}</RpField>
                        <div className="grid grid-cols-2 gap-3">
                            <RpField label="Issued">{id => <input id={id} type="date" value={draft.passportIssueDate || ''} onChange={e => set('passportIssueDate', e.target.value)} className={DATE} />}</RpField>
                            <RpField label="Expires">{id => <input id={id} type="date" value={draft.passportExpiryDate || ''} min={draft.passportIssueDate || undefined} onChange={e => set('passportExpiryDate', e.target.value)} className={DATE} />}</RpField>
                        </div>
                    </RpSection>
                ) : null}

                {topic === 'account' ? (
                    <RpSection title="Password">
                        <RpField label="New password">
                            {id => <input id={id} type="password" value={password} onChange={e => setPassword(e.target.value)} className={RP_FIELD} autoComplete="new-password" placeholder="8 or more characters" autoFocus />}
                        </RpField>
                    </RpSection>
                ) : null}

                {topic === 'leave' ? (
                    <RpSection title="Per year">
                    <div className="grid grid-cols-2 gap-3">
                        <RpField label="Days a year">
                            {id => <input id={id} inputMode="numeric" type="number" min={0} value={draft.allowance ?? draft.leaveBalance ?? 0} onChange={e => setDraft(d => ({ ...d, allowance: toNumber(e.target.value), leaveBalance: toNumber(e.target.value) }))} className={cn(RP_FIELD, 'rp-tabular')} autoFocus />}
                        </RpField>
                        <RpField label="Days taken">
                            {id => <input id={id} inputMode="numeric" type="number" min={0} value={draft.takenLeave ?? 0} onChange={e => set('takenLeave', toNumber(e.target.value))} className={cn(RP_FIELD, 'rp-tabular')} />}
                        </RpField>
                    </div>
                    </RpSection>
                ) : null}

                {error ? <p role="alert" className="text-sm text-rp-rust">{error}</p> : null}
            </div>
        </RpSheet>
    );
};

/** Removing a member is permanent: a Hold button confirms it (decision 9), and there is no Undo. */
export const RemoveMemberSheet: React.FC<{ member: User | null; onClose: () => void; onConfirm: (member: User) => Promise<void> }> = ({ member, onClose, onConfirm }) => (
    <RpSheet
        open={Boolean(member)}
        onClose={onClose}
        title={member ? `Remove ${member.name}?` : ''}
        footer={
            member ? (
                <>
                    <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center rounded-full bg-rp-inset px-5 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted">
                        Keep member
                    </button>
                    <HoldButton
                        resetAfter={0}
                        onHoldComplete={() => { onConfirm(member).catch(e => toast.error(errorMessage(e, 'Could not remove this member.'))); }}
                    >
                        Hold to remove
                    </HoldButton>
                </>
            ) : null
        }
    >
        <p className="text-sm text-rp-muted">They lose access and their profile and leave settings are deleted. Their name stays on trips they were on. This can't be undone.</p>
    </RpSheet>
);
