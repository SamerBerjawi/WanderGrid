# Builds transit-ports-ferries.pmtiles (railways, stations, ferry routes/terminals, ports) from OpenStreetMap
# and publishes it to the `map-data` GitHub release. Runs on a NAS (see README.md).
FROM debian:bookworm-slim
ARG TIPPECANOE_REF=2.79.0
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl git ca-certificates build-essential pkg-config \
      libsqlite3-dev zlib1g-dev osmium-tool util-linux \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update && apt-get install -y --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/*
RUN git clone --depth=1 --branch "$TIPPECANOE_REF" https://github.com/felt/tippecanoe.git /tmp/tippecanoe \
 && make -C /tmp/tippecanoe -j"$(nproc)" && make -C /tmp/tippecanoe install && rm -rf /tmp/tippecanoe
COPY build-and-publish.sh /usr/local/bin/build-and-publish
RUN chmod +x /usr/local/bin/build-and-publish
WORKDIR /work
VOLUME /work
CMD ["build-and-publish"]
