# WanderGrid — Application Inventory

Generated 2026-10-10 from the code at commit `b887313` on `main`. Sources: `App.tsx`, `types.ts` (`ViewState`), `components/Sidebar.tsx`, `views/*`, `components/*`, `services/mockDb.ts`, `backend_files/server.js` and `vite.config.ts`.
Line references use the form `file:line`. Items marked **⚠** are dead, unreachable, duplicated, or behave differently from what their label suggests.

---

## 0. How routing and auth actually work

- **No router library.** `App.tsx` holds `view: ViewState` in state:
  - `getUrlState()` (`App.tsx:29`) maps `location.pathname` or `?view=` to a view.
  - `navigate()` (`App.tsx:84`) calls `history.pushState`.
  - `renderView()` (`App.tsx:283`) switches on the view.
- **Client auth gate:** if `currentUser` is null, `App` renders only `<Auth/>` (`App.tsx:338`). `currentUser` comes from `localStorage.wandergrid_session_user`, validated against `GET /api/users` on boot (`App.tsx:146-189`).
- **Server auth:** `app.use('/api', authenticateToken)` (`server.js:290`) requires `Authorization: Bearer <JWT>` on **every** `/api/*` route except these public ones (`server.js:156-165`):
  - `/api/health`
  - `/api/auth/login`
  - `/api/auth/register`
  - `/api/calendar/:userId/feed.ics`
- **Roles:** `User.role` is `'Admin' | 'Partner' | 'Child'` (`types.ts:7`). Role only affects colors and labels:
  - **Server:** no endpoint reads `req.user.role`, and no handler scopes data to `req.user.id`.
  - **Client:** no page or control is hidden by role.
  - In practice, every authenticated user has full read/write access to all data, including other users and the database wipe.
- **Dev mode:** if an API call fails, `dataService` silently switches to localStorage (`mockDb.ts:553`). In that mode there is no server auth at all.

---

## 1. Routes / pages

All pages except Auth require a client session. The "API auth" column refers to the JWT requirement on the data each page loads; no page has role restrictions.

| # | ViewState | URL path(s) (`App.tsx:34-54`) | File | In nav? | Session required | Role gate |
|---|---|---|---|---|---|---|
| 1 | — (logged-out) | any | `views/Auth.tsx` | — | No | — |
| 2 | `DASHBOARD` | `/`, `/gamification`, `?view=gamification`, unknown paths | `views/Dashboard.tsx` | Desktop + mobile | Yes | None |
| 3 | `MAP` | `/map`, `?view=map` | `views/ExpeditionMapView.tsx` | Desktop + mobile | Yes | None |
| 4 | `PLANNER` | `/planner` | `views/PlannerView.tsx` | Desktop + mobile "More" | Yes | None |
| 5 | `PLANNER_2` | `/planner-2`, `/planner2` | `views/VacationPlanner.tsx` | Desktop + mobile "More" (label "Planner-2") | Yes | None |
| 6 | `VACATION_CALENDAR` | `/calendar`, `/vacation-calendar` | `views/VacationCalendar.tsx` | Desktop + "More" | Yes | None |
| 7 | `TRAVEL_ATLAS` | `/atlas`, `/travel-atlas` | `views/TravelAtlas.tsx` | Desktop + mobile | Yes | None |
| 8 | `FLIGHTS` | `/flights` | `views/Flights.tsx` | Desktop + mobile | Yes | None |
| 9 | `ROADTRIPS` | `/roadtrips` | `views/RoadTrips.tsx` | Desktop + "More" | Yes | None |
| 10 | `SETTINGS` | `/settings` | `views/Settings.tsx` | Desktop + "More" | Yes | None ⚠ (includes user admin and DB wipe) |
| 11 | `USER_DETAIL` | `/user/:id` | `views/UserDetail.tsx` | Sidebar profile chip (own id only) | Yes | None ⚠ (any `/user/:id` is viewable and editable) |
| 12 | `TRIP_DETAIL` | `/trip/:id` | `views/TripDetail.tsx` | Via trip cards (`handleTripClick`) | Yes | None |
| 13 | `TRIP_DETAIL_2` | `/trip-2/:id` | `views/TripDetail2.tsx` | **URL only** ⚠ | Yes | None |
| 14 | `FLIGHTS_2` | `/flights-2`, `/flights2` | `views/Flights2.tsx` | **URL only** ⚠ | Yes | None |
| 15 | `ROADTRIPS_2` | `/roadtrips-2`, `/roadtrips2` | `views/RoadTrips2.tsx` | **URL only** ⚠ | Yes | None |
| — | `GAMIFICATION` | none | renders `Dashboard` | ⚠ unreachable | — | — |

**Routing flags**
- ⚠ **`GAMIFICATION` is unreachable.** `navigate(GAMIFICATION)` would push `/gamification`, but `getUrlState` maps `/gamification` back to `DASHBOARD`. Nothing calls `navigate(GAMIFICATION)`, so it duplicates Dashboard.
- ⚠ **`?view=` support is incomplete.** `/user/:id` and `/trip/:id` have no `?view=` equivalent, and the alias `?view=travel-atlas` is not supported (only `atlas` is).
- ⚠ **Independent flights redirect.** `handleTripClick` sends ids starting with `independent-flight-` to Flights instead of opening a trip (`App.tsx:268`).
- ⚠ **`?demo=1` bypasses login on the client.** It writes a fake Admin `{id:'admin-auto'}` to localStorage with no token (`App.tsx:148`). The UI then renders as logged in, but API calls return 401, which immediately triggers logout in prod. In dev they fall back to localStorage.
- ⚠ **Session restore can switch users.** If the stored user id or email is not in the roster but other users exist, the app logs in as the **first Admin, or users[0]** (`App.tsx:163-168`). A deleted user, or a stale session after a restore, therefore becomes the admin's session.

---

## 2. API endpoints

**Source:** `backend_files/server.js`; the line number is in the first column.
**Auth key:** **JWT** = valid Bearer token required (any role). **Public** = no token. No endpoint checks role or ownership.
**Client column:** where the UI calls the endpoint. "—" means no caller was found in the frontend code.

