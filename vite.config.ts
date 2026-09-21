import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: true,
      },
      plugins: [
        react(),
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
                urlPattern: /^https:\/\/[a-c]\.basemaps\.cartocdn\.com\//,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'carto-basemap-tiles',
                  expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 },
                  cacheableResponse: {
                    statuses: [0, 200],
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