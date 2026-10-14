/**
 * @fileoverview Authentication with personal access tokens.
 *
 * authenticateKeycloak hands every `Bearer oty_pat_…` request here. A valid
 * token produces the same req.kauth shape a Keycloak JWT does, so
 * extractKeycloakUser and every route behave exactly as for the signed-in
 * owner — except that the request must fit the token's permissions, which is
 * checked here, before any route runs.
 *
 * Failures follow RFC 6750 (WWW-Authenticate with invalid_token or
 * insufficient_scope), which MCP and other OAuth-aware clients act on.
 *
 * @module middleware/auth/api-token
 */

import { Request, Response, NextFunction } from 'express';
import { apiTokenService } from '../../services/auth/api-token.service';
import { isLoopback, TOOL_CALL_HEADER } from '../../services/auth/internal-call';
import { checkPermission, requirementFor } from '../../services/auth/api-token-permissions';
import { logger } from '../../utils/logger';
import { apiTokenRateLimiter } from '../rate-limit.middleware';

function challenge(res: Response, status: number, error: string, description: string): void {
  res.set('WWW-Authenticate', `Bearer realm="OpenTyme", error="${error}", error_description="${description}"`);
  res.status(status).json({ error: status === 401 ? 'Unauthorized' : 'Forbidden', message: description });
}

export async function authenticateApiToken(
  req: Request,
  res: Response,
  next: NextFunction,
  secret: string
): Promise<void> {
  let token;
  let owner;
  try {
    const lookup = await apiTokenService.lookup(secret);
    if (lookup.status !== 'ok') {
      challenge(
        res,
        401,
        'invalid_token',
        lookup.status === 'expired' ? 'The token has expired.' : 'The token is invalid or has been revoked.'
      );
      return;
    }
    token = lookup.token;
    owner = await apiTokenService.resolveOwner(token.user_id);
  } catch (error: any) {
    logger.error(`[ApiToken] Could not verify token: ${error.message}`);
    res.status(503).json({ error: 'Service Unavailable', message: 'Could not verify the token. Try again shortly.' });
    return;
  }

  if (!owner) {
    challenge(res, 401, 'invalid_token', 'The account that owns this token is disabled or no longer exists.');
    return;
  }

  req.authContext = {
    method: 'pat',
    tokenId: token.id,
    tokenName: token.name,
    permissions: token.permissions,
    approvalMode: token.approval_mode,
  };

  // The rate limit comes first, so refused requests count against it too.
  apiTokenRateLimiter(req, res, () => {
    const path = req.baseUrl + req.path;
    const check = checkPermission(token.permissions, requirementFor(req.method, path));
    if (!check.ok) {
      logger.warn(`[ApiToken] Token ${token.id} denied ${req.method} ${path}: needs ${check.missing}`);
      res.set('WWW-Authenticate', `Bearer realm="OpenTyme", error="insufficient_scope", scope="${check.missing}"`);
      res.status(403).json({
        error: 'Forbidden',
        message: `This token does not allow this request (needs ${check.missing}).`,
        required: check.missing,
      });
      return;
    }

    // Same claims a Keycloak access token carries. No realm roles: a token
    // never acts as an admin, whatever its owner may do when signed in.
    req.kauth = {
      grant: {
        access_token: {
          content: {
            active: true,
            sub: owner.id,
            email: owner.email,
            email_verified: owner.emailVerified,
            preferred_username: owner.username,
            given_name: owner.firstName,
            family_name: owner.lastName,
            name: [owner.firstName, owner.lastName].filter(Boolean).join(' ') || undefined,
            realm_access: { roles: [] },
          },
        },
      },
    };

    // The assistant's and the MCP server's own tool calls come back over
    // loopback with the same token — that is not new use of the token.
    const ownToolCall = req.get(TOOL_CALL_HEADER) === '1' && isLoopback(req.ip);
    if (!ownToolCall) apiTokenService.touch(token.id, req.ip, req.get('user-agent'));
    logger.debug(`[ApiToken] Token ${token.id} authorised ${req.method} ${path}`);
    next();
  });
}

/**
 * For routes only a signed-in person may use — above all token management,
 * so a token can never create or widen tokens. Use after authenticateKeycloak.
 */
export function requireInteractiveSession(req: Request, res: Response, next: NextFunction): void {
  if (req.authContext?.method === 'session') {
    next();
    return;
  }
  res.status(403).json({
    error: 'Forbidden',
    message: 'API tokens cannot manage API tokens. Sign in to OpenTyme to do this.',
  });
}
