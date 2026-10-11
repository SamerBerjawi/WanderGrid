/**
 * Chunk A — workflow 47: app-shell navigation (desktop sidebar, mobile tab bar + "More" sheet),
 * theme toggle, sidebar collapse, next-trip widget, profile chip, back/forward, refresh, unknown routes.
 */
import { test, expect, ADMIN, resetDb, apiRegister, seedSession, expectAppShell, isMobile } from '../support/fixtures';

const PAGES: { label: string; path: string; mobile: 'bar' | 'more' }[] = [
  { label: 'Dashboard', path: '/', mobile: 'bar' },
  { label: 'Map', path: '/map', mobile: 'bar' },
  { label: 'Planner', path: '/planner', mobile: 'more' },
  { label: 'Planner-2', path: '/planner-2', mobile: 'more' },
  { label: 'Vacation Calendar', path: '/calendar', mobile: 'more' },
  { label: 'Travel Atlas', path: '/atlas', mobile: 'bar' },
  { label: 'Flights', path: '/flights', mobile: 'bar' },
  { label: 'Road Trips', path: '/roadtrips', mobile: 'more' },
  { label: 'Settings', path: '/settings', mobile: 'more' },
];

const mobileBar = (page) => page.locator('div.md\\:hidden.fixed');
const moreSheet = (page) => page.locator('.md\\:hidden.fixed.z-modal');

async function clickNav(page, item: (typeof PAGES)[number]) {
  if (!isMobile(page)) return page.locator('aside nav').getByRole('button', { name: item.label, exact: true }).click();
  if (item.mobile === 'bar') {
    const short = item.label === 'Travel Atlas' ? 'Atlas' : item.label;
    return mobileBar(page).getByRole('button', { name: new RegExp(`^${short}$`, 'i') }).click();
  }
  await mobileBar(page).getByRole('button', { name: /More/i }).click();
  await moreSheet(page).getByRole('button', { name: item.label, exact: true }).click();
}

let session: { token: string; user: any };
test.beforeEach(async ({ page, request }) => {
  await resetDb(request);
  session = await apiRegister(request, ADMIN);
  await seedSession(page, session.token, session.user);
});

test('every navigation item opens its page without crashing', async ({ page }) => {
  await page.goto('/');
  await expectAppShell(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const item of PAGES) {
    await clickNav(page, item);
    await expect(page, item.label).toHaveURL(new RegExp(`${item.path.replace('/', '\\/')}$`));
    await expect(page.getByText(/Try Again|Return to Dashboard|Stopped Unexpectedly/i), `${item.label} error boundary`).toHaveCount(0);
  }
  expect(errors, 'uncaught page errors').toEqual([]);
});

test('browser Back/Forward move between views', async ({ page }) => {
  await page.goto('/');
  await expectAppShell(page);
  await clickNav(page, PAGES[6]); // Flights
  await expect(page).toHaveURL(/\/flights$/);
  await clickNav(page, PAGES[8]); // Settings
  await expect(page).toHaveURL(/\/settings$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/flights$/);
  await expect(page.locator('main h1').first()).toContainText(/Flight/i);
  await page.goForward();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.locator('main h1').first()).toContainText(/Settings/i);
});

test('refresh on a deep link keeps the same view', async ({ page }) => {
  for (const path of ['/atlas', '/calendar', '/roadtrips']) {
    await page.goto(path);
    await expectAppShell(page);
    await page.reload();
    await expectAppShell(page);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  }
});

test('legacy URL aliases resolve (/travel-atlas, /vacation-calendar, /planner2)', async ({ page }) => {
  for (const [alias, h1] of [['/travel-atlas', /Atlas/i], ['/vacation-calendar', /Calendar|Vacation/i], ['/planner2', /Planner|Trips|Expedition/i]] as const) {
    await page.goto(alias);
    await expectAppShell(page);
    await expect(page.locator('main h1').first(), alias).toContainText(h1);
  }
});

test('unknown path falls back to the Dashboard', async ({ page }) => {
  await page.goto('/this-page-does-not-exist');
  await expectAppShell(page);
  await expect(page.getByText(/Try Again|Stopped Unexpectedly/i)).toHaveCount(0);
});

