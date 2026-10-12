# WanderGrid — QA Results (end-to-end)

The chunks are defined in `audit/inventory.md` §5. Each chunk below lists every item tested, with the result at desktop (1440×900) and mobile (375×812) widths, followed by a bug report for each failure.

## Test setup (shared by all chunks)

- **Tests:** `tests/e2e/<chunk>/*.spec.ts` (Playwright 1.49.1, run in the locally installed Google Chrome).
  - `tests/e2e` is a self-contained package, so the app's own `package.json` is untouched.
  - Run with `cd tests/e2e && npm install && npx playwright test <chunk>/`.
- **Backend:** the real, unmodified `backend_files/server.js` with `NODE_ENV=production`, booted by the test-only `tests/e2e/support/backend-harness.cjs`.
  - The harness swaps the `pg` driver for **pg-mem**, an in-memory Postgres.
  - It exposes `POST :3099/reset`, which every test calls to start from an empty, schema-only database.
  - Outbound third-party network calls are blocked, so runs are deterministic and offline.
  - Rate-limit ceilings are raised so suites can log in repeatedly.
- **Frontend:** a production build (`vite build`, so there is no localStorage fallback), served by `vite preview`, which proxies `/api` to the harness. Service workers are blocked.
- **Accounts:** none are seeded. Each test registers its own users through the API, for example `qa.admin@wandergrid.test` (Admin) and `qa.partner@wandergrid.test` (Partner).
- **Results key:**
  - **Pass / Fail:** observed result. Assertions encode the *expected* behavior, so a Fail is a bug.
  - **n/a:** the check doesn't apply at that width (for example, desktop-only controls or API-only checks).
  - **Blocked:** could not be tested in this setup.

---

## Chunk A — Auth & access (workflows 1–8, 47)

**Run:** 2026-10-11 · 94 test executions (47 items × 2 viewports): **53 passed, 32 failed, 9 n/a**.
At the item level: **29 Pass, 18 Fail, 1 Blocked**.

| Spec | Workflow / area | Item tested | Desktop | Mobile |
|---|---|---|---|---|
| navigation | W47 navigation | every navigation item opens its page without crashing | Pass | Pass |
| navigation | W47 navigation | browser Back/Forward move between views | Pass | Pass |
| navigation | W47 navigation | refresh on a deep link keeps the same view | Pass | Pass |
| navigation | W47 navigation | legacy URL aliases resolve (/travel-atlas, /vacation-calendar, /planner2) | Pass | Pass |
| navigation | W47 navigation | unknown path falls back to the Dashboard | Pass | Pass |
| navigation | W47 navigation | theme toggle cycles dark → light → auto and persists after reload | Pass | Pass |
| navigation | W47 navigation | desktop: sidebar collapse hides labels and expand restores them | Pass | n/a |
| navigation | W47 navigation | profile chip opens the signed-in user's profile | Pass | Pass |
| navigation | W47 navigation | next-trip widget shows the upcoming trip and opens it (desktop sidebar) | Pass | n/a |
| navigation | W47 navigation | with no upcoming trips the widget offers "Plan next adventure" → Planner (desktop) | Pass | n/a |
| navigation | W47 navigation | mobile: "More" sheet opens and closes via its backdrop | n/a | Pass |
| navigation | W47 navigation | no horizontal page overflow on the app shell | Fail | Fail |
| session | W5 ?demo=1 URL | ?demo=1 without credentials does not grant access to the app | Pass | Pass |
| session | W6 session restore | reload keeps a valid session | Pass | Pass |
| session | W6 session restore | invalid/tampered token returns the user to the sign-in screen | Pass | Pass |
| session | W6 session restore | a deleted user is signed out on reload (not switched to another account) | Fail | Fail |
| session | W6 session restore | protected deep link while logged out shows sign-in, then opens that page after login | Fail | Fail |
| session | W7 log out | Sign out returns to the sign-in screen and clears the stored session | Pass | Pass |
| session | W7 log out | browser Back after sign-out does not reveal the app | Pass | Pass |
| session | W7 log out | a sign-out control is reachable from the main navigation (sidebar / tab bar) | Fail | Fail |
| session | W7 log out | token is no longer accepted by the API after sign-out | Fail | n/a |
| session | W7 log out | API 401 during use signs the user out automatically | Pass | Pass |
| session | W8 password reset | sign-in screen offers "Forgot password?" | Fail | Fail |
| session | W8 password reset | a signed-in user can change their own password from the profile | Fail | Fail |
| session | Profile URL handling | profile link with a percent-encoded id (%40) opens the profile | Fail | Fail |
| session | Profile URL handling | unknown user id shows a not-found state instead of an endless spinner | Fail | Fail |
| session | Access control (API) | unauthenticated API requests are rejected | Pass | n/a |
| session | Access control (API) | self-registration cannot grant the Admin role | Fail | n/a |
| session | Access control (API) | registering with an existing user id cannot overwrite that account | Fail | n/a |
| session | Access control (API) | a Partner cannot wipe the database or change another user | Fail | n/a |
| signin-signup | W1 first-run admin setup | empty database shows the "Initial System Setup" form | Fail | Fail |
| signin-signup | W1 first-run admin setup | when users exist, the sign-in form is shown | Pass | Pass |
| signin-signup | W2 sign up | happy path: new account is created and the app opens | Pass | Pass |
| signin-signup | W2 sign up | mismatched passwords show "Passwords do not match" | Pass | Pass |
| signin-signup | W2 sign up | duplicate email shows a clear "already exists" message | Fail | Fail |
| signin-signup | W2 sign up | required fields and email format are validated before submit | Pass | Pass |
| signin-signup | W2 sign up | weak password (1 character) is rejected with a message | Fail | Fail |
| signin-signup | W2 sign up | very long name (2,000 chars) does not break the layout | Pass | Pass |
| signin-signup | W3 sign in | happy path: valid credentials open the app and store a token | Pass | Pass |
| signin-signup | W3 sign in | email is case-insensitive | Pass | Pass |
| signin-signup | W3 sign in | wrong password shows an error and stays on the form | Pass | Pass |
| signin-signup | W3 sign in | unknown email shows the same generic error | Pass | Pass |
| signin-signup | W3 sign in | error message is plain-language (no jargon) | Fail | Fail |
| signin-signup | W3 sign in | double-clicking submit sends a single login request | Pass | Pass |
| signin-signup | W3 sign in | network failure shows a helpful message and re-enables the form | Fail | Fail |
| signin-signup | W3 sign in | server error (500) shows a helpful message | Pass | Pass |
| signin-signup | W4 demo login | "Auto-Setup & Demo Run" opens the app with sample data | Fail | Fail |
| (manual) | W3 sign in | Login rate limiting (20 attempts / 15 min) | Blocked | Blocked |

The rate-limit row is Blocked because the harness raises rate-limit ceilings so the suite can sign in many times. Testing it needs a dedicated server instance.

### Bug reports — Chunk A

#### QA-A-001 Registering with an existing user's id overwrites that account, with no login required
- **Severity:** Critical
- **Steps to reproduce:**
  1. An admin exists (`qa.admin@wandergrid.test`).
  2. Without a token, `POST /api/auth/register` `{"id":"qa.admin@wandergrid.test","email":"mallory@evil.test","password":"m1234567","role":"Admin"}`.
  3. `POST /api/auth/login` as the original admin.
- **Expected:** step 2 is rejected (409) and the admin can still sign in.
- **Actual:** step 2 succeeds; the admin's login returns **401**, because the account was replaced.
- **Suspected cause:** `backend_files/server.js:2152-2164`. The duplicate check uses only the new email, then `INSERT … ON CONFLICT (id) DO UPDATE` on the client-supplied id. User ids are emails (`services/mockDb.ts:319`). Same as SEC-003.
- **Test:** `auth/session.spec.ts` › "registering with an existing user id cannot overwrite that account".

