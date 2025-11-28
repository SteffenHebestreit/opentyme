/**
 * @fileoverview Report generation service for German tax reporting.
 * 
 * Generates on-the-fly reports for:
 * - VAT Report (Umsatzsteuervoranmeldung)
 * - Income/Expense Report (Einnahmenüberschussrechnung - EÜR)
 * - Invoice Report
 * - Expense Report
 * - Time Tracking Report
 * - Client Revenue Report
 * 
 * All reports are generated dynamically from database queries.
 * No report data is stored - everything is calculated on demand.
 * 
 * @module services/analytics/report.service
 */

import { getDbClient } from '../../utils/database';

/**
 * VAT Report data structure for Umsatzsteuervoranmeldung.
 * 
 * @interface VATReport
 */
export interface VATReport {
  period: {
    start_date: string;
    end_date: string;
    quarter?: number;
    year: number;
  };
  revenue: {
    gross_19: number;  // Bruttoumsatz mit 19% USt
    net_19: number;    // Nettoumsatz mit 19% USt
    vat_19: number;    // USt-Betrag bei 19%
    gross_7: number;   // Bruttoumsatz mit 7% USt
    net_7: number;     // Nettoumsatz mit 7% USt
    vat_7: number;     // USt-Betrag bei 7%
    gross_0: number;   // Umsatz steuerfrei
    total_gross: number;
    total_net: number;
    total_vat: number;
  };
  expenses: {
    gross_19: number;  // Vorsteuer-relevante Ausgaben mit 19%
    net_19: number;
    vat_19: number;
    gross_7: number;   // Vorsteuer-relevante Ausgaben mit 7%
    net_7: number;
    vat_7: number;
    total_gross: number;
    total_net: number;
    total_vat: number;  // Vorsteuer (Input VAT)
  };
  summary: {
    revenue_vat: number;      // Umsatzsteuer (Output VAT)
    expense_vat: number;      // Vorsteuer (Input VAT)
    vat_payable: number;      // Zahllast (wenn positiv) oder Erstattung (wenn negativ)
  };
}

/**
 * Income/Expense Report (EÜR - Einnahmenüberschussrechnung).
 * 
 * @interface IncomeExpenseReport
 */
export interface IncomeExpenseReport {
  period: {
    start_date: string;
    end_date: string;
    year: number;
  };
  income: {
    total_invoiced: number;      // Gesamtrechnungen
    total_paid: number;          // Bezahlte Rechnungen
    total_outstanding: number;   // Offene Forderungen
    by_tax_rate: Array<{
      tax_rate: number;
      gross_amount: number;
      net_amount: number;
      tax_amount: number;
    }>;
    transactions: Array<{
      id: string;
      invoice_number: string;
      client_name: string;
      project_name: string | null;
      issue_date: string;
      payment_date: string | null;
      transaction_id: string | null;
      status: string;
      net_amount: number;
      tax_rate: number;
      tax_amount: number;
      gross_amount: number;
    }>;
    standalone_payments: Array<{
      id: string;
      payment_date: string;
      amount: number;
      notes: string;
      project_name: string;
      client_name: string;
    }>;
  };
  expenses: {
    total: number;
    by_category: Array<{
      category: string;
      amount: number;
      count: number;
    }>;
    by_tax_rate: Array<{
      tax_rate: number;
      gross_amount: number;
      net_amount: number;
      tax_amount: number;
    }>;
    transactions: Array<{
      id: string;
      expense_date: string;
      description: string;
      category: string;
      net_amount: number;
      tax_rate: number;
      tax_amount: number;
      amount: number;
    }>;
  };
  summary: {
    total_income: number;     // Betriebseinnahmen
    total_expenses: number;   // Betriebsausgaben
    profit_loss: number;      // Gewinn/Verlust
  };
  tax_prepayments: {
    vat_prepayments: number;         // Umsatzsteuervorauszahlungen
    income_tax_prepayments: number;  // Einkommensteuervorauszahlungen
    total_prepayments: number;       // Summe aller Vorauszahlungen
    transactions: Array<{
      id: string;
      tax_type: string;
      amount: number;
      payment_date: string;
      quarter?: number;
      tax_year: number;
      description?: string;
    }>;
  };
}

/**
 * Invoice Report with detailed invoice listing.
 * 
 * @interface InvoiceReport
 */
