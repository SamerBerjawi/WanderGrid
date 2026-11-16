import { describe, expect, it } from 'vitest';
import type { EntitlementType, Trip, User } from '../../types';
import { blankType, copyPolicies, describePolicy, policyFor, policyFromType, policyProblem, policyYears, typeProblem, typeUsage, withoutPolicy, withPolicy } from '../../utils/leaveSettings';

const annual: EntitlementType = { ...blankType('Annual', 'annual'), carryOver: { enabled: true, maxDays: 5, expiryType: 'months', expiryValue: 3 } };
const user = (over: Partial<User> = {}): User => ({ id: 'u1', name: 'A', role: 'Admin', leaveBalance: 0, takenLeave: 0, allowance: 0, ...over });

describe('leave types', () => {
    it('starts a type from its category', () => {
        expect(blankType('Annual', 'x')).toMatchObject({ name: 'Annual leave', accrual: { period: 'yearly', amount: 25 }, color: 'green' });
        expect(blankType('Sick', 'x')).toMatchObject({ name: '', color: 'red', accrual: { amount: 0 } });
    });

    it('needs a unique name and a valid carry-over', () => {
        expect(typeProblem({ ...annual, name: ' ' }, [])).toMatch(/name/);
        expect(typeProblem({ ...annual, id: 'b', name: 'annual LEAVE' }, [annual])).toMatch(/already/);
        expect(typeProblem(annual, [annual])).toBeNull();
        expect(policyProblem({ accrual: { period: 'yearly', amount: 25 }, carryOver: { enabled: true, maxDays: 0, expiryType: 'none' } })).toMatch(/how many/);
        expect(policyProblem({ accrual: { period: 'yearly', amount: 25 }, carryOver: { enabled: true, maxDays: 5, expiryType: 'months', expiryValue: 0 } })).toMatch(/months/);
        expect(policyProblem({ accrual: { period: 'yearly', amount: 25 }, carryOver: { enabled: true, maxDays: 5, expiryType: 'fixed_date', expiryValue: '' } })).toMatch(/day/);
        expect(policyProblem({ accrual: { period: 'yearly', amount: -1 }, carryOver: { enabled: false, maxDays: 0, expiryType: 'none' } })).toMatch(/zero/);
    });

    it('counts the entries that use a type', () => {
        const trips = [
            { id: 'a', entitlementId: 'annual' },
            { id: 'b', allocations: [{ entitlementId: 'annual', days: 2 }] },
            { id: 'c', entitlementId: 'sick' },
        ] as Trip[];
        expect(typeUsage(trips, 'annual')).toBe(2);
    });
});

describe('member allowances', () => {
    it('copies the type defaults into a policy', () => {
        const p = policyFromType(annual, 2027);
        expect(p).toMatchObject({ entitlementId: 'annual', year: 2027, isActive: true, accrual: { amount: 25 }, carryOver: { maxDays: 5 } });
        p.carryOver.maxDays = 9;
        expect(annual.carryOver.maxDays).toBe(5);
    });

    it('puts one policy per type and year and tracks the year', () => {
        let u = withPolicy(user(), policyFromType(annual, 2027));
        u = withPolicy(u, { ...policyFromType(annual, 2027), accrual: { period: 'yearly', amount: 30 } });
        expect(u.policies).toHaveLength(1);
        expect(policyFor(u, 'annual', 2027)?.accrual.amount).toBe(30);
        expect(u.activeYears).toEqual([2027]);
        expect(withoutPolicy(u, 'annual', 2027).policies).toEqual([]);
    });

    it('copies a year forward without overwriting', () => {
        const sick = blankType('Sick', 'sick');
        let u = withPolicy(user(), policyFromType(annual, 2026));
        u = withPolicy(u, policyFromType(sick, 2026));
        u = withPolicy(u, { ...policyFromType(sick, 2027), accrual: { period: 'yearly', amount: 12 } });
        const out = copyPolicies(u, 2026, 2027);
        expect(out).toMatchObject({ copied: 1, kept: 1 });
        expect(policyFor(out.user, 'annual', 2027)?.accrual.amount).toBe(25);
        expect(policyFor(out.user, 'sick', 2027)?.accrual.amount).toBe(12);
    });

    it('describes an allowance in words', () => {
        expect(describePolicy({ accrual: { period: 'yearly', amount: 25 }, carryOver: { enabled: false, maxDays: 0, expiryType: 'none' } })).toBe('25 days a year');
        expect(describePolicy({ accrual: { period: 'monthly', amount: 2.5 }, carryOver: { enabled: false, maxDays: 0, expiryType: 'none' } })).toBe('2.5 days a month (30 days a year)');
        expect(describePolicy({ ...annual, isUnlimited: true })).toBe('Unlimited');
        expect(describePolicy(annual)).toBe('25 days a year · up to 5 days carry over for 3 months');
        expect(describePolicy({ ...annual, carryOver: { ...annual.carryOver, expiryType: 'fixed_date', expiryValue: '06-30' } })).toBe('25 days a year · up to 5 days carry over until 30 Jun');
    });

    it('offers last year to next year plus any year with a policy', () => {
        expect(policyYears([user({ policies: [policyFromType(annual, 2029)] })], 2026)).toEqual([2025, 2026, 2027, 2029]);
    });
});
