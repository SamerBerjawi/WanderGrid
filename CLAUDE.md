# CLAUDE.md

WanderGrid is a self-hosted travel planner, flight log and leave manager. It has a React SPA at the repo root and an Express + PostgreSQL backend in `backend_files/`.
**Read [AGENTS.md](AGENTS.md) and [Design.md](Design.md) before any change.** They are binding: AGENTS.md covers architecture, performance and UI rules, and Design.md is the design system. This file is the orientation layer and does not repeat them.

## Stack (versions from package.json ranges)

### Frontend (root `package.json`, ESM)

- React 19.2 / react-dom 19.2, TypeScript ~5.8, Vite 6.2 with `@vitejs/plugin-react` 5, `vite-plugin-pwa` 1.3 (Workbox generateSW)
- Tailwind CSS 3.4 + PostCSS/autoprefixer (single compiled config; no CDN); `clsx`, `tailwind-merge`; global CSS in `styles.css`. Classes built at runtime must be safelisted in `tailwind.config.js`
- UI: `@nkzw/liquid-glass` 1.3 (glass surfaces), `@hugeicons/react` + `@hugeicons/core-free-icons` (stroke-rounded; app imports go through `components/ui/hugeicons.tsx`, an adapter keeping the `size`/`weight`/`className` API), `motion` 12 (`motion/react`), `@number-flow/react`, `@dnd-kit/*`
- Maps/geo: `maplibre-gl` 6.4, `deck.gl` 9.3, `pmtiles` 4.5, `leaflet` 1.9.4, `react-simple-maps` 3, `d3` 7, `topojson-client`, `searoute-js`, `@mapbox/mapbox-gl-rtl-text`
- Charts: `recharts` 3.8. Data I/O: `xlsx` 0.18, `html2canvas` 1.4.1. AI: `@google/genai` 1.34
- `.npmrc` sets `legacy-peer-deps=true`. Peer conflicts are expected.

### Backend (`backend_files/package.json`, CommonJS)

- Node 20 (Dockerfile `node:20-alpine`), Express 4.19, `pg` 8.12, `jsonwebtoken` 9, `helmet` 7, `express-rate-limit` 8, `compression`, `cors`
- Tests use the built-in `node:test` runner. There is no test framework dependency.
- Postgres 15 (`postgres:15-alpine` in docker-compose)

## Commands (verified 2026-10-10 on Node 24 / npm 11 unless noted)

```bash
npm install                      # root/frontend deps (legacy-peer-deps via .npmrc)
npm run dev                      # Vite on localhost:3000 (VITE_DEV_HOST=0.0.0.0 for LAN); proxies /api -> http://localhost:3001
npx tsc --noEmit                 # type check; currently 0 errors
npm run lint:tokens              # design-token check: z-index scale, no arbitrary hex, valid shades (also in CI)
npx vite build                   # production build to dist/ (works, ~8s)
npm run build                    # = bump-version + vite build. SIDE EFFECT: rewrites version.ts and package.json "version"
npm run preview                  # serve dist/

cd backend_files && npm install
npm test                         # unit tests + API integration tests (test/api/, real server.js on in-memory pg-mem)
PORT=3001 DATABASE_URL=postgres://wandergrid:wandergrid_password@localhost:5432/wandergrid node server.js
docker compose up -d --build     # full stack (app :4921 -> 3000, db). Needs JWT_SECRET in .env (copy .env.example)
```

- **Real mode without Postgres:** `cd backend_files && node test/helpers/devServer.js` runs the real `server.js` on :3001 against in-memory pg-mem (same routes, auth, versioned writes and batch transactions; data is lost on exit), and `VITE_LOCAL_MODE=false npx vite --port 3114` runs the app against it. Register with `POST /api/auth/register`, then put the token and user in `localStorage` (`wandergrid_session_token`, `wandergrid_session_user`). The Flights page was checked this way (import, create, edit, delete, create-trip and undo); a real Postgres server has still not been run.
- `npm start` is in the README but **does not exist**. Use `npm run dev`.
- The backend defaults to `PORT=3000`, and that clashes with Vite. Set `PORT=3001` locally so the Vite proxy reaches it. I verified that it boots and that `/api/health` responds. Running it against a live Postgres was **not verified** because no Postgres or Docker was available.
- `npm run dev` runs in local mode by default (`.env.development` sets `VITE_LOCAL_MODE=true`): the data layer uses localStorage only and shows a "Local mode" badge, so no backend or Postgres is needed. To develop against the API, put `VITE_LOCAL_MODE=false` in `.env.development.local` (git-ignored) and run the backend on `PORT=3001`.
- **There is no seed script.** The schema is created at startup by `initDb()` in `server.js` (`CREATE TABLE IF NOT EXISTS`, retried 10×/3s). `backend_files/schema.sql` mirrors it but nothing executes it. The global airport and carrier tables are populated automatically from external datasets. To get sample data, register a user in the UI or restore a backup JSON in Settings.
- Frontend unit tests (`npm test`, Vitest + jsdom, `tests/unit/`): the pure logic of the Flights page (journey grouping, status and progress, alerts, import column mapping, lookup helpers). End-to-end: `cd tests/e2e && npm install && npx playwright test` (production build + real server on pg-mem, desktop and mobile projects, ~45 min). CI runs tsc, the token check and backend tests on every push and PR before building the image; the full e2e suite runs only for `v*` tags and manual runs (Actions tab → Run workflow).
- A git `pre-commit` hook runs `scripts/bump-version.cjs`, so every commit also bumps `version.ts`/`package.json`.

