import { describe, expect, it } from 'vitest';
import type { LeaveEntry } from '../../types';
import { moveLeave } from '../../utils/leaveEntry';
import { orderedRange, weekOf } from '../../utils/calendarModel';

const entry = (over: Partial<LeaveEntry> = {}): LeaveEntry => ({
    id: 'l1', memberId: 'm1', startDate: '2026-12-28', endDate: '2026-12-31', state: 'approved', entitlementId: 'annual', ...over,
});

describe('moveLeave (leave Phase 2c)', () => {
    it('moves every date by the same number of days', () => {
        const moved = moveLeave(entry({ excludedDates: ['2026-12-29'] }), 7);
        expect(moved.startDate).toBe('2027-01-04');
        expect(moved.endDate).toBe('2027-01-07');
        expect(moved.excludedDates).toEqual(['2027-01-05']);
    });

    it('moves backwards too, and leaves nothing changed for zero', () => {
        expect(moveLeave(entry(), -3).startDate).toBe('2026-12-25');
        const e = entry();
        expect(moveLeave(e, 0)).toBe(e);
    });

    it('carries a split across years with the move', () => {
        const moved = moveLeave(entry({ allocations: [{ entitlementId: 'annual', days: 2, targetYear: 2026 }, { entitlementId: 'annual', days: 2 }] }), 14);
        expect(moved.allocations).toEqual([{ entitlementId: 'annual', days: 2, targetYear: 2027 }, { entitlementId: 'annual', days: 2 }]);
        expect(moveLeave(entry({ allocations: [{ entitlementId: 'annual', days: 2, targetYear: 2026 }] }), 1).allocations?.[0].targetYear).toBe(2026);
    });

    it('asks again when the answer was for other dates', () => {
        expect(moveLeave(entry(), 1, { leaveApproval: true }).state).toBe('requested');
        expect(moveLeave(entry({ state: 'rejected' }), 1, { leaveApproval: true }).state).toBe('requested');
        expect(moveLeave(entry(), 1, { leaveApproval: false }).state).toBe('approved');
        expect(moveLeave(entry({ state: 'planned' }), 1, { leaveApproval: true }).state).toBe('planned');
    });
});

describe('week helpers', () => {
    it('gives the seven days of the week from the chosen first day', () => {
        expect(weekOf('2026-11-18', 1)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
        expect(weekOf('2026-11-16', 0)[0]).toBe('2026-11-15');
        expect(weekOf('2026-11-16', 6)[0]).toBe('2026-11-14');
        expect(weekOf('2026-12-30', 1)[6]).toBe('2027-01-03');
    });

    it('orders a dragged range', () => {
        expect(orderedRange('2026-11-20', '2026-11-16')).toEqual(['2026-11-16', '2026-11-20']);
        expect(orderedRange('2026-11-16', '2026-11-20')).toEqual(['2026-11-16', '2026-11-20']);
    });
});
