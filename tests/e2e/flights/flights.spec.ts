/**
 * Chunk D — Flights (workflows 24–29): manual add/edit, delete, bundle/unbundle,
 * filters & view toggles, live tracking (Dashboard), spreadsheet import (Settings).
 */
import * as fs from 'fs';
import * as path from 'path';
import { test, expect, ADMIN, resetDb, apiRegister, seedSession, expectAppShell, isMobile } from '../support/fixtures';
import { seedTrip, seedFlight, flightRecord, apiGet, apiTrips, isoDaysFromNow, visible, inMain, overflowX, pickDateNextMonth } from '../support/planning';

let s: { token: string; user: any };
test.beforeEach(async ({ page, request }) => {
  await resetDb(request);
  s = await apiRegister(request, ADMIN);
  await seedSession(page, s.token, s.user);
});

const flights = (request) => apiGet(request, s.token, '/api/flights');
async function openFlights(page) {
  await page.goto('/flights');
  await expectAppShell(page);
  await revealList(page);
}
/** Flight rows are virtualised (mounted when scrolled into view); on phones the board starts below the fold. */
async function revealList(page) {
  if (!isMobile(page)) return;
  await page.waitForTimeout(300);
  await page.locator('main').evaluate((m) => m.scrollTo(0, m.scrollHeight)).catch(() => {});
  await page.waitForTimeout(400);
}
async function fillFlightForm(page, o: { from: string; to: string; day: number }) {
  await visible(page, 'input[placeholder="e.g. JFK or New York"]').first().fill(o.from);
  await page.keyboard.press('Escape');
  await visible(page, 'input[placeholder="e.g. LHR or London"]').first().fill(o.to);
  await page.keyboard.press('Escape');
  // Departure date defaults to today in the form; only the airports are required here.
}
const saveStub = (page) => page.getByRole('button', { name: /Save Boarding Stub/ });
/** Text inside the flight list itself (desktop table / mobile list), not the hero stats. */
const inList = (page, re: string) => page.locator(`${isMobile(page) ? 'main' : 'main table'} >> text=/${re}/ >> visible=true`);
/** "Not listed": on desktop the code is absent from the table; on mobile the always-visible passport hero
 *  repeats the next flight, so check the board's own count instead. */
async function expectNotListed(page, re: string, boardCount: number) {
  if (isMobile(page)) await expect(page.getByText(new RegExp(`Flight Board \\(${boardCount}\\)`)).first()).toBeVisible();
  else await expect(inList(page, re)).toHaveCount(0);
}

test('empty flight log shows an empty state with an Add Flight action', async ({ page }) => {
  await openFlights(page);
  await expect(page.getByRole('button', { name: /Add Flight/ }).first()).toBeVisible();
  await expect(page.locator('main')).toContainText(/no flights|empty|log your first|add (your )?first/i);
});

test('W24 add a flight manually (JFK → LHR) and see it in the log', async ({ page, request }) => {
  await openFlights(page);
  await page.getByRole('button', { name: /Add Flight/ }).first().click();
  await fillFlightForm(page, { from: 'JFK', to: 'LHR', day: 4 });
  await saveStub(page).click();
  await expect.poll(async () => (await flights(request)).some((f) => f.origin?.includes('JFK') && f.destination?.includes('LHR')), { timeout: 10_000 }).toBe(true);
});

test('W24 saving with empty fields shows a validation message and saves nothing', async ({ page, request }) => {
  await openFlights(page);
  await page.getByRole('button', { name: /Add Flight/ }).first().click();
  let msg = '';
  page.once('dialog', async (d) => { msg = d.message(); await d.dismiss(); });
  await saveStub(page).click();
  await page.waitForTimeout(800);
  const inline = await page.getByText(/required|please fill|enter/i).count();
  expect(msg || inline, 'a validation message is shown').toBeTruthy();
  expect((await flights(request)).length).toBe(0);
});

test('W24 validation message is shown inline (not a browser alert)', async ({ page }) => {
  await openFlights(page);
  await page.getByRole('button', { name: /Add Flight/ }).first().click();
  let usedAlert = false;
  page.once('dialog', async (d) => { usedAlert = true; await d.dismiss(); });
  await saveStub(page).click();
  await page.waitForTimeout(800);
  expect(usedAlert, 'validation should not use window.alert').toBe(false);
});

test('W24 edit an existing flight (seat number) and save', async ({ page, request }) => {
  await seedFlight(request, s.token, flightRecord('f-edit'));
  await openFlights(page);
  await page.getByRole('button', { name: /^Edit flight( bookings)?$/i }).first().click();
  if (!(await visible(page, 'input[placeholder="e.g. 17C"]').count())) await page.getByRole('button', { name: /Manual Entry/ }).click();
  await visible(page, 'input[placeholder="e.g. 17C"]').first().fill('14A');
  await saveStub(page).click();
  await expect.poll(async () => (await flights(request)).find((f) => f.id === 'f-edit')?.seatNumber ?? (await flights(request))[0]?.seat, { timeout: 10_000 }).toBe('14A');
});

