/**
 * @fileoverview Tax Package Service for generating comprehensive tax declaration packages.
 * 
 * Collects and bundles all tax-relevant documents and data:
 * - Income/Expense Report (EÜR - Einnahmenüberschussrechnung)
 * - VAT Report (Umsatzsteuervoranmeldung)
 * - All invoices with PDFs
 * - All expenses with receipt PDFs
 * - Tax prepayments with receipts
 * - Financial summary
 * 
 * Generates a downloadable ZIP file containing:
 * - Summary PDF reports
 * - Individual invoice PDFs
 * - Individual expense receipt PDFs
 * - Tax prepayment receipts
 * - CSV/Excel exports for easy import into tax software
 * 
 * @module services/analytics/tax-package
 */

import archiver from 'archiver';
import { Readable, PassThrough } from 'stream';
import { getDbClient } from '../../utils/database';
import { reportService, IncomeExpenseReport, VATReport } from './report.service';
import reportPDFService from './report-pdf.service';
import { minioService } from '../storage/minio.service';
import { InvoiceController } from '../../controllers/financial/invoice.controller';
import PDFDocument from 'pdfkit';
import * as ExcelJS from 'exceljs';

/**
 * Tax package configuration options
 */
export interface TaxPackageOptions {
  userId: string;
  year: number;
  startDate: string;
  endDate: string;
  currency: string;
  language: 'en' | 'de';
  includeInvoicePDFs: boolean;
  includeExpenseReceipts: boolean;
  includeTaxPrepaymentReceipts: boolean;
  includeReports: boolean;
  includeExcelExport: boolean;
}

/**
 * Invoice data for package
 */
interface InvoiceData {
  id: string;
  invoice_number: string;
  client_name: string;
  issue_date: string;
  due_date: string;
  status: string;
  sub_total: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  project_name: string | null;
  exclude_from_tax: boolean;
}

/**
 * Expense data for package
 */
interface ExpenseData {
  id: string;
  description: string;
  category: string;
  expense_date: string;
  amount: number;
  net_amount: number;
  tax_rate: number;
  tax_amount: number;
  currency: string;
  receipt_url: string | null;
  receipt_filename: string | null;
  receipt_mimetype: string | null;
  project_name: string | null;
  status: string;
}

/**
 * Payment data for package
 */
interface PaymentData {
  id: string;
  amount: number;
  payment_date: string;
  payment_type: string;
  payment_method: string;
  invoice_id: string | null;
  invoice_number: string | null;
  client_name: string | null;
  notes: string | null;
  exclude_from_tax: boolean;
}

/**
 * Tax prepayment data for package
 */
interface TaxPrepaymentData {
  id: string;
  tax_type: string;
  amount: number;
  payment_date: string;
  tax_year: number;
  quarter: number | null;
  description: string | null;
  reference_number: string | null;
  receipt_url: string | null;
  receipt_filename: string | null;
  receipt_mimetype: string | null;
  status: string;
}

/**
 * Translations for the tax package
 */
