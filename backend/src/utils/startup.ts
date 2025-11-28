/**
 * @fileoverview Startup Initialization Script
 * 
 * Runs on application startup to initialize system resources
 * - Initialize existing Keycloak users (create buckets)
 * - Run database migrations
 * - Verify system health
 * 
 * @module utils/startup
 */

import { userInitializationService } from '../services/auth/user-initialization.service';
import { keycloakService } from '../services/keycloak.service';
import { logger } from './logger';
import { getDbClient } from './database';
import fs from 'fs';
import path from 'path';

/**
 * Initialize all existing users from Keycloak
 * Creates MinIO buckets for users who don't have them yet
 */
async function initializeExistingUsers(): Promise<void> {
  try {
    logger.info('[Startup] Starting user initialization...');

    // Get all users from Keycloak
    const users = await keycloakService.getAllUsers();

    if (!users || users.length === 0) {
      logger.info('[Startup] No users found in Keycloak, skipping initialization');
      return;
    }

    logger.info(`[Startup] Found ${users.length} users in Keycloak`);

    // Map to required format
    const usersToInit = users.map((user: any) => ({
      id: user.id,
      email: user.email || `${user.username}@example.com`,
      username: user.username || user.id,
    }));

    // Initialize users (this won't fail the startup even if some users fail)
    const result = await userInitializationService.initializeExistingUsers(usersToInit);

    logger.info(
      `[Startup] User initialization complete: ${result.success} succeeded, ${result.failed} failed`
    );
  } catch (error) {
    logger.error('[Startup] Error during user initialization:', error);
    // Don't throw - startup should continue even if initialization fails
    logger.warn('[Startup] User buckets will be created on-demand when users upload files');
  }
}

/**
 * Ensure backup system tables exist
 * Creates system_backups and system_backup_schedule tables if missing
 * This is critical after a database restore operation
 */
