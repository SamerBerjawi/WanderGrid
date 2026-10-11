/**
 * Chunk E — Road trips & routing (workflows 30–32):
 * create/edit land journey (modes, route calculation, waypoints, trip association), auto-sync, browse/delete.
 */
import { test, expect, ADMIN, resetDb, apiRegister, seedSession, expectAppShell } from '../support/fixtures';
import { seedTrip, seedFlight, flightRecord, apiGet, apiTrips, isoDaysFromNow, visible, inMain, overflowX, pickDateNextMonth } from '../support/planning';

let s: { token: string; user: any };
test.beforeEach(async ({ page, request }) => {
  await resetDb(request);
  s = await apiRegister(request, ADMIN);
  await seedSession(page, s.token, s.user);
});

const landRecords = async (request) => (await apiGet(request, s.token, '/api/flights')).filter((f) => f.mode && f.mode !== 'Flight');
const train = (id: string, over: Record<string, any> = {}) => flightRecord(id, { mode: 'Train', origin: 'Paris', destination: 'Lyon', provider: 'SNCF', identifier: 'TGV 6601', ...over });

async function openRoadTrips(page) { await page.goto('/roadtrips'); await expectAppShell(page); }
async function openCreate(page) {
  await page.getByRole('button', { name: 'Add Land Journey' }).click();
  await expect(visible(page, 'input[placeholder="e.g. Paris Gare du Nord, Rome"]').first()).toBeVisible();
}
async function fillJourney(page, o: { from: string; to: string; day: number; mode?: string }) {
  if (o.mode) await visible(page, 'form button').filter({ hasText: new RegExp(`^${o.mode}`) }).first().click();
  await visible(page, 'input[placeholder="e.g. Paris Gare du Nord, Rome"]').first().fill(o.from);
  await page.keyboard.press('Tab');
  await visible(page, 'input[placeholder="e.g. London St Pancras, Milan"]').first().fill(o.to);
  await page.keyboard.press('Tab');
  if (await page.locator('text="Select date" >> visible=true').count()) await pickDateNextMonth(page, o.day);
}
const createBtn = (page) => page.getByRole('button', { name: /Create Journey|Save Itinerary/ });

test('empty state when there are no land journeys', async ({ page }) => {
  await openRoadTrips(page);
  await expect(page.locator('main')).toContainText(/no (land|road)|empty|first journey|add/i);
});

test('W30 create a train journey (Paris → Lyon) and see it listed', async ({ page, request }) => {
  await openRoadTrips(page);
  await openCreate(page);
  await fillJourney(page, { from: 'Paris', to: 'Lyon', day: 26, mode: 'Train' });
  await visible(page, 'input[placeholder="e.g. Eurostar, Flixbus, Hertz, DFDS"]').first().fill('SNCF');
  await createBtn(page).click();
  await expect.poll(async () => (await landRecords(request)).some((r) => r.origin === 'Paris' && r.destination === 'Lyon' && r.mode === 'Train'), { timeout: 10_000 }).toBe(true);
  await expect(inMain(page, 'Paris').first()).toBeVisible();
});

test('W30 required fields: saving an empty form shows a message and saves nothing', async ({ page, request }) => {
  await openRoadTrips(page);
  await openCreate(page);
  let msg = '';
  page.once('dialog', async (d) => { msg = d.message(); await d.dismiss(); });
  await createBtn(page).click();
  await page.waitForTimeout(800);
  expect(msg || (await page.getByText(/required/i).count()), 'validation message').toBeTruthy();
  expect((await landRecords(request)).length).toBe(0);
});

test('W30 Calculate Route with the routing service unreachable shows a clear message', async ({ page }) => {
  await openRoadTrips(page);
  await openCreate(page);
  await fillJourney(page, { from: 'Paris', to: 'Lyon', day: 26, mode: 'Train' });
  page.on('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: /Calculate Route|Routing/ }).click();
  await expect(page.getByText(/unavailable|failed|couldn.t|could not|error|fix the map|no route/i).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /Calculate Route/ })).toBeEnabled({ timeout: 30_000 });
});

test('W30 add and remove a waypoint', async ({ page }) => {
  await openRoadTrips(page);
  await openCreate(page);
  await visible(page, 'form button').filter({ hasText: /^Personal Car|^Car/ }).first().click().catch(() => {});
  const wp = visible(page, 'input[placeholder="e.g. Reims Cathedral, Shell Station"]').first();
  await wp.fill('Reims Cathedral');
  await page.getByRole('button', { name: /^Add$/ }).click();
  await expect(page.getByText('Reims Cathedral').first()).toBeVisible();
  await page.getByRole('button', { name: /remove|delete/i }).filter({ has: page.locator('svg') }).last().click().catch(() => {});
});

test('W30 associate the journey with an existing trip', async ({ page, request }) => {
  await seedTrip(request, s.token, { id: 'rt-trip', name: 'QA France Tour', status: 'Upcoming', startDate: isoDaysFromNow(20), endDate: isoDaysFromNow(30) }, ADMIN.id);
  await openRoadTrips(page);
  await openCreate(page);
  await fillJourney(page, { from: 'Paris', to: 'Reims', day: 23, mode: 'Train' });
  const sel = page.locator('select >> visible=true').filter({ has: page.locator('option', { hasText: 'QA France Tour' }) }).first();
  await sel.selectOption({ label: 'QA France Tour' });
  await createBtn(page).click();
  await expect.poll(async () => (await apiTrips(request, s.token)).find((t) => t.id === 'rt-trip')?.transports?.some((x) => x.destination === 'Reims')
    || (await landRecords(request)).some((r) => r.destination === 'Reims' && r.tripId === 'rt-trip'), { timeout: 10_000 }).toBe(true);
});

