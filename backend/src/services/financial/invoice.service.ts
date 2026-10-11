import { getDbClient } from '../../utils/database';
import {
  CreateInvoiceDto,
  UpdateInvoiceDto,
  Invoice as IInvoice,
  InvoiceItem,
  BaseInvoice
} from '../../models/financial/invoice.model';
import { logger } from '../../utils/logger';
import { assertOwnedReferences, findUnownedIds, ForeignReferenceError, isUuid } from '../ownership.service';

const db = getDbClient();

/**
 * Checks that every row an invoice payload points at belongs to the invoice's
 * owner. A foreign key alone only proves the row exists; without this an
 * invoice could be filed against another tenant's client, and every later read
 * (client name in the list, billing address on the PDF) would leak that
 * tenant's data.
 *
 * @param {Partial<CreateInvoiceDto>} data - Create or update payload
 * @param {string} userId - Owner of the invoice
 * @throws {ForeignReferenceError} When a referenced row is not the user's
 */
async function assertInvoiceReferencesOwned(data: Partial<CreateInvoiceDto>, userId: string): Promise<void> {
  await assertOwnedReferences(
    [
      { table: 'clients', id: data.client_id, field: 'client_id' },
      { table: 'projects', id: data.project_id, field: 'project_id' },
      { table: 'tax_rates', id: data.tax_rate_id, field: 'tax_rate_id' },
      { table: 'invoice_text_templates', id: data.header_template_id, field: 'header_template_id' },
      { table: 'invoice_text_templates', id: data.footer_template_id, field: 'footer_template_id' },
      { table: 'invoice_text_templates', id: data.terms_template_id, field: 'terms_template_id' },
    ],
    userId
  );
}

/**
 * Checks that line items only link time entries of the invoice's owner. The
 * invoice detail resolves a linked entry's project name, so a foreign entry
 * would surface another tenant's project.
 *
 * @param {Partial<InvoiceItem>[]} items - Line items to insert
 * @param {string} userId - Owner of the invoice
 * @throws {ForeignReferenceError} When a time_entry_id is not the user's
 */
async function assertLineItemReferencesOwned(items: Partial<InvoiceItem>[], userId: string): Promise<void> {
  const timeEntryIds = items
    .map((item) => item.time_entry_id)
    .filter((id): id is string => typeof id === 'string' && id !== '');
  if (timeEntryIds.length === 0) return;
  if ((await findUnownedIds('time_entries', timeEntryIds, userId)).length > 0) {
    throw new ForeignReferenceError('time_entry_id');
  }
}

/**
 * Service for managing invoice-related business logic and database operations.
 * Handles CRUD operations for invoices, invoice items, and automatic calculations.
 * Includes automatic invoice number generation and financial calculations.
 * 
 * @class InvoiceService
 */
export class InvoiceService {

