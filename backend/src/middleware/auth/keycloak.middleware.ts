/// <reference path="../../types/express.d.ts" />
import { Request, Response, NextFunction } from 'express';
import { kcAdminClient } from '../../config/keycloak.config';
import axios from 'axios';

// Use the public URL that matches the token issuer
const KEYCLOAK_URL = process.env.KEYCLOAK_PUBLIC_URL || 'http://auth.localhost';
const REALM = process.env.KEYCLOAK_REALM || 'tyme';
// Use admin service credentials for token introspection
const CLIENT_ID = process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'tyme-admin-service';
const CLIENT_SECRET = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET || 'admin-service-secret-change-in-production';

/**
 * Token introspection cache
 * Maps token -> { data, expiry }
 * Cache tokens for 5 minutes to reduce Keycloak load
 */
const tokenCache = new Map<string, { data: any; expiry: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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
}, 5 * 60 * 1000); // Clean up every 5 minutes

/**
 * Introspect token using Keycloak Admin API with caching
 */
async function introspectToken(token: string): Promise<any> {
  // Check cache first
  const cached = tokenCache.get(token);
  const now = Date.now();
  
  if (cached && cached.expiry > now) {
    console.debug('[Keycloak] Token introspection cache hit');
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
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const data = response.data;
    
    // Cache the result if token is active
    if (data.active) {
      tokenCache.set(token, {
        data,
        expiry: now + CACHE_TTL_MS,
      });
      console.debug('[Keycloak] Token introspection cached');
    }
    
    return data;
  } catch (error: any) {
    console.error('[Keycloak] Token introspection error:', error.response?.data || error.message);
    throw new Error('Failed to introspect token');
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
      res.status(401).json({ 
        error: 'Unauthorized',
        message: 'No token provided' 
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Introspect the token with Keycloak
    const tokenInfo = await introspectToken(token);

    // Check if token is active
    if (!tokenInfo.active) {
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

    console.info(`[Keycloak] Token validated for user: ${tokenInfo.preferred_username}`);
    next();
  } catch (error: any) {
    console.error('[Keycloak] Authentication error:', error.message);
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

    console.info(`[Keycloak] Authenticated user: ${req.user.username} (${req.user.email}) with roles: ${req.user.roles?.join(', ')}`);
    
    next();
  } catch (error) {
    console.error('[Keycloak] Error extracting user from token:', error);
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
      console.warn(`[Keycloak] Access denied for user ${req.user.username}. Required roles: ${requiredRoles.join(' or ')}, User roles: ${userRoles.join(', ')}`);
      
      res.status(403).json({ 
        error: 'Forbidden',
        message: `Access denied. Required role: ${requiredRoles.join(' or ')}`,
        requiredRoles,
        userRoles
      });
      return;
    }

    console.info(`[Keycloak] Role check passed for user ${req.user.username}`);
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
      console.info(`[Keycloak] Admin bypass for ownership check: ${req.user.username}`);
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
      console.warn(`[Keycloak] Ownership check failed. User ${req.user.username} (${req.user.id}) attempted to access resource owned by ${resourceUserId}`);
      
      res.status(403).json({ 
        error: 'Forbidden',
        message: 'You do not have permission to access this resource' 
      });
      return;
    }

    console.info(`[Keycloak] Ownership check passed for user ${req.user.username}`);
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
      console.info(`[Keycloak] Optional auth: User identified as ${req.user.username}`);
    } catch (error) {
      console.warn('[Keycloak] Optional auth: Failed to extract user, continuing as anonymous');
    }
  } else {
    console.info('[Keycloak] Optional auth: No token present, continuing as anonymous');
  }
  
  next();
};

/**
 * Middleware to log authentication details (for debugging)
 * Use sparingly in production due to performance impact
 */
export const logAuthDetails = (req: Request, res: Response, next: NextFunction): void => {
  console.debug('[Keycloak] Auth Details:');
  console.debug(`  - Has kauth: ${!!req.kauth}`);
  console.debug(`  - Has grant: ${!!req.kauth?.grant}`);
  console.debug(`  - Has token: ${!!req.kauth?.grant?.access_token}`);
  console.debug(`  - User: ${req.user?.username || 'anonymous'}`);
  console.debug(`  - Roles: ${req.user?.roles?.join(', ') || 'none'}`);
  next();
};
