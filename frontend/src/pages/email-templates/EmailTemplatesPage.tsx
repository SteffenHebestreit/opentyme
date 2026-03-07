/**
 * @fileoverview Email Templates list page.
 * Shows all user-created MJML email templates with CRUD actions.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mail } from 'lucide-react';
import { useEmailTemplates, useDeleteEmailTemplate } from '@/api/hooks/useEmailTemplates';
import type { EmailTemplate } from '@/api/services/email-template.service';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import type { BadgeVariant } from '@/components/common/Badge';
import { Alert } from '@/components/common/Alert';
import { EmptyState } from '@/components/common/EmptyState';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

const CATEGORY_BADGE_VARIANTS: Record<string, BadgeVariant> = {
  invoice: 'blue',
  reminder: 'yellow',
  welcome: 'green',
  custom: 'gray',
};

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <Alert type="error" message={t('loadError')} />;
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{t('title')}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('subtitle')}</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => navigate('/email-templates/new')}>
          + {t('newTemplate')}
        </Button>
      </div>

      {/* Table / Empty */}
      {!templates || templates.length === 0 ? (
        <EmptyState
          title={t('noTemplates')}
          icon={Mail}
          action={
            <Button variant="primary" size="sm" onClick={() => navigate('/email-templates/new')}>
              {t('createFirst')}
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                {[t('col.name'), t('col.subject'), t('col.category'), t('col.language'), t('col.default'), t('col.updated'), t('col.actions')].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {templates.map((tpl: EmailTemplate) => (
                <tr key={tpl.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                    {tpl.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                    {tpl.subject}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={CATEGORY_BADGE_VARIANTS[tpl.category] ?? 'gray'} size="sm">
                      {tpl.category}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {tpl.language.toUpperCase()}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {tpl.is_default ? (
                      <Badge variant="green" size="sm" dot>Default</Badge>
                    ) : (
                      <span className="text-gray-300 dark:text-gray-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(tpl.updated_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate(`/email-templates/${tpl.id}`)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400"
                      >
                        {t('action.edit')}
                      </button>
                      {deleteConfirmId === tpl.id ? (
                        <span className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(tpl.id)}
                            className="text-xs text-red-600 hover:text-red-800 dark:text-red-400"
                          >
                            {t('action.confirmDelete')}
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="text-xs text-gray-500 hover:text-gray-700"
                          >
                            {t('action.cancel')}
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(tpl.id)}
                          className="text-xs text-red-500 hover:text-red-700 dark:text-red-400"
                        >
                          {t('action.delete')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
