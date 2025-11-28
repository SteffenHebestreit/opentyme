/**
 * @fileoverview Analytics routes for dashboard charts and statistics.
 * 
 * Provides RESTful endpoints for:
 * - Time tracking trends
 * - Revenue analysis by client
 * - Billable hours ratio
 * - Project profitability
 * 
 * All routes require authentication.
 * 
 * @module routes/analytics
 */

import { Router } from 'express';
import { AnalyticsController } from '../../controllers/analytics/analytics.controller';
import { authenticateKeycloak, extractKeycloakUser } from '../../middleware/auth/keycloak.middleware';

const router = Router();
const analyticsController = new AnalyticsController();

// Apply authentication to all routes
router.use(authenticateKeycloak);
router.use(extractKeycloakUser);

/**
 * GET /api/analytics/time-trend
 * Get time tracking trend over specified days
 * Query params: days (30, 60, or 90)
 */
router.get('/time-trend', analyticsController.getTimeTrend.bind(analyticsController));

/**
 * GET /api/analytics/revenue-by-client
 * Get revenue by top clients
 * Query params: limit (1-20, default 10)
 */
router.get('/revenue-by-client', analyticsController.getRevenueByClient.bind(analyticsController));

/**
 * GET /api/analytics/billable-ratio
 * Get billable vs non-billable hours ratio
 * Query params: days (optional)
 */
router.get('/billable-ratio', analyticsController.getBillableRatio.bind(analyticsController));

/**
 * GET /api/analytics/project-profitability
 * Get project profitability analysis
 * Query params: limit (1-20, default 10)
 */
router.get('/project-profitability', analyticsController.getProjectProfitability.bind(analyticsController));

/**
 * GET /api/analytics/yearly-summary
 * Get yearly financial summary for dashboard
 * Query params: year (optional, defaults to current year)
 */
router.get('/yearly-summary', analyticsController.getYearlyFinancialSummary.bind(analyticsController));

export default router;
