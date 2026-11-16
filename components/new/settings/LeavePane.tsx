import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { EntitlementType, LeaveAdjustment, LeaveEntry, User, UserPolicy } from '../../../types';
import type { SettingsData } from '../../../hooks/useSettingsData';
import { useLeaveRules } from '../../../hooks/useLeaveRules';
import { affectsCollections } from '../../../hooks/useWanderSync';
import { dataService } from '../../../services/mockDb';
import { errorMessage, toast } from '../../../services/toast';
import { balancesFor, carryOverExpiry, leaveYearLabel, yearStartOf, type TypeBalance } from '../../../utils/calendarModel';
import {
    LEAVE_CATEGORIES, LEAVE_COLORS, MONTH_LONG, adjustmentsOf, blankType, copyPolicies, describePolicy, newAdjustment, policyFor, policyFromType, policyProblem, policyYears,
    typeProblem, typeUsage, withPolicy, withoutPolicy,
} from '../../../utils/leaveSettings';
import { formatDate } from '../../../utils/formatters';
import { todayISO } from '../../../utils/tripsModel';
import ParticleButton from '../../kokonutui/particle-button';
import { RpChip, RpEmpty, RpIconButton, RpSection, RpSheet, RpToggle } from '../ui';
import { RpField } from '../fields';
import { useUndoToast } from '../UndoToast';
import { leaveColor } from '../member/MemberRing';
import { CalendarBlank, Clock, Copy, InfinityMark, Minus, PencilSimple, Plus, SunHorizon, Trash, Users, Warning } from '../../ui/hugeicons';
import { cn } from '../../../utils/cn';
import { attempt, card, CANCEL_BTN, FIELD, GHOST_BTN, PaneHeader } from './SettingsParts';

/**
 * Settings › Leave: the workspace's leave types (admins) and each member's allowance per type and year, with
 * carry-over and when carried days expire. Members set their own allowances; admins set anyone's. The figures
 * beside each allowance come from the calendar's own counting, so they match the Calendar and the Member page.
 */

type PolicyShape = Pick<UserPolicy, 'accrual' | 'carryOver' | 'isUnlimited'>;

