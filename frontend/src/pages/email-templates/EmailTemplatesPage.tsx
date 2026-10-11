/**
 * @fileoverview Email Templates list page.
 * Shows all user-created MJML email templates with CRUD actions.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mail, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEmailTemplates, useDeleteEmailTemplate } from '@/api/hooks/useEmailTemplates';
import type { EmailTemplate } from '@/api/services/email-template.service';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import type { BadgeVariant } from '@/components/common/Badge';
import { Alert } from '@/components/common/Alert';
import { EmptyState } from '@/components/common/EmptyState';
import { SkeletonItem } from '@/components/common/Skeleton';
import { cn } from '@/lib/cn';

const CATEGORY_BADGE_VARIANTS: Record<string, BadgeVariant> = {
  invoice: 'blue',
  reminder: 'yellow',
  welcome: 'green',
  custom: 'gray',
};

/** Small icon-only row action. */
const iconButtonClass =
  'flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 dark:text-gray-500';

const tableWrapperClass =
  'overflow-hidden rounded-xl border border-gray-200 bg-white shadow-soft dark:border-gray-800 dark:bg-gray-900 dark:shadow-none';

export default function EmailTemplatesPage() {
  const { t } = useTranslation('email-templates');
  const navigate = useNavigate();
  const { data: templates, isLoading, error } = useEmailTemplates();
  const deleteTemplate = useDeleteEmailTemplate();
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    await deleteTemplate.mutateAsync(id);
    setDeleteConfirmId(null);
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(undefined, { dateStyle: 'medium' });

  const header = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h2 className="section-title">{t('title')}</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('subtitle')}</p>
      </div>
      <Button
        type="button"
        variant="primary"
        size="sm"
        className="shrink-0 self-start"
        leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
        onClick={() => navigate('/email-templates/new')}
      >
        {t('newTemplate')}
      </Button>
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-5" aria-busy="true">
        <div className="space-y-2">
          <SkeletonItem className="h-5 w-40" />
          <SkeletonItem className="h-4 w-72 max-w-full" />
        </div>
        <div className={tableWrapperClass}>
          <div className="border-b border-gray-100 bg-gray-50/80 px-4 py-3 dark:border-gray-800 dark:bg-white/[0.02]">
            <SkeletonItem className="h-3 w-1/3" />
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800/70">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center gap-4 px-4 py-3.5">
                <SkeletonItem className="h-4 w-40" />
                <SkeletonItem className="hidden h-4 flex-1 sm:block" />
                <SkeletonItem className="h-5 w-16 rounded-full" />
                <SkeletonItem className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return <Alert type="error" message={t('loadError')} />;
  }

  return (
    <div className="space-y-5">
      {header}

      {/* Table / Empty */}
      {!templates || templates.length === 0 ? (
        <EmptyState
          title={t('noTemplates')}
          icon={Mail}
          bordered
          compact
          action={
            <Button
              type="button"
              variant="primary"
              size="sm"
              leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
              onClick={() => navigate('/email-templates/new')}
            >
              {t('createFirst')}
            </Button>
          }
        />
      ) : (
        <div className={tableWrapperClass}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
              <thead className="bg-gray-50/80 text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-white/[0.02] dark:text-gray-400">
                <tr>
                  {[t('col.name'), t('col.subject'), t('col.category'), t('col.language'), t('col.updated')].map((h) => (
                    <th key={h} scope="col" className="whitespace-nowrap px-4 py-3 text-left font-medium">
                      {h}
                    </th>
                  ))}
                  <th scope="col" className="whitespace-nowrap px-4 py-3 text-right font-medium">
                    <span className="sr-only">{t('col.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800/70">
                {templates.map((tpl: EmailTemplate) => (
                  <tr key={tpl.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="whitespace-nowrap font-medium text-gray-900 dark:text-white">{tpl.name}</span>
                        {tpl.is_default && (
                          <Badge variant="green" size="sm" dot>Default</Badge>
                        )}
                      </div>
                    </td>
                    <td className="max-w-[16rem] truncate px-4 py-3 text-sm text-gray-500 dark:text-gray-400" title={tpl.subject}>
                      {tpl.subject}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={CATEGORY_BADGE_VARIANTS[tpl.category] ?? 'gray'} size="sm">
                        {tpl.category}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">
                      {tpl.language.toUpperCase()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums text-gray-500 dark:text-gray-400">
                      {formatDate(tpl.updated_at)}
                    </td>
                    <td className="relative whitespace-nowrap px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {deleteConfirmId === tpl.id ? (
                          // Floats over the row end so the confirmation doesn't widen the table
                          <span className="absolute inset-y-0 right-2 z-10 my-auto flex h-fit origin-right animate-scale-in items-center gap-1 rounded-lg bg-white p-1 shadow-lifted ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
                            <Button
                              type="button"
                              variant="danger"
                              size="sm"
                              onClick={() => handleDelete(tpl.id)}
                            >
                              {t('action.confirmDelete')}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteConfirmId(null)}
                            >
                              {t('action.cancel')}
                            </Button>
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              title={t('action.edit')}
                              className={cn(iconButtonClass, 'hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-white/5 dark:hover:text-white')}
                              onClick={() => navigate(`/email-templates/${tpl.id}`)}
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                              <span className="sr-only">{t('action.edit')}</span>
                            </button>
                            <button
                              type="button"
                              title={t('action.delete')}
                              className={cn(iconButtonClass, 'hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400')}
                              onClick={() => setDeleteConfirmId(tpl.id)}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                              <span className="sr-only">{t('action.delete')}</span>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
