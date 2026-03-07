/**
 * @fileoverview Report Email Controller
 * Generates a report PDF and emails it to the specified address in a single request.
 *
 * POST /api/reports/email
 */

import { Request, Response } from 'express';
import { reportService } from '../../services/analytics/report.service';
import reportPDFService from '../../services/analytics/report-pdf.service';
import { emailService } from '../../services/external/email.service';
import { logger } from '../../utils/logger';

const REPORT_LABELS: Record<string, string> = {
  vat: 'VAT Report',
  'income-expense': 'Income & Expense Report',
  invoice: 'Invoice Report',
  expense: 'Expense Report',
  'time-tracking': 'Time Tracking Report',
};

export async function emailReport(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user?.id;
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const {
    reportType,
    dateFrom,
    dateTo,
    to,
    lang = 'de',
    currency = 'EUR',
  }: {
    reportType: string;
    dateFrom: string;
    dateTo: string;
    to: string;
    lang?: string;
    currency?: string;
  } = req.body;

  if (!reportType || !dateFrom || !dateTo || !to) {
    res.status(400).json({ message: 'reportType, dateFrom, dateTo, and to are required.' });
    return;
  }

  if (!REPORT_LABELS[reportType]) {
    res.status(400).json({ message: `Unknown report type: "${reportType}".` });
    return;
  }

  try {
    const theme = await reportPDFService.getUserPdfTheme(userId);
    const restoreTheme = reportPDFService.applyTheme(theme);

    let pdfBuffer: Buffer;
    try {
      switch (reportType) {
        case 'vat': {
          const report = await reportService.generateVATReport(userId, dateFrom, dateTo);
          pdfBuffer = await reportPDFService.generateVATReportPDF(report, currency, lang as 'en' | 'de');
          break;
        }
        case 'income-expense': {
          const report = await reportService.generateIncomeExpenseReport(userId, dateFrom, dateTo);
          pdfBuffer = await reportPDFService.generateIncomeExpenseReportPDF(report, currency, lang as 'en' | 'de');
          break;
        }
        case 'invoice': {
          const report = await reportService.generateInvoiceReport(userId, dateFrom, dateTo);
          pdfBuffer = await reportPDFService.generateInvoiceReportPDF(report, currency, lang as 'en' | 'de');
          break;
        }
        case 'expense': {
          const report = await reportService.generateExpenseReport(userId, dateFrom, dateTo);
          pdfBuffer = await reportPDFService.generateExpenseReportPDF(report, currency, lang as 'en' | 'de');
          break;
        }
        case 'time-tracking': {
          const report = await reportService.generateTimeTrackingReport(userId, dateFrom, dateTo);
          pdfBuffer = await reportPDFService.generateTimeTrackingReportPDF(report, lang as 'en' | 'de', currency);
          break;
        }
        default:
          res.status(400).json({ message: `Unknown report type: "${reportType}".` });
          return;
      }
    } finally {
      restoreTheme();
    }

    const label = REPORT_LABELS[reportType];
    const filename = `${reportType}-report-${dateFrom}-${dateTo}.pdf`;
    const subject = `${label} — ${dateFrom} to ${dateTo}`;

    await emailService.sendEmail({
      userId,
      to,
      subject,
      html: `<p>Please find your <strong>${label}</strong> (${dateFrom} – ${dateTo}) attached.</p>`,
      attachments: [{ filename, content: pdfBuffer!, contentType: 'application/pdf' }],
    });

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Email report error', { error });
    res.status(500).json({ message: error.message || 'Failed to email report.' });
  }
}
