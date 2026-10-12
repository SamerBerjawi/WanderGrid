# WanderGrid — Security Findings

**Date:** 2026-10-11
**Scope:** the whole repository at `main` (`b887313` + working tree), covering the frontend SPA and `backend_files/`.
**Method:** I read the code with references to `audit/inventory.md`, ran `npm audit` in both packages, probed the server's headers and responses live, and reproduced the auth issues against a running server.

**Live reproduction harness.** I ran `backend_files/server.js` unmodified with `NODE_ENV=production` and `JWT_SECRET=test_secret_for_audit_only` on port 3006.
- `pg` was swapped for an in-memory Postgres emulator (`pg-mem`, installed in a scratch directory outside the repo), and outbound `fetch` was disabled.
- The only change the harness makes to the server's SQL is stripping `CHECK` constraints that pg-mem cannot parse. Everything else is the real code path.
- I made no changes to application code.

Requests labelled "Repro" below were run against that server with curl. In those requests, `$T` is a token for a self-registered user and `$PT` is a valid token whose role is `Partner`.

---

### SEC-001 No server-side authorization: any logged-in user can read, change or delete all data
- **Severity:** Critical
- **Location:** `backend_files/server.js:778-898` (generic `getResources`, `createResource`, `updateResource`, `deleteResource`), `:2181-2244` (users), `:2328-2345` (settings), `:2551` (backup), `:2571` (restore), `:2846` (wipe), and every other route in inventory §2.
- **Evidence:**
  - No handler reads `req.user.role`, and none compares `req.user.id` with the record's owner. `grep -n "req.user" server.js` finds only `restoreOptions.currentUserId || req.user?.id` (`:2601`). `getResources` runs `SELECT data FROM ${table}` filtered only by optional query parameters.
  - Repro:
    ```
    # victim (Admin) creates a Private trip; Eve (another user) then:
    GET  /api/trips      -H "Authorization: Bearer $T"
    → [{"id":"t1","name":"Secret trip","participants":["admin@corp.test"],"privacy":"Private",...}]
    PUT  /api/trips/t1   (Eve's token) → 200, trip renamed
    PUT  /api/users/admin@corp.test  -H "Authorization: Bearer $PT" -d '{"...","password":"hijacked","role":"Admin"}' → 200
    POST /api/auth/login {"email":"admin@corp.test","password":"hijacked"} → token for the victim
    POST /api/wipe       -H "Authorization: Bearer $PT" → {"success":true};  GET /api/users → []
    ```
- **Impact:** Every account, including a `Partner` or `Child`, has full admin power. That covers reading other users' trips and passport data, resetting anyone's password, promoting themselves, changing workspace settings and API keys, restoring arbitrary data, and wiping the database. Combined with SEC-002 and SEC-003, anyone who can reach the instance has this access.
- **Suggested fix:**
  - Add an `authorize(roles)` middleware. Gate users, settings, backup, restore, wipe, jobs and personnel writes to `Admin`.
  - For trips, flights, visited and events, filter reads and check writes against ownership (`participants` contains `req.user.id`, or a `ownerId` column), with an explicit rule for `privacy`.
  - Only allow a user to update their own profile, and never their own `role`.
  - Add integration tests covering cross-user access.
- **Effort:** L

### SEC-002 Anyone can sign up as Admin, with no login required
- **Severity:** Critical
- **Location:** `backend_files/server.js:2146-2178` (`POST /api/auth/register`), which is public (`:156-160`). The client sends `role` from `services/mockDb.ts:311-330`.
- **Evidence:**
  - The handler stores `req.body` as is (`const user = req.body; … INSERT … JSON.stringify(user)`) and signs a JWT containing `role: responseUser.role`.
  - Repro:
    ```
    POST /api/auth/register -d '{"id":"eve@evil.test","email":"eve@evil.test","password":"x","role":"Admin"}'
    → {"user":{"id":"eve@evil.test",...,"role":"Admin"},"token":"eyJ..."}
    ```
  - Registration is always open. There is no invite step, no setting to disable it, and no check for whether this is the first user.