#### QA-A-002 A Partner can change other users' accounts and wipe the database
- **Severity:** Critical
- **Steps to reproduce:**
  1. Register an Admin and a Partner.
  2. With the Partner's token, send `PUT /api/users/<admin id>` with a new password and role.
  3. Also with the Partner's token, send `POST /api/wipe`.
- **Expected:** both return 403.
- **Actual:** `PUT` returns **200**; the test stops at that first assertion. The wipe also succeeded in the security audit.
- **Suspected cause:** no role or ownership checks in any handler (`backend_files/server.js:2215-2244`, `:2846`). Same as SEC-001.
- **Test:** `auth/session.spec.ts` › "a Partner cannot wipe the database or change another user".

#### QA-A-003 Passwords set inside the app can never be used to sign in
- **Severity:** High
- **Steps to reproduce:**
  1. Sign in as a Partner and open the profile through the sidebar profile chip.
  2. Click the edit pencil, enter a new password, and click **Save Changes**.
  3. `POST /api/auth/login` with the new password. The old one no longer works either.
- **Expected:** 200 with the new password.
- **Actual:** **401**. The user is locked out after their next sign-out.
- **Suspected cause:**
  - `services/mockDb.ts:888-912`: `updateUser` and `addUser` hash the password **in the browser** with SHA-256, producing `salt:hash` (`hashPasswordInBrowser`, `mockDb.ts:180-211`).
  - The server skips hashing when the value contains `:` (`backend_files/server.js:2200`, `:2224-2231`) and stores it as-is.
  - Login then verifies with PBKDF2-SHA512 (`server.js:118-127`), so the hashes never match.
  - This also affects members created in **Settings › Personnel › Enroll Member** (`addUser`), who will never be able to sign in. That will be tested in Chunk G.
- **Test:** `auth/session.spec.ts` › "a signed-in user can change their own password from the profile".

#### QA-A-004 A fresh install never shows "Initial System Setup"
- **Severity:** High
- **Steps to reproduce:** start with an empty database and open `/`.
- **Expected:** the "Initial System Setup" form, which creates the first Admin.
- **Actual:** "Welcome Back" (the sign-in form). The first user can only use "Sign Up", which creates a **Partner**, or call the API directly. No Admin can be created through the UI.
- **Suspected cause:** `views/Auth.tsx:24-38` decides the mode via `dataService.getUsers()`. Before login, `GET /api/users` returns 401 (`backend_files/server.js:156-160`, which lists only health, login and register as public). The `.catch` leaves `mode = 'signin'`.
- **Test:** `auth/signin-signup.spec.ts` › "empty database shows the Initial System Setup form".

#### QA-A-005 A deleted user's session turns into the Admin's identity on reload
- **Severity:** High
- **Steps to reproduce:**
  1. Sign in as the Partner (desktop or mobile).
  2. An Admin deletes the Partner (`DELETE /api/users/<partner id>`).
  3. The Partner reloads the page.
- **Expected:** the Partner is signed out.
- **Actual:** the app stays signed in and `wandergrid_session_user` becomes **`qa.admin@wandergrid.test`**. The UI shows the Admin's name and profile while the Partner's token is still used.
- **Suspected cause:** `App.tsx:163-168`: when the stored user isn't in the roster, it "reconciles" to `users.find(u => u.role === 'Admin') || users[0]` instead of logging out.
- **Test:** `auth/session.spec.ts` › "a deleted user is signed out on reload".

#### QA-A-006 Public sign-up can create Admin accounts
- **Severity:** High
- **Steps to reproduce:** without a token, `POST /api/auth/register` with `"role":"Admin"`.
- **Expected:** the role is forced to Partner, or the request is rejected.
- **Actual:** the response returns `"role":"Admin"` with a valid token.
- **Suspected cause:** `backend_files/server.js:2146-2178` stores `req.body` wholesale. Same as SEC-002.
- **Test:** `auth/session.spec.ts` › "self-registration cannot grant the Admin role".

#### QA-A-007 After signing in from a deep link, you land on the Dashboard instead
- **Severity:** Medium
- **Steps to reproduce:**
  1. While signed out, open `/settings`.
  2. Sign in.
- **Expected:** Settings opens (URL `/settings`).
- **Actual:** the URL becomes `/` and the Dashboard opens, at both widths.
- **Suspected cause:**
  - The login page's pre-auth `getUsers()` 401 (`views/Auth.tsx:25`) makes `dataService.fetch` dispatch `wandergrid-unauthorized` (`services/mockDb.ts:498-506`).
  - `App.tsx:248` handles it with `handleLogout()`, which calls `navigate(ViewState.DASHBOARD)` (`App.tsx:237-242`) and rewrites the URL to `/` before the user signs in.
- **Test:** `auth/session.spec.ts` › "protected deep link while logged out shows sign-in, then opens that page after login".

#### QA-A-008 "Auto-Setup & Demo Run" is shown in production but always fails
- **Severity:** Medium
- **Steps to reproduce:** on the sign-in screen, click **Auto-Setup & Demo Run**.
- **Expected:** a demo session with sample data opens (inventory W4).
- **Actual:** an error banner, "Demo mode unavailable at this moment", at both widths (screenshot in the test artifacts).
- **Suspected cause:** `views/Auth.tsx:84-206`: `handleDemoLogin` first calls `dataService.getUsers()`, which returns 401 before login. The button isn't hidden in production builds.
- **Test:** `auth/signin-signup.spec.ts` › "Auto-Setup & Demo Run opens the app with sample data".

#### QA-A-009 There is no password reset ("Forgot password?") flow
- **Severity:** Medium
- **Steps to reproduce:** open the sign-in screen and look for a reset option.
- **Expected:** a "Forgot password?" link or equivalent.
- **Actual:** none exists, and there is no reset endpoint. A user who forgets their password can only be helped by an Admin editing them, and that path is itself broken (QA-A-003).
- **Suspected cause:** not implemented (inventory W8).
- **Test:** `auth/session.spec.ts` › "sign-in screen offers Forgot password?".

#### QA-A-010 The API still accepts the session token after signing out
- **Severity:** Medium
- **Steps to reproduce:**
  1. Sign in and copy `wandergrid_session_token`.
  2. Click **Sign out**.
  3. `GET /api/trips` with the old token.
- **Expected:** 401.
- **Actual:** **200**. The token stays valid for its full 7 days.
- **Suspected cause:** `App.tsx:237-242`: logout only clears localStorage. There is no server-side revocation (`backend_files/server.js:178-184`). Same as SEC-007.
- **Test:** `auth/session.spec.ts` › "token is no longer accepted by the API after sign-out".

#### QA-A-011 Signing up with an existing email shows "API Error: Bad Request"
- **Severity:** Medium
- **Steps to reproduce:** sign up with an email that's already registered.
- **Expected:** a clear message such as "An account with this email already exists".
- **Actual:** "API Error: Bad Request" at both widths.
- **Suspected cause:** `services/mockDb.ts:518` throws `API Error: ${res.statusText}` and discards the server's JSON `{"error":"User already exists"}` (`backend_files/server.js:2157-2159`).
- **Test:** `auth/signin-signup.spec.ts` › "duplicate email shows a clear already exists message".

#### QA-A-012 Sign-up accepts a 1-character password
- **Severity:** Medium
- **Steps to reproduce:** sign up with password `1` (confirmed).
- **Expected:** a validation message such as "at least 8 characters".
- **Actual:** the account is created and the app opens.
- **Suspected cause:** no length or strength check in `views/Auth.tsx:59-65` or `backend_files/server.js:2146-2150`. The Personnel form's "min 6 characters" is only placeholder text. See SEC-008.
- **Test:** `auth/signin-signup.spec.ts` › "weak password (1 character) is rejected with a message".

