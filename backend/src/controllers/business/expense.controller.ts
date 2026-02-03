/**
 * @fileoverview Expense controller for handling HTTP requests.
 * 
 * Provides endpoints for:
 * - CRUD operations on expenses
 * - Receipt file upload and deletion
 * - Expense approval workflow
 * - Expense analytics and summaries
 * 
 * @module controllers/business/expense
 */

import { Request, Response } from 'express';
import { ExpenseService } from '../../services/business/expense.service';
import {
  createExpenseSchema,
  updateExpenseSchema,
  expenseIdSchema,
  expenseFilterSchema,
  approveExpenseSchema,
  expenseSummarySchema,
} from '../../schemas/business/expense.schema';
import { ExpenseStatus } from '../../models/business/expense.model';
import { mcpClientService } from '../../services/ai/mcp-client.service';
import { expenseExtractionService } from '../../services/ai/expense-extraction.service';
import { AIDepreciationService } from '../../services/financial/ai-depreciation.service';
import { logger } from '../../utils/logger';

export class ExpenseController {
  private expenseService: ExpenseService;
  private aiDepreciationService: AIDepreciationService;

  constructor() {
    this.expenseService = new ExpenseService();
    this.aiDepreciationService = new AIDepreciationService();
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
      console.error('Create expense error:', error);
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
      console.error('Get expenses error:', error);
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
      console.error('Get expense by ID error:', error);
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
      console.error('Update expense error:', error);
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
      console.error('Delete expense error:', error);
      if (error.message.includes('not found') || error.message.includes('unauthorized')) {
        res.status(404).json({ error: 'Not found', message: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error', message: error.message });
      }
    }
  };

  /**
   * Analyze receipt PDF using AI to extract expense data
   * POST /api/expenses/analyze-receipt
   */
  analyzeReceipt = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' });
        return;
      }

      // Check if file was uploaded
      if (!req.file) {
        res.status(400).json({ error: 'Bad request', message: 'No file uploaded' });
        return;
      }

      // Validate file type (PDF only)
      if (req.file.mimetype !== 'application/pdf') {
        res.status(400).json({ error: 'Bad request', message: 'Only PDF files are supported' });
        return;
      }

      logger.info(`Analyzing receipt: ${req.file.originalname} (${req.file.size} bytes)`);

