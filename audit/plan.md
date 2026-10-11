# WanderGrid — Remediation Plan

**Date:** 2026-10-11
**Inputs:**
- `CLAUDE.md` and `audit/inventory.md`.
- `audit/findings-security.md` (SEC-001…018), `findings-reliability.md` (REL-001…017), `findings-performance.md` (PERF-001…014) and `findings-ui.md` (UI-001…015).
- `audit/qa-results.md` (QA-A…G, 47 bug reports, 189 tested items) and the Playwright suites in `tests/e2e/`.

**Result:** the 111 raw findings merge into **68 distinct issues (M-01…M-68)**, listed in §1. The plan in §3–§7 is built on those merged issues. Every package lists the original IDs it closes, so nothing is lost in the merge.

**Effort scale:**

| Effort | One engineer, including tests |
|---|---|
| S | Under half a day |
| M | 1–2 days |
| L | 3 days or more; split it across sessions if needed |

**Verification conventions**
- **Test names.** "e2e" means a Playwright test in `tests/e2e/<spec>`, named as `spec › test title`. Many of these tests **fail today** because they encode the expected behaviour. A package is done when its listed tests pass at both widths (`desktop` and `mobile` projects) and no previously passing test regresses.
- **Full suite run:** `cd tests/e2e && npx playwright test` (about 45–50 min). Single spec: `npx playwright test auth/session.spec.ts`.
- **New tests.** "New API test" means a backend integration test of the kind WP-1.0 sets up (supertest against the exported `app`). "New e2e" means a test to add to the named spec.
- **"Both copies".** `TripDetail`/`TripDetail2`, `Flights`/`Flights2` and `RoadTrips`/`RoadTrips2` are duplicate views. Apply any fix there to **both copies**, or first decide to retire the URL-only copies (see conflict C-10).

---

## 1. De-duplicated findings register

Severity is the highest of the merged findings. "Sources" lists every original ID folded into that issue.

### Security

| ID | Issue | Sources | Sev |
|---|---|---|---|
| M-01 | No server-side authorization: any user can read, modify or delete all data and wipe the DB | SEC-001, QA-A-002 | Critical |
| M-02 | Public sign-up accepts `role: Admin`, overwrites existing accounts by id, and reveals which emails exist | SEC-002, SEC-003, SEC-017, QA-A-001, QA-A-006 | Critical |
| M-03 | Stored XSS in the AI Guide / Intel tab (trip name → `dangerouslySetInnerHTML`), confirmed live | SEC-004, QA-C-001 | Critical |
| M-04 | Password pipeline broken and weak. The browser pre-hashes passwords, so app-set passwords never work. The server skips hashing when a value contains `:` and accepts plaintext. Hashes are returned in responses, and there is no length policy | QA-A-003, QA-G-001, QA-A-012, SEC-008, SEC-009 | High |
| M-05 | Restore gives users without a password the password `password`, and stores plaintext passwords from the file | SEC-005 | High |
| M-06 | The calendar feed is public by user id (email) and unescaped. The "Copy iCal Subscription URL" link points to a route that doesn't exist | SEC-006, QA-G-004 | High |
| M-07 | Sessions can't be revoked: 7-day JWT, client-only logout, and a deleted user's session turns into the Admin's identity | SEC-007, QA-A-010, QA-A-005 | High |
| M-08 | Third-party API keys are readable by every user, included in backups, and used in browser URLs | SEC-010 | Medium |
| M-09 | No CSP, and the unpinned Tailwind Play CDN runs in production (render-blocking, a second theme source) | SEC-011, PERF-003, UI-008 | Medium |
| M-10 | No request-body validation: mass assignment, `body.id ≠ :id`, and malformed records that crash readers (ICS, TripDetail) | SEC-012, REL-011 | Medium |
| M-11 | `xlsx` 0.18.5 has prototype-pollution and ReDoS bugs, reachable through spreadsheet import | SEC-013 | Medium |
| M-12 | Backend `compression` DoS. The Dockerfile ignores the lockfile | SEC-014 | Medium |
| M-13 | `/api/health` leaks DB error details publicly | SEC-015 | Low |
| M-14 | CORS allows `*` | SEC-016 | Low |
| M-15 | Vite dev server is exposed on the LAN, with known file-read CVEs | SEC-018 | Low |

### Data integrity

| ID | Issue | Sources | Sev |
|---|---|---|---|
| M-16 | "Archive" (Planner bulk action, edit drawer) permanently deletes trips | QA-B-001, QA-C-002 (UI-013 naming) | High |
| M-17 | Flight bundle and move are non-atomic: a late failure deletes flights | REL-002 | High |
| M-18 | Reads trigger writes. Opening a trip silently reassigns or deletes flights and can hang. Opening the Dashboard bulk-seeds the Atlas | REL-003, REL-015, QA-F-002 | High |
| M-19 | Restore is fragile: auto-retried after a 10 s client timeout while the first run continues, 413 above 10 MB, row-by-row inserts | REL-004, PERF-011 | High |
| M-20 | `/api/wipe` and `/api/restore` crash the whole server when the DB is unreachable | REL-001 | High |
| M-21 | The signed-in admin can delete their own account, and the last admin can be removed | QA-G-002 | High |
| M-22 | Concurrent edits overwrite each other (whole-document last-write-wins on trips and settings) | REL-005 | Medium |
| M-23 | Double-click creates duplicate flights, journeys and bundles | REL-006, QA-D-001, QA-E-001 | Medium |
| M-24 | Packing "Clear All" deletes the list with no confirmation or undo | QA-C-005 | Medium |

### Reliability and functional bugs

| ID | Issue | Sources | Sev |
|---|---|---|---|
| M-25 | The weekly airport/carrier refresh can commit an empty table | REL-009 | Medium |
| M-26 | Failures are hidden or shown raw: an empty board on API error, settings that look saved when they aren't, no feedback on an invalid restore file, "API Error: Bad Request", "Failed to fetch" | REL-007, QA-B-003, QA-G-005, QA-G-006, QA-A-011, QA-A-014 | Medium |
| M-27 | A fresh install never shows "Initial System Setup", so no Admin can be created through the UI | QA-A-004 | High |
| M-28 | Travel Atlas add/edit dialog never opens (`AnimatePresence` around `createPortal`) | QA-F-001 | High |
| M-29 | On mobile, flights have no edit or delete controls | QA-D-002 | High |
| M-30 | Mobile floating action bars (Planner, Flights; likely Road trips and Map) sit under the tab bar | QA-B-002, QA-D-003 | Medium |
| M-31 | The mobile trip "Daily Planner" tab is clipped off-screen (`Tabs` uses `justify-center` with `overflow-x-auto`) | QA-C-003 | Medium |
| M-32 | "Test All Services" always fails with 401 (no auth header) | QA-G-003 | Medium |
| M-33 | A deep link is lost after login, because the pre-auth 401 rewrites the URL to `/` | QA-A-007 | Medium |
| M-34 | "Auto-Setup & Demo Run" is shown in production and always fails | QA-A-008 | Medium |
| M-35 | No password-reset flow | QA-A-009 | Medium |
| M-36 | Server calls to AviationStack, AeroDataBox and GitHub datasets have no timeout, and their parameters aren't URL-encoded | REL-008 | Medium |
| M-37 | In-memory caches and `activeJobs` grow without limit | REL-010 | Medium |
| M-38 | TS strict mode is off, there are 492 `any`, and API data has no runtime checks | REL-012 | Medium |
| M-39 | In dev mode, one failed call silently switches the app to localStorage | REL-013 | Medium |
| M-40 | Test coverage: 1 failing test, server routes untested, no frontend tests, and no test step in CI | REL-014 | Medium |
| M-41 | Graceful shutdown doesn't drain in-flight requests | REL-016 | Low |
| M-42 | The crash screen's "Clear Cache & Reset" wipes all localStorage | REL-017 | Low |
| M-43 | No sign-out control in the main navigation | QA-A-016 | Low |
| M-44 | A profile URL with `%40` never loads, and an unknown profile id spins forever | QA-A-017, QA-A-018 | Low |
| M-45 | Wizard inconsistencies: Next requires a destination but Create doesn't, refresh loses the draft, and Back leaves the Planner | QA-B-004, QA-B-006, QA-B-007 | Low |
| M-46 | "Back to planner" goes to the Dashboard | QA-C-004 | Low |

### Performance

| ID | Issue | Sources | Sev |
|---|---|---|---|
| M-47 | The login page preloads deck.gl and maplibre (443 KB gzip) because of a `manualChunks` slip | PERF-001 | High |
| M-48 | Liquid-glass filters halve the frame rate on Dashboard and Planner | PERF-002 | High |
| M-49 | Gemini SDK, xlsx, searoute/turf and recharts load eagerly with their routes | PERF-004 | Medium |
| M-50 | 104 KB gzip of Phosphor icons is preloaded at startup | PERF-005 | Medium |
| M-51 | Static weight: 9.7 MB SW precache, 340 KB of favicons, a 2.2 MB runway dataset as JS | PERF-006, PERF-007, PERF-014 | Medium |
| M-52 | Every mutation refetches every collection in full; there is no pagination or fetch by id | PERF-008, PERF-009 | Medium |
| M-53 | Dashboard and Map geocode locations sequentially | PERF-010 | Medium |
| M-54 | Unused GIN indexes and duplicate iata indexes | PERF-012 | Low |
| M-55 | Airport and carrier autocomplete scans the DB per keystroke instead of using RAM | PERF-013 | Low |

### UI consistency and accessibility

