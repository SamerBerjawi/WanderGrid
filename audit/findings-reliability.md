# WanderGrid — Reliability Findings

**Date:** 2026-10-11
**Scope:** the whole repository at `main` (working tree), covering the frontend SPA and `backend_files/`. Security issues are out of scope here; see `audit/findings-security.md`.
**Method:** I read the code with references to `audit/inventory.md`, ran the backend test suite and `tsc`, and reproduced failures against a running server.

**Live runs.** I started `backend_files/server.js` unmodified with `NODE_ENV=production` and a test `JWT_SECRET`, pointed at an **unreachable** Postgres (`127.0.0.1:5999`). Tokens were signed locally with that secret. No application code was modified.

---

### REL-001 One request during a database outage crashes the whole server (`/api/wipe`, `/api/restore`)
- **Severity:** High
- **Location:** `backend_files/server.js:2847` (`/api/wipe`), `:2629` (`/api/restore`). There is no `process.on('unhandledRejection')` anywhere in `backend_files/`.
- **Evidence:**
  ```js
  app.post('/api/wipe', async (req, res) => {
      const client = await pool.connect();   // outside try → rejected promise escapes the handler
      try { await client.query('BEGIN'); ...
  ```
  Express 4 does not catch rejected async handlers, and Node ≥15 exits on an unhandled rejection. The repro was run with the DB unreachable:
  ```
  GET  /api/trips  → {"error":"Failed to retrieve trips"} [500]      # handled correctly
  POST /api/wipe   → [000] (connection dropped)
  GET  /api/health → [000] (no response)
  server log: Error: connect ECONNREFUSED 127.0.0.1:5999 … PROCESS EXITED code=1
  ```
- **Impact:** A brief DB blip (restart, failover, or the pool hitting `connectionTimeoutMillis: 5000` under load) plus one restore or wipe click takes the API down for every user until the container restarts. The same crash happens if `pool.connect()` times out during a restore of a large backup.
- **Suggested fix:**
  - Move `pool.connect()` inside `try` in both handlers, or reuse `withTransaction`.
  - Wrap async routes in an `asyncHandler` (or upgrade to Express 5, which forwards rejections) and add a final error middleware.
  - Add `process.on('unhandledRejection', logger.error)` as a last line of defense.
- **Effort:** S

### REL-002 Bundling flights is not atomic: if the last step fails, the flights are lost
- **Severity:** High
- **Location:** `views/Flights.tsx:1454-1535` (`executeBundle`); `views/Flights.tsx:1295-1390` (`handleSaveFlight`, edit/move path).
- **Evidence:**
  - The write order in `executeBundle` has no `try`/`catch` and no compensation:
    ```ts
    for (const tripId in tripsToUpdateMap) await dataService.updateTrip(...);   // 1. strip flights from their old trips
    for (const fid of independentFlightsToDelete) await dataService.deleteFlight(fid); // 2. delete standalone flights
    ...
    await dataService.addTrip(newTrip);                                            // 3. only now save them in the bundle
    ```
  - `handleSaveFlight`'s move path does the same in reverse order: `deleteFlight(...)` (`:1340`), then `updateTrip(oldTrip)` (`:1345`), then `addFlight`/`updateTrip(targetTrip)` (`:1350-1354`).
  - Each call is a separate HTTP request. `dataService.fetch` throws after 3 attempts on network or 5xx errors (`services/mockDb.ts:469-555`).
- **Impact:** A failure at step 3 (network drop, 413, server restart, or the REL-001 crash) leaves the selected flights removed from their trips and deleted, with no bundle containing them. That is permanent data loss with no error shown. `executeBundle` has no catch, so the rejection is unhandled and the modal stays open.
- **Suggested fix:**
  - Reorder so the new record is written first and removals happen last, so a failure leaves duplicates rather than loss.
  - Better, add a server endpoint (`POST /api/trips/bundle`) that performs all writes in one `withTransaction`.
  - Surface failures in the UI.
- **Effort:** M

