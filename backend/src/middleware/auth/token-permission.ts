/**
 * @fileoverview Permission checks for API-token requests that controllers
 * call themselves — for what depends on the request body, not just its path.
 * Kept free of heavy imports (no Keycloak), so any controller can use it.
 *
 * @module middleware/auth/token-permission
 */

import { Request, Response } from 'express';
import { hasLevel, PermissionLevel, ResourceKey } from '../../services/auth/api-token-permissions';
import { logger } from '../../utils/logger';

/**
 * Sets an RFC 6750 `WWW-Authenticate: Bearer …` challenge. On the MCP route
 * it also carries `resource_metadata` (RFC 9728) — that is how OAuth MCP
 * clients find out where to authorize (set by routes/mcp/mcp.routes.ts).
 */
export function setBearerChallenge(res: Response, params: Record<string, string> = {}): void {
  const all: Record<string, string> = { realm: 'OpenTyme', ...params };
  if (typeof res.locals.resourceMetadata === 'string') all.resource_metadata = res.locals.resourceMetadata;
  const value = Object.entries(all)
    .map(([key, v]) => `${key}="${v.replace(/["\\]/g, '')}"`)
    .join(', ');
  res.set('WWW-Authenticate', `Bearer ${value}`);
}

/** 403 for a token that lacks `missing` ("invoices:write"), with the RFC 6750 hint. */
export function refuseScope(res: Response, missing: string): void {
  setBearerChallenge(res, { error: 'insufficient_scope', scope: missing });
  res.status(403).json({
    error: 'Forbidden',
    message: `This token does not allow this request (needs ${missing}).`,
    required: missing,
  });
}

/**
 * For permissions that depend on what a request touches, not just its path
 * (e.g. which PDFs an email attaches). Always true for a signed-in session;
 * for a token, true if it has every level — otherwise answers 403 exactly
 * like the path check and returns false.
 */
export function ensureTokenAllows(
  req: Request,
  res: Response,
  needs: Array<{ resource: ResourceKey; level: PermissionLevel }>
): boolean {
  const ctx = req.authContext;
  if (ctx?.method !== 'pat') return true;
  for (const need of needs) {
    if (!hasLevel(ctx.permissions.resources[need.resource], need.level)) {
      const missing = `${need.resource}:${need.level}`;
      logger.warn(`[ApiToken] Token ${ctx.tokenId} denied ${req.method} ${req.baseUrl}${req.path}: needs ${missing}`);
      refuseScope(res, missing);
      return false;
    }
  }
  return true;
}
