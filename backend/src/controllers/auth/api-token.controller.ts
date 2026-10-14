import { Request, Response } from 'express';
import { ApiTokenError, apiTokenService } from '../../services/auth/api-token.service';
import { permissionCatalog } from '../../services/auth/api-token-permissions';
import {
  apiTokenIdSchema,
  createApiTokenSchema,
  regenerateApiTokenSchema,
  updateApiTokenSchema,
} from '../../schemas/auth/api-token.schema';
import { logger } from '../../utils/logger';

/**
 * Controller for personal access tokens.
 * Every route except `current` requires an interactive session (see the
 * router), so a token can never manage tokens.
 *
 * @class ApiTokenController
 */
export class ApiTokenController {
  /**
   * Lists the user's tokens. Secrets are never returned.
   *
   * @example
   * GET /api/api-tokens
   * Response: 200 { tokens: [{ id, name, token_prefix, permissions, ... }] }
   */
  async list(req: Request, res: Response): Promise<void> {
    try {
      const tokens = await apiTokenService.list(req.user!.id);
      res.json({ tokens });
    } catch (err: any) {
      logger.error('List API tokens error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async get(req: Request, res: Response): Promise<void> {
    const id = this.validId(req, res);
    if (!id) return;
    try {
      const token = await apiTokenService.get(req.user!.id, id);
      if (!token) {
        res.status(404).json({ message: 'Token not found' });
        return;
      }
      res.json({ token });
    } catch (err: any) {
      logger.error('Get API token error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  /**
   * Creates a token. The response is the only time the secret is shown.
   *
   * @example
   * POST /api/api-tokens
   * Body: { name: "Claude Code", permissions: { resources: { time_entries: "write" }, capabilities: ["mcp"] }, expires_at: "2027-01-01T00:00:00Z" }
   * Response: 201 { token: { ... }, secret: "oty_pat_..." }
   */
  async create(req: Request, res: Response): Promise<void> {
    const { error, value } = createApiTokenSchema.validate(req.body, { abortEarly: false });
    if (error) {
      res.status(400).json({ message: 'Validation failed', details: error.details.map((d) => d.message).join(', ') });
      return;
    }
    try {
      const { token, secret } = await apiTokenService.create(req.user!.id, value);
      logger.info(`[ApiToken] User ${req.user!.id} created token ${token.id}`);
      res.status(201).json({ message: 'Token created', token, secret });
    } catch (err: any) {
      this.sendError(res, err, 'Create API token error:');
    }
  }

  async update(req: Request, res: Response): Promise<void> {
    const id = this.validId(req, res);
    if (!id) return;
    const { error, value } = updateApiTokenSchema.validate(req.body, { abortEarly: false });
    if (error) {
      res.status(400).json({ message: 'Validation failed', details: error.details.map((d) => d.message).join(', ') });
      return;
    }
    try {
      const token = await apiTokenService.update(req.user!.id, id, value);
      if (!token) {
        res.status(404).json({ message: 'Token not found' });
        return;
      }
      logger.info(`[ApiToken] User ${req.user!.id} updated token ${id}`);
      res.json({ message: 'Token updated', token });
    } catch (err: any) {
      this.sendError(res, err, 'Update API token error:');
    }
  }

  /**
   * Issues a new secret for an existing token; the old one stops working at
   * once. The only way to change the expiry.
   */
  async regenerate(req: Request, res: Response): Promise<void> {
    const id = this.validId(req, res);
    if (!id) return;
    const { error, value } = regenerateApiTokenSchema.validate(req.body, { abortEarly: false });
    if (error) {
      res.status(400).json({ message: 'Validation failed', details: error.details.map((d) => d.message).join(', ') });
      return;
    }
    try {
      const result = await apiTokenService.regenerate(req.user!.id, id, value.expires_at);
      if (!result) {
        res.status(404).json({ message: 'Token not found' });
        return;
      }
      logger.info(`[ApiToken] User ${req.user!.id} regenerated token ${id}`);
      res.json({ message: 'Token regenerated', token: result.token, secret: result.secret });
    } catch (err: any) {
      this.sendError(res, err, 'Regenerate API token error:');
    }
  }

  /** Revokes (deletes) a token. It stops working on the next request. */
  async remove(req: Request, res: Response): Promise<void> {
    const id = this.validId(req, res);
    if (!id) return;
    try {
      const deleted = await apiTokenService.remove(req.user!.id, id);
      if (!deleted) {
        res.status(404).json({ message: 'Token not found' });
        return;
      }
      logger.info(`[ApiToken] User ${req.user!.id} revoked token ${id}`);
      res.json({ message: 'Token revoked' });
    } catch (err: any) {
      logger.error('Revoke API token error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  /** The resources, levels and capabilities a token can be given. */
  catalog(_req: Request, res: Response): void {
    res.json(permissionCatalog());
  }

  /**
   * Describes the token the request was made with, so a client can check
   * what it may do. The only route here a token itself may call.
   */
  async current(req: Request, res: Response): Promise<void> {
    if (req.auth?.method !== 'pat') {
      res.status(400).json({ message: 'This request was not made with an API token.' });
      return;
    }
    try {
      const token = await apiTokenService.get(req.user!.id, req.auth.tokenId);
      if (!token) {
        res.status(404).json({ message: 'Token not found' });
        return;
      }
      const { id, name, permissions, approval_mode, expires_at, created_at } = token;
      res.json({
        token: { id, name, permissions, approval_mode, expires_at, created_at },
        user: {
          id: req.user!.id,
          email: req.user!.email,
          username: req.user!.username,
          name: req.user!.fullName,
        },
      });
    } catch (err: any) {
      logger.error('Describe current API token error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  private validId(req: Request, res: Response): string | null {
    const { error, value } = apiTokenIdSchema.validate(req.params.id);
    if (error) {
      res.status(400).json({ message: 'Invalid token id' });
      return null;
    }
    return value;
  }

  private sendError(res: Response, err: any, context: string): void {
    if (err instanceof ApiTokenError) {
      res.status(409).json({ message: err.message, code: err.code });
      return;
    }
    logger.error(context, err);
    res.status(500).json({ message: 'Internal server error' });
  }
}
