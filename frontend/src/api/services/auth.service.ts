/**
 * Authentication Service
 * Handles all HTTP requests related to user authentication and profile management.
 * Provides functions for login, registration, and profile retrieval.
 * Manages JWT tokens for authenticated requests.
 */

import apiClient from './client';
import { User } from '../../store/AppContext'; // Import User type from AppContext
import { clearAuth } from '../../utils/auth'; // Import auth utility

/**
 * Login credentials interface.
 * Contains email and password for authentication.
 */
interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * Registration data interface.
 * Extends LoginCredentials with additional user information.
 */
interface RegisterData extends LoginCredentials {
  username: string; // Changed from 'name' to match backend API
}

/**
 * Authentication response interface.
 * Returned by login endpoint from Keycloak.
 * Contains Keycloak access token, refresh token, and token metadata.
 */
interface AuthResponse {
  message: string;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: string;
}

/**
 * Registration response interface.
 * Returned by register endpoint.
 */
interface RegisterResponse {
  message: string;
  userId: string;
}

/**
 * Authentication service providing user auth operations.
 * Handles login, registration, and profile retrieval with JWT token management.
 */
export const authService = {
  /**
   * Authenticates a user with email and password.
   * Returns JWT token (valid 24 hours) and user object on success.
   * Token should be stored and included in Authorization header for subsequent requests.
   * 
   * @async
   * @param {LoginCredentials} credentials - User email and password
   * @returns {Promise<AuthResponse>} User object and JWT token
   * @throws {Error} If credentials are invalid or server error occurs
   * 
   * @example
   * try {
   *   const { user, token } = await authService.login({
   *     email: 'john@example.com',
   *     password: 'SecurePass123!'
   *   });
   *   localStorage.setItem('token', token);
   *   console.log('Logged in as:', user.username);
   * } catch (error) {
   *   console.error('Login failed:', error);
   * }
   */
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const response = await apiClient.post('/auth/login', credentials);
      return response.data; // Expected structure: { user: User, token: string }
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  },

  /**
   * Registers a new user account via Keycloak.
   * Creates user with email, password, and username.
   * Password must meet strength requirements (min 8 chars, uppercase, lowercase, number, special char).
   * Returns success message and userId from Keycloak.
   * 
   * @async
   * @param {RegisterData} userData - Registration data (email, password, username)
   * @returns {Promise<RegisterResponse>} Success message and userId
   * @throws {Error} If email already exists, validation fails, or server error occurs
   * 
   * @example
   * try {
   *   const result = await authService.register({
   *     email: 'john@example.com',
   *     password: 'SecurePass123!',
   *     username: 'johndoe'
   *   });
   *   console.log('Registered:', result.message);
   * } catch (error) {
   *   console.error('Registration failed:', error);
   * }
   */
  async register(userData: RegisterData): Promise<RegisterResponse> {
    try {
      const response = await apiClient.post('/auth/register', userData);
      return response.data; // Expected structure: { message: string, userId: string }
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    }
  },

  /**
   * Retrieves the authenticated user's profile.
   * Requires valid JWT token in Authorization header.
   * 
   * @async
   * @returns {Promise<User>} User profile object
   * @throws {Error} If token is invalid/expired or server error occurs
   * 
   * @example
   * try {
   *   const user = await authService.getProfile();
   *   console.log('Profile:', user.email, user.role);
   * } catch (error) {
   *   console.error('Failed to fetch profile:', error);
   *   // Token may be expired, redirect to login
   * }
   */
  async getProfile(): Promise<User> {
    try {
      const response = await apiClient.get('/auth/profile/me');
      return response.data; // Expected structure: { user: User }
    } catch (error) {
      console.error('Fetching profile failed:', error);
      throw error;
    }
  },

  /**
   * Logs out the current user.
   * Clears authentication token and session data.
   * 
   * @async
   * @returns {Promise<void>} Resolves when logout is successful
   * 
   * @example
   * await authService.logout();
   * localStorage.removeItem('token');
   */
  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout');
      clearAuth(); // Use centralized auth utility
    } catch (error) {
      console.error('Logout failed:', error);
      clearAuth(); // Clear even if API call fails
      throw error;
    }
  },

  /**
   * Gets the currently authenticated user.
   * Alias for getProfile for compatibility.
   * 
   * @async
   * @returns {Promise<User>} User profile object
   * @throws {Error} If token is invalid/expired or server error occurs
   */
  async getCurrentUser(): Promise<User> {
    return this.getProfile();
  },

  /**
   * Initiates password reset process.
   * Sends password reset email to the provided email address.
   * 
   * @async
   * @param {string} email - Email address to send reset link to
   * @returns {Promise<void>} Resolves when reset email is sent
   * @throws {Error} If email is not found or server error occurs
   * 
   * @example
   * await authService.forgotPassword('user@example.com');
   */
  async forgotPassword(email: string): Promise<void> {
    try {
      await apiClient.post('/auth/forgot-password', { email });
    } catch (error) {
      console.error('Forgot password failed:', error);
      throw error;
    }
  },

  /**
   * Resets user password using reset token.
   * 
   * @async
   * @param {Object} data - Reset password data
   * @param {string} data.token - Password reset token from email
   * @param {string} data.password - New password
   * @returns {Promise<void>} Resolves when password is reset
   * @throws {Error} If token is invalid or server error occurs
   * 
   * @example
   * await authService.resetPassword({
   *   token: 'reset-token-from-email',
   *   password: 'NewSecurePass123!'
   * });
   */
  async resetPassword(data: { token: string; password: string }): Promise<void> {
    try {
      await apiClient.post('/auth/reset-password', data);
    } catch (error) {
      console.error('Reset password failed:', error);
      throw error;
    }
  },
};

export default authService;
