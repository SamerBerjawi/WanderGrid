# Airport overlay tile builder

Builds `airport-overlay.pmtiles` (runways, taxiways, terminals, gates, ...) straight from OpenStreetMap and
publishes it to the `assets` release of this repository. The app's Docker image downloads that asset at build
time (`backend_files/Dockerfile`), so the production map gets the full airport detail.

Pipeline: OSM planet -> `osmium tags-filter` -> `osmium export` -> AirTrail's `generate-airport-overlay.js`
(normalises into the `airport`, `airport_labels`, `airport_nodes`, `aerodrome` layers the style in
`services/airportOverlayStyle.ts` expects) -> `tippecanoe` (zoom 9-14).

**Licence:** the generator is AirTrail's, GPL-3.0. The image clones it at the pinned `AIRTRAIL_REF` and runs it
unmodified; it is not copied into this repo. If you bump the ref, check that the layer schema is unchanged.

## Setup (NAS)

1. Copy this folder to the NAS (or clone the repo there). Create a fine-grained GitHub token for this repo only
   (Contents: read/write; Actions: read/write if `TRIGGER_REBUILD=1`) and save it in `.env` (see `.env.example`).
2. Point `WORK_HOST_DIR` at a share with ~200 GB free (planet download ~75 GB plus temporary files).
3. First run, small and safe, to validate the setup without uploading anything:

   ```bash
   docker compose build
   INPUT_URLS=https://download.geofabrik.de/europe/luxembourg-latest.osm.pbf DRY_RUN=1 docker compose run --rm builder
   ```

4. Full planet build and publish (expect many hours on a low-power NAS CPU):

   ```bash
   docker compose run --rm builder
   ```

5. Schedule it monthly, for example in the NAS crontab:

   ```
   0 2 1 * * cd /path/to/airport-overlay && docker compose run --rm builder >> work/last-run.log 2>&1
   ```

   Airport layouts change slowly, so weekly would mostly rebuild identical data.

A lock file prevents overlapping runs. The script refuses to publish an output smaller than `MIN_BYTES`
(default 100 MB) or that is not a PMTiles file, so a failed run never replaces the live asset.
