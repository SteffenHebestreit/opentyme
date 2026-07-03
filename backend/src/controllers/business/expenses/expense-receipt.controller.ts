/**
 * @fileoverview Expense receipt endpoints: AI analysis of uploaded receipts and
 * receipt file upload / download / deletion.
 * @module controllers/business/expenses/expense-receipt
 */

import { Request, Response } from 'express';
import { ExpenseService } from '../../../services/business/expense.service';
import { expenseIdSchema } from '../../../schemas/business/expense.schema';
import { ExpenseExtractionService } from '../../../services/ai/expense-extraction.service';
import { logger } from '../../../utils/logger';

export class ExpenseReceiptController {
  private expenseService: ExpenseService;

  constructor() {
    this.expenseService = new ExpenseService();
  }

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
        // Step 1: Initialize AI service with user settings (loads MCP client too).
        // Per-request instance — the service holds per-user client/model state.
        const expenseExtractionService = new ExpenseExtractionService();
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
      logger.error('Upload receipt error:', error);
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
      logger.error('Delete receipt error:', error);
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
      logger.error('Download receipt error:', error);
      if (error.message.includes('not found') || error.message.includes('unauthorized')) {
        res.status(404).json({ error: 'Not found', message: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error', message: error.message });
      }
    }
  };
}
