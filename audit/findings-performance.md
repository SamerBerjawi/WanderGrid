# WanderGrid — Performance Findings

**Date:** 2026-10-11
**Scope:** the whole repository at `main` (working tree): bundle, assets, frontend rendering, API and DB. No application code was modified.

**How the numbers were measured**
- **Bundle:** `npx vite build --sourcemap` into a scratch directory, with sizes measured raw and gzip -9. Chunk contents were attributed by summing `sourcesContent` per package from the sourcemaps.
- **Lighthouse 12.6.1:** run against `vite preview` of that build, using Chrome stable (default mobile profile: simulated slow 4G and 4× CPU throttle).
- **Runtime:** Chrome driven by the repo's own `puppeteer-core` against `npm run dev`. With no backend, the app falls back to localStorage, and I logged in with the built-in "Auto-Setup & Demo Run" dataset.
  - Dev-build numbers are indicative, not production-absolute. The A/B comparisons are like-for-like.
  - Hardware: Apple Silicon Mac, 120 Hz display.
- **Not measured:** Postgres query timings. No Postgres or Docker was available, so DB findings are confirmed by reading the code, with sizes taken from the real upstream datasets.

**Baseline**

| Metric | Value |
|---|---|
| Total JS | 7.37 MB raw / 1.84 MB gzip, in 52 chunks |
| CSS | 260 KB raw / 33 KB gzip (+ 81 KB deck.gl CSS) |
| JS downloaded before first render | 721 KB gzip |
| PWA precache | 151 files / 9.70 MB |
| `dist/` size | 251 MB (208 MB of it is `airport-overlay.pmtiles`) |

| Lighthouse (mobile) | Perf | FCP | LCP | TTI | TBT | Bytes |
|---|---|---|---|---|---|---|
| `/` (login screen) | **58** | 6.6 s | 9.2 s | 9.2 s | 30 ms | 1,291 KiB |
| `/?demo=1` (Dashboard shell, no API data) | **58** | 7.1 s | 9.5 s | 9.6 s | 30 ms | 1,438 KiB |

---

### PERF-001 The login screen downloads all of deck.gl and maplibre (a manual-chunk mistake)
- **Severity:** High
- **Location:** `vite.config.ts` (`manualChunks`, section `if (id.includes('@deck.gl') || … 'maplibre-gl') return 'vendor-deckgl'`); the result is visible in `dist/index.html`.
- **Evidence:**
  - The built `index.html` modulepreloads `vendor-deckgl-*.js` (1,631 KB raw / **443 KB gzip**) together with the entry chunk.
  - The entry chunk imports it only to get Vite's dynamic-import preload helper. Rollup placed `__vitePreload` inside the manual chunk:
    ```
    index-DDr4o4k6.js:   import{_ as $t}from"./vendor-deckgl-DkCKOZyz.js"
                         ... q.lazy(()=>$t(()=>import("./Dashboard-…js"), …))   // every React.lazy view uses $t
    vendor-deckgl:       export{ …, C_ as _ }   // C_ is the preload helper (contains "preload")
    ```
  - Lighthouse on `/` (the login form, which needs no map) gave:
    ```
    unused-javascript: Est savings of 954 KiB
      vendor-deckgl-DkCKOZyz.js 346kB of 446kB unused
    FCP 6.6 s · LCP 9.2 s · Performance 58
    ```
- **Impact:** Every first visit, including the login page, every logged-out visitor, and mobile users on cellular data, downloads and parses roughly 450 KB gzip of WebGL mapping code before anything appears. It is the single largest contributor to the 6–9 s mobile FCP and LCP.
- **Suggested fix:**
  - Make `manualChunks` return a vendor chunk only for modules that are *exclusively* map code. Exclude `\0vite/preload-helper` and other virtual or shared modules (`if (id.startsWith('\0')) return;`).
  - Alternatively, drop the manual deck.gl chunk and let Rollup split it naturally behind `DeckFlightMap`'s lazy boundary.
  - Verify that `dist/index.html` no longer preloads `vendor-deckgl`.
- **Effort:** S

