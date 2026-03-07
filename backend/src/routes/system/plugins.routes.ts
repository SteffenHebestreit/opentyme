/**
 * Plugins Routes
 * 
 * API endpoints for plugin management
 */

import { Router } from 'express';
import { pluginsController } from '../../controllers/system/plugins.controller';
import { authenticateKeycloak, extractKeycloakUser } from '../../middleware/auth/keycloak.middleware';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateKeycloak);
router.use(extractKeycloakUser);

// Plugin management endpoints
router.get('/', pluginsController.listPlugins.bind(pluginsController));
router.get('/:name', pluginsController.getPlugin.bind(pluginsController));
router.post('/:name/enable', pluginsController.enablePlugin.bind(pluginsController));
router.post('/:name/disable', pluginsController.disablePlugin.bind(pluginsController));
router.get('/:name/settings', pluginsController.getPluginSettings.bind(pluginsController));
router.put('/:name/settings', pluginsController.updatePluginSettings.bind(pluginsController));

export default router;
