import type {
    Accommodation,
    Activity,
    CompanionRole,
    Transport,
    Trip,
    TripClassification,
    TripCompanion,
    User,
} from '../types';

/**
 * Trip classification, non-account members (companions & payers like Partner, Family, Friend, Employer),
 * granular item-level membership, and personal cost analytics exclusion.
 */

export const TRIP_CLASSIFICATIONS: readonly TripClassification[] = ['Personal', 'Business', 'Family', 'Bleisure', 'Other'];
export const COMPANION_ROLES: readonly CompanionRole[] = ['Partner', 'Family', 'Friend', 'Employer', 'Colleague', 'Other'];

export const tripClassification = (trip?: Pick<Trip, 'classification'> | null): TripClassification =>
    trip?.classification && TRIP_CLASSIFICATIONS.includes(trip.classification) ? trip.classification : 'Personal';

export const defaultCompanionFlags = (role: CompanionRole): { isPayerOnly: boolean; excludeFromAnalytics: boolean } => ({
    isPayerOnly: role === 'Employer',
    excludeFromAnalytics: role === 'Employer',
});

export interface TripPerson {
    id: string;
    name: string;
    kind: 'account' | 'companion';
    role: string;
    isPayerOnly: boolean;
    excludeFromAnalytics: boolean;
}

/** Everyone attached to a trip: account members first, then non-account companions and external payers. */
export const tripAllPeople = (trip: Pick<Trip, 'participants' | 'companions'> | undefined, users: User[] = []): TripPerson[] => {
    if (!trip) return [];
    const seen = new Set<string>();
    const out: TripPerson[] = [];
    for (const id of trip.participants || []) {
        if (!id || seen.has(id)) continue;
        const u = users.find(x => x.id === id);
        if (!u) continue;
        seen.add(id);
        out.push({ id: u.id, name: u.name, kind: 'account', role: u.role, isPayerOnly: false, excludeFromAnalytics: false });
    }
    for (const c of trip.companions || []) {
        if (!c?.id || !c.name?.trim() || seen.has(c.id)) continue;
        seen.add(c.id);
        out.push({
            id: c.id,
            name: c.name.trim(),
            kind: 'companion',
            role: c.role || 'Other',
            isPayerOnly: Boolean(c.isPayerOnly),
            excludeFromAnalytics: Boolean(c.excludeFromAnalytics),
        });
    }
    return out;
};

/** People on the trip who actually travel (account members + travelling companions; excludes payer-only entries such as Employer). */
export const tripTravellers = (trip: Pick<Trip, 'participants' | 'companions'> | undefined, users: User[] = []): TripPerson[] =>
    tripAllPeople(trip, users).filter(p => !p.isPayerOnly);

/** Resolves a user ID or companion ID to its display name. */
export const personName = (id: string | undefined, trip?: Pick<Trip, 'companions'> | null, users: User[] = []): string => {
    if (!id) return 'Someone';
    const user = users.find(u => u.id === id);
    if (user) return user.name;
    const comp = trip?.companions?.find(c => c.id === id);
    if (comp) return comp.name;
    return 'Someone';
};

/** Companion templates harvested from existing trips so recurring people/payers (like Partner or Employer) are one tap away. */
export const knownCompanions = (trips: Trip[], current: TripCompanion[] = []): TripCompanion[] => {
    const taken = new Set(current.map(c => `${c.name.trim().toLowerCase()}|${c.role}`));
    const out: TripCompanion[] = [];
    for (const t of trips) {
        for (const c of t.companions || []) {
            const key = `${(c.name || '').trim().toLowerCase()}|${c.role || 'Other'}`;
            if (!c.name?.trim() || taken.has(key)) continue;
            taken.add(key);
            out.push({ ...c });
        }
    }
    return out;
};

export interface CostItem {
    cost?: number;
    paidBy?: string;
    excludeFromAnalytics?: boolean;
}

/**
 * True when an item's cost should be excluded from personal cost analytics:
 * 1. Explicit item override (`excludeFromAnalytics === true` / `false`) wins.
 * 2. Else if paid by a companion marked `excludeFromAnalytics` (such as an Employer), exclude it.
 * 3. Else fall back to the trip's `excludeCostsFromAnalytics` setting.
 */
export const isCostExcluded = (
    item: CostItem | undefined,
    trip?: Pick<Trip, 'excludeCostsFromAnalytics' | 'companions'> | null,
): boolean => {
    if (!item) return false;
    if (item.excludeFromAnalytics === true) return true;
    if (item.excludeFromAnalytics === false) return false;
    if (item.paidBy && trip?.companions?.some(c => c.id === item.paidBy && c.excludeFromAnalytics)) return true;
    return Boolean(trip?.excludeCostsFromAnalytics);
};

