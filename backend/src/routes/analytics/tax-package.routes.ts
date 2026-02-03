/**
 * @fileoverview Tax Package Routes
 * 
 * Provides RESTful endpoints for tax package generation:
 * - GET /api/tax-package/download - Download complete tax package as ZIP
 * - GET /api/tax-package/years - Get available years with tax data
 * - GET /api/tax-package/estimate - Get package size estimate
 * 
 * All routes require authentication.
 * 
 * @module routes/analytics/tax-package.routes
 */

import { Router } from 'express';
import { taxPackageController } from '../../controllers/analytics/tax-package.controller';
import { authenticateKeycloak, extractKeycloakUser } from '../../middleware/auth/keycloak.middleware';

const router = Router();

// Apply authentication to all routes
router.use(authenticateKeycloak);
router.use(extractKeycloakUser);

/**
 * @openapi
 * /api/tax-package/download:
 *   get:
 *     tags:
 *       - Tax Package
 *     summary: Download tax package
 *     description: |
 *       Generates and downloads a complete tax package as a ZIP file containing:
 *       - Cover page with summary
 *       - Income/Expense Report (EÜR)
 *       - VAT Report
 *       - All invoice PDFs
 *       - All expense receipts
 *       - Tax prepayment receipts
 *       - Excel export with all data
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: year
 *         in: query
 *         required: true
 *         schema:
 *           type: integer
 *         description: Tax year (e.g., 2025)
 *       - name: start_date
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date (YYYY-MM-DD), defaults to January 1st of the year
 *       - name: end_date
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *         description: End date (YYYY-MM-DD), defaults to December 31st of the year
 *       - name: currency
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           default: EUR
 *         description: Currency code
 *       - name: lang
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           enum: [en, de]
 *           default: de
 *         description: Language for reports and labels
 *       - name: include_invoice_pdfs
 *         in: query
 *         required: false
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include individual invoice PDFs
 *       - name: include_expense_receipts
 *         in: query
 *         required: false
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include expense receipt files
 *       - name: include_prepayment_receipts
 *         in: query
 *         required: false
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include tax prepayment receipt files
 *       - name: include_reports
 *         in: query
 *         required: false
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include summary PDF reports
 *       - name: include_excel
 *         in: query
 *         required: false
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include Excel export
 *     responses:
 *       200:
 *         description: ZIP file containing the tax package
 *         content:
 *           application/zip:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Invalid parameters
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.get('/download', taxPackageController.downloadTaxPackage.bind(taxPackageController));

/**
 * @openapi
 * /api/tax-package/years:
 *   get:
 *     tags:
 *       - Tax Package
 *     summary: Get available years
 *     description: Returns a list of years that have tax-relevant data (invoices, expenses, payments, tax prepayments)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of available years
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 years:
 *                   type: array
 *                   items:
 *                     type: integer
 *                   example: [2025, 2024, 2023]
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.get('/years', taxPackageController.getAvailableYears.bind(taxPackageController));

/**
 * @openapi
 * /api/tax-package/estimate:
 *   get:
 *     tags:
 *       - Tax Package
 *     summary: Get package estimate
 *     description: Returns estimated file counts for the tax package
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: year
 *         in: query
 *         required: true
 *         schema:
 *           type: integer
 *         description: Tax year
 *       - name: start_date
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date (YYYY-MM-DD)
 *       - name: end_date
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *         description: End date (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Package estimate
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 year:
 *                   type: integer
 *                 startDate:
 *                   type: string
 *                 endDate:
 *                   type: string
 *                 invoices:
 *                   type: integer
 *                 invoicesWithPDF:
 *                   type: integer
 *                 expenses:
 *                   type: integer
 *                 expensesWithReceipts:
 *                   type: integer
 *                 payments:
 *                   type: integer
 *                 taxPrepayments:
 *                   type: integer
 *                 taxPrepaymentsWithReceipts:
 *                   type: integer
 *       400:
 *         description: Invalid parameters
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.get('/estimate', taxPackageController.getPackageEstimate.bind(taxPackageController));

export default router;
