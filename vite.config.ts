import path from 'path';
import { createRequire } from 'module';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

function decodePolyline6(str: string): [number, number, number][] {
  let index = 0, lat = 0, lng = 0;
  const coordinates: [number, number, number][] = [];
  const factor = 1e6;
  while (index < str.length) {
    let b, shift = 0, result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    coordinates.push([lng / factor, lat / factor, 0]);
  }
  return coordinates;
}

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
      server.middlewares.use(async (req: any, res: any, next: any) => {
        // Route proxy handler for overland road tracing in dev mode
        if (req.url && (req.url.startsWith('/api/proxy/route?') || req.url.startsWith('/api/route?'))) {
          try {
            const urlObj = new URL(req.url, 'http://localhost');
            const profile = urlObj.searchParams.get('profile') || 'car';
            const coords = urlObj.searchParams.get('coords') || '';
            const pairs = coords.split(';').map((s: string) => s.trim()).filter(Boolean);

            if (pairs.length < 2) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: 'At least 2 coordinate pairs required' }));
              return;
            }

            const osrmPath = profile === 'bike' ? 'routed-bike/route/v1/bicycle' : profile === 'foot' ? 'routed-foot/route/v1/foot' : 'routed-car/route/v1/driving';

            // 1. Primary: FOSSGIS OSRM
            try {
              const osrmController = new AbortController();
              const osrmTimer = setTimeout(() => osrmController.abort(), 4000);
              const osrmUpstream = await fetch(`https://routing.openstreetmap.de/${osrmPath}/${coords}?overview=full&geometries=geojson&alternatives=false&steps=false`, {
                signal: osrmController.signal,
                headers: { 'User-Agent': 'WanderGrid/1.0' }
              });
              clearTimeout(osrmTimer);

              if (osrmUpstream.ok) {
                const data = await osrmUpstream.json();
                const route = data?.routes?.[0];
                if (data.code === 'Ok' && route?.geometry?.coordinates?.length) {
                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({
                    ok: true,
                    code: 'Ok',
                    distanceKm: Math.round((route.distance / 1000) * 10) / 10,
                    durationMin: Math.round(route.duration / 60),
                    geometry: route.geometry.coordinates.map((c: any) => [c[0], c[1], 0]),
                    attribution: '© OpenStreetMap contributors · routing by FOSSGIS'
                  }));
                  return;
                }
              }
            } catch {}

            // 2. Secondary: Project OSRM Demo
            try {
              const demoController = new AbortController();
              const demoTimer = setTimeout(() => demoController.abort(), 4000);
              const demoProfile = profile === 'bike' ? 'bicycle' : profile === 'foot' ? 'foot' : 'driving';
              const demoUpstream = await fetch(`https://router.project-osrm.org/route/v1/${demoProfile}/${coords}?overview=full&geometries=geojson&alternatives=false&steps=false`, {
                signal: demoController.signal,
                headers: { 'User-Agent': 'WanderGrid/1.0' }
              });
              clearTimeout(demoTimer);

              if (demoUpstream.ok) {
                const data = await demoUpstream.json();
                const route = data?.routes?.[0];
                if (data.code === 'Ok' && route?.geometry?.coordinates?.length) {
                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({
                    ok: true,
                    code: 'Ok',
                    distanceKm: Math.round((route.distance / 1000) * 10) / 10,
                    durationMin: Math.round(route.duration / 60),
                    geometry: route.geometry.coordinates.map((c: any) => [c[0], c[1], 0]),
                    attribution: '© OpenStreetMap contributors, OSRM'
                  }));
                  return;
                }
              }
            } catch {}

            // 3. Tertiary: Valhalla FOSSGIS
            try {
              const locations = pairs.map((p: string) => {
                const [lon, lat] = p.split(',').map(Number);
                return { lat, lon };
              });
              const costing = profile === 'bike' ? 'bicycle' : profile === 'foot' ? 'pedestrian' : profile === 'bus' ? 'bus' : 'auto';
              const valhallaUrl = `https://valhalla1.openstreetmap.de/route?json=${encodeURIComponent(JSON.stringify({ locations, costing }))}`;
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), 4000);
              const upstream = await fetch(valhallaUrl, {
                signal: controller.signal,
                headers: { 'User-Agent': 'WanderGrid/1.0' }
              });
              clearTimeout(timer);

              if (upstream.ok) {
                const data = await upstream.json();
                const trip = data?.trip;
                if (trip?.legs?.length) {
                  let allGeometry: [number, number, number][] = [];
                  for (const leg of trip.legs) {
                    if (leg.shape) {
                      const legCoords = decodePolyline6(leg.shape);
                      allGeometry = allGeometry.concat(legCoords);
                    }
                  }
                  if (allGeometry.length > 2) {
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({
                      ok: true,
                      code: 'Ok',
                      distanceKm: Math.round((trip.summary?.length || 0) * 10) / 10,
                      durationMin: Math.round((trip.summary?.time || 0) / 60),
                      geometry: allGeometry,
                      attribution: '© OpenStreetMap contributors · routing by FOSSGIS (Valhalla)'
                    }));
                    return;
                  }
                }
              }
            } catch {}

            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: 'Upstream route calculation failed' }));
            return;
          } catch (err: any) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: err.message || 'Routing error' }));
            return;
          }
        }

        // Rail proxy handler for railway route tracing in dev mode
        if (req.url && (req.url.startsWith('/api/proxy/rail?') || req.url.startsWith('/api/rail?'))) {
          try {
            const urlObj = new URL(req.url, 'http://localhost');
            const rawCoords = urlObj.searchParams.get('coords') || urlObj.searchParams.get('points') || '';
            const profile = urlObj.searchParams.get('profile') || 'all_tracks';
            const pairs = rawCoords.split(';').map(s => s.trim()).filter(Boolean);
            
            const ghPoints = pairs.map(pr => {
              const parts = pr.split(',');
              const p1 = Number(parts[0]);
              const p2 = Number(parts[1]);
              let lat = p2, lon = p1;
              if (urlObj.searchParams.get('format') === 'lat,lng') {
                lat = p1;
                lon = p2;
              }
              return `point=${lat.toFixed(5)},${lon.toFixed(5)}`;
            });

            const pointsQuery = ghPoints.join('&');
            const upstreamUrl = `https://routing.openrailrouting.org/route?${pointsQuery}&profile=${encodeURIComponent(profile)}&points_encoded=false`;

            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 12000);
            const upstream = await fetch(upstreamUrl, {
              signal: controller.signal,
              headers: { 'User-Agent': 'WanderGrid/1.0' }
            });
            clearTimeout(timer);

            if (upstream.ok) {
              const data = await upstream.json();
              const path = data?.paths?.[0];
              if (path?.points?.coordinates?.length) {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  ok: true,
                  distanceKm: Math.round((path.distance / 1000) * 10) / 10,
                  durationMin: Math.round(path.time / 60000),
                  geometry: path.points.coordinates.map((c: any) => [c[0], c[1], 0]),
                  attribution: '© OpenStreetMap contributors · OpenRailRouting (GraphHopper)'
                }));
                return;
              }
            }
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: 'Upstream rail calculation failed' }));
            return;
          } catch (err: any) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: err.message || 'Rail routing error' }));
            return;
          }
        }

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
                urlPattern: /^https:\/\/[a-d]\.basemaps\.cartocdn\.com\//,
                handler: 'NetworkFirst',
                options: {
                  cacheName: 'carto-basemap-tiles-v3',
                  expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 },
                  cacheableResponse: {
                    statuses: [200],
                  },
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
                  expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 14 },
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
      // No API keys are inlined into the bundle (SEC-010): GEMINI_API_KEY is read by the server only.
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