  /**
   * Creates a new invoice in the database.
   * Automatically generates invoice number using sequence if not provided.
   * Initializes financial fields (subtotal, tax, total) which will be calculated from items.
   * 
   * @async
   * @param {CreateInvoiceDto} invoiceData - The invoice data to create
   * @returns {Promise<IInvoice>} The created invoice with generated ID and invoice number
   * @throws {Error} If client_id or project_id is invalid (foreign key violation)
   * @throws {Error} If the database operation fails
   * 
   * @example
   * const newInvoice = await invoiceService.create({
   *   user_id: 'user-uuid',
   *   client_id: 'client-uuid',
   *   project_id: 'project-uuid',
   *   status: 'draft',
   *   issue_date: new Date('2024-01-15'),
   *   due_date: new Date('2024-02-15'),
   *   currency: 'USD'
   * });
   * // Invoice number auto-generated: INV-20240115-001
   */
  async create(invoiceData: CreateInvoiceDto): Promise<IInvoice> {
    const db = getDbClient();
    // Client, project, tax rate and templates must all be the owner's own
    // (throws ForeignReferenceError before a sequence number is consumed).
    await assertInvoiceReferencesOwned(invoiceData, invoiceData.user_id);

    // Generate invoice number if not provided
    let invoiceNumber = invoiceData.invoice_number;
    if (!invoiceNumber) {
      const result = await db.query<{ invoice_number: string }>(
        `SELECT 'INV-' || to_char(CURRENT_TIMESTAMP, 'YYYYMMDD') || '-' || nextval('invoice_number_seq') as invoice_number`,
        []
      );
      invoiceNumber = result.rows[0].invoice_number;
    }

    // Get sub_total from invoiceData or default to 0
    const subTotal = invoiceData.sub_total || 0;
    
    // Get tax rate if tax_rate_id is provided
    let taxRate = 0;
    if (invoiceData.tax_rate_id && !invoiceData.exclude_from_tax) {
      const taxRateResult = await db.query(
        'SELECT rate FROM tax_rates WHERE id = $1 AND user_id = $2',
        [invoiceData.tax_rate_id, invoiceData.user_id]
      );
      if (taxRateResult.rows.length > 0) {
        taxRate = Number(taxRateResult.rows[0].rate);
      }
    }
    
    // Calculate tax and total
    // taxRate is stored as percentage (e.g., 19.00), convert to decimal for storage
    const taxAmount = invoiceData.exclude_from_tax ? 0 : (subTotal * taxRate / 100);
    const totalAmount = subTotal + taxAmount;
    const taxRateDecimal = taxRate / 100; // Convert 19 to 0.19 for database storage

    const queryText = `
      INSERT INTO invoices (
        user_id, client_id, project_id, invoice_number, status, issue_date, due_date,
        sub_total, tax_rate, tax_amount, total_amount, currency, notes,
        tax_rate_id, invoice_headline, header_template_id, footer_template_id, terms_template_id,
        invoice_text, footer_text, tax_exemption_text, enable_zugferd, exclude_from_tax, delivery_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
      RETURNING *
    `;
    
    const values = [
      invoiceData.user_id, // Multi-tenant: user who owns this invoice
      invoiceData.client_id,
      invoiceData.project_id || null,
      invoiceNumber,
      invoiceData.status || 'draft',
      invoiceData.issue_date,
      invoiceData.due_date,
      subTotal,
      taxRateDecimal, // Store as decimal (0.19 instead of 19)
      taxAmount,
      totalAmount,
      invoiceData.currency || 'USD',
      invoiceData.notes || null,
      invoiceData.tax_rate_id || null,
      invoiceData.invoice_headline || null,
      invoiceData.header_template_id || null,
      invoiceData.footer_template_id || null,
      invoiceData.terms_template_id || null,
      invoiceData.invoice_text || null,
      invoiceData.footer_text || null,
      invoiceData.tax_exemption_text || null,
      invoiceData.enable_zugferd || false,
      invoiceData.exclude_from_tax || false,
      invoiceData.delivery_date || null,
    ];

    try {
      const result = await db.query(queryText, values);
      return result.rows[0] as IInvoice;
    } catch (error) {
        logger.error('Error creating invoice:', error);
        throw new Error(`Failed to create invoice: ${(error as any).message}`);
    }
  }

  /**
   * Retrieves all invoices from the database.
   * Returns invoices ordered by creation date (newest first).
   * 
   * @async
   * @returns {Promise<IInvoice[]>} Array of all invoices
   * @throws {Error} If the query fails
   * 
   * @example
   * const invoices = await invoiceService.findAll();
   * invoices.forEach(inv => {
   *   console.log(`${inv.invoice_number} - ${inv.status} - $${inv.total_amount}`);
   * });
   */
  async findAll(userId: string): Promise<IInvoice[]> {
    const db = getDbClient();
    const queryText = `
      SELECT i.id, i.user_id, i.client_id, i.project_id, i.invoice_number, i.status, 
             i.issue_date, i.due_date, i.sub_total, i.tax_rate, i.tax_amount,
             i.total_amount, i.currency, i.notes, 
             i.tax_rate_id, i.invoice_headline, i.header_template_id, i.footer_template_id, i.terms_template_id,
             i.invoice_text, i.footer_text, i.tax_exemption_text, i.enable_zugferd, i.delivery_date, i.exclude_from_tax,
             i.created_at, i.updated_at,
             c.name as client_name,
             p.name as project_name
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id AND c.user_id = i.user_id
      LEFT JOIN projects p ON i.project_id = p.id AND p.user_id = i.user_id
      WHERE i.user_id = $1
      ORDER BY i.created_at DESC
    `;
    try {
      const result = await db.query(queryText, [userId]);
      return result.rows as IInvoice[];
    } catch (error) {
        logger.error('Error fetching all invoices:', error);
        throw new Error(`Failed to fetch invoices: ${(error as any).message}`);
    }
  }

