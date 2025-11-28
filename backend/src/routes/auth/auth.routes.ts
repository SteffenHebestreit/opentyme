import { Router } from 'express';
import { UserController } from '../../controllers/auth/auth.controller';
import { authenticateKeycloak, extractKeycloakUser, requireAdmin } from '../../middleware/auth/keycloak.middleware';

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
router.post('/register', userController.register.bind(userController));

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
router.post('/login', userController.login.bind(userController));

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

/**
 * @openapi
 * /api/auth/profile/{id}:
 *   get:
 *     tags:
 *       - User Profile (Admin)
 *     summary: Get a specific user's profile by ID (Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to fetch
 *     responses:
 *       200:
 *         description: Successfully fetched user profile (Admin)
 *       403:
 *         description: Forbidden (Not an admin or not authorized)
 *       404:
 *         description: User not found
 */
router.get('/profile/:id', authenticateKeycloak, extractKeycloakUser, requireAdmin, userController.getProfile.bind(userController));

/**
 * @openapi
 * /api/auth/profile/me:
 *   put:
 *     tags:
 *       - User Profile
 *     summary: Update current user's profile
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         description: Validation error or bad request
 */
router.put('/profile/me', authenticateKeycloak, extractKeycloakUser, userController.updateProfile.bind(userController));

/**
 * @openapi
 * /api/auth/profile/{id}:
 *   put:
 *     tags:
 *       - User Profile (Admin)
 *     summary: Update a specific user's profile by ID (Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to update
 *     responses:
 *       200:
 *         description: Profile updated successfully (Admin)
 *       403:
 *         description: Forbidden (Not an admin or not authorized)
 */
router.put('/profile/:id', authenticateKeycloak, extractKeycloakUser, requireAdmin, userController.updateProfile.bind(userController));

/**
 * @openapi
 * /api/auth/delete-account/me:
 *   delete:
 *     tags:
 *       - User Profile
 *     summary: Delete current user's account (requires password confirmation)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               password:
 *                 type: string
 *                 description: User's current password for confirmation
 *     responses:
 *       200:
 *         description: Account deleted successfully
 *       400:
 *         description: Bad request (e.g., missing password)
 *       401:
 *         description: Invalid password or unauthorized
 */
router.delete('/delete-account/me', authenticateKeycloak, extractKeycloakUser, userController.deleteAccount.bind(userController));

/**
 * @openapi
 * /api/auth/users/all:
 *   get:
 *     tags:
 *       - Admin
 *     summary: Get all users (Admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all users (Admin)
 *       403:
 *         description: Forbidden (Not an admin or not authorized)
 */
router.get('/users/all', authenticateKeycloak, extractKeycloakUser, requireAdmin, userController.getAllUsers.bind(userController));

export default router;
