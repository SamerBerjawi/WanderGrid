/**
 * Shared Upstream Helper for WanderGrid Backend
 * 
 * Provides:
 * - Per-host rate gating (minimum interval between calls)
 * - In-flight request coalescing (identical concurrent requests share one upstream fetch)
 * - LRU RAM caching with configurable TTL
 * - Serve-stale on 5xx or transport failure (up to staleMs)
 * - Negative-cache only for definitive 404 / empty responses
 * - Hard response byte capping with streaming truncation guard
 * - Clear outcome metrics: 'hit' | 'miss' | 'stale' | 'notfound' | 'error'
 */

const MAX_LRU_ENTRIES = 1000;
const memoryCache = new Map();
const inFlightRequests = new Map();
const hostQueues = new Map(); // host -> Promise chain / lastCall timestamp

class MaxBytesExceededError extends Error {
  constructor(maxBytes) {
    super(`Response exceeded maximum allowed size of ${maxBytes} bytes`);
    this.name = 'MaxBytesExceededError';
    this.code = 'MAX_BYTES_EXCEEDED';
  }
}

/**
 * Ensures minimum interval between requests to the same hostname.
 */
async function scheduleHostRequest(hostname, minIntervalMs = 0, signal = null) {
  if (!minIntervalMs || minIntervalMs <= 0) return;

  let hostState = hostQueues.get(hostname);
  if (!hostState) {
    hostState = { nextAvailableAt: 0, queueLength: 0 };
    hostQueues.set(hostname, hostState);
  }

  if (hostState.queueLength >= 50) {
    throw new Error(`Upstream queue limit exceeded for host ${hostname}`);
  }

  hostState.queueLength++;
  const now = Date.now();
  const scheduledTime = Math.max(now, hostState.nextAvailableAt);
  hostState.nextAvailableAt = scheduledTime + minIntervalMs;

  const waitMs = scheduledTime - now;
  try {
    if (waitMs > 0) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, waitMs);
        if (signal) {
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('Request aborted while waiting in host queue'));
          }, { once: true });
        }
      });
    }
    if (signal?.aborted) {
      throw new Error('Request aborted');
    }
  } finally {
    hostState.queueLength = Math.max(0, hostState.queueLength - 1);
  }
}

/**
 * Evict oldest entries if cache exceeds capacity.
 */
function enforceCacheCapacity() {
  if (memoryCache.size > MAX_LRU_ENTRIES) {
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey) memoryCache.delete(oldestKey);
  }
}

/**
 * Reads a fetch Response stream up to maxBytes.
 */
