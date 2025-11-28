/**
 * @fileoverview Tax Prepayment Validation Schemas
 * 
 * Joi validation schemas for tax prepayment API requests.
 * 
 * @module schemas/financial/tax-prepayment
 */

import Joi from 'joi';
import { TaxType, TaxPrepaymentStatus } from '../../models/financial/tax-prepayment.model';

/**
 * Schema for creating a tax prepayment
 */
export const createTaxPrepaymentSchema = Joi.object({
  tax_type: Joi.string()
    .valid(...Object.values(TaxType))
    .required()
    .messages({
      'any.required': 'Tax type is required',
      'any.only': 'Tax type must be either vat or income_tax',
    }),
  amount: Joi.number()
    .positive()
    .precision(2)
    .required()
    .messages({
      'any.required': 'Amount is required',
      'number.positive': 'Amount must be positive',
    }),
  payment_date: Joi.date()
    .iso()
    .required()
    .messages({
      'any.required': 'Payment date is required',
      'date.format': 'Payment date must be in ISO format (YYYY-MM-DD)',
    }),
  period_start: Joi.date()
    .iso()
    .optional()
    .allow(null),
  period_end: Joi.date()
    .iso()
    .optional()
    .allow(null),
  tax_year: Joi.number()
    .integer()
    .min(2000)
    .max(2100)
    .required()
    .messages({
      'any.required': 'Tax year is required',
    }),
  quarter: Joi.number()
    .integer()
    .min(1)
    .max(4)
    .optional()
    .allow(null),
  description: Joi.string()
    .max(500)
    .optional()
    .allow(null, ''),
  reference_number: Joi.string()
    .max(100)
    .optional()
    .allow(null, ''),
  payment_method: Joi.string()
    .max(50)
    .optional()
    .allow(null, ''),
  notes: Joi.string()
    .max(1000)
    .optional()
    .allow(null, ''),
  status: Joi.string()
    .valid(...Object.values(TaxPrepaymentStatus))
    .optional(),
});

/**
 * Schema for updating a tax prepayment
 */
export const updateTaxPrepaymentSchema = Joi.object({
  tax_type: Joi.string()
    .valid(...Object.values(TaxType))
    .optional(),
  amount: Joi.number()
    .positive()
    .precision(2)
    .optional(),
  payment_date: Joi.date()
    .iso()
    .optional(),
  period_start: Joi.date()
    .iso()
    .optional(),
  period_end: Joi.date()
    .iso()
    .optional(),
  tax_year: Joi.number()
    .integer()
    .min(2000)
    .max(2100)
    .optional(),
  quarter: Joi.number()
    .integer()
    .min(1)
    .max(4)
    .optional()
    .allow(null),
  description: Joi.string()
    .max(500)
    .optional()
    .allow(null, ''),
  reference_number: Joi.string()
    .max(100)
    .optional()
    .allow(null, ''),
  payment_method: Joi.string()
    .max(50)
    .optional()
    .allow(null, ''),
  notes: Joi.string()
    .max(1000)
    .optional()
    .allow(null, ''),
  status: Joi.string()
    .valid(...Object.values(TaxPrepaymentStatus))
    .optional(),
}).min(1);

/**
 * Schema for tax prepayment ID parameter
 */
export const taxPrepaymentIdSchema = Joi.object({
  id: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.guid': 'Invalid tax prepayment ID format',
      'any.required': 'Tax prepayment ID is required',
    }),
});

/**
 * Schema for tax prepayment query filters
 */
export const taxPrepaymentFiltersSchema = Joi.object({
  tax_type: Joi.string()
    .valid(...Object.values(TaxType))
    .optional(),
  tax_year: Joi.number()
    .integer()
    .min(2000)
    .max(2100)
    .optional(),
  quarter: Joi.number()
    .integer()
    .min(1)
    .max(4)
    .optional(),
  status: Joi.string()
    .valid(...Object.values(TaxPrepaymentStatus))
    .optional(),
  date_from: Joi.date()
    .iso()
    .optional(),
  date_to: Joi.date()
    .iso()
    .optional(),
  search: Joi.string()
    .max(100)
    .optional(),
  sort_by: Joi.string()
    .valid('payment_date', 'amount', 'created_at')
    .optional(),
  sort_order: Joi.string()
    .valid('asc', 'desc')
    .optional(),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .optional(),
  offset: Joi.number()
    .integer()
    .min(0)
    .optional(),
});
