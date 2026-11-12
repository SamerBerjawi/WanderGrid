import path from 'path';
import { createRequire } from 'module';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

function viteDevApiPlugin() {
  return {
    name: 'vite-dev-api-plugin',
    configureServer(server: any) {
      // Flight lookup by number and date: the same module the backend serves, so local mode finds flights too (keyless sources only).
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (!req.url || !req.url.startsWith('/api/flights/lookup')) return next();
        try {
          const { resolveFlight } = createRequire(import.meta.url)('./backend_files/flightLookup.js');
          const q = new URL(req.url, 'http://localhost').searchParams;
          const result = await resolveFlight(String(q.get('flight') || ''), String(q.get('date') || ''));
          res.statusCode = result.ok ? 200 : 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result));
        } catch (err: any) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: 'lookup_failed', message: 'The flight lookup failed. Try again.', candidates: [], attempts: [] }));
        }
      });
      // Road and rail tracing: the same handlers the Express server uses (audit F-12), behind a minimal
      // Express-style req/res so there is one copy of the upstream chain to maintain.
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const url: string = req.url || '';
        const road = url.startsWith('/api/proxy/route?') || url.startsWith('/api/route?');
        const rail = url.startsWith('/api/proxy/rail?') || url.startsWith('/api/rail?');
        if (!road && !rail) return next();
        const { handleRouteProxy, handleRailRouteProxy } = createRequire(import.meta.url)('./backend_files/routeProxy.js');
        const query = Object.fromEntries(new URL(url, 'http://localhost').searchParams);
        const expressRes = {
          status(code: number) { res.statusCode = code; return expressRes; },
          set(name: string, value: string) { res.setHeader(name, value); return expressRes; },
          setHeader(name: string, value: string) { res.setHeader(name, value); return expressRes; },
          json(body: unknown) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); return expressRes; },
        };
        try {
          await (road ? handleRouteProxy : handleRailRouteProxy)({ query, headers: req.headers, method: req.method, url }, expressRes);
        } catch (err: any) {
          if (!res.writableEnded) expressRes.status(502).json({ ok: false, error: err?.message || 'Routing error' });
        }
      });
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (!req.url || !req.url.startsWith('/api/proxy/test/')) {
          return next();
        }
        const rawKey = req.url.replace('/api/proxy/test/', '').split('?')[0];
        const providerKey = ({
          open_meteo: 'geocoding',
          openmeteo: 'geocoding',
          fossgis_osrm: 'osrm',
          nasa_gibs: 'gibs'
        } as Record<string, string>)[rawKey] || rawKey;
        const configs: Record<string, { url: string; timeout: number }> = {
          adsbdb: { url: 'https://api.adsbdb.com/v0/callsign/AAL1', timeout: 4000 },
          osrm: { url: 'https://routing.openstreetmap.de/routed-car/route/v1/driving/2.3522,48.8566;2.3600,48.8600?overview=false', timeout: 5000 },
          geocoding: { url: 'https://geocoding-api.open-meteo.com/v1/search?name=London&count=1&language=en&format=json', timeout: 4000 },
          openfreemap: { url: 'https://tiles.openfreemap.org/styles/liberty', timeout: 4000 },
          gibs: {
            url: (() => {
              const d = new Date();
              d.setDate(d.getDate() - 1);
              const yesterday = d.toISOString().split('T')[0];
              return `https://gibs-a.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA21_CorrectedReflectance_TrueColor/default/${yesterday}/GoogleMapsCompatible_Level9/0/0/0.jpg`;
            })(),
            timeout: 5000
          }
        };

        const target = configs[providerKey];
        if (!target) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: `Unknown provider: ${providerKey}` }));
          return;
        }

        const t0 = Date.now();
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), target.timeout);
          const upstream = await fetch(target.url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'WanderGrid/1.0' }
          });
          clearTimeout(timer);
          const latencyMs = Date.now() - t0;
          const isSuccess = (upstream.status >= 200 && upstream.status < 300) || (providerKey === 'adsbdb' && upstream.status === 404);
          res.statusCode = isSuccess ? 200 : 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            provider: providerKey,
            success: isSuccess,
            status: upstream.status,
            latencyMs,
            message: isSuccess ? `${providerKey} operational` : `Returned HTTP ${upstream.status}`
          }));
        } catch (err: any) {
          const latencyMs = Date.now() - t0;
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            provider: providerKey,
            success: false,
            latencyMs,
            message: err.message || 'Upstream timeout'
          }));
        }
      });
    }
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      // `vite preview` (used by the e2e suite) sends the same Content-Security-Policy as the Express server
      // (backend_files/server.js CSP_DIRECTIVES), so policy breakages show up in tests. Keep them in sync.
      preview: {
        headers: {
          'Content-Security-Policy': [
            "default-src 'self'",
            "script-src 'self' 'wasm-unsafe-eval' blob:",
            "worker-src 'self' blob:",
            "child-src 'self' blob:",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https:",
            "font-src 'self' data:",
            "connect-src 'self' https: data: blob:",
            "media-src 'self' data: blob: https:",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'self'",
          ].join('; '),
        },
      },
      server: {
        port: 3000,
        // Loopback only by default: the dev server and its unauthenticated proxy middleware must not be
        // reachable from the LAN unless you opt in with VITE_DEV_HOST=0.0.0.0 (SEC-018).
        host: env.VITE_DEV_HOST || 'localhost',
        proxy: {
          '/api': {
            target: env.VITE_API_TARGET || 'http://localhost:3001',
            changeOrigin: true
          }
        }
      },
      plugins: [
        react(),
        viteDevApiPlugin(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: [
            'apple-touch-icon.png', 
            'favicon.ico', 
            'favicon-32x32.png', 
            'favicon-16x16.png', 
            'app-icon-192.png', 
            'app-icon-512.png',
            'manifest.json'
          ],
          manifest: false, // Maintained in /public/manifest.json
          workbox: {
            // Precache only the app shell (PERF-006). Route chunks, map libraries and datasets are cached
            // at runtime the first time they are used (see the same-origin /assets/ rule below).
            globPatterns: [
              'index.html',
              'assets/index-*.{js,css}',
              'assets/runtime-helpers-*.js',
              'assets/vendor-motion-*.js',
              'favicon*.{png,ico}',
              'apple-touch-icon.png',
              'app-icon-192.png',
              'app-icon-512.png',
              'manifest.json',
            ],
            maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
            navigateFallback: '/index.html',
            navigateFallbackDenylist: [/^\/api\//],
            skipWaiting: true,
            clientsClaim: true,
            cleanupOutdatedCaches: true,
            runtimeCaching: [
              {
                // Hashed, immutable build chunks: cached on first use so visited routes work offline.
                urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/assets/'),
                handler: 'CacheFirst',
                options: {
                  cacheName: 'app-assets',
                  expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 60 },
                  cacheableResponse: { statuses: [200] },
                },
              },
              {
                urlPattern: /^https:\/\/.*\.tile\.openstreetmap\.org\//,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'osm-tiles',
                  expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 },
                  cacheableResponse: {
                    statuses: [0, 200],
                  },
                },
              },
              {
                urlPattern: /^https:\/\/images\.unsplash\.com\//,
                handler: 'StaleWhileRevalidate',
                options: {
                  cacheName: 'unsplash-images',
                  expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
                  cacheableResponse: {
                    statuses: [0, 200],
                  },
                },
              },
              {
                urlPattern: /^https:\/\/flagcdn\.com\//,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'flag-icons',
                  expiration: { maxEntries: 250, maxAgeSeconds: 60 * 60 * 24 * 60 },
                  cacheableResponse: {
                    statuses: [0, 200],
                  },
                },
              },
              {
                urlPattern: /^https:\/\/tiles\.openfreemap\.org\//,
                handler: 'StaleWhileRevalidate',
                options: {
                  cacheName: 'openfreemap-tiles',
                  // Room for the tiles of several saved offline trips (utils/offlinePack.ts keeps up to 300 each).
                  expiration: { maxEntries: 2500, maxAgeSeconds: 60 * 60 * 24 * 60 },
                  cacheableResponse: {
                    statuses: [0, 200],
                  },
                },
              },
              {
                urlPattern: /^https:\/\/s3\.amazonaws\.com\/elevation-tiles-prod\/terrarium\//,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'aws-terrarium-dem-tiles',
                  expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
                  cacheableResponse: {
                    statuses: [0, 200],
                  },
                },
              },
              {
                urlPattern: /^https:\/\/gibs-[a-c]\.earthdata\.nasa\.gov\/wmts\//,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'nasa-gibs-tiles',
                  expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 3 },
                  cacheableResponse: {
                    statuses: [0, 200],
                  },
                },
              },
              {
                urlPattern: /\/data\/.*\.geojson$/,
                handler: 'StaleWhileRevalidate',
                options: {
                  cacheName: 'local-geojson-data',
                  expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 },
                  cacheableResponse: {
                    statuses: [0, 200],
                  },
                },
              },
            ],
          },
        }),
      ],
      // No API keys are inlined into the bundle (SEC-010): keys are read by the server only.
      resolve: {
        alias: {
          '@': path.resolve('.'),
          'react': path.resolve('./node_modules/react'),
          'react-dom': path.resolve('./node_modules/react-dom'),
          'react/jsx-runtime': path.resolve('./node_modules/react/jsx-runtime'),
          'react/jsx-dev-runtime': path.resolve('./node_modules/react/jsx-dev-runtime'),
          'react-dom/client': path.resolve('./node_modules/react-dom/client'),
          'react-dom/server': path.resolve('./node_modules/react-dom/server'),
        },
        dedupe: ['react', 'react-dom'],
        preserveSymlinks: false
      },
      optimizeDeps: {
        include: ['react', 'react-dom', 'motion', 'motion/react', '@deck.gl/react', '@deck.gl/layers', '@deck.gl/core', '@deck.gl/geo-layers', '@deck.gl/mapbox'],
        exclude: ['maplibre-gl']
      },
      build: {
        target: 'es2022',
        cssMinify: true,
        chunkSizeWarningLimit: 1200,
        rollupOptions: {
          output: {
            // The Hugeicons set behind the icon finder is one lazy chunk, named so the app-shell precache glob
            // (`assets/index-*`) does not pick it up; it is cached at runtime on first use.
            chunkFileNames: chunkInfo => (
              chunkInfo.facadeModuleId?.includes('@hugeicons/core-free-icons')
                ? 'assets/hugeicons-all-[hash].js'
                : 'assets/[name]-[hash].js'
            ),
            manualChunks(id) {
              // Vite's dynamic-import preload helper is used by every lazy view; left to Rollup it landed in
              // vendor-deckgl, making the login page download the whole map stack (PERF-001).
              if (id.includes('vite/preload-helper') || id.includes('commonjsHelpers')) {
                return 'runtime-helpers';
              }
              if (id.includes('node_modules')) {
                if (id.includes('@deck.gl') || id.includes('@luma.gl') || id.includes('@loaders.gl') || id.includes('maplibre-gl')) {
                  return 'vendor-deckgl';
                }
                if (id.includes('motion') || id.includes('framer-motion')) {
                  return 'vendor-motion';
                }
              }
            }
          }
        }
      }
    };
});