import React, { useEffect, useMemo, useState } from 'react';
import type { SavedConfig, User } from '../../../types';
import type { SettingsData } from '../../../hooks/useSettingsData';
import { isFeatureEnabled } from '../../../config/featureFlags';
import { dataService } from '../../../services/mockDb';
import { formatDate } from '../../../utils/formatters';
import { errorMessage, toast } from '../../../services/toast';
import ParticleButton from '../../kokonutui/particle-button';
import { RpChip, RpEmpty, RpSection, RpSheet, RpToggle } from '../ui';
import { RP_FIELD, RpField } from '../fields';
import { Avatar } from '../member/Avatar';
import { RemoveMemberSheet } from '../member/MemberSheets';
import { CalendarBlank, Envelope, Key, Lock, Plus, Trash, User as UserIcon, Users } from '../../ui/hugeicons';
import { cn } from '../../../utils/cn';
import { card, CANCEL_BTN, PaneHeader, StatusChip } from './SettingsParts';

const SHOWN = 6;
const ROLES: User['role'][] = ['Admin', 'Partner', 'Child'];
const ROLE_TONE = { Admin: 'ink', Partner: 'green', Child: 'mustard' } as const;

/** A new member: the sign-in details, a role and a yearly allowance. The server decides the rest. */
const AddMemberSheet: React.FC<{ open: boolean; users: User[]; onClose: () => void; onAdd: (user: User) => Promise<void> }> = ({ open, users, onClose, onAdd }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<User['role']>('Partner');
    const [allowance, setAllowance] = useState(25);
    const [error, setError] = useState('');
    useEffect(() => { if (open) { setName(''); setEmail(''); setPassword(''); setRole('Partner'); setAllowance(25); setError(''); } }, [open]);

    const save = async () => {
        const fail = (message: string): never => { setError(message); throw new Error(message); };
        if (!name.trim()) fail('Name is required.');
        const finalEmail = email.trim().toLowerCase() || `${name.trim().toLowerCase().replace(/\s+/g, '.')}@wandergrid.local`;
        if (users.some(u => u.email?.toLowerCase().trim() === finalEmail)) fail(`Another member already uses ${finalEmail}.`);
        if (password.trim().length < 8) fail('Set a password of at least 8 characters so they can sign in.');
        setError('');
        try {
            await onAdd({
                id: 'u_' + Date.now(),
                name: name.trim(),
                email: finalEmail,
                password: password.trim(),
                profilePicture: '',
                role,
                leaveBalance: allowance,
                takenLeave: 0,
                allowance,
                policies: [],
                holidayConfigIds: [],
                holidayWeekendRule: 'none',
                activeYears: [new Date().getFullYear()],
            });
            onClose();
        } catch (e) {
            setError(errorMessage(e, "That didn't save. Try again."));
            throw e;
        }
    };

    return (
        <RpSheet
            open={open}
            onClose={onClose}
            title="Add member"
            footer={
                <>
                    <button type="button" onClick={onClose} className={CANCEL_BTN}>Cancel</button>
                    <ParticleButton onClick={save} successDuration={700} onError={() => undefined} pendingLabel="Adding" successLabel="Added" className="!min-h-11">Add member</ParticleButton>
                </>
            }
        >
            <RpSection title="Sign-in" icon={Lock}>
                <RpField label="Name" icon={UserIcon}>{id => <input id={id} value={name} onChange={e => setName(e.target.value)} className={RP_FIELD} autoComplete="off" autoFocus />}</RpField>
                <RpField label="Email" icon={Envelope}>{id => <input id={id} type="email" value={email} onChange={e => setEmail(e.target.value)} className={RP_FIELD} autoComplete="off" placeholder="Optional" />}</RpField>
                <RpField label="Password" icon={Lock}>{id => <input id={id} type="password" value={password} onChange={e => setPassword(e.target.value)} className={RP_FIELD} autoComplete="new-password" placeholder="8 or more characters" />}</RpField>
            </RpSection>
            <div className="mt-4">
                <RpSection title="Access" icon={Users}>
                    <div className="flex flex-col gap-1.5 py-1.5">
                        <span className="text-xs text-rp-muted" id="add-member-role">Role</span>
                        <div role="group" aria-labelledby="add-member-role" className="flex flex-wrap gap-2">
                            {ROLES.map(r => <RpChip key={r} selected={role === r} onClick={() => setRole(r)}>{r}</RpChip>)}
                        </div>
                    </div>
                    <RpField label="Leave days a year">
                        {id => <input id={id} type="number" inputMode="numeric" min={0} value={allowance} onChange={e => setAllowance(Math.max(0, Math.round(Number(e.target.value) || 0)))} className={cn(RP_FIELD, 'rp-tabular')} />}
                    </RpField>
                </RpSection>
            </div>
            {error ? <p role="alert" className="mt-3 text-sm text-rp-rust">{error}</p> : null}
        </RpSheet>
    );
};

