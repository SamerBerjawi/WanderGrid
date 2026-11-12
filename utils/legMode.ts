import type { TransportMode } from '../types';

export const TRANSPORT_MODES: TransportMode[] = ['Flight', 'Train', 'Bus', 'Car Rental', 'Personal Car', 'Cruise', 'Ferry'];

/**
 * Is this leg a flight? One answer for the Flights page, the totals, achievements and the map (audit F-05).
 * A leg saved without a mode is a flight, because the app only ever stored flights before other modes existed.
 * The server now fills the mode on write, and migration 0002 fills it on stored records.
 */
export const isFlightLeg = (leg: { mode?: string | null } | null | undefined): boolean => !!leg && (!leg.mode || leg.mode === 'Flight');
