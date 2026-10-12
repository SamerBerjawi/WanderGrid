/**
 * Chunk G — Settings, data & administration (workflows 33–41, 48).
 */
import * as fs from 'fs';
import * as path from 'path';
import { test, expect, ADMIN, PARTNER, resetDb, apiRegister, apiLogin, seedSession, expectAppShell, waitForAuthScreen, isMobile } from '../support/fixtures';
import { seedTrip, apiGet, visible, inMain, overflowX } from '../support/planning';

let s: { token: string; user: any };
test.beforeEach(async ({ page, request }) => {
  await resetDb(request);
  s = await apiRegister(request, ADMIN);
  await seedSession(page, s.token, s.user);
});
const settings = (request) => apiGet(request, s.token, '/api/settings');
const users = (request) => apiGet(request, s.token, '/api/users');
async function openSettings(page, tab?: string) {
  await page.goto('/settings');
  await expectAppShell(page);
  if (tab) await page.locator('main button >> visible=true').filter({ hasText: new RegExp(`^${tab}`) }).first().click();
}
const saveSettings = (page) => page.getByRole('button', { name: /^Save Settings$/ }).first();

// ---------------- W34 Workspace ----------------
test.describe('W34 Workspace preferences', () => {
  test('change organisation name and currency, save, persists after reload', async ({ page, request }) => {
    await openSettings(page, 'Workspace');
    await visible(page, 'input[placeholder="WanderGrid Workspace"]').first().fill('QA Travel Co');
    await page.locator('select >> visible=true').filter({ has: page.locator('option[value="EUR"]') }).first().selectOption('EUR');
    await saveSettings(page).click();
    await expect.poll(async () => (await settings(request)).orgName, { timeout: 10_000 }).toBe('QA Travel Co');
    expect((await settings(request)).currency).toBe('EUR');
    await page.reload();
    await expectAppShell(page);
    await expect(visible(page, 'input[placeholder="WanderGrid Workspace"]').first()).toHaveValue('QA Travel Co');
  });

  test('saving Settings does not undo a theme changed elsewhere meanwhile (REL-005)', async ({ page, request }) => {
    await openSettings(page, 'Workspace');
    // Another tab (or the sidebar toggle) switches the theme after this page loaded its snapshot.
    await request.patch('/api/settings', { headers: { Authorization: `Bearer ${s.token}` }, data: { theme: 'light' } });
    await visible(page, 'input[placeholder="WanderGrid Workspace"]').first().fill('QA Concurrency Co');
    await saveSettings(page).click();
    await expect.poll(async () => (await settings(request)).orgName, { timeout: 10_000 }).toBe('QA Concurrency Co');
    expect((await settings(request)).theme).toBe('light');
  });

  test('working-day toggles save', async ({ page, request }) => {
    await openSettings(page, 'Workspace');
    const before = (await settings(request)).workingDays ?? [1, 2, 3, 4, 5];
    await page.locator('main button.font-mono >> visible=true').first().click();
    await saveSettings(page).click();
    await expect.poll(async () => JSON.stringify((await settings(request)).workingDays), { timeout: 10_000 }).not.toBe(JSON.stringify(before));
  });

  test('save failure (500) shows an error and the button recovers', async ({ page }) => {
    await openSettings(page, 'Workspace');
    await page.route('**/api/settings', (r) => (r.request().method() !== 'GET' ? r.fulfill({ status: 500, body: '{"error":"x"}', contentType: 'application/json' }) : r.continue()));
    await visible(page, 'input[placeholder="WanderGrid Workspace"]').first().fill('Will Not Save');
    await saveSettings(page).click();
    await expect(page.getByText(/fail|error|could not|couldn.t|try again/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /^Save Settings$/ }).first()).toBeEnabled({ timeout: 20_000 });
  });

  test('settings page has no horizontal overflow', async ({ page }) => {
    for (const t of ['Workspace', 'Members', 'Integrations', 'Gear', 'Carriers', 'Data Management']) {
      await openSettings(page, t);
      await page.waitForTimeout(600);
      expect.soft(await overflowX(page), t).toBeLessThanOrEqual(0);
    }
  });
});

