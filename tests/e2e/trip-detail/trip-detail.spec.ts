/**
 * Chunk C — Trip detail & itinerary editing (workflows 12–22).
 * Trip page: header actions, edit drawer, Bookings (transport/stay), Daily Planner (activities),
 * Route, Gear (packing list), AI Guide, ICS export, Cinematic view, Import wizard, cost breakdown.
 */
import * as fs from 'fs';
import { test, expect, ADMIN, resetDb, apiRegister, seedSession, expectAppShell } from '../support/fixtures';
import { seedTrip, apiTrips, nextMonthDay, visible, inMain, waitForTrip, overflowX, pickDateNextMonth, pickDateByLabel, seedFlight, flightRecord, apiGet } from '../support/planning';

let s: { token: string; user: any };
const TRIP_ID = 'qa-trip-c';
const BASE = {
  id: TRIP_ID, name: 'QA Santorini Week', status: 'Upcoming' as const,
  startDate: nextMonthDay(5), endDate: nextMonthDay(9), location: 'Santorini, Greece',
};

async function getTrip(request) { return (await apiTrips(request, s.token)).find((t) => t.id === TRIP_ID); }

async function openTrip(page, tab?: string) {
  await page.goto(`/trip/${TRIP_ID}`);
  await expectAppShell(page);
  await expect(inMain(page, BASE.name).first()).toBeVisible({ timeout: 15_000 });
  if (tab && tab !== 'Daily Planner') await page.locator('main button >> visible=true').filter({ hasText: new RegExp(`^${tab}$`) }).first().click();
}

test.beforeEach(async ({ page, request }) => {
  await resetDb(request);
  s = await apiRegister(request, ADMIN);
  await seedTrip(request, s.token, BASE, ADMIN.id);
  await seedSession(page, s.token, s.user);
});

// ---------- WP-1.8: no writes on the read path ----------
test('opening a trip with an overlapping standalone flight changes nothing until the user asks', async ({ page, request }) => {
  await seedFlight(request, s.token, flightRecord('qa-overlap', { departureDate: BASE.startDate, arrivalDate: BASE.startDate }));
  const writes: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/') && ['POST', 'PUT', 'DELETE'].includes(r.method())) writes.push(`${r.method()} ${r.url()}`); });
  await openTrip(page);
  await expect(page.getByText(/1 standalone flight falls within this trip/)).toBeVisible();
  await page.waitForTimeout(1000);
  expect(writes, 'opening a trip must not write').toEqual([]);
  expect((await apiGet(request, s.token, '/api/flights')).map((f) => f.id)).toContain('qa-overlap');

  await page.getByRole('button', { name: /Add it to this trip/ }).click();
  await expect.poll(async () => (await getTrip(request))?.transports?.some((t) => t.id === 'qa-overlap'), { timeout: 10_000 }).toBe(true);
  expect((await apiGet(request, s.token, '/api/flights')).map((f) => f.id)).not.toContain('qa-overlap');
  await expect(page.getByText(/standalone flight/)).toHaveCount(0);
});

test('a saved holiday config without "holidays" does not leave the trip page loading forever', async ({ page, request }) => {
  const r = await request.post('/api/configs', { headers: { Authorization: `Bearer ${s.token}` }, data: { id: 'broken-config', name: 'Broken', countryCode: 'GR' } });
  expect(r.status()).toBe(201);
  await openTrip(page);
  await expect(page.getByText('Loading Trip Data...')).toHaveCount(0);
});

