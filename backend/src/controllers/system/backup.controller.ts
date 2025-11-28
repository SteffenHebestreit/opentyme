/**
 * @fileoverview Backup and restore controller
 * 
 * Handles HTTP requests for backup/restore operations
 * 
 * @module controllers/system/backup.controller
 */

import { Request, Response } from 'express';
import { getDbClient } from '../../utils/database';
import BackupService from '../../services/system/backup.service';
import { logger } from '../../utils/logger';

const pool = getDbClient();
const backupService = new BackupService(pool);

/**
 * Create a new backup
 */
export const createBackup = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { includes_database, includes_storage, includes_config, backup_name } = req.body;

    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    logger.info(`User ${userId} initiating backup`);

    const backup = await backupService.createBackup(userId, {
      includeDatabase: includes_database !== false,
      includeStorage: includes_storage !== false,
      includeConfig: includes_config === true,
    backupName: backup_name,
    }, 'manual');

    res.status(201).json({
      message: 'Backup initiated successfully',
      backup,
    });
  } catch (error: any) {
    logger.error('Failed to create backup:', error);
    res.status(500).json({
      message: 'Failed to create backup',
      error: error.message,
    });
  }
};

/**
 * List all backups with pagination
 */
export const listBackups = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await backupService.listBackups(limit, offset);

    res.json(result);
  } catch (error: any) {
    logger.error('Failed to list backups:', error);
    res.status(500).json({
      message: 'Failed to list backups',
      error: error.message,
    });
  }
};

/**
 * Get a specific backup by ID
 */
export const getBackupById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const backup = await backupService.getBackupById(id);

    if (!backup) {
      res.status(404).json({ message: 'Backup not found' });
      return;
    }

    res.json({ backup });
  } catch (error: any) {
    logger.error('Failed to get backup:', error);
    res.status(500).json({
      message: 'Failed to get backup',
      error: error.message,
    });
  }
};

/**
 * Restore from a backup
 */
export const restoreBackup = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    logger.info(`User ${userId} initiating restore from backup ${id}`);

    // Send response immediately before restore kills DB connections
    res.json({
      message: 'Restore initiated. Server will restart automatically...',
    });

    // Execute restore and restart in background (don't await)
    setImmediate(async () => {
      try {
        await backupService.restoreBackup(id, userId);
        logger.info('Restore completed. Restarting server...');
      } catch (err: any) {
        logger.error('Restore failed:', err);
      } finally {
        // Exit to trigger automatic restart (dev-watch wrapper or Docker restart policy)
        setTimeout(() => process.exit(0), 500);
      }
    });
  } catch (error: any) {
    logger.error('Failed to restore backup:', error);
    res.status(500).json({
      message: 'Failed to restore backup',
      error: error.message,
    });
  }
};

/**
 * Delete a backup
 */
export const deleteBackup = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    await backupService.deleteBackup(id);

    res.json({
      message: 'Backup deleted successfully',
    });
  } catch (error: any) {
    logger.error('Failed to delete backup:', error);
    res.status(500).json({
      message: 'Failed to delete backup',
      error: error.message,
    });
  }
};

/**
 * Clean up old backups
 */
export const cleanupOldBackups = async (req: Request, res: Response): Promise<void> => {
  try {
    const retentionDays = parseInt(req.query.retention_days as string) || 30;

    const deleted = await backupService.cleanupOldBackups(retentionDays);

    res.json({
      message: 'Old backups cleaned up successfully',
      deleted,
    });
  } catch (error: any) {
    logger.error('Failed to cleanup backups:', error);
    res.status(500).json({
      message: 'Failed to cleanup backups',
      error: error.message,
    });
  }
};

/**
 * Create a new backup schedule
 */
export const createSchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const {
      schedule_name,
      is_enabled,
      cron_expression,
      includes_database,
      includes_storage,
      includes_config,
      retention_days,
    } = req.body;

    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const schedule = await backupService.createSchedule({
      schedule_name,
      is_enabled: is_enabled !== false,
      cron_expression,
      includes_database: includes_database !== false,
      includes_storage: includes_storage !== false,
      includes_config: includes_config === true,
      retention_days: retention_days || 30,
      created_by: userId,
    });

    res.status(201).json({
      message: 'Schedule created successfully',
      schedule,
    });
  } catch (error: any) {
    logger.error('Failed to create schedule:', error);
    res.status(500).json({
      message: 'Failed to create schedule',
      error: error.message,
    });
  }
};

/**
 * Update an existing backup schedule
 */
export const updateSchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const schedule = await backupService.updateSchedule(id, req.body);

    res.json({
      message: 'Schedule updated successfully',
      schedule,
    });
  } catch (error: any) {
    logger.error('Failed to update schedule:', error);
    res.status(500).json({
      message: 'Failed to update schedule',
      error: error.message,
    });
  }
};

/**
 * Delete a backup schedule
 */
export const deleteSchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    await backupService.deleteSchedule(id);

    res.json({
      message: 'Schedule deleted successfully',
    });
  } catch (error: any) {
    logger.error('Failed to delete schedule:', error);
    res.status(500).json({
      message: 'Failed to delete schedule',
      error: error.message,
    });
  }
};

/**
 * List all backup schedules
 */
export const listSchedules = async (req: Request, res: Response): Promise<void> => {
  try {
    const schedules = await backupService.listSchedules();

    res.json(schedules); // Return array directly, not wrapped
  } catch (error: any) {
    logger.error('Failed to list schedules:', error);
    res.status(500).json({
      message: 'Failed to list schedules',
      error: error.message,
    });
  }
};
