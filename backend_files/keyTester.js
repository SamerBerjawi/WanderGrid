/**
 * Tests a workspace API key against its provider (Settings › Integrations). The key is read on the
 * server and never returned; the answer says only whether the provider accepted it.
 */

const TIMEOUT_MS = 6000;

const SERVICES = {
  aviationstack: {
    name: 'AviationStack',
    request: (key) => {
      const url = new URL('https://api.aviationstack.com/v1/airlines');
      url.searchParams.set('access_key', key);
      url.searchParams.set('limit', '1');
      return { url: url.toString(), headers: {} };
    },
    // AviationStack answers an invalid key with an error object, sometimes on a 200.
    rejects: (body) => (body && body.error ? String(body.error.message || body.error.code || 'Key rejected') : ''),
  },
  aerodatabox: {
    name: 'AeroDataBox',
    request: (key, ctx) => ({
      url: `${ctx.baseUrl}/airports/iata/LHR`,
      headers: { [ctx.authHeader]: key, ...(ctx.host ? { 'x-rapidapi-host': ctx.host } : {}) },
    }),
  },
  openaip: {
    name: 'OpenAIP',
    request: (key) => ({
      url: 'https://api.tiles.openaip.net/api/data/openaip/0/0/0.pbf',
      headers: { 'x-openaip-api-key': key, accept: 'application/x-protobuf' },
    }),
    okStatuses: [200, 204],
  },
  brandfetch: {
    name: 'Brandfetch',
    request: (key) => ({
      url: `https://cdn.brandfetch.io/google.com?c=${encodeURIComponent(key)}&type=icon&fallback=404&h=32&w=32`,
      headers: {},
    }),
  },
};

const SERVICE_KEYS = Object.keys(SERVICES);

async function testKey(service, key, ctx = {}, fetchImpl = globalThis.fetch) {
  const config = SERVICES[service];
  if (!config) throw new Error(`Unknown service: ${service}`);
  if (!key) return { service, name: config.name, success: false, latencyMs: 0, message: 'No key is set.' };
  const { url, headers } = config.request(key, ctx);
  const started = Date.now();
  try {
    const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const latencyMs = Date.now() - started;
    const okStatuses = config.okStatuses || null;
    let ok = okStatuses ? okStatuses.includes(res.status) : res.ok;
    let problem = '';
    if (ok && config.rejects) {
      const body = await res.json().catch(() => null);
      problem = config.rejects(body);
      if (problem) ok = false;
    }
    if (ok) return { service, name: config.name, success: true, latencyMs, message: `${config.name} accepted the key` };
    const denied = res.status === 401 || res.status === 403;
    return {
      service,
      name: config.name,
      success: false,
      latencyMs,
      message: problem || (denied ? `${config.name} rejected the key` : `${config.name} returned HTTP ${res.status}`),
    };
  } catch (err) {
    return { service, name: config.name, success: false, latencyMs: Date.now() - started, message: `${config.name} could not be reached` };
  }
}

module.exports = { SERVICE_KEYS, testKey };
