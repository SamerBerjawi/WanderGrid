# Developer and AI Coding Agent Guidelines: Optimization & Architecture

This document preserves the production-grade architectural and performance optimization rules established for WanderGrid. Any subsequent updates, refactoring, or feature development must adhere to these structural constraints and design guidelines.

---

## 1. Static Dataset Optimization (Airports & Carriers)

Direct, live network fetches to external sources (such as GitHub raw URLs) during request handling are **strictly prohibited** in production. 

- **RAM Caching Principle**: All lookups, auto-completes, and index searches for airports and carriers must be served from in-memory caches on the Node.js server (`memoryAirports` and `memoryCarriers`).
- **PostgreSQL Prepopulation**: On database initialization, tables `global_airports` and `global_carriers` are prepopulated. The server loads these records from PG into memory maps on startup to completely bypass external networks.
- **Background Synchronization Task**: A weekly background task (`setInterval` loop in `server.js`) periodically pulls the latest datasets, performs a transactional truncate-and-write to database tables, and reloads memory maps. This ensures dataset freshness without impact on container startup or client response times.
- **Lazy Network Fallback**: Direct external fetches are *only* used as a lazy recovery mechanism if database tables are empty or unreachable, and must execute strictly in the background without hanging process threads.

---

## 2. Geocoding & Location Lookups

Location coordinates and reverse-lookup requests must be safe, fast, and cached permanently.

- **PostgreSQL Persistent Cache Table**: All geocoding, autocomplete, or location inquiries must transit through the backend proxy (`/api/proxy/geocoding`). Lookups check `geocoding_cache` first and return instant caching headers (`X-Cache: HIT`).
- **Strict 3-Second Timeout Limits**: Direct API calls to external geocoding providers (e.g., OpenMeteo) must enforce a strict **3-second timeout limit** utilizing `AbortController`.
- **Graceful Fail-Safe**: On network failure or timeout, the systems must fast-fail and immediately return an empty array `[]` instead of letting an external network issue hang the client UI.

---

## 3. Asynchronous Background Tasking

Heavy backend operations (e.g., generating multi-table full database backups, data compilations, sheet exports) must be offloaded from the standard synchronous business process, avoiding gateway timeouts and container blocks.

- **Immediate 202 Acknowledgment**: When a request for a heavy task is received, the backend must immediately register the job, return a lightweight token/job-status payload (`{ success: true, jobId, status: 'Processing' }`), and return HTTP 202.
- **Asynchronous Processing Block**: The job is executed in a non-blocking `Promise.resolve().then(...)` loop, maintaining progress status values directly on an active tasks mapper.
- **Status Polling Endpoints**: Provide lightweight status polling endpoints (`/api/jobs/status/:jobId`) so the client visualizes and tracks step progression without holding open HTTP threads.

---

## 4. Connection Lifecycle & Container Orchestration (Graceful Shutdown)

The database client and server must handle network resilience and container lifecycles seamlessly.

- **Database Client Pooling**: Establish limits on the connection pool (e.g., `max: 20`), idle timeout limits (`idleTimeoutMillis: 30000` to release inactive clients), and query/connection limits (`connectionTimeoutMillis: 5000` to fast-fail unreachable db hosts).
- **Graceful Process Closures**: Maintain process listeners for `SIGTERM` and `SIGINT` signals emitted by modern deployment targets (Kubernetes, AWS ECS, Google Cloud Run). Upon signal alert, the handler must immediately cease incoming connection ingress, safely process pending queue queries, and cleanly call `pool.end()` to prevent server leaks.

---

## 5. Client State Synchronization & React Optimization

Prevent stale client interfaces, duplicate network requests, or infinite rendering loops by leveraging a unified reactive cache model.

- **SWR Render Cache**: Leverage `/hooks/useWanderSync.ts` for all shared collection and data queries. It manages an in-memory cache with an automated 5-second TTL.
- **Dynamic Mutation Invalidation**: When executing database state mutations via API calls (POST, PUT, DELETE), the local/remote database proxy dispatches a standard `wandergrid_db_updated` event on the global window object. 
- **Reactive Cache Repopulation**: Active queries instantiated via the synchronization hook listen for the mutation standard, invalidate their cached states immediately, and dynamically fetch updated data payloads to synchronize the layout instantly.

---

## 6. Observability & Zero Silent Errors

Keep systems highly diagnosable and user sessions resilient.

- **Structured JSON Logger**: In production, all server logs are written using centralized JSON structures containing accurate levels, timestamps, structured details, and complete error stack traces.
- **Global Error Boundaries**: The root UI is wrapped in an interactive `/components/ErrorBoundary.tsx` module. If an unhandled client crash occurs, it traps the exception, avoids browser freezes, and renders a diagnostic recovery card allowing prompt cache resets or page reloads.