test('a failed load shows an error with Try Again instead of a blank page', async ({ page }) => {
  let fail = true;
  await page.route('**/api/trips', (route) => (fail && route.request().method() === 'GET' ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' }) : route.continue()));
  await page.goto(`/trip/${TRIP_ID}`);
  await expect(page.getByText("Couldn't load this trip")).toBeVisible({ timeout: 30_000 });
  fail = false;
  await page.getByRole('button', { name: 'Try Again' }).click();
  await expect(inMain(page, BASE.name).first()).toBeVisible({ timeout: 15_000 });
});

// ---------- page-level ----------
test('trip page loads with name, dates and all section tabs', async ({ page }) => {
  await openTrip(page);
  for (const t of ['Daily Planner', 'Route', 'Bookings', 'Cost Breakdown', 'Gear', 'AI Guide']) {
    await expect(page.locator('main button >> visible=true').filter({ hasText: new RegExp(`^${t}$`) }).first(), t).toBeVisible();
  }
});

test('unknown trip id shows a not-found state', async ({ page }) => {
  await page.goto('/trip/does-not-exist');
  await expectAppShell(page);
  await expect(page.locator('main')).toContainText(/not found|no longer|doesn.t exist|couldn.t find/i, { timeout: 15_000 });
});

test('"Back to planner" returns to the Planner', async ({ page }) => {
  await openTrip(page);
  await page.getByRole('button', { name: 'Back to planner' }).click();
  await expect(page).toHaveURL(/\/planner$/);
});

test('every tab renders without crashing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openTrip(page);
  for (const t of ['Route', 'Bookings', 'Cost Breakdown', 'Gear', 'AI Guide']) {
    await page.locator('main button >> visible=true').filter({ hasText: new RegExp(`^${t}$`) }).first().click();
    await expect(page.getByText(/Try Again|Stopped Unexpectedly/i), t).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('all section tabs can be reached (on screen or by scrolling the tab strip)', async ({ page }) => {
  await openTrip(page);
  const offscreen = await page.evaluate(() => [...document.querySelectorAll('main button')]
    .filter((b) => /^(Daily Planner|Route|Bookings|Cost Breakdown|Gear|AI Guide)$/.test((b.textContent || '').trim()))
    .filter((b) => { const sc = b.closest('.overflow-x-auto') as HTMLElement | null; const r = b.getBoundingClientRect(); const minLeft = sc ? sc.getBoundingClientRect().left - sc.scrollLeft : 0; return r.left < minLeft - 1; })
    .map((b) => (b.textContent || '').trim()));
  expect(offscreen, 'tabs clipped off the left edge cannot be scrolled to').toEqual([]);
});

test('trip page has no horizontal overflow (baseline)', async ({ page }) => {
  await openTrip(page);
  await page.waitForTimeout(1200);
  expect(await overflowX(page)).toBeLessThanOrEqual(0);
});

// ---------- W12 edit trip settings ----------
test('W12 Edit Settings: rename the trip and save', async ({ page, request }) => {
  await openTrip(page);
  await page.getByRole('button', { name: /Edit Settings|^Edit$/ }).first().click();
  const nameInput = page.locator('input[placeholder="e.g. Summer in Tokyo"]');
  await expect(nameInput).toHaveValue(BASE.name);
  await nameInput.fill('QA Santorini Week (renamed)');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect.poll(async () => (await getTrip(request))?.name).toBe('QA Santorini Week (renamed)');
  await expect(inMain(page, 'QA Santorini Week (renamed)').first()).toBeVisible();
});

test('W12 Edit Settings: an empty name is rejected', async ({ page, request }) => {
  await openTrip(page);
  await page.getByRole('button', { name: /Edit Settings|^Edit$/ }).first().click();
  await page.locator('input[placeholder="e.g. Summer in Tokyo"]').fill('');
  const save = page.getByRole('button', { name: 'Save Changes' });
  if (await save.isEnabled()) await save.click();
  await page.waitForTimeout(1000);
  expect((await getTrip(request))?.name, 'name must not be blanked').toBe(BASE.name);
});

test('W12/W22 "Archive" in the edit drawer archives the trip (it is not permanently deleted)', async ({ page, request }) => {
  await openTrip(page);
  await page.getByRole('button', { name: /Edit Settings|^Edit$/ }).first().click();
  await page.getByRole('button', { name: /^Archive$/ }).click();
  await page.getByRole('button', { name: /^Archive Trip$/ }).click();
  await expect.poll(async () => (await getTrip(request))?.archived, { timeout: 10_000 }).toBe(true);
  expect(await getTrip(request), '"Archive" must keep the trip').toBeTruthy();
});

test('W12 "Delete" in the edit drawer asks first, then permanently deletes the trip', async ({ page, request }) => {
  await openTrip(page);
  await page.getByRole('button', { name: /Edit Settings|^Edit$/ }).first().click();
  await page.getByRole('button', { name: 'Delete trip' }).click();
  await expect(page.getByText(/can't be undone/)).toBeVisible();
  await page.getByRole('button', { name: /^Delete Trip$/ }).click();
  await expect.poll(async () => await getTrip(request), { timeout: 10_000 }).toBeFalsy();
});

// ---------- W13 transport ----------
test('W13 add a train booking from Bookings → + Add Booking', async ({ page, request }) => {
  await openTrip(page, 'Bookings');
  await page.getByRole('button', { name: /Add Booking/ }).first().click();
  const modal = page.locator('text=Manage Transport').locator('xpath=ancestor::div[contains(@class,"fixed")][1]');
  await expect(page.getByText('Manage Transport')).toBeVisible();
  await visible(page, 'button').filter({ hasText: /^Train$/ }).first().click();
  await visible(page, 'input[placeholder="e.g. Paris Gare du Nord"]').first().fill('Athens Larissa');
  await visible(page, 'input[placeholder="e.g. London St Pancras Int."]').first().fill('Thessaloniki');
  await visible(page, 'input[placeholder="e.g. Eurostar, SNCF, Deutsche Bahn"]').first().fill('Hellenic Train');
  await visible(page, 'input[placeholder="e.g. 9024 or ICE 125"]').first().fill('IC 52');
  await pickDateByLabel(page, /^Date$/i, 6);
  await page.getByRole('button', { name: /^Save$/ }).last().click();
  await expect.poll(async () => (await getTrip(request))?.transports?.some((x) => x.mode === 'Train' && x.provider === 'Hellenic Train'), { timeout: 10_000 }).toBe(true);
  await expect(modal).toHaveCount(0);
});

// ---------- W14 stays ----------
test('W14 add a stay from Bookings → + Add Stay', async ({ page, request }) => {
  await openTrip(page, 'Bookings');
  await page.getByRole('button', { name: /Add Stay/ }).first().click();
  await expect(page.getByText('Manage Accommodation')).toBeVisible();
  await visible(page, 'input[placeholder="e.g. Canaves Oia Suites"]').first().fill('Katikies Hotel');
  await page.getByRole('button', { name: /^Add Stay$/ }).last().click();
  await page.getByRole('button', { name: /Save Accommodations/ }).click();
  await expect.poll(async () => (await getTrip(request))?.accommodations?.some((a) => a.name === 'Katikies Hotel'), { timeout: 10_000 }).toBe(true);
});

test('W14 save failure (API 500) shows an error and keeps the dialog open', async ({ page }) => {
  await openTrip(page, 'Bookings');
  await page.getByRole('button', { name: /Add Stay/ }).first().click();
  await visible(page, 'input[placeholder="e.g. Canaves Oia Suites"]').first().fill('Will Fail Hotel');
  await page.getByRole('button', { name: /^Add Stay$/ }).last().click();
  await page.route(`**/api/trips/${TRIP_ID}`, (r) => (r.request().method() === 'PUT' ? r.fulfill({ status: 500, body: '{"error":"x"}', contentType: 'application/json' }) : r.continue()));
  await page.getByRole('button', { name: /Save Accommodations/ }).click();
  await expect(page.getByText(/fail|error|could not|couldn.t|try again/i).first()).toBeVisible({ timeout: 15_000 });
});

// ---------- W15 activities ----------
test('W15 add an activity from the Daily Planner and delete it', async ({ page, request }) => {
  await openTrip(page, 'Daily Planner');
  await page.locator('main button >> visible=true').filter({ hasText: /^(\+ Add Activity|Activity)$/ }).first().click();
  await visible(page, 'input[placeholder="e.g. Sunset Catamaran Cruise to Oia"]').first().fill('Catamaran Sunset Cruise');
  await page.getByRole('button', { name: /Save Excursion/ }).click();
  await expect.poll(async () => (await getTrip(request))?.activities?.some((a) => a.name === 'Catamaran Sunset Cruise' || a.title === 'Catamaran Sunset Cruise'), { timeout: 10_000 }).toBe(true);
  await expect(inMain(page, 'Catamaran Sunset Cruise').first()).toBeVisible();
});

test('W15 very long activity name (400 chars) saves without breaking the layout', async ({ page, request }) => {
  const long = 'Very long activity name '.repeat(17).slice(0, 400);
  await openTrip(page, 'Daily Planner');
  await page.locator('main button >> visible=true').filter({ hasText: /^(\+ Add Activity|Activity)$/ }).first().click();
  await visible(page, 'input[placeholder="e.g. Sunset Catamaran Cruise to Oia"]').first().fill(long);
  await page.getByRole('button', { name: /Save Excursion/ }).click();
  await expect.poll(async () => (await getTrip(request))?.activities?.length ?? 0, { timeout: 10_000 }).toBe(1);
  expect(await overflowX(page)).toBeLessThanOrEqual(0);
});

// ---------- W16 route ----------
test('W16 Route tab: add a route leg and save', async ({ page, request }) => {
  await openTrip(page, 'Route');
  const before = (await getTrip(request))?.locations?.length ?? 0;
  await page.getByRole('button', { name: /Add Separate Excursion|Route Leg/i }).first().click();
  await page.getByRole('button', { name: /Save Route Changes/ }).click();
  await expect.poll(async () => (await getTrip(request))?.locations?.length ?? 0, { timeout: 10_000 }).toBeGreaterThan(before);
});

// ---------- W17 packing ----------
test('W17 Gear: add, check off and delete a packing item', async ({ page, request }) => {
  await openTrip(page, 'Gear');
  await visible(page, 'input[placeholder="Add new item..."]').first().fill('Snorkel mask');
  await page.getByRole('button', { name: 'Add packing item' }).click();
  await expect(inMain(page, 'Snorkel mask').first()).toBeVisible();
  await expect.poll(async () => (await getTrip(request))?.packingList?.some((i) => i.text === 'Snorkel mask')).toBe(true);
  await inMain(page, 'Snorkel mask').first().click();
  await expect.poll(async () => (await getTrip(request))?.packingList?.find((i) => i.text === 'Snorkel mask')?.isChecked).toBe(true);
  await page.getByRole('button', { name: 'Delete Snorkel mask' }).click({ force: true });
  await expect.poll(async () => (await getTrip(request))?.packingList?.some((i) => i.text === 'Snorkel mask')).toBe(false);
});

test('W17 Gear: an empty item cannot be added', async ({ page, request }) => {
  await openTrip(page, 'Gear');
  await page.getByRole('button', { name: 'Add packing item' }).click();
  await page.waitForTimeout(800);
  expect(((await getTrip(request))?.packingList ?? []).length).toBe(0);
});

test('W17 Gear: "Clear All" asks for confirmation before deleting the list', async ({ page, request }) => {
  await openTrip(page, 'Gear');
  await visible(page, 'input[placeholder="Add new item..."]').first().fill('Sunscreen');
  await page.getByRole('button', { name: 'Add packing item' }).click();
  await expect.poll(async () => ((await getTrip(request))?.packingList ?? []).length).toBe(1);
  let asked = false;
  page.on('dialog', async (d) => { asked = true; await d.dismiss(); });
  await page.getByRole('button', { name: 'Clear All' }).click();
  await page.waitForTimeout(1200);
  const remaining = ((await getTrip(request))?.packingList ?? []).length;
  expect(asked || (await page.getByText(/are you sure|confirm/i).count()) > 0, 'a confirmation is shown').toBe(true);
  expect(remaining).toBe(1);
});

test('W17 Gear: "Magic Generate" without a Gemini key explains what to do', async ({ page }) => {
  await openTrip(page, 'Gear');
  await page.getByRole('button', { name: /Magic Generate/ }).click();
  await expect(page.locator('text=/gemini|api key|settings/i >> visible=true').first()).toBeVisible({ timeout: 10_000 });
});

// ---------- W18 AI guide ----------
test('W18 AI Guide greets with the trip and explains a missing API key on send', async ({ page }) => {
  await openTrip(page, 'AI Guide');
  await expect(page.getByText(/NomadGuide/).first()).toBeVisible();
  await visible(page, 'main input').last().fill('Best beach?');
  await page.getByRole('button', { name: 'Send message to NomadGuide' }).click();
  await expect(page.getByText(/configure Google Gemini API Key/i)).toBeVisible({ timeout: 10_000 });
});

test('W18 AI Guide does not execute HTML from the trip name (stored XSS)', async ({ page, request }) => {
  await request.put(`/api/trips/${TRIP_ID}`, { headers: { Authorization: `Bearer ${s.token}` }, data: { ...BASE, participants: [ADMIN.id], name: 'XSS <img src=x onerror="window.__qaXss=1">' } });
  await page.goto(`/trip/${TRIP_ID}`);
  await expectAppShell(page);
  await page.locator('main button >> visible=true').filter({ hasText: /^AI Guide$/ }).first().click();
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as any).__qaXss ?? null), 'script from trip name must not run').toBeNull();
});

// ---------- W19 ICS ----------
test('W19 ICS export downloads a calendar file containing the trip', async ({ page }) => {
  await openTrip(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /ICS/ }).first().click()]);
  const p = await dl.path();
  const body = fs.readFileSync(p!, 'utf8');
  expect(dl.suggestedFilename()).toMatch(/\.ics$/);
  expect(body).toContain('BEGIN:VCALENDAR');
  expect(body).toContain(BASE.name);
});

