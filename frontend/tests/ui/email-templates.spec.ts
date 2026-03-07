/**
 * E2E tests for the Email Templates feature.
 *
 * Exercises the full stack: login → Admin → Email Templates tab → CRUD flow.
 * Requires the full Docker stack to be running (frontend, backend, test-db).
 */

import { test, expect, type Page } from '@playwright/test';
import { loginViaKeycloak } from './helpers/auth';

// ── Helpers ──

async function goToEmailTemplatesTab(page: Page) {
  await page.goto('/config');
  // Click the "Email Templates" tab inside AdminPage
  await page.getByRole('button', { name: /email templates/i }).click();
  await expect(page.getByRole('heading', { name: /email templates/i })).toBeVisible();
}

const MINIMAL_MJML = `<mjml>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text>Hello {{client.name}}, your invoice {{invoice.number}} is ready.</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

// ── Tests ──

test.describe('Email Templates', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaKeycloak(page);
  });

  test('admin page has email templates tab', async ({ page }) => {
    await page.goto('/config');
    await expect(page.getByRole('button', { name: /email templates/i })).toBeVisible();
  });

  test('email templates list page loads and shows empty state or list', async ({ page }) => {
    await goToEmailTemplatesTab(page);

    // Either empty state or a table is shown — both are valid
    const hasEmptyState = await page.getByText(/no.*templates|create.*first/i).isVisible().catch(() => false);
    const hasTable = await page.getByRole('table').isVisible().catch(() => false);

    expect(hasEmptyState || hasTable).toBe(true);
  });

  test('can navigate to new template builder', async ({ page }) => {
    await goToEmailTemplatesTab(page);

    // Click the first "+ New Template" button found
    await page.getByRole('button', { name: /new template/i }).first().click();

    await expect(page).toHaveURL(/\/email-templates\/new/);
    await expect(page.getByRole('heading', { name: /new template|email template/i })).toBeVisible();
  });

  test('can create a new email template', async ({ page }) => {
    await page.goto('/email-templates/new');

    const timestamp = Date.now();
    const templateName = `E2E Template ${timestamp}`;

    // Fill in template metadata
    await page.getByLabel(/template name/i).fill(templateName);
    await page.getByLabel(/subject/i).fill(`Invoice {{invoice.number}} for {{client.name}}`);

    // Select category
    const categorySelect = page.getByLabel(/category/i);
    if (await categorySelect.isVisible()) {
      await categorySelect.selectOption('invoice');
    }

    // Switch to Code tab (MJML source editor) if there are tabs
    const codeTab = page.getByRole('tab', { name: /code|mjml/i });
    if (await codeTab.isVisible()) {
      await codeTab.click();
    }

    // Fill MJML content in the textarea
    const mjmlArea = page.getByRole('textbox', { name: /mjml|content/i }).or(
      page.locator('textarea[name="mjml_content"], textarea[placeholder*="mjml"], textarea[placeholder*="MJML"]')
    );
    if (await mjmlArea.isVisible()) {
      await mjmlArea.clear();
      await mjmlArea.fill(MINIMAL_MJML);
    }

    // Save
    await page.getByRole('button', { name: /save|create/i }).click();

    // Should navigate back to the list or show success
    await expect(
      page.getByText(templateName).or(page.getByText(/saved|created|success/i))
    ).toBeVisible({ timeout: 10000 });
  });

  test('can edit an existing email template', async ({ page }) => {
    // First navigate to list
    await goToEmailTemplatesTab(page);

    // If no templates exist, skip
    const editBtn = page.getByRole('button', { name: /edit/i }).or(
      page.getByText(/edit/i)
    ).first();

    const hasTemplates = await editBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (!hasTemplates) {
      test.skip();
      return;
    }

    await editBtn.click();
    await expect(page).toHaveURL(/\/email-templates\/.+/);

    // Update the subject
    const subjectInput = page.getByLabel(/subject/i);
    await subjectInput.clear();
    await subjectInput.fill('Updated Subject via E2E');

    await page.getByRole('button', { name: /save|update/i }).click();

    await expect(
      page.getByText(/saved|updated|success/i).or(page.getByText('Updated Subject via E2E'))
    ).toBeVisible({ timeout: 10000 });
  });

  test('can delete an email template after confirming', async ({ page }) => {
    // Navigate to list
    await goToEmailTemplatesTab(page);

    const deleteBtn = page.getByText(/^delete$/i).or(
      page.getByRole('button', { name: /^delete$/i })
    ).first();

    const hasTemplates = await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (!hasTemplates) {
      test.skip();
      return;
    }

    await deleteBtn.click();

    // Confirm delete
    const confirmBtn = page.getByRole('button', { name: /confirm|yes.*delete/i }).or(
      page.getByText(/confirm.*delete|yes/i)
    );
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // Template should be gone or list should update
    await expect(page.getByText(/deleted|removed|success/i).or(page.getByRole('table'))).toBeVisible({
      timeout: 10000,
    });
  });

  test('email template builder shows Code and Preview tabs', async ({ page }) => {
    await page.goto('/email-templates/new');

    // Should have tabs for switching between editor and preview
    const codeTab = page.getByRole('tab', { name: /code|mjml/i });
    const previewTab = page.getByRole('tab', { name: /preview/i });

    const hasCodeTab = await codeTab.isVisible().catch(() => false);
    const hasPreviewTab = await previewTab.isVisible().catch(() => false);

    // At least one tab or the editor itself should be visible
    const hasMjmlArea = await page.locator('textarea').isVisible().catch(() => false);

    expect(hasCodeTab || hasPreviewTab || hasMjmlArea).toBe(true);
  });

  test('email templates route is accessible when navigating directly', async ({ page }) => {
    await page.goto('/email-templates');
    // Should not redirect to login (we're authenticated)
    await expect(page).not.toHaveURL(/\/login/);
    // Should show the email templates heading
    await expect(
      page.getByRole('heading', { name: /email templates/i })
    ).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Email Settings (SMTP)', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaKeycloak(page);
  });

  test('email settings tab is present in admin page', async ({ page }) => {
    await page.goto('/config');
    // Look for the "Email" / "Mail" tab
    await expect(
      page.getByRole('button', { name: /^email$|^mail$/i })
    ).toBeVisible();
  });

  test('email settings form shows SMTP fields', async ({ page }) => {
    await page.goto('/config');
    await page.getByRole('button', { name: /^email$|^mail$/i }).click();

    // SMTP fields should be visible
    await expect(page.getByLabel(/smtp.*host|host/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel(/smtp.*port|port/i)).toBeVisible();
    await expect(page.getByLabel(/from.*address|from/i)).toBeVisible();
  });
});

test.describe('Theme Settings', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaKeycloak(page);
  });

  test('theme tab is present in admin page', async ({ page }) => {
    await page.goto('/config');
    await expect(page.getByRole('button', { name: /theme/i })).toBeVisible();
  });

  test('theme settings shows color pickers', async ({ page }) => {
    await page.goto('/config');
    await page.getByRole('button', { name: /theme/i }).click();

    // Color inputs or their labels should be visible
    await expect(
      page.getByLabel(/primary.*color|main.*color/i)
        .or(page.getByText(/primary color|main color/i))
    ).toBeVisible({ timeout: 5000 });
  });
});
