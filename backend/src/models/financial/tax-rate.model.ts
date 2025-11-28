/**
 * @fileoverview Tax rate models for managing predefined tax rates.
 * 
 * Tax rates can be configured per user and selected when creating invoices.
 * Examples: Standard VAT (19%), Reduced VAT (7%), Reverse Charge (0%), Small Business Exempt (0%)
 * 
 * @module models/financial/tax-rate
 */

/**
 * Data transfer object for creating a new tax rate.
 * 
 * @interface CreateTaxRateDto
 * @property {string} user_id - The UUID of the user who owns this tax rate
 * @property {string} name - Display name (e.g., "Standard VAT (19%)")
 * @property {number} rate - The tax percentage (0-100)
 * @property {string} [description] - Explanation of when to use this rate
 * @property {boolean} [is_default] - If true, pre-selected for new invoices
 * @property {boolean} [is_active] - If false, hidden from selection
 * @property {string} [country_code] - ISO country code (e.g., 'DE', 'AT')
 * @property {number} [sort_order] - Custom ordering in dropdowns
 * 
 * @example
 * const newRate: CreateTaxRateDto = {
 *   user_id: 'user-uuid',
 *   name: 'Standard VAT (19%)',
 *   rate: 19.00,
 *   description: 'Standard German VAT rate',
 *   is_default: true,
 *   country_code: 'DE'
 * };
 */
export interface CreateTaxRateDto {
  user_id: string;
  name: string;
  rate: number;
  description?: string;
  is_default?: boolean;
  is_active?: boolean;
  country_code?: string;
  sort_order?: number;
}

/**
 * Data transfer object for updating an existing tax rate.
 * All fields are optional to support partial updates.
 * 
 * @interface UpdateTaxRateDto
 * @extends {Partial<Omit<CreateTaxRateDto, 'user_id'>>}
 * 
 * @example
 * const updateData: UpdateTaxRateDto = {
 *   is_default: false,
 *   is_active: true
 * };
 */
export interface UpdateTaxRateDto extends Partial<Omit<CreateTaxRateDto, 'user_id'>> {}

/**
 * Full tax rate structure as returned by the database.
 * 
 * @interface TaxRate
 * @property {string} id - Unique identifier (UUID)
 * @property {string} user_id - The UUID of the user who owns this tax rate
 * @property {string} name - Display name (e.g., "Standard VAT (19%)")
 * @property {number} rate - The tax percentage (0-100)
 * @property {string | null} description - Explanation of when to use this rate
 * @property {boolean} is_default - If true, pre-selected for new invoices
 * @property {boolean} is_active - If false, hidden from selection
 * @property {string | null} country_code - ISO country code (e.g., 'DE', 'AT')
 * @property {number} sort_order - Custom ordering in dropdowns
 * @property {Date} created_at - Timestamp when created
 * @property {Date} updated_at - Timestamp when last updated
 * 
 * @example
 * const taxRate: TaxRate = {
 *   id: 'rate-uuid',
 *   user_id: 'user-uuid',
 *   name: 'Standard VAT (19%)',
 *   rate: 19.00,
 *   description: 'Standard German VAT rate',
 *   is_default: true,
 *   is_active: true,
 *   country_code: 'DE',
 *   sort_order: 0,
 *   created_at: new Date(),
 *   updated_at: new Date()
 * };
 */
export interface TaxRate {
  id: string;
  user_id: string;
  name: string;
  rate: number;
  description: string | null;
  is_default: boolean;
  is_active: boolean;
  country_code: string | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}