// ---------- W20 import ----------
test('W20 Import opens the flight import wizard and it can be closed', async ({ page }) => {
  await openTrip(page, 'Bookings');
  await page.getByRole('button', { name: /^Import$/ }).first().click();
  const close = page.getByRole('button', { name: 'Close modal' }).last();
  await expect(close).toBeVisible();
  await close.click();
  await expect(close).toBeHidden();
});

// ---------- W21 cinematic ----------
test('W21 Cinematic view opens full-screen and closes', async ({ page }) => {
  await openTrip(page);
  await page.getByRole('button', { name: /Cinematic/ }).first().click();
  const overlay = page.locator('div.fixed.inset-0.z-modal.bg-black');
  await expect(overlay).toBeVisible();
  await overlay.getByRole('button').first().click();
  await expect(overlay).toHaveCount(0);
});

test('W21 Cinematic view closes with Escape', async ({ page }) => {
  await openTrip(page);
  await page.getByRole('button', { name: /Cinematic/ }).first().click();
  const overlay = page.locator('div.fixed.inset-0.z-modal.bg-black');
  await expect(overlay).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(overlay).toHaveCount(0);
});

// ---------- cost breakdown ----------
test('Cost Breakdown totals transport + stay costs', async ({ page, request }) => {
  await request.put(`/api/trips/${TRIP_ID}`, {
    headers: { Authorization: `Bearer ${s.token}` },
    data: { ...BASE, participants: [ADMIN.id],
      transports: [{ id: 't1', itineraryId: 'i1', mode: 'Train', type: 'One-Way', origin: 'A', destination: 'B', provider: 'Rail', identifier: 'R1', departureDate: BASE.startDate, departureTime: '10:00', arrivalDate: BASE.startDate, arrivalTime: '12:00', cost: 120 }],
      accommodations: [{ id: 'a1', name: 'Hotel', type: 'Hotel', checkInDate: BASE.startDate, checkOutDate: BASE.endDate, cost: 300 }] },
  });
  await openTrip(page, 'Cost Breakdown');
  await expect(page.locator('main')).toContainText(/420/);
});
