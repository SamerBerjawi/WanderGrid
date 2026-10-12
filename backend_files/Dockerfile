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

EXPOSE 3000
CMD ["node", "server.js"]

