import type { Trip, User } from '../types';
import { getCoordinatesSync } from '../services/geocoding';
import { countryCodeOf } from './countryCodes';
import { demonymCode, entryRule, validityRule, type EntryRule } from './entryRules';

/**
 * Document checks for a trip: for each traveller, the passport against every country the trip goes to. It says
 * when the passport is too short for a destination ("Thailand asks for 6 months after you leave"), whether a
 * pre-travel permit or visa is needed (ESTA, eTA, e-Visa), and when the person has not entered what the check
 * needs. Pure: the table is utils/entryRules.ts.
 */

const DAY_MS = 86_400_000;
const utc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / DAY_MS);

export const addMonths = (iso: string, months: number): string => {
    const d = new Date(utc(iso));
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + months);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
    return d.toISOString().slice(0, 10);
};

export const countryName = (code: string): string => {
    try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code; } catch { return code; }
};

/** The country code of a nationality as people write it: a country name, a demonym, or the passport's issuer. */
export const nationalityCode = (user: Pick<User, 'nationality' | 'passportIssuingEntity'>): string | undefined =>
    countryCodeOf(user.nationality) ?? demonymCode(user.nationality) ?? countryCodeOf(user.passportIssuingEntity) ?? demonymCode(user.passportIssuingEntity);

/** The countries a trip goes to: where its stops, stays, activities and legs are (a flight by its destination airport). */
export const tripCountries = (trip: Trip): string[] => {
    const codes = new Set<string>();
    const add = (code?: string) => { if (code && /^[A-Za-z]{2}$/.test(code)) codes.add(code.toUpperCase()); };
    add(trip.coordinates?.countryCode);
    (trip.locations || []).forEach(l => add(l.coordinates?.countryCode));
    (trip.accommodations || []).forEach(a => add(a.coordinates?.countryCode));
    (trip.activities || []).forEach(a => add(a.coordinates?.countryCode));
    (trip.transports || []).forEach(t => { if (t.destination) add(getCoordinatesSync(t.destination)?.countryCode); });
    return [...codes].sort();
};

export interface CountryFinding {
    code: string;
    name: string;
    entry: EntryRule;
    validity: {
        /** The date the passport has to be valid until. */
        until: string;
        months: number;
        ok: boolean;
        /** Days short of that date (0 when fine). */
        shortDays: number;
        /** True when the destination wants a passport issued recently and this one is older. */
        tooOld: boolean;
        note?: string;
    };
}

export type CheckState = 'ok' | 'check' | 'problem' | 'missing';

export interface MemberCheck {
    user: User;
    nationality?: string;
    expiry?: string;
    /** Days from the end of the trip to the passport's expiry (negative when it ends first). */
    daysAfterReturn?: number;
    findings: CountryFinding[];
    state: CheckState;
}

// Missing details outrank a permit to arrange: without a passport date nothing about validity can be judged.
const RANK: Record<CheckState, number> = { ok: 0, check: 1, missing: 2, problem: 3 };

/** The passport against each country for one traveller. */
export const checkMember = (trip: Trip, user: User, countries: string[]): MemberCheck => {
    const nationality = nationalityCode(user);
    const expiry = user.passportExpiryDate || undefined;
    const end = trip.endDate || trip.startDate;
    const abroad = countries.filter(c => c !== nationality);
    const findings: CountryFinding[] = abroad.map(code => {
        const rule = validityRule(code);
        const until = addMonths(end, rule.months);
        const shortDays = expiry ? Math.max(0, daysBetween(expiry, until)) : 0;
        const tooOld = Boolean(rule.maxAgeYears && user.passportIssueDate && addMonths(user.passportIssueDate, rule.maxAgeYears * 12) < until);
        return {
            code, name: countryName(code),
            entry: nationality ? entryRule(nationality, code) : { kind: 'unknown' as const },
            validity: { until, months: rule.months, ok: Boolean(expiry) && shortDays === 0 && !tooOld, shortDays, tooOld, note: rule.note },
        };
    });

    let state: CheckState = 'ok';
    const raise = (s: CheckState) => { if (RANK[s] > RANK[state]) state = s; };
    if (!expiry) raise('missing');
    if (expiry && daysBetween(expiry, end) > 0) raise('problem'); // it ends before the trip does
    for (const f of findings) {
        if (expiry && !f.validity.ok) raise('problem');
        if (f.entry.kind === 'eta' || f.entry.kind === 'evisa' || f.entry.kind === 'visa') raise('check');
    }
    if (!nationality && abroad.length > 0) raise('missing');
    return { user, nationality, expiry, daysAfterReturn: expiry ? daysBetween(end, expiry) : undefined, findings, state };
};

/** The check for every traveller on the trip. */
export const checkTrip = (trip: Trip, users: User[]): MemberCheck[] => {
    const countries = tripCountries(trip);
    return (trip.participants || [])
        .map(id => users.find(u => u.id === id))
        .filter((u): u is User => Boolean(u))
        .map(u => checkMember(trip, u, countries));
};

export interface CheckSummary { state: CheckState; text: string }

/** One line for the trip: the worst thing any traveller has to deal with. */
export const summarise = (checks: MemberCheck[], trip: Trip): CheckSummary | null => {
    if (checks.length === 0) return null;
    const countries = tripCountries(trip);
    const worst = checks.reduce<CheckState>((w, c) => (RANK[c.state] > RANK[w] ? c.state : w), 'ok');
    const count = (s: CheckState) => checks.filter(c => c.state === s).length;
    if (worst === 'problem') return { state: 'problem', text: count('problem') > 1 ? `Passport problem for ${count('problem')} travellers` : 'Passport problem' };
    if (worst === 'check') {
        const permits = checks.reduce((n, c) => n + c.findings.filter(f => f.entry.kind === 'eta' || f.entry.kind === 'evisa' || f.entry.kind === 'visa').length, 0);
        return { state: 'check', text: permits > 0 ? `${permits} ${permits === 1 ? 'permit' : 'permits'} to arrange` : 'Documents to check' };
    }
    if (worst === 'missing') return { state: 'missing', text: 'Add passport details' };
    // Nothing to do: only worth a word when the trip leaves the country someone is a citizen of.
    return countries.length > 0 && checks.some(c => c.findings.length > 0) ? { state: 'ok', text: 'Documents look fine' } : null;
};
