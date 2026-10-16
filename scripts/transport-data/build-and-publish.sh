#!/usr/bin/env bash
# OSM planet -> osmium filter -> per-layer GeoJSONSeq -> tippecanoe -> `map-data` release.
#
# Output: transit-ports-ferries.pmtiles with layers
#   rail      railway lines (rail, light_rail, subway, tram, narrow_gauge, funicular, monorail), minus yards/sidings
#   stations  railway stations/halts/tram stops/subway entrances, public_transport stations, ferry terminals
#   ferries   ways tagged route=ferry (ferry routes mapped only as relations are not included)
#   ports     landuse=port, industrial=port, harbour=yes
#
# Env: GH_TOKEN (required unless DRY_RUN=1), GH_REPO, PLANET_PBF / /input/planet-latest.osm.pbf, PLANET_URL,
#      MAXZOOM (default 12), KEEP_INPUT=1, DRY_RUN=1
set -euo pipefail

GH_REPO="${GH_REPO:-SamerBerjawi/WanderGrid}"
WORK_DIR="${WORK_DIR:-/work}"
MAXZOOM="${MAXZOOM:-12}"
PLANET_URL="${PLANET_URL:-https://planet.openstreetmap.org/pbf/planet-latest.osm.pbf}"
ASSET="transit-ports-ferries.pmtiles"
MAX_ASSET_BYTES="${MAX_ASSET_BYTES:-2000000000}"
export GH_REPO

mkdir -p "$WORK_DIR/downloads" "$WORK_DIR/tmp" "$WORK_DIR/out"
exec 9>"$WORK_DIR/.lock"
flock -n 9 || { echo "Another build is already running; exiting."; exit 1; }
log() { echo "[$(date -u +%FT%TZ)] $*"; }

if [ "${DRY_RUN:-0}" != "1" ] && [ -z "${GH_TOKEN:-}" ]; then echo "GH_TOKEN is required (or DRY_RUN=1)." >&2; exit 2; fi

downloaded=0
pbf="${PLANET_PBF:-}"
if [ -z "$pbf" ] && [ -s /input/planet-latest.osm.pbf ]; then pbf=/input/planet-latest.osm.pbf; fi
if [ -n "$pbf" ]; then
  [ -s "$pbf" ] || { echo "PLANET_PBF $pbf not found or empty." >&2; exit 2; }
  log "Using local OSM file $pbf"
else
  pbf="$WORK_DIR/downloads/$(basename "$PLANET_URL")"
  log "Downloading $PLANET_URL"
  curl -fL --retry 5 --retry-delay 30 -C - -o "$pbf.part" "$PLANET_URL"
  if expected=$(curl -fsL "$PLANET_URL.md5" | awk '{print $1}') && [ -n "$expected" ]; then
    [ "$expected" = "$(md5sum "$pbf.part" | awk '{print $1}')" ] || { echo "Checksum mismatch" >&2; rm -f "$pbf.part"; exit 3; }
    log "Checksum OK"
  fi
  mv "$pbf.part" "$pbf"; downloaded=1
fi

T="$WORK_DIR/tmp"; rm -rf "$T"/*; rm -f "$WORK_DIR/out"/*.pmtiles

log "Filtering the planet (single pass)"
osmium tags-filter -O -o "$T/all.osm.pbf" "$pbf" \
  w/railway=rail,light_rail,subway,tram,narrow_gauge,funicular,monorail \
  nwr/railway=station,halt,tram_stop,subway_entrance \
  nwr/public_transport=station \
  nwr/amenity=ferry_terminal \
  w/route=ferry \
  nwr/landuse=port nwr/industrial=port nwr/harbour=yes

# Split the (small) filtered file into one file per layer, then export each as newline-delimited GeoJSON.
export_layer() { # <layer> <osmium-invert-expr|-> <filter>...
  local layer="$1" invert="$2"; shift 2
  log "Exporting layer $layer"
  osmium tags-filter -O -o "$T/$layer.pbf" "$T/all.osm.pbf" "$@"
  local src="$T/$layer.pbf"
  if [ "$invert" != "-" ]; then
    osmium tags-filter -O -i -o "$T/$layer.clean.pbf" "$src" "$invert"
    src="$T/$layer.clean.pbf"
  fi
  osmium export -O -f geojsonseq -x print_record_separator=false -a type,id -o "$T/$layer.geojsonl" "$src"
}
export_layer rail     'w/service=yard,siding,spur,crossover' w/railway=rail,light_rail,subway,tram,narrow_gauge,funicular,monorail
export_layer stations -  nwr/railway=station,halt,tram_stop,subway_entrance nwr/public_transport=station nwr/amenity=ferry_terminal
export_layer ferries  -  w/route=ferry
export_layer ports    -  nwr/landuse=port nwr/industrial=port nwr/harbour=yes

out="$WORK_DIR/out/$ASSET"
log "Packaging with tippecanoe (zoom 0-$MAXZOOM)"
tippecanoe --force -o "$out" -Z0 -z"$MAXZOOM" -P --temporary-directory "$T" \
  --drop-densest-as-needed --extend-zooms-if-still-dropping --no-tile-size-limit --no-feature-limit \
  -y name -y name:en -y railway -y route -y usage -y service -y operator -y network -y ref -y electrified \
  -y gauge -y public_transport -y station -y amenity -y landuse -y industrial -y harbour -y ferry \
  -L rail:"$T/rail.geojsonl" -L stations:"$T/stations.geojsonl" \
  -L ferries:"$T/ferries.geojsonl" -L ports:"$T/ports.geojsonl"

size=$(stat -c %s "$out"); log "Built $ASSET ($size bytes)"
[ "$size" -gt 1000000 ] || { echo "Output is suspiciously small; not publishing." >&2; exit 4; }
[ "$size" -lt "$MAX_ASSET_BYTES" ] || { echo "Output exceeds GitHub's 2 GiB asset limit; re-run with a lower MAXZOOM." >&2; exit 4; }
[ "$(head -c 7 "$out")" = "PMTiles" ] || { echo "Output is not a PMTiles file." >&2; exit 4; }

rm -rf "$T"/*
[ "$downloaded" = "0" ] || [ "${KEEP_INPUT:-0}" = "1" ] || rm -f "$pbf"

if [ "${DRY_RUN:-0}" = "1" ]; then log "DRY_RUN=1: skipping upload"; exit 0; fi

gh release view map-data >/dev/null 2>&1 || gh release create map-data --prerelease --title "Map data" \
  --notes "Planet-wide map tiles built from OpenStreetMap on a NAS. Not an app release."
gh release upload map-data "$out" --clobber

# Notes are shared with the other builder: replace only this asset's line.
body=$(gh release view map-data --json body -q .body | grep -v "^$ASSET:" || true)
gh release edit map-data --notes "$body
$ASSET: built $(date -u +%F), layers rail/stations/ferries/ports, zoom 0-$MAXZOOM, sha256:$(sha256sum "$out" | awk '{print $1}'). Data © OpenStreetMap contributors (ODbL)."
log "Done"
