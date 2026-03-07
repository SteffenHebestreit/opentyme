/**
 * Unit tests for InvoiceTextTemplateService
 *
 * Tests CRUD operations and business logic (default management, filtering)
 * against the real test database.
 */

import { InvoiceTextTemplateService } from '../../src/services/financial/invoice-text-template.service';
import { TEST_USER_ID } from '../setup';

const service = new InvoiceTextTemplateService();

// ── Helpers ────────────────────────────────────────────────────────────────

function base(overrides: Record<string, unknown> = {}) {
  return {
    user_id: TEST_USER_ID,
    name: 'Test Template',
    category: 'payment_terms' as const,
    content: 'Payment is due within 30 days of the invoice date.',
    language: 'en',
    is_default: false,
    is_active: true,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('InvoiceTextTemplateService', () => {

  describe('create', () => {
    it('creates a template and returns it with all fields', async () => {
      const t = await service.create(base({ name: 'Create Test' }));

      expect(t.id).toBeDefined();
      expect(t.user_id).toBe(TEST_USER_ID);
      expect(t.name).toBe('Create Test');
      expect(t.category).toBe('payment_terms');
      expect(t.content).toBe('Payment is due within 30 days of the invoice date.');
      expect(t.language).toBe('en');
      expect(t.is_default).toBe(false);
      expect(t.is_active).toBe(true);
      expect(t.sort_order).toBe(0);
      expect(t.created_at).toBeDefined();
      expect(t.updated_at).toBeDefined();
    });

    it('defaults language to "en" when omitted', async () => {
      const t = await service.create({
        user_id: TEST_USER_ID,
        name: 'Lang Default',
        category: 'footer',
        content: 'Footer text',
      });
      expect(t.language).toBe('en');
    });

    it('defaults is_active to true and is_default to false when omitted', async () => {
      const t = await service.create({
        user_id: TEST_USER_ID,
        name: 'Flag Defaults',
        category: 'header',
        content: 'Header text',
      });
      expect(t.is_active).toBe(true);
      expect(t.is_default).toBe(false);
    });

    it('setting is_default unsets the previous default in the same category', async () => {
      // Create first default
      const first = await service.create(base({
        name: 'First Default',
        category: 'tax_exemption',
        is_default: true,
      }));
      expect(first.is_default).toBe(true);

      // Create second default in same category → first should be unset
      const second = await service.create(base({
        name: 'Second Default',
        category: 'tax_exemption',
        is_default: true,
      }));
      expect(second.is_default).toBe(true);

      const reloaded = await service.findById(first.id, TEST_USER_ID);
      expect(reloaded!.is_default).toBe(false);
    });
  });

  describe('findAllByUser', () => {
    it('returns all templates for the user', async () => {
      await service.create(base({ name: 'Find All A', category: 'footer' }));
      await service.create(base({ name: 'Find All B', category: 'footer' }));

      const all = await service.findAllByUser(TEST_USER_ID);
      expect(all.length).toBeGreaterThanOrEqual(2);
      const names = all.map(t => t.name);
      expect(names).toContain('Find All A');
      expect(names).toContain('Find All B');
    });

    it('filters by category', async () => {
      await service.create(base({ name: 'Cat Legal', category: 'legal_notice' }));
      await service.create(base({ name: 'Cat Header', category: 'header' }));

      const legalOnly = await service.findAllByUser(TEST_USER_ID, 'legal_notice');
      const hasLegal = legalOnly.some(t => t.name === 'Cat Legal');
      const hasHeader = legalOnly.some(t => t.name === 'Cat Header');

      expect(hasLegal).toBe(true);
      expect(hasHeader).toBe(false);
    });

    it('filters inactive templates when activeOnly is true', async () => {
      await service.create(base({ name: 'Active One', is_active: true, category: 'custom' }));
      await service.create(base({ name: 'Inactive One', is_active: false, category: 'custom' }));

      const activeOnly = await service.findAllByUser(TEST_USER_ID, 'custom', true);
      const names = activeOnly.map(t => t.name);

      expect(names).toContain('Active One');
      expect(names).not.toContain('Inactive One');
    });

    it('returns ordered by category, sort_order, name', async () => {
      await service.create(base({ name: 'ZZZ Footer', category: 'footer', sort_order: 2 }));
      await service.create(base({ name: 'AAA Footer', category: 'footer', sort_order: 1 }));

      const all = await service.findAllByUser(TEST_USER_ID, 'footer');
      const footerItems = all.filter(t => t.name.includes('Footer'));
      expect(footerItems[0].name).toBe('AAA Footer'); // sort_order 1 first
      expect(footerItems[1].name).toBe('ZZZ Footer'); // sort_order 2 second
    });
  });

  describe('findById', () => {
    it('returns template by id for correct user', async () => {
      const created = await service.create(base({ name: 'Find By Id' }));
      const found = await service.findById(created.id, TEST_USER_ID);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.name).toBe('Find By Id');
    });

    it('returns null for non-existent id', async () => {
      const found = await service.findById('00000000-0000-0000-0000-000000000000', TEST_USER_ID);
      expect(found).toBeNull();
    });

    it('returns null for different user_id (tenant isolation)', async () => {
      const created = await service.create(base({ name: 'Tenant Isolation' }));
      const found = await service.findById(created.id, '00000000-0000-0000-0000-000000000001');
      expect(found).toBeNull();
    });
  });

  describe('findDefaultByCategory', () => {
    it('returns the default active template for a category', async () => {
      const created = await service.create(base({
        name: 'My Default Terms',
        category: 'payment_terms',
        is_default: true,
        is_active: true,
      }));

      const found = await service.findDefaultByCategory(TEST_USER_ID, 'payment_terms');
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
    });

    it('returns null when no default is set', async () => {
      // legal_notice category has no defaults created in this test
      const found = await service.findDefaultByCategory(TEST_USER_ID, 'legal_notice');
      expect(found).toBeNull();
    });
  });

  describe('findAllDefaultsByUser', () => {
    it('returns all defaults for the user across categories', async () => {
      await service.create(base({ name: 'Default Footer', category: 'footer', is_default: true }));
      await service.create(base({ name: 'Default Header', category: 'header', is_default: true }));

      const defaults = await service.findAllDefaultsByUser(TEST_USER_ID);
      const names = defaults.map(t => t.name);

      expect(names).toContain('Default Footer');
      expect(names).toContain('Default Header');
      // All returned templates should be defaults
      expect(defaults.every(t => t.is_default)).toBe(true);
    });
  });

  describe('update', () => {
    it('updates specified fields and returns updated template', async () => {
      const created = await service.create(base({ name: 'Before Update' }));

      const updated = await service.update(created.id, TEST_USER_ID, {
        name: 'After Update',
        content: 'New content here',
        language: 'de',
      });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('After Update');
      expect(updated!.content).toBe('New content here');
      expect(updated!.language).toBe('de');
      expect(updated!.category).toBe(created.category); // unchanged
    });

    it('returns existing template unchanged when no fields provided', async () => {
      const created = await service.create(base({ name: 'No Change' }));
      const updated = await service.update(created.id, TEST_USER_ID, {});

      expect(updated!.name).toBe('No Change');
    });

    it('setting is_default via update unsets other defaults in same category', async () => {
      const first = await service.create(base({
        name: 'Update Default First',
        category: 'custom',
        is_default: true,
      }));
      const second = await service.create(base({
        name: 'Update Default Second',
        category: 'custom',
        is_default: false,
      }));

      // Set second as default → first should lose its default status
      await service.update(second.id, TEST_USER_ID, { is_default: true });

      const reloadedFirst = await service.findById(first.id, TEST_USER_ID);
      const reloadedSecond = await service.findById(second.id, TEST_USER_ID);

      expect(reloadedFirst!.is_default).toBe(false);
      expect(reloadedSecond!.is_default).toBe(true);
    });

    it('returns null for non-existent template', async () => {
      const result = await service.update('00000000-0000-0000-0000-000000000000', TEST_USER_ID, {
        name: 'Ghost',
      });
      expect(result).toBeNull();
    });

    it('returns null for different user_id (tenant isolation)', async () => {
      const created = await service.create(base({ name: 'Other User Template' }));
      const result = await service.update(created.id, '00000000-0000-0000-0000-000000000001', {
        name: 'Hijack',
      });
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('deletes a template and returns true', async () => {
      const created = await service.create(base({ name: 'Delete Me' }));

      const deleted = await service.delete(created.id, TEST_USER_ID);
      expect(deleted).toBe(true);

      const found = await service.findById(created.id, TEST_USER_ID);
      expect(found).toBeNull();
    });

    it('returns false for non-existent template', async () => {
      const result = await service.delete('00000000-0000-0000-0000-000000000000', TEST_USER_ID);
      expect(result).toBe(false);
    });

    it('returns false when template belongs to another user', async () => {
      const created = await service.create(base({ name: 'Other User Delete' }));
      const result = await service.delete(created.id, '00000000-0000-0000-0000-000000000001');
      expect(result).toBe(false);

      // Original should still exist
      const found = await service.findById(created.id, TEST_USER_ID);
      expect(found).not.toBeNull();
    });
  });
});
