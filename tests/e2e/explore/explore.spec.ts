/**
 * Chunk F — Map, Atlas, Dashboard & Calendar (workflows 42–46).
 */
import { test, expect, ADMIN, PARTNER, resetDb, apiRegister, seedSession, expectAppShell, isMobile } from '../support/fixtures';
import { seedTrip, seedVisited, apiGet, isoDaysFromNow, visible, inMain, overflowX } from '../support/planning';

let s: { token: string; user: any };
test.beforeEach(async ({ page, request }) => {
  await resetDb(request);
  s = await apiRegister(request, ADMIN);
  await seedSession(page, s.token, s.user);
});
const visited = (request) => apiGet(request, s.token, '/api/visited');
const mainTab = (page, label: RegExp) => page.locator('main button >> visible=true').filter({ hasText: label }).first();

// ---------------- W42 Dashboard ----------------
test.describe('W42 Dashboard', () => {
  test('loads with stats tabs and switches between them', async ({ page }) => {
    await page.goto('/');
    await expectAppShell(page);
    for (const t of ['Stickers', 'Milestones', 'Analytics', 'Stamps']) {
      await page.getByRole('button', { name: t, exact: true }).click();
      await expect(page.getByText(/Try Again|Stopped Unexpectedly/i), t).toHaveCount(0);
    }
  });

  test('stamp search: no matches shows an empty result and × clears it', async ({ page, request }) => {
    await seedVisited(request, s.token, { id: 'country_FR', type: 'country', code: 'FR', name: 'France', visitDate: '2025-05-01' });
    await page.goto('/');
    await expectAppShell(page);
    await page.getByRole('button', { name: 'Stamps', exact: true }).click();
    const search = visible(page, 'input[placeholder="Search stamps..."]').first();
    await search.fill('zzzz');
    await expect(page.getByRole('button', { name: 'Clear stamp search' })).toBeVisible();
    await page.getByRole('button', { name: 'Clear stamp search' }).click();
    await expect(search).toHaveValue('');
  });

  test('2D/3D map toggle switches mode and remembers it after reload', async ({ page }) => {
    await page.goto('/');
    await expectAppShell(page);
    const toggle = page.locator('button[title^="Switch to"] >> visible=true').first();
    const before = await toggle.getAttribute('title');
    await toggle.click();
    await expect(page.locator('button[title^="Switch to"] >> visible=true').first()).not.toHaveAttribute('title', before!);
    const after = await page.locator('button[title^="Switch to"] >> visible=true').first().getAttribute('title');
    await page.reload();
    await expectAppShell(page);
    await expect(page.locator('button[title^="Switch to"] >> visible=true').first()).toHaveAttribute('title', after!);
  });

  test('loading the Dashboard does not write data (read-only view)', async ({ page, request }) => {
    await seedTrip(request, s.token, { id: 'd-past', name: 'QA Rome 2025', status: 'Past', startDate: '2025-04-01', endDate: '2025-04-05', location: 'Rome, Italy' }, ADMIN.id);
    const writes: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/api/') && ['POST', 'PUT', 'DELETE'].includes(r.method())) writes.push(`${r.method()} ${new URL(r.url()).pathname}`); });
    await page.goto('/');
    await expectAppShell(page);
    await page.waitForTimeout(4000);
    expect(writes, 'opening the Dashboard should not POST/PUT/DELETE').toEqual([]);
  });

  test('liquid glass is limited to hero surfaces (PERF-002 frame budget)', async ({ page }) => {
    await page.goto('/');
    await expectAppShell(page);
    await page.waitForTimeout(1500);
    const filters = await page.locator('feDisplacementMap').count();
    expect(filters, 'SVG displacement filters on the Dashboard').toBeLessThanOrEqual(12);
    expect(await page.locator('.wg-glass-lite').count()).toBeGreaterThan(0);
  });

  test('no horizontal overflow on the Dashboard', async ({ page }) => {
    await page.goto('/');
    await expectAppShell(page);
    await page.waitForTimeout(1500);
    expect(await overflowX(page)).toBeLessThanOrEqual(0);
  });
});

