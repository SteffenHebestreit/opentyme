/**
 * Password Reset Controller
 * Handles HTTP requests for password reset functionality.
 * Provides endpoints for requesting a reset link and setting a new password.
 * Accounts live in Keycloak; links are single-use and expire after one hour.
 */

import { Request, Response } from 'express';
import { InvalidResetTokenError, PasswordResetService } from '../../services/auth/password-reset.service';
import { PasswordRejectedError } from '../../services/keycloak.service';
import { logger } from '../../utils/logger';

/** The same answer whether or not the address has an account. */
const LINK_SENT_MESSAGE =
    'If your email address exists in our database, you will receive a password reset link shortly.';

/**
 * Controller for handling password reset operations.
 */
export class PasswordResetController {
    constructor(private readonly passwordResetService: PasswordResetService) {}

    /**
     * Emails a reset link to the account with this address, if there is one.
     *
     * @example
     * POST /api/password-reset/request
     * Body: { email: "user@example.com" }
     * Response: 200 { message: "If your email address exists ..." }
     */
    requestPasswordReset = async (req: Request, res: Response): Promise<void> => {
        const { email } = req.body ?? {};
        if (typeof email !== 'string' || !email.trim()) {
            res.status(400).json({ message: 'Email is required.' });
            return;
        }

        try {
            await this.passwordResetService.requestReset(email.trim());
            res.status(200).json({ message: LINK_SENT_MESSAGE });
        } catch (error) {
            logger.error('Error requesting password reset:', error);
            res.status(500).json({ message: 'An internal server error occurred. Please try again later.' });
        }
    };

    /**
     * Sets a new password using the token from the emailed link.
     *
     * @example
     * POST /api/password-reset/reset
     * Body: { token: "...", newPassword: "..." }
     * Response: 200 { message: "Password has been successfully reset. ..." }
     */
    resetPassword = async (req: Request, res: Response): Promise<void> => {
        const { token, newPassword } = req.body ?? {};
        if (typeof token !== 'string' || !token || typeof newPassword !== 'string' || !newPassword) {
            res.status(400).json({ message: 'Token and new password are required.' });
            return;
        }

        try {
            await this.passwordResetService.resetPassword(token, newPassword);
            res.status(200).json({
                message: 'Password has been successfully reset. You can now log in with your new password.',
            });
        } catch (error) {
            if (error instanceof InvalidResetTokenError) {
                res.status(400).json({ message: error.message });
            } else if (error instanceof PasswordRejectedError) {
                res.status(400).json({ message: error.message, code: 'PASSWORD_REJECTED' });
            } else {
                logger.error('Error resetting password:', error);
                res.status(500).json({ message: 'An internal server error occurred. Please try again later.' });
            }
        }
    };
}