#### QA-A-013 Pages overflow sideways
- **Severity:** Medium
- **Steps to reproduce:** signed in, open each page and measure `main.scrollWidth − clientWidth`.
- **Expected:** 0 px.
- **Actual:**
  - **Desktop:** Planner overflows by **114 px**; the filter bar is clipped.
  - **Mobile:** Dashboard by **327 px**, Vacation Calendar by **30 px**.
- **Suspected cause:** the Planner filter row doesn't wrap (`views/PlannerView.tsx` around `:590-670`). An unclipped decorative glow `w-[40rem]` sits in `views/Dashboard.tsx`. The Calendar header and tab bar are in `views/VacationCalendar.tsx` around `:700-990`. See UI-007.
- **Test:** `auth/navigation.spec.ts` › "no horizontal page overflow on the app shell".

#### QA-A-014 Network failure at sign-in shows the raw text "Failed to fetch"
- **Severity:** Low
- **Steps to reproduce:** with the API unreachable (the test aborts `/api/auth/login`), submit valid credentials.
- **Expected:** a helpful message such as "Can't reach the server, try again".
- **Actual:** "Failed to fetch", shown after roughly 3 s of silent retries. The form does re-enable.
- **Suspected cause:** `views/Auth.tsx:76-77` shows `err.message` verbatim. Retries come from `services/mockDb.ts:533-555`.
- **Test:** `auth/signin-signup.spec.ts` › "network failure shows a helpful message and re-enables the form".

#### QA-A-015 The wrong-password message uses jargon
- **Severity:** Low
- **Steps to reproduce:** sign in with a wrong password.
- **Expected:** plain language, such as "Email or password is incorrect".
- **Actual:** "Invalid credentials. Please verify design coordinates."
- **Suspected cause:** `views/Auth.tsx:57`.
- **Test:** `auth/signin-signup.spec.ts` › "error message is plain-language (no jargon)".

#### QA-A-016 Sign out isn't in the main navigation
- **Severity:** Low
- **Steps to reproduce:** signed in, look for sign out in the desktop sidebar, or on mobile in the tab bar and the "More" sheet.
- **Expected:** a visible sign-out control in the main navigation.
- **Actual:** none. The only sign-out button is on the profile page (`UserDetail` › "Sign out").
- **Suspected cause:** `components/Sidebar.tsx:23,34` accepts an `onLogout` prop but never renders a control for it.
- **Test:** `auth/session.spec.ts` › "a sign-out control is reachable from the main navigation".

#### QA-A-017 A profile URL with an encoded `@` (`%40`) never loads
- **Severity:** Low
- **Steps to reproduce:** signed in, open `/user/qa.partner%40wandergrid.test`. Browsers, email clients and chat apps often encode `@` this way.
- **Expected:** the profile opens.
- **Actual:** an endless "Retrieving Traveler ID…" spinner.
- **Suspected cause:** `App.tsx:48` uses the raw `userMatch[1]` without `decodeURIComponent`, so no user matches.
- **Test:** `auth/session.spec.ts` › "profile link with a percent-encoded id (%40) opens the profile".

#### QA-A-018 An unknown profile id spins forever instead of saying "not found"
- **Severity:** Low
- **Steps to reproduce:** signed in, open `/user/does-not-exist`.
- **Expected:** a not-found or empty state.
- **Actual:** "Retrieving Traveler ID…" is still shown after 5 s and never resolves.
- **Suspected cause:** `views/UserDetail.tsx:278`: `if (loading || !user)` renders the spinner whenever the user is missing.
- **Test:** `auth/session.spec.ts` › "unknown user id shows a not-found state instead of an endless spinner".

### Present in the app but missing from the inventory — Chunk A

