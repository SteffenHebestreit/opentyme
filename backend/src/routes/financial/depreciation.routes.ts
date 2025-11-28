/**
 * @fileoverview Depreciation Routes
 * API routes for depreciation reporting and asset management
 */

import { Router } from 'express';
import { authenticateKeycloak, extractKeycloakUser } from '../../middleware/auth/keycloak.middleware';
import {
  getDepreciationSummary,
  getAssetRegister,
  getDepreciationSchedule,
  getAssetDepreciation,
} from '../../controllers/financial/depreciation.controller';

const router = Router();

// All routes require authentication
router.use(authenticateKeycloak);
router.use(extractKeycloakUser);

/**
 * @route   GET /api/depreciation/summary
 * @desc    Get depreciation summary by year with category breakdown
 * @query   year - Optional year filter (defaults to current year)
 * @access  Protected
 */
router.get('/summary', getDepreciationSummary);

/**
 * @route   GET /api/depreciation/asset-register
 * @desc    Get complete asset register with depreciation details
 * @query   year - Optional year filter
 * @query   category - Optional category filter
 * @query   status - Optional status filter (active, fully_depreciated)
 * @access  Protected
 */
router.get('/asset-register', getAssetRegister);

/**
 * @route   GET /api/depreciation/schedule
 * @desc    Get future depreciation schedule (projected by year)
 * @query   years - Number of years to project (default: 5)
 * @access  Protected
 */
router.get('/schedule', getDepreciationSchedule);

/**
 * @route   GET /api/depreciation/asset/:id
 * @desc    Get detailed depreciation info for specific asset
 * @param   id - Expense ID
 * @access  Protected
 */
router.get('/asset/:id', getAssetDepreciation);

export default router;