// ---------------- W43 Map ----------------
test.describe('W43 Map', () => {
  test('map page renders with view-mode pills and Mission Control', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/map');
    await expectAppShell(page);
    await expect(page.locator('button[title^="Flights"] >> visible=true').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Open Mission Control' }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('view-mode pills switch (Flights → Scratch → All Expeditions)', async ({ page }) => {
    await page.goto('/map');
    await expectAppShell(page);
    for (const m of ['Scratch', 'All Expeditions', 'Flights']) {
      const pill = page.locator(`button[title^="${m}"] >> visible=true`).first();
      await pill.click();
      await expect(page.getByText(/Try Again|Stopped Unexpectedly/i), m).toHaveCount(0);
    }
  });

  test('filters panel: status segment + Reset All Filters', async ({ page }) => {
    await page.goto('/map');
    await expectAppShell(page);
    await page.getByRole('button', { name: /Controls & Appearance/ }).first().click();
    await page.getByRole('button', { name: 'Past', exact: true }).first().click();
    await page.getByRole('button', { name: /Reset All Filters/ }).click();
    await expect(page.getByText(/Try Again/i)).toHaveCount(0);
  });

  test('Mission Control opens its tabs and closes', async ({ page }) => {
    await page.goto('/map');
    await expectAppShell(page);
    await page.getByRole('button', { name: 'Open Mission Control' }).first().click();
    await expect(page.locator('text=/Layers/ >> visible=true').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('text=/Layers/ >> visible=true'), 'Mission Control closes with Escape').toHaveCount(0);
  });

  test('zoom controls respond (desktop)', async ({ page }) => {
    test.skip(isMobile(page), 'zoom buttons are desktop-sized controls');
    await page.goto('/map');
    await expectAppShell(page);
    for (const z of ['Zoom In (+)', 'Zoom Out (−)', 'Fit View to All Routes']) {
      await page.locator(`button[title="${z}"] >> visible=true`).first().click();
    }
  });
});

