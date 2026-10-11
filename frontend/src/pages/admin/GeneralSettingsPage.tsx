/**
 * @fileoverview General settings page for application-wide configuration.
 *
 * Provides interface for:
 * - Default currency selection
 * - Company information (name, address, contact details)
 * - Tax identification
 * - Company logo
 * - Invoice settings
 *
 * @module pages/admin/GeneralSettingsPage
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, Contact, Globe2, ImageIcon, Mic, RotateCcw, Save, Sparkles } from 'lucide-react';
import { CURRENCIES } from '@/constants/currencies';
import { CustomSelect } from '@/components/forms/CustomSelect';
import { fieldClasses } from '@/components/forms/fieldStyles';
import { Button } from '@/components/common/Button';
import { Alert } from '@/components/common/Alert';
import { Badge } from '@/components/common/Badge';
import { SkeletonCard, SkeletonItem } from '@/components/common/Skeleton';
import {
  SettingsField,
  SettingsHeader,
  SettingsSaveBar,
  SettingsSection,
  SettingsSwitch,
} from '@/components/admin/SettingsSection';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/cn';
import { getSettings, testAiConnection, testSttConnection, updateSettings } from '@/api/services/settings.service';
import { SecretField, type SecretChange } from '@/components/admin/SecretField';
import { ConnectionTest } from '@/components/admin/ConnectionTest';
import { Settings } from '@/api/types';
import { GERMAN_STATES } from '@/utils/holidays-api';

/**
 * General settings page component.
 *
 * Features:
 * - Default currency configuration
 * - Company information management
 * - Tax identification
 * - Contact details
 * - Company logo upload
 * - Invoice settings
 * - Persistent storage via API
 * - Dark mode support
 *
 * @component
 * @example
 * <GeneralSettingsPage />
 *
 * @returns {JSX.Element} General settings configuration interface
 */
