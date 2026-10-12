/**
 * Chunk A — Auth & access: workflows 5–8 (?demo=1, session restore, logout, password reset) + access control.
 */
import { test, expect, ADMIN, PARTNER, resetDb, apiRegister, seedSession, waitForAuthScreen, fillLogin, submitButton, expectAppShell, isMobile } from '../support/fixtures';

test.beforeEach(async ({ request }) => { await resetDb(request); });

async function openProfile(page) {
  if (isMobile(page)) {
    await page.locator('div.md\\:hidden.fixed').getByRole('button', { name: /More/i }).click();
    await page.locator('.md\\:hidden.fixed.z-modal').getByRole('button').filter({ hasText: /QA|Admin|Partner/ }).last().click();
  } else {
    await page.locator('aside button[title^="Profile:"]').click();
  }
}

test.describe('W5 ?demo=1 URL', () => {
  test('?demo=1 without credentials does not grant access to the app', async ({ page, request }) => {
    await apiRegister(request, ADMIN);
    await page.goto('/?demo=1');
    // A fake client-side admin must not result in an authenticated app shell.
    await page.waitForTimeout(6000);
    await waitForAuthScreen(page);
  });
});

test.describe('W6 session restore', () => {
  test('reload keeps a valid session', async ({ page, request }) => {
    const { token, user } = await apiRegister(request, ADMIN);
    await seedSession(page, token, user);
    await page.goto('/settings');
    await expectAppShell(page);
    await page.reload();
    await expectAppShell(page);
    expect(new URL(page.url()).pathname).toBe('/settings');
  });

  test('invalid/tampered token returns the user to the sign-in screen', async ({ page, request }) => {
    const { user } = await apiRegister(request, ADMIN);
    await seedSession(page, 'not-a-real-token', user);
    await page.goto('/');
    await waitForAuthScreen(page);
    await page.waitForTimeout(3000);
    await waitForAuthScreen(page); // still logged out after background calls settle
  });

  test('a deleted user is signed out on reload (not switched to another account)', async ({ page, request }) => {
    const admin = await apiRegister(request, ADMIN);
    const partner = await apiRegister(request, PARTNER);
    await seedSession(page, partner.token, partner.user);
    await page.goto('/');
    await expectAppShell(page);
    const del = await request.delete(`/api/users/${encodeURIComponent(PARTNER.id)}`, { headers: { Authorization: `Bearer ${admin.token}` } });
    expect(del.ok()).toBeTruthy();
    await page.reload();
    await page.waitForTimeout(4000);
    const sessionUser = await page.evaluate(() => JSON.parse(localStorage.getItem('wandergrid_session_user') || 'null'));
    expect(sessionUser?.email ?? null, 'session must not silently become another user').not.toBe(ADMIN.email);
    await waitForAuthScreen(page);
  });

  test('protected deep link while logged out shows sign-in, then opens that page after login', async ({ page, request }) => {
    await apiRegister(request, ADMIN);
    await page.goto('/settings');
    await waitForAuthScreen(page);
    await fillLogin(page, ADMIN.email, ADMIN.password);
    await submitButton(page).click();
    await expectAppShell(page);
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.locator('main h1').first()).toContainText(/Settings/i);
  });
});

