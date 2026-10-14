/**
 * User/Auth Controller
 * Handles HTTP requests for user authentication and profile management.
 * Provides endpoints for registration, login, profile operations, and account deletion.
 * Uses Keycloak for authentication and Joi for request validation.
 */

import { Request, Response } from 'express';
import { KeycloakService } from '../../services/keycloak.service';
import Joi from 'joi';
import { logger } from '../../utils/logger';

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
  // No `role`: registration is public, so it must never choose privileges
  // (it once accepted role: 'admin'). Unknown keys are rejected.
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

/**
 * Controller for handling user authentication and profile management.
 * Registration, login and the signed-in user's profile — all backed by Keycloak.
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
      });

      res.status(201).json(result);
    } catch (err: any) {
      if (err.message === 'Username or email already exists') {
        res.status(409).json({ message: err.message }); // 409 Conflict
      } else {
        logger.error('Registration error:', err);
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
      logger.error('Login error:', err);
      res.status(401).json({ message: err.message || 'Invalid credentials' }); // 401 Unauthorized
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
      logger.error('Get my profile error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
}
