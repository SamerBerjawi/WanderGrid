/**
 * Chunk B — workflows 10–11: Planner board browse/filter/search/open, bulk "archive".
 */
import { test, expect, ADMIN, resetDb, apiRegister, seedSession, expectAppShell, answerConfirm } from '../support/fixtures';
import { seedTrip, apiTrips, isoDaysFromNow, inMain, visible } from '../support/planning';

let s: { token: string; user: any };
const PAST = { id: 'qa-past', name: 'QA Past Kyoto', status: 'Past' as const, startDate: '2025-03-01', endDate: '2025-03-10', location: 'Kyoto, Japan' };
const UPCOMING = { id: 'qa-up', name: 'QA Upcoming Oslo', status: 'Upcoming' as const, startDate: isoDaysFromNow(30), endDate: isoDaysFromNow(35), location: 'Oslo, Norway' };
const PLANNING = { id: 'qa-plan', name: 'QA Planning Lima', status: 'Planning' as const, startDate: isoDaysFromNow(90), endDate: isoDaysFromNow(99), location: 'Lima, Peru' };

test.beforeEach(async ({ page, request }) => {
  await resetDb(request);
  s = await apiRegister(request, ADMIN);
  await seedSession(page, s.token, s.user);
});

async function seedAll(request) {
  for (const t of [PAST, UPCOMING, PLANNING]) await seedTrip(request, s.token, t, ADMIN.id);
}

const card = (page, name: string) => inMain(page, name).first();
const gone = (page, name: string) => inMain(page, name);
const tab = (page, label: string) => page.locator('main').getByRole('button', { name: new RegExp(`^${label}`) }).first();

test('empty state: no trips shows empty-state prompts in each bucket', async ({ page }) => {
  await page.goto('/planner');
  await expectAppShell(page);
  await expect(page.getByText(/No confirmed bookings yet/i)).toBeVisible();
  await expect(page.getByText(/No draft plans yet/i)).toBeVisible();
});

test('board shows each trip in its status bucket', async ({ page, request }) => {
  await seedAll(request);
  await page.goto('/planner');
  await expectAppShell(page);
  for (const t of [PAST, UPCOMING, PLANNING]) await expect(card(page, t.name), t.name).toBeVisible();
});

test('status tabs filter the board (Past / Confirmed / Planned / All)', async ({ page, request }) => {
  await seedAll(request);
  await page.goto('/planner');
  await expectAppShell(page);
  await tab(page, 'Past').click();
  await expect(card(page, PAST.name)).toBeVisible();
  await expect(gone(page, UPCOMING.name)).toHaveCount(0);
  await tab(page, 'Confirmed').click();
  await expect(card(page, UPCOMING.name)).toBeVisible();
  await expect(gone(page, PLANNING.name)).toHaveCount(0);
  await tab(page, 'Planned').click();
  await expect(card(page, PLANNING.name)).toBeVisible();
  await tab(page, 'All Expeditions').click();
  await expect(card(page, PAST.name)).toBeVisible();
  await expect(card(page, PLANNING.name)).toBeVisible();
});

test('search filters by trip name and the clear (×) restores the list', async ({ page, request }) => {
  await seedAll(request);
  await page.goto('/planner');
  await expectAppShell(page);
  const search = page.locator('input[placeholder^="Filter"] >> visible=true').first();
  await search.fill('oslo');
  await expect(card(page, UPCOMING.name)).toBeVisible();
  await expect(gone(page, PAST.name)).toHaveCount(0);
  await search.fill('');
  await expect(card(page, PAST.name)).toBeVisible();
});

test('search with no matches shows an empty result, not stale cards', async ({ page, request }) => {
  await seedAll(request);
  await page.goto('/planner');
  await expectAppShell(page);
  await page.locator('input[placeholder^="Filter"] >> visible=true').first().fill('zzzz-no-match');
  for (const t of [PAST, UPCOMING, PLANNING]) await expect(gone(page, t.name)).toHaveCount(0);
});

