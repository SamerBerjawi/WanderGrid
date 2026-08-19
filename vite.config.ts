import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
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
      }
    };
});