const PRIMARY_BTN = 'inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-ink px-5 text-sm font-medium text-rp-on-ink outline-none hover:bg-rp-ink/90 focus-visible:ring-2 focus-visible:ring-rp-muted focus-visible:ring-offset-2 focus-visible:ring-offset-rp-canvas';
const days = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} ${Math.abs(n) === 1 ? 'day' : 'days'}`;
const num = (v: string) => (v.trim() === '' ? 0 : Number(v));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ------------------------------ the shared form ------------------------------ */

/** Allowance and carry-over, for a type's defaults and for one member's year. */
const PolicyFields: React.FC<{
    value: PolicyShape;
    onChange: (next: PolicyShape) => void;
    /** Types the unused days can carry into (the type itself comes first). */
    targets: EntitlementType[];
    selfId: string;
    /** The year whose days carry into the next one, for the expiry wording. */
    year?: number;
    /** The month the leave year starts (carried days expire counted from it). */
    yearStart?: number;
}> = ({ value, onChange, targets, selfId, year, yearStart = 1 }) => {
    const set = (patch: Partial<PolicyShape>) => onChange({ ...value, ...patch });
    const carry = (patch: Partial<PolicyShape['carryOver']>) => onChange({ ...value, carryOver: { ...value.carryOver, ...patch } });
    const [mm, dd] = String(value.carryOver.expiryValue || '03-31').split('-');
    const until = value.carryOver.enabled ? carryOverExpiry(value.carryOver, (year ?? new Date().getFullYear()) + 1, yearStart) : null;
    return (
        <>
            <RpSection title="Allowance" icon={SunHorizon}>
                <RpToggle label="Unlimited" hint="No balance to check against." icon={InfinityMark} checked={Boolean(value.isUnlimited)} onChange={v => set({ isUnlimited: v || undefined })} />
                {!value.isUnlimited ? (
                    <>
                        <div role="group" aria-label="How the days come" className="flex flex-wrap gap-2 py-1.5">
                            <RpChip selected={value.accrual.period !== 'monthly'} onClick={() => set({ accrual: { ...value.accrual, period: 'yearly' } })}>Each year</RpChip>
                            <RpChip selected={value.accrual.period === 'monthly'} onClick={() => set({ accrual: { ...value.accrual, period: 'monthly' } })}>Each month</RpChip>
                        </div>
                        <RpField label={value.accrual.period === 'monthly' ? 'Days a month' : 'Days a year'}>
                            {id => <input id={id} type="number" inputMode="decimal" min={0} step={0.5} value={value.accrual.amount} onChange={e => set({ accrual: { ...value.accrual, amount: num(e.target.value) } })} className={cn(FIELD, 'rp-tabular')} />}
                        </RpField>
                    </>
                ) : null}
            </RpSection>
            {!value.isUnlimited ? (
                <RpSection title="Unused days" icon={CalendarBlank}>
                    <RpToggle label="Carry over to next year" checked={value.carryOver.enabled} onChange={v => carry({ enabled: v, maxDays: v && !value.carryOver.maxDays ? 5 : value.carryOver.maxDays })} />
                    {value.carryOver.enabled ? (
                        <>
                            <RpField label="Most days carried">
                                {id => <input id={id} type="number" inputMode="decimal" min={0} step={0.5} value={value.carryOver.maxDays} onChange={e => carry({ maxDays: num(e.target.value) })} className={cn(FIELD, 'rp-tabular')} />}
                            </RpField>
                            {targets.length > 1 ? (
                                <div className="flex flex-col gap-1.5 py-1.5">
                                    <span id="carry-into" className="text-xs text-rp-muted">Carried into</span>
                                    <div role="group" aria-labelledby="carry-into" className="flex flex-wrap gap-2">
                                        {targets.map(t => (
                                            <RpChip key={t.id} selected={(value.carryOver.targetEntitlementId || selfId) === t.id} onClick={() => carry({ targetEntitlementId: t.id === selfId ? undefined : t.id })}>
                                                <span className={cn('size-2.5 rounded-full', leaveColor(t.color).dot)} aria-hidden />{t.id === selfId ? 'This type' : t.name}
                                            </RpChip>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                            <div className="flex flex-col gap-1.5 py-1.5">
                                <span id="carry-expiry" className="text-xs text-rp-muted">Carried days expire</span>
                                <div role="group" aria-labelledby="carry-expiry" className="flex flex-wrap gap-2">
                                    <RpChip selected={value.carryOver.expiryType === 'none'} onClick={() => carry({ expiryType: 'none', expiryValue: undefined })}>Never</RpChip>
                                    <RpChip selected={value.carryOver.expiryType === 'months'} onClick={() => carry({ expiryType: 'months', expiryValue: 3 })}>After some months</RpChip>
                                    <RpChip selected={value.carryOver.expiryType === 'fixed_date'} onClick={() => carry({ expiryType: 'fixed_date', expiryValue: '03-31' })}>On a date</RpChip>
                                </div>
                            </div>
                            {value.carryOver.expiryType === 'months' ? (
                                <RpField label="Months into the next leave year">
                                    {id => <input id={id} type="number" inputMode="numeric" min={1} max={24} value={Number(value.carryOver.expiryValue) || ''} onChange={e => carry({ expiryValue: num(e.target.value) })} className={cn(FIELD, 'rp-tabular')} />}
                                </RpField>
                            ) : null}
                            {value.carryOver.expiryType === 'fixed_date' ? (
                                <div className="grid grid-cols-2 gap-3">
                                    <RpField label="Day">
                                        {id => <input id={id} type="number" inputMode="numeric" min={1} max={31} value={Number(dd) || ''} onChange={e => carry({ expiryValue: `${mm || '03'}-${String(Math.min(31, Math.max(1, num(e.target.value) || 1))).padStart(2, '0')}` })} className={cn(FIELD, 'rp-tabular')} />}
                                    </RpField>
                                    <RpField label="Month">
                                        {id => (
                                            <select id={id} value={mm || '03'} onChange={e => carry({ expiryValue: `${e.target.value}-${dd || '31'}` })} className={FIELD}>
                                                {MONTHS.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
                                            </select>
                                        )}
                                    </RpField>
                                </div>
                            ) : null}
                            <p className="pb-1 text-xs text-rp-muted">
                                {until ? `Carried days are used first and are lost if not taken by ${formatDate(until, 'short-with-year')}.` : 'Carried days never expire.'}
                            </p>
                        </>
                    ) : null}
                </RpSection>
            ) : null}
        </>
    );
};

/* -------------------------------- leave types -------------------------------- */

const TypeSheet: React.FC<{
    open: boolean;
    type: EntitlementType | null;
    types: EntitlementType[];
    usage: number;
    onClose: () => void;
    onSave: (type: EntitlementType) => Promise<void>;
    onRemove: (type: EntitlementType) => Promise<void>;
}> = ({ open, type, types, usage, onClose, onSave, onRemove }) => {
    const [draft, setDraft] = useState<EntitlementType>(() => blankType());
    const [error, setError] = useState('');
    useEffect(() => {
        if (!open) return;
        setDraft(type ? { ...type, accrual: { ...type.accrual }, carryOver: { ...type.carryOver } } : blankType(types.some(t => t.category === 'Annual') ? 'Custom' : 'Annual'));
        setError('');
    }, [open, type, types]);
    const save = async () => {
        const problem = typeProblem(draft, types);
        if (problem) { setError(problem); throw new Error(problem); }
        setError('');
        try {
            await onSave({ ...draft, name: draft.name.trim() });
            onClose();
        } catch (e) {
            setError(errorMessage(e, "That didn't save. Try again."));
            throw e;
        }
    };
    const category = LEAVE_CATEGORIES.find(c => c.id === draft.category);
    return (
        <RpSheet
            open={open}
            onClose={onClose}
            title={type ? `Edit ${type.name}` : 'Add a leave type'}
            subtitle="The allowance here is the starting point for each member. Change it per member below."
            footer={
                <>
                    <button type="button" onClick={onClose} className={CANCEL_BTN}>Cancel</button>
                    <ParticleButton onClick={save} successDuration={700} onError={() => undefined} className="!min-h-11">{type ? 'Save changes' : 'Add type'}</ParticleButton>
                </>
            }
        >
            <div className="flex flex-col gap-5">
                <RpSection title="Type" icon={SunHorizon}>
                    <RpField label="Name">
                        {id => <input id={id} value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Annual leave" autoComplete="off" autoFocus={!type} className={FIELD} />}
                    </RpField>
                    <div className="flex flex-col gap-1.5 py-1.5">
                        <span id="type-kind" className="text-xs text-rp-muted">Kind</span>
                        <div role="group" aria-labelledby="type-kind" className="flex flex-wrap gap-2">
                            {LEAVE_CATEGORIES.map(c => <RpChip key={c.id} selected={draft.category === c.id} onClick={() => setDraft(d => ({ ...d, category: c.id }))}>{c.label}</RpChip>)}
                        </div>
                        {category ? <p className="text-xs text-rp-muted">{category.hint}</p> : null}
                    </div>
                    <div className="flex flex-col gap-1.5 py-1.5">
                        <span id="type-colour" className="text-xs text-rp-muted">Colour</span>
                        <div role="radiogroup" aria-labelledby="type-colour" className="flex flex-wrap gap-1">
                            {LEAVE_COLORS.map(c => (
                                <button
                                    key={c}
                                    type="button"
                                    role="radio"
                                    aria-checked={draft.color === c}
                                    aria-label={c}
                                    onClick={() => setDraft(d => ({ ...d, color: c }))}
                                    className="inline-flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-rp-muted"
                                >
                                    <span className={cn('size-6 rounded-full', leaveColor(c).dot, draft.color === c && 'ring-2 ring-rp-ink ring-offset-2 ring-offset-rp-surface')} />
                                </button>
                            ))}
                        </div>
                    </div>
                </RpSection>
                <RpSection title="Leave year" icon={Clock}>
                    <RpField label="The leave year starts in">
                        {id => (
                            <select id={id} value={draft.yearStartMonth || 1} onChange={e => setDraft(d => ({ ...d, yearStartMonth: Number(e.target.value) === 1 ? undefined : Number(e.target.value) }))} className={FIELD}>
                                {MONTH_LONG.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                            </select>
                        )}
                    </RpField>
                    <p className="pb-1 text-xs text-rp-muted">
                        {(draft.yearStartMonth || 1) > 1
                            ? `"${new Date().getFullYear()}" runs from ${MONTH_LONG[(draft.yearStartMonth || 1) - 1]} ${new Date().getFullYear()} to ${MONTH_LONG[(draft.yearStartMonth || 1) - 2]} ${new Date().getFullYear() + 1}.`
                            : 'Calendar years, January to December.'}
                    </p>
                </RpSection>
                <PolicyFields
                    value={{ accrual: draft.accrual, carryOver: draft.carryOver, isUnlimited: draft.isUnlimited }}
                    onChange={p => setDraft(d => ({ ...d, accrual: p.accrual, carryOver: p.carryOver, isUnlimited: p.isUnlimited }))}
                    targets={[draft, ...types.filter(t => t.id !== draft.id && !t.isUnlimited)]}
                    selfId={draft.id}
                    yearStart={draft.yearStartMonth || 1}
                />
                {error ? <p role="alert" className="text-sm text-rp-rust">{error}</p> : null}
                {type ? (
                    <div className="flex flex-col gap-1">
                        {usage > 0 ? <p className="text-xs text-rp-muted">{usage} leave {usage === 1 ? 'entry uses' : 'entries use'} this type. Removing it leaves them without a type.</p> : null}
                        <div>
                            <button type="button" onClick={() => { void onRemove(type).then(onClose); }} className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium text-rp-rust outline-none hover:bg-rp-rust/10 focus-visible:ring-2 focus-visible:ring-rp-muted">
                                <Trash size={16} aria-hidden /> Remove type
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>
        </RpSheet>
    );
};

/* ------------------------------ member allowances ----------------------------- */

const PolicySheet: React.FC<{
    open: boolean;
    member: User | undefined;
    type: EntitlementType | undefined;
    year: number;
    types: EntitlementType[];
    onClose: () => void;
    onSave: (policy: UserPolicy, adjustments: LeaveAdjustment[]) => Promise<void>;
    onRemove: () => Promise<void>;
}> = ({ open, member, type, year, types, onClose, onSave, onRemove }) => {
    const existing = member && type ? policyFor(member, type.id, year) : undefined;
    const [draft, setDraft] = useState<UserPolicy | null>(null);
    const [adjustments, setAdjustments] = useState<LeaveAdjustment[]>([]);
    const [adjDays, setAdjDays] = useState('');
    const [adjNote, setAdjNote] = useState('');
    const [error, setError] = useState('');
    useEffect(() => {
        if (!open || !type) return;
        setDraft(existing ? { ...existing, accrual: { ...existing.accrual }, carryOver: { ...existing.carryOver } } : policyFromType(type, year));
        setAdjustments(member ? adjustmentsOf(member, type.id, year) : []);
        setAdjDays('');
        setAdjNote('');
        setError('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, type?.id, year, member?.id]);
    if (!member || !type || !draft) return <RpSheet open={false} onClose={onClose} title="">{null}</RpSheet>;
    const save = async () => {
        const problem = policyProblem(draft);
        if (problem) { setError(problem); throw new Error(problem); }
        setError('');
        try {
            await onSave({ ...draft, isActive: true }, adjustments);
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
            title={`${type.name}, ${leaveYearLabel(year, yearStartOf(type))}`}
            subtitle={`${member.name.split(' ')[0]}'s allowance. Leave already booked is counted against it.`}
            footer={
                <>
                    <button type="button" onClick={onClose} className={CANCEL_BTN}>Cancel</button>
                    <ParticleButton onClick={save} successDuration={700} onError={() => undefined} className="!min-h-11">Save</ParticleButton>
                </>
            }
        >
            <div className="flex flex-col gap-5">
                <PolicyFields
                    value={draft}
                    onChange={p => setDraft(d => (d ? { ...d, ...p } : d))}
                    targets={[type, ...types.filter(t => t.id !== type.id && !t.isUnlimited)]}
                    selfId={type.id}
                    year={year}
                    yearStart={yearStartOf(type)}
                />
                <RpSection title="Balance changes" icon={Minus}>
                    <RpField label="Opening balance (days already there when the year starts)">
                        {id => <input id={id} type="number" inputMode="decimal" step={0.5} value={draft.openingBalance ?? ''} placeholder="0" onChange={e => setDraft(d => (d ? { ...d, openingBalance: e.target.value.trim() === '' ? undefined : Number(e.target.value) } : d))} className={cn(FIELD, 'rp-tabular')} />}
                    </RpField>
                    {adjustments.length > 0 ? (
                        <ul className="flex flex-col gap-1 py-1" aria-label="Adjustments">
                            {adjustments.map(a => (
                                <li key={a.id} className="flex min-h-11 items-center gap-2 rounded-rp-inset bg-rp-surface px-3">
                                    <span className={cn('rp-tabular shrink-0 text-sm font-medium', a.days < 0 ? 'text-rp-rust' : 'text-rp-green')}>{a.days > 0 ? '+' : '−'}{days(Math.abs(a.days))}</span>
                                    <span className="min-w-0 flex-1 truncate text-xs text-rp-muted">{a.note || 'Adjustment'}{a.date ? ` · ${formatDate(a.date, 'short')}` : ''}</span>
                                    <RpIconButton label={`Remove the adjustment of ${a.days} days`} tone="ghost" onClick={() => setAdjustments(list => list.filter(x => x.id !== a.id))}><Trash size={16} aria-hidden /></RpIconButton>
                                </li>
                            ))}
                        </ul>
                    ) : null}
                    <div className="grid grid-cols-[6.5rem_1fr] gap-2 py-1">
                        <RpField label="Days (+ or −)">
                            {id => <input id={id} type="number" inputMode="decimal" step={0.5} value={adjDays} placeholder="+1" onChange={e => setAdjDays(e.target.value)} className={cn(FIELD, 'rp-tabular')} />}
                        </RpField>
                        <RpField label="Why">
                            {id => <input id={id} value={adjNote} maxLength={200} placeholder="Bonus day, days taken elsewhere" onChange={e => setAdjNote(e.target.value)} className={FIELD} />}
                        </RpField>
                    </div>
                    <div className="pb-1">
                        <button
                            type="button"
                            disabled={!Number(adjDays)}
                            onClick={() => { setAdjustments(list => [...list, newAdjustment(type.id, year, Number(adjDays), adjNote, todayISO())]); setAdjDays(''); setAdjNote(''); }}
                            className={cn(GHOST_BTN, 'disabled:opacity-50')}
                        >
                            <Plus size={16} aria-hidden /> Add adjustment
                        </button>
                    </div>
                </RpSection>
                {error ? <p role="alert" className="text-sm text-rp-rust">{error}</p> : null}
                {existing ? (
                    <div>
                        <button type="button" onClick={() => { void onRemove().then(onClose); }} className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium text-rp-rust outline-none hover:bg-rp-rust/10 focus-visible:ring-2 focus-visible:ring-rp-muted">
                            <Trash size={16} aria-hidden /> Remove allowance for {year}
                        </button>
                    </div>
                ) : null}
            </div>
        </RpSheet>
    );
};

