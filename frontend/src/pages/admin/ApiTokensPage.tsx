/**
 * @fileoverview Personal access tokens (/config/api-tokens): list, create,
 * edit, regenerate and revoke the tokens scripts, AI agents and MCP clients
 * use to act on the user's behalf.
 *
 * @module pages/admin/ApiTokensPage
 */

import { FC, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useApiTokenCatalog, useApiTokens, useRevokeApiToken } from '../../hooks/api/useApiTokens';
import { Button } from '../../components/common/Button';
import { Alert } from '../../components/common/Alert';
import { Badge } from '../../components/common/Badge';
import { EmptyState } from '../../components/common/EmptyState';
import { SkeletonItem } from '../../components/common/Skeleton';
import { Table, Column } from '../../components/common/Table';
import { SettingsHeader } from '../../components/admin/SettingsSection';
import { ApiTokenFormModal, CAPABILITY_ICONS } from '../../components/admin/api-tokens/ApiTokenFormModal';
import { ApiTokenRegenerateModal } from '../../components/admin/api-tokens/ApiTokenRegenerateModal';
import { ApiTokenSecretModal } from '../../components/admin/api-tokens/ApiTokenSecretModal';
import { ApiTokenActivity } from '../../components/admin/api-tokens/ApiTokenActivity';
import { expiryState, grantedResources } from '../../components/admin/api-tokens/apiTokenHelpers';
import type { ApiToken, ApiTokenWithSecret } from '../../api/types';
import { formatDate, formatDistanceToNow } from '../../utils/date';
import { toast } from '../../lib/toast';
import { confirmDialog } from '../../lib/confirm';

const iconButton =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500';

/** How many resource badges a row shows before "+N more". */
const VISIBLE_RESOURCES = 3;

