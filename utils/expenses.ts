import type { Expense, ExpenseSplit } from '../types';

/**
 * The expense ledger of a trip: what was spent, in what currency, who paid and who shares it, and from that who
 * owes whom. Everything is worked in whole cents of the trip's ledger currency, so shares always add back to the
 * amount (a leftover cent goes to the first person, never lost) and the balances always add up to zero. Pure.
 */

export const CATEGORIES: Expense['category'][] = ['Food', 'Transport', 'Stay', 'Activities', 'Shopping', 'Other'];

/** Currencies the rate source covers, offered as suggestions (any three-letter code is accepted). */
export const COMMON_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'TRY', 'THB', 'SGD', 'HKD', 'CNY', 'INR', 'IDR', 'MYR', 'PHP', 'KRW', 'ZAR', 'BRL', 'MXN', 'ILS'];

export const toCents = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 100);
export const fromCents = (c: number): number => c / 100;

/** An expense in cents of the ledger currency: its amount at its rate. */
export const baseCents = (e: Pick<Expense, 'amount' | 'rate'>): number => Math.round((Number(e.amount) || 0) * (Number(e.rate) || 0) * 100);

/** Divides `total` cents by `weights`, the leftover cents going to the first people in order, so the parts add up to the total. */
export const divide = (total: number, weights: number[]): number[] => {
    const sum = weights.reduce((n, w) => n + Math.max(0, w), 0);
    if (weights.length === 0) return [];
    if (sum <= 0) return weights.map((_, i) => (i === 0 ? total : 0));
    const parts = weights.map(w => Math.floor((total * Math.max(0, w)) / sum));
    let left = total - parts.reduce((n, p) => n + p, 0);
    for (let i = 0; left > 0 && i < parts.length; i = (i + 1) % parts.length) {
        if (weights[i] > 0) { parts[i] += 1; left -= 1; }
        if (parts.every((_, j) => !(weights[j] > 0))) break;
    }
    return parts;
};

/** Each person's share of an expense, in cents of the ledger currency. */
export const sharesOf = (e: Expense): Record<string, number> => {
    const total = baseCents(e);
    const ids = e.split.among.length ? e.split.among : [e.paidBy];
    const weights = e.split.mode === 'custom' ? ids.map(id => Number(e.split.shares?.[id]) || 0) : ids.map(() => 1);
    const parts = divide(total, weights);
    return Object.fromEntries(ids.map((id, i) => [id, parts[i]]));
};

export interface Balance { paid: number; owed: number; /** Paid minus owed: positive is owed to them. */ net: number }

/** What each person has paid and owes, in cents. People in the expenses but not in `members` are included. */
export const balances = (expenses: Expense[], members: string[] = []): Record<string, Balance> => {
    const out: Record<string, Balance> = {};
    const at = (id: string) => (out[id] ||= { paid: 0, owed: 0, net: 0 });
    members.forEach(at);
    for (const e of expenses) {
        at(e.paidBy).paid += baseCents(e);
        for (const [id, cents] of Object.entries(sharesOf(e))) at(id).owed += cents;
    }
    Object.values(out).forEach(b => { b.net = b.paid - b.owed; });
    return out;
};

export interface Transfer { from: string; to: string; cents: number }

/** The fewest payments that settle everyone up: the biggest debtor pays the biggest creditor, and so on. */
export const settle = (bal: Record<string, Balance>): Transfer[] => {
    const creditors = Object.entries(bal).filter(([, b]) => b.net > 0).map(([id, b]) => ({ id, left: b.net })).sort((a, b) => b.left - a.left || a.id.localeCompare(b.id));
    const debtors = Object.entries(bal).filter(([, b]) => b.net < 0).map(([id, b]) => ({ id, left: -b.net })).sort((a, b) => b.left - a.left || a.id.localeCompare(b.id));
    const out: Transfer[] = [];
    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
        const cents = Math.min(debtors[i].left, creditors[j].left);
        if (cents > 0) out.push({ from: debtors[i].id, to: creditors[j].id, cents });
        debtors[i].left -= cents;
        creditors[j].left -= cents;
        if (debtors[i].left === 0) i += 1;
        if (creditors[j].left === 0) j += 1;
    }
    return out;
};

export interface Totals { cents: number; byCategory: { category: Expense['category']; cents: number }[]; count: number }

export const totals = (expenses: Expense[]): Totals => {
    const byCat = new Map<Expense['category'], number>();
    let cents = 0;
    for (const e of expenses) { const c = baseCents(e); cents += c; byCat.set(e.category, (byCat.get(e.category) || 0) + c); }
    return {
        cents, count: expenses.length,
        byCategory: [...byCat.entries()].map(([category, c]) => ({ category, cents: c })).sort((a, b) => b.cents - a.cents),
    };
};

/** Newest first, then by title, for the list. */
export const sortExpenses = (expenses: Expense[]): Expense[] =>
    [...expenses].sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));

export interface DraftCheck { ok: boolean; errors: string[] }

/** Whether an expense can be saved, and what to tell the person if not. */
export const checkExpense = (e: Pick<Expense, 'amount' | 'currency' | 'rate' | 'paidBy' | 'date' | 'split'>): DraftCheck => {
    const errors: string[] = [];
    if (!(e.amount > 0)) errors.push('Enter an amount above zero.');
    if (!/^[A-Za-z]{3}$/.test(e.currency || '')) errors.push('Enter the currency as a three-letter code, like EUR.');
    if (!(e.rate > 0)) errors.push('Enter the exchange rate.');
    if (!e.paidBy) errors.push('Choose who paid.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) errors.push('Choose the date.');
    if (!e.split.among.length) errors.push('Choose who shares it.');
    if (e.split.mode === 'custom') {
        const sum = e.split.among.reduce((n, id) => n + (Number(e.split.shares?.[id]) || 0), 0);
        if (!(sum > 0)) errors.push('Enter each person\'s share.');
        else if (Math.abs(sum - e.amount) > 0.005) errors.push(`The shares add up to ${sum.toFixed(2)}, not ${e.amount.toFixed(2)}.`);
    }
    return { ok: errors.length === 0, errors };
};

/** Money in a currency by its code: "€12.50", "$1,200.00", "¥1,500". Falls back to "12.50 XYZ" for a code Intl does not know. */
export const formatMoney = (amount: number, currency: string): string => {
    try { return new Intl.NumberFormat('en', { style: 'currency', currency }).format(amount); } catch { return `${amount.toFixed(2)} ${currency}`; }
};

/** Equal shares for a new expense: everyone on the trip. */
export const equalSplit = (members: string[]): ExpenseSplit => ({ mode: 'equal', among: members });