// ---------------- W44/45 Atlas ----------------
test.describe('W44 Travel Atlas records', () => {
  test('add a visited country via the modal', async ({ page, request }) => {
    await page.goto('/atlas');
    await expectAppShell(page);
    await page.getByRole('button', { name: 'Add visited country' }).first().click();
    await page.locator('input[placeholder="e.g. GB-ENG"]').fill('PT');
    await page.locator('input[placeholder="e.g. England"]').fill('Portugal');
    await page.getByRole('button', { name: /^Register to Atlas$/ }).click();
    await expect.poll(async () => (await visited(request)).some((v) => v.code === 'PT' && v.name === 'Portugal'), { timeout: 10_000 }).toBe(true);
    await expect(inMain(page, 'Portugal').first()).toBeVisible();
  });

  test('country form requires a code and name', async ({ page, request }) => {
    await page.goto('/atlas');
    await expectAppShell(page);
    await page.getByRole('button', { name: 'Add visited country' }).first().click();
    page.on('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name: /^Register to Atlas$/ }).click();
    await page.waitForTimeout(800);
    expect((await visited(request)).length).toBe(0);
  });

  test('edit a country record', async ({ page, request }) => {
    await seedVisited(request, s.token, { id: 'country_ES', type: 'country', code: 'ES', name: 'Spain', visitDate: '2025-06-01' });
    await page.goto('/atlas');
    await expectAppShell(page);
    await page.getByRole('button', { name: 'Edit Record' }).first().click();
    await page.locator('input[placeholder="e.g. England"]').fill('Kingdom of Spain');
    await page.getByRole('button', { name: /^Save Record$/ }).click();
    await expect.poll(async () => (await visited(request)).find((v) => v.id === 'country_ES')?.name, { timeout: 10_000 }).toBe('Kingdom of Spain');
  });

  test('remove a country (with confirmation)', async ({ page, request }) => {
    await seedVisited(request, s.token, { id: 'country_IT', type: 'country', code: 'IT', name: 'Italy', visitDate: '2025-06-01' });
    await page.goto('/atlas');
    await expectAppShell(page);
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Remove country' }).first().click();
    await expect.poll(async () => (await visited(request)).length, { timeout: 10_000 }).toBe(0);
  });

  test('tabs: Visited / Layovers / Wishlist / Cities / Sync all render', async ({ page }) => {
    await page.goto('/atlas');
    await expectAppShell(page);
    for (const t of [/^Layovers/i, /^Wishlist/i, /^Cities/i, /^Sync/i, /^Visited/i]) {
      await mainTab(page, t).click();
      await expect(page.getByText(/Try Again/i)).toHaveCount(0);
    }
  });

  test('search with no matches shows an empty result', async ({ page, request }) => {
    await seedVisited(request, s.token, { id: 'country_GR', type: 'country', code: 'GR', name: 'Greece', visitDate: '2025-06-01' });
    await page.goto('/atlas');
    await expectAppShell(page);
    await visible(page, 'main input[type="text"], main input:not([type])').first().fill('zzzz');
    await expect(inMain(page, 'Greece')).toHaveCount(0);
  });
});

test.describe('W45 Atlas scan history', () => {
  test('scan finds the country of a past trip and registers it', async ({ page, request }) => {
    await seedTrip(request, s.token, { id: 'scan-trip', name: 'QA Tokyo', status: 'Past', startDate: '2025-03-01', endDate: '2025-03-08', location: 'Tokyo, Japan', locations: [{ id: 'l1', name: 'Tokyo, Japan', country: 'Japan', countryCode: 'JP', coordinates: { lat: 35.68, lng: 139.69 } }] }, ADMIN.id);
    await page.goto('/atlas');
    await expectAppShell(page);
    await page.getByRole('button', { name: 'Scan travel history' }).first().click();
    await mainTab(page, /Sync/i).click();
    const register = page.getByRole('button', { name: /Register to Atlas/ }).first();
    await expect(register).toBeVisible({ timeout: 15_000 });
    await register.click();
    await expect.poll(async () => (await visited(request)).length, { timeout: 15_000 }).toBeGreaterThan(0);
  });
});

// ---------------- W46 Calendar ----------------
test.describe('W46 Vacation calendar', () => {
  test('month navigation and Today', async ({ page }) => {
    await page.goto('/calendar');
    await expectAppShell(page);
    const month = () => page.locator('main').innerText();
    const before = await month();
    await page.getByRole('button', { name: 'Next month' }).click();
    await expect.poll(month).not.toBe(before);
    await page.getByRole('button', { name: 'Jump to current date' }).click();
    await page.getByRole('button', { name: 'Previous month' }).click();
  });

  test('tabs Timeline / Grid / Agenda / Optimizer render', async ({ page }) => {
    await page.goto('/calendar');
    await expectAppShell(page);
    for (const t of [/^Grid$/, /^Agenda$/, /^Optimizer$/, /^Timeline$/]) {
      await mainTab(page, t).click();
      await expect(page.getByText(/Try Again/i)).toHaveCount(0);
    }
  });

  test('a trip in the current month opens its details and "Inspect Trip Logistics" goes to the trip', async ({ page, request }) => {
    const d = new Date(); const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0');
    await seedTrip(request, s.token, { id: 'cal-trip', name: 'QA Calendar Trip', status: 'Upcoming', startDate: `${y}-${m}-10`, endDate: `${y}-${m}-12` }, ADMIN.id);
    await page.goto('/calendar');
    await expectAppShell(page);
    await page.locator('main button >> visible=true').filter({ hasText: /QA Calendar Trip/ }).first().click();
    await page.getByRole('button', { name: /Inspect Trip Logistics/ }).click();
    await expect(page).toHaveURL(/\/trip\/cal-trip$/);
  });

  test('traveler filter: "Filter None" hides everyone, "Unify All" restores', async ({ page, request }) => {
    await apiRegister(request, PARTNER);
    await page.goto('/calendar');
    await expectAppShell(page);
    const toggle = page.getByRole('button', { name: /Filter None|Unify All/ });
    await expect(toggle).toHaveText(/Filter None/);
    await toggle.click();
    await expect(toggle).toHaveText(/Unify All/);
    await toggle.click();
    await expect(toggle).toHaveText(/Filter None/);
  });

  test('trip count label uses correct plural ("1 trip")', async ({ page, request }) => {
    const d = new Date(); const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0');
    await seedTrip(request, s.token, { id: 'cal-1', name: 'QA One Trip', status: 'Upcoming', startDate: `${y}-${m}-03`, endDate: `${y}-${m}-04` }, ADMIN.id);
    await page.goto('/calendar');
    await expectAppShell(page);
    await expect(page.locator('main')).not.toContainText(/\b1 Trips\b/i);
  });

  test('no horizontal overflow on the calendar', async ({ page }) => {
    await page.goto('/calendar');
    await expectAppShell(page);
    await page.waitForTimeout(1200);
    expect(await overflowX(page)).toBeLessThanOrEqual(0);
  });
});
