# Audit status (November 2026)

Where each finding of the principal-architect audit stands. "Done" means merged or in an open PR with tests; see
`DECISIONS.md` for the choices behind them.

| # | Finding | Status |
| --- | --- | --- |
| F-01 | Strangers could sign up and read the household's data | Done: sign-up closed by default, demo only on an empty workspace (D-01) |
| F-02 | Rate limits locked everyone out behind a tunnel | Done: `TRUST_PROXY`, credential-only limiter, per-account backoff (D-03) |
| F-03 | "Binding" docs contradicted the code | Done: banners on `Design.md` and `AGENTS.md`, `CLAUDE.md` rewritten (D-05). Moving them to `docs/archive/` is optional |
| F-04 | No single rule for whose data a page shows | Done for Dashboard, Flights, Atlas: `utils/scope.ts`, Mine / Everyone (D-02). Calendar, Trips and Member already filter by participant |
| F-05 | "Is this leg a flight?" defined two ways | Done: `isFlightLeg()` everywhere, mode enforced and defaulted on write, migration 0002 |
| F-06 | Trip `status` mixes intent and date phase | **Open.** Needs its own change: store `intent` plus `archived`, derive `phase` in one function (STATE_MACHINE §3) |
| F-07 | The Trip entity is overloaded | Done in part: `kind` (D-04). Ids-only `participants` and the `privacy: 'Shared'` enum mismatch are open |
| F-08 | Same data fetched several times per page | **Open.** Per-collection cache in `dataService`, settings from a context |
| F-09 | 6 MB icon chunk | **Open.** Save the icon path on the trip or generate a name-to-module map |
| F-10 | CI skipped frontend tests | Done: unit tests run in CI. Golden-path e2e specs for the new pages are still to write |
| F-11 | No migrations | Done: `backend_files/migrations/` (D-06). `schema.sql` is still a manual mirror |
| F-12 | Three files carry too much | Done for `server.js` (D-07). `mockDb.ts` rename and the Vite dev-proxy duplication are open |
| F-13 | Backup and recovery undocumented | Done: `OPERATIONS.md`, optional nightly dump (`--profile backup`), `.env.example` fixed, `PUBLIC_URL` passed to the container |
| F-14 | deck.gl advisories | Reduced from 15 to 11 by depending on the scoped packages; the rest are in deck.gl's 3D-tiles and glTF loaders, which the app never calls. CI fails on critical only |
| F-15 | Smaller hardening | Done: unknown-email timing, container runs as `node`. Not changed on purpose: the default DB password stays (the database is not published, and requiring it would break existing installs; see `OPERATIONS.md`), members may still edit their own leave figures (the member sheet offers it), register's 409 still reveals an existing email (sign-up is closed by default) |
| F-16 | Expired session was silent | Done: "Your session ended" and the route is kept; demo hidden on a populated workspace |
| F-17 | Read paths that won't scale | Open, by design: fine at family scale |
| F-18 | Who may edit shared trips | Done: `createdBy`; only the creator or an Admin changes who is on a trip or its privacy. Trips saved before this have no creator, so their participants stay co-owners |
