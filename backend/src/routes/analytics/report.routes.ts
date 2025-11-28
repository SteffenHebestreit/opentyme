/**
 * @fileoverview Report routes for generating various business reports.
 * 
 * Provides RESTful endpoints for:
 * - VAT Report (Umsatzsteuervoranmeldung)
 * - Income/Expense Report (EÜR)
 * - Invoice Report
 * - Expense Report
 * - Time Tracking Report
 * - Client Revenue Report
 * 
 * All routes require authentication.
 * Reports are generated on-the-fly and not stored.
 * 
 * @module routes/analytics/report.routes
 */

import { Router } from 'express';
import { ReportController } from '../../controllers/analytics/report.controller';
import { authenticateKeycloak, extractKeycloakUser } from '../../middleware/auth/keycloak.middleware';

const router = Router();
const reportController = new ReportController();

// Apply authentication to all routes
router.use(authenticateKeycloak);
router.use(extractKeycloakUser);

/**
 * GET /api/reports/vat
 * Generate VAT Report (Umsatzsteuervoranmeldung)
 * Query params: start_date (YYYY-MM-DD), end_date (YYYY-MM-DD)
 */
router.get('/vat', reportController.generateVATReport.bind(reportController));

/**
 * GET /api/reports/income-expense
 * Generate Income/Expense Report (EÜR - Einnahmenüberschussrechnung)
 * Query params: start_date (YYYY-MM-DD), end_date (YYYY-MM-DD)
 */
router.get('/income-expense', reportController.generateIncomeExpenseReport.bind(reportController));

/**
 * GET /api/reports/invoices
 * Generate Invoice Report
 * Query params: start_date (YYYY-MM-DD), end_date (YYYY-MM-DD)
 */
router.get('/invoices', reportController.generateInvoiceReport.bind(reportController));

/**
 * GET /api/reports/expenses
 * Generate Expense Report
 * Query params: start_date (YYYY-MM-DD), end_date (YYYY-MM-DD)
 */
router.get('/expenses', reportController.generateExpenseReport.bind(reportController));

/**
 * GET /api/reports/time-tracking
 * Generate Time Tracking Report
 * Query params: start_date (YYYY-MM-DD), end_date (YYYY-MM-DD)
 */
router.get('/time-tracking', reportController.generateTimeTrackingReport.bind(reportController));

/**
 * GET /api/reports/client-revenue
 * Generate Client Revenue Report
 * Query params: start_date (YYYY-MM-DD), end_date (YYYY-MM-DD)
 */
router.get('/client-revenue', reportController.generateClientRevenueReport.bind(reportController));

/**
 * PDF Export Routes
 */

/**
 * GET /api/reports/vat/pdf
 * Generate VAT Report PDF
 * Query params: start_date, end_date, lang (en/de), currency
 */
router.get('/vat/pdf', reportController.generateVATReportPDF.bind(reportController));

/**
 * GET /api/reports/income-expense/pdf
 * Generate Income/Expense Report PDF
 * Query params: start_date, end_date, lang (en/de), currency
 */
router.get('/income-expense/pdf', reportController.generateIncomeExpenseReportPDF.bind(reportController));

/**
 * GET /api/reports/invoices/pdf
 * Generate Invoice Report PDF
 * Query params: start_date, end_date, lang (en/de), currency
 */
router.get('/invoices/pdf', reportController.generateInvoiceReportPDF.bind(reportController));

/**
 * GET /api/reports/expenses/pdf
 * Generate Expense Report PDF
 * Query params: start_date, end_date, lang (en/de), currency
 */
router.get('/expenses/pdf', reportController.generateExpenseReportPDF.bind(reportController));

/**
 * GET /api/reports/time-tracking/pdf
 * Generate Time Tracking Report PDF
 * Query params: start_date, end_date, lang (en/de), currency
 */
router.get('/time-tracking/pdf', reportController.generateTimeTrackingReportPDF.bind(reportController));

/**
 * GET /api/reports/time-tracking/csv
 * Generate Time Tracking Report CSV
 * Query params: start_date, end_date, project_id (optional), client_id (optional)
 */
router.get('/time-tracking/csv', reportController.generateTimeTrackingReportCSV.bind(reportController));

/**
 * GET /api/reports/time-tracking/excel
 * Generate Time Tracking Report Excel
 * Query params: start_date, end_date, project_id (optional), client_id (optional)
 */
router.get('/time-tracking/excel', reportController.generateTimeTrackingReportExcel.bind(reportController));

export default router;
