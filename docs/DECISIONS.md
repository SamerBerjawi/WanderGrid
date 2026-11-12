# Decisions

> Architecture and product decisions with real alternatives. UI decisions stay in
> `UI_UX_DESIGN_REFERENCE.md` §7. The October 2026 remediation decisions are in `audit/plan.md` §2 (C-1…C-13).
>
> Format: context → options → recommendation → status. A decision is **Open** until the owner picks an option;
> record the pick, the date and the reason, then move it to *Decided*.

## Open

### D-07 Splitting `server.js`
- **Context:** ~3.7k lines mixing auth, validation, ownership, CRUD, settings, jobs, restore, proxies and schema.
- **Options:** A) move code into modules by area with no behaviour change, one PR per area, protected by the
  existing API tests; B) leave it.
- **Recommendation:** A, auth and records first (they hold the security rules).
- **Status:** Decided 2026-11-12: Option A, in progress. Done: `records.js`, `recordRoutes.js`, `auth.js`, `settings.js`, `jobs.js` (pure moves, verified by the existing API tests and a no-undef lint). Next, one PR each: `proxy/*`, `db/schema.js`.

## Decided


### D-02 What is a member allowed to see?
- **Context:** the server treats flights and atlas entries as a shared household log (everyone reads all), trips
  as participant-only, and users/entitlements/events/configs as readable by all. Pages then mix "mine" and
  "everyone's": the Dashboard headline stats and Flights page include an Admin's view of other members' private
  trips, while leave and some widgets filter to "mine".
- **Options:** A) household model, made explicit: every page shows "mine" by default with an "everyone" switch;
  B) private by default: rows readable by owner, trip co-participants and Admins only; C) per-record visibility.
- **Recommendation:** A for the family use case, after D-01 closes the door to strangers. Put the scoping rule in
  one helper used by every page.
- **Status:** Decided 2026-11-12: Option A. Implemented in `utils/scope.ts` (one rule, unit-tested), `hooks/useScope.ts` and the `ScopeSwitch` on Dashboard, Flights and Atlas (UI decision 330). The server rules are unchanged: they already match. Not yet scoped: Calendar, Trips and Member pages, which already filter by participant.

### D-03 Client IP behind a reverse proxy or tunnel
- **Context:** `trust proxy` is not set, so behind Cloudflare Tunnel every request has the tunnel's IP. The auth
  limiter (20 requests / 15 min) also counts `/api/auth/me` and `/api/auth/setup-status`. In testing, 19 page loads
  locked every member out of sign-in for 15 minutes.
- **Options:** A) `TRUST_PROXY` env (hop count or subnet list) and limit only credential endpoints;
  B) also key login attempts by account; C) both.
- **Recommendation:** C. Default `TRUST_PROXY` off, documented for Cloudflare Tunnel / Traefik / Caddy.
- **Status:** Decided 2026-11-12: Option C. Implemented in PR #76 (`TRUST_PROXY`, credential-only limiter, per-account backoff, tests in `login-backoff.test.js`) and documented in the README (Self-host with Docker) and `.env.example`.

### D-01 Who may create an account on an internet-reachable instance?
- **Context:** public sign-up is on by default (`allowSelfRegistration !== false`) and `POST /api/auth/demo` gives
  any anonymous caller a Partner session while sign-up is open. Instances run behind Cloudflare Tunnels and other
  people self-host the published image. A stranger's Partner account can read every flight (including
  confirmation codes and seats), every atlas entry and every member's email and leave balances (D-02).
- **Options:** A) sign-up closed by default after the first Admin, members added from Settings with a reset code;
  B) keep it open, but give self-registered accounts an empty, isolated view; C) an env var
  (`ALLOW_SIGNUP`, default off) so the host decides at deploy time.
- **Recommendation:** A, plus C as an override, and allow demo sign-in only on an empty workspace. Existing
  installs keep whatever their setting says; installs that never set it get "closed" on upgrade, with a release note.
- **Status:** Decided 2026-11-12: Option A plus C. Implemented in PR #76 (`ALLOW_SIGNUP`, the Settings switch, demo only on an empty workspace).

### D-05 Retire the documents that describe the removed interface
- **Context:** `CLAUDE.md` tells agents that `AGENTS.md` and `Design.md` are binding, but `Design.md` and
  `AGENTS.md` §7–11 mandate `GlassPanel`, `PlannerView` and liquid glass, which no longer exist, while `CLAUDE.md`
  says never to reintroduce them.
- **Options:** A) move both to `docs/archive/` and keep `AGENTS.md` §1–6 as `docs/BACKEND_RULES.md`;
  B) rewrite them in place; C) add a banner only.
- **Recommendation:** A, and update `CLAUDE.md` to point at `docs/AI_RULES.md`.
- **Status:** Decided 2026-11-12: Option A in spirit. `Design.md` and `AGENTS.md` carry a "Superseded" banner and `CLAUDE.md` points to `docs/AI_RULES.md`; a later tidy-up can move them to `docs/archive/`.

### D-06 Schema and data migrations
- **Context:** `initDb()` only creates missing tables and indexes. JSON shape changes (e.g. splitting
  `trip.status`) have no migration step, so every reader must tolerate every historical shape.
- **Options:** A) `schema_migrations` table plus numbered migration modules run at boot in a transaction;
  B) keep tolerant readers only.
- **Recommendation:** A, starting with the next shape change.
- **Status:** Decided 2026-11-12: Option A. `backend_files/migrations/` (runner in `index.js`, numbered files, one transaction each, recorded in `schema_migrations`, tests in `test/migrations.test.js`). The first migration is 0001, which stamps trips with `kind` (D-04). Rule: a stored-shape change is a migration, and a shipped migration is never edited.

### D-04 The Trip entity is overloaded
- **Context:** a Trip is also a leave request, a flight bundle and a "Time off" entry; legs live in
  `trip.transports[]` or in the `flights` table (which holds every mode).
- **Options:** A) add a `kind` discriminator (`trip | timeoff | bundle`) and keep one table; B) split leave into
  its own collection; C) leave as is and document.
- **Recommendation:** A now (cheap, makes readers explicit), revisit B only if leave grows.
- **Status:** Decided 2026-11-12: Option A. `Trip.kind` (`trip | timeoff | bundle`), read through `tripKind()` / `isRealTrip()` (`utils/tripKind.ts`, server copy `backend_files/tripKind.js`) which still understands records saved before it existed. New records write `kind` next to the legacy `isBundleOnly` / `hideInPlanner` flags so older readers and the calendar feed keep working. Migration 0001 stamps stored trips. Retiring the legacy flags is a later step.

_See `UI_UX_DESIGN_REFERENCE.md` §7 and `audit/plan.md` §2 for earlier decisions._
