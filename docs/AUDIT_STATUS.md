# Audit status (November 2026)

**Health score: 7.7 / 10, up from 6.4.** Security 4 → 7.5, Data integrity 7 → 8, Reliability 7.5 → 8, Performance 6 → 7,
UX 7.5 → 8, Testing 6.5 → 7.5, Operations 5.5 → 7, DX 7 → 8, AX 5 → 8. These are judgements, not measurements. The backend tests now also run on a real PostgreSQL 15 in CI (all 252 pass); nothing
has run in Docker or against live upstreams; [SMOKE_TEST.md](SMOKE_TEST.md) is the list that closes that gap (about 8.5
once it passes). The full e2e suite now runs on every pull request, release tag and manual run.

Where each finding of the principal-architect audit stands. "Done" means merged or in an open PR with tests; see
`DECISIONS.md` for the choices behind them.

| # | Finding | Status |
| --- | --- | --- |
| F-01 | Strangers could sign up and read the household's data | Done: sign-up closed by default, demo only on an empty workspace (D-01) |
| F-02 | Rate limits locked everyone out behind a tunnel | Done: `TRUST_PROXY`, credential-only limiter, per-account backoff (D-03) |
| F-03 | "Binding" docs contradicted the code | Done: banners on `Design.md` and `AGENTS.md`, `CLAUDE.md` rewritten (D-05). `Design.md` now lives in `docs/archive/`; `AGENTS.md` stays at the root because its §1–6 are still binding |
| F-04 | No single rule for whose data a page shows | Done for Dashboard, Flights, Atlas: `utils/scope.ts`, Mine / Everyone (D-02). Calendar, Trips and Member already filter by participant |
| F-05 | "Is this leg a flight?" defined two ways | Done: `isFlightLeg()` everywhere, mode enforced and defaulted on write, migration 0002 |
| F-06 | Trip `status` mixes intent and date phase | Done: one tested `tripIntent` / `tripPhase` / `isPastTrip` in `utils/tripsModel.ts` (STATE_MACHINE §3), and a stored `intent` (planned, confirmed, cancelled) that every status change goes through (`withIntent`), so a trip that moves to Past keeps what it was. `status` itself is unchanged and still decides the board column, so no writer or migration had to change; trips saved before this have no `intent` and read as before (a Past trip counts as confirmed) |
| F-07 | The Trip entity is overloaded | Done in part: `kind` (D-04). The `privacy` type now matches the server (`Shared` is read as Private). Migration 0003 replaces member emails in `participants` with user ids (entries matching no user are kept). The server still accepts either form when checking access |
| F-08 | Same data fetched several times per page | Done: overlapping reads of one endpoint share one request in `dataService` (each caller gets its own copy; a write drops reads in flight). Workspace settings, which most pages read, are kept for 30 seconds and refreshed at once after a save, a sign-in or a sign-out. Other collections that do not overlap still go to the server on each visit; a full settings context was left out because the cache gives the same saving without touching ten hooks |
| F-09 | 6 MB icon chunk | Done: the chosen icon's drawing is saved on the trip (`hugeiconData`), so trips show it without loading the icon set. Trips saved earlier still load it until their icon is picked again; the picker itself still loads it on demand |
| F-10 | CI skipped frontend tests | Done: unit tests run in CI. `tests/e2e/golden/pages.spec.ts` seeds a trip and a flight over the API and checks Trips, the trip sheet, Dashboard, Flights, Calendar and deletion. The whole suite (52 tests, desktop and mobile) ran green locally against pg-mem |
| F-11 | No migrations | Done: `backend_files/migrations/` (D-06). `schema.sql` is generated from `dbSchema.js` (`npm run schema` in `backend_files/`) and a test fails if it drifts |
| F-12 | Three files carry too much | Done for `server.js` (D-07). the data client is now `services/dataService.ts` (`mockDb.ts` re-exports it). The Vite dev server now runs the backend's own road and rail handlers (`routeProxy.js`) instead of a copy; the integrations-test endpoint now uses the backend's `integrationsTester.js` too, so nothing is duplicated |
| F-13 | Backup and recovery undocumented | Done: `OPERATIONS.md`, optional nightly dump (`--profile backup`), `.env.example` fixed, `PUBLIC_URL` passed to the container |
| F-14 | Dependency advisories | Done for the shipped app: `npm audit --omit=dev` reports 0. deck.gl and luma.gl are on 9.4 (one version line, pinned in `package.json`), vitest is on 5, and `fflate` and `image-size` are overridden to patched versions (the 3D-tiles/glTF loaders that use them are never called). 6 low/moderate advisories remain in the PWA build tooling (workbox), which only runs at build time. CI fails on critical only |
| F-15 | Smaller hardening | Done: unknown-email timing, container runs as `node`; a member can no longer change their own yearly allowance or balances (an admin sets them; days taken stay editable); sign-up answers an existing email with the same 400 as any bad sign-up; production start-up warns when the default database password is still in `DATABASE_URL`. Not changed on purpose: the default password itself stays (the database is not published, and requiring a new one would break existing installs; see `OPERATIONS.md`) |
| F-16 | Expired session was silent | Done: "Your session ended" and the route is kept; demo hidden on a populated workspace |
| F-17 | Read paths that won't scale | Done: the calendar-feed token lookup has an index; `limit`/`offset` on trips, flights and visited apply after the read policy; and a member's trip list is now narrowed in the database (public trips and a case-folded match on their id or email in the participants) before the exact policy runs, so a member's request no longer reads every trip into memory. The SQL is a superset on purpose, so the exact check still decides and pagination stays correct. Left on purpose: the match is a text scan, not an index (fine for a household, worth an index only past many thousands of trips) |
| F-18 | Who may edit shared trips | Done: `createdBy`; only the creator or an Admin changes who is on a trip or its privacy. Trips saved before this have no creator, so their participants stay co-owners |

