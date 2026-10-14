import { FC, FormEvent, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../common/Button';
import { Alert } from '../../common/Alert';
import { Input } from '../../forms';
import { ExpiryField } from './ExpiryField';
import { ApiTokenPermissionsEditor } from './ApiTokenPermissionsEditor';
import {
  DEFAULT_EXPIRY,
  ExpiryChoice,
  apiErrorBody,
  expiryToIso,
  grantsAnything,
} from './apiTokenHelpers';
import { useApiTokenCatalog, useCreateApiToken, useUpdateApiToken } from '../../../hooks/api/useApiTokens';
import type {
  ApiToken,
  ApiTokenApprovalMode,
  ApiTokenCapability,
  ApiTokenPermissions,
  ApiTokenWithSecret,
} from '../../../api/types';
import { formatDate } from '../../../utils/date';

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
  const { data: catalog } = useApiTokenCatalog();
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

        <ApiTokenPermissionsEditor
          value={{ resources, capabilities, approvalMode }}
          onChange={(next) => {
            setResources(next.resources);
            setCapabilities(next.capabilities);
            setApprovalMode(next.approvalMode);
            setErrors((prev) => ({ ...prev, permissions: undefined }));
          }}
        />
        {errors.permissions && <Alert type="error" message={errors.permissions} />}
      </form>
    </Modal>
  );
};
