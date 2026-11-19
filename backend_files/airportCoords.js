'use strict';

const fs = require('fs');
const path = require('path');

const CANDIDATE_PATHS = [
  path.join(__dirname, 'client_build', 'data', 'airport-runways.json'),
  path.join(__dirname, '..', 'public', 'data', 'airport-runways.json'),
];

let cachedCoordsMap = null;

function isValidLatLng(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/**
 * Lazily loads ground-truth airport runway coordinates from airport-runways.json
 * and caches a Map<IATA, { lat, lng }> in memory.
 */
function getAirportCoordsMap() {
  if (cachedCoordsMap) return cachedCoordsMap;

  const map = new Map();
  let filePath = null;
  for (const candidate of CANDIDATE_PATHS) {
    if (fs.existsSync(candidate)) {
      filePath = candidate;
      break;
    }
  }

  if (!filePath) {
    console.warn('airportCoords: airport-runways.json not found in candidate paths; airport coordinate map is empty.');
    cachedCoordsMap = map;
    return cachedCoordsMap;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (data && typeof data === 'object') {
      for (const [rawKey, runways] of Object.entries(data)) {
        const key = String(rawKey || '').trim().toUpperCase();
        if (!/^[A-Z]{3}$/.test(key)) continue;
        if (!Array.isArray(runways) || runways.length === 0) continue;
        const first = runways[0];
        if (!first || !Array.isArray(first.start) || !Array.isArray(first.end)) continue;
        if (first.start.length < 2 || first.end.length < 2) continue;
        const lng = (Number(first.start[0]) + Number(first.end[0])) / 2;
        const lat = (Number(first.start[1]) + Number(first.end[1])) / 2;
        if (isValidLatLng(lat, lng)) {
          map.set(key, { lat, lng });
        }
      }
    }
  } catch (err) {
    console.warn(`airportCoords: failed to read or parse ${filePath}:`, err.message);
  }

  cachedCoordsMap = map;
  return cachedCoordsMap;
}

/**
 * Looks up authoritative runway centroid coordinates for a 3-letter IATA airport code.
 */
function getAirportCoords(code) {
  const clean = String(code || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(clean)) return null;
  return getAirportCoordsMap().get(clean) || null;
}

/**
 * Extracts a 3-letter uppercase IATA code from an exact code ("MLA") or prefixed label ("MLA - Luqa International").
 */
function extractIataCode(raw) {
  const clean = String(raw || '').trim();
  if (!clean) return null;
  if (/^[A-Za-z]{3}$/.test(clean)) return clean.toUpperCase();
  const match = clean.match(/^([A-Za-z]{3})\s*-\s*/);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Great-circle distance in kilometers between two WGS84 coordinates.
 */
function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports = {
  getAirportCoordsMap,
  getAirportCoords,
  extractIataCode,
  haversineKm,
};
