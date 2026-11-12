import { describe, expect, it } from 'vitest';
import { isRealTrip, tripKind } from '../../utils/tripKind';

describe('tripKind', () => {
    it('trusts a stored kind', () => {
        expect(tripKind({ id: 'x', kind: 'timeoff' })).toBe('timeoff');
        expect(tripKind({ id: 'leave-1', kind: 'trip' })).toBe('trip');
    });
    it('reads records saved before kind existed', () => {
        expect(tripKind({ id: 't1' })).toBe('trip');
        expect(tripKind({ id: 'b1', isBundleOnly: true, hideInPlanner: true })).toBe('bundle');
        expect(tripKind({ id: 'leave-9', hideInPlanner: true })).toBe('timeoff');
        expect(tripKind({ id: 'h1', hideInPlanner: true })).toBe('bundle');
    });
    it('only a trip is a real trip', () => {
        expect(isRealTrip({ id: 't1' })).toBe(true);
        expect(isRealTrip({ id: 'leave-1', hideInPlanner: true })).toBe(false);
        expect(isRealTrip({ id: 'b', kind: 'bundle' })).toBe(false);
    });
});
