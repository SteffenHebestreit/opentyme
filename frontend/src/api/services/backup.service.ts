/**
 * @fileoverview Backup & Recovery API Service
 * 
 * Provides methods for interacting with the backup/restore system:
 * - Creating manual backups
 * - Listing backup history
 * - Restoring from backups
 * - Managing backup schedules
 * - Cleaning up old backups
 * 
 * @module api/services/backup
 */

import apiClient from './client';

interface CreateBackupRequest {
  backup_name?: string;
  includes_database: boolean;
  includes_storage: boolean;
  includes_config: boolean;
}

interface Backup {
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
  started_at: string;
  completed_at?: string;
  error_message?: string;
}

interface BackupListResponse {
  backups: Backup[];
  total: number;
  limit: number;
  offset: number;
}

interface CreateScheduleRequest {
  schedule_name: string;
  is_enabled: boolean;
  cron_expression: string;
  includes_database: boolean;
  includes_storage: boolean;
  includes_config: boolean;
  retention_days: number;
  notification_email?: string;
}

interface Schedule {
  id: string;
  schedule_name: string;
  is_enabled: boolean;
  cron_expression: string;
  includes_database: boolean;
  includes_storage: boolean;
  includes_config: boolean;
  retention_days: number;
  notification_email?: string;
  last_run_at?: string;
  last_run_status?: string;
  next_run_at?: string;
  created_at: string;
  created_by?: string;
}

interface ScheduleListResponse {
  schedules: Schedule[];
}

/**
 * Create a new manual backup
 */
export const createBackup = async (data: CreateBackupRequest): Promise<Backup> => {
  const response = await apiClient.post('/system/backups', data);
  return response.data.backup;
};

/**
 * List all backups with pagination
 */
export const listBackups = async (limit = 50, offset = 0): Promise<BackupListResponse> => {
  const response = await apiClient.get('/system/backups', {
    params: { limit, offset },
  });
  return response.data;
};

/**
 * Get a specific backup by ID
 */
export const getBackupById = async (backupId: string): Promise<Backup> => {
  const response = await apiClient.get(`/system/backups/${backupId}`);
  return response.data.backup;
};

/**
 * Restore from a backup
 */
export const restoreBackup = async (backupId: string): Promise<void> => {
  await apiClient.post(`/system/backups/${backupId}/restore`);
};

/**
 * Delete a backup
 */
export const deleteBackup = async (backupId: string): Promise<void> => {
  await apiClient.delete(`/system/backups/${backupId}`);
};

/**
 * Clean up old backups based on retention policy
 */
export const cleanupOldBackups = async (retentionDays = 30): Promise<{ deleted: number }> => {
  const response = await apiClient.post('/system/backups/cleanup', null, {
    params: { retention_days: retentionDays },
  });
  return response.data;
};

/**
 * Create a new backup schedule
 */
export const createSchedule = async (data: CreateScheduleRequest): Promise<Schedule> => {
  const response = await apiClient.post('/system/backups/schedules', data);
  return response.data.schedule;
};

/**
 * List all backup schedules
 */
export const listSchedules = async (): Promise<ScheduleListResponse> => {
  const response = await apiClient.get('/system/backups/schedules');
  return response.data;
};

/**
 * Update an existing backup schedule
 */
export const updateSchedule = async (
  scheduleId: string,
  data: Partial<CreateScheduleRequest>
): Promise<Schedule> => {
  const response = await apiClient.put(`/system/backups/schedules/${scheduleId}`, data);
  return response.data.schedule;
};

/**
 * Delete a backup schedule
 */
export const deleteSchedule = async (scheduleId: string): Promise<void> => {
  await apiClient.delete(`/system/backups/schedules/${scheduleId}`);
};

// Export as a service object
export const backupService = {
  createBackup,
  listBackups,
  getBackupById,
  restoreBackup,
  deleteBackup,
  cleanupOldBackups,
  createSchedule,
  listSchedules,
  updateSchedule,
  deleteSchedule,
};
