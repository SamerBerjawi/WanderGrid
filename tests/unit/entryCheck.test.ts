import { describe, expect, it } from 'vitest';
import type { Trip, User } from '../../types';
import { addMonths, checkMember, checkTrip, nationalityCode, summarise, tripCountries } from '../../utils/entryCheck';
import { demonymCode, entryRule, validityRule } from '../../utils/entryRules';

const user = (over: Partial<User> = {}): User => ({
    id: 'u1', name: 'Sam', role: 'Admin', leaveBalance: 0, takenLeave: 0, allowance: 0,
    nationality: 'French', passportIssueDate: '2022-01-10', passportExpiryDate: '2032-01-10', ...over,
});
const trip = (cc: string[], start = '2027-03-22', end = '2027-04-02', over: Partial<Trip> = {}): Trip => ({
    id: 't', name: 'Trip', location: '', startDate: start, endDate: end, status: 'Upcoming', participants: ['u1'],
    locations: cc.map((c, i) => ({ id: `l${i}`, name: c, startDate: start, endDate: end, coordinates: { lat: 0, lng: 0, countryCode: c } })), ...over,
});

describe('nationality', () => {
    it('reads a country name, a demonym or the passport issuer', () => {
        expect(nationalityCode({ nationality: 'France' })).toBe('FR');
        expect(nationalityCode({ nationality: 'French' })).toBe('FR');
        expect(nationalityCode({ nationality: 'Dutch' })).toBe('NL');
        expect(nationalityCode({ nationality: '', passportIssuingEntity: 'Belgium' })).toBe('BE');
        expect(nationalityCode({ nationality: 'Martian' })).toBeUndefined();
        expect(demonymCode(' Belgian ')).toBe('BE');
    });
});

describe('entry rules', () => {
    it('knows the permits for the common cases', () => {
        expect(entryRule('FR', 'US')).toMatchObject({ kind: 'eta', doc: 'ESTA' });
        expect(entryRule('CA', 'US').kind).toBe('free');
        expect(entryRule('ZA', 'US').kind).toBe('visa');
        expect(entryRule('US', 'GB')).toMatchObject({ kind: 'eta', doc: 'UK ETA' });
        expect(entryRule('IE', 'GB').kind).toBe('free');
        expect(entryRule('US', 'CA')).toMatchObject({ kind: 'free' });
        expect(entryRule('FR', 'CA')).toMatchObject({ kind: 'eta', doc: 'eTA' });
        expect(entryRule('NZ', 'AU').kind).toBe('free');
        expect(entryRule('FR', 'AU')).toMatchObject({ kind: 'eta', doc: 'eVisitor' });
        expect(entryRule('US', 'AU')).toMatchObject({ kind: 'eta', doc: 'ETA' });
        expect(entryRule('FR', 'IN')).toMatchObject({ kind: 'evisa' });
        expect(entryRule('FR', 'TH')).toMatchObject({ kind: 'free', days: 60 });
    });

    it('treats Schengen as free movement for Europeans and 90 days for the usual visitors', () => {
        expect(entryRule('BE', 'FR').note).toMatch(/Free movement/);
        expect(entryRule('US', 'DE')).toMatchObject({ kind: 'free', days: 90 });
        expect(entryRule('XX', 'DE').kind).toBe('unknown');
    });

    it('says unknown, not fine, for what the table does not cover', () => {
        expect(entryRule('FR', 'BR').kind).toBe('unknown');
        expect(entryRule('XX', 'TH').kind).toBe('unknown');
    });

    it('knows how long a passport must stay valid', () => {
        expect(validityRule('TH').months).toBe(6);
        expect(validityRule('DE')).toMatchObject({ months: 3, maxAgeYears: 10 });
        expect(validityRule('ZA').months).toBe(1);
        expect(validityRule('US').months).toBe(0);
    });
});

describe('dates', () => {
    it('adds months without spilling over, clamping to the end of a short month', () => {
        expect(addMonths('2027-04-02', 6)).toBe('2027-10-02');
        expect(addMonths('2027-08-31', 6)).toBe('2028-02-29');
        expect(addMonths('2027-04-02', 0)).toBe('2027-04-02');
        expect(addMonths('2027-11-15', 3)).toBe('2028-02-15');
    });
});

