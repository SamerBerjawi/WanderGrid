import { describe, expect, it } from 'vitest';
import { isMyRecord, isMyTrip, parseScope, scopeRecords, scopeTrips } from '../../utils/scope';

const me = { id: 'u1', email: 'Me@x.com', role: 'Partner' };
const admin = { id: 'a1', role: 'Admin' };

describe('scope', () => {
    it('defaults to mine and only accepts everyone explicitly', () => {
        expect(parseScope(undefined)).toBe('mine');
        expect(parseScope('junk')).toBe('mine');
        expect(parseScope('everyone')).toBe('everyone');
    });
    it('a trip is mine by id or email, case-insensitively', () => {
        expect(isMyTrip({ participants: ['u1'] }, me)).toBe(true);
        expect(isMyTrip({ participants: ['me@x.com'] }, me)).toBe(true);
        expect(isMyTrip({ participants: ['u2'] }, me)).toBe(false);
        expect(isMyTrip({}, me)).toBe(false);
        expect(isMyTrip({ participants: ['u1'] }, null)).toBe(false);
    });
    it('a record is mine by owner; an ownerless one belongs to the admin', () => {
        expect(isMyRecord({ ownerId: 'u1' }, me)).toBe(true);
        expect(isMyRecord({ ownerId: 'u2' }, me)).toBe(false);
        expect(isMyRecord({}, me)).toBe(false);
        expect(isMyRecord({}, admin)).toBe(true);
        expect(isMyRecord({ ownerId: 'u1' }, admin)).toBe(false);
    });
    it('everyone keeps all, mine filters, and no user keeps all', () => {
        const trips = [{ participants: ['u1'] }, { participants: ['u2'] }];
        expect(scopeTrips(trips, 'mine', me)).toHaveLength(1);
        expect(scopeTrips(trips, 'everyone', me)).toHaveLength(2);
        expect(scopeTrips(trips, 'mine', null)).toHaveLength(2);
        const recs = [{ ownerId: 'u1' }, { ownerId: 'u2' }, {}];
        expect(scopeRecords(recs, 'mine', me)).toHaveLength(1);
        expect(scopeRecords(recs, 'mine', admin)).toHaveLength(1);
        expect(scopeRecords(recs, 'everyone', me)).toHaveLength(3);
    });
});
