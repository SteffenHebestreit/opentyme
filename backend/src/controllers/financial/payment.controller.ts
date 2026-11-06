import { Request, Response, NextFunction } from 'express';
// Assuming we will have a PaymentService
// import { PaymentService } from '../services/payment.service';
import { getDbClient } from '../../utils/database';
import type { PoolClient } from 'pg';
import { BillingValidationService } from '../../services/financial/billing-validation.service';
import { logger } from '../../utils/logger';
import { findUnownedIds, isUuid, ownsRow } from '../../services/ownership.service';

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

  /**
   * Whether the payment exists and belongs to the user.
   *
   * @private
   * @param {string} paymentId - Payment to check
   * @param {string} userId - The authenticated user
   * @returns {Promise<boolean>} True when the payment is the user's
   */
  private async paymentBelongsTo(paymentId: string, userId: string): Promise<boolean> {
    const result = await this.db.query(
      'SELECT 1 FROM payments WHERE id = $1 AND user_id = $2',
      [paymentId, userId]
    );
    return result.rows.length > 0;
  }

  // Create a new payment record
  async create(req: Request, res: Response) {
    const validatedBody = req.body; // Joi schema will validate all required fields
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }
    
    logger.debug('=== Payment Creation Debug ===');
    logger.debug('Request body:', JSON.stringify(validatedBody, null, 2));
    logger.debug('client_id:', validatedBody.client_id);
    logger.debug('invoice_id:', validatedBody.invoice_id);
    logger.debug('invoice_ids:', validatedBody.invoice_ids);
    logger.debug('project_id:', validatedBody.project_id);
    logger.debug('payment_type:', validatedBody.payment_type);
    
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

    // The client must be the caller's own — also for payment types that link
    // neither an invoice nor a project, where nothing below would check it.
    if (client_id && !(await ownsRow('clients', client_id, userId))) {
      res.status(404).json({ message: 'Client not found for this user.' });
      return;
    }

    // Validate all invoices if provided (ensure they belong to client and user has access)
    let invoiceProjectId = project_id; // Start with provided project_id
    if (invoiceIds.length > 0) {
      if ((await findUnownedIds('invoices', invoiceIds, userId)).length > 0) {
        res.status(404).json({ message: 'Invoice(s) not found or do not belong to the specified client.' });
        return;
      }
      const validateInvoices = await this.db.query(
        `SELECT i.id, i.project_id FROM invoices i WHERE i.id = ANY($1) AND i.client_id = $2 AND i.user_id = $3`,
        [invoiceIds, client_id, userId]
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
        logger.debug('Auto-assigned project_id from first invoice:', invoiceProjectId);
      }
    }

    // Validate project if provided (ensure it belongs to client and user has access)
    if (project_id) {
      const validateProject = await this.db.query(
        `SELECT p.id FROM projects p WHERE p.id = $1 AND p.client_id = $2 AND p.user_id = $3`,
        [project_id, client_id, userId]
      );
      if (validateProject.rows.length === 0) {
          res.status(404).json({ message: 'Project not found or does not belong to the specified client for this user.' });
          return;
      }
    }

    // A real transaction needs ONE connection: BEGIN/COMMIT through the pool can land
    // on different connections and leave one idle in an open transaction.
    const client: PoolClient = await this.db.connect();
    try {
      // Start a transaction
      await client.query('BEGIN');

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
        userId,
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
      
      const result = await client.query(queryText, values);
      const paymentRecord = result.rows[0];

      // Link the invoices; each gets the share of the amount it actually received
      if (invoiceIds.length > 0) {
        await this.linkInvoices(client, paymentRecord.id, Number(amount), payment_type, invoiceIds, userId);
      }

      // Update invoice statuses for all linked invoices
      for (const invoiceId of invoiceIds) {
        await this.updateInvoiceStatus(invoiceId, userId, client);
      }

      await client.query('COMMIT');

      // Add linked invoice IDs to response
      paymentRecord.invoice_ids = invoiceIds;

      // Prepare response
      const response: any = {
        message: 'Payment recorded successfully',
        payment: paymentRecord,
      };

      res.status(201).json(response);

    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => undefined);
      logger.error('Create payment error:', err);
      logger.error('Error details:', {
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
    } finally {
      client.release();
    }
  }

  /**
   * Splits a payment's amount over its invoices and (re)writes its payment_invoices rows.
   *
   * A payment fills each invoice up to what is still open on it (oldest invoice first, counting
   * every other payment), so a partial payment leaves the invoice partially paid. Whatever is left
   * over — an overpayment, or a refund, which has nothing "open" to fill — goes to the last invoice,
   * so the rows always add up to the payment amount. Amounts are split in cents.
   */
  private async linkInvoices(
    db: Pick<PoolClient, 'query'>,
    paymentId: string,
    amount: number,
    paymentType: string,
    invoiceIds: string[],
    userId: string
  ): Promise<void> {
    await db.query('DELETE FROM payment_invoices WHERE payment_id = $1', [paymentId]);
    if (invoiceIds.length === 0) return;

    // Paid on each invoice by all OTHER payments — same rule as updateInvoiceStatus
    const { rows } = await db.query(
      `SELECT i.id, i.total_amount,
              COALESCE((
                SELECT SUM(CASE WHEN p.payment_type = 'payment' THEN COALESCE(pi.amount, p.amount)
                                ELSE -COALESCE(pi.amount, p.amount) END)
                FROM payments p
                LEFT JOIN payment_invoices pi ON pi.payment_id = p.id AND pi.invoice_id = i.id
                WHERE p.id <> $3::uuid
                  AND (pi.invoice_id = i.id
                       OR (p.invoice_id = i.id AND NOT EXISTS (SELECT 1 FROM payment_invoices x WHERE x.payment_id = p.id)))
              ), 0) AS paid_by_others
       FROM invoices i
       WHERE i.id = ANY($1::uuid[]) AND i.user_id = $2
       ORDER BY i.issue_date, i.invoice_number`,
      [invoiceIds, userId, paymentId]
    );
    if (rows.length === 0) return;

    let remaining = Math.round(amount * 100);
    const shares = rows.map((row: any) => {
      const open = Math.max(0, Math.round((Number(row.total_amount) - Number(row.paid_by_others)) * 100));
      const cents = paymentType === 'payment' ? Math.min(remaining, open) : 0;
      remaining -= cents;
      return { invoiceId: row.id as string, cents };
    });
    shares[shares.length - 1].cents += remaining;

    for (const share of shares) {
      await db.query(
        'INSERT INTO payment_invoices (payment_id, invoice_id, amount) VALUES ($1, $2, $3)',
        [paymentId, share.invoiceId, share.cents / 100]
      );
    }
  }

  // Helper method to update invoice status based on payments.
  // Owner-scoped: only an invoice of `userId` is ever re-statused, so a payment
  // can never flip another tenant's invoice to paid/overdue.
  // A cancelled invoice stays cancelled whatever is linked to it.
  private async updateInvoiceStatus(invoiceId: string, userId: string, db: Pick<PoolClient, 'query'> = this.db) {
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
    const totalPaidResult = await db.query(totalPaidQuery, [invoiceId]);
    const totalPaid = Number(totalPaidResult.rows[0].total_paid);

    // Get invoice details
    const invoiceDetailsQuery = `SELECT id, total_amount, due_date FROM invoices WHERE id = $1 AND user_id = $2`;
    const invoiceDetailsResult = await db.query(invoiceDetailsQuery, [invoiceId, userId]);
    
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

      await db.query(
        `UPDATE invoices SET status = $1 WHERE id = $2 AND user_id = $3 AND status <> 'cancelled'`,
        [newStatus, invoiceId, userId]
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
                   JOIN invoices inv ON pi.invoice_id = inv.id AND inv.user_id = p.user_id
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
      logger.error('Find all payments error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

  // Get a specific payment by ID
  async findById(req: Request, res: Response) {
    // Params validation is done by Joi schema
    const { id } = req.params; 

    try {
      if (!isUuid(id)) {
        res.status(404).json({ message: 'Payment not found.' });
        return;
      }
      const queryText = `
        SELECT p.id, p.user_id, p.client_id, p.invoice_id, p.amount, p.payment_type,
               p.payment_method, p.transaction_id, p.payment_date, p.notes, p.created_at,
               COALESCE(
                 (SELECT json_agg(json_build_object(
                   'invoice_id', pi.invoice_id, 
                   'invoice_number', inv.invoice_number
                 ))
                 FROM payment_invoices pi
                 JOIN invoices inv ON pi.invoice_id = inv.id AND inv.user_id = p.user_id
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
      logger.error('Find payment by ID error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

  // Update a payment record.
  // Every field is optional. Changing the linked invoices, the amount, the type or the client
  // re-splits the payment over its invoices and re-statuses every invoice it was or is linked to.
  async update(req: Request, res: Response) {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const { client_id, amount, payment_type, payment_method, transaction_id, payment_date, notes, exclude_from_tax, invoice_ids } = req.body;

    if (amount !== undefined && !(Number(amount) > 0)) {
      res.status(400).json({ message: 'Amount must be a positive number.' });
      return;
    }
    if (invoice_ids !== undefined && (!Array.isArray(invoice_ids) || invoice_ids.some((invoiceId: unknown) => !isUuid(invoiceId as string)))) {
      res.status(400).json({ message: 'invoice_ids must be a list of invoice ids.' });
      return;
    }
    if (payment_date !== undefined && payment_date !== null && Number.isNaN(new Date(payment_date).getTime())) {
      res.status(400).json({ message: 'Invalid payment date.' });
      return;
    }

    const setParts: string[] = [];
    const values: any[] = [];
    const set = (column: string, value: unknown) => {
      values.push(value);
      setParts.push(`${column} = $${values.length}`);
    };

    if (client_id !== undefined) set('client_id', client_id);
    if (amount !== undefined) set('amount', Number(amount));
    if (payment_type !== undefined) set('payment_type', payment_type);
    if (payment_method !== undefined) set('payment_method', payment_method || null);
    if (transaction_id !== undefined) set('transaction_id', transaction_id || null);
    if (payment_date !== undefined) set('payment_date', payment_date ? new Date(payment_date) : null);
    if (notes !== undefined) set('notes', notes || null);
    if (exclude_from_tax !== undefined) set('exclude_from_tax', exclude_from_tax);

    if (setParts.length === 0 && invoice_ids === undefined) {
      res.status(400).json({ message: 'No fields to update.' });
      return;
    }

    // Another user's payment reads as not found — checked before anything is
    // read or written for it.
    if (!isUuid(id) || !(await this.paymentBelongsTo(id, userId))) {
      res.status(404).json({ message: 'Payment not found or no access.' });
      return;
    }

    // A payment may only move to the caller's own client and invoices.
    // Otherwise it would re-status (paid/overdue) another tenant's invoice.
    if (client_id !== undefined && client_id !== null && !(await ownsRow('clients', client_id, userId))) {
      res.status(404).json({ message: 'Client not found for this user.' });
      return;
    }
    if (Array.isArray(invoice_ids) && (await findUnownedIds('invoices', invoice_ids, userId)).length > 0) {
      res.status(404).json({ message: 'Invoice(s) not found for this user.' });
      return;
    }

    const client: PoolClient = await this.db.connect();
    const fail = async (status: number, message: string) => {
      await client.query('ROLLBACK');
      res.status(status).json({ message });
    };
    try {
      await client.query('BEGIN');

      const current = (await client.query(
        `SELECT id, client_id, invoice_id, project_id, payment_type FROM payments WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [id, userId]
      )).rows[0];
      if (!current) {
        await fail(404, 'Payment not found or no access.');
        return;
      }

      // Invoices linked before the update: junction rows, or the legacy invoice_id alone
      const linkedRows = (await client.query(
        `SELECT invoice_id FROM payment_invoices WHERE payment_id = $1`,
        [id]
      )).rows.map((r: any) => r.invoice_id as string);
      const oldInvoiceIds = linkedRows.length > 0 ? linkedRows : (current.invoice_id ? [current.invoice_id as string] : []);

      const newClientId = client_id !== undefined ? client_id : current.client_id;
      const newType = payment_type !== undefined ? payment_type : current.payment_type;
      const newInvoiceIds: string[] = invoice_ids !== undefined ? [...new Set<string>(invoice_ids)] : oldInvoiceIds;
      const clientChanged = client_id !== undefined && client_id !== current.client_id;

      if (invoice_ids !== undefined || clientChanged) {
        if (newInvoiceIds.length > 0) {
          const found = (await client.query(
            `SELECT id, project_id FROM invoices WHERE id = ANY($1::uuid[]) AND client_id = $2 AND user_id = $3`,
            [newInvoiceIds, newClientId, userId]
          )).rows;
          if (found.length !== newInvoiceIds.length) {
            await fail(400, 'All linked invoices must belong to the payment\'s client.');
            return;
          }
          if (invoice_ids !== undefined) {
            const first = found.find((row: any) => row.id === newInvoiceIds[0]);
            set('invoice_id', newInvoiceIds[0]); // first invoice, for backward compatibility
            if (first?.project_id) set('project_id', first.project_id);
          }
        } else if (newType === 'refund') {
          await fail(400, 'A refund must stay linked to an invoice.');
          return;
        } else if (newType === 'payment' && !current.project_id) {
          await fail(400, 'A payment without an invoice needs a project.');
          return;
        } else {
          set('invoice_id', null);
        }
      }

      values.push(id, userId);
      const payment = (await client.query(
        `UPDATE payments
         SET ${setParts.join(', ')}${setParts.length > 0 ? ', ' : ''}updated_at = CURRENT_TIMESTAMP
         WHERE id = $${values.length - 1} AND user_id = $${values.length}
         RETURNING id, user_id, client_id, invoice_id, project_id, amount, payment_type, payment_method, transaction_id, payment_date, notes, exclude_from_tax, created_at`,
        values
      )).rows[0];

      const relink = invoice_ids !== undefined || amount !== undefined || payment_type !== undefined || clientChanged;
      if (relink) {
        await this.linkInvoices(client, id, Number(payment.amount), payment.payment_type, newInvoiceIds, userId);
        for (const invoiceId of new Set([...oldInvoiceIds, ...newInvoiceIds])) {
          await this.updateInvoiceStatus(invoiceId, userId, client);
        }
      }

      await client.query('COMMIT');

      payment.invoice_ids = newInvoiceIds;
      res.status(200).json({
        message: 'Payment updated successfully',
        payment,
      });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => undefined);
      logger.error('Update payment error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    } finally {
      client.release();
    }
  }

  // Delete a payment record; the invoices it was linked to are re-statused in the same transaction
  async delete(req: Request, res: Response) {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }
    if (!isUuid(id)) {
      res.status(404).json({ message: 'Payment not found or no access.' });
      return;
    }

    const client: PoolClient = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Linked invoices before deletion — only for the caller's own payment
      const invoiceIds = (await client.query(
        `SELECT pi.invoice_id FROM payment_invoices pi
         JOIN payments p ON p.id = pi.payment_id
         WHERE pi.payment_id = $1 AND p.user_id = $2
         UNION
         SELECT invoice_id FROM payments WHERE id = $1 AND user_id = $2 AND invoice_id IS NOT NULL`,
        [id, userId]
      )).rows.map((r: any) => r.invoice_id as string);

      const result = await client.query(`DELETE FROM payments WHERE id = $1 AND user_id = $2`, [id, userId]);
      if ((result.rowCount ?? 0) === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ message: 'Payment not found or no access.' });
        return;
      }

      for (const invoiceId of invoiceIds) {
        await this.updateInvoiceStatus(invoiceId, userId, client);
      }

      await client.query('COMMIT');
      res.status(200).json({ message: 'Payment deleted successfully' });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => undefined);
      logger.error('Delete payment error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    } finally {
      client.release();
    }
  }

  // Get payments for a specific invoice
  async getPaymentsByInvoice(req: Request, res: Response) {
    // Params validation is done by Joi schema
    const { invoice_id } = req.params; 
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    try {
      // Validate that user has access to this invoice (a malformed id is
      // "not found", not a database error)
      if (!(await ownsRow('invoices', invoice_id, userId))) {
          res.status(404).json({ message: 'Invoice not found for this user.' });
          return;
      }

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
                 JOIN invoices inv ON pi2.invoice_id = inv.id AND inv.user_id = p.user_id
                 WHERE pi2.payment_id = p.id),
                 '[]'::json
               ) as linked_invoices
        FROM payments p 
        LEFT JOIN payment_invoices pi ON p.id = pi.payment_id
        WHERE (p.invoice_id = $1 OR pi.invoice_id = $1) AND p.user_id = $2
        ORDER BY p.created_at DESC
      `;
      const result = await this.db.query(queryText, [invoice_id, userId]);
      res.status(200).json(result.rows);
    } catch (err: any) {
      logger.error('Get payments by invoice error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

}
