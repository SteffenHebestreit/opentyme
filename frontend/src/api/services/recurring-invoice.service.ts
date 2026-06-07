/**
 * Recurring invoice (retainer) API service.
 * CRUD over schedule templates plus a manual "generate now" trigger.
 */

import apiClient from './client';

export type RecurringInvoiceFrequency = 'monthly' | 'quarterly' | 'yearly';

export interface RecurringInvoiceLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  rate_type?: 'hourly' | 'daily';
}

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
  last_generated_at: string | null;
  created_at: string;
  updated_at: string;
  client_name?: string | null;
  project_name?: string | null;
}

export interface RecurringInvoicePayload {
  client_id: string;
  project_id?: string | null;
  title: string;
  frequency: RecurringInvoiceFrequency;
  start_date: string;
  end_date?: string | null;
  is_active?: boolean;
  currency?: string;
  tax_rate_id?: string | null;
  payment_terms_days?: number;
  invoice_headline?: string | null;
  notes?: string | null;
  line_items: RecurringInvoiceLineItem[];
}

export async function fetchRecurringInvoices(): Promise<RecurringInvoice[]> {
  const { data } = await apiClient.get<RecurringInvoice[]>('/recurring-invoices');
  return data;
}

export async function fetchRecurringInvoice(id: string): Promise<RecurringInvoice> {
  const { data } = await apiClient.get<RecurringInvoice>(`/recurring-invoices/${id}`);
  return data;
}

export async function createRecurringInvoice(payload: RecurringInvoicePayload): Promise<RecurringInvoice> {
  const { data } = await apiClient.post<{ message: string; recurring_invoice: RecurringInvoice }>(
    '/recurring-invoices',
    payload
  );
  return data.recurring_invoice;
}

export async function updateRecurringInvoice(
  id: string,
  payload: Partial<RecurringInvoicePayload>
): Promise<RecurringInvoice> {
  const { data } = await apiClient.put<{ message: string; recurring_invoice: RecurringInvoice }>(
    `/recurring-invoices/${id}`,
    payload
  );
  return data.recurring_invoice;
}

export async function deleteRecurringInvoice(id: string): Promise<void> {
  await apiClient.delete(`/recurring-invoices/${id}`);
}

/** Generate any due draft invoices for this schedule now. Returns the new invoice ids. */
export async function generateRecurringInvoiceNow(id: string): Promise<string[]> {
  const { data } = await apiClient.post<{ message: string; invoice_ids: string[] }>(
    `/recurring-invoices/${id}/generate`
  );
  return data.invoice_ids;
}