| ID | Issue | Sources | Sev |
|---|---|---|---|
| M-56 | Pinch-zoom disabled on every page | UI-001 | High |
| M-57 | 34–40 % of text renders under 10 px | UI-002 | High |
| M-58 | Primary orange button contrast is 2.16:1, and light-mode `*-400` text is about 2.5:1 | UI-003 | High |
| M-59 | Labels aren't associated with controls; accessible names are missing (selects, the mobile Track Flight and Atlas tab buttons); other semantic and keyboard issues | UI-004, UI-015, QA-D-004 | High |
| M-60 | Modals and overlays lack dialog semantics, Escape handling and a focus trap | UI-005, QA-C-006 | Medium |
| M-61 | Touch targets are under 44 px, some under 24 px | UI-006 | Medium |
| M-62 | Horizontal overflow: Planner at 1440 px, and Dashboard, Calendar, trip page and long titles at 375 px | UI-007, QA-A-013, QA-B-005, QA-C-007, QA-F-003 | Medium |
| M-63 | 211 class names refer to Tailwind colors that don't exist | UI-009 | Medium |
| M-64 | Raw colors, sizes, radii and z-indexes bypass the tokens | UI-010 | Medium |
| M-65 | Two to four implementations per control, plus the duplicate "2" pages | UI-011 | Medium |
| M-66 | Confirmations and errors are inconsistent (`window.confirm`, `alert`, custom modals) | UI-012, QA-D-005 | Medium |
| M-67 | The same object is called by different names ("Planner-2", trip/expedition/journey) | UI-013 | Low |
| M-68 | Copy errors and jargon ("verify design coordinates", "Airward", "1 TRIPS") | UI-014, QA-A-015 | Low |

### Counts after de-duplication

| Category | Critical | High | Medium | Low | Total |
|---|---|---|---|---|---|
| Security | 3 | 4 | 5 | 3 | 15 |
| Data integrity | 0 | 6 | 3 | 0 | 9 |
| Reliability and functional bugs | 0 | 3 | 13 | 6 | 22 |
| Performance | 0 | 2 | 5 | 2 | 9 |
| UI and accessibility | 0 | 4 | 7 | 2 | 13 |
| **Total** | **3** | **19** | **33** | **13** | **68** |

### Factual discrepancies found while merging (no action needed)

- **Calendar subscription URL.** The inventory (§6) says the copied URL "returns the SPA HTML", which was observed in dev. QA-G-004 observed **401** against the production build. Both mean the link is broken, and M-06 covers it.
- **Spec-file count.** `qa-results.md` says "8 spec files", but there are **11** (`auth` ×3, `planning` ×3, and one each for trip-detail, flights, roadtrips, explore and settings).

---

## 2. Conflicting recommendations and proposed resolutions

### C-1 Liquid glass everywhere vs. frame-rate cost (PERF-002 vs. AGENTS.md §9.1, Design.md §1, the UI-baseline)
- **Conflict:** PERF-002 says to limit `@nkzw/liquid-glass` to a few hero surfaces. The binding design rules require glass on every button, card, input and tab.
- **Proposed resolution:**
  - Keep real liquid glass (displacement filter) for the sidebar, tab pill, modals and drawers.
  - List cards and buttons use the CSS-only "Elevated / Floating Cards" recipe already defined in AGENTS.md §7.1 (`bg-white/70 backdrop-blur-xl …`). It looks glassy but has no SVG filter or per-instance mouse listener.
  - Honour `prefers-reduced-transparency` and `prefers-reduced-motion`.
- **Prerequisite:** this needs the design owner's sign-off. AGENTS.md §9.1 and Design.md must be updated in the same change, or every future agent will revert it.
- **Package:** WP-3.3.

### C-2 Minimum text size vs. the mandated `text-2xs` pills (UI-002 vs. AGENTS.md §7.3, §9.3 and Design.md)
- **Conflict:** UI-002 says to retire `text-2xs`/`text-3xs`. The design docs mandate `text-2xs` for status pills and counters.
- **Proposed resolution:**
  - Keep the token *names* but raise their values: remove the `html { font-size: 95% }` override, set `2xs` to 11 px, and drop `3xs`.
  - Labels already use `text-xs` per AGENTS.md §7.2, so the 95 % root is what pushes them under 12 px.
  - Update Design.md with an explicit 11 px floor for pills and 12 px for informational text.
- **Package:** WP-4.1.

### C-3 Primary button fill (UI-003 vs. `constants.ts` vs. Design.md §3.1)
- **Conflict:** UI-003 proposes dark text on orange, or a darker orange. Design.md §3.1 actually specifies a *tinted* primary button (`bg-primary-500/25 … text-primary-600`). `BTN_PRIMARY_STYLE` instead uses solid `bg-primary-500/85 text-white`.
- **Proposed resolution:**
  - Align the code to the documented tinted variant, then verify that `primary-600` text on the tint reaches 4.5:1 in both themes.
  - If it doesn't, use `primary-700`/`800` text.
  - Don't invent a third style.
- **Package:** WP-4.2.

### C-4 Where the session token lives (SEC-007 vs. SEC-016 vs. the current architecture)
- **Conflict:** SEC-007 proposes moving to HttpOnly refresh cookies. SEC-016 notes that cookies would then *require* CSRF protection. The client (`mockDb.ts`, the PWA) is built around Bearer tokens in localStorage.
- **Proposed resolution:** do it in two steps.
  1. Phase 1 (WP-1.5) keeps Bearer tokens. Add a server-side `tokenVersion`, look up the user and role on each request, add a logout endpoint and shorten the expiry. That closes revocation without touching the transport.
  2. Moving to cookies plus CSRF tokens is a separate, later decision. It only becomes worthwhile once XSS (M-03) and CSP (M-09) are fixed, and should not block Phase 1.
- **Packages:** WP-1.5, then optionally a future package.

### C-5 What a backup should contain (SEC-005 vs. SEC-010 vs. current behaviour verified as Pass in QA-G)
- **Conflict:**
  - SEC-005 offers "include hashes in admin-only backups" as one option.
  - SEC-010 says to exclude API keys from backups.
  - QA confirmed as a *Pass* that backups contain no passwords.
- **Proposed resolution:**
  - Backups contain no password hashes and no API keys by default.
  - Restored users get no usable password and must reset, using the reset flow from WP-2.1 or an admin-issued reset.
  - An explicit admin-only "full migration export" that includes hashes can be added later if self-hosters ask for it.
  - The QA test "download backup: valid JSON with trips and no passwords" stays valid.
- **Packages:** WP-1.3 and WP-2.10.

### C-6 Fixing the calendar link makes the data leak worse (QA-G-004 vs. SEC-006)
- **Conflict:** the obvious fix for QA-G-004 is to point the copied link at `/api/calendar/:userId/feed.ics`. That would publish the unauthenticated, email-keyed feed that SEC-006 flags.
- **Proposed resolution:** fix both together. Issue a random, rotatable per-user feed token, serve the feed at `/api/calendar/:token/feed.ics`, and have the UI copy that URL. Never ship the URL fix alone.
- **Package:** WP-1.6.

### C-7 "Archive" must archive vs. renaming it "Delete" (QA-B-001/QA-C-002 vs. UI-013)
- **Conflict:** the bug can be fixed either by implementing a real archive or by relabelling the button "Delete". `Trip.status` (`types.ts:203`) has no `Archived` value today.
- **Proposed resolution:**
  - Implement a real, reversible archive: an `archived: true` flag rather than a new status, so status-bucket logic is untouched. Add a filter to show archived trips.
  - Keep a separate, clearly labelled **Delete** with a confirmation.
  - The QA tests already expect archive to keep the trip.
- **Package:** WP-1.7.

### C-8 Demo button: make it work vs. hide it (QA-A-008 vs. SEC "dev-mode-only issues")
- **Conflict:** QA-A-008's test expects "Auto-Setup & Demo Run" to work in production. The security review notes that the demo path creates fake admin sessions and default passwords.
- **Proposed resolution:**
  - Hide the button in production builds (`import.meta.env.PROD`), or put it behind a `VITE_FF_DEMO` flag (default OFF).
  - Change the test to assert the button is **absent** in production. This is the only planned change to a test's expected behaviour, and it must be recorded in the PR.
- **Package:** WP-2.1.

### C-9 Feature flags vs. fixes (CLAUDE.md "new user-facing features go behind a flag, default OFF")
- **Conflict:** if this convention is applied literally, security and data-integrity fixes would ship disabled.
- **Proposed resolution:**
  - Bug and security fixes are **not** flagged.
  - Genuinely new flows (password reset, real archive view, admin-invite registration) may be flagged, but must default **ON** once their tests pass, because they replace broken behaviour.
  - Record this exception in CLAUDE.md.
- **Packages:** all.

### C-10 Keeping duplicate views in sync vs. consolidating (CLAUDE.md vs. UI-011 / inventory §6)
- **Conflict:** CLAUDE.md says to keep `*2` views in sync. UI-011 says to consolidate. Phase 1 fixes (XSS, auto-assignment, bundle) touch both copies.
- **Proposed resolution:**
  - Before Phase 1, decide whether the URL-only `Flights2`, `RoadTrips2` and `TripDetail2` are retired. If they are, delete them first; that makes every later package smaller. If they are kept, every package patches both copies.
  - `VacationPlanner` ("Planner-2") is in the nav and needs a product decision in WP-4.7.
- **Packages:** WP-1.0 (decision), WP-4.7.

### C-11 Mobile action bars: raise the z-index vs. move the bar (QA-B-002/QA-D-003 vs. AGENTS.md §8 z-scale)
- **Conflict:** raising the bars above `z-50` would make them cover the tab bar instead, and would need yet another arbitrary z-index, which AGENTS.md §8 forbids.
- **Proposed resolution:**
  - Keep the token scale and offset the bars above the nav, using the existing `bottom-safe-nav` utility or the nav height.
  - Alternatively, hide the tab bar while selection mode is active.
- **Package:** WP-2.3.

### C-12 Restore body-size limit (REL-004 "raise for restore" vs. SEC-012 "lower the global limit")
- **Not a real conflict:** both are satisfied together. Lower the global limit to about 1 MB, raise it to about 50 MB on `/api/restore` only (admin-only after WP-1.2a), and run restore as a background job.
- **Package:** WP-1.10.

