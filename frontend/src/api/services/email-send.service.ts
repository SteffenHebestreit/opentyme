import apiClient from './client';

/** A single PDF attachment spec sent to the backend. */
export interface AttachmentSpec {
  type: 'invoice' | 'report';
  invoiceId?: string;
  reportType?: string;
  dateFrom?: string;
  dateTo?: string;
  lang?: string;
  currency?: string;
  filename?: string;
  /** Time-tracking reports only: omit hourly rates and monetary totals */
  hidePrices?: boolean;
}

/** UI-facing option — extends AttachmentSpec with display label and default-checked flag. */
export interface AttachmentOption extends AttachmentSpec {
  label: string;
  defaultChecked?: boolean;
}

export interface SendEmailParams {
  to: string;
  templateId?: string;
  templateCategory?: string;
  variables?: Record<string, string>;
  attachments?: AttachmentSpec[];
}

export interface EmailReportParams {
  reportType: string;
  dateFrom: string;
  dateTo: string;
  to: string;
  lang?: string;
  currency?: string;
}

export const sendEmail = (params: SendEmailParams): Promise<{ success: boolean; messageId?: string }> =>
  apiClient.post('/email/send', params).then((r) => r.data);

export const emailReport = (params: EmailReportParams): Promise<{ success: boolean }> =>
  apiClient.post('/reports/email', params).then((r) => r.data);
