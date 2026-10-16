#!/usr/bin/env bash
# Download OSM data -> build airport-overlay.pmtiles -> replace the `assets` release asset.
#
# Env:
#   GH_TOKEN         required unless DRY_RUN=1; fine-grained PAT, repo contents read/write
#                    (add actions read/write too if TRIGGER_REBUILD=1)
#   GH_REPO          default SamerBerjawi/WanderGrid
#   INPUT_URLS       space-separated .osm.pbf URLs; default is the full planet
#   WORK_DIR         default /work (needs ~200 GB free for the planet)
#   KEEP_INPUT=1     keep downloaded .osm.pbf files after a successful build
#   TRIGGER_REBUILD=1  dispatch the app image build after uploading
#   DRY_RUN=1        build only; do not upload
#   SCHEDULE_DAYS    if set, stay running and rebuild every N days (for a Portainer stack with
#                    restart: unless-stopped). A restart does not trigger a rebuild until N days
#                    have passed since the last successful run.
set -euo pipefail

if [ -n "${SCHEDULE_DAYS:-}" ] && [ -z "${_IN_LOOP:-}" ]; then
  state="${WORK_DIR:-/work}/.last-success"
  mkdir -p "$(dirname "$state")"
  while true; do
    last=$(cat "$state" 2>/dev/null || echo 0)
    if [ $(( $(date +%s) - last )) -ge $(( SCHEDULE_DAYS * 86400 )) ]; then
      if _IN_LOOP=1 "$0"; then date +%s > "$state"; else echo "[$(date -u +%FT%TZ)] Run failed; will retry in 6 hours."; sleep 21600; continue; fi
    fi
    sleep 3600
  done
fi

GH_REPO="${GH_REPO:-SamerBerjawi/WanderGrid}"
WORK_DIR="${WORK_DIR:-/work}"
INPUT_URLS="${INPUT_URLS:-https://planet.openstreetmap.org/pbf/planet-latest.osm.pbf}"
MIN_BYTES="${MIN_BYTES:-100000000}"
export GH_REPO

mkdir -p "$WORK_DIR/downloads" "$WORK_DIR/tmp" "$WORK_DIR/out"
exec 9>"$WORK_DIR/.lock"
flock -n 9 || { echo "Another build is already running; exiting."; exit 1; }

log() { echo "[$(date -u +%FT%TZ)] $*"; }

if [ "${DRY_RUN:-0}" != "1" ] && [ -z "${GH_TOKEN:-}" ]; then
  echo "GH_TOKEN is required (or set DRY_RUN=1)." >&2; exit 2
fi

inputs=()
for url in $INPUT_URLS; do
  file="$WORK_DIR/downloads/$(basename "$url")"
  log "Downloading $url"
  curl -fL --retry 5 --retry-delay 30 -C - -o "$file.part" "$url"
  # Geofabrik and planet.openstreetmap.org both publish a sibling .md5 file.
  if expected=$(curl -fsL "$url.md5" | awk '{print $1}') && [ -n "$expected" ]; then
    actual=$(md5sum "$file.part" | awk '{print $1}')
    [ "$expected" = "$actual" ] || { echo "Checksum mismatch for $url" >&2; rm -f "$file.part"; exit 3; }
    log "Checksum OK for $(basename "$file")"
  else
    log "No .md5 published for $url; skipping checksum"
  fi
  mv "$file.part" "$file"
  inputs+=("--input=$file")
done

out="$WORK_DIR/out/airport-overlay.pmtiles"
rm -rf "$WORK_DIR/tmp"/* "$out"
log "Generating tiles"
cd /opt/builder
node generate-airport-overlay.js --temp-dir="$WORK_DIR/tmp" --output="$out" "${inputs[@]}"

size=$(stat -c %s "$out")
log "Built $out ($size bytes)"
[ "$size" -gt "$MIN_BYTES" ] || { echo "Output is suspiciously small (< $MIN_BYTES bytes); not publishing." >&2; exit 4; }
[ "$(head -c 7 "$out")" = "PMTiles" ] || { echo "Output is not a PMTiles file; not publishing." >&2; exit 4; }

rm -rf "$WORK_DIR/tmp"/*
[ "${KEEP_INPUT:-0}" = "1" ] || rm -f "$WORK_DIR"/downloads/*.osm.pbf

if [ "${DRY_RUN:-0}" = "1" ]; then
  log "DRY_RUN=1: skipping upload"; exit 0
fi

sha=$(sha256sum "$out" | awk '{print $1}')
log "Uploading to release 'assets' of $GH_REPO"
gh release upload assets "$out" --clobber
# The build workflow reads the first sha256:<64 hex> in these notes as a Docker cache-busting revision.
gh release edit assets --notes "Large static assets fetched by the Docker build (airport overlay vector tiles). Not an app release.

Built from OpenStreetMap ($INPUT_URLS) on $(date -u +%F) with AirTrail's generator ${AIRTRAIL_REF:-pinned}.
Revision: sha256:$sha"

if [ "${TRIGGER_REBUILD:-0}" = "1" ]; then
  log "Dispatching app image build"
  gh workflow run build-and-publish.yml --ref main -f run_e2e=false
fi
log "Done"
