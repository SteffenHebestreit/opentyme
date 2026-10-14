/**
 * @fileoverview OAuth 2.1 authorization server for MCP clients.
 *
 * Clients that only speak OAuth (e.g. claude.ai connectors) can't take a
 * pasted API token. They follow the MCP authorization spec instead:
 *   1. /api/mcp answers 401 with a pointer to the protected-resource
 *      metadata (RFC 9728), which names OpenTyme as authorization server;
 *   2. they read /.well-known/oauth-authorization-server (RFC 8414) and
 *      register themselves (RFC 7591);
 *   3. the user signs in at /oauth/authorize, sees who asks, and grants
 *      permissions exactly as for an API token (None/Read/Write/Delete…);
 *   4. the client exchanges the code (PKCE S256 required) for an access
 *      token — which is an ordinary API token with the MCP capability. It
 *      shows up in the user's token list with its client, is revocable, and
 *      passes every check any token passes.
 *
 * Codes are single-use, live ten minutes and are stored hashed. Client names
 * are self-declared, so the consent page also shows where the client will
 * send the user back. No refresh tokens: the access token lives as long as the
 * user chose, then the client asks again.
 *
 * @module services/auth/oauth.service
 */

import crypto from 'crypto';
import { getDbClient } from '../../utils/database';
import { logger } from '../../utils/logger';
import { ApiTokenPermissions, ApprovalMode, normalizePermissions } from './api-token-permissions';
import { apiTokenService, ApiTokenError, notifyTokenCreated } from './api-token.service';

const CODE_TTL_MINUTES = 10;
const MAX_REDIRECT_URIS = 10;
export const OAUTH_SCOPE = 'mcp';
const AUTH_METHODS = ['none', 'client_secret_post', 'client_secret_basic'] as const;
type AuthMethod = (typeof AUTH_METHODS)[number];

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');

/** An OAuth error the HTTP layer turns into the RFC 6749 shape. */
export class OAuthError extends Error {
  constructor(
    public readonly error: string,
    public readonly description: string,
    public readonly status = 400
  ) {
    super(description);
    this.name = 'OAuthError';
  }
}

export interface OAuthClient {
  id: string;
  name: string;
  redirect_uris: string[];
  token_endpoint_auth_method: AuthMethod;
  client_secret_hash: string | null;
}

// ── Metadata ─────────────────────────────────────────────────────────────────

/** RFC 8414 authorization server metadata. `base` = public origin, no trailing slash. */
export function authorizationServerMetadata(base: string) {
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    scopes_supported: [OAUTH_SCOPE],
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: [...AUTH_METHODS],
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${base}/api-docs`,
  };
}

/** RFC 9728 protected resource metadata for the MCP endpoint. */
export function protectedResourceMetadata(base: string) {
  return {
    resource: mcpResource(base),
    authorization_servers: [base],
    scopes_supported: [OAUTH_SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'OpenTyme MCP server',
    resource_documentation: `${base}/api-docs`,
  };
}

export const mcpResource = (base: string) => `${base}/api/mcp`;

/** The `resource` (RFC 8707) a client may name: the MCP endpoint, or the whole server. */
function checkResource(resource: unknown, base: string): string | null {
  if (resource === undefined || resource === null || resource === '') return null;
  const allowed = [mcpResource(base), base, `${base}/`];
  if (typeof resource !== 'string' || !allowed.includes(resource)) {
    throw new OAuthError('invalid_target', `Tokens from this server are only for ${mcpResource(base)}.`);
  }
  return resource;
}

// ── Registration (RFC 7591) ──────────────────────────────────────────────────

/** HTTPS, or http on the loopback interface for native apps (RFC 8252); never a fragment. */
function isAcceptableRedirectUri(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2000) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

export async function registerClient(body: Record<string, unknown>) {
  const uris = body.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > MAX_REDIRECT_URIS) {
    throw new OAuthError('invalid_redirect_uri', 'redirect_uris must list 1 to 10 URIs.');
  }
  if (!uris.every(isAcceptableRedirectUri)) {
    throw new OAuthError('invalid_redirect_uri', 'Redirect URIs must use https (or http on localhost) and have no fragment.');
  }
  const method = (body.token_endpoint_auth_method ?? 'none') as AuthMethod;
  if (!AUTH_METHODS.includes(method)) {
    throw new OAuthError('invalid_client_metadata', `token_endpoint_auth_method must be one of ${AUTH_METHODS.join(', ')}.`);
  }
  for (const [field, allowed] of [
    ['grant_types', 'authorization_code'],
    ['response_types', 'code'],
  ] as const) {
    const value = body[field];
    if (value !== undefined && (!Array.isArray(value) || value.some((v) => v !== allowed && v !== 'refresh_token'))) {
      throw new OAuthError('invalid_client_metadata', `Only ${allowed} is supported for ${field}.`);
    }
  }
  const name =
    typeof body.client_name === 'string' && body.client_name.trim() ? body.client_name.trim().slice(0, 100) : 'MCP client';

  const secret = method === 'none' ? null : randomToken();
  const { rows } = await getDbClient().query(
    `INSERT INTO oauth_clients (name, redirect_uris, token_endpoint_auth_method, client_secret_hash)
     VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
    [name, JSON.stringify(uris), method, secret ? sha256(secret) : null]
  );
  logger.info(`[OAuth] Registered client ${rows[0].id} ("${name}")`);
  return {
    client_id: rows[0].id as string,
    client_id_issued_at: Math.floor(new Date(rows[0].created_at).getTime() / 1000),
    client_name: name,
    redirect_uris: uris as string[],
    grant_types: ['authorization_code'],
    response_types: ['code'],
    token_endpoint_auth_method: method,
    scope: OAUTH_SCOPE,
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
  };
}

