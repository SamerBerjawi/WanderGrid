/**
 * Chunk A — Auth & access: workflows 1–4 (first-run setup, sign-up, sign-in, demo login).
 * Assertions describe the EXPECTED behaviour; a failing assertion is a bug (see audit/qa-results.md).
 */
import { test, expect, ADMIN, PARTNER, resetDb, apiRegister, waitForAuthScreen, fillLogin, submitButton, expectAppShell, authHeading } from '../support/fixtures';

test.beforeEach(async ({ request }) => { await resetDb(request); });

test.describe('W1 first-run admin setup', () => {
  test('empty database shows the "Initial System Setup" form', async ({ page }) => {
    await page.goto('/');
    await waitForAuthScreen(page);
    await expect(authHeading(page)).toHaveText('Initial System Setup');
  });

  test('completing Initial System Setup creates the first Admin and opens the app', async ({ page, request }) => {
    await page.goto('/');
    await waitForAuthScreen(page);
    await expect(authHeading(page)).toHaveText('Initial System Setup');
    await page.locator('input[name="name"]').fill('First Admin');
    await page.locator('input[name="email"]').fill('first.admin@wandergrid.test');
    await page.locator('input[name="password"]').fill('FirstAdmin!234');
    await page.locator('input[name="confirmPassword"]').fill('FirstAdmin!234');
    await submitButton(page).click();
    await expectAppShell(page);
    const r = await request.post('/api/auth/login', { data: { email: 'first.admin@wandergrid.test', password: 'FirstAdmin!234' } });
    expect((await r.json()).user.role).toBe('Admin');
  });

  test('when an admin closes public sign-up, the sign-in screen hides "Sign Up"', async ({ page, request }) => {
    const admin = await apiRegister(request, ADMIN);
    await request.put('/api/settings', { headers: { Authorization: `Bearer ${admin.token}` }, data: { orgName: 'QA', allowSelfRegistration: false } });
    await page.goto('/');
    await waitForAuthScreen(page);
    await expect(authHeading(page)).toHaveText('Welcome Back');
    await expect(page.getByRole('button', { name: 'Sign Up', exact: true })).toHaveCount(0);
  });

  test('when users exist, the sign-in form is shown', async ({ page, request }) => {
    await apiRegister(request, ADMIN);
    await page.goto('/');
    await waitForAuthScreen(page);
    await expect(authHeading(page)).toHaveText('Welcome Back');
  });
});