### REL-003 Opening a trip runs hidden writes that can hang the page on "Loading Trip Data…" forever
- **Severity:** High
- **Location:** `views/TripDetail.tsx:619-693` (`loadData` → `runAutoAssignment`); the same code exists in `views/TripDetail2.tsx`.
- **Evidence:**
  ```ts
  Promise.all([...]).then(([tripsList, allUsers, s, ents, configs, independentFlights]) => {
      const runAutoAssignment = async () => { ... await dataService.updateTrip(trip); ... await dataService.deleteFlight(fId); ... };
      runAutoAssignment().then(finalTrips => {           // ← not returned, no .catch
          ...
          const flatHolidays = configs.flatMap(c => c.holidays.map(...));   // throws if a config lacks `holidays`
          setLoading(false);
      });
  }).catch(err => { console.error(...); setLoading(false); });  // never sees errors from the inner chain
  ```
  The page shows `if (loading) return <div …>Loading Trip Data...</div>` (`:1080`).
- **Impact:**
  - **Merely viewing** a trip moves every unassigned flight whose date falls inside *any* trip's range into that trip, then deletes the standalone flight. This runs as sequential, non-atomic requests: a failure between `updateTrip` and `deleteFlight` leaves duplicates.
  - Any failure in that chain, or one malformed saved config (restore does not validate config shape; see REL-011), becomes an unhandled rejection. The user sees an infinite loading skeleton with no error and no retry.
  - Two users or tabs opening trips at the same time run the reassignment concurrently.
- **Suggested fix:**
  - Remove writes from the read path. Make auto-assignment an explicit user action, or a single server-side transactional operation.
  - Return the inner promise (`return runAutoAssignment().then(...)`) so the outer `.catch` handles it.
  - Guard `c.holidays ?? []`.
  - Render an error state with a Retry button.
- **Effort:** M

### REL-004 Restore is fragile: retried while the first attempt is still running, and rejected above 10 MB
- **Severity:** High
- **Location:** `services/mockDb.ts:469-555` (`fetch`: 10 s abort, `maxRetries = 3`, and retries on abort, network error or 5xx for *any* method); `services/mockDb.ts:1499` (`/restore` call); `backend_files/server.js:245` (`express.json({ limit: '10mb' })`); `:230` (`statement_timeout` 10 s).
- **Evidence:**
  - `importFullState` sends the whole backup through `this.fetch('/restore', { method: 'POST' })`. The client aborts after 10 s and retries with backoff. The server is not told to stop, so the first restore transaction keeps running while a second and third start.
  - The client finally reports failure even if the first attempt committed.
  - Repro of the size limit: an 11.5 MB restore payload (one user with a base64 avatar) gave:
    ```
    POST /api/restore → 413  <pre>Payload Too Large</pre>
    ```
    Avatars are stored as data URLs inside user JSON (`views/UserDetail.tsx:52-61`), so real backups grow quickly.
- **Impact:**
  - Restoring a realistic workspace either fails outright (413) or can run 2–3 times concurrently. In `replace` mode each run truncates and rewrites the tables, while the user is told it failed.
  - Users then retry again, or assume their data is gone.
  - The same retry-on-timeout behavior applies to `/wipe` and the bulk endpoints.
- **Suggested fix:**
  - Don't auto-retry non-idempotent POSTs, or send an idempotency key the server deduplicates.
  - Run restore as a background job: the `/api/jobs/*` machinery already exists. Return 202 and poll.
  - Raise the body limit for `/api/restore` only, or accept a multipart upload.
  - Store avatars as files or resized thumbnails.
- **Effort:** M

### REL-005 Concurrent edits overwrite each other (last write wins on whole documents)
- **Severity:** Medium
- **Location:** `backend_files/server.js:893-907` (`updateResource`: `ON CONFLICT (id) DO UPDATE SET data = $2`); `:2337-2345` (`PUT /api/settings` replaces the whole object); client read-modify-write in `App.tsx:225-230` (`handleThemeChange`: `getWorkspaceSettings().then(s => updateWorkspaceSettings({...s, theme}))`); `views/Settings.tsx:444` (saves the `config` snapshot loaded at mount).
- **Evidence:**
  - Every update sends and stores the *entire* trip or settings document. There is no version, `updated_at` or ETag check.
  - A trip holds transports, stays, activities, packing list and locations in one JSONB value, edited from several independent components (configurators, `PackingList`, `LocationManager`, `DailyPlannerBoard`), each starting from the `trip` state they last loaded.