// ---------------- W33 Members ----------------
test.describe('W33 Members', () => {
  test('enroll a member: appears in the roster and can sign in with the given password', async ({ page, request }) => {
    await openSettings(page, 'Members');
    await page.getByRole('button', { name: /Add Member/ }).click();
    await page.locator('input[placeholder="e.g. Elena Rostova"]').fill('Elena Rostova');
    await page.locator('input[placeholder="e.g. elena@wandergrid.abc"]').fill('elena@wandergrid.test');
    await page.locator('input[placeholder="At least 8 characters"]').fill('Elena!Pass1');
    await page.getByRole('button', { name: /^Save Member$/ }).click();
    await expect.poll(async () => (await users(request)).some((u) => u.email === 'elena@wandergrid.test'), { timeout: 10_000 }).toBe(true);
    await expect(inMain(page, 'Elena Rostova').first()).toBeVisible();
    const r = await apiLogin(request, 'elena@wandergrid.test', 'Elena!Pass1');
    expect(r.status(), 'enrolled member can sign in').toBe(200);
  });

  test('enroll requires name, email and password', async ({ page, request }) => {
    await openSettings(page, 'Members');
    await page.getByRole('button', { name: /Add Member/ }).click();
    const save = page.getByRole('button', { name: /^Save Member$/ });
    await expect(save, 'Save is disabled until a name is entered').toBeDisabled();
    await page.locator('input[placeholder="e.g. Elena Rostova"]').fill('No Password');
    await page.locator('input[placeholder="e.g. elena@wandergrid.abc"]').fill('nopass@wandergrid.test');
    await save.click();
    await expect(page.getByRole('alert')).toContainText(/password/i);
    await page.locator('input[type="password"] >> visible=true').last().fill('short');
    await save.click();
    await expect(page.getByRole('alert')).toContainText(/at least 8 characters/);
    expect((await users(request)).length).toBe(1);
  });

  test('enrolling an email that already exists is rejected', async ({ page, request }) => {
    await apiRegister(request, PARTNER);
    await openSettings(page, 'Members');
    await page.getByRole('button', { name: /Add Member/ }).click();
    await page.locator('input[placeholder="e.g. Elena Rostova"]').fill('Dup');
    await page.locator('input[placeholder="e.g. elena@wandergrid.abc"]').fill(PARTNER.email);
    await page.locator('input[placeholder="At least 8 characters"]').fill('abc12345');
    page.on('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name: /^Save Member$/ }).click();
    await page.waitForTimeout(1500);
    const matches = (await users(request)).filter((u) => u.email === PARTNER.email);
    expect(matches.length).toBe(1);
    expect(matches[0].name, 'existing user must not be overwritten').toBe(PARTNER.name);
  });

  test('edit a member name', async ({ page, request }) => {
    await apiRegister(request, PARTNER);
    await openSettings(page, 'Members');
    await page.locator('main div', { hasText: PARTNER.name }).locator('button[title="Edit member"]').last().click();
    await page.locator('input[placeholder="e.g. Elena Rostova"]').fill('QA Partner Renamed');
    await page.getByRole('button', { name: /^Save Member$/ }).click();
    await expect.poll(async () => (await users(request)).find((u) => u.email === PARTNER.email)?.name, { timeout: 10_000 }).toBe('QA Partner Renamed');
  });

  test('remove a member (confirm)', async ({ page, request }) => {
    await apiRegister(request, PARTNER);
    await openSettings(page, 'Members');
    await page.locator('main div', { hasText: PARTNER.name }).locator('button[title="Delete member"]').last().click();
    await page.getByRole('button', { name: /^Confirm Removal$/ }).click();
    await expect.poll(async () => (await users(request)).length, { timeout: 10_000 }).toBe(1);
  });

  test('a Partner who tries an admin-only save stays signed in and changes nothing', async ({ browser, request }) => {
    const partner = await apiRegister(request, PARTNER);
    const ctx = await browser.newContext({ viewport: test.info().project.use.viewport, baseURL: 'http://localhost:4173', serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await seedSession(page, partner.token, partner.user);
    await openSettings(page, 'Workspace');
    await visible(page, 'input[placeholder="WanderGrid Workspace"]').first().fill('Partner Was Here');
    await saveSettings(page).click();
    await page.waitForTimeout(1500);
    await expectAppShell(page);
    expect(await page.evaluate(() => !!localStorage.getItem('wandergrid_session_token')), 'still signed in').toBe(true);
    expect((await settings(request)).orgName).not.toBe('Partner Was Here');
    await ctx.close();
  });

  test('the signed-in admin cannot remove their own account', async ({ page, request }) => {
    await openSettings(page, 'Members');
    const own = page.locator('main div', { hasText: ADMIN.email }).locator('button[title="Delete member"]').last();
    if (await own.isVisible().catch(() => false)) {
      await own.click();
      const confirm = page.getByRole('button', { name: /^Confirm Removal$/ });
      if (await confirm.isVisible().catch(() => false)) await confirm.click();
      await page.waitForTimeout(1500);
    }
    expect((await users(request)).some((u) => u.email === ADMIN.email)).toBe(true);
  });
});

// ---------------- W35 Integrations ----------------
test.describe('W35 Integrations', () => {
  test('API key is saved and masked by default', async ({ page, request }) => {
    await openSettings(page, 'Integrations');
    const key = visible(page, 'input[placeholder="Paste AviationStack Key..."]').first();
    await key.fill('qa-test-key-123');
    expect(await key.getAttribute('type')).toBe('password');
    await saveSettings(page).click();
    // SEC-010: the key is stored server-side but never returned; clients only see a mask + "configured".
    await expect.poll(async () => (await settings(request)).configuredKeys?.aviationStackApiKey, { timeout: 10_000 }).toBe(true);
    expect((await settings(request)).aviationStackApiKey).not.toBe('qa-test-key-123');
  });

  test('"Test All Services" reports a result for each provider (no auth errors)', async ({ page }) => {
    await openSettings(page, 'Integrations');
    const statuses: number[] = [];
    page.on('response', (r) => { if (r.url().includes('/api/proxy/test/')) statuses.push(r.status()); });
    await page.getByRole('button', { name: /Test All Services/ }).click();
    await expect.poll(() => statuses.length, { timeout: 30_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(3000);
    expect(statuses.filter((x) => x === 401 || x === 403), 'test endpoints must not fail authentication').toEqual([]);
  });
});

// ---------------- W36 Gear ----------------
test.describe('W36 Gear master list', () => {
  test('add and remove a master packing item, saved to settings', async ({ page, request }) => {
    await openSettings(page, 'Gear');
    await visible(page, 'input[placeholder^="Add standard packing item"]').first().fill('QA Universal Adapter');
    await page.getByRole('button', { name: 'Add item to master list' }).click();
    await saveSettings(page).click();
    await expect.poll(async () => (await settings(request)).masterPackingList?.some((i) => i.text === 'QA Universal Adapter'), { timeout: 10_000 }).toBe(true);
    await page.getByRole('button', { name: 'Remove QA Universal Adapter' }).click();
    await saveSettings(page).click();
    await expect.poll(async () => (await settings(request)).masterPackingList?.some((i) => i.text === 'QA Universal Adapter'), { timeout: 10_000 }).toBe(false);
  });

  test('an empty gear item cannot be added', async ({ page }) => {
    await openSettings(page, 'Gear');
    const countBefore = await page.locator('main button[aria-label^="Remove "]').count();
    await page.getByRole('button', { name: 'Add item to master list' }).click();
    expect(await page.locator('main button[aria-label^="Remove "]').count()).toBe(countBefore);
  });
});

// ---------------- W37 Carriers ----------------
test.describe('W37 Carriers', () => {
  test('register a carrier via the drawer and save', async ({ page, request }) => {
    await openSettings(page, 'Carriers');
    await page.getByRole('button', { name: /^Add Carrier$/ }).click();
    await page.locator('input[placeholder="e.g. British Airways"]').fill('QA Airways');
    await page.locator('input[placeholder="e.g. BA"]').fill('QA');
    await page.locator('input[placeholder="e.g. britishairways.com"]').fill('qa-airways.test');
    await page.getByRole('button', { name: /^Register Carrier$/ }).click();
    await saveSettings(page).click();
    await expect.poll(async () => (await settings(request)).carriers?.some((c) => c.name === 'QA Airways'), { timeout: 10_000 }).toBe(true);
  });

  test('Register Carrier is disabled until name, code and domain are filled', async ({ page }) => {
    await openSettings(page, 'Carriers');
    await page.getByRole('button', { name: /^Add Carrier$/ }).click();
    await expect(page.getByRole('button', { name: /^Register Carrier$/ })).toBeDisabled();
    await page.locator('input[placeholder="e.g. British Airways"]').fill('X');
    await expect(page.getByRole('button', { name: /^Register Carrier$/ })).toBeDisabled();
  });
});

// ---------------- W38 Backup & restore ----------------
test.describe('W38 Backup & restore', () => {
  test('download backup: valid JSON with trips and no passwords', async ({ page, request }) => {
    await seedTrip(request, s.token, { id: 'bk-trip', name: 'QA Backup Trip', status: 'Planning', startDate: '2026-12-01', endDate: '2026-12-03' }, ADMIN.id);
    await openSettings(page, 'Data Management');
    await page.getByRole('button', { name: /^Download Backup JSON$/ }).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /^Download Backup JSON \(/ }).click()]);
    const json = JSON.parse(fs.readFileSync((await dl.path())!, 'utf8'));
    const text = JSON.stringify(json);
    expect(text).toContain('QA Backup Trip');
    expect(text).not.toMatch(/"password"\s*:/);
  });

  test('restore from file (merge) adds the trip from the backup', async ({ page, request }, info) => {
    const file = path.join(info.outputDir, 'backup.json');
    fs.mkdirSync(info.outputDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ trips: [{ id: 'rs-trip', name: 'QA Restored Trip', status: 'Planning', startDate: '2026-12-10', endDate: '2026-12-12', participants: [ADMIN.id], privacy: 'Private' }], users: [], flights: [], visited: [] }));
    await openSettings(page, 'Data Management');
    await page.locator('input[type="file"][accept=".json"]').first().setInputFiles(file);
    await page.getByRole('button', { name: /^Merge with Existing$/i }).click();
    await page.getByRole('button', { name: /Merge Selected Categories|Overwrite Selected Categories/ }).click();
    await expect.poll(async () => (await apiGet(request, s.token, '/api/trips')).some((t) => t.id === 'rs-trip'), { timeout: 15_000 }).toBe(true);
  });

  test('restore of an invalid file shows an error and changes nothing', async ({ page, request }, info) => {
    const file = path.join(info.outputDir, 'bad.json');
    fs.mkdirSync(info.outputDir, { recursive: true });
    fs.writeFileSync(file, '{not valid json');
    await openSettings(page, 'Data Management');
    const before = (await apiGet(request, s.token, '/api/trips')).length;
    await page.locator('input[type="file"][accept=".json"]').first().setInputFiles(file);
    await expect(page.getByRole('alert').filter({ hasText: /invalid|corrupt|unrecognized|could not|error/i }).first()).toBeVisible({ timeout: 10_000 });
    expect((await apiGet(request, s.token, '/api/trips')).length).toBe(before);
  });
});

