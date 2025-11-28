import { test, expect } from '@playwright/test';

test.describe('Password Reset Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/');
  });

  test('should navigate to forgot password page from login', async ({ page }) => {
    await page.getByRole('link', { name: /forgot.*password/i }).click();
    
    await expect(page).toHaveURL('/forgot-password');
    await expect(page.getByRole('heading', { name: /reset.*password/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /send.*reset.*link/i })).toBeVisible();
  });

  test('should show validation error for empty email', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByRole('button', { name: /send.*reset.*link/i }).click();
    
    await expect(page.getByText(/email is required/i)).toBeVisible();
  });

  test('should show validation error for invalid email format', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel(/email/i).fill('invalid-email');
    await page.getByRole('button', { name: /send.*reset.*link/i }).click();
    
    await expect(page.getByText(/please enter a valid email/i)).toBeVisible();
  });

  test('should send reset link for valid email', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel(/email/i).fill('admin@example.com');
    await page.getByRole('button', { name: /send.*reset.*link/i }).click();
    
    // Should show success message
    await expect(page.getByText(/reset link sent.*check your email/i)).toBeVisible();
  });

  test('should show error for non-existent email', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel(/email/i).fill('nonexistent@example.com');
    await page.getByRole('button', { name: /send.*reset.*link/i }).click();
    
    // Should show user-friendly message (for security, don't reveal if email exists)
    await expect(page.getByText(/if.*email exists.*reset link/i)).toBeVisible();
  });

  test('should navigate back to login from forgot password', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByRole('link', { name: /back.*login/i }).click();
    
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  });

  test('should display reset password form with valid token', async ({ page }) => {
    // Simulate clicking on a reset link with token
    const resetToken = 'test-token-123456';
    await page.goto(`/reset-password?token=${resetToken}`);
    
    await expect(page.getByRole('heading', { name: /reset.*password/i })).toBeVisible();
    await expect(page.getByLabel(/new password/i)).toBeVisible();
    await expect(page.getByLabel(/confirm.*password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /reset.*password/i })).toBeVisible();
  });

  test('should show validation error for empty password fields', async ({ page }) => {
    const resetToken = 'test-token-123456';
    await page.goto(`/reset-password?token=${resetToken}`);
    await page.getByRole('button', { name: /reset.*password/i }).click();
    
    await expect(page.getByText(/password is required/i)).toBeVisible();
  });

  test('should show validation error for short password', async ({ page }) => {
    const resetToken = 'test-token-123456';
    await page.goto(`/reset-password?token=${resetToken}`);
    
    await page.getByLabel(/new password/i).fill('short');
    await page.getByLabel(/confirm.*password/i).fill('short');
    await page.getByRole('button', { name: /reset.*password/i }).click();
    
    await expect(page.getByText(/password must be at least 8 characters/i)).toBeVisible();
  });

  test('should show error when passwords do not match', async ({ page }) => {
    const resetToken = 'test-token-123456';
    await page.goto(`/reset-password?token=${resetToken}`);
    
    await page.getByLabel(/new password/i).fill('newpassword123');
    await page.getByLabel(/confirm.*password/i).fill('different123');
    await page.getByRole('button', { name: /reset.*password/i }).click();
    
    await expect(page.getByText(/passwords.*not.*match/i)).toBeVisible();
  });

  test('should successfully reset password with valid token', async ({ page }) => {
    const resetToken = 'test-token-123456';
    await page.goto(`/reset-password?token=${resetToken}`);
    
    await page.getByLabel(/new password/i).fill('newpassword123');
    await page.getByLabel(/confirm.*password/i).fill('newpassword123');
    await page.getByRole('button', { name: /reset.*password/i }).click();
    
    // Should show success message and redirect to login
    await expect(page.getByText(/password.*reset.*successfully/i)).toBeVisible();
    await expect(page).toHaveURL('/');
  });

  test('should show error for expired token', async ({ page }) => {
    const expiredToken = 'expired-token-123456';
    await page.goto(`/reset-password?token=${expiredToken}`);
    
    await page.getByLabel(/new password/i).fill('newpassword123');
    await page.getByLabel(/confirm.*password/i).fill('newpassword123');
    await page.getByRole('button', { name: /reset.*password/i }).click();
    
    await expect(page.getByText(/token.*expired.*invalid/i)).toBeVisible();
  });

  test('should show error for invalid token', async ({ page }) => {
    const invalidToken = 'invalid-token';
    await page.goto(`/reset-password?token=${invalidToken}`);
    
    await expect(page.getByText(/invalid.*token/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /request.*new.*link/i })).toBeVisible();
  });

  test('should be able to login with new password after reset', async ({ page }) => {
    // This assumes a full reset flow has been completed
    // In a real scenario, you'd use a test database and actual reset token
    
    // Go to login
    await page.goto('/');
    await page.getByLabel(/email/i).fill('admin@example.com');
    await page.getByLabel(/password/i).fill('newpassword123');
    await page.getByRole('button', { name: /sign in/i }).click();
    
    // Should successfully login with new password
    await expect(page).toHaveURL('/dashboard');
  });

  test('should not allow reusing the same reset token twice', async ({ page }) => {
    const resetToken = 'test-token-123456';
    
    // First reset
    await page.goto(`/reset-password?token=${resetToken}`);
    await page.getByLabel(/new password/i).fill('newpassword123');
    await page.getByLabel(/confirm.*password/i).fill('newpassword123');
    await page.getByRole('button', { name: /reset.*password/i }).click();
    
    await expect(page.getByText(/password.*reset.*successfully/i)).toBeVisible();
    
    // Try to use the same token again
    await page.goto(`/reset-password?token=${resetToken}`);
    await expect(page.getByText(/token.*already.*used.*invalid/i)).toBeVisible();
  });

  test('should show password strength indicator', async ({ page }) => {
    const resetToken = 'test-token-123456';
    await page.goto(`/reset-password?token=${resetToken}`);
    
    const passwordInput = page.getByLabel(/new password/i);
    
    // Weak password
    await passwordInput.fill('weak');
    await expect(page.getByText(/weak/i)).toBeVisible();
    
    // Medium password
    await passwordInput.fill('medium123');
    await expect(page.getByText(/medium/i)).toBeVisible();
    
    // Strong password
    await passwordInput.fill('Strong!Pass123');
    await expect(page.getByText(/strong/i)).toBeVisible();
  });

  test('should enforce password requirements', async ({ page }) => {
    const resetToken = 'test-token-123456';
    await page.goto(`/reset-password?token=${resetToken}`);
    
    // Display password requirements
    await expect(page.getByText(/at least 8 characters/i)).toBeVisible();
    await expect(page.getByText(/at least one.*uppercase/i)).toBeVisible();
    await expect(page.getByText(/at least one.*lowercase/i)).toBeVisible();
    await expect(page.getByText(/at least one.*number/i)).toBeVisible();
    
    // Try password without uppercase
    await page.getByLabel(/new password/i).fill('lowercase123');
    await page.getByLabel(/confirm.*password/i).fill('lowercase123');
    await page.getByRole('button', { name: /reset.*password/i }).click();
    
    await expect(page.getByText(/password must contain.*uppercase/i)).toBeVisible();
  });
});
