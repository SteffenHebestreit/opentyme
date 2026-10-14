import { Request, Response, NextFunction } from 'express';
import { kcAdminClient } from '../../config/keycloak.config';
import axios from 'axios';
import crypto from 'crypto';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { logger } from '../../utils/logger';
import { isApiToken } from '../../services/auth/api-token.service';
import { authenticateApiToken } from './api-token.middleware';
import { setBearerChallenge } from './token-permission';

// Use the internal service URL for backend-to-Keycloak communication so
// token introspection does not depend on trusting the public certificate chain.
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://keycloak:8080';
const KEYCLOAK_PUBLIC_URL = process.env.KEYCLOAK_PUBLIC_URL;
const REALM = process.env.KEYCLOAK_REALM || 'tyme';
// Use admin service credentials for token introspection
const CLIENT_ID = process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'tyme-admin-service';
const CLIENT_SECRET = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET as string;
if (!CLIENT_SECRET) {
  throw new Error('KEYCLOAK_ADMIN_CLIENT_SECRET environment variable is required');
}

/**
 * Token introspection cache
 * Maps token -> { data, expiry }
 * Cache tokens for 2 minutes to limit window for stale role/permission data
 */
const tokenCache = new Map<string, { data: any; expiry: number }>();
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
let realmPublicKeyPemCache: string | null = null;

/**
 * Clean up expired cache entries every 5 minutes
 */
setInterval(() => {
  const now = Date.now();
  for (const [token, cached] of tokenCache.entries()) {
    if (cached.expiry < now) {
      tokenCache.delete(token);
    }
  }
}, 5 * 60 * 1000).unref(); // Clean up every 5 minutes; never keeps the process alive on its own

/**
 * Remove a token from the introspection cache.
 * Called on logout so a revoked session cannot continue to be served from cache
 * during the remainder of the cache TTL window.
 *
 * @param token - The raw access token to evict
 * @returns true if a cache entry was removed
 */
export function invalidateTokenCache(token: string): boolean {
  return tokenCache.delete(token);
}

/**
 * Headers that make Keycloak judge a token issued under its public URL.
 *
 * The browser gets its tokens from the public URL (issuer
 * https://auth.example/realms/x), but the backend asks Keycloak over the
 * internal URL. Keycloak checks the token's issuer against the URL it was
 * asked on, so it called every browser token inactive — and the old fallback
 * to a local signature check then accepted tokens even after sign-out.
 * Keycloak runs with KC_PROXY_HEADERS=xforwarded, so forwarded headers for
 * the public URL make it check against the right issuer.
 */
function introspectionHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (!KEYCLOAK_PUBLIC_URL) return headers;
  const issuer = (jwt.decode(token) as JwtPayload | null)?.iss;
  if (issuer !== `${KEYCLOAK_PUBLIC_URL.replace(/\/+$/, '')}/realms/${REALM}`) return headers;
  const url = new URL(KEYCLOAK_PUBLIC_URL);
  headers['X-Forwarded-Proto'] = url.protocol.replace(':', '');
  headers['X-Forwarded-Host'] = url.host;
  headers['X-Forwarded-Port'] = url.port || (url.protocol === 'https:' ? '443' : '80');
  return headers;
}

/**
 * Introspect token using Keycloak Admin API with caching
 */
async function introspectToken(token: string): Promise<any> {
  // Check cache first
  const cached = tokenCache.get(token);
  const now = Date.now();

  if (cached && cached.expiry > now) {
    logger.debug('[Keycloak] Token introspection cache hit');
    return cached.data;
  }

  // Cache miss or expired - introspect with Keycloak
  try {
    const response = await axios.post(
      `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token/introspect`,
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        token: token,
      }),
      { headers: introspectionHeaders(token) }
    );

    const data = response.data;

    // Cache the result if token is active
    if (data.active) {
      tokenCache.set(token, {
        data,
        expiry: now + CACHE_TTL_MS,
      });
      logger.debug('[Keycloak] Token introspection cached');
    }

    return data;
  } catch (error: any) {
    logger.error('[Keycloak] Token introspection error:', error.response?.data || error.message);
    throw new IntrospectionUnavailableError();
  }
}

class IntrospectionUnavailableError extends Error {
  constructor() {
    super('Failed to introspect token');
  }
}

function fingerprintToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 12);
}

