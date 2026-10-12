/**
 * WP-4.5 layout gate (UI-006, UI-007): every main page, with a very long trip title and activity name,
 * has no horizontal overflow, and its controls meet the touch-target rules
 * (none under 24 px; fewer than 10 % under 44 px).
 */
import { test, expect, ADMIN, resetDb, apiRegister, seedSession, expectAppShell } from '../support/fixtures';
import { seedTrip, isoDaysFromNow, overflowX } from '../support/planning';

const PAGES = ['/', '/planner', '/calendar', '/trip/layout-1', '/flights', '/roadtrips', '/atlas', '/map', '/settings'];

test.beforeEach(async ({ page, request }) => {
  await resetDb(request);
  const s = await apiRegister(request, ADMIN);
  const longActivity = 'Very long activity name '.repeat(17).slice(0, 400);
  await seedTrip(request, s.token, {
    id: 'layout-1', name: 'Very long expedition name '.repeat(12).slice(0, 300), status: 'Upcoming',
    startDate: isoDaysFromNow(10), endDate: isoDaysFromNow(14), location: 'Santorini, Greece',
    activities: [{ id: 'a1', name: longActivity, title: longActivity, date: isoDaysFromNow(11), type: 'Activity' }],
  }, ADMIN.id);
  await seedSession(page, s.token, s.user);
});

for (const path of PAGES) {
  test(`${path}: no horizontal overflow and touch targets meet the minimum`, async ({ page }) => {
    await page.goto(path);
    await expectAppShell(page);
    await page.waitForTimeout(1500);
    expect(await overflowX(page), 'horizontal overflow (px)').toBeLessThanOrEqual(0);

    const t = await page.evaluate(() => {
      const els = [...document.querySelectorAll('button, a[href], [role="button"], input[type="checkbox"], input[type="radio"]')].filter((e) => {
        const r = e.getBoundingClientRect();
        // [data-touch-exempt]: dense day grids whose items also have full-size controls elsewhere (WCAG 2.5.8 exception).
        if (e.closest('[data-touch-exempt]')) return false;
        return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && r.bottom > 0 && r.top < innerHeight * 3;
      });
      const size = (e: Element) => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); };
      const label = (e: Element) => `${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30)} (${Math.round(size(e))}px)`;
      return { total: els.length, under44: els.filter((e) => size(e) < 44).map(label), under24: els.filter((e) => size(e) < 24).map(label) };
    });
    expect(t.under24, 'controls under 24 px').toEqual([]);
    expect(t.under44.length / Math.max(1, t.total), `share of controls under 44 px: ${t.under44.join(', ')}`).toBeLessThan(0.1);
  });
}