### C-13 Removing the Tailwind CDN changes visuals (PERF-003/SEC-011 vs. UI-008)
- **Conflict:** the CDN's inline config remaps `gray` to `neutral` and the body font differs from `tailwind.config.js`. Deleting the CDN script silently changes colors and fonts on 461 `text-gray-*` uses.
- **Proposed resolution:**
  - First port the intended decisions (gray mapping, font family, any custom keyframes) into `tailwind.config.js`, then remove the script.
  - Take before and after screenshots of the 13 pages at both widths.
- **Package:** WP-2.12.

---

## 3. Phase 1: Critical security and data integrity

**Goal:** close every Critical issue and every data-loss path. Do WP-1.0 first, then WP-1.1 and WP-1.2a. The rest can run in parallel after that, respecting the listed dependencies.

### WP-1.0 Safety net: tests in CI, reproducible builds (do first)
- **Status: ✅ Done.**
  - M-40 (REL-014): `server.js` exports `app`/`start()` and listens only when run directly; new `test/helpers/testServer.js` runs the real server on pg-mem for API tests (`test/api/`); fixed the stale routing assertion; CI gains a `test` job (tsc, backend tests, e2e) that gates the image build.
  - M-12 (SEC-014): `compression` → 1.8.2 (`npm audit` clean); Dockerfile copies lockfiles and uses `npm ci` in both stages.
  - C-10: `Flights2`, `RoadTrips2`, `TripDetail2` deleted; `/flights-2`, `/roadtrips-2`, `/trip-2/:id` resolve to the main pages (e2e `navigation.spec.ts` › "retired -2 URLs…").
- **Covers:**
  - M-40 (REL-014).
  - M-12 (SEC-014).
  - The C-10 decision on the `*2` views.
- **Files:**
  - `backend_files/server.js`: export `app`, and call `listen` only when `require.main === module`.
  - `backend_files/test/route.test.js` (failing assertion).
  - `backend_files/package*.json`: `npm audit fix` for `compression`.
  - `backend_files/Dockerfile`: copy the lockfile and use `npm ci --omit=dev`, for the frontend stage too.
  - `.github/workflows/build-and-publish.yml`: add `tsc --noEmit`, the backend `npm test`, and the `tests/e2e` suite (pg-mem harness, no external services needed) before the image build.
  - New `backend_files/test/api/*.test.js` with a supertest setup that reuses `tests/e2e/support/backend-harness.cjs`'s pg-mem approach.
- **Depends on:** none.
- **Effort:** M.
- **Verify:**
  - `cd backend_files && npm test` gives 28/28 plus the new API tests.
  - `npm audit --audit-level=high` in `backend_files` is clean.
  - The CI run shows the e2e job. Its current failures are expected and are tracked by later packages; mark them `test.fail()` or record a baseline so CI is green but strict.
  - `docker build` uses `npm ci`.

### WP-1.1 Lock down registration and first-run setup
- **Status: ✅ Done.**
  - M-02 (SEC-002, SEC-003, QA-A-001, QA-A-006): register whitelists name/email/password; id = normalised email chosen by the server; first account Admin, later ones Partner; existing id/email → 409; `POST /api/users` and every generic create are plain inserts (409 instead of overwrite).
  - SEC-017: **accepted risk** (decision): sign-up keeps the clear "already exists" message; rate limiting remains.
  - M-27 (QA-A-004): new public `GET /api/auth/setup-status` drives the Initial System Setup screen; new admin setting "Public Sign-Up" (Open/Closed) hides Sign Up and makes register return 403 (decision: open as Partner + admin toggle).
- **Covers:**
  - M-02 (SEC-002, SEC-003, SEC-017, QA-A-001, QA-A-006).
  - M-27 (QA-A-004).
- **Files:**
  - `backend_files/server.js`:
    - `:2146-2178` (register): whitelist name, email and password; generate the id on the server; assign `Admin` only when `users` is empty, inside a transaction; return a generic response for duplicates.
    - `:2195` (`POST /api/users`) and the generic `createResource` (`:858-885`): plain `INSERT`, 409 on conflict.
    - A unique index on `LOWER(data->>'email')`.
    - A new public `GET /api/auth/setup-status` → `{needsSetup: boolean}`.
  - `services/mockDb.ts:311-330`: stop sending `role` and `id`.
  - `views/Auth.tsx:24-38`: use `setup-status` instead of `getUsers()`.
- **Depends on:** WP-1.0.
- **Effort:** M.
- **Verify:**
  - e2e `auth/session.spec.ts` › "self-registration cannot grant the Admin role" and "registering with an existing user id cannot overwrite that account".
  - e2e `auth/signin-signup.spec.ts` › "empty database shows the Initial System Setup form", "when users exist, the sign-in form is shown" (regression) and "happy path: new account is created" (regression).
  - New API test: the first registration is Admin, the second is Partner, and re-registering an existing id or email does not change the stored user.

### WP-1.2a Role-based authorization (admin-only routes, self-only profile edits)
- **Status: ✅ Done.**
  - M-01 part 1 (SEC-001, QA-A-002): `requireAdmin` on user create/delete, settings PUT, backup, restore, wipe, `/api/jobs/*` and events/entitlements/configs writes; users may edit only their own profile and never their role; body id can't redirect a user PUT. Invalid tokens now 401 (sign out) and permission failures 403 (client shows an error, no sign-out).
  - M-21 (QA-G-002): server refuses self-deletion and removing/demoting the last Admin; Settings hides Delete on your own row and shows server errors inline.
  - Non-admin theme toggles are kept per browser (the workspace theme is an admin setting).
- **Covers:**
  - M-01, part 1 (SEC-001, QA-A-002).
  - M-21 (QA-G-002).
  - The role, password and id field whitelisting from M-10 on user routes.
- **Files:**
  - `backend_files/server.js`:
    - New `authorize(...roles)` middleware.
    - Apply it to users writes (`:2181-2244`), settings `PUT` (`:2328-2345`), backup (`:2551`), restore (`:2571`), wipe (`:2846`) and `/api/jobs/*`.
    - A user may `PUT` only their own record, never their own `role`.
    - Server-side "cannot delete self / cannot remove last Admin" guard.
  - `views/Settings.tsx:436-442`: hide or disable Delete on your own row.
- **Depends on:** WP-1.1 (the role semantics must be trustworthy first).
- **Effort:** M.
- **Verify:**
  - e2e `auth/session.spec.ts` › "a Partner cannot wipe the database or change another user".
  - e2e `settings/settings.spec.ts` › "the signed-in admin cannot remove their own account".
  - Regression: all of `settings/settings.spec.ts` run as Admin.
  - New API matrix test: Partner → 403 on each admin route; Admin → 2xx.

### WP-1.2b Ownership and privacy on trips, flights, visited and events
- **Status: ✅ Done.** (decision: shared read, owner/admin write for logs)
  - M-01 part 2 (SEC-001): trips readable by participants or when Public, writable by participants; admins see all; new trips always include the creator. Flights/land journeys/atlas records are readable by everyone but writable only by `ownerId` (set from the session) or an admin; ownerless legacy records are admin-managed. Enforced on GET, POST, PUT, DELETE, `/bulk` and `/api/batch`.
  - M-52 (part): the client no longer downloads and filters other users' private trips. Events/entitlements/configs are admin-write (WP-1.2a).
- **Covers:**
  - M-01, part 2 (SEC-001).
  - The server-side filtering half of M-52 (PERF-009).
- **Files:**
  - `backend_files/server.js` generic handlers `:778-907` and the bulk endpoints:
    - Filter reads by `participants ? req.user.id`, or by a new `ownerId`, with an explicit rule for `privacy`.
    - Check writes the same way.
  - `services/mockDb.ts:1012-1060`: remove client-side participant filtering once the server does it.
- **Depends on:** WP-1.2a.
- **Effort:** L.
- **Verify:**
  - New API tests: user B can't `GET`, `PUT` or `DELETE` user A's private trip or flight, and shared trips remain visible to participants.
  - Full e2e regression of the planning, trip-detail, flights, roadtrips and explore specs.

### WP-1.3 Fix the password pipeline (and restore defaults)
- **Status: ✅ Done.**
  - M-04 (QA-A-003, QA-G-001, QA-A-012, SEC-008, SEC-009): the browser no longer hashes passwords in API mode; the server always hashes (`pbkdf2$sha512$…`), uses `timingSafeEqual`, enforces 8–200 characters, never stores a client-supplied hash, upgrades legacy plaintext/old-format rows on login, and strips passwords from every response (`toPublicUser`). Accounts holding old browser SHA-256 hashes are flagged `passwordResetRequired` ("Needs password" badge in Personnel).
  - M-05 (SEC-005): restore never assigns `password`; plaintext in a file is hashed; users without one get no usable password until an admin sets one (decision C-5).
- **Covers:**
  - M-04 (QA-A-003, QA-G-001, QA-A-012, SEC-008, SEC-009).
  - M-05 (SEC-005).
- **Files:**
  - `services/mockDb.ts`:
    - `:180-211`: delete `hashPasswordInBrowser`.
    - `:888-912`: `addUser`/`updateUser` send the plaintext password over TLS.
    - `:715`, `:740`: restore default.
  - `backend_files/server.js`:
    - `:118-127`: always hash, using a prefixed format such as `pbkdf2$sha512$iter$salt$hash`; `crypto.timingSafeEqual`.
    - `:2200` and `:2224-2231`: remove the `includes(':')` bypass.
    - `:2146`: enforce a minimum of 8 characters.
    - `:2209` and `:2238`: add a shared `toPublicUser()`.
    - `:2650-2680`: restore never sets a default password and hashes any plaintext.
  - `views/Auth.tsx:59-65`: client-side length message.
