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
import { checkPermission, isDirectWrite, requirementFor } from '../../services/auth/api-token-permissions';
import { refuseScope, setBearerChallenge } from './token-permission';
import { logger } from '../../utils/logger';
import { apiTokenRateLimiter } from '../rate-limit.middleware';

function challenge(res: Response, status: number, error: string, description: string): void {
  setBearerChallenge(res, { error, error_description: description });
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

  // Record use before any refusal, so probing with a stolen token shows up in
  // the activity log too. The assistant's and the MCP server's own tool calls
  // come back over loopback with the same token — that is not new use. The
  // socket address is checked, not req.ip: a forwarded-for header can't fake it.
  const ownToolCall = req.get(TOOL_CALL_HEADER) === '1' && isLoopback(req.socket.remoteAddress);
  if (!ownToolCall) apiTokenService.touch(token.id, req.ip, req.get('user-agent'));

  // The rate limit comes first, so refused requests count against it too.
  apiTokenRateLimiter(req, res, () => {
    const path = req.baseUrl + req.path;
    const check = checkPermission(token.permissions, requirementFor(req.method, path));
    if (!check.ok) {
      logger.warn(`[ApiToken] Token ${token.id} denied ${req.method} ${path}: needs ${check.missing}`);
      refuseScope(res, check.missing);
      return;
    }

    // "Approve in OpenTyme" is a boundary, not a preference: such a token
    // changes data only through the assistant, whose changes wait for the
    // owner's approval — never directly (REST, MCP write tools, email).
    if (token.approval_mode === 'in_app' && isDirectWrite(req.method, path)) {
      logger.warn(`[ApiToken] In-app-approval token ${token.id} refused direct ${req.method} ${path}`);
      res.status(403).json({
        error: 'Forbidden',
        code: 'APPROVAL_IN_APP',
        message:
          "This token's changes need its owner's approval in OpenTyme. Ask the OpenTyme assistant (POST /api/ai/run or A2A) to make them.",
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
