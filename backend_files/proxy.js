'use strict';
// The /api/proxy/* routes and the lookups behind them: flight status, route flights, AeroDataBox, adsbdb, adsb.lol,
// OpenSky, OpenAIP tiles, road/rail/sea routes, holidays, FX, geocoding, and the airport and carrier search.
// Moved out of server.js unchanged (decision D-07). The workspace supplies the API keys here, so browsers never see them.
const path = require('path');
const { AviationStackError, normalizeFutureFlight, requestAviationStack } = require('./aviationStack');
const { resolveFlight } = require('./flightLookup.js');
const { fetchUpstream } = require('./upstream');
const { resolveIcaoCallsign } = require('./carrierMapping');
const { handleRouteProxy, handleRailRouteProxy } = require('./routeProxy');
const { createRouteService } = require('./routeStore');
const { searchGeocodingChain, searchOpenMeteo, searchPhoton, searchNominatim, reverseGeocode } = require('./geocodingChain');
const { testProvider } = require('./integrationsTester');
const { SERVICE_KEYS, testKey } = require('./keyTester');
const holidays = require('./holidays');
const fxRates = require('./fxRates');

module.exports = function registerProxyRoutes(app, {
  pool, logger, sendError, requireAdmin, readWorkspaceSettings, workspaceSecret, SECRET_MASK,
  FLIGHT_CACHE_TTL_MS, CACHE_MAX_ENTRIES, FLIGHT_FETCH_TIMEOUT_MS, GEOCODE_CACHE_TTL_MS,
  flightCache, memoryAirports, memoryCarriers, memoryGeocoding, openSkyCache, BoundedMap, HttpError, EXTERNAL_FETCH_TIMEOUT_MS,
}) {
  // --- Routes ---

  // Proxies receive the workspace's keys here, so browsers never need (or see) them.
  const PROXY_KEY_HEADERS = { 'x-aviationstack-key': 'aviationStackApiKey', 'x-aerodatabox-key': 'aeroDataBoxApiKey', 'x-openaip-key': 'openAipApiKey' };
  app.use('/api/proxy', async (req, res, next) => {
      try {
          for (const [header, key] of Object.entries(PROXY_KEY_HEADERS)) {
              const sent = String(req.headers[header] || '').trim();
              if (!sent || sent === SECRET_MASK) {
                  const value = await workspaceSecret(key);
                  if (value) req.headers[header] = value; else delete req.headers[header];
              }
          }
          // Legacy query-string keys (AviationStack airports/airlines)
          if (req.query && (!req.query.access_key || req.query.access_key === SECRET_MASK)) {
              const value = await workspaceSecret('aviationStackApiKey');
              const query = { ...req.query };
              if (value) query.access_key = value; else delete query.access_key;
              // req.query is a lazily-computed getter in recent Express versions; replace it outright.
              Object.defineProperty(req, 'query', { value: query, writable: true, configurable: true, enumerable: true });
          }
          next();
      } catch (err) {
          next(err);
      }
  });


  // AviationStack proxies keep API calls server-side to avoid browser CORS and mixed-content failures.
  // Keys are masked for clients (SEC-010), so a header that is empty or the mask means "use the stored key".
  const clientKeyOrStored = async (supplied, settingKey) => {
      const key = String(supplied || '').trim();
      if (key && key !== SECRET_MASK) return key;
      return workspaceSecret(settingKey);
  };

  const getAviationStackKey = (req) =>
      clientKeyOrStored(req.get('X-AviationStack-Key') || req.query.access_key, 'aviationStackApiKey');

  const sendAviationStackError = (res, error) => {
      const status = error instanceof AviationStackError ? error.status : 502;
      console.error('[API] AviationStack request failed:', error);
      return res.status(status).json({
          error: error.message || 'AviationStack request failed.',
          code: error.code || 'aviationstack_error'
      });
  };

  app.get('/api/proxy/flight-status', async (req, res) => {
      const accessKey = await getAviationStackKey(req);
      const flightIata = String(req.query.flight_iata || '').trim().toUpperCase().replace(/\s/g, '');
      const flightDate = String(req.query.flight_date || '').trim();
      if (!accessKey || !flightIata) {
          return res.status(400).json({ error: 'Missing AviationStack API key or flight number.' });
      }

      const cacheKey = `${flightIata}:${flightDate || 'latest'}`;
      const cached = flightCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
          res.set('X-Cache', 'HIT');
          res.set('Cache-Control', `private, max-age=${Math.floor(FLIGHT_CACHE_TTL_MS / 1000)}`);
          return res.json(cached.data);
      }

      try {
          const data = await requestAviationStack('flights', {
              access_key: accessKey,
              flight_iata: flightIata,
              flight_date: flightDate
          }, { timeoutMs: FLIGHT_FETCH_TIMEOUT_MS });
          flightCache.set(cacheKey, { data, expiresAt: Date.now() + FLIGHT_CACHE_TTL_MS });
          res.set('X-Cache', 'MISS');
          res.set('Cache-Control', `private, max-age=${Math.floor(FLIGHT_CACHE_TTL_MS / 1000)}`);
          return res.json(data);
      } catch (error) {
          return sendAviationStackError(res, error);
      }
  });

  app.get('/api/proxy/route-flights', async (req, res) => {
      const accessKey = await getAviationStackKey(req);
      const cleanDep = String(req.query.dep_iata || '').trim().toUpperCase();
      const cleanArr = String(req.query.arr_iata || '').trim().toUpperCase();
      const cleanDate = String(req.query.flight_date || '').trim();
      if (!accessKey || !/^[A-Z]{3}$/.test(cleanDep) || !/^[A-Z]{3}$/.test(cleanArr) || !/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
          return res.status(400).json({ error: 'A valid API key, origin, destination, and date are required.' });
      }

      const targetTime = Date.parse(`${cleanDate}T00:00:00Z`);
      if (Number.isNaN(targetTime)) {
          return res.status(400).json({ error: 'Flight date must use YYYY-MM-DD format.' });
      }
      const today = new Date();
      const todayTime = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
      const isPast = targetTime < todayTime;
      const isFuture = targetTime > todayTime;
      const cacheKey = `${cleanDep}-${cleanArr}-${cleanDate}`;

      try {
          const cacheRes = await pool.query('SELECT payload, updated_at FROM cached_routes WHERE route_key = $1', [cacheKey]);
          if (cacheRes.rows.length > 0) {
              const { payload, updated_at } = cacheRes.rows[0];
              const age = Date.now() - new Date(updated_at).getTime();
              const maxAge = isPast ? Infinity : isFuture ? 24 * 60 * 60 * 1000 : FLIGHT_CACHE_TTL_MS;
              if (age < maxAge) {
                  res.set('X-Cache', 'HIT');
                  return res.json({ pagination: { count: payload.length, total: payload.length }, data: payload });
              }
          }
      } catch (error) {
          console.error('[DB CACHE ERROR] Failed querying cached_routes:', error);
      }

      try {
          let flights;
          if (isFuture) {
              const daysAhead = Math.floor((targetTime - todayTime) / (24 * 60 * 60 * 1000));
              if (daysAhead <= 7) {
                  return res.status(422).json({
                      error: 'AviationStack only publishes future schedules more than 7 days ahead. Search today, a past date supported by your plan, or a date at least 8 days from today.',
                      code: 'future_date_not_available'
                  });
              }
              const data = await requestAviationStack('flightsFuture', {
                  access_key: accessKey,
                  iataCode: cleanDep,
                  type: 'departure',
                  date: cleanDate
              }, { timeoutMs: FLIGHT_FETCH_TIMEOUT_MS });
              flights = (data.data || [])
                  .map(item => normalizeFutureFlight(item, cleanDate))
                  .filter(item => item.arrival.iata.toUpperCase() === cleanArr);
          } else {
              const data = await requestAviationStack('flights', {
                  access_key: accessKey,
                  dep_iata: cleanDep,
                  arr_iata: cleanArr,
                  flight_date: cleanDate
              }, { timeoutMs: FLIGHT_FETCH_TIMEOUT_MS });
              flights = Array.isArray(data.data) ? data.data : [];
          }

          if (flights.length > 0) {
              try {
                  await pool.query(
                      `INSERT INTO cached_routes (route_key, payload, updated_at)
                       VALUES ($1, $2, CURRENT_TIMESTAMP)
                       ON CONFLICT (route_key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = CURRENT_TIMESTAMP`,
                      [cacheKey, JSON.stringify(flights)]
                  );
              } catch (error) {
                  console.error('[DB CACHE ERROR] Failed saving route cache:', error);
              }
          }

          res.set('X-Cache', 'MISS');
          return res.json({ pagination: { count: flights.length, total: flights.length }, data: flights });
      } catch (error) {
          return sendAviationStackError(res, error);
      }
  });

  // Proxy for AviationStack Airports (Bypasses CORS & mixed content)
  app.get('/api/proxy/airports', async (req, res) => {
      const { access_key, iata_code, search } = req.query;
      if (!access_key) {
          return res.status(400).json({ error: 'Missing access_key' });
      }
      try {
          const params = new URLSearchParams({ access_key: String(access_key) });
          if (iata_code) params.set('iata_code', String(iata_code));
          if (search) params.set('search', String(search));
          const response = await fetch(`http://api.aviationstack.com/v1/airports?${params}`, { signal: AbortSignal.timeout(FLIGHT_FETCH_TIMEOUT_MS) });
          if (!response.ok) return res.status(502).json({ error: `AviationStack returned HTTP ${response.status}` });
          const data = await response.json();
          res.json(data);
      } catch (err) {
           console.error("Airports proxy error:", err);
           res.status(500).json({ error: 'Failed to fetch airport metadata' });
      }
  });

  // Proxy for AviationStack Airlines (Bypasses CORS & mixed content)
  app.get('/api/proxy/airlines', async (req, res) => {
      const { access_key, iata_code, search } = req.query;
      if (!access_key) {
          return res.status(400).json({ error: 'Missing access_key' });
      }
      try {
          const params = new URLSearchParams({ access_key: String(access_key) });
          if (iata_code) params.set('iata_code', String(iata_code));
          if (search) params.set('search', String(search));
          const response = await fetch(`http://api.aviationstack.com/v1/airlines?${params}`, { signal: AbortSignal.timeout(FLIGHT_FETCH_TIMEOUT_MS) });
          if (!response.ok) return res.status(502).json({ error: `AviationStack returned HTTP ${response.status}` });
          const data = await response.json();
          res.json(data);
      } catch (err) {
           console.error("Airlines proxy error:", err);
           res.status(500).json({ error: 'Failed to fetch airline metadata' });
      }
  });

  // ==========================================
  // AERODATABOX PROXY (FLIGHT LOOKUPS & AIRCRAFT)
  // ==========================================
  const aeroDataBoxCache = new BoundedMap(CACHE_MAX_ENTRIES);
  const AERODATABOX_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  const AERODATABOX_ENDPOINTS = {
      rapidapi: {
          baseUrl: 'https://aerodatabox.p.rapidapi.com',
          authHeader: 'x-rapidapi-key'
      },
      direct: {
          baseUrl: 'https://api.aerodatabox.com',
          authHeader: 'X-Api-Key'
      }
  };

  // ==========================================
  // FLIGHT LOOKUP BY NUMBER AND DATE (flightLookup.js)
  // Keyless sources first (FlightStats, ADSBdb), then the workspace's AeroDataBox / AviationStack keys.
  // Always answers 200 with the candidates found and what each source said.
  // ==========================================
  app.get('/api/flights/lookup', async (req, res) => {
      const flight = String(req.query.flight || '').trim();
      const date = String(req.query.date || '').trim();
      try {
          const adbKey = await workspaceSecret('aeroDataBoxApiKey') || '';
          const mode = String(await workspaceSecret('aeroDataBoxEndpoint') || process.env.INTEGRATIONS_AERO_DATA_BOX_ENDPOINT || 'rapidapi').toLowerCase();
          const cfg = AERODATABOX_ENDPOINTS[mode] || AERODATABOX_ENDPOINTS.rapidapi;
          const result = await resolveFlight(flight, date, {
              flightstats: String(process.env.FLIGHT_LOOKUP_FLIGHTSTATS || 'on').toLowerCase() !== 'off',
              aerodatabox: adbKey ? { key: adbKey, baseUrl: cfg.baseUrl, authHeader: cfg.authHeader, host: mode === 'rapidapi' ? 'aerodatabox.p.rapidapi.com' : '' } : null,
              aviationstackKey: await workspaceSecret('aviationStackApiKey') || '',
          });
          if (!result.ok) return res.status(400).json(result);
          res.set('Cache-Control', 'private, max-age=15');
          return res.json(result);
      } catch (err) {
          logger.warn('Flight lookup failed', { error: err.message });
          return res.status(502).json({ ok: false, error: 'lookup_failed', message: 'The flight lookup failed. Try again.', candidates: [], attempts: [] });
      }
  });

  app.get('/api/proxy/aerodatabox/flights/number/:flightNumber', async (req, res) => {
      const rawNumber = String(req.params.flightNumber || '').trim().replace(/\s|-/g, '').toUpperCase();
      if (!rawNumber) {
          return res.status(400).json({ error: 'Flight number is required.' });
      }

      const apiKey = await clientKeyOrStored(req.get('X-AeroDataBox-Key') || req.query.api_key, 'aeroDataBoxApiKey');
      if (!apiKey) {
          return res.status(400).json({ error: 'AeroDataBox API key is missing. Please configure it in Settings.' });
      }

      const endpointMode = String(req.get('X-AeroDataBox-Endpoint') || req.query.endpoint || await workspaceSecret('aeroDataBoxEndpoint') || process.env.INTEGRATIONS_AERO_DATA_BOX_ENDPOINT || 'rapidapi').toLowerCase();
      const config = AERODATABOX_ENDPOINTS[endpointMode] || AERODATABOX_ENDPOINTS.rapidapi;

      const date = String(req.query.date || '').trim();
      let apiPath = '';

      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
          apiPath = `/flights/number/${encodeURIComponent(rawNumber)}/${date}?dateLocalRole=Both&withAircraftImage=false&withLocation=false`;
      } else {
          const now = new Date();
          const pad = (n) => String(n).padStart(2, '0');
          const fmt = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
          const fromDate = fmt(new Date(now.getTime() - 2 * 86400000));
          const toDate = fmt(new Date(now.getTime() + 2 * 86400000));
          apiPath = `/flights/number/${encodeURIComponent(rawNumber)}/${fromDate}/${toDate}?dateLocalRole=Both&withAircraftImage=false&withLocation=false`;
      }

      const cacheKey = `${endpointMode}:${rawNumber}:${date || 'window'}`;
      const cached = aeroDataBoxCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
          res.set('X-Cache', 'HIT');
          res.set('Cache-Control', `private, max-age=${Math.floor(AERODATABOX_CACHE_TTL_MS / 1000)}`);
          return res.json(cached.data);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      try {
          const upstreamUrl = `${config.baseUrl}${apiPath}`;
          const headers = { [config.authHeader]: apiKey };
          if (endpointMode === 'rapidapi') {
              headers['x-rapidapi-host'] = 'aerodatabox.p.rapidapi.com';
          }

          const upstream = await fetch(upstreamUrl, {
              headers,
              signal: controller.signal
          });
          clearTimeout(timeout);

          if (upstream.status === 204) {
              return res.json([]);
          }

          if (!upstream.ok) {
              const errText = await upstream.text().catch(() => '');
              return res.status(upstream.status).json({
                  error: `AeroDataBox returned HTTP ${upstream.status}`,
                  details: errText
              });
          }

          const data = await upstream.json();
          aeroDataBoxCache.set(cacheKey, { data, expiresAt: Date.now() + AERODATABOX_CACHE_TTL_MS });
          res.set('X-Cache', 'MISS');
          res.set('Cache-Control', `private, max-age=${Math.floor(AERODATABOX_CACHE_TTL_MS / 1000)}`);
          return res.json(data);
      } catch (error) {
          clearTimeout(timeout);
          console.error('[API] AeroDataBox fetch failed:', error);
          return res.status(error.name === 'AbortError' ? 504 : 502).json({
              error: error.name === 'AbortError' ? 'AeroDataBox request timed out.' : 'Failed to reach AeroDataBox.'
          });
      }
  });

  app.get('/api/proxy/aerodatabox/aircrafts/reg/:reg', async (req, res) => {
      const reg = String(req.params.reg || '').trim();
      if (!reg) return res.status(400).json({ error: 'Aircraft registration required.' });

      const apiKey = await clientKeyOrStored(req.get('X-AeroDataBox-Key') || req.query.api_key, 'aeroDataBoxApiKey');
      if (!apiKey) return res.status(400).json({ error: 'AeroDataBox API key is missing.' });

      const endpointMode = String(req.get('X-AeroDataBox-Endpoint') || req.query.endpoint || await workspaceSecret('aeroDataBoxEndpoint') || process.env.INTEGRATIONS_AERO_DATA_BOX_ENDPOINT || 'rapidapi').toLowerCase();
      const config = AERODATABOX_ENDPOINTS[endpointMode] || AERODATABOX_ENDPOINTS.rapidapi;

      const cacheKey = `reg:${endpointMode}:${reg}`;
      const cached = aeroDataBoxCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
          res.set('X-Cache', 'HIT');
          return res.json(cached.data);
      }

      try {
          const upstreamUrl = `${config.baseUrl}/aircrafts/reg/${encodeURIComponent(reg)}`;
          const headers = { [config.authHeader]: apiKey };
          if (endpointMode === 'rapidapi') headers['x-rapidapi-host'] = 'aerodatabox.p.rapidapi.com';

          const upstream = await fetch(upstreamUrl, { headers, signal: AbortSignal.timeout(FLIGHT_FETCH_TIMEOUT_MS) });
          if (upstream.status === 204) return res.json(null);
          if (!upstream.ok) return res.status(upstream.status).json({ error: 'Aircraft lookup failed.' });

          const data = await upstream.json();
          aeroDataBoxCache.set(cacheKey, { data, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
          res.set('X-Cache', 'MISS');
          return res.json(data);
      } catch (e) {
          return res.status(502).json({ error: 'Failed to contact AeroDataBox for aircraft registration.' });
      }
  });

  // ==========================================
  // KEYLESS FLIGHT LOOKUP (ADSBdb & adsb.lol)
  // ==========================================
  const adsbLolCache = new BoundedMap(CACHE_MAX_ENTRIES);

  // P-01: ADSBdb Callsign Route Lookup (Cached 24h, 8s timeout, host gate 200ms)
  const handleAdsbDbCallsign = async (req, res) => {
      const rawInput = String(req.params.callsign || req.params.flightNumber || '').trim().replace(/\s|-/g, '').toUpperCase();
      if (!rawInput) return res.status(400).json({ ok: false, error: 'Callsign or flight number required' });

      // Convert IATA flight number (e.g. UA123) to ICAO callsign (e.g. UAL123)
      const callsign = resolveIcaoCallsign(rawInput);
      if (!callsign) {
          return res.status(400).json({
              ok: false,
              error: 'unsupported',
              message: `Carrier code in '${rawInput}' cannot be mapped to an ICAO callsign`
          });
      }

      try {
          const result = await fetchUpstream({
              key: `adsbdb:callsign:${callsign}`,
              url: `https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`,
              ttlMs: 24 * 3600 * 1000, // 24 hours
              staleMs: 7 * 24 * 3600 * 1000, // 7 days stale on network error
              timeoutMs: 8000,
              negativeTtlMs: 24 * 3600 * 1000,
              hostGate: { minIntervalMs: 200 }, // ~5 req/s rate-gate
          });

          if (result.outcome === 'hit') res.set('X-Cache', 'HIT');
          else if (result.outcome === 'stale') res.set('X-Cache', 'STALE');
          else if (result.outcome === 'miss') res.set('X-Cache', 'MISS');

          if (result.outcome === 'notfound' || result.status === 404) {
              return res.status(404).json({ ok: false, error: 'Flight or callsign not found in ADSBdb' });
          }

          if (!result.ok) {
              return res.status(result.status || 502).json({
                  ok: false,
                  error: result.error || 'Failed to reach ADSBdb',
                  answered: result.answered
              });
          }

          return res.json(result.data);
      } catch (err) {
          logger.warn('ADSBdb proxy exception', { error: err.message, callsign });
          return res.status(502).json({ ok: false, error: 'Internal error communicating with ADSBdb' });
      }
  };

  app.get('/api/proxy/adsbdb/callsign/:callsign', handleAdsbDbCallsign);
  app.get('/api/proxy/adsbdb/flights/:flightNumber', handleAdsbDbCallsign);

  app.get('/api/proxy/adsb-lol/callsign/:callsign', async (req, res) => {
      const requested = String(req.params.callsign || '').trim().replace(/\s|-/g, '').toUpperCase();
      if (!requested) return res.status(400).json({ error: 'Callsign is required.' });
      // Transponders broadcast ICAO callsigns (AAL100), not the IATA flight number (AA100).
      const rawCallsign = resolveIcaoCallsign(requested) || requested;

      const cacheKey = `callsign:${rawCallsign}`;
      const cached = adsbLolCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
          res.set('X-Cache', 'HIT');
          return res.json(cached.data);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      try {
          const upstream = await fetch(`https://api.adsb.lol/v2/callsign/${encodeURIComponent(rawCallsign)}`, {
              signal: controller.signal,
              headers: { 'User-Agent': 'WanderGrid/1.0' }
          });
          clearTimeout(timeout);

          if (!upstream.ok) {
              return res.status(upstream.status).json({ error: `adsb.lol returned HTTP ${upstream.status}` });
          }

          const data = await upstream.json();
          adsbLolCache.set(cacheKey, { data, expiresAt: Date.now() + 60000 }); // 1 minute
          res.set('X-Cache', 'MISS');
          return res.json(data);
      } catch (e) {
          clearTimeout(timeout);
          return res.status(e.name === 'AbortError' ? 504 : 502).json({ error: 'Failed to reach adsb.lol.' });
      }
  });

  // P-01: ADSBdb Aircraft Lookup (Cached 24h, 8s timeout, host gate 200ms)
  app.get('/api/proxy/adsbdb/aircraft/:hexOrReg', async (req, res) => {
      const param = String(req.params.hexOrReg || '').trim().toUpperCase();
      if (!param) return res.status(400).json({ ok: false, error: 'ICAO hex or registration required' });

      try {
          const result = await fetchUpstream({
              key: `adsbdb:aircraft:${param}`,
              url: `https://api.adsbdb.com/v0/aircraft/${encodeURIComponent(param)}`,
              ttlMs: 24 * 3600 * 1000, // 24 hours
              staleMs: 7 * 24 * 3600 * 1000,
              timeoutMs: 8000,
              negativeTtlMs: 24 * 3600 * 1000,
              hostGate: { minIntervalMs: 200 },
          });

          if (result.outcome === 'hit') res.set('X-Cache', 'HIT');
          else if (result.outcome === 'stale') res.set('X-Cache', 'STALE');
          else if (result.outcome === 'miss') res.set('X-Cache', 'MISS');

          if (result.outcome === 'notfound' || result.status === 404) {
              return res.status(404).json({ ok: false, error: 'Aircraft not found in ADSBdb' });
          }

          if (!result.ok) {
              return res.status(result.status || 502).json({
                  ok: false,
                  error: result.error || 'Failed to reach ADSBdb aircraft',
                  answered: result.answered
              });
          }

          return res.json(result.data);
      } catch (err) {
          logger.warn('ADSBdb aircraft proxy exception', { error: err.message, param });
          return res.status(502).json({ ok: false, error: 'Internal error communicating with ADSBdb' });
      }
  });

  // ==========================================
  // P-02: REAL ROAD & RAIL ROUTING PROXIES
  // ==========================================
  // Persistent, batched road/rail tracing (see routeStore.js). The GET proxies below remain for single lookups.
  const routeService = createRouteService({ pool, fetchUpstream });
  app.post('/api/proxy/routes/resolve', routeService.handleResolve);
  app.get('/api/proxy/route', handleRouteProxy);
  app.get('/api/route', handleRouteProxy);
  app.get('/api/proxy/rail', handleRailRouteProxy);
  app.get('/api/rail', handleRailRouteProxy);

  // ==========================================
  // P-06: INTEGRATIONS TEST ENDPOINT (/api/proxy/test/:provider)
  // ==========================================
  app.get('/api/proxy/test/:provider', async (req, res) => {
      try {
          const result = await testProvider(req.params.provider);
          return res.status(result.success ? 200 : 502).json(result);
      } catch (err) {
          return res.status(400).json({ error: err.message });
      }
  });

  // Tests a stored API key (Settings › Integrations). Admin only; the key is read here and never sent back.
  const KEY_SERVICE_SETTING = { aviationstack: 'aviationStackApiKey', aerodatabox: 'aeroDataBoxApiKey', openaip: 'openAipApiKey' };
  app.post('/api/integrations/test-key/:service', requireAdmin, async (req, res) => {
      const service = String(req.params.service || '').toLowerCase();
      if (!SERVICE_KEYS.includes(service)) return res.status(400).json({ error: 'Unknown service' });
      try {
          let key;
          if (service === 'brandfetch') key = String((await readWorkspaceSettings()).brandfetchApiKey || '').trim();
          else key = await workspaceSecret(KEY_SERVICE_SETTING[service]);
          const mode = String(await workspaceSecret('aeroDataBoxEndpoint') || process.env.INTEGRATIONS_AERO_DATA_BOX_ENDPOINT || 'rapidapi').toLowerCase();
          const cfg = AERODATABOX_ENDPOINTS[mode] || AERODATABOX_ENDPOINTS.rapidapi;
          const result = await testKey(service, key, { ...cfg, host: mode === 'rapidapi' ? 'aerodatabox.p.rapidapi.com' : '' });
          return res.json(result);
      } catch (err) {
          return sendError(res, err, 500, 'The key could not be tested');
      }
  });

  // The route a flight in the air (or just landed) has flown so far. OpenSky serves tracks keyless for the current
  // flight only ("You cannot access historical tracks" otherwise), so this is for saving the route while it is live.
  const trackCache = new BoundedMap(CACHE_MAX_ENTRIES);
  const simplifyPath = (points, max = 80) => {
      if (points.length <= max) return points;
      const out = [];
      for (let i = 0; i < max; i++) out.push(points[Math.round((i * (points.length - 1)) / (max - 1))]);
      return out;
  };
  app.get('/api/proxy/opensky/track', async (req, res) => {
      const callsign = req.query.callsign ? (resolveIcaoCallsign(req.query.callsign) || String(req.query.callsign)).trim().toUpperCase() : '';
      let icao24 = req.query.icao24 ? String(req.query.icao24).toLowerCase() : '';
      if (!callsign && !icao24) return res.status(400).json({ error: 'Give a callsign or icao24.' });
      const key = `track_${icao24 || callsign}`;
      const hit = trackCache.get(key);
      if (hit && Date.now() < hit.expiresAt) return res.json(hit.data);
      const get = async (url, ms = 6000) => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), ms);
          try { return await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'WanderGrid/1.0' } }); } finally { clearTimeout(timer); }
      };
      try {
          if (!icao24) {
              // The transponder code of the aircraft flying this callsign: adsb.lol answers quickly; OpenSky's full state list is the slow fallback.
              try {
                  const r = await get(`https://api.adsb.lol/v2/callsign/${encodeURIComponent(callsign)}`, 5000);
                  if (r.ok) icao24 = (((await r.json()).ac || [])[0] || {}).hex || '';
              } catch { /* fall through */ }
              if (!icao24) {
                  const states = await get('https://opensky-network.org/api/states/all', 9000);
                  if (!states.ok) return res.status(502).json({ error: `OpenSky returned HTTP ${states.status}` });
                  const found = ((await states.json()).states || []).find(s => (s[1] || '').trim().toUpperCase() === callsign);
                  if (!found) return res.json({ path: [], note: 'No transponder seen for that callsign right now.' });
                  icao24 = found[0];
              }
          }
          const up = await get(`https://opensky-network.org/api/tracks/all?icao24=${encodeURIComponent(icao24)}&time=0`);
          if (!up.ok) return res.json({ icao24, path: [], note: `OpenSky returned HTTP ${up.status}` });
          const body = await up.json();
          const points = (body.path || []).filter(p => p[1] != null && p[2] != null).map(p => [Math.round(p[1] * 100) / 100, Math.round(p[2] * 100) / 100]) // [latitude, longitude];
          const data = { icao24, callsign: (body.callsign || '').trim(), start: body.startTime || null, end: body.endTime || null, path: simplifyPath(points) };
          trackCache.set(key, { data, expiresAt: Date.now() + 45000 });
          return res.json(data);
      } catch (e) {
          return res.status(e.name === 'AbortError' ? 504 : 502).json({ error: 'Failed to reach OpenSky Network.' });
      }
  });

  // ==========================================
  // OPENSKY NETWORK LIVE TELEMETRY PROXY (FREE / KEYLESS)

  // ==========================================
  app.get('/api/proxy/opensky/states', async (req, res) => {
      const { icao24 } = req.query;
      const callsign = req.query.callsign ? (resolveIcaoCallsign(req.query.callsign) || String(req.query.callsign)) : undefined;
      const cacheKey = `opensky_${icao24 || 'all'}_${callsign || 'all'}`;
      const cached = openSkyCache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
          res.set('X-Cache', 'HIT');
          return res.json(cached.data);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      try {
          let url = 'https://opensky-network.org/api/states/all';
          if (icao24) {
              url += `?icao24=${encodeURIComponent(icao24.toLowerCase())}`;
          }
          const upstream = await fetch(url, {
              signal: controller.signal,
              headers: { 'User-Agent': 'WanderGrid/1.0' }
          });
          clearTimeout(timeout);

          if (!upstream.ok) {
              return res.status(upstream.status).json({ error: `OpenSky returned HTTP ${upstream.status}` });
          }

          const data = await upstream.json();
          // If a specific callsign was requested, filter states
          if (callsign && data.states && Array.isArray(data.states)) {
              const cleanCallsign = callsign.trim().toUpperCase();
              data.states = data.states.filter(s => (s[1] || '').trim().toUpperCase() === cleanCallsign);
          }

          openSkyCache.set(cacheKey, { data, expiresAt: Date.now() + 10000 }); // 10s TTL
          res.set('X-Cache', 'MISS');
          return res.json(data);
      } catch (e) {
          clearTimeout(timeout);
          return res.status(e.name === 'AbortError' ? 504 : 502).json({ error: 'Failed to reach OpenSky Network.' });
      }
  });

  // ==========================================
  // OPENAIP VECTOR TILE PROXY (AERONAUTICAL CHARTS)
  // ==========================================
  app.get('/api/proxy/openaip/:z/:x/:y', async (req, res) => {
      const { z, x, y } = req.params;
      // Only numeric tile coordinates reach the upstream URL (no path/query injection).
      if (!/^\d{1,2}$/.test(z) || !/^\d{1,7}$/.test(x) || !/^\d{1,7}(\.pbf)?$/.test(y)) {
          return res.status(400).json({ error: 'Invalid tile coordinates' });
      }
      const apiKey = (req.get('X-OpenAIP-Key') || process.env.INTEGRATIONS_OPEN_AIP_KEY || '').trim();
      if (!apiKey) {
          return res.status(403).json({ error: 'OpenAIP API key not configured.' });
      }

      const cleanY = String(y).replace(/\.pbf$/, '');
      const upstreamUrl = `https://api.tiles.openaip.net/api/data/openaip/${z}/${x}/${cleanY}.pbf`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      try {
          const upstream = await fetch(upstreamUrl, {
              headers: {
                  'x-openaip-api-key': apiKey,
                  'accept': 'application/vnd.mapbox-vector-tile,application/x-protobuf'
              },
              signal: controller.signal
          });
          clearTimeout(timeout);

          if (upstream.status === 204) {
              return res.status(204).end();
          }

          if (!upstream.ok) {
              return res.status(upstream.status).end();
          }

          const buffer = await upstream.arrayBuffer();
          res.set({
              'Content-Type': 'application/x-protobuf',
              'Cache-Control': 'private, max-age=300, stale-while-revalidate=3600',
              'Access-Control-Allow-Origin': '*'
          });
          return res.send(Buffer.from(buffer));
      } catch (e) {
          clearTimeout(timeout);
          return res.status(502).end();
      }
  });

  // Local Airport Database coordinates mapping for ultra-fast, zero-dependency geocoding
  const STATIC_GEO_COORDS = {
      "AMS": { "lat": "52.3086", "lon": "4.7639", "name": "Schiphol", "city": "Amsterdam", "country": "Netherlands", "tz": "Europe/Amsterdam", "iso": "NL" },
      "LHR": { "lat": "51.4706", "lon": "-0.4619", "name": "Heathrow", "city": "London", "country": "England", "tz": "Europe/London", "iso": "GB-ENG" },
      "LGW": { "lat": "51.1537", "lon": "-0.1821", "name": "Gatwick Airport", "city": "London", "country": "England", "tz": "Europe/London", "iso": "GB-ENG" },
      "MAN": { "lat": "53.3588", "lon": "-2.2728", "name": "Manchester Airport", "city": "Manchester", "country": "England", "tz": "Europe/London", "iso": "GB-ENG" },
      "BHX": { "lat": "52.4539", "lon": "-1.7480", "name": "Birmingham Airport", "city": "Birmingham", "country": "England", "tz": "Europe/London", "iso": "GB-ENG" },
      "EDI": { "lat": "55.9508", "lon": "-3.3725", "name": "Edinburgh Airport", "city": "Edinburgh", "country": "Scotland", "tz": "Europe/London", "iso": "GB-SCT" },
      "GLA": { "lat": "55.8719", "lon": "-4.4331", "name": "Glasgow Airport", "city": "Glasgow", "country": "Scotland", "tz": "Europe/London", "iso": "GB-SCT" },
      "CWL": { "lat": "51.3967", "lon": "-3.3433", "name": "Cardiff Airport", "city": "Cardiff", "country": "Wales", "tz": "Europe/London", "iso": "GB-WLS" },
      "BFS": { "lat": "54.6575", "lon": "-6.2158", "name": "Belfast Intl Airport", "city": "Belfast", "country": "Northern Ireland", "tz": "Europe/London", "iso": "GB-NIR" },
      "BHD": { "lat": "54.6181", "lon": "-5.8725", "name": "George Best Belfast City", "city": "Belfast", "country": "Northern Ireland", "tz": "Europe/London", "iso": "GB-NIR" },
      "JFK": { "lat": "40.6398", "lon": "-73.7789", "name": "John F Kennedy Intl", "city": "New York", "country": "United States", "tz": "America/New_York", "iso": "US" },
      "DXB": { "lat": "25.2528", "lon": "55.3644", "name": "Dubai Intl", "city": "Dubai", "country": "United Arab Emirates", "tz": "Asia/Dubai", "iso": "AE" },
      "CDG": { "lat": "49.0097", "lon": "2.5478", "name": "Charles De Gaulle", "city": "Paris", "country": "France", "tz": "Europe/Paris", "iso": "FR" },
      "FRA": { "lat": "50.0333", "lon": "8.5706", "name": "Frankfurt am Main", "city": "Frankfurt", "country": "Germany", "tz": "Europe/Berlin", "iso": "DE" },
      "BER": { "lat": "52.3667", "lon": "13.5033", "name": "Berlin Brandenburg", "city": "Berlin", "country": "Germany", "tz": "Europe/Berlin", "iso": "DE" },
      "VIE": { "lat": "48.1103", "lon": "16.5697", "name": "Vienna Intl", "city": "Vienna", "country": "Austria", "tz": "Europe/Vienna", "iso": "AT" },
      "SIN": { "lat": "1.3502", "lon": "103.994", "name": "Changi Intl", "city": "Singapore", "country": "Singapore", "tz": "Asia/Singapore", "iso": "SG" },
      "HKG": { "lat": "22.3089", "lon": "113.915", "name": "Hong Kong Intl", "city": "Hong Kong", "country": "Hong Kong", "tz": "Asia/Hong_Kong", "iso": "HK" },
      "HND": { "lat": "35.5523", "lon": "139.78", "name": "Haneda", "city": "Tokyo", "country": "Japan", "tz": "Asia/Tokyo", "iso": "JP" },
      "SYD": { "lat": "-33.9461", "lon": "151.177", "name": "Kingsford Smith", "city": "Sydney", "country": "Australia", "tz": "Australia/Sydney", "iso": "AU" },
      "BEY": { "lat": "33.82", "lon": "35.49", "name": "Beirut Airport", "city": "Beirut", "country": "Lebanon", "tz": "Asia/Beirut", "iso": "LB" },
      "PRG": { "lat": "50.10", "lon": "14.26", "name": "Prague Airport", "city": "Prague", "country": "Czechia", "tz": "Europe/Prague", "iso": "CZ" },
      "BCN": { "lat": "41.29", "lon": "2.07", "name": "Barcelona Airport", "city": "Barcelona", "country": "Spain", "tz": "Europe/Madrid", "iso": "ES" },
      "ORD": { "lat": "41.97", "lon": "-87.90", "name": "O'Hare Airport", "city": "Chicago", "country": "United States", "tz": "America/Chicago", "iso": "US" },
      "DTW": { "lat": "42.21", "lon": "-83.35", "name": "Detroit Airport", "city": "Detroit", "country": "United States", "tz": "America/Detroit", "iso": "US" },
      "IAD": { "lat": "38.95", "lon": "-77.45", "name": "Dulles Airport", "city": "Washington D.C.", "country": "United States", "tz": "America/New_York", "iso": "US" },
      "GRR": { "lat": "42.88", "lon": "-85.52", "name": "Grand Rapids Airport", "city": "Grand Rapids", "country": "United States", "tz": "America/New_York", "iso": "US" },
      "ATL": { "lat": "33.64", "lon": "-84.42", "name": "Atlanta Airport", "city": "Atlanta", "country": "United States", "tz": "America/New_York", "iso": "US" },
      "AMM": { "lat": "31.72", "lon": "35.99", "name": "Queen Alia Airport", "city": "Amman", "country": "Jordan", "tz": "Asia/Amman", "iso": "JO" },
      "TUN": { "lat": "36.85", "lon": "10.22", "name": "Tunis Airport", "city": "Tunis", "country": "Tunisia", "tz": "Africa/Tunis", "iso": "TN" },
      "DJE": { "lat": "33.86", "lon": "10.77", "name": "Djerba Airport", "city": "Djerba", "country": "Tunisia", "tz": "Africa/Tunis", "iso": "TN" },
      "SAW": { "lat": "40.89", "lon": "29.30", "name": "Sabiha Gökçen Airport", "city": "Istanbul", "country": "Turkey", "tz": "Europe/Istanbul", "iso": "TR" },
      "IST": { "lat": "41.27", "lon": "28.74", "name": "Istanbul Airport", "city": "Istanbul", "country": "Turkey", "tz": "Europe/Istanbul", "iso": "TR" },
      "ISL": { "lat": "41.27", "lon": "28.74", "name": "Atatürk Airport", "city": "Istanbul", "country": "Turkey", "tz": "Europe/Istanbul", "iso": "TR" },
      "CPH": { "lat": "55.61", "lon": "12.65", "name": "Copenhagen Airport", "city": "Copenhagen", "country": "Denmark", "tz": "Europe/Copenhagen", "iso": "DK" },
      "LIS": { "lat": "38.77", "lon": "-9.13", "name": "Lisbon Airport", "city": "Lisbon", "country": "Portugal", "tz": "Europe/Lisbon", "iso": "PT" },
      "ATH": { "lat": "37.93", "lon": "23.94", "name": "Athens Airport", "city": "Athens", "country": "Greece", "tz": "Europe/Athens", "iso": "GR" },
      "MCT": { "lat": "23.59", "lon": "58.28", "name": "Muscat Airport", "city": "Muscat", "country": "Oman", "tz": "Asia/Muscat", "iso": "OM" },
      "AUH": { "lat": "24.43", "lon": "54.65", "name": "Abu Dhabi Airport", "city": "Abu Dhabi", "country": "United Arab Emirates", "tz": "Asia/Dubai", "iso": "AE" },
      "PSA": { "lat": "43.68", "lon": "10.39", "name": "Pisa Airport", "city": "Pisa", "country": "Italy", "tz": "Europe/Rome", "iso": "IT" },
      "SXF": { "lat": "52.38", "lon": "13.52", "name": "Schönefeld Airport", "city": "Berlin", "country": "Germany", "tz": "Europe/Berlin", "iso": "DE" },
      "FLR": { "lat": "43.81", "lon": "11.20", "name": "Florence Airport", "city": "Florence", "country": "Italy", "tz": "Europe/Rome", "iso": "IT" },
      "OTP": { "lat": "44.57", "lon": "26.10", "name": "Otopeni Airport", "city": "Bucharest", "country": "Romania", "tz": "Europe/Bucharest", "iso": "RO" },
      "BRU": { "lat": "50.90", "lon": "4.48", "name": "Brussels Airport", "city": "Brussels", "country": "Belgium", "tz": "Europe/Brussels", "iso": "BE" },
      "LCA": { "lat": "34.87", "lon": "33.62", "name": "Larnaca Airport", "city": "Larnaca", "country": "Cyprus", "tz": "Asia/Nicosia", "iso": "CY" },
      "CRL": { "lat": "50.45", "lon": "4.45", "name": "Charleroi Airport", "city": "Brussels", "country": "Belgium", "tz": "Europe/Brussels", "iso": "BE" },
      "ZRH": { "lat": "47.46", "lon": "8.54", "name": "Zurich Airport", "city": "Zurich", "country": "Switzerland", "tz": "Europe/Zurich", "iso": "CH" },
      "NCE": { "lat": "43.66", "lon": "7.21", "name": "Nice Airport", "city": "Nice", "country": "France", "tz": "Europe/Paris", "iso": "FR" },
      "WAW": { "lat": "52.16", "lon": "20.96", "name": "Chopin Airport", "city": "Warsaw", "country": "Poland", "tz": "Europe/Warsaw", "iso": "PL" },
      "KUL": { "lat": "2.74", "lon": "101.70", "name": "Kuala Lumpur Airport", "city": "Kuala Lumpur", "country": "Malaysia", "tz": "Asia/Kuala_Lumpur", "iso": "MY" },
      "LGK": { "lat": "6.32", "lon": "99.73", "name": "Langkawi Airport", "city": "Langkawi", "country": "Malaysia", "tz": "Asia/Kuala_Lumpur", "iso": "MY" },
      "DPS": { "lat": "-8.74", "lon": "115.16", "name": "Ngurah Rai Airport", "city": "Bali", "country": "Indonesia", "tz": "Asia/Makassar", "iso": "ID" },
      "FCO": { "lat": "41.80", "lon": "12.24", "name": "Fiumicino Airport", "city": "Rome", "country": "Italy", "tz": "Europe/Rome", "iso": "IT" },
      "NAP": { "lat": "40.88", "lon": "14.29", "name": "Naples Airport", "city": "Naples", "country": "Italy", "tz": "Europe/Rome", "iso": "IT" },
      "OPO": { "lat": "41.24", "lon": "-8.67", "name": "Porto Airport", "city": "Porto", "country": "Portugal", "tz": "Europe/Lisbon", "iso": "PT" },
      "BUD": { "lat": "47.43", "lon": "19.26", "name": "Ferenc Liszt Airport", "city": "Budapest", "country": "Hungary", "tz": "Europe/Budapest", "iso": "HU" },
      "TFS": { "lat": "28.04", "lon": "-16.57", "name": "Tenerife South Airport", "city": "Tenerife", "country": "Spain", "tz": "Atlantic/Canary", "iso": "ES" },
      "LAX": { "lat": "33.94", "lon": "-118.40", "name": "Los Angeles Airport", "city": "Los Angeles", "country": "United States", "tz": "America/Los_Angeles", "iso": "US" },
      "SFO": { "lat": "37.62", "lon": "-122.37", "name": "San Francisco Airport", "city": "San Francisco", "country": "United States", "tz": "America/Los_Angeles", "iso": "US" },
      "ORY": { "lat": "48.72", "lon": "2.36", "name": "Orly Airport", "city": "Paris", "country": "France", "tz": "Europe/Paris", "iso": "FR" },
      "SOF": { "lat": "42.69", "lon": "23.41", "name": "Sofia Airport", "city": "Sofia", "country": "Bulgaria", "tz": "Europe/Sofia", "iso": "BG" },
      "AGP": { "lat": "36.67", "lon": "-4.49", "name": "Málaga Airport", "city": "Málaga", "country": "Spain", "tz": "Europe/Madrid", "iso": "ES" },
      "TLL": { "lat": "59.41", "lon": "24.83", "name": "Tallinn Airport", "city": "Tallinn", "country": "Estonia", "tz": "Europe/Tallinn", "iso": "EE" },
      "DUB": { "lat": "53.42", "lon": "-6.24", "name": "Dublin Airport", "city": "Dublin", "country": "Ireland", "tz": "Europe/Dublin", "iso": "IE" },
      "CLE": { "lat": "41.41", "lon": "-81.85", "name": "Cleveland Airport", "city": "Cleveland", "country": "United States", "tz": "America/New_York", "iso": "US" },
      "BRI": { "lat": "41.13", "lon": "16.76", "name": "Bari Airport", "city": "Bari", "country": "Italy", "tz": "Europe/Rome", "iso": "IT" },
      "CAI": { "lat": "30.12", "lon": "31.40", "name": "Cairo Airport", "city": "Cairo", "country": "Egypt", "tz": "Africa/Cairo", "iso": "EG" },
      "ASW": { "lat": "23.96", "lon": "32.81", "name": "Aswan Airport", "city": "Aswan", "country": "Egypt", "tz": "Africa/Cairo", "iso": "EG" },
      "LXR": { "lat": "25.67", "lon": "32.70", "name": "Luxor Airport", "city": "Luxor", "country": "Egypt", "tz": "Africa/Cairo", "iso": "EG" },
      "PDL": { "lat": "37.74", "lon": "-25.69", "name": "Ponta Delgada Airport", "city": "Azores", "country": "Portugal", "tz": "Atlantic/Azores", "iso": "PT" },
      "MAD": { "lat": "40.4839", "lon": "-3.5679", "name": "Adolfo Suárez Madrid-Barajas", "city": "Madrid", "country": "Spain", "tz": "Europe/Madrid", "iso": "ES" },
      "DOH": { "lat": "25.2611", "lon": "51.5650", "name": "Hamad Intl", "city": "Doha", "country": "Qatar", "tz": "Asia/Qatar", "iso": "QA" },
      "CMB": { "lat": "7.1807", "lon": "79.8837", "name": "Bandaranaike Intl", "city": "Colombo", "country": "Sri Lanka", "tz": "Asia/Colombo", "iso": "LK" },
      "PNH": { "lat": "11.5466", "lon": "104.8460", "name": "Phnom Penh Intl", "city": "Phnom Penh", "country": "Cambodia", "tz": "Asia/Phnom_Penh", "iso": "KH" },
      "ARN": { "lat": "59.6519", "lon": "17.9186", "name": "Stockholm Arlanda", "city": "Stockholm", "country": "Sweden", "tz": "Europe/Stockholm", "iso": "SE" },
      "MMX": { "lat": "55.5362", "lon": "13.3697", "name": "Malmö Airport", "city": "Malmö", "country": "Sweden", "tz": "Europe/Stockholm", "iso": "SE" },
      "GOT": { "lat": "57.6628", "lon": "12.2798", "name": "Göteborg Landvetter", "city": "Gothenburg", "country": "Sweden", "tz": "Europe/Stockholm", "iso": "SE" },
      "Paris": { "lat": "48.8566", "lon": "2.3522", "city": "Paris", "country": "France", "iso": "FR" },
      "London": { "lat": "51.5074", "lon": "-0.1278", "city": "London", "country": "England", "iso": "GB-ENG" },
      "Manchester": { "lat": "53.4808", "lon": "-2.2426", "city": "Manchester", "country": "England", "iso": "GB-ENG" },
      "Birmingham": { "lat": "52.4862", "lon": "-1.8904", "city": "Birmingham", "country": "England", "iso": "GB-ENG" },
      "Edinburgh": { "lat": "55.9533", "lon": "-3.1883", "city": "Edinburgh", "country": "Scotland", "iso": "GB-SCT" },
      "Glasgow": { "lat": "55.8642", "lon": "-4.2518", "city": "Glasgow", "country": "Scotland", "iso": "GB-SCT" },
      "Cardiff": { "lat": "51.4816", "lon": "-3.1791", "city": "Cardiff", "country": "Wales", "iso": "GB-WLS" },
      "Belfast": { "lat": "54.5973", "lon": "-5.9301", "city": "Belfast", "country": "Northern Ireland", "iso": "GB-NIR" },
      "New York": { "lat": "40.7128", "lon": "-74.0060", "city": "New York", "country": "United States", "iso": "US" },
      "Tokyo": { "lat": "35.6762", "lon": "139.6503", "city": "Tokyo", "country": "Japan", "iso": "JP" },
      "Dubai": { "lat": "25.2048", "lon": "55.2708", "city": "Dubai", "country": "United Arab Emirates", "iso": "AE" },
      "Rome": { "lat": "41.9028", "lon": "12.4964", "city": "Rome", "country": "Italy", "iso": "IT" },
      "Vatican City": { "lat": "41.9029", "lon": "12.4534", "city": "Vatican City", "country": "Vatican City", "iso": "VA" },
      "Vatican": { "lat": "41.9029", "lon": "12.4534", "city": "Vatican City", "country": "Vatican City", "iso": "VA" },
      "Naples": { "lat": "40.8518", "lon": "14.2681", "city": "Naples", "country": "Italy", "iso": "IT" },
      "Napoli": { "lat": "40.8518", "lon": "14.2681", "city": "Naples", "country": "Italy", "iso": "IT" },
      "Capri": { "lat": "40.5518", "lon": "14.2447", "city": "Capri", "country": "Italy", "iso": "IT" },
      "Milan": { "lat": "45.4642", "lon": "9.1900", "city": "Milan", "country": "Italy", "iso": "IT" },
      "Venice": { "lat": "45.4408", "lon": "12.3155", "city": "Venice", "country": "Italy", "iso": "IT" },
      "Florence": { "lat": "43.7696", "lon": "11.2558", "city": "Florence", "country": "Italy", "iso": "IT" },
      "Barcelona": { "lat": "41.3851", "lon": "2.1734", "city": "Barcelona", "country": "Spain", "iso": "ES" },
      "Berlin": { "lat": "52.5200", "lon": "13.4050", "city": "Berlin", "country": "Germany", "iso": "DE" },
      "Amsterdam": { "lat": "52.3676", "lon": "4.9041", "city": "Amsterdam", "country": "Netherlands", "iso": "NL" },
      "Brussels": { "lat": "50.8503", "lon": "4.3517", "city": "Brussels", "country": "Belgium", "iso": "BE" },
      "Singapore": { "lat": "1.3521", "lon": "103.8198", "city": "Singapore", "country": "Singapore", "iso": "SG" },
      "Bali": { "lat": "-8.4095", "lon": "115.1889", "city": "Denpasar", "country": "Indonesia", "iso": "ID" },
      "Sydney": { "lat": "-33.8688", "lon": "151.2093", "city": "Sydney", "country": "Australia", "iso": "AU" },
      "Madrid": { "lat": "40.4168", "lon": "-3.7038", "city": "Madrid", "country": "Spain", "iso": "ES" },
      "Doha": { "lat": "25.2854", "lon": "51.5310", "city": "Doha", "country": "Qatar", "iso": "QA" },
      "Sri Lanka": { "lat": "7.8731", "lon": "80.7718", "city": "Colombo", "country": "Sri Lanka", "iso": "LK" },
      "Colombo": { "lat": "6.9271", "lon": "79.8612", "city": "Colombo", "country": "Sri Lanka", "iso": "LK" },
      "Cambodia": { "lat": "12.5657", "lon": "104.9910", "city": "Phnom Penh", "country": "Cambodia", "iso": "KH" },
      "Phnom Penh": { "lat": "11.5564", "lon": "104.9282", "city": "Phnom Penh", "country": "Cambodia", "iso": "KH" },
      "Stockholm": { "lat": "59.3293", "lon": "18.0686", "city": "Stockholm", "country": "Sweden", "iso": "SE", "tz": "Europe/Stockholm" },
      "Sweden": { "lat": "60.1282", "lon": "18.6435", "city": "Sweden", "country": "Sweden", "iso": "SE" },
      "Malmö": { "lat": "55.6059", "lon": "13.0007", "city": "Malmö", "country": "Sweden", "iso": "SE", "tz": "Europe/Stockholm" },
      "Malmo": { "lat": "55.6059", "lon": "13.0007", "city": "Malmö", "country": "Sweden", "iso": "SE", "tz": "Europe/Stockholm" },
      "Gothenburg": { "lat": "57.7089", "lon": "11.9746", "city": "Gothenburg", "country": "Sweden", "iso": "SE", "tz": "Europe/Stockholm" },
      "Göteborg": { "lat": "57.7089", "lon": "11.9746", "city": "Gothenburg", "country": "Sweden", "iso": "SE", "tz": "Europe/Stockholm" },
      "Tunis": { "lat": "36.8065", "lon": "10.1815", "city": "Tunis", "country": "Tunisia", "iso": "TN", "tz": "Africa/Tunis" },
      "Tunisia": { "lat": "33.8869", "lon": "9.5375", "city": "Tunis", "country": "Tunisia", "iso": "TN", "tz": "Africa/Tunis" }
  };

  // Search local static and prepopulated airport/city data offline-first before triggering external network calls
  function searchLocalAirportData(q) {
      if (!q) return null;
      const queryLower = q.trim().toLowerCase();
      
      // A. Direct IATA exact 3-letter code lookup
      if (queryLower.length === 3) {
          const iataUpper = queryLower.toUpperCase();
          const gps = STATIC_GEO_COORDS[iataUpper];
          if (gps) {
              const details = memoryAirports.get(iataUpper);
              return [{
                  name: details?.airport_name || gps.name || gps.city || iataUpper,
                  latitude: parseFloat(gps.lat),
                  longitude: parseFloat(gps.lon),
                  country: gps.country || details?.country || '',
                  country_code: gps.iso || '',
                  timezone: gps.tz || 'UTC',
                  admin1: details?.city_name || gps.city || ''
              }];
          }
          
          const details = memoryAirports.get(iataUpper);
          if (details) {
              return [{
                  name: details.airport_name || details.city_name,
                  latitude: 0,
                  longitude: 0,
                  country: details.country || '',
                  country_code: '',
                  timezone: 'UTC',
                  admin1: details.city_name
              }];
          }
      }
      
      const results = [];

      // B. Search high-fidelity static airport coordinates first to be extremely fast and robust
      for (const [iata, gps] of Object.entries(STATIC_GEO_COORDS)) {
          if (iata.length === 3) {
              const iataLower = iata.toLowerCase();
              const cityLower = (gps.city || '').toLowerCase();
              const airportLower = (gps.name || '').toLowerCase();
              
              if (iataLower === queryLower || (cityLower && queryLower.length >= 3 && cityLower.startsWith(queryLower)) || (airportLower && queryLower.length >= 3 && airportLower.startsWith(queryLower)) || (cityLower && queryLower === cityLower)) {
                  const details = memoryAirports.get(iata);
                  results.push({
                      name: details?.airport_name || gps.name || gps.city ? `${details?.airport_name || gps.name} (${iata})` : iata,
                      latitude: parseFloat(gps.lat),
                      longitude: parseFloat(gps.lon),
                      country: gps.country || details?.country || '',
                      country_code: gps.iso || '',
                      timezone: gps.tz || 'UTC',
                      admin1: details?.city_name || gps.city || ''
                  });
              }
          }
      }

      // Secondary check of other in-memory database airports to ensure complete coverage
      for (const [iata, details] of memoryAirports.entries()) {
          const iataLower = iata.toLowerCase();
          const cityLower = (details.city_name || '').toLowerCase();
          const airportLower = (details.airport_name || '').toLowerCase();
          
          if (iataLower === queryLower || (queryLower.length >= 3 && (cityLower.startsWith(queryLower) || airportLower.startsWith(queryLower)))) {
              // Only add if not already matched from static coords to avoid duplicates
              if (!results.some(r => r.name.includes(`(${iata})`))) {
                  const gps = STATIC_GEO_COORDS[iata];
                  results.push({
                      name: `${details.airport_name} (${iata})`,
                      latitude: gps ? parseFloat(gps.lat) : 0,
                      longitude: gps ? parseFloat(gps.lon) : 0,
                      country: gps?.country || '',
                      country_code: gps?.iso || '',
                      timezone: gps?.tz || 'UTC',
                      admin1: details.city_name
                  });
              }
          }
      }
      
      // C. Search static city labels directly
      const queryCityPart = queryLower.split(',')[0].trim();
      for (const [key, details] of Object.entries(STATIC_GEO_COORDS)) {
          if (key.length <= 3) continue;
          const keyLower = key.toLowerCase();
          const isCountryEntry = (details.country || '').toLowerCase() === keyLower;

          // Country entries only match if the query is specifically the country itself
          if (isCountryEntry) {
              if (queryLower === keyLower) {
                  results.push({
                      name: details.city || key,
                      latitude: parseFloat(details.lat),
                      longitude: parseFloat(details.lon),
                      country: details.country || '',
                      country_code: details.iso || '',
                      timezone: details.tz || 'UTC',
                      admin1: details.city || ''
                  });
              }
              continue;
          }

          // City entries match exact, city part, or prefix
          if (keyLower === queryLower || keyLower === queryCityPart || queryLower.startsWith(keyLower + ' ') || queryLower.startsWith(keyLower + ',')) {
              // Avoid adding duplicate cities
              if (!results.some(r => r.name.toLowerCase() === (details.city || key).toLowerCase())) {
                  results.push({
                      name: details.city || key,
                      latitude: parseFloat(details.lat),
                      longitude: parseFloat(details.lon),
                      country: details.country || '',
                      country_code: details.iso || '',
                      timezone: details.tz || 'UTC',
                      admin1: details.city || ''
                  });
              }
          }
      }
      
      return results.length > 0 ? results : null;
  }

  // Single multi-endpoint controller supporting /api/proxy/geocoding and /api/geocode/search with PostgreSQL-backed caching
  const handleGeocodingSearch = async (req, res) => {
      const { q, lat, lon } = req.query;
      if (!q || !q.trim()) {
          return res.json({ ok: true, answered: true, results: [] });
      }
      const trimmedQ = q.trim().toLowerCase();
      const biasLat = lat ? parseFloat(lat) : undefined;
      const biasLon = lon ? parseFloat(lon) : undefined;
      const cacheKey = `${trimmedQ}${Number.isFinite(biasLat) && Number.isFinite(biasLon) ? `:${biasLat.toFixed(2)},${biasLon.toFixed(2)}` : ''}`;
      
      // 0. Provider-specific lookups (used by the progressive autocomplete: providers are queried in parallel by the client).
      const provider = String(req.query.provider || '').toLowerCase();
      if (provider) {
          const tag = String(req.query.tag || '');
          const providerKey = `${provider}|${tag}|${cacheKey}`;
          if (memoryGeocoding.has(providerKey)) {
              res.set('X-Cache', 'RAM');
              return res.json({ ok: true, answered: true, provider, results: memoryGeocoding.get(providerKey) });
          }
          try {
              const row = (await pool.query('SELECT results, created_at FROM geocoding_cache WHERE query = $1', [providerKey])).rows[0];
              if (row && Date.now() - new Date(row.created_at).getTime() < GEOCODE_CACHE_TTL_MS) {
                  memoryGeocoding.set(providerKey, row.results);
                  res.set('X-Cache', 'HIT');
                  return res.json({ ok: true, answered: true, provider, results: row.results });
              }
          } catch (dbErr) {
              console.warn('Geocoding provider cache lookup failed:', dbErr.message);
          }

          let providerResults = [];
          if (provider === 'open-meteo') providerResults = await searchOpenMeteo(q.trim());
          else if (provider === 'photon') providerResults = await searchPhoton(q.trim(), { lat: biasLat, lon: biasLon, tag });
          else if (provider === 'nominatim') providerResults = await searchNominatim(q.trim());
          else return res.status(400).json({ ok: false, answered: false, error: 'Unknown provider', results: [] });

          // Only cache non-empty answers so a transient upstream failure is retried on the next keystroke
          if (providerResults.length > 0) {
              memoryGeocoding.set(providerKey, providerResults);
              pool.query(
                  'INSERT INTO geocoding_cache (query, results) VALUES ($1, $2) ON CONFLICT (query) DO UPDATE SET results = $2',
                  [providerKey, JSON.stringify(providerResults)]
              ).catch(e => console.warn('Could not write geocoding provider result to cache:', e.message));
          }
          res.set('X-Cache', 'MISS');
          return res.json({ ok: true, answered: true, provider, results: providerResults });
      }

      // 1. Legacy path: search local airport data first beforehand to avoid external api/geocoding cache contamination for common trips & flights
      const localMatches = searchLocalAirportData(trimmedQ);
      if (localMatches) {
          res.set('X-Cache', 'LOCAL_AIRPORT');
          res.set('X-Answered', 'true');
          return res.json({ ok: true, answered: true, provider: 'local_airport', results: localMatches });
      }

      // 2. Instant RAM Cache (0ms)
      if (memoryGeocoding.has(cacheKey)) {
          res.set('X-Cache', 'RAM');
          res.set('X-Answered', 'true');
          const cached = memoryGeocoding.get(cacheKey);
          return res.json({ ok: true, answered: true, provider: 'cache', results: cached });
      }

      try {
          // 3. Check persistent PostgreSQL geocoding database cache if not matched in RAM
          const cacheLookup = await pool.query('SELECT results, created_at FROM geocoding_cache WHERE query = $1', [cacheKey]);
          if (cacheLookup.rows.length > 0) {
              const row = cacheLookup.rows[0];
              const age = Date.now() - new Date(row.created_at).getTime();
              if (age < GEOCODE_CACHE_TTL_MS) {
                  memoryGeocoding.set(cacheKey, row.results);
                  res.set('X-Cache', 'HIT');
                  res.set('X-Answered', 'true');
                  return res.json({ ok: true, answered: true, provider: 'cache', results: row.results });
              } else {
                  console.log(`[GEOCODE] Cache expired for query: ${cacheKey}`);
              }
          }
      } catch (dbErr) {
          console.warn("Geocoding database cache lookup failed:", dbErr.message);
      }

      // 4. Multi-provider geocoding chain: Open-Meteo -> Photon -> Nominatim (P-03)
      try {
          const chainRes = await searchGeocodingChain(trimmedQ, { lat: biasLat, lon: biasLon });

          if (!chainRes.ok || !chainRes.answered) {
              res.set('X-Answered', 'false');
              return res.status(502).json({
                  ok: false,
                  answered: false,
                  error: chainRes.error || 'Geocoding services did not answer',
                  results: []
              });
          }

          const results = chainRes.results || [];

          // 5. Keep results cached in both RAM and DB for subsequent instantaneous requests (0ms latency)
          memoryGeocoding.set(cacheKey, results);
          try {
              await pool.query(
                  'INSERT INTO geocoding_cache (query, results) VALUES ($1, $2) ON CONFLICT (query) DO UPDATE SET results = $2',
                  [cacheKey, JSON.stringify(results)]
              );
          } catch (dbWriteErr) {
              console.warn("Could not write geocoding result to cache:", dbWriteErr.message);
          }

          res.set('X-Cache', 'MISS');
          res.set('X-Answered', 'true');
          return res.json({
              ok: true,
              answered: true,
              provider: chainRes.provider || 'none',
              results
          });
      } catch (err) {
          console.error("Geocoding chain exception:", err.message);
          res.set('X-Answered', 'false');
          return res.status(502).json({
              ok: false,
              answered: false,
              error: err.message || 'Geocoding failed due to internal error',
              results: []
          });
      }
  };


  // Route handlers for geocoding search
  // Public holidays for the calendar's "Add a country calendar" (Nager.Date, OpenHolidays as fallback).
  app.get('/api/proxy/holidays/countries', holidays.handleCountries);
  app.get('/api/proxy/holidays/:year/:countryCode', holidays.handleHolidays);
  // Exchange rates for trip expenses (Frankfurter, the ECB's reference rates), one day's rate cached for a month.
  app.get('/api/proxy/fx/:date', fxRates.handleRate);
  app.get('/api/proxy/geocoding', handleGeocodingSearch);
  app.get('/api/geocode/search', handleGeocodingSearch);

  // Name of the place at a coordinate (Atlas "Find the name"). Cached upstream by coordinate; a miss is a normal answer.
  app.get('/api/proxy/reverse-geocode', async (req, res) => {
      const lat = Number(req.query.lat);
      const lon = Number(req.query.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
          return res.status(400).json({ ok: false, error: 'lat and lon must be coordinates' });
      }
      const result = await reverseGeocode(lat, lon);
      res.json({ ok: true, answered: result !== null, result });
  });

  // --- Global Search & Lookup Endpoints (External DB / PostgreSQL) ---

  // Lookup single airport by IATA code
  app.get('/api/airports/lookup/:iata', async (req, res) => {
      const { iata } = req.params;
      if (!iata) return res.status(400).json({ error: 'Missing IATA code' });
      const lookupCode = iata.trim().toUpperCase();
      
      // 1. Try DB first
      try {
          const { rows } = await pool.query(
              `SELECT iata, city_name, airport_name FROM global_airports WHERE UPPER(iata) = $1 LIMIT 1`,
              [lookupCode]
          );
          if (rows.length > 0) {
              res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
              return res.json(rows[0]);
          }
      } catch (err) {
          console.warn('Database lookup failed, falling back to in-memory store:', err.message);
      }

      // 2. Try In-Memory Fallback Map
      const cached = memoryAirports.get(lookupCode);
      if (cached) {
          res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
          return res.json(cached);
      }

      res.status(404).json({ error: 'Airport code not found in database or memory cache' });
  });

  // Lookup single carrier by IATA code
  app.get('/api/carriers/lookup/:iata', async (req, res) => {
      const { iata } = req.params;
      if (!iata) return res.status(400).json({ error: 'Missing IATA code' });
      const lookupCode = iata.trim().toUpperCase();
      
      // 1. Try DB first
      try {
          const { rows } = await pool.query(
              `SELECT iata, company_name, country_or_territory FROM global_carriers WHERE UPPER(iata) = $1 LIMIT 1`,
              [lookupCode]
          );
          if (rows.length > 0) {
              res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
              return res.json(rows[0]);
          }
      } catch (err) {
          console.warn('Database carrier lookup failed, falling back to in-memory store:', err.message);
      }

      // 2. Try In-Memory Fallback Map
      const cached = memoryCarriers.get(lookupCode);
      if (cached) {
          res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
          return res.json(cached);
      }

      res.status(404).json({ error: 'Carrier code not found in database or memory cache' });
  });

  // Search airports by query term
  // In-memory airport search over the RAM dataset (AGENTS.md §1): no DB round trip or table scan per keystroke (PERF-013).
  function searchAirportsInMemory(q) {
      const lowerQuery = q.toLowerCase();
      const results = [];
      for (const [iata, details] of memoryAirports.entries()) {
          const isIataMatch = iata.toLowerCase() === lowerQuery;
          const isIataPartial = iata.toLowerCase().includes(lowerQuery);
          const isCityMatch = (details.city_name || '').toLowerCase().includes(lowerQuery);
          const isAirportMatch = (details.airport_name || '').toLowerCase().includes(lowerQuery);

          if (isIataMatch || isIataPartial || isCityMatch || isAirportMatch) {
              results.push({
                  iata: details.iata,
                  city_name: details.city_name,
                  airport_name: details.airport_name,
                  score: isIataMatch ? 1 : isIataPartial ? 2 : isCityMatch ? 3 : 4
              });
          }
      }
      results.sort((a,b) => a.score - b.score);
      return results.slice(0, 15).map(({score, ...rest}) => rest);
  }

  app.get('/api/airports/search', async (req, res) => {
      const q = (req.query.q || '').trim();
      if (!q || q.length < 2) {
          return res.json([]);
      }
      
      // 1. RAM first; the database is only consulted before the in-memory maps are loaded.
      if (memoryAirports.size > 0) return res.json(searchAirportsInMemory(q));

      // 1. Try DB first
      try {
          const searchPattern = `%${q.toLowerCase()}%`;
          const { rows } = await pool.query(
              `SELECT iata, city_name, airport_name 
               FROM global_airports 
               WHERE LOWER(iata) = LOWER($1)
                  OR LOWER(iata) LIKE $2
                  OR LOWER(city_name) LIKE $2
                  OR LOWER(airport_name) LIKE $2
               ORDER BY 
                  CASE WHEN LOWER(iata) = LOWER($1) THEN 1
                       WHEN LOWER(iata) LIKE $2 THEN 2
                       WHEN LOWER(city_name) LIKE $2 THEN 3
                       ELSE 4
                  END
               LIMIT 15`,
              [q, searchPattern]
          );
          return res.json(rows);
      } catch (err) {
          console.warn('Database airport search failed, searching in-memory cache:', err.message);
      }

      // 2. Database unavailable: answer from memory (possibly empty)
      res.json(searchAirportsInMemory(q));
  });

  // Search carriers by query term
  // In-memory carrier search over the RAM dataset (AGENTS.md §1): no DB round trip or table scan per keystroke (PERF-013).
  function searchCarriersInMemory(q) {
      const lowerQuery = q.toLowerCase();
      const results = [];
      for (const [iata, details] of memoryCarriers.entries()) {
          const isIataMatch = iata.toLowerCase() === lowerQuery;
          const isIataPartial = iata.toLowerCase().includes(lowerQuery);
          const isCompanyMatch = (details.company_name || '').toLowerCase().includes(lowerQuery);

          if ((isIataMatch && iata !== '') || isIataPartial || isCompanyMatch) {
              results.push({
                  iata: details.iata,
                  company_name: details.company_name,
                  country_or_territory: details.country_or_territory,
                  score: isIataMatch ? 1 : isCompanyMatch ? 2 : 3
              });
          }
      }
      results.sort((a,b) => a.score - b.score);
      return results.slice(0, 15).map(({score, ...rest}) => rest);
  }

  app.get('/api/carriers/search', async (req, res) => {
      const q = (req.query.q || '').trim();
      if (!q || q.length < 1) {
          return res.json([]);
      }
      
      // 1. RAM first; the database is only consulted before the in-memory maps are loaded.
      if (memoryCarriers.size > 0) return res.json(searchCarriersInMemory(q));

      // 1. Try DB first
      try {
          const searchPattern = `%${q.toLowerCase()}%`;
          const { rows } = await pool.query(
              `SELECT iata, company_name, country_or_territory 
               FROM global_carriers 
               WHERE (LOWER(iata) = LOWER($1) AND iata <> '')
                  OR LOWER(iata) LIKE $2
                  OR LOWER(company_name) LIKE $2
               ORDER BY 
                  CASE WHEN LOWER(iata) = LOWER($1) THEN 1
                       WHEN LOWER(company_name) LIKE $2 THEN 2
                       ELSE 3
                  END
               LIMIT 15`,
              [q, searchPattern]
          );
          return res.json(rows);
      } catch (err) {
          console.warn('Database carrier search failed, searching in-memory cache:', err.message);
      }

      // 2. Database unavailable: answer from memory (possibly empty)
      res.json(searchCarriersInMemory(q));
  });

  // Calendar Sync Endpoint (iCal Feed)
};
