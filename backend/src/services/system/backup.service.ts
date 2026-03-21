/**
 * @fileoverview System backup and restore service
 * 
 * Handles backup and restore operations for:
 * - PostgreSQL database
 * - S3-compatible object storage (receipts, invoices, user buckets)
 * - Configuration files
 * 
 * @module services/system/backup.service
 */

import { Pool } from 'pg';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { logger } from '../../utils/logger';

const execFileAsync = promisify(execFile);

interface BackupOptions {
  includeDatabase?: boolean;
  includeStorage?: boolean;
  includeConfig?: boolean;
  backupName?: string;
}

interface BackupRecord {
  id: string;
  backup_name: string;
  backup_type: 'manual' | 'scheduled' | 'auto';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  backup_path?: string;
  file_size_bytes?: number;
  includes_database: boolean;
  includes_storage: boolean;
  includes_config: boolean;
  started_by?: string;
  started_at: Date;
  completed_at?: Date;
  error_message?: string;
  metadata?: any;
}

interface BackupScriptResult {
  success?: boolean;
  file_path?: string;
  file_size?: number;
  timestamp?: string;
}

interface ScheduleConfig {
  id?: string;
  schedule_name: string;
  is_enabled: boolean;
  cron_expression: string;
  includes_database: boolean;
  includes_storage: boolean;
  includes_config: boolean;
  retention_days: number;
  notification_email?: string;
  created_by: string;
}

class BackupService {
  private pool: Pool;
  private backupBasePath: string;
  private scriptsPath: string;

  constructor(pool: Pool) {
    this.pool = pool;
    this.backupBasePath = process.env.BACKUP_PATH || path.join(process.cwd(), 'backups');
    this.scriptsPath = process.env.SCRIPTS_PATH || path.join(process.cwd(), 'scripts');
  }