/** The balance line under an allowance: what is left, or over, and carry-over news. */
const balanceLine = (b: TypeBalance | undefined): { text: string; tone: 'muted' | 'rust' | 'ochre' } | null => {
    if (!b) return null;
    if (b.unlimited) return { text: `${days(b.used + b.planned + b.pending)} booked`, tone: 'muted' };
    if (b.remaining === null) return b.used + b.planned + b.pending > 0 ? { text: `${days(b.used + b.planned + b.pending)} booked, no allowance`, tone: 'ochre' } : null;
    const parts = [`${days(b.used)} taken`, `${days(b.planned)} planned`];
    if (b.pending > 0) parts.push(`${days(b.pending)} requested`);
    if (b.accrued !== null && b.total !== null && b.accrued < b.total) parts.push(`${days(b.accrued)} accrued so far`);
    if (b.opening !== 0) parts.push(`${days(b.opening)} opening`);
    if (b.adjusted !== 0) parts.push(`${b.adjusted > 0 ? '+' : '−'}${days(Math.abs(b.adjusted))} adjusted`);
    if (b.carryOver > 0) parts.push(`${days(b.carryOver)} carried over`);
    if (b.lieu > 0) parts.push(`${days(b.lieu)} in lieu`);
    if (b.expired > 0) parts.push(`${days(b.expired)} expired`);
    if (b.remaining < 0) return { text: `Over by ${days(-b.remaining)} · ${parts.join(' · ')}`, tone: 'rust' };
    if (b.expiring) return { text: `${days(b.remaining)} left · ${days(b.expiring.days)} expire ${formatDate(b.expiring.on, 'short')}`, tone: 'ochre' };
    return { text: `${days(b.remaining)} left · ${parts.join(' · ')}`, tone: 'muted' };
};

