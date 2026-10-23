# Changelog

All notable changes to WanderGrid are listed here, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow the tags in this repository
(v0.1 to v0.5, then 1.0.0).

## [1.1.0] - Unreleased

### Fixed

- **Hidden widgets only while editing.** The dashboard's list of hidden widgets shows only in Edit mode (phones
  included), animates in and out, and leaves nothing behind otherwise. Restoring a widget keeps keyboard focus
  in a sensible place.
- **"+N more" opens the rest.** On the member page's Passport, "+N more" is now a button that reveals the
  remaining stamps in place ("Show fewer" closes them). The same fix applies to the flight alerts, the flights
  offered to a trip and the Flights page's "Who flew" and airline breakdowns, where "+N more" was only text.

## [1.0.0] - Unreleased

The redesign release. Every page, dialog and message of the app was rebuilt in one new design language
(the "New" pages, specified in [UI_UX_DESIGN_REFERENCE.md](UI_UX_DESIGN_REFERENCE.md)), and the new
pages are the only interface. The original interface was removed before release; the git tag `classic-final`
holds the last commit that has it.

### Upgrading from 0.5

- **URLs.** The new pages answer at the original paths: `/` and `/dashboard`, `/planner` and `/trips`,
  `/trip/:id`, `/flights`, `/roadtrips`, `/map`, `/atlas`, `/calendar`, `/user/:id` and `/settings`. The
  preview URLs used during development (`/trips-new`, `/trip-new/:id` and so on) redirect to them, and old
  aliases such as `/flights-2` and `/planner-2` still resolve.
- **The old interface is gone.** Old `/classic/...` bookmarks redirect to the same page (for example
  `/classic/planner` opens `/planner`). There is no way back to the old pages in the app; see *Removed* below
  for what only they did.
