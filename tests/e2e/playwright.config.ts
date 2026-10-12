import { defineConfig } from '@playwright/test';

const REPO = '../..';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  // All tests share one in-memory database that each test resets, so run serially.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: 'http://localhost:4173',
    channel: 'chrome', // use the locally installed Google Chrome; no browser download needed
    serviceWorkers: 'block', // the PWA service worker would otherwise cache between tests
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  ],
  webServer: [
    {
      command: 'node support/backend-harness.cjs',
      url: 'http://localhost:3099/health',
      env: { E2E_RATE_LIMIT_MAX: '100000', E2E_BLOCK_EXTERNAL: '1' },
      timeout: 60_000,
      reuseExistingServer: false,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      // Production build (no localStorage fallback), served by vite preview which proxies /api -> :3001.
      command: `npx vite build --outDir tests/e2e/.dist --emptyOutDir --logLevel error && npx vite preview --outDir tests/e2e/.dist --port 4173 --strictPort`,
      cwd: REPO,
      url: 'http://localhost:4173',
      timeout: 240_000,
      reuseExistingServer: false,
    },
  ],
});
