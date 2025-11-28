import { getDbClient } from '../../utils/database';

/**
 * Billing validation status indicating the payment state of an invoice.
 * 
 * @typedef {'valid' | 'underbilled' | 'overbilled'} BillingStatus
 */
export type BillingStatus = 'valid' | 'underbilled' | 'overbilled';

/**
 * Result of billing validation check for an invoice.
 * 
 * @interface BillingValidationResult
 * @property {string} invoice_id - UUID of the validated invoice
 * @property {number} invoice_total - Total amount on the invoice
 * @property {number} total_paid - Total amount paid across all payment records
 * @property {number} balance - Remaining balance (negative if overpaid)
 * @property {BillingStatus} status - Validation status (valid, underbilled, overbilled)
 * @property {string[]} warnings - Array of warning messages
 * @property {number} threshold - Configured threshold amount for validation
 * @property {string} currency - Currency code of the invoice
 */
export interface BillingValidationResult {
  invoice_id: string;
  invoice_total: number;
  total_paid: number;
  balance: number;
  status: BillingStatus;
  warnings: string[];
  threshold: number;
  currency: string;
}

/**
 * Configuration for billing validation thresholds.
 * 
 * @interface BillingValidationConfig
 * @property {number} [threshold] - Acceptable variance in EUR/USD (default: 1.50)
 * @property {boolean} [strict] - If true, reject payments causing overbilling (default: false)
 */
export interface BillingValidationConfig {
  threshold?: number;
  strict?: boolean;
}

/**
 * Service for validating invoice billing status.
 * Detects overbilling and underbilling with configurable thresholds.
 * 
 * @class BillingValidationService
 */
export class BillingValidationService {
  private db = getDbClient();
  private defaultThreshold = 1.50; // Default threshold: 1.50 EUR/USD

  /**
   * Validates the billing status of an invoice.
   * Compares total invoice amount with sum of all payments.
   * 
   * @async
   * @param {string} invoiceId - UUID of the invoice to validate
   * @param {BillingValidationConfig} [config] - Optional validation configuration
   * @returns {Promise<BillingValidationResult>} Validation result with status and warnings
   * @throws {Error} If invoice is not found or database query fails
   * 
   * @example
   * const result = await billingValidationService.validateInvoice('invoice-uuid');
   * if (result.status === 'overbilled') {
   *   console.log('Warning: Invoice overpaid by', Math.abs(result.balance));
   * }
   */
  async validateInvoice(
    invoiceId: string,
    config: BillingValidationConfig = {}
  ): Promise<BillingValidationResult> {
    const threshold = config.threshold ?? this.defaultThreshold;

    try {
      // Fetch invoice details
      const invoiceQuery = `
        SELECT id, total_amount, currency
        FROM invoices
        WHERE id = $1
      `;
      const invoiceResult = await this.db.query(invoiceQuery, [invoiceId]);

      if (invoiceResult.rows.length === 0) {
        throw new Error(`Invoice with ID ${invoiceId} not found`);
      }

      const invoice = invoiceResult.rows[0];
      const invoiceTotal = Number(invoice.total_amount);
      const currency = invoice.currency;

      // Calculate total paid (add payments, subtract refunds and expenses)
      const paymentsQuery = `
        SELECT COALESCE(
          SUM(CASE 
            WHEN payment_type = 'payment' THEN amount
            ELSE -amount
          END), 0
        ) as total_paid
        FROM payments
        WHERE invoice_id = $1
      `;
      const paymentsResult = await this.db.query(paymentsQuery, [invoiceId]);
      const totalPaid = Number(paymentsResult.rows[0].total_paid);

      // Calculate balance
      const balance = invoiceTotal - totalPaid;

      // Determine status
      let status: BillingStatus = 'valid';
      const warnings: string[] = [];

      if (balance > threshold) {
        // Underbilled: Not enough paid
        status = 'underbilled';
        warnings.push(
          `Invoice is underbilled by ${Math.abs(balance).toFixed(2)} ${currency}. ` +
          `Expected: ${invoiceTotal.toFixed(2)} ${currency}, ` +
          `Paid: ${totalPaid.toFixed(2)} ${currency}.`
        );
      } else if (balance < -threshold) {
        // Overbilled: Too much paid
        status = 'overbilled';
        warnings.push(
          `Invoice is overbilled by ${Math.abs(balance).toFixed(2)} ${currency}. ` +
          `Expected: ${invoiceTotal.toFixed(2)} ${currency}, ` +
          `Paid: ${totalPaid.toFixed(2)} ${currency}. ` +
          `Overpayment may indicate duplicate payment entries.`
        );

        // Check for potential duplicate payments
        const duplicateCheck = await this.checkDuplicatePayments(invoiceId);
        if (duplicateCheck.hasDuplicates) {
          warnings.push(
            `Potential duplicate payments detected: ${duplicateCheck.duplicateCount} ` +
            `payment(s) with identical amounts on the same date.`
          );
        }
      } else {
        // Within threshold - considered valid
        if (Math.abs(balance) > 0) {
          warnings.push(
            `Balance is ${balance.toFixed(2)} ${currency} ` +
            `(within acceptable threshold of ${threshold.toFixed(2)} ${currency}).`
          );
        }
      }

      return {
        invoice_id: invoiceId,
        invoice_total: invoiceTotal,
        total_paid: totalPaid,
        balance: balance,
        status: status,
        warnings: warnings,
        threshold: threshold,
        currency: currency
      };

    } catch (error) {
      console.error('Billing validation error:', error);
      throw new Error(`Failed to validate invoice billing: ${(error as any).message}`);
    }
  }

