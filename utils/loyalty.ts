import type { Accommodation, Transport, User } from '../types';
import { carrierLabel, journeyKm, journeyStatus, passengersOf, type JourneyRecord } from './journeysModel';

/**
 * Loyalty wallet: each member's frequent-flyer and hotel numbers, matched to the carrier or hotel they are for,
 * and status progress counted from the flights already logged. A programme names the airline or hotel brand it
 * belongs to ("KLM", "Marriott") and the member's number. Status levels are the member's own ("Silver 25000,
 * Gold 50000"), counted in kilometres or flights flown with that airline in the calendar year, because airlines
 * change their rules and the app should not pretend to know them. Pure.
 */

export type LoyaltyKind = 'airline' | 'hotel';
export type LoyaltyMeasure = 'km' | 'flights';

export interface LoyaltyLevel { name: string; at: number }

export interface LoyaltyProgram {
    id: string;
    kind: LoyaltyKind;
    /** The airline or hotel brand this belongs to, as a name or an airline code ("KLM", "KL", "Marriott"). */
    provider: string;
    /** The scheme's own name, when it differs ("Flying Blue", "Bonvoy"). */
    programme?: string;
    number: string;
    /** The status the member holds today, as the airline names it. */
    tier?: string;
    measure?: LoyaltyMeasure;
    levels?: LoyaltyLevel[];
}

export const norm = (s: string | undefined) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Whether two brand names are the same, allowing one to be a longer form of the other ("KLM" and "KLM Royal Dutch Airlines"). */
const sameBrand = (a: string, b: string): boolean => {
    const x = norm(a), y = norm(b);
    if (!x || !y) return false;
    if (x === y) return true;
    const [short, long] = x.length <= y.length ? [x, y] : [y, x];
    return short.length >= 3 && (` ${long} `).includes(` ${short} `);
};

export const programLabel = (p: LoyaltyProgram): string => p.programme?.trim() || p.provider.trim();

/** Whether a flight is on the airline a programme belongs to. */
export const matchesFlight = (p: LoyaltyProgram, t: Transport): boolean => {
    if (p.kind !== 'airline' || t.mode !== 'Flight') return false;
    const code = p.provider.trim().toUpperCase();
    if (/^[A-Z0-9]{2,3}$/.test(code) && [t.providerCode, t.provider].some(c => (c || '').trim().toUpperCase() === code)) return true;
    return [carrierLabel(t), t.provider].some(name => sameBrand(p.provider, name || ''));
};

export const matchesStay = (p: LoyaltyProgram, a: Pick<Accommodation, 'name'>): boolean => p.kind === 'hotel' && sameBrand(p.provider, a.name);

/** Whether a name or id on a trip is this member. */
export const isMember = (user: User, who: string): boolean => who === user.id || norm(who) === norm(user.name);

export interface WalletCard { member: User; program: LoyaltyProgram }

const cardsWhere = (members: User[], keep: (p: LoyaltyProgram) => boolean): WalletCard[] =>
    members.flatMap(member => (member.loyalty || []).filter(p => p.number.trim() && keep(p)).map(program => ({ member, program })));

/** The numbers to show on a flight: those of its passengers (everyone on the trip when none are marked) for the airline. */
export const cardsForFlight = (record: Pick<JourneyRecord, 'flight' | 'trip'> & { flight: Transport }, members: User[]): WalletCard[] => {
    const who = passengersOf(record as JourneyRecord);
    const flying = who.length ? members.filter(m => who.some(w => isMember(m, w))) : members;
    return cardsWhere(flying, p => matchesFlight(p, record.flight));
};

/** The numbers to show on a stay: the trip's members' hotel numbers for the brand. */
export const cardsForStay = (stay: Pick<Accommodation, 'name'>, members: User[]): WalletCard[] =>
    cardsWhere(members, p => matchesStay(p, stay));

/** "Silver 25000, Gold 50000" as levels, lowest first; anything that is not a name and a number is ignored. */
export const parseLevels = (text: string): LoyaltyLevel[] =>
    text.split(/[,;\n]/).map(part => {
        const m = part.trim().match(/^(.*?)[\s:=-]*([\d][\d.,' ]*)$/);
        const at = m ? Number(m[2].replace(/[^\d.]/g, '')) : NaN;
        const name = m?.[1].trim();
        return name && Number.isFinite(at) && at > 0 ? { name, at } : null;
    }).filter((l): l is LoyaltyLevel => l !== null).sort((a, b) => a.at - b.at);

export const levelsText = (levels: LoyaltyLevel[] | undefined): string => (levels || []).map(l => `${l.name} ${l.at}`).join(', ');

export interface TierProgress {
    year: number;
    measure: LoyaltyMeasure;
    /** Kilometres or flights counted so far this year. */
    value: number;
    flights: number;
    /** The highest level reached, if any. */
    reached?: LoyaltyLevel;
    next?: LoyaltyLevel;
    /** What is left to reach the next level; 0 at the top. */
    remaining: number;
    /** 0 to 1 towards the next level (1 at the top, or with no levels set). */
    fraction: number;
}

/** What a member has flown with a programme's airline in the calendar year of `today`, against the levels they set. */
export const tierProgress = (p: LoyaltyProgram, member: User, records: JourneyRecord[], today: string): TierProgress => {
    const year = Number(today.slice(0, 4));
    const measure = p.measure ?? 'km';
    let km = 0, flights = 0;
    for (const r of records) {
        const t = r.flight;
        if (!matchesFlight(p, t) || !t.departureDate?.startsWith(String(year)) || t.departureDate > today) continue;
        if (journeyStatus(t).state === 'cancelled') continue;
        const who = passengersOf(r);
        if (!who.some(w => isMember(member, w))) continue;
        km += journeyKm(t);
        flights += 1;
    }
    const value = measure === 'km' ? Math.round(km) : flights;
    const levels = [...(p.levels || [])].sort((a, b) => a.at - b.at);
    const reached = [...levels].reverse().find(l => value >= l.at);
    const next = levels.find(l => value < l.at);
    const floor = reached?.at ?? 0;
    const fraction = next ? Math.max(0, Math.min(1, (value - floor) / (next.at - floor))) : 1;
    return { year, measure, value, flights, reached, next, remaining: next ? next.at - value : 0, fraction };
};

/** "12,400 km", "7 flights". */
export const formatMeasure = (value: number, measure: LoyaltyMeasure): string =>
    measure === 'km' ? `${value.toLocaleString('en-US')} km` : `${value} ${value === 1 ? 'flight' : 'flights'}`;

/** Checks a programme before saving; returns the problem, or null. */
export const checkProgram = (p: LoyaltyProgram): string | null => {
    if (!p.provider.trim()) return p.kind === 'airline' ? 'Which airline is it for?' : 'Which hotel brand is it for?';
    if (!p.number.trim()) return 'Add the membership number.';
    return null;
};

export const newProgram = (kind: LoyaltyKind): LoyaltyProgram => ({
    id: `lp-${Math.random().toString(36).slice(2, 9)}`, kind, provider: '', number: '', ...(kind === 'airline' ? { measure: 'km' as const } : {}),
});

/** "Flying Blue FB123 (Sam)": the numbers to print on a pass or stay; names appear only when more than one member has a card. */
export const walletText = (cards: WalletCard[]): string => {
    const names = new Set(cards.map(c => c.member.id));
    return cards.map(c => `${programLabel(c.program)} ${c.program.number.trim()}${names.size > 1 ? ` (${c.member.name.split(' ')[0]})` : ''}`).join(' · ');
};