- **Migration:** users created or edited in-app since the browser-hash change hold unusable SHA-256 `salt:hash` values. Detect values without the new prefix and mark them `mustReset`, or have an Admin reset them. Legacy plaintext rows are rehashed on the next successful login, then the compatibility branch is removed.
- **Depends on:**
  - WP-1.2a, so that restore and user writes are admin-gated.
  - WP-2.1's reset flow for users with an unusable password. Until then, an Admin-set password is enough.
- **Effort:** M.
- **Verify:**
  - e2e `auth/session.spec.ts` › "a signed-in user can change their own password from the profile".
  - e2e `settings/settings.spec.ts` › "enroll a member: appears in the roster and can sign in with the given password".
  - e2e `settings/settings.spec.ts` › "editing the profile without touching the password keeps the existing password working" (regression).
  - e2e `auth/signin-signup.spec.ts` › "weak password (1 character) is rejected with a message".
  - New API tests:
    - `PUT /api/users/:id` response has no `password`.
    - A password containing `:` works.
    - After a restore without passwords, logging in with `password` fails.

### WP-1.4 Remove the XSS sink
- **Status: ✅ Done.** M-03 (SEC-004, QA-C-001): the AI Guide renders `**bold**` and line breaks as React elements (`ChatText`); `dangerouslySetInnerHTML` no longer appears in the codebase (TripDetail2 was retired in WP-1.0).
- **Covers:** M-03 (SEC-004, QA-C-001). Gemini output goes through the same sink, so it is covered too.
- **Files:**
  - `views/TripDetail.tsx:418`, `:491` and `views/TripDetail2.tsx:390`, `:463`: render `**bold**` and newlines as React elements, with no `dangerouslySetInnerHTML`.
  - Confirm with `grep -rn dangerouslySetInnerHTML` that zero uses remain.
- **Depends on:** none. **Ship immediately; this is a quick win.**
- **Effort:** S.
- **Verify:**
  - e2e `trip-detail/trip-detail.spec.ts` › "W18 AI Guide does not execute HTML from the trip name (stored XSS)".
  - e2e `trip-detail/trip-detail.spec.ts` › "W18 AI Guide greets with the trip and explains a missing API key on send" (regression).

### WP-1.5 Revocable sessions
- **Status: ✅ Done.** M-07 (SEC-007, QA-A-010, QA-A-005): every request loads the user and checks a `tokenVersion` claim; role comes from the DB; new `POST /api/auth/logout` and `GET /api/auth/me`; password/role changes revoke other sessions (the editor gets a fresh token); sessions last 24 h (`SESSION_TTL`). On reload the app validates the session via `/auth/me` and signs out instead of switching to the Admin identity.
- **Covers:** M-07 (SEC-007, QA-A-010, QA-A-005).
- **Files:**
  - `backend_files/server.js`:
    - `:178-184` `authenticateToken`: load the user, check `tokenVersion`, and use the role from the DB.
    - New `POST /api/auth/logout`, which increments `tokenVersion`.
    - Bump `tokenVersion` on password change, role change and delete.
    - `:2138` and `:2172`: shorter expiry, for example 24 h.
  - `App.tsx`:
    - `:163-168`: when the stored user is missing from the roster, log out; never "reconcile" to the Admin.
    - `:237`: call the logout endpoint.
- **Depends on:** WP-1.2a, WP-1.3.
- **Effort:** M.
- **Verify:**
  - e2e `auth/session.spec.ts` › "a deleted user is signed out on reload (not switched to another account)" and "token is no longer accepted by the API after sign-out".
  - e2e `auth/session.spec.ts` › "reload keeps a valid session" and "API 401 during use signs the user out automatically" (regressions).

### WP-1.6 Private calendar feed with a working subscription link
- **Status: ✅ Done.** M-06 (SEC-006, QA-G-004) + ICS part of M-10: feed served at `/api/calendar/:token/feed.ics` with a random rotatable per-user token (`GET /api/calendar/token`, `POST /api/calendar/token/rotate`); RFC 5545 escaping and line folding; trips with invalid dates are skipped; Settings copies the tokenised URL and has "Reset Subscription Link"; tokens never appear in user lists or backups.
- **Covers:**
  - M-06 (SEC-006, QA-G-004).
  - The ICS invalid-date crash from M-10/REL-011.
- **Files:**
  - `backend_files/server.js`:
    - `:165`: change the public-path match to `/api/calendar/:token/feed.ics`.
    - `:2017-2083`: look up the user by a random, rotatable `calendarToken`; RFC 5545 escaping and line folding; skip trips with invalid dates.
    - Add `POST /api/calendar/token/rotate`.
  - `views/Settings.tsx:652`: copy the tokenised URL, and add a "Reset link" button.
- **Depends on:** WP-1.2a.
- **Effort:** M.
- **Verify:**
  - e2e `settings/settings.spec.ts` › "the copied iCal subscription URL returns a calendar".
  - e2e `settings/settings.spec.ts` › "Download .ICS Calendar File produces a calendar" (regression).
  - New API tests:
    - A guessed email or wrong token returns 404.
    - A trip name containing `\r\nX-INJECT:1` is escaped.
    - A trip with `endDate: "2026-13-45"` doesn't 500 the feed.

### WP-1.7 Make destructive actions safe (Archive, Clear All)
- **Status: ✅ Done.** (decision C-7: real archive + separate Delete)
  - M-16 (QA-B-001, QA-C-002): `Trip.archived` flag; Planner "Archive Selected" archives in one bulk request; new "Archived" view with "Restore Selected"; Planner-2 hides archived trips; the edit drawer offers Archive (reversible) and a separate Delete, each with its own confirmation.
  - M-24 (QA-C-005): "Clear All" asks for confirmation.
- **Covers:**
  - M-16 (QA-B-001, QA-C-002).
  - M-24 (QA-C-005).
- **Files:**
  - `types.ts` (`Trip.archived?: boolean`).
  - `views/PlannerView.tsx:351-360`: `handleBulkArchive` sets `archived`, does not call `deleteTrip`, and uses one bulk request (also helps M-52).
  - `components/NewTripDrawer.tsx:518` and `views/TripDetail.tsx:742-745` (+ `TripDetail2`): Archive vs. a separate Delete.
  - An archived filter on the Planner.
  - `components/PackingList.tsx:190`: confirmation (or undo toast) on Clear All.
- **Depends on:** C-7 decision.
- **Effort:** M.
- **Verify:**
  - e2e `planning/planner-board.spec.ts` › "bulk select → Archive Selected archives (keeps) the trips, and they can be found again", plus "bulk archive: dismissing the confirmation changes nothing". The mobile run also needs WP-2.3.
  - e2e `trip-detail/trip-detail.spec.ts` › "W12/W22 Archive in the edit drawer archives the trip (it is not permanently deleted)".
  - e2e `trip-detail/trip-detail.spec.ts` › "W17 Gear: Clear All asks for confirmation before deleting the list".

### WP-1.8 No writes on the read path
- **Status: ✅ Done.** M-18 (REL-003, REL-015, QA-F-002): opening a trip is read-only; standalone flights inside the trip's dates are offered via an "Add them to this trip" banner that saves atomically through `/api/batch`; config without `holidays` no longer hangs; load failures show "Couldn't load this trip" with Try Again. The Dashboard no longer seeds the Atlas on load.
- **Covers:** M-18 (REL-003, REL-015, QA-F-002).
- **Files:**
  - `views/TripDetail.tsx:619-693` (+ `TripDetail2`):
    - Remove `runAutoAssignment` from `loadData`. Offer it as an explicit "Assign N matching flights" action that uses the server bundle endpoint from WP-1.9.
    - Return the inner promise, guard `c.holidays ?? []`, and add an error state with Retry.
  - `views/Dashboard.tsx:523-762`: no seeding on load. Offer an explicit "Import past trips to Atlas" action (the Atlas Scan already exists), with deterministic ids.
- **Depends on:** WP-1.9, for the explicit assign action. The removal alone has no dependency.
- **Effort:** M.
- **Verify:**
  - e2e `explore/explore.spec.ts` › "loading the Dashboard does not write data (read-only view)".
  - New e2e in `trip-detail.spec.ts`:
    - Opening a trip that overlaps a standalone flight issues no `PUT` or `DELETE`.
    - A trip page with a config lacking `holidays` renders, not an endless loader.
  - Regression: `explore.spec.ts` › "scan finds the country of a past trip and registers it".

### WP-1.9 Atomic multi-step writes (bundle, unbundle, move)
- **Status: ✅ Done.** M-17 (REL-002): new transactional `POST /api/batch` (upsert/delete trips and flights in one transaction, ownership-checked); bundle, unbundle and move-to-another-trip use it via `dataService.applyBatch`; failures show "Nothing was changed".
- **Covers:** M-17 (REL-002).
- **Files:**
  - New `POST /api/trips/bundle` and `POST /api/flights/move` in `backend_files/server.js`, using `withTransaction`.
  - `views/Flights.tsx:1454-1535` (`executeBundle`) and `:1295-1390` (move path), + `Flights2`: call the new endpoints; add `try`/`catch` with a visible error.
- **Depends on:** WP-1.2b, so the new endpoints get ownership checks.
- **Effort:** M.
- **Verify:**
  - e2e `flights/flights.spec.ts` › "W26 bundle two flights into an expedition" and "W26 unbundle returns flights to the standalone log" (desktop now; mobile after WP-2.3).
  - New e2e: with `POST /api/trips/bundle` routed to 500, all selected flights still exist and an error is shown.
  - New API test: a failure injected mid-transaction rolls everything back.

### WP-1.10 Restore and wipe that can't crash or double-run
- **Status: ✅ Done.**
  - M-20 (REL-001): all route handlers forward async rejections to a JSON error middleware; `unhandledRejection` is logged instead of exiting; wipe runs in `withTransaction` inside `try`.
  - M-19 (REL-004, PERF-011): restore validates synchronously then runs as a background job (202 + `/api/jobs/status/:id`, polled by the client) using chunked `bulkUpsert`; restore body limit 50 MB, other routes 5 MB (kept above 1 MB until WP-2.11 caps avatar size); the client no longer auto-retries POSTs.
