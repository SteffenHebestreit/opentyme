/**
 * Addon Routes
 * 
 * Define all HTTP routes for the addon.
 * Routes are mounted at the prefix defined in addon-manifest.json.
 */

import { Router } from 'express';
import { exampleController } from '../controllers/example.controller';

const router = Router();

// Note: Authentication middleware is applied by OpenTYME's plugin loader
// You can add additional middleware here if needed

/**
 * GET /api/addons/example/data
 * Get user's data
 */
router.get('/data', exampleController.getData.bind(exampleController));

/**
 * POST /api/addons/example/process
 * Process data
 */
router.post('/process', exampleController.processData.bind(exampleController));

/**
 * GET /api/addons/example/status
 * Get addon status
 */
router.get('/status', exampleController.getStatus.bind(exampleController));

export default router;
