import { Router } from 'express';
import { PasswordResetController } from '../../controllers/auth/password-reset.controller';
import { PasswordResetService } from '../../services/auth/password-reset.service';
import { passwordResetRateLimiter } from '../../middleware/rate-limit.middleware';

const router = Router();
const passwordResetController = new PasswordResetController(new PasswordResetService());

router.post('/request', passwordResetRateLimiter, passwordResetController.requestPasswordReset);
router.post('/reset', passwordResetRateLimiter, passwordResetController.resetPassword);

export default router;