## Ported from `codex/fix-production-privacy-routing`

That branch (a second audit's first patch) could not merge after the server split, so its fixes are brought over one
piece at a time, each with its tests.

- Calendar feed: the token is checked on every request, so a rotated token or a removed account stops working at
  once, even with a warm cache. Done.
- Public share links: deleting, wiping, recreating or restoring a trip revokes any link to that trip id. Done.
- Upstream deadlines: the timeout now also covers reading the response body, stalled bodies are cancelled and the reader released. Done.
- Routes: only an explicit "no route" answer is remembered as absence; HTTP errors and unrecognised payloads are retried later. The cache key moves from `rt1` to `rt2`, so earlier wrongly remembered "no route" answers are asked again once. Done.
- Ferry recovery: lookups have a deadline, failed lookups are dropped from the request cache so they recover, and an approximate sea route drawn during an outage is not kept. Done.
- Not ported: turning the API demo off entirely. D-01 keeps the demo for an empty workspace only.

## Map check (November 2026)

Flights, road and rail routes were checked live on the Map and work. The check found one bug that no test had caught:
sea legs always drew the plain curve, because `searoute-js` throws on the unit `'km'`. Fixed in #104 (`'kilometers'`,
cache tag bumped so old curves are traced again, unit tests added). Ferry lines from Overpass (Dover to Calais) were
seen live. Not seen: a shipping lane drawn in a real production build in the browser (checked through a
production-style bundle in Node instead). The Vite dev server also failed on `searoute-js` ("Queue is not a constructor", a `tinyqueue` bundling problem); fixed in the
Vite config, and the lane through Messina is now seen in the dev browser too (22 points).

## What is left

No audit finding is open except the deliberate leaves above (F-17 policy in memory, F-15 default database password,
F-14 build-time workbox advisories, F-06 intent not shown in any screen). The score stays at 7.7: the sea fix removes a
visible defect but does not move a category. The remaining gain is [SMOKE_TEST.md](SMOKE_TEST.md) on real PostgreSQL,
Docker and live upstreams, which only the owner can run.