/** The cost that counts towards personal analytics (0 when excluded). */
export const includedItemCost = (
    item: CostItem | undefined,
    trip?: Pick<Trip, 'excludeCostsFromAnalytics' | 'companions'> | null,
): number => (isCostExcluded(item, trip) ? 0 : item?.cost || 0);

/** Selected member IDs for an item; `undefined` means all travelling members on the trip. */
export const itemMembersOf = (selected: string[] | undefined, travellers: Pick<TripPerson, 'id'>[]): string[] =>
    selected !== undefined ? selected : travellers.map(t => t.id);

export interface CostBuckets {
    transport: number;
    stays: number;
    activities: number;
    total: number;
}

export interface PersonCostSummary extends TripPerson {
    /** Equal share of included booked items this person participates in. */
    shareIncluded: number;
    /** Sum of included booked items marked as paid by this person. */
    paidIncluded: number;
    /** Sum of excluded booked items marked as paid by this person (for example Employer-paid flights). */
    paidExcluded: number;
    /** Number of booked items (transport, stays, activities) this person is included on. */
    itemCount: number;
}

export interface TripCostSummary {
    included: CostBuckets;
    excluded: CostBuckets;
    gross: CostBuckets;
    byPerson: PersonCostSummary[];
}

const emptyBuckets = (): CostBuckets => ({ transport: 0, stays: 0, activities: 0, total: 0 });

/**
 * Full cost breakdown for a trip's booked items (transport, stays, activities), separating personal
 * analytics totals from excluded costs (for example employer-paid items) and computing per-person shares
 * from each item's granular member list.
 */
export const tripCostSummary = (trip: Trip, users: User[] = []): TripCostSummary => {
    const people = tripAllPeople(trip, users);
    const travellers = people.filter(p => !p.isPayerOnly);
    const map = new Map<string, PersonCostSummary>();
    const ensure = (id: string): PersonCostSummary => {
        const existing = map.get(id);
        if (existing) return existing;
        const known = people.find(p => p.id === id);
        const row: PersonCostSummary = known
            ? { ...known, shareIncluded: 0, paidIncluded: 0, paidExcluded: 0, itemCount: 0 }
            : { id, name: personName(id, trip, users), kind: 'companion', role: 'Other', isPayerOnly: false, excludeFromAnalytics: false, shareIncluded: 0, paidIncluded: 0, paidExcluded: 0, itemCount: 0 };
        map.set(id, row);
        return row;
    };
    people.forEach(p => ensure(p.id));

    const included = emptyBuckets();
    const excluded = emptyBuckets();

    const record = (bucket: 'transport' | 'stays' | 'activities', item: CostItem, selected: string[] | undefined) => {
        const cost = Number(item.cost) || 0;
        const excl = isCostExcluded(item, trip);
        const members = itemMembersOf(selected, travellers);
        members.forEach(id => { ensure(id).itemCount += 1; });

        if (cost <= 0) return;
        const target = excl ? excluded : included;
        target[bucket] += cost;
        target.total += cost;

        if (item.paidBy) {
            const payer = ensure(item.paidBy);
            if (excl) payer.paidExcluded += cost;
            else payer.paidIncluded += cost;
        }
        if (!excl && members.length > 0) {
            const each = cost / members.length;
            members.forEach(id => { ensure(id).shareIncluded += each; });
        }
    };

    (trip.transports || []).forEach((t: Transport) => record('transport', t, t.passengers));
    (trip.accommodations || []).forEach((a: Accommodation) => record('stays', a, a.participants));
    (trip.activities || []).forEach((a: Activity) => record('activities', a, a.participants));

    return {
        included,
        excluded,
        gross: {
            transport: included.transport + excluded.transport,
            stays: included.stays + excluded.stays,
            activities: included.activities + excluded.activities,
            total: included.total + excluded.total,
        },
        byPerson: [...map.values()],
    };
};

/** Turns trip people (account users + companions) into User-shaped entries for the Expenses ledger and Paid by pickers. */
export const ledgerMembersFor = (trip: Trip, users: User[] = []): (User & { isPayerOnly?: boolean; excludeFromAnalytics?: boolean; companionRole?: string })[] => {
    const people = tripAllPeople(trip, users);
    return people.map(p => {
        const account = p.kind === 'account' ? users.find(u => u.id === p.id) : undefined;
        if (account) return account;
        return {
            id: p.id,
            name: p.name,
            role: 'Partner',
            leaveBalance: 0,
            takenLeave: 0,
            allowance: 0,
            isPayerOnly: p.isPayerOnly,
            excludeFromAnalytics: p.excludeFromAnalytics,
            companionRole: p.role,
        };
    });
};