- **Covers:**
  - M-20 (REL-001).
  - M-19 (REL-004, PERF-011).
  - The restore-file validation part of M-10.
- **Files:**
  - `backend_files/server.js`:
    - `:2629` and `:2847`: `pool.connect()` inside `try` (or `withTransaction`).
    - An `asyncHandler` wrapper and a final error middleware.
    - `process.on('unhandledRejection')`.
    - Restore runs as a 202 job via `/api/jobs`, uses `bulkUpsert` (`:845-868`) and validates schemas.
    - `:245`: global body limit about 1 MB, restore about 50 MB.
  - `services/mockDb.ts:469-555`: no automatic retry for non-idempotent POSTs (or send an idempotency key); `:1499` polls the job.
  - `views/Settings.tsx` restore UI: progress via polling.
- **Depends on:** WP-1.2a (restore is admin-only) and WP-1.3 (restore password rules).
- **Effort:** M.
- **Verify:**
  - Unblock e2e `settings/settings.spec.ts` › "restore from file (merge) adds the trip from the backup"; it is currently Blocked and must pass.
  - New API tests:
    - With the DB unreachable, `POST /api/wipe` returns 500 and `GET /api/health` still answers.
    - A 12 MB restore succeeds.
    - A restore that takes more than 10 s is not re-sent; there is exactly one job.
  - Regression: e2e `settings.spec.ts` › "wipe deletes all data and returns to sign-in".

---

## 4. Phase 2: High-severity bugs and reliability

This phase includes the **Medium security hardening** items (WP-2.9 to WP-2.12). They don't qualify for Phase 1, and they share files with the reliability work.

### WP-2.1 Auth and session UX
- **Status: ✅ Done.** M-33 (unauthorized keeps the URL), M-34 (server `POST /api/auth/demo`, decision: works in production; Partner demo on populated workspaces, hidden when sign-up is closed), M-35 (admin-issued one-time reset codes + "Forgot password?", flag `AUDIT_PASSWORD_RESET` default ON), M-43 (Sign out in sidebar and More sheet), M-44 (`%40` decoded, "Traveler not found"), M-26 auth messages. Verified by the auth e2e suites (jargon wording is WP-4.8).
- **Covers:**
  - M-33 (QA-A-007), M-34 (QA-A-008, see C-8) and M-35 (QA-A-009).
  - M-43 (QA-A-016) and M-44 (QA-A-017, QA-A-018).
  - The auth messages in M-26 (QA-A-011, QA-A-014).
- **Files:**
  - `App.tsx`:
    - `:48`: `decodeURIComponent`.
    - `:237-248`: logout must not navigate when already signed out; preserve the intended path.
  - `views/Auth.tsx`:
    - `:76-77`: map network errors to plain text.
    - `:84-206`: hide demo in production.
    - Add a "Forgot password?" link.
  - `services/mockDb.ts:518`: surface the server's `{error}` text.
  - `components/Sidebar.tsx:23,34`: render a Sign out control in the sidebar and the "More" sheet.
  - `views/UserDetail.tsx:278`: not-found state.
  - Server: a password-reset flow. No email service exists, so use an admin-issued one-time reset link or code, optionally behind a flag that defaults ON (C-9).
- **Depends on:** WP-1.1, WP-1.3, WP-1.5.
- **Effort:** M.
- **Verify:** these e2e tests.
  - `auth/session.spec.ts`:
    - "protected deep link while logged out shows sign-in, then opens that page after login"
    - "sign-in screen offers Forgot password?"
    - "a sign-out control is reachable from the main navigation"
    - "profile link with a percent-encoded id (%40) opens the profile"
    - "unknown user id shows a not-found state instead of an endless spinner"
  - `auth/signin-signup.spec.ts`:
    - "duplicate email shows a clear already exists message"
    - "network failure shows a helpful message and re-enables the form"
    - "Auto-Setup & Demo Run…", with its expectation changed to "absent in production" (C-8).

### WP-2.2 Broken features with one-line causes
- **Status: ✅ Done.** M-28 (AnimatePresence inside the portal), M-32 (Authorization header on provider tests), M-46 (Back → Planner); e2e green.
- **Covers:** M-28 (QA-F-001), M-32 (QA-G-003), M-46 (QA-C-004).
- **Files:**
  - `views/TravelAtlas.tsx:1698-1700`: move `AnimatePresence` inside `createPortal`.
  - `views/Settings.tsx:232`: use `dataService` or add the `Authorization` header.
  - `App.tsx:296`: `onBack` navigates to `ViewState.PLANNER`.
- **Depends on:** none.
- **Effort:** S. **This is a quick win.**
- **Verify:**
  - e2e `explore/explore.spec.ts` › "add a visited country via the modal", "country form requires a code and name" and "edit a country record".
  - e2e `settings/settings.spec.ts` › "Test All Services reports a result for each provider (no auth errors)".
  - e2e `trip-detail/trip-detail.spec.ts` › "Back to planner returns to the Planner".

### WP-2.3 Mobile reachability
- **Status: ✅ Done.** M-30: floating bars use `.bottom-floating-bar`; full-page map controls sit above the tab bar and view-mode pill. M-31: `Tabs` justify-start + mx-auto. M-29: **re-classified** — the mobile flight cards always had Edit/Delete; rows were never mounted because `VirtualListItem` observed the viewport instead of the scrolling `<main>` (fixed: scroll-root-aware observer), which also unblocked Planner-2 mobile merges. Atlas scan info cards switched to CSS glass (they overlapped the Register button). Previously Blocked mobile tests (bulk delete, Mission Control, Atlas scan, Planner-2 merge, W27 filters) now pass.
- **Covers:** M-29 (QA-D-002), M-30 (QA-B-002, QA-D-003; see C-11) and M-31 (QA-C-003).
- **Files:**
  - `views/Flights.tsx`:
    - `:589`, `:3613` (`renderMobileTripContainer`): add Edit and Delete row actions.
    - `:2328-2338`: card tap opens edit outside multi-edit.
    - `:3629`: bar offset.
  - `views/PlannerView.tsx` around `:686`.
  - `views/RoadTrips.tsx` bulk bar.
  - `views/ExpeditionMapView.tsx` / `TravelAtlas.tsx` overlays: check them for the same overlap.
  - `components/Sidebar.tsx:346` for reference.
  - `components/ui.tsx:504`: `Tabs` uses `justify-start` on small screens (or `mx-auto` on an inner wrapper).
- **Depends on:** none.
- **Effort:** M.
- **Verify:**
  - Mobile project:
    - `flights.spec.ts`: "W24 edit an existing flight", "W25 delete a flight", "W25 delete → Cancel" and "W26 bundle/unbundle".
    - `planner-board.spec.ts`: both bulk-archive tests.
    - `trip-detail.spec.ts`: "all section tabs can be reached".
  - Unblock and pass the currently **Blocked** mobile tests: `roadtrips.spec.ts` › "W32 bulk select and delete two journeys", `explore.spec.ts` › "Mission Control opens its tabs and closes", and "scan finds the country of a past trip".

### WP-2.4 Visible errors and save guards
- **Status: ✅ Done.** Toast service + global `unhandledrejection` reporter; error states with Try Again (Planner, Calendar, Flights, Trip); settings save errors shown and applied only after success; friendly invalid-backup message; ref-based save guards and stable ids (flights, bundles, journeys); packing-list AI errors shown as toasts.
- **Covers:** M-26 (REL-007, QA-B-003, QA-G-005, QA-G-006) and M-23 (REL-006, QA-D-001, QA-E-001).
- **Files:**
  - Error states:
    - `views/PlannerView.tsx:124-136` and `views/VacationCalendar.tsx:123-128`: use `error` and `loading` from `useWanderSync`.
    - `views/Flights.tsx:1146-1209`: loading and error state.
    - `views/Settings.tsx:444-451` (`try`/`finally`, error toast) and `:557-582` (invalid-file error shown outside the dialog).
    - `services/mockDb.ts:1366-1373`: apply the local settings change only after the PUT succeeds.
    - A global `unhandledrejection` reporter in `index.tsx`.
  - Save guards: an `isSaving` flag, and an id generated once when the form opens:
    - `views/Flights.tsx:1295`, `:1313`, `:3893`
    - `views/RoadTrips.tsx:780-870`, `:1919`
    - The same in the `*2` copies.
- **Depends on:** WP-4.4's toast or `useConfirm` is helpful but not required. Use a minimal shared toast here and let WP-4.4 adopt it.
- **Effort:** M.
- **Verify:**
  - `planner-board.spec.ts` › "API failure loading trips shows an error, not an empty board".
  - `settings.spec.ts` › "save failure (500) shows an error and the button recovers" and "restore of an invalid file shows an error and changes nothing".
  - `flights.spec.ts` › "W24 double-clicking Save creates only one flight".
  - `roadtrips.spec.ts` › "W30 double-clicking Create Journey creates one record".
  - Regression: `wizard.spec.ts` › "double-clicking Create Trip creates only one trip".

### WP-2.5 Optimistic concurrency (no more silent lost updates)
- **Covers:** M-22 (REL-005).
- **Files:**
  - `backend_files/server.js:893-907` (`updateResource`): a `version` field, `WHERE … version = $n`, and 409 on mismatch.
  - `:2337-2345`: settings `PATCH` (partial).
  - `services/mockDb.ts`: on 409, refetch and retry or merge.
  - `App.tsx:225-230` and `views/Settings.tsx:444`: send partial settings.
  - Trip sub-editors: `PackingList`, `LocationManager`, `DailyPlannerBoard`, configurators.
- **Depends on:** WP-1.2b (same handlers) and WP-2.4 (error surface).
- **Effort:** L.
- **Verify:**
  - New API test: two `PUT`s with the same base version → the second gets 409.
  - New e2e, two browser contexts on one trip: add a stay in A and tick a packing item in B, and both changes survive.
  - New e2e: toggle the theme, then save Settings, and the theme persists.

