import { getDbClient } from '../../utils/database';
import {
  CreateTaxRateDto,
  UpdateTaxRateDto,
  TaxRate
} from '../../models/financial/tax-rate.model';

const db = getDbClient();

/**
 * Service for managing tax rate templates.
 * Handles CRUD operations for predefined tax rates that can be selected when creating invoices.
 * Supports multi-tenant isolation and default tax rate management.
 * 
 * @class TaxRateService
 */
export class TaxRateService {

  /**
   * Creates a new tax rate template.
   * If is_default is true, unsets any existing default tax rate for this user first.
   * 
   * @async
   * @param {CreateTaxRateDto} taxRateData - The tax rate data to create
   * @returns {Promise<TaxRate>} The created tax rate with generated ID
   * @throws {Error} If the database operation fails
   * 
   * @example
   * const newRate = await taxRateService.create({
   *   user_id: 'user-uuid',
   *   name: 'Standard VAT (19%)',
   *   rate: 19.00,
   *   description: 'Standard German VAT rate',
   *   is_default: true,
   *   country_code: 'DE'
   * });
   */
  async create(taxRateData: CreateTaxRateDto): Promise<TaxRate> {
    const db = getDbClient();
    
    try {
      // If this should be the default, unset any existing defaults first
      if (taxRateData.is_default) {
        await db.query(
          'UPDATE tax_rates SET is_default = false WHERE user_id = $1 AND is_default = true',
          [taxRateData.user_id]
        );
      }

      const queryText = `
        INSERT INTO tax_rates (
          user_id, name, rate, description, is_default, is_active, country_code, sort_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, user_id, name, rate, description, is_default, is_active, 
                  country_code, sort_order, created_at, updated_at
      `;
      
      const values = [
        taxRateData.user_id,
        taxRateData.name,
        taxRateData.rate,
        taxRateData.description || null,
        taxRateData.is_default ?? false,
        taxRateData.is_active ?? true,
        taxRateData.country_code || null,
        taxRateData.sort_order ?? 0
      ];

      const result = await db.query(queryText, values);
      return result.rows[0] as TaxRate;
    } catch (error) {
      console.error('Error creating tax rate:', error);
      throw new Error(`Failed to create tax rate: ${(error as any).message}`);
    }
  }

  /**
   * Retrieves all tax rates for a specific user.
   * Returns rates ordered by sort_order, then by name.
   * 
   * @async
   * @param {string} userId - The UUID of the user who owns the tax rates
   * @param {boolean} [activeOnly=false] - If true, only return active tax rates
   * @returns {Promise<TaxRate[]>} Array of tax rates
   * @throws {Error} If the query fails
   * 
   * @example
   * const rates = await taxRateService.findAllByUser('user-uuid', true);
   */
  async findAllByUser(userId: string, activeOnly: boolean = false): Promise<TaxRate[]> {
    const db = getDbClient();
    
    let queryText = `
      SELECT id, user_id, name, rate, description, is_default, is_active, 
             country_code, sort_order, created_at, updated_at
      FROM tax_rates 
      WHERE user_id = $1
    `;
    
    if (activeOnly) {
      queryText += ' AND is_active = true';
    }
    
    queryText += ' ORDER BY sort_order ASC, name ASC';

    try {
      const result = await db.query(queryText, [userId]);
      return result.rows as TaxRate[];
    } catch (error) {
      console.error('Error fetching tax rates:', error);
      throw new Error(`Failed to fetch tax rates: ${(error as any).message}`);
    }
  }

  /**
   * Retrieves a single tax rate by its ID.
   * Includes multi-tenant check to ensure user owns this tax rate.
   * 
   * @async
   * @param {string} id - The UUID of the tax rate to retrieve
   * @param {string} userId - The UUID of the user (for multi-tenant check)
   * @returns {Promise<TaxRate | null>} The tax rate, or null if not found
   * @throws {Error} If the query fails
   * 
   * @example
   * const rate = await taxRateService.findById('rate-uuid', 'user-uuid');
   */
  async findById(id: string, userId: string): Promise<TaxRate | null> {
    const db = getDbClient();
    
    const queryText = `
      SELECT id, user_id, name, rate, description, is_default, is_active, 
             country_code, sort_order, created_at, updated_at
      FROM tax_rates 
      WHERE id = $1 AND user_id = $2
    `;

    try {
      const result = await db.query(queryText, [id, userId]);
      if (result.rows.length === 0) return null;
      return result.rows[0] as TaxRate;
    } catch (error) {
      console.error('Error fetching tax rate by ID:', error);
      throw new Error(`Failed to fetch tax rate: ${(error as any).message}`);
    }
  }

  /**
   * Gets the default tax rate for a user.
   * Returns null if no default is set.
   * 
   * @async
   * @param {string} userId - The UUID of the user
   * @returns {Promise<TaxRate | null>} The default tax rate, or null if not found
   * @throws {Error} If the query fails
   * 
   * @example
   * const defaultRate = await taxRateService.findDefaultByUser('user-uuid');
   */
  async findDefaultByUser(userId: string): Promise<TaxRate | null> {
    const db = getDbClient();
    
    const queryText = `
      SELECT id, user_id, name, rate, description, is_default, is_active, 
             country_code, sort_order, created_at, updated_at
      FROM tax_rates 
      WHERE user_id = $1 AND is_default = true AND is_active = true
      LIMIT 1
    `;

    try {
      const result = await db.query(queryText, [userId]);
      if (result.rows.length === 0) return null;
      return result.rows[0] as TaxRate;
    } catch (error) {
      console.error('Error fetching default tax rate:', error);
      throw new Error(`Failed to fetch default tax rate: ${(error as any).message}`);
    }
  }

