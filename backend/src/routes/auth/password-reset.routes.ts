import { Router } from 'express';
import { PasswordResetController } from '../../controllers/auth/password-reset.controller';
import { UserService } from '../../services/auth/user.service';
import { EmailService } from '../../services/external/email.service';

// These will be injected by the main app or a route-specific DI mechanism
let passwordResetController: PasswordResetController;

const router = Router();

// Initialize controller with services (this would ideally be handled by dependency injection)
// For now, we'll assume these are available globally or passed in somehow.
// A better approach is to have this initialized in the main index.ts and passed around.

// This is a simplified setup. In a larger app, you'd use proper DI.
const userService = new UserService(); // This should ideally be a singleton instance
const emailService = new EmailService();
passwordResetController = new PasswordResetController(userService, emailService);


router.post('/request', passwordResetController.requestPasswordReset);
router.post('/reset', passwordResetController.resetPassword);

export default router;