### 2.1 System / auth
| Line | Method | Path | Auth | Client caller |
|---|---|---|---|---|
| 2085 | GET | `/api/health` | Public | — (docker healthcheck only) |
| 2114 | POST | `/api/auth/login` | Public | `dataService.login` ← Auth |
| 2146 | POST | `/api/auth/register` | Public | `dataService.register` ← Auth. ⚠ It trusts `role` from the request body, so anyone can self-register as Admin |
| 2017 | GET | `/api/calendar/:userId/feed.ics` | **Public** | — ⚠ Settings copies `/api/calendar.ics` instead (`Settings.tsx:652`), which matches no route. Anyone who knows a user id can read that user's trips |
| 2868 | GET | `*` | Public | SPA fallback (serves `client_build/index.html`) |

### 2.2 Core collections
These are generic `(id, data JSONB)` handlers: `getResources`, `createResource`, `updateResource` and `deleteResource`.

| Line | Method | Path | Auth | Client caller |
|---|---|---|---|---|
| 2181 | GET | `/api/users` | JWT | `getUsers` (App boot, Auth, most views) |
| 2195 | POST | `/api/users` | JWT | `addUser` ← Settings › Personnel. ⚠ Response echoes the hashed password |
| 2215 | PUT | `/api/users/:id` | JWT | `updateUser` ← Settings, UserDetail. ⚠ Response echoes the hash, and a password containing `:` is stored unhashed |
| 2244 | DELETE | `/api/users/:id` | JWT | `deleteUser` ← Settings |
| 2247 | GET | `/api/trips` | JWT | `getTrips` (most views, Sidebar) |
| 2248 | POST | `/api/trips` | JWT | `addTrip` ← TripSetupBoard, NewTripDrawer, Flights, VacationPlanner, Auth demo |
| 2249 | POST | `/api/trips/bulk` | JWT | — ⚠ (`addTrips` is never called from the UI) |
| 2264 | PUT | `/api/trips/:id` | JWT | `updateTrip` ← TripDetail, NewTripDrawer, Flights, RoadTrips, UserDetail, VacationPlanner, FlightImportWizard |
| 2265 | DELETE | `/api/trips/:id` | JWT | `deleteTrip` ← Planner, NewTripDrawer, TripDetail, Flights, UserDetail, VacationPlanner |
| 2268 | GET | `/api/events` | JWT | `getCustomEvents` ← VacationCalendar |
| 2269 | POST | `/api/events` | JWT | — ⚠ (`addCustomEvent` has no UI caller) |
| 2270 | PUT | `/api/events/:id` | JWT | — ⚠ (no client method) |
| 2271 | DELETE | `/api/events/:id` | JWT | — ⚠ (`deleteCustomEvent` has no UI caller) |
| 2274 | GET | `/api/entitlements` | JWT | `getEntitlementTypes` ← Dashboard, VacationCalendar, VacationPlanner, TripDetail, Settings |
| 2275 | POST | `/api/entitlements` | JWT | — ⚠ |
| 2276 | PUT | `/api/entitlements/:id` | JWT | — ⚠ (`saveEntitlementType` has no UI caller) |
| 2277 | DELETE | `/api/entitlements/:id` | JWT | — ⚠ (`deleteEntitlementType` has no UI caller) |
| 2280 | GET | `/api/configs` | JWT | `getSavedConfigs` ← Dashboard, VacationCalendar, VacationPlanner, TripDetail, Settings |
| 2281 | POST | `/api/configs` | JWT | — ⚠ |
| 2282 | PUT | `/api/configs/:id` | JWT | — ⚠ (`saveConfig` has no UI caller) |
| 2283 | DELETE | `/api/configs/:id` | JWT | — ⚠ (`deleteConfig` has no UI caller) |
| 2286 | GET | `/api/flights` | JWT | `getFlights`, and `getRoadTrips`, which reads the same table filtered client-side |
| 2287 | POST | `/api/flights` | JWT | `addFlight` ← Flights, RoadTrips |
| 2288 | POST | `/api/flights/bulk` | JWT | `addFlights` ← Flights, FlightImportWizard |
| 2303 | PUT | `/api/flights/:id` | JWT | `updateFlight` ← Flights, RoadTrips, FlightImportWizard |
| 2304 | DELETE | `/api/flights/:id` | JWT | `deleteFlight` ← Flights, RoadTrips, TripDetail, TripSetupBoard, NewTripDrawer, VacationPlanner |
| 2307 | GET | `/api/visited` | JWT | `getVisited` ← Dashboard, Map, TravelAtlas, Settings |
| 2308 | POST | `/api/visited` | JWT | `addVisited` ← TravelAtlas, Map, Auth demo, `pitStopSync` |
| 2309 | POST | `/api/visited/bulk` | JWT | `addVisitedBulk` ← Dashboard (auto-seed on load), TravelAtlas scan |
| 2324 | PUT | `/api/visited/:id` | JWT | `updateVisited` ← TravelAtlas, Map |
| 2325 | DELETE | `/api/visited/:id` | JWT | `deleteVisited` ← TravelAtlas, Map |
| 2328 | GET | `/api/settings` | JWT | `getWorkspaceSettings` (App boot, many views) |
| 2337 | PUT | `/api/settings` | JWT | `updateWorkspaceSettings` ← Settings, Sidebar theme toggle, CarriersTab, GearSettingsTab |

### 2.3 Backup, restore, jobs, admin
| Line | Method | Path | Auth | Client caller |
|---|---|---|---|---|
| 2551 | GET | `/api/backup` | JWT | `exportFullState` ← Settings › Data › Download Backup |
| 2571 | POST | `/api/restore` | JWT | `importFullState` ← Settings restore, FlightImportWizard (backup mode) |
| 2846 | POST | `/api/wipe` | JWT | `wipeDatabase` ← Settings › Data › Wipe. ⚠ Any user can call it |
| 2401 | GET | `/api/jobs/status/:jobId` | JWT | — ⚠ |
| 2411 | GET | `/api/jobs/:id` | JWT | — ⚠ (duplicate of the endpoint above) |
| 2421 | POST | `/api/jobs/backup` | JWT | — ⚠ (the UI uses synchronous `/api/backup`, contrary to AGENTS.md §3) |
| 2451 | POST | `/api/jobs/refresh` | JWT | — ⚠ |
| 2543 | POST | `/api/jobs/refresh-data` | JWT | — ⚠ (307 → `/api/jobs/refresh`) |
| 2546 | POST | `/api/jobs/refresh-global-data` | JWT | — ⚠ (307 → `/api/jobs/refresh`) |