export interface InvoiceReport {
  period: {
    start_date: string;
    end_date: string;
  };
  invoices: Array<{
    invoice_number: string;
    client_name: string;
    issue_date: string;
    due_date: string;
    status: string;
    net_amount: number;
    tax_rate: number;
    tax_amount: number;
    gross_amount: number;
    paid_amount: number;
    outstanding: number;
    days_overdue?: number;
    aging_bucket?: string;
  }>;
  summary: {
    total_invoices: number;
    total_gross: number;
    total_net: number;
    total_tax: number;
    total_paid: number;
    total_outstanding: number;
    by_status: Record<string, { count: number; amount: number }>;
    aging_analysis?: {
      current: { count: number; amount: number };           // 0-30 days
      days_31_60: { count: number; amount: number };       // 31-60 days
      days_61_90: { count: number; amount: number };       // 61-90 days
      over_90_days: { count: number; amount: number };     // 90+ days
    };
  };
}

/**
 * Expense Report with detailed expense listing.
 * 
 * @interface ExpenseReport
 */
export interface ExpenseReport {
  period: {
    start_date: string;
    end_date: string;
  };
  expenses: Array<{
    date: string;
    description: string;
    category: string;
    project_name?: string;
    net_amount: number;
    tax_rate: number;
    tax_amount: number;
    gross_amount: number;
    is_billable: boolean;
    has_receipt: boolean;
  }>;
  summary: {
    total_count: number;
    total_gross: number;
    total_net: number;
    total_tax: number;
    by_category: Record<string, { count: number; amount: number }>;
    by_tax_rate: Record<string, { count: number; net: number; tax: number; gross: number }>;
  };
}

/**
 * Time Tracking Report for billable hours analysis.
 * 
 * @interface TimeTrackingReport
 */
export interface TimeTrackingReport {
  period: {
    start_date: string;
    end_date: string;
  };
  entries: Array<{
    date: string;
    project_name: string;
    client_name: string;
    task_name?: string;
    description: string;
    hours: number;
    is_billable: boolean;
    hourly_rate?: number;
    value?: number;
  }>;
  summary: {
    total_hours: number;
    billable_hours: number;
    non_billable_hours: number;
    billable_value: number;
    by_project: Record<string, { hours: number; billable_hours: number; value: number }>;
    by_client: Record<string, { hours: number; billable_hours: number; value: number }>;
  };
}

/**
 * Client Revenue Report.
 * 
 * @interface ClientRevenueReport
 */
export interface ClientRevenueReport {
  period: {
    start_date: string;
    end_date: string;
  };
  clients: Array<{
    client_name: string;
    total_invoiced: number;
    total_paid: number;
    total_outstanding: number;
    invoice_count: number;
    hours_tracked: number;
  }>;
  summary: {
    total_clients: number;
    total_invoiced: number;
    total_paid: number;
    total_outstanding: number;
  };
}

export class ReportService {
  private db = getDbClient();

