# Audit status (November 2026)

**Health score: 7.7 / 10, up from 6.4.** Security 4 → 7.5, Data integrity 7 → 8, Reliability 7.5 → 8, Performance 6 → 7,
UX 7.5 → 8, Testing 6.5 → 7.5, Operations 5.5 → 7, DX 7 → 8, AX 5 → 8. These are judgements, not measurements. Nothing
has run on a real PostgreSQL or in Docker; [SMOKE_TEST.md](SMOKE_TEST.md) is the list that closes that gap (about 8.5
once it passes). The full e2e suite still runs only on release tags and manual runs, not on every PR.

Where each finding of the principal-architect audit stands. "Done" means merged or in an open PR with tests; see
`DECISIONS.md` for the choices behind them.

| # | Finding | Status |
| --- | --- | --- |
| F-01 | Strangers could sign up and read the household's data | Done: sign-up closed by default, demo only on an empty workspace (D-01) |
| F-02 | Rate limits locked everyone out behind a tunnel | Done: `TRUST_PROXY`, credential-only limiter, per-account backoff (D-03) |
| F-03 | "Binding" docs contradicted the code | Done: banners on `Design.md` and `AGENTS.md`, `CLAUDE.md` rewritten (D-05). Moving them to `docs/archive/` is optional |
| F-04 | No single rule for whose data a page shows | Done for Dashboard, Flights, Atlas: `utils/scope.ts`, Mine / Everyone (D-02). Calendar, Trips and Member already filter by participant |
| F-05 | "Is this leg a flight?" defined two ways | Done: `isFlightLeg()` everywhere, mode enforced and defaulted on write, migration 0002 |
| F-06 | Trip `status` mixes intent and date phase | Done in part: one tested `tripIntent` / `tripPhase` / `isPastTrip` in `utils/tripsModel.ts`, used by the map, calendar, dashboard and stickers (STATE_MACHINE §3). Storing `intent` separately was left out on purpose: same behaviour, every writer touched |
| F-07 | The Trip entity is overloaded | Done in part: `kind` (D-04). The `privacy` type now matches the server (`Shared` is read as Private). Migration 0003 replaces member emails in `participants` with user ids (entries matching no user are kept). The server still accepts either form when checking access |
| F-08 | Same data fetched several times per page | Done: overlapping reads of one endpoint share one request in `dataService` (each caller gets its own copy; a write drops reads in flight). Reads that do not overlap still go to the server, and settings are not yet served from a context |
| F-09 | 6 MB icon chunk | Done: the chosen icon's drawing is saved on the trip (`hugeiconData`), so trips show it without loading the icon set. Trips saved earlier still load it until their icon is picked again; the picker itself still loads it on demand |
| F-10 | CI skipped frontend tests | Done: unit tests run in CI. `tests/e2e/golden/pages.spec.ts` seeds a trip and a flight over the API and checks Trips, the trip sheet, Dashboard, Flights, Calendar and deletion. The whole suite (52 tests, desktop and mobile) ran green locally against pg-mem |
| F-11 | No migrations | Done: `backend_files/migrations/` (D-06). `schema.sql` is generated from `dbSchema.js` (`npm run schema` in `backend_files/`) and a test fails if it drifts |
| F-12 | Three files carry too much | Done for `server.js` (D-07). the data client is now `services/dataService.ts` (`mockDb.ts` re-exports it). The Vite dev server now runs the backend's own road and rail handlers (`routeProxy.js`) instead of a copy; only the small integrations-test endpoint is still duplicated |
| F-13 | Backup and recovery undocumented | Done: `OPERATIONS.md`, optional nightly dump (`--profile backup`), `.env.example` fixed, `PUBLIC_URL` passed to the container |
| F-14 | deck.gl advisories | Reduced from 15 to 11 by depending on the scoped packages; the rest are in deck.gl's 3D-tiles and glTF loaders, which the app never calls. CI fails on critical only |
| F-15 | Smaller hardening | Done: unknown-email timing, container runs as `node`. Not changed on purpose: the default DB password stays (the database is not published, and requiring it would break existing installs; see `OPERATIONS.md`), members may still edit their own leave figures (the member sheet offers it), register's 409 still reveals an existing email (sign-up is closed by default) |
| F-16 | Expired session was silent | Done: "Your session ended" and the route is kept; demo hidden on a populated workspace |
| F-17 | Read paths that won't scale | Done for what is cheap: the calendar-feed token lookup now has an index. Left on purpose: policy filtering of trips and existence checks run in memory, which is fine for a household and would only matter past thousands of trips |
| F-18 | Who may edit shared trips | Done: `createdBy`; only the creator or an Admin changes who is on a trip or its privacy. Trips saved before this have no creator, so their participants stay co-owners |
