import { Router } from 'express';
import { ApiTokenAdminController } from '../../controllers/system/api-token-admin.controller';
import { authenticateKeycloak, extractKeycloakUser, requireAdmin } from '../../middleware/auth/keycloak.middleware';
import { requireInteractiveSession } from '../../middleware/auth/api-token.middleware';

const router = Router();
const controller = new ApiTokenAdminController();

// Administrators, signed in (tokens never reach /api/system anyway).
router.use(authenticateKeycloak, extractKeycloakUser, requireAdmin, requireInteractiveSession);

/** GET /api/system/api-tokens — all users' tokens with their owners. */
router.get('/', controller.list.bind(controller));

/** DELETE /api/system/api-tokens/:id — revoke any user's token; the owner is told by email. */
router.delete('/:id', controller.revoke.bind(controller));

export default router;
