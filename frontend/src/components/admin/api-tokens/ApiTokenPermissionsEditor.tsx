import { FC, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '../../common/Alert';
import { SkeletonItem } from '../../common/Skeleton';
import { SettingsSwitch } from '../SettingsSection';
import { PermissionLevelPicker } from './PermissionLevelPicker';
import { CAPABILITY_ICONS } from './capabilityIcons';
import { PRESET_IDS, PresetId, presetResources } from './apiTokenHelpers';
import { useApiTokenCatalog } from '../../../hooks/api/useApiTokens';
import type {
  ApiTokenApprovalMode,
  ApiTokenCapability,
  ApiTokenLevel,
  ApiTokenPermissions,
  ApiTokenResource,
} from '../../../api/types';
import { cn } from '../../../lib/cn';

export interface TokenAccessChoice {
  resources: ApiTokenPermissions['resources'];
  capabilities: ApiTokenCapability[];
  approvalMode: ApiTokenApprovalMode;
}

interface ApiTokenPermissionsEditorProps {
  value: TokenAccessChoice;
  onChange: (next: TokenAccessChoice) => void;
  /** Features that are always on — the OAuth consent page fixes MCP. */
  lockedCapabilities?: ApiTokenCapability[];
}

/**
 * What a token may do: None/Read/Write/Delete per data area (with presets),
 * the features it may use, and — with the assistant — who approves changes.
 * Shared by the token dialog and the OAuth consent page.
 */
export const ApiTokenPermissionsEditor: FC<ApiTokenPermissionsEditorProps> = ({ value, onChange, lockedCapabilities = [] }) => {
  const { t } = useTranslation('settings');
  const formId = useId();
  const { data: catalog, isLoading: catalogLoading, error: catalogError } = useApiTokenCatalog();

  const setLevel = (resource: ApiTokenResource, level: ApiTokenLevel) =>
    onChange({ ...value, resources: { ...value.resources, [resource]: level } });
  const toggleCapability = (capability: ApiTokenCapability, on: boolean) =>
    onChange({
      ...value,
      capabilities: on ? [...value.capabilities, capability] : value.capabilities.filter((c) => c !== capability),
    });
  const applyPreset = (preset: PresetId | 'clear') => {
    if (!catalog) return;
    onChange({ ...value, resources: preset === 'clear' ? {} : presetResources(preset, catalog) });
  };

  return catalogError ? (
      <Alert type="error" message={t('admin.apiTokens.form.catalogError')} />
    ) : catalogLoading || !catalog ? (
      <div className="space-y-3" aria-busy="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonItem key={i} className="h-8 w-full" />
        ))}
      </div>
    ) : (
      <>
        {/* Data access */}
        <fieldset>
          <legend className="section-label">{t('admin.apiTokens.form.resourcesTitle')}</legend>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{t('admin.apiTokens.levelsHint')}</p>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400">{t('admin.apiTokens.form.presetsLabel')}</span>
            {[...PRESET_IDS, 'clear' as const].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => applyPreset(preset)}
                className="rounded-full px-2.5 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-200 transition-colors hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-white/5 dark:hover:text-white"
              >
                {t(`admin.apiTokens.form.presets.${preset}`)}
              </button>
            ))}
          </div>

          <ul className="mt-3 divide-y divide-gray-100 rounded-xl ring-1 ring-gray-200 dark:divide-gray-800 dark:ring-gray-800">
            {catalog.resources.map(({ key, levels }) => {
              const labelId = `${formId}-${key}`;
              return (
                <li key={key} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <p id={labelId} className="text-sm font-medium text-gray-900 dark:text-white">
                      {t(`admin.apiTokens.resources.${key}.label`)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t(`admin.apiTokens.resources.${key}.description`)}
                    </p>
                  </div>
                  <PermissionLevelPicker
                    name={`${formId}-level-${key}`}
                    value={value.resources[key] ?? 'none'}
                    levels={levels}
                    onChange={(level) => setLevel(key, level)}
                    labelledBy={labelId}
                  />
                </li>
              );
            })}
          </ul>
        </fieldset>

        {/* Features */}
        <fieldset>
          <legend className="section-label">{t('admin.apiTokens.form.capabilitiesTitle')}</legend>
          <ul className="mt-3 divide-y divide-gray-100 rounded-xl ring-1 ring-gray-200 dark:divide-gray-800 dark:ring-gray-800">
            {catalog.capabilities.map(({ key }) => {
              const Icon = CAPABILITY_ICONS[key];
              const switchId = `${formId}-cap-${key}`;
              const locked = lockedCapabilities.includes(key);
              const on = locked || value.capabilities.includes(key);
              return (
                <li key={key}>
                  <div className="flex items-start gap-3 px-4 py-3">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <label htmlFor={switchId} className="block cursor-pointer text-sm font-medium text-gray-900 dark:text-white">
                        {t(`admin.apiTokens.capabilities.${key}.label`)}
                      </label>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {t(`admin.apiTokens.capabilities.${key}.description`)}
                      </p>
                    </div>
                    <SettingsSwitch
                    id={switchId}
                    checked={on}
                    disabled={locked}
                    onChange={(checked) => toggleCapability(key, checked)}
                  />
                  </div>

                  {key === 'assistant' && on && (
                    <div
                      role="radiogroup"
                      aria-label={t('admin.apiTokens.approval.title')}
                      className="grid grid-cols-1 gap-2 px-4 pb-4 sm:grid-cols-2 sm:pl-11"
                    >
                      {catalog.approvalModes.map((mode) => (
                        <label
                          key={mode}
                          className={cn(
                            'flex cursor-pointer gap-2.5 rounded-lg p-3 ring-1 ring-inset transition-colors',
                            value.approvalMode === mode
                              ? 'bg-brand-50/60 ring-brand-300 dark:bg-brand-500/10 dark:ring-brand-500/40'
                              : 'ring-gray-200 hover:bg-gray-50 dark:ring-gray-700 dark:hover:bg-white/[0.03]'
                          )}
                        >
                          <input
                            type="radio"
                            name={`${formId}-approval`}
                            value={mode}
                            checked={value.approvalMode === mode}
                            onChange={() => onChange({ ...value, approvalMode: mode })}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-gray-900 dark:text-white">
                              {t(`admin.apiTokens.approval.${mode}.label`)}
                            </span>
                            <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                              {t(`admin.apiTokens.approval.${mode}.description`)}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </fieldset>
      </>
    );
};
