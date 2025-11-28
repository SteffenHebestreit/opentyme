import { getDbClient } from '../../utils/database';
import {
  CreateInvoiceTextTemplateDto,
  UpdateInvoiceTextTemplateDto,
  InvoiceTextTemplate,
  TemplateCategory
} from '../../models/financial/invoice-text-template.model';

const db = getDbClient();

/**
 * Service for managing invoice text templates.
 * Handles CRUD operations for reusable text snippets used in invoices.
 * Supports categorization, multi-language, and default template management.
 * 
 * @class InvoiceTextTemplateService
 */
export class InvoiceTextTemplateService {

  /**
   * Creates a new invoice text template.
   * If is_default is true for a category, unsets any existing default in that category first.
   * 
   * @async
   * @param {CreateInvoiceTextTemplateDto} templateData - The template data to create
   * @returns {Promise<InvoiceTextTemplate>} The created template with generated ID
   * @throws {Error} If the database operation fails
   * 
   * @example
   * const newTemplate = await service.create({
   *   user_id: 'user-uuid',
   *   name: 'Small Business Exemption (DE)',
   *   category: 'tax_exemption',
   *   content: 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.',
   *   language: 'de',
   *   is_active: true
   * });
   */
  async create(templateData: CreateInvoiceTextTemplateDto): Promise<InvoiceTextTemplate> {
    const db = getDbClient();
    
    try {
      // If this should be default for its category, unset existing defaults in that category
      if (templateData.is_default) {
        await db.query(
          'UPDATE invoice_text_templates SET is_default = false WHERE user_id = $1 AND category = $2 AND is_default = true',
          [templateData.user_id, templateData.category]
        );
      }

      const queryText = `
        INSERT INTO invoice_text_templates (
          user_id, name, category, content, language, is_default, is_active, sort_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, user_id, name, category, content, language, is_default, is_active, 
                  sort_order, created_at, updated_at
      `;
      
      const values = [
        templateData.user_id,
        templateData.name,
        templateData.category,
        templateData.content,
        templateData.language || 'en',
        templateData.is_default ?? false,
        templateData.is_active ?? true,
        templateData.sort_order ?? 0
      ];

      const result = await db.query(queryText, values);
      return result.rows[0] as InvoiceTextTemplate;
    } catch (error) {
      console.error('Error creating invoice text template:', error);
      throw new Error(`Failed to create invoice text template: ${(error as any).message}`);
    }
  }

  /**
   * Retrieves all invoice text templates for a specific user.
   * Returns templates ordered by category, sort_order, then name.
   * 
   * @async
   * @param {string} userId - The UUID of the user who owns the templates
   * @param {TemplateCategory} [category] - Optional category filter
   * @param {boolean} [activeOnly=false] - If true, only return active templates
   * @returns {Promise<InvoiceTextTemplate[]>} Array of templates
   * @throws {Error} If the query fails
   * 
   * @example
   * const taxTemplates = await service.findAllByUser('user-uuid', 'tax_exemption', true);
   */
  async findAllByUser(
    userId: string, 
    category?: TemplateCategory, 
    activeOnly: boolean = false
  ): Promise<InvoiceTextTemplate[]> {
    const db = getDbClient();
    
    let queryText = `
      SELECT id, user_id, name, category, content, language, is_default, is_active, 
             sort_order, created_at, updated_at
      FROM invoice_text_templates 
      WHERE user_id = $1
    `;
    
    const values: any[] = [userId];
    let paramIndex = 2;

    if (category) {
      queryText += ` AND category = $${paramIndex++}`;
      values.push(category);
    }

    if (activeOnly) {
      queryText += ' AND is_active = true';
    }
    
    queryText += ' ORDER BY category ASC, sort_order ASC, name ASC';

    try {
      const result = await db.query(queryText, values);
      return result.rows as InvoiceTextTemplate[];
    } catch (error) {
      console.error('Error fetching invoice text templates:', error);
      throw new Error(`Failed to fetch invoice text templates: ${(error as any).message}`);
    }
  }

  /**
   * Retrieves a single invoice text template by its ID.
   * Includes multi-tenant check to ensure user owns this template.
   * 
   * @async
   * @param {string} id - The UUID of the template to retrieve
   * @param {string} userId - The UUID of the user (for multi-tenant check)
   * @returns {Promise<InvoiceTextTemplate | null>} The template, or null if not found
   * @throws {Error} If the query fails
   * 
   * @example
   * const template = await service.findById('template-uuid', 'user-uuid');
   */
  async findById(id: string, userId: string): Promise<InvoiceTextTemplate | null> {
    const db = getDbClient();
    
    const queryText = `
      SELECT id, user_id, name, category, content, language, is_default, is_active, 
             sort_order, created_at, updated_at
      FROM invoice_text_templates 
      WHERE id = $1 AND user_id = $2
    `;

    try {
      const result = await db.query(queryText, [id, userId]);
      if (result.rows.length === 0) return null;
      return result.rows[0] as InvoiceTextTemplate;
    } catch (error) {
      console.error('Error fetching invoice text template by ID:', error);
      throw new Error(`Failed to fetch invoice text template: ${(error as any).message}`);
    }
  }

