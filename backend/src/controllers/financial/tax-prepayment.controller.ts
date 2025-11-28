/**
 * @fileoverview Tax Prepayment Controller
 * 
 * Handles HTTP requests for tax prepayment management.
 * 
 * @module controllers/financial/tax-prepayment
 */

import { Request, Response } from 'express';
import { TaxPrepaymentService } from '../../services/financial/tax-prepayment.service';
import {
  createTaxPrepaymentSchema,
  updateTaxPrepaymentSchema,
  taxPrepaymentIdSchema,
  taxPrepaymentFiltersSchema,
} from '../../schemas/financial/tax-prepayment.schema';

export class TaxPrepaymentController {
  private taxPrepaymentService = new TaxPrepaymentService();

  /**
   * Get all tax prepayments with filtering
   * GET /api/tax-prepayments
   */
  getTaxPrepayments = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' });
        return;
      }

      // Validate query parameters
      const { error: filterError, value: filterValue } = taxPrepaymentFiltersSchema.validate(req.query);
      if (filterError) {
        res.status(400).json({ error: 'Validation error', details: filterError.details });
        return;
      }

      const filters = { ...filterValue, user_id: userId };
      const result = await this.taxPrepaymentService.getTaxPrepayments(filters);

      res.status(200).json(result);
    } catch (error: any) {
      console.error('Get tax prepayments error:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  };

  /**
   * Get single tax prepayment by ID
   * GET /api/tax-prepayments/:id
   */
  getTaxPrepaymentById = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' });
        return;
      }

      // Validate ID parameter
      const { error: idError, value: idValue } = taxPrepaymentIdSchema.validate(req.params);
      if (idError) {
        res.status(400).json({ error: 'Validation error', details: idError.details });
        return;
      }

      const prepayment = await this.taxPrepaymentService.getTaxPrepaymentById(idValue.id, userId);
      if (!prepayment) {
        res.status(404).json({ error: 'Not found', message: 'Tax prepayment not found' });
        return;
      }

      res.status(200).json(prepayment);
    } catch (error: any) {
      console.error('Get tax prepayment by ID error:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  };

  /**
   * Get tax prepayment summary
   * GET /api/tax-prepayments/summary
   */
  getTaxPrepaymentSummary = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' });
        return;
      }

      const taxYear = req.query.tax_year ? parseInt(req.query.tax_year as string) : undefined;
      const summary = await this.taxPrepaymentService.getSummary(userId, taxYear);

      res.status(200).json(summary);
    } catch (error: any) {
      console.error('Get tax prepayment summary error:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  };

  /**
   * Create new tax prepayment
   * POST /api/tax-prepayments
   */
  createTaxPrepayment = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' });
        return;
      }

      // Validate request body
      const { error: validationError, value: validatedData } = createTaxPrepaymentSchema.validate(req.body);
      if (validationError) {
        res.status(400).json({ error: 'Validation error', details: validationError.details });
        return;
      }

      const prepayment = await this.taxPrepaymentService.createTaxPrepayment(userId, validatedData);

      res.status(201).json(prepayment);
    } catch (error: any) {
      console.error('Create tax prepayment error:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  };

  /**
   * Update tax prepayment
   * PUT /api/tax-prepayments/:id
   */
  updateTaxPrepayment = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' });
        return;
      }

      // Validate ID parameter
      const { error: idError, value: idValue } = taxPrepaymentIdSchema.validate(req.params);
      if (idError) {
        res.status(400).json({ error: 'Validation error', details: idError.details });
        return;
      }

      // Validate request body
      const { error: validationError, value: validatedData } = updateTaxPrepaymentSchema.validate(req.body);
      if (validationError) {
        res.status(400).json({ error: 'Validation error', details: validationError.details });
        return;
      }

      const prepayment = await this.taxPrepaymentService.updateTaxPrepayment(idValue.id, userId, validatedData);

      res.status(200).json(prepayment);
    } catch (error: any) {
      console.error('Update tax prepayment error:', error);
      if (error.message.includes('not found') || error.message.includes('unauthorized')) {
        res.status(404).json({ error: 'Not found', message: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error', message: error.message });
      }
    }
  };

  /**
   * Delete tax prepayment
   * DELETE /api/tax-prepayments/:id
   */
  deleteTaxPrepayment = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' });
        return;
      }

      // Validate ID parameter
      const { error: idError, value: idValue } = taxPrepaymentIdSchema.validate(req.params);
      if (idError) {
        res.status(400).json({ error: 'Validation error', details: idError.details });
        return;
      }

      await this.taxPrepaymentService.deleteTaxPrepayment(idValue.id, userId);

      res.status(204).send();
    } catch (error: any) {
      console.error('Delete tax prepayment error:', error);
      if (error.message.includes('not found') || error.message.includes('unauthorized')) {
        res.status(404).json({ error: 'Not found', message: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error', message: error.message });
      }
    }
  };

  /**
   * Upload receipt for tax prepayment
   * POST /api/tax-prepayments/:id/receipt
   */
  uploadReceipt = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' });
        return;
      }

      // Validate ID parameter
      const { error: idError, value: idValue } = taxPrepaymentIdSchema.validate(req.params);
      if (idError) {
        res.status(400).json({ error: 'Validation error', details: idError.details });
        return;
      }

      // Check if file was uploaded
      if (!req.file) {
        res.status(400).json({ error: 'Validation error', message: 'Receipt file is required' });
        return;
      }

      const prepayment = await this.taxPrepaymentService.saveReceipt(
        idValue.id,
        userId,
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        req.file.size
      );

      res.status(200).json(prepayment);
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
   * Download receipt file
   * GET /api/tax-prepayments/:id/receipt/download
   */
  downloadReceipt = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' });
        return;
      }

      // Validate ID parameter
      const { error: idError, value: idValue } = taxPrepaymentIdSchema.validate(req.params);
      if (idError) {
        res.status(400).json({ error: 'Validation error', details: idError.details });
        return;
      }

      const { stream, filename, mimetype } = await this.taxPrepaymentService.getReceiptFileStream(
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
   * Delete receipt from tax prepayment
   * DELETE /api/tax-prepayments/:id/receipt
   */
  deleteReceipt = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' });
        return;
      }

      // Validate ID parameter
      const { error: idError, value: idValue } = taxPrepaymentIdSchema.validate(req.params);
      if (idError) {
        res.status(400).json({ error: 'Validation error', details: idError.details });
        return;
      }

      const prepayment = await this.taxPrepaymentService.deleteReceipt(idValue.id, userId);

      res.status(200).json(prepayment);
    } catch (error: any) {
      console.error('Delete receipt error:', error);
      if (error.message.includes('not found') || error.message.includes('unauthorized')) {
        res.status(404).json({ error: 'Not found', message: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error', message: error.message });
      }
    }
  };
}
