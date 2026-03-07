/**
 * @fileoverview Email Template Routes
 * CRUD API for MJML email templates.
 */

import { Router } from 'express';
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  previewTemplate,
  previewRawTemplate,
} from '../../controllers/communication/email-template.controller';
import { authenticateKeycloak, extractKeycloakUser } from '../../middleware/auth/keycloak.middleware';

const router = Router();

router.use(authenticateKeycloak);
router.use(extractKeycloakUser);

router.get('/', listTemplates);
// Must be before /:id routes so Express doesn't match 'preview' as an id
router.post('/preview', previewRawTemplate);
router.get('/:id', getTemplate);
router.post('/', createTemplate);
router.put('/:id', updateTemplate);
router.delete('/:id', deleteTemplate);
router.post('/:id/preview', previewTemplate);

export default router;
