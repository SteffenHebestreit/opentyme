/**
 * User Service
 * Handles all user-related business logic and database operations.
 * Provides authentication, user management, and password reset functionality.
 * Uses bcrypt for password hashing and JWT for token generation.
 */

import { getDbClient } from '../../utils/database';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  BaseUser,
  CreateUserDto,
  LoginDto,
  UpdateUserDto,
  User
} from '../../models/auth/user.model';

const JWT_SECRET = process.env.JWT_SECRET; // Use environment variable, no default

// Password reset token expires in 1 hour (in seconds)
const PASSWORD_RESET_TOKEN_EXPIRY_SECONDS = 3600; 

/**
 * Service for managing users and authentication.
 * Handles user CRUD operations, login/authentication, and password reset flows.
 */
export class UserService {
  
  /**
   * Creates a new user with hashed password.
   * Automatically hashes the password using bcrypt before storing.
   * Enforces unique constraints on username and email.
   * 
   * @async
   * @param {CreateUserDto} userData - User creation data
   * @returns {Promise<User>} The created user (without password_hash)
   * @throws {Error} If username or email already exists (unique constraint violation)
   * 
   * @example
   * const user = await userService.create({
   *   username: 'johndoe',
   *   email: 'john@example.com',
   *   password: 'securePassword123',
   *   first_name: 'John',
   *   last_name: 'Doe',
   *   role: 'user'
   * });
   */
  async create(userData: CreateUserDto): Promise<User> {
    const db = getDbClient();
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    
    const queryText = `
      INSERT INTO users (username, email, password_hash, first_name, last_name, role, avatar_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, username, email, first_name, last_name, role, avatar_url, created_at, updated_at
    `;
    const values = [
      userData.username,
      userData.email,
      hashedPassword,
      userData.first_name || null,
      userData.last_name || null,
      userData.role || 'user',
      userData.avatar_url || null,
    ];

    try {
      const result = await db.query(queryText, values);
      return result.rows[0] as User;
    } catch (error) {
        console.error('Error creating user:', error);
        // Check for unique constraint violation
        if ((error as any).code === '23505') { // PostgreSQL unique_violation code
            throw new Error('Username or email already exists.');
        }
        throw error; 
    }
  }

  /**
   * Retrieves a user by their ID.
   * Does not include password_hash in the returned user object.
   * 
   * @async
   * @param {string} id - UUID of the user
   * @returns {Promise<User | null>} The user if found, null otherwise
   * 
   * @example
   * const user = await userService.findById('123e4567-e89b-12d3-a456-426614174000');
   * if (user) {
   *   console.log(user.username, user.email);
   * }
   */
  async findById(id: string): Promise<User | null> {
    const db = getDbClient();
    const queryText = `SELECT id, username, email, first_name, last_name, role, avatar_url, created_at, updated_at FROM users WHERE id = $1`;
    const result = await db.query(queryText, [id]);
    
    if (result.rows.length === 0) return null;
    return result.rows[0] as User;
  }

  /**
   * Retrieves a user by their email address.
   * Includes password_hash for authentication purposes.
   * Should be used internally for login verification.
   * 
   * @async
   * @param {string} email - Email address of the user
   * @returns {Promise<User | null>} The user (including password_hash) if found, null otherwise
   * 
   * @example
   * const user = await userService.findByEmail('john@example.com');
   * if (user) {
   *   // User exists, can proceed with authentication
   * }
   */
  async findByEmail(email: string): Promise<User | null> {
    const db = getDbClient();
    // Return password_hash for authentication
    const queryText = `SELECT id, username, email, password_hash, first_name, last_name, role, avatar_url, created_at, updated_at FROM users WHERE email = $1`;
    const result = await db.query(queryText, [email]);
    
    if (result.rows.length === 0) return null;
    return result.rows[0] as User; // This will include password_hash
  }