test('year filter shows only trips from that year', async ({ page, request }) => {
  await seedAll(request);
  await page.goto('/planner');
  await expectAppShell(page);
  await page.locator('button >> visible=true', { hasText: 'All Years' }).first().click();
  await page.locator('button >> visible=true', { hasText: /^\s*2025\s*$/ }).last().click();
  await expect(card(page, PAST.name)).toBeVisible();
  await expect(gone(page, PLANNING.name)).toHaveCount(0);
});

test('clicking a trip card opens Trip Detail', async ({ page, request }) => {
  await seedAll(request);
  await page.goto('/planner');
  await expectAppShell(page);
  await card(page, UPCOMING.name).click();
  await expect(page).toHaveURL(/\/trip\/qa-up$/);
  await expect(inMain(page, UPCOMING.name).first()).toBeVisible({ timeout: 15_000 });
});

test('bucket collapse hides the bucket\'s cards', async ({ page, request }) => {
  await seedAll(request);
  await page.goto('/planner');
  await expectAppShell(page);
  await expect(card(page, PAST.name)).toBeVisible();
  await page.getByRole('button', { name: 'Collapse Past trips' }).click();
  await expect(gone(page, PAST.name)).toHaveCount(0);
});

test('bulk select → "Archive Selected" archives (keeps) the trips, and they can be found again', async ({ page, request }) => {
  await seedAll(request);
  await page.goto('/planner');
  await expectAppShell(page);
  await page.locator('button[title="Toggle bulk selection"]').click();
  for (const name of [UPCOMING.name, PLANNING.name]) {
    await page.locator('main div').filter({ has: page.locator(`text="${name}"`) }).filter({ has: page.locator('button[aria-label="Select trip"]') }).last().locator('button[aria-label="Select trip"]').click();
  }
  await page.getByRole('button', { name: /Archive Selected/i }).click();
  await answerConfirm(page, true);
  await expect(gone(page, UPCOMING.name)).toHaveCount(0);
  const ids = (await apiTrips(request, s.token)).map((t) => t.id);
  expect(ids, '"Archive" must not permanently delete trips').toEqual(expect.arrayContaining(['qa-up', 'qa-plan']));
  // ...and they can be found again in the Archived view and restored.
  await expect.poll(async () => (await apiTrips(request, s.token)).filter((t) => t.archived).length).toBe(2);
  await page.getByRole('button', { name: 'Show archived trips' }).click();
  await expect(card(page, UPCOMING.name)).toBeVisible();
  await expect(gone(page, PAST.name)).toHaveCount(0);
  await page.locator('button[title="Toggle bulk selection"]').click();
  await page.locator('main div').filter({ has: page.locator(`text="${UPCOMING.name}"`) }).filter({ has: page.locator('button[aria-label="Select trip"]') }).last().locator('button[aria-label="Select trip"]').click();
  await page.getByRole('button', { name: /Restore Selected/i }).click();
  await answerConfirm(page, true);
  await expect.poll(async () => (await apiTrips(request, s.token)).find((t) => t.id === 'qa-up')?.archived).toBe(false);
});

test('bulk archive: dismissing the confirmation changes nothing', async ({ page, request }) => {
  await seedAll(request);
  await page.goto('/planner');
  await expectAppShell(page);
  await page.locator('button[title="Toggle bulk selection"]').click();
  await page.locator('main div').filter({ has: page.locator(`text="${PAST.name}"`) }).filter({ has: page.locator('button[aria-label="Select trip"]') }).last().locator('button[aria-label="Select trip"]').click();
  await page.getByRole('button', { name: /Archive Selected/i }).click();
  await answerConfirm(page, false);
  await expect(card(page, PAST.name)).toBeVisible();
  expect((await apiTrips(request, s.token)).length).toBe(3);
});

test('API failure loading trips shows an error, not an empty board', async ({ page, request }) => {
  await seedAll(request);
  await page.route('**/api/trips', (r) => (r.request().method() === 'GET' ? r.fulfill({ status: 500, body: '{"error":"x"}', contentType: 'application/json' }) : r.continue()));
  await page.goto('/planner');
  await expectAppShell(page);
  await expect(page.getByText(/couldn.t load|failed to load|error|try again|unavailable/i).first()).toBeVisible({ timeout: 20_000 });
});
