import { FC, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../common/Button';
import { Alert } from '../../common/Alert';
import { CopyButton } from '../../common/CopyButton';

interface ApiTokenSecretModalProps {
  /** null = closed */
  secret: string | null;
  tokenName: string;
  onClose: () => void;
}

/**
 * Shows a new token secret — the only time it is ever visible. Clicking the
 * backdrop doesn't close it, so the secret isn't lost by a stray click.
 */
export const ApiTokenSecretModal: FC<ApiTokenSecretModalProps> = ({ secret, tokenName, onClose }) => {
  const { t } = useTranslation('settings');
  const labelId = useId();
  const tryItCommand = secret
    ? `curl -H "Authorization: Bearer ${secret}" ${window.location.origin}/api/api-tokens/current`
    : '';

  return (
    <Modal
      open={secret !== null}
      title={t('admin.apiTokens.secret.title')}
      description={tokenName}
      icon={<KeyRound className="h-4 w-4" />}
      onClose={onClose}
      closeOnBackdrop={false}
      size="md"
      footer={
        <Button type="button" onClick={onClose}>
          {t('admin.apiTokens.secret.done')}
        </Button>
      }
    >
      {secret && (
        <div className="space-y-5">
          <Alert type="warning" message={t('admin.apiTokens.secret.warning')} />

          <div>
            <p id={labelId} className="section-label">
              {t('admin.apiTokens.secret.tokenLabel')}
            </p>
            <div className="mt-2 flex flex-col gap-2 rounded-lg bg-gray-50 p-3 ring-1 ring-inset ring-gray-200 sm:flex-row sm:items-center dark:bg-white/[0.03] dark:ring-gray-800">
              <code
                aria-labelledby={labelId}
                className="min-w-0 flex-1 select-all break-all font-mono text-sm text-gray-900 dark:text-gray-100"
              >
                {secret}
              </code>
              <CopyButton value={secret} variant="primary" className="shrink-0" />
            </div>
          </div>

          <div>
            <p className="section-label">{t('admin.apiTokens.secret.tryIt')}</p>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{t('admin.apiTokens.secret.tryItHint')}</p>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-gray-900 p-3 font-mono text-xs leading-relaxed text-gray-100 dark:bg-black/40">
              {tryItCommand}
            </pre>
            <div className="mt-2">
              <CopyButton value={tryItCommand} label={t('admin.apiTokens.secret.copyCommand')} />
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};
