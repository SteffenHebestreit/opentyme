import { test, expect, Page } from '@playwright/test';

// Helper function to login
async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel(/email/i).fill('admin@example.com');
  await page.getByLabel(/password/i).fill('admin123');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('/dashboard');
}

test.describe('Invoice Workflows & Payment Tracking', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/invoices');
  });

  test('should generate invoice from time entries', async ({ page }) => {
    // Click generate invoice button
    await page.getByRole('button', { name: /generate.*from.*time/i }).click();
    
    // Should show time entry selection dialog
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/select time entries/i)).toBeVisible();
    
    // Select client/project filters
    await page.getByLabel(/client/i).selectOption({ index: 1 });
    await page.getByLabel(/date.*from/i).fill('2024-01-01');
    await page.getByLabel(/date.*to/i).fill('2024-01-31');
    
    // Click fetch entries
    await page.getByRole('button', { name: /fetch.*entries/i }).click();
    
    // Should show list of time entries
    await expect(page.getByRole('table')).toBeVisible();
    const rows = page.getByRole('row');
    const count = await rows.count();
    expect(count).toBeGreaterThan(1); // Header + at least one entry
    
    // Select all entries
    await page.getByRole('checkbox', { name: /select all/i }).check();
    
    // Should show total hours and amount
    await expect(page.getByText(/total.*hours/i)).toBeVisible();
    await expect(page.getByText(/total.*amount/i)).toBeVisible();
    
    // Generate invoice
    await page.getByRole('button', { name: /create invoice/i }).click();
    
    // Should navigate to invoice details
    await expect(page).toHaveURL(/\/invoices\/\d+/);
    await expect(page.getByText(/invoice.*draft/i)).toBeVisible();
  });

  test('should create manual invoice with line items', async ({ page }) => {
    await page.getByRole('button', { name: /create.*invoice/i }).click();
    
    // Fill invoice details
    await page.getByLabel(/client/i).selectOption({ index: 1 });
    await page.getByLabel(/invoice.*date/i).fill('2024-01-15');
    await page.getByLabel(/due.*date/i).fill('2024-02-15');
    
    // Add first line item
    await page.getByRole('button', { name: /add.*line.*item/i }).click();
    await page.getByLabel(/description/i).first().fill('Frontend Development');
    await page.getByLabel(/quantity/i).first().fill('40');
    await page.getByLabel(/rate/i).first().fill('85');
    
    // Should auto-calculate amount
    await expect(page.getByText(/3,400\.00/i)).toBeVisible(); // 40 * 85
    
    // Add second line item
    await page.getByRole('button', { name: /add.*line.*item/i }).click();
    await page.getByLabel(/description/i).last().fill('Backend Development');
    await page.getByLabel(/quantity/i).last().fill('30');
    await page.getByLabel(/rate/i).last().fill('95');
    
    // Should show updated total
    await expect(page.getByText(/total.*6,250\.00/i)).toBeVisible(); // 3400 + 2850
    
    // Add notes
    await page.getByLabel(/notes/i).fill('Thank you for your business!');
    
    // Create invoice
    await page.getByRole('button', { name: /create.*invoice/i }).click();
    
    await expect(page.getByText(/invoice.*created/i)).toBeVisible();
  });

  test('should remove line item from invoice', async ({ page }) => {
    await page.getByRole('button', { name: /create.*invoice/i }).click();
    
    await page.getByLabel(/client/i).selectOption({ index: 1 });
    
    // Add two line items
    await page.getByRole('button', { name: /add.*line.*item/i }).click();
    await page.getByLabel(/description/i).first().fill('Item 1');
    await page.getByLabel(/quantity/i).first().fill('10');
    await page.getByLabel(/rate/i).first().fill('100');
    
    await page.getByRole('button', { name: /add.*line.*item/i }).click();
    await page.getByLabel(/description/i).last().fill('Item 2');
    await page.getByLabel(/quantity/i).last().fill('5');
    await page.getByLabel(/rate/i).last().fill('50');
    
    // Should show total 1,250
    await expect(page.getByText(/1,250\.00/i)).toBeVisible();
    
    // Remove first item
    await page.getByRole('button', { name: /remove/i }).first().click();
    
    // Should show updated total 250
    await expect(page.getByText(/^250\.00$/i)).toBeVisible();
  });

  test('should transition invoice from draft to sent', async ({ page }) => {
    // Find first draft invoice
    const draftInvoice = page.getByRole('row').filter({ hasText: /draft/i }).first();
    await draftInvoice.click();
    
    // Should show invoice details
    await expect(page.getByRole('heading', { name: /invoice.*\d+/i })).toBeVisible();
    await expect(page.getByText(/status.*draft/i)).toBeVisible();
    
    // Mark as sent
    await page.getByRole('button', { name: /mark.*sent/i }).click();
    
    // Should show confirmation
    await expect(page.getByText(/mark.*invoice.*sent/i)).toBeVisible();
    await page.getByRole('button', { name: /confirm/i }).click();
    
    // Status should update
    await expect(page.getByText(/status.*sent/i)).toBeVisible();
    await expect(page.getByText(/sent.*date/i)).toBeVisible();
  });

  test('should record payment for invoice', async ({ page }) => {
    // Find first sent invoice
    const sentInvoice = page.getByRole('row').filter({ hasText: /sent/i }).first();
    await sentInvoice.click();
    
    // Click record payment
    await page.getByRole('button', { name: /record.*payment/i }).click();
    
    // Should show payment dialog
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/record payment/i)).toBeVisible();
    
    // Fill payment details
    await page.getByLabel(/amount/i).fill('1500.00');
    await page.getByLabel(/payment.*date/i).fill('2024-01-20');
    await page.getByLabel(/payment.*method/i).selectOption('bank_transfer');
    await page.getByLabel(/reference/i).fill('TXN-123456');
    await page.getByLabel(/notes/i).fill('Payment received via wire transfer');
    
    // Submit payment
    await page.getByRole('button', { name: /record/i }).click();
    
    // Should show success message
    await expect(page.getByText(/payment.*recorded/i)).toBeVisible();
    
    // Should update invoice status
    await expect(page.getByText(/status.*paid/i)).toBeVisible();
  });

  test('should record partial payment', async ({ page }) => {
    // Find invoice with amount $2000
    const invoice = page.getByRole('row').filter({ hasText: /2,000\.00/i }).first();
    await invoice.click();
    
    // Record first partial payment of $1000
    await page.getByRole('button', { name: /record.*payment/i }).click();
    await page.getByLabel(/amount/i).fill('1000.00');
    await page.getByLabel(/payment.*date/i).fill('2024-01-15');
    await page.getByLabel(/payment.*method/i).selectOption('credit_card');
    await page.getByRole('button', { name: /record/i }).click();
    
    // Status should be partially paid
    await expect(page.getByText(/status.*partially.*paid/i)).toBeVisible();
    await expect(page.getByText(/balance.*1,000\.00/i)).toBeVisible();
    
    // Record second payment of $1000
    await page.getByRole('button', { name: /record.*payment/i }).click();
    await page.getByLabel(/amount/i).fill('1000.00');
    await page.getByLabel(/payment.*date/i).fill('2024-01-25');
    await page.getByLabel(/payment.*method/i).selectOption('bank_transfer');
    await page.getByRole('button', { name: /record/i }).click();
    
    // Status should now be fully paid
    await expect(page.getByText(/status.*paid/i)).toBeVisible();
    await expect(page.getByText(/balance.*0\.00/i)).toBeVisible();
  });

  test('should show payment history', async ({ page }) => {
    // Open invoice with payments
    const paidInvoice = page.getByRole('row').filter({ hasText: /paid/i }).first();
    await paidInvoice.click();
    
    // Should show payments section
    await expect(page.getByRole('heading', { name: /payments/i })).toBeVisible();
    
    // Should list all payments
    const paymentRows = page.getByTestId('payment-list').getByRole('listitem');
    const count = await paymentRows.count();
    expect(count).toBeGreaterThan(0);
    
    // Each payment should show date, amount, method
    const firstPayment = paymentRows.first();
    await expect(firstPayment).toContainText(/\d{4}-\d{2}-\d{2}/); // Date
    await expect(firstPayment).toContainText(/\$[\d,]+\.\d{2}/); // Amount
    await expect(firstPayment).toContainText(/bank.*transfer|credit.*card|cash|check/i); // Method
  });

  test('should delete payment record', async ({ page }) => {
    // Open paid invoice
    const paidInvoice = page.getByRole('row').filter({ hasText: /paid/i }).first();
    await paidInvoice.click();
    
    // Click delete on a payment
    const deleteButton = page.getByTestId('payment-list').getByRole('button', { name: /delete/i }).first();
    await deleteButton.click();
    
    // Should show confirmation
    await expect(page.getByText(/delete.*payment.*record/i)).toBeVisible();
    await page.getByRole('button', { name: /confirm/i }).click();
    
    // Should show success message
    await expect(page.getByText(/payment.*deleted/i)).toBeVisible();
    
    // Invoice status should update if needed
    await expect(page.getByText(/status.*sent|partially.*paid/i)).toBeVisible();
  });

  test('should prevent overpayment', async ({ page }) => {
    // Find invoice with total $1000
    const invoice = page.getByRole('row').filter({ hasText: /1,000\.00/i }).first();
    await invoice.click();
    
    // Try to record payment of $1500 (more than invoice total)
    await page.getByRole('button', { name: /record.*payment/i }).click();
    await page.getByLabel(/amount/i).fill('1500.00');
    await page.getByRole('button', { name: /record/i }).click();
    
    // Should show validation error
    await expect(page.getByText(/payment.*exceeds.*invoice.*total/i)).toBeVisible();
  });

  test('should send invoice via email', async ({ page }) => {
    // Find draft invoice
    const invoice = page.getByRole('row').first();
    await invoice.click();
    
    // Click send email button
    await page.getByRole('button', { name: /send.*email/i }).click();
    
    // Should show email dialog
    await expect(page.getByRole('dialog')).toBeVisible();
    
    // Email fields should be pre-filled
    const emailInput = page.getByLabel(/to/i);
    const toEmail = await emailInput.inputValue();
    expect(toEmail).toContain('@'); // Should have client email
    
    await expect(page.getByLabel(/subject/i)).toHaveValue(/invoice/i);
    
    // Can customize message
    await page.getByLabel(/message/i).fill('Please find attached the invoice for our recent work.');
    
    // Send email
    await page.getByRole('button', { name: /send/i }).click();
    
    // Should show success message
    await expect(page.getByText(/invoice.*sent.*email/i)).toBeVisible();
    
    // Status should update to sent
    await expect(page.getByText(/status.*sent/i)).toBeVisible();
  });

  test('should download invoice as PDF', async ({ page }) => {
    // Find any invoice
    await page.getByRole('row').first().click();
    
    // Click download PDF button
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /download.*pdf/i }).click();
    const download = await downloadPromise;
    
    // Should download PDF file
    expect(download.suggestedFilename()).toMatch(/invoice.*\d+\.pdf/i);
  });

  test('should print invoice', async ({ page }) => {
    // Find any invoice
    await page.getByRole('row').first().click();
    
    // Listen for print dialog
    page.on('dialog', async dialog => {
      expect(dialog.type()).toBe('print');
      await dialog.accept();
    });
    
    // Click print button
    await page.getByRole('button', { name: /print/i }).click();
  });

  test('should apply discount to invoice', async ({ page }) => {
    await page.getByRole('button', { name: /create.*invoice/i }).click();
    
    await page.getByLabel(/client/i).selectOption({ index: 1 });
    
    // Add line item
    await page.getByRole('button', { name: /add.*line.*item/i }).click();
    await page.getByLabel(/description/i).fill('Consulting Services');
    await page.getByLabel(/quantity/i).fill('10');
    await page.getByLabel(/rate/i).fill('100');
    
    // Subtotal should be 1000
    await expect(page.getByText(/subtotal.*1,000\.00/i)).toBeVisible();
    
    // Apply 10% discount
    await page.getByLabel(/discount.*%/i).fill('10');
    
    // Should show discount amount
    await expect(page.getByText(/discount.*100\.00/i)).toBeVisible();
    
    // Total should be 900
    await expect(page.getByText(/total.*900\.00/i)).toBeVisible();
  });

  test('should apply tax to invoice', async ({ page }) => {
    await page.getByRole('button', { name: /create.*invoice/i }).click();
    
    await page.getByLabel(/client/i).selectOption({ index: 1 });
    
    // Add line item
    await page.getByRole('button', { name: /add.*line.*item/i }).click();
    await page.getByLabel(/description/i).fill('Development Services');
    await page.getByLabel(/quantity/i).fill('10');
    await page.getByLabel(/rate/i).fill('100');
    
    // Apply 8% tax
    await page.getByLabel(/tax.*%/i).fill('8');
    
    // Should show tax amount
    await expect(page.getByText(/tax.*80\.00/i)).toBeVisible();
    
    // Total should be 1080
    await expect(page.getByText(/total.*1,080\.00/i)).toBeVisible();
  });

  test('should apply both discount and tax', async ({ page }) => {
    await page.getByRole('button', { name: /create.*invoice/i }).click();
    
    await page.getByLabel(/client/i).selectOption({ index: 1 });
    
    // Add line item - subtotal 1000
    await page.getByRole('button', { name: /add.*line.*item/i }).click();
    await page.getByLabel(/description/i).fill('Services');
    await page.getByLabel(/quantity/i).fill('10');
    await page.getByLabel(/rate/i).fill('100');
    
    // Apply 10% discount = $100 off = $900
    await page.getByLabel(/discount.*%/i).fill('10');
    
    // Apply 8% tax on $900 = $72
    await page.getByLabel(/tax.*%/i).fill('8');
    
    // Total should be 972
    await expect(page.getByText(/total.*972\.00/i)).toBeVisible();
  });

  test('should filter invoices by status', async ({ page }) => {
    // Filter by paid status
    await page.getByLabel(/filter.*status/i).selectOption('paid');
    
    // Should show only paid invoices
    const rows = page.getByRole('row').filter({ hasText: /paid/i });
    const paidCount = await rows.count();
    expect(paidCount).toBeGreaterThan(0);
    
    // Should not show draft or sent invoices
    await expect(page.getByText(/draft/i)).not.toBeVisible();
  });

  test('should filter invoices by date range', async ({ page }) => {
    await page.getByLabel(/from.*date/i).fill('2024-01-01');
    await page.getByLabel(/to.*date/i).fill('2024-01-31');
    await page.getByRole('button', { name: /apply.*filter/i }).click();
    
    // Should show only invoices in date range
    await expect(page.getByText(/showing.*filtered.*results/i)).toBeVisible();
  });

  test('should filter invoices by client', async ({ page }) => {
    await page.getByLabel(/client/i).selectOption({ index: 1 });
    
    // Should show only invoices for selected client
    const clientName = await page.getByLabel(/client/i).locator('option:checked').textContent();
    const rows = page.getByRole('row');
    const count = await rows.count();
    
    for (let i = 1; i < count; i++) {
      await expect(rows.nth(i)).toContainText(clientName!);
    }
  });

  test('should show overdue invoices', async ({ page }) => {
    // Filter by overdue
    await page.getByLabel(/filter.*status/i).selectOption('overdue');
    
    // Should show only overdue invoices
    const rows = page.getByRole('row').filter({ hasText: /overdue/i });
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    
    // Each invoice should have due date in the past
    await expect(page.getByText(/past.*due/i)).toBeVisible();
  });

  test('should show invoice summary statistics', async ({ page }) => {
    // Should show dashboard summary
    await expect(page.getByText(/total.*outstanding/i)).toBeVisible();
    await expect(page.getByText(/overdue.*amount/i)).toBeVisible();
    await expect(page.getByText(/paid.*this.*month/i)).toBeVisible();
    
    // Should show amounts
    await expect(page.getByTestId('total-outstanding')).toContainText(/\$[\d,]+\.\d{2}/);
  });

  test('should duplicate invoice', async ({ page }) => {
    // Find any invoice
    await page.getByRole('row').first().click();
    
    // Click duplicate button
    await page.getByRole('button', { name: /duplicate/i }).click();
    
    // Should create new invoice with same details
    await expect(page.getByText(/invoice.*duplicated/i)).toBeVisible();
    await expect(page.getByText(/status.*draft/i)).toBeVisible();
    
    // Line items should be copied
    const lineItems = page.getByTestId('line-items').getByRole('row');
    const count = await lineItems.count();
    expect(count).toBeGreaterThan(1);
  });

  test('should void invoice', async ({ page }) => {
    // Find sent invoice
    const invoice = page.getByRole('row').filter({ hasText: /sent/i }).first();
    await invoice.click();
    
    // Click void button
    await page.getByRole('button', { name: /void/i }).click();
    
    // Should show confirmation
    await expect(page.getByText(/void.*invoice/i)).toBeVisible();
    await page.getByLabel(/reason/i).fill('Client cancelled project');
    await page.getByRole('button', { name: /confirm/i }).click();
    
    // Status should update
    await expect(page.getByText(/status.*void/i)).toBeVisible();
  });
});