test('W24 double-clicking Save creates only one flight', async ({ page, request }) => {
  await openFlights(page);
  await page.getByRole('button', { name: /Add Flight/ }).first().click();
  await fillFlightForm(page, { from: 'CDG', to: 'ATH', day: 14 });
  await saveStub(page).dblclick();
  await page.waitForTimeout(2500);
  expect((await flights(request)).filter((f) => f.origin?.includes('CDG')).length).toBe(1);
});

test('W24 save failure (network) shows an error and keeps the form open', async ({ page }) => {
  await openFlights(page);
  await page.getByRole('button', { name: /Add Flight/ }).first().click();
  await fillFlightForm(page, { from: 'SFO', to: 'NRT', day: 24 });
  await page.route('**/api/flights**', (r) => (r.request().method() !== 'GET' ? r.abort('connectionrefused') : r.continue()));
  let alertMsg = '';
  page.on('dialog', async (d) => { alertMsg = d.message(); await d.dismiss(); });
  await saveStub(page).click();
  await expect.poll(async () => alertMsg || ((await page.getByText(/fail|error|could not|couldn.t|try again/i).count()) ? 'inline' : ''), { timeout: 20_000 }).toMatch(/fail|error|inline|could/i);
  await expect(saveStub(page)).toBeVisible();
});

test('W25 delete a flight (confirm) removes it', async ({ page, request }) => {
  await seedFlight(request, s.token, flightRecord('f-del'));
  await openFlights(page);
  await page.getByRole('button', { name: /^Delete flight$/i }).first().click();
  await page.getByRole('button', { name: /^Delete$/ }).last().click();
  await expect.poll(async () => (await flights(request)).length, { timeout: 10_000 }).toBe(0);
});

test('W25 delete → Cancel keeps the flight', async ({ page, request }) => {
  await seedFlight(request, s.token, flightRecord('f-keep'));
  await openFlights(page);
  await page.getByRole('button', { name: /^Delete flight$/i }).first().click();
  await page.getByRole('button', { name: /^Cancel$/ }).last().click();
  await page.waitForTimeout(800);
  expect((await flights(request)).length).toBe(1);
});

test('W26 bundle two flights into an expedition', async ({ page, request }) => {
  await seedFlight(request, s.token, flightRecord('b1', { origin: 'JFK', destination: 'CDG', identifier: 'AF7', departureDate: isoDaysFromNow(30) }));
  await seedFlight(request, s.token, flightRecord('b2', { origin: 'CDG', destination: 'JFK', identifier: 'AF8', departureDate: isoDaysFromNow(37) }));
  await openFlights(page);
  await page.getByRole('button', { name: 'Edit Flights' }).click();
  await page.getByRole('button', { name: /^Select All$/ }).click();
  await page.getByRole('button', { name: /^Bundle \(2\)$/ }).click();
  await page.locator('input[placeholder="e.g. Paris Getaway"]').fill('QA Paris Bundle');
  await page.getByRole('button', { name: /^Create Bundle$/ }).click();
  await expect.poll(async () => (await apiTrips(request, s.token)).find((t) => t.name === 'QA Paris Bundle')?.transports?.length ?? 0, { timeout: 10_000 }).toBe(2);
  await expect.poll(async () => (await flights(request)).length, { timeout: 10_000 }).toBe(0);
});