describe('where a trip goes', () => {
    it('collects the countries of its stops, stays, activities and legs', () => {
        const t = trip(['PT'], undefined, undefined, {
            coordinates: { lat: 0, lng: 0, countryCode: 'pt' },
            accommodations: [{ id: 's', name: 'H', address: '', type: 'Hotel', checkInDate: '', checkInTime: '', checkOutDate: '', checkOutTime: '', coordinates: { lat: 0, lng: 0, countryCode: 'ES' } }],
            activities: [{ id: 'a', date: '', time: '', title: 'x', coordinates: { lat: 0, lng: 0, countryCode: 'FR' } }],
        });
        expect(tripCountries(t)).toEqual(['ES', 'FR', 'PT']);
    });
});

describe('checking a traveller', () => {
    it('flags a passport too short for a destination that wants six months', () => {
        const check = checkMember(trip(['TH']), user({ passportExpiryDate: '2027-04-15' }), ['TH']);
        expect(check.state).toBe('problem');
        const f = check.findings[0];
        expect(f.validity).toMatchObject({ until: '2027-10-02', months: 6, ok: false, shortDays: 170 });
        expect(check.daysAfterReturn).toBe(13);
    });

    it('is fine when the passport outlasts the rule, and asks for the permit when one is needed', () => {
        const ok = checkMember(trip(['TH']), user(), ['TH']);
        expect(ok.state).toBe('ok');
        const permit = checkMember(trip(['US']), user(), ['US']);
        expect(permit.state).toBe('check');
        expect(permit.findings[0].entry.doc).toBe('ESTA');
    });

    it('flags a passport that ends before the trip does', () => {
        const check = checkMember(trip(['US']), user({ passportExpiryDate: '2027-03-30' }), ['US']);
        expect(check.state).toBe('problem');
        expect(check.daysAfterReturn).toBe(-3);
    });

    it('flags an old passport for the Schengen area', () => {
        const check = checkMember(trip(['DE'], '2027-03-22', '2027-03-29'), user({ nationality: 'American', passportIssueDate: '2017-01-01', passportExpiryDate: '2031-01-01' }), ['DE']);
        expect(check.findings[0].validity.tooOld).toBe(true);
        expect(check.state).toBe('problem');
    });

    it('does not check a traveller against their own country, and is fine within the EU', () => {
        expect(checkMember(trip(['FR']), user(), ['FR']).findings).toEqual([]);
        expect(checkMember(trip(['DE']), user(), ['DE']).state).toBe('ok');
    });

    it('asks for passport details when there are none, and for a nationality when it is unknown', () => {
        expect(checkMember(trip(['US']), user({ passportExpiryDate: undefined }), ['US']).state).toBe('missing');
        const noNat = checkMember(trip(['US']), user({ nationality: 'Martian' }), ['US']);
        expect(noNat.state).toBe('missing');
        expect(noNat.findings[0].entry.kind).toBe('unknown');
    });
});

describe('the trip summary', () => {
    const users = [user(), user({ id: 'u2', name: 'Ana', nationality: 'American', passportExpiryDate: '2027-04-10' })];

    it('says the worst thing any traveller has to deal with', () => {
        const t = trip(['TH'], undefined, undefined, { participants: ['u1', 'u2'] });
        const checks = checkTrip(t, users);
        expect(checks.map(c => c.state)).toEqual(['ok', 'problem']);
        expect(summarise(checks, t)).toEqual({ state: 'problem', text: 'Passport problem' });
    });

    it('counts permits, and says all is well, or nothing when there is nothing to check', () => {
        const t = trip(['US'], undefined, undefined, { participants: ['u1'] });
        expect(summarise(checkTrip(t, users), t)).toEqual({ state: 'check', text: '1 permit to arrange' });
        const eu = trip(['DE'], undefined, undefined, { participants: ['u1'] });
        expect(summarise(checkTrip(eu, users), eu)).toEqual({ state: 'ok', text: 'Documents look fine' });
        const home = trip(['FR'], undefined, undefined, { participants: ['u1'] });
        expect(summarise(checkTrip(home, users), home)).toBeNull();
        expect(summarise([], home)).toBeNull();
    });
});
