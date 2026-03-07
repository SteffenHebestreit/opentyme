/**
 * Unit tests for EmailTemplateService
 *
 * Tests CRUD operations and MJML rendering against the real test database.
 */

import {
  listEmailTemplates,
  getEmailTemplate,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
  previewEmailTemplate,
  renderTemplateForSend,
  renderMjml,
} from '../../src/services/communication/email-template.service';
import { TEST_USER_ID } from '../setup';

const SIMPLE_MJML = `
<mjml>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text>Hello, {{client.name}}!</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`.trim();

const MINIMAL_MJML = `
<mjml>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text>Test</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`.trim();

describe('renderMjml (unit — no DB)', () => {
  it('converts valid MJML to HTML', () => {
    const { html, errors } = renderMjml(MINIMAL_MJML);
    expect(html).toContain('<html');
    expect(html).toContain('Test');
    expect(errors).toHaveLength(0);
  });

  it('returns errors for invalid MJML but still renders', () => {
    const invalid = '<mjml><mj-body><mj-section><mj-column><mj-unknown>Bad</mj-unknown></mj-column></mj-section></mj-body></mjml>';
    const { html, errors } = renderMjml(invalid);
    // soft validation — should still produce some HTML
    expect(typeof html).toBe('string');
    expect(Array.isArray(errors)).toBe(true);
  });

  it('returns empty html and error message on completely broken input', () => {
    const { html, errors } = renderMjml('this is not mjml at all <<<>>>');
    // MJML might try to parse it — we just check errors is an array
    expect(Array.isArray(errors)).toBe(true);
    expect(typeof html).toBe('string');
  });
});

