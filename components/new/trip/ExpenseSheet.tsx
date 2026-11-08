import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Expense, User } from '../../../types';
import { CATEGORIES, COMMON_CURRENCIES, checkExpense, formatMoney } from '../../../utils/expenses';
import { getRate } from '../../../services/fxRates';
import { errorMessage } from '../../../services/toast';
import { formatDate } from '../../../utils/formatters';
import ParticleButton from '../../kokonutui/particle-button';
import { Trash } from '../../ui/hugeicons';
import { RpChip, RpSection, RpSheet } from '../ui';
import { RpField, RP_FIELD } from '../fields';
import { cn } from '../../../utils/cn';

/**
 * Add or edit one expense: what, how much and in which currency, the day (the exchange rate is the ECB's for that
 * day, filled in for you and yours to change), who paid, and who shares it equally or by amounts. The expense
 * keeps the rate it was saved with, so a later market move never changes what was spent.
 */

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `x-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
const first = (name: string) => name.split(/\s+/)[0] || name;
const today = () => new Date().toISOString().slice(0, 10);

export const ExpenseSheet: React.FC<{
    open: boolean;
    /** The expense being edited, or null to add one. */
    expense: Expense | null;
    members: User[];
    /** The currency the trip's ledger is totalled in. */
    ledger: string;
    /** Where a new expense starts: the day, the payer and the currency of the last one. */
    defaults: { date: string; currency: string; paidBy: string };
    onClose: () => void;
    onSave: (expense: Expense) => Promise<void>;
    onDelete?: (expense: Expense) => void;
}> = ({ open, expense, members, ledger, defaults, onClose, onSave, onDelete }) => {
    const ids = members.map(m => m.id);
    const [title, setTitle] = useState('');
    const [amount, setAmount] = useState('');
    const [currency, setCurrency] = useState(ledger);
    const [date, setDate] = useState(today());
    const [category, setCategory] = useState<Expense['category']>('Food');
    const [paidBy, setPaidBy] = useState('');
    const [mode, setMode] = useState<'equal' | 'custom'>('equal');
    const [among, setAmong] = useState<string[]>([]);
    const [shares, setShares] = useState<Record<string, string>>({});
    const [rate, setRate] = useState('1');
    const [rateNote, setRateNote] = useState('');
    const [rateBusy, setRateBusy] = useState(false);
    const manualRate = useRef(false);
    const [error, setError] = useState('');

    // Start from the expense being edited, or from the defaults.
    useEffect(() => {
        if (!open) return;
        setError('');
        manualRate.current = Boolean(expense);
        if (expense) {
            setTitle(expense.title); setAmount(String(expense.amount)); setCurrency(expense.currency); setDate(expense.date); setCategory(expense.category);
            setPaidBy(expense.paidBy); setMode(expense.split.mode); setAmong(expense.split.among);
            setShares(Object.fromEntries(Object.entries(expense.split.shares || {}).map(([k, v]) => [k, String(v)])));
            setRate(String(expense.rate)); setRateNote('The rate this expense was saved with.');
        } else {
            setTitle(''); setAmount(''); setCurrency(defaults.currency || ledger); setDate(defaults.date || today()); setCategory('Food');
            setPaidBy(defaults.paidBy && ids.includes(defaults.paidBy) ? defaults.paidBy : ids[0] || ''); setMode('equal'); setAmong(ids); setShares({});
            setRate('1'); setRateNote('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, expense?.id]);

    // The day's rate, unless the person has set one by hand.
    useEffect(() => {
        if (!open) return;
        const code = currency.trim().toUpperCase();
        if (code === ledger.toUpperCase()) { setRate('1'); setRateNote(''); manualRate.current = false; return; }
        if (code.length !== 3 || manualRate.current) return;
        let live = true;
        setRateBusy(true);
        getRate(date, code, ledger)
            .then(r => { if (live) { setRate(String(Number(r.rate.toPrecision(6)))); setRateNote(`The European Central Bank rate for ${formatDate(r.date, 'short-with-year')}.`); } })
            .catch(e => { if (live) setRateNote(errorMessage(e, 'No rate came back. Enter one by hand.')); })
            .finally(() => { if (live) setRateBusy(false); });
        return () => { live = false; };
    }, [open, currency, date, ledger]);

    const amountNum = parseFloat(amount.replace(',', '.'));
    const rateNum = parseFloat(rate.replace(',', '.'));
    const draft = useMemo(() => ({
        amount: amountNum, currency: currency.trim().toUpperCase(), rate: rateNum, paidBy, date,
        split: { mode, among, shares: mode === 'custom' ? Object.fromEntries(among.map(id => [id, parseFloat((shares[id] || '').replace(',', '.')) || 0])) : undefined },
    }), [amountNum, currency, rateNum, paidBy, date, mode, among, shares]);
    const check = checkExpense(draft);
    const assigned = among.reduce((n, id) => n + (draft.split.shares?.[id] || 0), 0);
    const foreign = draft.currency !== ledger.toUpperCase();

    const toggle = (id: string) => setAmong(list => (list.includes(id) ? list.filter(x => x !== id) : ids.filter(x => list.includes(x) || x === id)));

    const save = async () => {
        if (!check.ok) { setError(check.errors[0]); throw new Error(check.errors[0]); }
        try {
            await onSave({
                id: expense?.id || newId(), date, title: title.trim() || category, category, amount: amountNum, currency: draft.currency, rate: rateNum,
                paidBy, split: { mode, among, ...(mode === 'custom' ? { shares: draft.split.shares } : {}) },
            });
            onClose();
        } catch (e) {
            setError(errorMessage(e, "The expense didn't save. Try again."));
            throw e;
        }
    };

    return (
        <RpSheet
            open={open}
            onClose={onClose}
            title={expense ? 'Edit expense' : 'Add expense'}
            width={440}
            footer={
                <>
                    {expense && onDelete
                        ? <button type="button" onClick={() => onDelete(expense)} aria-label="Delete this expense" className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-rp-rust outline-none hover:bg-rp-rust/10 focus-visible:ring-2 focus-visible:ring-rp-muted"><Trash size={16} aria-hidden /> Delete</button>
                        : <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center rounded-full bg-rp-inset px-5 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted">Cancel</button>}
                    <ParticleButton onClick={save} disabled={!check.ok} pendingLabel="Saving" successLabel="Saved" errorLabel="Couldn't save">{expense ? 'Save' : 'Add expense'}</ParticleButton>
                </>
            }
        >
            <div className="flex flex-col gap-3">
                {error ? <p role="alert" className="text-sm text-rp-rust">{error}</p> : null}
                <RpField label="What was it for?">{id => <input id={id} value={title} onChange={e => setTitle(e.target.value)} placeholder="Dinner at the harbour" className={RP_FIELD} />}</RpField>
                <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
                    <RpField label="Amount">{id => <input id={id} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className={cn(RP_FIELD, 'rp-tabular')} />}</RpField>
                    <RpField label="Currency">
                        {id => (
                            <>
                                <input id={id} list="expense-currencies" value={currency} maxLength={3} onChange={e => { manualRate.current = false; setCurrency(e.target.value.toUpperCase()); }} className={cn(RP_FIELD, 'uppercase')} />
                                <datalist id="expense-currencies">{COMMON_CURRENCIES.map(c => <option key={c} value={c} />)}</datalist>
                            </>
                        )}
                    </RpField>
                </div>
                <RpField label="Date">{id => <input id={id} type="date" value={date} onChange={e => { manualRate.current = false; setDate(e.target.value); }} className={RP_FIELD} />}</RpField>

                {foreign ? (
                    <RpSection title={`Rate to ${ledger}`}>
                        <div className="flex flex-col gap-2 py-1">
                            <div className="flex items-center gap-3">
                                <label htmlFor="expense-rate" className="sr-only">Exchange rate, {ledger} for one {draft.currency}</label>
                                <input id="expense-rate" inputMode="decimal" value={rate} onChange={e => { manualRate.current = true; setRate(e.target.value); }} className={cn(RP_FIELD, 'rp-tabular max-w-[9rem]')} />
                                <span className="text-sm text-rp-muted" aria-live="polite">{rateBusy ? 'Looking up the rate...' : amountNum > 0 && rateNum > 0 ? `= ${formatMoney(amountNum * rateNum, ledger)}` : ''}</span>
                            </div>
                            {rateNote ? <p className="text-xs text-rp-muted">{rateNote}</p> : null}
                            {manualRate.current && !expense ? <button type="button" onClick={() => { manualRate.current = false; setCurrency(c => c + ''); setDate(d => d + ''); }} className="self-start text-xs font-medium text-rp-muted underline-offset-4 hover:underline">Use the day's rate again</button> : null}
                        </div>
                    </RpSection>
                ) : null}

                <RpSection title="Category">
                    <div role="group" aria-label="Category" className="flex flex-wrap gap-2 py-1">
                        {CATEGORIES.map(c => <RpChip key={c} selected={category === c} onClick={() => setCategory(c)}>{c}</RpChip>)}
                    </div>
                </RpSection>
                <RpSection title="Paid by">
                    <div role="radiogroup" aria-label="Paid by" className="flex flex-wrap gap-2 py-1">
                        {members.map(m => <RpChip key={m.id} selected={paidBy === m.id} onClick={() => setPaidBy(m.id)}>{first(m.name)}</RpChip>)}
                    </div>
                </RpSection>
                <RpSection title="Shared by">
                    <div className="flex flex-col gap-2 py-1">
                        <div role="group" aria-label="Split" className="flex gap-2">
                            <RpChip selected={mode === 'equal'} onClick={() => setMode('equal')}>Equally</RpChip>
                            <RpChip selected={mode === 'custom'} onClick={() => setMode('custom')}>By amount</RpChip>
                        </div>
                        <div role="group" aria-label="Shared by" className="flex flex-wrap gap-2">
                            {members.map(m => <RpChip key={m.id} selected={among.includes(m.id)} onClick={() => toggle(m.id)}>{first(m.name)}</RpChip>)}
                        </div>
                        {mode === 'custom' ? (
                            <div className="flex flex-col gap-2">
                                {among.map(id => {
                                    const m = members.find(x => x.id === id);
                                    return (
                                        <div key={id} className="flex items-center justify-between gap-3">
                                            <label htmlFor={`share-${id}`} className="text-sm text-rp-ink">{m ? first(m.name) : 'Someone'}</label>
                                            <input id={`share-${id}`} inputMode="decimal" value={shares[id] || ''} onChange={e => setShares(s => ({ ...s, [id]: e.target.value }))} placeholder="0.00" className={cn(RP_FIELD, 'rp-tabular max-w-[9rem] text-right')} />
                                        </div>
                                    );
                                })}
                                <p role="status" className={cn('rp-tabular text-xs', amountNum > 0 && Math.abs(assigned - amountNum) > 0.005 ? 'text-rp-rust' : 'text-rp-muted')}>
                                    {formatMoney(assigned, draft.currency || ledger)} of {amountNum > 0 ? formatMoney(amountNum, draft.currency || ledger) : 'the amount'} shared
                                </p>
                            </div>
                        ) : among.length > 0 && amountNum > 0 ? (
                            <p className="rp-tabular text-xs text-rp-muted">{formatMoney(amountNum / among.length, draft.currency || ledger)} each</p>
                        ) : null}
                    </div>
                </RpSection>
            </div>
        </RpSheet>
    );
};
