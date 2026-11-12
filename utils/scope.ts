/**
 * The household "mine / everyone" rule (decision D-02), in one place.
 *
 * The server lets every member read the flight log and the atlas, and lets a member read a trip only when they
 * are on it (admins read all). So "everyone" means everything the signed-in member is allowed to read, and "mine"
 * means the records that belong to them. Every page that counts or lists records goes through these helpers, so
 * the Dashboard, Flights and Atlas never disagree about what "mine" is.
 *
 * Mirrors OWNERSHIP in backend_files/server.js: trips belong to their participants, flights, land journeys and
 * atlas entries to their `ownerId`, and a record with no owner is managed by an admin.
 */
export type Scope = 'mine' | 'everyone';

export const DEFAULT_SCOPE: Scope = 'mine';
export const SCOPE_STORAGE_KEY = 'wandergrid_scope';

export interface ScopeUser { id: string; email?: string; role?: string }

const norm = (v: unknown) => String(v ?? '').toLowerCase().trim();

export const parseScope = (raw: unknown): Scope => (raw === 'everyone' ? 'everyone' : DEFAULT_SCOPE);

/** A trip is mine when I am on it. */
export const isMyTrip = (trip: { participants?: string[] } | null | undefined, user: ScopeUser | null | undefined): boolean => {
    if (!user) return false;
    const keys = new Set([user.id, user.email].filter(Boolean).map(norm));
    return Array.isArray(trip?.participants) && trip!.participants!.some(p => keys.has(norm(p)));
};

/** A flight, land journey or atlas entry is mine when I own it; one with no owner is the admin's. */
export const isMyRecord = (rec: { ownerId?: string } | null | undefined, user: ScopeUser | null | undefined): boolean => {
    if (!user || !rec) return false;
    if (rec.ownerId) return rec.ownerId === user.id;
    return user.role === 'Admin';
};

/** Without a signed-in user nothing can be "mine", so the full list is kept rather than hiding everything. */
export const scopeTrips = <T extends { participants?: string[] }>(trips: T[], scope: Scope, user: ScopeUser | null | undefined): T[] =>
    scope === 'everyone' || !user ? trips : trips.filter(t => isMyTrip(t, user));

export const scopeRecords = <T extends object>(records: T[], scope: Scope, user: ScopeUser | null | undefined): T[] =>
    scope === 'everyone' || !user ? records : records.filter(r => isMyRecord(r as { ownerId?: string }, user));
