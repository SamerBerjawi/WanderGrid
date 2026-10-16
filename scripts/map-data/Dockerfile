# Builds planet-wide overview vector tiles (roads, land use/nature, transport/places) from OpenStreetMap
# with the Protomaps basemap profile (Planetiler), splits them into three PMTiles files with tippecanoe's
# tile-join, and publishes them to the `map-data` GitHub release. Runs on a NAS (see README.md).
# Protomaps basemaps: BSD-3-Clause code. OSM data: ODbL. Other sources it downloads: Natural Earth (public
# domain), osmdata.openstreetmap.de land/water polygons (ODbL), Protomaps daylight landcover, QRank (CC0).
ARG BASEMAPS_REF=42ffaaa4a85a41bfcb23e43cc0f5b492a5eca123

FROM maven:3-eclipse-temurin-22 AS jar
ARG BASEMAPS_REF
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN git clone https://github.com/protomaps/basemaps.git /src && git -C /src checkout "$BASEMAPS_REF"
WORKDIR /src/tiles
RUN mvn -q clean package -DskipTests

FROM eclipse-temurin:22-jre
ARG TIPPECANOE_REF=2.79.0
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl git ca-certificates build-essential pkg-config \
      libsqlite3-dev zlib1g-dev util-linux \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update && apt-get install -y --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/*

RUN git clone --depth=1 --branch "$TIPPECANOE_REF" https://github.com/felt/tippecanoe.git /tmp/tippecanoe \
 && make -C /tmp/tippecanoe -j"$(nproc)" && make -C /tmp/tippecanoe install && rm -rf /tmp/tippecanoe

COPY --from=jar /src/tiles/target/protomaps-basemap-HEAD-with-deps.jar /opt/protomaps-basemap.jar
COPY build-and-publish.sh /usr/local/bin/build-and-publish
RUN chmod +x /usr/local/bin/build-and-publish

ARG BASEMAPS_REF
ENV BASEMAPS_REF=$BASEMAPS_REF
WORKDIR /work
VOLUME /work
CMD ["build-and-publish"]
