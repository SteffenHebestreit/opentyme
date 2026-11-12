/**
 * @fileoverview Authentication of a workflow run's own calls into the API.
 *
 * authenticateKeycloak hands every `Bearer oty_wf_…` request here. Like a
 * personal access token, a valid credential produces the req.kauth shape a
 * Keycloak JWT does, so every route behaves as for the flow's owner — within
 * the permissions the flow was published with, checked here before any route
 * runs. Believed on loopback only: nobody outside the backend can present one.
 *
 * @module middleware/auth/workflow-credential
 */

import { Request, Response, NextFunction } from 'express';
import { apiTokenService } from '../../services/auth/api-token.service';
import { isLoopback } from '../../services/auth/internal-call';
import { checkPermission, requirementFor } from '../../services/auth/api-token-permissions';
import { verifyWorkflowCredential } from '../../services/workflow/workflow-credential';
import { refuseScope, setBearerChallenge } from './token-permission';
import { logger } from '../../utils/logger';

function refuse(res: Response, description: string): void {
  setBearerChallenge(res, { error: 'invalid_token', error_description: description });
  res.status(401).json({ error: 'Unauthorized', message: description });
}

export async function authenticateWorkflowCredential(
  req: Request,
  res: Response,
  next: NextFunction,
  secret: string
): Promise<void> {
  // The socket address, not req.ip: a forwarded-for header cannot fake it.
  const claims = isLoopback(req.socket.remoteAddress) ? verifyWorkflowCredential(secret) : null;
  if (!claims) {
    refuse(res, 'The credential is invalid or has expired.');
    return;
  }

  let owner;
  try {
    owner = await apiTokenService.resolveOwner(claims.userId);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.error(`[Workflow] Could not resolve the owner of run ${claims.runId}: ${reason}`);
    res.status(503).json({ error: 'Service Unavailable', message: 'Could not verify the credential. Try again shortly.' });
    return;
  }
  if (!owner) {
    refuse(res, 'The account that owns this flow is disabled or no longer exists.');
    return;
  }

  req.authContext = { method: 'workflow', runId: claims.runId, permissions: claims.permissions };

  const path = req.baseUrl + req.path;
  const check = checkPermission(claims.permissions, requirementFor(req.method, path));
  if (!check.ok) {
    logger.warn(`[Workflow] Run ${claims.runId} denied ${req.method} ${path}: needs ${check.missing}`);
    refuseScope(res, check.missing);
    return;
  }

  // Same claims a Keycloak access token carries. No realm roles: a flow never
  // acts as an admin, whatever its owner may do when signed in.
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
  next();
}