  /**
   * Generate VAT Report (Umsatzsteuervoranmeldung).
   * 
   * @param userId - User ID
   * @param startDate - Start date (YYYY-MM-DD)
   * @param endDate - End date (YYYY-MM-DD)
   * @returns VAT report data
   */
  async generateVATReport(userId: string, startDate: string, endDate: string): Promise<VATReport> {
    // Calculate quarter and year
    const start = new Date(startDate);
    const year = start.getFullYear();
    const quarter = Math.floor(start.getMonth() / 3) + 1;

    // Get revenue data from invoices (output VAT - Umsatzsteuer)
    const revenueQuery = `
      SELECT 
        COALESCE(SUM(CASE WHEN tax_rate = 19 THEN total_amount ELSE 0 END), 0) AS gross_19,
        COALESCE(SUM(CASE WHEN tax_rate = 19 THEN sub_total ELSE 0 END), 0) AS net_19,
        COALESCE(SUM(CASE WHEN tax_rate = 19 THEN tax_amount ELSE 0 END), 0) AS vat_19,
        COALESCE(SUM(CASE WHEN tax_rate = 7 THEN total_amount ELSE 0 END), 0) AS gross_7,
        COALESCE(SUM(CASE WHEN tax_rate = 7 THEN sub_total ELSE 0 END), 0) AS net_7,
        COALESCE(SUM(CASE WHEN tax_rate = 7 THEN tax_amount ELSE 0 END), 0) AS vat_7,
        COALESCE(SUM(CASE WHEN tax_rate = 0 THEN total_amount ELSE 0 END), 0) AS gross_0,
        COALESCE(SUM(total_amount), 0) AS total_gross,
        COALESCE(SUM(sub_total), 0) AS total_net,
        COALESCE(SUM(tax_amount), 0) AS total_vat
      FROM invoices
      WHERE user_id = $1
        AND status IN ('sent', 'paid')
        AND issue_date >= $2
        AND issue_date <= $3
    `;

    // Get expense data (input VAT - Vorsteuer)
    const expenseQuery = `
      SELECT 
        COALESCE(SUM(CASE WHEN tax_rate = 19 THEN amount * COALESCE(tax_deductible_percentage, 100) / 100 ELSE 0 END), 0) AS gross_19,
        COALESCE(SUM(CASE WHEN tax_rate = 19 THEN net_amount * COALESCE(tax_deductible_percentage, 100) / 100 ELSE 0 END), 0) AS net_19,
        COALESCE(SUM(CASE WHEN tax_rate = 19 THEN tax_amount * COALESCE(tax_deductible_percentage, 100) / 100 ELSE 0 END), 0) AS vat_19,
        COALESCE(SUM(CASE WHEN tax_rate = 7 THEN amount * COALESCE(tax_deductible_percentage, 100) / 100 ELSE 0 END), 0) AS gross_7,
        COALESCE(SUM(CASE WHEN tax_rate = 7 THEN net_amount * COALESCE(tax_deductible_percentage, 100) / 100 ELSE 0 END), 0) AS net_7,
        COALESCE(SUM(CASE WHEN tax_rate = 7 THEN tax_amount * COALESCE(tax_deductible_percentage, 100) / 100 ELSE 0 END), 0) AS vat_7,
        COALESCE(SUM(amount * COALESCE(tax_deductible_percentage, 100) / 100), 0) AS total_gross,
        COALESCE(SUM(net_amount * COALESCE(tax_deductible_percentage, 100) / 100), 0) AS total_net,
        COALESCE(SUM(tax_amount * COALESCE(tax_deductible_percentage, 100) / 100), 0) AS total_vat
      FROM expenses
      WHERE user_id = $1
        AND expense_date >= $2
        AND expense_date <= $3
    `;

    const [revenueResult, expenseResult] = await Promise.all([
      this.db.query(revenueQuery, [userId, startDate, endDate]),
      this.db.query(expenseQuery, [userId, startDate, endDate]),
    ]);

    const revenue = revenueResult.rows[0];
    const expenses = expenseResult.rows[0];

    const revenueVAT = Number(revenue.total_vat);
    const expenseVAT = Number(expenses.total_vat);
    const vatPayable = revenueVAT - expenseVAT;

    return {
      period: {
        start_date: startDate,
        end_date: endDate,
        quarter,
        year,
      },
      revenue: {
        gross_19: Number(revenue.gross_19),
        net_19: Number(revenue.net_19),
        vat_19: Number(revenue.vat_19),
        gross_7: Number(revenue.gross_7),
        net_7: Number(revenue.net_7),
        vat_7: Number(revenue.vat_7),
        gross_0: Number(revenue.gross_0),
        total_gross: Number(revenue.total_gross),
        total_net: Number(revenue.total_net),
        total_vat: Number(revenue.total_vat),
      },
      expenses: {
        gross_19: Number(expenses.gross_19),
        net_19: Number(expenses.net_19),
        vat_19: Number(expenses.vat_19),
        gross_7: Number(expenses.gross_7),
        net_7: Number(expenses.net_7),
        vat_7: Number(expenses.vat_7),
        total_gross: Number(expenses.total_gross),
        total_net: Number(expenses.total_net),
        total_vat: Number(expenses.total_vat),
      },
      summary: {
        revenue_vat: revenueVAT,
        expense_vat: expenseVAT,
        vat_payable: vatPayable,
      },
    };
  }

