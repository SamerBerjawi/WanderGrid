import type { Transport, Trip } from '../../types';
import type { JourneyRecord } from '../../utils/journeysModel';

/** A flight with sensible defaults; times are local to their airports. */
export const flight = (id: string, origin: string, destination: string, depDate: string, depTime: string, arrDate: string, arrTime: string, extra: Partial<Transport> = {}): Transport => ({
    id, itineraryId: `it-${id}`, type: 'One-Way', mode: 'Flight', provider: 'KLM', identifier: `KL${id}`, confirmationCode: '',
    origin, destination, departureDate: depDate, departureTime: depTime, arrivalDate: arrDate, arrivalTime: arrTime, ...extra,
});

export const independent: Trip = { id: 'unassigned', name: 'Independent Flights', location: '', startDate: '', endDate: '', status: 'Planning', participants: [], transports: [] } as unknown as Trip;
export const tripOf = (id: string, name = id): Trip => ({ id, name, location: '', startDate: '', endDate: '', status: 'Upcoming', participants: [], transports: [] } as unknown as Trip);

export const record = (f: Transport, trip: Trip = independent): JourneyRecord => ({ flight: f, trip });
