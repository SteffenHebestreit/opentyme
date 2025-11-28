import * as Joi from 'joi';

// Base schema for ID validation
export const paymentIdSchema = Joi.string().guid({ version: ['uuidv4'] }).required();
export const clientIdSchema = Joi.string().guid({ version: ['uuidv4'] }).required();
export const invoiceIdSchema = Joi.string().guid({ version: ['uuidv4'] }).required();

// Payment type enum
export const paymentTypes = ['payment', 'refund', 'expense'] as const;
export type PaymentType = typeof paymentTypes[number];

// Schema for creating a payment (req.body)
// Note: Amount is always stored as positive value; payment_type determines calculation sign
// invoice_id is required for 'refund' types but optional for 'payment' (can be NULL for recurring project payments)
export const createPaymentSchema = Joi.object({
  client_id: Joi.when('payment_type', {
    is: Joi.string().valid('payment', 'refund'),
    then: clientIdSchema.required(),
    otherwise: clientIdSchema.optional().allow(null),
  }),
  invoice_id: Joi.when('payment_type', {
    is: 'refund',
    then: invoiceIdSchema.required(),
    otherwise: invoiceIdSchema.optional().allow(null),
  }),
  project_id: Joi.string().guid({ version: ['uuidv4'] }).optional().allow(null),
  amount: Joi.number().positive().precision(2).required(),
  payment_type: Joi.string().valid(...paymentTypes).default('payment'),
  payment_method: Joi.string().max(50).allow(null, '').optional(),
  transaction_id: Joi.string().max(255).allow(null, '').optional(),
  payment_date: Joi.date().iso().optional(), // Defaults to current date if not provided by service logic
  notes: Joi.string().max(1000).allow(null, '').optional(),
  exclude_from_tax: Joi.boolean().optional().default(false),
});

// Schema for updating a payment (req.body)
// Note: Amount is always stored as positive value; payment_type determines calculation sign
export const updatePaymentSchema = Joi.object({
  client_id: clientIdSchema.required(), // Typically shouldn't change, but schema allows validation
  amount: Joi.number().positive().precision(2).required(),
  payment_type: Joi.string().valid(...paymentTypes).optional(),
  payment_method: Joi.string().max(50).allow(null, '').optional(),
  transaction_id: Joi.string().max(255).allow(null, '').optional(),
  payment_date: Joi.date().iso().optional(), // Can be updated
  notes: Joi.string().max(1000).allow(null, '').optional(),
  exclude_from_tax: Joi.boolean().optional(),
}).min(1);

// Schema for params requiring a payment ID
export const getPaymentByIdParamsSchema = Joi.object({
  id: paymentIdSchema.required(),
});

// Schema for params requiring an invoice ID to fetch its payments
export const getPaymentsByInvoiceParamsSchema = Joi.object({
  invoice_id: invoiceIdSchema.required(),
});
