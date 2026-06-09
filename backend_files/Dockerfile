FROM node:20-alpine AS frontend-build

WORKDIR /app

COPY package.json ./
COPY tsconfig.json ./
COPY vite.config.ts ./
COPY index.html ./
COPY App.tsx ./
COPY index.tsx ./
COPY types.ts ./
COPY metadata.json ./
COPY components ./components
COPY services ./services
COPY views ./views
COPY utils ./utils
COPY hooks ./hooks
COPY public ./public

RUN npm install --legacy-peer-deps --no-audit --no-fund
RUN npm run build

FROM node:20-alpine AS backend

WORKDIR /app
ENV NODE_ENV=production

COPY backend_files/package.json ./
RUN npm install --omit=dev --legacy-peer-deps --no-audit --no-fund

COPY backend_files/server.js ./
COPY backend_files/aviationStack.js ./
COPY --from=frontend-build /app/dist ./client_build

EXPOSE 3000
CMD ["node", "server.js"]
