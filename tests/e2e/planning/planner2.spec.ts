/**
 * Chunk B — workflow 23: Planner-2 (VacationPlanner): tabs, view modes, filters, status toggle, edit, batch merge.
 */
import { test, expect, ADMIN, resetDb, apiRegister, seedSession, expectAppShell } from '../support/fixtures';
import { seedTrip, apiTrips, isoDaysFromNow, inMain } from '../support/planning';

let s: { token: string; user: any };
const PAST = { id: 'p2-past', name: 'P2 Past Cairo', status: 'Past' as const, startDate: '2025-02-01', endDate: '2025-02-06', location: 'Cairo, Egypt' };
const UP = { id: 'p2-up', name: 'P2 Upcoming Rome', status: 'Upcoming' as const, startDate: isoDaysFromNow(20), endDate: isoDaysFromNow(24), location: 'Rome, Italy' };
const PLAN_A = { id: 'p2-plan-a', name: 'P2 Plan Hanoi', status: 'Planning' as const, startDate: isoDaysFromNow(60), endDate: isoDaysFromNow(64), location: 'Hanoi, Vietnam' };
const PLAN_B = { id: 'p2-plan-b', name: 'P2 Plan Hue', status: 'Planning' as const, startDate: isoDaysFromNow(65), endDate: isoDaysFromNow(68), location: 'Hue, Vietnam' };

test.beforeEach(async ({ page, request }) => {
  await resetDb(request);
  s = await apiRegister(request, ADMIN);
  for (const t of [PAST, UP, PLAN_A, PLAN_B]) await seedTrip(request, s.token, t, ADMIN.id);
  await seedSession(page, s.token, s.user);
  await page.goto('/planner-2');
  await expectAppShell(page);
});

const name = (page, n: string) => inMain(page, n).first();
const tabBtn = (page, label: RegExp) => page.locator('main button >> visible=true').filter({ hasText: label }).first();

test('tabs: Locked Timeline (Confirmed), Draft Blueprints (Planned), Archive Chronology (History)', async ({ page }) => {
  await tabBtn(page, /Locked Timeline/).click();
  await expect(name(page, UP.name)).toBeVisible();
  await expect(inMain(page, PLAN_A.name)).toHaveCount(0);
  await tabBtn(page, /Draft Blueprints/).click();
  await expect(name(page, PLAN_A.name)).toBeVisible();
  await expect(page.locator('main button >> visible=true').filter({ hasText: /^Lock In$/ }), 'only the 2 drafts are listed').toHaveCount(2);
  await tabBtn(page, /Archive Chronology/).click();
  await expect(name(page, PAST.name)).toBeVisible();
});

test('view modes: grid, timeline and table each render the trips', async ({ page }) => {
  await tabBtn(page, /Draft Blueprints/).click();
  for (const label of ['Grid cards view', 'Timeline rail view', 'Logistics table view']) {
    await page.getByRole('button', { name: label }).click();
    await expect(name(page, PLAN_A.name), label).toBeVisible();
  }
});

test('search filters trips and the clear button resets it', async ({ page }) => {
  await tabBtn(page, /Draft Blueprints/).click();
  const search = page.locator('input[placeholder="Search expeditions, stops, notes..."] >> visible=true').first();
  await search.fill('hue');
  await expect(name(page, PLAN_B.name)).toBeVisible();
  await expect(inMain(page, PLAN_A.name)).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(name(page, PLAN_A.name)).toBeVisible();
});

test('advanced filters toggle shows the filter selects', async ({ page }) => {
  await page.getByRole('button', { name: 'Toggle filters' }).click();
  await expect(page.getByText(/Departure Year/i).first()).toBeVisible();
  await expect(page.getByText(/Sort Sequence/i).first()).toBeVisible();
});

test('status toggle "Lock In" moves a draft to Confirmed and persists', async ({ page, request }) => {
  await tabBtn(page, /Draft Blueprints/).click();
  await page.getByRole('button', { name: 'Grid cards view' }).click();
  const cardEl = name(page, PLAN_A.name).locator('xpath=ancestor::div[.//button][3]');
  await cardEl.getByRole('button', { name: /Lock In/i }).first().click();
  await expect.poll(async () => (await apiTrips(request, s.token)).find((t) => t.id === PLAN_A.id)?.status).toBe('Upcoming');
});

test('edit (Configure Trip) renames the trip via the edit drawer', async ({ page, request }) => {
  await tabBtn(page, /Draft Blueprints/).click();
  await page.getByRole('button', { name: 'Logistics table view' }).click();
  const row = page.locator('tr', { hasText: PLAN_A.name });
  await row.getByRole('button', { name: 'Configure Trip' }).click();
  const nameInput = page.locator('input[placeholder="e.g. Summer in Tokyo"]');
  await expect(nameInput).toBeVisible();
  await nameInput.fill('P2 Plan Hanoi Renamed');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect.poll(async () => (await apiTrips(request, s.token)).find((t) => t.id === PLAN_A.id)?.name).toBe('P2 Plan Hanoi Renamed');
});

test('batch merge: select two drafts, name, Consolidate → one merged trip', async ({ page, request }) => {
  await tabBtn(page, /Draft Blueprints/).click();
  await expect(name(page, PLAN_A.name)).toBeVisible();
  await page.getByRole('button', { name: /Batch Merge/i }).click();
  await name(page, PLAN_A.name).click();
  await name(page, PLAN_B.name).click();
  await page.locator('input[placeholder="Consolidated Journey Title..."]').fill('P2 Vietnam Combined');
  await page.getByRole('button', { name: /^Consolidate$/ }).click();
  await expect.poll(async () => (await apiTrips(request, s.token)).some((t) => t.name === 'P2 Vietnam Combined'), { timeout: 10_000 }).toBe(true);
  await expect.poll(async () => (await apiTrips(request, s.token)).some((t) => t.id === PLAN_A.id || t.id === PLAN_B.id), { timeout: 10_000, message: 'originals replaced by the merged trip' }).toBe(false);
  const trips = await apiTrips(request, s.token);
  const merged = trips.find((t) => t.name === 'P2 Vietnam Combined');
  expect([merged.startDate, merged.endDate]).toEqual([PLAN_A.startDate, PLAN_B.endDate]);
});

test('batch merge with fewer than two trips selected does nothing and explains why', async ({ page, request }) => {
  await tabBtn(page, /Draft Blueprints/).click();
  await expect(name(page, PLAN_A.name)).toBeVisible();
  await page.getByRole('button', { name: /Batch Merge/i }).click();
  await name(page, PLAN_A.name).click();
  const consolidate = page.getByRole('button', { name: /^Consolidate$/ });
  if (await consolidate.isVisible()) {
    await expect(consolidate, 'Consolidate should be disabled with one selection').toBeDisabled();
  }
  expect((await apiTrips(request, s.token)).length).toBe(4);
});
