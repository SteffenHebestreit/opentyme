import { Request, Response } from 'express';
import { InvoiceTextTemplateService } from '../../services/financial/invoice-text-template.service';
import {
  createInvoiceTextTemplateSchema,
  updateInvoiceTextTemplateSchema,
  invoiceTextTemplateIdSchema,
  categoryQuerySchema
} from '../../schemas/financial/invoice-text-template.schema';
import { TemplateCategory } from '../../models/financial/invoice-text-template.model';

/**
 * Controller for handling HTTP requests related to invoice text template management.
 * Provides CRUD operations for reusable invoice text snippets.
 * All operations are multi-tenant isolated (user_id based).
 * 
 * @class InvoiceTextTemplateController
 */
export class InvoiceTextTemplateController {
  private templateService: InvoiceTextTemplateService;

  constructor() {
    this.templateService = new InvoiceTextTemplateService();
  }

  /**
   * Creates a new invoice text template.
   * Validates request body and automatically injects user_id from authenticated user.
   * 
   * @async
   * @param {Request} req - Express request object with template data in body
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends 201 with created template or 400/500 on error
   * 
   * @example
   * POST /api/admin/invoice-templates
   * Body: { name: "Small Business Exemption", category: "tax_exemption", content: "..." }
   * Response: 201 { message: "Template created successfully", template: { ... } }
   */
  async create(req: Request, res: Response): Promise<void> {
    // Validate request body
    const { error, value } = createInvoiceTextTemplateSchema.validate(req.body, { abortEarly: false });
    if (error) {
      const errorMessage = error.details.map((detail: any) => detail.message).join(', ');
      res.status(400).json({ message: 'Validation failed', details: errorMessage });
      return;
    }

    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const templateData = {
        ...value,
        user_id: userId
      };

      const newTemplate = await this.templateService.create(templateData);
      res.status(201).json({
        message: 'Template created successfully',
        template: newTemplate
      });
    } catch (err: any) {
      console.error('Create invoice text template error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

  /**
   * Retrieves all invoice text templates for the authenticated user.
   * Supports optional query parameters to filter by category and active status.
   * 
   * @async
   * @param {Request} req - Express request object with optional query params
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends 200 with templates array or 500 on error
   * 
   * @example
   * GET /api/admin/invoice-templates?category=tax_exemption&active_only=true
   * Response: 200 [{ id: "uuid", name: "Small Business Exemption", content: "...", ... }]
   */
  async findAll(req: Request, res: Response): Promise<void> {
    // Validate query parameters
    const { error } = categoryQuerySchema.validate(req.query);
    if (error) {
      res.status(400).json({ message: 'Invalid query parameters', details: error.details[0].message });
      return;
    }

    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const category = req.query.category as TemplateCategory | undefined;
      const activeOnly = req.query.active_only === 'true';
      
      const templates = await this.templateService.findAllByUser(userId, category, activeOnly);
      res.status(200).json(templates);
    } catch (err: any) {
      console.error('Find all invoice text templates error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

  /**
   * Retrieves a single invoice text template by its ID.
   * Validates ID format and ensures user owns this template.
   * 
   * @async
   * @param {Request} req - Express request object with params.id
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends 200 with template or 404 if not found
   * 
   * @example
   * GET /api/admin/invoice-templates/123e4567-e89b-12d3-a456-426614174000
   * Response: 200 { id: "uuid", name: "Small Business Exemption", content: "...", ... }
   */
  async findById(req: Request, res: Response): Promise<void> {
    // Validate ID
    const { error } = invoiceTextTemplateIdSchema.validate(req.params.id);
    if (error) {
      res.status(400).json({ message: 'Invalid template ID', details: error.details[0].message });
      return;
    }

    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const template = await this.templateService.findById(req.params.id, userId);
      if (template) {
        res.status(200).json(template);
      } else {
        res.status(404).json({ message: 'Template not found' });
      }
    } catch (err: any) {
      console.error('Find template by ID error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

  /**
   * Gets all default templates for the authenticated user.
   * Returns one template per category if a default is set.
   * 
   * @async
   * @param {Request} req - Express request object
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends 200 with default templates array
   * 
   * @example
   * GET /api/admin/invoice-templates/defaults
   * Response: 200 [{ id: "uuid", category: "payment_terms", content: "...", is_default: true, ... }]
   */
  async findDefaults(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const defaults = await this.templateService.findAllDefaultsByUser(userId);
      res.status(200).json(defaults);
    } catch (err: any) {
      console.error('Find default templates error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

  /**
   * Updates an existing invoice text template with partial data.
   * Validates ID and request body, ensures user owns this template.
   * 
   * @async
   * @param {Request} req - Express request object with params.id and body
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends 200 with updated template or 404 if not found
   * 
   * @example
   * PUT /api/admin/invoice-templates/123e4567-e89b-12d3-a456-426614174000
   * Body: { content: "Updated content", is_default: true }
   * Response: 200 { message: "Template updated successfully", template: { ... } }
   */
  async update(req: Request, res: Response): Promise<void> {
    // Validate ID
    const { error: idError } = invoiceTextTemplateIdSchema.validate(req.params.id);
    if (idError) {
      res.status(400).json({ message: 'Invalid template ID', details: idError.details[0].message });
      return;
    }

    // Validate body
    const { error, value } = updateInvoiceTextTemplateSchema.validate(req.body, { abortEarly: false });
    if (error) {
      const errorMessage = error.details.map((detail: any) => detail.message).join(', ');
      res.status(400).json({ message: 'Validation failed', details: errorMessage });
      return;
    }

    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const updatedTemplate = await this.templateService.update(req.params.id, userId, value);
      if (updatedTemplate) {
        res.status(200).json({
          message: 'Template updated successfully',
          template: updatedTemplate
        });
      } else {
        res.status(404).json({ message: 'Template not found' });
      }
    } catch (err: any) {
      console.error('Update template error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

  /**
   * Deletes an invoice text template from the database.
   * 
   * @async
   * @param {Request} req - Express request object with params.id
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends 200 on success or 404 if not found
   * 
   * @example
   * DELETE /api/admin/invoice-templates/123e4567-e89b-12d3-a456-426614174000
   * Response: 200 { message: "Template deleted successfully" }
   */
  async delete(req: Request, res: Response): Promise<void> {
    // Validate ID
    const { error } = invoiceTextTemplateIdSchema.validate(req.params.id);
    if (error) {
      res.status(400).json({ message: 'Invalid template ID', details: error.details[0].message });
      return;
    }

    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const deleted = await this.templateService.delete(req.params.id, userId);
      if (deleted) {
        res.status(200).json({ message: 'Template deleted successfully' });
      } else {
        res.status(404).json({ message: 'Template not found' });
      }
    } catch (err: any) {
      console.error('Delete template error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }
}
