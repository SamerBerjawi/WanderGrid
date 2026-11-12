# Architecture

> Status: first draft from the 2026-11-12 audit. It describes the code as it is, not as it should be. Where the
> two differ, the gap is named and linked to a decision in [DECISIONS.md](DECISIONS.md).

## One-paragraph summary

WanderGrid is a single-workspace, multi-member travel log and planner. A React 19 SPA (repo root, Vite) talks to an
Express 4 server (`backend_files/server.js`), which stores every collection as `(id TEXT PRIMARY KEY, data JSONB)`
rows in Postgres 15. In production the server also serves the built SPA, so there is one origin and one container
(plus Postgres). External data (flights, geocoding, routing, holidays, FX, tiles) is always fetched by the server
through `/api/proxy/*`, with timeouts and caches. There is no router library, no global store and no ORM.

## Runtime topology

```
Browser (SPA + service worker)
   │  fetch /api/*  (Bearer JWT from localStorage)
   ▼
Express (server.js) ──► Postgres 15  (users, trips, flights, visited, events, entitlements, configs, settings,
   │                                   global_airports, global_carriers, geocoding_cache, cached_routes, trip_shares)
   ├─► in-memory maps: airports, carriers (refreshed weekly), BoundedMap caches, background jobs
   └─► upstreams via upstream.js: AviationStack, AeroDataBox, adsbdb, adsb.lol, OpenSky, FlightStats,
       Open-Meteo/Photon/Nominatim, OSRM/Valhalla/OpenRailRouting, Overpass, Nager.Date/OpenHolidays, FX, OpenAIP
```

Typical deployment: `docker compose` (app + db) behind a reverse proxy or Cloudflare Tunnel. See
[DECISIONS.md › D-03](DECISIONS.md) for the proxy-trust gap.

## Request path (write)

```
User action
 → page component (views/new/*, components/new/*)
 → domain hook (hooks/useFlightLog, useRoadTripLog, …) or direct dataService call
 → dataService (services/mockDb.ts): fetch('/api/…'), 10 s timeout, retry on network/5xx except POST
 → Express: rate limit → authenticateToken (JWT + tokenVersion check against users row)
 → handler: validateRecord → OWNERSHIP policy → withNextVersion (optimistic concurrency, 409 on mismatch)
 → Postgres (single row, or /api/batch in one transaction)
 → response → dataService dispatches `wandergrid_db_updated` {collections}
 → useWanderSync caches with matching collections refetch → UI re-renders
```

Reads follow the same path without the event. `useWanderSync` dedupes in-flight requests **per query key**, not
per collection, so two hooks that use different keys for the same collection both hit the network.

## Frontend layout

| Layer | Where | Notes |
| --- | --- | --- |
| Entry, routing | `index.tsx`, `App.tsx`, `utils/routes.ts` | `resolveRoute` is pure and unit-tested; pages are `React.lazy` |
| Shell | `components/new/ShellNew.tsx` | Nav, theme, account menu |
| Pages | `views/new/*New.tsx` | 150–600 lines each; orchestration and layout only (target) |
| Page parts | `components/new/<page>/` | Sheets, panels, cards |
| Primitives | `components/new/ui.tsx`, `RpDialog.tsx`, `fields.tsx`, `ConfirmDialog.tsx` | The design-system layer |
| Vendored UI | `components/kokonutui/`, `components/bklit/` | Ported third-party components; treat as owned code |
| Domain logic (pure) | `utils/*Model.ts`, `utils/*.ts` | Unit-tested in `tests/unit/`; the right home for business rules |
| Domain hooks | `hooks/use*.ts` | State plus side effects for one page area |
| Data client | `services/mockDb.ts` (`dataService`) | API client, local mode, backup/restore, trip↔flight sync |
| Other services | `services/*.ts` | Geocoding, routing, flight lookup, map styles, import parsing |

## Backend layout

`server.js` (~2.9k lines) still holds config, logging, security headers, rate limits, schema (`initDb`), the global
datasets, settings, jobs, backup/restore and the proxies. Moved out so far (decision D-07, no behaviour change):
`records.js` (validation, ownership `OWNERSHIP`, optimistic concurrency, transactions, generic CRUD handlers),
`recordRoutes.js` (the collection routes and `/api/batch`), `auth.js` (sign-in, sign-up, demo, password reset,
sessions, member roster), `migrations/` (numbered data migrations, D-06) and `tripKind.js` (D-04). Helpers that were
already split out: `upstream.js` (fetch with timeout/cache/rate gate), `geocodingChain.js`, `routeProxy.js`,
`routeStore.js` (persistent route resolver), `flightLookup.js`, `aviationStack.js`, `holidays.js`, `fxRates.js`,
`ferryLines.js`, `sharedTrip.js`, `icsFeed.mjs`, `keyTester.js`, `integrationsTester.js`.

Modules take what they need as arguments (`createRecordStore({ pool, sendError, ... })`, `registerAuthRoutes(app, {...})`)
instead of importing `server.js`, so they can be tested alone. Routes keep their original registration order, which
matters for the auth middleware and the `*` fallback. Still to move, in this order: `settings`, `jobs` (backup,
restore, wipe), `proxy/*`, `db/schema.js`.

## Persistence

- One JSONB document per record. Shape rules live in `RECORD_RULES` (server) and `types.ts` (client); they are
  not generated from one source.
- Schema changes happen in `initDb()` with `CREATE … IF NOT EXISTS`. There is no migration table and no data
  migration step; JSON shape changes are absorbed by readers.
- `backend_files/schema.sql` mirrors `initDb()` by hand and is not executed.
- Every record carries `version` and `updatedAt`, set by the server.

## Authentication and authorisation

- JWT, `SESSION_TTL` (default 24 h), payload `{id, email, role, tv}`; `tv` must match `users.data.tokenVersion`,
  so logout, password change and role change revoke every session.
- Roles: `Admin`, `Partner` (anything else is treated as non-admin).
- Policies (`OWNERSHIP` in `server.js`): trips readable by admins, participants, or anyone when `privacy=Public`;
  flights and visited are **readable by every signed-in user** and writable by owner or admin; events,
  entitlements and configs are readable by everyone and writable by admins.
- Public, unauthenticated paths: health, login, register, setup-status, demo, reset-password, calendar feed by
  token, shared trip by token.

## Background work

- In-process job map (`activeJobs`, max 100, kept 30 min): backup, restore, data refresh. Clients poll
  `/api/jobs/status/:id`. Jobs are lost on restart.
- `setInterval` refreshes airport/carrier datasets weekly.
- `routeStore` keeps a small in-process queue that resolves road/rail/ferry legs and persists results.

## Build, test, deploy

- CI (`.github/workflows/build-and-publish.yml`): `tsc`, token lint, backend `npm audit --audit-level=high`
  and backend tests on every push and PR; e2e only on `v*` tags and manual runs; image pushed to GHCR.
- Frontend unit tests (`npm test`, Vitest) are **not** run in CI today.
- The image runs `node server.js` as root on `node:20-alpine`; schema is created on boot, then numbered migrations (`backend_files/migrations/`) run.