- **Interface themes.** The Golden Hour and Departure Board themes were removed with the old interface. The
  pages offer Light, Dark and Auto. A stored theme value from the old picker is ignored (and left in the
  browser's storage).
- **Data.** No migration is needed. Two optional fields were added to stored records (a trip's `targetBudget`,
  and `originGeoKey` / `destGeoKey` on transports, which record which text a leg's coordinates belong to).
  Older records without them keep working.
- **Server.** Additive API changes only: `GET /api/settings` also returns where each key comes from
  (`keySources`), administrators can test a stored key on the server (`POST /api/integrations/test-key/:service`),
  and country holiday calendars are served through the backend (`GET /api/proxy/holidays/countries` and
  `/api/proxy/holidays/:year/:countryCode`, Nager.Date with OpenHolidays as a fallback). No existing route
  changed shape.
- **Requirements** are unchanged: Node 20, PostgreSQL 15, and `JWT_SECRET` set in production.

### Added

#### Interface themes and the map dock (between 0.5 and the redesign)
- Interface themes **Golden Hour** and **Departure Board**, with a theme QA pass over every page, a map dock
  for the view modes, and a Docker image published for every pull request. These themes now apply to the
  original interface under `/classic`.

#### Design system
- One design language for the whole app: Outfit typeface, a warm light theme and a derived warm dark theme,
  colour tokens (`rp-*`) with a fixed meaning (mustard planned, green confirmed, rust needs action, ink
  travelling now), compact filled stat tiles, and 44 px touch targets throughout.
- KokonutUI components ported to the app's tokens and icon set: Split Nav, Tool Dock, Swipe Tabs, Command
  Palette, Smooth Drawer, Hold Button, Particle Button, Undo Button, Switch Button, Momentum Rail, Throw Deck,
  Scroll Index, Morph Popover, Stack Panel, Flick Card, Metric Card, Spending Ring and Widget Grid. Charts use
  BklitUI.
- A new shell: a pill menu bar on tablets and desktops, a bottom tab bar with a quick-action button on phones,
  an account menu, a theme switch and a command palette.
- Three more accent colours for transport (sea, navy and plum), so each of the seven modes of transport has
  its own colour and icon. Ferry and Cruise now have different icons.
- Hugeicons everywhere, with a searchable icon finder (the whole free set, loaded only when used).

#### Sign-in (AuthNew)
- One card for sign in, register, first-run administrator setup and password reset, with a one-tap demo setup
  in local mode and a Particle Button submit.
- Deep links survive sign-in: open `/trip/abc` signed out, sign in, and you land on it.

#### Dashboard (DashboardNew)
- A bento of widgets you arrange yourself (lift by the grip or a long press, drag, resize, keyboard
  support), saved per user: up next, upcoming trips, travel stats, leave balance, a world map of where you
  have been, passport stamps, a "where next?" card deck from your wishlist, and year-over-year analytics
  (distance, nights and spend over time, with trips pinned as events).
- Layouts per screen size, an "Edit widgets" mode for phones, and a useful first-time view with no data.

#### Trips (TripsNew) and a single trip (TripNew)
- Trips as a board (columns or rows) or a list. Drag a card to change its status with Undo; drop zones for
  Archive and Delete (a Hold Button confirms). Sort, search, year filter, cancelled and archived views,
  duplicate trip, and capped lists with "Show all" and year grouping for long histories.
- A three-step New trip flow (Trip basics, Transport, Stays) with place search, an icon finder, leave type
  and allocations, privacy, and members.
- A trip page with a compact header (status colour, stops with their weather, total cost) and the trip's map
  beside it on a plain light or dark basemap, three filled stat tiles (days and nights booked, kilometres,
  stays and activities), and sections:
  - **Itinerary**, day by day, with logos and costs.
  - **Canvas**: the whole plan on one grid. Drag activities, legs and stays between days with Undo;
    overlapping stays sit side by side.
  - **Route planner**: a main journey of legs (own car, rental, train, bus, ferry, cruise) and day trips from
    any stop (Amsterdam to Delft and back). Each leg shows an estimated distance and time, each stop its
    nights and weather. Saving writes ordinary transports and stops.
  - **Bookings**, **Costs** (total, per person, per day, breakdown, and a target budget with a progress bar),
    **Gear** (packing list with progress) and **Notes**.
- Leg details in the editor: class, seat, exit row, terminals and gates, aircraft registration, vehicle,
  pick-up and drop-off, distance, website, notes, custom fields, and stops along a road leg (which also count
  as visited places).
- From and To on every leg are place searches tuned to the kind of transport (airports for flights, stations
  for trains and buses, ports for ferries), saving exact coordinates and keeping airport codes for flights.

#### Flights (FlightsNew) and Road trips (RoadTripsNew)
- A flight log as a table with a detail sheet, a boarding-pass card that flips, journey timelines that group
  flights automatically (connections, round trips), a seat map, and one hero card with every number.
- Find a flight by number and date (FlightStats, AeroDataBox, AviationStack and ADSBdb), live tracking within
  hours of departure with real progress, the route actually flown from the transponder track, flight alerts
  for flights leaving soon, and "next flight" on a trip.
- Filters (time, year, class, status, airline, airport, length, cost), grouping, large logs that stay fast,
  who flew when a trip has several members, and phone layouts.
- A three-step import wizard with column mapping, export, a calendar export and share, and spend and
  carbon-footprint figures shared with Road trips.
- Road trips is a sibling page for trains, buses, rentals, your own car, ferries and cruises, with real ferry
  lines from OpenStreetMap on its map; journeys added anywhere in a trip appear in both places.

#### Map (MapNew) and Atlas (AtlasNew)
- A full-screen map with a tool dock, flights, land and sea and scratch-map views, a globe with atmosphere
  and elevated route arcs, day and night shading, relief, basemap cards (light, dark, satellite and more),
  per-route detail sheets with airline logos, filters, and route colours by region or frequency. Animated
  routes move at one speed, so longer routes take longer.
- Place names are in proper case, and a place shows the weather where it is.
- An airport or place sheet draws a vertical Sankey of its routes: arrivals across the top, departures across
  the bottom, each as wide as the number of times you travelled it, with the top 8 per side and a "+N others"
  node. Hover, focus or tap a node to see the count or open the route; the routes list stays below.
- A travel atlas with a world map coloured by status (lived, visited, wishlist, layover), country and city
  lists as grids or rails, a scroll index, a wishlist deck with "Been there", a review drawer for merging
  duplicate places, and a country sheet that lists the trips, flights and road trips for it.

#### Calendar (CalendarNew)
- A month and a year view of leave, trips, public holidays, weekends and events, with a roving-focus
  keyboard grid, a day drawer on phones, a ring for leave by type, leave-type colours, and per-member filters.
- Leave editing with half days and allocations across types and years, a leave optimizer, country holiday
  calendars per year (with holidays you can switch off), trip calendar export and a subscribe link.

#### Calendar sync
- The subscribable feed and the app's own `.ics` files now list **individual events** instead of one block per
  trip: each flight (and, if you turn them on, train, bus and ferry legs) at its real time with booking details,
  a check-in and a check-out per stay (or one event for the stay), timed activities, and optionally your time off
  and public holidays. Times are written in UTC when the airport or place time zone is known and as floating
  local times otherwise, so your calendar never shifts them. Items keep a stable UID, so editing a flight updates
  its event, and the trip's version is the `SEQUENCE`.
- **What to sync** in Calendar > Options chooses what the feed holds and builds the link as you change it.
  Query parameters (one link, one choice): `trips`, `flights`, `transport`, `stays`, `activities`, `leave`,
  `holidays`, `planning` (each `0` or `1`), `stay=split|span`, `cost=1`, `reminders=1` with `remindFlight`,
  `remindStay` and `remindActivity` in minutes, and `private=full|busy|hide`. Without parameters the feed holds
  trips, flights and stays. Your choice is remembered per person (`GET`/`PUT /api/calendar/prefs`).
- The feed sends an `ETag` (so a poll that finds nothing new gets `304`), a refresh hint, and cancelled trips drop
  out of it. Semicolons in trip text are now escaped properly in the feed.

#### Members (MemberNew) and Settings (SettingsNew)
- A member page: passport-style overview with country stamps and flags, places split into countries and
  cities, leave by type, documents, and profile and account panels. Removing a member is a Hold Button.
- Settings as nested panels: Workspace (preferences, default basemaps, theme), Members, Integrations (keys
  masked, each testable on the server, with the source of each key shown), Gear (master packing list),
  Carriers, and Data (backup with merge or replace, restore, global data refresh with progress).

#### Messages, dialogs and loading
- Toasts as one ink pill with Undo, confirm dialogs (a Smooth Drawer on phones, a Hold Button for
  destructive actions), calm error screens, install and update banners, skeletons and popovers in the same
  language, on both the new pages and `/classic`. Existing code keeps calling `toast.*` and `confirmDialog`.
- Overlays trap focus, close on Escape, restore focus and respect reduced motion.

#### Weather
- A weather pill (open-meteo, no key, cached, silent on failure) at every route stop and day trip, on a
  trip's header and on a place on the map: the day's high and low within two weeks, otherwise right now.

### Changed

- The new pages are the default routes and the only shell; the Sidebar, Golden Hour and Departure Board
  shells are under `/classic`.
- Route logic moved from `App.tsx` into a tested `utils/routes.ts` (canonical paths, aliases, redirects and
  `/classic`), with a calm not-found screen instead of silently opening the Dashboard.
- Saving a trip no longer looks up every leg's coordinates again; legs remember the text their coordinates
  were found for and are looked up only when it changes. A picked airport is no longer replaced by a text
  lookup.
- Tab strips on phones keep their pill and the selected tab when they scroll.
- Removing a leg hands its price to another leg of the same booking.
- Numbers roll when they change (distances, counts and totals).

### Fixed

- **Scratch map filters.** Lived in no longer washes lived countries in a flat fill (they get their own
  colour), a Visited toggle joins the scratch filters, Layovers now finds layover-only countries (a connecting flight's next origin was
  counted as a stay) and hides them, and City pins Off removes every pin and route-end marker.
- Still maps (Flights, Road trips, trip header, dashboard World) draw the real road, rail and sea routes
  instead of straight lines once they are known.
- The scratch map is drawn with finer 10m borders when zoomed in, and the Night lights basemap stays sharp at
  high zoom (vector streets and labels over the lights, since the imagery ends at level 8).
- A production build failure caused by the 6 MB Hugeicons set being matched by the service worker's
  precache; it is now a separately named, runtime-cached chunk.
- Overlapping stays no longer draw on top of each other.
- Several merge regressions between the stacked redesign branches (a lost route-colour mode, import
  restorations and renumbered decision references).

- **Atlas: merging many duplicates no longer fails.** Merging 250+ duplicate records stopped halfway with
  "Too many requests" (one request per record, and four reloads per write). The merge is now planned once and
  applied in a few atomic steps with progress, Stop, Retry and Undo, the review list is grouped by country and
  paged, and the page reloads once at the end. New route `POST /api/visited/merge`.
- **Atlas: places with no name.** Unknown places are kept apart by their coordinates instead of being folded
  into one city. Open one to type a name or press **Find the name** (new `GET /api/proxy/reverse-geocode`);
  saving writes the name into the atlas and into every trip, stop and transport it came from, with Undo, and
  never changes coordinates. **Find names** does it for all unnamed places at once, after you review the
  proposals.

### Security

- The flight tracker no longer sends a masked API key, and integration keys are tested on the server so they
  never need to reach the browser in full. Keys are shown masked in Settings.

### Removed

- The original interface under `/classic` and its themes (Golden Hour, Departure Board), with the shell,
  the old pages, the liquid-glass components and the dependencies only they used (`recharts`, `leaflet`,
  `react-simple-maps`, `@google/genai`, `html2canvas` and others). Recover any file from the tag
  `classic-final`: `git show classic-final:<path>`.
- Features that existed only there (§5.5 of the design reference): the trip AI guide and AI flight analysis,
  flight import directly on a trip page, the full-screen cinematic map, the Departure Board view of flights,
  the old Dashboard widgets (achievements, cabin donut, top airports and airlines, earth-orbits hero), the
  Road trips hub tabs, per-trip edit buttons on the member page and the page-wide Save button in Settings.

### Known limitations

- **Testing.** The end-to-end specs for the original pages were deleted with them; only the route spec
  remains, so there are almost no end-to-end specs for the pages yet. The new features were exercised in local mode and against the
  real server on an in-memory database, not against a real PostgreSQL server.
- Live flight tracking, provider key tests and the holiday providers were not exercised against the live
  services during development.

## [0.5] - 2026-10-14

### Added
- Unified, ranked place search for cities, airports and stations, with a city registry that merges and cleans
  duplicate cities and a country registry for map matching and atlas analytics.
- Natural Earth country borders, aviation airport categories with filters and zoom-gated labels, an opacity
  slider for aviation dots, and a dedicated city size setting.
- Reliable road and rail tracing (multi-profile rail routing, throttled queue with retries, server-side route
  persistence) and a consistent Light / Dark basemap grouping with themes that follow the basemap.
- Build versioning shown in the sidebar (`v0.5-yymmdd.x`).

### Changed
- Reusable Tabs component, an accessible custom dropdown replacing native selects, a tabbed member page,
  and removal of the redundant Planner-2 view.
- Performance work: smaller initial bundle and precache, scoped refetches, atomic bulk deletes, in-memory
  search, and glass effects reserved for hero surfaces.

### Fixed
- Audit remediation across security and data integrity (single Tailwind source and Content-Security-Policy,
  session handling, and more), unintended logout during backup restore, and many map and routing fixes
  (road geometry, runways across basemaps, airport labels and dots).

## [0.4] - 2026-10-03

### Added
- Trip setup board for creating trips with transport legs, layovers, carrier detection, airline logos,
  stays and existing-booking suggestions, plus a daily planner board with half-day stay spans.
- Granular backup and restore with merge and replace modes; excursion grouping and route-managed transports;
  pit stops and waypoints for road trips.
- 3D globe horizon culling and a celestial atmosphere option; glass date and date-range pickers, custom
  dropdown portals and a refreshed form language.

### Changed
- Glass component set rolled out across forms, drawers (with focus trapping) and transport forms; Ferry and
  Cruise combined into one transport component.

### Fixed
- Several broken imports after the glass migration and bundling regressions.

## [0.3] - 2026-08-20

### Changed
- Tailwind moved from the CDN to a compiled PostCSS build; response compression and cache headers; debounced
  cache persistence; lazy loading for the flight import wizard, spreadsheet library and runway dataset;
  throttled map animation and parallelised geographic data fetches.

### Fixed
- Stabilised the data-sync hook and de-duplicated in-flight requests.

## [0.2] - 2026-08-19

### Added
- A Deck.gl GPU map engine with multi-source tiles, basemap customisation (solar, weather, airport
  runways), heatmap density by frequency, and 100% reset and fit-to-bounds controls.
- Multi-modal routing for road and rail (OSRM and BRouter), a route-corridor intelligence service, and a
  route-flights cache.
- A vacation calendar, a road trips module, a Travel Atlas view with a visited-locations API, PWA support and
  better session management.
- Database pre-population, database tuning and a refactored backend.

## [0.1] - 2026-05-29

First tagged version of the self-hosted travel planner, flight log and leave manager.

### Added
- Trips with flights, stays and activities; flight bundling, multi-select and filtering; sorting.
- PostgreSQL storage with retrying start-up, local-to-server migration, a flights table, health check and
  seeded administrator; authentication; a connection-mode indicator.
- Carrier management and global airport and carrier data; live flight tracking; flight and trip export to
  calendars and calendar sync.
- Route and transport management, road trip waypoints, a 3D expedition map with cinematic mode and timezone
  slider, a packing list with AI help, and member profiles.
- Docker and Docker Compose deployment (configurable for NAS), Node 20, lazy-loaded views.
