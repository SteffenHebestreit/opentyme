import { FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../common/Button';
import { Alert } from '../../common/Alert';
import { ExpiryField } from './ExpiryField';
import { apiErrorBody, DEFAULT_EXPIRY, ExpiryChoice, expiryToIso } from './apiTokenHelpers';
import { useRegenerateApiToken } from '../../../hooks/api/useApiTokens';
import type { ApiToken, ApiTokenWithSecret } from '../../../api/types';

interface ApiTokenRegenerateModalProps {
  /** null = closed */
  token: ApiToken | null;
  onClose: () => void;
  onRegenerated: (result: ApiTokenWithSecret) => void;
}

/**
 * Issues a new secret for a token and sets its new expiry. The old secret
 * stops working the moment this succeeds.
 */
export const ApiTokenRegenerateModal: FC<ApiTokenRegenerateModalProps> = ({ token, onClose, onRegenerated }) => {
  const { t } = useTranslation('settings');
  const regenerate = useRegenerateApiToken();
  const [expiry, setExpiry] = useState<ExpiryChoice>(DEFAULT_EXPIRY);
  const [customDate, setCustomDate] = useState('');
  const [error, setError] = useState<string>();
  const [expiryError, setExpiryError] = useState<string>();

  const handleRegenerate = async () => {
    if (!token) return;
    const expiresAt = expiryToIso(expiry, customDate);
    if (expiresAt === undefined) {
      setExpiryError(t('admin.apiTokens.form.customDateRequired'));
      return;
    }
    try {
      onRegenerated(await regenerate.mutateAsync({ id: token.id, expiresAt }));
    } catch (err: unknown) {
      setError(apiErrorBody(err).message ?? t('admin.apiTokens.regenerate.error'));
    }
  };

  return (
    <Modal
      open={token !== null}
      title={t('admin.apiTokens.regenerate.title')}
      icon={<RefreshCw className="h-4 w-4" />}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common:buttons.cancel')}
          </Button>
          <Button type="button" onClick={handleRegenerate} isLoading={regenerate.isPending}>
            {t('admin.apiTokens.regenerate.confirm')}
          </Button>
        </>
      }
    >
      {token && (
        <div className="space-y-5">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {t('admin.apiTokens.regenerate.description', { name: token.name })}
          </p>
          <ExpiryField
            choice={expiry}
            customDate={customDate}
            onChoiceChange={(choice) => {
              setExpiry(choice);
              setExpiryError(undefined);
            }}
            onCustomDateChange={(ymd) => {
              setCustomDate(ymd);
              setExpiryError(undefined);
            }}
            error={expiryError}
          />
          {error && <Alert type="error" message={error} />}
        </div>
      )}
    </Modal>
  );
};