const WEEKEND_RULES: { id: NonNullable<User['holidayWeekendRule']>; label: string; hint: string }[] = [
    { id: 'none', label: 'No extra day', hint: 'A holiday on a weekend gives no extra day.' },
    { id: 'monday', label: 'Next working day', hint: 'A weekend holiday moves to the next free working day.' },
    { id: 'lieu', label: 'Day in lieu', hint: 'Each weekend holiday adds a day to take any time.' },
];

/* ----------------------------------- the pane ----------------------------------- */

export const LeavePane: React.FC<{ data: SettingsData }> = ({ data }) => {
    const undo = useUndoToast();
    const rules = useLeaveRules();
    const [types, setTypes] = useState<EntitlementType[]>([]);
    const [leave, setLeave] = useState<LeaveEntry[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [typeSheet, setTypeSheet] = useState<{ type: EntitlementType | null } | null>(null);
    const [policySheet, setPolicySheet] = useState<{ typeId: string } | null>(null);
    const thisYear = Number(todayISO().slice(0, 4));
    const [year, setYear] = useState(thisYear);
    const [memberId, setMemberId] = useState<string | null>(null);

    const load = useCallback(async () => {
        const [t, lv] = await Promise.all([
            dataService.getEntitlementTypes().catch(() => [] as EntitlementType[]),
            dataService.getLeave().catch(() => [] as LeaveEntry[]),
        ]);
        setTypes(t || []);
        setLeave(lv || []);
        setLoaded(true);
    }, []);
    useEffect(() => {
        void load();
        const onUpdate = (e: Event) => { if (affectsCollections(e, ['entitlements', 'leave'])) void load(); };
        window.addEventListener('wandergrid_db_updated', onUpdate);
        return () => window.removeEventListener('wandergrid_db_updated', onUpdate);
    }, [load]);

    // Admins pick anyone; everyone else sees their own allowances.
    const members = data.isAdmin ? data.users : data.users.filter(u => u.id === data.sessionUserId);
    const member = members.find(u => u.id === memberId) ?? members.find(u => u.id === data.sessionUserId) ?? members[0];
    const years = useMemo(() => policyYears(member ? [member] : [], thisYear), [member, thisYear]);

    const balances = useMemo(() => (member ? balancesFor({ user: member, leave, entitlements: types, today: todayISO(), ctx: rules.contextFor(member) }, year) : []), [member, leave, types, year, rules]);

    const saveType = async (type: EntitlementType) => {
        await dataService.saveEntitlementType(type);
        await load();
    };
    const removeType = async (type: EntitlementType) => {
        const ok = await attempt(async () => { await dataService.deleteEntitlementType(type.id); await load(); }, "The leave type couldn't be removed.");
        if (ok) undo.show(`Removed ${type.name}`, async () => { await dataService.saveEntitlementType(type); await load(); });
    };
    const savePolicy = async (policy: UserPolicy, adjustments: LeaveAdjustment[]) => {
        if (!member) return;
        const others = (member.leaveAdjustments || []).filter(a => !(a.entitlementId === policy.entitlementId && a.year === policy.year));
        await data.saveUser({ ...withPolicy(member, policy), leaveAdjustments: [...others, ...adjustments] });
    };
    const setWorkingWeek = (week: number[] | undefined) => {
        if (!member) return;
        void attempt(() => data.saveUser({ ...member, workingDays: week && week.length ? [...week].sort((a, b) => a - b) : undefined }));
    };
    const removePolicy = async (typeId: string) => {
        if (!member) return;
        const before = member;
        const ok = await attempt(() => data.saveUser(withoutPolicy(member, typeId, year)));
        if (ok) undo.show(`Removed the ${year} allowance`, async () => { await data.saveUser(before); });
    };
    const copyForward = async () => {
        if (!member) return;
        const out = copyPolicies(member, year, year + 1);
        if (out.copied === 0) {
            toast.info(out.kept > 0 ? `${year + 1} already has every allowance.` : `No allowances in ${year} to copy.`);
            return;
        }
        const ok = await attempt(() => data.saveUser(out.user));
        if (!ok) return;
        toast.success(`Copied ${out.copied} ${out.copied === 1 ? 'allowance' : 'allowances'} to ${year + 1}${out.kept ? `; ${out.kept} already set` : ''}`);
        setYear(year + 1);
    };
    const setWeekendRule = (rule: NonNullable<User['holidayWeekendRule']>) => {
        if (!member || (member.holidayWeekendRule || 'none') === rule) return;
        void attempt(() => data.saveUser({ ...member, holidayWeekendRule: rule }));
    };

    const policyType = types.find(t => t.id === policySheet?.typeId);
    const hasThisYear = Boolean(member && (member.policies || []).some(p => p.year === year));

    if (!loaded) return <div className={cn(card, 'h-64 animate-pulse')} aria-busy="true" />;

    return (
        <section aria-label="Leave" className="flex flex-col gap-6">
            <div>
                <PaneHeader
                    icon={SunHorizon}
                    title="Leave types"
                    count={types.length}
                    accent="text-rp-green"
                    actions={data.isAdmin ? <button type="button" onClick={() => setTypeSheet({ type: null })} className={PRIMARY_BTN}><Plus size={16} aria-hidden /> Add type</button> : undefined}
                />
                <div className={cn(card, 'p-2 sm:p-3')}>
                    {types.length === 0 ? (
                        <RpEmpty
                            title="No leave types yet"
                            action={data.isAdmin ? <button type="button" onClick={() => setTypeSheet({ type: null })} className={PRIMARY_BTN}><Plus size={16} aria-hidden /> Add annual leave</button> : undefined}
                        >
                            {data.isAdmin ? 'Add the kinds of leave you track: annual, time in lieu, sick or any other.' : 'An administrator adds the leave types.'}
                        </RpEmpty>
                    ) : (
                        <ul className="flex flex-col gap-1">
                            {types.map(t => {
                                const label = LEAVE_CATEGORIES.find(c => c.id === t.category)?.label ?? t.category;
                                const body = (
                                    <>
                                        <span className={cn('size-3 shrink-0 rounded-full', leaveColor(t.color).dot)} aria-hidden />
                                        <span className="flex min-w-0 flex-1 flex-col">
                                            <span className="truncate text-sm font-medium text-rp-ink">{t.name}</span>
                                            <span className="truncate text-xs text-rp-muted">{label} · {describePolicy(t)}</span>
                                        </span>
                                        {data.isAdmin ? <PencilSimple size={16} className="shrink-0 text-rp-muted" aria-hidden /> : null}
                                    </>
                                );
                                return (
                                    <li key={t.id}>
                                        {data.isAdmin ? (
                                            <button type="button" onClick={() => setTypeSheet({ type: t })} aria-label={`Edit ${t.name}`} className="flex min-h-14 w-full items-center gap-3 rounded-rp-inset px-3 text-left outline-none hover:bg-rp-inset focus-visible:ring-2 focus-visible:ring-rp-muted">{body}</button>
                                        ) : (
                                            <div className="flex min-h-14 items-center gap-3 px-3">{body}</div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>

            {types.length > 0 && member ? (
                <div>
                    <PaneHeader
                        icon={Users}
                        title={data.isAdmin && members.length > 1 ? 'Allowances' : 'My allowances'}
                        accent="text-rp-navy"
                        actions={hasThisYear ? (
                            <ParticleButton variant="inset" onClick={copyForward} successDuration={900} onError={() => undefined} pendingLabel="Copying" successLabel="Copied" errorLabel="Try again" icon={<Copy aria-hidden />}>
                                Copy to {year + 1}
                            </ParticleButton>
                        ) : undefined}
                    />
                    <div className={cn(card, 'flex flex-col gap-3 p-3 sm:p-4')}>
                        {members.length > 1 ? (
                            <div role="group" aria-label="Member" className="flex flex-wrap gap-2">
                                {members.map(m => <RpChip key={m.id} selected={m.id === member.id} onClick={() => setMemberId(m.id)}>{m.name.split(' ')[0]}</RpChip>)}
                            </div>
                        ) : null}
                        <div role="group" aria-label="Year" className="-m-3 flex gap-2 overflow-x-auto p-3 [scrollbar-width:none]">
                            {years.map(y => <RpChip key={y} selected={y === year} onClick={() => setYear(y)} className="rp-tabular">{y}</RpChip>)}
                        </div>
                        <ul className="flex flex-col gap-1">
                            {types.map(t => {
                                const p = policyFor(member, t.id, year);
                                const line = balanceLine(balances.find(b => b.entitlement.id === t.id));
                                return (
                                    <li key={t.id}>
                                        <button
                                            type="button"
                                            onClick={() => setPolicySheet({ typeId: t.id })}
                                            aria-label={`${t.name} in ${year}: ${p ? describePolicy(p) : 'not set'}. Edit`}
                                            className="flex min-h-14 w-full items-center gap-3 rounded-rp-inset bg-rp-inset/60 px-3 py-2 text-left outline-none hover:bg-rp-inset focus-visible:ring-2 focus-visible:ring-rp-muted"
                                        >
                                            <span className={cn('size-3 shrink-0 rounded-full', leaveColor(t.color).dot)} aria-hidden />
                                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                                <span className="flex flex-wrap items-baseline gap-x-2">
                                                    <span className="text-sm font-medium text-rp-ink">{t.name}{yearStartOf(t) > 1 ? <span className="rp-tabular font-normal text-rp-muted"> · {leaveYearLabel(year, yearStartOf(t))}</span> : null}</span>
                                                    <span className="text-xs text-rp-muted">{p ? describePolicy(p) : 'Not set'}</span>
                                                </span>
                                                {line ? (
                                                    <span className={cn('rp-tabular flex items-center gap-1 text-xs', line.tone === 'rust' ? 'text-rp-rust' : line.tone === 'ochre' ? 'text-rp-ochre' : 'text-rp-muted')}>
                                                        {line.tone !== 'muted' ? <Warning size={12} aria-hidden /> : null}{line.text}
                                                    </span>
                                                ) : null}
                                            </span>
                                            {p ? <PencilSimple size={16} className="shrink-0 text-rp-muted" aria-hidden /> : <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-rp-ink"><Plus size={14} aria-hidden /> Set</span>}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                        <div className="flex flex-col gap-1.5 border-t border-rp-line pt-3">
                            <span id="working-week" className="text-xs text-rp-muted">Working week</span>
                            <div role="group" aria-labelledby="working-week" className="flex flex-wrap gap-1.5">
                                {[1, 2, 3, 4, 5, 6, 0].map(d => {
                                    const week = member.workingDays && member.workingDays.length ? member.workingDays : rules.workingDays;
                                    const on = week.includes(d);
                                    return (
                                        <RpChip key={d} selected={on} onClick={() => setWorkingWeek(on ? week.filter(x => x !== d) : [...week, d])} className="w-14 justify-center px-0">
                                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]}
                                        </RpChip>
                                    );
                                })}
                            </div>
                            <p className="text-xs text-rp-muted">
                                {member.workingDays && member.workingDays.length ? (
                                    <>Days off outside these cost no leave.{' '}<button type="button" onClick={() => setWorkingWeek(undefined)} className="inline-flex min-h-11 items-center font-medium text-rp-ink underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-rp-muted">Use the workspace's week</button></>
                                ) : 'The workspace\'s week. Change it for someone who works part time.'}
                            </p>
                        </div>
                        <div className="flex flex-col gap-1.5 border-t border-rp-line pt-3">
                            <span id="weekend-rule" className="text-xs text-rp-muted">Public holidays on a weekend</span>
                            <div role="group" aria-labelledby="weekend-rule" className="flex flex-wrap gap-2">
                                {WEEKEND_RULES.map(r => <RpChip key={r.id} selected={(member.holidayWeekendRule || 'none') === r.id} onClick={() => setWeekendRule(r.id)}>{r.label}</RpChip>)}
                            </div>
                            <p className="text-xs text-rp-muted">{WEEKEND_RULES.find(r => r.id === (member.holidayWeekendRule || 'none'))?.hint}</p>
                        </div>
                        <div className="border-t border-rp-line pt-1">
                            <RpToggle
                                label="Track requests and approvals"
                                hint={member.leaveApproval ? 'Leave is Requested, then Approved or Rejected. Requests count as pending.' : 'Leave is Planned or Confirmed. Turn on if an employer approves it.'}
                                checked={Boolean(member.leaveApproval)}
                                onChange={on => { void attempt(() => data.saveUser({ ...member, leaveApproval: on || undefined })); }}
                            />
                        </div>
                        {!data.isAdmin ? <p className="text-xs text-rp-muted">Set these to match your contract. An administrator can change them too.</p> : null}
                    </div>
                </div>
            ) : null}

            {data.isAdmin ? (
                <TypeSheet
                    open={typeSheet !== null}
                    type={typeSheet?.type ?? null}
                    types={types}
                    usage={typeSheet?.type ? typeUsage(leave, typeSheet.type.id) : 0}
                    onClose={() => setTypeSheet(null)}
                    onSave={saveType}
                    onRemove={removeType}
                />
            ) : null}
            <PolicySheet
                open={policySheet !== null}
                member={member}
                type={policyType}
                year={year}
                types={types}
                onClose={() => setPolicySheet(null)}
                onSave={savePolicy}
                onRemove={() => removePolicy(policySheet?.typeId ?? '')}
            />
        </section>
    );
};

