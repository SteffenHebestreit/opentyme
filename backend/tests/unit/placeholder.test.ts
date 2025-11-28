/**
 * Unit tests for placeholder processing utility.
 * Tests date arithmetic, localization, and context substitution.
 */

import { processPlaceholders, getAvailablePlaceholders, PlaceholderContext } from '../../src/utils/placeholder';

describe('Placeholder Processing', () => {
  describe('processPlaceholders', () => {
    it('should replace client name placeholder', () => {
      const text = 'Invoice for {{client}}';
      const context: PlaceholderContext = {
        client_name: 'Acme Corporation',
      };
      
      const result = processPlaceholders(text, context);
      expect(result).toBe('Invoice for Acme Corporation');
    });

    it('should replace project name placeholder', () => {
      const text = 'Project: {{project}}';
      const context: PlaceholderContext = {
        project_name: 'Website Redesign',
      };
      
      const result = processPlaceholders(text, context);
      expect(result).toBe('Project: Website Redesign');
    });

    it('should handle month-1 placeholder in German', () => {
      const text = 'Rechnung für {{month-1}} {{year}}';
      const context: PlaceholderContext = {
        referenceDate: new Date('2025-04-01'),
        language: 'de',
      };
      
      const result = processPlaceholders(text, context);
      expect(result).toBe('Rechnung für März 2025');
    });

    it('should handle month-1 placeholder in English', () => {
      const text = 'Invoice for {{month-1}} {{year}}';
      const context: PlaceholderContext = {
        referenceDate: new Date('2025-04-01'),
        language: 'en',
      };
      
      const result = processPlaceholders(text, context);
      expect(result).toBe('Invoice for March 2025');
    });

    it('should handle month placeholder with current date', () => {
      const text = 'Current month: {{month}}';
      const context: PlaceholderContext = {
        referenceDate: new Date('2025-10-30'),
        language: 'de',
      };
      
      const result = processPlaceholders(text, context);
      expect(result).toBe('Current month: Oktober');
    });

    it('should handle date formatting in German', () => {
      const text = 'Date: {{date}}';
      const context: PlaceholderContext = {
        referenceDate: new Date('2025-10-30'),
        language: 'de',
      };
      
      const result = processPlaceholders(text, context);
      expect(result).toBe('Date: 30.10.2025');
    });

    it('should handle date formatting in English', () => {
      const text = 'Date: {{date}}';
      const context: PlaceholderContext = {
        referenceDate: new Date('2025-10-30'),
        language: 'en',
      };
      
      const result = processPlaceholders(text, context);
      expect(result).toBe('Date: 10/30/2025');
    });

    it('should replace multiple placeholders', () => {
      const text = 'Invoice for {{client}} - Project {{project}} - {{month-1}} {{year}}';
      const context: PlaceholderContext = {
        client_name: 'Acme Corp',
        project_name: 'Web App',
        referenceDate: new Date('2025-04-01'),
        language: 'en',
      };
      
      const result = processPlaceholders(text, context);
      expect(result).toBe('Invoice for Acme Corp - Project Web App - March 2025');
    });

    it('should handle year placeholder', () => {
      const text = 'Copyright {{year}}';
      const context: PlaceholderContext = {
        referenceDate: new Date('2025-10-30'),
      };
      
      const result = processPlaceholders(text, context);
      expect(result).toBe('Copyright 2025');
    });

    it('should handle currency placeholder', () => {
      const text = 'Total: {{total}}';
      const context: PlaceholderContext = {
        total: 1500.50,
        currency: 'EUR',
        language: 'de',
      };
      
      const result = processPlaceholders(text, context);
      expect(result).toContain('1.500,50');
      expect(result).toContain('€');
    });

    it('should handle invoice_number placeholder', () => {
      const text = 'Invoice Number: {{invoice_number}}';
      const context: PlaceholderContext = {
        invoice_number: 'INV-20250430-001',
      };
      
      const result = processPlaceholders(text, context);
      expect(result).toBe('Invoice Number: INV-20250430-001');
    });

    it('should return empty string for unknown placeholders', () => {
      const text = 'Unknown: {{unknown_placeholder}}';
      const context: PlaceholderContext = {};
      
      const result = processPlaceholders(text, context);
      expect(result).toBe('Unknown: ');
    });

    it('should handle whitespace in placeholders', () => {
      const text = 'Invoice for {{ client }}';
      const context: PlaceholderContext = {
        client_name: 'Acme Corp',
      };
      
      const result = processPlaceholders(text, context);
      expect(result).toBe('Invoice for Acme Corp');
    });

    it('should handle December to January transition for month-1', () => {
      const text = '{{month-1}}';
      const context: PlaceholderContext = {
        referenceDate: new Date('2025-01-15'),
        language: 'en',
      };
      
      const result = processPlaceholders(text, context);
      expect(result).toBe('December');
    });

    it('should handle month+1 placeholder', () => {
      const text = 'Next month: {{month+1}}';
      const context: PlaceholderContext = {
        referenceDate: new Date('2025-10-30'),
        language: 'en',
      };
      
      const result = processPlaceholders(text, context);
      expect(result).toBe('Next month: November');
    });
  });

  describe('getAvailablePlaceholders', () => {
    it('should return array of placeholders', () => {
      const placeholders = getAvailablePlaceholders('en');
      
      expect(Array.isArray(placeholders)).toBe(true);
      expect(placeholders.length).toBeGreaterThan(0);
    });

    it('should include required properties', () => {
      const placeholders = getAvailablePlaceholders('en');
      
      placeholders.forEach(ph => {
        expect(ph).toHaveProperty('placeholder');
        expect(ph).toHaveProperty('description');
        expect(ph).toHaveProperty('example');
        expect(typeof ph.placeholder).toBe('string');
        expect(typeof ph.description).toBe('string');
        expect(typeof ph.example).toBe('string');
      });
    });

    it('should return localized examples for German', () => {
      const placeholders = getAvailablePlaceholders('de');
      const monthPlaceholder = placeholders.find(p => p.placeholder === '{{month}}');
      
      expect(monthPlaceholder).toBeDefined();
      // Should contain German month name (current month)
      expect(monthPlaceholder?.example).toBeTruthy();
    });

    it('should include common placeholders', () => {
      const placeholders = getAvailablePlaceholders('en');
      const placeholderStrings = placeholders.map(p => p.placeholder);
      
      expect(placeholderStrings).toContain('{{date}}');
      expect(placeholderStrings).toContain('{{month}}');
      expect(placeholderStrings).toContain('{{month-1}}');
      expect(placeholderStrings).toContain('{{year}}');
      expect(placeholderStrings).toContain('{{client}}');
      expect(placeholderStrings).toContain('{{project}}');
      expect(placeholderStrings).toContain('{{invoice_number}}');
      expect(placeholderStrings).toContain('{{total}}');
    });
  });
});
