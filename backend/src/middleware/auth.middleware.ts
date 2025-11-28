/**
 * Authentication Middleware
 * Provides middleware functions for Keycloak token verification and role-based authorization.
 * Protects routes by validating Bearer tokens via Keycloak token introspection.
 */

import { Request, Response, NextFunction } from 'express';
import { keycloakService } from '../services/keycloak.service';

/**
 * Authenticates requests using Keycloak Bearer tokens.
 * Extracts token from Authorization header, verifies via Keycloak introspection,
 * and attaches user data to req.user for downstream handlers.
 * 
 * Token must be in format: "Bearer <token>"
 * Token is validated against Keycloak's introspection endpoint
 * 
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next function
 * @returns {Promise<void>} Calls next() on success, sends error response on failure
 * 
 * @example
 * // Protect a route with authentication
 * router.get('/profile', authenticateToken, userController.getProfile);
 * 
 * @example
 * // Access authenticated user in handler
 * async function getProfile(req: Request, res: Response) {
 *   const userId = req.user?.id;  // Keycloak user UUID
 *   const roles = req.user?.roles; // Array of realm roles
 * }
 */
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers['authorization'];
    // The token is sent in the format "Bearer TOKEN"
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      res.status(401).json({ message: 'Access token required' });
      return;
    }

    // Verify token with Keycloak
    const introspection = await keycloakService.verifyToken(token);

    if (!introspection || !introspection.active) {
      res.status(401).json({ message: 'Invalid or expired token' });
      return;
    }

    // Extract user info from introspection
    const userInfo = keycloakService.getUserInfoFromToken(introspection);

    if (!userInfo) {
      res.status(401).json({ message: 'Could not extract user information from token' });
      return;
    }

    // Attach user info to request
    req.user = {
      id: userInfo.id,
      email: userInfo.email,
      username: userInfo.username,
      firstName: userInfo.firstName,
      lastName: userInfo.lastName,
      name: userInfo.name,
      roles: userInfo.roles,
      role: userInfo.roles.includes('admin') ? 'admin' : 'user', // For backwards compatibility
    };

    console.log(`[Auth] ✅ User authenticated: ${userInfo.username} (${userInfo.id})`);
    next();
  } catch (error) {
    console.error('[Auth] ❌ Authentication error:', error);
    res.status(500).json({ message: 'An unexpected error occurred during authentication.' });
  }
};

/**
 * Requires admin role for route access.
 * Must be used after authenticateToken middleware.
 * Checks if authenticated user has 'admin' role.
 * 
 * @param {Request} req - Express request object with req.user populated by authenticateToken
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next function
 * @returns {void} Calls next() if user is admin, sends 403 otherwise
 * 
 * @example
 * // Protect admin-only route
 * router.get('/users', authenticateToken, requireAdmin, userController.getAllUsers);
 * 
 * @example
 * // Chain multiple middleware
 * router.delete('/system/backup', [authenticateToken, requireAdmin], backupController.deleteBackup);
 */
// Middleware for admin-only routes
export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
      res.status(401).json({ message: 'Authentication required' });
      return;
  }
  
  if (req.user.role !== 'admin') {
    res.status(403).json({ message: 'Access denied. Admin privileges required.' });
    return;
  }

  next();
};
