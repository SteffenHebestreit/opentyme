import { FC, FormEvent, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../common/Button';
import { Alert } from '../../common/Alert';
import { SkeletonItem } from '../../common/Skeleton';
import { Input } from '../../forms';
import { SettingsSwitch } from '../SettingsSection';
import { PermissionLevelPicker } from './PermissionLevelPicker';
import { CAPABILITY_ICONS } from './capabilityIcons';
import { ExpiryField } from './ExpiryField';
import {
  DEFAULT_EXPIRY,
  ExpiryChoice,
  PRESET_IDS,
  PresetId,
  apiErrorBody,
  expiryToIso,
  grantsAnything,
  presetResources,
} from './apiTokenHelpers';
import { useApiTokenCatalog, useCreateApiToken, useUpdateApiToken } from '../../../hooks/api/useApiTokens';
import type {
  ApiToken,
  ApiTokenApprovalMode,
  ApiTokenCapability,
  ApiTokenLevel,
  ApiTokenPermissions,
  ApiTokenResource,
  ApiTokenWithSecret,
} from '../../../api/types';
import { formatDate } from '../../../utils/date';
import { cn } from '../../../lib/cn';

interface ApiTokenFormModalProps {
  /** null = create a new token */
  token: ApiToken | null;
  open: boolean;
  onClose: () => void;
  /** After create: the parent shows the secret */
  onCreated: (result: ApiTokenWithSecret) => void;
  onSaved: () => void;
}

/**
 * Create or edit a token: name, expiry (create only — regenerate changes it),
 * a None/Read/Write/Delete level per resource, features, and who approves
 * the assistant's changes.
 */
export const ApiTokenFormModal: FC<ApiTokenFormModalProps> = ({ token, open, onClose, onCreated, onSaved }) => {
  const { t } = useTranslation('settings');
  const formId = useId();
  const { data: catalog, isLoading: catalogLoading, error: catalogError } = useApiTokenCatalog();
  const createMutation = useCreateApiToken();
  const updateMutation = useUpdateApiToken();
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const [name, setName] = useState(token?.name ?? '');
  const [description, setDescription] = useState(token?.description ?? '');
  const [resources, setResources] = useState<ApiTokenPermissions['resources']>(token?.permissions.resources ?? {});
  const [capabilities, setCapabilities] = useState<ApiTokenCapability[]>(token?.permissions.capabilities ?? []);
  const [approvalMode, setApprovalMode] = useState<ApiTokenApprovalMode>(token?.approval_mode ?? 'self');
  const [expiry, setExpiry] = useState<ExpiryChoice>(DEFAULT_EXPIRY);
  const [customDate, setCustomDate] = useState('');
  const [errors, setErrors] = useState<{ name?: string; expiry?: string; permissions?: string }>({});

  const permissions: ApiTokenPermissions = { resources, capabilities };

  const setLevel = (resource: ApiTokenResource, level: ApiTokenLevel) => {
    setResources((prev) => ({ ...prev, [resource]: level }));
    setErrors((prev) => ({ ...prev, permissions: undefined }));
  };

  const toggleCapability = (capability: ApiTokenCapability, on: boolean) => {
    setCapabilities((prev) => (on ? [...prev, capability] : prev.filter((c) => c !== capability)));
    setErrors((prev) => ({ ...prev, permissions: undefined }));
  };

  const applyPreset = (preset: PresetId | 'clear') => {
    if (!catalog) return;
    setResources(preset === 'clear' ? {} : presetResources(preset, catalog));
    setErrors((prev) => ({ ...prev, permissions: undefined }));
  };

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    const nextErrors: typeof errors = {};
    if (!name.trim()) nextErrors.name = t('admin.apiTokens.form.nameRequired');
    if (!grantsAnything(permissions)) nextErrors.permissions = t('admin.apiTokens.form.nothingGranted');
    const expiresAt = token ? null : expiryToIso(expiry, customDate);
    if (!token && expiresAt === undefined) nextErrors.expiry = t('admin.apiTokens.form.customDateRequired');
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const common = {
      name: name.trim(),
      description: description.trim() || null,
      permissions,
      approval_mode: approvalMode,
    };
    try {
      if (token) {
        await updateMutation.mutateAsync({ id: token.id, data: common });
        onSaved();
      } else {
        onCreated(await createMutation.mutateAsync({ ...common, expires_at: expiresAt ?? null }));
      }
    } catch (err: unknown) {
      const body = apiErrorBody(err);
      if (body.code === 'NAME_TAKEN') {
        setErrors({ name: t('admin.apiTokens.form.nameTaken') });
        return;
      }
      setErrors({
        permissions: body.message ?? t(token ? 'admin.apiTokens.form.saveError' : 'admin.apiTokens.form.createError'),
      });
    }
  };

  return (
    <Modal
      open={open}
      title={token ? t('admin.apiTokens.form.editTitle') : t('admin.apiTokens.form.createTitle')}
      icon={<KeyRound className="h-4 w-4" />}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common:buttons.cancel')}
          </Button>
          <Button type="submit" form={formId} isLoading={isSaving} disabled={!catalog}>
            {isSaving
              ? t('admin.apiTokens.form.saving')
              : token
                ? t('admin.apiTokens.form.save')
                : t('admin.apiTokens.form.create')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate className="space-y-8">
        {/* Identity and lifetime */}
        <div>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <Input
              label={t('admin.apiTokens.form.nameLabel')}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setErrors((prev) => ({ ...prev, name: undefined }));
              }}
              placeholder={t('admin.apiTokens.form.namePlaceholder')}
              maxLength={100}
              error={errors.name}
              required
              autoFocus
            />
            <Input
              label={t('admin.apiTokens.form.descriptionLabel')}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t('admin.apiTokens.form.descriptionPlaceholder')}
              maxLength={500}
            />
          </div>

          {token ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {token.expires_at
                ? t('admin.apiTokens.form.expiresOn', { date: formatDate(token.expires_at) })
                : t('admin.apiTokens.expiry.never')}
              {' · '}
              {t('admin.apiTokens.form.expiryFixed')}
            </p>
          ) : (
            <ExpiryField
              choice={expiry}
              customDate={customDate}
              onChoiceChange={(choice) => {
                setExpiry(choice);
                setErrors((prev) => ({ ...prev, expiry: undefined }));
              }}
              onCustomDateChange={(ymd) => {
                setCustomDate(ymd);
                setErrors((prev) => ({ ...prev, expiry: undefined }));
              }}
              error={errors.expiry}
            />
          )}
        </div>

        {catalogError ? (
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
                        value={resources[key] ?? 'none'}
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
                  const on = capabilities.includes(key);
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
                        <SettingsSwitch id={switchId} checked={on} onChange={(checked) => toggleCapability(key, checked)} />
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
                                approvalMode === mode
                                  ? 'bg-brand-50/60 ring-brand-300 dark:bg-brand-500/10 dark:ring-brand-500/40'
                                  : 'ring-gray-200 hover:bg-gray-50 dark:ring-gray-700 dark:hover:bg-white/[0.03]'
                              )}
                            >
                              <input
                                type="radio"
                                name={`${formId}-approval`}
                                value={mode}
                                checked={approvalMode === mode}
                                onChange={() => setApprovalMode(mode)}
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

            {errors.permissions && <Alert type="error" message={errors.permissions} />}
          </>
        )}
      </form>
    </Modal>
  );
};
