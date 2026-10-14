import { Request, Response } from 'express';
import { apiTokenService } from '../../services/auth/api-token.service';
import { keycloakService } from '../../services/keycloak.service';
import { EmailService } from '../../services/external/email.service';
import { apiTokenIdSchema } from '../../schemas/auth/api-token.schema';
import { logger } from '../../utils/logger';

/**
 * Administrators' view of all users' API tokens (/api/system/api-tokens):
 * who has which token, what it may do, when it was last used — and revoking
 * any of them, e.g. when a user left or a token leaked.
 */
export class ApiTokenAdminController {
  constructor(private readonly emailService: EmailService = new EmailService()) {}

  async list(_req: Request, res: Response): Promise<void> {
    try {
      const [tokens, users] = await Promise.all([apiTokenService.listAll(), keycloakService.getAllUsers(1000)]);
      const owners = new Map(users.map((u: any) => [u.id, { username: u.username ?? null, email: u.email ?? null }]));
      res.json({
        tokens: tokens.map((token) => ({ ...token, owner: owners.get(token.user_id) ?? { username: null, email: null } })),
      });
    } catch (err: any) {
      logger.error('List all API tokens error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async revoke(req: Request, res: Response): Promise<void> {
    const { error, value: id } = apiTokenIdSchema.validate(req.params.id);
    if (error) {
      res.status(400).json({ message: 'Invalid token id' });
      return;
    }
    const admin = req.user?.username || req.user?.email || req.user!.id;
    try {
      const revoked = await apiTokenService.revokeAsAdmin(id, admin, { ip: req.ip, userAgent: req.get('user-agent') });
      if (!revoked) {
        res.status(404).json({ message: 'Token not found' });
        return;
      }
      logger.info(`[ApiToken] Administrator ${admin} revoked token ${id} of user ${revoked.userId}`);
      void this.notifyOwner(revoked.userId, revoked.name, admin);
      res.json({ message: 'Token revoked' });
    } catch (err: any) {
      logger.error('Admin revoke API token error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  /** The owner learns why their integration stopped working. Best effort. */
  private async notifyOwner(userId: string, tokenName: string, admin: string): Promise<void> {
    try {
      const owner = await keycloakService.findUserById(userId);
      if (!owner?.email) return;
      await this.emailService.sendNotificationEmail(
        owner.email,
        `OpenTyme: your API token "${tokenName}" was revoked`,
        `An administrator (${admin}) revoked your API token "${tokenName}". Anything that used it no longer has access. ` +
          'Create a new token under Configuration → API tokens if you still need one.'
      );
    } catch (error: any) {
      logger.warn(`[ApiToken] Could not tell ${userId} about the revoked token: ${error.message}`);
    }
  }
}
