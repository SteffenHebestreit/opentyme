/**
 * @fileoverview Report API service for generating business reports.
 * 
 * Provides methods to fetch reports from the backend:
 * - VAT Report (Umsatzsteuervoranmeldung)
 * - Income/Expense Report (EÜR)
 * - Invoice Report
 * - Expense Report
 * - Time Tracking Report
 * - Client Revenue Report
 * 
 * @module api/services/report.service
 */

import api from './client';

// Re-export types from backend
export interface VATReport {
  period: {
    start_date: string;
    end_date: string;
    quarter?: number;
    year: number;
  };
  revenue: {
    gross_19: number;
    net_19: number;
    vat_19: number;
    gross_7: number;
    net_7: number;
    vat_7: number;
    gross_0: number;
    total_gross: number;
    total_net: number;
    total_vat: number;
  };
  expenses: {
    gross_19: number;
    net_19: number;
    vat_19: number;
    gross_7: number;
    net_7: number;
    vat_7: number;
    total_gross: number;
    total_net: number;
    total_vat: number;
  };
  summary: {
    revenue_vat: number;
    expense_vat: number;
    vat_payable: number;
  };
}

export interface IncomeExpenseReport {
  period: {
    start_date: string;
    end_date: string;
    year: number;
  };
  income: {
    total_invoiced: number;
    total_paid: number;
    total_outstanding: number;
    by_tax_rate: Array<{
      tax_rate: number;
      gross_amount: number;
      net_amount: number;
      tax_amount: number;
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
  };
  summary: {
    total_income: number;
    total_expenses: number;
    profit_loss: number;
  };
}

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
      current: { count: number; amount: number };
      days_31_60: { count: number; amount: number };
      days_61_90: { count: number; amount: number };
      over_90_days: { count: number; amount: number };
    };
  };
}

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

/**
 * Generate VAT Report (Umsatzsteuervoranmeldung).
 * 
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 * @returns Promise with VAT report data
 */
export const generateVATReport = async (
  startDate: string,
  endDate: string
): Promise<VATReport> => {
  const response = await api.get('/reports/vat', {
    params: { start_date: startDate, end_date: endDate },
  });
  return response.data;
};

/**
 * Generate Income/Expense Report (EÜR).
 * 
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 * @returns Promise with income/expense report data
 */
export const generateIncomeExpenseReport = async (
  startDate: string,
  endDate: string
): Promise<IncomeExpenseReport> => {
  const response = await api.get('/reports/income-expense', {
    params: { start_date: startDate, end_date: endDate },
  });
  return response.data;
};

/**
 * Generate Invoice Report.
 * 
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 * @returns Promise with invoice report data
 */
export const generateInvoiceReport = async (
  startDate: string,
  endDate: string
): Promise<InvoiceReport> => {
  const response = await api.get('/reports/invoices', {
    params: { start_date: startDate, end_date: endDate },
  });
  return response.data;
};

/**
 * Generate Expense Report.
 * 
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 * @returns Promise with expense report data
 */
export const generateExpenseReport = async (
  startDate: string,
  endDate: string
): Promise<ExpenseReport> => {
  const response = await api.get('/reports/expenses', {
    params: { start_date: startDate, end_date: endDate },
  });
  return response.data;
};

/**
 * Generate Time Tracking Report.
 * 
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 * @returns Promise with time tracking report data
 */
export const generateTimeTrackingReport = async (
  startDate: string,
  endDate: string,
  projectId?: string,
  clientId?: string
): Promise<TimeTrackingReport> => {
  const params: any = { start_date: startDate, end_date: endDate };
  if (projectId) params.project_id = projectId;
  if (clientId) params.client_id = clientId;
  
  const response = await api.get('/reports/time-tracking', { params });
  return response.data;
};

/**
 * Generate Client Revenue Report.
 * 
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 * @returns Promise with client revenue report data
 */
export const generateClientRevenueReport = async (
  startDate: string,
  endDate: string
): Promise<ClientRevenueReport> => {
  const response = await api.get('/reports/client-revenue', {
    params: { start_date: startDate, end_date: endDate },
  });
  return response.data;
};
