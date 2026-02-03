/**
 * @fileoverview Recurring Expense Scheduler Service
 * 
 * Handles automatic generation of recurring expenses (monthly, quarterly, yearly).
 * Runs on a cron schedule to check for expenses due for generation.
 * 
 * @module services/financial/recurring-expense-scheduler.service
 */

import cron, { ScheduledTask } from 'node-cron';
import { getDbClient } from '../../utils/database';
import { RecurrenceFrequency } from '../../models/business/expense.model';

const pool = getDbClient();

class RecurringExpenseSchedulerService {
  private cronJob: ScheduledTask | null = null;

  /**
   * Initialize the scheduler
   * Runs daily at 2 AM to generate recurring expenses
   */
  public initialize(): void {
    console.log('[RecurringExpenseScheduler] Initializing scheduler...');
    
    // Run daily at 2:00 AM
    this.cronJob = cron.schedule('0 2 * * *', async () => {
      console.log('[RecurringExpenseScheduler] Running scheduled recurring expense generation...');
      await this.processRecurringExpenses();
    });

    console.log('[RecurringExpenseScheduler] Scheduler initialized (runs daily at 2:00 AM)');
  }

  /**
   * Stop the scheduler
   */
  public stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      console.log('[RecurringExpenseScheduler] Scheduler stopped');
    }
  }

  /**
   * Process all active recurring expenses
   * Generates new expense entries for recurring expenses that are due
   */
  public async processRecurringExpenses(): Promise<void> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Find all recurring expenses that need processing
      // (next_occurrence is today or in the past, and not ended yet)
      const query = `
        SELECT *
        FROM expenses
        WHERE is_recurring = true
          AND status != 'rejected'
          AND next_occurrence <= CURRENT_DATE
          AND (recurrence_end_date IS NULL OR recurrence_end_date >= CURRENT_DATE)
          AND parent_expense_id IS NULL  -- Only process parent templates, not generated expenses
        ORDER BY next_occurrence ASC
      `;

      const result = await client.query(query);
      const recurringExpenses = result.rows;

      console.log(`[RecurringExpenseScheduler] Found ${recurringExpenses.length} recurring expenses to process`);

      for (const expense of recurringExpenses) {
        try {
          await this.generateExpenseInstance(client, expense);
        } catch (error) {
          console.error(
            `[RecurringExpenseScheduler] Error generating instance for expense ${expense.id}:`,
            error
          );
          // Continue processing other expenses
        }
      }

      await client.query('COMMIT');
      console.log(`[RecurringExpenseScheduler] Successfully processed ${recurringExpenses.length} recurring expenses`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[RecurringExpenseScheduler] Error processing recurring expenses:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generate a new expense instance from a recurring expense template
   * This method now generates ALL missed occurrences up to today
   */
  private async generateExpenseInstance(client: any, template: any): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    
    let currentOccurrence = template.next_occurrence;
    let generatedCount = 0;
    
    // Generate all missed occurrences up to today
    while (currentOccurrence <= todayStr) {
      // Check if we've exceeded end date
      if (template.recurrence_end_date && currentOccurrence > template.recurrence_end_date) {
        console.log(
          `[RecurringExpenseScheduler] Recurring expense ${template.id} has reached end date, stopping generation`
        );
        // Set next_occurrence to null to stop processing
        await client.query(
          'UPDATE expenses SET next_occurrence = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
          [template.id]
        );
        return;
      }

      // Create new expense instance
      const insertQuery = `
        INSERT INTO expenses (
          user_id,
          project_id,
          category,
          description,
          amount,
          net_amount,
          tax_rate,
          tax_amount,
          currency,
          expense_date,
          is_billable,
          is_reimbursable,
          status,
          tags,
          notes,
          is_recurring,
          parent_expense_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING id
      `;

      const values = [
        template.user_id,
        template.project_id,
        template.category,
        `${template.description} (Auto-generated)`,
        template.amount,
        template.net_amount,
        template.tax_rate,
        template.tax_amount,
        template.currency,
        currentOccurrence, // Use the occurrence date as expense_date
        template.is_billable,
        template.is_reimbursable,
        'approved', // Auto-approve generated expenses
        template.tags,
        template.notes,
        false, // Generated expenses are not recurring themselves
        template.id, // Link to parent template
      ];

      const result = await client.query(insertQuery, values);
      const newExpenseId = result.rows[0].id;
      generatedCount++;

      console.log(
        `[RecurringExpenseScheduler] Generated expense ${newExpenseId} from template ${template.id} for date ${currentOccurrence}`
      );

      // Calculate next occurrence
      currentOccurrence = this.calculateNextOccurrence(
        currentOccurrence,
        template.recurrence_frequency
      );
    }

    // Update parent template's next_occurrence to the next future date
    await client.query(
      'UPDATE expenses SET next_occurrence = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [currentOccurrence, template.id]
    );

    if (generatedCount > 1) {
      console.log(
        `[RecurringExpenseScheduler] Caught up on ${generatedCount} missed occurrences for expense ${template.id}`
      );
    }
  }

  /**
   * Calculate the next occurrence date based on frequency
   */
  private calculateNextOccurrence(currentDate: string, frequency: string): string {
    const date = new Date(currentDate);

    switch (frequency) {
      case RecurrenceFrequency.MONTHLY:
        date.setMonth(date.getMonth() + 1);
        break;
      case RecurrenceFrequency.QUARTERLY:
        date.setMonth(date.getMonth() + 3);
        break;
      case RecurrenceFrequency.YEARLY:
        date.setFullYear(date.getFullYear() + 1);
        break;
      default:
        throw new Error(`Unknown recurrence frequency: ${frequency}`);
    }

    return date.toISOString().split('T')[0]; // Return YYYY-MM-DD
  }

  /**
   * Manually trigger recurring expense processing (for testing or manual runs)
   */
  public async triggerManually(): Promise<void> {
    console.log('[RecurringExpenseScheduler] Manual trigger initiated');
    await this.processRecurringExpenses();
  }
}

export default new RecurringExpenseSchedulerService();
