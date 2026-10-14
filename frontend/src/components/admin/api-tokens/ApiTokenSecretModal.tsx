import { FC, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../common/Button';
import { Alert } from '../../common/Alert';
import { CopyButton } from '../../common/CopyButton';
import type { ApiTokenWithSecret } from '../../../api/types';

interface ApiTokenSecretModalProps {
  /** null = closed */
  result: ApiTokenWithSecret | null;
  onClose: () => void;
}

/** A labelled, copyable snippet. */
function Snippet({ title, hint, code, copyLabel }: { title: string; hint: string; code: string; copyLabel: string }) {
  return (
    <div>
      <p className="section-label">{title}</p>
      <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{hint}</p>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-gray-900 p-3 font-mono text-xs leading-relaxed text-gray-100 dark:bg-black/40">
        {code}
      </pre>
      <div className="mt-2">
        <CopyButton value={code} label={copyLabel} />
      </div>
    </div>
  );
}

/**
 * Shows a new token secret — the only time it is ever visible — with
 * ready-to-paste setups for what the token may be used for. Clicking the
 * backdrop doesn't close it, so the secret isn't lost by a stray click.
 */
export const ApiTokenSecretModal: FC<ApiTokenSecretModalProps> = ({ result, onClose }) => {
  const { t } = useTranslation('settings');
  const labelId = useId();
  const secret = result?.secret ?? '';
  const capabilities = result?.token.permissions.capabilities ?? [];
  const origin = window.location.origin;
  const copyCommand = t('admin.apiTokens.secret.copyCommand');

  const tryIt = `curl -H "Authorization: Bearer ${secret}" ${origin}/api/api-tokens/current`;
  const claudeCode = `claude mcp add --transport http opentyme ${origin}/api/mcp --header "Authorization: Bearer ${secret}"`;
  const mcpJson = JSON.stringify(
    { mcpServers: { opentyme: { url: `${origin}/api/mcp`, headers: { Authorization: `Bearer ${secret}` } } } },
    null,
    2
  );

  return (
    <Modal
      open={result !== null}
      title={t('admin.apiTokens.secret.title')}
      description={result?.token.name}
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
      {result && (
        <div className="space-y-6">
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

          <Snippet
            title={t('admin.apiTokens.secret.tryIt')}
            hint={t('admin.apiTokens.secret.tryItHint')}
            code={tryIt}
            copyLabel={copyCommand}
          />

          {capabilities.includes('mcp') && (
            <>
              <Snippet
                title={t('admin.apiTokens.secret.mcpClaudeCode')}
                hint={t('admin.apiTokens.secret.mcpClaudeCodeHint')}
                code={claudeCode}
                copyLabel={copyCommand}
              />
              <Snippet
                title={t('admin.apiTokens.secret.mcpJson')}
                hint={t('admin.apiTokens.secret.mcpJsonHint')}
                code={mcpJson}
                copyLabel={t('admin.apiTokens.secret.copyConfig')}
              />
            </>
          )}

          {capabilities.includes('assistant') && (
            <Snippet
              title={t('admin.apiTokens.secret.a2a')}
              hint={t('admin.apiTokens.secret.a2aHint')}
              code={`${origin}/.well-known/agent-card.json`}
              copyLabel={t('admin.apiTokens.secret.copyUrl')}
            />
          )}
        </div>
      )}
    </Modal>
  );
};
