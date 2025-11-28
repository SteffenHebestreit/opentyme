import Joi from 'joi';

/**
 * Valid categories for invoice text templates.
 */
const validCategories = ['tax_exemption', 'payment_terms', 'legal_notice', 'footer', 'header', 'custom'];

/**
 * Validation schema for creating a new invoice text template.
 * Ensures all required fields are present and valid.
 */
export const createInvoiceTextTemplateSchema = Joi.object({
  name: Joi.string().min(1).max(100).required()
    .messages({
      'string.empty': 'Template name is required',
      'string.max': 'Template name must not exceed 100 characters'
    }),
  
  category: Joi.string().valid(...validCategories).required()
    .messages({
      'any.only': `Category must be one of: ${validCategories.join(', ')}`,
      'any.required': 'Category is required'
    }),
  
  content: Joi.string().min(1).max(5000).required()
    .messages({
      'string.empty': 'Template content is required',
      'string.max': 'Content must not exceed 5000 characters'
    }),
  
  language: Joi.string().length(2).lowercase().optional()
    .messages({
      'string.length': 'Language code must be 2 characters (ISO 639-1)',
      'string.lowercase': 'Language code must be lowercase'
    }),
  
  is_default: Joi.boolean().optional(),
  
  is_active: Joi.boolean().optional(),
  
  sort_order: Joi.number().integer().min(0).optional()
    .messages({
      'number.base': 'Sort order must be a number',
      'number.integer': 'Sort order must be an integer',
      'number.min': 'Sort order cannot be negative'
    })
});

/**
 * Validation schema for updating an existing invoice text template.
 * All fields are optional to support partial updates.
 */
export const updateInvoiceTextTemplateSchema = Joi.object({
  name: Joi.string().min(1).max(100).optional()
    .messages({
      'string.empty': 'Template name cannot be empty',
      'string.max': 'Template name must not exceed 100 characters'
    }),
  
  category: Joi.string().valid(...validCategories).optional()
    .messages({
      'any.only': `Category must be one of: ${validCategories.join(', ')}`
    }),
  
  content: Joi.string().min(1).max(5000).optional()
    .messages({
      'string.empty': 'Template content cannot be empty',
      'string.max': 'Content must not exceed 5000 characters'
    }),
  
  language: Joi.string().length(2).lowercase().optional()
    .messages({
      'string.length': 'Language code must be 2 characters (ISO 639-1)',
      'string.lowercase': 'Language code must be lowercase'
    }),
  
  is_default: Joi.boolean().optional(),
  
  is_active: Joi.boolean().optional(),
  
  sort_order: Joi.number().integer().min(0).optional()
    .messages({
      'number.base': 'Sort order must be a number',
      'number.integer': 'Sort order must be an integer',
      'number.min': 'Sort order cannot be negative'
    })
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

/**
 * Validation schema for invoice text template ID parameter.
 * Ensures the ID is a valid UUID.
 */
export const invoiceTextTemplateIdSchema = Joi.string().uuid().required()
  .messages({
    'string.guid': 'Invalid template ID format',
    'any.required': 'Template ID is required'
  });

/**
 * Validation schema for category query parameter.
 * Validates optional category filter.
 */
export const categoryQuerySchema = Joi.object({
  category: Joi.string().valid(...validCategories).optional()
    .messages({
      'any.only': `Category must be one of: ${validCategories.join(', ')}`
    }),
  
  active_only: Joi.boolean().optional()
});