const translations = {
  en: {
    taxPackageTitle: 'Tax Package',
    year: 'Year',
    period: 'Period',
    generatedOn: 'Generated on',
    summary: 'Summary',
    totalRevenue: 'Total Revenue',
    totalExpenses: 'Total Expenses',
    netProfit: 'Net Profit / Loss',
    vatPayable: 'VAT Payable',
    vatPrepayments: 'VAT Prepayments',
    remainingVAT: 'Remaining VAT',
    invoices: 'Invoices',
    expenses: 'Expenses',
    payments: 'Payments',
    taxPrepayments: 'Tax Prepayments',
    invoiceNumber: 'Invoice Number',
    client: 'Client',
    date: 'Date',
    netAmount: 'Net Amount',
    taxAmount: 'Tax Amount',
    grossAmount: 'Gross Amount',
    status: 'Status',
    description: 'Description',
    category: 'Category',
    paymentType: 'Payment Type',
    paymentMethod: 'Payment Method',
    taxType: 'Tax Type',
    quarter: 'Quarter',
    reference: 'Reference',
    contentOverview: 'Contents Overview',
    reportsPDF: 'Reports (PDF)',
    invoicePDFs: 'Invoice PDFs',
    expenseReceipts: 'Expense Receipts',
    prepaymentReceipts: 'Tax Prepayment Receipts',
    excelExport: 'Excel Export',
    noReceipt: 'No receipt',
    vat: 'VAT',
    incomeTax: 'Income Tax',
    paid: 'Paid',
    pending: 'Pending',
    refund: 'Refund',
    folders: {
      reports: '01_Reports',
      invoices: '02_Invoices',
      expenses: '03_Expenses',
      taxPrepayments: '04_Tax_Prepayments',
      exports: '05_Exports',
    },
  },
  de: {
    taxPackageTitle: 'Steuerpaket',
    year: 'Jahr',
    period: 'Zeitraum',
    generatedOn: 'Erstellt am',
    summary: 'Zusammenfassung',
    totalRevenue: 'Gesamteinnahmen',
    totalExpenses: 'Gesamtausgaben',
    netProfit: 'Gewinn / Verlust',
    vatPayable: 'Umsatzsteuer-Zahllast',
    vatPrepayments: 'USt-Vorauszahlungen',
    remainingVAT: 'Verbleibende USt',
    invoices: 'Rechnungen',
    expenses: 'Ausgaben',
    payments: 'Zahlungen',
    taxPrepayments: 'Steuervorauszahlungen',
    invoiceNumber: 'Rechnungsnummer',
    client: 'Kunde',
    date: 'Datum',
    netAmount: 'Nettobetrag',
    taxAmount: 'Steuerbetrag',
    grossAmount: 'Bruttobetrag',
    status: 'Status',
    description: 'Beschreibung',
    category: 'Kategorie',
    paymentType: 'Zahlungsart',
    paymentMethod: 'Zahlungsmethode',
    taxType: 'Steuerart',
    quarter: 'Quartal',
    reference: 'Referenz',
    contentOverview: 'Inhaltsübersicht',
    reportsPDF: 'Berichte (PDF)',
    invoicePDFs: 'Rechnungs-PDFs',
    expenseReceipts: 'Ausgabenbelege',
    prepaymentReceipts: 'Vorauszahlungsbelege',
    excelExport: 'Excel-Export',
    noReceipt: 'Kein Beleg',
    vat: 'Umsatzsteuer',
    incomeTax: 'Einkommensteuer',
    paid: 'Bezahlt',
    pending: 'Ausstehend',
    refund: 'Erstattung',
    folders: {
      reports: '01_Berichte',
      invoices: '02_Rechnungen',
      expenses: '03_Ausgaben',
      taxPrepayments: '04_Steuervorauszahlungen',
      exports: '05_Exporte',
    },
  },
};

/**
 * Tax Package Service
 * Generates comprehensive tax declaration packages
 */
export class TaxPackageService {
  private db = getDbClient();