  /**
   * Checks for potential duplicate payment entries.
   * Identifies payments with identical amounts on the same date.
   * 
   * @async
   * @param {string} invoiceId - UUID of the invoice to check
   * @returns {Promise<{hasDuplicates: boolean, duplicateCount: number}>} Duplicate detection result
   * 
   * @example
   * const check = await billingValidationService.checkDuplicatePayments('invoice-uuid');
   * if (check.hasDuplicates) {
   *   console.log(`Found ${check.duplicateCount} potential duplicates`);
   * }
   */
  async checkDuplicatePayments(invoiceId: string): Promise<{
    hasDuplicates: boolean;
    duplicateCount: number;
  }> {
    try {
      const query = `
        SELECT amount, payment_date, COUNT(*) as count
        FROM payments
        WHERE invoice_id = $1
        GROUP BY amount, payment_date
        HAVING COUNT(*) > 1
      `;
      const result = await this.db.query(query, [invoiceId]);

      const duplicateCount = result.rows.reduce((sum: number, row: any) => sum + Number(row.count) - 1, 0);

      return {
        hasDuplicates: result.rows.length > 0,
        duplicateCount: duplicateCount
      };
    } catch (error) {
      console.error('Duplicate payment check error:', error);
      return { hasDuplicates: false, duplicateCount: 0 };
    }
  }

  /**
   * Validates a proposed payment before recording it.
   * Checks if the payment would cause overbilling beyond the threshold.
   * 
   * @async
   * @param {string} invoiceId - UUID of the invoice
   * @param {number} proposedPaymentAmount - Amount of the proposed payment
   * @param {BillingValidationConfig} [config] - Optional validation configuration
   * @returns {Promise<{isValid: boolean, warnings: string[], projectedBalance: number}>} Validation result
   * 
   * @example
   * const check = await billingValidationService.validateProposedPayment(
   *   'invoice-uuid',
   *   500.00,
   *   { strict: true }
   * );
   * if (!check.isValid) {
   *   console.error('Payment would cause overbilling:', check.warnings);
   * }
   */
  async validateProposedPayment(
    invoiceId: string,
    proposedPaymentAmount: number,
    config: BillingValidationConfig = {}
  ): Promise<{
    isValid: boolean;
    warnings: string[];
    projectedBalance: number;
    projectedStatus: BillingStatus;
  }> {
    const threshold = config.threshold ?? this.defaultThreshold;
    const strict = config.strict ?? false;

    try {
      // Get current validation status
      const currentValidation = await this.validateInvoice(invoiceId, config);

      // Calculate projected totals
      const projectedTotalPaid = currentValidation.total_paid + proposedPaymentAmount;
      const projectedBalance = currentValidation.invoice_total - projectedTotalPaid;

      // Determine projected status
      let projectedStatus: BillingStatus = 'valid';
      const warnings: string[] = [];

      if (projectedBalance > threshold) {
        projectedStatus = 'underbilled';
        warnings.push(
          `After this payment, invoice will still be underbilled by ` +
          `${Math.abs(projectedBalance).toFixed(2)} ${currentValidation.currency}.`
        );
      } else if (projectedBalance < -threshold) {
        projectedStatus = 'overbilled';
        warnings.push(
          `This payment of ${proposedPaymentAmount.toFixed(2)} ${currentValidation.currency} ` +
          `would cause overbilling by ${Math.abs(projectedBalance).toFixed(2)} ${currentValidation.currency}. ` +
          `Remaining balance is only ${currentValidation.balance.toFixed(2)} ${currentValidation.currency}.`
        );
      }

      // In strict mode, reject payments that would cause overbilling
      const isValid = strict ? projectedStatus !== 'overbilled' : true;

      return {
        isValid: isValid,
        warnings: warnings,
        projectedBalance: projectedBalance,
        projectedStatus: projectedStatus
      };

    } catch (error) {
      console.error('Proposed payment validation error:', error);
      throw new Error(`Failed to validate proposed payment: ${(error as any).message}`);
    }
  }

  /**
   * Gets detailed payment breakdown for an invoice.
   * Useful for identifying which payments contribute to overbilling.
   * 
   * @async
   * @param {string} invoiceId - UUID of the invoice
   * @returns {Promise<Array>} Array of payment records with details
   * 
   * @example
   * const payments = await billingValidationService.getPaymentBreakdown('invoice-uuid');
   * payments.forEach(p => {
   *   console.log(`${p.payment_date}: ${p.amount} via ${p.payment_method}`);
   * });
   */
  async getPaymentBreakdown(invoiceId: string): Promise<any[]> {
    try {
      const query = `
        SELECT id, amount, payment_method, payment_date, transaction_id, notes, created_at
        FROM payments
        WHERE invoice_id = $1
        ORDER BY payment_date ASC, created_at ASC
      `;
      const result = await this.db.query(query, [invoiceId]);
      return result.rows;
    } catch (error) {
      console.error('Payment breakdown error:', error);
      return [];
    }
  }
}
