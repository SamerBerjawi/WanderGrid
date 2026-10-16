FROM node:20-alpine AS frontend-build

WORKDIR /app

COPY package.json package-lock.json .npmrc tsconfig.json vite.config.ts ./
RUN npm ci --legacy-peer-deps --no-audit --no-fund

COPY . .
RUN npm run build

FROM node:20-alpine AS backend

WORKDIR /app
ENV NODE_ENV=production

COPY backend_files/package.json backend_files/package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps --no-audit --no-fund

COPY backend_files/ ./
COPY --from=frontend-build /app/dist ./client_build

# The airport overlay tiles (~200 MB) are gitignored, so CI checkouts lack them. Fetch them into the
# served client build unless a local build already shipped the file (dist is copied from public/).
ARG AIRPORT_PMTILES_URL=https://github.com/SamerBerjawi/WanderGrid/releases/download/assets/airport-overlay.pmtiles
ARG AIRPORT_PMTILES_REV=
RUN if [ ! -s client_build/airport-overlay.pmtiles ] && [ -n "$AIRPORT_PMTILES_URL" ]; then \
      wget -q -O client_build/airport-overlay.pmtiles "$AIRPORT_PMTILES_URL" \
      || { echo "WARNING: could not download airport-overlay.pmtiles from $AIRPORT_PMTILES_URL; airport overlay will be unavailable" >&2; rm -f client_build/airport-overlay.pmtiles; }; \
    fi

EXPOSE 3000
CMD ["node", "server.js"]

