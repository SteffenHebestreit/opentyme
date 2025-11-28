import Joi from 'joi';

/**
 * Validation schema for creating a new tax rate.
 * Ensures all required fields are present and valid.
 */
export const createTaxRateSchema = Joi.object({
  name: Joi.string().min(1).max(100).required()
    .messages({
      'string.empty': 'Tax rate name is required',
      'string.max': 'Tax rate name must not exceed 100 characters'
    }),
  
  rate: Joi.number().min(0).max(100).precision(2).required()
    .messages({
      'number.base': 'Tax rate must be a number',
      'number.min': 'Tax rate cannot be negative',
      'number.max': 'Tax rate cannot exceed 100%',
      'any.required': 'Tax rate is required'
    }),
  
  description: Joi.string().max(500).allow(null, '').optional()
    .messages({
      'string.max': 'Description must not exceed 500 characters'
    }),
  
  is_default: Joi.boolean().optional(),
  
  is_active: Joi.boolean().optional(),
  
  country_code: Joi.string().length(2).uppercase().allow(null, '').optional()
    .messages({
      'string.length': 'Country code must be 2 characters (ISO 3166-1 alpha-2)',
      'string.uppercase': 'Country code must be uppercase'
    }),
  
  sort_order: Joi.number().integer().min(0).optional()
    .messages({
      'number.base': 'Sort order must be a number',
      'number.integer': 'Sort order must be an integer',
      'number.min': 'Sort order cannot be negative'
    })
});

/**
 * Validation schema for updating an existing tax rate.
 * All fields are optional to support partial updates.
 */
export const updateTaxRateSchema = Joi.object({
  name: Joi.string().min(1).max(100).optional()
    .messages({
      'string.empty': 'Tax rate name cannot be empty',
      'string.max': 'Tax rate name must not exceed 100 characters'
    }),
  
  rate: Joi.number().min(0).max(100).precision(2).optional()
    .messages({
      'number.base': 'Tax rate must be a number',
      'number.min': 'Tax rate cannot be negative',
      'number.max': 'Tax rate cannot exceed 100%'
    }),
  
  description: Joi.string().max(500).allow(null, '').optional()
    .messages({
      'string.max': 'Description must not exceed 500 characters'
    }),
  
  is_default: Joi.boolean().optional(),
  
  is_active: Joi.boolean().optional(),
  
  country_code: Joi.string().length(2).uppercase().allow(null, '').optional()
    .messages({
      'string.length': 'Country code must be 2 characters (ISO 3166-1 alpha-2)',
      'string.uppercase': 'Country code must be uppercase'
    }),
  
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
 * Validation schema for tax rate ID parameter.
 * Ensures the ID is a valid UUID.
 */
export const taxRateIdSchema = Joi.string().uuid().required()
  .messages({
    'string.guid': 'Invalid tax rate ID format',
    'any.required': 'Tax rate ID is required'
  });