      try {
        // Step 1: Initialize AI service with user settings (loads MCP client too)
        await expenseExtractionService.initialize(userId);

        // Step 2: Extract text from PDF using user's MCP server
        const extractedText = await expenseExtractionService.extractPDFText(
          req.file.buffer,
          req.file.originalname
        );

        logger.info(`Extracted ${extractedText.length} characters from PDF`);

        // Step 3: Extract structured expense data using AI
        if (expenseExtractionService.isEnabled()) {
          const extractedData = await expenseExtractionService.extractExpenseData(extractedText);

          res.status(200).json({
            success: true,
            data: extractedData,
            message: 'Receipt analyzed successfully',
          });
        } else {
          // AI is disabled, return only raw text
          res.status(200).json({
            success: true,
            data: {
              raw_text: extractedText.substring(0, 1000), // First 1000 chars
              confidence: 0,
            },
            message: 'AI extraction is disabled. Please enable it in settings.',
          });
        }
      } catch (extractionError: any) {
        logger.error('Receipt analysis failed:', extractionError);
        res.status(500).json({
          success: false,
          error: 'Receipt analysis failed',
          message: extractionError.message,
        });
      }
    } catch (error: any) {
      logger.error('Analyze receipt error:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  };

  /**
   * Upload receipt for an expense
   * POST /api/expenses/:id/receipt
   */
  uploadReceipt = async (req: Request, res: Response): Promise<void> => {
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

      // Check if file was uploaded
      if (!req.file) {
        res.status(400).json({ error: 'Bad request', message: 'No file uploaded' });
        return;
      }

      // Upload receipt
      const expense = await this.expenseService.saveReceipt(idValue.id, userId, req.file);

      res.status(200).json(expense);
    } catch (error: any) {
      console.error('Upload receipt error:', error);
      if (error.message.includes('not found') || error.message.includes('unauthorized')) {
        res.status(404).json({ error: 'Not found', message: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error', message: error.message });
      }
    }
  };

  /**
   * Delete receipt from an expense
   * DELETE /api/expenses/:id/receipt
   */
  deleteReceipt = async (req: Request, res: Response): Promise<void> => {
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

      // Delete receipt
      const expense = await this.expenseService.deleteReceipt(idValue.id, userId);

      res.status(200).json(expense);
    } catch (error: any) {
      console.error('Delete receipt error:', error);
      if (error.message.includes('not found') || error.message.includes('unauthorized')) {
        res.status(404).json({ error: 'Not found', message: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error', message: error.message });
      }
    }
  };

  /**
   * Download receipt file
   * GET /api/expenses/:id/receipt/download
   */
  downloadReceipt = async (req: Request, res: Response): Promise<void> => {
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

      // Get receipt file stream
      const { stream, filename, mimetype } = await this.expenseService.getReceiptFileStream(
        idValue.id,
        userId
      );

      // Set response headers for file download
      res.setHeader('Content-Type', mimetype);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Pipe stream to response
      stream.pipe(res);
    } catch (error: any) {
      console.error('Download receipt error:', error);
      if (error.message.includes('not found') || error.message.includes('unauthorized')) {
        res.status(404).json({ error: 'Not found', message: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error', message: error.message });
      }
    }
  };

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
      console.error('Approve expense error:', error);
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
      console.error('Reimburse expense error:', error);
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
      console.error('Get expense summary error:', error);
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
      console.error('Get billable expenses error:', error);
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
      console.error('Get recurring generated expenses error:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  };

  /**
   * Analyze expense for depreciation using AI
   * POST /api/expenses/:id/analyze-depreciation
   */
  analyzeDepreciation = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { id } = req.params;

      // Get expense details
      const expense = await this.expenseService.getExpenseById(id, userId);
      if (!expense) {
        res.status(404).json({ error: 'Expense not found' });
        return;
      }

      // Check if expense is eligible for depreciation analysis
      // NOTE: We analyze ALL expenses now, not just those > 800€
      // Reasons:
      // 1. Insurance expenses need tax deductibility analysis (even if < 800€)
      // 2. AI can determine if it's an asset (GWG rules) or operating expense
      // 3. Operating expenses are always immediately deductible
      const netAmount = parseFloat(expense.net_amount?.toString() || '0');

      // Clear any previously saved AI analysis when re-analyzing
      logger.info(`[Depreciation] Clearing previous AI analysis for expense ${id}`);
      await this.expenseService.clearAIAnalysis(userId, id);
      
      // Analyze with AI - let AI determine treatment
      logger.info(`[Depreciation] Analyzing expense ${id} with AI for user ${userId}`);
      
      // Initialize AI service with user settings
      await this.aiDepreciationService.initialize(userId);
      
      const analysis = await this.aiDepreciationService.analyzeExpense({
        id: expense.id,
        description: expense.description || '',
        notes: expense.notes || '', // Include notes for better context
        category: expense.category || '',
        amount: parseFloat(expense.amount?.toString() || '0'),
        net_amount: netAmount,
        tax_amount: parseFloat(expense.tax_amount?.toString() || '0'),
        tax_rate: parseFloat(expense.tax_rate?.toString() || '0'),
        expense_date: expense.expense_date || new Date().toISOString(),
      });

      // DON'T save to database - let user decide to accept or reject
      // Only save when user explicitly clicks "Accept Recommendation"

      // Map old/deprecated category names to new ones
      const categoryMapping: { [key: string]: string } = {
        'hardware': 'computer', // Old "hardware" → new "computer"
        'office_supply': 'office_supplies',
        'professional_service': 'professional_services',
        'telecommunication': 'telecommunications',
        'vehicle': 'vehicle_car',
      };
      
      const suggestedCategory = analysis.suggested_category 
        ? (categoryMapping[analysis.suggested_category] || analysis.suggested_category)
        : expense.category;

      // Transform AI response to match frontend interface
      const formattedResponse = {
        eligible: true,
        analysis: {
          recommendation: analysis.recommendation,
          depreciation_type: analysis.recommendation,
          depreciation_years: analysis.suggested_years || null,
          useful_life_category: suggestedCategory || 'other', // Use suggested category as asset category
          suggested_category: suggestedCategory,
          category_reasoning: analysis.category_reasoning,
          confidence: analysis.confidence,
          reasoning: analysis.reasoning,
          tax_impact: {
            first_year_deduction: analysis.tax_deductible_amount,
            deferred_amount: netAmount - analysis.tax_deductible_amount,
          },
          tax_deductible_percentage: analysis.tax_deductible_percentage,
          tax_deductibility_reasoning: analysis.tax_deductibility_reasoning,
          references: analysis.references,
          sources: analysis.sources || [], // Include web search sources
        },
      };

      // Save the AI analysis response to database so it can be displayed when reopening the expense
      logger.info(`[Depreciation] Saving AI analysis response for expense ${id}`);
      await this.expenseService.saveAIAnalysis(userId, id, formattedResponse.analysis);

      res.status(200).json(formattedResponse);
    } catch (error: any) {
      logger.error('[Depreciation] Analysis error:', error);
      
      // Clear AI analysis on failure
      const { id } = req.params;
      const userId = req.user?.id;
      if (userId && id) {
        try {
          await this.expenseService.clearAIAnalysis(userId, id);
          logger.info(`[Depreciation] Cleared AI analysis for expense ${id} after failure`);
        } catch (clearError) {
          logger.error('[Depreciation] Failed to clear AI analysis:', clearError);
        }
      }
      
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  };

  /**
   * Update depreciation settings for an expense
   * PUT /api/expenses/:id/depreciation
   */
  updateDepreciation = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { id } = req.params;
      const {
        depreciation_type,
        depreciation_years,
        depreciation_start_date,
        depreciation_method,
        useful_life_category,
        category, // AI-suggested category
        tax_deductible_percentage,
        tax_deductibility_reasoning,
      } = req.body;

      // Validate required fields for partial depreciation
      if (depreciation_type === 'partial') {
        if (!depreciation_years || !depreciation_start_date) {
          res.status(400).json({
            error: 'depreciation_years and depreciation_start_date are required for partial depreciation',
          });
          return;
        }

        if (depreciation_years < 1 || depreciation_years > 50) {
          res.status(400).json({ error: 'depreciation_years must be between 1 and 50' });
          return;
        }
      }

      // Update depreciation settings
      const updatedExpense = await this.expenseService.updateDepreciationSettings(id, userId, {
        depreciation_type,
        depreciation_years,
        depreciation_start_date: depreciation_start_date ? new Date(depreciation_start_date) : undefined,
        depreciation_method: depreciation_method || 'linear',
        useful_life_category,
        category, // AI-suggested category
        tax_deductible_percentage,
        tax_deductibility_reasoning,
      });

      res.status(200).json(updatedExpense);
    } catch (error: any) {
      logger.error('[Depreciation] Update error:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  };

  /**
   * Get depreciation schedule for an expense
   * GET /api/expenses/:id/depreciation-schedule
   */
  getDepreciationSchedule = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { id } = req.params;

      // Get expense to verify it exists and user owns it
      const expense = await this.expenseService.getExpenseById(id, userId);
      if (!expense) {
        res.status(404).json({ error: 'Expense not found' });
        return;
      }

      // Get depreciation schedule
      const schedule = await this.expenseService.getDepreciationSchedule(id, userId);

      res.status(200).json({
        expense: {
          id: expense.id,
          description: expense.description,
          net_amount: expense.net_amount,
          depreciation_type: expense.depreciation_type,
          depreciation_years: expense.depreciation_years,
          depreciation_start_date: expense.depreciation_start_date,
          tax_deductible_amount: expense.tax_deductible_amount,
        },
        schedule,
      });
    } catch (error: any) {
      logger.error('[Depreciation] Get schedule error:', error);
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
      const recurringExpenseScheduler = (await import('../../services/financial/recurring-expense-scheduler.service')).default;
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
