import { describe, expect, it } from 'vitest';
import type { Expense } from '../../types';
import { balances, baseCents, checkExpense, divide, formatMoney, settle, sharesOf, sortExpenses, toCents, totals } from '../../utils/expenses';

const expense = (id: string, amount: number, paidBy: string, among: string[], over: Partial<Expense> = {}): Expense => ({
    id, date: '2027-03-24', title: id, category: 'Food', amount, currency: 'EUR', rate: 1, paidBy, split: { mode: 'equal', among }, ...over,
});

describe('cents and splitting', () => {
    it('works in whole cents at the expense\'s rate', () => {
        expect(toCents(12.34)).toBe(1234);
        expect(toCents(0.1 + 0.2)).toBe(30);
        expect(baseCents({ amount: 100, rate: 1.0821 })).toBe(10821);
        expect(baseCents({ amount: 1500, rate: 0.0062 })).toBe(930);
    });

    it('divides without losing a cent', () => {
        expect(divide(100, [1, 1, 1])).toEqual([34, 33, 33]);
        expect(divide(100, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100);
        expect(divide(1000, [3, 1])).toEqual([750, 250]);
        expect(divide(10, [1, 0, 1])).toEqual([5, 0, 5]);
        expect(divide(7, [0, 0])).toEqual([7, 0]);
        expect(divide(5, [])).toEqual([]);
    });

    it('shares an expense equally or by amounts, always adding up to the total', () => {
        const equal = sharesOf(expense('a', 100, 'sam', ['sam', 'ana', 'lee']));
        expect(equal).toEqual({ sam: 3334, ana: 3333, lee: 3333 });
        const custom = sharesOf(expense('b', 90, 'sam', ['sam', 'ana'], { split: { mode: 'custom', among: ['sam', 'ana'], shares: { sam: 60, ana: 30 } } }));
        expect(custom).toEqual({ sam: 6000, ana: 3000 });
        // Shares in the expense's currency scale to the ledger currency with the rate.
        const foreign = sharesOf(expense('c', 90, 'sam', ['sam', 'ana'], { currency: 'USD', rate: 0.9, split: { mode: 'custom', among: ['sam', 'ana'], shares: { sam: 60, ana: 30 } } }));
        expect(foreign.sam + foreign.ana).toBe(8100);
        expect(foreign).toEqual({ sam: 5400, ana: 2700 });
    });

    it('falls back to the payer when nobody is chosen', () => {
        expect(sharesOf(expense('d', 20, 'sam', []))).toEqual({ sam: 2000 });
    });
});

describe('who owes whom', () => {
    const list = [
        expense('dinner', 90, 'sam', ['sam', 'ana', 'lee']),
        expense('taxi', 30, 'ana', ['sam', 'ana', 'lee']),
        expense('museum', 45, 'lee', ['ana', 'lee']),
    ];

    it('totals what each person paid and owes, and the balances add up to zero', () => {
        const b = balances(list, ['sam', 'ana', 'lee']);
        // sam: paid 90, owes 30 + 10 = 40 -> +50; ana: paid 30, owes 30 + 10 + 22.50 = 62.50 -> -32.50; lee: paid 45, owes 30 + 10 + 22.50 = 62.50 -> -17.50
        expect(b.sam).toEqual({ paid: 9000, owed: 4000, net: 5000 });
        expect(b.ana.net).toBe(-3250);
        expect(b.lee.net).toBe(-1750);
        expect(Object.values(b).reduce((n, x) => n + x.net, 0)).toBe(0);
    });

    it('settles with the fewest payments', () => {
        const transfers = settle(balances(list, ['sam', 'ana', 'lee']));
        expect(transfers).toEqual([{ from: 'ana', to: 'sam', cents: 3250 }, { from: 'lee', to: 'sam', cents: 1750 }]);
        // After the transfers everyone is square.
        const net: Record<string, number> = { sam: 5000, ana: -3250, lee: -1750 };
        transfers.forEach(t => { net[t.from] += t.cents; net[t.to] -= t.cents; });
        expect(Object.values(net).every(n => n === 0)).toBe(true);
    });

    it('chains payments when no one person is owed everything', () => {
        const b = balances([expense('a', 60, 'x', ['x', 'y']), expense('b', 80, 'z', ['y', 'z'])], ['x', 'y', 'z']);
        const transfers = settle(b);
        // y owes 30 + 40 in all: the 40 to z (owed the most) first, then the 30 to x.
        expect(transfers).toEqual([{ from: 'y', to: 'z', cents: 4000 }, { from: 'y', to: 'x', cents: 3000 }]);
        expect(settle(balances([], ['x']))).toEqual([]);
        expect(settle(balances([expense('e', 10, 'x', ['x'])], ['x']))).toEqual([]);
    });

    it('includes people who appear in an expense but not in the member list', () => {
        expect(Object.keys(balances([expense('a', 10, 'guest', ['guest', 'sam'])], ['sam'])).sort()).toEqual(['guest', 'sam']);
    });
});

describe('totals and ordering', () => {
    it('totals by category, biggest first, at the ledger rate', () => {
        const t = totals([expense('a', 10, 's', ['s']), expense('b', 40, 's', ['s'], { category: 'Stay' }), expense('c', 5, 's', ['s'], { currency: 'USD', rate: 2 })]);
        expect(t.cents).toBe(6000);
        expect(t.count).toBe(3);
        expect(t.byCategory).toEqual([{ category: 'Stay', cents: 4000 }, { category: 'Food', cents: 2000 }]);
    });

    it('lists newest first', () => {
        const list = sortExpenses([expense('a', 1, 's', ['s'], { date: '2027-03-22' }), expense('b', 1, 's', ['s'], { date: '2027-03-25', title: 'b' }), expense('c', 1, 's', ['s'], { date: '2027-03-25', title: 'a' })]);
        expect(list.map(e => e.id)).toEqual(['c', 'b', 'a']);
    });
});

describe('checking an expense before it is saved', () => {
    const ok = { amount: 12.5, currency: 'EUR', rate: 1, paidBy: 'sam', date: '2027-03-24', split: { mode: 'equal' as const, among: ['sam'] } };

    it('accepts a good one and says what is wrong with a bad one', () => {
        expect(checkExpense(ok)).toEqual({ ok: true, errors: [] });
        const bad = checkExpense({ ...ok, amount: 0, currency: 'EURO', rate: 0, paidBy: '', date: '', split: { mode: 'equal', among: [] } });
        expect(bad.ok).toBe(false);
        expect(bad.errors).toHaveLength(6);
    });

    it('checks that custom shares add up to the amount', () => {
        expect(checkExpense({ ...ok, split: { mode: 'custom', among: ['sam', 'ana'], shares: { sam: 5, ana: 7.5 } } }).ok).toBe(true);
        const off = checkExpense({ ...ok, split: { mode: 'custom', among: ['sam', 'ana'], shares: { sam: 5, ana: 5 } } });
        expect(off.errors[0]).toBe('The shares add up to 10.00, not 12.50.');
        expect(checkExpense({ ...ok, split: { mode: 'custom', among: ['sam'], shares: {} } }).errors[0]).toMatch(/each person/);
    });
});

describe('money', () => {
    it('formats by currency code and survives an unknown one', () => {
        expect(formatMoney(12.5, 'EUR')).toBe('€12.50');
        expect(formatMoney(1200, 'USD')).toBe('$1,200.00');
        expect(formatMoney(1500, 'JPY')).toBe('¥1,500');
        expect(formatMoney(3, 'XXXX')).toBe('3.00 XXXX');
    });
});
