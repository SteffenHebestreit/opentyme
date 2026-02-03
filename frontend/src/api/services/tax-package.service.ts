/**
 * @fileoverview Tax Package API service for generating tax declaration packages.
 * 
 * Provides methods to:
 * - Download complete tax package as ZIP
 * - Get available years with tax data
 * - Get package size estimate
 * 
 * @module api/services/tax-package.service
 */

import api from './client';

/**
 * Tax package download options
 */
export interface TaxPackageOptions {
  year: number;
  startDate?: string;
  endDate?: string;
  currency?: string;
  lang?: 'en' | 'de';
  includeInvoicePDFs?: boolean;
  includeExpenseReceipts?: boolean;
  includePrepaymentReceipts?: boolean;
  includeReports?: boolean;
  includeExcel?: boolean;
}

/**
 * Package estimate response
 */
export interface PackageEstimate {
  year: number;
  startDate: string;
  endDate: string;
  invoices: number;
  invoicesWithPDF: number;
  expenses: number;
  expensesWithReceipts: number;
  payments: number;
  taxPrepayments: number;
  taxPrepaymentsWithReceipts: number;
}

/**
 * Get available years with tax data
 * 
 * @returns {Promise<number[]>} Array of years
 */
export async function getAvailableYears(): Promise<number[]> {
  const response = await api.get('/tax-package/years');
  return response.data.years;
}

/**
 * Get package estimate (file counts)
 * 
 * @param {number} year - Tax year
 * @param {string} startDate - Start date (optional)
 * @param {string} endDate - End date (optional)
 * @returns {Promise<PackageEstimate>} Package estimate
 */
export async function getPackageEstimate(
  year: number,
  startDate?: string,
  endDate?: string
): Promise<PackageEstimate> {
  const params: any = { year };
  if (startDate) params.start_date = startDate;
  if (endDate) params.end_date = endDate;

  const response = await api.get('/tax-package/estimate', { params });
  return response.data;
}

/**
 * Download tax package as ZIP file
 * Opens in new window or triggers download
 * 
 * @param {TaxPackageOptions} options - Package options
 * @returns {Promise<void>}
 */
export async function downloadTaxPackage(options: TaxPackageOptions): Promise<void> {
  const params: any = {
    year: options.year,
    currency: options.currency || 'EUR',
    lang: options.lang || 'de',
    include_invoice_pdfs: options.includeInvoicePDFs !== false ? 'true' : 'false',
    include_expense_receipts: options.includeExpenseReceipts !== false ? 'true' : 'false',
    include_prepayment_receipts: options.includePrepaymentReceipts !== false ? 'true' : 'false',
    include_reports: options.includeReports !== false ? 'true' : 'false',
    include_excel: options.includeExcel !== false ? 'true' : 'false',
  };

  if (options.startDate) params.start_date = options.startDate;
  if (options.endDate) params.end_date = options.endDate;

  const response = await api.get('/tax-package/download', {
    params,
    responseType: 'blob',
  });

  // Create download link
  const blob = new Blob([response.data], { type: 'application/zip' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = options.lang === 'de' 
    ? `Steuerpaket_${options.year}.zip` 
    : `Tax_Package_${options.year}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => window.URL.revokeObjectURL(url), 100);
}
