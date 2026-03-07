/**
 * @fileoverview Email Send Controller
 * Handles sending emails using user templates with auto-populated variables
 * and configurable PDF attachments (invoice PDFs and/or report PDFs).
 *
 * POST /api/email/send
 */

import { Request, Response } from 'express';
import { getDbClient } from '../../utils/database';
import { renderTemplateForSend } from '../../services/communication/email-template.service';
import { emailService } from '../../services/external/email.service';
import { InvoiceController } from '../financial/invoice.controller';
import { reportService } from '../../services/analytics/report.service';
import reportPDFService from '../../services/analytics/report-pdf.service';
import { logger } from '../../utils/logger';

/** Attachment specification for a single PDF to attach to the outgoing email. */
interface AttachmentSpec {
  type: 'invoice' | 'report';
  /** Required when type === 'invoice' */
  invoiceId?: string;
  /** Required when type === 'report': one of vat | income-expense | invoice | expense | time-tracking */
  reportType?: string;
  dateFrom?: string;
  dateTo?: string;
  lang?: string;
  currency?: string;
  /** Optional override for the attachment filename (without .pdf) */
  filename?: string;
  /** Time-tracking reports only: omit hourly rates and monetary totals */
  hidePrices?: boolean;
}

interface SendEmailBody {
  to: string;
  templateId?: string;
  templateCategory?: string;
  variables?: Record<string, string>;
  /** @deprecated Use attachments instead. Kept for backward compat. */
  attachInvoiceId?: string;
  /** @deprecated Only respected when attachInvoiceId is set. */
  updateInvoiceStatus?: boolean;
  /** List of PDFs to attach. */
  attachments?: AttachmentSpec[];
}

const REPORT_LABELS: Record<string, string> = {
  vat: 'VAT Report',
  'income-expense': 'Income & Expense Report',
  invoice: 'Invoice Report',
  expense: 'Expense Report',
  'time-tracking': 'Time Tracking Report',
};

/** Generates a report PDF buffer for a given report type and date range. */
async function generateReportPdfBuffer(
  userId: string,
  reportType: string,
  dateFrom: string,
  dateTo: string,
  lang: 'en' | 'de',
  currency: string,
  hidePrices: boolean = false,
): Promise<Buffer> {
  const theme = await reportPDFService.getUserPdfTheme(userId);
  const restoreTheme = reportPDFService.applyTheme(theme);
  try {
    switch (reportType) {
      case 'vat': {
        const report = await reportService.generateVATReport(userId, dateFrom, dateTo);
        return await reportPDFService.generateVATReportPDF(report, currency, lang);
      }
      case 'income-expense': {
        const report = await reportService.generateIncomeExpenseReport(userId, dateFrom, dateTo);
        return await reportPDFService.generateIncomeExpenseReportPDF(report, currency, lang);
      }
      case 'invoice': {
        const report = await reportService.generateInvoiceReport(userId, dateFrom, dateTo);
        return await reportPDFService.generateInvoiceReportPDF(report, currency, lang);
      }
      case 'expense': {
        const report = await reportService.generateExpenseReport(userId, dateFrom, dateTo);
        return await reportPDFService.generateExpenseReportPDF(report, currency, lang);
      }
      case 'time-tracking': {
        const report = await reportService.generateTimeTrackingReport(userId, dateFrom, dateTo);
        return await reportPDFService.generateTimeTrackingReportPDF(report, lang, currency, undefined, hidePrices);
      }
      default:
        throw new Error(`Unknown report type: "${reportType}"`);
    }
  } finally {
    restoreTheme();
  }
}

