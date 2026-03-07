import { Router } from 'express';
import { sendEmail } from '../../controllers/communication/email-send.controller';
import { authenticateKeycloak, extractKeycloakUser } from '../../middleware/auth/keycloak.middleware';

const router = Router();

router.use(authenticateKeycloak);
router.use(extractKeycloakUser);

router.post('/send', sendEmail);

export default router;