  /**
   * Retrieves a single invoice by its ID, scoped to its owner.
   * Returns the invoice with all financial details, client name, and project name if found.
   * An invoice belonging to another user (or a malformed id) reads as "not found".
   *
   * @async
   * @param {string} id - The UUID of the invoice to retrieve
   * @param {string} userId - The UUID of the user who must own the invoice
   * @returns {Promise<IInvoice | null>} The invoice with client_name and project_name, or null if not found
   * @throws {Error} If the query fails
   *
   * @example
   * const invoice = await invoiceService.findById('invoice-uuid', userId);
   * if (invoice) {
   *   console.log(`Invoice: ${invoice.invoice_number}, Client: ${invoice.client_name}, Total: $${invoice.total_amount}`);
   * }
   */
  async findById(id: string, userId: string): Promise<IInvoice | null> {
    if (!isUuid(id)) return null;
    const db = getDbClient();
    const queryText = `
      SELECT i.id, i.user_id, i.client_id, i.project_id, i.invoice_number, i.status, 
             i.issue_date, i.due_date, i.sub_total, i.tax_rate, i.tax_amount,
             i.total_amount, i.currency, i.notes,
             i.tax_rate_id, i.invoice_headline, i.header_template_id, i.footer_template_id, i.terms_template_id,
             i.invoice_text, i.footer_text, i.tax_exemption_text, i.enable_zugferd, i.delivery_date, i.exclude_from_tax,
             i.correction_of_invoice_id, i.original_data, i.correction_reason, i.correction_date,
             i.created_at, i.updated_at,
             c.name as client_name,
             p.name as project_name
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id AND c.user_id = i.user_id
      LEFT JOIN projects p ON i.project_id = p.id AND p.user_id = i.user_id
      WHERE i.id = $1 AND i.user_id = $2
    `;

    // Get payments for this invoice
    const paymentsQuery = `
      SELECT id, user_id, client_id, invoice_id, amount, payment_type, payment_method,
             transaction_id, payment_date, notes, created_at
      FROM payments
      WHERE invoice_id = $1 AND user_id = $2
      ORDER BY payment_date DESC, created_at DESC
    `;

    // Get line items for this invoice - grouped by project name (or description) and unit_price
    // This matches the PDF generation logic for consistency
    const itemsQuery = `
      SELECT 
        (array_agg(ii.id ORDER BY ii.created_at ASC))[1] as id,
        ii.invoice_id,
        COALESCE(p.name, ii.description) as description,
        SUM(ii.quantity) as quantity,
        ii.unit_price,
        SUM(ii.total_price) as total_price,
        COALESCE(ii.rate_type, 'hourly') as rate_type,
        MIN(ii.created_at) as created_at
      FROM invoice_items ii
      LEFT JOIN time_entries te ON ii.time_entry_id = te.id AND te.user_id = $2
      LEFT JOIN projects p ON te.project_id = p.id AND p.user_id = $2
      WHERE ii.invoice_id = $1
      GROUP BY ii.invoice_id, COALESCE(p.name, ii.description), ii.unit_price, ii.rate_type
      ORDER BY MIN(ii.created_at) ASC
    `;

    try {
      const result = await db.query(queryText, [id, userId]);
      if (result.rows.length === 0) return null;

      const invoice = result.rows[0] as IInvoice;

      // Fetch payments for this invoice
      const paymentsResult = await db.query(paymentsQuery, [id, userId]);
      (invoice as any).payments = paymentsResult.rows;

      // Fetch line items for this invoice (the invoice itself is owned, checked above)
      const itemsResult = await db.query(itemsQuery, [id, userId]);
      (invoice as any).items = itemsResult.rows;
      
      return invoice;
    } catch (error) {
        logger.error('Error fetching invoice by ID:', error);
        throw new Error(`Failed to fetch invoice: ${(error as any).message}`);
    }
  }