  /**
   * Generate Income/Expense Report (EÜR).
   * 
   * @param userId - User ID
   * @param startDate - Start date (YYYY-MM-DD)
   * @param endDate - End date (YYYY-MM-DD)
   * @returns Income/Expense report data
   */
  async generateIncomeExpenseReport(
    userId: string,
    startDate: string,
    endDate: string,
    excludeTaxExcluded: boolean = true
  ): Promise<IncomeExpenseReport> {
    const year = new Date(startDate).getFullYear();

    // Build exclude filter clause (for both invoices and payments)
    // Use table alias for queries with JOINs, simple name for single-table queries
    const invoiceExcludeFilter = excludeTaxExcluded ? 'AND exclude_from_tax = false' : '';
    const invoiceExcludeFilterWithAlias = excludeTaxExcluded ? 'AND i.exclude_from_tax = false' : '';
    const paymentExcludeFilter = excludeTaxExcluded ? 'AND pay.exclude_from_tax = false' : '';

    // Income data - ONLY non-draft invoices (sent, paid, overdue, cancelled)
    const incomeQuery = `
      SELECT 
        SUM(total_amount) AS total_invoiced,
        SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END) AS total_paid,
        SUM(CASE WHEN status IN ('sent', 'overdue') THEN total_amount ELSE 0 END) AS total_outstanding,
        tax_rate,
        SUM(total_amount) AS gross_amount,
        SUM(sub_total) AS net_amount,
        SUM(tax_amount) AS tax_amount
      FROM invoices
      WHERE user_id = $1
        AND issue_date >= $2
        AND issue_date <= $3
        AND status != 'draft'
        ${invoiceExcludeFilter}
      GROUP BY tax_rate
      ORDER BY tax_rate DESC
    `;

    // Standalone payments (recurring project payments without invoices)
    const standalonePaymentsFilter = excludeTaxExcluded ? 'AND exclude_from_tax = false' : '';
    const standalonePaymentsQuery = `
      SELECT 
        SUM(amount) AS total_amount,
        COUNT(*) AS count
      FROM payments
      WHERE user_id = $1
        AND payment_date >= $2
        AND payment_date <= $3
        AND payment_type = 'payment'
        AND invoice_id IS NULL
        ${standalonePaymentsFilter}
    `;

    // Get individual standalone payment transactions
    const standalonePaymentTransactionsQuery = `
      SELECT 
        pay.id,
        pay.payment_date,
        pay.amount,
        pay.notes,
        proj.name AS project_name,
        c.name AS client_name
      FROM payments pay
      LEFT JOIN projects proj ON pay.project_id = proj.id
      LEFT JOIN clients c ON proj.client_id = c.id
      WHERE pay.user_id = $1
        AND pay.payment_date >= $2
        AND pay.payment_date <= $3
        AND pay.payment_type = 'payment'
        AND pay.invoice_id IS NULL
        ${standalonePaymentsFilter}
      ORDER BY pay.payment_date ASC
    `;

    // Expense data
    const expenseQuery = `
      SELECT 
        SUM(amount * COALESCE(tax_deductible_percentage, 100) / 100) AS total,
        category,
        COUNT(*) AS count,
        SUM(amount * COALESCE(tax_deductible_percentage, 100) / 100) AS amount
      FROM expenses
      WHERE user_id = $1
        AND expense_date >= $2
        AND expense_date <= $3
      GROUP BY category
      ORDER BY amount DESC
    `;

    const expenseTaxQuery = `
      SELECT 
        tax_rate,
        SUM(amount * COALESCE(tax_deductible_percentage, 100) / 100) AS gross_amount,
        SUM(net_amount * COALESCE(tax_deductible_percentage, 100) / 100) AS net_amount,
        SUM(tax_amount * COALESCE(tax_deductible_percentage, 100) / 100) AS tax_amount
      FROM expenses
      WHERE user_id = $1
        AND expense_date >= $2
        AND expense_date <= $3
      GROUP BY tax_rate
      ORDER BY tax_rate DESC
    `;

    // Get individual invoice transactions
    const invoiceTransactionsQuery = `
      SELECT 
        i.id,
        i.invoice_number,
        c.name AS client_name,
        p.name AS project_name,
        i.issue_date,
        i.status,
        i.sub_total AS net_amount,
        i.tax_rate,
        i.tax_amount,
        i.total_amount AS gross_amount,
        pay.payment_date,
        pay.transaction_id
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      LEFT JOIN projects p ON i.project_id = p.id
      LEFT JOIN payments pay ON pay.invoice_id = i.id AND pay.payment_type = 'payment' AND (pay.exclude_from_tax = false OR pay.exclude_from_tax IS NULL OR ${!excludeTaxExcluded})
      WHERE i.user_id = $1
        AND i.issue_date >= $2
        AND i.issue_date <= $3
        AND i.status != 'draft'
        ${invoiceExcludeFilterWithAlias}
      ORDER BY i.issue_date, i.invoice_number
    `;

    // Get individual expense transactions
    const expenseTransactionsQuery = `
      SELECT 
        id,
        expense_date,
        description,
        category,
        net_amount * COALESCE(tax_deductible_percentage, 100) / 100 AS net_amount,
        tax_rate,
        tax_amount * COALESCE(tax_deductible_percentage, 100) / 100 AS tax_amount,
        amount * COALESCE(tax_deductible_percentage, 100) / 100 AS amount,
        tax_deductible_percentage
      FROM expenses
      WHERE user_id = $1
        AND expense_date >= $2
        AND expense_date <= $3
      ORDER BY expense_date, description
    `;

    // Get tax prepayments (paid and refund statuses)
    const taxPrepaymentsQuery = `
      SELECT 
        id,
        tax_type,
        amount,
        payment_date,
        quarter,
        tax_year,
        description,
        status
      FROM tax_prepayments
      WHERE user_id = $1
        AND payment_date >= $2
        AND payment_date <= $3
        AND status IN ('paid', 'refund')
      ORDER BY payment_date
    `;

    const [incomeResult, standalonePaymentsResult, standalonePaymentTxResult, expenseResult, expenseTaxResult, invoiceTxResult, expenseTxResult, taxPrepaymentsResult] = await Promise.all([
      this.db.query(incomeQuery, [userId, startDate, endDate]),
      this.db.query(standalonePaymentsQuery, [userId, startDate, endDate]),
      this.db.query(standalonePaymentTransactionsQuery, [userId, startDate, endDate]),
      this.db.query(expenseQuery, [userId, startDate, endDate]),
      this.db.query(expenseTaxQuery, [userId, startDate, endDate]),
      this.db.query(invoiceTransactionsQuery, [userId, startDate, endDate]),
      this.db.query(expenseTransactionsQuery, [userId, startDate, endDate]),
      this.db.query(taxPrepaymentsQuery, [userId, startDate, endDate]),
    ]);

    const totalInvoiced = incomeResult.rows.reduce((sum: number, row: any) => sum + Number(row.total_invoiced || 0), 0);
    const totalPaid = incomeResult.rows.reduce((sum: number, row: any) => sum + Number(row.total_paid || 0), 0);
    const totalOutstanding = incomeResult.rows.reduce((sum: number, row: any) => sum + Number(row.total_outstanding || 0), 0);
    
    // Add standalone payments (recurring project payments) to income
    const standalonePaymentsTotal = Number(standalonePaymentsResult.rows[0]?.total_amount || 0);
    const totalPaidIncludingStandalone = totalPaid + standalonePaymentsTotal;

    const totalExpenses = expenseResult.rows.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);