async function getRealmPublicKeyPem(): Promise<string> {
  if (realmPublicKeyPemCache) {
    return realmPublicKeyPemCache;
  }

  const response = await axios.get(`${KEYCLOAK_URL}/realms/${REALM}`);
  const publicKey = response.data?.public_key;

  if (!publicKey) {
    throw new Error('Keycloak realm public key is missing');
  }

  realmPublicKeyPemCache = `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`;
  return realmPublicKeyPemCache;
}

async function verifyJwtLocally(token: string): Promise<any | null> {
  try {
    const publicKeyPem = await getRealmPublicKeyPem();
    const acceptedIssuers = [
      KEYCLOAK_PUBLIC_URL ? `${KEYCLOAK_PUBLIC_URL}/realms/${REALM}` : null,
      `${KEYCLOAK_URL}/realms/${REALM}`,
    ].filter(Boolean) as string[];
    const issuer = acceptedIssuers.length === 1
      ? acceptedIssuers[0]
      : acceptedIssuers as [string, ...string[]];

    const payload = jwt.verify(token, publicKeyPem, {
      algorithms: ['RS256'],
      issuer,
    }) as JwtPayload;

    return {
      active: true,
      ...payload,
    };
  } catch (error: any) {
    logger.error('[Keycloak] Local JWT verification error:', error.message);
    return null;
  }
}

/**
 * Keycloak's answer is final: "inactive" means expired, signed out or
 * revoked, and the token is refused. Only when Keycloak can't be asked at all
 * is the signature checked locally, so an outage doesn't sign everyone out
 * (sign-outs during the outage can't be seen then).
 */
async function validateToken(token: string): Promise<any> {
  try {
    const introspection = await introspectToken(token);
    return introspection?.active ? introspection : null;
  } catch (error) {
    if (!(error instanceof IntrospectionUnavailableError)) throw error;
    logger.warn('[Keycloak] Introspection unavailable, verifying the token signature locally', {
      tokenFingerprint: fingerprintToken(token),
    });
    return verifyJwtLocally(token);
  }
}

/**
 * Authenticate requests using Keycloak token validation
 * This middleware validates Bearer tokens using Keycloak token introspection
 */
export const authenticateKeycloak = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      setBearerChallenge(res);
      res.status(401).json({
        error: 'Unauthorized',
        message: 'No token provided'
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Personal access tokens carry their own prefix and never reach Keycloak.
    if (isApiToken(token)) {
      await authenticateApiToken(req, res, next, token);
      return;
    }

    // Introspect the token with Keycloak
    const tokenInfo = await validateToken(token);

    // Inactive, expired or unverifiable (validateToken returns null) — 401, so
    // clients know to sign in again rather than treating it as a permission problem.
    if (!tokenInfo?.active) {
      setBearerChallenge(res, { error: 'invalid_token' });
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Token is not active or has expired'
      });
      return;
    }

    // Token is valid - attach to request for later use
    req.kauth = {
      grant: {
        access_token: {
          token: token,
          content: tokenInfo
        }
      }
    };
    req.authContext = { method: 'session' };

    logger.info(`[Keycloak] Token validated for user: ${tokenInfo.preferred_username}`);
    next();
  } catch (error: any) {
    logger.error('[Keycloak] Authentication error:', error.message);
    res.status(403).json({
      error: 'Forbidden',
      message: 'Token validation failed'
    });
  }
};

/**
 * Extract Keycloak user information from validated token and add to req.user
 * This middleware should be used AFTER authenticateKeycloak
 * Uses Keycloak sub (subject) as the user ID - no database sync needed
 */
export const extractKeycloakUser = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const token = req.kauth?.grant?.access_token?.content;

    if (!token) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required. No valid token found.'
      });
      return;
    }

    // Extract user information from token
    // Use Keycloak sub (subject) as the user ID - this is used directly in all queries
    // No users table exists - Keycloak is the single source of truth
    req.user = {
      id: token.sub || '',
      keycloakId: token.sub || '',
      email: token.email || '',
      username: token.preferred_username || '',
      firstName: token.given_name,
      lastName: token.family_name,
      fullName: token.name,
      roles: token.realm_access?.roles || [],
      emailVerified: token.email_verified || false
    };

    logger.info(`[Keycloak] Authenticated user: ${req.user.username} (${req.user.email}) with roles: ${req.user.roles?.join(', ')}`);

    next();
  } catch (error) {
    logger.error('[Keycloak] Error extracting user from token:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to process authentication token'
    });
  }
};

/**
 * Require specific role(s) for route access
 * This is a higher-order function that returns middleware
 *
 * @param roles - Single role string or array of role strings (user must have at least one)
 * @returns Express middleware function
 *
 * @example
 * router.get('/admin', authenticateKeycloak, extractKeycloakUser, requireRole('admin'), handler);
 * router.get('/resource', authenticateKeycloak, extractKeycloakUser, requireRole(['admin', 'manager']), handler);
 */
