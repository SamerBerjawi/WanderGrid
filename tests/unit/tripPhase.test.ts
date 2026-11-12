import { describe, it, expect } from 'vitest';
import { tripIntent, tripPhase, isPastTrip, bucketOf, isTravelling } from '../../utils/tripsModel';
import type { Trip } from '../../types';

const today = '2026-06-15';
const trip = (over: Partial<Trip>): Trip => ({ id: 't', name: 'T', location: '', startDate: '', endDate: '', status: 'Planning', participants: [], ...over }) as Trip;

describe('trip intent and phase (audit F-06)', () => {
  it('reads intent from the stored status', () => {
    expect(tripIntent(trip({ status: 'Planning' }))).toBe('planned');
    expect(tripIntent(trip({ status: 'Upcoming' }))).toBe('confirmed');
    expect(tripIntent(trip({ status: 'Past' }))).toBe('confirmed');
    expect(tripIntent(trip({ status: 'Cancelled' }))).toBe('cancelled');
  });

  it('derives the phase from the dates', () => {
    expect(tripPhase(trip({ startDate: '2026-07-01', endDate: '2026-07-10' }), today)).toBe('upcoming');
    expect(tripPhase(trip({ startDate: '2026-06-10', endDate: '2026-06-20' }), today)).toBe('ongoing');
    expect(tripPhase(trip({ startDate: '2026-06-01', endDate: '2026-06-10' }), today)).toBe('past');
    expect(tripPhase(trip({}), today)).toBe('undated');
  });

  it('counts a trip that ends today as ongoing, and one-day trips by their start', () => {
    expect(tripPhase(trip({ startDate: '2026-06-10', endDate: '2026-06-15' }), today)).toBe('ongoing');
    expect(isPastTrip(trip({ startDate: '2026-06-14' }), today)).toBe(true);
    expect(isPastTrip(trip({ startDate: '2026-06-15' }), today)).toBe(false);
  });

  it('keeps a trip someone marked Past in the past column', () => {
    const t = trip({ status: 'Past', startDate: '2026-08-01', endDate: '2026-08-05' });
    expect(isPastTrip(t, today)).toBe(true);
    expect(bucketOf(t, today)).toBe('past');
    expect(isTravelling(t, today)).toBe(false);
  });

  it('puts a stale Upcoming trip with passed dates in past', () => {
    expect(bucketOf(trip({ status: 'Upcoming', startDate: '2026-01-01', endDate: '2026-01-05' }), today)).toBe('past');
  });
});
