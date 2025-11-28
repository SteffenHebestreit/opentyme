/**
 * @fileoverview User Initialization Service
 * 
 * Handles initialization tasks when a new user is created:
 * - Create MinIO bucket for user storage
 * - Set up default user preferences
 * - Initialize user-specific resources
 * - Send welcome email (future)
 * 
 * @module services/auth/user-initialization
 */

import { minioService } from '../storage/minio.service';
import { logger } from '../../utils/logger';

/**
 * User Initialization Service
 * Handles all setup tasks for new users
 */
export class UserInitializationService {
  /**
   * Initialize a new user account
   * Creates all necessary resources for the user
   * 
   * @param {string} userId - User ID from Keycloak
   * @param {string} email - User email
   * @param {string} username - Username
   * @returns {Promise<void>}
   */
  async initializeUser(userId: string, email: string, username: string): Promise<void> {
    try {
      logger.info(`[UserInit] Initializing user: ${username} (${userId})`);

      // 1. Create MinIO bucket for user storage
      await this.createUserBucket(userId);

      // 2. Initialize user preferences (future enhancement)
      // await this.createUserPreferences(userId);

      // 3. Send welcome email (future enhancement)
      // await this.sendWelcomeEmail(email, username);

      logger.info(`[UserInit] Successfully initialized user: ${username}`);
    } catch (error) {
      logger.error(`[UserInit] Error initializing user ${username}:`, error);
      // Don't throw - initialization errors shouldn't block user creation
      // User can still use the system, bucket will be created on first upload
    }
  }

  /**
   * Create MinIO bucket for user
   * Bucket will be created lazily if this fails
   * 
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  private async createUserBucket(userId: string): Promise<void> {
    try {
      // Upload a small welcome file to trigger bucket creation
      const welcomeMessage = `Welcome to tyme!

This is your personal storage space. Your files are organized in the following categories:

- receipts/    - Expense receipts and attachments
- logos/       - Company and client logos  
- documents/   - General documents and files
- invoices/    - Generated invoice PDFs
- exports/     - Report exports and backups

All files are private and encrypted. Only you can access them.

For support, visit: https://tyme.example.com/support
`;

      await minioService.uploadFile(
        userId,
        Buffer.from(welcomeMessage, 'utf-8'),
        'welcome.txt',
        'text/plain',
        'documents'
      );

      logger.info(`[UserInit] Created MinIO bucket for user: ${userId}`);
    } catch (error) {
      logger.error(`[UserInit] Error creating bucket for user ${userId}:`, error);
      // Bucket will be created lazily on first real upload
      throw error;
    }
  }

  /**
   * Initialize all existing Keycloak users
   * Called on system startup or manually triggered
   * 
   * @param {Array<{id: string, email: string, username: string}>} users - List of users
   * @returns {Promise<{success: number, failed: number}>} Initialization results
   */
  async initializeExistingUsers(
    users: Array<{ id: string; email: string; username: string }>
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    logger.info(`[UserInit] Starting initialization of ${users.length} existing users`);

    for (const user of users) {
      try {
        await this.initializeUser(user.id, user.email, user.username);
        success++;
      } catch (error) {
        logger.error(`[UserInit] Failed to initialize user ${user.username}:`, error);
        failed++;
      }
    }

    logger.info(`[UserInit] Initialization complete: ${success} success, ${failed} failed`);

    return { success, failed };
  }

  /**
   * Check if user has been initialized
   * Checks if user bucket exists
   * 
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} True if initialized
   */
  async isUserInitialized(userId: string): Promise<boolean> {
    try {
      // Try to list files in user bucket
      await minioService.listUserFiles(userId);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Cleanup user resources
   * Called when user is deleted (GDPR right to be forgotten)
   * 
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async cleanupUser(userId: string): Promise<void> {
    try {
      logger.info(`[UserInit] Cleaning up user resources: ${userId}`);

      // Delete user bucket and all files
      await minioService.deleteUserBucket(userId);

      // Future: Delete user preferences, cache, etc.

      logger.info(`[UserInit] Successfully cleaned up user: ${userId}`);
    } catch (error) {
      logger.error(`[UserInit] Error cleaning up user ${userId}:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export const userInitializationService = new UserInitializationService();
