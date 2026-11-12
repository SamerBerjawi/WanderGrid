import { describe, it, expect } from 'vitest';
import { tripIntent, withIntent, tripPhase, isPastTrip, bucketOf, isTravelling } from '../../utils/tripsModel';
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

describe('stored trip intent (audit F-06)', () => {
  it('keeps what a trip was once it is Past, and defaults to confirmed without one', () => {
    expect(tripIntent(trip({ status: 'Past', intent: 'planned' }))).toBe('planned');
    expect(tripIntent(trip({ status: 'Past', intent: 'confirmed' }))).toBe('confirmed');
    expect(tripIntent(trip({ status: 'Past' }))).toBe('confirmed');
  });

  it('lets the status decide while the trip is not Past', () => {
    expect(tripIntent(trip({ status: 'Planning', intent: 'confirmed' }))).toBe('planned');
    expect(tripIntent(trip({ status: 'Upcoming', intent: 'planned' }))).toBe('confirmed');
    expect(tripIntent(trip({ status: 'Cancelled', intent: 'confirmed' }))).toBe('cancelled');
  });

  it('withIntent records the intent when the status changes', () => {
    const planned = trip({ status: 'Planning' });
    expect(withIntent({ ...planned, status: 'Upcoming' }, planned).intent).toBe('confirmed');
    expect(withIntent({ ...planned, status: 'Cancelled' }, planned).intent).toBe('cancelled');
  });

  it('withIntent keeps a planned trip planned when it moves to Past, and a confirmed one confirmed', () => {
    const planned = trip({ status: 'Planning' });
    const past = withIntent({ ...planned, status: 'Past' }, planned);
    expect(past.status).toBe('Past');
    expect(past.intent).toBe('planned');
    const confirmed = trip({ status: 'Upcoming' });
    expect(withIntent({ ...confirmed, status: 'Past' }, confirmed).intent).toBe('confirmed');
  });

  it('withIntent leaves an already Past trip as it was, and does not change a trip needlessly', () => {
    const was = trip({ status: 'Past', intent: 'planned' });
    expect(withIntent(was, was)).toBe(was);
    const same = trip({ status: 'Planning', intent: 'planned' });
    expect(withIntent(same, same)).toBe(same);
    expect(withIntent(trip({ status: 'Past' })).intent).toBe('confirmed');
  });
});

