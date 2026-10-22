import path from 'path';
import { defineConfig } from 'vitest/config';

/** Unit tests for the pure logic of the app (grouping, status, alerts, import mapping, lookup helpers). */
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
    restoreMocks: true,
    setupFiles: ['tests/unit/setup.ts'],
  },
});