  /**
   * Format currency for display
   */
  private formatCurrency(amount: number, currency: string): string {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  /**
   * Format date for display
   */
  private formatDate(dateString: string | Date): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  /**
   * Format date for filename (YYYY-MM-DD)
   */
  private formatDateForFilename(dateValue: string | Date): string {
    const date = new Date(dateValue);
    return date.toISOString().substring(0, 10);
  }

  /**
   * Get all invoices for the period
   */
  private async getInvoices(userId: string, startDate: string, endDate: string): Promise<InvoiceData[]> {
    const query = `
      SELECT 
        i.id, i.invoice_number, i.issue_date, i.due_date, i.status,
        i.sub_total, i.tax_rate, i.tax_amount, i.total_amount, i.currency,
        COALESCE(i.exclude_from_tax, false) as exclude_from_tax,
        c.name as client_name,
        p.name as project_name
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      LEFT JOIN projects p ON i.project_id = p.id
      WHERE i.user_id = $1
        AND i.issue_date >= $2
        AND i.issue_date <= $3
        AND i.status != 'draft'
        AND i.status != 'cancelled'
      ORDER BY i.issue_date ASC
    `;

    const result = await this.db.query(query, [userId, startDate, endDate]);
    return result.rows;
  }

  /**
   * Get all expenses for the period
   */
  private async getExpenses(userId: string, startDate: string, endDate: string): Promise<ExpenseData[]> {
    const query = `
      SELECT 
        e.id, e.description, e.category, e.expense_date,
        e.amount, e.net_amount, e.tax_rate, e.tax_amount, e.currency,
        e.receipt_url, e.receipt_filename, e.receipt_mimetype,
        e.status,
        p.name as project_name
      FROM expenses e
      LEFT JOIN projects p ON e.project_id = p.id
      WHERE e.user_id = $1
        AND e.expense_date >= $2
        AND e.expense_date <= $3
        AND e.status = 'approved'
      ORDER BY e.expense_date ASC
    `;

    const result = await this.db.query(query, [userId, startDate, endDate]);
    return result.rows;
  }

  /**
   * Get all payments for the period
   */
  private async getPayments(userId: string, startDate: string, endDate: string): Promise<PaymentData[]> {
    const query = `
      SELECT 
        p.id, p.amount, p.payment_date, p.payment_type, p.payment_method,
        p.invoice_id, p.notes,
        COALESCE(p.exclude_from_tax, false) as exclude_from_tax,
        i.invoice_number,
        c.name as client_name
      FROM payments p
      LEFT JOIN invoices i ON p.invoice_id = i.id
      LEFT JOIN clients c ON i.client_id = c.id
      WHERE p.user_id = $1
        AND p.payment_date >= $2
        AND p.payment_date <= $3
      ORDER BY p.payment_date ASC
    `;

    const result = await this.db.query(query, [userId, startDate, endDate]);
    return result.rows;
  }

  /**
   * Get all tax prepayments for the period
   */
  private async getTaxPrepayments(userId: string, year: number): Promise<TaxPrepaymentData[]> {
    const query = `
      SELECT 
        id, tax_type, amount, payment_date, tax_year, quarter,
        description, reference_number, receipt_url, receipt_filename,
        receipt_mimetype, status
      FROM tax_prepayments
      WHERE user_id = $1
        AND tax_year = $2
      ORDER BY payment_date ASC
    `;

    const result = await this.db.query(query, [userId, year]);
    return result.rows;
  }

  /**
   * Generate cover page PDF
   */
  private async generateCoverPage(
    options: TaxPackageOptions,
    summary: {
      totalRevenue: number;
      totalExpenses: number;
      netProfit: number;
      vatPayable: number;
      vatPrepayments: number;
      invoiceCount: number;
      expenseCount: number;
      paymentCount: number;
      prepaymentCount: number;
    }
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const t = translations[options.language];
      const chunks: Buffer[] = [];

      const doc = new PDFDocument({ margin: 50, size: 'A4' });

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Title
      doc.fontSize(24).font('Helvetica-Bold')
        .text(t.taxPackageTitle, { align: 'center' });
      doc.moveDown(0.5);

      // Year and period
      doc.fontSize(16).font('Helvetica')
        .text(`${t.year} ${options.year}`, { align: 'center' });
      doc.fontSize(12)
        .text(`${t.period}: ${this.formatDate(options.startDate)} - ${this.formatDate(options.endDate)}`, { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#666666')
        .text(`${t.generatedOn}: ${this.formatDate(new Date().toISOString())}`, { align: 'center' });
      doc.moveDown(2);

      // Financial Summary Section
      doc.fillColor('#000000').fontSize(16).font('Helvetica-Bold')
        .text(t.summary);
      doc.moveDown(0.5);

      doc.fontSize(11).font('Helvetica');
      const summaryData = [
        [t.totalRevenue, this.formatCurrency(summary.totalRevenue, options.currency)],
        [t.totalExpenses, this.formatCurrency(summary.totalExpenses, options.currency)],
        [t.netProfit, this.formatCurrency(summary.netProfit, options.currency)],
        ['', ''],
        [t.vatPayable, this.formatCurrency(summary.vatPayable, options.currency)],
        [t.vatPrepayments, this.formatCurrency(summary.vatPrepayments, options.currency)],
        [t.remainingVAT, this.formatCurrency(summary.vatPayable - summary.vatPrepayments, options.currency)],
      ];

      let y = doc.y;
      summaryData.forEach(([label, value]) => {
        if (label) {
          doc.text(label, 50, y, { width: 250 });
          doc.text(value, 300, y, { width: 200, align: 'right' });
        }
        y += 20;
      });

      doc.y = y;
      doc.moveDown(2);

      // Content Overview
      doc.fontSize(16).font('Helvetica-Bold')
        .text(t.contentOverview);
      doc.moveDown(0.5);

      doc.fontSize(11).font('Helvetica');
      const contentData = [
        [t.invoices, `${summary.invoiceCount}`],
        [t.expenses, `${summary.expenseCount}`],
        [t.payments, `${summary.paymentCount}`],
        [t.taxPrepayments, `${summary.prepaymentCount}`],
      ];

      y = doc.y;
      contentData.forEach(([label, value]) => {
        doc.text(label, 50, y, { width: 250 });
        doc.text(value, 300, y, { width: 200, align: 'right' });
        y += 20;
      });

      doc.y = y;
      doc.moveDown(2);

      // Package Contents
      doc.fontSize(14).font('Helvetica-Bold')
        .text(options.language === 'de' ? 'Paketinhalt:' : 'Package Contents:');
      doc.moveDown(0.5);

      doc.fontSize(10).font('Helvetica');
      const folderNames = t.folders;
      
      if (options.includeReports) {
        doc.text(`📁 ${folderNames.reports}/`, { indent: 20 });
        doc.text('    • Income_Expense_Report.pdf', { indent: 40 });
        doc.text('    • VAT_Report.pdf', { indent: 40 });
      }
      
      if (options.includeInvoicePDFs) {
        doc.text(`📁 ${folderNames.invoices}/`, { indent: 20 });
        doc.text(`    • ${summary.invoiceCount} invoice PDF files`, { indent: 40 });
      }
      
      if (options.includeExpenseReceipts) {
        doc.text(`📁 ${folderNames.expenses}/`, { indent: 20 });
        doc.text(`    • Expense receipt files`, { indent: 40 });
      }
      
      if (options.includeTaxPrepaymentReceipts) {
        doc.text(`📁 ${folderNames.taxPrepayments}/`, { indent: 20 });
        doc.text(`    • Tax prepayment receipt files`, { indent: 40 });
      }
      
      if (options.includeExcelExport) {
        doc.text(`📁 ${folderNames.exports}/`, { indent: 20 });
        doc.text('    • Tax_Data.xlsx', { indent: 40 });
      }

      doc.end();
    });
  }

  /**
   * Generate Excel export with all data
   */
  private async generateExcelExport(
    options: TaxPackageOptions,
    invoices: InvoiceData[],
    expenses: ExpenseData[],
    payments: PaymentData[],
    taxPrepayments: TaxPrepaymentData[]
  ): Promise<Buffer> {
    const t = translations[options.language];
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Tax Package Generator';
    workbook.created = new Date();

    // Invoices Sheet
    const invoicesSheet = workbook.addWorksheet(t.invoices);
    invoicesSheet.columns = [
      { header: t.invoiceNumber, key: 'invoice_number', width: 20 },
      { header: t.client, key: 'client_name', width: 30 },
      { header: t.date, key: 'issue_date', width: 12 },
      { header: t.netAmount, key: 'sub_total', width: 15 },
      { header: t.taxAmount, key: 'tax_amount', width: 15 },
      { header: t.grossAmount, key: 'total_amount', width: 15 },
      { header: t.status, key: 'status', width: 12 },
    ];

    invoices.forEach((inv) => {
      invoicesSheet.addRow({
        invoice_number: inv.invoice_number,
        client_name: inv.client_name,
        issue_date: this.formatDate(inv.issue_date),
        sub_total: Number(inv.sub_total),
        tax_amount: Number(inv.tax_amount),
        total_amount: Number(inv.total_amount),
        status: inv.status,
      });
    });

    // Style header row
    invoicesSheet.getRow(1).font = { bold: true };
    invoicesSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Expenses Sheet
    const expensesSheet = workbook.addWorksheet(t.expenses);
    expensesSheet.columns = [
      { header: t.date, key: 'expense_date', width: 12 },
      { header: t.description, key: 'description', width: 40 },
      { header: t.category, key: 'category', width: 20 },
      { header: t.netAmount, key: 'net_amount', width: 15 },
      { header: t.taxAmount, key: 'tax_amount', width: 15 },
      { header: t.grossAmount, key: 'amount', width: 15 },
      { header: t.status, key: 'status', width: 12 },
    ];

    expenses.forEach((exp) => {
      expensesSheet.addRow({
        expense_date: this.formatDate(exp.expense_date),
        description: exp.description,
        category: exp.category,
        net_amount: Number(exp.net_amount),
        tax_amount: Number(exp.tax_amount),
        amount: Number(exp.amount),
        status: exp.status,
      });
    });

    expensesSheet.getRow(1).font = { bold: true };
    expensesSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Payments Sheet
    const paymentsSheet = workbook.addWorksheet(t.payments);
    paymentsSheet.columns = [
      { header: t.date, key: 'payment_date', width: 12 },
      { header: t.paymentType, key: 'payment_type', width: 15 },
      { header: t.paymentMethod, key: 'payment_method', width: 15 },
      { header: t.invoiceNumber, key: 'invoice_number', width: 20 },
      { header: t.client, key: 'client_name', width: 30 },
      { header: t.grossAmount, key: 'amount', width: 15 },
    ];

    payments.forEach((pmt) => {
      paymentsSheet.addRow({
        payment_date: this.formatDate(pmt.payment_date),
        payment_type: pmt.payment_type,
        payment_method: pmt.payment_method || '',
        invoice_number: pmt.invoice_number || '',
        client_name: pmt.client_name || '',
        amount: Number(pmt.amount),
      });
    });

    paymentsSheet.getRow(1).font = { bold: true };
    paymentsSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Tax Prepayments Sheet
    const prepaymentsSheet = workbook.addWorksheet(t.taxPrepayments);
    prepaymentsSheet.columns = [
      { header: t.date, key: 'payment_date', width: 12 },
      { header: t.taxType, key: 'tax_type', width: 15 },
      { header: t.quarter, key: 'quarter', width: 10 },
      { header: t.grossAmount, key: 'amount', width: 15 },
      { header: t.reference, key: 'reference_number', width: 20 },
      { header: t.description, key: 'description', width: 40 },
      { header: t.status, key: 'status', width: 12 },
    ];

    taxPrepayments.forEach((prep) => {
      prepaymentsSheet.addRow({
        payment_date: this.formatDate(prep.payment_date),
        tax_type: prep.tax_type === 'vat' ? t.vat : t.incomeTax,
        quarter: prep.quarter ? `Q${prep.quarter}` : '-',
        amount: Number(prep.amount),
        reference_number: prep.reference_number || '',
        description: prep.description || '',
        status: prep.status === 'paid' ? t.paid : (prep.status === 'refund' ? t.refund : t.pending),
      });
    });

    prepaymentsSheet.getRow(1).font = { bold: true };
    prepaymentsSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Summary Sheet
    const summarySheet = workbook.addWorksheet(t.summary);
    
    const totalInvoiceNet = invoices.reduce((sum, inv) => sum + Number(inv.sub_total), 0);
    const totalInvoiceTax = invoices.reduce((sum, inv) => sum + Number(inv.tax_amount), 0);
    const totalInvoiceGross = invoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0);
    
    const totalExpenseNet = expenses.reduce((sum, exp) => sum + Number(exp.net_amount), 0);
    const totalExpenseTax = expenses.reduce((sum, exp) => sum + Number(exp.tax_amount), 0);
    const totalExpenseGross = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
    
    const totalVATPrep = taxPrepayments
      .filter(p => p.tax_type === 'vat' && p.status !== 'refund')
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const totalVATRefund = taxPrepayments
      .filter(p => p.tax_type === 'vat' && p.status === 'refund')
      .reduce((sum, p) => sum + Number(p.amount), 0);

    summarySheet.addRow([t.summary]);
    summarySheet.addRow([]);
    summarySheet.addRow([t.invoices]);
    summarySheet.addRow([t.netAmount, totalInvoiceNet]);
    summarySheet.addRow([t.taxAmount, totalInvoiceTax]);
    summarySheet.addRow([t.grossAmount, totalInvoiceGross]);
    summarySheet.addRow([]);
    summarySheet.addRow([t.expenses]);
    summarySheet.addRow([t.netAmount, totalExpenseNet]);
    summarySheet.addRow([t.taxAmount, totalExpenseTax]);
    summarySheet.addRow([t.grossAmount, totalExpenseGross]);
    summarySheet.addRow([]);
    summarySheet.addRow([t.vatPayable, totalInvoiceTax - totalExpenseTax]);
    summarySheet.addRow([t.vatPrepayments, totalVATPrep - totalVATRefund]);
    summarySheet.addRow([t.remainingVAT, (totalInvoiceTax - totalExpenseTax) - (totalVATPrep - totalVATRefund)]);
    summarySheet.addRow([]);
    summarySheet.addRow([t.netProfit, totalInvoiceNet - totalExpenseNet]);

    summarySheet.getColumn(1).width = 30;
    summarySheet.getColumn(2).width = 20;
    summarySheet.getRow(1).font = { bold: true, size: 14 };

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Generate the complete tax package as a ZIP stream
   */
  async generateTaxPackage(options: TaxPackageOptions): Promise<PassThrough> {
    const t = translations[options.language];
    const folderNames = t.folders;

    // Fetch all data
    const [invoices, expenses, payments, taxPrepayments] = await Promise.all([
      this.getInvoices(options.userId, options.startDate, options.endDate),
      this.getExpenses(options.userId, options.startDate, options.endDate),
      this.getPayments(options.userId, options.startDate, options.endDate),
      this.getTaxPrepayments(options.userId, options.year),
    ]);

    // Generate reports
    const [incomeExpenseReport, vatReport] = await Promise.all([
      reportService.generateIncomeExpenseReport(options.userId, options.startDate, options.endDate, true),
      reportService.generateVATReport(options.userId, options.startDate, options.endDate),
    ]);

    // Calculate summary
    const totalRevenue = incomeExpenseReport.income.total_paid;
    const totalExpenses = incomeExpenseReport.expenses.total;
    const netProfit = incomeExpenseReport.summary.profit_loss;
    const vatPayable = vatReport.summary.vat_payable;
    const vatPrepayments = incomeExpenseReport.tax_prepayments.vat_prepayments;

    // Create ZIP archive
    const archive = archiver('zip', { zlib: { level: 9 } });
    const passThrough = new PassThrough();

    archive.pipe(passThrough);

    // Error handling
    archive.on('error', (err: Error) => {
      console.error('Archive error:', err);
      passThrough.destroy(err);
    });

    // 1. Generate and add cover page
    const coverPage = await this.generateCoverPage(options, {
      totalRevenue,
      totalExpenses,
      netProfit,
      vatPayable,
      vatPrepayments,
      invoiceCount: invoices.length,
      expenseCount: expenses.length,
      paymentCount: payments.length,
      prepaymentCount: taxPrepayments.length,
    });
    archive.append(coverPage, { name: `00_${options.language === 'de' ? 'Deckblatt' : 'Cover_Page'}.pdf` });

    // 2. Add report PDFs
    if (options.includeReports) {
      const incomeExpensePDF = await reportPDFService.generateIncomeExpenseReportPDF(
        incomeExpenseReport,
        options.currency,
        options.language
      );
      archive.append(incomeExpensePDF, { name: `${folderNames.reports}/Income_Expense_Report.pdf` });

      const vatPDF = await reportPDFService.generateVATReportPDF(
        vatReport,
        options.currency,
        options.language
      );
      archive.append(vatPDF, { name: `${folderNames.reports}/VAT_Report.pdf` });
    }

    // 3. Add invoice PDFs (generate on-the-fly)
    if (options.includeInvoicePDFs && invoices.length > 0) {
      for (const invoice of invoices) {
        try {
          // Generate invoice PDF using the invoice controller logic
          const pdfBuffer = await this.generateInvoicePDF(invoice.id, options.userId);
          if (pdfBuffer) {
            // Use invoice number directly as filename (e.g., "Rechnung_2025-01-18_1.pdf")
            const safeFileName = invoice.invoice_number.replace(/[^a-zA-Z0-9-_]/g, '_');
            archive.append(pdfBuffer, { 
              name: `${folderNames.invoices}/Rechnung_${safeFileName}.pdf` 
            });
          }
        } catch (err) {
          console.error(`Failed to generate PDF for invoice ${invoice.invoice_number}:`, err);
        }
      }
    }

    // 4. Add expense receipts
    if (options.includeExpenseReceipts) {
      for (const expense of expenses) {
        if (expense.receipt_url) {
          try {
            const { stream, filename } = await this.getReceiptStream(expense.receipt_url, expense.receipt_filename);
            const safeFileName = expense.description.substring(0, 30).replace(/[^a-zA-Z0-9-_]/g, '_');
            const ext = filename.split('.').pop() || 'pdf';
            archive.append(stream, { 
              name: `${folderNames.expenses}/${this.formatDateForFilename(expense.expense_date)}_${safeFileName}.${ext}` 
            });
          } catch (err) {
            console.error(`Failed to get receipt for expense ${expense.id}:`, err);
          }
        }
      }
    }

    // 5. Add tax prepayment receipts
    if (options.includeTaxPrepaymentReceipts) {
      for (const prepayment of taxPrepayments) {
        if (prepayment.receipt_url) {
          try {
            const { stream, filename } = await this.getReceiptStream(prepayment.receipt_url, prepayment.receipt_filename);
            const taxTypeLabel = prepayment.tax_type === 'vat' ? 'USt' : 'ESt';
            const quarterLabel = prepayment.quarter ? `Q${prepayment.quarter}` : 'Jahr';
            const ext = filename.split('.').pop() || 'pdf';
            archive.append(stream, { 
              name: `${folderNames.taxPrepayments}/${this.formatDateForFilename(prepayment.payment_date)}_${taxTypeLabel}_${quarterLabel}.${ext}` 
            });
          } catch (err) {
            console.error(`Failed to get receipt for tax prepayment ${prepayment.id}:`, err);
          }
        }
      }
    }

    // 6. Add Excel export
    if (options.includeExcelExport) {
      const excelBuffer = await this.generateExcelExport(options, invoices, expenses, payments, taxPrepayments);
      archive.append(excelBuffer, { name: `${folderNames.exports}/Tax_Data_${options.year}.xlsx` });
    }

    // Finalize archive
    archive.finalize();

    return passThrough;
  }

  /**
   * Generate invoice PDF buffer using the InvoiceController
   * This ensures the same formatting as the regular invoice PDF generation
   */
  private async generateInvoicePDF(invoiceId: string, userId: string): Promise<Buffer | null> {
    try {
      const invoiceController = new InvoiceController();
      return await invoiceController.generatePDFBuffer(invoiceId, userId, false);
    } catch (error) {
      console.error(`Failed to generate invoice PDF for ${invoiceId}:`, error);
      return null;
    }
  }

  /**
   * Get receipt file stream from MinIO
   */
  private async getReceiptStream(receiptUrl: string, filename: string | null): Promise<{
    stream: Readable;
    filename: string;
  }> {
    const urlParts = receiptUrl.replace(/^\//, '').split('/');
    const bucket = urlParts[0];
    const objectName = urlParts.slice(1).join('/');

    const stream = await minioService.getFileStream(bucket, objectName);

    return {
      stream,
      filename: filename || 'receipt.pdf',
    };
  }

  /**
   * Get list of available years with tax data
   */
  async getAvailableYears(userId: string): Promise<number[]> {
    const query = `
      SELECT DISTINCT EXTRACT(YEAR FROM date_field)::integer as year
      FROM (
        SELECT issue_date as date_field FROM invoices WHERE user_id = $1 AND status != 'draft'
        UNION
        SELECT expense_date as date_field FROM expenses WHERE user_id = $1 AND status = 'approved'
        UNION
        SELECT payment_date as date_field FROM payments WHERE user_id = $1
        UNION
        SELECT payment_date as date_field FROM tax_prepayments WHERE user_id = $1
      ) dates
      WHERE date_field IS NOT NULL
      ORDER BY year DESC
    `;

    const result = await this.db.query(query, [userId]);
    return result.rows.map(row => row.year);
  }

  /**
   * Get package size estimate (number of files)
   */
  async getPackageEstimate(userId: string, startDate: string, endDate: string, year: number): Promise<{
    invoices: number;
    invoicesWithPDF: number;
    expenses: number;
    expensesWithReceipts: number;
    payments: number;
    taxPrepayments: number;
    taxPrepaymentsWithReceipts: number;
  }> {
    const [invoices, expenses, payments, taxPrepayments] = await Promise.all([
      this.getInvoices(userId, startDate, endDate),
      this.getExpenses(userId, startDate, endDate),
      this.getPayments(userId, startDate, endDate),
      this.getTaxPrepayments(userId, year),
    ]);

    return {
      invoices: invoices.length,
      invoicesWithPDF: invoices.length, // All invoices can have PDFs generated
      expenses: expenses.length,
      expensesWithReceipts: expenses.filter(e => e.receipt_url).length,
      payments: payments.length,
      taxPrepayments: taxPrepayments.length,
      taxPrepaymentsWithReceipts: taxPrepayments.filter(t => t.receipt_url).length,
    };
  }
}

// Export singleton instance
export const taxPackageService = new TaxPackageService();