const ApiTokensPage: FC = () => {
  const { t } = useTranslation('settings');
  const { data: tokens, isLoading, error } = useApiTokens();
  const { data: catalog } = useApiTokenCatalog();
  const revokeMutation = useRevokeApiToken();

  /** undefined = closed, null = creating */
  const [editing, setEditing] = useState<ApiToken | null | undefined>(undefined);
  const [regenerating, setRegenerating] = useState<ApiToken | null>(null);
  const [revealed, setRevealed] = useState<ApiTokenWithSecret | null>(null);

  const levelLabel = (level: string) => t(`admin.apiTokens.levels.${level}`);
  const resourceLabel = (key: string) => t(`admin.apiTokens.resources.${key}.label`);

  const showSecret = (result: ApiTokenWithSecret) => {
    setEditing(undefined);
    setRegenerating(null);
    setRevealed(result);
  };

  const handleRevoke = async (token: ApiToken) => {
    const confirmed = await confirmDialog({
      title: t('admin.apiTokens.revoke.title'),
      message: t('admin.apiTokens.revoke.message', { name: token.name }),
      tone: 'danger',
      confirmLabel: t('admin.apiTokens.revoke.confirm'),
    });
    if (!confirmed) return;
    try {
      await revokeMutation.mutateAsync(token.id);
      toast.success(t('admin.apiTokens.revoke.success'));
    } catch (err: any) {
      toast.error(t('admin.apiTokens.revoke.error'), { description: err.response?.data?.message });
    }
  };

  const columns: Column<ApiToken>[] = useMemo(
    () => [
      {
        key: 'name',
        accessorKey: 'name',
        header: t('admin.apiTokens.columns.name'),
        sortable: true,
        render: (token) => (
          <div className="min-w-0">
            <div className="font-medium text-gray-900 dark:text-white">{token.name}</div>
            {token.description && (
              <div className="mt-0.5 max-w-xs truncate text-xs text-gray-500 dark:text-gray-400">{token.description}</div>
            )}
            <div className="mt-1 font-mono text-xs text-gray-400 dark:text-gray-500">{token.token_prefix}…</div>
          </div>
        ),
      },
      {
        key: 'access',
        header: t('admin.apiTokens.columns.access'),
        render: (token) => {
          const granted = grantedResources(token.permissions, catalog);
          const hidden = granted.slice(VISIBLE_RESOURCES);
          return (
            <div className="flex max-w-sm flex-wrap gap-1">
              {token.permissions.capabilities.map((capability) => {
                const Icon = CAPABILITY_ICONS[capability];
                return (
                  <Badge key={capability} variant="brand" size="sm" icon={<Icon className="h-3 w-3" />}>
                    {t(`admin.apiTokens.capabilities.${capability}.label`)}
                  </Badge>
                );
              })}
              {granted.slice(0, VISIBLE_RESOURCES).map(({ key, level }) => (
                <Badge key={key} variant={level === 'delete' ? 'red' : level === 'write' ? 'amber' : 'gray'} size="sm">
                  {resourceLabel(key)} · {levelLabel(level)}
                </Badge>
              ))}
              {hidden.length > 0 && (
                <span title={hidden.map(({ key, level }) => `${resourceLabel(key)} · ${levelLabel(level)}`).join('\n')}>
                  <Badge variant="gray" size="sm">
                    {t('admin.apiTokens.moreAccess', { count: hidden.length })}
                  </Badge>
                </span>
              )}
              {granted.length === 0 && token.permissions.capabilities.length === 0 && (
                <span className="text-xs text-gray-400">{t('admin.apiTokens.noAccess')}</span>
              )}
            </div>
          );
        },
      },
      {
        key: 'last_used_at',
        accessorKey: 'last_used_at',
        header: t('admin.apiTokens.columns.lastUsed'),
        headerClassName: 'whitespace-nowrap',
        sortable: true,
        render: (token) =>
          token.last_used_at ? (
            <span
              className="whitespace-nowrap text-sm text-gray-700 dark:text-gray-300"
              title={[formatDate(token.last_used_at, { dateStyle: 'medium', timeStyle: 'short' }), token.last_used_ip]
                .filter(Boolean)
                .join(' · ')}
            >
              {formatDistanceToNow(token.last_used_at)}
            </span>
          ) : (
            <span className="whitespace-nowrap text-sm text-gray-400 dark:text-gray-500">{t('admin.apiTokens.neverUsed')}</span>
          ),
      },
      {
        key: 'expires_at',
        accessorKey: 'expires_at',
        header: t('admin.apiTokens.columns.expires'),
        headerClassName: 'whitespace-nowrap',
        sortable: true,
        render: (token) => {
          const state = expiryState(token.expires_at);
          if (state.kind === 'never') {
            return (
              <Badge variant="amber" size="sm">
                {t('admin.apiTokens.expiry.never')}
              </Badge>
            );
          }
          if (state.kind === 'expired') {
            return (
              <Badge variant="red" size="sm" dot>
                {t('admin.apiTokens.expiry.expired')}
              </Badge>
            );
          }
          return (
            <div className="whitespace-nowrap">
              <span className="text-sm text-gray-700 dark:text-gray-300">{formatDate(token.expires_at)}</span>
              {state.kind === 'soon' && (
                <div className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
                  {t('admin.apiTokens.expiry.inDays', { count: state.days })}
                </div>
              )}
            </div>
          );
        },
      },
      {
        key: 'actions',
        header: <span className="sr-only">{t('admin.apiTokens.columns.actions')}</span>,
        align: 'right',
        render: (token) => (
          <div className="flex justify-end gap-1">
            <button
              type="button"
              onClick={() => setEditing(token)}
              className={`${iconButton} hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-white/5 dark:hover:text-gray-200`}
              title={t('admin.apiTokens.actions.edit')}
              aria-label={`${t('admin.apiTokens.actions.edit')}: ${token.name}`}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setRegenerating(token)}
              className={`${iconButton} hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-white/5 dark:hover:text-gray-200`}
              title={t('admin.apiTokens.actions.regenerate')}
              aria-label={`${t('admin.apiTokens.actions.regenerate')}: ${token.name}`}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => handleRevoke(token)}
              className={`${iconButton} hover:bg-red-50 hover:text-red-600 dark:text-gray-500 dark:hover:bg-red-500/10 dark:hover:text-red-400`}
              title={t('admin.apiTokens.actions.revoke')}
              aria-label={`${t('admin.apiTokens.actions.revoke')}: ${token.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, catalog]
  );

  const header = (
    <SettingsHeader
      title={t('admin.apiTokens.title')}
      description={t('admin.apiTokens.subtitle')}
      actions={
        <Button type="button" onClick={() => setEditing(null)} leftIcon={<Plus className="h-4 w-4" />}>
          {t('admin.apiTokens.newButton')}
        </Button>
      }
    />
  );

  let body;
  if (isLoading) {
    body = (
      <div className="surface divide-y divide-gray-100 overflow-hidden dark:divide-gray-800" aria-busy="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2 px-5 py-4">
            <SkeletonItem className="h-4 w-48" />
            <SkeletonItem className="h-3 w-72 max-w-full" />
          </div>
        ))}
      </div>
    );
  } else if (error) {
    body = <Alert type="error" message={t('admin.apiTokens.loadError')} />;
  } else if (!tokens || tokens.length === 0) {
    body = (
      <EmptyState
        bordered
        icon={KeyRound}
        title={t('admin.apiTokens.empty.title')}
        description={t('admin.apiTokens.empty.description')}
        action={
          <Button type="button" onClick={() => setEditing(null)} leftIcon={<Plus className="h-4 w-4" />}>
            {t('admin.apiTokens.newButton')}
          </Button>
        }
      />
    );
  } else {
    body = (
      <div className="space-y-3">
        <Table data={tokens} columns={columns} pageSize={25} />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('admin.apiTokens.usageHint')}{' '}
          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono dark:bg-white/[0.06]">Authorization: Bearer oty_pat_…</code>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}
      {body}
      <ApiTokenActivity />

      {editing !== undefined && (
        <ApiTokenFormModal
          key={editing?.id ?? 'new'}
          token={editing}
          open
          onClose={() => setEditing(undefined)}
          onCreated={showSecret}
          onSaved={() => {
            setEditing(undefined);
            toast.success(t('admin.apiTokens.form.saveSuccess'));
          }}
        />
      )}

      <ApiTokenRegenerateModal
        key={regenerating?.id ?? 'none'}
        token={regenerating}
        onClose={() => setRegenerating(null)}
        onRegenerated={showSecret}
      />

      <ApiTokenSecretModal result={revealed} onClose={() => setRevealed(null)} />
    </div>
  );
};

export default ApiTokensPage;
