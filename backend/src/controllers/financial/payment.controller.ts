import { Request, Response, NextFunction } from 'express';
// Assuming we will have a PaymentService
// import { PaymentService } from '../services/payment.service'; 
import { getDbClient } from '../../utils/database';
import { BillingValidationService } from '../../services/financial/billing-validation.service';

// Joi Validation Schemas
import {
  createPaymentSchema,
  updatePaymentSchema,
  getPaymentByIdParamsSchema,
  getPaymentsByInvoiceParamsSchema,
  paymentIdSchema as validatePaymentId, // Corrected alias for the schema named in payment.schema.ts
} from '../../schemas/financial/payment.schema';

const validate = (schema: any) => (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req.body || {}, { abortEarly: false });
    if (error) {
        const errorMessage = error.details.map((detail: any) => detail.message).join(', ');
        res.status(400).json({ message: 'Validation failed', details: errorMessage });
        return;
    }
    next();
};

const validateParams = (schema: any, target: 'params' | 'query' = 'params') => (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req[target], { abortEarly: false });
    if (error) {
        const errorMessage = error.details.map((detail: any) => detail.message).join(', ');
        res.status(400).json({ message: 'Validation failed', details: errorMessage });
        return;
    }
    next();
};

// Placeholder for now, direct DB queries due to lack of dedicated service layer initially

export class PaymentController {
  private billingValidationService: BillingValidationService;

  constructor() {
    this.billingValidationService = new BillingValidationService();
  }

  private get db() {
    return getDbClient();
  }