export default function GeneralSettingsPage() {
  const { t } = useTranslation('settings');

  // Form state (filled from the server — the form is not shown until that worked)
  const [settings, setSettings] = useState<Partial<Settings>>({});
  // What the server last sent — saving sends only the fields that differ from it
  const [loaded, setLoaded] = useState<Partial<Settings> | null>(null);
  // Write-only API keys: undefined = keep, null = remove, string = replace
  const [secretChanges, setSecretChanges] = useState<{ ai_api_key?: SecretChange; stt_api_key?: SecretChange }>({});

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string>('');

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await getSettings();
      setSettings(data);
      setLoaded(data);
      setSecretChanges({});
      // Sync user_region to localStorage for use in charts
      if (data.user_region) {
        localStorage.setItem('user_region', data.user_region);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      setLoadError(t('admin.general.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  // Load settings from API on mount
  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  /** Server-managed or write-only fields that are never sent back as they are */
  const NOT_SENT = new Set<string>([
    'id', 'user_id', 'created_at', 'updated_at', 'invoice_number_current',
    'ai_api_key', 'stt_api_key', 'mcp_server_api_key', 'smtp_pass',
    'ai_api_key_set', 'stt_api_key_set', 'mcp_server_api_key_set', 'smtp_pass_set',
  ]);

  const changedFields = (): Partial<Settings> => {
    if (!loaded) return {};
    const changes: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(settings)) {
      if (NOT_SENT.has(key)) continue;
      if (JSON.stringify(value ?? null) !== JSON.stringify((loaded as Record<string, unknown>)[key] ?? null)) {
        changes[key] = value;
      }
    }
    for (const [key, change] of Object.entries(secretChanges)) {
      if (change !== undefined) changes[key] = change;
    }
    return changes as Partial<Settings>;
  };

  // Save settings to API
  const handleSave = async () => {
    const changes = changedFields();
    if (Object.keys(changes).length === 0) return;
    setIsSaving(true);

    try {
      const updatedSettings = await updateSettings(changes);
      setSettings(updatedSettings);
      setLoaded(updatedSettings);
      setSecretChanges({});
      toast.success(t('admin.general.saveSuccess'));
    } catch (error) {
      console.error('Failed to save settings:', error);
      const body = (error as { response?: { data?: { code?: string; field?: string } } })?.response?.data;
      if (body?.code === 'INVALID_URL') {
        toast.error(t('admin.general.saveError'), {
          description: t('admin.general.invalidUrl', 'Not a valid http(s) URL: {{field}}', { field: body.field ?? '' }),
        });
      } else {
        toast.error(t('admin.general.saveError'));
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Update form field
  const handleFieldChange = (field: keyof Settings, value: any) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const currencyOptions = CURRENCIES.map((currency) => ({
    value: currency.code,
    label: `${currency.symbol} ${currency.name} (${currency.code})`,
  }));

  const isDirty = !!loaded && Object.keys(changedFields()).length > 0;

  /** Provider values the AI services actually support (all speak the OpenAI API) */
  const providerOptions = [
    { value: 'local', label: t('admin.general.providerLocal', 'OpenAI-compatible server (LM Studio, llama-swap, Ollama, vLLM …)') },
    { value: 'openai', label: 'OpenAI' },
  ];
  const currentProvider = settings.ai_provider || 'local';
  if (!providerOptions.some((o) => o.value === currentProvider)) {
    providerOptions.push({
      value: currentProvider,
      label: currentProvider === 'lm_studio' ? 'LM Studio' : t('admin.general.providerUnsupported', '{{name}} (not supported — choose another)', { name: currentProvider }),
    });
  }
  const field = fieldClasses();

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="space-y-2">
          <SkeletonItem className="h-6 w-48" />
          <SkeletonItem className="h-4 w-72" />
        </div>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (loadError || !loaded) {
    // Never show the form on defaults: saving it would overwrite the real settings
    return (
      <div className="space-y-6">
        <SettingsHeader title={t('admin.general.title')} description={t('admin.general.subtitle')} />
        <Alert type="error" message={loadError || t('admin.general.loadError')} />
        <Button type="button" variant="secondary" onClick={() => void loadSettings()} leftIcon={<RotateCcw className="h-4 w-4" />}>
          {t('admin.general.retryLoad', 'Try again')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsHeader
        title={t('admin.general.title')}
        description={t('admin.general.subtitle')}
      />


      {/* Company Information */}
      <SettingsSection
        icon={Building2}
        title={t('admin.general.companyInfo')}
        description={t('admin.general.companyInfoHint')}
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <SettingsField label={t('admin.general.companyName')} htmlFor="gs-company-name">
            <input
              id="gs-company-name"
              type="text"
              value={settings.company_name || ''}
              onChange={(e) => handleFieldChange('company_name', e.target.value)}
              className={field}
              placeholder={t('admin.general.companyNamePlaceholder')}
            />
          </SettingsField>

          <SettingsField label={t('admin.general.companyTagline')} htmlFor="gs-company-subline">
            <input
              id="gs-company-subline"
              type="text"
              value={settings.company_subline || ''}
              onChange={(e) => handleFieldChange('company_subline', e.target.value)}
              className={field}
              placeholder={t('admin.general.companyTaglinePlaceholder')}
            />
          </SettingsField>

          <SettingsField label={t('admin.general.address')} htmlFor="gs-company-address" className="md:col-span-2">
            <textarea
              id="gs-company-address"
              value={settings.company_address || ''}
              onChange={(e) => handleFieldChange('company_address', e.target.value)}
              rows={2}
              className={fieldClasses({ multiline: true })}
              placeholder={t('admin.general.addressPlaceholder')}
            />
          </SettingsField>
        </div>
      </SettingsSection>

      {/* Tax & Contact Information */}
      <SettingsSection
        icon={Contact}
        title={t('admin.general.taxContactInfo')}
        description={t('admin.general.taxContactInfoHint')}
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <SettingsField label={t('admin.general.taxId')} htmlFor="gs-tax-id">
            <input
              id="gs-tax-id"
              type="text"
              value={settings.company_tax_id || ''}
              onChange={(e) => handleFieldChange('company_tax_id', e.target.value)}
              className={field}
              placeholder="DE123456789"
            />
          </SettingsField>

          <SettingsField label={t('admin.general.email')} htmlFor="gs-email">
            <input
              id="gs-email"
              type="email"
              value={settings.company_email || ''}
              onChange={(e) => handleFieldChange('company_email', e.target.value)}
              className={field}
              placeholder="info@company.com"
            />
          </SettingsField>

          <SettingsField label={t('admin.general.phone')} htmlFor="gs-phone">
            <input
              id="gs-phone"
              type="tel"
              value={settings.company_phone || ''}
              onChange={(e) => handleFieldChange('company_phone', e.target.value)}
              className={field}
              placeholder="+49 123 456789"
            />
          </SettingsField>

          <SettingsField label={t('admin.general.website')} htmlFor="gs-website">
            <input
              id="gs-website"
              type="url"
              value={settings.company_website || ''}
              onChange={(e) => handleFieldChange('company_website', e.target.value)}
              className={field}
              placeholder="https://www.company.com"
            />
          </SettingsField>
        </div>
      </SettingsSection>

      {/* Company Logo */}
      <SettingsSection icon={ImageIcon} title={t('admin.general.companyLogo')}>
        <div className={cn('grid grid-cols-1 gap-5', settings.company_logo_url && 'md:grid-cols-[minmax(0,1fr)_auto] md:items-start')}>
          <SettingsField
            label={t('admin.general.logoUrl')}
            htmlFor="gs-logo-url"
            hint={t('admin.general.logoUrlHint')}
          >
            <input
              id="gs-logo-url"
              type="url"
              value={settings.company_logo_url || ''}
              onChange={(e) => handleFieldChange('company_logo_url', e.target.value)}
              className={field}
              placeholder="https://example.com/logo.png"
            />
          </SettingsField>
          {settings.company_logo_url && (
            <div className="animate-fade-in">
              <p className="eyebrow mb-1.5">{t('admin.general.logoPreview')}</p>
              <div className="flex h-24 w-full items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white p-3 md:w-56 dark:border-gray-700">
                <img
                  src={settings.company_logo_url}
                  alt={t('admin.general.logoAlt')}
                  className="max-h-full max-w-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </SettingsSection>

      {/* Region, currency and invoice number format */}
      <SettingsSection
        icon={Globe2}
        title={t('admin.general.regionFormats')}
        description={t('admin.general.userLocationHint')}
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <SettingsField
            label={t('admin.general.regionLabel')}
            htmlFor="gs-region"
            hint={t('admin.general.regionHint')}
          >
            <select
              id="gs-region"
              value={settings.user_region || ''}
              onChange={(e) => {
                handleFieldChange('user_region', e.target.value);
                // Also save to localStorage for immediate use
                if (e.target.value) {
                  localStorage.setItem('user_region', e.target.value);
                } else {
                  localStorage.removeItem('user_region');
                }
              }}
              className={field}
            >
              <option value="">{t('admin.general.noRegion')}</option>
              {GERMAN_STATES.map((state) => (
                <option key={state.code} value={state.code}>
                  {state.name}
                </option>
              ))}
            </select>
          </SettingsField>

          <SettingsField
            label={t('admin.general.defaultCurrency')}
            hint={t('admin.general.currencyDescription')}
          >
            <CustomSelect
              value={settings.default_currency || 'EUR'}
              onChange={(value: string) => handleFieldChange('default_currency', value)}
              options={currencyOptions}
              placeholder={t('admin.general.currencyPlaceholder')}
              size="md"
            />
          </SettingsField>

          <SettingsField
            label={t('admin.general.invoiceLanguageLabel')}
            htmlFor="gs-invoice-language"
            hint={t('admin.general.invoiceLanguageHint')}
          >
            <select
              id="gs-invoice-language"
              value={settings.invoice_language || 'de'}
              onChange={(e) => handleFieldChange('invoice_language', e.target.value)}
              className={field}
            >
              <option value="de">Deutsch (de-DE)</option>
              <option value="en">English (en-US)</option>
              <option value="fr">Français (fr-FR)</option>
              <option value="es">Español (es-ES)</option>
              <option value="it">Italiano (it-IT)</option>
              <option value="nl">Nederlands (nl-NL)</option>
            </select>
          </SettingsField>
        </div>
      </SettingsSection>

      {/* AI Assistant Settings */}
      <SettingsSection
        icon={Sparkles}
        title={t('admin.general.aiAssistant')}
        description={t('admin.general.aiAssistantHint')}
        action={
          <SettingsSwitch
            checked={!!settings.ai_enabled}
            onChange={(checked) => handleFieldChange('ai_enabled', checked)}
            label={t('admin.general.enableAI')}
          />
        }
      >
        {settings.ai_enabled ? (
          <div className="grid animate-fade-up grid-cols-1 gap-5 md:grid-cols-2">
            <SettingsField label={t('admin.general.llmProvider')} htmlFor="gs-ai-provider">
              <select
                id="gs-ai-provider"
                value={currentProvider}
                onChange={(e) => handleFieldChange('ai_provider', e.target.value)}
                className={field}
              >
                {providerOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </SettingsField>

            <SettingsField label={t('admin.general.modelName')} htmlFor="gs-ai-model">
              <input
                id="gs-ai-model"
                type="text"
                value={settings.ai_model || ''}
                onChange={(e) => handleFieldChange('ai_model', e.target.value)}
                className={field}
                placeholder={t('admin.general.modelPlaceholder')}
              />
            </SettingsField>

            <SettingsField
              label={t('admin.general.apiBaseUrl')}
              htmlFor="gs-ai-url"
              hint={t('admin.general.apiBaseUrlHint')}
              className="md:col-span-2"
            >
              <input
                id="gs-ai-url"
                type="url"
                value={settings.ai_api_url || ''}
                onChange={(e) => handleFieldChange('ai_api_url', e.target.value)}
                className={field}
                placeholder={t('admin.general.apiBaseUrlPlaceholder')}
              />
            </SettingsField>

            <SettingsField
              label={t('admin.general.apiKey')}
              htmlFor="gs-ai-key"
              hint={t('admin.general.apiKeyHint', 'Optional for local servers. Stored write-only — it is never shown again.')}
              className="md:col-span-2"
            >
              <SecretField
                id="gs-ai-key"
                isSet={!!settings.ai_api_key_set}
                change={secretChanges.ai_api_key}
                onChange={(change) => setSecretChanges((prev) => ({ ...prev, ai_api_key: change }))}
                placeholder="sk-..."
              />
            </SettingsField>

            <div className="md:col-span-2">
              <ConnectionTest
                disabled={!settings.ai_api_url}
                run={() =>
                  testAiConnection({
                    ai_api_url: settings.ai_api_url,
                    ai_model: settings.ai_model,
                    ...(typeof secretChanges.ai_api_key === 'string' ? { ai_api_key: secretChanges.ai_api_key } : {}),
                  })
                }
                onPickModel={(model) => handleFieldChange('ai_model', model)}
              />
            </div>
          </div>
        ) : undefined}
      </SettingsSection>

      {/* Speech-to-Text Settings */}
      <SettingsSection
        icon={Mic}
        title={t('admin.general.stt')}
        description={t('admin.general.sttHint')}
        action={
          <SettingsSwitch
            checked={!!settings.stt_enabled}
            onChange={(checked) => handleFieldChange('stt_enabled', checked)}
            label={t('admin.general.enableSTT')}
          />
        }
      >
        {settings.stt_enabled ? (
          <div className="grid animate-fade-up grid-cols-1 gap-5 md:grid-cols-2">
            <SettingsField label={t('admin.general.sttEngine')} htmlFor="gs-stt-provider">
              <select
                id="gs-stt-provider"
                value={settings.stt_provider || 'whisper'}
                onChange={(e) => handleFieldChange('stt_provider', e.target.value)}
                className={field}
              >
                <option value="faster_whisper">{t('admin.general.sttFasterWhisper')}</option>
                <option value="qwen_asr">Qwen3 ASR</option>
                <option value="whisper">{t('admin.general.sttWhisperServer')}</option>
                <option value="custom">{t('admin.general.sttCustom')}</option>
              </select>
            </SettingsField>

            <SettingsField label={t('admin.general.sttModel')} htmlFor="gs-stt-model">
              <input
                id="gs-stt-model"
                type="text"
                value={settings.stt_model || ''}
                onChange={(e) => handleFieldChange('stt_model', e.target.value)}
                className={field}
                placeholder="large-v3"
              />
            </SettingsField>

            <SettingsField
              label={t('admin.general.sttServerUrl')}
              htmlFor="gs-stt-url"
              hint={t('admin.general.sttServerUrlHint')}
              className="md:col-span-2"
            >
              <input
                id="gs-stt-url"
                type="url"
                value={settings.stt_api_url || ''}
                onChange={(e) => handleFieldChange('stt_api_url', e.target.value)}
                className={field}
                placeholder="http://localhost:8080"
              />
            </SettingsField>

            <SettingsField label={t('admin.general.sttApiKeyOptional')} htmlFor="gs-stt-key">
              <SecretField
                id="gs-stt-key"
                isSet={!!settings.stt_api_key_set}
                change={secretChanges.stt_api_key}
                onChange={(change) => setSecretChanges((prev) => ({ ...prev, stt_api_key: change }))}
                placeholder={t('admin.general.sttApiKeyPlaceholder')}
              />
            </SettingsField>

            <SettingsField label={t('admin.general.sttLanguageOptional')} htmlFor="gs-stt-language">
              <input
                id="gs-stt-language"
                type="text"
                value={settings.stt_language || ''}
                onChange={(e) => handleFieldChange('stt_language', e.target.value)}
                className={field}
                placeholder={t('admin.general.sttLanguagePlaceholder')}
                maxLength={10}
              />
            </SettingsField>
            <div className="md:col-span-2">
              <ConnectionTest
                disabled={!settings.stt_api_url}
                run={() =>
                  testSttConnection({
                    stt_api_url: settings.stt_api_url,
                    ...(typeof secretChanges.stt_api_key === 'string' ? { stt_api_key: secretChanges.stt_api_key } : {}),
                  })
                }
              />
            </div>
          </div>
        ) : undefined}
      </SettingsSection>

      {/* Save Button */}
      <SettingsSaveBar
        status={
          isDirty ? (
            <Badge variant="amber" dot>{t('admin.general.unsavedChanges')}</Badge>
          ) : (
            <span className="hidden sm:inline">{t('admin.general.saveHint')}</span>
          )
        }
      >
        <Button
          type="button"
          onClick={handleSave}
          isLoading={isSaving}
          disabled={!isDirty}
          leftIcon={<Save className="h-4 w-4" />}
        >
          {isSaving ? t('admin.general.saving') : t('admin.general.saveButton')}
        </Button>
      </SettingsSaveBar>
    </div>
  );
}
