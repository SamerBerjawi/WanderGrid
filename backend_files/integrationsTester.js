/**
 * Integrations Provider Tester (P-06)
 * Tests live status, connectivity, and latency for WanderGrid's external data providers
 */

const { fetchUpstream } = require('./upstream.js');

const PROVIDER_CONFIGS = {
  adsbdb: {
    name: 'ADSBdb Flight Telemetry',
    category: 'Flight Telemetry',
    getUrl: () => 'https://api.adsbdb.com/v0/callsign/AFR006',
    timeoutMs: 4000,
    minIntervalMs: 500
  },
  osrm: {
    name: 'FOSSGIS OSRM Road Routing',
    category: 'Road Routing',
    getUrl: () => 'https://routing.openstreetmap.de/routed-car/route/v1/driving/2.3522,48.8566;2.3600,48.8600?overview=false',
    timeoutMs: 5000,
    minIntervalMs: 1000
  },
  geocoding: {
    name: 'Open-Meteo Geocoding Chain',
    category: 'Location & Timezones',
    getUrl: () => 'https://geocoding-api.open-meteo.com/v1/search?name=London&count=1&language=en&format=json',
    timeoutMs: 4000,
    minIntervalMs: 200
  },
  openfreemap: {
    name: 'OpenFreeMap Vector Tiles',
    category: 'Vector Basemaps',
    getUrl: () => 'https://tiles.openfreemap.org/styles/liberty',
    timeoutMs: 4000,
    minIntervalMs: 200
  },
  gibs: {
    name: 'NASA GIBS Satellite Imagery',
    category: 'Atmosphere & Earth',
    getUrl: () => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const yesterday = d.toISOString().split('T')[0];
      return `https://gibs-a.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA21_CorrectedReflectance_TrueColor/default/${yesterday}/GoogleMapsCompatible_Level9/0/0/0.jpg`;
    },
    timeoutMs: 5000,
    minIntervalMs: 200
  }
};

async function testProvider(providerKey, customFetch = fetchUpstream) {
  const config = PROVIDER_CONFIGS[providerKey];
  if (!config) {
    throw new Error(`Unknown provider: ${providerKey}`);
  }

  const startTime = Date.now();
  const targetUrl = config.getUrl();

  const result = await customFetch(targetUrl, {
    timeoutMs: config.timeoutMs,
    hostMinIntervalMs: config.minIntervalMs,
    maxBytes: 1024 * 1024
  });

  const latencyMs = Date.now() - startTime;
  const isSuccess = result.status >= 200 && result.status < 300;

  return {
    provider: providerKey,
    name: config.name,
    category: config.category,
    success: isSuccess,
    status: result.status,
    latencyMs,
    message: isSuccess ? `${config.name} operational` : `${config.name} returned HTTP ${result.status}`
  };
}

module.exports = {
  PROVIDER_CONFIGS,
  testProvider
};
