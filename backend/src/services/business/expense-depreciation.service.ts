/**
 * AfA (German tax depreciation) schedule logic — extracted verbatim from
 * ExpenseService to keep that service focused on expense CRUD, receipts and
 * workflow. Behaviour is unchanged: the four methods were moved as-is.
 * ExpenseService instantiates this class and delegates, so callers are unaffected.
 */

import { getDbClient } from '../../utils/database';
import { Expense } from '../../models/business/expense.model';

export class ExpenseDepreciationService {
  private db = getDbClient();

  /**
   * Calculate depreciation schedule for an expense
   * Uses linear depreciation with pro-rata calculation for first/last year
   *
   * @param {string} expenseId - Expense ID
   * @param {string} userId - User ID
   * @param {number} years - Number of years to depreciate
   * @param {Date} startDate - Depreciation start date
   * @param {string} method - Depreciation method ('linear' or 'degressive')
   * @returns {Promise<void>}
   */
  async calculateDepreciationSchedule(
    expenseId: string,
    userId: string,
    years: number,
    startDate: Date,
    method: 'linear' | 'degressive' = 'linear'
  ): Promise<void> {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Get expense details
      const expenseResult = await client.query(
        'SELECT net_amount FROM expenses WHERE id = $1 AND user_id = $2',
        [expenseId, userId]
      );

      if (expenseResult.rows.length === 0) {
        throw new Error('Expense not found');
      }

      const netAmount = parseFloat(expenseResult.rows[0].net_amount);

      // Delete existing schedule entries
      await client.query(
        'DELETE FROM expense_depreciation_schedule WHERE expense_id = $1',
        [expenseId]
      );

      // First year is pro-rated by the number of months the asset is held that
      // calendar year (German AfA: 1/12 per month from the acquisition month).
      const startMonth = startDate.getMonth() + 1; // 1-12
      const monthsInFirstYear = 13 - startMonth; // remaining months incl. start month
      const startYear = startDate.getFullYear();

      // Per-year amounts. Every value is rounded to cents and the LAST year
      // absorbs the accumulated rounding residual, so the schedule sums EXACTLY
      // to net_amount and the closing book value is 0.
      const yearAmounts =
        method === 'degressive'
          ? this.buildDegressiveAmounts(netAmount, years, monthsInFirstYear)
          : this.buildLinearAmounts(netAmount, years, monthsInFirstYear);

      const round2 = (n: number): number => Math.round(n * 100) / 100;
      let cumulativeAmount = 0;
      for (let i = 0; i < years; i++) {
        const year = startYear + i;
        cumulativeAmount = round2(cumulativeAmount + yearAmounts[i]);
        const remainingValue = round2(netAmount - cumulativeAmount);
        const isFinalYear = i === years - 1;

        await client.query(
          `INSERT INTO expense_depreciation_schedule
           (expense_id, user_id, year, amount, cumulative_amount, remaining_value, is_final_year)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [expenseId, userId, year, yearAmounts[i], cumulativeAmount, remainingValue, isFinalYear]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Linear AfA: equal annual amounts, first year pro-rated by months held, and
   * the final year absorbs the rounding residual so the schedule sums to net.
   */
  private buildLinearAmounts(netAmount: number, years: number, monthsInFirstYear: number): number[] {
    const round2 = (n: number): number => Math.round(n * 100) / 100;
    const annual = netAmount / years;
    const firstYear = (annual / 12) * monthsInFirstYear;
    const amounts: number[] = [];
    let cumulative = 0;
    for (let i = 0; i < years; i++) {
      let amount: number;
      if (i === years - 1) {
        amount = round2(netAmount - cumulative); // residual (also the years===1 case)
      } else if (i === 0) {
        amount = round2(firstYear);
      } else {
        amount = round2(annual);
      }
      amounts.push(amount);
      cumulative = round2(cumulative + amount);
    }
    return amounts;
  }

  /**
   * Degressive (declining-balance) AfA per German §7(2) EStG:
   * a fixed percentage of the *remaining book value* each year, with a mandatory
   * switch to straight-line over the remaining life once that yields at least as
   * much (Übergang zur linearen AfA). The rate is min(factor × linear-rate, cap).
   *
   * The factor/cap are legally dated and depend on the acquisition year (e.g.
   * 2.5×/25% for 2020–2022, 2×/20% for 2024, 3×/30% for mid-2025 onward), so they
   * are configurable via DEPRECIATION_DEGRESSIVE_FACTOR / _CAP and DEFAULT to the
   * 2024 rule (2× / 20%). Operators must set them to match the asset's applicable
   * year. The first year is pro-rated by months held; the last year absorbs the
   * residual so the schedule still sums exactly to net_amount.
   */
  private buildDegressiveAmounts(netAmount: number, years: number, monthsInFirstYear: number): number[] {
    const round2 = (n: number): number => Math.round(n * 100) / 100;
    const factor = Number(process.env.DEPRECIATION_DEGRESSIVE_FACTOR ?? '2');
    const cap = Number(process.env.DEPRECIATION_DEGRESSIVE_CAP ?? '0.20');
    const rate = Math.min(factor * (1 / years), cap);

    const amounts: number[] = [];
    let book = netAmount;
    let switched = false;
    for (let i = 0; i < years; i++) {
      const remainingYears = years - i;
      const proRata = i === 0 ? monthsInFirstYear / 12 : 1;
      let amount: number;
      if (i === years - 1) {
        amount = round2(book); // final year: whatever book value remains
      } else {
        const degressive = book * rate * proRata;
        const straightLine = (book / remainingYears) * proRata;
        // Switch to straight-line once it is at least as large, and stay there.
        if (switched || straightLine >= degressive) {
          switched = true;
          amount = round2(straightLine);
        } else {
          amount = round2(degressive);
        }
      }
      amounts.push(amount);
      book = round2(book - amount);
    }
    return amounts;
  }

  /**
   * Update depreciation settings for an expense
   * 
   * If the expense is a recurring template (parent), this will also:
   * - Update all generated child expenses with the same depreciation settings
   * - Generate depreciation schedules for all children if partial depreciation
   *
   * @param {string} expenseId - Expense ID
   * @param {string} userId - User ID
   * @param {Object} depreciationData - Depreciation settings
   * @returns {Promise<Expense>} Updated expense
   */
  async updateDepreciationSettings(
    expenseId: string,
    userId: string,
    depreciationData: {
      depreciation_type: 'none' | 'immediate' | 'partial';
      depreciation_years?: number;
      depreciation_start_date?: Date;
      depreciation_method?: 'linear' | 'degressive';
      useful_life_category?: string;
      category?: string; // AI-suggested expense category
      tax_deductible_percentage?: number;
      tax_deductibility_reasoning?: string;
      ai_recommendation?: string;
      ai_analysis_performed?: boolean;
    }
  ): Promise<Expense> {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Get expense details
      const expenseResult = await client.query(
        'SELECT * FROM expenses WHERE id = $1 AND user_id = $2',
        [expenseId, userId]
      );

      if (expenseResult.rows.length === 0) {
        throw new Error('Expense not found');
      }

      const expense = expenseResult.rows[0];
      const netAmount = parseFloat(expense.net_amount);

      // Calculate tax_deductible_amount based on depreciation type
      let taxDeductibleAmount: number;

      if (depreciationData.depreciation_type === 'none' || depreciationData.depreciation_type === 'immediate') {
        // Immediate deduction
        taxDeductibleAmount = netAmount;
      } else if (depreciationData.depreciation_type === 'partial') {
        // Calculate first year amount
        if (!depreciationData.depreciation_years || !depreciationData.depreciation_start_date) {
          throw new Error('depreciation_years and depreciation_start_date required for partial depreciation');
        }

        // For 1-year depreciation, always use full amount (no pro-rata)
        // Since 2021, IT equipment has 1-year useful life and is fully deductible in year of purchase
        if (depreciationData.depreciation_years === 1) {
          taxDeductibleAmount = netAmount;
        } else {
          // For multi-year depreciation, calculate pro-rata for first year
          const annualDepreciation = netAmount / depreciationData.depreciation_years;
          const startMonth = new Date(depreciationData.depreciation_start_date).getMonth() + 1;
          const monthsInFirstYear = 13 - startMonth;
          taxDeductibleAmount = (annualDepreciation / 12) * monthsInFirstYear;
        }

        // Generate depreciation schedule
        await this.calculateDepreciationSchedule(
          expenseId,
          userId,
          depreciationData.depreciation_years,
          new Date(depreciationData.depreciation_start_date),
          depreciationData.depreciation_method || 'linear'
        );
      } else {
        taxDeductibleAmount = netAmount;
      }

      // Update expense with depreciation settings
      const updateQuery = `
        UPDATE expenses
        SET
          depreciation_type = $1,
          depreciation_years = $2,
          depreciation_start_date = $3,
          depreciation_method = $4,
          useful_life_category = $5,
          tax_deductible_amount = $6,
          category = COALESCE($7, category),
          tax_deductible_percentage = COALESCE($8, tax_deductible_percentage),
          tax_deductibility_reasoning = COALESCE($9, tax_deductibility_reasoning),
          ai_recommendation = $10,
          ai_analysis_performed = $11,
          ai_analyzed_at = CASE WHEN $11 = true THEN CURRENT_TIMESTAMP ELSE ai_analyzed_at END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $12 AND user_id = $13
        RETURNING *
      `;

      const updateResult = await client.query(updateQuery, [
        depreciationData.depreciation_type,
        depreciationData.depreciation_years || null,
        depreciationData.depreciation_start_date || null,
        depreciationData.depreciation_method || 'linear',
        depreciationData.useful_life_category || null,
        taxDeductibleAmount,
        depreciationData.category || null,
        depreciationData.tax_deductible_percentage || null,
        depreciationData.tax_deductibility_reasoning || null,
        depreciationData.ai_recommendation || null,
        depreciationData.ai_analysis_performed ?? false,
        expenseId,
        userId,
      ]);

      // If this is a recurring template (parent expense), update all generated children too
      if (expense.is_recurring && !expense.parent_expense_id) {
        await client.query(`
          UPDATE expenses
          SET
            depreciation_type = $1,
            depreciation_years = $2,
            depreciation_start_date = $3,
            depreciation_method = $4,
            useful_life_category = $5,
            tax_deductible_amount = $6,
            category = COALESCE($7, category),
            tax_deductible_percentage = COALESCE($8, tax_deductible_percentage),
            tax_deductibility_reasoning = COALESCE($9, tax_deductibility_reasoning),
            ai_recommendation = $10,
            ai_analysis_performed = $11,
            ai_analyzed_at = CASE WHEN $11 = true THEN CURRENT_TIMESTAMP ELSE ai_analyzed_at END,
            updated_at = CURRENT_TIMESTAMP
          WHERE parent_expense_id = $12 AND user_id = $13
        `, [
          depreciationData.depreciation_type,
          depreciationData.depreciation_years || null,
          depreciationData.depreciation_start_date || null,
          depreciationData.depreciation_method || 'linear',
          depreciationData.useful_life_category || null,
          taxDeductibleAmount,
          depreciationData.category || null,
          depreciationData.tax_deductible_percentage || null,
          depreciationData.tax_deductibility_reasoning || null,
          depreciationData.ai_recommendation || null,
          depreciationData.ai_analysis_performed ?? false,
          expenseId, // parent_expense_id
          userId,
        ]);

        // Also generate depreciation schedules for all children if partial depreciation
        if (depreciationData.depreciation_type === 'partial' && 
            depreciationData.depreciation_years && 
            depreciationData.depreciation_start_date) {
          
          const childExpenses = await client.query(
            'SELECT id FROM expenses WHERE parent_expense_id = $1 AND user_id = $2',
            [expenseId, userId]
          );

          for (const child of childExpenses.rows) {
            await this.calculateDepreciationSchedule(
              child.id,
              userId,
              depreciationData.depreciation_years,
              new Date(depreciationData.depreciation_start_date),
              depreciationData.depreciation_method || 'linear'
            );
          }
        }
      }

      await client.query('COMMIT');
      return updateResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get tax-deductible amount for a specific year
   *
   * @param {string} expenseId - Expense ID
   * @param {string} userId - User ID
   * @param {number} year - Year to get deduction for
   * @returns {Promise<number>} Tax-deductible amount
   */
  async getTaxDeductibleAmount(expenseId: string, userId: string, year: number): Promise<number> {
    const expenseResult = await this.db.query(
      'SELECT depreciation_type, net_amount, tax_deductible_amount, EXTRACT(YEAR FROM expense_date) as expense_year FROM expenses WHERE id = $1 AND user_id = $2',
      [expenseId, userId]
    );

    if (expenseResult.rows.length === 0) {
      throw new Error('Expense not found');
    }

    const expense = expenseResult.rows[0];
    const expenseYear = parseInt(expense.expense_year);

    if (expense.depreciation_type === 'none' || expense.depreciation_type === 'immediate') {
      // Fully deductible in expense year only
      return year === expenseYear ? parseFloat(expense.net_amount) : 0;
    }

    if (expense.depreciation_type === 'partial') {
      // Get from depreciation schedule
      const scheduleResult = await this.db.query(
        'SELECT amount FROM expense_depreciation_schedule WHERE expense_id = $1 AND year = $2',
        [expenseId, year]
      );

      return scheduleResult.rows.length > 0 ? parseFloat(scheduleResult.rows[0].amount) : 0;
    }

    return 0;
  }

  /**
   * Get depreciation schedule for an expense
   *
   * @param {string} expenseId - Expense ID
   * @param {string} userId - User ID
   * @returns {Promise<any[]>} Depreciation schedule entries
   */
  async getDepreciationSchedule(expenseId: string, userId: string): Promise<any[]> {
    const query = `
      SELECT
        year,
        amount,
        cumulative_amount,
        remaining_value,
        is_final_year
      FROM expense_depreciation_schedule
      WHERE expense_id = $1 AND user_id = $2
      ORDER BY year ASC
    `;

    const result = await this.db.query(query, [expenseId, userId]);
    return result.rows.map(row => ({
      year: row.year,
      amount: parseFloat(row.amount),
      cumulative_amount: parseFloat(row.cumulative_amount),
      remaining_value: parseFloat(row.remaining_value),
      is_final_year: row.is_final_year,
    }));
  }
}
