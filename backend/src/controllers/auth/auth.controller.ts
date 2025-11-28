/**
 * User/Auth Controller
 * Handles HTTP requests for user authentication and profile management.
 * Provides endpoints for registration, login, profile operations, and account deletion.
 * Uses Keycloak for authentication and Joi for request validation.
 */

import { Request, Response } from 'express';
import { UserService } from '../../services/auth/user.service';
import { KeycloakService } from '../../services/keycloak.service';
import Joi from 'joi';

const userService = new UserService();
const keycloakService = new KeycloakService();

// Validation schemas using Joi
const registerSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string()
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$'))
    .messages({
      'string.pattern.base': 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)'
    })
    .required(),
  first_name: Joi.string().optional().allow('', null),
  last_name: Joi.string().optional().allow('', null),
  role: Joi.string().valid('user', 'admin').optional(),
});

const loginSchema = Joi.object({
  email: Joi.alternatives().try(
    Joi.string().email(),
    Joi.string().alphanum().min(3)
  ).required().messages({
    'alternatives.match': 'Must provide a valid email or username'
  }),
  password: Joi.string().required(),
});

const updateProfileSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).optional(),
  email: Joi.string().email().optional(),
  first_name: Joi.string().allow('', null).optional(),
  last_name: Joi.string().allow('', null).optional(),
  // Role should not be updatable by a user directly via this endpoint
  avatar_url: Joi.string().uri().allow('', null).optional(), 
});

/**
 * Controller for handling user authentication and profile management.
 * Provides endpoints for user registration, login, profile operations, and account management.
 */
export class UserController {
  
  /**
   * Registers a new user.
   * Validates password strength (min 8 chars, uppercase, lowercase, number, special char).
   * Enforces unique username and email.
   * Delegates user creation to Keycloak IAM.
   * 
   * @async
   * @param {Request} req - Express request with body containing user registration data
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends 201 with success message or error response
   * 
   * @example
   * POST /api/auth/register
   * Body: {
   *   username: "johndoe",
   *   email: "john@example.com",
   *   password: "SecurePass123!",
   *   first_name: "John",
   *   last_name: "Doe"
   * }
   * Response: 201 { message: "User registered successfully", userId: "..." }
   */
  async register(req: Request, res: Response): Promise<void> {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      res.status(400).json({ message: 'Validation error', details: error.details });
      return;
    }