/** Which saved holiday calendars count for a member. */
const HolidaysSheet: React.FC<{ member: User | null; configs: SavedConfig[]; onClose: () => void; onSave: (user: User) => Promise<void> }> = ({ member, configs, onClose, onSave }) => {
    const [ids, setIds] = useState<string[]>([]);
    useEffect(() => { if (member) setIds(member.holidayConfigIds ?? []); }, [member]);
    if (!member) return <RpSheet open={false} onClose={onClose} title="">{null}</RpSheet>;

    const toggle = async (id: string, on: boolean) => {
        const next = on ? [...ids, id] : ids.filter(x => x !== id);
        setIds(next);
        try {
            await onSave({ ...member, holidayConfigIds: next });
        } catch (e) {
            setIds(ids);
            toast.error(errorMessage(e, "That didn't save. Try again."));
        }
    };

    return (
        <RpSheet open onClose={onClose} title="Holiday calendars" subtitle={member.name}>
            {configs.length === 0 ? (
                <RpEmpty title="No holiday calendars">Add a country's holidays on the Calendar page first.</RpEmpty>
            ) : (
                <RpSection title="Countries" icon={CalendarBlank}>
                    {[...configs].sort((a, b) => a.countryName.localeCompare(b.countryName) || b.year - a.year).map(c => (
                        <RpToggle key={c.id} label={`${c.countryName} ${c.year}`} hint={`${c.holidays?.length ?? 0} holidays`} checked={ids.includes(c.id)} onChange={on => void toggle(c.id, on)} />
                    ))}
                </RpSection>
            )}
        </RpSheet>
    );
};

/** A one-time code an admin gives a member who forgot their password. */
const ResetCodeSheet: React.FC<{ info: { name: string; code: string; expiresAt: string } | null; onClose: () => void }> = ({ info, onClose }) => (
    <RpSheet
        open={Boolean(info)}
        onClose={onClose}
        title="Password reset code"
        subtitle={info?.name}
        footer={<button type="button" onClick={onClose} className={CANCEL_BTN}>Done</button>}
    >
        {info ? (
            <div className="flex flex-col gap-4">
                <p data-testid="reset-code" className="rounded-rp-inset bg-rp-inset py-5 text-center font-mono text-3xl font-semibold tracking-widest select-all">{info.code}</p>
                <p className="text-sm text-rp-muted">Give {info.name.split(' ')[0]} this code. They choose a new password from “Forgot password?” on the sign-in page. It works once and expires {formatDate(info.expiresAt, 'short-with-year')}.</p>
            </div>
        ) : null}
    </RpSheet>
);