  /**
   * Updates an existing invoice with partial data, scoped to its owner.
   * Only provided fields will be updated; undefined fields are ignored.
   * Returns null if the invoice is not found or belongs to another user.
   *
   * @async
   * @param {string} id - The UUID of the invoice to update
   * @param {string} userId - The UUID of the user who must own the invoice
   * @param {UpdateInvoiceDto} invoiceData - The partial invoice data to update
   * @returns {Promise<IInvoice | null>} The updated invoice, or null if not found
   * @throws {ForeignReferenceError} If client_id, project_id, tax_rate_id or a template id is not the user's
   * @throws {Error} If the update operation fails
   *
   * @example
   * const updated = await invoiceService.update('invoice-uuid', userId, {
   *   status: 'sent',
   *   issue_date: new Date('2024-01-15')
   * });
   */
  async update(id: string, userId: string, invoiceData: UpdateInvoiceDto): Promise<IInvoice | null> {
    if (!isUuid(id)) return null;
    const db = getDbClient();
    await assertInvoiceReferencesOwned(invoiceData, userId);
    const setParts = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (invoiceData.client_id !== undefined) { 
      setParts.push(`client_id = $${paramIndex++}`); 
      values.push(invoiceData.client_id); 
    }
    
    if (invoiceData.project_id !== undefined) { 
      setParts.push(`project_id = $${paramIndex++}`);
      values.push(invoiceData.project_id || null);
    }
    
    if (invoiceData.invoice_number !== undefined) { 
      setParts.push(`invoice_number = $${paramIndex++}`); 
      values.push(invoiceData.invoice_number); 
    }

    if (invoiceData.status !== undefined) { 
      setParts.push(`status = $${paramIndex++}`);
      values.push(invoiceData.status);
    }
    
    if (invoiceData.issue_date !== undefined) { 
      setParts.push(`issue_date = $${paramIndex++}`); 
      values.push(invoiceData.issue_date); 
    }

    if (invoiceData.due_date !== undefined) { 
      setParts.push(`due_date = $${paramIndex++}`); 
      values.push(invoiceData.due_date); 
    }

    if (invoiceData.notes !== undefined) { 
      setParts.push(`notes = $${paramIndex++}`); 
      values.push(invoiceData.notes || null); 
    }
    
    if (invoiceData.currency !== undefined) { 
      setParts.push(`currency = $${paramIndex++}`);
      values.push(invoiceData.currency);
    }

    // Handle sub_total update - recalculate tax if needed
    if (invoiceData.sub_total !== undefined) {
      const subTotal = invoiceData.sub_total;
      setParts.push(`sub_total = $${paramIndex++}`);
      values.push(subTotal);
      
      // If tax_rate_id is provided or exists, recalculate tax
      let shouldRecalculateTax = false;
      let taxRate = 0;
      
      if (invoiceData.tax_rate_id !== undefined || invoiceData.tax_rate_id === null) {
        shouldRecalculateTax = true;
        if (invoiceData.tax_rate_id) {
          const taxRateResult = await db.query(
            'SELECT rate FROM tax_rates WHERE id = $1 AND user_id = $2',
            [invoiceData.tax_rate_id, userId]
          );
          if (taxRateResult.rows.length > 0) {
            taxRate = Number(taxRateResult.rows[0].rate);
          }
        }
      } else {
        // Get existing tax_rate_id from invoice
        const invoiceResult = await db.query(
          'SELECT tax_rate_id, exclude_from_tax FROM invoices WHERE id = $1 AND user_id = $2',
          [id, userId]
        );
        if (invoiceResult.rows.length > 0 && invoiceResult.rows[0].tax_rate_id && !invoiceResult.rows[0].exclude_from_tax) {
          shouldRecalculateTax = true;
          const taxRateResult = await db.query(
            'SELECT rate FROM tax_rates WHERE id = $1 AND user_id = $2',
            [invoiceResult.rows[0].tax_rate_id, userId]
          );
          if (taxRateResult.rows.length > 0) {
            taxRate = Number(taxRateResult.rows[0].rate);
          }
        }
      }
      
      if (shouldRecalculateTax) {
        const excludeFromTax = invoiceData.exclude_from_tax ?? false;
        const taxAmount = excludeFromTax ? 0 : (subTotal * taxRate / 100);
        const totalAmount = subTotal + taxAmount;
        const taxRateDecimal = taxRate / 100;
        
        setParts.push(`tax_rate = $${paramIndex++}`);
        values.push(taxRateDecimal);
        setParts.push(`tax_amount = $${paramIndex++}`);
        values.push(taxAmount);
        setParts.push(`total_amount = $${paramIndex++}`);
        values.push(totalAmount);
      }
    }

    // New invoice configuration fields
    if (invoiceData.tax_rate_id !== undefined) { 
      setParts.push(`tax_rate_id = $${paramIndex++}`);
      values.push(invoiceData.tax_rate_id || null);
    }
    
    if (invoiceData.invoice_headline !== undefined) { 
      setParts.push(`invoice_headline = $${paramIndex++}`);
      values.push(invoiceData.invoice_headline || null);
    }
    
    if (invoiceData.header_template_id !== undefined) { 
      setParts.push(`header_template_id = $${paramIndex++}`);
      values.push(invoiceData.header_template_id || null);
    }
    
    if (invoiceData.footer_template_id !== undefined) { 
      setParts.push(`footer_template_id = $${paramIndex++}`);
      values.push(invoiceData.footer_template_id || null);
    }
    
    if (invoiceData.terms_template_id !== undefined) { 
      setParts.push(`terms_template_id = $${paramIndex++}`);
      values.push(invoiceData.terms_template_id || null);
    }
    
    if (invoiceData.invoice_text !== undefined) { 
      setParts.push(`invoice_text = $${paramIndex++}`);
      values.push(invoiceData.invoice_text || null);
    }
    
    if (invoiceData.footer_text !== undefined) { 
      setParts.push(`footer_text = $${paramIndex++}`);
      values.push(invoiceData.footer_text || null);
    }
    
    if (invoiceData.tax_exemption_text !== undefined) { 
      setParts.push(`tax_exemption_text = $${paramIndex++}`);
      values.push(invoiceData.tax_exemption_text || null);
    }
    
    if (invoiceData.enable_zugferd !== undefined) { 
      setParts.push(`enable_zugferd = $${paramIndex++}`);
      values.push(invoiceData.enable_zugferd);
    }
    
    if (invoiceData.exclude_from_tax !== undefined) { 
      setParts.push(`exclude_from_tax = $${paramIndex++}`);
      values.push(invoiceData.exclude_from_tax);
    }
    
    if (invoiceData.delivery_date !== undefined) { 
      setParts.push(`delivery_date = $${paramIndex++}`);
      values.push(invoiceData.delivery_date || null);
    }

    // Handle financial fields that should be calculated
    if (setParts.length === 0) {
      return this.findById(id, userId);
    }

    const queryText = `
      UPDATE invoices
      SET ${setParts.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1} RETURNING id, user_id, client_id, project_id, invoice_number, status,
        issue_date, due_date, sub_total, tax_rate, tax_amount, total_amount, currency, notes,
        tax_rate_id, invoice_headline, header_template_id, footer_template_id, terms_template_id,
        invoice_text, footer_text, tax_exemption_text, enable_zugferd, exclude_from_tax, created_at, updated_at
    `;
    values.push(id, userId);

    try {
      const result = await db.query(queryText, values);
      if (result.rows.length === 0) return null;
      return result.rows[0] as IInvoice;
    } catch (error) {
        logger.error('Error updating invoice:', error);
        throw new Error(`Failed to update invoice: ${(error as any).message}`);
    }
  }

