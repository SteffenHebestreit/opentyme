import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Start fresh with cleared storage
    await page.context().clearCookies();
    await page.goto('/');
  });

  test('should display login form on homepage', async ({ page }) => {
    // Check if login form is visible
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('should show validation errors for empty login form', async ({ page }) => {
    const submitButton = page.getByRole('button', { name: /sign in/i });
    await submitButton.click();

    // Check for validation error messages
    await expect(page.getByText(/email is required/i)).toBeVisible();
    await expect(page.getByText(/password is required/i)).toBeVisible();
  });

  test('should show validation error for invalid email format', async ({ page }) => {
    await page.getByLabel(/email/i).fill('invalid-email');
    await page.getByLabel(/password/i).fill('password123');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText(/please enter a valid email/i)).toBeVisible();
  });

  test('should display error for invalid credentials', async ({ page }) => {
    await page.getByLabel(/email/i).fill('nonexistent@example.com');
    await page.getByLabel(/password/i).fill('wrongpassword');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for error message to appear
    await expect(page.getByText(/invalid.*credentials/i)).toBeVisible();
  });

  test('should navigate to register page', async ({ page }) => {
    await page.getByRole('link', { name: /sign up/i }).click();
    
    await expect(page).toHaveURL('/register');
    await expect(page.getByRole('heading', { name: /create.*account/i })).toBeVisible();
  });

  test('should navigate to forgot password page', async ({ page }) => {
    await page.getByRole('link', { name: /forgot.*password/i }).click();
    
    await expect(page).toHaveURL('/forgot-password');
    await expect(page.getByRole('heading', { name: /reset.*password/i })).toBeVisible();
  });

  test('should successfully login with valid credentials', async ({ page }) => {
    // Assuming we have test user credentials
    await page.getByLabel(/email/i).fill('admin@example.com');
    await page.getByLabel(/password/i).fill('admin123');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Should redirect to dashboard
    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByText(/welcome back/i)).toBeVisible();
  });

  test('should maintain session after page refresh', async ({ page }) => {
    // Login first
    await page.getByLabel(/email/i).fill('admin@example.com');
    await page.getByLabel(/password/i).fill('admin123');
    await page.getByRole('button', { name: /sign in/i }).click();
    
    await expect(page).toHaveURL('/dashboard');

    // Refresh page
    await page.reload();
    
    // Should still be on dashboard (session maintained)
    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByText(/welcome back/i)).toBeVisible();
  });

  test('should logout successfully', async ({ page }) => {
    // Login first
    await page.getByLabel(/email/i).fill('admin@example.com');
    await page.getByLabel(/password/i).fill('admin123');
    await page.getByRole('button', { name: /sign in/i }).click();
    
    await expect(page).toHaveURL('/dashboard');

    // Find and click logout button
    await page.getByRole('button', { name: /logout/i }).click();
    
    // Should redirect to login page
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  });
});

test.describe('Registration Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register');
  });

  test('should display registration form', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /create.*account/i })).toBeVisible();
    await expect(page.getByLabel(/first.*name/i)).toBeVisible();
    await expect(page.getByLabel(/last.*name/i)).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByLabel(/confirm.*password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /create.*account/i })).toBeVisible();
  });

  test('should show validation errors for empty fields', async ({ page }) => {
    await page.getByRole('button', { name: /create.*account/i }).click();

    await expect(page.getByText(/first name is required/i)).toBeVisible();
    await expect(page.getByText(/last name is required/i)).toBeVisible();
    await expect(page.getByText(/email is required/i)).toBeVisible();
    await expect(page.getByText(/password is required/i)).toBeVisible();
  });

  test('should show error when passwords do not match', async ({ page }) => {
    await page.getByLabel(/first.*name/i).fill('John');
    await page.getByLabel(/last.*name/i).fill('Doe');
    await page.getByLabel(/email/i).fill('john.doe@example.com');
    await page.getByLabel(/^password/i).fill('password123');
    await page.getByLabel(/confirm.*password/i).fill('different123');
    
    await page.getByRole('button', { name: /create.*account/i }).click();

    await expect(page.getByText(/passwords.*not.*match/i)).toBeVisible();
  });

  test('should successfully register new user', async ({ page }) => {
    const timestamp = Date.now();
    const email = `testuser${timestamp}@example.com`;

    await page.getByLabel(/first.*name/i).fill('John');
    await page.getByLabel(/last.*name/i).fill('Doe');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/^password/i).fill('password123');
    await page.getByLabel(/confirm.*password/i).fill('password123');
    
    await page.getByRole('button', { name: /create.*account/i }).click();

    // Should redirect to dashboard after successful registration
    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByText(/welcome.*john/i)).toBeVisible();
  });

  test('should show error for existing email', async ({ page }) => {
    await page.getByLabel(/first.*name/i).fill('Jane');
    await page.getByLabel(/last.*name/i).fill('Doe');
    await page.getByLabel(/email/i).fill('admin@example.com'); // Existing email
    await page.getByLabel(/^password/i).fill('password123');
    await page.getByLabel(/confirm.*password/i).fill('password123');
    
    await page.getByRole('button', { name: /create.*account/i }).click();

    await expect(page.getByText(/email.*already.*exists/i)).toBeVisible();
  });
});