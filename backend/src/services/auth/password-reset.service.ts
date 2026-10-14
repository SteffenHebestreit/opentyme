/**
 * @fileoverview "Forgot password" for Keycloak accounts.
 *
 * The user asks for a link by email; we look the account up in Keycloak
 * (there is no users table), mail a one-hour, single-use link, and on reset
 * set the new password in Keycloak — which applies the realm's password
 * policy — then end the user's other sessions.
 *
 * Only a SHA-256 hash of each reset token is stored, so a database dump
 * cannot be used to reset anyone's password. One active token per user: a
 * new request replaces the previous link.
 *
 * @module services/auth/password-reset.service
 */

import crypto from 'crypto';
import { getDbClient } from '../../utils/database';
import { logger } from '../../utils/logger';
import { keycloakService } from '../keycloak.service';
import { EmailService } from '../external/email.service';

const TOKEN_TTL_MINUTES = 60;

function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export class InvalidResetTokenError extends Error {
  constructor() {
    super('Invalid or expired token.');
    this.name = 'InvalidResetTokenError';
  }
}

export class PasswordResetService {
  constructor(private readonly emailService: EmailService = new EmailService()) {}

  /**
   * Emails a reset link if an enabled account has this address. Says nothing
   * either way, so the endpoint can't be used to discover accounts.
   */
  async requestReset(email: string): Promise<void> {
    const user = await keycloakService.findUserByEmail(email);
    if (!user || user.enabled === false) {
      logger.info('[PasswordReset] Reset requested for an unknown or disabled address');
      return;
    }

    const token = crypto.randomBytes(32).toString('hex');
    await getDbClient().query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + make_interval(mins => $3))
       ON CONFLICT (user_id) DO UPDATE
         SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at, created_at = CURRENT_TIMESTAMP`,
      [user.id, hashResetToken(token), TOKEN_TTL_MINUTES]
    );

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
    await this.emailService.sendPasswordResetEmail(user.email, `${frontendUrl}/reset-password?token=${token}`);
    logger.info(`[PasswordReset] Reset link sent for user ${user.id}`);
  }

  /**
   * Sets the new password for the token's user. The link is used up
   * atomically; if Keycloak rejects the password it is restored, so the user
   * can correct it and resubmit with the same link.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const db = getDbClient();
    const tokenHash = hashResetToken(token);
    // Use the link up atomically, so two concurrent resets can't both pass…
    const { rows } = await db.query(
      `DELETE FROM password_reset_tokens WHERE token_hash = $1 AND expires_at > NOW() RETURNING user_id, expires_at`,
      [tokenHash]
    );
    if (!rows[0]) throw new InvalidResetTokenError();
    const userId: string = rows[0].user_id;

    try {
      await keycloakService.setUserPassword(userId, newPassword);
    } catch (error) {
      // …and give it back when the password was refused (or Keycloak failed),
      // so the user can correct it with the same link — unless a newer link
      // was requested meanwhile.
      await db
        .query(
          `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)
           ON CONFLICT (user_id) DO NOTHING`,
          [userId, tokenHash, rows[0].expires_at]
        )
        .catch((restoreError) => logger.error(`[PasswordReset] Could not restore the link for ${userId}: ${restoreError.message}`));
      throw error;
    }

    // Whoever may have had the old password is signed out.
    try {
      await keycloakService.logoutUser(userId);
    } catch (error: any) {
      logger.warn(`[PasswordReset] Password reset for ${userId}, but ending sessions failed: ${error.message}`);
    }
    logger.info(`[PasswordReset] Password reset for user ${userId}`);
  }
}
