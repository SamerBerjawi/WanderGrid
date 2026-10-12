/**
 * Chunk B — workflow 9: create a trip with the TripSetupBoard wizard
 * (from Planner "New Trip" and the Planner bucket "+" buttons).
 */
import { test, expect, ADMIN, resetDb, apiRegister, seedSession, expectAppShell, isMobile } from '../support/fixtures';
import { pickRangeNextMonth, nextMonthDay, apiTrips, visible, inMain, waitForTrip } from '../support/planning';

let s: { token: string; user: any };
test.beforeEach(async ({ page, request }) => {
  await resetDb(request);
  s = await apiRegister(request, ADMIN);
  await seedSession(page, s.token, s.user);
});

const titleInput = (page) => visible(page, 'input[placeholder="e.g. Greek Island Odyssey"]').first();
const headerCreate = (page) => page.getByRole('button', { name: /^Create Trip$/ }).first();

async function openWizardFromPlanner(page) {
  await page.goto('/planner');
  await expectAppShell(page);
  await page.getByRole('button', { name: /New Trip/i }).first().click();
  await expect(titleInput(page)).toBeVisible();
}

test('happy path: title + dates → Create Trip saves a Planning trip and shows it on the board', async ({ page, request }) => {
  await openWizardFromPlanner(page);
  await titleInput(page).fill('QA Alps Escape');
  await pickRangeNextMonth(page, 10, 15);
  await headerCreate(page).click();
  const t = await waitForTrip(request, s.token, (x) => x.name === 'QA Alps Escape');
  await expect(inMain(page, 'QA Alps Escape').first(), 'new trip visible on the board').toBeVisible({ timeout: 10_000 });
  expect(t.status).toBe('Planning');
  expect([t.startDate, t.endDate]).toEqual([nextMonthDay(10), nextMonthDay(15)]);
  expect(t.participants).toContain(ADMIN.id);
});

test('Create Trip stays disabled until a title and both dates are set', async ({ page }) => {
  await openWizardFromPlanner(page);
  await expect(headerCreate(page)).toBeDisabled();
  await titleInput(page).fill('Only a title');
  await expect(headerCreate(page)).toBeDisabled();
  await pickRangeNextMonth(page, 3, 4);
  await expect(headerCreate(page)).toBeEnabled();
});

test('destination field is available in the basics step', async ({ page }) => {
  await openWizardFromPlanner(page);
  await expect(visible(page, 'input[placeholder="e.g. Santorini, Greece"]').first()).toBeVisible();
});

test('full wizard: basics → train leg → stay → Create saves transport and accommodation', async ({ page, request }) => {
  await openWizardFromPlanner(page);
  await titleInput(page).fill('QA Riviera Rail');
  await visible(page, 'input[placeholder="e.g. Santorini, Greece"]').first().fill('Nice, France');
  await pickRangeNextMonth(page, 5, 9);
  await page.getByRole('button', { name: isMobile(page) ? /Next: Configure Transport/i : /Confirm Basics/i }).click();
  await visible(page, 'button').filter({ hasText: /^Train$/ }).first().click();
  await visible(page, 'input[placeholder="e.g. Paris Gare de Lyon"]').first().fill('Paris Gare de Lyon');
  await visible(page, 'input[placeholder="e.g. Nice Ville"]').first().fill('Nice Ville');
  await visible(page, 'input[placeholder="e.g. SNCF, Eurostar, Amtrak"]').first().fill('SNCF');
  await visible(page, 'input[placeholder="e.g. TGV 6173"]').first().fill('TGV 6173');
  await page.getByRole('button', { name: /Add Transport Leg/i }).click();
  await page.getByRole('button', { name: isMobile(page) ? /Next: Stays/i : /Proceed to Stays/i }).click();
  await visible(page, 'input[placeholder^="e.g. Grand Hotel Tremezzo"]').first().fill('Hotel Negresco');
  await page.getByRole('button', { name: /^Add Stay$/ }).click();
  await headerCreate(page).click();
  const t = await waitForTrip(request, s.token, (x) => x.name === 'QA Riviera Rail');
  expect(t?.transports?.[0]?.mode).toBe('Train');
  expect(t?.transports?.[0]?.provider).toBe('SNCF');
  expect(t?.accommodations?.[0]?.name).toBe('Hotel Negresco');
});

