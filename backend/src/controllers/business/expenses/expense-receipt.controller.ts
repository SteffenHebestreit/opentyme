/**
 * @fileoverview Expense receipt endpoints: AI analysis of uploaded receipts and
 * receipt file upload / download / deletion.
 * @module controllers/business/expenses/expense-receipt
 */

import { Request, Response } from 'express';
import { ExpenseService } from '../../../services/business/expense.service';
import { expenseIdSchema } from '../../../schemas/business/expense.schema';
import {
  ExpenseExtractionService,
  ReceiptAnalysisError,
  ReceiptAnalysisErrorCode,
} from '../../../services/ai/expense-extraction.service';
import { logger } from '../../../utils/logger';

/**
 * HTTP status per receipt analysis error code (API contract §5).
 */
const RECEIPT_ERROR_STATUS: Record<ReceiptAnalysisErrorCode, number> = {
  NO_TEXT: 422,
  AI_UNREACHABLE: 503,
  AI_TIMEOUT: 504,
  AI_AUTH: 502,
  AI_INVALID_RESPONSE: 502,
  EXTRACTION_FAILED: 502,
};

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
        res.status(400).json({ error: 'Bad request', message: 'No file uploaded', code: 'NO_FILE' });
        return;
      }

      // The MCP server's file_to_markdown handles photographed and scanned
      // receipts as well as PDFs, so images are analysable too. Keep this list
      // in sync with the multer fileFilter in expense.routes.ts.
      const ANALYSABLE_TYPES = [
        'application/pdf',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
      ];
      if (!ANALYSABLE_TYPES.includes(req.file.mimetype)) {
        res.status(400).json({
          error: 'Bad request',
          message: `Unsupported file type "${req.file.mimetype}". Upload a PDF or an image (JPEG, PNG, WebP).`,
          code: 'UNSUPPORTED_TYPE',
        });
        return;
      }

      logger.info(`Analyzing receipt (${req.file.mimetype}, ${req.file.size} bytes)`);

      try {
        // Step 1: Load the user's settings. Per-request instance — the service
        // holds per-user client/model state. The document converter is set up
        // even with AI disabled, so the raw text can still be returned.
        const expenseExtractionService = new ExpenseExtractionService();
        await expenseExtractionService.initialize(userId);

        // Step 2: Extract text from the document using the user's converter
        const extractedText = await expenseExtractionService.extractDocumentText(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype
        );

        // Step 3: Extract structured expense data using AI
        if (expenseExtractionService.isEnabled()) {
          const extractedData = await expenseExtractionService.extractExpenseData(extractedText);

          res.status(200).json({
            success: true,
            ai_enabled: true,
            data: extractedData,
            message: 'Receipt analyzed successfully',
          });
        } else {
          // AI is disabled, return only raw text
          res.status(200).json({
            success: true,
            ai_enabled: false,
            data: {
              raw_text: extractedText.substring(0, 1000), // First 1000 chars
              confidence: 0,
            },
            message: 'AI extraction is disabled. Please enable it in settings.',
          });
        }
      } catch (extractionError: any) {
        if (extractionError instanceof ReceiptAnalysisError) {
          // Upstream details were logged where they happened; the client gets
          // a stable code and a short message only.
          const status = RECEIPT_ERROR_STATUS[extractionError.code] ?? 502;
          logger.warn(
            `Receipt analysis failed: ${extractionError.code} (${extractionError.service})`
          );
          res.status(status).json({
            success: false,
            error: extractionError.message,
            message: extractionError.message,
            code: extractionError.code,
            service: extractionError.service,
          });
          return;
        }

        // The logger JSON.stringifies its meta argument, and an Error serialises
        // to "{}" — pull the useful parts out explicitly.
        logger.error('Receipt analysis failed:', {
          message: extractionError?.message,
          code: extractionError?.code,
          stack: extractionError?.stack,
        });
        res.status(500).json({
          success: false,
          error: 'Receipt analysis failed',
          message: 'Receipt analysis failed',
          code: 'INTERNAL',
        });
      }
    } catch (error: any) {
      logger.error('Analyze receipt error:', { message: error?.message, stack: error?.stack });
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL' });
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
