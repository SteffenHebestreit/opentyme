// Recurring invoice (retainer) schedule models

/**
 * Cadence at which a recurring invoice generates new draft invoices.
 */
export type RecurringInvoiceFrequency = 'monthly' | 'quarterly' | 'yearly';

/**
 * A single line item stored on a recurring invoice template.
 * total_price is derived at generation time (quantity * unit_price).
 *
 * @interface RecurringInvoiceLineItem
 */
export interface RecurringInvoiceLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  rate_type?: 'hourly' | 'daily';
}

/**
 * Data transfer object for creating a recurring invoice schedule.
 *
 * @interface CreateRecurringInvoiceDto
 */
export interface CreateRecurringInvoiceDto {
  user_id: string;
  client_id: string;
  project_id?: string | null;
  title: string;
  frequency: RecurringInvoiceFrequency;
  start_date: string; // YYYY-MM-DD
  end_date?: string | null; // YYYY-MM-DD
  is_active?: boolean;
  currency?: string;
  tax_rate_id?: string | null;
  payment_terms_days?: number;
  invoice_headline?: string | null;
  notes?: string | null;
  line_items: RecurringInvoiceLineItem[];
}

/**
 * Data transfer object for updating a recurring invoice schedule.
 * All fields optional for partial updates.
 *
 * @interface UpdateRecurringInvoiceDto
 */
export interface UpdateRecurringInvoiceDto {
  client_id?: string;
  project_id?: string | null;
  title?: string;
  frequency?: RecurringInvoiceFrequency;
  start_date?: string;
  end_date?: string | null;
  is_active?: boolean;
  currency?: string;
  tax_rate_id?: string | null;
  payment_terms_days?: number;
  invoice_headline?: string | null;
  notes?: string | null;
  line_items?: RecurringInvoiceLineItem[];
}

/**
 * A recurring invoice schedule row as stored in the database.
 *
 * @interface RecurringInvoice
 */
export interface RecurringInvoice {
  id: string;
  user_id: string;
  client_id: string;
  project_id: string | null;
  title: string;
  frequency: RecurringInvoiceFrequency;
  start_date: string;
  end_date: string | null;
  next_occurrence: string | null;
  is_active: boolean;
  currency: string;
  tax_rate_id: string | null;
  payment_terms_days: number;
  invoice_headline: string | null;
  notes: string | null;
  line_items: RecurringInvoiceLineItem[];
  last_generated_at: Date | null;
  created_at: Date;
  updated_at: Date;
  // Populated via joins for list/detail views
  client_name?: string | null;
  project_name?: string | null;
}
