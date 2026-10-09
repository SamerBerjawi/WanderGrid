import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

function viteDevApiPlugin() {
  return {
    name: 'vite-dev-api-plugin',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        // Route proxy handler for overland road & rail tracing in dev mode
        if (req.url && (req.url.startsWith('/api/proxy/route?') || req.url.startsWith('/api/route?'))) {
          try {
            const urlObj = new URL(req.url, 'http://localhost');
            const profile = urlObj.searchParams.get('profile') || 'car';
            const coords = urlObj.searchParams.get('coords') || '';
            const osrmPath = profile === 'bike' ? 'routed-bike/route/v1/bicycle' : profile === 'foot' ? 'routed-foot/route/v1/foot' : 'routed-car/route/v1/driving';
            const upstreamUrl = `https://routing.openstreetmap.de/${osrmPath}/${coords}?overview=full&geometries=geojson&alternatives=false&steps=false`;

            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 12000);
            const upstream = await fetch(upstreamUrl, { signal: controller.signal });
            clearTimeout(timer);

            if (upstream.ok) {
              const data = await upstream.json();
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
      server: {
        port: 3000,
        host: true,
        proxy: {
          '/api': {
            target: 'http://localhost:3001',
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
            'icon.svg', 
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
            globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,json}'],
            maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB limit for large chunks like deck.gl
            navigateFallback: '/index.html',
            navigateFallbackDenylist: [/^\/api\//],
            skipWaiting: true,
            clientsClaim: true,
            cleanupOutdatedCaches: true,
            runtimeCaching: [
              {
                urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
                handler: 'StaleWhileRevalidate',
                options: {
                  cacheName: 'google-fonts-stylesheets',
                },
              },
              {
                urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'google-fonts-webfonts',
                  expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
                },
              },
              {
                urlPattern: /^https:\/\/(unpkg\.com|cdn\.tailwindcss\.com)\//,
                handler: 'StaleWhileRevalidate',
                options: {
                  cacheName: 'cdn-assets',
                  expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
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
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
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
            manualChunks(id) {
              if (id.includes('node_modules')) {
                if (id.includes('@deck.gl') || id.includes('@luma.gl') || id.includes('@loaders.gl') || id.includes('maplibre-gl')) {
                  return 'vendor-deckgl';
                }
                if (id.includes('motion') || id.includes('framer-motion')) {
                  return 'vendor-motion';
                }
                if (id.includes('@phosphor-icons')) {
                  return 'vendor-icons';
                }
              }
            }
          }
        }
      }
    };
});