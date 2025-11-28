/**
 * @fileoverview Backup scheduler service using node-cron
 * 
 * Manages automatic scheduled backups
 * 
 * @module services/system/backup-scheduler.service
 */

import cron, { ScheduledTask } from 'node-cron';
import { Pool } from 'pg';
import BackupService from './backup.service';
import { logger } from '../../utils/logger';

interface ScheduledTaskInfo {
  scheduleId: string;
  task: ScheduledTask;
}

class BackupScheduler {
  private pool: Pool;
  private backupService: BackupService;
  private scheduledTasks: Map<string, ScheduledTaskInfo>;
  private isInitialized: boolean = false;

  constructor(pool: Pool) {
    this.pool = pool;
    this.backupService = new BackupService(pool);
    this.scheduledTasks = new Map();
  }

  /**
   * Initialize scheduler and load all enabled schedules
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Backup scheduler already initialized');
      return;
    }

    logger.info('Initializing backup scheduler...');

    try {
      const schedules = await this.backupService.getEnabledSchedules();
      
      for (const schedule of schedules) {
        try {
          await this.scheduleBackup(schedule);
        } catch (error: any) {
          logger.error(`Failed to schedule backup ${schedule.id}: ${error.message}`);
        }
      }

      this.isInitialized = true;
      logger.info(`Backup scheduler initialized with ${schedules.length} schedule(s)`);
    } catch (error: any) {
      logger.error(`Failed to initialize backup scheduler: ${error.message}`);
      throw error;
    }
  }

  /**
   * Schedule a backup job
   */
  async scheduleBackup(schedule: any): Promise<void> {
    // Validate cron expression
    if (!cron.validate(schedule.cron_expression)) {
      throw new Error(`Invalid cron expression: ${schedule.cron_expression}`);
    }

    // Remove existing task if any
    this.unscheduleBackup(schedule.id);

    logger.info(`Scheduling backup: ${schedule.schedule_name} with cron: ${schedule.cron_expression}`);

    // Create scheduled task
    const task = cron.schedule(schedule.cron_expression, async () => {
      logger.info(`Executing scheduled backup: ${schedule.schedule_name}`);
      
      try {
        // Create backup
        await this.backupService.createBackup(
          'system', // System user for scheduled backups
          {
            includeDatabase: schedule.includes_database,
            includeStorage: schedule.includes_storage,
            includeConfig: schedule.includes_config,
            backupName: `scheduled_${schedule.schedule_name}_${Date.now()}`
          },
          'scheduled'
        );

        // Update schedule last run
        const nextRun = this.getNextRunTime(schedule.cron_expression);
        await this.backupService.updateScheduleLastRun(schedule.id, 'completed', nextRun);

        logger.info(`Scheduled backup completed: ${schedule.schedule_name}`);

        // Cleanup old backups based on retention policy
        if (schedule.retention_days > 0) {
          await this.backupService.cleanupOldBackups(schedule.retention_days);
        }
      } catch (error: any) {
        logger.error(`Scheduled backup failed: ${schedule.schedule_name} - ${error.message}`);
        await this.backupService.updateScheduleLastRun(schedule.id, 'failed');
      }
    });

    // Store task
    this.scheduledTasks.set(schedule.id, {
      scheduleId: schedule.id,
      task
    });

    logger.info(`Backup scheduled successfully: ${schedule.schedule_name}`);
  }

  /**
   * Unschedule a backup job
   */
  unscheduleBackup(scheduleId: string): void {
    const scheduledTask = this.scheduledTasks.get(scheduleId);
    
    if (scheduledTask) {
      scheduledTask.task.stop();
      this.scheduledTasks.delete(scheduleId);
      logger.info(`Backup unscheduled: ${scheduleId}`);
    }
  }

  /**
   * Reschedule a backup job (update)
   */
  async rescheduleBackup(schedule: any): Promise<void> {
    this.unscheduleBackup(schedule.id);
    
    if (schedule.is_enabled) {
      await this.scheduleBackup(schedule);
    }
  }

  /**
   * Get next run time for a cron expression
   * Using cron-parser to calculate next execution time
   */
  private getNextRunTime(cronExpression: string): Date {
    try {
      // Use a simple calculation: schedule it and let cron figure it out
      // For now, return current time + 1 minute as placeholder
      // In production, you'd want to use a library like 'cron-parser'
      const now = new Date();
      now.setMinutes(now.getMinutes() + 1);
      return now;
    } catch (error) {
      logger.error('Failed to calculate next run time:', error);
      const fallback = new Date();
      fallback.setHours(fallback.getHours() + 1);
      return fallback;
    }
  }

  /**
   * Stop all scheduled tasks
   */
  stopAll(): void {
    logger.info('Stopping all backup schedules...');
    
    this.scheduledTasks.forEach((scheduledTask) => {
      scheduledTask.task.stop();
    });
    
    this.scheduledTasks.clear();
    this.isInitialized = false;
    
    logger.info('All backup schedules stopped');
  }

  /**
   * Get all active schedules
   */
  getActiveSchedules(): string[] {
    return Array.from(this.scheduledTasks.keys());
  }

  /**
   * Check if scheduler is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}

export default BackupScheduler;
