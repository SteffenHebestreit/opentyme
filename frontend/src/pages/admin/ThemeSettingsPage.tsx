/**
 * @fileoverview Theme settings page for output theming (PDFs and emails).
 * Users can set primary/secondary/accent colors and a background image URL.
 * Colors are applied to generated PDFs and rendered MJML email templates.
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import apiClient from '@/api/services/client';
import { Button } from '@/components/common/Button';
import { Alert } from '@/components/common/Alert';
import { Input } from '@/components/forms/Input';

interface ThemeSettings {
  theme_primary_color: string;
  theme_secondary_color: string;
  theme_accent_color: string;
  theme_background_image_url: string;
  company_logo_url: string;
}

const DEFAULT_THEME: ThemeSettings = {
  theme_primary_color: '#7c3aed',
  theme_secondary_color: '#5b21b6',
  theme_accent_color: '#f59e0b',
  theme_background_image_url: '',
  company_logo_url: '',
};

export default function ThemeSettingsPage() {
  const { t } = useTranslation('settings');
  const [theme, setTheme] = useState<ThemeSettings>(DEFAULT_THEME);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    apiClient.get('/settings').then((res) => {
      const d = res.data;
      setTheme({
        theme_primary_color: d.theme_primary_color ?? DEFAULT_THEME.theme_primary_color,
        theme_secondary_color: d.theme_secondary_color ?? DEFAULT_THEME.theme_secondary_color,
        theme_accent_color: d.theme_accent_color ?? DEFAULT_THEME.theme_accent_color,
        theme_background_image_url: d.theme_background_image_url ?? '',
        company_logo_url: d.company_logo_url ?? '',
      });
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      await apiClient.put('/settings', {
        theme_primary_color: theme.theme_primary_color,
        theme_secondary_color: theme.theme_secondary_color,
        theme_accent_color: theme.theme_accent_color,
        theme_background_image_url: theme.theme_background_image_url || null,
        company_logo_url: theme.company_logo_url || null,
      });
      setSaveMsg({ type: 'success', text: t('admin.theme.saveSuccess') });
    } catch {
      setSaveMsg({ type: 'error', text: t('admin.theme.saveError') });
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () => setTheme(DEFAULT_THEME);

  const colorField = (
    key: keyof Pick<ThemeSettings, 'theme_primary_color' | 'theme_secondary_color' | 'theme_accent_color'>,
    label: string,
    description: string
  ) => (
    <div className="flex items-start gap-4">
      <div className="relative flex-shrink-0">
        <input
          type="color"
          value={theme[key]}
          onChange={(e) => setTheme((s) => ({ ...s, [key]: e.target.value }))}
          className="h-12 w-12 cursor-pointer rounded-lg border border-gray-300 dark:border-gray-600 p-1"
        />
      </div>
      <div className="flex-1">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
        <input
          type="text"
          value={theme[key]}
          onChange={(e) => {
            const val = e.target.value;
            if (/^#[0-9a-fA-F]{0,6}$/.test(val)) setTheme((s) => ({ ...s, [key]: val }));
          }}
          maxLength={7}
          className="mt-1 w-32 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs font-mono text-gray-900 dark:text-gray-100"
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          {t('admin.theme.title')}
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t('admin.theme.subtitle')}
        </p>
      </div>

      {/* Color pickers */}
      <div className="space-y-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {t('admin.theme.colors')}
        </h3>
        {colorField('theme_primary_color', t('admin.theme.primaryColor'), t('admin.theme.primaryColorDesc'))}
        {colorField('theme_secondary_color', t('admin.theme.secondaryColor'), t('admin.theme.secondaryColorDesc'))}
        {colorField('theme_accent_color', t('admin.theme.accentColor'), t('admin.theme.accentColorDesc'))}
      </div>

      {/* Preview strip */}
      <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
        <div
          className="px-6 py-4 text-white font-semibold"
          style={{ backgroundColor: theme.theme_primary_color }}
        >
          {t('admin.theme.preview')} — {t('admin.theme.primaryColor')}
        </div>
        <div
          className="px-6 py-3 text-white text-sm"
          style={{ backgroundColor: theme.theme_secondary_color }}
        >
          {t('admin.theme.secondaryColor')}
        </div>
        <div
          className="px-6 py-2 text-white text-xs"
          style={{ backgroundColor: theme.theme_accent_color }}
        >
          {t('admin.theme.accentColor')}
        </div>
      </div>

      {/* Branding URLs */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-4">
          {t('admin.theme.branding')}
        </h3>
        <div className="max-w-lg space-y-2">
          <Input
            label={t('admin.theme.logoUrl')}
            type="url"
            value={theme.company_logo_url}
            onChange={(e) => setTheme((s) => ({ ...s, company_logo_url: e.target.value }))}
            placeholder="https://example.com/logo.png"
            helperText={t('admin.theme.logoUrlDesc')}
          />
          <Input
            label={t('admin.theme.backgroundImageUrl')}
            type="url"
            value={theme.theme_background_image_url}
            onChange={(e) => setTheme((s) => ({ ...s, theme_background_image_url: e.target.value }))}
            placeholder="https://example.com/background.png"
            helperText={t('admin.theme.backgroundImageUrlDesc')}
          />
        </div>
      </div>

      {/* Logo preview */}
      {theme.company_logo_url && (
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{t('admin.theme.logoPreview')}</p>
          <img
            src={theme.company_logo_url}
            alt="Logo preview"
            className="h-16 object-contain rounded border border-gray-200 dark:border-gray-700 bg-white p-2"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <Button variant="primary" size="sm" isLoading={saving} onClick={handleSave}>
          {t('admin.theme.save')}
        </Button>
        <Button variant="outline" size="sm" onClick={resetDefaults}>
          {t('admin.theme.reset')}
        </Button>
      </div>
      {saveMsg && (
        <Alert type={saveMsg.type} message={saveMsg.text} />
      )}
    </div>
  );
}