### PERF-002 Liquid-glass effects halve the frame rate on content-heavy pages
- **Severity:** High
- **Location:** `components/glass/GlassPanel.tsx:115-138` (wraps `@nkzw/liquid-glass`); used by every `Card` and every `Button` in `components/ui.tsx` and by most surfaces (AGENTS.md §9.1 makes it mandatory).
- **Evidence:**
  - **Instance counts** after demo login, measured live:

    | Page | DOM nodes | Glass instances | `feDisplacementMap` filters | Elements with `backdrop-filter` |
    |---|---|---|---|---|
    | Dashboard | 1,179 | 40 | 60 | 22 |
    | Planner | 1,286 | 48 | 72 | 33 |
    | Atlas | 1,095 | 34 | 51 | 19 |
    | Calendar | 693 | 16 | 24 | 9 |

  - **A/B frame timing**, headful Chrome on a 120 Hz display: 90 steps of scroll plus mousemove, same page and data. The OFF run injected `*{backdrop-filter:none;filter:none}`.

    | Page | Glass ON avg / p95 frame | Glass filters OFF avg / p95 | fps ON → OFF |
    |---|---|---|---|
    | Dashboard | 17.9 ms / 25.1 ms | 8.3 ms / 9.3 ms | 56 → 120 |
    | Planner | 16.6 ms / **33.4 ms** | 8.3 ms / 9.0 ms | 60 → 120 |
    | Atlas | 10.5 ms / 17.6 ms | 8.3 ms / 8.8 ms | 95 → 120 |

  - **Library internals** (`node_modules/@nkzw/liquid-glass/lib/index.js`):
    - Each instance adds its own `mousemove` listener that calls `getBoundingClientRect()` (forced layout) and two `setState`s per event.
    - Each instance adds a `window` `resize` listener.
    - Each instance generates a displacement map with a per-pixel canvas loop plus `toDataURL()` per size.
  - A JS CPU profile of 120 mouse moves shows react-dom at 55–73 ms and liquid-glass JS at about 20 ms. The cost is therefore mostly GPU and compositing of the filters, not JS.
- **Impact:** Scrolling and hovering on the Dashboard and Planner miss frames even on a fast M-series GPU (p95 33 ms means visible stutter at 60 Hz). Low-end Android and older laptops will be much worse, and battery drain rises.
- **Suggested fix:**
  - Reserve liquid glass for a few hero surfaces (sidebar, modals). Use a plain CSS translucent style (`bg-white/60 backdrop-blur-sm`, or no blur) for list cards and buttons.
  - Pass a shared `mouseContainer` so one listener drives all panels, or disable mouse elasticity for static cards.
  - Honour `prefers-reduced-motion` and `prefers-reduced-transparency`.
  - Re-measure with the A/B script.
  - This conflicts with AGENTS.md §9.1, so update the design rule as well.
- **Effort:** M

### PERF-003 A render-blocking Tailwind CDN script compiles CSS at runtime in production
- **Severity:** Medium
- **Location:** `index.html:36` (`<script src="https://cdn.tailwindcss.com">`, plus the inline config at `:37`).
- **Evidence:**
  - The script is in `<head>` without `async` or `defer`, so it is parser-blocking. It is present in the production build.
  - Lighthouse measured 124 KB transfer (`cdn.tailwindcss.com/3.4.17`) and **282 ms script CPU on the login page, 298 ms on the Dashboard** (mobile profile).
  - The Play CDN also watches the DOM with a MutationObserver and generates CSS on the fly.
  - The app *also* ships the compiled Tailwind build: `index-*.css`, 260 KB raw / 33 KB gzip, produced by PostCSS (`postcss.config.js`, `tailwind.config.js`). Styles are generated twice.
- **Impact:** It adds a third-party round trip and roughly 0.3 s of main-thread work before first paint on mobile, plus continuous style recalculation as React mutates the DOM. The Play CDN is documented by Tailwind as not for production.
- **Suggested fix:** Delete the CDN script and the inline config. Move any config that exists only inline into `tailwind.config.js`. Check that no classes rely on runtime-only arbitrary values; the compiled CSS already covers the source files via `content`.
- **Effort:** S

### PERF-004 Heavy libraries load eagerly with routes that rarely need them
- **Severity:** Medium
- **Location:**
  - `components/PackingList.tsx:10` and `views/TripDetail*.tsx:71-72` (static `import { GoogleGenAI } from "@google/genai"`).
  - `views/Settings.tsx` and `views/TripDetail*.tsx` (static import of `FlightImportWizard`, which statically imports `xlsx` at `:2`).
  - `components/DeckFlightMap.tsx:93` (static import of `multiModalRouting`, which pulls in `searoute-js` and turf).
  - Recharts in the shared `TooltipContent` chunk.
