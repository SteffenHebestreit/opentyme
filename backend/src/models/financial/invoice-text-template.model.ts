/**
 * @fileoverview Invoice text template models for managing reusable invoice text snippets.
 * 
 * Templates can store payment terms, tax exemption notices, legal disclaimers, and footer text.
 * Examples: Small business exemption notice, reverse charge notice, standard payment terms
 * 
 * @module models/financial/invoice-text-template
 */

/**
 * Valid categories for invoice text templates.
 * 
 * @typedef {'tax_exemption' | 'payment_terms' | 'legal_notice' | 'footer' | 'header' | 'custom'} TemplateCategory
 */
export type TemplateCategory = 'tax_exemption' | 'payment_terms' | 'legal_notice' | 'footer' | 'header' | 'custom';

/**
 * Data transfer object for creating a new invoice text template.
 * 
 * @interface CreateInvoiceTextTemplateDto
 * @property {string} user_id - The UUID of the user who owns this template
 * @property {string} name - Display name (e.g., "Small Business Exemption", "Standard Payment Terms")
 * @property {TemplateCategory} category - Type of text content
 * @property {string} content - The actual text content
 * @property {string} [language] - ISO language code (e.g., 'en', 'de', 'fr')
 * @property {boolean} [is_default] - If true, automatically included in new invoices
 * @property {boolean} [is_active] - If false, hidden from selection
 * @property {number} [sort_order] - Custom ordering in dropdowns
 * 
 * @example
 * const newTemplate: CreateInvoiceTextTemplateDto = {
 *   user_id: 'user-uuid',
 *   name: 'Small Business Exemption (DE)',
 *   category: 'tax_exemption',
 *   content: 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.',
 *   language: 'de',
 *   is_active: true
 * };
 */
export interface CreateInvoiceTextTemplateDto {
  user_id: string;
  name: string;
  category: TemplateCategory;
  content: string;
  language?: string;
  is_default?: boolean;
  is_active?: boolean;
  sort_order?: number;
}

/**
 * Data transfer object for updating an existing invoice text template.
 * All fields are optional to support partial updates.
 * 
 * @interface UpdateInvoiceTextTemplateDto
 * @extends {Partial<Omit<CreateInvoiceTextTemplateDto, 'user_id'>>}
 * 
 * @example
 * const updateData: UpdateInvoiceTextTemplateDto = {
 *   content: 'Updated text content',
 *   is_active: true
 * };
 */
export interface UpdateInvoiceTextTemplateDto extends Partial<Omit<CreateInvoiceTextTemplateDto, 'user_id'>> {}

/**
 * Full invoice text template structure as returned by the database.
 * 
 * @interface InvoiceTextTemplate
 * @property {string} id - Unique identifier (UUID)
 * @property {string} user_id - The UUID of the user who owns this template
 * @property {string} name - Display name
 * @property {TemplateCategory} category - Type of text content
 * @property {string} content - The actual text content
 * @property {string} language - ISO language code
 * @property {boolean} is_default - If true, automatically included in new invoices
 * @property {boolean} is_active - If false, hidden from selection
 * @property {number} sort_order - Custom ordering in dropdowns
 * @property {Date} created_at - Timestamp when created
 * @property {Date} updated_at - Timestamp when last updated
 * 
 * @example
 * const template: InvoiceTextTemplate = {
 *   id: 'template-uuid',
 *   user_id: 'user-uuid',
 *   name: 'Standard Payment Terms',
 *   category: 'payment_terms',
 *   content: 'Payment is due within 30 days...',
 *   language: 'en',
 *   is_default: true,
 *   is_active: true,
 *   sort_order: 0,
 *   created_at: new Date(),
 *   updated_at: new Date()
 * };
 */
export interface InvoiceTextTemplate {
  id: string;
  user_id: string;
  name: string;
  category: TemplateCategory;
  content: string;
  language: string;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}