- **Sign-in loading screen.** "Checking Security Database…" shows while the sign-in screen decides its mode (`views/Auth.tsx`). The inventory doesn't list it.
- **The mobile "More" sheet holds more than navigation.** It also contains the **Appearance (theme) toggle** and the **profile chip**. The inventory lists only its navigation items (inventory §3 #47 and §4).
- **Desktop sidebar empty state.** With no upcoming trip, the widget shows "No trips planned · Plan next adventure", which opens the Planner. The inventory only describes the next-trip widget.
- **Sign-up mode differences.** In sign-up mode the form adds **Full Name** and **Confirm Password** fields. The "Sign Up" toggle is hidden in setup mode, while the demo button stays visible in every mode.
- **Version labels disagree.** The login footer shows "WanderGrid Systems v2.2", while the desktop sidebar shows the build version (`v0.5-YYMMDD.N`).
- **Pre-login 401 side effect.** It rewrites the URL to `/` (QA-A-007). This isn't a feature, but the inventory's "session restore" description doesn't mention it.

---

## Chunk B — Trip creation & planning boards (workflows 9–11, 23)

**Run:** 2026-10-11 · 64 test executions (32 items × 2 viewports): **49 Pass, 13 Fail, 2 Blocked**.
At the item level: **23 Pass, 7 Fail, 2 Blocked**.
Tests: `tests/e2e/planning/` (`wizard.spec.ts`, `planner-board.spec.ts`, `planner2.spec.ts`).

| Spec | Workflow / area | Item tested | Desktop | Mobile |
|---|---|---|---|---|
| planner-board | - | empty state: no trips shows empty-state prompts in each bucket | Pass | Pass |
| planner-board | - | board shows each trip in its status bucket | Pass | Pass |
| planner-board | - | status tabs filter the board (Past / Confirmed / Planned / All) | Pass | Pass |
| planner-board | - | search filters by trip name and the clear (×) restores the list | Pass | Pass |
| planner-board | - | search with no matches shows an empty result, not stale cards | Pass | Pass |
| planner-board | - | year filter shows only trips from that year | Pass | Pass |
| planner-board | - | clicking a trip card opens Trip Detail | Pass | Pass |
| planner-board | - | bucket collapse hides the bucket's cards | Pass | Pass |
| planner-board | - | bulk select → "Archive Selected" archives (keeps) the trips, and they can be found again | Fail | Fail |
| planner-board | - | bulk archive: dismissing the confirmation changes nothing | Pass | Fail |
| planner-board | - | API failure loading trips shows an error, not an empty board | Fail | Fail |
| planner2 | - | tabs: Locked Timeline (Confirmed), Draft Blueprints (Planned), Archive Chronology (History) | Pass | Pass |
| planner2 | - | view modes: grid, timeline and table each render the trips | Pass | Pass |
| planner2 | - | search filters trips and the clear button resets it | Pass | Pass |
| planner2 | - | advanced filters toggle shows the filter selects | Pass | Pass |
| planner2 | - | status toggle "Lock In" moves a draft to Confirmed and persists | Pass | Pass |
| planner2 | - | edit (Configure Trip) renames the trip via the edit drawer | Pass | Pass |
| planner2 | - | batch merge: select two drafts, name, Consolidate → one merged trip | Pass | Blocked |
| planner2 | - | batch merge with fewer than two trips selected does nothing and explains why | Pass | Blocked |
| wizard | - | happy path: title + dates → Create Trip saves a Planning trip and shows it on the board | Pass | Pass |
| wizard | - | Create Trip stays disabled until a title and both dates are set | Pass | Pass |
| wizard | - | destination field is available in the basics step | Pass | Pass |
| wizard | - | full wizard: basics → train leg → stay → Create saves transport and accommodation | Pass | Pass |
| wizard | - | basics step: "Next" applies the same rules as "Create Trip" (destination not secretly required) | Fail | Fail |
| wizard | - | bucket "+" on Confirmed creates an Upcoming trip | Pass | Pass |
| wizard | - | Cancel discards the draft and returns to the Planner without saving | Pass | Pass |
| wizard | - | double-clicking Create Trip creates only one trip | Pass | Pass |
| wizard | - | very long title (300 chars) saves and does not overflow the board | Fail | Fail |
| wizard | - | save failure (network) shows an error and keeps the wizard open with the data | Pass | Pass |
| wizard | - | page refresh mid-flow keeps (or warns before losing) the draft | Fail | Fail |
| wizard | - | browser Back while the wizard is open returns to the Planner board | Fail | Fail |
| wizard | - | Planner-2 "New Trip" opens the same wizard and creates a trip | Pass | Pass |

**Blocked:** the two Planner-2 batch-merge tests pass on desktop. On mobile, the harness could not reliably target the trip cards after entering selection mode; the cards are visible in a manual screenshot. The merge logic was verified on desktop.

**Verified not a bug:** the full wizard (basics → train leg → stay → Create) *does* save the transport legs and stays. An early failure was a race in the test.

### Bug reports — Chunk B

#### QA-B-001 "Archive Selected" permanently deletes trips
- **Severity:** High
- **Steps to reproduce:**
  1. On the Planner, click **Select** (bulk selection).
  2. Tick two trips and click **Archive Selected**, then confirm.
  3. `GET /api/trips`.
- **Expected:** the trips are archived (hidden or moved, and recoverable).
- **Actual:** the trips are **deleted** (only the unselected trip remains). The confirmation even says "archive/remove".
- **Suspected cause:** `views/PlannerView.tsx:351-360`: `handleBulkArchive` calls `dataService.deleteTrip()` for each id. The same pattern is in the edit drawer's "Archive" (`components/NewTripDrawer.tsx:518`; tested in Chunk C).
- **Test:** `planning/planner-board.spec.ts` › "bulk select → Archive Selected archives (keeps) the trips".

#### QA-B-002 On mobile, the "Archive Selected" bar sits under the tab bar and can't be tapped
- **Severity:** Medium
- **Steps to reproduce:** at 375 px, open Planner → **Select**, tick trips, then tap **Archive Selected**.
- **Expected:** the button is tappable.
- **Actual:** the floating selection bar overlaps the bottom navigation, and taps are intercepted ("element intercepts pointer events"). Bulk archive is unusable on phones, and the bar visually collides with the tab labels.
- **Suspected cause:** the selection bar is `fixed bottom-6 … z-sticky` (z-index 40) in `views/PlannerView.tsx` around `:686`. The mobile tab bar is `fixed … z-50` at the same position (`components/Sidebar.tsx:346`).
- **Tests:** `planning/planner-board.spec.ts` › both bulk-archive tests (mobile).

#### QA-B-003 A trip-loading failure looks like an empty board
- **Severity:** Medium
- **Steps to reproduce:** with trips in the database, make `GET /api/trips` fail (the test returns 500) and open `/planner`.
- **Expected:** an error message with a retry option.
- **Actual:** an empty board ("No confirmed bookings yet…"), indistinguishable from having no trips.
- **Suspected cause:** `views/PlannerView.tsx:124-129` reads only `data` from `useWanderSync` and ignores `error` and `loading` (REL-007).
- **Test:** `planning/planner-board.spec.ts` › "API failure loading trips shows an error, not an empty board".

#### QA-B-004 The wizard requires a destination to continue, but not to create the trip
- **Severity:** Low
- **Steps to reproduce:** start a new trip, enter a title and dates with no destination, then click **Confirm Basics** (desktop) or **Next: Configure Transport** (mobile).
- **Expected:** the same rules as the **Create Trip** button, which is enabled and saves without a destination.
- **Actual:** "Please enter a destination." blocks the step, while the header **Create Trip** saves the same data.
- **Suspected cause:** `components/TripSetupBoard.tsx:632-639` (`handleCompleteBasics` requires a destination) versus `:2192` and `:2831` (Create is disabled only on title and dates).
- **Test:** `planning/wizard.spec.ts` › "basics step: Next applies the same rules as Create Trip".

#### QA-B-005 A long trip title makes the board scroll sideways
- **Severity:** Low
- **Steps to reproduce:** create a trip with a 300-character title, then measure the Planner's horizontal overflow.
- **Expected:** the title truncates or wraps; no overflow.
- **Actual:** the board overflows by **139 px at 375 px** and **25 px at 1440 px**.
- **Suspected cause:** trip-card title containers lack `min-w-0` or truncation on long unbroken content (`views/PlannerView.tsx` card markup around `:1180-1230`).
- **Test:** `planning/wizard.spec.ts` › "very long title (300 chars) saves and does not overflow the board".

#### QA-B-006 Refreshing during the trip wizard loses the draft without warning
- **Severity:** Low
- **Steps to reproduce:** start a new trip, type a title, then reload the page.
- **Expected:** the draft is restored, or a "leave page?" warning appears.
- **Actual:** the draft is gone, with no warning.
- **Suspected cause:** wizard state lives only in component state (`components/TripSetupBoard.tsx`); there is no persistence or `beforeunload` handler.
- **Test:** `planning/wizard.spec.ts` › "page refresh mid-flow keeps (or warns before losing) the draft".

#### QA-B-007 Browser Back while the wizard is open leaves the Planner
- **Severity:** Low
- **Steps to reproduce:** go Dashboard → Planner, click **New Trip**, then press browser Back.
- **Expected:** the wizard closes and you stay on the Planner.
- **Actual:** you jump to the Dashboard (`/`) and the draft is discarded.
- **Suspected cause:** the wizard is a local state toggle (`views/PlannerView.tsx:142`, `isNewTripOpen`), with no history entry.
- **Test:** `planning/wizard.spec.ts` › "browser Back while the wizard is open returns to the Planner board".

### Present in the app but missing from the inventory — Chunk B

- **Wizard header extras:** a running **"Est. Total $"** cost readout and clickable **stage tabs** (Trip Basics / Transport / Stays) in the header.
- **Wizard basics step:** a **Travelers** picker (pre-selects the current user), plus an `ExistingBookingsSuggestions` panel.
- **Desktop wizard Destination field:** a "Destination City" field with an address lookup.
- **Planner-2 stat cards:** "Days to launch", "Locked in", "In draft" and "Budget committed". The first card names the next trip, which is why that trip's name appears on every tab.
- **Planner-2 empty-slot card:** a **"Draft new expedition"** card in the grid, which opens the wizard.
- **Planner-2 card actions:** grid cards have **Lock In / Draft** status buttons, **Manage** (opens the trip) and a gear icon (edit). The inventory lists these generically.
- **Mobile Planner-2 selection mode:** shows a **"Batch Integrator"** bottom panel with "Exit selection".

---

## Chunk C — Trip detail & itinerary editing (workflows 12–22)

**Run:** 2026-10-11 · 52 test executions (26 items × 2 viewports): **35 Pass, 14 Fail, 3 Blocked**.
At the item level: **16 Pass, 8 Fail, 2 Blocked**.
Tests: `tests/e2e/trip-detail/trip-detail.spec.ts`.

| Workflow / area | Item tested | Desktop | Mobile |
|---|---|---|---|
| - | trip page loads with name, dates and all section tabs | Pass | Pass |
| - | unknown trip id shows a not-found state | Pass | Pass |
| - | "Back to planner" returns to the Planner | Fail | Fail |
| - | every tab renders without crashing | Pass | Pass |
| - | all section tabs can be reached (on screen or by scrolling the tab strip) | Pass | Fail |
| - | trip page has no horizontal overflow (baseline) | Fail | Fail |
| - | W12 Edit Settings: rename the trip and save | Pass | Pass |
| - | W12 Edit Settings: an empty name is rejected | Pass | Pass |
| - | W12/W22 "Archive" in the edit drawer archives the trip (it is not permanently deleted) | Fail | Fail |
| - | W13 add a train booking from Bookings → + Add Booking | Blocked | Blocked |
| - | W14 add a stay from Bookings → + Add Stay | Pass | Pass |
| - | W14 save failure (API 500) shows an error and keeps the dialog open | Pass | Pass |
| - | W15 add an activity from the Daily Planner and delete it | Pass | Pass |
| - | W15 very long activity name (400 chars) saves without breaking the layout | Fail | Fail |
| - | W16 Route tab: add a route leg and save | Pass | Pass |
| - | W17 Gear: add, check off and delete a packing item | Pass | Pass |
| - | W17 Gear: an empty item cannot be added | Pass | Pass |
| - | W17 Gear: "Clear All" asks for confirmation before deleting the list | Pass | Fail |
| - | W17 Gear: "Magic Generate" without a Gemini key explains what to do | Pass | Blocked |
| - | W18 AI Guide greets with the trip and explains a missing API key on send | Pass | Pass |
| - | W18 AI Guide does not execute HTML from the trip name (stored XSS) | Fail | Fail |
| - | W19 ICS export downloads a calendar file containing the trip | Pass | Pass |
| - | W20 Import opens the flight import wizard and it can be closed | Pass | Pass |
| - | W21 Cinematic view opens full-screen and closes | Pass | Pass |
| - | W21 Cinematic view closes with Escape | Fail | Fail |
| - | Cost Breakdown totals transport + stay costs | Pass | Pass |

**Blocked:**
- **W13 (add a train via + Add Booking):** the dialog's **Save** stays disabled (`components/FlightConfigurator.tsx:334-336`, `isValid` needs every leg's origin, destination and date). The harness could not set the leg date in the custom `DatePicker` inside the dialog. Not counted as a bug.
- **"Magic Generate" (mobile):** the message is shown on desktop, but could not be located on mobile.