  /**
   * Updates an existing user with partial data.
   * Only provided fields will be updated. Undefined fields are ignored.
   * Enforces unique constraints on username and email.
   * Role updates should be restricted to admin users only.
   * 
   * @async
   * @param {string} id - UUID of the user to update
   * @param {UpdateUserDto} userData - Partial user data to update
   * @returns {Promise<User | null>} The updated user if found, null otherwise
   * @throws {Error} If username or email already exists (unique constraint violation)
   * 
   * @example
   * const updated = await userService.update('uuid', {
   *   first_name: 'Jane',
   *   avatar_url: 'https://example.com/avatar.jpg'
   * });
   */
  async update(id: string, userData: UpdateUserDto): Promise<User | null> {
    const db = getDbClient();
    const setParts = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (userData.username) { setParts.push(`username = $${paramIndex++}`); values.push(userData.username); }
    if (userData.email !== undefined) { setParts.push(`email = $${paramIndex++}`); values.push(userData.email); } // Allow changing email to null
    if (userData.first_name !== undefined) { setParts.push(`first_name = $${paramIndex++}`); values.push(userData.first_name || null); }
    if (userData.last_name !== undefined) { setParts.push(`last_name = $${paramIndex++}`); values.push(userData.last_name || null); }
    // Role update should be handled carefully, typically admin only or restricted
    if (userData.role !== undefined) { setParts.push(`role = $${paramIndex++}`); values.push(userData.role); } 
    if (userData.avatar_url !== undefined) { setParts.push(`avatar_url = $${paramIndex++}`); values.push(userData.avatar_url || null); }

    if (setParts.length === 0) {
      // No fields to update
      return this.findById(id);
    }
    
    const queryText = `
      UPDATE users 
      SET ${setParts.join(', ')}, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $${paramIndex} RETURNING id, username, email, first_name, last_name, role, avatar_url, created_at, updated_at
    `;
    values.push(id);

    try {
        const result = await db.query(queryText, values);
        if (result.rows.length === 0) return null; // User not found
        return result.rows[0] as User;
    } catch (error) {
        console.error('Error updating user:', error);
         if ((error as any).code === '23505') { // PostgreSQL unique_violation code
            throw new Error('Username or email already exists.');
        }
        throw error; 
    }
  }

  /**
   * Retrieves all users from the database.
   * Returns users ordered by creation date (newest first).
   * Does not include password_hash in the returned user objects.
   * 
   * @async
   * @returns {Promise<User[]>} Array of all users
   * 
   * @example
   * const allUsers = await userService.findAll();
   * console.log(`Total users: ${allUsers.length}`);
   */
  async findAll(): Promise<User[]> {
    const db = getDbClient();
    const queryText = `SELECT id, username, email, first_name, last_name, role, avatar_url, created_at, updated_at FROM users ORDER BY created_at DESC`;
    const result = await db.query(queryText);
    return result.rows as User[];
  }

  /**
   * Deletes a user from the database.
   * This action cannot be undone. May fail if user has associated data (foreign key constraints).
   * 
   * @async
   * @param {string} id - UUID of the user to delete
   * @returns {Promise<boolean>} True if user was deleted, false if user not found
   * @throws {Error} If user has associated data preventing deletion
   * 
   * @example
   * const deleted = await userService.delete('uuid');
   * if (deleted) {
   *   console.log('User deleted successfully');
   * }
   */
  async delete(id: string): Promise<boolean> {
    const db = getDbClient();
    const queryText = `DELETE FROM users WHERE id = $1`;
    const result = await db.query(queryText, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Authenticates a user with email and password.
   * Verifies credentials using bcrypt and generates a JWT token on success.
   * Token expires in 24 hours and includes userId, email, and role.
   * 
   * @async
   * @param {LoginDto} loginData - Login credentials (email and password)
   * @returns {Promise<{message: string, token: string, user: Omit<User, "password_hash">}>} 
   *          Login response with JWT token and sanitized user object
   * @throws {Error} If credentials are invalid
   * 
   * @example
   * try {
   *   const result = await userService.login({
   *     email: 'john@example.com',
   *     password: 'securePassword123'
   *   });
   *   console.log('Token:', result.token);
   *   console.log('User:', result.user.username);
   * } catch (error) {
   *   console.error('Login failed:', error.message);
   * }
   */
  async login(loginData: LoginDto) {
    const db = getDbClient();
    const user = await this.findByEmail(loginData.email);
    
    if (!user || !(await bcrypt.compare(loginData.password, (user as any).password_hash))) { // Cast to access password_hash
      throw new Error('Invalid credentials');
    }
    
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role }, 
      JWT_SECRET!,
      { expiresIn: '24h' } // Token expires in 24 hours
    );

    return {
        message: 'Login successful',
        token,
        user: this.sanitizeUser(user) // Return user without password_hash
    };
  }