  /**
   * Updates an existing tax rate with partial data.
   * Only provided fields will be updated.
   * If is_default is set to true, unsets other defaults first.
   * 
   * @async
   * @param {string} id - The UUID of the tax rate to update
   * @param {string} userId - The UUID of the user (for multi-tenant check)
   * @param {UpdateTaxRateDto} taxRateData - The partial tax rate data to update
   * @returns {Promise<TaxRate | null>} The updated tax rate, or null if not found
   * @throws {Error} If the update operation fails
   * 
   * @example
   * const updated = await taxRateService.update('rate-uuid', 'user-uuid', {
   *   is_default: true,
   *   is_active: true
   * });
   */
  async update(id: string, userId: string, taxRateData: UpdateTaxRateDto): Promise<TaxRate | null> {
    const db = getDbClient();
    
    try {
      // If setting as default, unset other defaults first
      if (taxRateData.is_default === true) {
        await db.query(
          'UPDATE tax_rates SET is_default = false WHERE user_id = $1 AND id != $2 AND is_default = true',
          [userId, id]
        );
      }

      const setParts = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (taxRateData.name !== undefined) {
        setParts.push(`name = $${paramIndex++}`);
        values.push(taxRateData.name);
      }

      if (taxRateData.rate !== undefined) {
        setParts.push(`rate = $${paramIndex++}`);
        values.push(taxRateData.rate);
      }

      if (taxRateData.description !== undefined) {
        setParts.push(`description = $${paramIndex++}`);
        values.push(taxRateData.description || null);
      }

      if (taxRateData.is_default !== undefined) {
        setParts.push(`is_default = $${paramIndex++}`);
        values.push(taxRateData.is_default);
      }

      if (taxRateData.is_active !== undefined) {
        setParts.push(`is_active = $${paramIndex++}`);
        values.push(taxRateData.is_active);
      }

      if (taxRateData.country_code !== undefined) {
        setParts.push(`country_code = $${paramIndex++}`);
        values.push(taxRateData.country_code || null);
      }

      if (taxRateData.sort_order !== undefined) {
        setParts.push(`sort_order = $${paramIndex++}`);
        values.push(taxRateData.sort_order);
      }

      if (setParts.length === 0) {
        return this.findById(id, userId);
      }

      const queryText = `
        UPDATE tax_rates 
        SET ${setParts.join(', ')}, updated_at = CURRENT_TIMESTAMP 
        WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
        RETURNING id, user_id, name, rate, description, is_default, is_active, 
                  country_code, sort_order, created_at, updated_at
      `;
      values.push(id, userId);

      const result = await db.query(queryText, values);
      if (result.rows.length === 0) return null;
      return result.rows[0] as TaxRate;
    } catch (error) {
      console.error('Error updating tax rate:', error);
      throw new Error(`Failed to update tax rate: ${(error as any).message}`);
    }
  }

  /**
   * Sets a tax rate as the default for a user.
   * Automatically unsets any other default tax rate.
   * 
   * @async
   * @param {string} id - The UUID of the tax rate to set as default
   * @param {string} userId - The UUID of the user (for multi-tenant check)
   * @returns {Promise<TaxRate | null>} The updated tax rate, or null if not found
   * @throws {Error} If the operation fails
   * 
   * @example
   * await taxRateService.setAsDefault('rate-uuid', 'user-uuid');
   */
  async setAsDefault(id: string, userId: string): Promise<TaxRate | null> {
    return this.update(id, userId, { is_default: true });
  }

  /**
   * Deletes a tax rate from the database.
   * Only deletes if the tax rate is not currently used by any invoices.
   * 
   * @async
   * @param {string} id - The UUID of the tax rate to delete
   * @param {string} userId - The UUID of the user (for multi-tenant check)
   * @returns {Promise<boolean>} True if deleted, false if not found
   * @throws {Error} If the tax rate is in use or deletion fails
   * 
   * @example
   * const deleted = await taxRateService.delete('rate-uuid', 'user-uuid');
   */
  async delete(id: string, userId: string): Promise<boolean> {
    const db = getDbClient();
    
    try {
      // Check if this tax rate is used by any invoices
      const usageCheck = await db.query(
        'SELECT COUNT(*) as count FROM invoices WHERE tax_rate_id = $1',
        [id]
      );
      
      if (parseInt(usageCheck.rows[0].count) > 0) {
        throw new Error('Cannot delete tax rate that is currently used by invoices. Consider deactivating it instead.');
      }

      const queryText = 'DELETE FROM tax_rates WHERE id = $1 AND user_id = $2';
      const result = await db.query(queryText, [id, userId]);
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error('Error deleting tax rate:', error);
      throw new Error(`Failed to delete tax rate: ${(error as any).message}`);
    }
  }
}
