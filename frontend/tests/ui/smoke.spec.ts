/**
 * Application smoke tests — must pass with zero dependencies on a running backend.
 * These verify that the built frontend serves key pages correctly.
 */

import { test, expect } from '@playwright/test';

test.describe('Smoke tests', () => {
  test('landing page renders hero content', async ({ page }) => {
    await page.goto('/');
    // LandingPage shows "Track Your Money & Effort" heading
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // "Get Started" CTA link to /register
    await expect(page.getByRole('link', { name: /get started/i })).toBeVisible();
  });

  test('login page renders Keycloak redirect button', async ({ page }) => {
    await page.goto('/login');
    // The login page is a Keycloak redirect page — no email/password inputs
    await expect(page.getByRole('heading', { name: /sign in to your account/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in with keycloak/i })).toBeVisible();
  });

  test('login page shows sign-up link to /register', async ({ page }) => {
    await page.goto('/login');
    // The "Sign up" button navigates to /register
    await page.getByRole('button', { name: /sign up/i }).click();
    await expect(page).toHaveURL('/register');
  });

  test('/register route is accessible', async ({ page }) => {
    await page.goto('/register');
    // Register either shows a Keycloak redirect or an in-app form
    await expect(page).not.toHaveURL('/login');
    // Something should be visible (heading or button)
    await expect(page.locator('h1, h2, button').first()).toBeVisible();
  });

  test('/forgot-password route is accessible', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page).not.toHaveURL('/login');
    await expect(page.locator('h1, h2, form, button').first()).toBeVisible();
  });

  test('protected route /dashboard redirects to login when unauthenticated', async ({ page }) => {
    await page.goto('/dashboard');
    // Auth guard should redirect to /login
    await expect(page).toHaveURL(/\/login/);
  });

  test('protected route /clients redirects to login when unauthenticated', async ({ page }) => {
    await page.goto('/clients');
    await expect(page).toHaveURL(/\/login/);
  });

  test('protected route /config redirects to login when unauthenticated', async ({ page }) => {
    await page.goto('/config');
    await expect(page).toHaveURL(/\/login/);
  });

  test('unknown route returns 404 page', async ({ page }) => {
    await page.goto('/this-route-definitely-does-not-exist');
    // PluginRoute catch-all renders a 404 message
    await expect(page.getByText(/404|page not found/i)).toBeVisible({ timeout: 8_000 });
  });
});
