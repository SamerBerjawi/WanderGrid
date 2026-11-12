# Domain rules

> Status: first draft from the 2026-11-12 audit. Each rule names where it is enforced today. A rule enforced in
> more than one place is a duplication risk; the preferred single home is marked **→ home**.

## Entities

| Entity | Stored in | Owner field | Meaning |
| --- | --- | --- | --- |
| User | `users` | itself | A member of the one workspace. `role` is `Admin` or `Partner`. Leave balances live on the record |
| Trip | `trips` | `participants[]` (user ids; migration 0003 converted stored emails) | A journey with dates. **Also** used for: leave/time off (`entitlementId`, `allocations`), flight bundles (`isBundleOnly`), and "Time off" entries |
| Transport (leg) | embedded in `trip.transports[]` **or** a row in `flights` with `tripId` | `ownerId` on `flights` rows | One flight, train, ferry, bus, car leg. The `flights` table holds every mode, not only flights |
| Visited item | `visited` | `ownerId` | Atlas entry: a country or city with a residence status |
| Entitlement type | `entitlements` | admin-managed | A leave category with accrual and carry-over policy |
| Config | `configs` | admin-managed | A saved public-holiday calendar |
| Event | `events` | admin-managed | A custom workspace day (offsite, working Saturday) |
| Workspace settings | `settings` (key `workspace`) | admin-managed | Currency, formats, defaults, integration keys, sign-up switch |
| Trip share | `trip_shares` | trip writers | Token for the public read-only trip page |

## Rules

### Identity and access
1. The first account becomes `Admin`; later self-registered accounts are `Partner`. Server: `/api/auth/register`.
2. Public sign-up is **open unless** `settings.allowSelfRegistration === false`. Server, `AuthNew.tsx`,
   `WorkspacePane.tsx`. (Open question: should the default be closed? See DECISIONS D-01.)
3. The workspace always keeps at least one Admin; an Admin cannot delete themself. Server: `PUT/DELETE /api/users`.
4. Non-admins may edit only their own user record and never their own role. Server.
5. A logout, password change or role change revokes every session of that user (`tokenVersion`). Server.

### Trips
6. A participant is matched by user id **or** email, case-insensitive. Server `isTripParticipant`; client code
   mostly matches id only (`participants.includes(user.id)`). **→ home:** one `isParticipant(trip, user)` shared
   helper, and store ids only.
7. A new trip always includes its creator. Server `OWNERSHIP.trips.prepareNew`.
8. Any participant may edit every field of a trip, including the participant list and privacy. Server.
9. `status` mixes user intent (`Planning`, `Cancelled`) with a date-derived phase (`Upcoming`, `Past`). It is
   re-derived in at least four places: `utils/tripsModel.ts`, `utils/calendarModel.ts`, `utils/dashboardModel.ts`,
   `hooks/useExpeditionMapData.ts`. **→ home:** `utils/tripsModel.ts` (see STATE_MACHINE.md).
10. Archive hides a trip from planning boards (`archived: true`); Delete removes it.

### Transports and flights
11. "Is this leg a flight?" Server restore and `useFlightLog` move logic: `!mode || mode === 'Flight'`. Flights
    page list: `mode === 'Flight'` only, so a flight saved without `mode` is stored but never shown.
    **→ home:** one `isFlightLeg()` in `utils/`, and make `mode` required on write.
12. A leg lives either inside a trip or as a standalone `flights` row (`tripId` empty or `unassigned`). Moving
    between the two goes through `/api/batch` so it is atomic.
13. Flights and visited rows are a shared household log: every signed-in member can read all of them; only the
    owner or an Admin can change them. Server `OWNERSHIP.flights`. Every page that counts or lists them goes through
    `utils/scope.ts`: "Mine" (default) or "Everyone", chosen with the switch on the Dashboard, Flights and Atlas (D-02).

### Leave
14. Leave is recorded on trips (`entitlementId`, `durationMode`, `allocations`, `excludedDates`) and counted by
    `utils/leaveModel.ts` against the user's entitlements, working days, public holidays and events.
15. `User.leaveBalance` / `takenLeave` are stored, but balances are also computed. **→ home:** compute only;
    treat stored values as legacy.

### Data hygiene
16. Every write is shape-checked by `validateRecord` (ids, dates, list fields, sizes). Rules are thin: unknown
    fields pass, `mode`, `status` and `privacy` enums are not all checked.
17. Every write bumps `version`; a write that names a stale `version` gets 409.
18. Backups never contain password hashes, calendar tokens, reset codes or paid API keys. Restored users without
    a password must be given a reset code by an Admin.

## Glossary

- **Journey**: Flights page grouping of legs (round trip, multi-city), computed by `utils/journeysModel.ts`.
- **Bundle**: a trip created only to hold flights (`isBundleOnly`).
- **Road trip**: a trip whose legs are land/sea modes; the Road trips page.
- **Atlas**: the visited countries/cities view (`visited` collection).
- **Local mode**: dev-only `VITE_LOCAL_MODE=true`, all data in localStorage.