test('W26 a bundle that fails to save keeps every selected flight (atomic)', async ({ page, request }) => {
  await seedFlight(request, s.token, flightRecord('a1', { origin: 'JFK', destination: 'CDG', identifier: 'AF7', departureDate: isoDaysFromNow(30) }));
  await seedFlight(request, s.token, flightRecord('a2', { origin: 'CDG', destination: 'JFK', identifier: 'AF8', departureDate: isoDaysFromNow(37) }));
  await page.route('**/api/batch', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Failed to apply changes"}' }));
  let alertText = '';
  page.on('dialog', async (d) => { alertText = d.message(); await d.dismiss(); });
  await openFlights(page);
  await page.getByRole('button', { name: 'Edit Flights' }).click();
  await page.getByRole('button', { name: /^Select All$/ }).click();
  await page.getByRole('button', { name: /^Bundle \(2\)$/ }).click();
  await page.locator('input[placeholder="e.g. Paris Getaway"]').fill('QA Doomed Bundle');
  await page.getByRole('button', { name: /^Create Bundle$/ }).click();
  await expect.poll(() => alertText, { timeout: 20_000 }).toMatch(/Nothing was changed/);
  expect((await flights(request)).map((f) => f.id).sort()).toEqual(['a1', 'a2']);
  expect((await apiTrips(request, s.token)).some((t) => t.name === 'QA Doomed Bundle')).toBe(false);
});

test('W26 unbundle returns flights to the standalone log', async ({ page, request }) => {
  const f = flightRecord('ub1', { origin: 'LIS', destination: 'MAD', identifier: 'TP1020', tripId: 'bundle-1' });
  await seedTrip(request, s.token, { id: 'bundle-1', name: 'QA Iberia Bundle', status: 'Planning', startDate: f.departureDate, endDate: f.arrivalDate, transports: [f], isBundleOnly: true, hideInPlanner: true }, ADMIN.id);
  await openFlights(page);
  await page.getByRole('button', { name: 'Edit Flights' }).click();
  await page.getByRole('button', { name: /^Select All$/ }).click();
  await page.getByRole('button', { name: /^Unbundle \(1\)$/ }).click();
  await page.getByRole('button', { name: /^Unbundle$/ }).last().click();
  await expect.poll(async () => (await flights(request)).some((x) => x.identifier === 'TP1020'), { timeout: 10_000 }).toBe(true);
});

test('W27 Upcoming / Past tabs filter the log', async ({ page, request }) => {
  await seedFlight(request, s.token, flightRecord('up', { identifier: 'UP100', origin: 'SIN', destination: 'SYD' }));
  await seedFlight(request, s.token, flightRecord('past', { identifier: 'PA200', origin: 'DXB', destination: 'BKK', departureDate: '2024-04-01', arrivalDate: '2024-04-01' }));
  await openFlights(page);
  await page.locator('main button[title="Upcoming"] >> visible=true').first().click();
  await revealList(page);
  await expect(inList(page, '^SIN$').first()).toBeVisible();
  await expectNotListed(page, '^DXB$', 1);
  await page.locator('main button[title="Past"] >> visible=true').first().click();
  await revealList(page);
  await expect(inList(page, '^DXB$').first()).toBeVisible();
  await expectNotListed(page, '^SIN$', 1);
});

test('W27 search narrows the log and Reset restores it', async ({ page, request }) => {
  await seedFlight(request, s.token, flightRecord('s1', { identifier: 'LH400', provider: 'Lufthansa', origin: 'FRA', destination: 'JFK' }));
  await seedFlight(request, s.token, flightRecord('s2', { identifier: 'QF1', provider: 'Qantas', origin: 'SYD', destination: 'LHR' }));
  await openFlights(page);
  await visible(page, 'input[placeholder^="Search by airline"]').first().fill('lufthansa');
  await revealList(page);
  await expect(inList(page, '^FRA$').first()).toBeVisible();
  await expectNotListed(page, '^SYD$', 1);
  await page.getByRole('button', { name: 'Reset all filters' }).click();
  await revealList(page);
  await expect(inList(page, '^SYD$').first()).toBeVisible();
});

test('W27 table and grid views both list the flight', async ({ page, request }) => {
  test.skip(isMobile(page), 'view toggle is desktop-only');
  await seedFlight(request, s.token, flightRecord('v1', { origin: 'HND', destination: 'ICN' }));
  await openFlights(page);
  await page.getByRole('button', { name: 'Grid view' }).click();
  await expect(inMain(page, 'HND').first()).toBeVisible();
  await page.getByRole('button', { name: 'Table view' }).click();
  await expect(inMain(page, 'HND').first()).toBeVisible();
});

test('flights page has no horizontal overflow with data', async ({ page, request }) => {
  await seedFlight(request, s.token, flightRecord('o1', { provider: 'An Extremely Long Airline Name International Airways Group' }));
  await openFlights(page);
  await page.waitForTimeout(1200);
  expect(await overflowX(page)).toBeLessThanOrEqual(0);
});

test('W28 Track Flight (Dashboard) shows a clear result or error for AA100', async ({ page }) => {
  await page.goto('/');
  await expectAppShell(page);
  await page.getByRole('button', { name: /Track Flight/ }).first().click();
  await expect(page.getByText("Where's My Flight?")).toBeVisible();
  await visible(page, 'input[placeholder="e.g. AA100"]').first().fill('AA100');
  await page.getByRole('button', { name: /Search|Track/ }).last().click();
  await expect(page.getByText(/not found|unavailable|error|failed|no (live )?data|try again|api key/i).first()).toBeVisible({ timeout: 20_000 });
});

test('W29 spreadsheet import (Settings › Data): CSV → map → verify → import', async ({ page, request }, info) => {
  const csv = path.join(info.outputDir, 'flights.csv');
  fs.mkdirSync(info.outputDir, { recursive: true });
  fs.writeFileSync(csv, `Date,From,To,Airline,Flight\n${isoDaysFromNow(15)},JFK,LAX,Delta,DL123\n${isoDaysFromNow(18)},LAX,JFK,Delta,DL456\n`);
  await page.goto('/settings');
  await expectAppShell(page);
  await page.locator('main button >> visible=true').filter({ hasText: /Data Management/ }).first().click();
  await page.getByRole('button', { name: /Launch Flight Wizard/ }).click();
  await page.locator('input[type="file"][accept^=".csv"]').setInputFiles(csv);
  await page.getByRole('button', { name: /Next: Verify Flight Details/ }).click();
  await page.getByRole('button', { name: /Import Selected Flights \(2\)/ }).click();
  await expect.poll(async () => (await flights(request)).filter((f) => /DL(123|456)/.test(f.identifier || '')).length, { timeout: 15_000 }).toBe(2);
});
