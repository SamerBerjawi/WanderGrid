'use strict';
/**
 * Retiring the old yearly leave fields (leave plan decision A8). Members used to carry `allowance` / `leaveBalance`
 * (days a year) and `takenLeave` (days recorded as taken) on their record. Those become what the leave engine reads:
 * an allowance (policy) on the Annual leave type for the year of the conversion, and an adjustment for days recorded
 * as taken. A member converted once carries `legacyLeaveConverted: true` and is never converted again.
 *
 * Run by the 0005 migration, by every restore (older backups), and mirrored for local mode in utils/leaveSettings.ts
 * (`convertLegacyUser`); keep the two in step. New accounts get each leave type's default allowance instead.
 */

const ANNUAL_TYPE = {
    id: 'annual-leave',
    name: 'Annual leave',
    category: 'Annual',
    color: 'green',
    accrual: { period: 'yearly', amount: 25 },
    carryOver: { enabled: false, maxDays: 0, expiryType: 'none' },
};

/** A member's allowance for one type and year from the type's defaults. */
const policyFromType = (type, year) => ({
    entitlementId: type.id,
    year,
    isActive: true,
    ...(type.isUnlimited ? { isUnlimited: true } : {}),
    accrual: { ...(type.accrual || { period: 'yearly', amount: 0 }) },
    carryOver: { ...(type.carryOver || { enabled: false, maxDays: 0, expiryType: 'none' }) },
});

/** The allowances a new member starts with: every leave type's default for this year. */
const policiesFromTypes = (types, year) => (Array.isArray(types) ? types : []).filter(t => t && t.id).map(t => policyFromType(t, year));

/**
 * One member's conversion. `annual` is the Annual type to use (made by the caller when there is none); `hasLeaveIn`
 * says whether the member already has leave entries in the year, in which case recorded days are not taken off again
 * (they stood in for leave the entries now count).
 */
function convertLegacyUser(user, annual, year, hasLeaveIn) {
    if (!user || user.legacyLeaveConverted) return null;
    const next = { ...user, legacyLeaveConverted: true };
    const hasPolicies = Array.isArray(user.policies) && user.policies.length > 0;
    const amount = Number(user.allowance ?? user.leaveBalance) || 0;
    if (!hasPolicies && amount > 0 && annual) {
        next.policies = [{ ...policyFromType(annual, year), accrual: { period: 'yearly', amount } }];
        next.activeYears = [...new Set([...(Array.isArray(user.activeYears) ? user.activeYears : []), year])].sort((a, b) => a - b);
    }
    const taken = Number(user.takenLeave) || 0;
    if (taken > 0 && annual && !hasLeaveIn) {
        const adjustments = Array.isArray(user.leaveAdjustments) ? user.leaveAdjustments : [];
        if (!adjustments.some(a => a && a.id === `legacy-taken-${year}`)) {
            next.leaveAdjustments = [...adjustments, { id: `legacy-taken-${year}`, entitlementId: annual.id, year, days: -taken, date: `${year}-01-01`, note: 'Days recorded as taken before WanderGrid counted leave' }];
        }
    }
    return next;
}

/** Converts every member not converted yet. Makes the Annual leave type when a member needs it and there is none. */
async function convertLegacyAllowances(client, year = new Date().getFullYear()) {
    const { rows: userRows } = await client.query('SELECT id, data FROM users');
    const pending = userRows.filter(r => r.data && !r.data.legacyLeaveConverted);
    if (pending.length === 0) return { converted: 0, typeCreated: false };
    const { rows: typeRows } = await client.query('SELECT data FROM entitlements');
    let annual = typeRows.map(r => r.data).find(t => t && t.category === 'Annual');
    let typeCreated = false;
    const needsType = pending.some(r => !(Array.isArray(r.data.policies) && r.data.policies.length) && (Number(r.data.allowance ?? r.data.leaveBalance) > 0 || Number(r.data.takenLeave) > 0));
    if (!annual && needsType) {
        annual = { ...ANNUAL_TYPE, version: 1 };
        const { rows: clash } = await client.query('SELECT 1 FROM entitlements WHERE id = $1', [annual.id]);
        if (clash.length === 0) {
            await client.query('INSERT INTO entitlements (id, data) VALUES ($1, $2)', [annual.id, JSON.stringify(annual)]);
            typeCreated = true;
        }
    }
    const { rows: leaveRows } = await client.query('SELECT data FROM leave');
    const leaveYears = new Map();
    leaveRows.forEach(r => {
        const e = r.data;
        if (!e || !e.memberId || !e.startDate) return;
        const set = leaveYears.get(e.memberId) || new Set();
        set.add(Number(String(e.startDate).slice(0, 4)));
        leaveYears.set(e.memberId, set);
    });
    let converted = 0;
    for (const row of pending) {
        const next = convertLegacyUser(row.data, annual, year, Boolean(leaveYears.get(row.id)?.has(year)));
        if (!next) continue;
        await client.query('UPDATE users SET data = $2 WHERE id = $1', [row.id, JSON.stringify(next)]);
        converted += 1;
    }
    return { converted, typeCreated };
}

module.exports = { ANNUAL_TYPE, policyFromType, policiesFromTypes, convertLegacyUser, convertLegacyAllowances };
