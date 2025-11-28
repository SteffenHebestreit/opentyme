/**
 * @fileoverview Report controller for handling report generation requests.
 * 
 * Provides endpoints for:
 * - GET /api/reports/vat - VAT Report (Umsatzsteuervoranmeldung)
 * - GET /api/reports/income-expense - Income/Expense Report (EÜR)
 * - GET /api/reports/time-tracking - Time Tracking Report
 * - GET /api/reports/client-revenue - Client Revenue Report
 * 
 * All endpoints are protected and require authentication.
 * Reports are generated on-the-fly and not stored.
 * 
 * @module controllers/analytics/report.controller
 */

import { Request, Response } from 'express';
import { reportService } from '../../services/analytics/report.service';
import reportPDFService from '../../services/analytics/report-pdf.service';
import * as ExcelJS from 'exceljs';

export class ReportController {
  /**
   * Generate VAT Report (Umsatzsteuervoranmeldung).
   * 
   * Query params:
   * - start_date: Start date (YYYY-MM-DD)
   * - end_date: End date (YYYY-MM-DD)
   * 
   * @route GET /api/reports/vat
   * @access Protected
   */
  async generateVATReport(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { start_date, end_date } = req.query;

      if (!start_date || !end_date) {
        res.status(400).json({ message: 'start_date and end_date are required' });
        return;
      }

      const report = await reportService.generateVATReport(
        userId,
        start_date as string,
        end_date as string
      );
      
      res.status(200).json(report);
    } catch (error: any) {
      console.error('Generate VAT report error:', error);
      res.status(500).json({ message: error.message || 'Internal server error' });
    }
  }

  /**
   * Generate Income/Expense Report (Financial Analysis).
   * 
   * Query params:
   * - start_date: Start date (YYYY-MM-DD)
   * - end_date: End date (YYYY-MM-DD)
   * - exclude_tax_excluded: Whether to exclude items marked as exclude_from_tax (default: true)
   * 
   * @route GET /api/reports/income-expense
   * @access Protected
   */
  async generateIncomeExpenseReport(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { start_date, end_date, exclude_tax_excluded } = req.query;

      if (!start_date || !end_date) {
        res.status(400).json({ message: 'start_date and end_date are required' });
        return;
      }

      // Default to true if not specified
      const excludeTaxExcluded = exclude_tax_excluded === 'false' ? false : true;

      const report = await reportService.generateIncomeExpenseReport(
        userId,
        start_date as string,
        end_date as string,
        excludeTaxExcluded
      );
      
      res.status(200).json(report);
    } catch (error: any) {
      console.error('Generate income/expense report error:', error);
      res.status(500).json({ message: error.message || 'Internal server error' });
    }
  }

  /**
   * Generate Invoice Report.
   * 
   * Query params:
   * - start_date: Start date (YYYY-MM-DD)
   * - end_date: End date (YYYY-MM-DD)
   * 
   * @route GET /api/reports/invoices
   * @access Protected
   */
  async generateInvoiceReport(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { start_date, end_date } = req.query;

      if (!start_date || !end_date) {
        res.status(400).json({ message: 'start_date and end_date are required' });
        return;
      }

      const report = await reportService.generateInvoiceReport(
        userId,
        start_date as string,
        end_date as string
      );
      
      res.status(200).json(report);
    } catch (error: any) {
      console.error('Generate invoice report error:', error);
      res.status(500).json({ message: error.message || 'Internal server error' });
    }
  }

  /**
   * Generate Expense Report.
   * 
   * Query params:
   * - start_date: Start date (YYYY-MM-DD)
   * - end_date: End date (YYYY-MM-DD)
   * 
   * @route GET /api/reports/expenses
   * @access Protected
   */
  async generateExpenseReport(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { start_date, end_date } = req.query;

      if (!start_date || !end_date) {
        res.status(400).json({ message: 'start_date and end_date are required' });
        return;
      }

      const report = await reportService.generateExpenseReport(
        userId,
        start_date as string,
        end_date as string
      );
      
      res.status(200).json(report);
    } catch (error: any) {
      console.error('Generate expense report error:', error);
      res.status(500).json({ message: error.message || 'Internal server error' });
    }
  }

  /**
   * Generate Time Tracking Report.
   * 
   * Query params:
   * - start_date: Start date (YYYY-MM-DD)
   * - end_date: End date (YYYY-MM-DD)
   * 
   * @route GET /api/reports/time-tracking
   * @access Protected
   */
  async generateTimeTrackingReport(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { start_date, end_date, project_id, client_id } = req.query;

      if (!start_date || !end_date) {
        res.status(400).json({ message: 'start_date and end_date are required' });
        return;
      }

      const report = await reportService.generateTimeTrackingReport(
        userId,
        start_date as string,
        end_date as string,
        project_id as string | undefined,
        client_id as string | undefined
      );
      
      res.status(200).json(report);
    } catch (error: any) {
      console.error('Generate time tracking report error:', error);
      res.status(500).json({ message: error.message || 'Internal server error' });
    }
  }

  /**
   * Generate Client Revenue Report.
   * 
   * Query params:
   * - start_date: Start date (YYYY-MM-DD)
   * - end_date: End date (YYYY-MM-DD)
   * 
   * @route GET /api/reports/client-revenue
   * @access Protected
   */
  async generateClientRevenueReport(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { start_date, end_date } = req.query;

      if (!start_date || !end_date) {
        res.status(400).json({ message: 'start_date and end_date are required' });
        return;
      }

      const report = await reportService.generateClientRevenueReport(
        userId,
        start_date as string,
        end_date as string
      );
      
      res.status(200).json(report);
    } catch (error: any) {
      console.error('Generate client revenue report error:', error);
      res.status(500).json({ message: error.message || 'Internal server error' });
    }
  }

  /**
   * Generate VAT Report PDF.
   * 
   * Query params:
   * - start_date: Start date (YYYY-MM-DD)
   * - end_date: End date (YYYY-MM-DD)
   * - lang: Language (en/de), defaults to 'en'
   * - currency: Currency code, defaults to 'EUR'
   * 
   * @route GET /api/reports/vat/pdf
   * @access Protected
   */
  async generateVATReportPDF(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { start_date, end_date, lang = 'en', currency = 'EUR' } = req.query;

      if (!start_date || !end_date) {
        res.status(400).json({ message: 'start_date and end_date are required' });
        return;
      }

      // Get report data
      const report = await reportService.generateVATReport(
        userId,
        start_date as string,
        end_date as string
      );

      // Generate PDF
      const pdfBuffer = await reportPDFService.generateVATReportPDF(
        report,
        currency as string,
        lang as 'en' | 'de'
      );

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="vat-report-${start_date}-${end_date}.pdf"`
      );

      // Send PDF buffer
      res.send(pdfBuffer);
    } catch (error: any) {
      console.error('Generate VAT report PDF error:', error);
      res.status(500).json({ message: error.message || 'Internal server error' });
    }
  }

  /**
   * Generate Income/Expense Report PDF.
   */
  async generateIncomeExpenseReportPDF(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { start_date, end_date, lang = 'en', currency = 'EUR', exclude_tax_excluded } = req.query;

      if (!start_date || !end_date) {
        res.status(400).json({ message: 'start_date and end_date are required' });
        return;
      }

      const excludeTaxExcluded = exclude_tax_excluded === 'false' ? false : true;

      const report = await reportService.generateIncomeExpenseReport(
        userId,
        start_date as string,
        end_date as string,
        excludeTaxExcluded
      );

      const pdfBuffer = await reportPDFService.generateIncomeExpenseReportPDF(
        report,
        currency as string,
        lang as 'en' | 'de'
      );

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="income-expense-report-${start_date}-${end_date}.pdf"`
      );

      res.send(pdfBuffer);
    } catch (error: any) {
      console.error('Generate income/expense report PDF error:', error);
      res.status(500).json({ message: error.message || 'Internal server error' });
    }
  }

  /**
   * Generate Invoice Report PDF.
   */
  async generateInvoiceReportPDF(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { start_date, end_date, lang = 'en', currency = 'EUR' } = req.query;

      if (!start_date || !end_date) {
        res.status(400).json({ message: 'start_date and end_date are required' });
        return;
      }

      const report = await reportService.generateInvoiceReport(
        userId,
        start_date as string,
        end_date as string
      );

      const pdfBuffer = await reportPDFService.generateInvoiceReportPDF(
        report,
        currency as string,
        lang as 'en' | 'de'
      );

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="invoice-report-${start_date}-${end_date}.pdf"`
      );

      res.send(pdfBuffer);
    } catch (error: any) {
      console.error('Generate invoice report PDF error:', error);
      res.status(500).json({ message: error.message || 'Internal server error' });
    }
  }

  /**
   * Generate Expense Report PDF.
   */
  async generateExpenseReportPDF(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { start_date, end_date, lang = 'en', currency = 'EUR' } = req.query;

      if (!start_date || !end_date) {
        res.status(400).json({ message: 'start_date and end_date are required' });
        return;
      }

      const report = await reportService.generateExpenseReport(
        userId,
        start_date as string,
        end_date as string
      );

      const pdfBuffer = await reportPDFService.generateExpenseReportPDF(
        report,
        currency as string,
        lang as 'en' | 'de'
      );

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="expense-report-${start_date}-${end_date}.pdf"`
      );

      res.send(pdfBuffer);
    } catch (error: any) {
      console.error('Generate expense report PDF error:', error);
      res.status(500).json({ message: error.message || 'Internal server error' });
    }
  }

  /**
   * Generate Time Tracking Report PDF.
   */
  async generateTimeTrackingReportPDF(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { start_date, end_date, lang = 'de', currency = 'EUR', project_id, client_id, headline, description, footer } = req.query;

      if (!start_date || !end_date) {
        res.status(400).json({ message: 'start_date and end_date are required' });
        return;
      }

      const metadata = {
        headline: headline as string | undefined,
        description: description as string | undefined,
        footer: footer as string | undefined,
      };

      const report = await reportService.generateTimeTrackingReport(
        userId,
        start_date as string,
        end_date as string,
        project_id as string | undefined,
        client_id as string | undefined
      );

      const pdfBuffer = await reportPDFService.generateTimeTrackingReportPDF(
        report,
        lang as 'en' | 'de',
        currency as string,
        metadata
      );

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="time-tracking-report-${start_date}-${end_date}.pdf"`
      );

      res.send(pdfBuffer);
    } catch (error: any) {
      console.error('Generate time tracking report PDF error:', error);
      res.status(500).json({ message: error.message || 'Internal server error' });
    }
  }

  /**
   * Generate Time Tracking Report CSV Export
   * 
   * Query params:
   * - start_date: Start date (YYYY-MM-DD)
   * - end_date: End date (YYYY-MM-DD)
   * - project_id: Optional project filter
   * - client_id: Optional client filter
   * 
   * @route GET /api/reports/time-tracking/csv
   * @access Protected
   */
  async generateTimeTrackingReportCSV(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { start_date, end_date, project_id, client_id, headline, description } = req.query;

      if (!start_date || !end_date) {
        res.status(400).json({ message: 'start_date and end_date are required' });
        return;
      }

      const report = await reportService.generateTimeTrackingReport(
        userId,
        start_date as string,
        end_date as string,
        project_id as string | undefined,
        client_id as string | undefined
      );

      // Build CSV with 3 sections
      let csv = '';

      // Add headline if provided
      if (headline) {
        csv += `${headline}\n`;
        csv += `Zeitraum: ${start_date} - ${end_date}\n`;
        if (description) {
          csv += `${description}\n`;
        }
        csv += '\n';
      }

      // Section 1: Task Summary
      csv += 'ZUSAMMENFASSUNG NACH AUFGABE\n';
      csv += 'Aufgabe,Gesamtstunden,Abrechenbare Stunden,Wert (EUR)\n';
      
      const taskSummaryMap = new Map<string, { hours: number; billable_hours: number; value: number }>();
      report.entries.forEach(entry => {
        const taskName = entry.task_name || 'Ohne Aufgabe';
        if (!taskSummaryMap.has(taskName)) {
          taskSummaryMap.set(taskName, { hours: 0, billable_hours: 0, value: 0 });
        }
        const task = taskSummaryMap.get(taskName)!;
        task.hours += entry.hours;
        if (entry.is_billable) {
          task.billable_hours += entry.hours;
          task.value += entry.value || 0;
        }
      });

      let taskTotalHours = 0;
      let taskTotalBillable = 0;
      let taskTotalValue = 0;

      Array.from(taskSummaryMap.entries())
        .sort((a, b) => b[1].hours - a[1].hours)
        .forEach(([taskName, summary]) => {
          taskTotalHours += summary.hours;
          taskTotalBillable += summary.billable_hours;
          taskTotalValue += summary.value;
          csv += `"${taskName}",${summary.hours.toFixed(2)},${summary.billable_hours.toFixed(2)},${summary.value.toFixed(2)}\n`;
        });

      csv += `"Gesamt",${taskTotalHours.toFixed(2)},${taskTotalBillable.toFixed(2)},${taskTotalValue.toFixed(2)}\n`;
      csv += '\n';

      // Section 2: Daily Summary
      csv += 'ZUSAMMENFASSUNG NACH TAG\n';
      csv += 'Datum,Gesamtstunden,Abrechenbare Stunden,Wert (EUR)\n';
      
      const dailySummaryMap = new Map<string, { hours: number; billable_hours: number; value: number }>();
      report.entries.forEach(entry => {
        const dateKey = entry.date;
        if (!dailySummaryMap.has(dateKey)) {
          dailySummaryMap.set(dateKey, { hours: 0, billable_hours: 0, value: 0 });
        }
        const day = dailySummaryMap.get(dateKey)!;
        day.hours += entry.hours;
        if (entry.is_billable) {
          day.billable_hours += entry.hours;
          day.value += entry.value || 0;
        }
      });

      let dailyTotalHours = 0;
      let dailyTotalBillable = 0;
      let dailyTotalValue = 0;

      Array.from(dailySummaryMap.entries())
        .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
        .forEach(([dateKey, summary]) => {
          dailyTotalHours += summary.hours;
          dailyTotalBillable += summary.billable_hours;
          dailyTotalValue += summary.value;
          csv += `${dateKey},${summary.hours.toFixed(2)},${summary.billable_hours.toFixed(2)},${summary.value.toFixed(2)}\n`;
        });

      csv += `"Gesamt",${dailyTotalHours.toFixed(2)},${dailyTotalBillable.toFixed(2)},${dailyTotalValue.toFixed(2)}\n`;
      csv += '\n';

      // Section 3: Detailed Entries
      csv += 'DETAILLIERTE ZEITEINTRÄGE\n';
      csv += 'Datum,Projekt,Kunde,Aufgabe,Beschreibung,Stunden,Abrechenbar,Stundensatz,Wert\n';
      
      report.entries.forEach(entry => {
        const billable = entry.is_billable ? 'Ja' : 'Nein';
        const hourlyRate = entry.hourly_rate ? entry.hourly_rate.toFixed(2) : '-';
        const value = entry.value ? entry.value.toFixed(2) : '-';
        csv += `${entry.date},"${entry.project_name}","${entry.client_name}","${entry.task_name || '-'}","${entry.description || '-'}",${entry.hours.toFixed(2)},${billable},${hourlyRate},${value}\n`;
      });

      csv += `"Gesamt",,,,,"${report.summary.total_hours.toFixed(2)}",,,"${report.summary.billable_value.toFixed(2)}"\n`;
      csv += '\n';

      // Section 4: Summary
      csv += 'GESAMTZUSAMMENFASSUNG\n';
      csv += `Gesamtstunden,${report.summary.total_hours.toFixed(2)}\n`;
      csv += `Abrechenbare Stunden,${report.summary.billable_hours.toFixed(2)}\n`;
      csv += `Nicht abrechenbare Stunden,${report.summary.non_billable_hours.toFixed(2)}\n`;
      csv += `Abrechnungswert (EUR),${report.summary.billable_value.toFixed(2)}\n`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="zeiterfassung-${start_date}-${end_date}.csv"`
      );

      res.send('\uFEFF' + csv); // BOM for Excel UTF-8 support
    } catch (error: any) {
      console.error('Generate time tracking report CSV error:', error);
      res.status(500).json({ message: error.message || 'Internal server error' });
    }
  }

  /**
   * Generate Time Tracking Report Excel Export
   * 
   * Query params:
   * - start_date: Start date (YYYY-MM-DD)
   * - end_date: End date (YYYY-MM-DD)
   * - project_id: Optional project filter
   * - client_id: Optional client filter
   * 
   * @route GET /api/reports/time-tracking/excel
   * @access Protected
   */
  async generateTimeTrackingReportExcel(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { start_date, end_date, project_id, client_id, headline, description } = req.query;

      if (!start_date || !end_date) {
        res.status(400).json({ message: 'start_date and end_date are required' });
        return;
      }

      const report = await reportService.generateTimeTrackingReport(
        userId,
        start_date as string,
        end_date as string,
        project_id as string | undefined,
        client_id as string | undefined
      );

      const workbook = new ExcelJS.Workbook();
      
      // Set workbook metadata
      workbook.creator = 'TYME';
      workbook.created = new Date();
      if (headline) workbook.title = headline as string;
      if (description) workbook.description = description as string;

      // Sheet 1: Task Summary
      const taskSheet = workbook.addWorksheet('Aufgaben-Zusammenfassung');
      taskSheet.columns = [
        { header: 'Aufgabe', key: 'task', width: 30 },
        { header: 'Gesamtstunden', key: 'hours', width: 15 },
        { header: 'Abrechenbare Stunden', key: 'billable_hours', width: 20 },
        { header: 'Wert (EUR)', key: 'value', width: 15 },
      ];

      const taskSummaryMap = new Map<string, { hours: number; billable_hours: number; value: number }>();
      report.entries.forEach(entry => {
        const taskName = entry.task_name || 'Ohne Aufgabe';
        if (!taskSummaryMap.has(taskName)) {
          taskSummaryMap.set(taskName, { hours: 0, billable_hours: 0, value: 0 });
        }
        const task = taskSummaryMap.get(taskName)!;
        task.hours += entry.hours;
        if (entry.is_billable) {
          task.billable_hours += entry.hours;
          task.value += entry.value || 0;
        }
      });

      Array.from(taskSummaryMap.entries())
        .sort((a, b) => b[1].hours - a[1].hours)
        .forEach(([taskName, summary]) => {
          taskSheet.addRow({
            task: taskName,
            hours: summary.hours,
            billable_hours: summary.billable_hours,
            value: summary.value,
          });
        });

      // Style header row
      taskSheet.getRow(1).font = { bold: true };
      taskSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' },
      };

      // Sheet 2: Daily Summary
      const dailySheet = workbook.addWorksheet('Tages-Zusammenfassung');
      dailySheet.columns = [
        { header: 'Datum', key: 'date', width: 15 },
        { header: 'Gesamtstunden', key: 'hours', width: 15 },
        { header: 'Abrechenbare Stunden', key: 'billable_hours', width: 20 },
        { header: 'Wert (EUR)', key: 'value', width: 15 },
      ];

      const dailySummaryMap = new Map<string, { hours: number; billable_hours: number; value: number }>();
      report.entries.forEach(entry => {
        const dateKey = entry.date;
        if (!dailySummaryMap.has(dateKey)) {
          dailySummaryMap.set(dateKey, { hours: 0, billable_hours: 0, value: 0 });
        }
        const day = dailySummaryMap.get(dateKey)!;
        day.hours += entry.hours;
        if (entry.is_billable) {
          day.billable_hours += entry.hours;
          day.value += entry.value || 0;
        }
      });

      Array.from(dailySummaryMap.entries())
        .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
        .forEach(([dateKey, summary]) => {
          dailySheet.addRow({
            date: dateKey,
            hours: summary.hours,
            billable_hours: summary.billable_hours,
            value: summary.value,
          });
        });

      dailySheet.getRow(1).font = { bold: true };
      dailySheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' },
      };

      // Sheet 3: Detailed Entries
      const detailSheet = workbook.addWorksheet('Detaillierte Einträge');
      detailSheet.columns = [
        { header: 'Datum', key: 'date', width: 12 },
        { header: 'Projekt', key: 'project', width: 20 },
        { header: 'Kunde', key: 'client', width: 20 },
        { header: 'Aufgabe', key: 'task', width: 20 },
        { header: 'Beschreibung', key: 'description', width: 30 },
        { header: 'Stunden', key: 'hours', width: 10 },
        { header: 'Abrechenbar', key: 'billable', width: 12 },
        { header: 'Stundensatz', key: 'rate', width: 12 },
        { header: 'Wert', key: 'value', width: 12 },
      ];

      report.entries.forEach(entry => {
        detailSheet.addRow({
          date: entry.date,
          project: entry.project_name,
          client: entry.client_name,
          task: entry.task_name || '-',
          description: entry.description || '-',
          hours: entry.hours,
          billable: entry.is_billable ? 'Ja' : 'Nein',
          rate: entry.hourly_rate || '-',
          value: entry.value || '-',
        });
      });

      detailSheet.getRow(1).font = { bold: true };
      detailSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' },
      };

      // Sheet 4: Summary
      const summarySheet = workbook.addWorksheet('Zusammenfassung');
      summarySheet.columns = [
        { header: 'Kennzahl', key: 'metric', width: 30 },
        { header: 'Wert', key: 'value', width: 20 },
      ];

      summarySheet.addRow({ metric: 'Zeitraum', value: `${start_date} bis ${end_date}` });
      summarySheet.addRow({ metric: 'Gesamtstunden', value: report.summary.total_hours.toFixed(2) });
      summarySheet.addRow({ metric: 'Abrechenbare Stunden', value: report.summary.billable_hours.toFixed(2) });
      summarySheet.addRow({ metric: 'Nicht abrechenbare Stunden', value: report.summary.non_billable_hours.toFixed(2) });
      summarySheet.addRow({ metric: 'Abrechnungswert (EUR)', value: report.summary.billable_value.toFixed(2) });

      summarySheet.getRow(1).font = { bold: true };
      summarySheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' },
      };

      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer();

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="zeiterfassung-${start_date}-${end_date}.xlsx"`
      );

      res.send(Buffer.from(buffer));
    } catch (error: any) {
      console.error('Generate time tracking report Excel error:', error);
      res.status(500).json({ message: error.message || 'Internal server error' });
    }
  }
}

