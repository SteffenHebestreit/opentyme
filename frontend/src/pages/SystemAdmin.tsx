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
import { getAppLocale } from '../utils/locale';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArchiveRestore,
  CalendarClock,
  CheckCircle2,
  Clock,
  Database,
  HardDrive,
  History,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import { backupService } from '../api/services/backup.service';
import Modal from '../components/ui/Modal';
import { Input } from '../components/forms/Input';
import { fieldLabelClass } from '../components/forms/fieldStyles';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Table,
  Column,
  Tabs,
  TabPanel,
} from '../components/common';
import type { BadgeVariant } from '../components/common/Badge';
import { toast } from '../lib/toast';
import { confirmDialog } from '../lib/confirm';

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

const checkboxClass =
  'h-4 w-4 shrink-0 rounded border-gray-300 text-brand-600 accent-brand-600 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-900';

const iconButton =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-gray-500';

const statusVariant: Record<Backup['status'], BadgeVariant> = {
  completed: 'green',
  failed: 'red',
  in_progress: 'blue',
  pending: 'gray',
};

/** Labelled checkbox used in both dialogs. */
function IncludeOption({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={checkboxClass}
      />
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
    </label>
  );
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
      toast.success(t('backups.createSuccess'));

      await loadBackups();
    } catch (err: any) {
      setError(err.message || t('backups.createError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestoreBackup = async (backup: Backup) => {
    const confirmed = await confirmDialog({
      title: t('backups.confirmRestoreTitle', { name: backup.backup_name }),
      message: t('backups.confirmRestore'),
      tone: 'danger',
      confirmLabel: t('backups.actions.restore'),
    });
    if (!confirmed) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      await backupService.restoreBackup(backup.id);

      toast.success(t('backups.restoreSuccess'), { duration: 8000 });
    } catch (err: any) {
      setError(err.message || t('backups.restoreError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteBackup = async (backup: Backup) => {
    const confirmed = await confirmDialog({
      title: t('backups.confirmDeleteTitle', { name: backup.backup_name }),
      message: t('backups.confirmDelete'),
      tone: 'danger',
      confirmLabel: t('backups.actions.delete'),
    });
    if (!confirmed) {
      return;
    }

    try {
      await backupService.deleteBackup(backup.id);
      toast.success(t('backups.deleteSuccess'));
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
      toast.success(selectedSchedule ? t('schedules.updateSuccess') : t('schedules.createSuccess'));

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
      setError(err.message || (selectedSchedule ? t('schedules.updateError') : t('schedules.createError')));
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

  const handleDeleteSchedule = async (schedule: Schedule) => {
    const confirmed = await confirmDialog({
      title: t('schedules.confirmDeleteTitle', { name: schedule.schedule_name }),
      message: t('schedules.confirmDelete'),
      tone: 'danger',
      confirmLabel: t('schedules.actions.delete'),
    });
    if (!confirmed) {
      return;
    }

    try {
      await backupService.deleteSchedule(schedule.id);
      toast.success(t('schedules.deleteSuccess'));
      await loadSchedules();
    } catch (err: any) {
      setError(err.message || t('schedules.deleteError'));
    }
  };

  const closeScheduleModal = () => {
    setShowScheduleModal(false);
    setSelectedSchedule(null);
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes) return '—';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-3 w-3" />;
      case 'failed':
        return <XCircle className="h-3 w-3" />;
      case 'in_progress':
        return <Loader2 className="h-3 w-3 animate-spin" />;
      default:
        return <Clock className="h-3 w-3" />;
    }
  };

  const includeBadges = (item: { includes_database: boolean; includes_storage: boolean; includes_config: boolean }) => (
    <div className="flex flex-wrap gap-1.5">
      {item.includes_database && (
        <Badge variant="brand" size="sm">
          {t('backups.includes.database')}
        </Badge>
      )}
      {item.includes_storage && (
        <Badge variant="orange" size="sm">
          {t('backups.includes.storage')}
        </Badge>
      )}
      {item.includes_config && (
        <Badge variant="teal" size="sm">
          {t('backups.includes.config')}
        </Badge>
      )}
    </div>
  );

  const columns: Column<Backup>[] = useMemo(() => [
    {
      key: 'status',
      accessorKey: 'status',
      header: t('backups.table.status'),
      render: (backup) => (
        <span title={backup.error_message || undefined}>
          <Badge variant={statusVariant[backup.status] ?? 'gray'} icon={getStatusIcon(backup.status)}>
            {t(`backups.status.${backup.status}`, { defaultValue: backup.status })}
          </Badge>
        </span>
      ),
      sortable: true,
    },
    {
      key: 'name',
      accessorKey: 'backup_name',
      header: t('backups.table.name'),
      render: (backup) => (
        <span className="whitespace-nowrap font-medium text-gray-900 dark:text-white">
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
      render: (backup) => includeBadges(backup),
    },
    {
      key: 'size',
      accessorKey: 'file_size_bytes',
      header: t('backups.table.size'),
      align: 'right',
      render: (backup) => (
        <span className="whitespace-nowrap tabular-nums text-gray-500 dark:text-gray-400">
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
        <span className="whitespace-nowrap tabular-nums text-gray-500 dark:text-gray-400">
          {new Date(backup.started_at).toLocaleString(getAppLocale())}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('backups.table.actions')}</span>,
      align: 'right',
      render: (backup) => (
        <div className="flex justify-end gap-1">
          {backup.status === 'completed' && (
            <button
              type="button"
              onClick={() => handleRestoreBackup(backup)}
              className={`${iconButton} hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10 dark:hover:text-amber-400`}
              title={t('backups.actions.restore')}
              aria-label={t('backups.actions.restore')}
            >
              <ArchiveRestore className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => handleDeleteBackup(backup)}
            className={`${iconButton} hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400`}
            title={t('backups.actions.delete')}
            aria-label={t('backups.actions.delete')}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ], [t]);

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} subtitle={t('subtitle')} icon={ShieldCheck} />

      {/* Error Display */}
      {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'backups', label: t('tabs.backups'), icon: Database, badge: backups.length },
          { id: 'schedules', label: t('tabs.schedules'), icon: CalendarClock, badge: schedules.length }
        ]}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId as 'backups' | 'schedules')}
      />

      {/* Backups Tab */}
      <TabPanel tabId="backups" activeTab={activeTab}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="section-title">{t('backups.title')}</h2>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{t('backups.subtitle')}</p>
            </div>
            <Button
              type="button"
              onClick={() => setShowBackupModal(true)}
              disabled={isLoading}
              leftIcon={<Plus className="h-4 w-4" />}
            >
              {t('backups.createButton')}
            </Button>
          </div>

          {/* Backups List */}
          <Table
            columns={columns}
            data={backups}
            isLoading={isLoading}
            emptyMessage={
              <EmptyState
                compact
                icon={HardDrive}
                title={t('backups.noBackups')}
                description={t('backups.noBackupsHint')}
              />
            }
            pageSize={10}
          />

          {/* Danger zone: what restore and delete do */}
          <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 sm:p-5 dark:border-red-500/20 dark:bg-red-500/[0.05]">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 text-sm">
                <h3 className="font-semibold text-red-900 dark:text-red-200">{t('dangerZone.title')}</h3>
                <ul className="mt-1.5 space-y-1 text-red-800/90 dark:text-red-200/80">
                  <li className="flex items-start gap-2">
                    <ArchiveRestore className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {t('dangerZone.restore')}
                  </li>
                  <li className="flex items-start gap-2">
                    <Trash2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {t('dangerZone.delete')}
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </TabPanel>

      {/* Schedules Tab */}
      <TabPanel tabId="schedules" activeTab={activeTab}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="section-title">{t('schedules.title')}</h2>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{t('schedules.subtitle')}</p>
            </div>
            <Button
              type="button"
              onClick={() => {
                setSelectedSchedule(null);
                // Start from the defaults, not from a schedule that was opened for editing and cancelled
                setScheduleForm({
                  schedule_name: '',
                  is_enabled: true,
                  cron_expression: '0 2 * * *',
                  includes_database: true,
                  includes_storage: true,
                  includes_config: false,
                  retention_days: 30,
                });
                setShowScheduleModal(true);
              }}
              leftIcon={<Plus className="h-4 w-4" />}
            >
              {t('schedules.createButton')}
            </Button>
          </div>

          {/* Schedules List */}
          {schedules.length === 0 ? (
            <EmptyState
              bordered
              icon={CalendarClock}
              title={t('schedules.noSchedules')}
              description={t('schedules.noSchedulesHint')}
            />
          ) : (
            <div className="stagger grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {schedules.map((schedule) => (
                <div key={schedule.id} className="surface flex flex-col overflow-hidden">
                  <div className="flex-1 space-y-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold text-gray-900 dark:text-white">
                          {schedule.schedule_name}
                        </h3>
                        <code className="mt-1 inline-block rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                          {schedule.cron_expression}
                        </code>
                      </div>
                      <Badge variant={schedule.is_enabled ? 'green' : 'gray'} dot>
                        {schedule.is_enabled ? t('schedules.enabled') : t('schedules.disabled')}
                      </Badge>
                    </div>

                    <dl className="space-y-1.5 text-sm">
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                        <History className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                        <dt>{t('schedules.retention')}:</dt>
                        <dd className="tabular-nums text-gray-900 dark:text-gray-200">
                          {schedule.retention_days} {t('common:time.days')}
                        </dd>
                      </div>
                      {schedule.last_run_at && (
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                          <Clock className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                          <dt>{t('schedules.lastRun')}:</dt>
                          <dd className="tabular-nums text-gray-900 dark:text-gray-200">
                            {new Date(schedule.last_run_at).toLocaleString(getAppLocale())}
                          </dd>
                        </div>
                      )}
                      {schedule.next_run_at && (
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                          <CalendarClock className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                          <dt>{t('schedules.nextRun')}:</dt>
                          <dd className="tabular-nums text-gray-900 dark:text-gray-200">
                            {new Date(schedule.next_run_at).toLocaleString(getAppLocale())}
                          </dd>
                        </div>
                      )}
                    </dl>

                    {includeBadges(schedule)}
                  </div>

                  <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50/70 px-5 py-3 dark:border-gray-800 dark:bg-white/[0.02]">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteSchedule(schedule)}
                      leftIcon={<Trash2 className="h-4 w-4" />}
                      className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                    >
                      {t('schedules.actions.delete')}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => handleEditSchedule(schedule)}
                      leftIcon={<Pencil className="h-4 w-4" />}
                    >
                      {t('schedules.actions.edit')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </TabPanel>

      {/* Create Backup Modal */}
      <Modal
        open={showBackupModal}
        title={t('createBackupModal.title')}
        icon={<Database className="h-4 w-4" />}
        onClose={() => setShowBackupModal(false)}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setShowBackupModal(false)}>
              {t('createBackupModal.cancel')}
            </Button>
            <Button type="button" onClick={handleCreateBackup} isLoading={isLoading}>
              {isLoading ? t('createBackupModal.creatingButton') : t('createBackupModal.createButton')}
            </Button>
          </>
        }
      >
        <div className="space-y-1">
          <Input
            label={t('createBackupModal.nameLabel')}
            type="text"
            value={backupForm.backup_name}
            onChange={(e) => setBackupForm({ ...backupForm, backup_name: e.target.value })}
            placeholder={t('createBackupModal.namePlaceholder')}
          />

          <div>
            <p className={fieldLabelClass()}>{t('createBackupModal.includesLabel')}</p>
            <div className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
              <IncludeOption
                checked={backupForm.includes_database}
                onChange={(checked) => setBackupForm({ ...backupForm, includes_database: checked })}
                label={t('createBackupModal.includeDatabase')}
              />
              <IncludeOption
                checked={backupForm.includes_storage}
                onChange={(checked) => setBackupForm({ ...backupForm, includes_storage: checked })}
                label={t('createBackupModal.includeStorage')}
              />
              <IncludeOption
                checked={backupForm.includes_config}
                onChange={(checked) => setBackupForm({ ...backupForm, includes_config: checked })}
                label={t('createBackupModal.includeConfig')}
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* Create/Edit Schedule Modal */}
      <Modal
        open={showScheduleModal}
        title={selectedSchedule ? t('scheduleModal.titleEdit') : t('scheduleModal.titleCreate')}
        icon={<CalendarClock className="h-4 w-4" />}
        onClose={closeScheduleModal}
        size="md"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeScheduleModal}>
              {t('scheduleModal.cancel')}
            </Button>
            <Button type="button" onClick={handleCreateSchedule} isLoading={isLoading}>
              {isLoading ? t('scheduleModal.savingButton') : selectedSchedule ? t('scheduleModal.updateButton') : t('scheduleModal.createButton')}
            </Button>
          </>
        }
      >
        <div className="space-y-1">
          <Input
            label={t('scheduleModal.nameLabel')}
            type="text"
            value={scheduleForm.schedule_name}
            onChange={(e) => setScheduleForm({ ...scheduleForm, schedule_name: e.target.value })}
            placeholder={t('scheduleModal.namePlaceholder')}
          />

          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Input
                label={t('scheduleModal.cronLabel')}
                type="text"
                value={scheduleForm.cron_expression}
                onChange={(e) => setScheduleForm({ ...scheduleForm, cron_expression: e.target.value })}
                placeholder={t('scheduleModal.cronPlaceholder')}
                helperText={t('scheduleModal.cronHelperText')}
                className="font-mono text-sm"
              />
            </div>

            <Input
              label={t('scheduleModal.retentionLabel')}
              type="number"
              value={scheduleForm.retention_days}
              onChange={(e) => setScheduleForm({ ...scheduleForm, retention_days: parseInt(e.target.value) })}
              min="1"
              className="tabular-nums"
            />
          </div>

          <div className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
            <IncludeOption
              checked={scheduleForm.is_enabled}
              onChange={(checked) => setScheduleForm({ ...scheduleForm, is_enabled: checked })}
              label={t('scheduleModal.enableSchedule')}
            />
            <IncludeOption
              checked={scheduleForm.includes_database}
              onChange={(checked) => setScheduleForm({ ...scheduleForm, includes_database: checked })}
              label={t('scheduleModal.includeDatabase')}
            />
            <IncludeOption
              checked={scheduleForm.includes_storage}
              onChange={(checked) => setScheduleForm({ ...scheduleForm, includes_storage: checked })}
              label={t('scheduleModal.includeStorage')}
            />
            <IncludeOption
              checked={scheduleForm.includes_config}
              onChange={(checked) => setScheduleForm({ ...scheduleForm, includes_config: checked })}
              label={t('scheduleModal.includeConfig')}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
