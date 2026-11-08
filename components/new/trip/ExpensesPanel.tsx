import React, { useMemo, useState } from 'react';
import type { Expense, Trip, User } from '../../../types';
import { balances, baseCents, formatMoney, fromCents, settle, sharesOf, sortExpenses, totals } from '../../../utils/expenses';
import { getActiveCurrency, formatDate } from '../../../utils/formatters';
import { toast } from '../../../services/toast';
import { ArrowRight, CurrencyDollar, Plus, Receipt, Users } from '../../ui/hugeicons';
import { RpEmpty } from '../ui';
import { ExpenseSheet } from './ExpenseSheet';
import { cn } from '../../../utils/cn';

/**
 * The trip's ledger, under the Costs tab: what has been spent (in the currency it was paid in, totalled in one
 * currency at the day's rate), how that compares with the budget, and who owes whom to settle up. The maths is
 * utils/expenses.ts; saving puts the list on the trip.
 */

const CARD = 'rounded-rp-card bg-rp-surface p-4 rp-shadow-rest sm:p-5';
const first = (name: string) => name.split(/\s+/)[0] || name;

const Heading: React.FC<{ icon: typeof Receipt; title: string; action?: React.ReactNode }> = ({ icon: IconC, title, action }) => (
    <div className="mb-3 flex min-h-8 items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-medium text-rp-ink"><IconC size={18} className="text-rp-ochre" aria-hidden /> {title}</h2>
        {action}
    </div>
);