**Overrides:**
- The mobile result of "all section tabs can be reached" is recorded as **Fail** from a direct measurement, not from that test. At 375 px the *Daily Planner* tab sits at x = −124…−7 with `scrollLeft = 0`, so it can't be reached. My automated check missed it.
- "Clear All" passed once on desktop (the click did not register in that run). The code has no confirmation (`components/PackingList.tsx:190`), and it failed on desktop in the first run and on mobile in every run.

### Bug reports — Chunk C

#### QA-C-001 Stored XSS: a trip name runs as script in the AI Guide tab
- **Severity:** Critical
- **Steps to reproduce:**
  1. Rename a trip to `XSS <img src=x onerror="window.__qaXss=1">`. Any user can do this through `PUT /api/trips/:id`.
  2. Open the trip and click the **AI Guide** tab.
- **Expected:** the name is shown as text.
- **Actual:** `window.__qaXss === 1`; the injected handler executed, at both widths. Any user can run script in other users' sessions and steal the 7-day token from localStorage.
- **Suspected cause:** `views/TripDetail.tsx:418` builds the greeting with `${trip.name}`, and `:491` renders it with `dangerouslySetInnerHTML`. The same code is at `TripDetail2.tsx:390/463`. Confirms SEC-004 live.
- **Test:** "W18 AI Guide does not execute HTML from the trip name (stored XSS)".

#### QA-C-002 The edit drawer's "Archive" permanently deletes the trip
- **Severity:** High
- **Steps to reproduce:** open a trip → **Edit Settings** → **Archive** → confirm.
- **Expected:** the trip is archived and kept.
- **Actual:** the trip is deleted (`GET /api/trips` no longer returns it), and you're sent to the Dashboard.
- **Suspected cause:** `components/NewTripDrawer.tsx:518` (`handleDelete` calls `dataService.deleteTrip`) and `views/TripDetail.tsx:742-745`. Same pattern as QA-B-001.
- **Test:** "W12/W22 Archive in the edit drawer archives the trip".

#### QA-C-003 On mobile, the "Daily Planner" tab is clipped off-screen and can't be reached
- **Severity:** Medium
- **Steps to reproduce:** at 375 px, open a trip, switch to another tab, then try to return to **Daily Planner**.
- **Expected:** every tab is reachable (visible, or reachable by scrolling the strip).
- **Actual:** the tab sits at x = −124 to −7, and the strip's `scrollLeft` is already 0, so it can't be scrolled into view. Once you leave the tab you can't get back without reloading.
- **Suspected cause:** `components/ui.tsx:504`: the `Tabs` wrapper uses `justify-center … overflow-x-auto`. Centered overflowing flex content is clipped on the left and can't be scrolled. Use `justify-start` on small screens, or `mx-auto` on an inner wrapper.
- **Tests:** "all section tabs can be reached" (measured), plus the mobile failures of the tab-switching tests in earlier runs.

#### QA-C-004 "Back to planner" goes to the Dashboard
- **Severity:** Low
- **Steps to reproduce:** open a trip, then click the back arrow labelled "Back to planner".
- **Expected:** `/planner`.
- **Actual:** `/` (Dashboard), at both widths.
- **Suspected cause:** `App.tsx:296`: `onBack={() => navigate(ViewState.DASHBOARD)}`. The button is labelled at `views/TripDetail.tsx:1451`.
- **Test:** "Back to planner returns to the Planner".

#### QA-C-005 "Clear All" deletes the whole packing list with no confirmation or undo
- **Severity:** Medium
- **Steps to reproduce:** in the trip's **Gear** tab, add an item, then click **Clear All**.
- **Expected:** a confirmation (or undo).
- **Actual:** the list is emptied and saved immediately.
- **Suspected cause:** `components/PackingList.tsx:190`: `onClick={() => onUpdate([])}`.
- **Test:** "W17 Gear: Clear All asks for confirmation".

#### QA-C-006 Escape doesn't close the Cinematic view
- **Severity:** Low
- **Steps to reproduce:** on a trip, click **Cinematic View**, then press Escape.
- **Expected:** the full-screen overlay closes.
- **Actual:** it stays open; only the on-screen close button works.
- **Suspected cause:** `views/TripDetail.tsx:2643`: the overlay has no key handler (contrast with the shared `Modal`).
- **Test:** "W21 Cinematic view closes with Escape".

#### QA-C-007 The trip page scrolls sideways
- **Severity:** Low
- **Steps to reproduce:** open any trip and measure horizontal overflow.
- **Expected:** 0 px.
- **Actual:** **25 px at 1440 px** and **139 px at 375 px**, even with no long content. A 400-character activity name gives the same numbers, so the overflow comes from the page layout itself.
- **Suspected cause:** wide fixed-width elements in the trip header and tab row of `views/TripDetail.tsx` (see UI-007).
- **Tests:** "trip page has no horizontal overflow (baseline)" and "W15 very long activity name…".

### Present in the app but missing from the inventory — Chunk C
- **Daily Planner sub-views:** there are four (Canvas, List, Table, Calendar); the inventory lists only the board.
- **Mobile day view:** has its own "+ Add Activity" control (`components/DailyPlannerBoard.tsx:751`).
- **Header weather pill:** the trip header shows a weather pill (`fetchTripWeather`).
- **Hidden edit-drawer behaviour:** "Archive" doubles as delete (QA-C-002).
- **Transport legs need dates:** the transport dialog's **Save** is disabled until every leg has origin, destination and date. The inventory doesn't describe this requirement.

---

## Chunk D — Flights (workflows 24–29)

**Run:** 2026-10-11 · 34 test executions (17 items × 2 viewports; 1 n/a): **21 Pass, 10 Fail, 2 Blocked**.
At the item level: **7 Pass, 8 Fail, 2 Blocked**.
Tests: `tests/e2e/flights/flights.spec.ts`.

