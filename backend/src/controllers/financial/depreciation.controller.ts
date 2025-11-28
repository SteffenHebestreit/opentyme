/**
 * @fileoverview Depreciation Controller
 * Handles depreciation reporting, asset register, and schedule endpoints
 */

import { Request, Response } from 'express';
import { getDbClient } from '../../utils/database';
import { logger } from '../../utils/logger';

/**
 * Get depreciation summary by year
 * 
 * @route GET /api/depreciation/summary
 * @query year - Optional year filter (defaults to current year)
 * @access Protected
 */
export const getDepreciationSummary = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();

  if (!userId) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  try {
    const pool = getDbClient();
    
    // Get summary of all depreciation for the year
    const result = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE depreciation_type = 'partial') as total_assets_under_depreciation,
        COUNT(*) FILTER (WHERE depreciation_type = 'immediate') as immediate_deductions,
        COUNT(*) FILTER (WHERE depreciation_type = 'none') as no_depreciation,
        SUM(tax_deductible_amount) as total_tax_deductible,
        SUM(CASE WHEN depreciation_type = 'immediate' THEN net_amount ELSE 0 END) as immediate_amount,
        SUM(CASE WHEN depreciation_type = 'partial' THEN tax_deductible_amount ELSE 0 END) as depreciation_amount,
        SUM(CASE WHEN depreciation_type = 'partial' THEN net_amount - tax_deductible_amount ELSE 0 END) as deferred_amount,
        AVG(CASE WHEN depreciation_years IS NOT NULL THEN depreciation_years ELSE NULL END) as avg_depreciation_years
      FROM expenses
      WHERE user_id = $1 
        AND EXTRACT(YEAR FROM expense_date) = $2
        AND depreciation_type IS NOT NULL`,
      [userId, year]
    );

    // Get breakdown by category
    const categoryBreakdown = await pool.query(
      `SELECT 
        useful_life_category,
        COUNT(*) as count,
        SUM(net_amount) as total_net_amount,
        SUM(tax_deductible_amount) as total_tax_deductible,
        AVG(depreciation_years) as avg_years
      FROM expenses
      WHERE user_id = $1 
        AND EXTRACT(YEAR FROM expense_date) = $2
        AND depreciation_type = 'partial'
      GROUP BY useful_life_category
      ORDER BY total_net_amount DESC`,
      [userId, year]
    );

    // Get monthly breakdown for chart
    const monthlyBreakdown = await pool.query(
      `SELECT 
        EXTRACT(MONTH FROM expense_date) as month,
        COUNT(*) FILTER (WHERE depreciation_type = 'partial') as assets_count,
        SUM(tax_deductible_amount) as tax_deductible,
        SUM(CASE WHEN depreciation_type = 'partial' THEN net_amount ELSE 0 END) as asset_value
      FROM expenses
      WHERE user_id = $1 
        AND EXTRACT(YEAR FROM expense_date) = $2
        AND depreciation_type IS NOT NULL
      GROUP BY EXTRACT(MONTH FROM expense_date)
      ORDER BY month`,
      [userId, year]
    );

    res.json({
      year,
      summary: result.rows[0],
      by_category: categoryBreakdown.rows,
      monthly: monthlyBreakdown.rows,
    });
  } catch (error) {
    logger.error('Failed to get depreciation summary', { error, userId });
    res.status(500).json({ error: 'Failed to retrieve depreciation summary' });
  }
};

/**
 * Get asset register (all assets with depreciation)
 * 
 * @route GET /api/depreciation/asset-register
 * @query year - Optional year filter
 * @query category - Optional category filter
 * @query status - Optional status filter (active, fully_depreciated)
 * @access Protected
 */
export const getAssetRegister = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const year = req.query.year ? parseInt(req.query.year as string) : null;
  const category = req.query.category as string;
  const status = req.query.status as string;

  if (!userId) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  try {
    const pool = getDbClient();
    
    let whereConditions = ['user_id = $1', 'depreciation_type = $2'];
    let params: any[] = [userId, 'partial'];
    let paramCount = 2;

    if (year) {
      paramCount++;
      whereConditions.push(`EXTRACT(YEAR FROM expense_date) = $${paramCount}`);
      params.push(year);
    }

    if (category) {
      paramCount++;
      whereConditions.push(`useful_life_category = $${paramCount}`);
      params.push(category);
    }

    // Calculate years since purchase for status filter
    const statusCondition = status === 'fully_depreciated' 
      ? `AND EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM expense_date) >= depreciation_years`
      : status === 'active'
      ? `AND EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM expense_date) < depreciation_years`
      : '';

    const result = await pool.query(
      `SELECT 
        id,
        description,
        category,
        expense_date as purchase_date,
        net_amount,
        depreciation_years,
        useful_life_category,
        depreciation_method,
        tax_deductible_amount as first_year_deduction,
        (net_amount / depreciation_years) as annual_depreciation,
        (EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM expense_date)) as years_elapsed,
        (net_amount - (net_amount / depreciation_years * (EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM expense_date) + 1))) as remaining_value,
        CASE 
          WHEN EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM expense_date) >= depreciation_years 
          THEN 'fully_depreciated'
          ELSE 'active'
        END as status
      FROM expenses
      WHERE ${whereConditions.join(' AND ')}
      ${statusCondition}
      ORDER BY expense_date DESC`,
      params
    );

    res.json({
      total: result.rows.length,
      assets: result.rows,
    });
  } catch (error) {
    logger.error('Failed to get asset register', { error, userId });
    res.status(500).json({ error: 'Failed to retrieve asset register' });
  }
};

/**
 * Get depreciation schedule (future depreciation by year)
 * 
 * @route GET /api/depreciation/schedule
 * @query years - Number of years to project (default: 5)
 * @access Protected
 */
export const getDepreciationSchedule = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const years = req.query.years ? parseInt(req.query.years as string) : 5;

  if (!userId) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  try {
    const pool = getDbClient();
    const currentYear = new Date().getFullYear();
    
    // Get all active depreciated assets
    const result = await pool.query(
      `SELECT 
        id,
        description,
        useful_life_category,
        net_amount,
        depreciation_years,
        expense_date as purchase_date,
        EXTRACT(YEAR FROM expense_date) as purchase_year
      FROM expenses
      WHERE user_id = $1 
        AND depreciation_type = 'partial'
        AND EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM expense_date) < depreciation_years
      ORDER BY expense_date`,
      [userId]
    );

    // Calculate depreciation schedule for each year
    const schedule: { [year: number]: any } = {};
    
    for (let yearOffset = 0; yearOffset < years; yearOffset++) {
      const targetYear = currentYear + yearOffset;
      schedule[targetYear] = {
        year: targetYear,
        total_depreciation: 0,
        assets: [],
      };

      for (const asset of result.rows) {
        const purchaseYear = parseInt(asset.purchase_year);
        const yearsElapsed = targetYear - purchaseYear;
        
        // Only include if asset is still being depreciated in this year
        if (yearsElapsed >= 0 && yearsElapsed < asset.depreciation_years) {
          const annualDepreciation = asset.net_amount / asset.depreciation_years;
          
          schedule[targetYear].assets.push({
            id: asset.id,
            description: asset.description,
            category: asset.useful_life_category,
            annual_depreciation: annualDepreciation,
            year_of_depreciation: yearsElapsed + 1,
            remaining_years: asset.depreciation_years - yearsElapsed - 1,
          });
          
          schedule[targetYear].total_depreciation += annualDepreciation;
        }
      }
    }

    res.json({
      current_year: currentYear,
      schedule: Object.values(schedule),
    });
  } catch (error) {
    logger.error('Failed to get depreciation schedule', { error, userId });
    res.status(500).json({ error: 'Failed to retrieve depreciation schedule' });
  }
};

/**
 * Get depreciation details for a specific asset
 * 
 * @route GET /api/depreciation/asset/:id
 * @access Protected
 */
export const getAssetDepreciation = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const assetId = req.params.id;

  if (!userId) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  try {
    const pool = getDbClient();
    
    const result = await pool.query(
      `SELECT 
        id,
        description,
        category,
        expense_date as purchase_date,
        net_amount,
        depreciation_type,
        depreciation_years,
        depreciation_method,
        useful_life_category,
        tax_deductible_amount as first_year_deduction,
        EXTRACT(YEAR FROM expense_date) as purchase_year,
        EXTRACT(MONTH FROM expense_date) as purchase_month,
        (net_amount / depreciation_years) as annual_depreciation,
        (EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM expense_date)) as years_elapsed
      FROM expenses
      WHERE id = $1 AND user_id = $2`,
      [assetId, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }

    const asset = result.rows[0];

    // Calculate year-by-year depreciation
    const yearlyDepreciation = [];
    if (asset.depreciation_type === 'partial' && asset.depreciation_years) {
      const purchaseYear = parseInt(asset.purchase_year);
      const purchaseMonth = parseInt(asset.purchase_month);
      const annualAmount = asset.net_amount / asset.depreciation_years;

      for (let i = 0; i < asset.depreciation_years; i++) {
        const year = purchaseYear + i;
        let amount = annualAmount;
        
        // Pro-rata for first year
        if (i === 0) {
          const monthsOwned = 13 - purchaseMonth;
          amount = (annualAmount * monthsOwned) / 12;
        }
        
        // Pro-rata for last year (if needed)
        if (i === asset.depreciation_years - 1) {
          const firstYearAmount = i === 0 ? amount : (annualAmount * (13 - purchaseMonth)) / 12;
          const totalSoFar = firstYearAmount + annualAmount * (asset.depreciation_years - 2);
          amount = asset.net_amount - totalSoFar;
        }

        yearlyDepreciation.push({
          year,
          amount: Math.round(amount * 100) / 100,
          is_current_year: year === new Date().getFullYear(),
          is_past: year < new Date().getFullYear(),
        });
      }
    }

    res.json({
      asset,
      yearly_depreciation: yearlyDepreciation,
      total_depreciated: yearlyDepreciation
        .filter(y => y.is_past || y.is_current_year)
        .reduce((sum, y) => sum + y.amount, 0),
      remaining_value: asset.net_amount - yearlyDepreciation
        .filter(y => y.is_past || y.is_current_year)
        .reduce((sum, y) => sum + y.amount, 0),
    });
  } catch (error) {
    logger.error('Failed to get asset depreciation', { error, userId, assetId });
    res.status(500).json({ error: 'Failed to retrieve asset depreciation' });
  }
};
