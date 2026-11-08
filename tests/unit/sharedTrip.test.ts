import { describe, expect, it } from 'vitest';
import type { Accommodation, Activity } from '../../types';
import { buildDays, focusDay, namesText, sharedTokenFrom, asTrip, type SharedSnapshot } from '../../utils/sharedTrip';
import { flight } from './helpers';

const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCD12';
const stay = (over: Partial<Accommodation> = {}): Accommodation => ({ id: 's1', name: 'Hotel Avenida', address: 'Av. da Liberdade', type: 'Hotel', checkInDate: '2027-05-01', checkInTime: '15:00', checkOutDate: '2027-05-05', checkOutTime: '11:00', ...over });
const activity = (over: Partial<Activity> = {}): Activity => ({ id: 'a1', date: '2027-05-02', time: '19:00', title: 'Dinner', location: 'Belcanto', ...over });

describe('the public address', () => {
    it('reads the token of /s/<token> and nothing else', () => {
        expect(sharedTokenFrom(`/s/${TOKEN}`)).toBe(TOKEN);
        expect(sharedTokenFrom(`/s/${TOKEN}/`)).toBe(TOKEN);
        expect(sharedTokenFrom('/s/short')).toBeNull();
        expect(sharedTokenFrom(`/trip/${TOKEN}`)).toBeNull();
        expect(sharedTokenFrom(`/s/${TOKEN}/extra`)).toBeNull();
        expect(sharedTokenFrom('/')).toBeNull();
    });
});

describe('days of the shared trip', () => {
    const transports = [
        flight('1', 'BRU', 'LIS', '2027-05-01', '08:00', '2027-05-01', '10:00', { departureTerminal: '2', departureGate: 'B4' }),
        flight('2', 'LIS', 'BRU', '2027-05-05', '18:00', '2027-05-05', '22:00'),
        flight('3', 'LIS', 'LIS', '2027-05-03', '09:00', '2027-05-03', '10:00', { isLayover: true }),
    ];
    const days = buildDays({ transports, stays: [stay()], activities: [activity(), activity({ id: 'a2', title: 'Untimed walk', time: '' })] });

    it('lists days with something on them in order, leaving out layovers', () => {
        expect(days.map(d => d.date)).toEqual(['2027-05-01', '2027-05-02', '2027-05-05']);
    });

    it('orders a day by time with untimed things last', () => {
        expect(days[0].items.map(i => i.kind)).toEqual(['flight', 'check-in']);
        expect(days[1].items.map(i => i.title)).toEqual(['Dinner', 'Untimed walk']);
        expect(days[2].items.map(i => i.kind)).toEqual(['check-out', 'flight']);
    });

    it('describes a flight with its carrier, arrival and gate, and keeps the leg for its status', () => {
        const first = days[0].items[0];
        expect(first.title).toBe('BRU → LIS');
        expect(first.detail).toBe('KLM KL1 · arrives 10:00 · departs Terminal 2, Gate B4');
        expect(first.leg?.id).toBe('1');
        expect(days[0].items[1].detail).toBe('Av. da Liberdade');
    });

    it('says next day when a flight lands after midnight', () => {
        const [d] = buildDays({ transports: [flight('9', 'JFK', 'BRU', '2027-05-01', '21:00', '2027-05-02', '10:30')], stays: [], activities: [] });
        expect(d.items[0].detail).toContain('arrives 10:30 next day');
    });
});

describe('small helpers', () => {
    it('picks the day to show: today, else the next, else the last', () => {
        const days = [{ date: '2027-05-01', items: [] }, { date: '2027-05-03', items: [] }];
        expect(focusDay(days, '2027-05-03')).toBe('2027-05-03');
        expect(focusDay(days, '2027-05-02')).toBe('2027-05-03');
        expect(focusDay(days, '2027-06-01')).toBe('2027-05-03');
        expect(focusDay([], '2027-05-01')).toBeUndefined();
    });
    it('writes names as a list', () => {
        expect(namesText([])).toBe('');
        expect(namesText(['Sam'])).toBe('Sam');
        expect(namesText(['Sam', 'Anna', 'Joe'])).toBe('Sam, Anna and Joe');
    });
    it('turns a snapshot into a trip for the map', () => {
        const snap: SharedSnapshot = { trip: { name: 'Lisbon', location: 'Lisbon', startDate: '2027-05-01', endDate: '2027-05-05' }, travellers: [], transports: [], stays: [stay()], activities: [], places: [] };
        expect(asTrip(snap)).toMatchObject({ id: 'shared', name: 'Lisbon', participants: [], accommodations: [{ name: 'Hotel Avenida' }] });
    });
});
