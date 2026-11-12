# Operations

How to back up, restore, upgrade and roll back a WanderGrid install, written for the Docker Compose setup in this
repository. Commands run in the folder that holds `docker-compose.yml` and `.env`.

## What holds your data

- **PostgreSQL**, in the named volume `postgres_data`. This is the only thing that must survive. (`POSTGRES_DATA_DIR`
  in older copies of `.env.example` did nothing; the compose file uses a named volume.)
- Nothing else is stored by the app container. Jobs (backup, refresh) are in memory and are lost on restart; a
  restart during a backup just means starting it again.

## Backups: use two

1. **A database dump** (restores everything, including members' passwords). Turn on the nightly one:

   ```bash
   docker compose --profile backup up -d
   ```

   It writes `wandergrid-YYYYMMDD-HHMM.dump` into the `wandergrid_backups` volume every 24 hours and prunes dumps
   older than 14 days. Copy that volume off the machine (a NAS, cloud storage): a backup on the same disk is not a
   backup. For a one-off dump into the current folder:

   ```bash
   docker compose exec -T db pg_dump -U "${DB_USER:-wandergrid}" --format=custom "${DB_NAME:-wandergrid}" > wandergrid.dump
   ```

2. **The JSON backup** in Settings (Admin). It is portable between installs and versions, but it does **not** carry
   passwords: after restoring it every member signs in with a reset code that an Admin issues (Settings → Members).

## Restore a database dump

```bash
docker compose stop app
docker compose exec -T db dropdb -U "${DB_USER:-wandergrid}" --if-exists "${DB_NAME:-wandergrid}"
docker compose exec -T db createdb -U "${DB_USER:-wandergrid}" "${DB_NAME:-wandergrid}"
docker compose exec -T db pg_restore -U "${DB_USER:-wandergrid}" -d "${DB_NAME:-wandergrid}" < wandergrid.dump
docker compose start app
```

Try a restore on a spare machine once, before you need it.

## Upgrade and roll back

The image tag is `WANDERGRID_TAG` in `.env` (default `latest`). Pin a release tag for predictable upgrades.

```bash
docker compose pull && docker compose up -d
```

On start the app creates missing tables and applies any new numbered migration (`backend_files/migrations/`), each in
its own transaction. Take a dump first: **migrations only go forward**.

To roll back, put the previous tag in `.env`, restore the dump you took before the upgrade, then
`docker compose up -d`. Starting an older image on a database a newer one has migrated is not supported.

## Change the database password

`DB_PASSWORD` only takes effect when the database is first created. On an existing install, change it in both places:

```bash
docker compose exec db psql -U "${DB_USER:-wandergrid}" -c "ALTER USER ${DB_USER:-wandergrid} PASSWORD 'the-new-password'"
```

Then set `DB_PASSWORD=the-new-password` in `.env` and run `docker compose up -d`.

The database is not published to the host, so the default password is only reachable from inside the compose
network. Change it anyway on anything reachable from the internet.

## Public address behind a tunnel or proxy

Set `PUBLIC_URL` (for example `https://trips.example.com`) so calendar-feed and shared-trip links use your address
rather than the `Host` header the request arrived with, and `TRUST_PROXY=1` so rate limits count each visitor
separately (see the README).

## Members editing their own leave figures

A member can edit their own profile, including their leave allowance and taken days (the member sheet offers it).
Only an Admin can change a role. If you want leave figures to be Admin-only, that is a deliberate product change.