| Workflow / area | Item tested | Desktop | Mobile |
|---|---|---|---|
| - | empty flight log shows an empty state with an Add Flight action | Pass | Pass |
| - | W24 add a flight manually (JFK → LHR) and see it in the log | Pass | Pass |
| - | W24 saving with empty fields shows a validation message and saves nothing | Pass | Pass |
| - | W24 validation message is shown inline (not a browser alert) | Fail | Fail |
| - | W24 edit an existing flight (seat number) and save | Pass | Fail |
| - | W24 double-clicking Save creates only one flight | Fail | Fail |
| - | W24 save failure (network) shows an error and keeps the form open | Pass | Pass |
| - | W25 delete a flight (confirm) removes it | Pass | Fail |
| - | W25 delete → Cancel keeps the flight | Pass | Fail |
| - | W26 bundle two flights into an expedition | Pass | Fail |
| - | W26 unbundle returns flights to the standalone log | Pass | Fail |
| - | W27 Upcoming / Past tabs filter the log | Pass | Blocked |
| - | W27 search narrows the log and Reset restores it | Pass | Blocked |
| - | W27 table and grid views both list the flight | Pass | n/a |
| - | flights page has no horizontal overflow with data | Pass | Pass |
| - | W28 Track Flight (Dashboard) shows a clear result or error for AA100 | Pass | Fail |
| - | W29 spreadsheet import (Settings › Data): CSV → map → verify → import | Pass | Pass |

**Blocked:** W27 tab and search filtering on mobile. They pass on desktop. On mobile the harness could not reliably locate airport codes in the mobile flight list.

**Verified working:**
- Manual add (JFK→LHR) at both widths.
- Spreadsheet import (CSV → map → verify → "Import Selected Flights (2)").
- Bundle and unbundle on desktop.
- Delete confirm and cancel on desktop.
- On a network failure the form shows an error (as a native alert) and stays open.

### Bug reports — Chunk D

#### QA-D-001 Double-clicking "Save Boarding Stub" creates two flights
- **Severity:** Medium
- **Steps to reproduce:** **Add Flight** → enter CDG → ATH → double-click **Save Boarding Stub**.
- **Expected:** one flight.
- **Actual:** two identical flights, at both widths.
- **Suspected cause:** `views/Flights.tsx:1295` has no in-flight guard, and `:1313` generates a new random id on each submit. The button is never disabled (REL-006).
- **Test:** "W24 double-clicking Save creates only one flight".

#### QA-D-002 On mobile, individual flights can't be edited or deleted
- **Severity:** High
- **Steps to reproduce:** at 375 px, with a standalone flight in the log, look for edit or delete on the flight card, or tap it.
- **Expected:** edit and delete controls, as on desktop ("Edit Flight Bookings" / "Delete Flight").
- **Actual:** the mobile list renders no edit or delete buttons; the DOM query found none. Tapping a card does nothing outside multi-edit mode. The only remaining path, multi-edit, is blocked by QA-D-003.
- **Suspected cause:** the mobile timeline renderer in `views/Flights.tsx` (`md:hidden` list, around `:589` and `:3613`, `renderMobileTripContainer`) omits the row actions. The card `onClick` at `:2328-2338` only toggles selection in multi-edit mode.
- **Tests:** W24 edit (mobile), W25 delete and cancel (mobile).

#### QA-D-003 On mobile, the multi-edit action bar is covered by the tab bar
- **Severity:** Medium
- **Steps to reproduce:** at 375 px, **Edit Flights** → select flights → tap **Select All** / **Bundle** / **Unbundle**.
- **Expected:** the buttons are tappable.
- **Actual:** "`<div class="flex md:hidden fixed bottom-safe-nav … z-50">` … intercepts pointer events". The bottom tab bar covers the bar.
- **Suspected cause:** `views/Flights.tsx:3629` (`fixed bottom-6 … z-sticky`, z-index 40) sits under `components/Sidebar.tsx:346` (`z-50`). Same defect as QA-B-002.
- **Tests:** W26 bundle and unbundle (mobile).

#### QA-D-004 The "Track Flight" button has no accessible name on mobile
- **Severity:** Medium
- **Steps to reproduce:** at 375 px, open the Dashboard and look for the **Track Flight** button by role and name, as a screen reader would.
- **Expected:** a button named "Track Flight".
- **Actual:** the label is `hidden xs:inline sm:inline`, so on phones the button is icon-only with no `aria-label`. Screen-reader users can't find it, and the test could not locate it.
- **Suspected cause:** `views/Dashboard.tsx:964-970`. Add `aria-label="Track flight"`.
- **Test:** "W28 Track Flight (Dashboard)…" (mobile).

#### QA-D-005 Flight form validation uses a browser alert
- **Severity:** Low
- **Steps to reproduce:** **Add Flight** → click **Save Boarding Stub** with empty fields.
- **Expected:** inline field errors.
- **Actual:** a native `alert("Please fill in Departure, Arrival, Airfields, and Dates.")`. Save failures also use `alert("Failed to save flight records.")`.
- **Suspected cause:** `views/Flights.tsx:1298` and `:1390` (UI-012).
- **Test:** "W24 validation message is shown inline (not a browser alert)".

### Present in the app but missing from the inventory — Chunk D
- **Flight form layout:** "Find Flight Schedules / Find Flights" route search, plus a collapsible **Manual Entry** section. The seat, flight number and PNR fields are hidden until it's expanded.
- **Default date:** the Departure Date defaults to today.
- **Header buttons:** "View Flight Stats" and "Filter flights" (mobile).
- **Mobile layout:** a mobile-only timeline list replaces the table, without row actions (QA-D-002).

---

## Chunk E — Road trips & routing (workflows 30–32)

**Run:** 2026-10-11 · 32 test executions (16 items × 2 viewports): **25 Pass, 2 Fail, 5 Blocked**.
At the item level: **12 Pass, 1 Fail, 3 Blocked**.
Tests: `tests/e2e/roadtrips/roadtrips.spec.ts`.

| Workflow / area | Item tested | Desktop | Mobile |
|---|---|---|---|
| - | empty state when there are no land journeys | Pass | Pass |
| - | W30 create a train journey (Paris → Lyon) and see it listed | Pass | Pass |
| - | W30 required fields: saving an empty form shows a message and saves nothing | Pass | Pass |
| - | W30 Calculate Route with the routing service unreachable shows a clear message | Blocked | Blocked |
| - | W30 add and remove a waypoint | Pass | Pass |
| - | W30 associate the journey with an existing trip | Pass | Pass |
| - | W30 edit a journey (operator) and save | Pass | Pass |
| - | W30 double-clicking Create Journey creates one record | Fail | Fail |
| - | W31 Auto-Sync is disabled until a target trip is selected | Pass | Pass |
| - | W30 pressing Escape in an address suggestion list keeps the journey dialog open | Pass | Pass |
| - | W31 Auto-Sync finds a land segment inside a trip and saves it | Blocked | Blocked |
| - | W32 search filters journeys | Pass | Pass |
| - | W32 delete a journey (confirm) removes it | Pass | Pass |
| - | W32 delete → dismiss confirmation keeps the journey | Pass | Pass |
| - | W32 bulk select and delete two journeys | Pass | Blocked |
| - | road trips page has no horizontal overflow with data | Pass | Pass |

**Blocked:**
- **Calculate Route with routing unreachable:** the harness blocks the *server's* routing proxy, but the client falls back to calling OSRM/Valhalla directly from the browser (`services/multiModalRouting.ts:314`, `:385`), and the browser could reach them. The failure path could not be forced.
- **Auto-Sync with a real trip:** the target-trip dropdown only lists trips with at least 2 route stops. The seeded trip was not offered, and the cause was not resolved.
- **Bulk delete (mobile):** a tap was intercepted. Likely the same tab-bar overlap as QA-D-003, but this was not confirmed for this page.

**Verified working:**
- Create, edit, search and delete (with confirm and cancel).
- Associating a journey with a trip.
- Waypoints.
- Required-field validation.
- Auto-Sync is correctly disabled until a target trip is chosen.
- Pressing Escape in an address suggestion list did *not* lose the form in the final run.

### Bug reports — Chunk E