  // Create a new payment record
  async create(req: Request, res: Response) {
    const validatedBody = req.body; // Joi schema will validate all required fields
    
    console.log('=== Payment Creation Debug ===');
    console.log('Request body:', JSON.stringify(validatedBody, null, 2));
    console.log('client_id:', validatedBody.client_id);
    console.log('invoice_id:', validatedBody.invoice_id);
    console.log('invoice_ids:', validatedBody.invoice_ids);
    console.log('project_id:', validatedBody.project_id);
    console.log('payment_type:', validatedBody.payment_type);
    
    // Manual validation specific to this endpoint's logic
    if (!validatedBody.client_id) {
        res.status(400).json({ message: 'Client ID is required.' });
        return;
    }

    // Support both single invoice_id and array of invoice_ids
    let invoiceIds: string[] = [];
    if (validatedBody.invoice_ids && Array.isArray(validatedBody.invoice_ids) && validatedBody.invoice_ids.length > 0) {
      invoiceIds = validatedBody.invoice_ids;
    } else if (validatedBody.invoice_id) {
      invoiceIds = [validatedBody.invoice_id];
    }

    const { client_id, project_id, amount, payment_type = 'payment', payment_method, transaction_id, payment_date, notes, exclude_from_tax } = validatedBody;

    // Require either invoice_id(s) OR project_id for payments (not refunds)
    if (payment_type === 'payment' && invoiceIds.length === 0 && !project_id) {
        res.status(400).json({ message: 'Either invoice_id(s) or project_id is required for payment type.' });
        return;
    }

    // Refunds must have invoice_id(s)
    if (payment_type === 'refund' && invoiceIds.length === 0) {
        res.status(400).json({ message: 'Invoice ID is required for refund type.' });
        return;
    }

    // Validate all invoices if provided (ensure they belong to client and user has access)
    let invoiceProjectId = project_id; // Start with provided project_id
    if (invoiceIds.length > 0) {
      const validateInvoices = await this.db.query(
        `SELECT i.id, i.project_id FROM invoices i WHERE i.id = ANY($1) AND i.client_id = $2 AND i.user_id = $3`,
        [invoiceIds, client_id, (req as any).user?.id]
      );
      if (validateInvoices.rows.length !== invoiceIds.length) {
          const foundIds = validateInvoices.rows.map((r: any) => r.id);
          const missingIds = invoiceIds.filter(id => !foundIds.includes(id));
          res.status(404).json({ message: `Invoice(s) not found or do not belong to the specified client: ${missingIds.join(', ')}` });
          return;
      }
      // Automatically use the first invoice's project_id if not explicitly provided
      if (!invoiceProjectId && validateInvoices.rows[0].project_id) {
        invoiceProjectId = validateInvoices.rows[0].project_id;
        console.log('Auto-assigned project_id from first invoice:', invoiceProjectId);
      }
    }

    // Validate project if provided (ensure it belongs to client and user has access)
    if (project_id) {
      const validateProject = await this.db.query(
        `SELECT p.id FROM projects p WHERE p.id = $1 AND p.client_id = $2 AND p.user_id = $3`,
        [project_id, client_id, (req as any).user?.id]
      );
      if (validateProject.rows.length === 0) {
          res.status(404).json({ message: 'Project not found or does not belong to the specified client for this user.' });
          return;
      }
    }

    try {
      // Start a transaction
      await this.db.query('BEGIN');

      // Keep invoice_id for backward compatibility (use first invoice if multiple)
      const primaryInvoiceId = invoiceIds.length > 0 ? invoiceIds[0] : null;

      const queryText = `
        INSERT INTO payments (
          user_id, client_id, invoice_id, project_id, amount, payment_type, payment_method, transaction_id, payment_date, notes, exclude_from_tax
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, user_id, client_id, invoice_id, project_id, amount, payment_type, payment_method, transaction_id, payment_date, notes, exclude_from_tax, created_at
      `;
      const values = [
        (req as any).user?.id,
        client_id,
        primaryInvoiceId, // Keep for backward compatibility
        invoiceProjectId || null,
        Number(amount),
        payment_type,
        payment_method || null,
        transaction_id || null,
        payment_date ? new Date(payment_date) : new Date(),
        notes || null,
        exclude_from_tax || false
      ];
      
      const result = await this.db.query(queryText, values);
      const paymentRecord = result.rows[0];

      // Insert into payment_invoices junction table for all invoices
      // Store each invoice's total_amount as the allocated amount
      if (invoiceIds.length > 0) {
        const insertJunctionQuery = `
          INSERT INTO payment_invoices (payment_id, invoice_id, amount)
          SELECT $1, i.id, i.total_amount
          FROM invoices i
          WHERE i.id = ANY($2::uuid[])
        `;
        await this.db.query(insertJunctionQuery, [paymentRecord.id, invoiceIds]);
      }

      // Update invoice statuses for all linked invoices
      for (const invoiceId of invoiceIds) {
        await this.updateInvoiceStatus(invoiceId);
      }

      await this.db.query('COMMIT');

      // Add linked invoice IDs to response
      paymentRecord.invoice_ids = invoiceIds;

      // Prepare response
      const response: any = {
        message: 'Payment recorded successfully',
        payment: paymentRecord,
      };

      res.status(201).json(response);

    } catch (err: any) {
      await this.db.query('ROLLBACK');
      console.error('Create payment error:', err);
      console.error('Error details:', {
        code: err.code,
        detail: err.detail,
        constraint: err.constraint,
        table: err.table
      });
      
      // Handle specific PostgreSQL constraint violations
      if (err.code === '23514' && err.constraint === 'payments_invoice_or_recurring') {
        res.status(400).json({ 
          message: 'Payment validation failed. For regular payments, either invoice_id or both client_id and project_id are required. For refunds, invoice_id is required.',
          details: err.detail
        });
        return;
      }
      
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

  // Helper method to update invoice status based on payments
  private async updateInvoiceStatus(invoiceId: string) {
    // Calculate total paid for this invoice
    // Use amount from junction table if available, otherwise use payment amount
    const totalPaidQuery = `
      SELECT COALESCE(SUM(
        CASE 
          WHEN p.payment_type = 'payment' THEN COALESCE(pi.amount, p.amount)
          ELSE -COALESCE(pi.amount, p.amount)
        END
      ), 0) as total_paid 
      FROM payments p 
      LEFT JOIN payment_invoices pi ON p.id = pi.payment_id AND pi.invoice_id = $1
      WHERE 
        -- Payment is linked via junction table to this invoice
        pi.invoice_id = $1
        -- OR payment uses legacy invoice_id AND has NO junction table entries
        OR (p.invoice_id = $1 AND NOT EXISTS (SELECT 1 FROM payment_invoices WHERE payment_id = p.id))
    `;
    const totalPaidResult = await this.db.query(totalPaidQuery, [invoiceId]);
    const totalPaid = Number(totalPaidResult.rows[0].total_paid);

    // Get invoice details
    const invoiceDetailsQuery = `SELECT id, total_amount, due_date FROM invoices WHERE id = $1`;
    const invoiceDetailsResult = await this.db.query(invoiceDetailsQuery, [invoiceId]);
    
    if (invoiceDetailsResult.rows.length > 0) {
      const invoiceTotal = Number(invoiceDetailsResult.rows[0].total_amount);
      const dueDate = new Date(invoiceDetailsResult.rows[0].due_date);
      const today = new Date();
      
      let newStatus: string;
      if (totalPaid >= invoiceTotal && totalPaid > 0) {
        newStatus = 'paid';
      } else if (totalPaid > 0 && totalPaid < invoiceTotal) {
        newStatus = 'partially_paid';
      } else if (today > dueDate && totalPaid < invoiceTotal) {
        newStatus = 'overdue';
      } else {
        newStatus = 'sent';
      }

      await this.db.query(
        `UPDATE invoices SET status = $1 WHERE id = $2`,
        [newStatus, invoiceId]
      );
    }
  }

  // Get all payments for a user
  async findAll(req: Request, res: Response) {
    try {
        const queryText = `
          SELECT p.id, p.user_id, p.client_id, p.invoice_id, p.project_id, p.amount, p.payment_type,
                 p.payment_method, p.transaction_id, p.payment_date, p.notes, p.exclude_from_tax, p.created_at,
                 c.name as client_name,
                 i.invoice_number,
                 COALESCE(
                   (SELECT json_agg(json_build_object(
                     'invoice_id', pi.invoice_id, 
                     'invoice_number', inv.invoice_number
                   ))
                   FROM payment_invoices pi
                   JOIN invoices inv ON pi.invoice_id = inv.id
                   WHERE pi.payment_id = p.id),
                   '[]'::json
                 ) as linked_invoices
          FROM payments p 
          LEFT JOIN clients c ON p.client_id = c.id AND c.user_id = $1
          LEFT JOIN invoices i ON p.invoice_id = i.id AND i.user_id = $1
          WHERE p.user_id = $1 ORDER BY p.payment_date DESC, p.created_at DESC
        `;
        const result = await this.db.query(queryText, [(req as any).user?.id]);
        res.status(200).json(result.rows);
    } catch (err: any) {
      console.error('Find all payments error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

  // Get a specific payment by ID
  async findById(req: Request, res: Response) {
    // Params validation is done by Joi schema
    const { id } = req.params; 

    try {
      const queryText = `
        SELECT p.id, p.user_id, p.client_id, p.invoice_id, p.amount, p.payment_type,
               p.payment_method, p.transaction_id, p.payment_date, p.notes, p.created_at,
               COALESCE(
                 (SELECT json_agg(json_build_object(
                   'invoice_id', pi.invoice_id, 
                   'invoice_number', inv.invoice_number
                 ))
                 FROM payment_invoices pi
                 JOIN invoices inv ON pi.invoice_id = inv.id
                 WHERE pi.payment_id = p.id),
                 '[]'::json
               ) as linked_invoices
        FROM payments p WHERE p.id = $1 AND p.user_id = $2
      `;
      const result = await this.db.query(queryText, [id, (req as any).user?.id]);
      
      if (result.rows.length === 0) {
          res.status(404).json({ message: 'Payment not found.' });
          return;
      }
      res.status(200).json(result.rows[0]);

    } catch (err: any) {
      console.error('Find payment by ID error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

  // Update a payment record
  async update(req: Request, res: Response) {
    // Params validation is done by Joi schema
    const { id } = req.params;

    // Body validation is done by Joi schema
    const validatedBody = req.body;
    const { client_id, amount, payment_type, payment_method, transaction_id, payment_date, notes, exclude_from_tax, invoice_ids } = validatedBody; 

    let setParts = [];
    let values: any[] = [];

    if (client_id !== undefined) {
        setParts.push(`client_id = $${values.length + 1}`); 
        values.push(client_id);
    }
    if (amount !== undefined) {
        setParts.push(`amount = $${values.length + 1}`);
        values.push(Number(amount));
    }
    if (payment_type !== undefined) {
        setParts.push(`payment_type = $${values.length + 1}`);
        values.push(payment_type);
    }
    if (payment_method !== undefined) {
        setParts.push(`payment_method = $${values.length + 1}`);
        values.push(payment_method || null);
    }
    if (transaction_id !== undefined) {
        setParts.push(`transaction_id = $${values.length + 1}`); 
        values.push(transaction_id || null);
    }
    if (payment_date !== undefined) {
        setParts.push(`payment_date = $${values.length + 1}`);
        values.push(payment_date ? new Date(payment_date) : null);
    }
    if (notes !== undefined) {
        setParts.push(`notes = $${values.length + 1}`); 
        values.push(notes || null);
    }
    if (exclude_from_tax !== undefined) {
        setParts.push(`exclude_from_tax = $${values.length + 1}`); 
        values.push(exclude_from_tax);
    }

    // Handle invoice_ids update - also update the legacy invoice_id field
    if (invoice_ids !== undefined && Array.isArray(invoice_ids) && invoice_ids.length > 0) {
        setParts.push(`invoice_id = $${values.length + 1}`);
        values.push(invoice_ids[0]); // First invoice for backward compatibility
    }

    if (setParts.length === 0 && (!invoice_ids || invoice_ids.length === 0)) {
        res.status(400).json({ message: 'No fields to update.' });
        return;
    }

    try {
        await this.db.query('BEGIN');

        // Get old invoice IDs before update (to update their statuses later)
        const oldInvoicesQuery = `
          SELECT invoice_id FROM payment_invoices WHERE payment_id = $1
        `;
        const oldInvoicesResult = await this.db.query(oldInvoicesQuery, [id]);
        const oldInvoiceIds = oldInvoicesResult.rows.map((r: any) => r.invoice_id);

        // Update payment record if there are fields to update
        let paymentRecord;
        if (setParts.length > 0) {
            values.push(id); // For WHERE id = $x
            const queryText = `
              UPDATE payments 
              SET ${setParts.join(', ')}, updated_at = CURRENT_TIMESTAMP 
              WHERE id = $${values.length} AND user_id = $${values.length + 1}
              RETURNING id, user_id, client_id, invoice_id, amount, payment_type, payment_method, transaction_id, payment_date, notes, exclude_from_tax, created_at
            `;
            values.push((req as any).user?.id);

            const result = await this.db.query(queryText, values);
            if (result.rows.length === 0) {
                await this.db.query('ROLLBACK');
                res.status(404).json({ message: 'Payment not found or no access.' });
                return;
            }
            paymentRecord = result.rows[0];
        } else {
            // Just fetch the current payment if no field updates
            const fetchQuery = `
              SELECT id, user_id, client_id, invoice_id, amount, payment_type, payment_method, transaction_id, payment_date, notes, exclude_from_tax, created_at
              FROM payments WHERE id = $1 AND user_id = $2
            `;
            const fetchResult = await this.db.query(fetchQuery, [id, (req as any).user?.id]);
            if (fetchResult.rows.length === 0) {
                await this.db.query('ROLLBACK');
                res.status(404).json({ message: 'Payment not found or no access.' });
                return;
            }
            paymentRecord = fetchResult.rows[0];
        }

        // Update invoice links if invoice_ids provided
        if (invoice_ids !== undefined && Array.isArray(invoice_ids)) {
            // Delete existing links
            await this.db.query(`DELETE FROM payment_invoices WHERE payment_id = $1`, [id]);
            
            // Insert new links
            if (invoice_ids.length > 0) {
                const insertJunctionQuery = `
                  INSERT INTO payment_invoices (payment_id, invoice_id)
                  SELECT $1, unnest($2::uuid[])
                `;
                await this.db.query(insertJunctionQuery, [id, invoice_ids]);
            }

            // Update statuses for all affected invoices (old and new)
            const allAffectedInvoices = [...new Set([...oldInvoiceIds, ...invoice_ids])];
            for (const invoiceId of allAffectedInvoices) {
                await this.updateInvoiceStatus(invoiceId);
            }
        }

        await this.db.query('COMMIT');

        res.status(200).json({
          message: 'Payment updated successfully',
          payment: paymentRecord
        });
    } catch (err: any) {
      await this.db.query('ROLLBACK');
      console.error('Update payment error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

  // Delete a payment record
  async delete(req: Request, res: Response) {
    // Params validation is done by Joi schema
    const { id } = req.params; 

    try {
      // Get linked invoices before deletion (to update their statuses)
      const linkedInvoicesQuery = `
        SELECT invoice_id FROM payment_invoices WHERE payment_id = $1
        UNION
        SELECT invoice_id FROM payments WHERE id = $1 AND invoice_id IS NOT NULL
      `;
      const linkedInvoicesResult = await this.db.query(linkedInvoicesQuery, [id]);
      const invoiceIds = linkedInvoicesResult.rows.map((r: any) => r.invoice_id);

      const queryText = `DELETE FROM payments WHERE id = $1 AND user_id = $2`;
      const result = await this.db.query(queryText, [id, (req as any).user?.id]);
      
      if ((result.rowCount ?? 0) > 0) {
        // Update statuses for all previously linked invoices
        for (const invoiceId of invoiceIds) {
          await this.updateInvoiceStatus(invoiceId);
        }
        res.status(200).json({ message: 'Payment deleted successfully' });
      } else {
        res.status(404).json({ message: 'Payment not found or no access.' });
      }
    } catch (err: any) {
      console.error('Delete payment error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

  // Get payments for a specific invoice
  async getPaymentsByInvoice(req: Request, res: Response) {
    // Params validation is done by Joi schema
    const { invoice_id } = req.params; 
    
    // Validate that user has access to this invoice
      const validateInvoice = await this.db.query(
        `SELECT i.id FROM invoices i WHERE i.id = $1 AND i.user_id = $2`,
        [invoice_id, (req as any).user?.id]
      );
      if (validateInvoice.rows.length === 0) {
          res.status(404).json({ message: 'Invoice not found for this user.' });
          return;
      }

    try {
      // Include payments linked through both legacy invoice_id and junction table
      const queryText = `
        SELECT DISTINCT p.id, p.user_id, p.client_id, p.invoice_id, p.amount, p.payment_type,
               p.payment_method, p.transaction_id, p.payment_date, p.notes, p.created_at,
               COALESCE(
                 (SELECT json_agg(json_build_object(
                   'invoice_id', pi2.invoice_id, 
                   'invoice_number', inv.invoice_number
                 ))
                 FROM payment_invoices pi2
                 JOIN invoices inv ON pi2.invoice_id = inv.id
                 WHERE pi2.payment_id = p.id),
                 '[]'::json
               ) as linked_invoices
        FROM payments p 
        LEFT JOIN payment_invoices pi ON p.id = pi.payment_id
        WHERE (p.invoice_id = $1 OR pi.invoice_id = $1) AND p.user_id = $2
        ORDER BY p.created_at DESC
      `;
      const result = await this.db.query(queryText, [invoice_id, (req as any).user?.id]);
      res.status(200).json(result.rows);
    } catch (err: any) {
      console.error('Get payments by invoice error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

}