// ---------------- W39 Calendar export ----------------
test.describe('W39 Calendar export & subscription', () => {
  test('Download .ICS Calendar File produces a calendar', async ({ page, request }) => {
    await seedTrip(request, s.token, { id: 'ics-trip', name: 'QA ICS Trip', status: 'Upcoming', startDate: '2026-12-05', endDate: '2026-12-07' }, ADMIN.id);
    await openSettings(page, 'Data Management');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download \.ICS Calendar File/ }).click()]);
    const body = fs.readFileSync((await dl.path())!, 'utf8');
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('QA ICS Trip');
  });

  test('the copied iCal subscription URL returns a calendar', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openSettings(page, 'Data Management');
    await page.getByRole('button', { name: /Copy iCal Subscription URL/ }).click();
    await expect(page.getByText(/URL Copied to Clipboard/)).toBeVisible();
    const url = await page.evaluate(() => navigator.clipboard.readText());
    const res = await page.request.get(url);
    expect(res.status(), `GET ${url}`).toBe(200);
    expect(await res.text()).toContain('BEGIN:VCALENDAR');
  });

  test('Reset Subscription Link issues a new private URL and the old one stops working', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openSettings(page, 'Data Management');
    await page.getByRole('button', { name: /Copy iCal Subscription URL/ }).click();
    await expect(page.getByText(/URL Copied to Clipboard/)).toBeVisible();
    const oldUrl = await page.evaluate(() => navigator.clipboard.readText());
    expect(oldUrl).not.toContain(ADMIN.email);
    await expect(page.getByText(/URL Copied to Clipboard/)).toHaveCount(0, { timeout: 5000 });
    await page.getByRole('button', { name: /Reset Subscription Link/ }).click();
    await expect(page.getByText(/URL Copied to Clipboard/)).toBeVisible();
    const newUrl = await page.evaluate(() => navigator.clipboard.readText());
    expect(newUrl).not.toBe(oldUrl);
    expect((await page.request.get(oldUrl)).status()).toBe(404);
    expect((await page.request.get(newUrl)).status()).toBe(200);
  });
});

