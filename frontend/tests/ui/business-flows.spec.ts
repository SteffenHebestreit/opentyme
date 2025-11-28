import { test, expect } from '@playwright/test';

// Helper function to login
async function login(page: any) {
  await page.goto('/');
  await page.getByLabel(/email/i).fill('admin@example.com');
  await page.getByLabel(/password/i).fill('admin123');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('/dashboard');
}

test.describe('Client Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/clients');
  });

  test('should display clients list page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /clients/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /add.*client/i })).toBeVisible();
    await expect(page.getByPlaceholder(/search.*clients/i)).toBeVisible();
  });

  test('should open client creation form', async ({ page }) => {
    await page.getByRole('button', { name: /add.*client/i }).click();
    
    await expect(page.getByRole('heading', { name: /new client/i })).toBeVisible();
    await expect(page.getByLabel(/client.*name/i)).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/phone/i)).toBeVisible();
    await expect(page.getByLabel(/address/i)).toBeVisible();
  });

  test('should create new client successfully', async ({ page }) => {
    await page.getByRole('button', { name: /add.*client/i }).click();
    
    const timestamp = Date.now();
    const clientName = `Test Client ${timestamp}`;
    
    await page.getByLabel(/client.*name/i).fill(clientName);
    await page.getByLabel(/email/i).fill(`client${timestamp}@example.com`);
    await page.getByLabel(/phone/i).fill('+1-555-0123');
    await page.getByLabel(/address/i).fill('123 Business Street');
    await page.getByLabel(/notes/i).fill('Test client created via E2E test');
    
    await page.getByRole('button', { name: /create.*client/i }).click();
    
    // Should see success message and return to client list
    await expect(page.getByText(/client.*created.*successfully/i)).toBeVisible();
    await expect(page.getByText(clientName)).toBeVisible();
  });

  test('should show validation errors for empty client form', async ({ page }) => {
    await page.getByRole('button', { name: /add.*client/i }).click();
    await page.getByRole('button', { name: /create.*client/i }).click();
    
    await expect(page.getByText(/client name is required/i)).toBeVisible();
    await expect(page.getByText(/email is required/i)).toBeVisible();
  });

  test('should search clients by name', async ({ page }) => {
    // Assuming there are clients in the system
    const searchInput = page.getByPlaceholder(/search.*clients/i);
    await searchInput.fill('Acme');
    
    // Should filter clients containing 'Acme'
    await expect(page.getByText(/acme/i)).toBeVisible();
  });

  test('should edit existing client', async ({ page }) => {
    // Find first client and click edit
    const editButton = page.getByRole('button', { name: /edit/i }).first();
    await editButton.click();
    
    await expect(page.getByRole('heading', { name: /edit client/i })).toBeVisible();
    
    // Update client name
    const nameInput = page.getByLabel(/client.*name/i);
    await nameInput.clear();
    await nameInput.fill('Updated Client Name');
    
    await page.getByRole('button', { name: /update.*client/i }).click();
    
    await expect(page.getByText(/client.*updated.*successfully/i)).toBeVisible();
    await expect(page.getByText('Updated Client Name')).toBeVisible();
  });

  test('should delete client with confirmation', async ({ page }) => {
    // Click delete button on first client
    const deleteButton = page.getByRole('button', { name: /delete/i }).first();
    await deleteButton.click();
    
    // Should show confirmation dialog
    await expect(page.getByText(/are you sure.*delete/i)).toBeVisible();
    
    // Confirm deletion
    await page.getByRole('button', { name: /confirm/i }).click();
    
    await expect(page.getByText(/client.*deleted.*successfully/i)).toBeVisible();
  });

  test('should filter clients by status', async ({ page }) => {
    const statusFilter = page.getByLabel(/filter.*status/i);
    await statusFilter.selectOption('active');
    
    // Should show only active clients
    const statusBadges = page.getByText(/active/i);
    await expect(statusBadges.first()).toBeVisible();
  });
});

