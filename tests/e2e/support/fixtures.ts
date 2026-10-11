import { test as base, expect, type Page, type APIRequestContext } from '@playwright/test';

export const CONTROL = 'http://localhost:3099';

export type TestUser = { id: string; name: string; email: string; password: string; role: 'Admin' | 'Partner' | 'Child' };

export const ADMIN: TestUser = { id: 'qa.admin@wandergrid.test', name: 'QA Admin', email: 'qa.admin@wandergrid.test', password: 'AdminPass!234', role: 'Admin' };
export const PARTNER: TestUser = { id: 'qa.partner@wandergrid.test', name: 'QA Partner', email: 'qa.partner@wandergrid.test', password: 'PartnerPass!234', role: 'Partner' };

/** Restore the empty-schema database snapshot. */
export async function resetDb(request: APIRequestContext) {
  const r = await request.post(`${CONTROL}/reset`);
  expect(r.ok(), 'harness reset').toBeTruthy();
}

/** Register a user directly against the API (the same payload shape the client sends). */
export async function apiRegister(request: APIRequestContext, u: TestUser): Promise<{ token: string; user: any }> {
  const r = await request.post('/api/auth/register', {
    data: { id: u.id, name: u.name, email: u.email, password: u.password, role: u.role, leaveBalance: 25, takenLeave: 0, allowance: 25, lieuBalance: 0, activeYears: [2026], policies: [], holidayConfigIds: [] },
  });
  expect(r.status(), `register ${u.email}`).toBe(201);
  return r.json();
}

export async function apiLogin(request: APIRequestContext, email: string, password: string) {
  return request.post('/api/auth/login', { data: { email, password } });
}

/** Put an authenticated session straight into localStorage (skips the login UI). */
export async function seedSession(page: Page, token: string, user: any) {
  await page.addInitScript(([t, u]) => {
    if (!sessionStorage.getItem('__seeded')) {
      localStorage.setItem('wandergrid_session_token', t as string);
      localStorage.setItem('wandergrid_session_user', JSON.stringify(u));
      sessionStorage.setItem('__seeded', '1');
    }
  }, [token, user]);
}

export const authHeading = (page: Page) => page.getByRole('heading', { level: 2 }).filter({ hasText: /Welcome Back|Join WanderGrid|Initial System Setup/ });

export async function waitForAuthScreen(page: Page) {
  await expect(authHeading(page)).toBeVisible({ timeout: 20_000 });
}

export async function fillLogin(page: Page, email: string, password: string) {
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
}

export const submitButton = (page: Page) => page.locator('form button[type="submit"]');

/** True once the authenticated app shell (sidebar or mobile tab bar) is rendered. */
export async function expectAppShell(page: Page) {
  const isMobile = (page.viewportSize()?.width ?? 1440) < 768;
  if (isMobile) await expect(page.locator('div.md\\:hidden.fixed').getByRole('button', { name: /Dashboard/i }).first()).toBeVisible({ timeout: 20_000 });
  else await expect(page.locator('aside nav').getByRole('button', { name: 'Dashboard' })).toBeVisible({ timeout: 20_000 });
}

export const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;

export const test = base.extend<{}>({});
export { expect };
