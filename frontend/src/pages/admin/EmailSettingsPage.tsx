/**
 * @fileoverview Email / SMTP settings page in the Admin configuration area.
 * Allows users to configure their SMTP server for outgoing emails and send a test.
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import apiClient from '@/api/services/client';
import { Button } from '@/components/common/Button';
import { Alert } from '@/components/common/Alert';
import { Input } from '@/components/forms/Input';
import { Checkbox } from '@/components/forms/CheckboxRadioSwitch';

interface SmtpSettings {
  smtp_enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  smtp_from: string;
  smtp_secure: boolean;
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
  });
  const [testEmail, setTestEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
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
      });
      if (d.smtp_user) setTestEmail(d.smtp_from || d.smtp_user);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const payload: Record<string, any> = {
        smtp_enabled: settings.smtp_enabled,
        smtp_host: settings.smtp_host,
        smtp_port: settings.smtp_port,
        smtp_user: settings.smtp_user,
        smtp_from: settings.smtp_from,
        smtp_secure: settings.smtp_secure,
      };
      // Only send password if user typed something
      if (settings.smtp_pass) payload.smtp_pass = settings.smtp_pass;
      await apiClient.put('/settings', payload);
      setSaveMsg({ type: 'success', text: t('admin.email.saveSuccess') });
    } catch {
      setSaveMsg({ type: 'error', text: t('admin.email.saveError') });
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          {t('admin.email.title')}
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t('admin.email.subtitle')}
        </p>
      </div>

      {/* Enable SMTP */}
      <Checkbox
        label={t('admin.email.enableSmtp')}
        checked={settings.smtp_enabled}
        onChange={(e) => setSettings((s) => ({ ...s, smtp_enabled: e.target.checked }))}
      />

      {/* SMTP fields */}
      <div className={`grid grid-cols-1 gap-x-6 sm:grid-cols-2 transition-opacity ${!settings.smtp_enabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <Input
          label={t('admin.email.host')}
          value={settings.smtp_host}
          onChange={(e) => setSettings((s) => ({ ...s, smtp_host: e.target.value }))}
          placeholder="mailhog"
        />
        <Input
          label={t('admin.email.port')}
          type="number"
          value={settings.smtp_port}
          onChange={(e) => setSettings((s) => ({ ...s, smtp_port: parseInt(e.target.value) || 587 }))}
          placeholder="587"
        />
        <Input
          label={t('admin.email.user')}
          value={settings.smtp_user}
          onChange={(e) => setSettings((s) => ({ ...s, smtp_user: e.target.value }))}
          placeholder="user@example.com"
        />
        <Input
          label={t('admin.email.pass')}
          type="password"
          value={settings.smtp_pass}
          onChange={(e) => setSettings((s) => ({ ...s, smtp_pass: e.target.value }))}
          placeholder="••••••••"
        />
        <Input
          label={t('admin.email.from')}
          value={settings.smtp_from}
          onChange={(e) => setSettings((s) => ({ ...s, smtp_from: e.target.value }))}
          placeholder="noreply@example.com"
        />
        <div className="flex items-end pb-6">
          <Checkbox
            label={`${t('admin.email.secure')} (TLS/SSL)`}
            checked={settings.smtp_secure}
            onChange={(e) => setSettings((s) => ({ ...s, smtp_secure: e.target.checked }))}
          />
        </div>
      </div>

      {/* Save */}
      <div>
        <Button variant="primary" size="sm" isLoading={saving} onClick={handleSave}>
          {t('admin.email.save')}
        </Button>
        {saveMsg && (
          <div className="mt-3">
            <Alert type={saveMsg.type} message={saveMsg.text} />
          </div>
        )}
      </div>

      {/* Test email section */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
          {t('admin.email.testTitle')}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {t('admin.email.testSubtitle')}
        </p>
        <div className="flex items-end gap-3 max-w-lg">
          <div className="flex-1">
            <Input
              label={t('admin.email.testRecipient')}
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="pb-6">
            <Button
              variant="primary"
              size="sm"
              isLoading={testing}
              disabled={!testEmail}
              onClick={handleTest}
            >
              {t('admin.email.sendTest')}
            </Button>
          </div>
        </div>
        {testMsg && (
          <div className="mt-2">
            <Alert type={testMsg.type} message={testMsg.text} />
          </div>
        )}
        <p className="mt-3 text-xs text-gray-400">
          MailHog UI: <a href="http://localhost:8025" target="_blank" rel="noreferrer" className="underline">http://localhost:8025</a>
        </p>
      </div>
    </div>
  );
}