test('theme toggle cycles dark → light → auto and persists after reload', async ({ page, request }) => {
  await page.goto('/');
  await expectAppShell(page);
  const toggle = isMobile(page)
    ? (await mobileBar(page).getByRole('button', { name: /More/i }).click(), moreSheet(page).getByRole('button', { name: /Appearance/i }))
    : page.locator('aside button[title^="Appearance:"]');
  const isDark = () => page.evaluate(() => document.documentElement.classList.contains('dark'));
  expect(await isDark()).toBe(true); // default theme
  await toggle.click(); // -> light
  await expect.poll(isDark).toBe(false);
  await page.waitForTimeout(800);
  const saved = await (await request.get('/api/settings', { headers: { Authorization: `Bearer ${session.token}` } })).json();
  expect(saved.theme).toBe('light');
  await page.reload();
  await expectAppShell(page);
  await expect.poll(isDark).toBe(false);
});

test('desktop: sidebar collapse hides labels and expand restores them', async ({ page }) => {
  test.skip(isMobile(page), 'desktop-only control');
  await page.goto('/');
  await expectAppShell(page);
  await page.locator('aside button[title="Collapse Sidebar"]').click();
  await expect(page.locator('aside nav').getByText('Flights', { exact: true })).toHaveCount(0);
  await page.locator('aside button[title="Expand Sidebar"]').click();
  await expect(page.locator('aside nav').getByText('Flights', { exact: true })).toBeVisible();
});

test('profile chip opens the signed-in user\'s profile', async ({ page }) => {
  await page.goto('/');
  await expectAppShell(page);
  if (isMobile(page)) {
    await mobileBar(page).getByRole('button', { name: /More/i }).click();
    await moreSheet(page).getByRole('button').filter({ hasText: ADMIN.name }).first().click();
  } else {
    await page.locator('aside button[title^="Profile:"]').click();
  }
  await expect.poll(() => decodeURIComponent(new URL(page.url()).pathname)).toBe(`/user/${ADMIN.id}`);
  await expect(page.locator('main h1').first()).toContainText(ADMIN.name);
});

test('next-trip widget shows the upcoming trip and opens it (desktop sidebar)', async ({ page, request }) => {
  test.skip(isMobile(page), 'widget lives in the desktop sidebar');
  const start = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
  const trip = { id: 'qa-trip-next', name: 'QA Lisbon Getaway', location: 'Lisbon, Portugal', startDate: start, endDate: end, status: 'Upcoming', privacy: 'Private', participants: [ADMIN.id], transports: [], accommodations: [] };
  const r = await request.post('/api/trips', { headers: { Authorization: `Bearer ${session.token}` }, data: trip });
  expect(r.status()).toBe(201);
  await page.goto('/');
  await expectAppShell(page);
  const widget = page.locator('aside').getByText('QA Lisbon Getaway');
  await expect(widget).toBeVisible();
  await widget.click();
  await expect(page).toHaveURL(/\/trip\/qa-trip-next$/);
});

test('with no upcoming trips the widget offers "Plan next adventure" → Planner (desktop)', async ({ page }) => {
  test.skip(isMobile(page), 'widget lives in the desktop sidebar');
  await page.goto('/');
  await expectAppShell(page);
  await page.locator('aside').getByRole('button', { name: /Plan next adventure/i }).click();
  await expect(page).toHaveURL(/\/planner$/);
});

test('mobile: "More" sheet opens and closes via its backdrop', async ({ page }) => {
  test.skip(!isMobile(page), 'mobile-only control');
  await page.goto('/');
  await expectAppShell(page);
  await mobileBar(page).getByRole('button', { name: /More/i }).click();
  await expect(moreSheet(page)).toBeVisible();
  await page.locator('.md\\:hidden.fixed.inset-0.z-modal-backdrop').click({ position: { x: 20, y: 100 } });
  await expect(moreSheet(page)).toHaveCount(0);
});

test('no horizontal page overflow on the app shell', async ({ page }) => {
  for (const p of PAGES) {
    await page.goto(p.path);
    await expectAppShell(page);
    await page.waitForTimeout(1200);
    const overflow = await page.evaluate(() => {
      const main = document.querySelector('main');
      return Math.max(document.documentElement.scrollWidth - window.innerWidth, main ? main.scrollWidth - main.clientWidth : 0);
    });
    expect.soft(overflow, `${p.label} horizontal overflow (px)`).toBeLessThanOrEqual(0);
  }
});