## Directory map

| Path | Responsibility |
| --- | --- |
| `index.tsx`, `App.tsx` | Entry point. There is no router library: `utils/routes.ts` (`resolveRoute`, pure and unit-tested) maps a URL to a route, and `App` keeps it in state. **The redesigned ("New") pages and `components/new/ShellNew.tsx` are the default at the clean paths** (`/`, `/trips`, `/trip/:id`, `/flights`, `/roadtrips`, `/map`, `/atlas`, `/calendar`, `/user/:id`, `/settings`); the original pages, Sidebar/GoldenSidebar shell and old Auth are kept under **`/classic`** (`/classic/planner`, `/classic/trip/:id` ...), where `App` still switches on `ViewState`. Old `-new` URLs redirect to the clean path. Views are `React.lazy`-loaded |
| `views/` | The original top-level pages (Dashboard, PlannerView, VacationCalendar, ExpeditionMapView, Flights, RoadTrips, TripDetail, TravelAtlas, Settings, UserDetail, Auth), now served under `/classic` |
| `views/new/`, `components/new/` | The redesigned pages (`DashboardNew`, `TripsNew`, `TripNew`, `FlightsNew`, `RoadTripsNew`, `MapNew`, `AtlasNew`, `CalendarNew`, `MemberNew`, `SettingsNew`, `AuthNew`) and their parts. They are the default pages; design rules are in `UI_UX_DESIGN_REFERENCE.md`, not `Design.md`. Never import them from the original pages |
| `components/` | Feature components (configurators, drawers, map, passport/stamps). `ui.tsx` has the shared Card, Button and similar components |
| `components/glass/` | Liquid-glass primitives: GlassPanel, GlassButton, GlassInput, GlassSelect, GlassToggle, GlassSegmented, GlassSlider, SettingRow |
| `components/ui/` | Icon wrapper, date pickers, bento grid, virtual list item |
| `services/` | Client-side domain logic. `mockDb.ts` is **the** data service (`dataService`), despite its name. The rest cover geocoding, routing (road/rail/maritime), flight tracking, import/export, map styles, and the solar terminator |
| `hooks/` | `useWanderSync` (SWR cache), `usePWA`, `useExistingTripSuggestions` |
| `utils/` | `formatters.ts` (date/currency; mandatory), `brandfetch.ts`, `flightData.ts`, static aviation and sticker data |
| `config/` | `featureFlags.ts` (`VITE_FF_*` overrides) and `pageThemes.ts` |
| `types.ts`, `types/` | Shared TS types and `ViewState`. Path alias `@/*` points at the repo root |
| `constants.ts` | Shared style strings (`INPUT_BASE_STYLE`, `BTN_*_STYLE`, …) |
| `backend_files/` | Express server (`server.js`, ~2.9k lines), upstream helpers (`upstream.js`, `geocodingChain.js`, `routeProxy.js`, `aviationStack.js`, `carrierMapping.js`, `integrationsTester.js`), the `test/` folder, and the Dockerfile |
| `public/` | PWA icons, `manifest.json`, GeoJSON (`data/`), map styles, `airport-overlay.pmtiles` (gitignored and must be present locally) |
| `docs/` | Change registries: `gev-changes.md` (GEV feature ports with reversal recipes) and `mission-control-changes.md` |
| `.agents/skills/liquid-glass-wandergrid`, `liquid-glass-wandergrid-SKILL.md` | Liquid-glass styling skill referenced by AGENTS.md §11 |
| `scripts/bump-version.cjs` | Writes `v0.5-YYMMDD.N` to `version.ts` and `package.json` |
| `dist/`, `scratch/` | Build output and an empty scratch dir. Both are untracked/ignored |

## Architecture

### Data flow

