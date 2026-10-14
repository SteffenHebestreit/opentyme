import { Router, Request, Response } from 'express';
import { UserController } from '../../controllers/auth/auth.controller';
import { authenticateKeycloak, extractKeycloakUser, invalidateTokenCache } from '../../middleware/auth/keycloak.middleware';
import { authRateLimiter } from '../../middleware/rate-limit.middleware';
import { logger } from '../../utils/logger';

const router = Router();
const userController = new UserController();

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 example: testuser
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 example: password123
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error or bad request
 *       409:
 *         description: Username or email already exists
 */
router.post('/register', authRateLimiter, userController.register.bind(userController));

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: User login
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 example: password123
 *     responses:
 *       200:
 *         description: Login successful, returns JWT token
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', authRateLimiter, userController.login.bind(userController));

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Log out the current user
 *     description: Evicts the caller's access token from the server-side introspection cache so it can no longer be served from cache. The client is still responsible for ending the Keycloak session and discarding its tokens.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout acknowledged
 */
router.post('/logout', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const evicted = invalidateTokenCache(token);
    logger.info(`[Auth] Logout processed; token cache ${evicted ? 'evicted' : 'had no entry'}`);
  }
  res.status(200).json({ message: 'Logged out successfully' });
});

/**
 * @openapi
 * /api/auth/profile/me:
 *   get:
 *     tags:
 *       - User Profile
 *     summary: Get current user's profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully fetched user profile
 *       401:
 *         description: Unauthorized or token missing/invalid
 */
router.get('/profile/me', authenticateKeycloak, extractKeycloakUser, userController.getMyProfile.bind(userController));

export default router;
