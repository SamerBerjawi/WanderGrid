import { describe, expect, it } from 'vitest';
import type { User } from '../../types';
import { cardsForFlight, cardsForStay, checkProgram, formatMeasure, levelsText, matchesFlight, newProgram, parseLevels, tierProgress, type LoyaltyProgram } from '../../utils/loyalty';
import { flight, record, tripOf } from './helpers';

const klm: LoyaltyProgram = { id: 'a', kind: 'airline', provider: 'KLM', programme: 'Flying Blue', number: 'FB123', measure: 'km', levels: [{ name: 'Silver', at: 5000 }, { name: 'Gold', at: 10000 }] };
const marriott: LoyaltyProgram = { id: 'h', kind: 'hotel', provider: 'Marriott', programme: 'Bonvoy', number: 'MB9' };
const user = (id: string, name: string, loyalty: LoyaltyProgram[] = []): User => ({ id, name, role: 'Partner', leaveBalance: 0, takenLeave: 0, allowance: 0, loyalty });
const sam = user('u1', 'Sam', [klm, marriott]);
const anna = user('u2', 'Anna', [{ ...klm, id: 'b', number: 'FB777' }]);
const trip = { ...tripOf('t1'), participants: ['u1', 'u2'] };
const leg = (id: string, date: string, km: number, extra = {}) => record(flight(id, 'AMS', 'JFK', date, '10:00', date, '13:00', { distance: km, ...extra }), trip);

describe('matching a programme to a flight', () => {
    it('matches by name, longer name, or airline code, and not another airline', () => {
        expect(matchesFlight(klm, flight('1', 'AMS', 'JFK', '2026-02-01', '10:00', '2026-02-01', '13:00'))).toBe(true);
        expect(matchesFlight({ ...klm, provider: 'kl' }, flight('1', 'AMS', 'JFK', '2026-02-01', '10:00', '2026-02-01', '13:00', { providerCode: 'KL' }))).toBe(true);
        expect(matchesFlight(klm, flight('1', 'AMS', 'JFK', '2026-02-01', '10:00', '2026-02-01', '13:00', { provider: 'KLM Royal Dutch Airlines' }))).toBe(true);
        expect(matchesFlight(klm, flight('1', 'AMS', 'JFK', '2026-02-01', '10:00', '2026-02-01', '13:00', { provider: 'Delta' }))).toBe(false);
        expect(matchesFlight(marriott, flight('1', 'AMS', 'JFK', '2026-02-01', '10:00', '2026-02-01', '13:00'))).toBe(false);
    });
});

describe('numbers on a pass or stay', () => {
    it('shows the numbers of the people flying, or everyone on the trip when nobody is marked', () => {
        const all = leg('1', '2026-03-01', 5800);
        expect(cardsForFlight(all, [sam, anna]).map(c => c.program.number)).toEqual(['FB123', 'FB777']);
        const some = leg('2', '2026-03-01', 5800, { passengers: ['Anna'] });
        expect(cardsForFlight(some, [sam, anna]).map(c => c.member.name)).toEqual(['Anna']);
    });

    it('leaves out programmes without a number or for another airline', () => {
        const other = leg('3', '2026-03-01', 5800, { provider: 'Delta' });
        expect(cardsForFlight(other, [sam, anna])).toEqual([]);
        expect(cardsForFlight(leg('4', '2026-03-01', 1), [user('u3', 'Zed', [{ ...klm, number: ' ' }])])).toEqual([]);
    });

    it('matches hotel brands against the stay name', () => {
        expect(cardsForStay({ name: 'Amsterdam Marriott Hotel' }, [sam, anna]).map(c => c.member.name)).toEqual(['Sam']);
        expect(cardsForStay({ name: 'Hotel Pulitzer' }, [sam])).toEqual([]);
    });
});

describe('status progress', () => {
    const records = [
        leg('1', '2026-01-10', 5800),
        leg('2', '2026-02-10', 5800, { passengers: ['Anna'] }),
        leg('3', '2025-12-30', 5800),
        leg('4', '2026-09-01', 5800), // after today
        leg('5', '2026-03-10', 5800, { provider: 'Delta' }),
        leg('6', '2026-04-10', 3000, { isApproximate: true }),
    ];
    it('counts only this year, up to today, the airline, the member, and not cancelled flights', () => {
        const p = tierProgress(klm, sam, records, '2026-06-01');
        expect(p).toMatchObject({ year: 2026, value: 5800, flights: 1, reached: { name: 'Silver' }, next: { name: 'Gold' }, remaining: 4200 });
        expect(p.fraction).toBeCloseTo(0.16, 2);
        expect(tierProgress(klm, anna, records, '2026-06-01').value).toBe(11600); // leg 1 has no passengers marked, so she is on it too
    });
    it('reaches the top, counts flights, and copes with no levels', () => {
        const many = [leg('1', '2026-01-10', 6000), leg('2', '2026-02-10', 6000)];
        expect(tierProgress(klm, sam, many, '2026-06-01')).toMatchObject({ reached: { name: 'Gold' }, next: undefined, remaining: 0, fraction: 1 });
        expect(tierProgress({ ...klm, measure: 'flights', levels: [{ name: 'Silver', at: 3 }] }, sam, many, '2026-06-01')).toMatchObject({ value: 2, remaining: 1 });
        expect(tierProgress({ ...klm, levels: undefined }, sam, many, '2026-06-01')).toMatchObject({ reached: undefined, fraction: 1 });
    });
});

describe('levels text and checks', () => {
    it('reads levels from text, lowest first, ignoring junk', () => {
        expect(parseLevels('Gold 10000, Silver: 5000; junk, Platinum 0')).toEqual([{ name: 'Silver', at: 5000 }, { name: 'Gold', at: 10000 }]);
        expect(levelsText(parseLevels('Silver 5000, Gold 10000'))).toBe('Silver 5000, Gold 10000');
    });
    it('formats and checks', () => {
        expect(formatMeasure(12400, 'km')).toBe('12,400 km');
        expect(formatMeasure(1, 'flights')).toBe('1 flight');
        expect(checkProgram(newProgram('airline'))).toBe('Which airline is it for?');
        expect(checkProgram({ ...newProgram('hotel'), provider: 'Hilton' })).toBe('Add the membership number.');
        expect(checkProgram({ ...newProgram('hotel'), provider: 'Hilton', number: '1' })).toBeNull();
    });
});