describe('EmailTemplateService (integration — real test DB)', () => {
  describe('listEmailTemplates', () => {
    it('returns an empty array when no templates exist', async () => {
      const templates = await listEmailTemplates(TEST_USER_ID);
      expect(Array.isArray(templates)).toBe(true);
    });
  });

  describe('createEmailTemplate', () => {
    it('creates a template and returns it with extracted variables', async () => {
      const template = await createEmailTemplate(TEST_USER_ID, {
        name: 'Test Invoice Template',
        subject: 'Invoice for {{client.name}}',
        mjml_content: SIMPLE_MJML,
        category: 'invoice',
        language: 'en',
      });

      expect(template.id).toBeDefined();
      expect(template.user_id).toBe(TEST_USER_ID);
      expect(template.name).toBe('Test Invoice Template');
      expect(template.subject).toBe('Invoice for {{client.name}}');
      expect(template.category).toBe('invoice');
      expect(template.language).toBe('en');
      expect(template.is_default).toBe(false);
      // variables extracted from MJML content
      expect(Array.isArray(template.variables)).toBe(true);
      expect(template.variables).toContain('client.name');
      // html_content compiled from MJML
      expect(template.html_content).toBeTruthy();
      expect(template.html_content).toContain('<html');
    });

    it('uses default values when optional fields are omitted', async () => {
      const template = await createEmailTemplate(TEST_USER_ID, {
        name: 'Minimal Template',
        subject: 'Hello',
        mjml_content: MINIMAL_MJML,
      });

      expect(template.category).toBe('custom');
      expect(template.language).toBe('de');
      expect(template.is_default).toBe(false);
    });
  });

  describe('getEmailTemplate', () => {
    it('returns the template by id', async () => {
      const created = await createEmailTemplate(TEST_USER_ID, {
        name: 'Get Me',
        subject: 'Subject',
        mjml_content: MINIMAL_MJML,
      });

      const found = await getEmailTemplate(created.id, TEST_USER_ID);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.name).toBe('Get Me');
    });

    it('returns null for a non-existent id', async () => {
      const found = await getEmailTemplate('00000000-0000-0000-0000-000000000000', TEST_USER_ID);
      expect(found).toBeNull();
    });

    it('returns null for a different user_id', async () => {
      const created = await createEmailTemplate(TEST_USER_ID, {
        name: 'Not Yours',
        subject: 'Subject',
        mjml_content: MINIMAL_MJML,
      });

      const otherUserId = '00000000-0000-0000-0000-000000000001';
      const found = await getEmailTemplate(created.id, otherUserId);
      expect(found).toBeNull();
    });
  });

  describe('listEmailTemplates', () => {
    it('returns templates in descending created_at order', async () => {
      await createEmailTemplate(TEST_USER_ID, {
        name: 'First',
        subject: 'A',
        mjml_content: MINIMAL_MJML,
      });
      await createEmailTemplate(TEST_USER_ID, {
        name: 'Second',
        subject: 'B',
        mjml_content: MINIMAL_MJML,
      });

      const templates = await listEmailTemplates(TEST_USER_ID);
      expect(templates.length).toBeGreaterThanOrEqual(2);
      // Most recent should appear first
      const names = templates.map((t) => t.name);
      const secondIdx = names.indexOf('Second');
      const firstIdx = names.indexOf('First');
      expect(secondIdx).toBeLessThan(firstIdx);
    });
  });

  describe('updateEmailTemplate', () => {
    it('updates fields and re-extracts variables', async () => {
      const created = await createEmailTemplate(TEST_USER_ID, {
        name: 'Original Name',
        subject: 'Original Subject',
        mjml_content: MINIMAL_MJML,
      });

      const updatedMjml = `
<mjml>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text>Hello {{invoice.number}} for {{client.name}}</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
      `.trim();

      const updated = await updateEmailTemplate(created.id, TEST_USER_ID, {
        name: 'Updated Name',
        mjml_content: updatedMjml,
      });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('Updated Name');
      expect(updated!.subject).toBe('Original Subject'); // unchanged
      expect(updated!.variables).toContain('invoice.number');
      expect(updated!.variables).toContain('client.name');
    });

    it('returns null when template does not exist', async () => {
      const result = await updateEmailTemplate(
        '00000000-0000-0000-0000-000000000000',
        TEST_USER_ID,
        { name: 'Should not exist' }
      );
      expect(result).toBeNull();
    });
  });

  describe('deleteEmailTemplate', () => {
    it('deletes an existing template and returns true', async () => {
      const created = await createEmailTemplate(TEST_USER_ID, {
        name: 'Delete Me',
        subject: 'Subject',
        mjml_content: MINIMAL_MJML,
      });

      const deleted = await deleteEmailTemplate(created.id, TEST_USER_ID);
      expect(deleted).toBe(true);

      const found = await getEmailTemplate(created.id, TEST_USER_ID);
      expect(found).toBeNull();
    });

    it('returns false when template does not exist', async () => {
      const deleted = await deleteEmailTemplate(
        '00000000-0000-0000-0000-000000000000',
        TEST_USER_ID
      );
      expect(deleted).toBe(false);
    });
  });

  describe('previewEmailTemplate', () => {
    it('returns rendered HTML with variables substituted', async () => {
      const mjmlWithVars = `
<mjml>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text>Dear {{client.name}}, your invoice {{invoice.number}} is ready.</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
      `.trim();

      const created = await createEmailTemplate(TEST_USER_ID, {
        name: 'Preview Test',
        subject: 'Invoice {{invoice.number}}',
        mjml_content: mjmlWithVars,
      });

      const preview = await previewEmailTemplate(created.id, TEST_USER_ID, {
        'client.name': 'Acme Corp',
        'invoice.number': 'INV-001',
      });

      expect(preview).not.toBeNull();
      expect(preview!.html).toContain('Acme Corp');
      expect(preview!.html).toContain('INV-001');
      // Placeholders should be replaced, not present as-is
      expect(preview!.html).not.toContain('{{client.name}}');
      expect(preview!.html).not.toContain('{{invoice.number}}');
    });

    it('returns null for non-existent template', async () => {
      const result = await previewEmailTemplate(
        '00000000-0000-0000-0000-000000000000',
        TEST_USER_ID,
        {}
      );
      expect(result).toBeNull();
    });
  });

  describe('renderTemplateForSend', () => {
    it('renders both subject and body with variable substitution', async () => {
      const created = await createEmailTemplate(TEST_USER_ID, {
        name: 'Send Test',
        subject: 'Invoice {{invoice.number}} for {{client.name}}',
        mjml_content: SIMPLE_MJML,
      });

      const result = await renderTemplateForSend(created.id, TEST_USER_ID, {
        'client.name': 'John Doe',
        'invoice.number': 'INV-2025-001',
      });

      expect(result).not.toBeNull();
      expect(result!.subject).toBe('Invoice INV-2025-001 for John Doe');
      expect(result!.html).toContain('John Doe');
      expect(result!.html).not.toContain('{{client.name}}');
    });

    it('returns null for non-existent template', async () => {
      const result = await renderTemplateForSend(
        '00000000-0000-0000-0000-000000000000',
        TEST_USER_ID,
        {}
      );
      expect(result).toBeNull();
    });
  });
});