  /**
   * Create a new backup
   */
  async createBackup(
    userId: string,
    options: BackupOptions = {},
    backupType: 'manual' | 'scheduled' | 'auto' = 'manual'
  ): Promise<BackupRecord> {
    const {
      includeDatabase = true,
      includeStorage = true,
      includeConfig = false,
      backupName = `backup_${Date.now()}`
    } = options;

    const backupDir = path.join(this.backupBasePath, backupName);

    logger.info(`Creating backup: ${backupName} by user ${userId}`);

    // Insert backup record
    const insertResult = await this.pool.query(
      `INSERT INTO system_backups (
        backup_name, backup_type, status, 
        includes_database, includes_storage, includes_config,
        started_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [backupName, backupType, 'in_progress', includeDatabase, includeStorage, includeConfig, userId]
    );

    const backupRecord = insertResult.rows[0];

    try {
      // Execute backup script
      const backupPath = await this.executeBackupScript(backupDir, {
        includeDatabase,
        includeStorage,
        includeConfig,
        backupName
      });

      // Get backup size
      const stats = await fs.stat(backupPath);
      const fileSize = stats.size;

      // Update backup record as completed
      await this.pool.query(
        `UPDATE system_backups 
         SET status = $1, backup_path = $2, file_size_bytes = $3, completed_at = NOW()
         WHERE id = $4`,
        ['completed', backupPath, fileSize, backupRecord.id]
      );

      logger.info(`Backup completed successfully: ${backupName} (${fileSize} bytes)`);

      return {
        ...backupRecord,
        status: 'completed',
        backup_path: backupPath,
        file_size_bytes: fileSize,
        completed_at: new Date()
      };
    } catch (error: any) {
      logger.error(`Backup failed: ${error.message}`);

      await this.cleanupFailedBackupDirectory(backupDir);

      // Update backup record as failed
      await this.pool.query(
        `UPDATE system_backups 
         SET status = $1, error_message = $2, completed_at = NOW()
         WHERE id = $3`,
        ['failed', error.message, backupRecord.id]
      );

      throw error;
    }
  }

  /**
   * Execute backup script
   */
  private async executeBackupScript(backupDir: string, options: BackupOptions & { backupName: string }): Promise<string> {
    // Ensure backup directory exists
    await fs.mkdir(backupDir, { recursive: true });

    // Build environment variables
    const env = {
      ...process.env,
      BACKUP_DIR: backupDir,
      BACKUP_NAME: options.backupName,
      INCLUDE_DATABASE: options.includeDatabase ? 'true' : 'false',
      INCLUDE_STORAGE: options.includeStorage ? 'true' : 'false',
      INCLUDE_CONFIG: options.includeConfig ? 'true' : 'false',
    };

    // Execute backup script
    const scriptPath = path.join(this.scriptsPath, 'backup.sh');
    
    if (!existsSync(scriptPath)) {
      throw new Error(`Backup script not found: ${scriptPath}`);
    }

    logger.info(`Executing backup script: ${scriptPath}`);
    const { stdout, stderr } = await execFileAsync(scriptPath, [], { env, maxBuffer: 10 * 1024 * 1024 });

    if (stderr) {
      logger.warn(`Backup script warnings: ${stderr}`);
    }

    logger.info(`Backup script output: ${stdout}`);

    return this.resolveBackupArtifactPath(backupDir, stdout);
  }

  /**
   * Restore from backup
   */
  async restoreBackup(backupId: string, userId: string): Promise<void> {
    logger.info(`Restoring backup ${backupId} by user ${userId}`);

    // Get backup record
    const result = await this.pool.query(
      'SELECT * FROM system_backups WHERE id = $1',
      [backupId]
    );

    if (result.rows.length === 0) {
      throw new Error('Backup not found');
    }

    const backup = result.rows[0];

    if (backup.status !== 'completed') {
      throw new Error('Cannot restore from incomplete backup');
    }

    if (!backup.backup_path || !existsSync(backup.backup_path)) {
      throw new Error('Backup files not found');
    }

    try {
      // Execute restore script
      await this.executeRestoreScript(backup.backup_path, {
        includeDatabase: backup.includes_database,
        includeStorage: backup.includes_storage,
        includeConfig: backup.includes_config
      });

      logger.info(`Restore completed successfully from backup: ${backup.backup_name}`);
    } catch (error: any) {
      logger.error(`Restore failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute restore script
   */
  private async executeRestoreScript(backupPath: string, options: BackupOptions): Promise<void> {
    const env = {
      ...process.env,
      BACKUP_PATH: backupPath,
      RESTORE_DATABASE: options.includeDatabase ? 'true' : 'false',
      RESTORE_STORAGE: options.includeStorage ? 'true' : 'false',
      RESTORE_CONFIG: options.includeConfig ? 'true' : 'false',
    };

    const scriptPath = path.join(this.scriptsPath, 'restore.sh');
    
    if (!existsSync(scriptPath)) {
      throw new Error(`Restore script not found: ${scriptPath}`);
    }

    logger.info(`Executing restore script: ${scriptPath}`);
    const { stdout, stderr } = await execFileAsync(scriptPath, [backupPath], { env, maxBuffer: 10 * 1024 * 1024 });

    if (stderr) {
      logger.warn(`Restore script warnings: ${stderr}`);
    }

    logger.info(`Restore script output: ${stdout}`);
  }

  private parseBackupScriptResult(stdout: string): BackupScriptResult | null {
    const trimmed = stdout.trim();
    const jsonStart = trimmed.lastIndexOf('{');

    if (jsonStart === -1) {
      return null;
    }

    const jsonCandidate = trimmed.slice(jsonStart);

    try {
      return JSON.parse(jsonCandidate) as BackupScriptResult;
    } catch {
      return null;
    }
  }

  private async resolveBackupArtifactPath(backupDir: string, stdout: string): Promise<string> {
    const scriptResult = this.parseBackupScriptResult(stdout);

    if (scriptResult?.file_path && existsSync(scriptResult.file_path)) {
      return scriptResult.file_path;
    }

    const entries = await fs.readdir(backupDir);
    const archiveCandidates = entries
      .filter((entry) => entry.endsWith('.tar.gz'))
      .map((entry) => path.join(backupDir, entry));

    if (archiveCandidates.length === 0) {
      throw new Error(`Backup script completed without creating an archive in ${backupDir}`);
    }

    const candidatesWithStats = await Promise.all(
      archiveCandidates.map(async (candidate) => ({
        candidate,
        stats: await fs.stat(candidate),
      }))
    );

    const completedArchive = candidatesWithStats
      .filter(({ stats }) => stats.isFile() && stats.size > 0)
      .sort((left, right) => right.stats.mtimeMs - left.stats.mtimeMs)[0];

    if (!completedArchive) {
      throw new Error(`Backup script created only empty archives in ${backupDir}`);
    }

    return completedArchive.candidate;
  }

  private async cleanupFailedBackupDirectory(backupDir: string): Promise<void> {
    if (!existsSync(backupDir)) {
      return;
    }

    const entries = await fs.readdir(backupDir);

    if (entries.length === 0) {
      await fs.rm(backupDir, { recursive: true, force: true });
      return;
    }

    const meaningfulEntries = entries.filter((entry) => !entry.startsWith('temp_'));

    if (meaningfulEntries.length === 0) {
      await fs.rm(backupDir, { recursive: true, force: true });
    }
  }

  /**
   * List all backups
   */
  async listBackups(limit: number = 50, offset: number = 0): Promise<BackupRecord[]> {
    const result = await this.pool.query(
      `SELECT * FROM system_backups 
       ORDER BY started_at DESC 
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return result.rows;
  }

  /**
   * Get backup by ID
   */
  async getBackupById(backupId: string): Promise<BackupRecord | null> {
    const result = await this.pool.query(
      'SELECT * FROM system_backups WHERE id = $1',
      [backupId]
    );

    return result.rows[0] || null;
  }

  /**
   * Delete backup
   */
  async deleteBackup(backupId: string): Promise<void> {
    const backup = await this.getBackupById(backupId);

    if (!backup) {
      throw new Error('Backup not found');
    }

    // Delete backup files
    if (backup.backup_path && existsSync(backup.backup_path)) {
      await fs.rm(backup.backup_path, { recursive: true, force: true });
      logger.info(`Deleted backup files: ${backup.backup_path}`);
    }

    // Delete backup record
    await this.pool.query('DELETE FROM system_backups WHERE id = $1', [backupId]);
    logger.info(`Deleted backup record: ${backupId}`);
  }

  /**
   * Cleanup old backups based on retention policy
   */
  async cleanupOldBackups(retentionDays: number = 30): Promise<number> {
    logger.info(`Cleaning up backups older than ${retentionDays} days`);

    const result = await this.pool.query(
      `SELECT * FROM system_backups 
       WHERE started_at < NOW() - INTERVAL '${retentionDays} days'
       AND status = 'completed'`,
      []
    );

    const oldBackups = result.rows;
    let deletedCount = 0;

    for (const backup of oldBackups) {
      try {
        await this.deleteBackup(backup.id);
        deletedCount++;
      } catch (error: any) {
        logger.error(`Failed to delete old backup ${backup.id}: ${error.message}`);
      }
    }

    logger.info(`Cleanup completed: ${deletedCount} backups deleted`);
    return deletedCount;
  }

  /**
   * Create backup schedule
   */
  async createSchedule(config: ScheduleConfig): Promise<ScheduleConfig> {
    const result = await this.pool.query(
      `INSERT INTO system_backup_schedule (
        schedule_name, is_enabled, cron_expression, backup_type,
        includes_database, includes_storage, includes_config,
        retention_days, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        config.schedule_name,
        config.is_enabled,
        config.cron_expression,
        'scheduled', // backup_type is always 'scheduled' for scheduled backups
        config.includes_database,
        config.includes_storage,
        config.includes_config,
        config.retention_days,
        config.created_by
      ]
    );

    return result.rows[0];
  }

  /**
   * Update backup schedule
   */
  async updateSchedule(scheduleId: string, config: Partial<ScheduleConfig>): Promise<ScheduleConfig> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (config.schedule_name !== undefined) {
      updates.push(`schedule_name = $${paramIndex++}`);
      values.push(config.schedule_name);
    }
    if (config.is_enabled !== undefined) {
      updates.push(`is_enabled = $${paramIndex++}`);
      values.push(config.is_enabled);
    }
    if (config.cron_expression !== undefined) {
      updates.push(`cron_expression = $${paramIndex++}`);
      values.push(config.cron_expression);
    }
    if (config.includes_database !== undefined) {
      updates.push(`includes_database = $${paramIndex++}`);
      values.push(config.includes_database);
    }
    if (config.includes_storage !== undefined) {
      updates.push(`includes_storage = $${paramIndex++}`);
      values.push(config.includes_storage);
    }
    if (config.includes_config !== undefined) {
      updates.push(`includes_config = $${paramIndex++}`);
      values.push(config.includes_config);
    }
    if (config.retention_days !== undefined) {
      updates.push(`retention_days = $${paramIndex++}`);
      values.push(config.retention_days);
    }
    if (config.notification_email !== undefined) {
      updates.push(`notification_email = $${paramIndex++}`);
      values.push(config.notification_email);
    }

    updates.push(`updated_at = NOW()`);
    values.push(scheduleId);

    const result = await this.pool.query(
      `UPDATE system_backup_schedule SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new Error('Schedule not found');
    }

    return result.rows[0];
  }

  /**
   * Delete backup schedule
   */
  async deleteSchedule(scheduleId: string): Promise<void> {
    await this.pool.query('DELETE FROM system_backup_schedule WHERE id = $1', [scheduleId]);
    logger.info(`Deleted backup schedule: ${scheduleId}`);
  }

  /**
   * List all backup schedules
   */
  async listSchedules(): Promise<ScheduleConfig[]> {
    const result = await this.pool.query(
      'SELECT * FROM system_backup_schedule ORDER BY created_at DESC'
    );

    return result.rows;
  }

  /**
   * Get enabled schedules
   */
  async getEnabledSchedules(): Promise<ScheduleConfig[]> {
    const result = await this.pool.query(
      'SELECT * FROM system_backup_schedule WHERE is_enabled = true'
    );

    return result.rows;
  }

  /**
   * Update schedule last run info
   */
  async updateScheduleLastRun(scheduleId: string, status: string, nextRunAt?: Date): Promise<void> {
    await this.pool.query(
      `UPDATE system_backup_schedule 
       SET last_run_at = NOW(), last_run_status = $1, next_run_at = $2
       WHERE id = $3`,
      [status, nextRunAt, scheduleId]
    );
  }
}

export default BackupService;