    // Calculate tax prepayments (paid minus refunds)
    const vatPrepayments = taxPrepaymentsResult.rows
      .filter((row: any) => row.tax_type === 'vat')
      .reduce((sum: number, row: any) => {
        const amount = Number(row.amount);
        return row.status === 'paid' ? sum + amount : sum - amount;
      }, 0);
    
    const incomeTaxPrepayments = taxPrepaymentsResult.rows
      .filter((row: any) => row.tax_type === 'income_tax')
      .reduce((sum: number, row: any) => {
        const amount = Number(row.amount);
        return row.status === 'paid' ? sum + amount : sum - amount;
      }, 0);
    
    const totalPrepayments = vatPrepayments + incomeTaxPrepayments;

    return {
      period: {
        start_date: startDate,
        end_date: endDate,
        year,
      },
      income: {
        total_invoiced: totalInvoiced,
        total_paid: totalPaid,
        total_outstanding: totalOutstanding,
        by_tax_rate: incomeResult.rows.map((row: any) => ({
          tax_rate: Number(row.tax_rate),
          gross_amount: Number(row.gross_amount),
          net_amount: Number(row.net_amount),
          tax_amount: Number(row.tax_amount),
        })),
        transactions: invoiceTxResult.rows.map((row: any) => ({
          id: row.id,
          invoice_number: row.invoice_number,
          client_name: row.client_name || 'Unknown',
          project_name: row.project_name || null,
          issue_date: row.issue_date,
          payment_date: row.payment_date || null,
          transaction_id: row.transaction_id || null,
          status: row.status,
          net_amount: Number(row.net_amount),
          tax_rate: Number(row.tax_rate),
          tax_amount: Number(row.tax_amount),
          gross_amount: Number(row.gross_amount),
        })),
        standalone_payments: standalonePaymentTxResult.rows.map((row: any) => ({
          id: row.id,
          payment_date: row.payment_date,
          amount: Number(row.amount),
          notes: row.notes || 'Recurring Project Payment',
          project_name: row.project_name || 'Unknown Project',
          client_name: row.client_name || 'Unknown Client',
        })),
      },
      expenses: {
        total: totalExpenses,
        by_category: expenseResult.rows.map((row: any) => ({
          category: row.category || 'Uncategorized',
          amount: Number(row.amount),
          count: Number(row.count),
        })),
        by_tax_rate: expenseTaxResult.rows.map((row: any) => ({
          tax_rate: Number(row.tax_rate),
          gross_amount: Number(row.gross_amount),
          net_amount: Number(row.net_amount),
          tax_amount: Number(row.tax_amount),
        })),
        transactions: expenseTxResult.rows.map((row: any) => ({
          id: row.id,
          expense_date: row.expense_date,
          description: row.description || '',
          category: row.category || 'Uncategorized',
          net_amount: Number(row.net_amount || 0),
          tax_rate: Number(row.tax_rate || 0),
          tax_amount: Number(row.tax_amount || 0),
          amount: Number(row.amount),
        })),
      },
      summary: {
        total_income: totalPaidIncludingStandalone, // Count all received payments including standalone (recurring project payments)
        total_expenses: totalExpenses,
        profit_loss: totalPaidIncludingStandalone - totalExpenses,
      },
      tax_prepayments: {
        vat_prepayments: vatPrepayments,
        income_tax_prepayments: incomeTaxPrepayments,
        total_prepayments: totalPrepayments,
        transactions: taxPrepaymentsResult.rows.map((row: any) => ({
          id: row.id,
          tax_type: row.tax_type,
          amount: row.status === 'refund' ? -Number(row.amount) : Number(row.amount),
          payment_date: row.payment_date,
          quarter: row.quarter,
          tax_year: Number(row.tax_year),
          description: row.description || null,
          status: row.status,
        })),
      },
    };
  }

  /**
   * Generate Invoice Report.
   * 
   * @param userId - User ID
   * @param startDate - Start date (YYYY-MM-DD)
   * @param endDate - End date (YYYY-MM-DD)
   * @returns Invoice report data
   */
  async generateInvoiceReport(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<InvoiceReport> {
    const query = `
      SELECT 
        i.invoice_number,
        c.name AS client_name,
        i.issue_date,
        i.due_date,
        i.status,
        i.sub_total AS net_amount,
        i.tax_rate,
        i.tax_amount,
        i.total_amount AS gross_amount,
        COALESCE(SUM(p.amount), 0) AS paid_amount,
        CASE 
          WHEN i.status IN ('sent', 'overdue') THEN 
            GREATEST(0, EXTRACT(DAY FROM (CURRENT_DATE - i.due_date))::INTEGER)
          ELSE 0
        END AS days_overdue
      FROM invoices i
      JOIN clients c ON i.client_id = c.id
      LEFT JOIN payments p ON p.invoice_id = i.id
      WHERE i.user_id = $1
        AND i.issue_date >= $2
        AND i.issue_date <= $3
      GROUP BY i.id, i.invoice_number, c.name, i.issue_date, i.due_date, i.status, 
               i.sub_total, i.tax_rate, i.tax_amount, i.total_amount
      ORDER BY i.issue_date DESC
    `;

    const result = await this.db.query(query, [userId, startDate, endDate]);

    const invoices = result.rows.map((row: any) => {
      const grossAmount = Number(row.gross_amount);
      const paidAmount = Number(row.paid_amount);
      const outstanding = grossAmount - paidAmount;
      const daysOverdue = Number(row.days_overdue);
      
      let agingBucket = 'current';
      if (daysOverdue > 90) {
        agingBucket = 'over_90_days';
      } else if (daysOverdue > 60) {
        agingBucket = 'days_61_90';
      } else if (daysOverdue > 30) {
        agingBucket = 'days_31_60';
      }
      
      return {
        invoice_number: row.invoice_number,
        client_name: row.client_name,
        issue_date: row.issue_date,
        due_date: row.due_date,
        status: row.status,
        net_amount: Number(row.net_amount),
        tax_rate: Number(row.tax_rate),
        tax_amount: Number(row.tax_amount),
        gross_amount: grossAmount,
        paid_amount: paidAmount,
        outstanding,
        days_overdue: daysOverdue > 0 ? daysOverdue : undefined,
        aging_bucket: outstanding > 0 ? agingBucket : undefined,
      };
    });

    // Calculate aging analysis
    const agingAnalysis = {
      current: { count: 0, amount: 0 },
      days_31_60: { count: 0, amount: 0 },
      days_61_90: { count: 0, amount: 0 },
      over_90_days: { count: 0, amount: 0 },
    };

    invoices.forEach((inv: any) => {
      if (inv.outstanding > 0 && inv.aging_bucket) {
        agingAnalysis[inv.aging_bucket as keyof typeof agingAnalysis].count++;
        agingAnalysis[inv.aging_bucket as keyof typeof agingAnalysis].amount += inv.outstanding;
      }
    });

    const summary = {
      total_invoices: invoices.length,
      total_gross: invoices.reduce((sum: number, inv: any) => sum + inv.gross_amount, 0),
      total_net: invoices.reduce((sum: number, inv: any) => sum + inv.net_amount, 0),
      total_tax: invoices.reduce((sum: number, inv: any) => sum + inv.tax_amount, 0),
      total_paid: invoices.reduce((sum: number, inv: any) => sum + inv.paid_amount, 0),
      total_outstanding: invoices.reduce((sum: number, inv: any) => sum + inv.outstanding, 0),
      by_status: invoices.reduce((acc: any, inv: any) => {
        if (!acc[inv.status]) {
          acc[inv.status] = { count: 0, amount: 0 };
        }
        acc[inv.status].count++;
        acc[inv.status].amount += inv.gross_amount;
        return acc;
      }, {} as Record<string, { count: number; amount: number }>),
      aging_analysis: agingAnalysis,
    };

    return {
      period: { start_date: startDate, end_date: endDate },
      invoices,
      summary,
    };
  }

  /**
   * Generate Expense Report.
   * 
   * @param userId - User ID
   * @param startDate - Start date (YYYY-MM-DD)
   * @param endDate - End date (YYYY-MM-DD)
   * @returns Expense report data
   */
  async generateExpenseReport(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<ExpenseReport> {
    const query = `
      SELECT 
        e.expense_date AS date,
        e.description,
        e.category,
        p.name AS project_name,
        e.net_amount,
        e.tax_rate,
        e.tax_amount,
        e.amount AS gross_amount,
        e.is_billable,
        CASE WHEN e.receipt_url IS NOT NULL THEN true ELSE false END AS has_receipt
      FROM expenses e
      LEFT JOIN projects p ON e.project_id = p.id
      WHERE e.user_id = $1
        AND e.expense_date >= $2
        AND e.expense_date <= $3
      ORDER BY e.expense_date DESC
    `;

    const result = await this.db.query(query, [userId, startDate, endDate]);

    const expenses = result.rows.map((row: any) => ({
      date: row.date,
      description: row.description,
      category: row.category || 'Uncategorized',
      project_name: row.project_name || undefined,
      net_amount: Number(row.net_amount),
      tax_rate: Number(row.tax_rate),
      tax_amount: Number(row.tax_amount),
      gross_amount: Number(row.gross_amount),
      is_billable: row.is_billable,
      has_receipt: row.has_receipt,
    }));

    // Calculate summary
    const byCategory = expenses.reduce((acc: any, exp: any) => {
      if (!acc[exp.category]) {
        acc[exp.category] = { count: 0, amount: 0 };
      }
      acc[exp.category].count++;
      acc[exp.category].amount += exp.gross_amount;
      return acc;
    }, {} as Record<string, { count: number; amount: number }>);

    const byTaxRate = expenses.reduce((acc: any, exp: any) => {
      const key = exp.tax_rate.toString();
      if (!acc[key]) {
        acc[key] = { count: 0, net: 0, tax: 0, gross: 0 };
      }
      acc[key].count++;
      acc[key].net += exp.net_amount;
      acc[key].tax += exp.tax_amount;
      acc[key].gross += exp.gross_amount;
      return acc;
    }, {} as Record<string, { count: number; net: number; tax: number; gross: number }>);

    return {
      period: { start_date: startDate, end_date: endDate },
      expenses,
      summary: {
        total_count: expenses.length,
        total_gross: expenses.reduce((sum: number, exp: any) => sum + exp.gross_amount, 0),
        total_net: expenses.reduce((sum: number, exp: any) => sum + exp.net_amount, 0),
        total_tax: expenses.reduce((sum: number, exp: any) => sum + exp.tax_amount, 0),
        by_category: byCategory,
        by_tax_rate: byTaxRate,
      },
    };
  }

  /**
   * Generate Time Tracking Report.
   * 
   * @param userId - User ID
   * @param startDate - Start date (YYYY-MM-DD)
   * @param endDate - End date (YYYY-MM-DD)
   * @returns Time tracking report data
   */
  async generateTimeTrackingReport(
    userId: string,
    startDate: string,
    endDate: string,
    projectId?: string,
    clientId?: string
  ): Promise<TimeTrackingReport> {
    const params: any[] = [userId, startDate, endDate];
    let paramIndex = 4;
    
    let whereClause = `
      WHERE te.user_id = $1
        AND te.entry_date >= $2
        AND te.entry_date <= $3
    `;
    
    if (projectId) {
      whereClause += `\n        AND te.project_id = $${paramIndex}`;
      params.push(projectId);
      paramIndex++;
    }
    
    if (clientId) {
      whereClause += `\n        AND p.client_id = $${paramIndex}`;
      params.push(clientId);
      paramIndex++;
    }
    
    const query = `
      SELECT 
        te.entry_date AS date,
        p.name AS project_name,
        c.name AS client_name,
        te.task_name,
        te.description,
        te.duration_hours AS hours,
        te.is_billable,
        te.hourly_rate
      FROM time_entries te
      JOIN projects p ON te.project_id = p.id
      JOIN clients c ON p.client_id = c.id
      ${whereClause}
      ORDER BY te.entry_date DESC, te.entry_time DESC
    `;

    const result = await this.db.query(query, params);

    const entries = result.rows.map((row: any) => {
      const hours = Number(row.hours);
      const hourlyRate = row.hourly_rate ? Number(row.hourly_rate) : undefined;
      const value = hourlyRate && row.is_billable ? hours * hourlyRate : undefined;

      return {
        date: row.date,
        project_name: row.project_name,
        client_name: row.client_name,
        task_name: row.task_name || undefined,
        description: row.description,
        hours,
        is_billable: row.is_billable,
        hourly_rate: hourlyRate,
        value,
      };
    });

    // Calculate summaries
    const byProject = entries.reduce((acc: any, entry: any) => {
      if (!acc[entry.project_name]) {
        acc[entry.project_name] = { hours: 0, billable_hours: 0, value: 0 };
      }
      acc[entry.project_name].hours += entry.hours;
      if (entry.is_billable) {
        acc[entry.project_name].billable_hours += entry.hours;
        acc[entry.project_name].value += entry.value || 0;
      }
      return acc;
    }, {} as Record<string, { hours: number; billable_hours: number; value: number }>);

    const byClient = entries.reduce((acc: any, entry: any) => {
      if (!acc[entry.client_name]) {
        acc[entry.client_name] = { hours: 0, billable_hours: 0, value: 0 };
      }
      acc[entry.client_name].hours += entry.hours;
      if (entry.is_billable) {
        acc[entry.client_name].billable_hours += entry.hours;
        acc[entry.client_name].value += entry.value || 0;
      }
      return acc;
    }, {} as Record<string, { hours: number; billable_hours: number; value: number }>);

    return {
      period: { start_date: startDate, end_date: endDate },
      entries,
      summary: {
        total_hours: entries.reduce((sum: number, e: any) => sum + e.hours, 0),
        billable_hours: entries.reduce((sum: number, e: any) => sum + (e.is_billable ? e.hours : 0), 0),
        non_billable_hours: entries.reduce((sum: number, e: any) => sum + (e.is_billable ? 0 : e.hours), 0),
        billable_value: entries.reduce((sum: number, e: any) => sum + (e.value || 0), 0),
        by_project: byProject,
        by_client: byClient,
      },
    };
  }

  /**
   * Generate Client Revenue Report.
   * 
   * @param userId - User ID
   * @param startDate - Start date (YYYY-MM-DD)
   * @param endDate - End date (YYYY-MM-DD)
   * @returns Client revenue report data
   */
  async generateClientRevenueReport(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<ClientRevenueReport> {
    const query = `
      SELECT 
        c.name AS client_name,
        COALESCE(SUM(i.total_amount), 0) AS total_invoiced,
        COALESCE(SUM(CASE WHEN i.status = 'paid' THEN i.total_amount ELSE 0 END), 0) AS total_paid,
        COALESCE(SUM(CASE WHEN i.status IN ('sent', 'overdue') THEN i.total_amount ELSE 0 END), 0) AS total_outstanding,
        COUNT(DISTINCT i.id) AS invoice_count,
        COALESCE(SUM(te.duration_hours), 0) AS hours_tracked
      FROM clients c
      LEFT JOIN invoices i ON i.client_id = c.id 
        AND i.issue_date >= $2 
        AND i.issue_date <= $3
        AND i.user_id = $1
      LEFT JOIN projects p ON p.client_id = c.id AND p.user_id = $1
      LEFT JOIN time_entries te ON te.project_id = p.id 
        AND te.entry_date >= $2 
        AND te.entry_date <= $3
        AND te.user_id = $1
      WHERE c.user_id = $1
      GROUP BY c.id, c.name
      HAVING COUNT(DISTINCT i.id) > 0 OR SUM(te.duration_hours) > 0
      ORDER BY total_invoiced DESC
    `;

    const result = await this.db.query(query, [userId, startDate, endDate]);

    const clients = result.rows.map((row: any) => ({
      client_name: row.client_name,
      total_invoiced: Number(row.total_invoiced),
      total_paid: Number(row.total_paid),
      total_outstanding: Number(row.total_outstanding),
      invoice_count: Number(row.invoice_count),
      hours_tracked: Number(row.hours_tracked),
    }));

    return {
      period: { start_date: startDate, end_date: endDate },
      clients,
      summary: {
        total_clients: clients.length,
        total_invoiced: clients.reduce((sum: number, c: any) => sum + c.total_invoiced, 0),
        total_paid: clients.reduce((sum: number, c: any) => sum + c.total_paid, 0),
        total_outstanding: clients.reduce((sum: number, c: any) => sum + c.total_outstanding, 0),
      },
    };
  }
}

export const reportService = new ReportService();
