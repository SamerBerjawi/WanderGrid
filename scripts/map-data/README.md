# Map data builder (roads, land use & nature, transport & places)

Builds planet-wide overview tiles from OpenStreetMap and publishes three PMTiles files to the `map-data`
release of this repository:

| File | Layers |
| --- | --- |
| `map-roads.pmtiles` | roads (all road and path classes at overview zooms) |
| `map-landuse.pmtiles` | landuse, landcover, water, earth |
| `map-places.pmtiles` | places (names), boundaries |

Rail and ferry lines are in the `roads` layer (`kind=rail` / `kind=ferry`). For dedicated transit, ports and ferries use `../transport-data`. POIs and buildings are dropped, and so is contributor metadata (usernames, versions, timestamps).
Default zoom range is 0-10, small enough for GitHub's 2 GiB asset limit. If a file is too big the script stops
before uploading and asks for a lower `MAXZOOM`.

Pipeline: planet `.osm.pbf` -> Protomaps basemap profile on Planetiler -> `tile-join` splits the layers ->
`gh release upload`. Protomaps basemaps is BSD-3-Clause; the data is ODbL (© OpenStreetMap contributors).

## Requirements (planet scale)

Planetiler's guidance is roughly 0.5x the planet size in RAM and 10x in disk. This NAS has 24 GB RAM, so the
build runs the JVM with `-Xmx16g` and memory-mapped storage (`--storage=mmap`), trading speed for memory. Expect
it to be slow (many hours, possibly more than a day on a low-power CPU, and much slower if `WORK_HOST_DIR` is on
spinning disks). I could not test this on the NAS.

## Setup

1. Copy this folder to the NAS, e.g. `/volume1/docker/map-data`, then `cp .env.example .env` and add the token.
2. Build the image: `docker compose build`.
3. Test on a small extract first (set `PLANET_PBF` to a Geofabrik file you downloaded, e.g. Belgium):
   `PLANET_PBF=/input/belgium-latest.osm.pbf DRY_RUN=1 MAXZOOM=10 docker compose run --rm -T builder`
   (put the file in the folder mounted as `PLANET_DIR`).
4. Full run (detached): `nohup docker compose run --rm -T builder > work/first-run.log 2>&1 &`
5. Schedule quarterly (this sits on the 8th so it never overlaps the airport job on the 1st):
   `0 3 8 */3 * cd /volume1/docker/map-data && /usr/bin/docker compose run --rm -T builder >> work/last-run.log 2>&1`

A reused `PLANET_DIR/planet-latest.osm.pbf` is never deleted. Without it, the planet file is downloaded to
`work/downloads/` and removed afterwards unless `KEEP_INPUT=1`.
