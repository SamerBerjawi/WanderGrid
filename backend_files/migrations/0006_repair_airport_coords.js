'use strict';

const { getAirportCoords, extractIataCode, haversineKm } = require('../airportCoords');

const REPAIR_TOLERANCE_KM = 100;
const LEGACY_OR_PROVIDER_IATA_QUERY = /^(?:[a-z-]+\|[^|]*\|)?[a-z]{3}(?:\s+airport)?(?::[-0-9.,]+)?$/i;

function repairEndpoint(next, textField, latField, lngField, geoKeyField) {
  const code = extractIataCode(next[textField]);
  if (!code) return false;
  const auth = getAirportCoords(code);
  if (!auth) return false;

  const rawLat = next[latField];
  const rawLng = next[lngField];
  if (rawLat == null || rawLng == null || rawLat === '' || rawLng === '') return false;

  const lat = Number(rawLat);
  const lng = Number(rawLng);
  const isZero = lat === 0 && lng === 0;
  const needsRepair = !Number.isFinite(lat) || !Number.isFinite(lng) || isZero || haversineKm(lat, lng, auth.lat, auth.lng) > REPAIR_TOLERANCE_KM;
  if (!needsRepair) return false;

  next[latField] = auth.lat;
  next[lngField] = auth.lng;
  if (next[geoKeyField] !== undefined) {
    next[geoKeyField] = next[textField];
  }
  return true;
}

function repairFlightLeg(leg) {
  if (!leg || typeof leg !== 'object') return { leg, changed: false };
  if (leg.mode && leg.mode !== 'Flight') return { leg, changed: false };

  const next = { ...leg };
  const changedOrigin = repairEndpoint(next, 'origin', 'originLat', 'originLng', 'originGeoKey');
  const changedDest = repairEndpoint(next, 'destination', 'destLat', 'destLng', 'destGeoKey');
  return { leg: changedOrigin || changedDest ? next : leg, changed: changedOrigin || changedDest };
}

async function tableExists(client, tableName) {
  const res = await client.query(
    'SELECT table_name FROM information_schema.tables WHERE table_name = $1',
    [tableName]
  );
  return res.rows.length > 0;
}

module.exports = {
  description: 'repair mis-geocoded airport coordinates on flights, trips, and geocoding cache',
  async up(client) {
    if (await tableExists(client, 'flights')) {
      const flights = await client.query('SELECT id, data FROM flights');
      for (const row of flights.rows) {
        const { leg, changed } = repairFlightLeg(row.data);
        if (changed) {
          await client.query('UPDATE flights SET data = $2 WHERE id = $1', [row.id, JSON.stringify(leg)]);
        }
      }
    }

    if (await tableExists(client, 'trips')) {
      const trips = await client.query('SELECT id, data FROM trips');
      for (const row of trips.rows) {
        const d = row.data;
        if (!d || !Array.isArray(d.transports)) continue;
        let tripChanged = false;
        const transports = d.transports.map((t) => {
          const repaired = repairFlightLeg(t);
          if (repaired.changed) tripChanged = true;
          return repaired.leg;
        });
        if (tripChanged) {
          await client.query('UPDATE trips SET data = $2 WHERE id = $1', [row.id, JSON.stringify({ ...d, transports })]);
        }
      }
    }

    if (await tableExists(client, 'geocoding_cache')) {
      const cached = await client.query('SELECT query, results FROM geocoding_cache');
      for (const row of cached.rows) {
        const query = String(row.query || '');
        const hasZeroCoord = Array.isArray(row.results) && row.results.some(
          (r) => r && Number(r.latitude) === 0 && Number(r.longitude) === 0
        );
        if (LEGACY_OR_PROVIDER_IATA_QUERY.test(query) || hasZeroCoord) {
          await client.query('DELETE FROM geocoding_cache WHERE query = $1', [row.query]);
        }
      }
    }
  },
};