#### QA-E-001 Double-clicking "Create Journey" creates two journeys
- **Severity:** Medium
- **Steps to reproduce:** **Add Land Journey** → Milan → Rome → double-click **Create Journey**.
- **Expected:** one record.
- **Actual:** two, at both widths.
- **Suspected cause:** `views/RoadTrips.tsx` `handleSaveTransport` (around `:780-870`) has no saving guard; the submit button (`:1919`) is never disabled (REL-006).
- **Test:** "W30 double-clicking Create Journey creates one record".

### Present in the app but missing from the inventory — Chunk E
- **Smart Sync Engine panel:** has a **Target Trip planner** select and a **Transit travel method** select. Auto-Sync needs a trip with at least 2 route stops; the inventory just says "Auto-Sync Segments".
- **Interactive Travel Hub:** a world map with zoom controls, "Map settings" and an info button, plus 4 KPI cards (Total journeys, Transit distance, Eco optimization, Financial expense).

---

## Chunk F — Map, Atlas, Dashboard & Calendar (workflows 42–46)

**Run:** 2026-10-11 · 46 test executions (23 items × 2 viewports; 1 n/a): **28 Pass, 10 Fail, 7 Blocked**.
At the item level: **12 Pass, 6 Fail, 5 Blocked**.
Tests: `tests/e2e/explore/explore.spec.ts`.

| Workflow / area | Item tested | Desktop | Mobile |
|---|---|---|---|
| W42 Dashboard | loads with stats tabs and switches between them | Pass | Pass |
| W42 Dashboard | stamp search: no matches shows an empty result and × clears it | Pass | Pass |
| W42 Dashboard | 2D/3D map toggle switches mode and remembers it after reload | Pass | Pass |
| W42 Dashboard | loading the Dashboard does not write data (read-only view) | Fail | Fail |
| W42 Dashboard | no horizontal overflow on the Dashboard | Pass | Fail |
| W43 Map | map page renders with view-mode pills and Mission Control | Pass | Blocked |
| W43 Map | view-mode pills switch (Flights → Scratch → All Expeditions) | Pass | Pass |
| W43 Map | filters panel: status segment + Reset All Filters | Blocked | Blocked |
| W43 Map | Mission Control opens its tabs and closes | Pass | Blocked |
| W43 Map | zoom controls respond (desktop) | Pass | n/a |
| W44 Travel Atlas records | add a visited country via the modal | Fail | Fail |
| W44 Travel Atlas records | country form requires a code and name | Fail | Fail |
| W44 Travel Atlas records | edit a country record | Fail | Fail |
| W44 Travel Atlas records | remove a country (with confirmation) | Pass | Pass |
| W44 Travel Atlas records | tabs: Visited / Layovers / Wishlist / Cities / Sync all render | Pass | Pass |
| W44 Travel Atlas records | search with no matches shows an empty result | Pass | Pass |
| W45 Atlas scan history | scan finds the country of a past trip and registers it | Pass | Blocked |
| W46 Vacation calendar | month navigation and Today | Pass | Pass |
| W46 Vacation calendar | tabs Timeline / Grid / Agenda / Optimizer render | Pass | Pass |
| W46 Vacation calendar | a trip in the current month opens its details and "Inspect Trip Logistics" goes to the trip | Blocked | Blocked |
| W46 Vacation calendar | traveler filter: "Filter None" hides everyone, "Unify All" restores | Pass | Pass |
| W46 Vacation calendar | trip count label uses correct plural ("1 trip") | Pass | Pass |
| W46 Vacation calendar | no horizontal overflow on the calendar | Pass | Fail |

**Blocked:**
- **Map filter panel:** the "Past" control inside "Controls & Appearance" was not located.
- **Calendar → "Inspect Trip Logistics":** the trip item was not located as a button.
- **Mobile Mission Control and mobile Atlas Scan:** taps were intercepted by an overlay. Probably the tab bar, but not confirmed per page.

**Verified working:**
- Dashboard stats tabs, stamp search and clear, and the 2D/3D toggle (persisted).
- Map renders, view-mode pills, Mission Control opens and closes with Escape (desktop), zoom controls.
- Atlas: remove country (with confirm), all tabs, search with no matches.
- Atlas scan on desktop.
- Calendar month navigation, the 4 tabs, and the traveler filter toggle.

### Bug reports — Chunk F

#### QA-F-001 Travel Atlas: the add/edit country dialog never opens
- **Severity:** High
- **Steps to reproduce:** on **Travel Atlas**, click **Visited Country** (header), the empty-state **Add Visited Country**, or **Edit Record** on any country.
- **Expected:** the record dialog opens (code, name, status, and so on).
- **Actual:** nothing happens at either width. No dialog element is mounted and no console error appears. Manual country and city records can't be created or edited.
- **Suspected cause:** `views/TravelAtlas.tsx:1698-1700`: `<AnimatePresence>{isModalOpen && createPortal(...)}`. Framer-motion's `AnimatePresence` only renders children that pass `React.isValidElement`, and a portal does not, so it is silently dropped. `handleOpenAdd` (`:361-374`) does set `isModalOpen`. Fix: put `AnimatePresence` *inside* the portal. This is the only place in the codebase with this pattern.
- **Tests:** "add a visited country via the modal", "country form requires a code and name", "edit a country record".

#### QA-F-002 Opening the Dashboard writes to the database
- **Severity:** Medium
- **Steps to reproduce:** with a past trip and no Atlas records, open `/` and watch the network.
- **Expected:** a read-only page load.
- **Actual:** `POST /api/visited/bulk`, at both widths. Records are auto-seeded into the Atlas without the user doing anything.
- **Suspected cause:** `views/Dashboard.tsx:759-762` (`void dataService.addVisitedBulk(bulkSeed)`, fire-and-forget; REL-015).
- **Test:** "loading the Dashboard does not write data".

#### QA-F-003 Dashboard and Calendar scroll sideways on mobile
- **Severity:** Low
- **Steps to reproduce:** at 375 px, open `/` and `/calendar` and measure horizontal overflow.
- **Expected:** 0 px.
- **Actual:** Dashboard **327 px** (an unclipped decorative glow, `w-[40rem]`); Calendar **30 px** (header and tab bar). Same root cause as QA-A-013 and UI-007.
- **Tests:** "no horizontal overflow on the Dashboard / calendar" (mobile).

### Present in the app but missing from the inventory — Chunk F
- **Atlas "New Footprints Discovered" banner:** shows counts and a **Review Footprint Map** button.
- **Atlas stat cards and coverage meter:** Visited nations, Layover stops, Wishlist targets, Tracked cities, and a "Coverage %" meter. The Tracked cities count was already 1 here from the Dashboard auto-seed (QA-F-002).
- **Map controls:** "View data credits and attribution" button; a "Controls & Appearance" button that opens the filter sidebar.
- **Desktop sidebar trip state:** the "Coming up next" card shows "Ongoing" for a trip in progress.

---

## Chunk G — Settings, data & administration (workflows 33–41, 48)

**Run:** 2026-10-11 · 54 test executions (27 items × 2 viewports): **40 Pass, 12 Fail, 2 Blocked**.
At the item level: **20 Pass, 6 Fail, 1 Blocked**.
Tests: `tests/e2e/settings/settings.spec.ts`.

