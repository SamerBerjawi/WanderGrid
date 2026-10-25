# WanderGrid

**A self-hosted travel planner, flight log and leave manager.**

WanderGrid keeps your trips, flights, road trips, places and time off in one private app that you run yourself. Plan a trip day by day, log every flight, scratch off the countries you have been to, and see how your leave lines up with all of it.

![Dashboard](docs/screenshots/dashboard.png)

> WanderGrid is highly inspired by [AirTrail](https://github.com/johanohly/AirTrail). It is not a fork, but AirTrail was a great starting point for the architecture and for the map and flight route visualization.

## What it does

### Plan trips
- **Trips board**: columns or a list, with status, search, year filters and drag-and-drop. Archive instead of delete.
- **A trip page** with a map, stat tiles and sections for the **Itinerary** (day by day), **Canvas** (the whole plan on one draggable grid), **Route planner** (cars, trains, buses, ferries, day trips), **Bookings**, **Costs** (with a target budget), **Gear** (packing list) and **Notes**.
- **Weather** at every stop, from Open-Meteo (no key needed).
- A three-step **New trip** flow: basics, transport, stays.

![A trip](docs/screenshots/trip.png)

### Log flights and road trips
- A **flight log** with a detail sheet, boarding-pass card, seat map, and journeys grouped automatically (connections, round trips).
- **Find a flight** by number and date, track it live near departure, and see the route actually flown.
- **Import** from CSV/JSON with column mapping, export, and statistics on distance, time in the air, airlines, airports, cost and CO₂.
- **Road trips** for trains, buses, rentals, your own car, ferries and cruises, with real road, rail and sea routes.

![Flights](docs/screenshots/flights.png)

### Explore the map and your atlas
- A full-screen **map** with flights, land and sea routes and a scratch-map view, a 3D globe, day and night shading and several basemaps.
- A **travel atlas** that colours the world by lived, visited, wishlist and layover, with country and city lists, a wishlist deck and a tool to merge duplicate places.

![Map](docs/screenshots/map.png)
![Atlas](docs/screenshots/atlas.png)

### Manage leave and calendars
- Leave types with allowances, carry-over and half days, a leave optimizer, and per-member views.
- Public holidays for a country calendar of your choice (Nager.Date, with OpenHolidays as a fallback).
- **Calendar sync**: subscribe to a private `.ics` link from any calendar app. Calendar › Options › *What to sync* chooses trips, flights, transport, stays, activities, time off and holidays. The link is a per-person secret that you can replace at any time; anyone holding it can read what it syncs. Behind a reverse proxy, set `PUBLIC_URL` so the links back to each trip use your public address.

### Dashboard, members and settings
- A **dashboard** of widgets you arrange yourself (up next, upcoming trips, stats, leave balance, world map, passport stamps, "where next?" deck, year-over-year analytics), with a layout saved per user and per screen size.
- **Member pages** with a passport of country stamps, leave by type and documents. Several people can share a workspace and a trip.
- **Settings** for workspace preferences, members, integrations (keys are masked and testable), packing gear, carriers, and backup and restore.
- Light and dark themes, a command palette, phone layouts with a bottom tab bar, and an installable PWA.

![Dashboard, dark theme](docs/screenshots/dashboard-dark.png)

## Getting started

### Try it with no backend

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. `npm run dev` runs in **local mode** (a "Local mode" badge is shown): everything is stored in your browser, and no server or database is needed. Choose *Auto-setup & demo run* on the sign-in page for sample data.

> `npm start` does not exist; use `npm run dev`.

### Self-host with Docker

1. Download `docker-compose.yml` and `.env.example` from this repository and save the second as `.env`.
2. Set `JWT_SECRET` in `.env` to a random string (for example `openssl rand -hex 32`). In production the server refuses to start with the default key.
3. Start it:

   ```bash
   docker compose pull && docker compose up -d
   ```

   The image is published to the GitHub Container Registry by the workflow in `.github/workflows/build-and-publish.yml`. To build it yourself instead, run `docker compose up -d --build` from a clone of this repository.

The app listens on port **4921** by default (`APP_PORT` changes it). On first start it creates the PostgreSQL schema, and the first account you register becomes the administrator. Other settings are listed in `.env.example`.

### Develop against the API

Put `VITE_LOCAL_MODE=false` in `.env.development.local` and run the backend on a different port from Vite:

```bash
cd backend_files && npm install
PORT=3001 DATABASE_URL=postgres://wandergrid:wandergrid_password@localhost:5432/wandergrid node server.js
```

No PostgreSQL? `node test/helpers/devServer.js` runs the real server on port 3001 against an in-memory database; data is lost on exit.

Checks: `npx tsc --noEmit`, `npm run lint:tokens`, `npm test` (frontend, Vitest) and `cd backend_files && npm test`. Read [AGENTS.md](AGENTS.md), [Design.md](Design.md) and [UI_UX_DESIGN_REFERENCE.md](UI_UX_DESIGN_REFERENCE.md) before changing the UI.

## Integrations

Everything external goes through the backend, with timeouts and caching. Most keys are optional and are set in **Settings › Integrations**, or with `INTEGRATIONS_*` environment variables.

| Purpose | Services |
| --- | --- |
| Geocoding | Open-Meteo, Photon, Nominatim |
| Routing | OSRM and Valhalla (road), OpenRailRouting (rail), searoute (sea) |
| Flights | FlightStats, AeroDataBox, AviationStack, ADSBdb, adsb.lol, OpenSky |
| Maps | OpenFreeMap, OpenStreetMap, Esri, NASA GIBS, AWS Terrarium, OpenAIP |
| Holidays | Nager.Date, OpenHolidays |
| Weather | Open-Meteo, RainViewer |
| Logos | Brandfetch |

There is no AI feature.

## Tech stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, MapLibre GL and deck.gl, visx charts, installable as a PWA.
- **Backend**: Node 20, Express, PostgreSQL 15.
- **Auth**: JWT sessions, with PBKDF2 password hashing and rate limiting.

## More

- [CHANGELOG.md](CHANGELOG.md): what changed in each release.
- [CLAUDE.md](CLAUDE.md): a map of the code, commands and conventions.

---

*Private. Powerful. Yours.*