export const MembersPane: React.FC<{ data: SettingsData; onOpenMember: (id: string) => void }> = ({ data, onOpenMember }) => {
    const { users, savedConfigs, isAdmin, sessionUserId } = data;
    const [adding, setAdding] = useState(false);
    const [holidays, setHolidays] = useState<User | null>(null);
    const [removing, setRemoving] = useState<User | null>(null);
    const [code, setCode] = useState<{ name: string; code: string; expiresAt: string } | null>(null);
    const [all, setAll] = useState(false);

    const sorted = useMemo(() => [...users].sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || a.name.localeCompare(b.name)), [users]);
    const shown = all ? sorted : sorted.slice(0, SHOWN);
    const canReset = isAdmin && isFeatureEnabled('AUDIT_PASSWORD_RESET');

    const issueCode = async (member: User) => {
        try {
            const { code: c, expiresAt } = await dataService.createPasswordResetCode(member.id);
            setCode({ name: member.name, code: c, expiresAt });
        } catch (e) {
            toast.error(`Couldn't create a reset code: ${errorMessage(e)}`);
        }
    };

    const iconBtn = 'flex size-11 shrink-0 items-center justify-center rounded-full text-rp-muted outline-none hover:bg-rp-line hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted';

    return (
        <section aria-label="Members">
            <PaneHeader
                icon={Users}
                title="Members"
                count={users.length}
                actions={isAdmin ? (
                    <button type="button" onClick={() => setAdding(true)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-ink px-5 text-sm font-medium text-rp-on-ink outline-none hover:bg-rp-ink/90 focus-visible:ring-2 focus-visible:ring-rp-muted focus-visible:ring-offset-2 focus-visible:ring-offset-rp-canvas">
                        <Plus size={16} aria-hidden /> Add member
                    </button>
                ) : undefined}
            />
            <div className={cn(card, 'p-2 sm:p-3')}>
                {users.length === 0 ? (
                    <RpEmpty title="No members yet" />
                ) : (
                    <ul className="flex flex-col">
                        {shown.map(u => (
                            <li key={u.id} className="flex min-h-14 items-center gap-1 rounded-rp-inset hover:bg-rp-inset">
                                <button type="button" onClick={() => onOpenMember(u.id)} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-rp-inset px-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-rp-muted sm:px-3" aria-label={`Open ${u.name}`}>
                                    <Avatar user={u} size={40} />
                                    <span className="min-w-0 flex-1">
                                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                            <span className="truncate text-sm font-medium">{u.name}</span>
                                            <StatusChip tone={ROLE_TONE[u.role]}>{u.role}</StatusChip>
                                            {u.id === sessionUserId ? <StatusChip tone="muted">You</StatusChip> : null}
                                            {u.passwordResetRequired ? <StatusChip tone="rust">Needs a password</StatusChip> : null}
                                        </span>
                                        <span className="block truncate text-xs text-rp-muted">{u.email || 'No email'}</span>
                                    </span>
                                </button>
                                {isAdmin ? (
                                    <span className="flex shrink-0 items-center pr-1">
                                        <button type="button" aria-label={`Holiday calendars for ${u.name}`} onClick={() => setHolidays(u)} className={iconBtn}><CalendarBlank size={16} aria-hidden /></button>
                                        {canReset ? <button type="button" aria-label={`Issue a password reset code for ${u.name}`} onClick={() => void issueCode(u)} className={iconBtn}><Key size={16} aria-hidden /></button> : null}
                                        {u.id !== sessionUserId ? <button type="button" aria-label={`Remove ${u.name}`} onClick={() => setRemoving(u)} className={cn(iconBtn, 'hover:!text-rp-rust')}><Trash size={16} aria-hidden /></button> : null}
                                    </span>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                )}
                {sorted.length > SHOWN ? (
                    <div className="flex justify-center pt-1">
                        <button type="button" onClick={() => setAll(v => !v)} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-rp-muted outline-none hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted">
                            {all ? 'Show fewer' : `Show all ${sorted.length}`}
                        </button>
                    </div>
                ) : null}
            </div>

            <AddMemberSheet open={adding} users={users} onClose={() => setAdding(false)} onAdd={data.addUser} />
            <HolidaysSheet member={holidays ? users.find(u => u.id === holidays.id) ?? holidays : null} configs={savedConfigs} onClose={() => setHolidays(null)} onSave={data.saveUser} />
            <RemoveMemberSheet
                member={removing}
                onClose={() => setRemoving(null)}
                onConfirm={async m => { await data.removeUser(m.id); setRemoving(null); toast.success(`${m.name} was removed`); }}
            />
            <ResetCodeSheet info={code} onClose={() => setCode(null)} />
        </section>
    );
};