- **Impact:** Any unauthenticated visitor gets a valid session flagged as Admin. Because of SEC-001, the session would have full control even with a non-admin role. It also defeats the "first user becomes administrator" design.
- **Suggested fix:**
  - Ignore client-supplied `role` and `id`. Generate the id on the server, and assign `Admin` only when the users table is empty, inside a transaction.
  - Make further sign-ups either admin-invite only or controlled by a `REGISTRATION_ENABLED` setting.
  - Whitelist the accepted fields: name, email, password.
- **Effort:** S

### SEC-003 Anyone can overwrite another account by registering with its id, with no login required
- **Severity:** Critical
- **Location:** `backend_files/server.js:2152-2164`. The client sets `id = email` at `services/mockDb.ts:319`.
- **Evidence:**
  - The duplicate check looks only at the *new* email (`WHERE LOWER(data->>'email') = LOWER($1)`), but the insert upserts on the client-supplied `id`: `INSERT INTO users (id, data) VALUES ($1,$2) ON CONFLICT (id) DO UPDATE SET data = $2`. User ids are the user's lowercase email, so they are trivially guessable.
  - Repro:
    ```
    POST /api/auth/register -d '{"id":"admin@corp.test","name":"Mallory","email":"mallory@evil.test","password":"m","role":"Admin"}'
    → 200 {"user":{"id":"admin@corp.test","name":"Mallory","email":"mallory@evil.test","role":"Admin"},"token":...}
    POST /api/auth/login {"email":"admin@corp.test", ...} → {"error":"Invalid credentials"}   # victim locked out
    ```
  - The same upsert pattern lets `POST /api/users` (`:2195`) and `POST /api/<collection>` overwrite existing records.
- **Impact:** Knowing someone's email is enough to replace their account, including the admin's. The victim is locked out, and the attacker takes over that user id. Trips list participants by user id, so the attacker is now treated as a participant.
- **Suggested fix:** Generate the id on the server (UUID) and use a plain `INSERT` without `ON CONFLICT`. Add a unique index on `LOWER(data->>'email')`. Use `INSERT … ON CONFLICT DO NOTHING` semantics for every "create" handler, and return 409 when the record exists.
- **Effort:** S

### SEC-004 Stored XSS in the trip "Intel" tab (NomadGuide)
- **Severity:** High
- **Location:**
  - Sink: `views/TripDetail.tsx:491` and `views/TripDetail2.tsx:463`.
  - Source: `views/TripDetail.tsx:418` and `views/TripDetail2.tsx:390`.
  - Rendered on the `intel` tab: `views/TripDetail.tsx:1622-1624`.
