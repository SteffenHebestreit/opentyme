/**
 * @fileoverview Theme settings page for output theming (PDFs and emails).
 * Users can set primary/secondary/accent colors and a background image URL.
 * Colors are applied to generated PDFs and rendered MJML email templates.
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, ImageIcon, Palette, RotateCcw, Save } from 'lucide-react';
import apiClient from '@/api/services/client';
import { Button } from '@/components/common/Button';
import { fieldClasses } from '@/components/forms/fieldStyles';
import {
  SettingsField,
  SettingsHeader,
  SettingsSaveBar,
  SettingsSection,
} from '@/components/admin/SettingsSection';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/cn';

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
    try {
      await apiClient.put('/settings', {
        theme_primary_color: theme.theme_primary_color,
        theme_secondary_color: theme.theme_secondary_color,
        theme_accent_color: theme.theme_accent_color,
        theme_background_image_url: theme.theme_background_image_url || null,
        company_logo_url: theme.company_logo_url || null,
      });
      toast.success(t('admin.theme.saveSuccess'));
    } catch {
      toast.error(t('admin.theme.saveError'));
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
    <div className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
      <label
        className="relative h-11 w-11 shrink-0 cursor-pointer overflow-hidden rounded-lg shadow-sm ring-1 ring-inset ring-black/10 transition-shadow hover:ring-black/20 dark:ring-white/15 dark:hover:ring-white/30"
        style={{ backgroundColor: theme[key] }}
        title={label}
      >
        <input
          type="color"
          value={theme[key]}
          onChange={(e) => setTheme((s) => ({ ...s, [key]: e.target.value }))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label={label}
        />
      </label>
      <div className="min-w-0 flex-1">
        <label htmlFor={`theme-${key}`} className="block text-sm font-medium text-gray-900 dark:text-gray-100">
          {label}
        </label>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{description}</p>
      </div>
      <div className="w-24 shrink-0">
        <input
          id={`theme-${key}`}
          type="text"
          value={theme[key]}
          onChange={(e) => {
            const val = e.target.value;
            if (/^#[0-9a-fA-F]{0,6}$/.test(val)) setTheme((s) => ({ ...s, [key]: val }));
          }}
          maxLength={7}
          spellCheck={false}
          className={cn(fieldClasses({ size: 'sm' }), 'font-mono uppercase')}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <SettingsHeader title={t('admin.theme.title')} description={t('admin.theme.subtitle')} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        {/* Color pickers */}
        <SettingsSection icon={Palette} title={t('admin.theme.colors')} className="xl:col-span-3">
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {colorField('theme_primary_color', t('admin.theme.primaryColor'), t('admin.theme.primaryColorDesc'))}
            {colorField('theme_secondary_color', t('admin.theme.secondaryColor'), t('admin.theme.secondaryColorDesc'))}
            {colorField('theme_accent_color', t('admin.theme.accentColor'), t('admin.theme.accentColorDesc'))}
          </div>
        </SettingsSection>

        {/* Preview: a miniature document using the colours */}
        <SettingsSection
          icon={Eye}
          title={t('admin.theme.preview')}
          description={t('admin.theme.previewHint')}
          className="xl:col-span-2"
        >
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700">
            <div
              className="flex items-center justify-between gap-3 px-5 py-4 text-white transition-colors duration-300"
              style={{ backgroundColor: theme.theme_primary_color }}
            >
              <span className="text-sm font-semibold">{t('admin.theme.primaryColor')}</span>
              {theme.company_logo_url && (
                <img
                  src={theme.company_logo_url}
                  alt=""
                  className="h-6 max-w-[96px] rounded bg-white/90 object-contain p-0.5"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
              )}
            </div>
            <div
              className="px-5 py-2.5 text-xs font-medium text-white transition-colors duration-300"
              style={{ backgroundColor: theme.theme_secondary_color }}
            >
              {t('admin.theme.secondaryColor')}
            </div>
            <div className="space-y-2 px-5 py-4">
              <div className="h-2 w-3/4 rounded-full bg-gray-200" />
              <div className="h-2 w-1/2 rounded-full bg-gray-200" />
              <div className="h-2 w-2/3 rounded-full bg-gray-200" />
              <div className="pt-2">
                <span
                  className="inline-flex rounded-md px-3 py-1.5 text-xs font-semibold text-white transition-colors duration-300"
                  style={{ backgroundColor: theme.theme_accent_color }}
                >
                  {t('admin.theme.accentColor')}
                </span>
              </div>
            </div>
          </div>
        </SettingsSection>
      </div>

      {/* Branding URLs */}
      <SettingsSection icon={ImageIcon} title={t('admin.theme.branding')}>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <SettingsField
            label={t('admin.theme.logoUrl')}
            htmlFor="theme-logo-url"
            hint={t('admin.theme.logoUrlDesc')}
          >
            <input
              id="theme-logo-url"
              type="url"
              value={theme.company_logo_url}
              onChange={(e) => setTheme((s) => ({ ...s, company_logo_url: e.target.value }))}
              placeholder="https://example.com/logo.png"
              className={fieldClasses()}
            />
          </SettingsField>
          <SettingsField
            label={t('admin.theme.backgroundImageUrl')}
            htmlFor="theme-bg-url"
            hint={t('admin.theme.backgroundImageUrlDesc')}
          >
            <input
              id="theme-bg-url"
              type="url"
              value={theme.theme_background_image_url}
              onChange={(e) => setTheme((s) => ({ ...s, theme_background_image_url: e.target.value }))}
              placeholder="https://example.com/background.png"
              className={fieldClasses()}
            />
          </SettingsField>
        </div>

        {/* Logo preview */}
        {theme.company_logo_url && (
          <div className="mt-5 animate-fade-in">
            <p className="eyebrow mb-1.5">{t('admin.theme.logoPreview')}</p>
            <img
              src={theme.company_logo_url}
              alt={t('admin.theme.logoPreview')}
              className="h-16 rounded-lg border border-gray-200 bg-white object-contain p-2 dark:border-gray-700"
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
          </div>
        )}
      </SettingsSection>

      {/* Actions */}
      <SettingsSaveBar>
        <Button
          type="button"
          variant="ghost"
          onClick={resetDefaults}
          leftIcon={<RotateCcw className="h-4 w-4" />}
        >
          {t('admin.theme.reset')}
        </Button>
        <Button
          type="button"
          isLoading={saving}
          onClick={handleSave}
          leftIcon={<Save className="h-4 w-4" />}
        >
          {t('admin.theme.save')}
        </Button>
      </SettingsSaveBar>
    </div>
  );
}
