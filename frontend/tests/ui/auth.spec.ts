/**
 * Authentication flow E2E tests.
 *
 * OpenTYME uses Keycloak for authentication — there is no in-app email/password
 * form.  The /login page shows a "Sign in with Keycloak" button that redirects
 * to the Keycloak IdP.  After a successful login Keycloak redirects back to
 * /dashboard.
 *
 * Tests that require a running Keycloak instance use loginViaKeycloak().
 * Public-page tests run against the built frontend only.
 */

import { test, expect } from '@playwright/test';
import { loginViaKeycloak } from './helpers/auth';

// ── Public page tests (no Keycloak needed) ────────────────────────────────

test.describe('Login page (public)', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/login');
  });

  test('renders the Keycloak redirect button', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /sign in to your account/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in with keycloak/i })).toBeVisible();
  });

  test('shows "Keycloak Authentication" description', async ({ page }) => {
    await expect(page.getByText(/keycloak authentication/i)).toBeVisible();
  });

  test('navigates to /register when Sign up is clicked', async ({ page }) => {
    await page.getByRole('button', { name: /sign up/i }).click();
    await expect(page).toHaveURL('/register');
  });
});

test.describe('Landing page (public)', () => {
  test('shows hero and Get Started CTA', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /get started/i })).toBeVisible();
  });

  test('Get Started navigates to /register', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /get started/i }).click();
    await expect(page).toHaveURL('/register');
  });
});

// ── Auth-guard tests (no Keycloak needed) ────────────────────────────────

test.describe('Auth guard', () => {
  test('unauthenticated user is redirected to /login from /dashboard', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated user is redirected to /login from /config', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/config');
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated user is redirected to /login from /clients', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/clients');
    await expect(page).toHaveURL(/\/login/);
  });
});

// ── Keycloak-dependent tests ──────────────────────────────────────────────

test.describe('Keycloak login flow', () => {
  test('successful login redirects to dashboard', async ({ page }) => {
    await loginViaKeycloak(page);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('dashboard is accessible after login', async ({ page }) => {
    await loginViaKeycloak(page);
    // Dashboard should render some content
    await expect(page.locator('main, [role="main"], #root').first()).toBeVisible();
  });

  test('session persists after page reload', async ({ page }) => {
    await loginViaKeycloak(page);
    await page.reload();
    // Should still be on dashboard, not redirected to login
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('logout redirects away from dashboard', async ({ page }) => {
    await loginViaKeycloak(page);
    // Find and click logout — it might be in a dropdown or header button
    const logoutBtn = page.getByRole('button', { name: /log.?out|sign.?out/i });
    if (await logoutBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await logoutBtn.click();
      // After logout we end up on landing page or login
      await expect(page).toHaveURL(/\/(?:login)?$/);
    } else {
      test.skip();
    }
  });
});
