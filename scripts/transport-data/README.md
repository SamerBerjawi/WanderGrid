# Transit, ports and ferries tile builder

Builds `transit-ports-ferries.pmtiles` from the OpenStreetMap planet and publishes it to the `map-data` release.
Layers: `rail` (lines, minus yards/sidings), `stations` (stations, halts, tram stops, subway entrances,
ferry terminals), `ferries` (ways tagged `route=ferry`), `ports` (`landuse=port`, `industrial=port`, `harbour=yes`).
Ferry routes that exist only as relations are not included. Zoom 0-12.

Pipeline: `osmium tags-filter` (one planet pass) -> split per layer -> `osmium export` -> `tippecanoe`.
This is much lighter than the Protomaps builder (`../map-data`); expect on the order of an hour or two, plus
the download if the planet file is not already local. (I could not test it on the NAS.)

## Setup

1. Copy this folder to the NAS (e.g. `/volume1/docker/transport-data`), `cp .env.example .env`, add the token.
2. `docker compose build`
3. Small test first (put a Geofabrik extract in the folder mounted as `PLANET_DIR`):
   `PLANET_PBF=/input/belgium-latest.osm.pbf DRY_RUN=1 docker compose run --rm -T builder`
4. Full run: `nohup docker compose run --rm -T builder > work/first-run.log 2>&1 &`
5. Monthly, on the 15th (clear of the airport job on the 1st and the map-data job on the 8th):
   `0 2 15 * * cd /volume1/docker/transport-data && /usr/bin/docker compose run --rm -T builder >> work/last-run.log 2>&1`

Without a mounted planet file the script downloads a fresh one each run and deletes it afterwards.