### 2.4 Lookups and proxies (all JWT)
| Line | Method | Path | Client caller |
|---|---|---|---|
| 1854 | GET | `/api/airports/lookup/:iata` | `utils/flightData.ts:478` |
| 1884 | GET | `/api/carriers/lookup/:iata` | `utils/flightData.ts:600` |
| 1914 | GET | `/api/airports/search` | `placeSearch.ts:788`, Flights, TripSetupBoard |
| 1967 | GET | `/api/carriers/search` | Flights, TripSetupBoard |
| 1848 | GET | `/api/proxy/geocoding` | — ⚠ (same handler as below; this is the path AGENTS.md names, but nothing calls it) |
| 1849 | GET | `/api/geocode/search` | `placeSearch.ts:687` (`searchLocations`) |
| 940 | GET | `/api/proxy/flight-status` | `flightTracker.ts:308` |
| 971 | GET | `/api/proxy/route-flights` | `flightTracker.ts:352` (`searchFlightsByRoute`) |
| 1055 | GET | `/api/proxy/airports` | `flightData.ts:510` (AviationStack fallback) |
| 1074 | GET | `/api/proxy/airlines` | `flightData.ts:632` |
| 1109 | GET | `/api/proxy/aerodatabox/flights/number/:flightNumber` | `flightTracker.ts:225` |
| 1187 | GET | `/api/proxy/aerodatabox/aircrafts/reg/:reg` | — ⚠ |
| 1276 | GET | `/api/proxy/adsbdb/callsign/:callsign` | `flightTracker.ts:39` ⚠ no auth header |
| 1277 | GET | `/api/proxy/adsbdb/flights/:flightNumber` | — ⚠ (alias of the endpoint above) |
| 1279 | GET | `/api/proxy/adsb-lol/callsign/:callsign` | `flightTracker.ts:50` ⚠ no auth header |
| 1315 | GET | `/api/proxy/adsbdb/aircraft/:hexOrReg` | `flightTracker.ts:87` ⚠ no auth header |
| 1377 | GET | `/api/proxy/opensky/states` | `flightTracker.ts:62` ⚠ no auth header |
| 1356 | GET | `/api/proxy/route` | `multiModalRouting.ts:358` ⚠ no auth header (falls back to direct OSRM/Valhalla) |
| 1357 | GET | `/api/route` | — ⚠ (alias) |
| 1358 | GET | `/api/proxy/rail` | `multiModalRouting.ts:294` ⚠ no auth header (falls back to direct) |
| 1359 | GET | `/api/rail` | — ⚠ (alias) |
| 1364 | GET | `/api/proxy/test/:provider` | `Settings.tsx:232` ⚠ no auth header, so it always returns 401 in prod |
| 1423 | GET | `/api/proxy/openaip/:z/:x/:y` | — ⚠ (`DeckFlightMap.tsx:464,688` fetch `api.tiles.openaip.net` directly with the key in the URL) |

⚠ **"No auth header":** these calls use a bare `fetch` without the Bearer token. With the server's global `authenticateToken`, they return 401 in production. In `npm run dev` they appear to work only because the Vite middleware answers `/api/proxy/route`, `/api/proxy/rail` and `/api/proxy/test/*` itself, and because 401s on proxy calls fail silently.

### 2.5 Dev-only routes (`vite.config.ts`, `viteDevApiPlugin`; no auth)
`GET /api/proxy/route`, `/api/route`, `/api/proxy/rail`, `/api/rail`, `/api/proxy/test/:provider`.
⚠ These duplicate the backend logic and shadow the real backend while `npm run dev` is running.

### 2.6 Direct third-party calls from the browser (not endpoints, listed for QA)
- **Gemini** (`@google/genai`): PackingList AI, TripDetail NomadGuide chat, FlightTracker "Gemini AI" provider.
- **Photon:** `placeSearch.ts:729`.
- **OSRM, Valhalla, OpenRailRouting:** `multiModalRouting.ts` direct fallbacks.
- **AviationStack:** `flightData.ts:508,630` (key in the URL).
- **OpenAIP tiles.**
- **RainViewer.**
- **GitHub raw datasets:** `utils/flightData.ts:266-352`. ⚠ This conflicts with AGENTS.md §1.
- **Brandfetch.**
- **Tile CDNs.**

---

## 3. User workflows (end to end)

Each entry lists the pages and components it touches → the endpoints it calls. "Settings PUT" means `PUT /api/settings`.

### Auth & session
1. **First-run admin setup.** Auth (`mode='setup_admin'` when `getUsers()` returns `[]`) → Provision Administrator → `GET /users`, `POST /auth/register` (role Admin).
   ⚠ In prod, `GET /users` returns 401 before login, so setup mode is never detected. A fresh install shows Sign-in, and the first user must use "Sign up", which creates a Partner.
2. **Sign up.** Auth → toggle to sign-up → name/email/password/confirm → `POST /auth/register` (role Partner).
3. **Sign in.** Auth → email/password → `POST /auth/login` → token stored → `GET /users`, `GET /settings`, and so on.
4. **Demo login** (Auth "demo" button, `Auth.tsx:325`) → `GET /users` → `POST /auth/register` (admin@wandergrid.app / `password`) or `POST /auth/login` → `GET /trips` → seeds sample data via `POST /trips` and `POST /visited`.
   ⚠ It hardcodes the credentials, and it falls back to using the user object without a token if login fails.
