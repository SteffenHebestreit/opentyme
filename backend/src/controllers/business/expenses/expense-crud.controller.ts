/**
 * @fileoverview Expense CRUD endpoints: create, list (filtered), get, update, delete.
 * @module controllers/business/expenses/expense-crud
 */

import { Request, Response } from 'express';
import { ExpenseService } from '../../../services/business/expense.service';
import {
  createExpenseSchema,
  updateExpenseSchema,
  expenseIdSchema,
  expenseFilterSchema,
} from '../../../schemas/business/expense.schema';
import { logger } from '../../../utils/logger';

export class ExpenseCrudController {
  private expenseService: ExpenseService;

  constructor() {
    this.expenseService = new ExpenseService();
  }

  /**
   * Create a new expense
   * POST /api/expenses
   */
  createExpense = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' });
        return;
      }

      // Validate request body
      const { error, value: validatedData } = createExpenseSchema.validate(req.body);
      if (error) {
        res.status(400).json({ error: 'Validation error', details: error.details });
        return;
      }

      // Create expense
      const expense = await this.expenseService.createExpense(userId, validatedData);

      res.status(201).json(expense);
    } catch (error: any) {
      logger.error('Create expense error:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  };

  /**
   * Get all expenses with filtering
   * GET /api/expenses
   */
  getExpenses = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' });
        return;
      }

      // Validate and parse query parameters
      const { error, value: filters } = expenseFilterSchema.validate({
        ...req.query,
        user_id: userId, // Always filter by authenticated user
      });

      if (error) {
        res.status(400).json({ error: 'Validation error', details: error.details });
        return;
      }

      // Convert string booleans to actual booleans
      if (filters.is_billable !== undefined) {
        filters.is_billable = filters.is_billable === 'true';
      }
      if (filters.is_reimbursable !== undefined) {
        filters.is_reimbursable = filters.is_reimbursable === 'true';
      }

      // Get expenses
      const result = await this.expenseService.getExpenses(filters);

      res.status(200).json({
        expenses: result.expenses,
        total: result.total,
        limit: filters.limit,
        offset: filters.offset,
      });
    } catch (error: any) {
      logger.error('Get expenses error:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  };

  /**
   * Get single expense by ID
   * GET /api/expenses/:id
   */
  getExpenseById = async (req: Request, res: Response): Promise<void> => {
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

      // Get expense
      const expense = await this.expenseService.getExpenseById(idValue.id, userId);

      if (!expense) {
        res.status(404).json({ error: 'Not found', message: 'Expense not found' });
        return;
      }

      res.status(200).json(expense);
    } catch (error: any) {
      logger.error('Get expense by ID error:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  };

  /**
   * Update an expense
   * PUT /api/expenses/:id
   */
  updateExpense = async (req: Request, res: Response): Promise<void> => {
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

      // Validate request body
      const { error: bodyError, value: validatedData } = updateExpenseSchema.validate(req.body);
      if (bodyError) {
        res.status(400).json({ error: 'Validation error', details: bodyError.details });
        return;
      }

      // Update expense
      const expense = await this.expenseService.updateExpense(idValue.id, userId, validatedData);

      res.status(200).json(expense);
    } catch (error: any) {
      logger.error('Update expense error:', error);
      if (error.message.includes('not found') || error.message.includes('unauthorized')) {
        res.status(404).json({ error: 'Not found', message: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error', message: error.message });
      }
    }
  };

  /**
   * Delete an expense
   * DELETE /api/expenses/:id
   */
  deleteExpense = async (req: Request, res: Response): Promise<void> => {
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

      // Delete expense
      await this.expenseService.deleteExpense(idValue.id, userId);

      res.status(204).send();
    } catch (error: any) {
      logger.error('Delete expense error:', error);
      if (error.message.includes('not found') || error.message.includes('unauthorized')) {
        res.status(404).json({ error: 'Not found', message: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error', message: error.message });
      }
    }
  };
}
