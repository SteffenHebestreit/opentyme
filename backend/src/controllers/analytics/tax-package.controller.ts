/**
 * @fileoverview Tax Package Controller
 * 
 * Handles HTTP requests for tax package generation:
 * - Generate and download complete tax package (ZIP)
 * - Get available years with tax data
 * - Get package estimate (file counts)
 * 
 * @module controllers/analytics/tax-package
 */

import { Request, Response } from 'express';
import { taxPackageService, TaxPackageOptions } from '../../services/analytics/tax-package.service';

export class TaxPackageController {
  /**
   * Generate and download tax package as ZIP file
   * 
   * Query params:
   * - year: Tax year (required)
   * - start_date: Start date (YYYY-MM-DD), defaults to year start
   * - end_date: End date (YYYY-MM-DD), defaults to year end
   * - currency: Currency code (default: EUR)
   * - lang: Language (en/de, default: de)
   * - include_invoice_pdfs: Include invoice PDFs (default: true)
   * - include_expense_receipts: Include expense receipts (default: true)
   * - include_prepayment_receipts: Include tax prepayment receipts (default: true)
   * - include_reports: Include summary reports (default: true)
   * - include_excel: Include Excel export (default: true)
   * 
   * @route GET /api/tax-package/download
   * @access Protected
   */
  async downloadTaxPackage(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { 
        year,
        start_date,
        end_date,
        currency = 'EUR',
        lang = 'de',
        include_invoice_pdfs = 'true',
        include_expense_receipts = 'true',
        include_prepayment_receipts = 'true',
        include_reports = 'true',
        include_excel = 'true',
      } = req.query;

      // Validate year
      if (!year) {
        res.status(400).json({ message: 'year parameter is required' });
        return;
      }

      const yearNum = parseInt(year as string, 10);
      if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
        res.status(400).json({ message: 'Invalid year parameter' });
        return;
      }

      // Calculate default date range for the year
      const startDate = (start_date as string) || `${yearNum}-01-01`;
      const endDate = (end_date as string) || `${yearNum}-12-31`;

      // Validate language
      const language = (lang as string) === 'en' ? 'en' : 'de';

      // Build options
      const options: TaxPackageOptions = {
        userId,
        year: yearNum,
        startDate,
        endDate,
        currency: currency as string,
        language,
        includeInvoicePDFs: include_invoice_pdfs !== 'false',
        includeExpenseReceipts: include_expense_receipts !== 'false',
        includeTaxPrepaymentReceipts: include_prepayment_receipts !== 'false',
        includeReports: include_reports !== 'false',
        includeExcelExport: include_excel !== 'false',
      };

      console.log(`[TaxPackage] Generating tax package for user ${userId}, year ${yearNum}`);

      // Generate the package
      const zipStream = await taxPackageService.generateTaxPackage(options);

      // Set response headers
      const filename = language === 'de' 
        ? `Steuerpaket_${yearNum}.zip` 
        : `Tax_Package_${yearNum}.zip`;
      
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Pipe the zip stream to response
      zipStream.pipe(res);

      zipStream.on('error', (err) => {
        console.error('[TaxPackage] Stream error:', err);
        if (!res.headersSent) {
          res.status(500).json({ message: 'Error generating tax package' });
        }
      });

    } catch (error: any) {
      console.error('[TaxPackage] Generate tax package error:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: error.message || 'Internal server error' });
      }
    }
  }

  /**
   * Get list of available years with tax data
   * 
   * @route GET /api/tax-package/years
   * @access Protected
   */
  async getAvailableYears(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const years = await taxPackageService.getAvailableYears(userId);
      
      res.status(200).json({ years });
    } catch (error: any) {
      console.error('[TaxPackage] Get available years error:', error);
      res.status(500).json({ message: error.message || 'Internal server error' });
    }
  }

  /**
   * Get package estimate (file counts)
   * 
   * Query params:
   * - year: Tax year (required)
   * - start_date: Start date (YYYY-MM-DD), defaults to year start
   * - end_date: End date (YYYY-MM-DD), defaults to year end
   * 
   * @route GET /api/tax-package/estimate
   * @access Protected
   */
  async getPackageEstimate(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { year, start_date, end_date } = req.query;

      // Validate year
      if (!year) {
        res.status(400).json({ message: 'year parameter is required' });
        return;
      }

      const yearNum = parseInt(year as string, 10);
      if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
        res.status(400).json({ message: 'Invalid year parameter' });
        return;
      }

      // Calculate default date range
      const startDate = (start_date as string) || `${yearNum}-01-01`;
      const endDate = (end_date as string) || `${yearNum}-12-31`;

      const estimate = await taxPackageService.getPackageEstimate(userId, startDate, endDate, yearNum);
      
      res.status(200).json({
        year: yearNum,
        startDate,
        endDate,
        ...estimate,
      });
    } catch (error: any) {
      console.error('[TaxPackage] Get package estimate error:', error);
      res.status(500).json({ message: error.message || 'Internal server error' });
    }
  }
}

// Export singleton instance
export const taxPackageController = new TaxPackageController();