test.describe('W7 log out', () => {
  test('Sign out returns to the sign-in screen and clears the stored session', async ({ page, request }) => {
    const { token, user } = await apiRegister(request, ADMIN);
    await seedSession(page, token, user);
    await page.goto('/');
    await expectAppShell(page);
    await openProfile(page);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await waitForAuthScreen(page);
    const ls = await page.evaluate(() => [localStorage.getItem('wandergrid_session_token'), localStorage.getItem('wandergrid_session_user')]);
    expect(ls).toEqual([null, null]);
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('browser Back after sign-out does not reveal the app', async ({ page, request }) => {
    const { token, user } = await apiRegister(request, ADMIN);
    await seedSession(page, token, user);
    await page.goto('/flights');
    await expectAppShell(page);
    await openProfile(page);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await waitForAuthScreen(page);
    await page.goBack();
    await waitForAuthScreen(page);
  });

  test('a sign-out control is reachable from the main navigation (sidebar / tab bar)', async ({ page, request }) => {
    const { token, user } = await apiRegister(request, ADMIN);
    await seedSession(page, token, user);
    await page.goto('/');
    await expectAppShell(page);
    if (isMobile(page)) await page.locator('div.md\\:hidden.fixed').getByRole('button', { name: /More/i }).click();
    const nav = isMobile(page) ? page.locator('.md\\:hidden.fixed.z-modal') : page.locator('aside');
    await expect(nav.getByRole('button', { name: /sign out|log ?out/i })).toBeVisible();
  });

  test('token is no longer accepted by the API after sign-out', async ({ page, request }) => {
    test.skip(isMobile(page), 'API behaviour, run once');
    const { token, user } = await apiRegister(request, ADMIN);
    await seedSession(page, token, user);
    await page.goto('/');
    await expectAppShell(page);
    await openProfile(page);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await waitForAuthScreen(page);
    const r = await request.get('/api/trips', { headers: { Authorization: `Bearer ${token}` } });
    expect(r.status(), 'old token should be rejected').toBeGreaterThanOrEqual(401);
  });

  test('API 401 during use signs the user out automatically', async ({ page, request }) => {
    const { token, user } = await apiRegister(request, ADMIN);
    await seedSession(page, token, user);
    await page.goto('/');
    await expectAppShell(page);
    await page.route('**/api/trips**', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Access token required"}' }));
    await page.evaluate(() => { history.pushState({}, '', '/planner'); dispatchEvent(new PopStateEvent('popstate')); });
    await waitForAuthScreen(page);
  });
});

test.describe('W8 password reset', () => {
  test('sign-in screen offers "Forgot password?"', async ({ page, request }) => {
    await apiRegister(request, ADMIN);
    await page.goto('/');
    await waitForAuthScreen(page);
    await expect(page.getByRole('button', { name: /forgot|reset/i }).or(page.getByRole('link', { name: /forgot|reset/i }))).toBeVisible({ timeout: 3000 });
  });

  test('an admin issues a reset code and the member sets a new password with it', async ({ page, browser, request }) => {
    const admin = await apiRegister(request, ADMIN);
    await apiRegister(request, PARTNER);
    await seedSession(page, admin.token, admin.user);
    await page.goto('/settings');
    await expectAppShell(page);
    await page.locator('main button >> visible=true').filter({ hasText: /^Members/ }).first().click();
    await page.getByRole('button', { name: `Issue password reset code for ${PARTNER.name}` }).click();
    const code = (await page.getByTestId('reset-code').innerText()).trim();
    expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);

    const ctx = await browser.newContext({ viewport: test.info().project.use.viewport, baseURL: 'http://localhost:4173', serviceWorkers: 'block' });
    const member = await ctx.newPage();
    await member.goto('/');
    await waitForAuthScreen(member);
    await member.getByRole('button', { name: 'Forgot password?' }).click();
    await member.locator('input[name="email"]').fill(PARTNER.email);
    await member.locator('input[name="resetCode"]').fill(code);
    await member.locator('input[name="password"]').fill('Brand!New8pass');
    await member.locator('input[name="confirmPassword"]').fill('Brand!New8pass');
    await submitButton(member).click();
    await expect(member.getByText('Password updated. Sign in with your new password.')).toBeVisible();
    await ctx.close();
    expect((await request.post('/api/auth/login', { data: { email: PARTNER.email, password: 'Brand!New8pass' } })).status()).toBe(200);
  });

  test('a signed-in user can change their own password from the profile', async ({ page, request }) => {
    const { token, user } = await apiRegister(request, PARTNER);
    await seedSession(page, token, user);
    await page.goto('/');
    await expectAppShell(page);
    await openProfile(page);
    await page.locator('main h1', { hasText: PARTNER.name }).locator('xpath=following-sibling::button[1]').click();
    const pw = page.locator('input[placeholder^="Leave blank to keep it"]');
    await expect(pw).toBeVisible();
    await pw.fill('Changed!Pass1');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await page.waitForTimeout(1500);
    const r = await request.post('/api/auth/login', { data: { email: PARTNER.email, password: 'Changed!Pass1' } });
    expect(r.status()).toBe(200);
  });
});

test.describe('Profile URL handling', () => {
  test('profile link with a percent-encoded id (%40) opens the profile', async ({ page, request }) => {
    const { token, user } = await apiRegister(request, PARTNER);
    await seedSession(page, token, user);
    await page.goto(`/user/${encodeURIComponent(PARTNER.id)}`);
    await expectAppShell(page);
    await expect(page.locator('main h1').first()).toContainText(PARTNER.name, { timeout: 10_000 });
  });

  test('unknown user id shows a not-found state instead of an endless spinner', async ({ page, request }) => {
    const { token, user } = await apiRegister(request, PARTNER);
    await seedSession(page, token, user);
    await page.goto('/user/does-not-exist');
    await expectAppShell(page);
    await page.waitForTimeout(5000);
    await expect(page.getByText(/Retrieving Traveler ID/i)).toHaveCount(0);
    await expect(page.locator('main')).toContainText(/not found|no such|doesn.t exist|unavailable/i);
  });
});

test.describe('Access control (API)', () => {
  test.beforeEach(async ({ page }) => { test.skip(isMobile(page), 'API behaviour, run once'); });

  test('unauthenticated API requests are rejected', async ({ request }) => {
    for (const path of ['/api/trips', '/api/users', '/api/settings', '/api/backup']) {
      const r = await request.get(path);
      expect(r.status(), path).toBe(401);
    }
  });

  test('self-registration cannot grant the Admin role', async ({ request }) => {
    await apiRegister(request, ADMIN);
    const r = await request.post('/api/auth/register', { data: { id: 'eve@evil.test', name: 'Eve', email: 'eve@evil.test', password: 'x1234567', role: 'Admin' } });
    const role = (await r.json())?.user?.role;
    expect(role, 'public sign-up must not create Admins').not.toBe('Admin');
  });

  test('registering with an existing user id cannot overwrite that account', async ({ request }) => {
    await apiRegister(request, ADMIN);
    await request.post('/api/auth/register', { data: { id: ADMIN.id, name: 'Mallory', email: 'mallory@evil.test', password: 'm1234567', role: 'Admin' } });
    const r = await request.post('/api/auth/login', { data: { email: ADMIN.email, password: ADMIN.password } });
    expect(r.status(), 'original admin must still be able to sign in').toBe(200);
  });

  test('a Partner cannot wipe the database or change another user', async ({ request }) => {
    await apiRegister(request, ADMIN);
    const partner = await apiRegister(request, PARTNER);
    const h = { Authorization: `Bearer ${partner.token}` };
    const put = await request.put(`/api/users/${encodeURIComponent(ADMIN.id)}`, { headers: h, data: { id: ADMIN.id, email: ADMIN.email, name: 'pwned', password: 'hijacked1', role: 'Admin' } });
    expect(put.status(), 'PUT another user').toBe(403);
    const wipe = await request.post('/api/wipe', { headers: h });
    expect(wipe.status(), 'POST /api/wipe as Partner').toBe(403);
  });
});
