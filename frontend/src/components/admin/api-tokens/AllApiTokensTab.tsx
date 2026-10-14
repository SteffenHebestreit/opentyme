/**
 * System administration: every user's API tokens — who has which token, what
 * it may do, when it was last used — with revoking (e.g. when someone left or
 * a token leaked). The owner is told by email.
 */
import { FC, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Trash2 } from 'lucide-react';
import { Alert } from '../../common/Alert';
import { Badge } from '../../common/Badge';
import { EmptyState } from '../../common/EmptyState';
import { SkeletonItem } from '../../common/Skeleton';
import { Table, Column } from '../../common/Table';
import { ApiTokenAccessBadges } from './ApiTokenAccessBadges';
import { apiErrorBody, expiryState } from './apiTokenHelpers';
import { useAdminRevokeApiToken, useAllApiTokens } from '../../../hooks/api/useApiTokens';
import type { AdminApiToken } from '../../../api/types';
import { formatDate, formatDistanceToNow } from '../../../utils/date';
import { confirmDialog } from '../../../lib/confirm';
import { toast } from '../../../lib/toast';

export const AllApiTokensTab: FC<{ active: boolean }> = ({ active }) => {
  const { t } = useTranslation('system');
  const { t: ts } = useTranslation('settings');
  const { data: tokens, isLoading, error } = useAllApiTokens(active);
  const revoke = useAdminRevokeApiToken();

  const handleRevoke = async (token: AdminApiToken) => {
    const owner = token.owner.username ?? token.owner.email ?? token.user_id;
    const confirmed = await confirmDialog({
      title: t('apiTokens.revoke.title'),
      message: t('apiTokens.revoke.message', { name: token.name, owner }),
      tone: 'danger',
      confirmLabel: t('apiTokens.revoke.confirm'),
    });
    if (!confirmed) return;
    try {
      await revoke.mutateAsync(token.id);
      toast.success(t('apiTokens.revoke.success'));
    } catch (err: unknown) {
      toast.error(t('apiTokens.revoke.error'), { description: apiErrorBody(err).message });
    }
  };

  const columns: Column<AdminApiToken>[] = useMemo(
    () => [
      {
        key: 'owner',
        header: t('apiTokens.columns.owner'),
        sortable: true,
        sortValue: (token) => token.owner.username ?? token.owner.email ?? '',
        render: (token) => (
          <div className="min-w-0">
            <div className="font-medium text-gray-900 dark:text-white">{token.owner.username ?? t('apiTokens.unknownUser')}</div>
            {token.owner.email && <div className="text-xs text-gray-500 dark:text-gray-400">{token.owner.email}</div>}
          </div>
        ),
      },
      {
        key: 'name',
        accessorKey: 'name',
        header: t('apiTokens.columns.token'),
        sortable: true,
        render: (token) => (
          <div className="min-w-0">
            <div className="text-sm text-gray-900 dark:text-white">{token.name}</div>
            <div className="mt-0.5 font-mono text-xs text-gray-400 dark:text-gray-500">{token.token_prefix}…</div>
          </div>
        ),
      },
      {
        key: 'access',
        header: t('apiTokens.columns.access'),
        render: (token) => <ApiTokenAccessBadges permissions={token.permissions} />,
      },
      {
        key: 'last_used_at',
        accessorKey: 'last_used_at',
        header: t('apiTokens.columns.lastUsed'),
        headerClassName: 'whitespace-nowrap',
        sortable: true,
        render: (token) => (
          <span
            className="whitespace-nowrap text-sm text-gray-600 dark:text-gray-300"
            title={token.last_used_ip ?? undefined}
          >
            {token.last_used_at ? formatDistanceToNow(token.last_used_at) : ts('admin.apiTokens.neverUsed')}
          </span>
        ),
      },
      {
        key: 'expires_at',
        accessorKey: 'expires_at',
        header: t('apiTokens.columns.expires'),
        headerClassName: 'whitespace-nowrap',
        sortable: true,
        render: (token) => {
          const state = expiryState(token.expires_at);
          if (state.kind === 'never') return <Badge variant="amber" size="sm">{ts('admin.apiTokens.expiry.never')}</Badge>;
          if (state.kind === 'expired') return <Badge variant="red" size="sm" dot>{ts('admin.apiTokens.expiry.expired')}</Badge>;
          return <span className="whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{formatDate(token.expires_at)}</span>;
        },
      },
      {
        key: 'actions',
        header: <span className="sr-only">{t('apiTokens.columns.actions')}</span>,
        align: 'right',
        render: (token) => (
          <button
            type="button"
            onClick={() => handleRevoke(token)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-gray-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
            title={t('apiTokens.revoke.confirm')}
            aria-label={`${t('apiTokens.revoke.confirm')}: ${token.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, ts]
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="section-title">{t('apiTokens.title')}</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('apiTokens.description')}</p>
      </div>
      {isLoading ? (
        <div className="surface space-y-3 p-5" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonItem key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : error ? (
        <Alert type="error" message={t('apiTokens.loadError')} />
      ) : (
        <Table
          data={tokens ?? []}
          columns={columns}
          pageSize={25}
          emptyMessage={<EmptyState compact icon={KeyRound} title={t('apiTokens.empty')} />}
        />
      )}
    </div>
  );
};
