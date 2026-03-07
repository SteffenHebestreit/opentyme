/**
 * Shared Playwright authentication helpers.
 *
 * OpenTYME uses Keycloak for SSO. The login page at /login shows a
 * "Sign in with Keycloak" button that redirects to the Keycloak IdP.
 * After successful login Keycloak redirects back to /dashboard.
 *
 * Test credentials (configured in Keycloak dev realm):
 *   username: admin
 *   password: admin123
 */

import { type Page, expect } from '@playwright/test';

/** Keycloak realm used by the test environment */
const KC_REALM = process.env.KEYCLOAK_REALM ?? 'opentyme';

/**
 * Log in via the Keycloak redirect flow.
 *
 * 1. Navigates to /login
 * 2. Clicks "Sign in with Keycloak"
 * 3. Fills the Keycloak login form (runs on auth.localhost)
 * 4. Waits for redirect back to /dashboard
 *
 * @param page  Playwright Page object
 * @param username  Keycloak username (default: 'admin')
 * @param password  Keycloak password (default: 'admin123')
 */
export async function loginViaKeycloak(
  page: Page,
  username = 'admin',
  password = 'admin123',
): Promise<void> {
  await page.goto('/login');

  // Click the Keycloak redirect button
  await page.getByRole('button', { name: /sign in with keycloak/i }).click();

  // Wait for the Keycloak login page (URL contains /realms/<realm>/protocol/...)
  await page.waitForURL(new RegExp(`realms/${KC_REALM}`), { timeout: 15_000 });

  // Fill the Keycloak username/password form
  // Keycloak uses id="username" and id="password" by default
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login, [name="login"], [type="submit"]').first().click();

  // Wait for redirect back to dashboard
  await page.waitForURL('**/dashboard', { timeout: 20_000 });
  await expect(page).toHaveURL(/\/dashboard/);
}

/**
 * Log out from the application.
 * Looks for the logout button/link in the header or user menu.
 */
export async function logout(page: Page): Promise<void> {
  // Try clicking a user avatar / menu first, then the logout button
  const userMenu = page.getByRole('button', { name: /user menu|profile|account/i });
  if (await userMenu.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await userMenu.click();
  }
  await page.getByRole('button', { name: /log.?out|sign.?out/i }).click();
}
