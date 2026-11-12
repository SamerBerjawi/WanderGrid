# State machines

> Status: first draft from the 2026-11-12 audit. These machines are implicit in the code today (booleans, string
> fields, conditional rendering). Each section lists the states, the transitions, where it lives, and the gaps.
> Make a machine explicit only where the gaps column is non-empty; the others are documented so nobody breaks them.

## 1. Session (client)

| State | Represented by | Enters when |
| --- | --- | --- |
| `booting` | `isAuthReady=false` | App mounts |
| `signedOut` | `currentUser=null`, no token | No stored session, 401 on `/auth/me`, sign-out |
| `validating` | token + cached user, `/auth/me` in flight | App mounts with a stored session |
| `signedIn` | `currentUser` set | `/auth/me` 200, or login/register |
| `signedInOffline` | `currentUser` from cache | `/auth/me` fails with a network/5xx/429 error |
| `expired` | (not modelled) | Any later 401 → `wandergrid-unauthorized` event → falls back to `signedOut` |

Lives in: `App.tsx`, `services/mockDb.ts` (`getSessionUser`, `fetch`).
Gaps: `expired` is indistinguishable from `signedOut`, so the sign-in page gives no "your session ended" message
and the page you were on is not restored. `signedInOffline` treats a 429 (rate limited) as "offline".

## 2. Session (server)

`valid` ⇄ `revoked` by `tokenVersion`: login/register issue `tv = tokenVersion`; logout, password change, role
change and reset-code redemption increment it. A deleted user's tokens fail the lookup. Lives in
`authenticateToken` and the `/api/auth/*` and `/api/users/*` handlers. No gaps known.

## 3. Trip lifecycle

Stored `status`: `Planning | Upcoming | Past | Cancelled`, plus `archived: boolean`.

```
            create
              │
          Planning ──book/dates set──► Upcoming ──end date passes──► Past
              │                          │
              └────────cancel────────────┴──► Cancelled
  any state ──archive──► (archived=true, same status) ──restore──► (archived=false)
```

Gaps:
- `Upcoming` and `Past` are **time phases**, but they are stored. Moving a `Past` trip's dates into the future
  leaves it `Past`; each reader then patches this differently (`hasPastDates` in `tripsModel`, `(endDate||startDate) < today`
  in `calendarModel`, `status !== 'Past'` filters in `dashboardModel`).
- An "ongoing" phase exists only as a derived check in `tripsModel.ts`.
- Recommended shape: store `intent: 'planning' | 'booked' | 'cancelled'` and `archived`; derive
  `phase: 'upcoming' | 'ongoing' | 'past'` from dates in one function in `utils/tripsModel.ts`. Keep reading the
  old `status` for backward compatibility.

## 4. Record save (optimistic concurrency)

`clean → dirty → saving → saved | conflict(409) | failed`. The server side is explicit (`withNextVersion`). The
client side is per form/sheet: each sheet keeps its own `saving` boolean and error string. Gap: there is no shared
"reload and reapply" path for a 409; each page shows the server message.

## 5. Road/rail route resolution (server, persisted)

`unknown → pending → ok | none(no_route, no_rail_connection, no_ferry_line) | error(transient, not persisted)`.
Lives in `backend_files/routeStore.js`; the client (`services/multiModalRouting.ts`) polls only `pending` legs.
`none` is cached for `NONE_TTL_MS` (30 days). No gaps known; this is the reference example of an explicit machine.

## 6. Background job

`Processing(progress) → Completed(result) | Failed(error)`; dropped after `JOB_RETENTION_MS`. In-process only, so a
restart loses running and finished jobs, and a client polling a lost job gets 404. Lives in `runBackgroundJob`
(`server.js`). Gap: clients should treat 404 during polling as "server restarted, unknown outcome", not "failed".

## 7. Workspace setup

`needsSetup (0 users) → open (sign-up allowed) ⇄ closed (allowSelfRegistration=false)`. The first account becomes
Admin. Demo sign-in is allowed in `needsSetup` (creates an Admin demo) and in `open` (creates a Partner demo).
Gap: `open` is the default after setup, so a new internet-reachable instance accepts strangers until an Admin
closes it (see DECISIONS D-01).

## 8. Flight live status (client)

Derived, not stored: `scheduled → boarding → departed → airborne → landed`, plus `delayed`/`cancelled` from
upstream. Lives in `utils/journeysModel.ts` (unit-tested in `tests/unit/journeysModel.test.ts`) and
`components/new/journeys/` (`FlightProgress`, `TrackPanel`). No gaps known.