test('basics step: "Next" applies the same rules as "Create Trip" (destination not secretly required)', async ({ page }) => {
  await openWizardFromPlanner(page);
  await titleInput(page).fill('QA No Destination');
  await pickRangeNextMonth(page, 13, 14);
  await expect(headerCreate(page), 'Create Trip allows saving without a destination').toBeEnabled();
  await page.getByRole('button', { name: isMobile(page) ? /Next: Configure Transport/i : /Confirm Basics/i }).click();
  await expect(page.getByText('Please enter a destination.')).toHaveCount(0);
});

test('bucket "+" on Confirmed creates an Upcoming trip', async ({ page, request }) => {
  await page.goto('/planner');
  await expectAppShell(page);
  await visible(page, 'button[aria-label="Add confirmed trip"]').first().click();
  await expect(titleInput(page)).toBeVisible();
  await titleInput(page).fill('QA Confirmed Trip');
  await pickRangeNextMonth(page, 20, 22);
  await headerCreate(page).click();
  const t = await waitForTrip(request, s.token, (x) => x.name === 'QA Confirmed Trip');
  expect(t?.status).toBe('Upcoming');
});

test('Cancel discards the draft and returns to the Planner without saving', async ({ page, request }) => {
  await openWizardFromPlanner(page);
  let posted = false;
  page.on('request', (r) => { if (r.url().endsWith('/api/trips') && r.method() === 'POST') posted = true; });
  await titleInput(page).fill('Never saved');
  await page.getByRole('button', { name: /^Cancel$/ }).first().click();
  await expect(titleInput(page)).toHaveCount(0);
  await expect(page.locator('main h1').first()).toContainText(/Planner/i);
  expect(posted).toBe(false);
  expect((await apiTrips(request, s.token)).length).toBe(0);
});

test('double-clicking Create Trip creates only one trip', async ({ page, request }) => {
  await openWizardFromPlanner(page);
  await titleInput(page).fill('QA Double Click');
  await pickRangeNextMonth(page, 11, 12);
  await headerCreate(page).dblclick();
  await waitForTrip(request, s.token, (x) => x.name === 'QA Double Click');
  await page.waitForTimeout(2000);
  expect((await apiTrips(request, s.token)).filter((x) => x.name === 'QA Double Click').length).toBe(1);
});

test('very long title (300 chars) saves and does not overflow the board', async ({ page, request }) => {
  const long = 'Very long expedition name '.repeat(12).slice(0, 300);
  await openWizardFromPlanner(page);
  await titleInput(page).fill(long);
  await pickRangeNextMonth(page, 1, 2);
  await headerCreate(page).click();
  await expect.poll(async () => (await apiTrips(request, s.token)).some((x) => x.name === long), { timeout: 10_000 }).toBe(true);
  await page.waitForTimeout(800);
  const overflow = await page.evaluate(() => { const m = document.querySelector('main'); return Math.max(document.documentElement.scrollWidth - innerWidth, m ? m.scrollWidth - m.clientWidth : 0); });
  expect(overflow).toBeLessThanOrEqual(0);
});

test('save failure (network) shows an error and keeps the wizard open with the data', async ({ page }) => {
  await openWizardFromPlanner(page);
  await titleInput(page).fill('QA Offline Trip');
  await pickRangeNextMonth(page, 7, 8);
  await page.route('**/api/trips', (r) => (r.request().method() === 'POST' ? r.abort('connectionrefused') : r.continue()));
  await headerCreate(page).click();
  await expect(page.getByText(/fail|error|could not|couldn.t|network|try again/i).first()).toBeVisible({ timeout: 15_000 });
  await expect(titleInput(page)).toHaveValue('QA Offline Trip');
});

test('page refresh mid-flow keeps (or warns before losing) the draft', async ({ page }) => {
  await openWizardFromPlanner(page);
  await titleInput(page).fill('QA Draft Survives Refresh');
  let dialog = false;
  page.on('dialog', async (d) => { dialog = true; await d.dismiss(); });
  await page.reload();
  await expectAppShell(page);
  // Either a "leave page?" warning was shown, or the draft comes back. The Planner is lazy-loaded, so wait for it
  // instead of reading the input once the shell appears (that read raced the chunk on slower runners).
  if (!dialog) await expect(titleInput(page), 'draft restored after refresh').toHaveValue('QA Draft Survives Refresh', { timeout: 15_000 });
});

test('browser Back while the wizard is open returns to the Planner board', async ({ page }) => {
  await page.goto('/');
  await expectAppShell(page);
  await page.goto('/planner');
  await expectAppShell(page);
  await page.getByRole('button', { name: /New Trip/i }).first().click();
  await expect(titleInput(page)).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/planner$/);
  await expect(titleInput(page)).toHaveCount(0);
});