- **Impact:**
  - Two people (or two tabs) editing the same trip or settings silently drop each other's changes. For example, user A adds a stay while user B ticks packing items, and one of the edits disappears.
  - Toggling the theme in the sidebar and then saving the Settings page reverts the theme, because the page holds the older snapshot.
- **Suggested fix:**
  - Add a `version` field. Use `UPDATE … WHERE id=$1 AND (data->>'version')::int = $2` and return 409 on mismatch, then have the client refetch and merge.
  - Alternatively, move to field-level PATCH endpoints for sub-collections (transports, packing items).
  - Settings should accept partial PATCHes.
- **Effort:** L

### REL-006 Double clicks create duplicate records: save buttons have no in-flight guard
- **Severity:** Medium
- **Location:** `views/Flights.tsx:4442` ("Save Boarding Stub": `type="submit"`, never disabled); `:1295` (`handleSaveFlight` has no saving flag; id = `Math.random().toString(36)…` per submit at `:1313`); `:3893-3896` ("Create Bundle": `disabled={!bundleName.trim()}` only; bundle id random per call at `:1476`).
- **Evidence:** The handlers are async and contain several awaits, and nothing sets a busy state before the first await. Each invocation generates a fresh id, so the server's upsert-by-id does not deduplicate.
- **Impact:** A double-click or Enter-repeat on a slow connection creates duplicate flights or duplicate bundles that the user must find and delete by hand. Duplicate flights also distort the stats on Dashboard and Flights.
- **Suggested fix:**
  - Add `isSaving` state: set it before the first await, disable the button, and reset it in `finally`.
  - Generate the record id once when the form opens rather than at submit time.
  - Do this for every create form (TripSetupBoard already does).
- **Effort:** S

### REL-007 Pages hide load and save failures (empty screens, stuck spinners)
- **Severity:** Medium
- **Location and evidence:**
  - **Planner, `views/PlannerView.tsx:124-136`:** `const { data: tripsData } = useWanderSync(...)` ignores `loading` and `error`, then uses `trips = tripsData || []`. On an API failure the board renders empty buckets, which looks the same as "you have no trips". During load the empty state flashes.
  - **Vacation Calendar, `views/VacationCalendar.tsx:123-128,686`:** handles `loading` but ignores `error` from all six queries, so it renders an empty calendar on failure.
  - **Flights, `views/Flights.tsx:1146-1209`:** there is no loading state. `.catch(err => console.error(...))` shows an empty flight log on failure.
  - **Settings, `views/Settings.tsx:444-451` (`handleSaveOrgSettings`):** there is no `try`/`finally`. If the PUT fails, `isSavingOrg` stays `true` (spinner forever) and the rejection is unhandled.
    - `dataService.updateWorkspaceSettings` (`mockDb.ts:1366-1373`) writes localStorage and dispatches `wandergrid_settings_updated` **before** the PUT, so the UI (for example, the theme) already shows the change while the server never saved it.
  - **Global, all of `src`:** there is no `window.addEventListener('unhandledrejection', …)`. React error boundaries don't catch async errors, so failures in event handlers (REL-002, REL-003, Settings save) are invisible to users.
- **Impact:** Users can't tell an outage from empty data. They may re-enter data they believe is missing, or think settings were saved when they weren't.
- **Suggested fix:**
  - Use the `error` and `loading` already returned by `useWanderSync`, and render `<EmptyState>` only when `!loading && !error`.
  - Add a shared error banner or toast with Retry.
  - Wrap save handlers in `try`/`catch`/`finally` with user-visible errors.
  - Apply optimistic local updates only after a successful PUT, or roll them back.
  - Add a global `unhandledrejection` reporter.
- **Effort:** M