export const ExpensesPanel: React.FC<{
    trip: Trip;
    members: User[];
    onSave: (patch: Pick<Trip, 'expenses' | 'ledgerCurrency'>) => Promise<void> | void;
}> = ({ trip, members, onSave }) => {
    const expenses = trip.expenses || [];
    const ledger = trip.ledgerCurrency || getActiveCurrency();
    const [editing, setEditing] = useState<Expense | 'new' | null>(null);
    const nameOf = (id: string) => { const m = members.find(u => u.id === id); return m ? first(m.name) : 'Someone'; };

    const sorted = useMemo(() => sortExpenses(expenses), [expenses]);
    const total = useMemo(() => totals(expenses), [expenses]);
    const bal = useMemo(() => balances(expenses, members.map(m => m.id)), [expenses, members]);
    const transfers = useMemo(() => settle(bal), [bal]);
    const people = Math.max(1, members.length);
    const target = Number(trip.targetBudget) > 0 && getActiveCurrency() === ledger ? Number(trip.targetBudget) : 0;
    const spent = fromCents(total.cents);
    const last = sorted[0];

    const save = async (next: Expense[]) => { await onSave({ expenses: next, ledgerCurrency: ledger }); };
    const upsert = async (e: Expense) => { await save(expenses.some(x => x.id === e.id) ? expenses.map(x => (x.id === e.id ? e : x)) : [...expenses, e]); };
    const remove = async (e: Expense) => {
        const before = expenses;
        setEditing(null);
        await save(expenses.filter(x => x.id !== e.id));
        toast.undo('Expense deleted', async () => { await save(before); }, { duration: 8000 });
    };

    const addButton = (
        <button type="button" onClick={() => setEditing('new')} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-rp-ink px-4 text-sm font-medium text-rp-on-ink outline-none hover:bg-rp-ink/90 focus-visible:ring-2 focus-visible:ring-rp-muted">
            <Plus size={16} aria-hidden /> Add expense
        </button>
    );

    return (
        <section aria-label="Expenses" className="mt-3 flex flex-col gap-3 lg:mt-6 lg:gap-6">
            <div className={CARD}>
                <Heading icon={CurrencyDollar} title="Expenses" action={expenses.length ? addButton : undefined} />
                {expenses.length === 0 ? (
                    <RpEmpty title="No expenses yet" action={addButton}>Log what you spend in the currency you paid in. It is converted at the day's rate, shared between travellers, and totalled here.</RpEmpty>
                ) : (
                    <>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <div className="rounded-rp-inset bg-rp-inset p-3"><p className="text-xs text-rp-muted">Spent</p><p className="rp-tabular text-xl font-semibold text-rp-ink">{formatMoney(spent, ledger)}</p></div>
                            <div className="rounded-rp-inset bg-rp-inset p-3"><p className="text-xs text-rp-muted">Per person</p><p className="rp-tabular text-xl font-semibold text-rp-ink">{formatMoney(spent / people, ledger)}</p></div>
                            <div className="rounded-rp-inset bg-rp-inset p-3"><p className="text-xs text-rp-muted">Entries</p><p className="rp-tabular text-xl font-semibold text-rp-ink">{total.count}</p></div>
                        </div>
                        {target > 0 ? (
                            <div className="mt-3">
                                <div className="mb-1 flex items-center justify-between text-xs"><span className="text-rp-muted">Budget {formatMoney(target, ledger)}</span><span className={cn('rp-tabular font-medium', spent > target ? 'text-rp-rust' : 'text-rp-green')}>{spent > target ? `${formatMoney(spent - target, ledger)} over` : `${formatMoney(target - spent, ledger)} left`}</span></div>
                                <div className="h-2 overflow-hidden rounded-full bg-rp-inset" role="img" aria-label={`${Math.round((spent / target) * 100)} percent of the budget spent`}><div className={cn('h-full rounded-full', spent > target ? 'bg-rp-rust' : 'bg-rp-green')} style={{ width: `${Math.min(100, (spent / target) * 100)}%` }} /></div>
                            </div>
                        ) : null}
                        <p className="mt-2 text-xs text-rp-muted">Totalled in {ledger}, each expense at the rate of its day.</p>
                    </>
                )}
            </div>

            {expenses.length > 0 ? (
                <div className="grid gap-3 lg:grid-cols-2 lg:gap-6">
                    <section className={CARD} aria-label="Who owes whom">
                        <Heading icon={Users} title="Who owes whom" />
                        {transfers.length === 0 ? (
                            <p className="text-sm text-rp-muted">Everyone is square.</p>
                        ) : (
                            <ul className="flex flex-col gap-2">
                                {transfers.map(t => (
                                    <li key={`${t.from}-${t.to}`} className="flex min-h-11 items-center justify-between gap-3 rounded-rp-inset bg-rp-inset px-3 py-2 text-sm">
                                        <span className="flex min-w-0 items-center gap-2 text-rp-ink"><span className="truncate font-medium">{nameOf(t.from)}</span><ArrowRight size={14} className="shrink-0 text-rp-rust" aria-label="pays" role="img" /><span className="truncate font-medium">{nameOf(t.to)}</span></span>
                                        <span className="rp-tabular shrink-0 font-semibold text-rp-ink">{formatMoney(fromCents(t.cents), ledger)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <table className="mt-4 w-full text-left text-xs">
                            <caption className="sr-only">Paid, share and balance for each traveller</caption>
                            <thead><tr className="text-rp-muted"><th className="py-1 font-medium">Traveller</th><th className="py-1 text-right font-medium">Paid</th><th className="py-1 text-right font-medium">Share</th><th className="py-1 text-right font-medium">Balance</th></tr></thead>
                            <tbody>
                                {Object.entries(bal).map(([id, b]) => (
                                    <tr key={id} className="border-t border-rp-line">
                                        <td className="py-2 text-rp-ink">{nameOf(id)}</td>
                                        <td className="rp-tabular py-2 text-right text-rp-ink">{formatMoney(fromCents(b.paid), ledger)}</td>
                                        <td className="rp-tabular py-2 text-right text-rp-ink">{formatMoney(fromCents(b.owed), ledger)}</td>
                                        <td className={cn('rp-tabular py-2 text-right font-medium', b.net > 0 ? 'text-rp-green' : b.net < 0 ? 'text-rp-rust' : 'text-rp-muted')}>{b.net > 0 ? '+' : b.net < 0 ? '−' : ''}{formatMoney(Math.abs(fromCents(b.net)), ledger)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>

                    <section className={CARD} aria-label="All expenses">
                        <Heading icon={Receipt} title="All expenses" />
                        <ul className="flex flex-col">
                            {sorted.map(e => {
                                const foreign = e.currency.toUpperCase() !== ledger.toUpperCase();
                                const shared = Object.keys(sharesOf(e)).length;
                                return (
                                    <li key={e.id} className="border-t border-rp-line first:border-t-0">
                                        <button type="button" onClick={() => setEditing(e)} aria-label={`Edit ${e.title}, ${formatMoney(e.amount, e.currency)}`} className="flex min-h-14 w-full items-center justify-between gap-3 rounded-rp-inset py-2 text-left outline-none hover:bg-rp-inset/60 focus-visible:ring-2 focus-visible:ring-rp-muted">
                                            <span className="flex min-w-0 flex-col">
                                                <span className="truncate text-sm font-medium text-rp-ink">{e.title}</span>
                                                <span className="truncate text-xs text-rp-muted">{formatDate(e.date, 'short')} · {e.category} · {nameOf(e.paidBy)} paid · {shared === 1 ? 'not shared' : `shared by ${shared}`}</span>
                                            </span>
                                            <span className="rp-tabular flex shrink-0 flex-col items-end">
                                                <span className="text-sm font-semibold text-rp-ink">{formatMoney(e.amount, e.currency)}</span>
                                                {foreign ? <span className="text-xs text-rp-muted">{formatMoney(fromCents(baseCents(e)), ledger)}</span> : null}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                </div>
            ) : null}

            <ExpenseSheet
                open={editing !== null}
                expense={editing && editing !== 'new' ? editing : null}
                members={members}
                ledger={ledger}
                defaults={{ date: last?.date || trip.startDate || new Date().toISOString().slice(0, 10), currency: last?.currency || ledger, paidBy: last?.paidBy || '' }}
                onClose={() => setEditing(null)}
                onSave={upsert}
                onDelete={remove}
            />
        </section>
    );
};
