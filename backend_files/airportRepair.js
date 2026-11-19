'use strict';
/**
 * Runs after every airport data refresh (weekly and from Settings > Data > Refresh):
 *
 *  1. repairStoredAirportCoords: saved flight legs whose airport position is missing, (0, 0) or more than
 *     REPAIR_TOLERANCE_KM from the airport's reference position get the reference position written back into
 *     the flight or trip record (version bumped, so open clients pick the change up). Positions within the
 *     tolerance are left alone.
 *  2. retryFailedRoutes: road/rail/ferry legs the router answered with "no route" are forgotten, so the next
 *     time they are shown they are traced again. Good routes and "too long" answers are kept.
 */
const { extractIataCode, haversineKm, getAirportCoords } = require('./airportCoords');

const REPAIR_TOLERANCE_KM = 100;

const validCoord = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

/** Reference position for an IATA code: the airport table first, the bundled runway dataset second. */
function referenceCoords(memoryAirports, code) {
  const rec = memoryAirports.get(code);
  const lat = Number(rec?.latitude);
  const lng = Number(rec?.longitude);
  if (rec && rec.latitude != null && validCoord(lat, lng)) return { lat, lng };
  return getAirportCoords(code);
}

function repairEnd(leg, textField, latField, lngField, geoKeyField, lookup) {
  const code = extractIataCode(leg[textField]);
  if (!code) return false;
  const ref = lookup(code);
  if (!ref) return false;
  const missing = leg[latField] == null || leg[lngField] == null || leg[latField] === '' || leg[lngField] === '';
  const lat = Number(leg[latField]);
  const lng = Number(leg[lngField]);
  const wrong = missing || !validCoord(lat, lng) || haversineKm(lat, lng, ref.lat, ref.lng) > REPAIR_TOLERANCE_KM;
  if (!wrong) return false;
  leg[latField] = ref.lat;
  leg[lngField] = ref.lng;
  leg[geoKeyField] = leg[textField];
  return true;
}

/** Returns { leg, changed }. Only flight legs are touched (a road leg's "MLA" is not an airport). */
function repairFlightLeg(leg, lookup) {
  if (!leg || typeof leg !== 'object') return { leg, changed: false };
  if (leg.mode && leg.mode !== 'Flight') return { leg, changed: false };
  const next = { ...leg };
  const a = repairEnd(next, 'origin', 'originLat', 'originLng', 'originGeoKey', lookup);
  const b = repairEnd(next, 'destination', 'destLat', 'destLng', 'destGeoKey', lookup);
  return a || b ? { leg: next, changed: true } : { leg, changed: false };
}

const bump = (data) => ({ ...data, version: (Number(data.version) || 0) + 1, updatedAt: new Date().toISOString() });

async function repairStoredAirportCoords(pool, memoryAirports, log = console) {
  const lookup = (code) => referenceCoords(memoryAirports, code);
  let flights = 0;
  let trips = 0;
  let legs = 0;

  const flightRows = (await pool.query('SELECT id, data FROM flights')).rows;
  for (const row of flightRows) {
    const { leg, changed } = repairFlightLeg(row.data, lookup);
    if (!changed) continue;
    await pool.query('UPDATE flights SET data = $2 WHERE id = $1', [row.id, JSON.stringify(bump(leg))]);
    flights++;
    legs++;
  }

  const tripRows = (await pool.query('SELECT id, data FROM trips')).rows;
  for (const row of tripRows) {
    const d = row.data;
    if (!d || !Array.isArray(d.transports)) continue;
    let fixed = 0;
    const transports = d.transports.map((t) => {
      const r = repairFlightLeg(t, lookup);
      if (r.changed) fixed++;
      return r.leg;
    });
    if (!fixed) continue;
    await pool.query('UPDATE trips SET data = $2 WHERE id = $1', [row.id, JSON.stringify(bump({ ...d, transports }))]);
    trips++;
    legs += fixed;
  }

  if (legs) log.log(`[AIRPORTS] Repaired ${legs} airport position(s) on ${flights} flight(s) and ${trips} trip(s).`);
  return { flights, trips, legs };
}

async function retryFailedRoutes(pool, routeService, log = console) {
  const { rows } = await pool.query('SELECT route_key, payload FROM cached_routes');
  const failed = rows.filter((r) => r.payload && r.payload.status === 'none' && r.payload.reason !== 'too_long').map((r) => r.route_key);
  for (const key of failed) {
    await pool.query('DELETE FROM cached_routes WHERE route_key = $1', [key]);
  }
  if (routeService && typeof routeService.clearBackoff === 'function') routeService.clearBackoff();
  if (failed.length) log.log(`[ROUTES] Cleared ${failed.length} failed route(s); they are traced again when next shown.`);
  return { routes: failed.length };
}

module.exports = { REPAIR_TOLERANCE_KM, referenceCoords, repairFlightLeg, repairStoredAirportCoords, retryFailedRoutes };