- **Evidence** (chunk attribution from sourcemaps; sizes raw / gzip):

  | Chunk | Raw / gzip | Dominant content | Loaded when |
  |---|---|---|---|
  | `DailyPlannerBoard-*.js` | 402 KB / 82 KB | `@google/genai` (765 KB source) | Any trip page opens, even without a Gemini key |
  | `FlightImportWizard-*.js` | 377 KB / 123 KB | `xlsx` (875 KB source) | Settings or a trip page opens; the wizard is rarely used |
  | `multiModalRouting-*.js` | 543 KB / 83 KB | `searoute-js` network data + `@turf/*` | Every page that shows a map (Dashboard, Map, Trip, Road trips) |
  | `TooltipContent-*.js` | 330 KB / 98 KB | `recharts` (621 KB) + redux toolkit | Dashboard, Flights, Road trips |
- **Impact:** Each of these pages pays about 80–120 KB gzip of parse and compile for features most visits don't use. On the mobile profile that adds hundreds of ms per navigation.
- **Suggested fix:**
  - Use `await import('@google/genai')` inside the AI handlers.
  - `React.lazy` the `FlightImportWizard`, mounting it only when opened, and keep `xlsx` behind a dynamic import.
  - Dynamically import `maritimeRouting` and `searoute` only when a sea leg is drawn.
  - Lazy-load chart panels below the fold.
- **Effort:** S–M

