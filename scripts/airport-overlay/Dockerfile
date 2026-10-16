# Builds airport-overlay.pmtiles from OpenStreetMap and publishes it to the `assets` GitHub release.
# Runs on a NAS (see README.md). AirTrail's GPL-3.0 generator is fetched at a pinned commit at image
# build time and run unmodified; it is deliberately not vendored into this repository.
FROM node:20-bookworm

ARG TIPPECANOE_REF=2.79.0
ARG AIRTRAIL_REF=a34046640607ee72e1f9aed5538f84091b035246

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl git ca-certificates build-essential pkg-config \
      libsqlite3-dev zlib1g-dev osmium-tool util-linux \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update && apt-get install -y --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/*

RUN git clone --depth=1 --branch "$TIPPECANOE_REF" https://github.com/felt/tippecanoe.git /tmp/tippecanoe \
 && make -C /tmp/tippecanoe -j"$(nproc)" && make -C /tmp/tippecanoe install && rm -rf /tmp/tippecanoe

WORKDIR /opt/builder
RUN git clone https://github.com/johanohly/AirTrail.git /tmp/airtrail \
 && git -C /tmp/airtrail checkout "$AIRTRAIL_REF" \
 && cp /tmp/airtrail/scripts/data/generate-airport-overlay.js ./generate-airport-overlay.js \
 && cp /tmp/airtrail/LICENSE ./AIRTRAIL-LICENSE \
 && rm -rf /tmp/airtrail \
 && printf '{"name":"airport-overlay-builder","private":true,"type":"module","dependencies":{"@turf/turf":"7.3.4"}}\n' > package.json \
 && npm install --no-audit --no-fund

COPY build-and-publish.sh /usr/local/bin/build-and-publish
RUN chmod +x /usr/local/bin/build-and-publish

ENV NODE_OPTIONS=--max-old-space-size=8192 AIRTRAIL_REF=$AIRTRAIL_REF
VOLUME /work
CMD ["build-and-publish"]
