/**
 * @fileoverview Expense workflow & reporting endpoints: approval/reimbursement,
 * summaries, billable expenses, recurring-expense queries and manual trigger.
 * @module controllers/business/expenses/expense-workflow
 */

import { Request, Response } from 'express';
import { ExpenseService } from '../../../services/business/expense.service';
import {
  expenseIdSchema,
  approveExpenseSchema,
  expenseSummarySchema,
} from '../../../schemas/business/expense.schema';
import { ExpenseStatus } from '../../../models/business/expense.model';
import { logger } from '../../../utils/logger';

export class ExpenseWorkflowController {
  private expenseService: ExpenseService;

  constructor() {
    this.expenseService = new ExpenseService();
  }

  /**
   * Approve or reject an expense
   * PATCH /api/expenses/:id/approve
   */
  approveExpense = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' });
        return;
      }

      // Check if user is admin (optional - add role check if needed)
      // if (req.user?.role !== 'admin') {
      //   res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
      //   return;
      // }

      // Validate ID parameter
      const { error: idError, value: idValue } = expenseIdSchema.validate(req.params);
      if (idError) {
        res.status(400).json({ error: 'Validation error', details: idError.details });
        return;
      }

      // Validate request body
      const { error: bodyError, value: bodyValue } = approveExpenseSchema.validate(req.body);
      if (bodyError) {
        res.status(400).json({ error: 'Validation error', details: bodyError.details });
        return;
      }

      // Approve/reject expense
      const expense = await this.expenseService.approveExpense(
        idValue.id,
        userId,
        bodyValue.status as ExpenseStatus.APPROVED | ExpenseStatus.REJECTED,
        bodyValue.notes
      );

      res.status(200).json(expense);
    } catch (error: any) {
      logger.error('Approve expense error:', error);
      if (error.message.includes('not found') || error.message.includes('unauthorized')) {
        res.status(404).json({ error: 'Not found', message: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error', message: error.message });
      }
    }
  };

  /**
   * Mark expense as reimbursed
   * PATCH /api/expenses/:id/reimburse
   */
  reimburseExpense = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' });
        return;
      }

      // Validate ID parameter
      const { error: idError, value: idValue } = expenseIdSchema.validate(req.params);
      if (idError) {
        res.status(400).json({ error: 'Validation error', details: idError.details });
        return;
      }

      // Mark as reimbursed
      const expense = await this.expenseService.markReimbursed(idValue.id, userId);

      res.status(200).json(expense);
    } catch (error: any) {
      logger.error('Reimburse expense error:', error);
      if (error.message.includes('not found') || error.message.includes('unauthorized')) {
        res.status(404).json({ error: 'Not found', message: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error', message: error.message });
      }
    }
  };

  /**
   * Get expense summary/analytics
   * GET /api/expenses/summary
   */
  getExpenseSummary = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' });
        return;
      }

      // Validate query parameters
      const { error, value: filters } = expenseSummarySchema.validate(req.query);
      if (error) {
        res.status(400).json({ error: 'Validation error', details: error.details });
        return;
      }

      // Get summary
      const summary = await this.expenseService.getExpenseSummary(userId, {
        date_from: filters.date_from,
        date_to: filters.date_to,
        project_id: filters.project_id,
      });

      res.status(200).json(summary);
    } catch (error: any) {
      logger.error('Get expense summary error:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  };

  /**
   * Get billable expenses for a project
   * GET /api/expenses/project/:projectId/billable
   */
  getBillableExpenses = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' });
        return;
      }

      const { projectId } = req.params;

      if (!projectId) {
        res.status(400).json({ error: 'Bad request', message: 'Project ID is required' });
        return;
      }

      // Get billable expenses
      const expenses = await this.expenseService.getBillableExpensesForProject(projectId, userId);

      res.status(200).json(expenses);
    } catch (error: any) {
      logger.error('Get billable expenses error:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  };

  /**
   * Get all generated expenses from a recurring template
   */
  getRecurringGeneratedExpenses = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { expenseId } = req.params;

      // Get all expenses generated from this parent
      const expenses = await this.expenseService.getExpensesByParent(expenseId, userId);

      res.status(200).json(expenses);
    } catch (error: any) {
      logger.error('Get recurring generated expenses error:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  };

  /**
   * Manually trigger recurring expense processing
   * POST /api/expenses/recurring/trigger
   */
  triggerRecurringExpenses = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Import and trigger the scheduler
      const recurringExpenseScheduler = (await import('../../../services/financial/recurring-expense-scheduler.service')).default;
      await recurringExpenseScheduler.triggerManually();

      res.status(200).json({
        success: true,
        message: 'Recurring expense processing triggered successfully'
      });
    } catch (error: any) {
      logger.error('[Recurring] Trigger error:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  };
}