test.describe('Project Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/projects');
  });

  test('should display projects list page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /projects/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /add.*project/i })).toBeVisible();
    await expect(page.getByPlaceholder(/search.*projects/i)).toBeVisible();
  });

  test('should create new project successfully', async ({ page }) => {
    await page.getByRole('button', { name: /add.*project/i }).click();
    
    const timestamp = Date.now();
    const projectName = `Test Project ${timestamp}`;
    
    await page.getByLabel(/project.*name/i).fill(projectName);
    await page.getByLabel(/description/i).fill('E2E test project description');
    await page.getByLabel(/client/i).selectOption({ index: 1 }); // Select first available client
    await page.getByLabel(/status/i).selectOption('active');
    await page.getByLabel(/start.*date/i).fill('2024-01-01');
    await page.getByLabel(/hourly.*rate/i).fill('85');
    
    await page.getByRole('button', { name: /create.*project/i }).click();
    
    await expect(page.getByText(/project.*created.*successfully/i)).toBeVisible();
    await expect(page.getByText(projectName)).toBeVisible();
  });

  test('should show validation errors for empty project form', async ({ page }) => {
    await page.getByRole('button', { name: /add.*project/i }).click();
    await page.getByRole('button', { name: /create.*project/i }).click();
    
    await expect(page.getByText(/project name is required/i)).toBeVisible();
    await expect(page.getByText(/client is required/i)).toBeVisible();
    await expect(page.getByText(/start date is required/i)).toBeVisible();
  });

  test('should filter projects by client', async ({ page }) => {
    const clientFilter = page.getByLabel(/filter.*client/i);
    await clientFilter.selectOption({ index: 1 });
    
    // Should show only projects for selected client
    await expect(page.getByText(/filtered.*results/i)).toBeVisible();
  });

  test('should update project status', async ({ page }) => {
    // Find first project and change status
    const statusSelect = page.getByRole('combobox').first();
    await statusSelect.selectOption('completed');
    
    // Should show success message
    await expect(page.getByText(/project.*status.*updated/i)).toBeVisible();
  });

  test('should navigate to project details', async ({ page }) => {
    // Click on first project name
    const projectLink = page.getByRole('link').first();
    await projectLink.click();
    
    // Should navigate to project details page
    await expect(page).toHaveURL(/\/projects\/\d+/);
    await expect(page.getByText(/project.*details/i)).toBeVisible();
  });
});

test.describe('Time Tracking', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/time-entries');
  });

  test('should display time entries page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /time.*entries/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /add.*entry/i })).toBeVisible();
  });

  test('should create new time entry', async ({ page }) => {
    await page.getByRole('button', { name: /add.*entry/i }).click();
    
    await page.getByLabel(/project/i).selectOption({ index: 1 });
    await page.getByLabel(/description/i).fill('Working on frontend components');
    await page.getByLabel(/hours/i).fill('8');
    await page.getByLabel(/date/i).fill('2024-01-15');
    
    await page.getByRole('button', { name: /save.*entry/i }).click();
    
    await expect(page.getByText(/time.*entry.*created/i)).toBeVisible();
  });

  test('should show validation error for invalid hours', async ({ page }) => {
    await page.getByRole('button', { name: /add.*entry/i }).click();
    
    await page.getByLabel(/project/i).selectOption({ index: 1 });
    await page.getByLabel(/hours/i).fill('25'); // More than 24 hours
    
    await page.getByRole('button', { name: /save.*entry/i }).click();
    
    await expect(page.getByText(/hours.*cannot.*exceed.*24/i)).toBeVisible();
  });

  test('should filter time entries by date range', async ({ page }) => {
    await page.getByLabel(/start.*date/i).fill('2024-01-01');
    await page.getByLabel(/end.*date/i).fill('2024-01-31');
    await page.getByRole('button', { name: /filter/i }).click();
    
    // Should show filtered results
    await expect(page.getByText(/filtered.*entries/i)).toBeVisible();
  });

  test('should display total hours summary', async ({ page }) => {
    // Should show summary statistics
    await expect(page.getByText(/total.*hours/i)).toBeVisible();
    await expect(page.getByText(/this.*week/i)).toBeVisible();
    await expect(page.getByText(/this.*month/i)).toBeVisible();
  });
});

test.describe('Invoice Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/invoices');
  });

  test('should display invoices page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /invoices/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /create.*invoice/i })).toBeVisible();
  });

  test('should create new invoice', async ({ page }) => {
    await page.getByRole('button', { name: /create.*invoice/i }).click();
    
    await page.getByLabel(/client/i).selectOption({ index: 1 });
    await page.getByLabel(/project/i).selectOption({ index: 1 });
    await page.getByLabel(/due.*date/i).fill('2024-02-15');
    
    // Add invoice items
    await page.getByRole('button', { name: /add.*item/i }).click();
    await page.getByLabel(/description/i).fill('Frontend Development');
    await page.getByLabel(/quantity/i).fill('40');
    await page.getByLabel(/rate/i).fill('85');
    
    await page.getByRole('button', { name: /create.*invoice/i }).click();
    
    await expect(page.getByText(/invoice.*created.*successfully/i)).toBeVisible();
  });

  test('should mark invoice as sent', async ({ page }) => {
    // Find first draft invoice and mark as sent
    const sendButton = page.getByRole('button', { name: /send/i }).first();
    await sendButton.click();
    
    await expect(page.getByText(/invoice.*sent.*successfully/i)).toBeVisible();
  });

  test('should generate invoice PDF', async ({ page }) => {
    // Click PDF button on first invoice
    const pdfButton = page.getByRole('button', { name: /pdf/i }).first();
    
    // Listen for download
    const downloadPromise = page.waitForEvent('download');
    await pdfButton.click();
    const download = await downloadPromise;
    
    expect(download.suggestedFilename()).toContain('.pdf');
  });

  test('should filter invoices by status', async ({ page }) => {
    await page.getByLabel(/filter.*status/i).selectOption('paid');
    
    // Should show only paid invoices
    await expect(page.getByText(/paid/i).first()).toBeVisible();
  });
});