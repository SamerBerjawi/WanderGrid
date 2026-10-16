#!/usr/bin/env bash
# OSM planet -> Protomaps basemap tiles (Planetiler, z0..MAXZOOM) -> three PMTiles files -> `map-data` release.
#
#   map-roads.pmtiles      layers: roads
#   map-landuse.pmtiles    layers: landuse, landcover, water, earth
#   map-places.pmtiles     layers: places, boundaries   (rail/ferry lines are inside the roads layer; the
#                          Protomaps `transit` layer is empty in the pinned version, so it is not shipped)
#
# Dropped on purpose: pois and buildings (large, not needed at overview zooms) and contributor metadata.
#
# Env:
#   GH_TOKEN         required unless DRY_RUN=1 (fine-grained PAT: Contents read/write on the repo)
#   GH_REPO          default SamerBerjawi/WanderGrid
#   PLANET_PBF       path to a local planet .osm.pbf (default /input/planet-latest.osm.pbf if it exists)
#   PLANET_URL       used to download when no local file exists
#   MAXZOOM          default 10. Lower it (9, 8) if a file would exceed GitHub's 2 GiB asset limit
#   NODEMAP_TYPE     Planetiler node-location map: sparsearray (default, good for extracts) or array (planet only)
#   LANDUSE_MAXZOOM  max zoom for the landuse file only, default 9 (it is by far the largest; must stay under 2 GiB)
#   JAVA_XMX         JVM heap, default 16g (the planet also needs ~10x its size in free disk)
#   KEEP_INPUT=1     keep a downloaded planet file afterwards (a mounted PLANET_PBF is never deleted)
#   DRY_RUN=1        build only; do not upload
set -euo pipefail

GH_REPO="${GH_REPO:-SamerBerjawi/WanderGrid}"
WORK_DIR="${WORK_DIR:-/work}"
MAXZOOM="${MAXZOOM:-10}"
LANDUSE_MAXZOOM="${LANDUSE_MAXZOOM:-9}"
JAVA_XMX="${JAVA_XMX:-16g}"
PLANET_URL="${PLANET_URL:-https://planet.openstreetmap.org/pbf/planet-latest.osm.pbf}"
MAX_ASSET_BYTES="${MAX_ASSET_BYTES:-2000000000}"
export GH_REPO

mkdir -p "$WORK_DIR/downloads" "$WORK_DIR/tmp" "$WORK_DIR/out" "$WORK_DIR/data/sources"
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

full="$WORK_DIR/out/full.pmtiles"
rm -rf "$WORK_DIR/tmp"/* "$WORK_DIR/out"/*.pmtiles

log "Running Planetiler (maxzoom=$MAXZOOM, heap=$JAVA_XMX)"
cd "$WORK_DIR"
java -Xmx"$JAVA_XMX" -jar /opt/protomaps-basemap.jar \
  --area=planet --osm-path="$pbf" --output="$full" --maxzoom="$MAXZOOM" \
  --download --force --tmpdir="$WORK_DIR/tmp" --nodemap-type="${NODEMAP_TYPE:-sparsearray}" --storage=mmap

[ -s "$full" ] || { echo "Planetiler produced no output." >&2; exit 4; }
log "Planetiler output: $(stat -c %s "$full") bytes"

split() { # <output-name> <max-zoom> <layer>...
  local name="$1" maxz="$2"; shift 2
  local args=()
  for l in "$@"; do args+=(-l "$l"); done
  log "Splitting $name (zoom 0-$maxz, layers: $*)"
  tile-join -f --no-tile-size-limit -z "$maxz" -o "$WORK_DIR/out/$name" "${args[@]}" "$full"
}
split map-roads.pmtiles "$MAXZOOM" roads
split map-landuse.pmtiles "$LANDUSE_MAXZOOM" landuse landcover water earth
split map-places.pmtiles "$MAXZOOM" places boundaries

files=(map-roads.pmtiles map-landuse.pmtiles map-places.pmtiles)
for f in "${files[@]}"; do
  p="$WORK_DIR/out/$f"; size=$(stat -c %s "$p")
  log "$f: $size bytes"
  [ "$size" -gt 100000 ] || { echo "$f is suspiciously small; not publishing." >&2; exit 4; }
  [ "$size" -lt "$MAX_ASSET_BYTES" ] || { echo "$f exceeds GitHub's 2 GiB asset limit; re-run with a lower MAXZOOM." >&2; exit 4; }
  [ "$(head -c 7 "$p")" = "PMTiles" ] || { echo "$f is not a PMTiles file." >&2; exit 4; }
done

rm -f "$full"; rm -rf "$WORK_DIR/tmp"/*
[ "$downloaded" = "0" ] || [ "${KEEP_INPUT:-0}" = "1" ] || rm -f "$pbf"

if [ "${DRY_RUN:-0}" = "1" ]; then log "DRY_RUN=1: skipping upload"; exit 0; fi

gh release view map-data >/dev/null 2>&1 || gh release create map-data --prerelease --title "Map data" \
  --notes "Planet-wide overview vector tiles built from OpenStreetMap on a NAS. Not an app release."
for f in "${files[@]}"; do
  log "Uploading $f"
  gh release upload map-data "$WORK_DIR/out/$f" --clobber
  # Notes are shared with the transport-data builder: replace only this asset's line.
  body=$(gh release view map-data --json body -q .body | grep -v "^$f:" || true)
  gh release edit map-data --notes "$body
$f: built $(date -u +%F), zoom 0-$MAXZOOM (landuse 0-$LANDUSE_MAXZOOM), sha256:$(sha256sum "$WORK_DIR/out/$f" | awk '{print $1}'). Protomaps basemaps ${BASEMAPS_REF:-pinned}; data © OpenStreetMap contributors (ODbL), Natural Earth, QRank."
done
log "Done"
