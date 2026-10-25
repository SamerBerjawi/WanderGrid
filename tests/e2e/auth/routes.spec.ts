/**
 * The redesigned pages at the clean URLs: canonical routes, `-new` redirects, signed-out deep links,
 * the not-found screen and the redirects from the removed /classic URLs.
 */
import { test, expect, ADMIN, resetDb, apiRegister, seedSession, gotoNew, fillLogin, submitButton } from '../support/fixtures';

const CANONICAL = ['/', '/dashboard', '/trips', '/planner', '/flights', '/roadtrips', '/map', '/atlas', '/calendar', '/settings'];
const REDIRECTS: [string, string][] = [
  ['/dashboard-new', '/dashboard'], ['/trips-new', '/trips'], ['/flights-new', '/flights'], ['/roadtrips-new', '/roadtrips'],
  ['/map-new', '/map'], ['/atlas-new', '/atlas'], ['/calendar-new', '/calendar'], ['/settings-new', '/settings'],
];

test.beforeEach(async ({ request }) => { await resetDb(request); });

test.describe('signed in', () => {
  let session: { token: string; user: any };
  test.beforeEach(async ({ page, request }) => {
    session = await apiRegister(request, ADMIN);
    await seedSession(page, session.token, session.user);
  });

  for (const path of CANONICAL) {
    test(`${path} opens a New page without crashing`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await gotoNew(page, path);
      // The full-bleed map hides the brand button on phones (hideBrandOnMobile), so accept the bottom nav there.
      await expect(page.getByRole('button', { name: 'WanderGrid home' }).or(page.getByRole('button', { name: 'Dashboard' })).first()).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(/Page not found|Try Again|Stopped Unexpectedly/i)).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }

  for (const [from, to] of REDIRECTS) {
    test(`${from} is replaced by ${to}`, async ({ page }) => {
      await gotoNew(page, from);
      await expect(page).toHaveURL(new RegExp(`${to}$`));
    });
  }

  test('an unknown path shows the not-found page with a way home', async ({ page }) => {
    await gotoNew(page, '/this-page-does-not-exist');
    await expect(page.getByText('Page not found')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /Back to dashboard/ }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('an old /classic bookmark is replaced by the page', async ({ page }) => {
    await gotoNew(page, '/classic/planner');
    await expect(page).toHaveURL(/\/planner$/);
    await expect(page.getByRole('button', { name: 'WanderGrid home' })).toBeVisible({ timeout: 20_000 });
    await gotoNew(page, '/classic');
    await expect(page).toHaveURL(/\/$/);
  });
});

test('a signed-out deep link survives signing in', async ({ page, request }) => {
  await apiRegister(request, ADMIN);
  await gotoNew(page, '/trip/abc');
  await expect(page.locator('input[name="email"]')).toBeVisible({ timeout: 20_000 });
  expect(new URL(page.url()).pathname).toBe('/trip/abc');
  await fillLogin(page, ADMIN.email, ADMIN.password);
  await submitButton(page).click();
  await expect(page.getByRole('button', { name: 'WanderGrid home' })).toBeVisible({ timeout: 20_000 });
  expect(new URL(page.url()).pathname).toBe('/trip/abc');
});