export const requireRole = (roles: string | string[]) => {
  const requiredRoles = Array.isArray(roles) ? roles : [roles];

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
      return;
    }

    const userRoles = req.user.roles || [];
    const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));

    if (!hasRequiredRole) {
      logger.warn(`[Keycloak] Access denied for user ${req.user.username}. Required roles: ${requiredRoles.join(' or ')}, User roles: ${userRoles.join(', ')}`);

      res.status(403).json({
        error: 'Forbidden',
        message: `Access denied. Required role: ${requiredRoles.join(' or ')}`,
        requiredRoles,
        userRoles
      });
      return;
    }

    logger.info(`[Keycloak] Role check passed for user ${req.user.username}`);
    next();
  };
};

/**
 * Convenience middleware to require admin role
 *
 * @example
 * router.delete('/users/:id', authenticateKeycloak, extractKeycloakUser, requireAdmin, handler);
 */
export const requireAdmin = requireRole('admin');

/**
 * Convenience middleware to require manager role (or admin)
 *
 * @example
 * router.get('/team-reports', authenticateKeycloak, extractKeycloakUser, requireManager, handler);
 */
export const requireManager = requireRole(['admin', 'manager']);

/**
 * Middleware to check if user owns the resource
 * Compares req.user.id with a user_id parameter
 *
 * @param paramName - Name of the parameter to check (default: 'user_id')
 * @param allowAdmin - Whether admin users can bypass ownership check (default: true)
 *
 * @example
 * router.get('/users/:user_id/profile', authenticateKeycloak, extractKeycloakUser, requireOwnership('user_id'), handler);
 */
export const requireOwnership = (paramName: string = 'user_id', allowAdmin: boolean = true) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
      return;
    }

    // Admin bypass
    if (allowAdmin && req.user.roles?.includes('admin')) {
      logger.info(`[Keycloak] Admin bypass for ownership check: ${req.user.username}`);
      next();
      return;
    }

    // Check ownership
    const resourceUserId = req.params[paramName] || req.body[paramName] || req.query[paramName];

    if (!resourceUserId) {
      res.status(400).json({
        error: 'Bad Request',
        message: `Missing ${paramName} parameter for ownership verification`
      });
      return;
    }

    if (req.user.id !== resourceUserId && req.user.keycloakId !== resourceUserId) {
      logger.warn(`[Keycloak] Ownership check failed. User ${req.user.username} (${req.user.id}) attempted to access resource owned by ${resourceUserId}`);

      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to access this resource'
      });
      return;
    }

    logger.info(`[Keycloak] Ownership check passed for user ${req.user.username}`);
    next();
  };
};

/**
 * Optional authentication - allows both authenticated and anonymous access
 * Extracts user info if token is present, but doesn't fail if it's missing
 *
 * @example
 * router.get('/public-with-personalization', optionalAuth, handler);
 */
export const optionalAuth = (req: Request, res: Response, next: NextFunction): void => {
  // Try to extract user info if token is present
  const token = req.kauth?.grant?.access_token?.content;

  if (token) {
    try {
      req.user = {
        id: token.sub || '',
        keycloakId: token.sub || '',
        email: token.email || '',
        username: token.preferred_username || '',
        firstName: token.given_name,
        lastName: token.family_name,
        fullName: token.name,
        roles: token.realm_access?.roles || [],
        emailVerified: token.email_verified || false
      };
      logger.info(`[Keycloak] Optional auth: User identified as ${req.user.username}`);
    } catch (error) {
      logger.warn('[Keycloak] Optional auth: Failed to extract user, continuing as anonymous');
    }
  } else {
    logger.info('[Keycloak] Optional auth: No token present, continuing as anonymous');
  }

  next();
};

/**
 * Middleware to log authentication details (for debugging)
 * Use sparingly in production due to performance impact
 */
export const logAuthDetails = (req: Request, res: Response, next: NextFunction): void => {
  logger.debug('[Keycloak] Auth Details:');
  logger.debug(`  - Has kauth: ${!!req.kauth}`);
  logger.debug(`  - Has grant: ${!!req.kauth?.grant}`);
  logger.debug(`  - Has token: ${!!req.kauth?.grant?.access_token}`);
  logger.debug(`  - User: ${req.user?.username || 'anonymous'}`);
  logger.debug(`  - Roles: ${req.user?.roles?.join(', ') || 'none'}`);
  next();
};
