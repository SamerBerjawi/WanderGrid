import { describe, expect, it } from 'vitest';
import { connectionAlert, diffAlerts, type FlightSnapshot } from '../../utils/flightAlerts';
import { flight } from './helpers';

const f = flight('1', 'FRA', 'JFK', '2027-03-02', '10:55', '2027-03-02', '13:35', { identifier: 'LH400' });
const base: FlightSnapshot = { status: 'scheduled', depDelay: 0, arrDelay: 0, depGate: '', depTerminal: '', arrGate: '', arrTerminal: '', baggage: '' };

describe('diffAlerts', () => {
    it('says nothing when nothing changed', () => {
        expect(diffAlerts(f, base, base)).toEqual([]);
    });
    it('reports a first look that is already late, but not a small delay', () => {
        expect(diffAlerts(f, undefined, { ...base, arrDelay: 35 })[0]).toMatchObject({ kind: 'delay', severity: 'warn', title: 'Delayed 35 min' });
        expect(diffAlerts(f, undefined, { ...base, arrDelay: 10 })).toEqual([]);
    });
    it('reports a delay that grew by 10 minutes, not one that wobbled', () => {
        const was = { ...base, arrDelay: 20 };
        expect(diffAlerts(f, was, { ...base, arrDelay: 25 })).toEqual([]);
        expect(diffAlerts(f, was, { ...base, arrDelay: 45 })[0].detail).toContain('was 20');
    });
    it('makes an hour late a bad one, and a recovered delay good news', () => {
        expect(diffAlerts(f, base, { ...base, arrDelay: 75 })[0].severity).toBe('bad');
        expect(diffAlerts(f, { ...base, arrDelay: 40 }, base)[0]).toMatchObject({ kind: 'on-time', severity: 'info' });
    });
    it('reports gate, terminal and baggage changes once they are known', () => {
        const kinds = diffAlerts(f, { ...base, depGate: 'A1', depTerminal: '2' }, { ...base, depGate: 'Z19', depTerminal: '1', baggage: '7' }).map(a => a.kind);
        expect(kinds).toEqual(['gate', 'terminal', 'baggage']);
        // A first look with a gate is not a change.
        expect(diffAlerts(f, undefined, { ...base, depGate: 'Z19' })).toEqual([]);
    });
    it('reports cancellation and diversion only the first time', () => {
        expect(diffAlerts(f, base, { ...base, status: 'cancelled' })[0]).toMatchObject({ kind: 'cancelled', severity: 'bad' });
        expect(diffAlerts(f, { ...base, status: 'cancelled' }, { ...base, status: 'cancelled' })).toEqual([]);
        expect(diffAlerts(f, base, { ...base, status: 'diverted' })[0].kind).toBe('diverted');
    });
    it('gives the same alert the same id, so it is not raised twice', () => {
        const a = diffAlerts(f, base, { ...base, arrDelay: 35 })[0];
        const b = diffAlerts(f, base, { ...base, arrDelay: 35 })[0];
        expect(a.id).toBe(b.id);
    });
});

describe('connectionAlert', () => {
    const second = flight('2', 'JFK', 'LAX', '2027-03-02', '17:00', '2027-03-02', '20:00', { identifier: 'DL12' });
    const dep = Date.parse('2027-03-02T21:00:00Z');
    it('is silent when there is time', () => {
        expect(connectionAlert(f, second, dep - 90 * 60000, dep)).toBeNull();
    });
    it('warns under an hour, calls under half an hour bad, and says when it is missed', () => {
        expect(connectionAlert(f, second, dep - 45 * 60000, dep)).toMatchObject({ severity: 'warn', title: 'Tight connection in JFK: 45 min' });
        expect(connectionAlert(f, second, dep - 20 * 60000, dep)?.severity).toBe('bad');
        expect(connectionAlert(f, second, dep + 5 * 60000, dep)?.title).toContain('may miss DL12');
    });
    it('ignores times it cannot read', () => {
        expect(connectionAlert(f, second, NaN, dep)).toBeNull();
    });
});