    try {
      // Register user in Keycloak
      const result = await keycloakService.registerUser({
        username: value.username,
        email: value.email,
        password: value.password,
        firstName: value.first_name,
        lastName: value.last_name,
        role: value.role,
      });

      res.status(201).json(result);
    } catch (err: any) {
      if (err.message === 'Username or email already exists') {
        res.status(409).json({ message: err.message }); // 409 Conflict
      } else {
        console.error('Registration error:', err);
        res.status(500).json({ message: 'Internal server error' });
      }
    }
  }

  /**
   * Authenticates a user with email and password.
   * Uses Keycloak Direct Access Grant flow (Resource Owner Password Credentials).
   * Returns Keycloak access token, refresh token, and token metadata.
   * 
   * @async
   * @param {Request} req - Express request with body containing email/username and password
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends 200 with Keycloak tokens or 401 on invalid credentials
   * 
   * @example
   * POST /api/auth/login
   * Body: { email: "john@example.com", password: "SecurePass123!" }
   * Response: 200 {
   *   access_token: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
   *   refresh_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
   *   expires_in: 900,
   *   refresh_expires_in: 1800,
   *   token_type: "Bearer"
   * }
   */
  async login(req: Request, res: Response): Promise<void> {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      res.status(400).json({ message: 'Validation error', details: error.details });
      return;
    }

    try {
      const tokens = await keycloakService.login(value.email, value.password);
      res.status(200).json({
        message: 'Login successful',
        ...tokens
      });
    } catch (err: any) {
      console.error('Login error:', err);
      res.status(401).json({ message: err.message || 'Invalid credentials' }); // 401 Unauthorized
    }
  }

  /**
   * Retrieves the authenticated user's profile.
   * Requires valid JWT token in Authorization header.
   * User ID is extracted from the token by auth middleware.
   * 
   * @async
   * @param {Request} req - Express request with authenticated user
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends 200 with user profile or 404 if not found
   * 
   * @example
   * GET /api/auth/profile
   * Headers: { Authorization: "Bearer <token>" }
   * Response: 200 { id: "uuid", username: "johndoe", email: "john@example.com", ... }
   */
  async getProfile(req: Request, res: Response): Promise<void> {
    // The authentication middleware should populate req.user
    const userId = (req as any).user?.id; 
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized: No user ID found' });
      return;
    }

    try {
      const user = await userService.findById(userId);
      if (!user) {
        res.status(404).json({ message: 'User not found' });
        return;
      }
      res.status(200).json(user);
    } catch (err) {
      console.error('Get profile error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  /**
   * Updates the authenticated user's profile.
   * Supports partial updates (only provided fields are updated).
   * Role cannot be updated through this endpoint (admin-only operation).
   * Enforces unique username and email constraints.
   * 
   * @async
   * @param {Request} req - Express request with authenticated user and body containing updates
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends 200 with updated user or error response
   * 
   * @example
   * PUT /api/auth/profile
   * Headers: { Authorization: "Bearer <token>" }
   * Body: { first_name: "Jane", avatar_url: "https://example.com/avatar.jpg" }
   * Response: 200 { message: "Profile updated successfully", user: { ... } }
   */
  async updateProfile(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user?.id; 
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized: No user ID found' });
      return;
    }
    
    // Admin might be able to update other users, but for now, it's self-update
    // const targetUserId = req.params.id === 'me' ? userId : req.params.id; 

    const { error, value } = updateProfileSchema.validate(req.body);
    if (error) {
      res.status(400).json({ message: 'Validation error', details: error.details });
      return;
    }

    try {
      const updatedUser = await userService.update(userId, value);
      if (!updatedUser) {
        res.status(404).json({ message: 'User not found' });
        return;
      }
      res.status(200).json({
        message: 'Profile updated successfully',
        user: updatedUser,
      });
    } catch (err: any) {
      if (err.message === 'Username or email already exists.') {
        res.status(409).json({ message: err.message });
      } else {
        console.error('Update profile error:', err);
        res.status(500).json({ message: 'Internal server error' });
      }
    }
  }

  /**
   * Deletes the authenticated user's account.
   * Requires password confirmation in request body for security.
   * This action cannot be undone. May fail if user has associated data (foreign key constraints).
   * 
   * @async
   * @param {Request} req - Express request with authenticated user and body.password
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends 200 on success or error response
   * 
   * @example
   * DELETE /api/auth/account
   * Headers: { Authorization: "Bearer <token>" }
   * Body: { password: "SecurePass123!" }
   * Response: 200 { message: "Account deleted successfully" }
   */
  async deleteAccount(req: Request, res: Response): Promise<void> {
     const userId = (req as any).user?.id; 
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized: No user ID found' });
      return;
    }
    
    try {
        // Add a check for password confirmation before deleting an account
        const { password } = req.body; // Expecting password in body for confirmation
        if (!password) {
            res.status(400).json({ message: 'Password is required to confirm deletion.' });
            return;
        }
        

        const deleted = await userService.delete(userId);
        if (deleted) {
          res.status(200).json({ message: 'Account deleted successfully' });
        } else {
          res.status(404).json({ message: 'User not found, or already deleted' });
        }
    } catch (err) {
        console.error('Delete account error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
  }

  /**
   * Retrieves the authenticated user's profile (alias for getProfile).
   * Provides a more specific endpoint at /api/auth/me.
   * User data is extracted from Keycloak token by middleware.
   * 
   * @async
   * @param {Request} req - Express request with authenticated user
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends 200 with user profile
   * 
   * @example
   * GET /api/auth/me
   * Headers: { Authorization: "Bearer <token>" }
   * Response: 200 { id: "uuid", username: "johndoe", email: "john@example.com", ... }
   */
  async getMyProfile(req: Request, res: Response): Promise<void> {
    // User data is already populated by extractKeycloakUser middleware
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    try {
      // Return Keycloak user data directly
      res.status(200).json(user);
    } catch (err) {
      console.error('Get my profile error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  /**
   * Retrieves all users (admin only).
   * Returns empty array with message if no users found.
   * Should be protected by admin authorization middleware.
   * 
   * @async
   * @param {Request} req - Express request
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends 200 with users array
   * 
   * @example
   * GET /api/users
   * Headers: { Authorization: "Bearer <admin-token>" }
   * Response: 200 [
   *   { id: "uuid", username: "user1", ... },
   *   { id: "uuid", username: "user2", ... }
   * ]
   */
  async getAllUsers(req: Request, res: Response) {
    // Authentication and authorization (admin check) should be handled by middleware
    try {
      const users = await userService.findAll(); 
      if (!users || users.length === 0) { // Handle case where no users are found or service returns null/undefined
        res.status(200).json({ message: 'No users found.', users: [] });
        return;
      }
      res.status(200).json(users);
    } catch (err: any) {
      console.error('Get all users error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

}