| Workflow / area | Item tested | Desktop | Mobile |
|---|---|---|---|
| W34 Workspace preferences | change organisation name and currency, save, persists after reload | Pass | Pass |
| W34 Workspace preferences | working-day toggles save | Pass | Pass |
| W34 Workspace preferences | save failure (500) shows an error and the button recovers | Fail | Fail |
| W34 Workspace preferences | settings page has no horizontal overflow | Pass | Pass |
| W33 Personnel | enroll a member: appears in the roster and can sign in with the given password | Fail | Fail |
| W33 Personnel | enroll requires name, email and password | Pass | Pass |
| W33 Personnel | enrolling an email that already exists is rejected | Pass | Pass |
| W33 Personnel | edit a member name | Pass | Pass |
| W33 Personnel | remove a member (confirm) | Pass | Pass |
| W33 Personnel | the signed-in admin cannot remove their own account | Fail | Fail |
| W35 Integrations | API key is saved and masked by default | Pass | Pass |
| W35 Integrations | "Test All Services" reports a result for each provider (no auth errors) | Fail | Fail |
| W36 Gear master list | add and remove a master packing item, saved to settings | Pass | Pass |
| W36 Gear master list | an empty gear item cannot be added | Pass | Pass |
| W37 Carriers | register a carrier via the drawer and save | Pass | Pass |
| W37 Carriers | Register Carrier is disabled until name, code and domain are filled | Pass | Pass |
| W38 Backup & restore | download backup: valid JSON with trips and no passwords | Pass | Pass |
| W38 Backup & restore | restore from file (merge) adds the trip from the backup | Blocked | Blocked |
| W38 Backup & restore | restore of an invalid file shows an error and changes nothing | Fail | Fail |
| W39 Calendar export & subscription | Download .ICS Calendar File produces a calendar | Pass | Pass |
| W39 Calendar export & subscription | the copied iCal subscription URL returns a calendar | Fail | Fail |
| W40 Wipe database | Wipe button stays disabled until "DELETE" is typed | Pass | Pass |
| W40 Wipe database | wipe deletes all data and returns to sign-in | Pass | Pass |
| W41 Profile | edit profile name and passport number | Pass | Pass |
| W41 Profile | editing the profile without touching the password keeps the existing password working | Pass | Pass |
| W41 Profile | profile trip table: edit a trip name | Pass | Pass |
| W48 Error recovery | a view crash shows the recovery card, and "Return to Dashboard" works | Pass | Pass |

**Blocked:** "restore from file (merge)". After choosing the file, the restore confirmation flow did not complete in the harness. The invalid-file case is a confirmed bug (QA-G-005).

**Override:** "enroll requires name, email and password" is a **Pass**. **Save Member** is correctly disabled until the fields are filled; the test initially timed out waiting for it to become enabled.

**Verified working:**
- Workspace name, currency and working days save and persist.
- Settings tabs have no overflow.
- Member edit and remove.
- Duplicate-email enroll is rejected without overwriting the existing user.
- API key saved and masked.
- Gear add/remove; an empty gear item is blocked.
- Carrier register; its button is disabled until complete.
- Backup download is valid JSON without passwords.
- `.ics` download.
- The wipe button is gated on typing `DELETE`; wipe then logs out.
- Profile name and passport edit; editing without a password keeps the old one working.
- Profile trip edit.
- A crash shows the recovery card, and "Return to Dashboard" works.

### Bug reports — Chunk G

#### QA-G-001 A member enrolled in Settings can never sign in
- **Severity:** High
- **Steps to reproduce:**
  1. **Settings › Personnel › Enroll Member**: Elena Rostova, `elena@wandergrid.test`, password `Elena!Pass1` → **Save Member**.
  2. `POST /api/auth/login` with those credentials.
- **Expected:** 200.
- **Actual:** **401**, at both widths.
- **Suspected cause:** `services/mockDb.ts:907-912` (`addUser` hashes in the browser with SHA-256 into `salt:hash`). The server stores any value containing `:` as-is (`backend_files/server.js:2200`) and verifies with PBKDF2-SHA512. Same root cause as QA-A-003.
- **Test:** "enroll a member: … can sign in with the given password".

#### QA-G-002 The signed-in admin can delete their own account
- **Severity:** High
- **Steps to reproduce:** as the only admin, **Settings › Personnel** → **Delete member** on your own row → **Confirm Removal**.
- **Expected:** prevented, or at least warned.
- **Actual:** the admin's account is deleted (it's gone from `GET /api/users`). The workspace can be left with no administrator, and the session continues in a broken state.
- **Suspected cause:** `views/Settings.tsx:436-442` (`handleConfirmDeleteMember`) has no self or last-admin check, and the server has none either (SEC-001).
- **Test:** "the signed-in admin cannot remove their own account".

#### QA-G-003 "Test All Services" always fails authentication
- **Severity:** Medium
- **Steps to reproduce:** **Settings › Integrations** → **Test All Services**.
- **Expected:** a real reachability result per provider.
- **Actual:** **7 × HTTP 401** from `/api/proxy/test/:provider`, so every provider shows as failed regardless of its real status.
- **Suspected cause:** `views/Settings.tsx:232`: a bare `fetch` without the `Authorization` header, against an API that requires it (`backend_files/server.js:290`).
- **Test:** "Test All Services reports a result for each provider (no auth errors)".

#### QA-G-004 The copied iCal subscription URL doesn't work
- **Severity:** Medium
- **Steps to reproduce:** **Settings › Data Management** → **Copy iCal Subscription URL**, then `GET` the copied URL.
- **Expected:** 200 with `BEGIN:VCALENDAR`.
- **Actual:** the URL is `/api/calendar.ics`, which returns **401**; the route doesn't exist. The real feed is `/api/calendar/:userId/feed.ics`.
- **Suspected cause:** `views/Settings.tsx:652`.
- **Test:** "the copied iCal subscription URL returns a calendar".

#### QA-G-005 A failed settings save shows no error
- **Severity:** Medium
- **Steps to reproduce:** **Settings › Workspace**, change the org name, then make `PUT /api/settings` fail (the test returns 500) and click **Save Settings**.
- **Expected:** an error message, and the button recovers.
- **Actual:** no error is shown. The change is also applied locally first, so the UI looks saved when it isn't.
- **Suspected cause:** `views/Settings.tsx:444-451` (no `try`/`finally`); `services/mockDb.ts:1366-1373` (optimistic local write before the PUT) (REL-007).
- **Test:** "save failure (500) shows an error and the button recovers".

#### QA-G-006 Restoring an invalid backup file gives no feedback
- **Severity:** Low
- **Steps to reproduce:** **Settings › Data Management** → **Restore From File** → choose a file containing `{not valid json`.
- **Expected:** an error such as "Invalid or unparseable JSON file".
- **Actual:** nothing is shown, at both widths.
- **Suspected cause:** `views/Settings.tsx:557-582`: the parse error sets `restoreStatus='error'` and a message, but these render only inside the restore dialog, which isn't opened on this path.
- **Test:** "restore of an invalid file shows an error and changes nothing".

### Present in the app but missing from the inventory — Chunk G
- **Data Management actions:** a "Launch Flight Wizard (.xlsx, .csv, airtrail)" entry and "Download .ICS Calendar File". The wipe trigger is labelled "Wipe & Reset Application".
- **Settings save button:** a single **Save Settings** button saves the Workspace, Integrations, Gear and Carriers tabs together; there are no per-tab saves.
- **Carriers drawer:** the save button reads **Register Carrier**, and there's an **Auto-Fill** action.
- **Integrations:** has a "View Documentation" link per provider.

---

## Overall QA summary (all chunks)

| Chunk | Items | Pass | Fail | Blocked |
|---|---|---|---|---|
| A — Auth & access | 48 | 29 | 18 | 1 |
| B — Trip creation & planning | 32 | 23 | 7 | 2 |
| C — Trip detail | 26 | 16 | 8 | 2 |
| D — Flights | 17 | 7 | 8 | 2 |
| E — Road trips | 16 | 12 | 1 | 3 |
| F — Map, Atlas, Dashboard, Calendar | 23 | 12 | 6 | 5 |
| G — Settings & admin | 27 | 20 | 6 | 1 |
| **Total** | **189** | **119** | **54** | **16** |

Bug reports filed: QA-A-001…018, QA-B-001…007, QA-C-001…007, QA-D-001…005, QA-E-001, QA-F-001…003, QA-G-001…006 (**47 reports**). Several Fail items share one root cause.

All suites run with:

```
cd tests/e2e && npm install && npx playwright test
```

There are 8 spec files and ≈ 420 executions across desktop and mobile. A full run takes about 45–50 minutes.
