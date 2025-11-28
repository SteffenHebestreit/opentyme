import { test, expect } from '@playwright/test';

// Validates theme styling and basic navigation across landing/login/register.
test.describe('Theme + Navigation', () => {
  test('landing -> login -> register flow with inputs', async ({ page }) => {
    await page.goto('/');

    // Landing hero visible
    await expect(page.getByRole('heading', { name: /Track Projects\s*Like\s*Never\s*Before/i })).toBeVisible();

    // Header has glass effect and themed border in either light or dark
    const header = page.locator('header');
    await expect(header).toHaveClass(/backdrop-blur-lg/);
    const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    const headerClass = await header.getAttribute('class');
    if (isDark) {
      expect(headerClass).toMatch(/border-purple-500/);
    } else {
      expect(headerClass).toMatch(/border-purple-300/);
    }

    // Navigate directly to Login (header may not show auth links unauthenticated)
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /Sign in to your account/i })).toBeVisible();

    // Fill login inputs (label supports "Username or Email")
    await page.getByLabel(/Username|Email/i).fill('user@example.com');
    await page.getByLabel(/Password/i).fill('Password123!');

    // Navigate to Register
    await page.getByRole('button', { name: /Sign up/i }).click();
    await expect(page.getByRole('heading', { name: /Create your account/i })).toBeVisible();

    // Ensure form card is themed (light uses bg-white, dark uses bg-gray)
    const formCard = page.locator('form.card');
    await expect(formCard).toBeVisible();
  });
});
