/**
 * @fileoverview System Initialization Routes
 * 
 * Routes for initializing users and system resources
 * - Initialize all users from Keycloak
 * - Initialize specific user
 * - Check initialization status
 * 
 * @module routes/system/initialization
 */

import { Router } from 'express';
import {
  initializeUsers,
  initializeUser,
  getUserInitializationStatus,
  getInitializationStats,
} from '../../controllers/system/initialization.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

const router = Router();

/**
 * All routes require authentication
 * Admin-only routes should add additional role check
 */
router.use(authenticateToken);

/**
 * Initialize all existing Keycloak users
 * POST /api/system/initialize-users
 * 
 * Creates MinIO buckets for all users in Keycloak
 * @security Admin only (add role check in production)
 */
router.post('/initialize-users', initializeUsers);

/**
 * Initialize a specific user
 * POST /api/system/initialize-user/:userId
 * 
 * Creates MinIO bucket for a specific user
 * @security Admin only (add role check in production)
 */
router.post('/initialize-user/:userId', initializeUser);

/**
 * Check user initialization status
 * GET /api/system/user-status/:userId
 * 
 * Check if user has been initialized (bucket exists)
 * @security Admin or owner
 */
router.get('/user-status/:userId', getUserInitializationStatus);

/**
 * Get initialization statistics
 * GET /api/system/initialization-stats
 * 
 * Get counts of initialized vs not-initialized users
 * @security Admin only
 */
router.get('/initialization-stats', getInitializationStats);

export default router;
