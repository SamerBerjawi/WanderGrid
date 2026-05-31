import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const stringifyEnv = (value: string | undefined) => JSON.stringify(value ?? '');

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': stringifyEnv(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': stringifyEnv(env.GEMINI_API_KEY)
      },
      resolve: {
        dedupe: ['react', 'react-dom'],
        preserveSymlinks: false,
        alias: [
          { find: /^@\//, replacement: `${projectRoot}/` },
        ]
      },
      optimizeDeps: {
        include: [
          'react',
          'react-dom',
          'react/jsx-runtime',
          'react/jsx-dev-runtime',
          'motion/react',
          'framer-motion'
        ]
      }
    };
});