- **Evidence:**
  ```tsx
  // :418
  setMessages([{ role: 'model', text: `Hi! I'm your NomadGuide for **${trip.name}**. I know your itinerary for ${trip.location}. ...` }]);
  // :491
  <div dangerouslySetInnerHTML={{ __html: m.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>') }} />
  ```
  - `trip.name` and `trip.location` are inserted into HTML without escaping. The greeting renders on mount, so no Gemini key is needed.
  - Gemini responses also go through the same sink. Their content can be steered by trip data, so prompt injection could produce HTML there too.
  - Repro of the storage half: `PUT /api/trips/t1` with `"name":"<img src=x onerror=alert(localStorage.wandergrid_session_token)>"` → 200, stored verbatim (SEC-001 lets any user do this to any trip).
  - The rendering half follows from the code above; I did not run it in a browser.
  - There is no CSP to limit the damage (SEC-011).
- **Impact:** Any user can plant script that runs for anyone who opens that trip's Intel tab. The JWT lives in `localStorage` (`wandergrid_session_token`), so the attacker can steal a 7-day admin token (SEC-007).
- **Suggested fix:** Remove `dangerouslySetInnerHTML`. Render markdown with React elements, for example by splitting on `**` and mapping to `<strong>`, or use a sanitizing markdown renderer such as `react-markdown` without raw HTML. Fix both TripDetail copies.
- **Effort:** S

### SEC-005 Restoring a backup resets every password to `password` and stores passwords unhashed
- **Severity:** High
- **Location:**
  - `backend_files/server.js:2650-2680`, `/api/restore`.
  - `server.js:131-150`, `removeSensitiveData`, which strips `password` from every backup.
  - The client equivalent at `services/mockDb.ts:715,740`.
- **Evidence:**
  - `item.password = (existing && existing.password) ? existing.password : await hashPassword('password');`. A password present in the file is inserted **as is**, with no hashing.
  - Repro:
    ```
    POST /api/restore -d '{"users":[{"id":"cfo@corp.test","email":"cfo@corp.test","role":"Admin"}],"restoreOptions":{"mode":"replace"}}'
    POST /api/auth/login {"email":"cfo@corp.test","password":"password"} → 200 + token (Admin)
    POST /api/restore -d '{"users":[{"id":"x@corp.test","email":"x@corp.test","password":"plain123","role":"Admin"}],...}'
    POST /api/auth/login {"email":"x@corp.test","password":"plain123"} → 200   # plaintext accepted (verifyPassword compat path)
    ```
- **Impact:** The documented migration path is backup on one instance, then restore on another. That path gives every restored account, admins included, the public default password `password`. Plaintext passwords in imported files are stored and accepted indefinitely.
- **Suggested fix:**
  - Never set a default password. Create restored users with no usable password plus a forced reset or invite, or include hashes in admin-only backups.
  - Hash any non-hash password on restore. Restore should be admin-only (SEC-001).
- **Effort:** M

### SEC-006 Anyone can read a user's trips from the calendar feed without logging in
- **Severity:** High
- **Location:** `backend_files/server.js:2017-2083`; exempted from auth at `:165`.
- **Evidence:**
  - The route is in the public bypass list: `fullPath.startsWith('/api/calendar/') && fullPath.endsWith('/feed.ics')`. It queries trips `WHERE data->'participants' ? $1` for the URL's `:userId`, which is the user's email.
  - Live, without a token: `GET /api/calendar/anyid/feed.ics` → **500** (DB query attempted), not 401.
  - The full response could not be shown under pg-mem, which lacks the `jsonb ? text` operator. On real Postgres the query returns the trips.
  - Fields are written without escaping (`SUMMARY:${summary}`, `LOCATION:${location}`), so CR/LF in a trip name can inject ICS properties.
- **Impact:** Anyone who knows or guesses a user's email gets their upcoming and past trip names, locations, dates and transport. That reveals when someone is away from home. There is no token, no rate limit beyond the global one, and no way to revoke access.
- **Suggested fix:** Use an unguessable per-user feed token (random, stored, rotatable) in the URL instead of the user id. Escape `\`, `;`, `,` and newlines per RFC 5545, and fold long lines. Also fix the client's broken subscription URL (inventory §6).
- **Effort:** M

### SEC-007 Sessions can't be revoked: 7-day JWT in localStorage, and logout only clears the browser
- **Severity:** Medium
- **Location:**
  - `backend_files/server.js:178-184`: `jwt.verify` only; the user is not looked up.
  - `:2138` and `:2172`: `expiresIn: '7d'`.
  - `App.tsx:237`, `handleLogout`: clears `localStorage` only.
  - `services/mockDb.ts:285`: token stored in `localStorage`.
- **Evidence:**
  ```
  DELETE /api/users/eve@evil.test  → 200
  GET    /api/trips (same token)   → 200   # deleted user still authenticated
  ```
  - There is no logout endpoint, no token version or denylist, and no check after a password change or role change. The role stays baked into the token for 7 days.
- **Impact:** Logging out, deleting a user or changing a password does not end existing sessions. A token stolen via SEC-004 stays valid for up to a week.
- **Suggested fix:**
  - Short-lived access tokens (about 15 min) plus a refresh token in an `HttpOnly; Secure; SameSite=Strict` cookie.
  - Store `tokenVersion` on the user, check it in `authenticateToken`, and increment it on logout, password change, role change and delete.
  - Load the user and role from the DB on each request instead of trusting token claims.
- **Effort:** M

### SEC-008 Password storage weaknesses: plaintext accepted, `:` bypasses hashing, non-constant-time comparison, no policy
- **Severity:** Medium
- **Location:** `backend_files/server.js:118-127` (`verifyPassword`), `:2200` and `:2224-2231` (`includes(':')` checks), `:2146` (no length check).
- **Evidence:**
  - Hashing is skipped whenever the password contains `:`: `if (user.password && !user.password.includes(':')) { hash }`. Repro: `PUT /api/users/p2 -d '{"password":"my:secret"}'` → stored and returned as `"password":"my:secret"`.
  - `verifyPassword` accepts plaintext matches for any stored value without `:` (`return password === storedHash`), and compares hashes with `===` (`:126`).
  - There is no minimum length or complexity on register or user update; the "min 6 characters" text is only a placeholder.
- **Impact:**
  - Users who choose a password containing `:` are stored in plaintext. Their login also then fails, because the value is parsed as `salt:hash`.
  - The plaintext compatibility path combines with SEC-005.
  - Any user can set a raw `salt:hash` value on another account; this needs SEC-001.
- **Suggested fix:**
  - Always hash server-side, using a structured format (`pbkdf2$sha512$iter$salt$hash`, or switch to argon2id or scrypt) and detecting hashes by that prefix rather than by `:`.
  - Migrate or force-reset the remaining plaintext rows, then remove the compatibility branch.
  - Use `crypto.timingSafeEqual`. Enforce a minimum of 8+ characters server-side.
- **Effort:** S

### SEC-009 User create and update responses return the stored password hash
- **Severity:** Medium
- **Location:** `backend_files/server.js:2209` (`res.status(201).json(user)`) and `:2238` (`res.json(updatedUser)`).
- **Evidence:** Repro: `PUT /api/users/admin@corp.test` returned `"password":"b3b11be9…:eed6e9bb…"` (salt plus PBKDF2 hash). `GET /api/users` strips it (`:2186`), but these two responses do not.
- **Impact:** The hash reaches the browser (and any XSS in it), where it can be cracked offline. Because of SEC-008, a stored hash can also be replayed as a password value.
- **Suggested fix:** Strip `password` from every response with a shared `toPublicUser()` helper, and add a test.
- **Effort:** S

### SEC-010 Third-party API keys are exposed to every user and handled in the browser
- **Severity:** Medium
- **Location:**
  - `backend_files/server.js:2328` (`GET /api/settings` returns the full settings).
  - `:131-150` (`removeSensitiveData`: "preserve API keys, tokens" in backups).
  - `vite.config.ts:455` (`define` inlines `GEMINI_API_KEY` into the bundle).
  - Browser-direct calls: `components/PackingList.tsx:94`, `views/TripDetail.tsx` (Gemini), `components/AccommodationConfigurator.tsx:211` (`?c=${brandfetchKey}`), `utils/flightData.ts:508,630` (`access_key=` in the URL), `components/DeckFlightMap.tsx:464` (`apiKey=` in the tile URL).
- **Evidence:**
  - Repro: a `Partner` token reads `GET /api/settings` → `{"googleGeminiApiKey":"AIza-REAL-KEY","aviationStackApiKey":"av-key"}`.
  - Downloaded backups (`/api/backup`, `/api/jobs/backup`) include these keys.
  - If `GEMINI_API_KEY` is set at build time, it ends up in public JS. CI does not set it today.
- **Impact:** Any user, or any XSS (SEC-004), can take the workspace's paid API keys (Gemini, AviationStack, AeroDataBox, OpenAIP, Brandfetch). Keys placed in query strings also land in browser history and in upstream and proxy logs.
- **Suggested fix:**
  - Keep keys server-side only, and have `GET /api/settings` return masked values plus `hasKey` booleans.
  - Route Gemini, Brandfetch, AviationStack and OpenAIP through the existing backend proxies, which already accept keys from env or headers.
  - Drop the `process.env.API_KEY`/`GEMINI_API_KEY` `define`. Exclude keys from backups unless an admin explicitly opts in.
- **Effort:** M

### SEC-011 No Content-Security-Policy, and an unpinned third-party script runs in production
- **Severity:** Medium
- **Location:** `backend_files/server.js:239-242` (`helmet({ contentSecurityPolicy: false, … })`); `index.html:36` (`<script src="https://cdn.tailwindcss.com">`).
- **Evidence:**
  - The production build output (`vite build`) still contains `<script src="https://cdn.tailwindcss.com">` with 0 `integrity=` attributes. The tag is unversioned, so it fetches whatever the CDN serves.
  - The CSP is disabled with the comment "for seamless loading inside the preview sandbox iframe".
- **Impact:** Script from a third-party CDN runs with full access to the DOM and `localStorage`, including the JWT. A CDN compromise or account takeover means the attacker controls every WanderGrid instance. Nothing contains XSS such as SEC-004.
- **Suggested fix:**
  - Remove the Play CDN script, since Tailwind is already compiled through PostCSS.
  - Enable helmet's CSP. Start with `default-src 'self'`, list the tile, font and API hosts explicitly, and drop `'unsafe-inline'` once the inline script in `index.html:37` is moved to a file.
  - Add SRI for any remaining external asset.
- **Effort:** M

### SEC-012 No validation on API request bodies, including mass assignment and unbounded content
- **Severity:** Medium
- **Location:** `backend_files/server.js:245` (`express.json({ limit: '10mb' })`); `createResource` and `updateResource` (`:858-885`); users `:2195-2240`; settings `:2337`; avatar upload `views/UserDetail.tsx:52-61`.
- **Evidence:**
  - Every write handler persists `req.body` wholesale. The only checks are a truthy `id`, and for restore, array/object shapes.
  - `PUT /:id` stores the body under the URL id even when `body.id` differs, so record keys and contents can disagree.
  - `role`, `password`, `participants` and `privacy` are all client-controlled (repro in SEC-001 and SEC-002).
  - The avatar upload checks `file.type` on the client only, has no size limit, and stores a data URL inside the user JSON. The server accepts any string as `profilePicture`, such as an external tracking URL.
- **Impact:** This enables privilege escalation through extra fields. Huge or malformed documents (up to 10 MB each, unbounded arrays) can bloat the DB and slow every list endpoint. Inconsistent ids also break the client.
- **Suggested fix:**
  - Define per-collection schemas (`zod`, `ajv`) and whitelist fields. Reject `body.id !== params.id`.
  - Cap sizes per field. Check avatar uploads server-side (MIME and decoded size) or store them as files.
  - Lower the global body limit, and raise it only for `/api/restore` (admin only).
- **Effort:** M

### SEC-013 Spreadsheet import uses `xlsx` 0.18.5, which has known prototype-pollution and ReDoS bugs (reachable)
- **Severity:** Medium
- **Location:** `package.json` (`"xlsx": "^0.18.5"`); `components/FlightImportWizard.tsx:2`; `services/flightImportExport.ts:6,388`.
- **Evidence:** `npm audit` reports high severity for `xlsx` (no fix available on npm):
  - GHSA-4r6h-8v6p-xvw6, Prototype Pollution.
  - GHSA-5pgg-2g8v-p4x9, ReDoS.
  The library parses user-selected files in Settings › Flight Import Wizard and in TripDetail › Import.
- **Impact:** A crafted spreadsheet, for example one shared as "here's my flight log", can pollute `Object.prototype` in the importing user's tab or hang it. The importer runs with that user's admin-equivalent token.
- **Suggested fix:** Upgrade to SheetJS ≥ 0.20.2 from the vendor's CDN tarball (`https://cdn.sheetjs.com/`), or replace it with a maintained CSV-only parser if XLSX support isn't needed. Parse in a Web Worker.
- **Effort:** S

### SEC-014 Backend dependencies: reachable `compression` DoS, and Docker builds ignore the lockfile
- **Severity:** Medium
- **Location:** `backend_files/package.json`, `backend_files/package-lock.json`, `backend_files/Dockerfile` (`COPY backend_files/package.json ./` then `npm install`).
- **Evidence:**
  - `npm audit` in `backend_files`: 1 high, 1 critical, 4 moderate.
  - **`compression <1.8.2`** (high, GHSA-vc2v-76pw-4v95, memory leak on premature close). It is reachable, since `app.use(compression(...))` is at `:243`.
  - `proxy-addr` (critical, GHSA-jqcg-44mw-7w3h) only matters with `trust proxy` configured. `grep "trust proxy"` finds nothing, so it is **not reachable**.
  - `qs` and `ip-address` are moderate.
  - The Dockerfile never copies `package-lock.json`, so production images resolve fresh semver ranges on every build. The audited lockfile is not what ships, and builds are not reproducible.
- **Impact:** Clients that abort responses can exhaust memory (DoS). Supply-chain drift means the shipped versions are unknown.
- **Suggested fix:** Run `npm audit fix` in `backend_files`. Copy `package-lock.json` and use `npm ci --omit=dev` in the Dockerfile, and do the same for the frontend stage. Add `npm audit --audit-level=high` to CI.
- **Effort:** S

### SEC-015 Database error details are exposed by the public health endpoint in production
- **Severity:** Low
- **Location:** `backend_files/server.js:2098-2108`.
- **Evidence:** Live with `NODE_ENV=production`, without a token:
  ```
  GET /api/health → {"status":"error","database":"disconnected","dbReady":false,"message":"connect ECONNREFUSED 127.0.0.1:5999","pool":{...}}
  ```
  This bypasses `sendError`'s production sanitizing.
- **Impact:** Leaks internal hostnames, ports and DB errors, plus pool statistics, to anonymous callers.
- **Suggested fix:** Return only `{status}` publicly. Log `err.message`, or expose details behind auth.
- **Effort:** S

### SEC-016 CORS allows every origin
- **Severity:** Low
- **Location:** `backend_files/server.js:244` (`app.use(cors())`).
- **Evidence:** A live preflight from `Origin: https://evil.example` returns `Access-Control-Allow-Origin: *`, `Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE` and `Allow-Headers: authorization`.
- **Impact:** Auth uses a Bearer header, not cookies, so CORS does not enable classic CSRF. CSRF is not applicable as long as cookies are not used. However, any website can drive the API with a token it obtains (for example via SEC-004), and can read the public endpoints (SEC-006, SEC-015) cross-origin.
- **Suggested fix:** The SPA is same-origin, so remove `cors()` or restrict it to configured origins. If the session moves to cookies (SEC-007), add `SameSite=Strict` and CSRF tokens.
- **Effort:** S

### SEC-017 Registration reveals which emails have accounts
- **Severity:** Low
- **Location:** `backend_files/server.js:2157-2159`.
- **Evidence:** `POST /api/auth/register` with an existing email → `400 {"error":"User already exists"}`. Login returns a generic "Invalid credentials", but register gives the answer away.
- **Impact:** Anyone can enumerate accounts, which feeds SEC-003 (user id = email) and SEC-006.
- **Suggested fix:** Return a generic response, or move to invite-only registration (SEC-002).
- **Effort:** S

### SEC-018 Vite dev server is exposed on the LAN with known file-read bugs (dev only)
- **Severity:** Low
- **Location:** `vite.config.ts` (`server.host: true`); installed `vite@6.4.1`.
- **Evidence:** `npm audit` reports high severity for `vite <=6.4.2`:
  - GHSA-p9ff-h696-f583, arbitrary file read via the dev-server WebSocket.
  - GHSA-4w7w-66w2-5vf9, path traversal in `.map` handling.
  `host: true` binds to all interfaces. The dev middleware in `vite.config.ts` also serves `/api/proxy/route`, `/rail` and `/test` with no auth.
- **Impact:** While `npm run dev` is running, anyone on the same network can read files from the developer's machine. Production is not affected.
- **Suggested fix:** Upgrade vite to ≥ 6.4.3 (`npm audit fix`). Default to `host: 'localhost'` and make LAN exposure opt-in.
- **Effort:** S

---

## Unverified

These are suspicions or partial results, not confirmed:
- **Rate limiting behind a reverse proxy.** `express-rate-limit` keys on `req.ip`, and `trust proxy` is not set (`grep` confirms). Behind Portainer, Traefik or nginx, all clients would share one IP, so the auth limit (20 per 15 min, `:278`) becomes a global lockout. Without a proxy it applies per IP. Not tested in a proxied deployment.
- **OpenAIP proxy path injection.** `:/api/proxy/openaip/:z/:x/:y` builds `https://api.tiles.openaip.net/api/data/openaip/${z}/${x}/${y}.pbf` without validating that the params are numeric. Encoded `?` or `..` could alter the path or query on that same host while sending the server's `x-openaip-api-key`. The host is fixed, so this is not SSRF. Not exercised.
- **AeroDataBox cache ignores the API key.** `:1137`: `cacheKey` omits the key, and the key check passes for any non-empty string. A user with a bogus key may receive results paid for by another key or by the env key. Not tested.
- **`protobufjs` (critical in `npm audit`).** It comes in transitively via `@google/genai@1.42.0`. The advisories concern parsing attacker-controlled `.proto` schemas or descriptors, which the app does not appear to do. Judged **not reachable**, but not proven.
- **Other frontend audit highs.** These are judged **not reachable at runtime**, being build-time tooling or loaders the app doesn't call:
  - `deck.gl`, `@loaders.gl/*`, `image-size`, `texture-compressor`: Node-side loaders or CLIs.
  - `tailwindcss`, `braces`, `micromatch`, `chokidar`, `fast-glob`, `minimatch`, `picomatch`, `brace-expansion`, `source-map-js`: build tooling.
  - `d3-color` (ReDoS): only parses colors from code constants as far as I found.
- **Dev-mode-only issues** (`import.meta.env.PROD === false`):
  - The localStorage fallback stores the demo or default password `password` (`mockDb.ts:716`).
  - The `?demo=1` URL creates a fake client-side admin session.
  - The server starts with the hardcoded default `JWT_SECRET` when `NODE_ENV` is not `production` (`server.js:101`), so anyone can forge tokens on such an instance.
  - The Docker image sets `NODE_ENV=production`, so these don't apply to the shipped image, but they do apply to anyone running `node server.js` directly.
- **Gemini output rendered as HTML.** Model responses pass through the same `dangerouslySetInnerHTML` sink as SEC-004. Exploitation through prompt injection via trip data is plausible but was not demonstrated.

---

## Coverage

**Covered**
- **Backend:** `server.js` (all 69 routes, auth middleware, restore, ICS, health, CORS/helmet, body parsing), `routeProxy.js`, `geocodingChain.js`, `integrationsTester.js` and `aviationStack.js` (all checked for SSRF/URL construction; all upstream hosts are hardcoded, so there is no open SSRF), and the Dockerfile.
- **Frontend:** auth flow (`Auth.tsx`, `App.tsx`, `mockDb.ts` login, register, session, token storage), and all HTML sinks (`dangerouslySetInnerHTML`, `innerHTML`, map popups and tooltips: only the two NomadGuide sinks exist).
- **URL handling:** `href`/`src` from user data. React 19.2.4 blocks `javascript:` URLs, which I confirmed in the `react-dom` build, so `stay.website` links are safe.
- **Other frontend:** file uploads (avatar, spreadsheet, backup JSON), and `index.html` and build output.
- **Secrets:** grep over source and git history for key patterns found no hardcoded secrets. `.env` is gitignored and not tracked.
- **Dependencies:** `npm audit` in both packages, with a reachability assessment.
- **Injection:** SQL (all queries are parameterized and table names are constants, so no SQL injection). Command execution, `eval`, path traversal (`express.static` only, no `sendFile` with user input) and template injection: no sinks found.

**Not covered or limited**
- No browser-based dynamic testing (XSS rendering was not executed, only the storage half).
- No test against real Postgres; pg-mem was used.
- No review of the 61k lines of UI code beyond the security-relevant greps above.
- No review of `public/` vendored JS (`mapbox-gl-rtl-text.min.js`).
- No infrastructure or TLS configuration review (deployment-specific).
- No GitHub Actions secrets review.

---

## Top 5

1. **SEC-001: No server-side authorization.** Every authenticated user, any role, can read and modify all users' data, reset passwords, change settings, restore, and wipe the database.
2. **SEC-002: Anyone can sign up as Admin.** Combined with SEC-001, this gives full control to anyone who can reach the instance.
3. **SEC-003: Account overwrite through registration.** Re-registering with a victim's id (their email) replaces their account without logging in.
4. **SEC-004: Stored XSS in the Intel tab.** It steals the 7-day JWT from localStorage, and no CSP contains it (SEC-011).
5. **SEC-005: Restore resets passwords.** Restoring a standard backup gives every account, admins included, the password `password`, and plaintext passwords in imports are stored and accepted.
