import { expect, type Page, type APIRequestContext } from '@playwright/test';

/** ISO date (YYYY-MM-DD) for a day in next month. */
export function nextMonthDay(day: number): string {
  const d = new Date();
  const t = new Date(d.getFullYear(), d.getMonth() + 1, day);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

export function isoDaysFromNow(n: number): string {
  return new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
}

/**
 * Pick a date range in the app's DateRangePicker (components/ui/DateRangePicker.tsx):
 * open the visible trigger showing `triggerText`, go to next month, click two days, press Done.
 */
export async function pickRangeNextMonth(page: Page, fromDay: number, toDay: number, triggerText = 'Start Date') {
  await page.locator(`text="${triggerText}" >> visible=true`).first().click();
  const pop = page.locator('div.z-popover.animate-fadeIn').last();
  await expect(pop).toBeVisible();
  await pop.locator('button[title="Next month"]').click();
  await pop.locator('button:not([disabled])').filter({ hasText: new RegExp(`^${fromDay}$`) }).first().click();
  await pop.locator('button:not([disabled])').filter({ hasText: new RegExp(`^${toDay}$`) }).first().click();
  const done = pop.getByRole('button', { name: 'Done' });
  if (await done.isVisible()) await done.click();
  await expect(pop).toHaveCount(0);
}

export type SeedTrip = { id: string; name: string; status: 'Planning' | 'Upcoming' | 'Past' | 'Cancelled'; startDate: string; endDate: string; location?: string; privacy?: 'Private' | 'Public'; participants?: string[]; transports?: any[]; accommodations?: any[]; [k: string]: any };

export async function seedTrip(request: APIRequestContext, token: string, trip: SeedTrip, ownerId: string) {
  const body = { location: 'Lisbon, Portugal', privacy: 'Private', participants: [ownerId], transports: [], accommodations: [], ...trip };
  const r = await request.post('/api/trips', { headers: { Authorization: `Bearer ${token}` }, data: body });
  expect(r.status(), `seed trip ${trip.id}`).toBe(201);
  return body;
}

export async function apiTrips(request: APIRequestContext, token: string): Promise<any[]> {
  const r = await request.get('/api/trips', { headers: { Authorization: `Bearer ${token}` } });
  expect(r.ok()).toBeTruthy();
  return r.json();
}

/** Visible-only locator helper (Playwright 1.49 has no filter({visible})). */
export const visible = (page: Page, selector: string) => page.locator(`${selector} >> visible=true`);

/** Visible text inside <main> (excludes the desktop sidebar's next-trip widget and hidden responsive copies). */
export const inMain = (page: Page, text: string) => page.locator(`main >> text="${text}" >> visible=true`);

/** Poll the API until a trip matching `pred` exists, then return it. */
export async function waitForTrip(request: APIRequestContext, token: string, pred: (t: any) => boolean, timeout = 10_000) {
  let found: any;
  await expect.poll(async () => { found = (await apiTrips(request, token)).find(pred); return !!found; }, { timeout }).toBe(true);
  return found;
}

export function flightRecord(id: string, over: Record<string, any> = {}) {
  return {
    id, itineraryId: `itin-${id}`, mode: 'Flight', type: 'One-Way',
    origin: 'JFK', destination: 'LHR', provider: 'British Airways', identifier: 'BA178',
    departureDate: isoDaysFromNow(20), departureTime: '19:00', arrivalDate: isoDaysFromNow(21), arrivalTime: '07:05',
    travelClass: 'Economy', seatNumber: '', confirmationCode: '', tripId: 'unassigned', ...over,
  };
}

export async function seedFlight(request: APIRequestContext, token: string, rec: Record<string, any>) {
  const r = await request.post('/api/flights', { headers: { Authorization: `Bearer ${token}` }, data: rec });
  expect(r.status(), `seed flight ${rec.id}`).toBe(201);
  return rec;
}

export async function apiGet(request: APIRequestContext, token: string, path: string): Promise<any> {
  const r = await request.get(path, { headers: { Authorization: `Bearer ${token}` } });
  expect(r.ok(), `GET ${path}`).toBeTruthy();
  return r.json();
}

export async function seedVisited(request: APIRequestContext, token: string, item: Record<string, any>) {
  const r = await request.post('/api/visited', { headers: { Authorization: `Bearer ${token}` }, data: item });
  expect(r.status()).toBe(201);
}

/** Horizontal overflow of the page or <main>, in px. */
export const overflowX = (page: Page) => page.evaluate(() => { const m = document.querySelector('main'); return Math.max(document.documentElement.scrollWidth - innerWidth, m ? m.scrollWidth - m.clientWidth : 0); });

/**
 * Pick a single date in the app's DatePicker (components/ui/DatePicker.tsx). Note: <Input type="date"> in this app
 * renders this custom picker (GlassInput upgrades it), not a native date input.
 */
export async function pickDateNextMonth(page: Page, day: number, trigger: string | RegExp = 'Select date') {
  const t = typeof trigger === 'string' ? page.locator(`text="${trigger}" >> visible=true`) : page.locator('button, div', { hasText: trigger }).locator('visible=true');
  await t.first().click();
  const pop = page.locator('div.z-popover.animate-fadeIn').last();
  await expect(pop).toBeVisible();
  await pop.locator('button[title="Next month"]').click();
  await pop.locator('button:not([disabled])').filter({ hasText: new RegExp(`^${day}$`) }).first().click();
  const done = pop.getByRole('button', { name: 'Done' });
  if (await done.isVisible().catch(() => false)) await done.click();
  await expect(pop).toHaveCount(0);
}

/** Open the DatePicker whose visible field label matches `label`, then pick `day` of next month. */
export async function pickDateByLabel(page: Page, label: RegExp, day: number) {
  const lab = page.locator('label >> visible=true').filter({ hasText: label }).last();
  await lab.locator('xpath=following-sibling::*[1]').click();
  const pop = page.locator('div.z-popover.animate-fadeIn').last();
  await expect(pop).toBeVisible();
  await pop.locator('button[title="Next month"]').click();
  await pop.locator('button:not([disabled])').filter({ hasText: new RegExp(`^${day}$`) }).first().click();
  const done = pop.getByRole('button', { name: 'Done' });
  if (await done.isVisible().catch(() => false)) await done.click();
}
