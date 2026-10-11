/**
 * Phase 4 accessibility gate (UI-003, UI-004, UI-015): axe-core on the main pages, light and dark themes.
 * Contrast on translucent glass can't be computed automatically ("needs review"); only definite violations fail.
 */
import AxeBuilder from '@axe-core/playwright';
import { test, expect, ADMIN, resetDb, apiRegister, seedSession, expectAppShell } from '../support/fixtures';
import { seedTrip, isoDaysFromNow } from '../support/planning';

const PAGES = ['/', '/planner', '/flights', '/roadtrips', '/atlas', '/calendar', '/settings', '/map'];

for (const theme of ['dark', 'light'] as const) {
  test.describe(`axe (${theme})`, () => {
    test.beforeEach(async ({ page, request }) => {
      await resetDb(request);
      const s = await apiRegister(request, ADMIN);
      await seedTrip(request, s.token, { id: 'axe-trip', name: 'Axe Lisbon', status: 'Upcoming', startDate: isoDaysFromNow(10), endDate: isoDaysFromNow(14) }, ADMIN.id);
      await seedSession(page, s.token, s.user);
      await page.addInitScript((t) => localStorage.setItem('wandergrid_theme_preference', t), theme);
    });

    for (const path of PAGES) {
      test(`${path} has no serious or critical violations`, async ({ page }) => {
        await page.goto(path);
        await expectAppShell(page);
        await page.waitForTimeout(1500);
        const results = await new AxeBuilder({ page })
          .exclude('.maplibregl-canvas-container')
          .exclude('.maplibregl-ctrl')
          .analyze();
        const serious = results.violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
        expect(serious, `${path} [${theme}]`).toEqual([]);
      });
    }
  });
}
