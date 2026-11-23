/**
 * Import itinerary (docs/TRIP_INTERCHANGE.md) against the real API: upload the Japan and Korea fixture, preview it,
 * leave out the optional items, create the trip; then import a changed copy into it and settle a conflict.
 * Runs at desktop and phone widths (playwright.config.ts projects).
 */
import path from 'node:path';
import fs from 'node:fs';
import { test, expect, ADMIN, resetDb, apiRegister, seedSession } from '../support/fixtures';

const FIXTURE = path.resolve(__dirname, '../../fixtures/trip-interchange-japan-korea.json');
let headers: Record<string, string>;

test.beforeEach(async ({ page, request }) => {
  await resetDb(request);
  const session = await apiRegister(request, ADMIN);
  headers = { Authorization: `Bearer ${session.token}` };
  // The fixture's budget is in EUR: use a EUR workspace so it becomes the trip's target.
  expect((await request.patch('/api/settings', { headers, data: { currency: 'EUR' } })).ok()).toBeTruthy();
  await seedSession(page, session.token, session.user);
});

const importedTrip = async (request: import('@playwright/test').APIRequestContext) => {
  const trips = await (await request.get('/api/trips', { headers })).json();
  return trips.find((t: any) => t.plan?.source?.externalId === 'japan-korea-family-2027');
};

test('upload, preview and import an itinerary as a new trip', async ({ page, request }) => {
  await page.goto('/trips');
  await page.getByRole('button', { name: 'Import itinerary' }).click();
  await page.locator('input[aria-label="Trip file to import"]').setInputFiles(FIXTURE);
  await page.getByRole('button', { name: 'Check file' }).click();

  await expect(page.getByText(/22 days · 6 stops · 63 activities · 9 legs · 6 stay plans · 13 hidden gems/)).toBeVisible();
  await page.getByRole('tab', { name: /Stays/ }).click();
  await expect(page.getByText('Mitsui Garden Hotel Jingugaien Tokyo Premier')).toBeVisible();
  await expect(page.getByRole('tabpanel').getByText('Candidate', { exact: true })).toHaveCount(18);
  await page.getByRole('tab', { name: /Transport/ }).click();
  await expect(page.getByText('Shinkansen, saved as Train', { exact: false })).toBeVisible();
  await page.getByRole('tab', { name: /Days/ }).click();
  await page.getByRole('button', { name: /Leave out the 16 optional and alternative items/ }).click();

  await page.getByRole('button', { name: 'Review changes' }).click();
  await expect(page.getByText(/Adds 6 stops, 47 activities, 9 proposed legs, 6 stay plans with 18 hotel candidates/)).toBeVisible();
  await expect(page.getByText(/16 items left out/)).toBeVisible();
  await page.getByRole('button', { name: 'Create trip' }).click();
  await expect(page.getByText(/Created Japan & South Korea/).first()).toBeVisible({ timeout: 20_000 });

  const trip = await importedTrip(request);
  expect(trip.startDate).toBe('2027-10-16');
  expect(trip.endDate).toBe('2027-11-06');
  expect(trip.activities).toHaveLength(47);
  expect(trip.transports).toHaveLength(9);
  expect(trip.accommodations ?? []).toHaveLength(0);
  expect(trip.targetBudget).toBe(10035);
  expect(trip.expenses ?? []).toHaveLength(0);

  await page.goto(`/trip/${trip.id}`);
  await expect(page.getByText('Old Tokyo').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Not booked').first()).toBeVisible();
});

test('importing a changed plan into the trip shows the conflict and applies the choice', async ({ page, request }) => {
  // The first import, through the page.
  await page.goto('/trips');
  await page.getByRole('button', { name: 'Import itinerary' }).click();
  await page.locator('input[aria-label="Trip file to import"]').setInputFiles(FIXTURE);
  await page.getByRole('button', { name: 'Check file' }).click();
  await page.getByRole('button', { name: 'Review changes' }).click();
  await page.getByRole('button', { name: 'Create trip' }).click();
  await expect(page.getByText(/Created Japan & South Korea/).first()).toBeVisible({ timeout: 20_000 });

  // Someone sets a time on Sensō-ji; the file later suggests another.
  const trip = await importedTrip(request);
  const edited = { ...trip, activities: trip.activities.map((a: any) => (a.title === 'Sensō-ji' ? { ...a, time: '08:30' } : a)) };
  expect((await request.put(`/api/trips/${trip.id}`, { headers, data: edited })).ok()).toBeTruthy();
  const changed = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  changed.days[2].activities[0].start_time = '09:00';

  await page.goto(`/trip/${trip.id}`);
  await page.getByRole('button', { name: /actions$/ }).first().click();
  await page.getByText('Import itinerary', { exact: true }).click();
  await page.locator('input[aria-label="Trip file to import"]').setInputFiles({ name: 'changed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(changed)) });
  await page.getByRole('button', { name: 'Check file' }).click();
  await expect(page.getByText(/importing again updates what changed/)).toBeVisible();
  await page.getByRole('button', { name: 'Review changes' }).click();
  await expect(page.getByText('1 conflict with your edits')).toBeVisible();
  await expect(page.getByText(/Adds nothing new/)).toBeVisible();
  await page.getByRole('radio', { name: /Use the file: 09:00/ }).check();
  await page.getByRole('button', { name: /Import into/ }).click();
  await expect(page.getByText('Itinerary imported')).toBeVisible({ timeout: 20_000 });

  const after = await importedTrip(request);
  expect(after.activities).toHaveLength(63);
  expect(after.activities.find((a: any) => a.title === 'Sensō-ji').time).toBe('09:00');
  const all = await (await request.get('/api/trips', { headers })).json();
  expect(all).toHaveLength(1);
});

test('a malformed file is refused with the problems listed and nothing saved', async ({ page, request }) => {
  const bad = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  bad.trip.end_date = '2027-10-01';
  bad.transport[0].id = bad.transport[1].id;
  await page.goto('/trips');
  await page.getByRole('button', { name: 'Import itinerary' }).click();
  await page.locator('input[aria-label="Trip file to import"]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
  await page.getByRole('button', { name: 'Check file' }).click();
  await expect(page.getByRole('alert')).toContainText("can't be imported");
  await expect(page.getByRole('list', { name: 'Problems in the file' })).toContainText('is before the start date');
  await expect(page.getByRole('list', { name: 'Problems in the file' })).toContainText('used more than once');
  expect(await (await request.get('/api/trips', { headers })).json()).toHaveLength(0);
});