  /**
   * Removes sensitive data (password_hash) from user object.
   * Used internally to sanitize user data before sending to client.
   * 
   * @private
   * @param {User | any} user - User object potentially containing password_hash
   * @returns {Omit<User, "password_hash">} User object without password_hash
   */
  private sanitizeUser(user: User | any): Omit<User, "password_hash"> {
      const { password_hash, ...sanitizedUser } = user;
      return sanitizedUser;
  }

  /**
   * Saves a password reset token for a user.
   * Token expires in 1 hour. If user already has a token, it will be replaced.
   * Uses upsert pattern (INSERT ... ON CONFLICT DO UPDATE).
   * 
   * @async
   * @param {string} userId - UUID of the user
   * @param {string} token - Password reset token (should be cryptographically random)
   * @returns {Promise<void>}
   * 
   * @example
   * const resetToken = crypto.randomBytes(32).toString('hex');
   * await userService.savePasswordResetToken('user-uuid', resetToken);
   * // Send resetToken to user via email
   */
  async savePasswordResetToken(userId: string, token: string): Promise<void> {
    const db = getDbClient();
    const expiryTimestamp = new Date(Date.now() + PASSWORD_RESET_TOKEN_EXPIRY_SECONDS * 1000).toISOString();
    const queryText = `
        INSERT INTO password_reset_tokens (user_id, token, expires_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id) DO UPDATE
            SET token = EXCLUDED.token,
                expires_at = EXCLUDED.expires_at,
                created_at = CURRENT_TIMESTAMP
    `;
    await db.query(queryText, [userId, token, expiryTimestamp]);
  }

  /**
   * Finds a user by their password reset token.
   * Only returns user if token is valid and not expired.
   * Includes password_hash for subsequent password update.
   * 
   * @async
   * @param {string} token - Password reset token
   * @returns {Promise<User | null>} User if token is valid and not expired, null otherwise
   * 
   * @example
   * const user = await userService.findByResetToken(resetToken);
   * if (user) {
   *   // Token is valid, allow password reset
   * } else {
   *   // Token invalid or expired
   * }
   */
  async findByResetToken(token: string): Promise<User | null> {
      const db = getDbClient();
      // This query joins with password_reset_tokens and checks for validity and expiry
      // Using NOW() instead of CURRENT_TIMESTAMP for better pg-mem compatibility
      const queryText = `
          SELECT u.* 
          FROM users u
          JOIN password_reset_tokens prt ON u.id = prt.user_id
          WHERE prt.token = $1 AND prt.expires_at > NOW()
      `;
      const result = await db.query(queryText, [token]);

      if (result.rows.length === 0) return null;
      
      // We need the password_hash for updating it later, so don't sanitize here yet.
      return result.rows[0] as User; 
  }

  /**
   * Updates a user's password with a new hashed password.
   * Automatically hashes the new password using bcrypt before storing.
   * Should be called after validating the password reset token.
   * 
   * @async
   * @param {string} userId - UUID of the user
   * @param {string} newPassword - New plain-text password (will be hashed)
   * @returns {Promise<void>}
   * 
   * @example
   * await userService.updateUserPassword('user-uuid', 'newSecurePassword123');
   * await userService.clearPasswordResetToken('user-uuid');
   * console.log('Password updated successfully');
   */
  async updateUserPassword(userId: string, newPassword: string): Promise<void> {
    const db = getDbClient();
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const queryText = `UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`;
    await db.query(queryText, [hashedPassword, userId]);
  }

  /**
   * Clears the password reset token for a user.
   * Should be called after successful password reset to invalidate the token.
   * 
   * @async
   * @param {string} userId - UUID of the user
   * @returns {Promise<void>}
   * 
   * @example
   * await userService.updateUserPassword('user-uuid', 'newPassword');
   * await userService.clearPasswordResetToken('user-uuid');
   */
  async clearPasswordResetToken(userId: string): Promise<void> {
      const db = getDbClient();
      const queryText = `DELETE FROM password_reset_tokens WHERE user_id = $1`;
      await db.query(queryText, [userId]);
  }
}
