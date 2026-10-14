import { Request, Response } from 'express';
import Joi from 'joi';
import {
  approveAuthorization,
  authorizationServerMetadata,
  AuthorizationRequest,
  denyAuthorization,
  exchangeCode,
  OAuthError,
  protectedResourceMetadata,
  registerClient,
  validateAuthorizationRequest,
} from '../../services/auth/oauth.service';
import { APPROVAL_MODES, CAPABILITY_KEYS, RESOURCE_KEYS, levelsFor } from '../../services/auth/api-token-permissions';
import { publicBaseUrl } from '../../utils/public-url';
import { logger } from '../../utils/logger';

/** RFC 6749 error body; optional `redirect` for errors the client must receive. */
function sendError(res: Response, error: unknown, context: string): void {
  if (error instanceof OAuthError) {
    const redirect = (error as OAuthError & { redirect?: string }).redirect;
    if (error.status === 401) res.set('WWW-Authenticate', 'Basic realm="OpenTyme"');
    res.status(error.status).json({ error: error.error, error_description: error.description, ...(redirect ? { redirect } : {}) });
    return;
  }
  logger.error(`[OAuth] ${context} failed:`, error);
  res.status(500).json({ error: 'server_error', error_description: 'Something went wrong.' });
}

/** What the user grants on the consent page — the same choices as for an API token. */
const grantSchema = Joi.object({
  permissions: Joi.object({
    resources: Joi.object(Object.fromEntries(RESOURCE_KEYS.map((k) => [k, Joi.string().valid(...levelsFor(k))]))).default({}),
    capabilities: Joi.array().items(Joi.string().valid(...CAPABILITY_KEYS)).unique().default([]),
  }).required(),
  approval_mode: Joi.string().valid(...APPROVAL_MODES).default('self'),
  expires_at: Joi.date().iso().greater('now').allow(null).required(),
});

export const oauthController = {
  authorizationServerMetadata(req: Request, res: Response): void {
    res.json(authorizationServerMetadata(publicBaseUrl(req)));
  },

  protectedResourceMetadata(req: Request, res: Response): void {
    res.json(protectedResourceMetadata(publicBaseUrl(req)));
  },

  /** POST /api/oauth/register — dynamic client registration (public). */
  async register(req: Request, res: Response): Promise<void> {
    try {
      res.status(201).json(await registerClient(req.body ?? {}));
    } catch (error) {
      sendError(res, error, 'Registration');
    }
  },

  /** GET /api/oauth/authorize/request — what the consent page shows (signed in). */
  async describeRequest(req: Request, res: Response): Promise<void> {
    try {
      const { client } = await validateAuthorizationRequest(req.query as AuthorizationRequest, publicBaseUrl(req));
      res.json({ client });
    } catch (error) {
      sendError(res, error, 'Authorization request');
    }
  },

  /** POST /api/oauth/authorize — the user approved (signed in). Answers where to send them. */
  async approve(req: Request, res: Response): Promise<void> {
    const { error, value } = grantSchema.validate(req.body?.grant, { abortEarly: false });
    if (error) {
      res.status(400).json({ error: 'invalid_request', error_description: error.details.map((d) => d.message).join(', ') });
      return;
    }
    try {
      res.json(await approveAuthorization(req.user!.id, req.body?.request ?? {}, value, publicBaseUrl(req)));
    } catch (err) {
      sendError(res, err, 'Approval');
    }
  },

  /** POST /api/oauth/authorize/deny — the user said no (signed in). */
  async deny(req: Request, res: Response): Promise<void> {
    try {
      res.json(await denyAuthorization(req.body?.request ?? {}, publicBaseUrl(req)));
    } catch (error) {
      sendError(res, error, 'Denial');
    }
  },

  /** POST /api/oauth/token — code + PKCE → access token (public). */
  async token(req: Request, res: Response): Promise<void> {
    res.set('Cache-Control', 'no-store');
    try {
      res.json(
        await exchangeCode(req.body ?? {}, req.get('authorization'), publicBaseUrl(req), {
          ip: req.ip,
          userAgent: req.get('user-agent'),
        })
      );
    } catch (error) {
      sendError(res, error, 'Token exchange');
    }
  },
};
