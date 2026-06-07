/**
 * @fileoverview Controller for recurring invoice (retainer) schedules.
 *
 * CRUD over schedule templates plus a manual "generate now" trigger. All actions
 * are scoped to the authenticated user. Generated invoices are always drafts.
 *
 * @module controllers/financial/recurring-invoice.controller
 */

import { Request, Response } from 'express';
import Joi from 'joi';
import { recurringInvoiceService } from '../../services/financial/recurring-invoice.service';
import { logger } from '../../utils/logger';

const lineItemSchema = Joi.object({
  description: Joi.string().max(500).required(),
  quantity: Joi.number().min(0).required(),
  unit_price: Joi.number().required(),
  rate_type: Joi.string().valid('hourly', 'daily').optional(),
});

const createSchema = Joi.object({
  client_id: Joi.string().guid({ version: 'uuidv4' }).required(),
  project_id: Joi.string().guid({ version: 'uuidv4' }).allow(null).optional(),
  title: Joi.string().max(255).required(),
  frequency: Joi.string().valid('monthly', 'quarterly', 'yearly').required(),
  start_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  end_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow(null).optional(),
  is_active: Joi.boolean().optional(),
  currency: Joi.string().length(3).optional(),
  tax_rate_id: Joi.string().max(50).allow(null).optional(),
  payment_terms_days: Joi.number().integer().min(0).max(365).optional(),
  invoice_headline: Joi.string().max(255).allow(null, '').optional(),
  notes: Joi.string().allow(null, '').optional(),
  line_items: Joi.array().items(lineItemSchema).min(1).required(),
});

const updateSchema = Joi.object({
  client_id: Joi.string().guid({ version: 'uuidv4' }).optional(),
  project_id: Joi.string().guid({ version: 'uuidv4' }).allow(null).optional(),
  title: Joi.string().max(255).optional(),
  frequency: Joi.string().valid('monthly', 'quarterly', 'yearly').optional(),
  start_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow(null).optional(),
  is_active: Joi.boolean().optional(),
  currency: Joi.string().length(3).optional(),
  tax_rate_id: Joi.string().max(50).allow(null).optional(),
  payment_terms_days: Joi.number().integer().min(0).max(365).optional(),
  invoice_headline: Joi.string().max(255).allow(null, '').optional(),
  notes: Joi.string().allow(null, '').optional(),
  line_items: Joi.array().items(lineItemSchema).min(1).optional(),
}).min(1);

const idSchema = Joi.string().guid({ version: 'uuidv4' });

export class RecurringInvoiceController {
  async list(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user?.id;
    if (!userId) { res.status(401).json({ message: 'Authentication required' }); return; }
    try {
      const schedules = await recurringInvoiceService.findAllByUser(userId);
      res.status(200).json(schedules);
    } catch (err: any) {
      logger.error('List recurring invoices error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

  async getById(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user?.id;
    if (!userId) { res.status(401).json({ message: 'Authentication required' }); return; }
    if (idSchema.validate(req.params.id).error) {
      res.status(400).json({ message: 'Invalid schedule ID' }); return;
    }
    try {
      const schedule = await recurringInvoiceService.findById(req.params.id, userId);
      if (!schedule) { res.status(404).json({ message: 'Recurring invoice not found' }); return; }
      res.status(200).json(schedule);
    } catch (err: any) {
      logger.error('Get recurring invoice error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

  async create(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user?.id;
    if (!userId) { res.status(401).json({ message: 'Authentication required' }); return; }

    const { error, value } = createSchema.validate(req.body, { abortEarly: false });
    if (error) {
      res.status(400).json({ message: 'Validation failed', details: error.details.map((d) => d.message).join(', ') });
      return;
    }
    if (value.end_date && value.end_date <= value.start_date) {
      res.status(400).json({ message: 'end_date must be after start_date' });
      return;
    }

    try {
      const created = await recurringInvoiceService.create({ ...value, user_id: userId });
      res.status(201).json({ message: 'Recurring invoice created', recurring_invoice: created });
    } catch (err: any) {
      logger.error('Create recurring invoice error:', err);
      if (err.code === '23503') {
        res.status(400).json({ message: 'Invalid client or project reference' });
        return;
      }
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

  async update(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user?.id;
    if (!userId) { res.status(401).json({ message: 'Authentication required' }); return; }
    if (idSchema.validate(req.params.id).error) {
      res.status(400).json({ message: 'Invalid schedule ID' }); return;
    }

    const { error, value } = updateSchema.validate(req.body, { abortEarly: false });
    if (error) {
      res.status(400).json({ message: 'Validation failed', details: error.details.map((d) => d.message).join(', ') });
      return;
    }

    try {
      const updated = await recurringInvoiceService.update(req.params.id, userId, value);
      if (!updated) { res.status(404).json({ message: 'Recurring invoice not found' }); return; }
      res.status(200).json({ message: 'Recurring invoice updated', recurring_invoice: updated });
    } catch (err: any) {
      logger.error('Update recurring invoice error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

  async remove(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user?.id;
    if (!userId) { res.status(401).json({ message: 'Authentication required' }); return; }
    if (idSchema.validate(req.params.id).error) {
      res.status(400).json({ message: 'Invalid schedule ID' }); return;
    }
    try {
      const deleted = await recurringInvoiceService.delete(req.params.id, userId);
      if (!deleted) { res.status(404).json({ message: 'Recurring invoice not found' }); return; }
      res.status(200).json({ message: 'Recurring invoice deleted' });
    } catch (err: any) {
      logger.error('Delete recurring invoice error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

  /** Manually generate any due draft invoices for this schedule. */
  async generateNow(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user?.id;
    if (!userId) { res.status(401).json({ message: 'Authentication required' }); return; }
    if (idSchema.validate(req.params.id).error) {
      res.status(400).json({ message: 'Invalid schedule ID' }); return;
    }
    try {
      const ids = await recurringInvoiceService.generateNow(req.params.id, userId);
      if (ids === null) { res.status(404).json({ message: 'Recurring invoice not found' }); return; }
      res.status(200).json({
        message: ids.length > 0 ? `Generated ${ids.length} draft invoice(s)` : 'No invoices due',
        invoice_ids: ids,
      });
    } catch (err: any) {
      logger.error('Generate recurring invoice error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }
}