- Every collection is a Postgres table of shape `(id TEXT PK, data JSONB)`: users, trips, events, entitlements, configs, flights and visited. `settings` is a key/JSONB table. Generic `getResources/createResource/updateResource/deleteResource` handlers in `server.js` serve `/api/<collection>`, plus `/bulk` upserts for trips, flights and visited.
- Client: components call `dataService` (in `services/mockDb.ts`). It calls `fetch('/api…')` with a Bearer token, a 10s timeout and exponential retry on network errors and 5xx responses (never for POST, which is not idempotent). After a successful POST/PUT/DELETE it dispatches the `wandergrid_db_updated` window event. `useWanderSync` (5s TTL in-memory cache) listens for that event and refetches.
- **Dev vs prod persistence:** `dataService` uses the API unless the dev-only `VITE_LOCAL_MODE=true` is set (the default under `npm run dev`, via `.env.development`), in which case it uses localStorage for the whole session. Production builds always use the API. It never switches mid-session; API failures surface as errors.
- Heavy jobs (backup, refresh, global data refresh) return 202 + `jobId`. Clients poll `/api/jobs/status/:jobId` (AGENTS.md §3).
- Airports and carriers are served from in-memory maps loaded from the `global_airports` and `global_carriers` tables. A weekly `setInterval` refreshes them (`GLOBAL_DATA_REFRESH_MS`). Do not fetch them live per request (AGENTS.md §1).
- Production: the Dockerfile builds the SPA, copies it to `client_build/`, and Express serves it statically along with the `*` SPA fallback. CI (`.github/workflows/build-and-publish.yml`) pushes the image to GHCR on main, master and `v*` tags.

### Auth

- JWT (7d expiry), signed with `JWT_SECRET`. In production the server refuses to start with the default dev secret. Passwords use PBKDF2-SHA512 with a salt (`hashPassword`).
- `authenticateToken` is applied to all of `/api`. The public paths are `/api/health`, `/api/auth/login`, `/api/auth/register` and `/api/calendar/:userId/feed.ics`. Token and user are stored in localStorage (`wandergrid_session_token`, `wandergrid_session_user`).
- A 401 or 403 from the API dispatches `wandergrid-unauthorized` / `wandergrid:unauthorized` window events. `role` is carried in the token.
- Rate limits: a general limiter on `/api` and a stricter one on `/api/auth`.

**External services.** All of them go through backend proxies under `/api/proxy/*` with timeouts. `vite.config.ts` re-implements the route, rail and test proxies as dev middleware.

- Geocoding: Open-Meteo, then Photon, then Nominatim (`geocodingChain.js`). Results are cached in the `geocoding_cache` table, the timeout is 3s, and the fallback on failure is `[]`.
- Routing: FOSSGIS OSRM, then project-osrm, then Valhalla for road. OpenRailRouting for rail (tries the `all_tracks`, `non_tgv`, `tgv_all`, `all_tracks_1435` profiles in turn). `searoute-js` for maritime. Road and rail legs are resolved by `backend_files/routeStore.js` behind `POST /api/proxy/routes/resolve` (batched, requires the session token) and persisted in `cached_routes`, including definitive "no route" answers; the client (`services/multiModalRouting.ts`) polls only for pending legs.
- Public holidays (calendar > Holidays > Add a country calendar): Nager.Date, then OpenHolidays, behind `GET /api/proxy/holidays/countries` and `/:year/:countryCode` (`backend_files/holidays.js`, one-day cache). In local mode the browser calls Nager.Date directly.
- Flights: AviationStack, AeroDataBox (RapidAPI), adsbdb, adsb.lol and OpenSky. Map tiles: OpenFreeMap, CARTO, OSM, NASA GIBS, AWS Terrarium and OpenAIP (keyed). Logos: Brandfetch. Holidays: Nager.Date. Weather radar: RainViewer.
- Gemini (`@google/genai`) runs client-side in `PackingList.tsx` and `TripDetail*.tsx`. The key comes from workspace settings (`googleGeminiApiKey`) or `GEMINI_API_KEY`, which `vite.config.ts` `define` **inlines into the bundle**.
- Most third-party API keys are stored in workspace settings and sent by the client as headers, for example `X-AeroDataBox-Key` and `X-OpenAIP-Key`. A key can also be set through env vars (`INTEGRATIONS_*`).

**Env vars** (see `.env.example`): `DATABASE_URL`, `JWT_SECRET`, `PORT`, `NODE_ENV`, `STRUCTURED_LOGGING`, `DB_POOL_SIZE`, `DB_CONNECTION_TIMEOUT_MS`, `DB_STATEMENT_TIMEOUT_MS`, `API_CACHE_TTL_MS`, `FLIGHT_FETCH_TIMEOUT_MS`, `GLOBAL_DATA_REFRESH_MS`, `GEOCODE_CACHE_TTL_MS`, `EXTERNAL_FETCH_TIMEOUT_MS`, `INTEGRATIONS_*`, `FLIGHT_LOOKUP_FLIGHTSTATS` (`off` disables the keyless FlightStats source of the flight lookup). Frontend: `GEMINI_API_KEY` and `VITE_FF_*`.