test.describe('W2 sign up', () => {
  // Public sign-up exists once the workspace has its first admin (an empty DB shows Initial System Setup).
  test.beforeEach(async ({ request }) => { await apiRegister(request, ADMIN); });

  const openSignUp = async (page) => {
    await page.goto('/');
    await waitForAuthScreen(page);
    if (!(await page.getByRole('heading', { name: 'Join WanderGrid' }).isVisible())) {
      await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
    }
    await expect(page.getByRole('heading', { name: 'Join WanderGrid' })).toBeVisible();
  };

  test('happy path: new account is created and the app opens', async ({ page, request }) => {
    await openSignUp(page);
    await page.locator('input[name="name"]').fill('New Traveller');
    await page.locator('input[name="email"]').fill('new.traveller@wandergrid.test');
    await page.locator('input[name="password"]').fill('Str0ng!Passw0rd');
    await page.locator('input[name="confirmPassword"]').fill('Str0ng!Passw0rd');
    await submitButton(page).click();
    await expectAppShell(page);
    expect(await page.evaluate(() => !!localStorage.getItem('wandergrid_session_token'))).toBe(true);
    const r = await request.post('/api/auth/login', { data: { email: 'new.traveller@wandergrid.test', password: 'Str0ng!Passw0rd' } });
    expect(r.status()).toBe(200);
    expect((await r.json()).user.role).toBe('Partner');
  });

  test('mismatched passwords show "Passwords do not match"', async ({ page }) => {
    await openSignUp(page);
    await page.locator('input[name="name"]').fill('Mismatch');
    await page.locator('input[name="email"]').fill('mismatch@wandergrid.test');
    await page.locator('input[name="password"]').fill('abcdef12');
    await page.locator('input[name="confirmPassword"]').fill('abcdef13');
    await submitButton(page).click();
    await expect(page.getByText('Passwords do not match')).toBeVisible();
  });

  test('duplicate email shows a clear "already exists" message', async ({ page, request }) => {
    await apiRegister(request, PARTNER);
    await openSignUp(page);
    await page.locator('input[name="name"]').fill('Dup');
    await page.locator('input[name="email"]').fill(PARTNER.email);
    await page.locator('input[name="password"]').fill('abcdef12');
    await page.locator('input[name="confirmPassword"]').fill('abcdef12');
    await submitButton(page).click();
    await expect(page.locator('form')).toContainText(/already exists|already registered|in use/i);
  });

  test('required fields and email format are validated before submit', async ({ page }) => {
    await openSignUp(page);
    let posted = false;
    page.on('request', (r) => { if (r.url().includes('/api/auth/register')) posted = true; });
    await submitButton(page).click();
    expect(await page.locator('input[name="name"]').evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true);
    await page.locator('input[name="name"]').fill('X');
    await page.locator('input[name="email"]').fill('not-an-email');
    await page.locator('input[name="password"]').fill('abcdef12');
    await page.locator('input[name="confirmPassword"]').fill('abcdef12');
    await submitButton(page).click();
    expect(await page.locator('input[name="email"]').evaluate((el: HTMLInputElement) => el.validity.typeMismatch)).toBe(true);
    expect(posted).toBe(false);
  });

  test('weak password (1 character) is rejected with a message', async ({ page }) => {
    await openSignUp(page);
    await page.locator('input[name="name"]').fill('Weak');
    await page.locator('input[name="email"]').fill('weak@wandergrid.test');
    await page.locator('input[name="password"]').fill('1');
    await page.locator('input[name="confirmPassword"]').fill('1');
    await submitButton(page).click();
    await expect(page.locator('form')).toContainText(/password.*(at least|characters|too short|weak)/i, { timeout: 5000 });
  });

  test('very long name (2,000 chars) does not break the layout', async ({ page }) => {
    await openSignUp(page);
    await page.locator('input[name="name"]').fill('L'.repeat(2000));
    await page.locator('input[name="email"]').fill('long.name@wandergrid.test');
    await page.locator('input[name="password"]').fill('Str0ng!Passw0rd');
    await page.locator('input[name="confirmPassword"]').fill('Str0ng!Passw0rd');
    await submitButton(page).click();
    await expectAppShell(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('W3 sign in', () => {
  test.beforeEach(async ({ request }) => { await apiRegister(request, ADMIN); });

  test('happy path: valid credentials open the app and store a token', async ({ page }) => {
    await page.goto('/');
    await waitForAuthScreen(page);
    await fillLogin(page, ADMIN.email, ADMIN.password);
    await submitButton(page).click();
    await expectAppShell(page);
    const stored = await page.evaluate(() => ({ t: localStorage.getItem('wandergrid_session_token'), u: JSON.parse(localStorage.getItem('wandergrid_session_user') || 'null') }));
    expect(stored.t).toBeTruthy();
    expect(stored.u?.email).toBe(ADMIN.email);
    expect(stored.u?.password).toBeUndefined();
  });

  test('email is case-insensitive', async ({ page }) => {
    await page.goto('/');
    await waitForAuthScreen(page);
    await fillLogin(page, ADMIN.email.toUpperCase(), ADMIN.password);
    await submitButton(page).click();
    await expectAppShell(page);
  });

  test('wrong password shows an error and stays on the form', async ({ page }) => {
    await page.goto('/');
    await waitForAuthScreen(page);
    await fillLogin(page, ADMIN.email, 'wrong-password');
    await submitButton(page).click();
    await expect(page.locator('form')).toContainText(/invalid credentials/i);
    await expect(authHeading(page)).toHaveText('Welcome Back');
    await expect(submitButton(page)).toBeEnabled();
  });

  test('unknown email shows the same generic error', async ({ page }) => {
    await page.goto('/');
    await waitForAuthScreen(page);
    await fillLogin(page, 'nobody@wandergrid.test', 'whatever1');
    await submitButton(page).click();
    await expect(page.locator('form')).toContainText(/invalid credentials/i);
  });

  test('error message is plain-language (no jargon)', async ({ page }) => {
    await page.goto('/');
    await waitForAuthScreen(page);
    await fillLogin(page, ADMIN.email, 'wrong-password');
    await submitButton(page).click();
    await expect(page.locator('form')).toContainText(/invalid credentials/i);
    await expect(page.locator('form')).not.toContainText(/design coordinates/i);
  });

  test('double-clicking submit sends a single login request', async ({ page }) => {
    await page.goto('/');
    await waitForAuthScreen(page);
    await fillLogin(page, ADMIN.email, ADMIN.password);
    let logins = 0;
    page.on('request', (r) => { if (r.url().endsWith('/api/auth/login') && r.method() === 'POST') logins++; });
    await submitButton(page).dblclick();
    await expectAppShell(page);
    expect(logins).toBe(1);
  });

  test('network failure shows a helpful message and re-enables the form', async ({ page }) => {
    await page.goto('/');
    await waitForAuthScreen(page);
    await page.route('**/api/auth/login', (r) => r.abort('connectionrefused'));
    await fillLogin(page, ADMIN.email, ADMIN.password);
    await submitButton(page).click();
    await expect(page.locator('form')).toContainText(/network|server|connect|offline|unavailable/i, { timeout: 15_000 });
    await expect(submitButton(page)).toBeEnabled();
  });

  test('server error (500) shows a helpful message', async ({ page }) => {
    await page.goto('/');
    await waitForAuthScreen(page);
    await page.route('**/api/auth/login', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Authentication failed"}' }));
    await fillLogin(page, ADMIN.email, ADMIN.password);
    await submitButton(page).click();
    await expect(page.locator('form')).toContainText(/try again|server|unavailable|authentication failed/i, { timeout: 15_000 });
  });
});

test.describe('W4 demo login', () => {
  test('"Auto-Setup & Demo Run" opens the app with sample data', async ({ page }) => {
    await page.goto('/');
    await waitForAuthScreen(page);
    await page.getByRole('button', { name: 'Auto-Setup & Demo Run' }).click();
    await expectAppShell(page);
  });
});
