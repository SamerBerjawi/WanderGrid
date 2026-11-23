import type { ItemPlan, PlanBookingStatus, PlanPriority } from '../types';

/**
 * Reading the planning metadata on legs, stays and activities (types.ts `ItemPlan`, docs/TRIP_INTERCHANGE.md).
 * Kept apart from the importer so the pages can use it without loading the file checks.
 */

type Planned = { plan?: ItemPlan; identifier?: string; confirmationCode?: string };

/** The booking status to show and export: what the plan says, unless a number or booking reference says it's booked. */
export const bookingStatusOf = (item: Planned): PlanBookingStatus | undefined => {
    const s = item.plan?.bookingStatus;
    if ((s === 'unbooked' || s === 'candidate') && (item.identifier || item.confirmationCode)) return 'booked';
    return s;
};

/** Proposed, not booked: a planned leg or activity no one has booked yet. Never shown as travelled or confirmed. */
export const isProposed = (item: Planned): boolean => {
    const s = bookingStatusOf(item);
    return s === 'unbooked' || s === 'candidate';
};

export type PlanBadgeTone = 'planned' | 'recommended' | 'optional' | 'alternative' | 'candidate' | 'unbooked' | 'booked' | 'paid' | 'gem';

export interface PlanBadge { tone: PlanBadgeTone; label: string }

const PRIORITY_BADGE: Partial<Record<PlanPriority, PlanBadge>> = {
    recommended: { tone: 'recommended', label: 'Recommended' },
    optional: { tone: 'optional', label: 'Optional' },
    alternative: { tone: 'alternative', label: 'Alternative' },
};

/**
 * The labels an item carries on the trip pages: its priority, a hidden gem, and whether it is booked. Items entered
 * as bookings (no plan) carry none, so existing trips look as before.
 */
export const planBadges = (item: Planned & { cost?: number }, options: { showUnbooked?: boolean } = {}): PlanBadge[] => {
    const out: PlanBadge[] = [];
    const p = item.plan;
    if (!p) return out;
    const priority = p.priority && PRIORITY_BADGE[p.priority];
    if (priority) out.push(priority);
    if (p.hiddenGem) out.push({ tone: 'gem', label: 'Hidden gem' });
    const status = bookingStatusOf(item);
    if (status === 'booked') out.push({ tone: 'booked', label: 'Booked' });
    else if (status === 'paid') out.push({ tone: 'paid', label: 'Paid' });
    else if ((status === 'unbooked' || status === 'candidate') && options.showUnbooked) out.push({ tone: 'unbooked', label: 'Not booked' });
    return out;
};