5. **`?demo=1` URL login.** Client-only fake admin with no token (see §1).
6. **Session restore on reload.** `GET /users` reconciles the stored user. ⚠ It can fall back to the Admin user (see §1).
7. **Log out.** The only button is UserDetail › Logout (`UserDetail.tsx:364`). Logout also happens automatically on any 401/403 (`wandergrid-unauthorized` event). Logout clears localStorage only; there is no server endpoint. ⚠ `Sidebar` accepts `onLogout` but never renders a logout control.
8. **Password reset / forgot password.** ⚠ **Not implemented.** There is no UI and no endpoint. Passwords can only be changed by editing a profile (#40) or a Personnel member (#33).

### Trip planning
9. **Create trip (wizard).** Planner "New Trip" / bucket "+" buttons, or Planner-2 "New Trip" → `TripSetupBoard` (stages: basics → transport → accommodation; separate desktop and `lg:hidden` mobile layouts) → Create Trip.
   - Endpoints: `GET /geocode/search`, `GET /airports/search`, `GET /carriers/search`, flight lookups (`/proxy/aerodatabox…`, `/proxy/flight-status`, `/proxy/route-flights`), `GET /settings`, `POST /trips`.
   - `ExistingBookingsSuggestions` can absorb independent flights → `DELETE /flights/:id`.
10. **Browse, filter and search trips.** Planner tabs (all/confirmed/past/planned), search, year/month/destination selects, bucket collapse → open a trip → TripDetail. Endpoints: `GET /trips`, `GET /users`.
11. **Bulk "archive" trips.** Planner selection → Archive Selected → `window.confirm` → `DELETE /trips/:id` × n.
    ⚠ The button says "Archive", but the trips are **deleted**.
12. **Edit trip settings.** TripDetail › Edit Settings → `TripModal` → `NewTripDrawer` (name, emoji icon, status, dates, destinations) → `PUT /trips/:id`.
    - The drawer's "Archive" button also **deletes**: `DELETE /trips/:id` ⚠.
    - Absorbing suggested flights calls `DELETE /flights/:id`.
13. **Add or edit transport in a trip.** TripDetail › + Add Booking / edit icons → `FlightConfigurator` (modes: flight/train/bus/car rental/personal car/cruise; trip type; legs; PNR; cost; assign to excursion) → `PUT /trips/:id`.
    - Flight "Lookup Flight" / "Route" → `/proxy/aerodatabox/…`, `/proxy/flight-status`, `/proxy/route-flights`.
    - Car "Auto" distance → `/proxy/route` ⚠ (no auth header).
14. **Add or edit stays.** TripDetail › + Add Stay → `AccommodationConfigurator` (type, name, auto-fetch logo via Brandfetch, dates, confirmation, cost, website, notes) → `PUT /trips/:id`. Location search uses `/geocode/search`.
15. **Add, edit or delete activities.** TripDetail calendar "+" / "Add schedule item" → `ExcursionConfigurator` → `PUT /trips/:id`. Deleting uses `window.confirm` in `DailyPlannerBoard`.
    ⚠ TripDetail2 does not import `ExcursionConfigurator`.
16. **Edit the day-by-day route.** TripDetail › `DailyPlannerBoard` (day/canvas toggle, day chips) and `LocationManager` (legs and segments; add/move/delete; link start/date; Auto-Align Timeline; Save/Discard) → `PUT /trips/:id`, `/geocode/search`.
17. **Packing list.** TripDetail › `PackingList`: add item/category, check off, delete, clear all, import the master list from settings, AI-generate (Gemini, browser-direct) → `PUT /trips/:id`, `GET /settings`.
18. **NomadGuide AI chat.** TripDetail chat input → Send → Gemini (browser-direct, key from settings or the build-time `GEMINI_API_KEY`). No backend call.
19. **Export a trip to calendar.** TripDetail › calendar export → a client-generated `.ics` download. No backend call.
20. **Import flights into a trip.** TripDetail › Import → `FlightImportWizard` → `GET /flights`, `GET /trips`, `PUT /trips/:id`, `PUT /flights/:id`, `POST /flights/bulk`.
21. **Cinematic view.** TripDetail › Cinematic → full-screen `DeckFlightMap`. Read-only.
22. **Delete a trip from the trip page.** TripDetail delete flow → `DELETE /trips/:id`, `DELETE /flights/:id`.
23. **Planner-2 (VacationPlanner).**
    - Navigation: tabs Confirmed/Planned/History; grid/timeline/table views; advanced filters (year, privacy, co-traveler, transit mode, sort); year collapse.
    - Per-card actions: status toggle Planning↔Upcoming (`PUT /trips/:id`) and edit (`TripModal`).
    - Batch Merge → Consolidate → `POST /trips` and `DELETE /trips/:id` × n.

### Flights
24. **Add or edit a flight manually.** Flights › Add Flight / row edit → inline form:
    - Fields: departure date, route search, manual fields toggle, link to expedition, flight number, times, cabin, seat, seat position, PNR, cost.
    - Endpoints: `GET /proxy/route-flights`, `GET /airports/search`, `GET /carriers/search`, `POST /flights` or `PUT /flights/:id`, and possibly `PUT /trips/:id`.
25. **Delete flights.** Row delete, or multi-edit → Delete selected → confirm modal → `DELETE /flights/:id`, and/or `PUT /trips/:id` for flights embedded in trips.
26. **Bundle flights into an expedition.** Multi-edit:
    - Select All / Deselect All.
    - Bundle → name/dates → Create Bundle (`POST /trips`, `PUT /flights/:id`).
    - Edit bundle → Save / Disassemble (`window.confirm`) → `PUT /trips/:id`, `DELETE /trips/:id`.
    - Unbundle → `POST /flights`, `PUT /trips/:id`.
27. **Browse, filter and sort flights.** Time tabs (all/upcoming/past), search, cabin/year selects, Reset, table/grid toggle, per-column filter and sort popups (flight, sector, status, timing, seat), `FlightsHeroBento` mobile tabs (passport/map/stats). Endpoints: `GET /flights`, `GET /trips`.
28. **Track a live flight.** Dashboard › Track Flight → `FlightTrackerModal` (provider: Gemini/ADSBdb/AviationStack/AeroDataBox; flight number and date; Track Now on the suggested flight) → `/proxy/adsbdb/callsign` ⚠, `/proxy/adsb-lol` ⚠, `/proxy/opensky/states` ⚠, `/proxy/aerodatabox/flights/number`, `/proxy/flight-status`.
29. **Bulk import flights from a spreadsheet.** Settings › Data › Flight Import → `FlightImportWizard`:
    - Step 1: file (spreadsheet or backup mode).
    - Step 2: column mapping, IATA/ICAO.
    - Step 3: verify, filter, select, resolve duplicates.
    - Endpoints: `POST /flights/bulk`, `PUT /flights/:id`, `PUT /trips/:id`. Backup mode calls `POST /restore`.

### Road trips
30. **Create or edit a land journey.** RoadTrips › Add Land Journey / edit → modal:
    - Mode tiles, dates, operator, reference, booking ref, distance, link to a trip, cost, notes.
    - Calculate Route → `/proxy/route` ⚠ (falls back to direct OSRM).
    - Waypoints: add, drag to reorder, remove.
    - Save → `POST /flights` or `PUT /flights/:id`, `PUT /trips/:id`.
31. **Auto-sync segments.** RoadTrips › ⚡ Auto-Sync Segments → suggestions modal → Save All Segments → `POST /flights` × n, `PUT /trips/:id`.
32. **Browse and delete land journeys.** Search, mode/status/sort selects, hub map/chart tabs, expand card, link to trip, delete one or many → `DELETE /flights/:id`.

### Settings & administration
33. **Personnel (user admin).** Settings › Personnel:
    - Actions: search, Enroll Member, edit, remove (confirm).
    - Form fields: name, email, password, role, holiday weekend policy, leave balance and taken days, and a checkbox.
    - Endpoints: `POST /users`, `PUT /users/:id`, `DELETE /users/:id`.
    - ⚠ There is no role check, so any user can promote themselves or delete anyone.
34. **Workspace preferences.** Settings › Workspace: org name, currency, date format, theme, light and dark default basemaps, default cabin, home airport, land transit mode, working days → Save (`PUT /settings`). The Sidebar theme cycle also calls `PUT /settings`.
35. **Integrations.**
    - Settings › Integrations: API keys (Gemini, AviationStack, AeroDataBox + RapidAPI/direct endpoint, OpenAIP, Brandfetch) with show/hide toggles → `PUT /settings`.
    - Test All Services / per-provider Test → `GET /proxy/test/:provider` ⚠ (401 in prod).
36. **Gear master list.** Settings › Gear: add item and category, remove → Save (`PUT /settings`).
37. **Carriers.** Settings › Carriers:
    - Actions: Auto-populate from flights (`GET /flights`, `GET /trips`), add/edit via a `StandardDrawer` with presets, remove (confirm), card/table view, search.
    - Save → `PUT /settings`.
38. **Backup and restore.**
    - Settings › Data › Download Backup JSON → category picker modal → `GET /api/backup` → download.
    - Restore From File → file → merge/replace + categories → `POST /api/restore`.
39. **Calendar export and subscribe.** Settings › Data › Export `.ics` (client-generated). "Copy subscription link" ⚠ copies `/api/calendar.ics`, which matches no route.
40. **Wipe the database.** Settings › Data › Wipe → type `DELETE` → `POST /api/wipe` → page reload, which logs you out because there are no users left. ⚠ Any user can do this.
41. **Profile (UserDetail).**
    - Profile edit: Edit → name, password, weekend rule, avatar upload/remove, nationality, DOB, passport number/issuer/issue/expiry, leave allowance/spent → `PUT /users/:id`.
    - Trip table actions: edit (`PUT /trips/:id`), delete with confirm (`DELETE /trips/:id`), create a trip from a bundle (`PUT /trips/:id`).
    - Back, Logout.

### Exploration & insights
42. **Dashboard.**
    - Stats tabs: stamps/stickers/milestones/analytics.
    - Stamp search and region filter; sticker category filter and search.
    - 2D/3D globe toggle (localStorage); profile chip → UserDetail; trip clicks → TripDetail.
    - Endpoints: `GET /trips`, `/flights`, `/visited`, `/users`, `/entitlements`, `/configs`. ⚠ It also **writes** on load: `POST /visited/bulk` auto-seed (`Dashboard.tsx:759`).
43. **Map exploration.** Map:
    - View-mode pills (Flights / Land & Sea / Scratch / All Expeditions / None), fullscreen, filter sidebar (status segmented, year select, date from/to, Reset All Filters).
    - `DeckFlightMap` controls: zoom ±, 100%, fit, atmosphere, GIBS date, flight list, country panel.
    - Mission Control (`MapSettingsPanel` tabs Map/Layers/Trips/Filter; reset; recenter) is stored locally.
    - Toggling country status → `POST`/`PUT`/`DELETE /visited`.
44. **Travel Atlas: manual records.** Tabs Visited/Layovers/Wishlist/Cities/Sync; search, region select; add/edit/delete countries, cities, layovers and wishlist items (modal: code, name, city, lat/lng, date, notes); toggle transit; promote a layover or wishlist item to visited → `POST`/`PUT`/`DELETE /visited`.
45. **Travel Atlas: scan history.** Scan History → select countries and cities (select all/none) → Register to Atlas → `GET /trips`, `GET /flights`, `POST /visited/bulk`.
46. **Vacation calendar.** Month prev/next/Today, user filter chips (Unify All / Filter None), entitlement filter (all/type/holiday/event), search, tabs timeline/grid/agenda/optimizer, item details modal → Inspect Trip Logistics → TripDetail. Endpoints: `GET /trips`, `/users`, `/events`, `/entitlements`, `/configs`, `/settings`.
    ⚠ Read-only: events, entitlement types and configs cannot be created or edited anywhere in the UI.

### App shell
47. **Navigation.**
    - Desktop sidebar: nav items, next-trip widget → Planner/TripDetail, profile chip, theme cycle, collapse.
    - Mobile tab bar with 4 items plus a "More" sheet.
48. **PWA and error recovery.**
    - `PWAInstallBanner`: Install, Later, Dismiss, iOS instructions, Reload on update.
    - `AppErrorBoundary`: Try Again, Return to Dashboard.
    - Root `ErrorBoundary`: Reload, Clear Cache & Reset.

---

## 4. Interactive elements per page

Format: **control** → effect. Shared controls (Sidebar, error boundaries, PWA) are covered in §3 #47–48.

### Auth (`views/Auth.tsx`)
- Name input (sign-up and setup only), Email, Password, Confirm password (sign-up and setup).
- Submit button. Its label changes with the mode ("Provision Administrator Account" / sign-in / sign-up) → login or register.
- Demo button → demo login and sample-data seed (#4).
- "Sign up / Sign in" link → toggles the mode and clears the error.

### Dashboard (`views/Dashboard.tsx`)
- Track Flight button → `FlightTrackerModal` (provider tiles, flight number, date, Search, Track Now).
- Profile chip → UserDetail (own user).
- 2D/3D globe toggle (`:1099`) → switches `DeckFlightMap` mode and persists it to localStorage.
- Stats tab bar (`:1290`): Stamps / Stickers / Milestones / Analytics.
- Stamps: search input + clear (×), region filter pills.
- Stickers: category pills ("All" + categories), search input.
- Embedded `DeckFlightMap` controls (see Map).

### Map (`views/ExpeditionMapView.tsx` + `components/DeckFlightMap.tsx`)
- View-mode pills (desktop `:958`, compact `:1131`): Flights / Land & Sea / Scratch / All Expeditions / None.
- Fullscreen toggle (×2 responsive copies); filters sidebar toggle (×2).
- Filters panel:
  - Status `GlassSegmented`: All / Past / Upcoming / Planning.
  - Year `LiquidGlassSelect`.
  - Date-from and date-to `GlassDatePicker`.
  - "Reset All Filters".
- DeckFlightMap:
  - Zoom In / Zoom Out / 100% / Fit All Routes.
  - Celestial atmosphere toggle; GIBS date stepper; basemap-toast close.
  - "Mission Control" / appearance button → `MapSettingsPanel`.
  - Back to previous view; country-panel close and its five status buttons (`:3828-3912`) → visited CRUD.
  - Route details close; flight list expand; openAIP attribution links.
- `MapSettingsPanel`:
  - Tabs Map / Layers / Trips / Filter; Close; Reset (with confirm); Recenter.
  - Map tab: basemap segmented + 2 toggles.
  - Layers tab: 6 toggles, 2 segmented controls, GIBS date stepper.
  - Trips tab: route/flight/land-sea/scratch toggles, several segmented controls, animate-routes, cluster mode.
  - Filter tab: Clear Filters.

### Planner (`views/PlannerView.tsx`)
- Multi-select mode toggle (`:405`); New Trip → `TripSetupBoard` (Planning).
- Tab bar (`:545`): All / Confirmed / Past / Planned.
- Search input + clear; Year / Month / Destination `LiquidGlassSelect`s; "Clear (n)" filters.
- Selection bar: "Archive Selected" ⚠ (deletes), clear selection.
- Per-bucket "+" (Past / Upcoming / Planning) → `TripSetupBoard` with that status; per-bucket collapse.
- Card select checkbox (`:1201`); card click → TripDetail; empty-state action (`:1407`).

### Trip setup wizard (`components/TripSetupBoard.tsx`)
Opened from Planner, Planner-2, and `TripModal` when there is no `initialData`.
- **Basics:** title, `DateRangePicker`, status buttons, "Confirm Basics" / "Next: Configure Transport".
- **Transport:**
  - Mode tiles; one-way/round-trip structure.
  - Flight: direct/layovers, Add Stopover/remove, flight number, class buttons, seat, connecting legs, return leg, cost, PNR.
  - Train / bus / car rental / personal car / cruise-ferry field sets.
  - Commit transport, Cancel, Skip → accommodation; edit/remove committed items.
- **Accommodation:** type tiles, name, date range, cost, confirmation; Commit; Cancel; edit/remove.
- **Footer:** Cancel, Create Trip.
- `ExistingBookingsSuggestions`: jump to transport/accommodation stage, Apply (all / selected), Select all, expand, dismiss.
- ⚠ The whole wizard is implemented twice: desktop board `:2127-2826` and mobile `lg:hidden` stack `:2836-3338`.

### Trip detail (`views/TripDetail.tsx`)
- Back to planner; Cinematic (opens a full-screen map; close button); Calendar `.ics` export; Edit Settings → `NewTripDrawer`.
- `NewTripDrawer` controls: close, name, emoji grid with search, status buttons, `DateRangePicker`, destination add/remove/suggestions, Archive (⚠ delete) with Cancel/confirm, Cancel, Save.
- Month calendar: previous / next / jump-to-trip-start; per-day "Add item".
- Schedule list: per-date "Add schedule item"; edit transport, stay and activity; delete activity; item click → the matching configurator.
- Transport section: Import (→ `FlightImportWizard`), + Add Booking, edit transport group.
- Stays section: + Add Stay, edit stay, website link.
- `FlightConfigurator`:
  - Mode tabs, trip type, Add Leg, PNR, cost, assign to excursion, new excursion name.
  - Delete (confirm), Cancel, Save.
  - Per-mode forms: Flight (Lookup Flight, Route search, dates, terminals, gates, class, seat), Train, Bus, Cruise, Car Rental (+ Auto distance), Personal Car, `PitStopManager` (add, move up/down, remove, type, notes), `DurationInput` Auto.
- `AccommodationConfigurator`: type tiles, name, auto-fetch logo, dates, confirmation, two cost fields, website, notes, Add/Update Stay, Add Another, edit/delete item, Delete (confirm), Cancel, Save.
- `ExcursionConfigurator`: close, name, date, time controls, cost, notes, Delete (confirm), Cancel, Save Excursion.
- `DailyPlannerBoard`: day/canvas toggle; add transport/stay/activity (×2 placements); floating lane toggle; day chips; delete activity (`window.confirm`, ×3 placements).
- `LocationManager`: leg name; Add Segment; Delete leg; segment type select, location input, mode select; link start/date toggles; move up/down; delete segment; Auto-Align Timeline; Add Separate Excursion; Save Route Changes; Discard Changes.
- `PackingList`: Clear all, Import master list, AI Generate, new item and category, Add, check/delete item.
- NomadGuide chat: message input, Send.
- Import-preview modal: filter input, two inputs, Select/Deselect All, per-row expand, Cancel, Import Trips.

### Flights (`views/Flights.tsx`)
- Add Flight; time tabs All / Upcoming / Past; search; cabin `GlassSelect`; year `GlassSelect`; Reset.
- Multi-edit toggle ("Edit Flights" / "Done Editing"); table/grid view toggle.
- Column header sort buttons; per-column filter popups (flight, sector, status, timing, seat), each with a clear button, an input or `GlassSelect`, and sort options.
- Row and card edit/delete (×3 layouts); bundle-header edit.
- Multi-edit bar: Select All, Deselect All, Bundle (→ Create Bundle modal: 3 inputs, Cancel, Create Bundle), Unbundle (→ confirm: Cancel, Unbundle), Delete selected (→ confirm: Cancel, Delete).
- Edit-bundle modal: close, 2 inputs, Disassemble (`window.confirm`), Cancel, Save Changes.
- Flight form modal:
  - Close; departure date; "Search route flights" (+ clear results); "Show manual fields" toggle; Link to Expedition select.
  - Flight number, departure/arrival times, arrival date, actual times, cabin, seat, seat position, PNR, cost.
  - Cancel, Save Boarding Stub.
- `FlightsHeroBento`: mobile tabs Passport / Map / Stats.

### Road trips (`views/RoadTrips.tsx`)
- Multi-select toggle; Add Land Journey; hub tabs Map / Chart; hub expand.
- Two `GlassSelect`s in the hub; ⚡ Auto-Sync Segments.
- Search; three filter/sort `GlassSelect`s; Delete Selected; clear selection.
- Per-card: select, open linked trip, expand, edit, delete.
- Journey modal:
  - Mode tiles; departure/arrival dates; operator; reference; booking ref; distance.
  - Calculate Route; "Fix the map" link; Associate Trip select; cost.
  - Waypoint name, type and notes + Add; waypoint drag handle and remove.
  - Notes textarea; Cancel; Save Itinerary / Create Journey.
- Suggestions modal: Cancel, Save All Segments.

### Travel Atlas (`views/TravelAtlas.tsx`)
- Scan History; Add Country; Add City (hidden on small screens); "Sync" CTA.
- Tabs: Visited / Layovers / Wishlist / Cities / Sync.
- Search + clear; region `Select`.
- Empty-state add buttons per tab.
- Per-item: Edit Record, Remove (×4 lists); transit toggle (visited); promote to Visited (layover, wishlist).
- Sync tab: Run scan; Register to Atlas (n); select all/none for countries and for cities.
- Record modal: close; code; name; status buttons; type buttons; city; city code; country; lat; lng; date; notes; Cancel; Save Record / Register to Atlas.

### Vacation calendar (`views/VacationCalendar.tsx`)
- Previous / Next month, Today; Unify All / Filter None; per-user chips.
- Entitlement filter list: All / each type / Holidays / Events; search input.
- Tabs: Timeline / Grid / Agenda / Optimizer.
- Cell item and event buttons → details modal (Dismiss, Inspect Trip Logistics, Got It ×2).

### Planner-2 (`views/VacationPlanner.tsx`)
- Batch Merge / Cancel Batch; New Trip.
- Tabs: Confirmed / Planned / History; search + clear; view mode Grid / Timeline / Table.
- Toggle filters → Departure Year, Privacy, Co-Traveler, Transit Mode, Sort `GlassSelect`s.
- Per-card: status toggle, open, edit, select checkbox, quick-status button, edit button.
- Year collapse; empty-state CTA.
- Merge bar: title input, Dismiss, Consolidate, Exit Selection.
- `TripModal` (edit) and `TripSetupBoard` (create).

### Settings (`views/Settings.tsx`)
- Tabs: Workspace / Personnel / Integrations / Gear / Carriers / Data Management. Save button in the header.
- **Workspace:** org name; currency, date format and theme selects; light basemap tiles (Liberty/Bright/Positron/Satellite); dark basemap tiles (Dark/Fiord/NASA/Satellite/Ocean); default cabin; home airport; default land mode; working-day toggles (7).
- **Personnel:**
  - Search, Enroll Member, per-member edit/remove.
  - Member modal: name, email, password, role (Admin/Partner/Child), weekend policy, accrual, taken, checkbox, Cancel, Save Member.
  - Remove confirm: Cancel, Confirm Removal.
- **Integrations:** key inputs + show/hide for Gemini, AviationStack, AeroDataBox (RapidAPI/Direct switch), OpenAIP, Brandfetch; DOCS links; Test All Services; per-provider Test; documentation links.
- **Gear** (`GearSettingsTab`): Save, item input, category select, Add Item, remove item.
- **Carriers** (`CarriersTab`): Auto-populate, Add, Save, dismiss notification, search + clear, cards/table toggle, edit/remove per carrier (×2 layouts), website links.
  - Drawer: name, IATA, domain, presets, Cancel, Save.
  - Remove confirm.
- **Data:**
  - Download Backup JSON → modal (select all/none, category checkboxes, Cancel, Download).
  - Restore From File → hidden file input → modal (Merge/Replace, select all/none, categories, Cancel, Overwrite/Merge, Try again).
  - Open Flight Import Wizard; Export Calendar; Copy Subscription Link ⚠.
  - Wipe Database → modal ("Type DELETE", Cancel, Wipe Database).
- `FlightImportWizard`:
  - Close; Spreadsheet/Backup mode; 2 file inputs.
  - Backup mode: merge/replace, select all/none, Cancel, Merge/Overwrite.
  - Spreadsheet mode: IATA/ICAO, mapping selects, Cancel & Reupload, Next.
  - Verification: search, carrier and cabin filters, 2 range inputs, trip select, Select/Deselect All, row checkboxes, duplicate-resolution buttons, Modify Mapping, Import.

### User detail (`views/UserDetail.tsx`)
- Edit-profile pencil (`:326`), Back, Logout.
- Trip table: Create trip from bundle (`:570`), edit trip, delete trip.
- Profile edit: name, password, weekend rule, avatar file + remove, nationality, DOB, passport number, issuer, issue date, expiry, allowance, spent, Cancel, Save Changes.
- Trip edit: name, location, start, end, status, Cancel, Save Expedition.
- Delete-trip confirm: Cancel, Confirm Delete.

### Duplicate "2" pages (URL-only)
- **`Flights2`:** same control set as Flights (78 controls; 111 differing lines).
- **`RoadTrips2`:** 34 controls vs 42. It does not import `fetchRoute`, so there is no live "Calculate Route" path. 839 differing lines.
- **`TripDetail2`:** 39 controls. It lacks `ExcursionConfigurator` and has 699 differing lines.

---

## 5. QA chunks

The 48 workflows are grouped into 7 chunks of similar effort.

| Chunk | Workflows | Focus / known risks to probe |
|---|---|---|
| **A. Auth, session & access control** | 1–8, 47 | Fresh-install setup detection (prod 401); self-register as Admin; `?demo=1`; session fallback to Admin; logout only from the profile; no password reset; no role enforcement on any endpoint |
| **B. Trip creation & planning boards** | 9–11, 23 | Desktop vs mobile wizard parity; "Archive" deletes; batch merge; Planner vs Planner-2 duplication |
| **C. Trip detail & itinerary editing** | 12–22 | All transport modes, stays, activities, route legs, packing (AI), NomadGuide, `.ics`; TripDetail vs TripDetail2 divergence |
| **D. Flights** | 24–29 | Manual CRUD, bundling and unbundling, filters and sorts, live tracking (proxy 401s), spreadsheet import |
| **E. Road trips & routing** | 30–32 | Route calculation (proxy 401 → direct fallback), auto-sync, waypoints; RoadTrips2 |
| **F. Map, Atlas, Dashboard & Calendar** | 42–46 | Map layers and settings, visited CRUD from map and atlas, scan import, the Dashboard write on load, calendar filters (read-only data) |
| **G. Settings, data & administration** | 33–41, 48 | Personnel CRUD, integrations tests (401), carriers and gear, backup/restore merge vs replace, broken calendar subscription URL, wipe by any user, profile edits |

---

## 6. Dead, unreachable and duplicated code

**Unreachable views and routes**
- `ViewState.GAMIFICATION` (§1).
- `Flights2`, `RoadTrips2` and `TripDetail2` can only be reached by typing their URLs.

**Duplicated views**
- `Flights`/`Flights2`, `RoadTrips`/`RoadTrips2` and `TripDetail`/`TripDetail2` are near-copies of 2.6–4.5k lines each that have already diverged.
- `PlannerView` and `VacationPlanner` ("Planner-2") are two separate trip-board implementations, and both appear in the nav.

**Components never imported** (zero importers found by grep)
- `components/TimezoneSlider.tsx`
- `components/TravelerLeaderboard.tsx`
- `components/WorkspaceSettingsTab.tsx` (Settings renders its own workspace tab)
- `components/transport/FerryForm.tsx` (cruise and ferry use `CruiseForm`)

**Unused props**
- `Sidebar.onLogout` is passed in but never used.

**Duplicated components and UI**
- `TripSetupBoard` contains two full wizard implementations, one desktop and one mobile.
- `ExpeditionMapView` has duplicate fullscreen and sidebar buttons for its two layouts.

**Backend endpoints with no client caller**
- `/api/trips/bulk`
- `POST`/`PUT`/`DELETE` on `/api/events`, `/api/entitlements` and `/api/configs` (9 routes)
- All 6 `/api/jobs/*` routes
- `/api/proxy/geocoding`
- `/api/proxy/aerodatabox/aircrafts/reg/:reg`
- `/api/proxy/adsbdb/flights/:flightNumber`
- `/api/route` and `/api/rail`
- `/api/proxy/openaip/:z/:x/:y`
- `/api/calendar/:userId/feed.ics` (the client builds a different URL)
- `/api/health` (used by Docker only)

**Duplicate endpoint aliases**
- `/api/jobs/status/:jobId` = `/api/jobs/:id`
- `/api/jobs/refresh-data` and `/api/jobs/refresh-global-data` both 307 → `/api/jobs/refresh`
- `/api/proxy/geocoding` = `/api/geocode/search`
- `/api/proxy/route` = `/api/route`
- `/api/proxy/rail` = `/api/rail`
- `/api/proxy/adsbdb/callsign` = `/api/proxy/adsbdb/flights`
- `vite.config.ts` re-implements the route, rail and test proxies.

**Dead `dataService` methods** (no UI caller)
`addTrips`, `addCustomEvent`, `deleteCustomEvent`, `saveEntitlementType`, `deleteEntitlementType`, `saveConfig`, `deleteConfig`.
As a result, the README's "leave policy engine" (entitlement types, custom events, saved configs) has **no create or edit UI**. That data can only arrive via restore or demo.

**Behavior that doesn't match labels**
- "Archive" (Planner bulk action, `NewTripDrawer`) performs a hard delete.
- "Copy subscription link" produces a URL that returns the SPA HTML.

---

## 7. Counts

| Item | Count | Notes |
|---|---|---|
| **Pages** | **15** | Auth + 14 routed view components. 13 of them are reachable from navigation or links; 3 "2" variants are URL-only. One extra `ViewState` (`GAMIFICATION`) is unreachable and aliases Dashboard |
| **API endpoints** | **69** | `/api/*` routes in `server.js`, plus 1 SPA catch-all (`GET *`). 4 public (health, login, register, ICS feed), 65 require a JWT, 0 enforce a role. 24 have no frontend caller (§6) |
| **Dev-only endpoints** | 5 | `vite.config.ts` middleware |
| **Workflows** | **48** | Grouped into 7 QA chunks (A–G) |
