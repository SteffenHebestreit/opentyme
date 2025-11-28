import { Request, Response } from 'express';
import { TaxRateService } from '../../services/financial/tax-rate.service';
import {
  createTaxRateSchema,
  updateTaxRateSchema,
  taxRateIdSchema
} from '../../schemas/financial/tax-rate.schema';

/**
 * Controller for handling HTTP requests related to tax rate management.
 * Provides CRUD operations for predefined tax rates.
 * All operations are multi-tenant isolated (user_id based).
 * 
 * @class TaxRateController
 */
export class TaxRateController {
  private taxRateService: TaxRateService;

  constructor() {
    this.taxRateService = new TaxRateService();
  }

  /**
   * Creates a new tax rate template.
   * Validates request body and automatically injects user_id from authenticated user.
   * 
   * @async
   * @param {Request} req - Express request object with tax rate data in body
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends 201 with created tax rate or 400/500 on error
   * 
   * @example
   * POST /api/admin/tax-rates
   * Body: { name: "Standard VAT (19%)", rate: 19.00, is_default: true }
   * Response: 201 { message: "Tax rate created successfully", taxRate: { ... } }
   */
  async create(req: Request, res: Response): Promise<void> {
    // Validate request body
    const { error, value } = createTaxRateSchema.validate(req.body, { abortEarly: false });
    if (error) {
      const errorMessage = error.details.map((detail) => detail.message).join(', ');
      res.status(400).json({ message: 'Validation failed', details: errorMessage });
      return;
    }

    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const taxRateData = {
        ...value,
        user_id: userId
      };

      const newTaxRate = await this.taxRateService.create(taxRateData);
      res.status(201).json({
        message: 'Tax rate created successfully',
        taxRate: newTaxRate
      });
    } catch (err: any) {
      console.error('Create tax rate error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

  /**
   * Retrieves all tax rates for the authenticated user.
   * Supports optional query parameter to filter by active status.
   * 
   * @async
   * @param {Request} req - Express request object with optional query params
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends 200 with tax rates array or 500 on error
   * 
   * @example
   * GET /api/admin/tax-rates?active_only=true
   * Response: 200 [{ id: "uuid", name: "Standard VAT (19%)", rate: 19.00, ... }]
   */
  async findAll(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const activeOnly = req.query.active_only === 'true';
      const taxRates = await this.taxRateService.findAllByUser(userId, activeOnly);
      res.status(200).json(taxRates);
    } catch (err: any) {
      console.error('Find all tax rates error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

  /**
   * Retrieves a single tax rate by its ID.
   * Validates ID format and ensures user owns this tax rate.
   * 
   * @async
   * @param {Request} req - Express request object with params.id
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends 200 with tax rate or 404 if not found
   * 
   * @example
   * GET /api/admin/tax-rates/123e4567-e89b-12d3-a456-426614174000
   * Response: 200 { id: "uuid", name: "Standard VAT (19%)", rate: 19.00, ... }
   */
  async findById(req: Request, res: Response): Promise<void> {
    // Validate ID
    const { error } = taxRateIdSchema.validate(req.params.id);
    if (error) {
      res.status(400).json({ message: 'Invalid tax rate ID', details: error.details[0].message });
      return;
    }

    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const taxRate = await this.taxRateService.findById(req.params.id, userId);
      if (taxRate) {
        res.status(200).json(taxRate);
      } else {
        res.status(404).json({ message: 'Tax rate not found' });
      }
    } catch (err: any) {
      console.error('Find tax rate by ID error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

  /**
   * Gets the default tax rate for the authenticated user.
   * 
   * @async
   * @param {Request} req - Express request object
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends 200 with default tax rate or 404 if not set
   * 
   * @example
   * GET /api/admin/tax-rates/default
   * Response: 200 { id: "uuid", name: "Standard VAT (19%)", rate: 19.00, is_default: true, ... }
   */
  async findDefault(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const defaultRate = await this.taxRateService.findDefaultByUser(userId);
      if (defaultRate) {
        res.status(200).json(defaultRate);
      } else {
        res.status(404).json({ message: 'No default tax rate set' });
      }
    } catch (err: any) {
      console.error('Find default tax rate error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

  /**
   * Updates an existing tax rate with partial data.
   * Validates ID and request body, ensures user owns this tax rate.
   * 
   * @async
   * @param {Request} req - Express request object with params.id and body
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends 200 with updated tax rate or 404 if not found
   * 
   * @example
   * PUT /api/admin/tax-rates/123e4567-e89b-12d3-a456-426614174000
   * Body: { is_default: true, is_active: true }
   * Response: 200 { message: "Tax rate updated successfully", taxRate: { ... } }
   */
  async update(req: Request, res: Response): Promise<void> {
    // Validate ID
    const { error: idError } = taxRateIdSchema.validate(req.params.id);
    if (idError) {
      res.status(400).json({ message: 'Invalid tax rate ID', details: idError.details[0].message });
      return;
    }

    // Validate body
    const { error, value } = updateTaxRateSchema.validate(req.body, { abortEarly: false });
    if (error) {
      const errorMessage = error.details.map((detail) => detail.message).join(', ');
      res.status(400).json({ message: 'Validation failed', details: errorMessage });
      return;
    }

    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const updatedTaxRate = await this.taxRateService.update(req.params.id, userId, value);
      if (updatedTaxRate) {
        res.status(200).json({
          message: 'Tax rate updated successfully',
          taxRate: updatedTaxRate
        });
      } else {
        res.status(404).json({ message: 'Tax rate not found' });
      }
    } catch (err: any) {
      console.error('Update tax rate error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

  /**
   * Sets a tax rate as the default for the user.
   * Automatically unsets any other default tax rate.
   * 
   * @async
   * @param {Request} req - Express request object with params.id
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends 200 with updated tax rate or 404 if not found
   * 
   * @example
   * PATCH /api/admin/tax-rates/123e4567-e89b-12d3-a456-426614174000/set-default
   * Response: 200 { message: "Default tax rate set successfully", taxRate: { ... } }
   */
  async setAsDefault(req: Request, res: Response): Promise<void> {
    // Validate ID
    const { error } = taxRateIdSchema.validate(req.params.id);
    if (error) {
      res.status(400).json({ message: 'Invalid tax rate ID', details: error.details[0].message });
      return;
    }

    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const updatedTaxRate = await this.taxRateService.setAsDefault(req.params.id, userId);
      if (updatedTaxRate) {
        res.status(200).json({
          message: 'Default tax rate set successfully',
          taxRate: updatedTaxRate
        });
      } else {
        res.status(404).json({ message: 'Tax rate not found' });
      }
    } catch (err: any) {
      console.error('Set default tax rate error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

  /**
   * Deletes a tax rate from the database.
   * Only deletes if the tax rate is not currently used by any invoices.
   * 
   * @async
   * @param {Request} req - Express request object with params.id
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends 200 on success, 404 if not found, or 400 if in use
   * 
   * @example
   * DELETE /api/admin/tax-rates/123e4567-e89b-12d3-a456-426614174000
   * Response: 200 { message: "Tax rate deleted successfully" }
   */
  async delete(req: Request, res: Response): Promise<void> {
    // Validate ID
    const { error } = taxRateIdSchema.validate(req.params.id);
    if (error) {
      res.status(400).json({ message: 'Invalid tax rate ID', details: error.details[0].message });
      return;
    }

    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const deleted = await this.taxRateService.delete(req.params.id, userId);
      if (deleted) {
        res.status(200).json({ message: 'Tax rate deleted successfully' });
      } else {
        res.status(404).json({ message: 'Tax rate not found' });
      }
    } catch (err: any) {
      console.error('Delete tax rate error:', err);
      
      // Check if it's a "in use" error
      if (err.message && err.message.includes('currently used by invoices')) {
        res.status(400).json({ message: err.message });
      } else {
        res.status(500).json({ message: err.message || 'Internal server error' });
      }
    }
  }
}