async function ensureBackupTablesExist(): Promise<void> {
  const db = getDbClient();
  
  try {
    logger.info('[Startup] Checking backup system tables...');

    // Check if tables exist
    const checkQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'system_backups'
      ) as backups_exists,
      EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'system_backup_schedule'
      ) as schedule_exists;
    `;
    
    const result = await db.query(checkQuery);
    const { backups_exists, schedule_exists } = result.rows[0];

    if (backups_exists && schedule_exists) {
      logger.info('[Startup] ✓ Backup system tables already exist');
      return;
    }

    logger.warn('[Startup] Backup system tables missing, creating them...');

    // Create system_backups table
    if (!backups_exists) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS system_backups (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          backup_name VARCHAR(255) NOT NULL,
          backup_type VARCHAR(50) NOT NULL CHECK (backup_type IN ('manual', 'scheduled', 'auto')),
          status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
          backup_path TEXT,
          file_size_bytes BIGINT,
          includes_database BOOLEAN DEFAULT true,
          includes_storage BOOLEAN DEFAULT true,
          includes_config BOOLEAN DEFAULT false,
          started_by VARCHAR(255),
          started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          completed_at TIMESTAMP WITH TIME ZONE,
          error_message TEXT,
          metadata JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_system_backups_status ON system_backups(status);
        CREATE INDEX IF NOT EXISTS idx_system_backups_started_at ON system_backups(started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_system_backups_backup_type ON system_backups(backup_type);
      `);
      logger.info('[Startup] ✓ Created system_backups table');
    }

    // Create system_backup_schedule table
    if (!schedule_exists) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS system_backup_schedule (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          schedule_name VARCHAR(255) NOT NULL,
          cron_expression VARCHAR(100) NOT NULL,
          backup_type VARCHAR(50) NOT NULL DEFAULT 'scheduled',
          is_enabled BOOLEAN NOT NULL DEFAULT true,
          retention_days INTEGER DEFAULT 30,
          includes_database BOOLEAN DEFAULT true,
          includes_storage BOOLEAN DEFAULT true,
          includes_config BOOLEAN DEFAULT false,
          last_run_at TIMESTAMP WITH TIME ZONE,
          next_run_at TIMESTAMP WITH TIME ZONE,
          created_by VARCHAR(255),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_system_backup_schedule_enabled ON system_backup_schedule(is_enabled);
        CREATE INDEX IF NOT EXISTS idx_system_backup_schedule_next_run ON system_backup_schedule(next_run_at);
      `);
      logger.info('[Startup] ✓ Created system_backup_schedule table');
    }

    logger.info('[Startup] ✓ Backup system tables initialized successfully');
    
    // Rescan backups directory to register any existing backups
    await rescanBackups();
    
  } catch (error) {
    logger.error('[Startup] Error ensuring backup tables exist:', error);
    // Don't throw - startup should continue
  }
}

/**
 * Scan backups directory and register any existing backups in the database
 * This is crucial after a database restore to repopulate backup records
 */
async function rescanBackups(): Promise<void> {
  const db = getDbClient();
  
  try {
    logger.info('[Startup] Scanning backups directory...');
    
    const backupsDir = path.join(process.cwd(), 'backups');
    
    // Check if backups directory exists
    if (!fs.existsSync(backupsDir)) {
      logger.info('[Startup] No backups directory found, skipping rescan');
      return;
    }
    
    // Get all directories in backups folder
    const entries = fs.readdirSync(backupsDir, { withFileTypes: true });
    const backupDirs = entries.filter(entry => entry.isDirectory());
    
    if (backupDirs.length === 0) {
      logger.info('[Startup] No backup directories found');
      return;
    }
    
    logger.info(`[Startup] Found ${backupDirs.length} backup directories`);
    
    let registered = 0;
    let skipped = 0;
    
    for (const dir of backupDirs) {
      const backupName = dir.name;
      const backupPath = path.join(backupsDir, backupName);
      
      // Check if backup already exists in database
      const existing = await db.query(
        'SELECT id FROM system_backups WHERE backup_name = $1',
        [backupName]
      );
      
      if (existing.rows.length > 0) {
        skipped++;
        continue;
      }
      
      // Find the tar.gz file
      const files = fs.readdirSync(backupPath);
      const tarFile = files.find(f => f.endsWith('.tar.gz'));
      
      if (!tarFile) {
        logger.warn(`[Startup] No tar.gz file found in ${backupName}`);
        continue;
      }
      
      const tarFilePath = path.join(backupPath, tarFile);
      const stats = fs.statSync(tarFilePath);
      const fileSize = stats.size;
      
      // Extract timestamp from backup name (format: backup_YYYYMMDD_HHMMSS)
      const timestampMatch = backupName.match(/(\d{8}_\d{6})/);
      let backupTimestamp = new Date();
      
      if (timestampMatch) {
        const ts = timestampMatch[1];
        const year = ts.substring(0, 4);
        const month = ts.substring(4, 6);
        const day = ts.substring(6, 8);
        const hour = ts.substring(9, 11);
        const minute = ts.substring(11, 13);
        const second = ts.substring(13, 15);
        backupTimestamp = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
      }
      
      // Determine backup type (manual if no schedule info found)
      const backupType = 'manual';
      
      // Insert backup record
      await db.query(`
        INSERT INTO system_backups (
          backup_name,
          backup_type,
          status,
          backup_path,
          file_size_bytes,
          includes_database,
          includes_storage,
          includes_config,
          started_at,
          completed_at,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        backupName,
        backupType,
        'completed',
        backupPath,
        fileSize,
        true,
        true,
        false,
        backupTimestamp,
        backupTimestamp,
        backupTimestamp
      ]);
      
      registered++;
      logger.info(`[Startup] ✓ Registered backup: ${backupName} (${fileSize} bytes)`);
    }
    
    logger.info(`[Startup] Backup rescan complete: ${registered} registered, ${skipped} skipped`);
    
  } catch (error) {
    logger.error('[Startup] Error rescanning backups:', error);
    // Don't throw - startup should continue
  }
}

/**
 * Run all startup initialization tasks
 */
export async function runStartupInitialization(): Promise<void> {
  try {
    logger.info('[Startup] Running startup initialization tasks...');

    // Ensure backup tables exist (critical after restore)
    await ensureBackupTablesExist();

    // Initialize users from Keycloak
    await initializeExistingUsers();

    logger.info('[Startup] Startup initialization complete ✓');
  } catch (error) {
    logger.error('[Startup] Error during startup initialization:', error);
    // Don't throw - let the app start even if initialization has issues
  }
}

/**
 * Check if startup initialization should run
 * Can be controlled via environment variable
 */
export function shouldRunStartupInitialization(): boolean {
  const envValue = process.env.RUN_STARTUP_INITIALIZATION;

  // Default to true if not specified
  if (envValue === undefined || envValue === null) {
    return true;
  }

  // Check for explicit false values
  return envValue !== 'false' && envValue !== '0' && envValue !== 'no';
}
