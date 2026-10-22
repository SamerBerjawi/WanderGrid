import { describe, expect, it } from 'vitest';
import { candidateToLeg, looksLikeFlightNumber, whyNotFound, type FlightCandidate, type LookupResult } from '../../services/flightLookup';

const end = (iata: string, local: string | null) => ({ iata, icao: '', name: iata, city: '', country: '', timezone: '', terminal: '1', gate: 'B7', baggage: '', scheduledLocal: local, scheduledUtc: null, estimatedLocal: null, estimatedUtc: null, actualLocal: null, actualUtc: null, delay: 0 });
const candidate: FlightCandidate = {
    source: 'flightstats', sourceLabel: 'FlightStats', confidence: 'schedule', flightIata: 'ME215', airline: { name: 'Middle East Airlines', iata: 'ME', icao: '' },
    status: 'scheduled', statusText: '', departure: end('BEY', '2026-10-24T07:05'), arrival: end('BRU', '2026-10-24T10:35'), aircraft: { model: 'Airbus A320', registration: 'T7-ME8' }, durationMinutes: 270, live: null,
};

describe('flight number detection', () => {
    it('accepts IATA, spaced and callsign forms', () => {
        for (const ok of ['ME215', 'me 215', 'KL-641', 'MEA215', '6E123', 'U21234']) expect(looksLikeFlightNumber(ok), ok).toBe(true);
    });
    it('rejects text that is not a flight number', () => {
        for (const no of ['', 'M', 'ME', 'hello', '12345', 'ME21599']) expect(looksLikeFlightNumber(no), no).toBe(false);
    });
});

describe('candidateToLeg', () => {
    it('fills airports, local times, airline, gates, aircraft and length', () => {
        expect(candidateToLeg(candidate)).toMatchObject({
            mode: 'Flight', origin: 'BEY', destination: 'BRU', provider: 'Middle East Airlines', providerCode: 'ME',
            departureDate: '2026-10-24', departureTime: '07:05', arrivalDate: '2026-10-24', arrivalTime: '10:35',
            departureTerminal: '1', departureGate: 'B7', vehicleModel: 'Airbus A320', tailNumber: 'T7-ME8', duration: 270,
        });
    });
    it('leaves the times alone when only the route is known', () => {
        const leg = candidateToLeg({ ...candidate, confidence: 'route-only', departure: end('BEY', null), arrival: end('BRU', null), durationMinutes: null });
        expect(leg.departureTime).toBeUndefined();
        expect(leg.origin).toBe('BEY');
    });
});

describe('whyNotFound', () => {
    const none = (attempts: LookupResult['attempts']): LookupResult => ({ ok: true, query: { flight: 'ME215', carrier: 'ME', number: '215', date: '' }, candidates: [], attempts });
    const iso = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    it('blames the network when every source failed', () => {
        expect(whyNotFound(none([{ source: 'flightstats', state: 'error', ms: 1 }, { source: 'adsbdb', state: 'error', ms: 1 }]), iso(1))).toMatch(/didn't answer/);
    });
    it('explains that free schedules do not reach far dates', () => {
        expect(whyNotFound(none([{ source: 'flightstats', state: 'skipped', ms: 0 }]), iso(90))).toMatch(/AeroDataBox/);
    });
    it('otherwise asks to check the number and date', () => {
        expect(whyNotFound(none([{ source: 'flightstats', state: 'none', ms: 1 }]), iso(1))).toMatch(/Check the number/);
    });
});
