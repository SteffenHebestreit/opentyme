/**
 * @fileoverview Email / SMTP settings page in the Admin configuration area.
 * Allows users to configure their SMTP server for outgoing emails and send a test.
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BellRing, MailCheck, Save, Send, Server } from 'lucide-react';
import apiClient from '@/api/services/client';
import { Button } from '@/components/common/Button';
import { Alert } from '@/components/common/Alert';
import { fieldClasses } from '@/components/forms/fieldStyles';
import {
  SettingsCheckbox,
  SettingsField,
  SettingsHeader,
  SettingsSaveBar,
  SettingsSection,
  SettingsSwitch,
} from '@/components/admin/SettingsSection';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/cn';

interface SmtpSettings {
  smtp_enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  smtp_from: string;
  smtp_secure: boolean;
  overdue_reminders_enabled: boolean;
}

export default function EmailSettingsPage() {
  const { t } = useTranslation('settings');
  const [settings, setSettings] = useState<SmtpSettings>({
    smtp_enabled: false,
    smtp_host: '',
    smtp_port: 587,
    smtp_user: '',
    smtp_pass: '',
    smtp_from: '',
    smtp_secure: false,
    overdue_reminders_enabled: false,
  });
  const [testEmail, setTestEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    apiClient.get('/settings').then((res) => {
      const d = res.data;
      setSettings({
        smtp_enabled: d.smtp_enabled ?? false,
        smtp_host: d.smtp_host ?? '',
        smtp_port: d.smtp_port ?? 587,
        smtp_user: d.smtp_user ?? '',
        smtp_pass: '', // never send password back to frontend
        smtp_from: d.smtp_from ?? '',
        smtp_secure: d.smtp_secure ?? false,
        overdue_reminders_enabled: d.overdue_reminders_enabled ?? false,
      });
      if (d.smtp_user) setTestEmail(d.smtp_from || d.smtp_user);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        smtp_enabled: settings.smtp_enabled,
        smtp_host: settings.smtp_host,
        smtp_port: settings.smtp_port,
        smtp_user: settings.smtp_user,
        smtp_from: settings.smtp_from,
        smtp_secure: settings.smtp_secure,
        overdue_reminders_enabled: settings.overdue_reminders_enabled,
      };
      // Only send password if user typed something
      if (settings.smtp_pass) payload.smtp_pass = settings.smtp_pass;
      await apiClient.put('/settings', payload);
      toast.success(t('admin.email.saveSuccess'));
    } catch {
      toast.error(t('admin.email.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testEmail) return;
    setTesting(true);
    setTestMsg(null);
    try {
      await apiClient.post('/settings/test-smtp', {
        to: testEmail,
        host: settings.smtp_host || undefined,
        port: settings.smtp_port,
        user: settings.smtp_user || undefined,
        pass: settings.smtp_pass || undefined,
        from: settings.smtp_from || undefined,
        secure: settings.smtp_secure,
      });
      setTestMsg({ type: 'success', text: t('admin.email.testSuccess', { to: testEmail }) });
    } catch (err: any) {
      setTestMsg({ type: 'error', text: err?.response?.data?.error ?? t('admin.email.testError') });
    } finally {
      setTesting(false);
    }
  };

  const field = fieldClasses();

  return (
    <div className="space-y-6">
      <SettingsHeader title={t('admin.email.title')} description={t('admin.email.subtitle')} />

      {/* SMTP server */}
      <SettingsSection
        icon={Server}
        title={t('admin.email.serverTitle')}
        description={t('admin.email.serverHint')}
        action={
          <>
            <label
              htmlFor="smtp-enabled"
              className="hidden cursor-pointer text-sm font-medium text-gray-600 sm:block dark:text-gray-300"
            >
              {t('admin.email.enableSmtp')}
            </label>
            <SettingsSwitch
              id="smtp-enabled"
              checked={settings.smtp_enabled}
              onChange={(checked) => setSettings((s) => ({ ...s, smtp_enabled: checked }))}
              label={t('admin.email.enableSmtp')}
            />
          </>
        }
      >
        <div
          className={cn(
            'grid grid-cols-1 gap-5 transition-opacity duration-200 sm:grid-cols-2',
            !settings.smtp_enabled && 'pointer-events-none opacity-50'
          )}
          aria-disabled={!settings.smtp_enabled || undefined}
        >
          <SettingsField label={t('admin.email.host')} htmlFor="smtp-host">
            <input
              id="smtp-host"
              value={settings.smtp_host}
              onChange={(e) => setSettings((s) => ({ ...s, smtp_host: e.target.value }))}
              placeholder="mailhog"
              className={field}
            />
          </SettingsField>
          <SettingsField label={t('admin.email.port')} htmlFor="smtp-port">
            <input
              id="smtp-port"
              type="number"
              value={settings.smtp_port}
              onChange={(e) => setSettings((s) => ({ ...s, smtp_port: parseInt(e.target.value) || 587 }))}
              placeholder="587"
              className={cn(field, 'tabular-nums')}
            />
          </SettingsField>
          <SettingsField label={t('admin.email.user')} htmlFor="smtp-user">
            <input
              id="smtp-user"
              value={settings.smtp_user}
              onChange={(e) => setSettings((s) => ({ ...s, smtp_user: e.target.value }))}
              placeholder="user@example.com"
              className={field}
            />
          </SettingsField>
          <SettingsField label={t('admin.email.pass')} htmlFor="smtp-pass">
            <input
              id="smtp-pass"
              type="password"
              value={settings.smtp_pass}
              onChange={(e) => setSettings((s) => ({ ...s, smtp_pass: e.target.value }))}
              placeholder="••••••••"
              className={field}
            />
          </SettingsField>
          <SettingsField label={t('admin.email.from')} htmlFor="smtp-from">
            <input
              id="smtp-from"
              value={settings.smtp_from}
              onChange={(e) => setSettings((s) => ({ ...s, smtp_from: e.target.value }))}
              placeholder="noreply@example.com"
              className={field}
            />
          </SettingsField>
          <div className="flex items-end sm:pb-2.5">
            <SettingsCheckbox
              label={t('admin.email.secure')}
              checked={settings.smtp_secure}
              onChange={(e) => setSettings((s) => ({ ...s, smtp_secure: e.target.checked }))}
            />
          </div>
        </div>
      </SettingsSection>

      {/* Notification preferences */}
      <SettingsSection
        icon={BellRing}
        title={t('admin.email.notificationsTitle')}
        description={t('admin.email.overdueRemindersHint')}
      >
        <SettingsCheckbox
          label={t('admin.email.overdueReminders')}
          checked={settings.overdue_reminders_enabled}
          onChange={(e) => setSettings((s) => ({ ...s, overdue_reminders_enabled: e.target.checked }))}
        />
      </SettingsSection>

      {/* Save */}
      <SettingsSaveBar status={<span className="hidden sm:inline">{t('admin.general.saveHint')}</span>}>
        <Button
          type="button"
          isLoading={saving}
          onClick={handleSave}
          leftIcon={<Save className="h-4 w-4" />}
        >
          {t('admin.email.save')}
        </Button>
      </SettingsSaveBar>

      {/* Test email section */}
      <SettingsSection
        icon={MailCheck}
        title={t('admin.email.testTitle')}
        description={t('admin.email.testSubtitle')}
      >
        <div className="flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end">
          <SettingsField label={t('admin.email.testRecipient')} htmlFor="smtp-test-to" className="flex-1">
            <input
              id="smtp-test-to"
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="you@example.com"
              className={field}
            />
          </SettingsField>
          <Button
            type="button"
            variant="secondary"
            className="min-h-10"
            isLoading={testing}
            disabled={!testEmail}
            onClick={handleTest}
            leftIcon={<Send className="h-4 w-4" />}
          >
            {testing ? t('admin.email.sending') : t('admin.email.sendTest')}
          </Button>
        </div>
        {testMsg && (
          <Alert type={testMsg.type} message={testMsg.text} className="mt-4" onClose={() => setTestMsg(null)} />
        )}
        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          MailHog UI:{' '}
          <a
            href="http://localhost:8025"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-brand-600 underline-offset-2 hover:underline dark:text-brand-400"
          >
            http://localhost:8025
          </a>
        </p>
      </SettingsSection>
    </div>
  );
}