### PERF-005 All 175 imported Phosphor icons ship in a 104 KB chunk loaded at startup
- **Severity:** Medium
- **Location:** `vite.config.ts` (`manualChunks` → `vendor-icons`), plus 175 distinct `@phosphor-icons/react` exports imported across the code, for example `components/ui/Icon.tsx:2-65`.
- **Evidence:** `vendor-icons-*.js` is 458 KB raw / **104 KB gzip** (557 KB of `@phosphor-icons/react` source) and is modulepreloaded by `index.html` (the build's preload list). Each Phosphor component embeds all 6 weights, but the app uses mostly `duotone` (`IconContext weight: 'duotone'` in `App.tsx`) plus `regular` for `Plus`.
- **Impact:** About 100 KB gzip is on the critical path of every first load, with most of the weight variants unused.
- **Suggested fix:**
  - Remove the `vendor-icons` manual chunk so icons split per route with their users.
  - Import per-weight SSR icons (`@phosphor-icons/react/dist/ssr/…`) or inline SVGs for the 2 weights actually used.
  - Lazy-route heavy icon users.
- **Effort:** M

### PERF-006 The service worker downloads 9.7 MB on first visit
- **Severity:** Medium
- **Location:** `vite.config.ts` (`VitePWA` → `workbox.globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,json}']`, `maximumFileSizeToCacheInBytes: 5 MB`, `includeAssets`).
- **Evidence:** I parsed the built `sw.js` precache manifest: **151 entries, 9.70 MB**. The largest entries:
  ```
  1631k vendor-deckgl  ·  1084k airportRunwayDataset  ·  593k app-icon-original.png
   543k multiModalRouting  ·  458k maplibre-gl-worker  ·  458k vendor-icons
   402k DailyPlannerBoard  ·  377k FlightImportWizard  ·  …
  ```
  `app-icon-original.png` (593 KB) is not referenced by any HTML, TS or JSON file in the repo (`grep` found no references), yet it is precached.
- **Impact:** Right after the first page load, every new visitor's browser downloads about 9.7 MB in the background. That competes with the app's own requests and costs mobile data, even for users who never open the import wizard, the runway layer or the map.
- **Suggested fix:**
  - Precache only the app shell (entry, CSS, icons used by the manifest).
  - Runtime-cache route chunks and data with `StaleWhileRevalidate` or `CacheFirst` on demand.
  - Exclude `app-icon-original.png` and other source artwork from `public/`.
- **Effort:** S

### PERF-007 Two ~170 KB icons load on every page
- **Severity:** Medium
- **Location:** `index.html:12-13,28` (`<link rel="icon" href="/app-icon.png">`, `<link rel="icon" type="image/svg+xml" href="/icon.svg">`, `<link rel="mask-icon" href="/icon.svg">`).
- **Evidence:**
  - Lighthouse network requests on both runs: `icon.svg` **171 KB**, `app-icon.png` **170 KB**. Together they are larger than the entry JS (130 KB gzip).
  - On disk: `public/icon.svg` is 232 KB (an "SVG" that is large because it embeds raster data), and `public/app-icon.png` and `public/app-icon-512.png` are 174 KB each.
- **Impact:** About 340 KB of every first visit goes to favicons. On the mobile profile this delays other requests on the same connection.
- **Suggested fix:**
  - Use a real vector SVG favicon (under 5 KB), or a 32 px PNG (under 2 KB), for `rel=icon`.
  - Keep the 192 and 512 px PNGs only in `manifest.json`, compressed (oxipng or pngquant to roughly 20–40 KB).
  - Drop the duplicate `rel=icon` entries.
- **Effort:** S

### PERF-008 One save triggers full refetches of every collection on screen, multiplied in bulk actions
- **Severity:** Medium
- **Location:**
  - `services/mockDb.ts:526-531` (every successful POST, PUT or DELETE dispatches `wandergrid_db_updated`).
  - `hooks/useWanderSync.ts:131-140` (every mounted query refetches with `force=true`, which bypasses the in-flight dedupe).
  - Listeners: `views/Dashboard.tsx:213-217` (`refreshData()`), `components/Sidebar.tsx:104`, `views/ExpeditionMapView.tsx:645`, `views/TravelAtlas.tsx:89`.
  - Bulk loops: `views/PlannerView.tsx:351` (`handleBulkArchive`: sequential `deleteTrip` per trip), `views/Flights.tsx:1505-1512`, `views/RoadTrips.tsx` (`handleBulkDelete`), `views/VacationPlanner.tsx:416-418`.
- **Evidence:**
  - The event carries no key for most mutations, so every listener refetches its *entire* collections: `GET /trips`, `/users`, and so on, all unpaginated (PERF-009).
  - **Planner:** archiving 20 selected trips issues 20 sequential `DELETE`s. Each fires the event, which re-requests Sidebar `getTrips` plus Planner `planner_trips` and `planner_users`. That is **20 writes + 60 full-collection GETs**.
  - **Dashboard:** the same flow re-runs `refreshData()` per mutation, which loads trips, flights, visited, users, entitlements and configs, then recomputes stats and geocoding.
- **Impact:** Bulk actions take seconds and transfer the whole dataset many times. The UI re-renders for each intermediate state. Server load scales with selection size times collection size.
- **Suggested fix:**
  - Batch bulk operations into one request (the `/bulk` endpoints exist for trips, flights and visited; add a bulk delete) and dispatch a single event at the end.
  - Include the collection key in the event so only affected queries refetch.
  - Debounce invalidations (for example, 100 ms) in `useWanderSync`.
- **Effort:** M

### PERF-009 Every page downloads whole collections; nothing is paginated or fetched by id
- **Severity:** Medium
- **Location:**
  - `backend_files/server.js:778-840` (`getResources`: supports `limit`, `offset`, `status` and `after`).
  - `services/mockDb.ts:1012-1060` (`getTrips` fetches `/trips` for all users, then filters by participant and privacy in the browser).
  - `views/TripDetail.tsx:619-627` (to show **one** trip it loads all trips, users, settings, entitlement types, configs and flights).
  - `dataService.getRoadTrips` and `getFlights` both fetch the full `/flights` table.
- **Evidence:**
  - `grep` finds no client call that passes `limit`, `offset`, `status` or `tripId` to any collection endpoint.
  - The `/api/trips/:id` route has no GET handler; only PUT and DELETE exist.
  - Trips are large JSONB documents (transports, stays, activities, packing lists, base64 avatars live in users).
- **Impact:** Payload and parse time grow linearly with the whole workspace's history, for every user, on every navigation and every refetch from PERF-008. Users also download other users' trips that are then filtered out client-side.
- **Suggested fix:**
  - Add `GET /api/trips/:id` and use it in TripDetail.
  - Filter by participant server-side.
  - Use `?status=` / `?after=` (already supported) for Planner buckets and Calendar ranges.
  - Paginate Flights and Atlas lists.
  - Return summary projections (`id`, `name`, `dates`, `status`) for list views.
- **Effort:** M

### PERF-010 Dashboard and Map geocode locations one at a time on first load
- **Severity:** Medium
- **Location:** `views/Dashboard.tsx:375-385` (`for (const trip of combinedState) for (const tr of trip.transports) … await resolveCoordsAsync(tr.origin) … await resolveCoordsAsync(tr.destination)`); similar loops at `views/Dashboard.tsx:412` and `views/ExpeditionMapView.tsx:421`.
- **Evidence:**
  - Each unresolved origin or destination awaits `getCoordinates()` before the next starts. That is a strict waterfall of `/api/geocode/search` calls, each allowed up to the 3 s timeout (AGENTS.md §2).
  - Results are cached in `localStorage` (`saveCoordCache`, `services/geocoding.ts` `wandergrid_geo_cache_v4`), so the cost recurs on every new browser or device, after cache clears, and after restores.
- **Impact:** With N uncached locations, the Dashboard's stats and map take about N × RTT (up to N × 3 s on failures) to settle. For a user with 50 trips, that can mean tens of seconds of incomplete dashboard on a new device.
- **Suggested fix:** Deduplicate location names, then resolve them in parallel with a small concurrency limit (for example, 4–6 via `Promise.allSettled` batches). Better still, persist coordinates onto the trip records server-side when trips are saved, so readers never geocode.
- **Effort:** S

### PERF-011 Restore inserts rows one at a time
- **Severity:** Low
- **Location:** `backend_files/server.js:2629-2846` (`/api/restore`: `for (const item of data.users) await client.query('INSERT …')`, and the same for trips at `:2714-2722`, flights at `:2752-2760`, visited at `:2771-2777`, and calendar tables at `:2787+`).
- **Evidence:** Each record is a separate round trip that also maintains a GIN index plus up to 4 expression indexes (PERF-012). The file already has a chunked multi-row `bulkUpsert` helper (`:845-868`, 500 rows per statement) that restore doesn't use.
- **Impact:** Restore time scales with record count times round-trip time. Combined with the client's 10 s timeout and retries (REL-004), large restores are more likely to time out and be re-sent.
- **Suggested fix:** Use `bulkUpsert` (or `COPY`) for each table inside the existing transaction.
- **Effort:** S

### PERF-012 Unused whole-document GIN indexes and duplicate indexes slow every write
- **Severity:** Low
- **Location:** `backend_files/server.js:361-365` (`CREATE INDEX … USING gin (data)` on trips, users, flights, events and configs); `:381-382` together with `:656` and `:709` (duplicate btree indexes on `global_airports(iata)` and `global_carriers(iata)`).
- **Evidence:**
  - No query uses `@>` or top-level `?`; `grep -cE "@>|jsonb_path"` gives 0.
  - The only JSONB containment-style predicate is `data->'participants' ? $1` (`:2023`), which a GIN index on `data` (default `jsonb_ops`) cannot serve, because it applies to a sub-path.
  - All other filters use `data->>'x' = $n`, which the existing expression btree indexes cover.
  - `idx_global_airports_iata` and `idx_airports_iata` index the same column, as do `idx_global_carriers_iata` and `idx_carriers_iata`.
- **Impact:** Every trip or flight save rewrites a full-document GIN entry for nothing (trips are the largest documents). The weekly airport and carrier refresh maintains two identical indexes. The calendar feed still sequential-scans trips.
- **Suggested fix:** Drop the five `gin (data)` indexes and the duplicate iata indexes. Add `CREATE INDEX … ON trips USING gin ((data->'participants'))` for the ICS query, or store participants in a column.
- **Effort:** S

### PERF-013 Autocomplete queries the database on every keystroke with a query that can't use indexes
- **Severity:** Low
- **Location:** `backend_files/server.js:1914-1940` (`/api/airports/search`), `:1967+` (`/api/carriers/search`).
- **Evidence:**
  - The query is `WHERE LOWER(iata) = LOWER($1) OR LOWER(iata) LIKE '%q%' OR LOWER(city_name) LIKE '%q%' OR LOWER(airport_name) LIKE '%q%'`. The leading-wildcard `LIKE` on `LOWER(col)` cannot use the btree indexes on `iata`, `city_name` or `airport_name`, so each keystroke is a full scan of `global_airports`.
  - That table has **9,528 rows** (the actual upstream `airport_data_full_processed.jsonl`) and carriers has 1,548.
  - The same data is already held in `memoryAirports` and `memoryCarriers`, which are used only as a fallback. AGENTS.md §1 requires RAM-served lookups.
- **Impact:** Each autocomplete keystroke costs a pool connection and a sequential scan. That is small at today's size, but avoidable load during typing bursts from several users.
- **Suggested fix:** Serve search from the in-memory maps first, with a prebuilt lowercase search array or prefix index, and keep the DB as the fallback. If DB search is kept, add a `pg_trgm` GIN index on the lowered columns.
- **Effort:** S

### PERF-014 The runway dataset ships as a 2.2 MB TypeScript module
- **Severity:** Low
- **Location:** `services/airportRunwayDataset.ts` (2,273,791 bytes, "Auto-generated … OurAirports"), lazy-loaded by `services/airportRunways.ts:18`.
- **Evidence:** It builds to `airportRunwayDataset-*.js`, 1,084 KB raw / 228 KB gzip, which must be parsed and compiled as JavaScript. It is also precached by the service worker (PERF-006).
- **Impact:** Enabling the runway layer costs about 1 MB of JS parse on the main thread. Every visitor downloads it in the background via the precache.
- **Suggested fix:** Ship it as a compact JSON, binary or PMTiles asset fetched on demand (with `JSON.parse` in a worker), and exclude it from the precache.
- **Effort:** S

---

## Unverified

- **Typing latency on Flights.** In the dev build with the demo dataset, keypress-to-next-frame in the Flights search box measured **34 ms median, 84 ms max** (19 keys, 1,495 DOM nodes). `views/Flights.tsx` is a single 4,460-line component with 61 `useState` hooks, so every keystroke re-renders it. I suspect this degrades with hundreds of flights, but couldn't confirm: the demo data has few flights, and dev React adds overhead.
- **Dashboard Lighthouse is a lower bound.** The `?demo=1` Lighthouse run had no API, so it rendered a shell (185 DOM nodes). Real Dashboard LCP with data is likely worse, given the map, charts and PERF-010.
- **Postgres timings.** I did not measure query latency, `EXPLAIN` plans, or the GIN write overhead in PERF-012 and PERF-013, because no Postgres was available. The conclusions follow from standard Postgres index semantics and the code.
- **DeckFlightMap layer rebuilds.** `components/DeckFlightMap.tsx` (4,433 lines) builds all deck.gl layers in one `useMemo` (`:1742`). If its dependency list includes hover state, every hover could rebuild every layer. Not profiled in detail.
- **Deployment image size.** Local `docker build` copies `public/airport-overlay.pmtiles` (208 MB, gitignored) into the image through the frontend build's `dist/`. CI builds from git, so it would lack the file. I didn't build the image to confirm its size.

---

## Coverage

**Covered**
- **Bundle:** build, per-chunk attribution, preload graph, manual chunks.
- **Assets:** `public/` sizes, favicons, fonts, the PWA precache.
- **Lighthouse:** login and Dashboard shell.
- **Runtime:** DOM size and glass-instance counts on 7 pages, A/B frame timing, a JS CPU profile, typing latency.
- **Client data fetching:** `useWanderSync`, `mockDb`, the event fan-out, geocoding loops.
- **Backend:** query shapes, indexes, pagination support, restore and bulk paths, and search.

**Not covered or limited**
- No real Postgres measurements.
- No production-build runtime profiling with data, since the production build has no localStorage fallback.
- No low-end device or CPU-throttled runtime runs beyond Lighthouse's simulation.
- No React Profiler commit analysis per component.
- The map rendering internals (WebGL layer cost) and network-tile behaviour were not profiled.

---

## Top 5

1. **PERF-001: the login page loads deck.gl and maplibre.** A `manualChunks` slip puts Vite's preload helper in that chunk, so the login page downloads 443 KB gzip of unused map code. Lighthouse mobile: performance 58, LCP 9.2 s, 954 KiB unused JS.
2. **PERF-002: liquid glass halves the frame rate.** On the Dashboard and Planner (40–48 glass instances, 60–72 SVG displacement filters), frames take 16.6–17.9 ms on average and up to 33 ms at p95, versus 8.3 ms with the filters disabled.
3. **PERF-003: the Tailwind Play CDN script runs in production.** It is render-blocking, transfers 124 KB, costs about 290 ms of CPU on mobile, and duplicates the compiled CSS.
4. **PERF-004 / PERF-005: heavy libraries on the critical path.** Gemini SDK, xlsx, searoute/turf and recharts load with routes that rarely need them (80–123 KB gzip each), and 104 KB gzip of Phosphor icons is preloaded at startup.
5. **PERF-008 / PERF-009: whole-collection fetching.** Nothing is paginated or fetched by id, and every mutation refetches every visible collection in full. Bulk actions multiply this (20 deletes become 60 full GETs).
