# God's Eye View (GEV) Architectural Changes & Removal Registry

This registry tracks every modular item ported from God's Eye View into WanderGrid.
Each item is independently isolated with its own feature flag, branch/commit history, and exact reversal recipe.

---

## P-00 · Shared Backend Upstream Helper

- **Status**: Done
- **Branch**: `gev/P00-shared-upstream`
- **Commit**: `[GEV-P00]`
- **Feature Flag**: *None (internal core engine)*
- **Files Added**:
  - `backend_files/upstream.js`
  - `backend_files/test/upstream.test.js`
- **Files Modified**: None
- **Endpoints**: None (shared internal library function `fetchUpstream`)
- **Env Vars**: None
- **Dependencies Added**: None (standard `node:test`, `node:assert`, native `fetch`)
- **DB Changes**: None
- **VERIFY Results**:
  - In-flight coalescing confirmed: 2 identical concurrent requests dispatch 1 upstream call.
  - Stale-on-error verified: 5xx or network transport error serves stale cached entry up to `staleMs` with `stale: true`.
  - Negative caching verified: 404 definitively cached for `negativeTtlMs`.
  - Byte cap verified: oversized responses aborted cleanly.
  - Rate-gate verified: per-host minimum interval enforced.
- **Exact Removal Recipe**:
  ```bash
  rm backend_files/upstream.js backend_files/test/upstream.test.js
  git revert <sha>
  ```

---

## P-01 · Fix Flight-Lookup "adsbdb" Provider

- **Status**: Done
- **Branch**: `gev/P01-adsbdb-route`
- **Commit**: `[GEV-P01]`
- **Feature Flag**: `GEV_P01_ADSBDB_ROUTE` (default: ON)
- **Files Added**:
  - `backend_files/carrierMapping.js`
  - `backend_files/test/adsbdb.test.js`
- **Files Modified**:
  - `backend_files/server.js`
  - `services/flightTracker.ts`
  - `components/FlightTrackerModal.tsx`
  - `components/transport/FlightForm.tsx`
  - `types.ts`
- **Endpoints**:
  - `GET /api/proxy/adsbdb/callsign/:callsign` (24h cache, 8s timeout, ~5 req/s rate-gate via `fetchUpstream`)
  - `GET /api/proxy/adsbdb/aircraft/:hexOrReg` (24h cache, 8s timeout, ~5 req/s rate-gate via `fetchUpstream`)
- **Env Vars**: `VITE_FF_GEV_P01_ADSBDB_ROUTE`
- **Dependencies Added**: None
- **DB Changes**: None
- **VERIFY Results**:
  - ADSBdb live route payload verified: returns `flightroute` with airline, origin, destination without schedule times.
  - Fabricated times removed completely: no artificial `T10:00:00Z` or `T13:30:00Z` generated.
  - Third-party CORS proxies removed.
  - IATA to ICAO mapping converts e.g. `UA123` -> `UAL123`; unknown carriers fail honestly with `unsupported`.
- **Exact Removal Recipe**:
  ```bash
  rm backend_files/carrierMapping.js backend_files/test/adsbdb.test.js
  git revert <sha>
  ```

---

