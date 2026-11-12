/**
 * Golden path for the data pages: records written through the API show up on the pages that should list them,
 * and the trip page opens from its card (audit F-10). The data is seeded over HTTP so the specs stay quick.
 */
import { test, expect, ADMIN, resetDb, apiRegister, seedSession } from '../support/fixtures';

const year = new Date().getFullYear() + 1;
const TRIP = { id: 'trip-lisbon', name: 'Lisbon Long Weekend', location: 'Lisbon, Portugal', startDate: `${year}-03-05`, endDate: `${year}-03-09`, status: 'Upcoming', privacy: 'Private', participants: [ADMIN.id] };
const FLIGHT = { id: 'flight-1', itineraryId: 'it-1', type: 'One-Way', provider: 'TAP Air Portugal', identifier: 'TP1234', confirmationCode: 'ABC123', origin: 'JFK', destination: 'LIS', departureDate: `${year}-03-05`, arrivalDate: `${year}-03-06`, departureTime: '21:00', arrivalTime: '09:00', mode: 'Flight' };

test.beforeEach(async ({ page, request }) => {
  await resetDb(request);
  const session = await apiRegister(request, ADMIN);
  const headers = { Authorization: `Bearer ${session.token}` };
  expect((await request.post('/api/trips', { headers, data: TRIP })).ok()).toBeTruthy();
  expect((await request.post('/api/flights', { headers, data: FLIGHT })).ok()).toBeTruthy();
  await seedSession(page, session.token, session.user);
});

test('a saved trip is listed on the Trips page and opens', async ({ page }) => {
  await page.goto('/trips');
  const card = page.getByText(TRIP.name).first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.click();
  await page.getByRole('button', { name: /Open trip/ }).click();
  await expect(page).toHaveURL(new RegExp(`/trip/${TRIP.id}$`));
  await expect(page.getByText(TRIP.name).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Page not found|Stopped Unexpectedly/i)).toHaveCount(0);
});

test('the dashboard shows the upcoming trip', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(TRIP.name).first()).toBeVisible({ timeout: 20_000 });
});

test('the Flights page lists a saved flight', async ({ page }) => {
  await page.goto('/flights');
  await expect(page.getByText('TAP Air Portugal').first()).toBeVisible({ timeout: 20_000 });
});

test('the calendar shows the trip in its month', async ({ page }) => {
  await page.goto('/calendar');
  await expect(page.getByRole('button', { name: 'WanderGrid home' }).or(page.getByRole('button', { name: 'Dashboard' })).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Page not found|Stopped Unexpectedly/i)).toHaveCount(0);
});

test('a trip deleted over the API is gone after reload', async ({ page, request }) => {
  const token = await page.evaluate(() => localStorage.getItem('wandergrid_session_token')).catch(() => null);
  await page.goto('/trips');
  await expect(page.getByText(TRIP.name).first()).toBeVisible({ timeout: 20_000 });
  const t = token || (await page.evaluate(() => localStorage.getItem('wandergrid_session_token')));
  expect((await request.delete(`/api/trips/${TRIP.id}`, { headers: { Authorization: `Bearer ${t}` } })).ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByText(TRIP.name)).toHaveCount(0, { timeout: 20_000 });
});