### REL-008 Some server calls to external services have no timeout
- **Severity:** Medium
- **Location:**
  - `backend_files/server.js:1064` and `:1083` (`/api/proxy/airports`, `/api/proxy/airlines`: bare `fetch(url)`).
  - `:1209` (`/api/proxy/aerodatabox/aircrafts/reg`).
  - `:474`, `:494`, `:532`, `:567`, `:620`, `:673`, `:2456`, `:2494` (GitHub raw dataset downloads in startup prepopulation, the weekly scheduler and `/api/jobs/refresh`).
- **Evidence:**
  - None of these pass an `AbortSignal`. Other proxies in the same file do (for example adsb.lol: 4 s, AeroDataBox flights: 8 s), and AGENTS.md requires a 3 s timeout for external lookups.
  - In `/api/proxy/airports`, `iata_code` and `search` are also concatenated into the URL unencoded (`url += \`&iata_code=${iata_code}\``), and `response.json()` runs without checking `response.ok`.
- **Impact:**
  - A slow or hung AviationStack holds the request (and client spinner) until Node's default fetch timeouts, which can be minutes.
  - A hung GitHub download stalls the startup prepopulation or scheduler indefinitely and keeps a pool client checked out where it is inside a transaction.
  - Unencoded input breaks lookups for values containing `&` or spaces.
- **Suggested fix:** Route all of these through the existing `fetchUpstream` helper (`upstream.js`, which already has timeout, stale cache and host gating), or add `AbortSignal.timeout(n)`. Use `encodeURIComponent` on the parameters and check `response.ok`.
- **Effort:** S

### REL-009 The weekly dataset refresh can save an empty airports/carriers table
- **Severity:** Medium
- **Location:** `backend_files/server.js:523-600` (scheduler); `:2451-2540` (`/api/jobs/refresh`).
- **Evidence:**
  - The refresh does `BEGIN` → `TRUNCATE TABLE global_airports RESTART IDENTITY` → insert parsed rows → `COMMIT`.
  - Each row is parsed inside `try { … } catch (err) {}` (empty catch), and only `response.ok` is checked.
  - There is no minimum-row-count check before `COMMIT`, so a 200 response with unexpected content (format change, HTML error page, truncated body) commits an empty or partial table. `loadGlobalData()` then reloads the empty memory maps.
- **Impact:** Airport and carrier autocomplete and lookups (`/api/airports/search`, `/lookup`) return nothing for every user until the next weekly run. Nothing is logged, because the parse errors are swallowed.
- **Suggested fix:** Parse into memory first. Abort (`ROLLBACK`) if the row count drops below a threshold (for example, under 90% of the current count or under 5,000). Log the number of skipped rows. Swap tables via a staging table plus rename.
- **Effort:** S

### REL-010 In-memory server state grows without limit
- **Severity:** Medium
- **Location:** `backend_files/server.js:2351` (`activeJobs`), `:203` (`flightCache`), `:219` (`memoryGeocoding`), `:220` (`openSkyCache`), `:1095` (`aeroDataBoxCache`), `:1225` (`adsbLolCache`).
- **Evidence:**
  - `grep` finds no `.delete`, `.clear` or size check for any of these maps. Only `upstream.js` has an LRU (`:73`).
  - Expired entries are skipped on read but never removed.
  - Keys come from user input (callsign, flight number, query), and each `POST /api/jobs/backup` stores the **full backup payload** in `activeJobs` permanently (`job.result = result`, `:2382`).
