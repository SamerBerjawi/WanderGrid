import path from 'path';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const resolveFromRoot = (...segments: string[]) => path.resolve(projectRoot, ...segments);

// Keep React as a hard singleton. Animation packages (motion/framer-motion),
// maps, charts, and linked workspaces can otherwise resolve their own React
// copy and crash with "resolveDispatcher().useState" when hooks run.
const reactSingletonAliases = [
  { find: /^react$/, replacement: resolveFromRoot('node_modules/react') },
  { find: /^react\/jsx-runtime$/, replacement: resolveFromRoot('node_modules/react/jsx-runtime.js') },
  { find: /^react\/jsx-dev-runtime$/, replacement: resolveFromRoot('node_modules/react/jsx-dev-runtime.js') },
  { find: /^react-dom$/, replacement: resolveFromRoot('node_modules/react-dom') },
  { find: /^react-dom\/client$/, replacement: resolveFromRoot('node_modules/react-dom/client.js') },
  { find: /^react-dom\/server$/, replacement: resolveFromRoot('node_modules/react-dom/server.js') },
];

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
        dedupe: ['react', 'react-dom'],
        preserveSymlinks: false,
        alias: [
          ...reactSingletonAliases,
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
        ],
        exclude: []
      }
    };
});