export async function sendEmail(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user?.id;
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const {
    to,
    templateId,
    templateCategory,
    variables = {},
    attachInvoiceId,
    updateInvoiceStatus = false,
    attachments: attachmentSpecs,
  }: SendEmailBody = req.body;

  if (!to) {
    res.status(400).json({ message: 'Recipient email address (to) is required.' });
    return;
  }

  if (!templateId && !templateCategory) {
    res.status(400).json({ message: 'Either templateId or templateCategory is required.' });
    return;
  }

  // Normalise: if old-style attachInvoiceId provided and no attachments array, convert it.
  const resolvedSpecs: AttachmentSpec[] = attachmentSpecs?.length
    ? attachmentSpecs
    : attachInvoiceId
      ? [{ type: 'invoice', invoiceId: attachInvoiceId }]
      : [];

  try {
    const pool = getDbClient();

    // 1. Resolve template ID
    let resolvedTemplateId = templateId;
    if (!resolvedTemplateId && templateCategory) {
      const result = await pool.query(
        `SELECT id FROM email_templates
         WHERE user_id = $1 AND category = $2 AND is_default = true
         LIMIT 1`,
        [userId, templateCategory]
      );
      if (result.rows.length === 0) {
        res.status(404).json({
          message: `No default template found for category "${templateCategory}". Create one in Config → Email Templates.`,
        });
        return;
      }
      resolvedTemplateId = result.rows[0].id as string;
    }

    // 2. Auto-populate variables (company.*, and invoice.* / client.* from first invoice spec)
    const autoVars: Record<string, string> = {};

    const settingsResult = await pool.query(
      `SELECT company_name, company_email, company_phone, company_address, company_logo_url
       FROM settings WHERE user_id = $1`,
      [userId]
    );
    if (settingsResult.rows.length > 0) {
      const s = settingsResult.rows[0];
      autoVars['company.name'] = s.company_name ?? '';
      autoVars['company.email'] = s.company_email ?? '';
      autoVars['company.phone'] = s.company_phone ?? '';
      autoVars['company.address'] = s.company_address ?? '';
      autoVars['company.logo_url'] = s.company_logo_url ?? '';
    }

    // Auto-populate invoice.* / client.* from the first invoice attachment spec
    let firstInvoiceId: string | undefined;
    let invoiceNumber = '';
    const firstInvoiceSpec = resolvedSpecs.find((s) => s.type === 'invoice' && s.invoiceId);
    if (firstInvoiceSpec?.invoiceId) {
      firstInvoiceId = firstInvoiceSpec.invoiceId;
      const invoiceResult = await pool.query(
        `SELECT i.invoice_number, i.issue_date, i.due_date, i.total_amount, i.currency,
                c.name AS client_name, c.email AS client_email,
                c.billing_email AS client_billing_email, c.address AS client_address
         FROM invoices i
         LEFT JOIN clients c ON c.id = i.client_id
         WHERE i.id = $1 AND i.user_id = $2`,
        [firstInvoiceId, userId]
      );
      if (invoiceResult.rows.length > 0) {
        const inv = invoiceResult.rows[0];
        invoiceNumber = inv.invoice_number ?? '';
        autoVars['invoice.number'] = inv.invoice_number ?? '';
        autoVars['invoice.date'] = inv.issue_date
          ? (inv.issue_date instanceof Date ? inv.issue_date.toISOString() : String(inv.issue_date)).slice(0, 10)
          : '';
        autoVars['invoice.due_date'] = inv.due_date
          ? (inv.due_date instanceof Date ? inv.due_date.toISOString() : String(inv.due_date)).slice(0, 10)
          : '';
        autoVars['invoice.total'] = inv.total_amount != null ? String(inv.total_amount) : '';
        autoVars['invoice.currency'] = inv.currency ?? '';
        autoVars['client.name'] = inv.client_name ?? '';
        // Use billing_email for invoices if set, otherwise fall back to contact email
        autoVars['client.email'] = inv.client_billing_email ?? inv.client_email ?? '';
        autoVars['client.address'] = inv.client_address ?? '';
      }
    }

    const mergedVars = { ...autoVars, ...variables };

    // 3. Render template
    const rendered = await renderTemplateForSend(resolvedTemplateId!, userId, mergedVars);
    if (!rendered) {
      res.status(404).json({ message: 'Email template not found.' });
      return;
    }

    // 4. Build attachments
    const builtAttachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];

    for (const spec of resolvedSpecs) {
      if (spec.type === 'invoice' && spec.invoiceId) {
        const invoiceController = new InvoiceController();
        const pdfBuffer = await invoiceController.generatePDFBuffer(spec.invoiceId, userId, false);
        if (pdfBuffer) {
          const label = spec.invoiceId === firstInvoiceId && invoiceNumber
            ? `invoice-${invoiceNumber}`
            : `invoice-${spec.invoiceId}`;
          builtAttachments.push({
            filename: `${spec.filename ?? label}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          });
        }
      } else if (spec.type === 'report' && spec.reportType && spec.dateFrom && spec.dateTo) {
        if (!REPORT_LABELS[spec.reportType]) {
          logger.warn(`Skipping unknown report type in attachments: ${spec.reportType}`);
          continue;
        }
        const pdfBuffer = await generateReportPdfBuffer(
          userId,
          spec.reportType,
          spec.dateFrom,
          spec.dateTo,
          (spec.lang ?? 'de') as 'en' | 'de',
          spec.currency ?? 'EUR',
          spec.hidePrices ?? false,
        );
        builtAttachments.push({
          filename: `${spec.filename ?? `${spec.reportType}-report-${spec.dateFrom}-${spec.dateTo}`}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        });
      }
    }

    // 5. Send
    const messageId = await emailService.sendEmail({
      userId,
      to,
      subject: rendered.subject,
      html: rendered.html,
      attachments: builtAttachments.length > 0 ? builtAttachments : undefined,
    });

    // 6. Legacy: status update if attachInvoiceId + updateInvoiceStatus provided
    if (updateInvoiceStatus && attachInvoiceId) {
      await pool.query(
        `UPDATE invoices SET status = 'sent', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND user_id = $2 AND status = 'draft'`,
        [attachInvoiceId, userId]
      );
    }

    res.json({ success: true, messageId });
  } catch (error: any) {
    logger.error('Send email error', { error });
    res.status(500).json({ message: error.message || 'Failed to send email.' });
  }
}