async function findClient(clientId: unknown): Promise<OAuthClient | null> {
  if (typeof clientId !== 'string' || !/^[0-9a-f-]{36}$/i.test(clientId)) return null;
  const { rows } = await getDbClient().query(
    'SELECT id, name, redirect_uris, token_endpoint_auth_method, client_secret_hash FROM oauth_clients WHERE id = $1',
    [clientId]
  );
  return rows[0] ?? null;
}

// ── Authorization ────────────────────────────────────────────────────────────

export interface AuthorizationRequest {
  response_type?: unknown;
  client_id?: unknown;
  redirect_uri?: unknown;
  code_challenge?: unknown;
  code_challenge_method?: unknown;
  state?: unknown;
  scope?: unknown;
  resource?: unknown;
}

/**
 * Checks an authorization request. A bad client or redirect URI is "fatal":
 * the user must not be sent anywhere (it could be an open redirect). Other
 * problems go back to the client as an error redirect.
 */
export async function validateAuthorizationRequest(params: AuthorizationRequest, base: string) {
  const client = await findClient(params.client_id);
  if (!client) throw new OAuthError('invalid_client', 'Unknown client.', 400);
  const redirectUri = params.redirect_uri ?? (client.redirect_uris.length === 1 ? client.redirect_uris[0] : undefined);
  if (typeof redirectUri !== 'string' || !client.redirect_uris.includes(redirectUri)) {
    throw new OAuthError('invalid_request', 'The redirect URI is not registered for this client.', 400);
  }
  const redirectError = (error: string, description: string) =>
    Object.assign(new OAuthError(error, description), { redirect: errorRedirect(redirectUri, error, description, params.state, base) });

  if (params.response_type !== 'code') throw redirectError('unsupported_response_type', 'Only response_type=code is supported.');
  if (typeof params.code_challenge !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(params.code_challenge)) {
    throw redirectError('invalid_request', 'PKCE is required: send a code_challenge.');
  }
  if (params.code_challenge_method !== 'S256') throw redirectError('invalid_request', 'code_challenge_method must be S256.');
  try {
    checkResource(params.resource, base);
  } catch (error) {
    if (error instanceof OAuthError) throw redirectError(error.error, error.description);
    throw error;
  }
  const redirectHost = new URL(redirectUri).host;
  return { client: { id: client.id, name: client.name, redirectHost }, redirectUri };
}

function errorRedirect(redirectUri: string, error: string, description: string, state: unknown, base: string): string {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', description);
  if (typeof state === 'string') url.searchParams.set('state', state);
  url.searchParams.set('iss', base);
  return url.toString();
}

export interface Grant {
  permissions: ApiTokenPermissions;
  approval_mode: ApprovalMode;
  expires_at: Date | null;
}

/** The user approved: store a single-use code and send them back with it. */
export async function approveAuthorization(userId: string, params: AuthorizationRequest, grant: Grant, base: string) {
  const { client, redirectUri } = await validateAuthorizationRequest(params, base);
  const tokens = await apiTokenService.list(userId);
  if (tokens.length >= 25) throw new OAuthError('access_denied', 'You already have the maximum number of API tokens.', 409);

  // MCP access is what the client asked for; the rest is the user's choice.
  const permissions = normalizePermissions({
    resources: grant.permissions.resources,
    capabilities: [...new Set([...(grant.permissions.capabilities ?? []), 'mcp' as const])],
  });
  const code = randomToken();
  const db = getDbClient();
  await db.query('DELETE FROM oauth_authorization_codes WHERE expires_at < NOW()');
  await db.query(
    `INSERT INTO oauth_authorization_codes
       (code_hash, client_id, user_id, redirect_uri, code_challenge, resource, permissions, approval_mode, token_expires_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW() + make_interval(mins => $10))`,
    [
      sha256(code),
      client.id,
      userId,
      redirectUri,
      params.code_challenge,
      typeof params.resource === 'string' ? params.resource : null,
      JSON.stringify(permissions),
      grant.approval_mode,
      grant.expires_at,
      CODE_TTL_MINUTES,
    ]
  );
  const url = new URL(redirectUri);
  url.searchParams.set('code', code);
  if (typeof params.state === 'string') url.searchParams.set('state', params.state);
  url.searchParams.set('iss', base);
  return { redirect: url.toString() };
}

