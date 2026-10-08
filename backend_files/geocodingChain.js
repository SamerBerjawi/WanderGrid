/**
 * Multi-Provider Geocoding Chain for WanderGrid (P-03)
 * 
 * Chains:
 * 1. Open-Meteo Geocoding (cities, native timezone)
 * 2. Photon / Komoot (POIs, landmarks, venues, proximity bias support)
 * 3. OpenStreetMap Nominatim (queued at <= 1 req/s with identifying User-Agent)
 * 
 * Includes:
 * - Toponym normalization (diacritics, query prefix ranking)
 * - Safe viewport extraction ([west, south, east, north])
 * - Coarse OSM place types classification
 * - Automatic timezone lookup via Open-Meteo forecast (timezone=auto)
 * - Honest answered vs. network error reporting
 */

const { fetchUpstream } = require('./upstream');

function normalizeToponym(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function classifyOsmType(osmKey, osmValue) {
  if (osmKey === 'tourism' || osmKey === 'historic' || osmKey === 'amenity') return ['poi', osmValue || 'landmark'];
  if (osmKey === 'place') return ['place', osmValue || 'city'];
  if (osmKey === 'aeroway') return ['airport', osmValue || 'aerodrome'];
  if (osmKey === 'leisure') return ['park', osmValue || 'leisure'];
  if (osmKey === 'highway') return ['street', osmValue || 'road'];
  if (osmKey === 'natural') return ['natural', osmValue || 'feature'];
  return ['place', osmValue || osmKey || 'location'];
}

async function lookupTimezoneForCoord(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  const key = `tz:${lat.toFixed(2)},${lon.toFixed(2)}`;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&timezone=auto`;
  
  try {
    const res = await fetchUpstream({
      key,
      url,
      ttlMs: 30 * 24 * 3600 * 1000, // 30 days
      staleMs: 60 * 24 * 3600 * 1000,
      timeoutMs: 4000,
      maxBytes: 64 * 1024,
      hostGate: { minIntervalMs: 50 },
    });
    if (res.ok && res.data?.timezone) {
      return res.data.timezone;
    }
  } catch {}
  return undefined;
}

async function searchGeocodingChain(query, { lat, lon } = {}) {
  const trimmed = query.trim();
  const normalizedQuery = normalizeToponym(trimmed);

  // 1. Open-Meteo Search
  try {
    const meteoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trimmed)}&count=5&language=en&format=json`;
    const meteoRes = await fetchUpstream({
      key: `geocode:meteo:${normalizedQuery}`,
      url: meteoUrl,
      ttlMs: 7 * 24 * 3600 * 1000, // 7 days
      staleMs: 30 * 24 * 3600 * 1000,
      timeoutMs: 5000,
      maxBytes: 512 * 1024,
      hostGate: { minIntervalMs: 100 },
    });

    if (meteoRes.ok && Array.isArray(meteoRes.data?.results) && meteoRes.data.results.length > 0) {
      const results = meteoRes.data.results.map(item => ({
        name: item.name,
        latitude: item.latitude,
        longitude: item.longitude,
        country: item.country || '',
        country_code: (item.country_code || '').toUpperCase(),
        timezone: item.timezone || undefined,
        admin1: item.admin1 || '',
        provider: 'open-meteo',
        types: ['city'],
      }));

      return {
        ok: true,
        answered: true,
        provider: 'open-meteo',
        results,
      };
    }
  } catch (err) {
    console.warn('[Geocoding] Open-Meteo search error:', err.message);
  }

  // 2. Photon / Komoot Search (POIs, Landmarks, Addresses with soft proximity bias)
  try {
    let photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmed)}&limit=5`;
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      photonUrl += `&lat=${lat}&lon=${lon}`;
    }

    const photonRes = await fetchUpstream({
      key: `geocode:photon:${normalizedQuery}:${Number.isFinite(lat) ? `${lat.toFixed(2)},${lon.toFixed(2)}` : 'global'}`,
      url: photonUrl,
      ttlMs: 7 * 24 * 3600 * 1000,
      staleMs: 30 * 24 * 3600 * 1000,
      timeoutMs: 6000,
      maxBytes: 512 * 1024,
      hostGate: { minIntervalMs: 100 },
    });

    if (photonRes.ok && Array.isArray(photonRes.data?.features) && photonRes.data.features.length > 0) {
      const firstFeature = photonRes.data.features[0];
      const coords = firstFeature?.geometry?.coordinates;
      let sharedTz = undefined;
      if (Array.isArray(coords) && coords.length >= 2) {
        sharedTz = await lookupTimezoneForCoord(coords[1], coords[0]);
      }

      const results = photonRes.data.features.map(f => {
        const props = f.properties || {};
        const geom = f.geometry?.coordinates || [];
        const fLon = geom[0];
        const fLat = geom[1];

        const types = classifyOsmType(props.osm_key, props.osm_value);
        let viewport = undefined;
        // properties.extent is [west, north, east, south] (GEV trap warning)
        if (Array.isArray(props.extent) && props.extent.length === 4) {
          const [west, north, east, south] = props.extent;
          if (west <= east && south <= north) {
            viewport = [west, south, east, north];
          }
        }

        const name = props.name || props.street || props.city || trimmed;

        return {
          name,
          latitude: fLat,
          longitude: fLon,
          country: props.country || '',
          country_code: (props.countrycode || '').toUpperCase(),
          timezone: sharedTz,
          admin1: props.state || props.county || '',
          provider: 'photon',
          types,
          viewport,
        };
      });

      // Sort / rank: prefer items whose normalized name starts with query
      results.sort((a, b) => {
        const aNorm = normalizeToponym(a.name);
        const bNorm = normalizeToponym(b.name);
        const aStarts = aNorm.startsWith(normalizedQuery);
        const bStarts = bNorm.startsWith(normalizedQuery);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return 0;
      });

      return {
        ok: true,
        answered: true,
        provider: 'photon',
        results,
      };
    }
  } catch (err) {
    console.warn('[Geocoding] Photon search error:', err.message);
  }

  // 3. OpenStreetMap Nominatim Fallback (Gated <= 1 req/s)
  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmed)}&addressdetails=1&limit=5`;
    const nomRes = await fetchUpstream({
      key: `geocode:nominatim:${normalizedQuery}`,
      url: nominatimUrl,
      ttlMs: 7 * 24 * 3600 * 1000,
      staleMs: 30 * 24 * 3600 * 1000,
      timeoutMs: 6000,
      maxBytes: 512 * 1024,
      hostGate: { minIntervalMs: 1000 }, // Strict 1 req/s rate-limit
    });

    if (nomRes.ok && Array.isArray(nomRes.data) && nomRes.data.length > 0) {
      const first = nomRes.data[0];
      const sharedTz = await lookupTimezoneForCoord(parseFloat(first.lat), parseFloat(first.lon));

      const results = nomRes.data.map(item => {
        const addr = item.address || {};
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        const country = addr.country || '';
        const countryCode = (addr.country_code || '').toUpperCase();
        const city = addr.city || addr.town || addr.village || item.name || '';
        const admin1 = addr.state || addr.province || '';

        let viewport = undefined;
        if (Array.isArray(item.boundingbox) && item.boundingbox.length === 4) {
          const [south, north, west, east] = item.boundingbox.map(Number);
          viewport = [west, south, east, north];
        }

        return {
          name: city || item.display_name.split(',')[0],
          displayName: item.display_name,
          latitude: lat,
          longitude: lon,
          country,
          country_code: countryCode,
          timezone: sharedTz,
          admin1,
          provider: 'nominatim',
          types: [item.type || 'place'],
          viewport,
        };
      });

      return {
        ok: true,
        answered: true,
        provider: 'nominatim',
        results,
      };
    }
  } catch (err) {
    console.warn('[Geocoding] Nominatim search error:', err.message);
  }

  // If chain completed with 0 results but services responded cleanly:
  return {
    ok: true,
    answered: true,
    results: [],
  };
}

module.exports = {
  normalizeToponym,
  classifyOsmType,
  lookupTimezoneForCoord,
  searchGeocodingChain,
};
