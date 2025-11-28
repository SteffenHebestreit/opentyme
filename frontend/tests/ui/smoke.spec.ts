import { test, expect } from '@playwright/test';

test.describe('Application smoke tests', () => {
  test('home page renders hero content', async ({ page, baseURL }) => {
    await page.goto(baseURL ?? '/');
    await expect(page.getByText(/home page - coming soon/i)).toBeVisible();
  });

  test('login page renders form controls', async ({ page, baseURL }) => {
    await page.goto(`${baseURL ?? ''}/login`);
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /log in/i })).toBeVisible();
  });
});
