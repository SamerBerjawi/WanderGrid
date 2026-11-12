# Smoke test before a real deploy

What has never been run: a real PostgreSQL server, the Docker image, and the live upstream services. The suites
(unit, API on in-memory Postgres, Playwright on in-memory Postgres) all pass, so this list covers only the gap.
Do it on a spare machine or a throwaway compose project, not on the family instance. About 30 minutes.

Stop at the first failure and keep the logs (`docker compose logs app db`).

## 0. Before you start

- [ ] Take a dump of the real database (`docs/OPERATIONS.md`, "Backups"). Migrations only go forward.
- [ ] Use a copy of that dump for step 3 if you can: it is the best test of the migrations.
- [ ] `.env` has a real `JWT_SECRET` (`openssl rand -hex 32`). `PUBLIC_URL` and `TRUST_PROXY=1` match how you reach it.

## 1. The image builds and starts

- [ ] `docker compose build` finishes (the Dockerfile now ends with `USER node`).
- [ ] `docker compose up -d`: `docker compose ps` shows `app` and `db` healthy within a minute.
- [ ] `docker compose logs app` shows "Database schema initialized successfully!" and "Applied 3 migration(s)" on a
      fresh database, with no stack traces.
- [ ] `docker compose exec app id` reports the `node` user, not root.
- [ ] `curl -s localhost:4921/api/health` answers `ok`.
- [ ] `docker compose exec db psql -U wandergrid -c '\dt'` lists users, trips, events, entitlements, configs, flights,
      visited, settings, schema_migrations and the global/cache tables.

## 2. A fresh install

- [ ] Open the app. The first screen is the first-run setup. Create the admin.
- [ ] Sign out. Signing in again works. Open a private window: **there is no Sign up option** (sign-up is closed
      once an admin exists) and no demo button.
- [ ] Settings → Members: add a second member. Sign in as them in the private window.
- [ ] As the second member, create a trip, then reload. It is still there (this proves writes reach Postgres).
- [ ] As the admin, the second member's private trip is visible; as a third member it is not.
- [ ] Restart the app container (`docker compose restart app`). You are still signed in and the data is intact.

## 3. Migrations on a copy of real data

- [ ] Restore your dump into the spare database (`docs/OPERATIONS.md`, "Restore a database dump").
- [ ] Start the new image. The log lists 0001, 0002 and 0003 as applied, once. A second restart applies nothing.
- [ ] In `psql`, `SELECT id FROM schema_migrations ORDER BY id;` shows the three.
- [ ] Open a trip that has several people: the same people are listed as before (0003 swaps emails for user ids).
- [ ] Open Flights: every leg still appears (0002 gave legs without a mode the mode Flight).
- [ ] Open Trips: nothing disappeared into the wrong column (0001 added `kind`: trip, time off or bundle).

## 4. Behind the tunnel

- [ ] Through the Cloudflare Tunnel address, reload the dashboard 25 times quickly. You are not locked out of
      sign-in (the rate limit counts per visitor because `TRUST_PROXY=1`).
- [ ] Enter a wrong password 11 times for one account: that account backs off, and other members can still sign in.
- [ ] Settings → Calendar: copy the feed link. It starts with your `PUBLIC_URL`. Open it in a private window: it
      downloads an `.ics` file without signing in.

## 5. The pages, with live upstream services

- [ ] Dashboard, Trips, Flights, Road trips, Calendar, Atlas, Map and Settings open with no error page.
- [ ] Mine / Everyone on Dashboard, Flights and Atlas changes the numbers, and your choice survives a reload.
- [ ] Map: the map draws, with the flight arcs, and the console shows no "shadertools" error.
- [ ] Add a road trip leg: a route is drawn (the road proxy reaches OSRM or Valhalla). Add a rail leg: same.
- [ ] Trip → add a place by name: the geocoder suggests results.
- [ ] Flights → New flight → look up a real flight number and date: a result comes back.
- [ ] Calendar → Holidays → add a country calendar: holidays appear.
- [ ] Choose an icon on a trip, save, reload: the icon is shown. (It is saved with the trip, so this page should not
      download the large icon file; check the Network tab for `hugeicons-all`.)
- [ ] Settings → Integrations → test a key you use. A bad key gives a clear message, not a spinner.

## 6. Backup and restore

- [ ] `docker compose --profile backup up -d`, then `docker compose exec db_backup ls /backups`: a `.dump` file is
      there within a minute.
- [ ] Restore that dump into a second empty database and open the app on it. Everything is there.
- [ ] Settings → Backup (admin): run the JSON backup. It finishes (the job status polls) and downloads.

## 7. Upgrade and roll back

- [ ] With data in place, `docker compose pull && docker compose up -d` (or rebuild). Nothing is lost.
- [ ] Put the previous image tag in `.env`, restore the dump from step 0, `docker compose up -d`. The old version
      runs. (Do not start an old image on a migrated database.)

## If something fails

Note the step, the log lines and whether it happens on a copy of real data or only on a fresh install, and open an
issue. A failed migration stops startup and is rolled back, so the data is left as it was.
