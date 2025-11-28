/**
 * @fileoverview Settings Controller
 * Handles user settings and company information management
 */

import { Request, Response } from 'express';
import { getDbClient } from '../../utils/database';
import { logger } from '../../utils/logger';

/**
 * Get current user's settings
 * 
 * @route GET /api/settings
 * @access Protected (requires authentication)
 */
export const getSettings = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  try {
    const pool = getDbClient();
    const result = await pool.query(
      `SELECT 
        id,
        user_id,
        user_region,
        company_name,
        company_address,
        company_city,
        company_state,
        company_postal_code,
        company_country,
        company_tax_id,
        company_email,
        company_phone,
        company_website,
        company_logo_url,
        company_subline,
        invoice_prefix,
        invoice_number_start,
        invoice_number_current,
        default_tax_rate,
        default_currency,
        default_payment_terms,
        bank_name,
        bank_iban,
        bank_bic,
        bank_account_holder,
        ai_enabled,
        ai_provider,
        ai_api_url,
        ai_api_key,
        ai_model,
        mcp_server_url,
        mcp_server_api_key,
        created_at,
        updated_at
      FROM settings 
      WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      // Create default settings for new user
      const insertResult = await pool.query(
        `INSERT INTO settings (user_id) 
         VALUES ($1) 
         RETURNING *`,
        [userId]
      );
      res.json(insertResult.rows[0]);
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Failed to get settings', { error, userId });
    // Extra debug output
    // eslint-disable-next-line no-console
    console.error('Settings GET error:', error);
    res.status(500).json({ error: 'Failed to retrieve settings' });
  }
};

/**
 * Update current user's settings
 * 
 * @route PUT /api/settings
 * @access Protected (requires authentication)
 */
export const updateSettings = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  try {
    const pool = getDbClient();
    const {
      user_region,
      company_name,
      company_address,
      company_city,
      company_state,
      company_postal_code,
      company_country,
      company_tax_id,
      company_email,
      company_phone,
      company_website,
      company_logo_url,
      company_subline,
      invoice_prefix,
      invoice_number_start,
      invoice_number_current,
      default_tax_rate,
      default_currency,
      default_payment_terms,
      bank_name,
      bank_iban,
      bank_bic,
      bank_account_holder,
      ai_enabled,
      ai_provider,
      ai_api_url,
      ai_api_key,
      ai_model,
      mcp_server_url,
      mcp_server_api_key,
    } = req.body;

    // Build dynamic update query based on provided fields
    const updates: string[] = [];
    const values: any[] = [userId];
    let paramCount = 2;

    const fieldMap: Record<string, any> = {
      user_region,
      company_name,
      company_address,
      company_city,
      company_state,
      company_postal_code,
      company_country,
      company_tax_id,
      company_email,
      company_phone,
      company_website,
      company_logo_url,
      company_subline,
      invoice_prefix,
      invoice_number_start,
      invoice_number_current,
      default_tax_rate,
      default_currency,
      default_payment_terms,
      bank_name,
      bank_iban,
      bank_bic,
      bank_account_holder,
      ai_enabled,
      ai_provider,
      ai_api_url,
      ai_api_key,
      ai_model,
      mcp_server_url,
      mcp_server_api_key,
    };

    Object.entries(fieldMap).forEach(([field, value]) => {
      if (value !== undefined) {
        updates.push(`${field} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    });

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    // Always update updated_at
    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    const query = `
      UPDATE settings 
      SET ${updates.join(', ')}
      WHERE user_id = $1
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      // Create settings if not exists
      const insertResult = await pool.query(
        `INSERT INTO settings (user_id) 
         VALUES ($1) 
         RETURNING *`,
        [userId]
      );
      
      // Then update with provided fields
      const updateResult = await pool.query(query, values);
      res.json(updateResult.rows[0]);
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Failed to update settings', { error, userId });
    res.status(500).json({ error: 'Failed to update settings' });
  }
};