async function readBodyCapped(response, maxBytes) {
  if (!response.body) {
    const text = await response.text();
    if (maxBytes && Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw new MaxBytesExceededError(maxBytes);
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.length;
      if (maxBytes && totalBytes > maxBytes) {
        await reader.cancel('Max bytes exceeded');
        throw new MaxBytesExceededError(maxBytes);
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err.name !== 'MaxBytesExceededError') {
      try { await reader.cancel(err.message); } catch {}
    }
    throw err;
  }

  const concatenated = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
  return concatenated.toString('utf8');
}

/**
 * Main fetchUpstream coordinator
 */
async function fetchUpstream({
  key,
  url,
  headers = {},
  ttlMs = 60000,
  staleMs = 300000,
  timeoutMs = 8000,
  maxBytes = 5 * 1024 * 1024, // 5MB default cap
  hostGate = { minIntervalMs: 0 },
  negativeTtlMs = 60000,
  fetchImpl = globalThis.fetch,
}) {
  const cacheKey = key || url;
  const now = Date.now();

  // 1. Check Cache
  const cached = memoryCache.get(cacheKey);
  if (cached) {
    // Fresh hit
    if (now < cached.expiresAt) {
      if (cached.isNegative) {
        return {
          ok: false,
          status: cached.status || 404,
          data: cached.data || null,
          outcome: 'notfound',
          answered: true,
          stale: false,
        };
      }
      return {
        ok: true,
        status: cached.status || 200,
        data: cached.data,
        outcome: 'hit',
        answered: true,
        stale: false,
      };
    }
  }

  // 2. In-Flight Coalescing
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  // 3. Execute Fetch wrapped in promise for coalescing
  const fetchPromise = (async () => {
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (e) {
      clearTimeout(timeoutTimer);
      return {
        ok: false,
        status: 400,
        data: null,
        outcome: 'error',
        answered: false,
        error: `Invalid URL: ${e.message}`,
      };
    }

    try {
      // Host rate-gate queue
      if (hostGate?.minIntervalMs > 0) {
        await scheduleHostRequest(parsedUrl.hostname, hostGate.minIntervalMs, controller.signal);
      }

      const defaultHeaders = {
        'User-Agent': 'WanderGrid/1.0 (Travel Intelligence Platform; +https://wandergrid.app)',
        ...headers,
      };

      const res = await fetchImpl(url, {
        headers: defaultHeaders,
        signal: controller.signal,
      });

      clearTimeout(timeoutTimer);

      // Handle 404 / Definitive Not Found -> Negative Cache
      if (res.status === 404) {
        let errBody = null;
        try {
          const raw = await readBodyCapped(res, 64 * 1024);
          errBody = JSON.parse(raw);
        } catch {}

        if (negativeTtlMs > 0) {
          memoryCache.set(cacheKey, {
            data: errBody,
            status: 404,
            cachedAt: Date.now(),
            expiresAt: Date.now() + negativeTtlMs,
            staleUntil: Date.now() + negativeTtlMs,
            isNegative: true,
          });
          enforceCacheCapacity();
        }

        return {
          ok: false,
          status: 404,
          data: errBody,
          outcome: 'notfound',
          answered: true,
          stale: false,
        };
      }

      // Handle 5xx Upstream Server Errors -> Try serve stale
      if (res.status >= 500) {
        if (cached && now < cached.staleUntil && !cached.isNegative) {
          return {
            ok: true,
            status: cached.status || 200,
            data: cached.data,
            outcome: 'stale',
            answered: true,
            stale: true,
          };
        }
        return {
          ok: false,
          status: res.status,
          data: null,
          outcome: 'error',
          answered: true,
          error: `Upstream error HTTP ${res.status}`,
        };
      }

      // Read capped body
      const rawText = await readBodyCapped(res, maxBytes);
      let parsedData = rawText;
      const contentType = res.headers?.get?.('content-type') || '';
      if (contentType.includes('application/json') || contentType.includes('+json')) {
        try {
          parsedData = JSON.parse(rawText);
        } catch (parseErr) {
          // If response claim was json but invalid
          return {
            ok: false,
            status: res.status,
            data: null,
            outcome: 'error',
            answered: true,
            error: `Failed to parse upstream JSON: ${parseErr.message}`,
          };
        }
      }

      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          data: parsedData,
          outcome: 'error',
          answered: true,
          error: `HTTP ${res.status}`,
        };
      }

      // Success -> Cache Fresh Entry
      const entryNow = Date.now();
      memoryCache.set(cacheKey, {
        data: parsedData,
        status: res.status,
        cachedAt: entryNow,
        expiresAt: entryNow + ttlMs,
        staleUntil: entryNow + Math.max(ttlMs, staleMs),
        isNegative: false,
      });
      enforceCacheCapacity();

      return {
        ok: true,
        status: res.status,
        data: parsedData,
        outcome: 'miss',
        answered: true,
        stale: false,
      };

    } catch (err) {
      clearTimeout(timeoutTimer);

      // On network failure or abort/timeout: Check for valid stale entry
      if (cached && now < cached.staleUntil && !cached.isNegative) {
        return {
          ok: true,
          status: cached.status || 200,
          data: cached.data,
          outcome: 'stale',
          answered: false, // network failed, answered: false but serving stale fallback
          stale: true,
        };
      }

      return {
        ok: false,
        status: 0,
        data: null,
        outcome: 'error',
        answered: false,
        error: err.name === 'AbortError' ? 'Upstream request timed out' : err.message,
      };
    }
  })();

  inFlightRequests.set(cacheKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

/**
 * Clear in-memory caches (useful for testing or cache resets)
 */
function clearUpstreamCache() {
  memoryCache.clear();
  inFlightRequests.clear();
  hostQueues.clear();
}

module.exports = {
  fetchUpstream,
  clearUpstreamCache,
};


