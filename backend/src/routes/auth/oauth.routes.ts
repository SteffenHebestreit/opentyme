import { Router } from 'express';
import { oauthController } from '../../controllers/auth/oauth.controller';
import { authenticateKeycloak, extractKeycloakUser } from '../../middleware/auth/keycloak.middleware';
import { requireInteractiveSession } from '../../middleware/auth/api-token.middleware';
import { oauthRegisterRateLimiter, oauthTokenRateLimiter } from '../../middleware/rate-limit.middleware';

/**
 * OAuth 2.1 for MCP clients (see services/auth/oauth.service.ts).
 * Registration and the token endpoint are public; the consent steps need a
 * signed-in person (never a token).
 */
const router = Router();

router.post('/register', oauthRegisterRateLimiter, oauthController.register);
router.post('/token', oauthTokenRateLimiter, oauthController.token);

const signedIn = [authenticateKeycloak, extractKeycloakUser, requireInteractiveSession];
router.get('/authorize/request', ...signedIn, oauthController.describeRequest);
router.post('/authorize', ...signedIn, oauthController.approve);
router.post('/authorize/deny', ...signedIn, oauthController.deny);

export default router;
