import { Router } from 'express';
import { authenticateKeycloak, extractKeycloakUser } from '../../middleware/auth/keycloak.middleware';
import {
  getTimeSummary,
  getRevenueSummary,
  getExpenseSummary,
  getProfitSummary,
  getClientOverview,
  getProjectOverview,
} from '../../controllers/ai/ai-insights.controller';

const router = Router();
router.use(authenticateKeycloak, extractKeycloakUser);

/**
 * @swagger
 * /api/insights/time-summary:
 *   get:
 *     operationId: get_time_summary
 *     summary: Aggregated time tracking summary for a period
 *     description: Returns total hours, billable hours, billable value (hours × rate) and a breakdown by project. All calculations are done server-side. Use this when the user asks about hours worked in a date range.
 *     tags: [Insights]
 *     parameters:
 *       - in: query
 *         name: start_date
 *         schema: { type: string, format: date }
 *         description: Filter entries from this date (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         schema: { type: string, format: date }
 *         description: Filter entries up to this date (YYYY-MM-DD)
 *       - in: query
 *         name: project_id
 *         schema: { type: string, format: uuid }
 *         description: Restrict to a single project
 *       - in: query
 *         name: client_id
 *         schema: { type: string, format: uuid }
 *         description: Restrict to projects belonging to this client
 *       - in: query
 *         name: is_billable
 *         schema: { type: boolean }
 *         description: Filter to only billable (true) or non-billable (false) entries
 *     responses:
 *       200:
 *         description: Aggregated time summary
 */
router.get('/time-summary', getTimeSummary);

/**
 * @swagger
 * /api/insights/revenue-summary:
 *   get:
 *     operationId: get_revenue_summary
 *     summary: Aggregated invoice revenue summary for a period
 *     description: Returns total invoiced, paid, outstanding and draft amounts. Optionally grouped by client, month, or status. Use this when the user asks about revenue, earnings or invoice totals.
 *     tags: [Insights]
 *     parameters:
 *       - in: query
 *         name: start_date
 *         schema: { type: string, format: date }
 *         description: Invoice issue date from (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         schema: { type: string, format: date }
 *         description: Invoice issue date to (YYYY-MM-DD)
 *       - in: query
 *         name: client_id
 *         schema: { type: string, format: uuid }
 *         description: Restrict to invoices for this client
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, sent, paid, overdue, cancelled] }
 *         description: Filter by invoice status
 *       - in: query
 *         name: group_by
 *         schema: { type: string, enum: [client, month, status] }
 *         description: Group results by client, month, or status
 *     responses:
 *       200:
 *         description: Aggregated revenue summary
 */
router.get('/revenue-summary', getRevenueSummary);

/**
 * @swagger
 * /api/insights/expense-summary:
 *   get:
 *     operationId: get_expense_summary
 *     summary: Aggregated expense summary for a period
 *     description: Returns total expenses (gross and net), tax amounts, and a breakdown by category. Use this when the user asks about spending or costs.
 *     tags: [Insights]
 *     parameters:
 *       - in: query
 *         name: start_date
 *         schema: { type: string, format: date }
 *         description: Filter expenses from this date (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         schema: { type: string, format: date }
 *         description: Filter expenses up to this date (YYYY-MM-DD)
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *         description: Filter by expense category
 *       - in: query
 *         name: project_id
 *         schema: { type: string, format: uuid }
 *         description: Filter by project
 *     responses:
 *       200:
 *         description: Aggregated expense summary
 */
router.get('/expense-summary', getExpenseSummary);

/**
 * @swagger
 * /api/insights/profit-summary:
 *   get:
 *     operationId: get_profit_summary
 *     summary: Net profit and loss summary for a period
 *     description: Combines revenue (from paid invoices) and expenses to compute gross profit, profit margin, and expense ratio. Use this when the user asks about profit, net earnings, or financial performance.
 *     tags: [Insights]
 *     parameters:
 *       - in: query
 *         name: start_date
 *         schema: { type: string, format: date }
 *         description: Period start (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         schema: { type: string, format: date }
 *         description: Period end (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Profit and loss summary with margin percentages
 */
router.get('/profit-summary', getProfitSummary);

/**
 * @swagger
 * /api/insights/client-overview:
 *   get:
 *     operationId: get_client_overview
 *     summary: Complete overview for a single client (hours + invoices + projects)
 *     description: Returns total hours worked, billable hours, invoice totals (paid/outstanding), and a list of projects for the given client. Use this when the user asks about a specific client's activity or revenue.
 *     tags: [Insights]
 *     parameters:
 *       - in: query
 *         name: client_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: The client UUID (required)
 *       - in: query
 *         name: start_date
 *         schema: { type: string, format: date }
 *         description: Period start (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         schema: { type: string, format: date }
 *         description: Period end (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Client overview with hours, invoices and projects
 *       400:
 *         description: client_id is required
 *       404:
 *         description: Client not found
 */
router.get('/client-overview', getClientOverview);

/**
 * @swagger
 * /api/insights/project-overview:
 *   get:
 *     operationId: get_project_overview
 *     summary: Complete overview for a single project (hours + budget + invoices + expenses)
 *     description: Returns hours tracked, budget usage percentage, billable value, invoice totals and total expenses for the given project. Use this when the user asks about a specific project's status or profitability.
 *     tags: [Insights]
 *     parameters:
 *       - in: query
 *         name: project_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: The project UUID (required)
 *       - in: query
 *         name: start_date
 *         schema: { type: string, format: date }
 *         description: Period start (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         schema: { type: string, format: date }
 *         description: Period end (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Project overview with hours, budget, invoices and expenses
 *       400:
 *         description: project_id is required
 *       404:
 *         description: Project not found
 */
router.get('/project-overview', getProjectOverview);

export default router;