- **Impact:** Memory grows with usage and with every backup job until the container is OOM-killed or restarted, which also discards all job statuses mid-poll.
- **Suggested fix:** Use a small LRU with TTL eviction (or reuse `upstream.js`'s cache) for all proxy caches. Delete jobs N minutes after completion, and don't keep large results in memory; stream or persist them instead.
- **Effort:** S

### REL-011 The API accepts any data shape, so bad records later crash readers
- **Severity:** Medium
- **Location:** `backend_files/server.js:876-907` (create/update store `req.body` wholesale; `PUT /:id` stores the body under the URL id even when `body.id` differs); `:2571-2600` (restore validates only "array of objects with string id"); consumers such as `server.js:2032-2040` (ICS feed) and `views/TripDetail.tsx:686`.
- **Evidence:**
  - The ICS feed calls `new Date(trip.endDate)` and then `.toISOString()`. With an invalid date (`node -e 'new Date("2026-13-45").toISOString()'`) that throws `RangeError: Invalid time value`, so one bad trip makes the whole calendar feed return 500 for that user.
  - `configs.flatMap(c => c.holidays.map(...))` throws for any config without `holidays`. Restore accepts such configs, which leads to REL-003's infinite loading.
  - A `PUT /api/trips/A` with body `{id:"B",…}` stores a row whose key and content disagree. The client then reads `id: "B"` while edits go to row A.
- **Impact:** A single malformed record, from a restore file, an older client version, or a bug elsewhere, breaks entire pages or feeds rather than just that record.
- **Suggested fix:**
  - Validate request bodies per collection server-side (zod or ajv), including date formats and required arrays. Reject `body.id !== params.id`.
  - Make readers defensive (`?? []`, skip invalid dates).
  - Validate restore files with the same schemas.
- **Effort:** M

### REL-012 Weak typing: strict mode is off, `any` is everywhere, and API data is never checked at runtime
- **Severity:** Medium
- **Location:** `tsconfig.json` (no `strict`, `strictNullChecks` or `noImplicitAny`); `services/mockDb.ts:457` (`fetch<T>` returns `res.json()` cast to `T`); top `any` users: `components/DeckFlightMap.tsx` (115), `services/mockDb.ts` (88), `views/Settings.tsx` (23).
- **Evidence:**
  - Measured across tracked `.ts`/`.tsx`: 492 occurrences of `: any` / `as any` / `<any>` / `any[]`.
  - `npx tsc --noEmit` passes with 0 errors only because null and undefined checks are disabled.
  - API responses are trusted as typed. For example, `Trip.transports`, `config.holidays` and `user.role` are used without guards.
- **Impact:** Null and shape bugs like REL-003 and REL-011 compile cleanly and only surface at runtime, often as unhandled async errors (REL-007).
- **Suggested fix:**
  - Turn on `strictNullChecks` first (per directory if needed), and fix the reported sites in services and views.
  - Add runtime schemas at the `dataService` boundary, and shared types with the server.
  - Reduce `any` in `mockDb.ts` and `DeckFlightMap.tsx`.
- **Effort:** L

### REL-013 In dev mode, one failed API call switches the app to localStorage for the rest of the session
- **Severity:** Medium
- **Location:** `services/mockDb.ts:545-555`.
- **Evidence:**
  ```ts
  if (isProd) { throw e; }
  else { console.warn(`Fallback to LocalStorage active ...`); this._useApi = false; return this.localFetch<T>(endpoint, options); }
  ```
  - This runs for *any* error that reaches the catch, including a 401 thrown inside the `try` (`:498-506`) and 404s.
  - The login page calls `getUsers()` before login (`views/Auth.tsx:25`). That call is a 401 against a real backend, so in `npm run dev` the app flips to localStorage on first load, and every later read and write in that session goes to the browser instead of the database.
- **Impact:**
  - Developers testing against the real backend silently write to localStorage. Data appears to "disappear" after a reload or on another device.
  - Production-only failures (for example, the first-run setup detection broken by the 401) are masked in development. Test results from dev are therefore unreliable.
- **Suggested fix:**
  - Only fall back on genuine network unreachability (TypeError or abort), never on HTTP status codes.
  - Make the fallback an explicit opt-in (`VITE_LOCAL_MODE=true`) and show a visible "Local mode" badge when active.
- **Effort:** S

### REL-014 Test coverage: 1 failing test, no tests run the server code, no frontend tests, no CI test step
- **Severity:** Medium
- **Location:** `backend_files/test/*.test.js`; `.github/workflows/build-and-publish.yml`; repo root (no test runner).
- **Evidence:**
  ```
  $ cd backend_files && npm test
  ℹ tests 28  ℹ pass 27  ℹ fail 1
  ✖ normalizes supported routing profiles
    actual:   { profile: 'car', costing: 'auto', osrmPath: 'routed-car/route/v1/driving' }
    expected: { profile: 'car', osrmPath: 'routed-car/route/v1/driving' }
  ```
  - No test file `require`s `server.js`. `crudAndAuth.test.js` defines its own copies of `hashPassword`, `verifyPassword` and `buildResourceQuery` (`:8`, `:15`, `:25`) and tests those copies, not the server.
  - The tested modules are helpers only: `carrierMapping`, `geocodingChain`, `integrationsTester`, `aviationStack`, `upstream`, `routeProxy`.
  - There are no frontend tests at all.
  - CI (`build-and-publish.yml`) only builds and pushes the Docker image. There is no `npm test` or `tsc` step, which is why the failing test went unnoticed.
- **Critical areas with zero tests:**
  - All 69 HTTP routes, including auth, register and login.
  - Restore (merge and replace) and backup.
  - Wipe and transactions (`withTransaction`, `bulkUpsert`).
  - The weekly dataset refresh.
  - `services/mockDb.ts` (API client, retries, trip↔flight sync, local fallback).
  - Multi-step client workflows (bundle, merge, flight move, auto-assignment).
  - `formatters.ts`.
  - The error boundaries.
- **Suggested fix:**
  - Fix or update the routing test.
  - Export `app` from `server.js` (start listening only when `require.main === module`) and add supertest integration tests against a real Postgres, using a Docker service in CI. Start with auth, CRUD, restore and wipe.
  - Add Vitest for `mockDb` and `formatters`.
  - Add `npm test` and `tsc --noEmit` steps to CI before the image build.
- **Effort:** M

### REL-015 The Dashboard writes data on load without waiting for the result
- **Severity:** Low
- **Location:** `views/Dashboard.tsx:523-762`.
- **Evidence:**
  - When the DB's visited list is empty, Dashboard builds `bulkSeed` and calls `void dataService.addVisitedBulk(bulkSeed);`. That is fire-and-forget, so a rejection is unhandled.
  - It then **always** sets `localStorage.wandergrid_visited_seeded = 'true'`, even if the write failed.
  - City ids include `Date.now()` (`city_${…}_${Date.now()}`), so two tabs or devices seeding simultaneously insert duplicate cities.
- **Impact:** A failed seed is never retried on that browser, so the Atlas and Map stay empty while the Dashboard shows computed counts. Concurrent first loads create duplicate city records.
- **Suggested fix:** `await` the write and set the flag only on success. Use deterministic ids (`city_${countryCode}_${slug}`). Better still, move seeding to an explicit action or the server.
- **Effort:** S

### REL-016 Shutdown doesn't wait for requests already in progress
- **Severity:** Low
- **Location:** `backend_files/server.js:2879-2909` (`gracefulShutdown`).
- **Evidence:**
  ```js
  server.close(() => { console.log('… closed.'); });   // callback not awaited
  await pool.end();                                     // runs immediately
  process.exit(0);
  ```
  In-flight requests that still need DB clients are cut off when `pool.end()` and `process.exit(0)` run straight away. There is no drain timeout.
- **Impact:** A deploy or restart during a restore, bulk import or multi-step client workflow aborts requests mid-way. This compounds REL-002 and REL-004.
- **Suggested fix:** Use `await new Promise(r => server.close(r))` with a bounded timeout (for example, 10 s, within the compose `stop_grace_period: 15s`), and only then `pool.end()` and exit.
- **Effort:** S

### REL-017 The crash screen's "Clear Cache & Reset" wipes all localStorage
- **Severity:** Low
- **Location:** `components/ErrorBoundary.tsx:26-33`.
- **Evidence:** `handleReset = () => { localStorage.clear(); window.location.reload(); }`
- **Impact:** This signs the user out and deletes every local preference and draft (map settings, `flightFormDraft`, geocode cache, seeded flags). In dev or local mode it deletes all of the user's data, because localStorage *is* the database there. The button gives no warning.
- **Suggested fix:** Clear only app-cache keys (and service-worker caches). Keep the session and data keys, or confirm with an explicit warning first.
- **Effort:** S

---

## Unverified

- **Concurrent restores.** REL-004's retry path would start overlapping `/api/restore` transactions. Postgres `TRUNCATE` locks should serialize them, but I did not run two restores concurrently against real Postgres to observe the end state.
- **Client fetches without timeouts.** Several client fetches have no client-side timeout:
  - `services/flightTracker.ts:39,50,62,87,226`
  - `components/TripSetupBoard.tsx:712,777`
  - `views/Flights.tsx:967,1003`
  - `components/DeckFlightMap.tsx:1066,1087`

  They rely on server-side timeouts, which exist for most of these proxies, so UI hangs are unlikely except where the server itself has none (REL-008). Not tested under a hung upstream.
- **Lost updates from component snapshots.** TripDetail child components save from their own snapshot of `trip`. I believe rapid edits across two components on the same page (for example, a packing-list check and then a stay edit before refetch) can drop the first change, as described in REL-005. This was not reproduced in a browser.
- **`useWanderSync` cache writes.** `hooks/useWanderSync.ts` updates `globalQueryCache` even for superseded requests (only React state is guarded by `requestId`), so an out-of-order response could repopulate the cache with older data for up to 5 s. Not observed.
- **Date-only parsing.** `new Date('YYYY-MM-DD')` (UTC) is mixed with local-time comparisons, for example the auto-assignment range check at `views/TripDetail.tsx:638-645`. This may misassign flights near midnight in non-UTC timezones. Not tested.

---

## Coverage

**Covered**
- **Backend:** `server.js` error handling (all async routes, transactions, pool usage, process handlers), the scheduler and jobs, caches, external-call timeouts in `server.js`, `upstream.js`, `routeProxy.js` and `geocodingChain.js`, and graceful shutdown.
- **Live runs:** DB-down crash, body limit.
- **Frontend:**
  - `services/mockDb.ts` (fetch, retry, fallback, restore, settings).
  - `hooks/useWanderSync.ts`.
  - Load and error handling in all 15 views (counted and spot-read).
  - Multi-step write flows in Flights (bundle, save, move), VacationPlanner (merge: adds first, then deletes, so partial failure duplicates rather than loses), TripDetail (auto-assignment) and Dashboard (seeding).
  - Autocomplete race handling in `components/ui.tsx`, which is correctly guarded by `latestQueryRef`.
  - Both error boundaries.
- **Typing:** `tsconfig`, `any` counts, empty-catch counts (frontend 84, backend 15; most are benign localStorage or event-dispatch guards, and the harmful ones are cited above).
- **Tests:** ran the backend suite, inspected what each test imports, and checked CI.

**Not covered or limited**
- No browser-based testing: UI states were assessed from code.
- No load or stress testing.
- No real-Postgres concurrency tests.
- Did not audit every one of the ~61k UI lines for null-safety; findings are based on targeted reads of the data paths.
- Did not review RoadTrips/RoadTrips2 and TravelAtlas write flows in depth beyond confirming they use the same `dataService` patterns.
- Did not review `DeckFlightMap.tsx` (4.4k lines) rendering logic for runtime errors.

---

## Top 5

1. **REL-001: A database blip plus one restore or wipe request crashes the API.** `pool.connect()` sits outside `try`, and there is no unhandled-rejection handler; I reproduced the exit with code 1.
2. **REL-002: Bundling flights deletes them before saving the bundle.** Any failure on the last step permanently loses the selected flights, with no error shown.
3. **REL-003: Opening a trip triggers hidden writes.** Its errors escape the catch, leaving the page on "Loading Trip Data…" forever, and one malformed config triggers it too.
4. **REL-004: Restore, the backup and migration path, is fragile.** It is auto-retried after a 10 s client timeout while the first run continues, and it is rejected outright above 10 MB (I reproduced the 413).
5. **REL-005 / REL-006: Lost updates and double submits.** Whole-document last-write-wins silently drops concurrent edits, and unguarded save buttons create duplicate flights and bundles.