  /**
   * Deletes an invoice from the database, scoped to its owner.
   * Line items and payments hanging on it go with it (ON DELETE CASCADE).
   *
   * @async
   * @param {string} id - The UUID of the invoice to delete
   * @param {string} userId - The UUID of the user who must own the invoice
   * @returns {Promise<boolean>} True if the invoice was deleted, false if not found or not the user's
   * @throws {Error} If the deletion fails
   *
   * @example
   * const deleted = await invoiceService.delete('invoice-uuid', userId);
   * if (deleted) console.log('Invoice deleted successfully');
   */
  async delete(id: string, userId: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    const db = getDbClient();
    const queryText = `DELETE FROM invoices WHERE id = $1 AND user_id = $2`;
    try {
      const result = await db.query(queryText, [id, userId]);
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
        logger.error('Error deleting invoice:', error);
        throw new Error(`Failed to delete invoice: ${(error as any).message}`);
    }
  }

  /**
   * Calculates and updates invoice totals based on associated time entries.
   * Queries time entries for the invoice's project and calculates subtotal, tax, and total.
   * Updates the invoice with calculated amounts.
   *
   * Not owner-scoped: only call it for an invoice whose ownership the caller
   * has already established (it only recomputes the invoice's own totals).
   *
   * @async
   * @param {string} invoiceId - The UUID of the invoice to calculate totals for
   * @returns {Promise<void>} Resolves when totals are calculated and updated
   * @throws {Error} If the calculation or update fails
   * 
   * @example
   * await invoiceService.calculateInvoiceTotals('invoice-uuid');
   * const updated = await invoiceService.findById('invoice-uuid');
   * console.log(`New total: $${updated.total_amount}`);
   */
  async calculateInvoiceTotals(invoiceId: string): Promise<void> {
    const db = getDbClient();
    try {
      const result = await db.query(
        `SELECT 
          SUM(ii.quantity * ii.unit_price) as sub_total,
          SUM(ii.quantity * ii.unit_price * i.tax_rate) as tax_amount
         FROM invoice_items ii 
         JOIN invoices i ON ii.invoice_id = i.id 
         WHERE ii.invoice_id = $1`,
        [invoiceId]
      );

      const { sub_total, tax_amount } = result.rows[0];
      
      // Convert to numbers (PostgreSQL returns decimals as strings)
      const subTotalNum = sub_total ? parseFloat(sub_total) : 0;
      const taxAmountNum = tax_amount ? parseFloat(tax_amount) : 0;
      
      // Update the main invoice with calculated totals
      await db.query(
        `UPDATE invoices SET 
          sub_total = $1,
          tax_amount = $2,
          total_amount = $3
         WHERE id = $4`,
        [subTotalNum, taxAmountNum, subTotalNum + taxAmountNum, invoiceId]
      );
    } catch (error) {
      logger.error('Error calculating invoice totals:', error);
      throw new Error(`Failed to calculate totals: ${(error as any).message}`);
    }
  }

