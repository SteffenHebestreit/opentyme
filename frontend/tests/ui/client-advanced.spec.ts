import { test, expect, Page } from '@playwright/test';

// Helper function to login
async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel(/email/i).fill('admin@example.com');
  await page.getByLabel(/password/i).fill('admin123');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('/dashboard');
}

test.describe('Advanced Client Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/clients');
  });

  test('should paginate client list', async ({ page }) => {
    // Assuming there are more than 10 clients
    await expect(page.getByRole('navigation', { name: /pagination/i })).toBeVisible();
    
    // Check first page
    await expect(page.getByText(/page 1 of/i)).toBeVisible();
    
    // Go to next page
    await page.getByRole('button', { name: /next/i }).click();
    await expect(page.getByText(/page 2 of/i)).toBeVisible();
    
    // Go to previous page
    await page.getByRole('button', { name: /previous/i }).click();
    await expect(page.getByText(/page 1 of/i)).toBeVisible();
  });

  test('should change page size', async ({ page }) => {
    const pageSizeSelect = page.getByLabel(/items per page/i);
    
    // Default should be 10
    await expect(pageSizeSelect).toHaveValue('10');
    
    // Change to 25
    await pageSizeSelect.selectOption('25');
    
    // Should show more items
    const rows = page.getByRole('row');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(10);
  });

  test('should search clients by name with debouncing', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search.*clients/i);
    
    // Type search query
    await searchInput.fill('Acme');
    
    // Wait for debounce (assuming 300ms)
    await page.waitForTimeout(400);
    
    // Should show only matching clients
    await expect(page.getByText(/acme/i)).toBeVisible();
    const allRows = page.getByRole('row');
    const count = await allRows.count();
    expect(count).toBeLessThan(5); // Assuming filtered results
  });

  test('should clear search filter', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search.*clients/i);
    
    // Apply filter
    await searchInput.fill('Acme');
    await page.waitForTimeout(400);
    
    // Clear filter
    await page.getByRole('button', { name: /clear.*filter/i }).click();
    await expect(searchInput).toHaveValue('');
    
    // Should show all clients again
    const allRows = page.getByRole('row');
    const count = await allRows.count();
    expect(count).toBeGreaterThan(5);
  });

  test('should filter by multiple criteria', async ({ page }) => {
    // Filter by status
    await page.getByLabel(/status/i).selectOption('active');
    
    // Filter by search term
    await page.getByPlaceholder(/search/i).fill('Corp');
    await page.waitForTimeout(400);
    
    // Should show only active clients with 'Corp' in name
    await expect(page.getByText(/active/i)).toBeVisible();
    await expect(page.getByText(/corp/i)).toBeVisible();
  });

  test('should sort clients by name ascending/descending', async ({ page }) => {
    const nameHeader = page.getByRole('columnheader', { name: /name/i });
    
    // Click to sort ascending
    await nameHeader.click();
    await expect(nameHeader).toContainText(/↑/); // Ascending indicator
    
    // Click again to sort descending
    await nameHeader.click();
    await expect(nameHeader).toContainText(/↓/); // Descending indicator
  });

  test('should sort clients by created date', async ({ page }) => {
    const dateHeader = page.getByRole('columnheader', { name: /created.*date/i });
    
    // Sort by created date descending (newest first)
    await dateHeader.click();
    await dateHeader.click(); // Second click for descending
    
    // Get first row date should be more recent than second row
    const rows = page.getByRole('row');
    const firstRowDate = await rows.nth(1).getByRole('cell').nth(3).textContent();
    const secondRowDate = await rows.nth(2).getByRole('cell').nth(3).textContent();
    
    expect(new Date(firstRowDate!).getTime()).toBeGreaterThanOrEqual(new Date(secondRowDate!).getTime());
  });

  test('should bulk select clients', async ({ page }) => {
    // Select all checkbox
    const selectAllCheckbox = page.getByRole('checkbox', { name: /select all/i });
    await selectAllCheckbox.check();
    
    // All client checkboxes should be checked
    const clientCheckboxes = page.getByRole('checkbox').filter({ hasNot: page.getByRole('checkbox', { name: /select all/i }) });
    const count = await clientCheckboxes.count();
    
    for (let i = 0; i < count; i++) {
      await expect(clientCheckboxes.nth(i)).toBeChecked();
    }
    
    // Should show bulk action toolbar
    await expect(page.getByText(/\d+ selected/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /bulk.*delete/i })).toBeVisible();
  });

  test('should perform bulk delete', async ({ page }) => {
    // Select first 3 clients
    const checkboxes = page.getByRole('checkbox').filter({ hasNot: page.getByRole('checkbox', { name: /select all/i }) });
    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();
    await checkboxes.nth(2).check();
    
    // Click bulk delete
    await page.getByRole('button', { name: /bulk.*delete/i }).click();
    
    // Confirm deletion
    await page.getByRole('button', { name: /confirm/i }).click();
    
    await expect(page.getByText(/3.*clients.*deleted/i)).toBeVisible();
  });

  test('should export clients to CSV', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /export.*csv/i }).click();
    const download = await downloadPromise;
    
    expect(download.suggestedFilename()).toContain('clients');
    expect(download.suggestedFilename()).toContain('.csv');
  });

  test('should show client details in modal', async ({ page }) => {
    // Click on first client row
    const firstClientRow = page.getByRole('row').nth(1);
    await firstClientRow.click();
    
    // Should open details modal
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: /client details/i })).toBeVisible();
    
    // Should show client information
    await expect(page.getByText(/email/i)).toBeVisible();
    await expect(page.getByText(/phone/i)).toBeVisible();
    await expect(page.getByText(/address/i)).toBeVisible();
    
    // Close modal
    await page.getByRole('button', { name: /close/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('should inline edit client status', async ({ page }) => {
    const firstRow = page.getByRole('row').nth(1);
    const statusCell = firstRow.getByRole('cell').nth(2); // Assuming status is 3rd column
    
    // Double-click to edit
    await statusCell.dblclick();
    
    // Should show dropdown
    const statusSelect = firstRow.getByRole('combobox');
    await expect(statusSelect).toBeVisible();
    
    // Change status
    await statusSelect.selectOption('inactive');
    
    // Press Enter to save
    await page.keyboard.press('Enter');
    
    await expect(page.getByText(/client.*updated/i)).toBeVisible();
    await expect(statusCell).toContainText(/inactive/i);
  });

  test('should cancel edit on Escape key', async ({ page }) => {
    const firstRow = page.getByRole('row').nth(1);
    const nameCell = firstRow.getByRole('cell').nth(0);
    const originalName = await nameCell.textContent();
    
    // Double-click to edit
    await nameCell.dblclick();
    
    // Modify name
    const nameInput = firstRow.getByRole('textbox');
    await nameInput.fill('Modified Name');
    
    // Press Escape to cancel
    await page.keyboard.press('Escape');
    
    // Should revert to original name
    await expect(nameCell).toContainText(originalName!);
  });

  test('should show empty state when no clients exist', async ({ page }) => {
    // Delete all clients or apply filter that returns no results
    await page.getByPlaceholder(/search/i).fill('NonExistentClient12345');
    await page.waitForTimeout(400);
    
    // Should show empty state
    await expect(page.getByText(/no clients found/i)).toBeVisible();
    await expect(page.getByText(/try adjusting your filters/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /clear filters/i })).toBeVisible();
  });

  test('should maintain filter state after navigation', async ({ page }) => {
    // Apply filters
    await page.getByLabel(/status/i).selectOption('active');
    await page.getByPlaceholder(/search/i).fill('Corp');
    await page.waitForTimeout(400);
    
    // Navigate away
    await page.goto('/projects');
    await expect(page).toHaveURL('/projects');
    
    // Navigate back
    await page.goto('/clients');
    
    // Filters should be maintained
    await expect(page.getByLabel(/status/i)).toHaveValue('active');
    await expect(page.getByPlaceholder(/search/i)).toHaveValue('Corp');
  });

  test('should validate email format when creating client', async ({ page }) => {
    await page.getByRole('button', { name: /add.*client/i }).click();
    
    await page.getByLabel(/client.*name/i).fill('Test Client');
    await page.getByLabel(/email/i).fill('invalid-email-format');
    
    await page.getByRole('button', { name: /create.*client/i }).click();
    
    await expect(page.getByText(/please enter a valid email/i)).toBeVisible();
  });

  test('should validate phone number format', async ({ page }) => {
    await page.getByRole('button', { name: /add.*client/i }).click();
    
    await page.getByLabel(/client.*name/i).fill('Test Client');
    await page.getByLabel(/email/i).fill('test@example.com');
    await page.getByLabel(/phone/i).fill('invalid-phone');
    
    await page.getByRole('button', { name: /create.*client/i }).click();
    
    await expect(page.getByText(/please enter a valid phone number/i)).toBeVisible();
  });

  test('should show character count for notes field', async ({ page }) => {
    await page.getByRole('button', { name: /add.*client/i }).click();
    
    const notesField = page.getByLabel(/notes/i);
    await notesField.fill('This is a test note');
    
    // Should show character count
    await expect(page.getByText(/19.*\/ 500/i)).toBeVisible(); // Assuming 500 char limit
  });

  test('should prevent XSS in client name', async ({ page }) => {
    await page.getByRole('button', { name: /add.*client/i }).click();
    
    const maliciousName = '<script>alert("XSS")</script>';
    await page.getByLabel(/client.*name/i).fill(maliciousName);
    await page.getByLabel(/email/i).fill('test@example.com');
    await page.getByRole('button', { name: /create.*client/i }).click();
    
    // Should sanitize and show as plain text
    await expect(page.getByText(/script.*alert/i)).not.toBeVisible();
    // Name should be escaped or rejected
  });
});
