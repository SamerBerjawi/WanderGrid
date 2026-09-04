import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['icon.svg'],
          manifest: false, // We maintain our own manifest.json in /public
          workbox: {
            globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
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
                  expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
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
        include: ['react', 'react-dom', 'motion', 'motion/react', 'maplibre-gl', '@deck.gl/react', '@deck.gl/layers', '@deck.gl/core', '@deck.gl/geo-layers']
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
                if (id.includes('lucide-react')) {
                  return 'vendor-icons';
                }
              }
            }
          }
        }
      }
    };
});