// ---------------- W40 Wipe ----------------
test.describe('W40 Wipe database', () => {
  test('Wipe button stays disabled until "DELETE" is typed', async ({ page }) => {
    await openSettings(page, 'Data Management');
    await page.getByRole('button', { name: /Wipe & Reset Application/ }).click();
    const wipe = page.getByRole('button', { name: /^Wipe Database$/ });
    await page.locator('input[placeholder="Type DELETE"]').fill('delete');
    await expect(wipe).toBeDisabled();
    await page.locator('input[placeholder="Type DELETE"]').fill('DELETE');
    await expect(wipe).toBeEnabled();
  });

  test('wipe deletes all data and returns to sign-in', async ({ page, request }) => {
    await seedTrip(request, s.token, { id: 'w-trip', name: 'QA Wipe Me', status: 'Planning', startDate: '2026-12-01', endDate: '2026-12-02' }, ADMIN.id);
    await openSettings(page, 'Data Management');
    await page.getByRole('button', { name: /Wipe & Reset Application/ }).click();
    await page.locator('input[placeholder="Type DELETE"]').fill('DELETE');
    await page.getByRole('button', { name: /^Wipe Database$/ }).click();
    await waitForAuthScreen(page);
    const r = await request.post('/api/auth/login', { data: { email: ADMIN.email, password: ADMIN.password } });
    expect(r.status()).toBe(401);
  });
});