## Conventions

- **Naming:** PascalCase `.tsx` files for components and views, with named exports (e.g. `export const Flights`). camelCase `.ts` files for services and utils. Hooks are named `useX`. Backend files use camelCase CommonJS. Feature-flag IDs follow `GEV_P0x_*`.
- **State:** there is no global store (no Redux or Zustand). Each view keeps local `useState` and reads through `dataService` and `useWanderSync`. Settings are loaded via `dataService.getWorkspaceSettings()`.
- **Styling:** Tailwind utility classes with design tokens from `tailwind.config.js`, such as `light-text`/`dark-text`, `primary-*`, the `z-modal`/`z-popover`/… scale and `text-2xs`. Shared class strings live in `constants.ts`. Surfaces use `GlassPanel` (`wg-glass-card`/`wg-glass-pill`). Use the Hugeicons adapter icons (`weight="duotone"` maps to the standard stroke) for headers and the regular `Plus` for add buttons. Dark mode is class-based.
- **Formatting:** always use `formatDate`, `formatDateRange` and `formatCurrency` from `utils/formatters.ts`. Never call `toLocaleDateString` directly.
- **UI rules to enforce** (AGENTS.md §7–11):
  - No arbitrary `z-[…]` values.
  - No raw `<select>` outside `GlassSelect`.
  - No near-black surface fills.
  - 44px touch targets, with `aria-label` on icon-only buttons.
  - Use `<EmptyState />` for empty collections.
  - Run the §11.3 grep self-check on touched files and report it.
- **Error handling:**
  - Server responses go through `sendError(res, err, status, msg)`, which sanitizes messages in production. Logs are structured JSON when `NODE_ENV=production` or `STRUCTURED_LOGGING=true`.
  - On the client, `ErrorBoundary` wraps the root (`index.tsx`) and `AppErrorBoundary` wraps views.
  - External calls fail fast and return empty results rather than throwing to the UI.
- **Feature work:** new user-facing features go behind a flag in `config/featureFlags.ts`, default OFF. Record GEV ports in `docs/gev-changes.md`. Exception: bug and security fixes are never flagged, and new flows that replace broken behaviour (e.g. password reset, trip archive) are flagged but default ON.

## Fragile, legacy, or out of scope

- **`/classic` is a kept interface, not the product:** every old file stays until the user approves deleting it (`UI_UX_DESIGN_REFERENCE.md` §5.0, §5.5 lists what only the old pages can do). Do not fix or restyle old pages unless asked; do not link to `/classic` from New pages beyond the two entry points (trip menu, Settings). The Golden Hour and Departure Board themes (`UI_GOLDEN_HOUR`, `uiTheme`) only apply there.
- **Retired "v2" views:** `Flights2`, `RoadTrips2` and `TripDetail2` were deleted; their legacy URLs (`/flights-2`, `/roadtrips-2`, `/trip-2/:id`) resolve to the main pages. `VacationPlanner` ("Planner-2") was removed as redundant; `/planner-2` and `/planner2` open the Planner.
- **`services/mockDb.ts`** (~1.5k lines) is the real production data client, despite its name. It contains the API client, the localStorage fallback, backup/restore and trip↔flight sync. Edit it carefully. Restore assigns the password `password` to users that have none.
- **`verifyPassword`** accepts plaintext stored passwords (legacy, no `:` salt separator). This is a legacy compatibility path, so do not extend it.
- **`backend_files/server.js`** is a ~2.9k-line monolith, and `initDb()` is the real schema. Keep `schema.sql` in sync manually if you touch tables.
- **Content-Security-Policy:** defined in `backend_files/server.js` (`CSP_DIRECTIVES`) and mirrored in `vite.config.ts` `preview.headers` for the e2e suite; keep them in sync. No inline scripts, `eval`, or third-party script hosts.
- **Dev proxy duplication:** `vite.config.ts` duplicates the backend route, rail and test proxy logic. A change to one copy is not reflected in the other.
- **PWA/service worker:** the app auto-reloads on `controllerchange` and on `vite:preloadError`. Stale caches can mask changes, so hard-reload or unregister the SW when testing builds.
- **Version bumps:** `npm run build` bumps the version and creates a diff in `version.ts` and `package.json`.
- **Case-sensitive filename:** the design spec is `Design.md`, but AGENTS.md links `design.md`. This only works on case-insensitive filesystems.
- **README is partly stale:** it mentions `npm start`, React Globe GL and Nager-only geocoding.
- **Missing local assets:** `public/airport-overlay.pmtiles` is gitignored, so fresh clones lack the airport overlay.
- **Out of scope unless asked:** `dist/`, `node_modules/`, `scratch/`, `.agents/`, GHCR/CI workflow, `metadata.json` (AI Studio manifest), and vendored files in `public/vendor/`.
