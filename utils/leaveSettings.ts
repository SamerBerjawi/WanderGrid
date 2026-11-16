import type { EntitlementType, LeaveEntry, User, UserPolicy } from '../types';
import { carryOverExpiry } from './calendarModel';

/**
 * Pure helpers behind Settings › Leave: leave types (the workspace's) and each member's allowance per type and year
 * (`User.policies`). The counting itself is `utils/calendarModel.ts`; this file only shapes and describes the settings.
 */

export const LEAVE_CATEGORIES: { id: EntitlementType['category']; label: string; hint: string }[] = [
    { id: 'Annual', label: 'Annual', hint: 'Paid holiday. Suggested first for trips.' },
    { id: 'Lieu', label: 'Time in lieu', hint: 'Compensatory days, RTT. Takes days in lieu earned by weekend holidays.' },
    { id: 'Seniority', label: 'Seniority', hint: 'Extra days for years of service.' },
    { id: 'Sick', label: 'Sick', hint: 'Never suggested for trips.' },
    { id: 'Unpaid', label: 'Unpaid', hint: 'Never suggested for trips.' },
    { id: 'Custom', label: 'Other', hint: 'Parental, special or any other leave.' },
];

export const LEAVE_COLORS: EntitlementType['color'][] = ['green', 'blue', 'teal', 'cyan', 'indigo', 'purple', 'pink', 'red', 'amber', 'gray'];

/** A new leave type: a yearly allowance and no carry-over. */
export const blankType = (category: EntitlementType['category'] = 'Annual', id = `type-${Math.random().toString(36).slice(2, 10)}`): EntitlementType => ({
    id,
    name: category === 'Annual' ? 'Annual leave' : '',
    category,
    color: category === 'Sick' ? 'red' : category === 'Lieu' ? 'teal' : category === 'Unpaid' ? 'gray' : 'green',
    accrual: { period: 'yearly', amount: category === 'Annual' ? 25 : 0 },
    carryOver: { enabled: false, maxDays: 0, expiryType: 'none' },
});

/** What a type is missing before it can be saved, or null. */
export const typeProblem = (type: EntitlementType, all: EntitlementType[]): string | null => {
    const name = type.name.trim();
    if (!name) return 'Give the leave type a name.';
    if (all.some(t => t.id !== type.id && t.name.trim().toLowerCase() === name.toLowerCase())) return `There is already a type called ${name}.`;
    return policyProblem({ accrual: type.accrual, carryOver: type.carryOver, isUnlimited: type.isUnlimited });
};

type PolicyShape = Pick<UserPolicy, 'accrual' | 'carryOver' | 'isUnlimited'>;

/** What is wrong with an allowance and its carry-over, or null. */
export const policyProblem = (p: PolicyShape): string | null => {
    if (!p.isUnlimited && !(Number(p.accrual.amount) >= 0)) return 'The allowance must be zero or more.';
    if (p.carryOver.enabled) {
        if (!(Number(p.carryOver.maxDays) > 0)) return 'Set how many days can carry over.';
        if (p.carryOver.expiryType === 'months' && !(Number(p.carryOver.expiryValue) >= 1 && Number(p.carryOver.expiryValue) <= 24)) return 'Carried days expire after 1 to 24 months.';
        if (p.carryOver.expiryType === 'fixed_date' && !carryOverExpiry(p.carryOver, 2001)) return 'Pick the day carried days expire.';
    }
    return null;
};

/** A member's allowance for a type and year, from the type's defaults. */
export const policyFromType = (type: EntitlementType, year: number): UserPolicy => ({
    entitlementId: type.id,
    year,
    isActive: true,
    isUnlimited: type.isUnlimited || undefined,
    accrual: { ...type.accrual },
    carryOver: { ...type.carryOver },
});

export const policyFor = (user: User, entitlementId: string, year: number): UserPolicy | undefined =>
    (user.policies || []).find(p => p.entitlementId === entitlementId && p.year === year);

/** The member with one allowance put in place (replacing the one for the same type and year). */
export const withPolicy = (user: User, policy: UserPolicy): User => ({
    ...user,
    policies: [...(user.policies || []).filter(p => !(p.entitlementId === policy.entitlementId && p.year === policy.year)), policy]
        .sort((a, b) => a.year - b.year || a.entitlementId.localeCompare(b.entitlementId)),
    activeYears: [...new Set([...(user.activeYears || []), policy.year])].sort((a, b) => a - b),
});

export const withoutPolicy = (user: User, entitlementId: string, year: number): User => ({
    ...user,
    policies: (user.policies || []).filter(p => !(p.entitlementId === entitlementId && p.year === year)),
});

/**
 * Copies a member's allowances from one year to another. Types that already have an allowance in the target year
 * keep it; the copy says how many were added and how many were left alone.
 */
export const copyPolicies = (user: User, from: number, to: number): { user: User; copied: number; kept: number } => {
    let next = user;
    let copied = 0;
    let kept = 0;
    (user.policies || []).filter(p => p.year === from).forEach(p => {
        if (policyFor(user, p.entitlementId, to)) { kept += 1; return; }
        next = withPolicy(next, { ...p, year: to, accrual: { ...p.accrual }, carryOver: { ...p.carryOver } });
        copied += 1;
    });
    return { user: next, copied, kept };
};

const dayWord = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} ${n === 1 ? 'day' : 'days'}`;

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** When carried days expire, in words that hold for any year: "for 3 months", "until 30 Jun". */
export const describeExpiry = (carryOver: UserPolicy['carryOver']): string => {
    if (carryOver.expiryType === 'months') {
        const n = Math.round(Number(carryOver.expiryValue));
        return n > 0 ? `for ${n} ${n === 1 ? 'month' : 'months'}` : '';
    }
    const until = carryOverExpiry(carryOver, 2001);
    return until ? `until ${Number(until.slice(8))} ${MONTH_SHORT[Number(until.slice(5, 7)) - 1]}` : '';
};

/** "25 days a year · up to 5 days carry over for 3 months". */
export const describePolicy = (p: PolicyShape): string => {
    if (p.isUnlimited) return 'Unlimited';
    const amount = Number(p.accrual.amount) || 0;
    const grant = p.accrual.period === 'monthly' ? `${dayWord(amount)} a month (${dayWord(amount * 12)} a year)` : `${dayWord(amount)} a year`;
    if (!p.carryOver.enabled) return grant;
    const expiry = describeExpiry(p.carryOver);
    return `${grant} · up to ${dayWord(Number(p.carryOver.maxDays) || 0)} carry over${expiry ? ` ${expiry}` : ''}`;
};

/** How many leave entries use a type (so removing it can say what it affects). */
export const typeUsage = (leave: Pick<LeaveEntry, 'entitlementId' | 'allocations'>[], id: string): number =>
    leave.filter(t => t.entitlementId === id || (t.allocations || []).some(a => a.entitlementId === id)).length;

/** The years worth offering in the allowance editor: last year, this year, the next, and any year with a policy. */
export const policyYears = (users: User[], thisYear: number): number[] => {
    const years = new Set([thisYear - 1, thisYear, thisYear + 1]);
    users.forEach(u => (u.policies || []).forEach(p => years.add(p.year)));
    return [...years].filter(y => y >= thisYear - 5 && y <= thisYear + 5).sort((a, b) => a - b);
};
