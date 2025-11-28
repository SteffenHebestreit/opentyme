/**
 * @fileoverview Tax Prepayment Model
 * 
 * Defines TypeScript types and interfaces for tax prepayment entities.
 * Supports both VAT (Umsatzsteuer) and income tax (Einkommensteuer) prepayments.
 * 
 * @module models/financial/tax-prepayment
 */

/**
 * Tax prepayment type
 */
export enum TaxType {
  VAT = 'vat',
  INCOME_TAX = 'income_tax',
}

/**
 * Tax prepayment status
 */
export enum TaxPrepaymentStatus {
  PAID = 'paid',
  PLANNED = 'planned',
  CANCELLED = 'cancelled',
  REFUND = 'refund',
}

/**
 * Tax prepayment entity
 */
export interface TaxPrepayment {
  id: string;
  user_id: string;
  tax_type: TaxType;
  amount: number;
  payment_date: string; // ISO date string
  period_start: string; // ISO date string
  period_end: string; // ISO date string
  tax_year: number;
  quarter?: number; // 1-4 for quarterly payments, null for annual
  description?: string;
  reference_number?: string;
  payment_method?: string;
  receipt_url?: string;
  receipt_filename?: string;
  receipt_size?: number;
  receipt_mimetype?: string;
  notes?: string;
  status: TaxPrepaymentStatus;
  created_at: string;
  updated_at: string;
}

/**
 * Data for creating a tax prepayment
 */
export interface CreateTaxPrepaymentData {
  tax_type: TaxType;
  amount: number;
  payment_date: string;
  period_start: string;
  period_end: string;
  tax_year: number;
  quarter?: number;
  description?: string;
  reference_number?: string;
  payment_method?: string;
  notes?: string;
  status?: TaxPrepaymentStatus;
}

/**
 * Data for updating a tax prepayment
 */
export interface UpdateTaxPrepaymentData {
  tax_type?: TaxType;
  amount?: number;
  payment_date?: string;
  period_start?: string;
  period_end?: string;
  tax_year?: number;
  quarter?: number;
  description?: string;
  reference_number?: string;
  payment_method?: string;
  notes?: string;
  status?: TaxPrepaymentStatus;
}

/**
 * Filters for querying tax prepayments
 */
export interface TaxPrepaymentFilters {
  user_id: string;
  tax_type?: TaxType;
  tax_year?: number;
  quarter?: number;
  status?: TaxPrepaymentStatus;
  date_from?: string;
  date_to?: string;
  search?: string;
  sort_by?: 'payment_date' | 'amount' | 'created_at';
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * Summary statistics for tax prepayments
 */
export interface TaxPrepaymentSummary {
  total_vat: number;
  total_income_tax: number;
  total_by_year: {
    [year: number]: {
      vat: number;
      income_tax: number;
    };
  };
  count: number;
}