### WP-2.6 Server resilience
- **Status: ✅ Done.** M-22: every trip/flight/atlas/user record has a server `version`; stale writes (PUT, bulk, batch) get 409 "changed by someone else" and the view reloads; the client rebases its own successive saves; `PATCH /api/settings` + Settings sends only edited fields, so the sidebar theme and the Settings page no longer overwrite each other. (Conflicts are detected and refused rather than auto-merged.)
- **Covers:** M-36 (REL-008), M-37 (REL-010), M-25 (REL-009), M-41 (REL-016) and M-13 (SEC-015).
- **Files:**
  - Timeouts and encoding:
    - `backend_files/server.js:1064`, `:1083`, `:1209`: route through `fetchUpstream` (`upstream.js`) or `AbortSignal.timeout`; `encodeURIComponent`; check `response.ok`.
    - The dataset downloads at `:474-673`, `:2456` and `:2494`.
  - Memory bounds:
    - LRU with TTL for the caches at `:203`, `:219`, `:220`, `:1095`, `:1225`.
    - Evict `activeJobs` (`:2351`) after N minutes, and don't hold backup payloads in memory.
  - Dataset refresh `:523-600`, `:2451-2540`: parse first, enforce a minimum row count, use a staging table and swap, and log skipped rows.
  - `:2879-2909`: await `server.close` with a 10 s cap before `pool.end`.
  - `:2098-2108`: public `{status}` only.
- **Depends on:** WP-1.0.
- **Effort:** M.
- **Verify:**
  - New backend unit tests:
    - A hung upstream returns within the timeout.
    - A refresh with 10 parsed rows rolls back.
    - The cache size stays at its cap after N distinct keys.
    - `/api/health` with the DB down returns no `message`.
  - Manual check: `SIGTERM` during a slow request completes the request.

### WP-2.7 Client resilience and dev/prod parity
- **Status: ✅ Done.** M-39 (explicit `VITE_LOCAL_MODE=true`, no silent mid-session fallback, "Local mode" badge), M-42 (crash reset clears only cache keys and SW caches, after confirmation).
- **Covers:** M-39 (REL-013), M-42 (REL-017).
- **Files:**
  - `services/mockDb.ts:545-555`: fall back only on network `TypeError` or abort, and only when `VITE_LOCAL_MODE=true`; show a "Local mode" badge.
  - `components/ErrorBoundary.tsx:26-33`: clear only cache keys and SW caches; confirm first.
- **Depends on:** none.
- **Effort:** S.
- **Verify:**
  - Manual check: with `npm run dev` and the backend up, the login page's 401 no longer flips the app to localStorage (`dataService._useApi` stays true).
  - New e2e: the crash card's reset keeps `wandergrid_session_token`. `settings.spec.ts` › "a view crash shows the recovery card…" is a regression check.

### WP-2.8 Type safety, incrementally
- **Covers:** M-38 (REL-012).
- **Files:**
  - `tsconfig.json`: `strictNullChecks`, per directory if needed.
  - Runtime schemas at the `dataService` boundary (`services/mockDb.ts:457`), shared with WP-2.11's server schemas.
  - Reduce `any` in `mockDb.ts` and `DeckFlightMap.tsx`.
- **Depends on:** WP-2.11 (shared schemas).
- **Effort:** L. Split across sessions: services first, then views.
- **Verify:** `npx tsc --noEmit` reports 0 errors with `strictNullChecks` on; the `any` count trends down (record it in the PR); the full e2e suite stays green.

### WP-2.9 Dependency and config hardening
- **Status: ✅ Done.** M-11: SheetJS 0.20.3 from cdn.sheetjs.com (no longer in `npm audit`); vite 6.4.4; M-14 CORS only for `CORS_ORIGINS`; M-15 dev server on localhost unless `VITE_DEV_HOST`. Remaining audit entries are the deck.gl/loaders/protobuf items judged unreachable in the security review. (Parsing xlsx in a Worker was not done.)
- **Covers:** M-11 (SEC-013), M-14 (SEC-016), M-15 (SEC-018).
- **Files:**
  - `package.json`: SheetJS ≥ 0.20.2 from `cdn.sheetjs.com`, or a CSV-only parser; parse in a Worker.
  - `backend_files/server.js:244`: remove `cors()` or restrict it to configured origins.
  - `vite.config.ts`: vite ≥ 6.4.3; `server.host` defaults to `localhost`, with LAN opt-in.
- **Depends on:** none.
- **Effort:** S.
- **Verify:**
  - `npm audit` shows no `xlsx` or `vite` highs.
  - e2e `flights.spec.ts` › "W29 spreadsheet import (Settings › Data): CSV → map → verify → import" and `trip-detail.spec.ts` › "W20 Import opens the flight import wizard" (regressions).
  - A preflight from a foreign origin gets no `Access-Control-Allow-Origin`.

### WP-2.10 Keep secrets on the server
- **Status: ✅ Done.** M-08: Gemini/AviationStack/AeroDataBox/OpenAIP keys masked in `GET /api/settings`, kept on mask-PUT, injected by a `/api/proxy` middleware, excluded from backups; Gemini via `POST /api/ai/generate` (SDK removed from the bundle); OpenAIP tiles via the authenticated proxy; GEMINI_API_KEY no longer inlined. Brandfetch/CARTO client IDs stay readable (public identifiers). Test expectation changed: the Settings e2e now asserts the key is masked + configured instead of returned.
- **Covers:**
  - M-08 (SEC-010).
  - Part of M-49 (PERF-004: Gemini moves server-side, so `@google/genai` leaves the bundle).
- **Files:**
  - `backend_files/server.js:2328`: `GET /api/settings` returns masked values plus `hasKey`.
  - `:131-150`: exclude keys from backups by default (C-5).
  - New `/api/proxy/gemini` and `/api/proxy/brandfetch`; existing AviationStack and OpenAIP proxies.
  - Remove browser-direct key use in:
    - `components/PackingList.tsx:94`
    - `views/TripDetail*.tsx`
    - `components/AccommodationConfigurator.tsx:211`
    - `utils/flightData.ts:508`, `:630`
    - `components/DeckFlightMap.tsx:464`
  - `vite.config.ts:455`: remove the `GEMINI_API_KEY` `define`.
- **Depends on:** WP-1.2a (settings read is still allowed for all users, but write is admin-only).
- **Effort:** M.
- **Verify:**
  - e2e `settings.spec.ts` › "API key is saved and masked by default" (regression); a new assertion that a Partner's `GET /api/settings` has no raw key.
  - e2e `trip-detail.spec.ts` › "W17 Gear: Magic Generate without a Gemini key explains what to do" and "W18 AI Guide … explains a missing API key" (regressions).
  - `grep` the built `dist/` for `AIza` shows no matches.

### WP-2.11 Request schemas
- **Status: ✅ Done.** M-10: shared `validateRecord` on every collection write (ids, ISO dates, list fields, privacy, 1 MB/2 MB caps, avatar format/size); avatars are downscaled to 512 px JPEG in the browser.
- **Covers:** M-10 (SEC-012, REL-011), the remaining parts after WP-1.6 and WP-1.10.
- **Files:**
  - `backend_files/server.js`: create and update handlers `:858-907`; reject `body.id !== params.id`; per-collection zod or ajv schemas with field caps.
  - Avatar upload: server-side MIME and size checks (`views/UserDetail.tsx:52-61`).
  - Defensive readers (`?? []`).
- **Depends on:** WP-1.2b (same handlers).
- **Effort:** M.
- **Verify:**
  - New API tests: mismatched id → 400; an unknown field is dropped; a 5 MB avatar → 413/400; an invalid date → 400.
  - Full e2e regression; the specs seed via the API, so they double as schema-compatibility checks.

### WP-2.12 One Tailwind source plus CSP
- **Status: ✅ Done.** M-09 (SEC-011, PERF-003, UI-008): Tailwind Play CDN and its inline config removed; `gray`→neutral ported into `tailwind.config.js`; runtime accent classes in `DashboardWidgets` safelisted; Google Fonts removed and the whole app uses the SF Pro system stack (decision); body colour uses the `light-text` token. Helmet CSP enabled (`script-src 'self' 'wasm-unsafe-eval' blob:`, no inline/third-party script, `object-src 'none'`); `vite preview` sends the same header and every e2e test fails on a CSP violation. MapLibre's RTL plugin is served as an ES module (`public/vendor/mapbox-gl-rtl-text.mjs`) so no `'unsafe-eval'` is needed.
- **Covers:** M-09 (SEC-011, PERF-003, UI-008).
- **Files:**
  - `index.html:36-110`: port the inline config (gray → neutral, fonts) into `tailwind.config.js` first (C-13), then delete the CDN script.
  - `index.html:362`: body font and color tokens.
  - Move the inline script at `:37` into a file.
  - `backend_files/server.js:239-242`: enable helmet's CSP (`default-src 'self'` plus the tile, font and API hosts).
- **Depends on:** WP-1.4 (no inline HTML sinks).
- **Effort:** M.
- **Verify:**
  - The built `dist/index.html` has no `cdn.tailwindcss.com`, and the response has a `Content-Security-Policy` header.
  - The full e2e suite passes with CSP on, with no CSP violations in the console. Add a Playwright console listener that fails on `securitypolicyviolation`.
  - Before/after screenshots of the 13 pages at 375 and 1440 px show no unintended diff.

---

## 5. Phase 3: Performance

### WP-3.1 Initial-load bundle
- **Covers:** M-47 (PERF-001), M-50 (PERF-005), and the rest of M-49 (PERF-004: xlsx, searoute/turf, recharts).
- **Files:**
  - `vite.config.ts` `manualChunks`: skip `\0` virtual modules (the preload helper) and remove the `vendor-icons` chunk.
  - `components/PackingList.tsx:10` and `views/TripDetail*.tsx:71-72`: dynamic import, if WP-2.10 hasn't already removed them.
  - `views/Settings.tsx` and `TripDetail*`: `React.lazy` `FlightImportWizard`.
  - `components/DeckFlightMap.tsx:93`: lazy-import maritime routing.
  - Chart panels: lazy-load.
