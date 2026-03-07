/**
 * @fileoverview Settings Routes
 * API endpoints for user settings and company information management
 */

import { Router } from 'express';
import { getSettings, updateSettings, testSmtp } from '../../controllers/system/settings.controller';
import { authenticateKeycloak, extractKeycloakUser } from '../../middleware/auth/keycloak.middleware';

const router = Router();

// Apply Keycloak authentication to all routes
router.use(authenticateKeycloak);
router.use(extractKeycloakUser);

/**
 * @route   GET /api/settings
 * @desc    Get current user's settings
 * @access  Protected
 */
router.get('/', getSettings);

/**
 * @route   PUT /api/settings
 * @desc    Update current user's settings
 * @access  Protected
 */
router.put('/', updateSettings);

/**
 * @route   POST /api/settings/test-smtp
 * @desc    Send a test email to verify SMTP configuration
 * @access  Protected
 */
router.post('/test-smtp', testSmtp);

export default router;