  /**
   * Whether the user owns the invoice. Malformed ids are "not owned".
   *
   * @param {string} invoiceId - Invoice to check
   * @param {string} userId - The authenticated user
   * @returns {Promise<boolean>} True when the invoice exists and is the user's
   */
  async isOwnedBy(invoiceId: string, userId: string): Promise<boolean> {
    if (!isUuid(invoiceId)) return false;
    const result = await getDbClient().query(
      'SELECT 1 FROM invoices WHERE id = $1 AND user_id = $2',
      [invoiceId, userId]
    );
    return result.rows.length > 0;
  }

  /**
   * Adds line items to an invoice of the given user and recalculates totals.
   *
   * @param {string} invoiceId - Invoice to add to
   * @param {string} userId - The UUID of the user who must own the invoice
   * @param {InvoiceItem[]} items - Items to add
   * @returns {Promise<boolean>} False when the invoice is not found or not the user's
   * @throws {ForeignReferenceError} If an item links a time entry that is not the user's
   */
  async addLineItems(invoiceId: string, userId: string, items: InvoiceItem[]): Promise<boolean> {
    if (!(await this.isOwnedBy(invoiceId, userId))) return false;
    await assertLineItemReferencesOwned(items, userId);
    const db = getDbClient();
    try {
      for (const item of items) {
        const queryText = `
          INSERT INTO invoice_items (
            invoice_id, time_entry_id, description, quantity, unit_price, total_price, rate_type
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `;
        await db.query(queryText, [
          invoiceId,
          item.time_entry_id || null,
          item.description,
          item.quantity,
          item.unit_price,
          item.total_price,
          item.rate_type || 'hourly'
        ]);
      }

      // Recalculate totals after adding items
      await this.calculateInvoiceTotals(invoiceId);
      return true;
    } catch (error) {
      logger.error('Error adding line items:', error);
      throw new Error(`Failed to add line items: ${(error as any).message}`);
    }
  }

  /**
   * Replaces all line items of an invoice of the given user (delete existing,
   * add new) and recalculates totals.
   *
   * @param {string} invoiceId - Invoice whose items are replaced
   * @param {string} userId - The UUID of the user who must own the invoice
   * @param {InvoiceItem[]} items - The new items
   * @returns {Promise<boolean>} False when the invoice is not found or not the user's
   * @throws {ForeignReferenceError} If an item links a time entry that is not the user's
   */
  async replaceLineItems(invoiceId: string, userId: string, items: InvoiceItem[]): Promise<boolean> {
    if (!(await this.isOwnedBy(invoiceId, userId))) return false;
    await assertLineItemReferencesOwned(items, userId);
    const db = getDbClient();
    try {
      // Delete existing line items
      await db.query('DELETE FROM invoice_items WHERE invoice_id = $1', [invoiceId]);

      // Add new line items
      for (const item of items) {
        const queryText = `
          INSERT INTO invoice_items (
            invoice_id, time_entry_id, description, quantity, unit_price, total_price, rate_type
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `;
        await db.query(queryText, [
          invoiceId,
          item.time_entry_id || null,
          item.description,
          item.quantity,
          item.unit_price,
          item.total_price,
          item.rate_type || 'hourly'
        ]);
      }

      // Recalculate totals after replacing items
      await this.calculateInvoiceTotals(invoiceId);
      return true;
    } catch (error) {
      logger.error('Error replacing line items:', error);
      throw new Error(`Failed to replace line items: ${(error as any).message}`);
    }
  }
}