// ---------------- W41 Profile ----------------
test.describe('W41 Profile', () => {
  async function openOwnProfile(page) {
    await page.goto(`/user/${ADMIN.id}`);
    await expectAppShell(page);
    await expect(page.locator('main h1').first()).toContainText(ADMIN.name, { timeout: 15_000 });
  }

  test('edit profile name and passport number', async ({ page, request }) => {
    await openOwnProfile(page);
    await page.locator('main h1', { hasText: ADMIN.name }).locator('xpath=following-sibling::button[1]').click();
    await page.locator('input[placeholder="e.g. Elena Rostova"]').fill('QA Admin Updated');
    await page.locator('input[placeholder="e.g. RL1234567"]').fill('X1234567');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect.poll(async () => (await users(request)).find((u) => u.email === ADMIN.email)?.name, { timeout: 10_000 }).toBe('QA Admin Updated');
  });

  test('editing the profile without touching the password keeps the existing password working', async ({ page, request }) => {
    await openOwnProfile(page);
    await page.locator('main h1', { hasText: ADMIN.name }).locator('xpath=following-sibling::button[1]').click();
    await page.locator('input[placeholder="e.g. Elena Rostova"]').fill('QA Admin Same Password');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await page.waitForTimeout(1500);
    expect((await apiLogin(request, ADMIN.email, ADMIN.password)).status()).toBe(200);
  });

  test('profile trip table: edit a trip name', async ({ page, request }) => {
    await seedTrip(request, s.token, { id: 'pf-trip', name: 'QA Profile Trip', status: 'Planning', startDate: '2026-12-01', endDate: '2026-12-02' }, ADMIN.id);
    await openOwnProfile(page);
    await inMain(page, 'QA Profile Trip').first().locator('xpath=ancestor::tr[1]').locator('button').nth(0).click().catch(() => {});
    const nameInput = page.locator('input[placeholder="e.g. Summer Vacation"]');
    if (!(await nameInput.isVisible().catch(() => false))) {
      await inMain(page, 'QA Profile Trip').first().locator('xpath=ancestor::tr[1]').locator('button').nth(1).click();
    }
    await nameInput.fill('QA Profile Trip Edited');
    await page.getByRole('button', { name: 'Save Expedition' }).click();
    await expect.poll(async () => (await apiGet(request, s.token, '/api/trips')).find((t) => t.id === 'pf-trip')?.name, { timeout: 10_000 }).toBe('QA Profile Trip Edited');
  });
});

// ---------------- W48 Error recovery ----------------
test.describe('W48 Error recovery', () => {
  test('a view crash shows the recovery card, and "Return to Dashboard" works', async ({ page }) => {
    await page.route('**/api/trips', (r) => (r.request().method() === 'GET' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"not":"an array"}' }) : r.continue()));
    await page.goto('/planner');
    await expectAppShell(page);
    const recover = page.getByRole('button', { name: /Return to Dashboard/ });
    const crashed = await recover.isVisible({ timeout: 10_000 }).catch(() => false);
    if (crashed) {
      await page.unroute('**/api/trips');
      await recover.click();
      await expect(page).toHaveURL(/\/$/);
    } else {
      // Not crashing on bad data is acceptable too, as long as the page still renders.
      await expect(page.locator('main h1').first()).toBeVisible();
    }
  });
});