- **Depends on:** WP-2.9 (the new xlsx package), and WP-2.10 if it is taken first.
- **Effort:** M.
- **Verify:**
  - `dist/index.html` has no modulepreload for `vendor-deckgl` or `vendor-icons`.
  - JS before first render goes from 721 KB gzip to under 300 KB gzip.
  - Lighthouse mobile on `/`: Performance ≥ 80, LCP < 4 s (baseline 58 / 9.2 s).
  - Full e2e regression.

### WP-3.2 Static assets and PWA precache
- **Covers:** M-51 (PERF-006, PERF-007, PERF-014).
- **Files:**
  - `vite.config.ts` `VitePWA`: precache the shell only; runtime-cache chunks.
  - `index.html:12-13`, `:28`: a small favicon.
  - `public/`: compress or remove `app-icon-original.png`, `icon.svg` and `app-icon*.png`.
  - `services/airportRunwayDataset.ts`: replace with a JSON or binary asset fetched on demand.
- **Depends on:** none.
- **Effort:** S.
- **Verify:**
  - The parsed `sw.js` precache is under 2.5 MB (baseline 9.7 MB).
  - Favicon requests total under 10 KB.
  - The runway layer still renders (manual check on the Map).
  - Full e2e regression; service workers are blocked in e2e, so also run a manual offline reload check.

### WP-3.3 Liquid-glass budget
- **Covers:** M-48 (PERF-002).
- **Files:**
  - `components/glass/GlassPanel.tsx:115-138` and `components/ui.tsx` (`Card`, `Button`): a CSS-glass variant for list items; a shared `mouseContainer`; reduced-motion and reduced-transparency support.
  - Update AGENTS.md §9.1 and Design.md (C-1).
- **Depends on:** C-1 sign-off.
- **Effort:** M.
- **Verify:**
  - Re-run the PERF-002 A/B frame script. Dashboard and Planner p95 frame time must be under 16.7 ms; the baseline is 25.1 and 33.4 ms.
  - Glass instance counts drop by at least 50 %.
  - Screenshots are reviewed by the design owner.

### WP-3.4 Data fetching
- **Covers:** M-52 (PERF-008; PERF-009 after WP-1.2b) and M-53 (PERF-010).
- **Files:**
  - `services/mockDb.ts:526-531`: the event carries a collection key.
  - `hooks/useWanderSync.ts:131-140`: refetch only matching keys, with a 100 ms debounce.
  - A new bulk delete endpoint; bulk loops in `PlannerView.tsx:351`, `Flights.tsx:1505-1512`, `RoadTrips.tsx` and `VacationPlanner.tsx:416-418` use it.
  - New `GET /api/trips/:id`, used by `TripDetail`.
  - `?status=` / `?after=` for the Planner and Calendar.
  - `views/Dashboard.tsx:375-412` and `ExpeditionMapView.tsx:421`: deduplicated, parallel geocoding (concurrency 4–6); persist coordinates on save.
- **Depends on:** WP-1.2b, WP-1.7 (bulk archive), WP-2.5 (the same `mockDb` write paths).
- **Effort:** L.
- **Verify:**
  - New e2e network-count test: bulk-archiving 5 trips sends one write request and at most 3 GETs.
  - Opening a trip calls `GET /api/trips/:id`, not `GET /api/trips`.
  - Full e2e regression.

### WP-3.5 Database query and index cleanup
- **Covers:** M-54 (PERF-012), M-55 (PERF-013).
- **Files:**
  - `backend_files/server.js:361-365`: drop the `gin (data)` indexes.
  - `:381-382`, `:656`, `:709`: drop the duplicate iata indexes.
  - Add a GIN index on `(data->'participants')`.
  - `:1914-1940`, `:1967+`: search `memoryAirports`/`memoryCarriers` first.
  - Keep `schema.sql` in sync.
- **Depends on:** WP-1.2b (the participants query shape).
- **Effort:** S.
- **Verify:**
  - On real Postgres, `EXPLAIN` of the ICS and trip-list queries uses the new index.
  - New API test: `/api/airports/search?q=lon` returns LHR without a DB query (spy on the pool).
  - The `flights.spec.ts` add-flight tests pass (autocomplete regression).

---

## 6. Phase 4: UI consistency and accessibility

### WP-4.1 Zoom and type scale
- **Covers:** M-56 (UI-001), M-57 (UI-002); see C-2.
- **Files:**
  - `index.html:6`: viewport.
  - `index.html:357-359`: the 95 % root.
  - `tailwind.config.js`: the `2xs` and `3xs` values.
  - `constants.ts`: label styles.
  - Design.md.
- **Depends on:** WP-2.12, so there is one theme source.
- **Effort:** M.
- **Verify:**
  - axe `meta-viewport` shows 0 violations on all pages.
  - The UI-002 font-size script shows 0 informational text elements under 11 px on Dashboard, Flights and Settings.
  - Overflow tests from WP-4.5 still pass, since larger text may wrap.

### WP-4.2 Contrast
- **Covers:** M-58 (UI-003); see C-3.
- **Files:**
  - `constants.ts:10-11`: `BTN_PRIMARY_STYLE`.
  - `components/ui.tsx:84+`: `Button` primary.
  - 52 `bg-primary-500 … text-white` sites.
  - 273 light-mode `*-400` text uses → `light-text-secondary`.
- **Depends on:** WP-4.1.
- **Effort:** M.
- **Verify:** axe `color-contrast` reports 0 serious violations on 9 pages × 2 widths × both themes. Add an `@axe-core/playwright` check to the e2e suite.

### WP-4.3 Labels and accessible names
- **Covers:** M-59 (UI-004, UI-015, QA-D-004).
- **Files:**
  - `components/glass/GlassSelect.tsx:32-49`, `components/ui.tsx:113-116`, `:176`, `:230-233`: `useId` and `htmlFor`, plus an `aria-label` prop.
  - `views/Dashboard.tsx:964-970`: Track Flight `aria-label`.
  - Atlas mobile tab buttons.
  - Calendar scroller: `tabIndex` and a label.
  - The 18 clickable `div`s → `button`.
  - Auth: `<main>` and `<h1>`.
  - Heading order.
  - Map geographies: `tabIndex={-1}`.
- **Depends on:** none.
- **Effort:** M. The shared-component part alone is S and is a quick win.
- **Verify:**
  - axe `select-name`, `button-name`, `aria-prohibited-attr`, `scrollable-region-focusable`, `landmark-one-main` and `page-has-heading-one` show 0 violations.
  - e2e `flights.spec.ts` › "W28 Track Flight (Dashboard) shows a clear result or error for AA100" (mobile).

### WP-4.4 One dialog primitive, plus `useConfirm` and toasts
- **Covers:** M-60 (UI-005, QA-C-006), M-66 (UI-012, QA-D-005).
- **Files:**
  - `components/ui.tsx:258+` `Modal` and `StandardDrawer`: `role="dialog"`, `aria-modal` and `aria-labelledby`.
  - Migrate the inline overlays in `views/Flights.tsx` (14), `TravelAtlas.tsx`, `ExcursionConfigurator.tsx`, `NewTripDrawer.tsx`, `FlightImportWizard.tsx` and `TripDetail.tsx:2643` (Cinematic).
  - New `useConfirm()` and a toast service; replace 12 `window.confirm` and 27 `alert` calls.
- **Depends on:** WP-2.4 (minimal toast), WP-2.3 (Flights mobile changes in the same file).
- **Effort:** L. Split by file: Flights first.
- **Verify:**
  - `trip-detail.spec.ts` › "W21 Cinematic view closes with Escape".
  - `flights.spec.ts` › "W24 validation message is shown inline (not a browser alert)".
  - `grep -rn "window.confirm\|alert(" views components` returns 0.
  - Tests that currently handle native dialogs (`page.once('dialog')` in `roadtrips`, `explore` and `planner-board`) must be updated to click the in-app confirm. This changes test mechanics, not expected behaviour.

### WP-4.5 Layout overflow and touch targets
- **Covers:** M-62 (UI-007, QA-A-013, QA-B-005, QA-C-007, QA-F-003), M-61 (UI-006).
- **Files:**
  - `views/PlannerView.tsx:590-670`: filter row wraps.
  - `views/PlannerView.tsx:1180-1230`: card `min-w-0` and truncation.
  - `views/VacationCalendar.tsx:700-990`.
  - `views/Dashboard.tsx` (glow container `overflow-hidden`) and `views/VacationPlanner.tsx` (blobs).
  - `views/TripDetail.tsx` header and tab row.
  - Icon buttons get the `.wg-touch-target` class: `TravelAtlas.tsx:1131-1139`, `Flights.tsx:2225-2233`, `Dashboard.tsx:1351`, `GearSettingsTab`.
- **Depends on:** WP-4.1, since larger text changes widths.
- **Effort:** M.
- **Verify:** these e2e tests.
  - `auth/navigation.spec.ts` › "no horizontal page overflow on the app shell".
  - `wizard.spec.ts` › "very long title (300 chars) saves and does not overflow the board".
  - `trip-detail.spec.ts` › "trip page has no horizontal overflow (baseline)" and "W15 very long activity name…".
  - `explore.spec.ts` › "no horizontal overflow on the Dashboard" and "…on the calendar" (mobile).
  - The touch-target script reports 0 controls under 24 px and fewer than 10 % under 44 px per page.

