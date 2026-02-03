/**
 * @fileoverview System Admin - Backup & Recovery page
 * 
 * Allows system administrators to:
 * - Create manual backups
 * - View backup history
 * - Restore from backups
 * - Schedule automatic backups
 * - Manage retention policies
 * 
 * @module pages/SystemAdmin
 */

import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Database,
  RotateCcw,
  Trash2,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Plus,
} from 'lucide-react';
import { backupService } from '../api/services/backup.service';
import Modal from '../components/ui/Modal';
import { Input } from '../components/forms/Input';
import { Table, Column, Badge, Tabs, TabPanel, PageHeader, LoadingSpinner, EmptyState } from '../components/common';
import type { Tab } from '../components/common/Tabs';
import type { BadgeVariant } from '../components/common/Badge';

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
}

export default function SystemAdmin() {
  const { t } = useTranslation('system');
  const [activeTab, setActiveTab] = useState<'backups' | 'schedules'>('backups');
  const [backups, setBackups] = useState<Backup[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);

  // Backup form state
  const [backupForm, setBackupForm] = useState({
    backup_name: '',
    includes_database: true,
    includes_storage: true,
    includes_config: false,
  });

  // Schedule form state
  const [scheduleForm, setScheduleForm] = useState({
    schedule_name: '',
    is_enabled: true,
    cron_expression: '0 2 * * *', // Daily at 2 AM
    includes_database: true,
    includes_storage: true,
    includes_config: false,
    retention_days: 30,
  });

  useEffect(() => {
    loadBackups();
    loadSchedules();
  }, []);

  const loadBackups = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await backupService.listBackups();
      console.log('Loaded backups:', data);
      // API returns array directly, not wrapped in an object
      setBackups(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || t('errors.loadBackups'));
    } finally {
      setIsLoading(false);
    }
  };

  const loadSchedules = async () => {
    try {
      const data = await backupService.listSchedules();
      // API returns array directly, not wrapped in an object
      setSchedules(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Failed to load schedules:', err);
      setSchedules([]); // Set empty array on error
    }
  };

  const handleCreateBackup = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      await backupService.createBackup({
        ...backupForm,
        backup_name: backupForm.backup_name || `manual_${Date.now()}`,
      });

      setShowBackupModal(false);
      setBackupForm({
        backup_name: '',
        includes_database: true,
        includes_storage: true,
        includes_config: false,
      });
      
      await loadBackups();
    } catch (err: any) {
      setError(err.message || 'Failed to create backup');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestoreBackup = async (backupId: string) => {
    if (!confirm(t('backups.confirmRestore'))) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      await backupService.restoreBackup(backupId);
      
      alert(t('backups.restoreSuccess'));
    } catch (err: any) {
      setError(err.message || t('backups.restoreError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteBackup = async (backupId: string) => {
    if (!confirm(t('backups.confirmDelete'))) {
      return;
    }

    try {
      await backupService.deleteBackup(backupId);
      await loadBackups();
    } catch (err: any) {
      setError(err.message || t('backups.deleteError'));
    }
  };

  const handleCreateSchedule = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      if (selectedSchedule) {
        await backupService.updateSchedule(selectedSchedule.id, scheduleForm);
      } else {
        await backupService.createSchedule(scheduleForm);
      }

      setShowScheduleModal(false);
      setSelectedSchedule(null);
      setScheduleForm({
        schedule_name: '',
        is_enabled: true,
        cron_expression: '0 2 * * *',
        includes_database: true,
        includes_storage: true,
        includes_config: false,
        retention_days: 30,
      });
      
      await loadSchedules();
    } catch (err: any) {
      setError(err.message || 'Failed to save schedule');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditSchedule = (schedule: Schedule) => {
    setSelectedSchedule(schedule);
    setScheduleForm({
      schedule_name: schedule.schedule_name,
      is_enabled: schedule.is_enabled,
      cron_expression: schedule.cron_expression,
      includes_database: schedule.includes_database,
      includes_storage: schedule.includes_storage,
      includes_config: schedule.includes_config,
      retention_days: schedule.retention_days,
    });
    setShowScheduleModal(true);
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!confirm(t('schedules.confirmDelete'))) {
      return;
    }

    try {
      await backupService.deleteSchedule(scheduleId);
      await loadSchedules();
    } catch (err: any) {
      setError(err.message || t('schedules.deleteError'));
    }
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes) return 'N/A';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'in_progress':
        return <Clock className="w-5 h-5 text-blue-500 animate-spin" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  const columns: Column<Backup>[] = useMemo(() => [
    {
      key: 'status',
      accessorKey: 'status',
      header: t('backups.table.status'),
      render: (backup) => getStatusIcon(backup.status),
      sortable: true,
    },
    {
      key: 'name',
      accessorKey: 'backup_name',
      header: t('backups.table.name'),
      render: (backup) => (
        <span className="text-sm font-medium text-gray-900 dark:text-white">
          {backup.backup_name}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'type',
      accessorKey: 'backup_type',
      header: t('backups.table.type'),
      render: (backup) => {
        const variant: BadgeVariant = 
          backup.backup_type === 'manual' ? 'blue' :
          backup.backup_type === 'scheduled' ? 'green' : 'gray';
        return (
          <Badge variant={variant}>
            {t(`backups.types.${backup.backup_type}`)}
          </Badge>
        );
      },
      sortable: true,
    },
    {
      key: 'includes',
      header: t('backups.table.includes'),
      render: (backup) => (
        <div className="flex space-x-2">
          {backup.includes_database && (
            <Badge variant="purple" size="sm">
              {t('backups.includes.database')}
            </Badge>
          )}
          {backup.includes_storage && (
            <Badge variant="orange" size="sm">
              {t('backups.includes.storage')}
            </Badge>
          )}
          {backup.includes_config && (
            <Badge variant="teal" size="sm">
              {t('backups.includes.config')}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'size',
      accessorKey: 'file_size_bytes',
      header: t('backups.table.size'),
      render: (backup) => (
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {formatBytes(backup.file_size_bytes)}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'created',
      accessorKey: 'started_at',
      header: t('backups.table.created'),
      render: (backup) => (
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {new Date(backup.started_at).toLocaleString()}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'actions',
      header: t('backups.table.actions'),
      align: 'right',
      render: (backup) => (
        <div className="flex justify-end space-x-2">
          {backup.status === 'completed' && (
            <button
              onClick={() => handleRestoreBackup(backup.id)}
              className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
              title={t('backups.actions.restore')}
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={() => handleDeleteBackup(backup.id)}
            className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
            title={t('backups.actions.delete')}
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      ),
    },
  ], [t]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          {t('title')}
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          {t('subtitle')}
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center">
            <XCircle className="w-5 h-5 text-red-500 mr-2" />
            <span className="text-red-700 dark:text-red-400">{error}</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'backups', label: t('tabs.backups'), icon: Database },
          { id: 'schedules', label: t('tabs.schedules'), icon: Calendar }
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* Backups Tab */}
      <TabPanel tabId="backups" activeTab={activeTab}>
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {t('backups.title')}
            </h2>
            <button
              onClick={() => setShowBackupModal(true)}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center space-x-2 disabled:opacity-50"
            >
              <Plus className="w-5 h-5" />
              <span>{t('backups.createButton')}</span>
            </button>
          </div>

          {/* Backups List */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <Table
              columns={columns}
              data={backups}
              isLoading={isLoading}
              emptyMessage={t('backups.emptyState')}
              pageSize={10}
            />
          </div>
        </div>
      </TabPanel>

      {/* Schedules Tab */}
      <TabPanel tabId="schedules" activeTab={activeTab}>
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {t('schedules.title')}
            </h2>
            <button
              onClick={() => {
                setSelectedSchedule(null);
                setShowScheduleModal(true);
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center space-x-2"
            >
              <Plus className="w-5 h-5" />
              <span>{t('schedules.createButton')}</span>
            </button>
          </div>

          {/* Schedules List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {schedules.map((schedule) => (
              <div
                key={schedule.id}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-4"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {schedule.schedule_name}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {schedule.cron_expression}
                    </p>
                  </div>
                  <Badge variant={schedule.is_enabled ? 'green' : 'gray'}>
                    {schedule.is_enabled ? t('schedules.enabled') : t('schedules.disabled')}
                  </Badge>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center text-gray-600 dark:text-gray-400">
                    <Database className="w-4 h-4 mr-2" />
                    <span>{t('schedules.retention')}: {schedule.retention_days} {t('common:time.days')}</span>
                  </div>
                  {schedule.last_run_at && (
                    <div className="flex items-center text-gray-600 dark:text-gray-400">
                      <Clock className="w-4 h-4 mr-2" />
                      <span>{t('schedules.lastRun')}: {new Date(schedule.last_run_at).toLocaleString()}</span>
                    </div>
                  )}
                  {schedule.next_run_at && (
                    <div className="flex items-center text-gray-600 dark:text-gray-400">
                      <Calendar className="w-4 h-4 mr-2" />
                      <span>{t('schedules.nextRun')}: {new Date(schedule.next_run_at).toLocaleString()}</span>
                    </div>
                  )}
                </div>

                <div className="flex space-x-2">
                  {schedule.includes_database && (
                    <span className="px-2 py-1 bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 rounded text-xs">
                      {t('backups.includes.database')}
                    </span>
                  )}
                  {schedule.includes_storage && (
                    <span className="px-2 py-1 bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 rounded text-xs">
                      {t('backups.includes.storage')}
                    </span>
                  )}
                  {schedule.includes_config && (
                    <span className="px-2 py-1 bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400 rounded text-xs">
                      {t('backups.includes.config')}
                    </span>
                  )}
                </div>

                <div className="flex justify-end space-x-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => handleEditSchedule(schedule)}
                    className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20 rounded transition-colors"
                  >
                    {t('schedules.actions.edit')}
                  </button>
                  <button
                    onClick={() => handleDeleteSchedule(schedule.id)}
                    className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 rounded transition-colors"
                  >
                    {t('schedules.actions.delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </TabPanel>

      {/* Create Backup Modal */}
      <Modal
        open={showBackupModal}
        title={t('createBackupModal.title')}
        onClose={() => setShowBackupModal(false)}
        size="sm"
        footer={
          <>
            <button
              onClick={() => setShowBackupModal(false)}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              {t('createBackupModal.cancel')}
            </button>
            <button
              onClick={handleCreateBackup}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {isLoading ? t('createBackupModal.creatingButton') : t('createBackupModal.createButton')}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label={t('createBackupModal.nameLabel')}
            type="text"
            value={backupForm.backup_name}
            onChange={(e) => setBackupForm({ ...backupForm, backup_name: e.target.value })}
            placeholder={t('createBackupModal.namePlaceholder')}
          />

          <div className="space-y-3">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={backupForm.includes_database}
                onChange={(e) => setBackupForm({ ...backupForm, includes_database: e.target.checked })}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:border-gray-600 dark:focus:ring-blue-600"
              />
              <span className="ml-3 text-sm text-gray-700 dark:text-gray-300">{t('createBackupModal.includeDatabase')}</span>
            </label>
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={backupForm.includes_storage}
                onChange={(e) => setBackupForm({ ...backupForm, includes_storage: e.target.checked })}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:border-gray-600 dark:focus:ring-blue-600"
              />
              <span className="ml-3 text-sm text-gray-700 dark:text-gray-300">{t('createBackupModal.includeStorage')}</span>
            </label>
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={backupForm.includes_config}
                onChange={(e) => setBackupForm({ ...backupForm, includes_config: e.target.checked })}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:border-gray-600 dark:focus:ring-blue-600"
              />
              <span className="ml-3 text-sm text-gray-700 dark:text-gray-300">{t('createBackupModal.includeConfig')}</span>
            </label>
          </div>
        </div>
      </Modal>

      {/* Create/Edit Schedule Modal */}
      <Modal
        open={showScheduleModal}
        title={selectedSchedule ? t('scheduleModal.titleEdit') : t('scheduleModal.titleCreate')}
        onClose={() => {
          setShowScheduleModal(false);
          setSelectedSchedule(null);
        }}
        size="md"
        footer={
          <>
            <button
              onClick={() => {
                setShowScheduleModal(false);
                setSelectedSchedule(null);
              }}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              {t('scheduleModal.cancel')}
            </button>
            <button
              onClick={handleCreateSchedule}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {isLoading ? t('scheduleModal.savingButton') : selectedSchedule ? t('scheduleModal.updateButton') : t('scheduleModal.createButton')}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label={t('scheduleModal.nameLabel')}
            type="text"
            value={scheduleForm.schedule_name}
            onChange={(e) => setScheduleForm({ ...scheduleForm, schedule_name: e.target.value })}
            placeholder={t('scheduleModal.namePlaceholder')}
          />

          <Input
            label={t('scheduleModal.cronLabel')}
            type="text"
            value={scheduleForm.cron_expression}
            onChange={(e) => setScheduleForm({ ...scheduleForm, cron_expression: e.target.value })}
            placeholder={t('scheduleModal.cronPlaceholder')}
            helperText={t('scheduleModal.cronHelperText')}
            className="font-mono text-sm"
          />

          <Input
            label={t('scheduleModal.retentionLabel')}
            type="number"
            value={scheduleForm.retention_days}
            onChange={(e) => setScheduleForm({ ...scheduleForm, retention_days: parseInt(e.target.value) })}
            min="1"
          />

          <div className="space-y-3">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={scheduleForm.is_enabled}
                onChange={(e) => setScheduleForm({ ...scheduleForm, is_enabled: e.target.checked })}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:border-gray-600 dark:focus:ring-blue-600"
              />
              <span className="ml-3 text-sm text-gray-700 dark:text-gray-300">{t('scheduleModal.enableSchedule')}</span>
            </label>
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={scheduleForm.includes_database}
                onChange={(e) => setScheduleForm({ ...scheduleForm, includes_database: e.target.checked })}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:border-gray-600 dark:focus:ring-blue-600"
              />
              <span className="ml-3 text-sm text-gray-700 dark:text-gray-300">{t('scheduleModal.includeDatabase')}</span>
            </label>
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={scheduleForm.includes_storage}
                onChange={(e) => setScheduleForm({ ...scheduleForm, includes_storage: e.target.checked })}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:border-gray-600 dark:focus:ring-blue-600"
              />
              <span className="ml-3 text-sm text-gray-700 dark:text-gray-300">{t('scheduleModal.includeStorage')}</span>
            </label>
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={scheduleForm.includes_config}
                onChange={(e) => setScheduleForm({ ...scheduleForm, includes_config: e.target.checked })}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:border-gray-600 dark:focus:ring-blue-600"
              />
              <span className="ml-3 text-sm text-gray-700 dark:text-gray-300">{t('scheduleModal.includeConfig')}</span>
            </label>
          </div>
        </div>
      </Modal>
    </div>
  );
}