/** The user said no: send them back with access_denied. */
export async function denyAuthorization(params: AuthorizationRequest, base: string) {
  const { redirectUri } = await validateAuthorizationRequest(params, base);
  return { redirect: errorRedirect(redirectUri, 'access_denied', 'The user denied access.', params.state, base) };
}

// ── Token endpoint ───────────────────────────────────────────────────────────

/** Client credentials from the body (client_secret_post) or a Basic header. */
function clientCredentials(body: Record<string, unknown>, authorization?: string) {
  if (authorization?.startsWith('Basic ')) {
    const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    const i = decoded.indexOf(':');
    if (i > 0) {
      return { id: decodeURIComponent(decoded.slice(0, i)), secret: decodeURIComponent(decoded.slice(i + 1)) };
    }
  }
  return {
    id: typeof body.client_id === 'string' ? body.client_id : undefined,
    secret: typeof body.client_secret === 'string' ? body.client_secret : undefined,
  };
}

export async function exchangeCode(
  body: Record<string, unknown>,
  authorization: string | undefined,
  base: string,
  actor: { ip?: string; userAgent?: string }
) {
  if (body.grant_type !== 'authorization_code') {
    throw new OAuthError('unsupported_grant_type', 'Only grant_type=authorization_code is supported.');
  }
  const credentials = clientCredentials(body, authorization);
  const client = await findClient(credentials.id);
  if (!client) throw new OAuthError('invalid_client', 'Unknown client.', 401);
  if (client.token_endpoint_auth_method !== 'none') {
    const ok =
      typeof credentials.secret === 'string' &&
      client.client_secret_hash !== null &&
      crypto.timingSafeEqual(Buffer.from(sha256(credentials.secret)), Buffer.from(client.client_secret_hash));
    if (!ok) throw new OAuthError('invalid_client', 'Client authentication failed.', 401);
  }
  if (typeof body.code !== 'string' || typeof body.code_verifier !== 'string') {
    throw new OAuthError('invalid_request', 'code and code_verifier are required.');
  }

  // Single use: the code is gone whether or not the rest checks out.
  const { rows } = await getDbClient().query(
    `DELETE FROM oauth_authorization_codes WHERE code_hash = $1 RETURNING *, expires_at > NOW() AS fresh`,
    [sha256(body.code)]
  );
  const grant = rows[0];
  if (!grant || !grant.fresh || grant.client_id !== client.id) {
    throw new OAuthError('invalid_grant', 'The code is invalid, expired or already used.');
  }
  if (body.redirect_uri !== undefined && body.redirect_uri !== grant.redirect_uri) {
    throw new OAuthError('invalid_grant', 'redirect_uri does not match the authorization request.');
  }
  const challenge = crypto.createHash('sha256').update(body.code_verifier).digest('base64url');
  if (challenge !== grant.code_challenge) throw new OAuthError('invalid_grant', 'PKCE verification failed.');
  const resource = checkResource(body.resource, base);
  if (resource && grant.resource && resource !== grant.resource) {
    throw new OAuthError('invalid_target', 'resource differs from the authorization request.');
  }

  const { token, secret } = await createUniquelyNamed(grant, client, actor);
  const expiresIn = token.expires_at ? Math.max(0, Math.floor((new Date(token.expires_at).getTime() - Date.now()) / 1000)) : undefined;
  logger.info(`[OAuth] Issued token ${token.id} to client ${client.id} for user ${grant.user_id}`);
  return {
    access_token: secret,
    token_type: 'Bearer',
    scope: OAUTH_SCOPE,
    ...(expiresIn !== undefined ? { expires_in: expiresIn } : {}),
  };
}

/** Names the token after its client — "Claude", "Claude (2)", … */
async function createUniquelyNamed(grant: any, client: OAuthClient, actor: { ip?: string; userAgent?: string }) {
  const base = client.name.slice(0, 90);
  for (let n = 1; n <= 20; n++) {
    try {
      const created = await apiTokenService.create(
        grant.user_id,
        {
          name: n === 1 ? base : `${base} (${n})`,
          description: null, // the token list labels OAuth tokens itself
          permissions: normalizePermissions(grant.permissions),
          approval_mode: grant.approval_mode,
          expires_at: grant.token_expires_at,
          oauth_client_id: client.id,
        },
        actor
      );
      const owner = await apiTokenService.resolveOwner(grant.user_id).catch(() => null);
      if (owner?.email) void notifyTokenCreated(owner.email, created.token, actor);
      return created;
    } catch (error) {
      if (error instanceof ApiTokenError && error.code === 'NAME_TAKEN') continue;
      if (error instanceof ApiTokenError) throw new OAuthError('invalid_grant', error.message);
      throw error;
    }
  }
  throw new OAuthError('invalid_grant', 'Could not name the token.');
}