### WP-4.6 Token hygiene
- **Covers:** M-63 (UI-009, effort S, a quick win) and M-64 (UI-010, effort L).
- **Files:**
  - The 211 invalid shade classes, e.g. `views/VacationCalendar.tsx:1063` and `views/UserDetail.tsx:307`.
  - `tailwind.config.js`: semantic neutral, radius and surface tokens.
  - Codemod: raw palette classes, `z-10…z-50` → the token scale, `dark:bg-zinc-900` (10 in `Flights2.tsx`).
  - Add `eslint-plugin-tailwindcss` (`no-custom-classname`) and a custom rule against numeric z-index and arbitrary hex values.
- **Depends on:** WP-2.12 (one config), C-10 (whether `Flights2` survives).
- **Effort:** S for invalid classes; L for the token codemod.
- **Verify:**
  - The lint rule reports 0 unknown classes.
  - AGENTS.md §11.3's grep self-check is clean on touched files.
  - Screenshot diff on 13 pages.

### WP-4.7 Component and page consolidation
- **Decision (2026-10-11, user):** Planner-2 (`views/VacationPlanner.tsx`) deleted as redundant; `/planner-2` and `/planner2` open the Planner; its e2e spec was retired.
- **Covers:** M-65 (UI-011).
- **Files:**
  - Select: `GlassSelect`, `LiquidGlassSelect` → one `Select`.
  - Date: `GlassDatePicker`, `ui/DatePicker` and native date inputs → `DateField`/`DateRangeField`.
  - Tabs → `Tabs`.
  - `components/ErrorBoundary.tsx:38-46`: use theme tokens.
  - Delete the retired `*2` views (C-10) and the dead components (inventory §6).
  - Decide on `PlannerView` vs. `VacationPlanner`.
- **Depends on:** WP-4.4, C-10.
- **Effort:** L. Split by component family.
- **Verify:**
  - Full e2e regression. The planner2 spec is retired or retargeted if Planner-2 is removed; record that in the PR.
  - Usage counts from UI-011 drop to a single implementation per job.

### WP-4.8 Copy, terminology and wizard polish
- **Covers:** M-67 (UI-013), M-68 (UI-014, QA-A-015), M-45 (QA-B-004, QA-B-006, QA-B-007).
- **Files:**
  - A glossary in Design.md.
  - `components/Sidebar.tsx:114`, `:454` ("Planner-2").
  - `views/Auth.tsx:57`, `:312`.
  - `components/FlightyPassport.tsx:384` ("Airward").
  - `views/VacationCalendar.tsx:990` (plural).
  - Drop-off spelling.
  - `components/TripSetupBoard.tsx:632-639`: the Next rule matches Create.
  - Draft persistence and `beforeunload`.
  - `views/PlannerView.tsx:142`: the wizard pushes a history entry.
- **Depends on:** WP-4.4, WP-4.7 (labels on consolidated components).
- **Effort:** M.
- **Verify:**
  - `signin-signup.spec.ts` › "error message is plain-language (no jargon)".
  - `wizard.spec.ts` › "basics step: Next applies the same rules as Create Trip", "page refresh mid-flow keeps (or warns before losing) the draft" and "browser Back while the wizard is open returns to the Planner board".
  - `explore.spec.ts` › "trip count label uses correct plural" (regression).
  - `cspell` over the extracted strings reports 0 unknown words.

---

## 7. Quick wins (high value, effort S)

**Status: ✅ All 20 done.** Items 1–11 and 14–17 shipped with their Phase 1/2 packages. The rest were done as quick wins:
- #12 (PERF-001): Vite's preload helper has its own chunk; initial JS went from 721 KB to 221 KB gzip, and `vendor-deckgl` is no longer preloaded. The `vendor-icons` chunk was also removed (PERF-005).
- #13 (UI-001): pinch-zoom is re-enabled.
- #18 (UI-004, QA-D-004): `GlassInput`/`GlassSelect` connect labels with `useId`/`htmlFor` and wire `aria-describedby` to errors; Track Flight has an `aria-label`.
- #19 (PERF-006/007): the precache is the app shell only (151 entries / 9.7 MB → 20 / 1.5 MB), and route chunks are cached on first use. The 170–230 KB favicons were dropped, and the login and sidebar logos use the 192 px icon.
- #20 (UI-009, UI-014 part): 155 invalid Tailwind shades fixed, "Airward" → "Airborne", "1 Trip Plotted".

Each can ship on its own in under half a day, with no dependency on a larger package except where noted. Doing these first removes the worst user-visible and security exposure while the Phase 1 L-sized packages are in progress.

| # | Fix | Closes | Verify (test) |
|---|---|---|---|
| 1 | Replace `dangerouslySetInnerHTML` in both TripDetail copies (WP-1.4) | M-03 | `trip-detail.spec.ts` › "W18 AI Guide does not execute HTML…" |
| 2 | Register: ignore client `role` and `id`, plain INSERT with 409 (the core of WP-1.1) | M-02 | `session.spec.ts` › "self-registration cannot grant the Admin role", "registering with an existing user id cannot overwrite" |
| 3 | `pool.connect()` inside `try` in wipe and restore, plus `unhandledRejection` (from WP-1.10) | M-20 | New API test: wipe with DB down → 500 and the server stays up |
| 4 | Strip `password` from user responses (`toPublicUser`) | SEC-009 (M-04) | New API test: `PUT /api/users/:id` has no `password` |
| 5 | Admin self-delete and last-admin guard, client and server | M-21 | `settings.spec.ts` › "the signed-in admin cannot remove their own account" |
| 6 | Atlas dialog: `AnimatePresence` inside the portal | M-28 | `explore.spec.ts` › Atlas add, require and edit tests |
| 7 | "Test All Services" sends the auth header | M-32 | `settings.spec.ts` › "Test All Services reports a result…" |
| 8 | Planner, Flights and Road trips mobile bars offset above the tab bar | M-30 | `planner-board.spec.ts` bulk archive; `flights.spec.ts` W26 (mobile) |
| 9 | `Tabs` `justify-start` on mobile | M-31 | `trip-detail.spec.ts` › "all section tabs can be reached" (mobile) |
| 10 | `isSaving` guards on Save Boarding Stub, Create Journey and Create Bundle | M-23 | `flights.spec.ts` › "W24 double-clicking Save…"; `roadtrips.spec.ts` › "W30 double-clicking Create Journey…" |
| 11 | Packing "Clear All" confirmation | M-24 | `trip-detail.spec.ts` › "W17 Gear: Clear All asks for confirmation…" |
| 12 | `manualChunks` skips the `\0` preload helper | M-47 | `dist/index.html` has no `vendor-deckgl` preload; Lighthouse `/` |
| 13 | Remove `maximum-scale=1, user-scalable=no` | M-56 | axe `meta-viewport` = 0 |
| 14 | `npm audit fix` in `backend_files`; Dockerfile uses lockfile and `npm ci` | M-12 | `npm audit --audit-level=high` clean |
| 15 | Fix the failing routing test, and add `npm test` and `tsc` to CI | part of M-40 | CI green on `backend_files` tests |
| 16 | `/api/health` returns `{status}` only | M-13 | New API test |
| 17 | "Back to planner" → Planner; `%40` decode; unknown profile → not found | M-46, M-44 | `trip-detail.spec.ts` "Back to planner…"; `session.spec.ts` profile tests |
| 18 | `useId` label association in `Input`, `Select`, `GlassSelect`, and Track Flight `aria-label` | M-59 (part) | axe `select-name` = 0; `flights.spec.ts` W28 (mobile) |
| 19 | Precache the shell only; shrink favicons | M-51 (part) | `sw.js` precache < 2.5 MB |
| 20 | Fix the 211 invalid Tailwind shades, the "Airward" typo and the "1 TRIPS" plural | M-63, part of M-68 | Lint for unknown classes; `cspell` |

---

## 8. Dependency overview and suggested order

```
WP-1.0 ──► WP-1.1 ──► WP-1.2a ──► WP-1.2b ──► WP-1.9 ──► WP-1.8 (assign action)
  │                     │  │          ├──► WP-2.5, WP-2.11 ──► WP-2.8
  │                     │  │          └──► WP-3.4, WP-3.5
  │                     │  ├──► WP-1.3 ──► WP-1.5 ──► WP-2.1
  │                     │  ├──► WP-1.6
  │                     │  ├──► WP-1.10 (also needs WP-1.3)
  │                     │  └──► WP-2.10
  │                     
  └──► WP-2.6
WP-1.4 (anytime, first) ──► WP-2.12 ──► WP-4.1 ──► WP-4.2, WP-4.5
WP-1.7, WP-2.2, WP-2.3, WP-2.7, WP-2.9, WP-3.2, WP-4.3: no blocking dependencies
WP-2.4 ──► WP-4.4 ──► WP-4.7 ──► WP-4.8
C-1 sign-off ──► WP-3.3          C-10 decision ──► WP-4.6, WP-4.7 (and halves Phase 1 effort)
```

**Suggested sequence:**
1. Quick wins 1–5 and 14–15.
2. WP-1.0.
3. WP-1.1.
4. WP-1.2a.
5. WP-1.3 / WP-1.6 / WP-1.7 / WP-1.10 (parallel).
6. WP-1.5.
7. WP-1.2b.
8. WP-1.9.
9. WP-1.8.
10. Phase 2.
11. Phases 3 and 4. They can overlap with late Phase 2 because they touch different files, except `vite.config.ts` (WP-2.9 before WP-3.1).

**Exit criteria per phase**
- **Phase 1:** every e2e test listed in WP-1.x passes at both widths. The new API authorization matrix is green. No Critical or High security issue remains open.
- **Phase 2:** all 54 currently failing QA items pass, except those owned by Phase 4 (overflow, inline errors, Escape, plain-language copy) and the C-8 test change. The 16 Blocked items are unblocked or re-classified with a reason.
- **Phase 3:** Lighthouse mobile ≥ 80 on `/`, precache < 2.5 MB, and Dashboard/Planner p95 frame < 16.7 ms.
- **Phase 4:** axe shows 0 critical and 0 serious violations on 9 pages × 2 widths × 2 themes, and there is 0 horizontal overflow at 375 and 1440 px.