  /**
   * Gets the default template for a specific category and user.
   * Returns null if no default is set for that category.
   * 
   * @async
   * @param {string} userId - The UUID of the user
   * @param {TemplateCategory} category - The template category
   * @returns {Promise<InvoiceTextTemplate | null>} The default template, or null if not found
   * @throws {Error} If the query fails
   * 
   * @example
   * const defaultPaymentTerms = await service.findDefaultByCategory('user-uuid', 'payment_terms');
   */
  async findDefaultByCategory(userId: string, category: TemplateCategory): Promise<InvoiceTextTemplate | null> {
    const db = getDbClient();
    
    const queryText = `
      SELECT id, user_id, name, category, content, language, is_default, is_active, 
             sort_order, created_at, updated_at
      FROM invoice_text_templates 
      WHERE user_id = $1 AND category = $2 AND is_default = true AND is_active = true
      LIMIT 1
    `;

    try {
      const result = await db.query(queryText, [userId, category]);
      if (result.rows.length === 0) return null;
      return result.rows[0] as InvoiceTextTemplate;
    } catch (error) {
      console.error('Error fetching default template:', error);
      throw new Error(`Failed to fetch default template: ${(error as any).message}`);
    }
  }

  /**
   * Gets all default templates for a user (one per category if set).
   * Useful for auto-populating new invoices.
   * 
   * @async
   * @param {string} userId - The UUID of the user
   * @returns {Promise<InvoiceTextTemplate[]>} Array of default templates
   * @throws {Error} If the query fails
   * 
   * @example
   * const defaults = await service.findAllDefaultsByUser('user-uuid');
   */
  async findAllDefaultsByUser(userId: string): Promise<InvoiceTextTemplate[]> {
    const db = getDbClient();
    
    const queryText = `
      SELECT id, user_id, name, category, content, language, is_default, is_active, 
             sort_order, created_at, updated_at
      FROM invoice_text_templates 
      WHERE user_id = $1 AND is_default = true AND is_active = true
      ORDER BY category ASC
    `;

    try {
      const result = await db.query(queryText, [userId]);
      return result.rows as InvoiceTextTemplate[];
    } catch (error) {
      console.error('Error fetching default templates:', error);
      throw new Error(`Failed to fetch default templates: ${(error as any).message}`);
    }
  }

  /**
   * Updates an existing invoice text template with partial data.
   * Only provided fields will be updated.
   * If is_default is set to true, unsets other defaults in the same category first.
   * 
   * @async
   * @param {string} id - The UUID of the template to update
   * @param {string} userId - The UUID of the user (for multi-tenant check)
   * @param {UpdateInvoiceTextTemplateDto} templateData - The partial template data to update
   * @returns {Promise<InvoiceTextTemplate | null>} The updated template, or null if not found
   * @throws {Error} If the update operation fails
   * 
   * @example
   * const updated = await service.update('template-uuid', 'user-uuid', {
   *   content: 'Updated text content',
   *   is_default: true
   * });
   */
  async update(
    id: string, 
    userId: string, 
    templateData: UpdateInvoiceTextTemplateDto
  ): Promise<InvoiceTextTemplate | null> {
    const db = getDbClient();
    
    try {
      // If setting as default, get current category and unset other defaults
      if (templateData.is_default === true) {
        const current = await this.findById(id, userId);
        if (current) {
          await db.query(
            'UPDATE invoice_text_templates SET is_default = false WHERE user_id = $1 AND category = $2 AND id != $3 AND is_default = true',
            [userId, current.category, id]
          );
        }
      }

      const setParts = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (templateData.name !== undefined) {
        setParts.push(`name = $${paramIndex++}`);
        values.push(templateData.name);
      }

      if (templateData.category !== undefined) {
        setParts.push(`category = $${paramIndex++}`);
        values.push(templateData.category);
      }

      if (templateData.content !== undefined) {
        setParts.push(`content = $${paramIndex++}`);
        values.push(templateData.content);
      }

      if (templateData.language !== undefined) {
        setParts.push(`language = $${paramIndex++}`);
        values.push(templateData.language);
      }

      if (templateData.is_default !== undefined) {
        setParts.push(`is_default = $${paramIndex++}`);
        values.push(templateData.is_default);
      }

      if (templateData.is_active !== undefined) {
        setParts.push(`is_active = $${paramIndex++}`);
        values.push(templateData.is_active);
      }

      if (templateData.sort_order !== undefined) {
        setParts.push(`sort_order = $${paramIndex++}`);
        values.push(templateData.sort_order);
      }

      if (setParts.length === 0) {
        return this.findById(id, userId);
      }

      const queryText = `
        UPDATE invoice_text_templates 
        SET ${setParts.join(', ')}, updated_at = CURRENT_TIMESTAMP 
        WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
        RETURNING id, user_id, name, category, content, language, is_default, is_active, 
                  sort_order, created_at, updated_at
      `;
      values.push(id, userId);

      const result = await db.query(queryText, values);
      if (result.rows.length === 0) return null;
      return result.rows[0] as InvoiceTextTemplate;
    } catch (error) {
      console.error('Error updating invoice text template:', error);
      throw new Error(`Failed to update invoice text template: ${(error as any).message}`);
    }
  }

  /**
   * Deletes an invoice text template from the database.
   * 
   * @async
   * @param {string} id - The UUID of the template to delete
   * @param {string} userId - The UUID of the user (for multi-tenant check)
   * @returns {Promise<boolean>} True if deleted, false if not found
   * @throws {Error} If deletion fails
   * 
   * @example
   * const deleted = await service.delete('template-uuid', 'user-uuid');
   */
  async delete(id: string, userId: string): Promise<boolean> {
    const db = getDbClient();
    
    try {
      const queryText = 'DELETE FROM invoice_text_templates WHERE id = $1 AND user_id = $2';
      const result = await db.query(queryText, [id, userId]);
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error('Error deleting invoice text template:', error);
      throw new Error(`Failed to delete invoice text template: ${(error as any).message}`);
    }
  }
}
