/**
 * @fileoverview System Initialization Controller
 * 
 * Handles system-level operations:
 * - Initialize users from Keycloak realm
 * - Health checks with storage status
 * - System diagnostics
 * 
 * @module controllers/system/initialization
 */

import type { Request, Response } from 'express';
import { userInitializationService } from '../../services/auth/user-initialization.service';
import { keycloakService } from '../../services/keycloak.service';
import { logger } from '../../utils/logger';

/**
 * Initialize all existing Keycloak users
 * Creates MinIO buckets for users that don't have them yet
 * 
 * POST /api/system/initialize-users
 * 
 * @security Admin only
 */
export const initializeUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    logger.info('[System] Starting user initialization from Keycloak');

    // Get all users from Keycloak
    const keycloakUsers = await keycloakService.getAllUsers();

    if (!keycloakUsers || keycloakUsers.length === 0) {
      res.json({
        message: 'No users found in Keycloak',
        success: 0,
        failed: 0,
        total: 0,
      });
      return;
    }

    logger.info(`[System] Found ${keycloakUsers.length} users in Keycloak`);

    // Map to required format
    const users = keycloakUsers.map((user: any) => ({
      id: user.id,
      email: user.email || `${user.username}@example.com`,
      username: user.username || user.id,
    }));

    // Initialize all users
    const result = await userInitializationService.initializeExistingUsers(users);

    res.json({
      message: 'User initialization complete',
      success: result.success,
      failed: result.failed,
      total: keycloakUsers.length,
      details: {
        successRate: ((result.success / keycloakUsers.length) * 100).toFixed(2) + '%',
      },
    });
  } catch (error) {
    logger.error('[System] Error initializing users:', error);
    res.status(500).json({
      error: 'Failed to initialize users',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Initialize a specific user
 * Useful for manual initialization or retry
 * 
 * POST /api/system/initialize-user/:userId
 * 
 * @security Admin only
 */
export const initializeUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    logger.info(`[System] Initializing user: ${userId}`);

    // Get user details from Keycloak
    const keycloakUser = await keycloakService.getUserById(userId);

    if (!keycloakUser) {
      res.status(404).json({ error: 'User not found in Keycloak' });
      return;
    }

    // Initialize user
    await userInitializationService.initializeUser(
      keycloakUser.id!,
      keycloakUser.email || `${keycloakUser.username}@example.com`,
      keycloakUser.username || keycloakUser.id!
    );

    // Check if initialized
    const isInitialized = await userInitializationService.isUserInitialized(userId);

    res.json({
      message: 'User initialized successfully',
      userId,
      username: keycloakUser.username,
      initialized: isInitialized,
    });
  } catch (error) {
    logger.error(`[System] Error initializing user:`, error);
    res.status(500).json({
      error: 'Failed to initialize user',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Check user initialization status
 * 
 * GET /api/system/user-status/:userId
 * 
 * @security Admin only
 */
export const getUserInitializationStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { userId } = req.params;

    const isInitialized = await userInitializationService.isUserInitialized(userId);

    res.json({
      userId,
      initialized: isInitialized,
      bucketExists: isInitialized,
    });
  } catch (error) {
    logger.error('[System] Error checking user status:', error);
    res.status(500).json({
      error: 'Failed to check user status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get system initialization statistics
 * 
 * GET /api/system/initialization-stats
 * 
 * @security Admin only
 */
export const getInitializationStats = async (req: Request, res: Response): Promise<void> => {
  try {
    // Get all users from Keycloak
    const keycloakUsers = await keycloakService.getAllUsers();
    const totalUsers = keycloakUsers?.length || 0;

    // Check how many are initialized
    let initialized = 0;
    let notInitialized = 0;

    if (keycloakUsers) {
      for (const user of keycloakUsers) {
        const isInit = await userInitializationService.isUserInitialized(user.id!);
        if (isInit) {
          initialized++;
        } else {
          notInitialized++;
        }
      }
    }

    res.json({
      totalUsers,
      initialized,
      notInitialized,
      initializationRate: totalUsers > 0 ? ((initialized / totalUsers) * 100).toFixed(2) + '%' : '0%',
    });
  } catch (error) {
    logger.error('[System] Error getting initialization stats:', error);
    res.status(500).json({
      error: 'Failed to get initialization stats',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