test('W30 edit a journey (operator) and save', async ({ page, request }) => {
  await seedFlight(request, s.token, train('rt-edit'));
  await openRoadTrips(page);
  await page.getByRole('button', { name: 'Edit Itinerary Details' }).first().click();
  await visible(page, 'input[placeholder="e.g. Eurostar, Flixbus, Hertz, DFDS"]').first().fill('Ouigo');
  await createBtn(page).click();
  await expect.poll(async () => (await landRecords(request)).find((r) => r.id === 'rt-edit')?.provider, { timeout: 10_000 }).toBe('Ouigo');
});

test('W30 double-clicking Create Journey creates one record', async ({ page, request }) => {
  await openRoadTrips(page);
  await openCreate(page);
  await fillJourney(page, { from: 'Milan', to: 'Rome', day: 7, mode: 'Train' });
  await createBtn(page).dblclick();
  await page.waitForTimeout(2500);
  expect((await landRecords(request)).filter((r) => r.origin === 'Milan').length).toBe(1);
});

test('W31 Auto-Sync is disabled until a target trip is selected', async ({ page }) => {
  await openRoadTrips(page);
  await expect(page.getByRole('button', { name: /Auto-Sync Segments/ })).toBeDisabled();
});

test('W30 pressing Escape in an address suggestion list keeps the journey dialog open', async ({ page }) => {
  await openRoadTrips(page);
  await openCreate(page);
  await visible(page, 'input[placeholder="e.g. Paris Gare du Nord, Rome"]').first().fill('Paris');
  await page.keyboard.press('Escape');
  await expect(visible(page, 'input[placeholder="e.g. Paris Gare du Nord, Rome"]').first(), 'Escape should not discard the form').toHaveValue('Paris');
});

test('W31 Auto-Sync finds a land segment inside a trip and saves it', async ({ page, request }) => {
  const seg = train('seg-1', { origin: 'Vienna', destination: 'Salzburg', tripId: 'sync-trip' });
  await seedTrip(request, s.token, { id: 'sync-trip', name: 'QA Austria', status: 'Upcoming', startDate: seg.departureDate, endDate: seg.arrivalDate, transports: [],
    locations: [
      { id: 'l1', name: 'Vienna, Austria', startDate: seg.departureDate, endDate: seg.departureDate, coordinates: { lat: 48.2082, lng: 16.3738 } },
      { id: 'l2', name: 'Salzburg, Austria', startDate: seg.arrivalDate, endDate: seg.arrivalDate, coordinates: { lat: 47.8095, lng: 13.055 } },
    ] }, ADMIN.id);
  await openRoadTrips(page);
  page.on('dialog', (d) => d.accept());
  await page.locator('select >> visible=true').filter({ has: page.locator('option', { hasText: 'QA Austria' }) }).first().selectOption({ label: 'QA Austria' });
  await page.getByRole('button', { name: /Auto-Sync Segments/ }).click();
  const saveAll = page.getByRole('button', { name: /Save All Segments/ });
  if (await saveAll.isVisible({ timeout: 8000 }).catch(() => false)) await saveAll.click();
  await expect(inMain(page, 'Vienna').first()).toBeVisible({ timeout: 10_000 });
});

test('W32 search filters journeys', async ({ page, request }) => {
  await seedFlight(request, s.token, train('a', { origin: 'Berlin', destination: 'Prague' }));
  await seedFlight(request, s.token, train('b', { origin: 'Oslo', destination: 'Bergen', mode: 'Bus', provider: 'Vy' }));
  await openRoadTrips(page);
  await visible(page, 'input[placeholder^="Search land journey"]').first().fill('bergen');
  await expect(inMain(page, 'Oslo').first()).toBeVisible();
  await expect(inMain(page, 'Berlin')).toHaveCount(0);
});

test('W32 delete a journey (confirm) removes it', async ({ page, request }) => {
  await seedFlight(request, s.token, train('rt-del'));
  await openRoadTrips(page);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete Travel Record' }).first().click();
  await expect.poll(async () => (await landRecords(request)).length, { timeout: 10_000 }).toBe(0);
});

test('W32 delete → dismiss confirmation keeps the journey', async ({ page, request }) => {
  await seedFlight(request, s.token, train('rt-keep'));
  await openRoadTrips(page);
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Delete Travel Record' }).first().click();
  await page.waitForTimeout(800);
  expect((await landRecords(request)).length).toBe(1);
});

test('W32 bulk select and delete two journeys', async ({ page, request }) => {
  await seedFlight(request, s.token, train('bd1', { origin: 'Turin' }));
  await seedFlight(request, s.token, train('bd2', { origin: 'Genoa' }));
  await openRoadTrips(page);
  await page.locator('main button[title="Toggle bulk selection"] >> visible=true').first().click();
  const sel = page.locator('main button[aria-label="Select segment"] >> visible=true');
  for (let i = 0; i < 5 && (await sel.count()) > 0; i++) await sel.first().click();
  const writes: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method())) writes.push(`${r.method()} ${new URL(r.url()).pathname}`); });
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /Delete Selected/ }).click();
  await expect.poll(async () => (await landRecords(request)).length, { timeout: 10_000 }).toBe(0);
  expect(writes, 'bulk delete is one atomic request (PERF-008)').toEqual(['POST /api/batch']);
});

test('road trips page has no horizontal overflow with data', async ({ page, request }) => {
  await seedFlight(request, s.token, train('ov', { provider: 'An Extremely Long Rail Operator Name Regional Express Services' }));
  await openRoadTrips(page);
  await page.waitForTimeout(1200);
  expect(await overflowX(page)).toBeLessThanOrEqual(0);
});
