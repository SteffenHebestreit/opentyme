/**
 * @fileoverview Tax Prepayment Types
 * 
 * TypeScript types for tax prepayment entities on the frontend.
 */

export enum TaxType {
  VAT = 'vat',
  INCOME_TAX = 'income_tax',
}

export enum TaxPrepaymentStatus {
  PAID = 'paid',
  PLANNED = 'planned',
  CANCELLED = 'cancelled',
  REFUND = 'refund',
}

export interface TaxPrepayment {
  id: string;
  user_id: string;
  tax_type: TaxType;
  amount: number;
  payment_date: string;
  period_start?: string;
  period_end?: string;
  tax_year: number;
  quarter?: number;
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

export interface CreateTaxPrepaymentData {
  tax_type: TaxType;
  amount: number;
  payment_date: string;
  period_start?: string;
  period_end?: string;
  tax_year: number;
  quarter?: number;
  description?: string;
  reference_number?: string;
  payment_method?: string;
  notes?: string;
  status?: TaxPrepaymentStatus;
}

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

export interface TaxPrepaymentFilters {
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
